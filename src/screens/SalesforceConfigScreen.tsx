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
      batch_id: 'Batch_ID__c',
      created_date: 'Created_Date__c',
      company_id: 'Company_ID__c',
      identifier: 'Identifier__c',
      identifier_type: 'Identifier_Type__c',
      total_photos: 'Total_Photos__c',
      photo_id: 'Photo_ID__c',
      batch_reference: 'Photo_Batch__c',
      file_name: 'File_Name__c',
      file_size: 'File_Size__c',
      capture_date: 'Capture_Date__c'
    }
  });

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<'unknown' | 'connected' | 'failed'>('unknown');
  const [testResults, setTestResults] = useState<{
    success: boolean;
    message: string;
    details?: any;
  } | null>(null);

  const [showAdvanced, setShowAdvanced] = useState(false);

  useEffect(() => {
    loadConfig();
  }, [currentCompany?.id]);

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
              [{ text: 'OK', onPress: () => loadConfig() }]
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

  const loadConfig = async () => {
    if (!currentCompany?.id) {
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      console.log('[SalesforceConfig] Loading config for company:', currentCompany.id);
      
      const integrations = await companyIntegrationsService.getCompanyIntegrations(currentCompany.id);
      const salesforceIntegration = integrations.find(i => i.integration_type === 'salesforce');
      
      if (salesforceIntegration?.config) {
        console.log('[SalesforceConfig] Found existing config:', salesforceIntegration.config);
        setConfig(salesforceIntegration.config as SalesforceConfig);
        setConnectionStatus(salesforceIntegration.status === 'active' ? 'connected' : 'failed');
      }
    } catch (error) {
      console.error('[SalesforceConfig] Error loading config:', error);
      Alert.alert('Error', 'Failed to load Salesforce configuration');
    } finally {
      setLoading(false);
    }
  };

  const saveConfig = async () => {
    if (!currentCompany?.id || !user?.id) {
      Alert.alert('Error', 'Company or user information is missing');
      return;
    }

    if (!config.client_id.trim()) {
      Alert.alert('Validation Error', 'Client ID is required');
      return;
    }

    if (!config.client_secret.trim()) {
      Alert.alert('Validation Error', 'Client Secret is required');
      return;
    }

    try {
      setSaving(true);
      console.log('[SalesforceConfig] Saving config for company:', currentCompany.id);

      await companyIntegrationsService.createOrUpdateIntegration({
        company_id: currentCompany.id,
        integration_type: 'salesforce',
        config: config,
        status: 'active',
        created_by: user.id,
        updated_by: user.id
      });

      Alert.alert(
        'Success',
        'Salesforce configuration saved successfully!',
        [{ text: 'OK', onPress: () => navigation.goBack() }]
      );
    } catch (error) {
      console.error('[SalesforceConfig] Error saving config:', error);
      Alert.alert('Error', 'Failed to save configuration. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const testConnection = async () => {
    if (!config.client_id.trim() || !config.client_secret.trim()) {
      Alert.alert('Validation Error', 'Please fill in Client ID and Client Secret before testing');
      return;
    }

    try {
      setIsTesting(true);
      setTestResults(null);
      console.log('[SalesforceConfig] Testing connection...');

      // Test the connection using our OAuth service
      const result = await salesforceOAuthService.testConnection(config);
      
      if (result.success) {
        setTestResults({
          success: true,
          message: 'Connection successful! Ready to authenticate.',
          details: result.data
        });
        setConnectionStatus('connected');
      } else {
        setTestResults({
          success: false,
          message: result.error || 'Connection failed',
          details: result.details
        });
        setConnectionStatus('failed');
      }
    } catch (error) {
      console.error('[SalesforceConfig] Connection test error:', error);
      setTestResults({
        success: false,
        message: 'Connection test failed: ' + (error as Error).message
      });
      setConnectionStatus('failed');
    } finally {
      setIsTesting(false);
    }
  };

  const authenticateWithSalesforce = async () => {
    if (!config.client_id.trim() || !config.client_secret.trim()) {
      Alert.alert('Validation Error', 'Please fill in and test your configuration first');
      return;
    }

    try {
      setIsAuthenticating(true);
      console.log('[SalesforceConfig] Starting OAuth flow...');

      const result = await salesforceOAuthService.initiateOAuth(config);
      
      if (result.success && result.authUrl) {
        // Open the Salesforce OAuth URL
        const supported = await Linking.canOpenURL(result.authUrl);
        if (supported) {
          await Linking.openURL(result.authUrl);
          Alert.alert(
            'Authentication Started',
            'Please complete the authentication in your browser, then return to the app.',
            [{ text: 'OK' }]
          );
        } else {
          Alert.alert('Error', 'Unable to open authentication URL');
        }
      } else {
        Alert.alert('Error', result.error || 'Failed to start authentication');
      }
    } catch (error) {
      console.error('[SalesforceConfig] OAuth error:', error);
      Alert.alert('Error', 'Authentication failed: ' + (error as Error).message);
    } finally {
      setIsAuthenticating(false);
    }
  };

  const updateConfig = (field: keyof SalesforceConfig, value: any) => {
    setConfig(prev => ({
      ...prev,
      [field]: value
    }));
  };

  const updateObjectMapping = (key: string, value: string) => {
    setConfig(prev => ({
      ...prev,
      object_mappings: {
        ...prev.object_mappings,
        [key]: value
      }
    }));
  };

  const updateFieldMapping = (key: string, value: string) => {
    setConfig(prev => ({
      ...prev,
      field_mappings: {
        ...prev.field_mappings,
        [key]: value
      }
    }));
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={COLORS.primary} />
        <Text style={styles.loadingText}>Loading Salesforce configuration...</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView 
        style={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={styles.header}>
          <Ionicons name="cloud-outline" size={48} color={COLORS.primary} />
          <Text style={styles.title}>Salesforce Integration</Text>
          <Text style={styles.subtitle}>
            Connect with Salesforce to sync your quality control data
          </Text>
        </View>

        {/* Basic Configuration */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Basic Configuration</Text>
          
          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>Environment</Text>
            <View style={styles.switchContainer}>
              <Text style={styles.switchLabel}>Production</Text>
              <Switch
                value={!config.sandbox}
                onValueChange={(value) => updateConfig('sandbox', !value)}
                trackColor={{ false: COLORS.grey300, true: COLORS.primaryLight }}
                thumbColor={!config.sandbox ? COLORS.primary : COLORS.grey100}
              />
              <Text style={styles.switchLabel}>Sandbox</Text>
            </View>
          </View>

          <CustomInput
            label="Client ID (Consumer Key)"
            value={config.client_id}
            onChangeText={(value) => updateConfig('client_id', value)}
            placeholder="Enter your Salesforce Connected App Client ID"
            multiline={false}
            style={styles.input}
          />

          <CustomInput
            label="Client Secret (Consumer Secret)"
            value={config.client_secret}
            onChangeText={(value) => updateConfig('client_secret', value)}
            placeholder="Enter your Salesforce Connected App Client Secret"
            secureTextEntry={true}
            multiline={false}
            style={styles.input}
          />
        </View>

        {/* Connection Test */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Connection Test</Text>
          
          {testResults && (
            <View style={[
              styles.testResultContainer,
              { backgroundColor: testResults.success ? COLORS.successLight : COLORS.errorLight }
            ]}>
              <Ionicons 
                name={testResults.success ? "checkmark-circle" : "alert-circle"} 
                size={20} 
                color={testResults.success ? COLORS.success : COLORS.error} 
              />
              <Text style={[
                styles.testResultText,
                { color: testResults.success ? COLORS.success : COLORS.error }
              ]}>
                {testResults.message}
              </Text>
            </View>
          )}

          <View style={styles.buttonGroup}>
            <CustomButton
              title={isTesting ? 'Testing...' : 'Test Connection'}
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
        </View>

        {config.instance_url && (
          <Text style={styles.instanceUrl}>
            Instance: {config.instance_url}
          </Text>
        )}

        {/* Advanced Configuration */}
        <View style={styles.section}>
          <TouchableOpacity 
            style={styles.advancedToggle}
            onPress={() => setShowAdvanced(!showAdvanced)}
          >
            <Text style={styles.sectionTitle}>Advanced Configuration</Text>
            <Ionicons 
              name={showAdvanced ? "chevron-up" : "chevron-down"} 
              size={20} 
              color={COLORS.textSecondary} 
            />
          </TouchableOpacity>

          {showAdvanced && (
            <View style={styles.advancedContent}>
              <CustomInput
                label="API Version"
                value={config.api_version}
                onChangeText={(value) => updateConfig('api_version', value)}
                placeholder="58.0"
                style={styles.input}
              />

              <Text style={styles.subSectionTitle}>Object Mappings</Text>
              <CustomInput
                label="Photo Batch Object"
                value={config.object_mappings.photo_batch}
                onChangeText={(value) => updateObjectMapping('photo_batch', value)}
                placeholder="Custom_Photo_Batch__c"
                style={styles.input}
              />
              
              <CustomInput
                label="Photo Object"
                value={config.object_mappings.photo}
                onChangeText={(value) => updateObjectMapping('photo', value)}
                placeholder="Custom_Photo__c"
                style={styles.input}
              />

              <Text style={styles.subSectionTitle}>Field Mappings</Text>
              <CustomInput
                label="Batch ID Field"
                value={config.field_mappings.batch_id}
                onChangeText={(value) => updateFieldMapping('batch_id', value)}
                placeholder="Batch_ID__c"
                style={styles.input}
              />
              
              <CustomInput
                label="Identifier Field"
                value={config.field_mappings.identifier}
                onChangeText={(value) => updateFieldMapping('identifier', value)}
                placeholder="Identifier__c"
                style={styles.input}
              />
            </View>
          )}
        </View>

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

        {/* Save Button */}
        <View style={styles.saveSection}>
          <CustomButton
            title={saving ? 'Saving...' : 'Save Configuration'}
            onPress={saveConfig}
            variant="primary"
            disabled={saving}
            style={styles.saveButton}
          />
        </View>

        {/* Add padding at bottom for better scrolling */}
        <View style={{ height: 100 }} />
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.backgroundSecondary,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: COLORS.backgroundSecondary,
  },
  loadingText: {
    marginTop: SPACING.md,
    fontSize: FONTS.regular,
    color: COLORS.textSecondary,
  },
  content: {
    flex: 1,
    padding: SPACING.lg,
  },
  header: {
    alignItems: 'center',
    marginBottom: SPACING.xl,
    backgroundColor: COLORS.background,
    padding: SPACING.lg,
    borderRadius: BORDER_RADIUS.lg,
    ...CARD_STYLES.shadow,
  },
  title: {
    fontSize: FONTS.xxLarge,
    fontWeight: FONTS.bold,
    color: COLORS.text,
    marginBottom: SPACING.sm,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: FONTS.regular,
    color: COLORS.textSecondary,
    textAlign: 'center',
    lineHeight: 22,
  },
  section: {
    marginBottom: SPACING.xl,
    backgroundColor: COLORS.background,
    padding: SPACING.lg,
    borderRadius: BORDER_RADIUS.lg,
    ...CARD_STYLES.shadow,
  },
  sectionTitle: {
    fontSize: FONTS.large,
    fontWeight: FONTS.bold,
    color: COLORS.text,
    marginBottom: SPACING.md,
  },
  subSectionTitle: {
    fontSize: FONTS.medium,
    fontWeight: FONTS.bold,
    color: COLORS.text,
    marginBottom: SPACING.md,
    marginTop: SPACING.lg,
  },
  inputGroup: {
    marginBottom: SPACING.md,
  },
  inputLabel: {
    fontSize: FONTS.regular,
    fontWeight: FONTS.mediumWeight,
    color: COLORS.text,
    marginBottom: SPACING.sm,
  },
  input: {
    marginBottom: SPACING.md,
  },
  switchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: SPACING.sm,
    backgroundColor: COLORS.grey50,
    borderRadius: BORDER_RADIUS.md,
  },
  switchLabel: {
    fontSize: FONTS.regular,
    color: COLORS.text,
    marginHorizontal: SPACING.md,
  },
  testResultContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: SPACING.md,
    borderRadius: BORDER_RADIUS.md,
    marginBottom: SPACING.md,
  },
  testResultText: {
    fontSize: FONTS.regular,
    marginLeft: SPACING.sm,
    flex: 1,
  },
  buttonGroup: {
    gap: SPACING.md,
  },
  testButton: {
    marginBottom: SPACING.sm,
  },
  authButton: {
    marginBottom: SPACING.sm,
  },
  instanceUrl: {
    fontSize: FONTS.small,
    color: COLORS.textSecondary,
    textAlign: 'center',
    marginBottom: SPACING.lg,
    fontStyle: 'italic',
  },
  advancedToggle: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: SPACING.sm,
  },
  advancedContent: {
    marginTop: SPACING.md,
  },
  instructionsList: {
    backgroundColor: COLORS.grey50,
    padding: SPACING.md,
    borderRadius: BORDER_RADIUS.md,
    marginBottom: SPACING.lg,
  },
  instructionItem: {
    fontSize: FONTS.regular,
    color: COLORS.text,
    marginBottom: SPACING.sm,
    lineHeight: 20,
  },
  callbackUrlContainer: {
    backgroundColor: COLORS.infoLight,
    padding: SPACING.md,
    borderRadius: BORDER_RADIUS.md,
    borderLeftWidth: 4,
    borderLeftColor: COLORS.info,
  },
  callbackLabel: {
    fontSize: FONTS.medium,
    fontWeight: FONTS.bold,
    color: COLORS.text,
    marginBottom: SPACING.sm,
  },
  callbackUrl: {
    fontSize: FONTS.small,
    color: COLORS.info,
    backgroundColor: COLORS.background,
    padding: SPACING.sm,
    borderRadius: BORDER_RADIUS.sm,
    fontFamily: 'monospace',
    marginBottom: SPACING.sm,
  },
  callbackNote: {
    fontSize: FONTS.small,
    color: COLORS.textSecondary,
    marginBottom: SPACING.sm,
    lineHeight: 18,
  },
  callbackInstruction: {
    fontSize: FONTS.small,
    color: COLORS.textSecondary,
    fontWeight: FONTS.mediumWeight,
  },
  saveSection: {
    marginTop: SPACING.lg,
    marginBottom: SPACING.xl,
  },
  saveButton: {
    backgroundColor: COLORS.success,
  },
});

export default SalesforceConfigScreen;
