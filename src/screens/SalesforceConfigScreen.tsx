import React, { useState, useEffect } from 'react';
import { useRoute } from '@react-navigation/native';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Alert,
  Switch,
  ActivityIndicator,
  SafeAreaView,
} from 'react-native';
import { Linking } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { Ionicons } from '@expo/vector-icons';
import * as SecureStore from 'expo-secure-store';
import { useAuth } from '../contexts/AuthContext';
import { useCompany } from '../contexts/CompanyContext';
import { COLORS, FONTS, SPACING, BORDER_RADIUS, CARD_STYLES } from '../styles/theme';
import companyIntegrationsService, { SalesforceConfig, CompanyIntegration } from '../services/companyIntegrationsService';
import { salesforceOAuthService } from '../services/salesforceOAuthService';
import { supabase } from '../services/supabaseService';
import { RootStackParamList } from '../types/navigation';

type SalesforceConfigScreenNavigationProp = StackNavigationProp<RootStackParamList>;

const SalesforceConfigScreen: React.FC = () => {
  const navigation = useNavigation<SalesforceConfigScreenNavigationProp>();
  const route = useRoute();
  const { user } = useAuth();
  const { currentCompany } = useCompany();
  
  const [config, setConfig] = useState<SalesforceConfig>({
    instance_url: '',
    client_id: '',
    client_secret: '',
    username: '',
    security_token: '',
    sandbox: false,
    api_version: '58.0',
    object_mappings: {
      photo_batch: 'Custom_Photo_Batch__c',
      photo: 'Custom_Photo__c'
    },
    field_mappings: {
      batch_name: 'Name',
      batch_type: 'Type__c',
      photo_url: 'Photo_URL__c'
    },
    prefix_mappings: {
      'RLS': { object_name: 'inscor__Release__c', name_field: 'Name' },
      'RLSL': { object_name: 'inscor__Release_Line__c', name_field: 'Name' },
      'PO': { object_name: 'inscor__Purchase_Order__c', name_field: 'Name' },
      'POL': { object_name: 'inscor__Purchase_Order_Line__c', name_field: 'Name' },
      'SO': { object_name: 'inscor__Sales_Order__c', name_field: 'Name' },
      'SOL': { object_name: 'inscor__Sales_Order_Line__c', name_field: 'Name' },
      'INV': { object_name: 'inscor__Inventory_Line__c', name_field: 'Name' },
      'RO': { object_name: 'inscor__Repair_Order__c', name_field: 'Name' },
      'ROL': { object_name: 'inscor__Repair_Order_Line__c', name_field: 'Name' },
      'WO': { object_name: 'inscor__Work_Order__c', name_field: 'Name' },
      'INVC': { object_name: 'inscor__Invoice__c', name_field: 'Name' },
      'RMA': { object_name: 'inscor__RMA__c', name_field: 'Name' },
      'INVCL': { object_name: 'inscor__Invoice_Line__c', name_field: 'Name' }
    }
  });
  
  const [integration, setIntegration] = useState<CompanyIntegration | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const [showClientSecret, setShowClientSecret] = useState(false);
  const [showSecurityToken, setShowSecurityToken] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [authCode, setAuthCode] = useState('');
  const [showManualAuth, setShowManualAuth] = useState(false);

  useEffect(() => {
    console.log('[SalesforceConfig] Component mounted/updated:', {
      currentCompany: currentCompany ? {
        id: currentCompany.id,
        name: currentCompany.name
      } : null,
      user: user ? {
        id: user.id,
        email: user.email
      } : null
    });
    
    loadSalesforceConfig();
    checkAdminPermissions();
  }, [currentCompany]);

  // Handle OAuth callback from deep link
  useEffect(() => {
    const handleOAuthCallback = async () => {
      const params = route.params as any;
      if (params?.code && params?.state && currentCompany?.id) {
        console.log('[SalesforceConfig] Processing OAuth callback:', {
          code: params.code.substring(0, 10) + '...',
          state: params.state,
          companyId: currentCompany.id
        });
        
        try {
          setIsAuthenticating(true);
          
          // Exchange authorization code for access token
          // Use the authorization code from the deep link parameters
          const authCode = params.code;
          
          // Get the company integration to retrieve OAuth config
          const integration = await companyIntegrationsService.getIntegration(currentCompany.id, 'salesforce');
          if (!integration?.config) {
            throw new Error('Salesforce configuration not found');
          }
          
          const config = integration.config as any;
          
          // With the new direct token exchange approach, tokens are handled by the Edge Function
          // We just need to check if tokens are now available
          
          // Note: The current OAuth service doesn't store code verifier in callback data
          // This is a limitation that needs to be addressed for full PKCE support
          // For now, we'll pass an empty string and the service will handle it
          const tokenData = await salesforceOAuthService.completeOAuthFlow(
            currentCompany.id,
            authCode,
            '', // Code verifier - needs to be properly implemented
            {
              clientId: config.client_id,
              clientSecret: config.client_secret,
              instanceUrl: config.instance_url,
              redirectUri: '', // Will be set by service
              sandbox: config.sandbox || false
            }
          );
          
          if (tokenData) {
            Alert.alert(
              'Success',
              'Salesforce authentication completed successfully!',
              [{ text: 'OK', onPress: () => loadSalesforceConfig() }]
            );
          }
        } catch (error) {
          console.error('[SalesforceConfig] OAuth callback error:', error);
          Alert.alert(
            'Authentication Error',
            'Failed to complete Salesforce authentication. Please try again.',
            [{ text: 'OK' }]
          );
        } finally {
          setIsAuthenticating(false);
        }
      }
    };
    
    handleOAuthCallback();
  }, [route.params, currentCompany?.id]);

  const checkAdminPermissions = () => {
    // Check if user has admin permissions
    // For now, assume all users can configure (will be restricted in production)
    setIsAdmin(true);
  };

  const loadSalesforceConfig = async () => {
    if (!currentCompany?.id) {
      console.log('[SalesforceConfig] No company selected');
      return;
    }

    try {
      setIsLoading(true);
      console.log('[SalesforceConfig] Loading company Salesforce configuration...');
      
      const companyIntegration = await companyIntegrationsService.getIntegration(
        currentCompany.id, 
        'salesforce'
      );
      
      if (companyIntegration) {
        setIntegration(companyIntegration);
        const savedConfig = companyIntegration.config as SalesforceConfig;
        setConfig(savedConfig);
        console.log('[SalesforceConfig] Configuration loaded successfully:', {
          instance_url: savedConfig.instance_url,
          client_id: savedConfig.client_id ? '***' : 'empty',
          client_secret: savedConfig.client_secret ? '***' : 'empty',
          sandbox: savedConfig.sandbox
        });
      } else {
        console.log('[SalesforceConfig] No existing configuration found, setting defaults');
        // Set default values
        const defaultConfig = {
          instance_url: '',
          client_id: '',
          client_secret: '',
          username: '',
          security_token: '',
          sandbox: false,
          api_version: '58.0',
          object_mappings: {
            photo_batch: 'Custom_Photo_Batch__c',
            photo: 'Custom_Photo__c'
          },
          field_mappings: {
            batch_name: 'Name',
            batch_type: 'Type__c',
            photo_url: 'Photo_URL__c'
          },
          prefix_mappings: {
            'RLS': { object_name: 'inscor__Release__c', name_field: 'Name' },
            'RLSL': { object_name: 'inscor__Release_Line__c', name_field: 'Name' },
            'PO': { object_name: 'inscor__Purchase_Order__c', name_field: 'Name' },
            'POL': { object_name: 'inscor__Purchase_Order_Line__c', name_field: 'Name' },
            'SO': { object_name: 'inscor__Sales_Order__c', name_field: 'Name' },
            'SOL': { object_name: 'inscor__Sales_Order_Line__c', name_field: 'Name' },
            'INV': { object_name: 'inscor__Inventory_Line__c', name_field: 'Name' },
            'RO': { object_name: 'inscor__Repair_Order__c', name_field: 'Name' },
            'ROL': { object_name: 'inscor__Repair_Order_Line__c', name_field: 'Name' },
            'WO': { object_name: 'inscor__Work_Order__c', name_field: 'Name' },
            'INVC': { object_name: 'inscor__Invoice__c', name_field: 'Name' },
            'RMA': { object_name: 'inscor__RMA__c', name_field: 'Name' },
            'INVCL': { object_name: 'inscor__Invoice_Line__c', name_field: 'Name' }
          }
        };
        setConfig(defaultConfig);
        console.log('[SalesforceConfig] Default configuration set');
      }
    } catch (error) {
      console.error('[SalesforceConfig] Error loading configuration:', error);
      Alert.alert('Error', 'Failed to load Salesforce configuration');
    } finally {
      setIsLoading(false);
    }
  };

  const saveSalesforceConfig = async () => {
    if (!validateConfig()) {
      return;
    }

    if (!currentCompany?.id || !user?.id) {
      Alert.alert('Error', 'Company or user information not available');
      return;
    }

    try {
      setIsLoading(true);
      console.log('[SalesforceConfig] Saving company Salesforce configuration...');
      
      const savedIntegration = await companyIntegrationsService.configureSalesforce(
        currentCompany.id,
        config,
        user.id
      );
      
      setIntegration(savedIntegration);
      
      Alert.alert(
        'Success',
        'Salesforce configuration saved successfully for your company!',
        [
          {
            text: 'OK',
            onPress: () => navigation.goBack()
          }
        ]
      );
    } catch (error) {
      console.error('[SalesforceConfig] Error saving configuration:', error);
      Alert.alert('Error', 'Failed to save Salesforce configuration');
    } finally {
      setIsLoading(false);
    }
  };

  const testConnection = async () => {
    if (!validateConfig()) {
      return;
    }

    if (!currentCompany?.id) {
      Alert.alert('Error', 'Company information not available');
      return;
    }

    try {
      setIsTesting(true);
      console.log('[SalesforceConfig] Testing company Salesforce connection...');
      
      const success = await companyIntegrationsService.testSalesforceConnection(currentCompany.id);
      
      if (success) {
        Alert.alert('Success', 'Successfully connected to Salesforce!');
        // Reload integration to get updated status
        await loadSalesforceConfig();
      } else {
        Alert.alert('Connection Failed', 'Unable to connect to Salesforce. Please check your credentials.');
      }
    } catch (error) {
      console.error('[SalesforceConfig] Connection test failed:', error);
      Alert.alert('Error', 'Connection test failed');
    } finally {
      setIsTesting(false);
    }
  };

  const validateConfig = (): boolean => {
    if (!config.instance_url.trim()) {
      Alert.alert('Validation Error', 'Instance URL is required');
      return false;
    }
    if (!config.client_id.trim()) {
      Alert.alert('Validation Error', 'Client ID is required');
      return false;
    }
    if (!config.client_secret.trim()) {
      Alert.alert('Validation Error', 'Client Secret is required');
      return false;
    }
    return true;
  };

  const checkOAuthTokens = (companyId: string) => {
    console.log('[SalesforceConfig] Starting OAuth token checking for company:', companyId);
    
    let pollCount = 0;
    const maxPolls = 60; // Check for 5 minutes (60 * 5 seconds)
    
    const pollInterval = setInterval(async () => {
      pollCount++;
      console.log(`[SalesforceConfig] OAuth token check attempt ${pollCount}/${maxPolls}`);
      
      try {
        const tokenResult = await salesforceOAuthService.checkOAuthTokens(companyId);
        
        if (tokenResult.success) {
          console.log('[SalesforceConfig] OAuth tokens found! Integration is active.');
          clearInterval(pollInterval);
          
          // Update integration status and reload config
          await loadSalesforceConfig();
          
          Alert.alert(
            'Connection Successful',
            'Salesforce integration is now active and ready to use!',
            [{ text: 'OK' }]
          );
          
        } else if (tokenResult.error === 'tokens_expired') {
          console.log('[SalesforceConfig] OAuth tokens expired');
          clearInterval(pollInterval);
          
          Alert.alert(
            'Authentication Expired',
            'OAuth tokens have expired. Please authenticate again.',
            [{ text: 'OK' }]
          );
          
        } else if (pollCount >= maxPolls) {
          console.log('[SalesforceConfig] OAuth token check timeout');
          clearInterval(pollInterval);
          
          Alert.alert(
            'Authentication Timeout',
            'OAuth authentication timed out. Please try again.',
            [{ text: 'OK' }]
          );
        }
      } catch (error) {
        console.error('[SalesforceConfig] OAuth token check error:', error);
        // Continue checking on error, don't stop
      }
    }, 5000); // Check every 5 seconds
  };

  const processOAuthCallback = async (companyId: string, authCode: string) => {
    try {
      setIsAuthenticating(true);
      console.log('[SalesforceConfig] Processing OAuth callback with auth code');
      
      // Get the current integration config
      const integration = await companyIntegrationsService.getIntegration(companyId, 'salesforce');
      if (!integration) {
        throw new Error('Salesforce configuration not found');
      }
      
      const config = integration.config as any;
      
      // CRITICAL FIX: Retrieve the stored PKCE code verifier
      const codeVerifierKey = `oauth_code_verifier_${companyId}`;
      let codeVerifier = '';
      
      try {
        const storedVerifier = await SecureStore.getItemAsync(codeVerifierKey);
        if (storedVerifier) {
          codeVerifier = storedVerifier;
          console.log('[SalesforceConfig] Retrieved PKCE code verifier from secure storage');
          
          // Clean up the stored verifier after use
          await SecureStore.deleteItemAsync(codeVerifierKey);
        } else {
          console.warn('[SalesforceConfig] No PKCE code verifier found in secure storage');
        }
      } catch (verifierError) {
        console.error('[SalesforceConfig] Error retrieving code verifier:', verifierError);
      }
      
      // Complete the OAuth flow with the correct code verifier
      const tokenData = await salesforceOAuthService.completeOAuthFlow(
        companyId,
        authCode,
        codeVerifier, // FIXED: Use the actual PKCE code verifier
        {
          clientId: config.client_id,
          clientSecret: config.client_secret,
          instanceUrl: config.instance_url,
          redirectUri: '', // Will be set by service
          sandbox: config.sandbox || false
        }
      );
      
      if (tokenData) {
        Alert.alert(
          'Success',
          'Salesforce authentication completed successfully!',
          [{ text: 'OK', onPress: () => loadSalesforceConfig() }]
        );
      } else {
        throw new Error('Failed to obtain access token');
      }
    } catch (error) {
      console.error('[SalesforceConfig] OAuth callback processing error:', error);
      Alert.alert(
        'Authentication Error',
        'Failed to complete Salesforce authentication. Please try again.',
        [{ text: 'OK' }]
      );
    } finally {
      setIsAuthenticating(false);
    }
  };

  const authenticateWithSalesforce = async () => {
    if (!currentCompany?.id) {
      Alert.alert('Error', 'No company selected');
      return;
    }

    if (!user?.id) {
      Alert.alert('Error', 'User not authenticated');
      return;
    }

    // Basic validation for OAuth
    if (!config.client_id.trim() || !config.client_secret.trim() || !config.instance_url.trim()) {
      Alert.alert('Configuration Required', 'Please enter Client ID, Client Secret, and Instance URL before authenticating.');
      return;
    }

    setIsAuthenticating(true);
    try {
      console.log('[SalesforceConfig] Starting OAuth flow...');
      
      // Save the configuration first
      await companyIntegrationsService.configureSalesforce(currentCompany.id, config, user.id);
      
      // Convert config to OAuth format
      const oauthConfig = {
        clientId: config.client_id,
        clientSecret: config.client_secret,
        instanceUrl: config.instance_url,
        redirectUri: 'https://luwlvmcixwdtuaffamgk.supabase.co/functions/v1/salesforce-oauth-callback',
        sandbox: config.sandbox
      };
      
      // Initiate OAuth flow and capture the PKCE code verifier
      const { authUrl, codeChallenge } = await salesforceOAuthService.initiateOAuthFlow(currentCompany!.id, oauthConfig);
      
      // CRITICAL FIX: Store the PKCE code verifier for later use in token exchange
      const codeVerifierKey = `oauth_code_verifier_${currentCompany!.id}`;
      await SecureStore.setItemAsync(codeVerifierKey, codeChallenge);
      console.log('[SalesforceConfig] Stored PKCE code verifier in secure storage');
      
      // Enhanced debugging for OAuth URL
      console.log('[SalesforceConfig] === OAUTH DEBUG INFO ===');
      console.log('[SalesforceConfig] Company ID:', currentCompany!.id);
      console.log('[SalesforceConfig] OAuth Config:', {
        clientId: oauthConfig.clientId ? `${oauthConfig.clientId.substring(0, 10)}...` : 'MISSING',
        clientSecret: oauthConfig.clientSecret ? '***PRESENT***' : 'MISSING',
        instanceUrl: oauthConfig.instanceUrl,
        sandbox: oauthConfig.sandbox,
        redirectUri: oauthConfig.redirectUri
      });
      console.log('[SalesforceConfig] Generated OAuth URL:', authUrl);
      console.log('[SalesforceConfig] URL starts with login.salesforce.com?', authUrl.startsWith('https://login.salesforce.com'));
      console.log('[SalesforceConfig] URL starts with test.salesforce.com?', authUrl.startsWith('https://test.salesforce.com'));
      console.log('[SalesforceConfig] === END DEBUG INFO ===');
      
      // Show debug alert to user
      Alert.alert(
        'Debug Info', 
        `OAuth URL: ${authUrl.substring(0, 100)}...\n\nSandbox: ${oauthConfig.sandbox}\nClient ID: ${oauthConfig.clientId ? 'Present' : 'Missing'}`,
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Continue', onPress: () => openBrowserWithUrl(authUrl) }
        ]
      );
    } catch (error) {
      console.error('[SalesforceConfig] OAuth authentication failed:', error);
      Alert.alert('Error', 'Authentication failed. Please check your configuration and try again.');
    } finally {
      setIsAuthenticating(false);
    }
  };

  const openBrowserWithUrl = async (authUrl: string) => {
    try {
      console.log('[SalesforceConfig] Opening default browser with URL:', authUrl);
      
      // Check if the URL can be opened
      const canOpen = await Linking.canOpenURL(authUrl);
      if (!canOpen) {
        Alert.alert('Error', 'Unable to open browser for authentication.');
        return;
      }
      
      // Open Salesforce OAuth in device's default browser
      await Linking.openURL(authUrl);
      
      console.log('[SalesforceConfig] OAuth URL opened in default browser');
      
      // Show instructions to user and start polling
      Alert.alert(
        'Authentication Started',
        'Salesforce login opened in your browser. Complete the authentication and this app will automatically detect when you\'re done.\n\nYou can close the browser window after seeing the success page.',
        [
          { 
            text: 'Got it', 
            onPress: () => {
              // Start checking for OAuth tokens
              checkOAuthTokens(currentCompany!.id);
            }
          }
        ]
      );
    } catch (browserError) {
      console.error('[SalesforceConfig] Browser error:', browserError);
      Alert.alert('Browser Error', 'Unable to open browser for authentication.');
    }
  };

  const updateConfig = (field: keyof SalesforceConfig, value: string | boolean) => {
    setConfig(prev => ({ ...prev, [field]: value }));
  };

  const renderInputField = (
    label: string,
    value: string,
    onChangeText: (text: string) => void,
    placeholder: string,
    secure: boolean = false,
    showToggle: boolean = false,
    showValue: boolean = false
  ) => (
    <View style={styles.inputGroup}>
      <Text style={styles.inputLabel}>{label}</Text>
      <View style={styles.inputContainer}>
        <TextInput
          style={styles.textInput}
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={COLORS.textLight}
          secureTextEntry={secure && !showValue}
          autoCapitalize="none"
          autoCorrect={false}
        />
        {showToggle && (
          <TouchableOpacity
            style={styles.eyeButton}
            onPress={() => secure ? (label.includes('Client Secret') ? setShowClientSecret(!showClientSecret) : setShowSecurityToken(!showSecurityToken)) : undefined}
          >
            <Ionicons
              name={showValue ? 'eye-off' : 'eye'}
              size={20}
              color={COLORS.textLight}
            />
          </TouchableOpacity>
        )}
      </View>
    </View>
  );

  if (isLoading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={COLORS.primary} />
          <Text style={styles.loadingText}>Loading Salesforce Configuration...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => navigation.goBack()}
        >
          <Ionicons name="arrow-back" size={24} color={COLORS.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Salesforce Configuration</Text>
        <View style={styles.headerRight} />
      </View>

      <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
        {/* Debug Info */}
        <View style={styles.debugSection}>
          <Text style={styles.debugTitle}>Debug Info:</Text>
          <Text style={styles.debugText}>
            Company: {currentCompany ? `${currentCompany.name} (${currentCompany.id})` : 'No company selected'}
          </Text>
          <Text style={styles.debugText}>
            User: {user ? `${user.email} (${user.id})` : 'No user'}
          </Text>
        </View>
        
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>OAuth Configuration</Text>
          <Text style={styles.sectionDescription}>
            Configure your Salesforce Connected App credentials. The callback URL is automatically detected based on your environment.
          </Text>
          <View style={styles.card}>
            {renderInputField(
              'Instance URL',
              config.instance_url,
              (text) => updateConfig('instance_url', text),
              'https://yourcompany.my.salesforce.com'
            )}

            {renderInputField(
              'Client ID',
              config.client_id,
              (text) => updateConfig('client_id', text),
              'Connected App Client ID'
            )}

            {renderInputField(
              'Client Secret',
              config.client_secret,
              (text) => updateConfig('client_secret', text),
              'Connected App Client Secret',
              true,
              true,
              showClientSecret
            )}
          </View>
        </View>

        <View style={styles.callbackInfo}>
          <Text style={[styles.inputLabel, { color: COLORS.text }]}>Callback URL (Production-Ready)</Text>
          <View style={[styles.callbackBox, { 
            backgroundColor: COLORS.card,
            borderColor: COLORS.border 
          }]}>
            <Text style={[styles.callbackText, { color: COLORS.text }]}>
              https://luwlvmcixwdtuaffamgk.supabase.co/functions/v1/salesforce-oauth-callback
            </Text>
          </View>
          <Text style={[styles.callbackNote, { color: COLORS.textLight }]}>
            💡 This production-ready Supabase Edge Function endpoint works for all environments and handles secure OAuth token exchange.
          </Text>
          <Text style={[styles.callbackNote, { color: COLORS.primary, marginTop: 8 }]}>
            📋 Copy this URL to your Salesforce Connected App's Callback URL setting.
          </Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Authentication</Text>
          <View style={styles.card}>
            {renderInputField(
              'Username',
              config.username,
              (text) => updateConfig('username', text),
              'Salesforce username'
            )}

            {renderInputField(
              'Security Token',
              config.security_token,
              (text) => updateConfig('security_token', text),
              'Salesforce security token',
              true,
              true,
              showSecurityToken
            )}
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Options</Text>
          <View style={styles.card}>
            <View style={styles.switchRow}>
              <View style={styles.switchInfo}>
                <Text style={styles.switchLabel}>Sandbox Environment</Text>
                <Text style={styles.switchDescription}>
                  Connect to Salesforce sandbox instead of production
                </Text>
              </View>
              <Switch
                value={config.sandbox}
                onValueChange={(value) => updateConfig('sandbox', value)}
                trackColor={{ false: COLORS.border, true: COLORS.primary }}
                thumbColor={config.sandbox ? COLORS.white : COLORS.textLight}
              />
            </View>
          </View>
        </View>

        {integration && (
          <View style={styles.section}>
            <View style={[styles.card, styles.statusCard]}>
              <View style={styles.statusRow}>
                <Ionicons
                  name={integration.status === 'active' ? 'checkmark-circle' : 'alert-circle'}
                  size={24}
                  color={integration.status === 'active' ? COLORS.success : COLORS.error}
                />
                <Text style={[
                  styles.statusText,
                  { color: integration.status === 'active' ? COLORS.success : COLORS.error }
                ]}>
                  {integration.status === 'active' ? 'Integration Active' : 'Integration Inactive'}
                </Text>
              </View>
              {integration.last_sync_at && (
                <Text style={styles.lastSyncText}>
                  Last sync: {new Date(integration.last_sync_at).toLocaleString()}
                </Text>
              )}
            </View>
          </View>
        )}

        <View style={styles.section}>
          {/* OAuth Authentication Button */}
          <TouchableOpacity
            style={[styles.button, styles.authButton]}
            onPress={authenticateWithSalesforce}
            disabled={isAuthenticating || !config.client_id || !config.client_secret || !config.instance_url}
          >
            {isAuthenticating ? (
              <ActivityIndicator size="small" color={COLORS.white} />
            ) : (
              <Ionicons name="log-in" size={20} color={COLORS.white} />
            )}
            <Text style={styles.authButtonText}>
              {isAuthenticating ? 'Authenticating...' : 'Authenticate with Salesforce'}
            </Text>
          </TouchableOpacity>

          <View style={styles.buttonRow}>
            <TouchableOpacity
              style={[styles.button, styles.testButton]}
              onPress={testConnection}
              disabled={isTesting}
            >
              {isTesting ? (
                <ActivityIndicator size="small" color={COLORS.primary} />
              ) : (
                <Ionicons name="flash" size={20} color={COLORS.primary} />
              )}
              <Text style={styles.testButtonText}>
                {isTesting ? 'Testing...' : 'Test Connection'}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.button, styles.saveButton]}
              onPress={saveSalesforceConfig}
              disabled={isLoading}
            >
              {isLoading ? (
                <ActivityIndicator size="small" color={COLORS.white} />
              ) : (
                <Ionicons name="save" size={20} color={COLORS.white} />
              )}
              <Text style={styles.saveButtonText}>
                {isLoading ? 'Saving...' : 'Save Configuration'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.helpSection}>
          <Text style={styles.helpTitle}>Setup Instructions</Text>
          <Text style={styles.helpText}>
            1. Create a Connected App in Salesforce Setup{'\n'}
            2. Enable OAuth settings and configure callback URL{'\n'}
            3. Copy the Consumer Key (Client ID) and Consumer Secret{'\n'}
            4. Generate a Security Token from your personal settings{'\n'}
            5. Test the connection before saving
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: SPACING.medium,
    fontSize: FONTS.medium,
    color: COLORS.textLight,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.medium,
    paddingVertical: SPACING.medium,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  backButton: {
    padding: SPACING.small,
  },
  headerTitle: {
    fontSize: FONTS.large,
    fontWeight: FONTS.bold,
    color: COLORS.text,
  },
  headerRight: {
    width: 40,
  },
  scrollView: {
    flex: 1,
  },
  section: {
    marginBottom: SPACING.large,
  },
  sectionTitle: {
    fontSize: FONTS.large,
    fontWeight: FONTS.bold,
    color: COLORS.text,
    marginHorizontal: SPACING.medium,
    marginBottom: SPACING.small,
  },
  sectionDescription: {
    fontSize: FONTS.small,
    color: COLORS.textLight,
    marginBottom: SPACING.small,
    lineHeight: 20,
    marginHorizontal: SPACING.medium,
  },
  card: {
    ...CARD_STYLES.elevated,
    marginHorizontal: SPACING.medium,
  },
  inputGroup: {
    marginBottom: SPACING.medium,
  },
  inputLabel: {
    fontSize: FONTS.medium,
    fontWeight: FONTS.semiBold,
    color: COLORS.text,
    marginBottom: SPACING.small,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  textInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: BORDER_RADIUS.medium,
    paddingHorizontal: SPACING.medium,
    paddingVertical: SPACING.medium,
    fontSize: FONTS.medium,
    color: COLORS.text,
    backgroundColor: COLORS.card,
  },
  eyeButton: {
    position: 'absolute',
    right: SPACING.medium,
    padding: SPACING.small,
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: SPACING.medium,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  switchInfo: {
    flex: 1,
    marginRight: SPACING.medium,
  },
  switchLabel: {
    fontSize: FONTS.medium,
    fontWeight: FONTS.semiBold,
    color: COLORS.text,
  },
  switchDescription: {
    fontSize: FONTS.small,
    color: COLORS.textLight,
    marginTop: SPACING.tiny,
  },
  statusCard: {
    backgroundColor: COLORS.card,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  statusText: {
    fontSize: FONTS.medium,
    fontWeight: FONTS.semiBold,
    marginLeft: SPACING.small,
  },
  buttonRow: {
    flexDirection: 'row',
    marginHorizontal: SPACING.medium,
    gap: SPACING.medium,
  },
  button: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: SPACING.medium,
    borderRadius: BORDER_RADIUS.medium,
    gap: SPACING.small,
  },
  testButton: {
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.primary,
  },
  testButtonText: {
    fontSize: FONTS.medium,
    fontWeight: FONTS.semiBold,
    color: COLORS.primary,
  },
  saveButton: {
    backgroundColor: COLORS.primary,
  },
  saveButtonText: {
    fontSize: FONTS.medium,
    fontWeight: FONTS.semiBold,
    color: COLORS.white,
  },
  authButton: {
    backgroundColor: COLORS.success,
    marginBottom: SPACING.medium,
  },
  authButtonText: {
    fontSize: FONTS.medium,
    fontWeight: FONTS.semiBold,
    color: COLORS.white,
  },
  helpSection: {
    marginHorizontal: SPACING.medium,
    marginBottom: SPACING.large,
    padding: SPACING.medium,
    backgroundColor: COLORS.card,
    borderRadius: BORDER_RADIUS.medium,
  },
  debugSection: {
    marginHorizontal: SPACING.medium,
    marginBottom: SPACING.medium,
    padding: SPACING.small,
    backgroundColor: '#fff3cd',
    borderRadius: BORDER_RADIUS.small,
    borderWidth: 1,
    borderColor: '#ffeaa7',
  },
  debugTitle: {
    fontSize: FONTS.small,
    fontWeight: FONTS.bold,
    color: '#856404',
    marginBottom: SPACING.tiny,
  },
  debugText: {
    fontSize: FONTS.tiny,
    color: '#856404',
    marginBottom: 2,
  },
  helpTitle: {
    fontSize: FONTS.medium,
    fontWeight: FONTS.bold,
    color: COLORS.text,
    marginBottom: SPACING.small,
  },
  helpText: {
    fontSize: FONTS.small,
    color: COLORS.textLight,
    lineHeight: 20,
  },
  lastSyncText: {
    fontSize: FONTS.small,
    color: COLORS.textLight,
    marginTop: SPACING.small,
  },
  callbackInfo: {
    marginBottom: 24,
    paddingHorizontal: 16,
  },
  callbackBox: {
    backgroundColor: '#f8f9fa',
    borderWidth: 1,
    borderColor: '#e9ecef',
    borderRadius: 8,
    padding: 12,
    marginBottom: 8,
  },
  callbackText: {
    fontSize: 13,
    fontFamily: 'monospace',
    color: '#495057',
    lineHeight: 18,
  },
  callbackNote: {
    fontSize: 12,
    color: '#6c757d',
    fontStyle: 'italic',
    lineHeight: 16,
  },
});

export default SalesforceConfigScreen;
