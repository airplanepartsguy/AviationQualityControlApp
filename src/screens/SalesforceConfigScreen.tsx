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
import CustomButton from '../components/CustomButton';
import CustomInput from '../components/CustomInput';

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
      
      const testResult = await companyIntegrationsService.testSalesforceConnection(currentCompany.id);
      
      if (testResult.success) {
        console.log('[SalesforceConfig] Connection test successful:', testResult.message);
        Alert.alert('Success', 'Successfully connected to Salesforce!');
        
        // Reload integration to get updated status
        await loadSalesforceConfig();
      } else {
        console.log('[SalesforceConfig] Connection test failed:', testResult.message);
        Alert.alert('Connection Failed', testResult.message || 'Unable to connect to Salesforce. Please check your credentials.');
      }
    } catch (error) {
      console.error('[SalesforceConfig] Connection test failed:', error);
      Alert.alert('Error', 'Connection test failed. Please try again.');
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
        // ENHANCED: Check oauth_callbacks table directly for completed OAuth
        const { data: recentCallbacks, error: callbackError } = await supabase
          .from('oauth_callbacks')
          .select('*')
          .eq('company_id', companyId)
          .is('error', null)
          .eq('consumed', false)
          .order('created_at', { ascending: false })
          .limit(1);
        
        if (recentCallbacks && recentCallbacks.length > 0) {
          console.log('[SalesforceConfig] Found successful OAuth callback! Checking for tokens...');
          
          // Mark callback as consumed
          await supabase
            .from('oauth_callbacks')
            .update({ consumed: true })
            .eq('id', recentCallbacks[0].id);
        }
        // Check both database and SecureStore for debugging
        const integration = await companyIntegrationsService.getIntegration(companyId, 'salesforce');
        console.log('[SalesforceConfig] Integration check:', {
          exists: !!integration,
          status: integration?.status,
          hasConfig: !!integration?.config,
          hasAccessToken: !!(integration?.config as any)?.access_token,
          tokenExpiresAt: (integration?.config as any)?.token_expires_at
        });
        
        const tokenResult = await salesforceOAuthService.checkOAuthTokens(companyId);
        
        if (tokenResult.success) {
          console.log('[SalesforceConfig] OAuth tokens found! Integration is active.');
          clearInterval(pollInterval);
          
          // Force reload integration status and ERP data
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
            'OAuth authentication timed out. Please try connecting again.',
            [{ text: 'OK' }]
          );
        }
      } catch (error) {
        console.error('[SalesforceConfig] OAuth token check error:', error);
        // Continue checking on error, don't stop
      }
    }, 5000); // Check every 5 seconds
  };

  const authenticateWithSalesforce = () => {
    startOAuthFlow();
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

  const startOAuthFlow = async () => {
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
        sandbox: config.sandbox || false
      };
      
      // Initiate OAuth flow and capture the PKCE code verifier
      const { authUrl, codeChallenge } = await salesforceOAuthService.initiateOAuthFlow(currentCompany!.id, oauthConfig);
      
      // CRITICAL FIX: Store the PKCE code verifier for later use in token exchange
      const codeVerifierKey = `oauth_code_verifier_${currentCompany!.id}`;
      await SecureStore.setItemAsync(codeVerifierKey, codeChallenge);
      console.log('[SalesforceConfig] Stored PKCE code verifier in secure storage');
      
      // Log OAuth configuration for debugging
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
      console.log('[SalesforceConfig] === END DEBUG INFO ===');
      
      // Show user-friendly authentication flow
      Alert.alert(
        'Authenticate with Salesforce',
        `You'll be redirected to Salesforce to sign in and authorize this app.\n\n${oauthConfig.sandbox ? 'Sandbox' : 'Production'} Environment`,
        [
          { text: 'Cancel', style: 'cancel' },
          { 
            text: 'Continue to Salesforce', 
            onPress: () => {
              openBrowserWithUrl(authUrl);
              // Start checking for OAuth tokens after user initiates flow
              checkOAuthTokens(currentCompany!.id);
            }
          }
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
      <ScrollView style={styles.content}>
        {/* Configuration Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Configuration</Text>
          
          <View style={styles.inputContainer}>
            <Text style={styles.label}>Instance URL</Text>
            <CustomInput
              placeholder="https://yourcompany.my.salesforce.com"
              value={config.instance_url}
              onChangeText={(text) => setConfig({...config, instance_url: text})}
              autoCapitalize="none"
              editable={!isLoading}
            />
          </View>

          <View style={styles.inputContainer}>
            <Text style={styles.label}>Client ID</Text>
            <CustomInput
              placeholder="Consumer Key from your Connected App"
              value={config.client_id}
              onChangeText={(text) => setConfig({...config, client_id: text})}
              autoCapitalize="none"
              editable={!isLoading}
            />
          </View>

          <View style={styles.inputContainer}>
            <Text style={styles.label}>Client Secret</Text>
            <CustomInput
              placeholder="Consumer Secret from your Connected App"
              value={config.client_secret}
              onChangeText={(text) => setConfig({...config, client_secret: text})}
              secureTextEntry
              autoCapitalize="none"
              editable={!isLoading}
            />
          </View>

          <View style={styles.switchContainer}>
            <Text style={styles.switchLabel}>Sandbox Environment</Text>
            <Switch
              value={config.sandbox}
              onValueChange={(value) => setConfig({...config, sandbox: value})}
              disabled={isLoading}
            />
          </View>
          <Text style={styles.switchHelp}>
            Connect to Salesforce sandbox instead of production
          </Text>
        </View>

        {/* Connection Status Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Connection Status</Text>
          <View style={styles.statusContainer}>
            {integration?.status === 'active' ? (
              <View style={styles.statusRow}>
                <Ionicons name="checkmark-circle" size={24} color={COLORS.success} />
                <Text style={styles.statusText}>Connected and Active</Text>
              </View>
            ) : (
              <View style={styles.statusRow}>
                <Ionicons name="warning-outline" size={24} color={COLORS.warning} />
                <Text style={styles.statusText}>
                  {integration?.status === 'pending' ? 'Authentication Required' : 'Not Connected'}
                </Text>
              </View>
            )}
            
            {integration?.last_test_at && (
              <Text style={styles.lastSyncText}>
                Last sync: {new Date(integration.last_test_at).toLocaleString()}
              </Text>
            )}
          </View>
        </View>

        {/* Action Buttons */}
        <View style={styles.buttonContainer}>
          <CustomButton
            title={isTesting ? 'Testing Connection...' : 'Test Connection'}
            onPress={testConnection}
            style={styles.testButton}
            variant="secondary"
            disabled={isTesting}
          />

          <CustomButton
            title={isAuthenticating ? 'Authenticating...' : 'Authenticate with Salesforce'}
            onPress={authenticateWithSalesforce}
            style={styles.authButton}
            variant="primary"
            disabled={isAuthenticating}
          />
        </View>

        {config.instance_url && (
          <Text style={styles.instanceUrl}>
            Instance: {config.instance_url}
          </Text>
        )}

        {/* Setup Instructions */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Setup Instructions</Text>
          <View style={styles.instructionsList}>
            <Text style={styles.instructionItem}>
              1. Create a Connected App in Salesforce Setup
            </Text>
            <Text style={styles.instructionItem}>
              2. Enable OAuth settings and configure callback URL
            </Text>
            <Text style={styles.instructionItem}>
              3. Copy the Consumer Key (Client ID) and Consumer Secret
            </Text>
            <Text style={styles.instructionItem}>
              4. Test the connection before saving
            </Text>
          </View>
          
          <View style={styles.callbackUrlContainer}>
            <Text style={styles.callbackLabel}>Callback URL (Production-Ready)</Text>
            <Text style={styles.callbackUrl}>
              https://luwlvmcixwdtuaffamgk.supabase.co/functions/v1/salesforce-oauth-callback
            </Text>
            <Text style={styles.callbackNote}>
              💡 This production-ready Supabase Edge Function endpoint works for all environments and handles secure OAuth token exchange.
            </Text>
            <Text style={styles.callbackInstruction}>
              📋 Copy this URL to your Salesforce Connected App's Callback URL setting.
            </Text>
          </View>
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
    fontSize: 16,
    color: COLORS.textLight,
  },
  content: {
    padding: SPACING.large,
  },
  header: {
    alignItems: 'center',
    marginBottom: SPACING.xlarge,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: COLORS.text,
    marginBottom: SPACING.small,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 16,
    color: COLORS.textLight,
    textAlign: 'center',
    lineHeight: 22,
  },
  section: {
    marginBottom: SPACING.xlarge,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: COLORS.text,
    marginBottom: SPACING.medium,
  },
  inputContainer: {
    marginBottom: SPACING.medium,
  },
  label: {
    fontSize: 16,
    fontWeight: '500',
    color: COLORS.text,
    marginBottom: SPACING.small,
  },
  switchContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: SPACING.small,
  },
  switchLabel: {
    fontSize: 16,
    color: COLORS.text,
    flex: 1,
  },
  switchHelp: {
    fontSize: 12,
    color: COLORS.textLight,
    marginTop: SPACING.small,
    lineHeight: 16,
  },
  statusContainer: {
    paddingVertical: SPACING.medium,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.medium,
  },
  statusText: {
    fontSize: 16,
    fontWeight: '500',
    color: COLORS.text,
  },
  lastSyncText: {
    fontSize: 14,
    color: COLORS.textLight,
    marginTop: SPACING.small,
  },
  buttonContainer: {
    flexDirection: 'row',
    gap: SPACING.medium,
    marginBottom: SPACING.large,
  },
  testButton: {
    flex: 1,
  },
  authButton: {
    flex: 1,
  },
  instanceUrl: {
    fontSize: 12,
    color: COLORS.textLight,
    fontStyle: 'italic',
    textAlign: 'center',
    marginTop: SPACING.small,
  },
  instructionsList: {
    marginBottom: SPACING.medium,
  },
  instructionItem: {
    fontSize: 14,
    color: COLORS.text,
    marginBottom: SPACING.small,
    lineHeight: 20,
  },
  callbackUrlContainer: {
    marginTop: SPACING.medium,
    padding: SPACING.medium,
    backgroundColor: COLORS.card,
    borderRadius: BORDER_RADIUS.medium,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  callbackLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.text,
    marginBottom: SPACING.small,
  },
  callbackUrl: {
    fontSize: 12,
    fontFamily: 'monospace',
    color: COLORS.primary,
    marginBottom: SPACING.small,
    backgroundColor: COLORS.background,
    padding: SPACING.small,
    borderRadius: BORDER_RADIUS.small,
  },
  callbackNote: {
    fontSize: 12,
    color: COLORS.textLight,
    marginBottom: SPACING.small,
    lineHeight: 16,
  },
  callbackInstruction: {
    fontSize: 12,
    color: COLORS.primary,
    fontWeight: '500',
  },
});

export default SalesforceConfigScreen;
