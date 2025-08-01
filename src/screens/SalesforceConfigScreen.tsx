import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Alert,
  Switch,
  ActivityIndicator,
  SafeAreaView,
  TouchableOpacity,
  StatusBar,
} from 'react-native';
import { Linking } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../contexts/AuthContext';
import { useCompany } from '../contexts/CompanyContext';
import { COLORS, FONTS, SPACING, BORDER_RADIUS, CARD_STYLES } from '../styles/theme';
import companyIntegrationsService, { SalesforceConfig } from '../services/companyIntegrationsService';
import { salesforceOAuthService } from '../services/salesforceOAuthService';
import { RootStackParamList } from '../types/navigation';
import CustomButton from '../components/CustomButton';
import CustomInput from '../components/CustomInput';

type SalesforceConfigScreenNavigationProp = StackNavigationProp<RootStackParamList>;

type ConnectionStatus = 'idle' | 'testing' | 'success' | 'error';
type ConfigurationStep = 'setup' | 'test' | 'authenticate' | 'complete';

const SalesforceConfigScreen: React.FC = () => {
  const navigation = useNavigation<SalesforceConfigScreenNavigationProp>();
  const { user } = useAuth();
  const { currentCompany } = useCompany();
  
  // Configuration state
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
    prefix_mappings: {}
  });

  // UI state
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('idle');
  const [currentStep, setCurrentStep] = useState<ConfigurationStep>('setup');
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  
  // Status and feedback
  const [statusMessage, setStatusMessage] = useState<string>('');
  const [lastTestTime, setLastTestTime] = useState<string>('');

  useEffect(() => {
    loadExistingConfiguration();
  }, [currentCompany?.id]);

  const loadExistingConfiguration = async () => {
    if (!currentCompany?.id) {
      setLoading(false);
      return;
    }

    try {
      console.log('[SalesforceConfig] Loading configuration for company:', currentCompany.id);
      
      const integrations = await companyIntegrationsService.getCompanyIntegrations(currentCompany.id);
      const salesforceIntegration = integrations.find(i => i.integration_type === 'salesforce');
      
      if (salesforceIntegration?.config) {
        console.log('[SalesforceConfig] Found existing configuration');
        setConfig(salesforceIntegration.config as SalesforceConfig);
        
        // Check if authenticated
        const isActive = salesforceIntegration.status === 'active';
        setIsAuthenticated(isActive);
        
        if (isActive) {
          setCurrentStep('complete');
          setStatusMessage(`Connected to ${salesforceIntegration.config.instance_url}`);
          setLastTestTime(new Date(salesforceIntegration.updated_at || '').toLocaleString());
        } else {
          setCurrentStep('test');
          setStatusMessage('Configuration found but not authenticated');
        }
      } else {
        console.log('[SalesforceConfig] No existing configuration found');
        setCurrentStep('setup');
        setStatusMessage('Ready to configure Salesforce integration');
      }
    } catch (error) {
      console.error('[SalesforceConfig] Error loading configuration:', error);
      setStatusMessage('Error loading configuration');
    } finally {
      setLoading(false);
    }
  };

  const validateConfiguration = (): string | null => {
    if (!config.client_id.trim()) {
      return 'Client ID is required';
    }
    if (!config.client_secret.trim()) {
      return 'Client Secret is required';
    }
    if (config.client_id.length < 20) {
      return 'Client ID appears to be invalid (too short)';
    }
    if (config.client_secret.length < 20) {
      return 'Client Secret appears to be invalid (too short)';
    }
    return null;
  };

  const testConnection = async () => {
    const validationError = validateConfiguration();
    if (validationError) {
      Alert.alert('Validation Error', validationError);
      return;
    }

    if (!currentCompany?.id || !user?.id) {
      Alert.alert('Error', 'Company or user information is missing');
      return;
    }

    try {
      setConnectionStatus('testing');
      setStatusMessage('Testing connection to Salesforce...');
      
      console.log('[SalesforceConfig] Testing connection with config:', {
        client_id: config.client_id.substring(0, 10) + '...',
        sandbox: config.sandbox,
        instance_url: config.instance_url || 'auto-detect'
      });

      // First, save the configuration temporarily to test it
      await companyIntegrationsService.configureSalesforce(currentCompany.id, config, user.id);
      
      // Then test the connection using the company integrations service
      const result = await companyIntegrationsService.testSalesforceConnection(currentCompany.id);
      
      if (result.success) {
        setConnectionStatus('success');
        setStatusMessage('Connection successful! Ready to authenticate.');
        setLastTestTime(new Date().toLocaleString());
        setCurrentStep('authenticate');
        
        // Update instance URL if detected from test results
        if (result.details?.instance_url && result.details.instance_url !== config.instance_url) {
          setConfig(prev => ({
            ...prev,
            instance_url: result.details.instance_url
          }));
        }
      } else {
        throw new Error(result.message || 'Connection test failed');
      }
    } catch (error) {
      console.error('[SalesforceConfig] Connection test failed:', error);
      setConnectionStatus('error');
      setStatusMessage(`Connection failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  };

  const authenticateWithSalesforce = async () => {
    if (connectionStatus !== 'success') {
      Alert.alert('Test Required', 'Please test your connection first before authenticating.');
      return;
    }

    try {
      setStatusMessage('Starting Salesforce authentication...');
      
      const result = await salesforceOAuthService.initiateOAuth(config);
      
      if (result.success && result.authUrl) {
        const supported = await Linking.canOpenURL(result.authUrl);
        if (supported) {
          await Linking.openURL(result.authUrl);
          
          Alert.alert(
            'Authentication Started',
            'Please complete the authentication in your browser. You will be redirected back to the app when complete.',
            [
              {
                text: 'I completed authentication',
                onPress: () => {
                  setStatusMessage('Verifying authentication...');
                  // Check authentication status after a delay
                  setTimeout(checkAuthenticationStatus, 2000);
                }
              },
              {
                text: 'Cancel',
                style: 'cancel'
              }
            ]
          );
        } else {
          Alert.alert('Error', 'Unable to open authentication URL');
        }
      } else {
        Alert.alert('Error', result.error || 'Failed to start authentication');
      }
    } catch (error) {
      console.error('[SalesforceConfig] Authentication error:', error);
      Alert.alert('Error', `Authentication failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  };

  const checkAuthenticationStatus = async () => {
    try {
      // Check if tokens are now available
      if (currentCompany?.id) {
        const tokens = await salesforceOAuthService.getStoredTokens(currentCompany.id);
        if (tokens?.access_token) {
          setIsAuthenticated(true);
          setCurrentStep('complete');
          setStatusMessage(`Successfully authenticated with ${config.instance_url}`);
          setLastTestTime(new Date().toLocaleString());
          
          // Save the configuration
          await saveConfiguration();
        } else {
          setStatusMessage('Authentication not yet complete. Please try again.');
        }
      }
    } catch (error) {
      console.error('[SalesforceConfig] Error checking authentication:', error);
      setStatusMessage('Error verifying authentication. Please try again.');
    }
  };

  const saveConfiguration = async () => {
    if (!currentCompany?.id || !user?.id) {
      Alert.alert('Error', 'Company or user information is missing');
      return;
    }

    try {
      setSaving(true);
      console.log('[SalesforceConfig] Saving configuration for company:', currentCompany.id);

      await companyIntegrationsService.createOrUpdateIntegration({
        company_id: currentCompany.id,
        integration_type: 'salesforce',
        config: config,
        status: isAuthenticated ? 'active' : 'inactive',
        created_by: user.id,
        updated_by: user.id
      });

      Alert.alert(
        'Success',
        'Salesforce configuration saved successfully!',
        [{ text: 'OK', onPress: () => navigation.goBack() }]
      );
    } catch (error) {
      console.error('[SalesforceConfig] Error saving configuration:', error);
      Alert.alert('Error', 'Failed to save configuration. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const resetConfiguration = () => {
    Alert.alert(
      'Reset Configuration',
      'This will clear all Salesforce settings and require you to set up the integration again. Are you sure?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Reset',
          style: 'destructive',
          onPress: () => {
            setConfig({
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
            setConnectionStatus('idle');
            setCurrentStep('setup');
            setIsAuthenticated(false);
            setStatusMessage('Configuration reset. Ready to start over.');
            setLastTestTime('');
          }
        }
      ]
    );
  };

  const getStepIcon = (step: ConfigurationStep) => {
    switch (step) {
      case 'setup': return 'settings-outline';
      case 'test': return 'checkmark-circle-outline';
      case 'authenticate': return 'key-outline';
      case 'complete': return 'checkmark-circle';
      default: return 'help-circle-outline';
    }
  };

  const getStepColor = (step: ConfigurationStep) => {
    if (step === currentStep) return COLORS.primary;
    if (
      (step === 'setup') ||
      (step === 'test' && currentStep !== 'setup') ||
      (step === 'authenticate' && ['authenticate', 'complete'].includes(currentStep)) ||
      (step === 'complete' && currentStep === 'complete')
    ) {
      return COLORS.success;
    }
    return COLORS.grey400;
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
      <StatusBar backgroundColor={COLORS.primary} barStyle="light-content" />
      
      <ScrollView 
        style={styles.content}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        {/* Modern Header */}
        <View style={styles.header}>
          <View style={styles.headerIcon}>
            <Ionicons name="cloud" size={32} color={COLORS.white} />
          </View>
          <Text style={styles.headerTitle}>Salesforce Integration</Text>
          <Text style={styles.headerSubtitle}>
            Connect with Salesforce to sync your quality control data
          </Text>
        </View>

        {/* Progress Steps */}
        <View style={styles.progressContainer}>
          <Text style={styles.progressTitle}>Setup Progress</Text>
          <View style={styles.progressSteps}>
            {[
              { step: 'setup' as ConfigurationStep, label: 'Configure' },
              { step: 'test' as ConfigurationStep, label: 'Test' },
              { step: 'authenticate' as ConfigurationStep, label: 'Authenticate' },
              { step: 'complete' as ConfigurationStep, label: 'Complete' }
            ].map((item, index) => (
              <View key={item.step} style={styles.progressStep}>
                <View style={[
                  styles.progressStepIcon,
                  { backgroundColor: getStepColor(item.step) }
                ]}>
                  <Ionicons 
                    name={getStepIcon(item.step)} 
                    size={20} 
                    color={COLORS.white} 
                  />
                </View>
                <Text style={[
                  styles.progressStepLabel,
                  { color: getStepColor(item.step) }
                ]}>
                  {item.label}
                </Text>
                {index < 3 && (
                  <View style={[
                    styles.progressStepLine,
                    { backgroundColor: getStepColor(item.step) }
                  ]} />
                )}
              </View>
            ))}
          </View>
        </View>

        {/* Status Card */}
        <View style={styles.statusCard}>
          <View style={styles.statusHeader}>
            <Ionicons 
              name={
                connectionStatus === 'success' ? 'checkmark-circle' :
                connectionStatus === 'error' ? 'alert-circle' :
                connectionStatus === 'testing' ? 'sync' : 'information-circle'
              }
              size={24}
              color={
                connectionStatus === 'success' ? COLORS.success :
                connectionStatus === 'error' ? COLORS.error :
                connectionStatus === 'testing' ? COLORS.warning : COLORS.info
              }
            />
            <Text style={styles.statusTitle}>Status</Text>
          </View>
          <Text style={styles.statusMessage}>{statusMessage}</Text>
          {lastTestTime && (
            <Text style={styles.statusTime}>Last tested: {lastTestTime}</Text>
          )}
        </View>

        {/* Configuration Form */}
        <View style={styles.configSection}>
          <Text style={styles.sectionTitle}>Salesforce Configuration</Text>
          
          {/* Environment Toggle */}
          <View style={styles.environmentToggle}>
            <Text style={styles.environmentLabel}>Environment</Text>
            <View style={styles.switchContainer}>
              <Text style={[styles.switchLabel, !config.sandbox && styles.switchLabelActive]}>
                Production
              </Text>
              <Switch
                value={config.sandbox}
                onValueChange={(value) => setConfig(prev => ({ ...prev, sandbox: value }))}
                trackColor={{ false: COLORS.primary, true: COLORS.warning }}
                thumbColor={COLORS.white}
              />
              <Text style={[styles.switchLabel, config.sandbox && styles.switchLabelActive]}>
                Sandbox
              </Text>
            </View>
          </View>

          {/* Credentials */}
          <CustomInput
            label="Consumer Key (Client ID)"
            value={config.client_id}
            onChangeText={(value) => setConfig(prev => ({ ...prev, client_id: value }))}
            placeholder="3MVG9ux34Ig8G5epos1WTw..."
            multiline={false}
            style={styles.input}
            autoCapitalize="none"
            autoCorrect={false}
          />

          <CustomInput
            label="Consumer Secret (Client Secret)"
            value={config.client_secret}
            onChangeText={(value) => setConfig(prev => ({ ...prev, client_secret: value }))}
            placeholder="Enter your Consumer Secret"
            secureTextEntry={true}
            multiline={false}
            style={styles.input}
            autoCapitalize="none"
            autoCorrect={false}
          />

          {config.instance_url && (
            <View style={styles.instanceUrlContainer}>
              <Text style={styles.instanceUrlLabel}>Detected Instance URL:</Text>
              <Text style={styles.instanceUrlText}>{config.instance_url}</Text>
            </View>
          )}
        </View>

        {/* Action Buttons */}
        <View style={styles.actionButtons}>
          {currentStep === 'setup' && (
            <CustomButton
              title="Test Connection"
              onPress={testConnection}
              disabled={connectionStatus === 'testing' || !config.client_id || !config.client_secret}
              style={styles.primaryButton}
              variant="primary"
            />
          )}

          {currentStep === 'test' && connectionStatus === 'success' && (
            <CustomButton
              title="Authenticate with Salesforce"
              onPress={authenticateWithSalesforce}
              style={styles.primaryButton}
              variant="primary"
            />
          )}

          {currentStep === 'authenticate' && (
            <CustomButton
              title="Check Authentication Status"
              onPress={checkAuthenticationStatus}
              style={styles.primaryButton}
              variant="secondary"
            />
          )}

          {currentStep === 'complete' && (
            <View style={styles.completeActions}>
              <CustomButton
                title={saving ? 'Saving...' : 'Save Configuration'}
                onPress={saveConfiguration}
                disabled={saving}
                style={styles.saveButton}
                variant="primary"
              />
              <CustomButton
                title="Test Again"
                onPress={testConnection}
                style={styles.secondaryButton}
                variant="secondary"
              />
            </View>
          )}

          {connectionStatus === 'error' && (
            <CustomButton
              title="Retry Test"
              onPress={testConnection}
              style={styles.retryButton}
              variant="secondary"
            />
          )}

          <TouchableOpacity onPress={resetConfiguration} style={styles.resetButton}>
            <Text style={styles.resetButtonText}>Reset Configuration</Text>
          </TouchableOpacity>
        </View>

        {/* Setup Instructions */}
        <View style={styles.instructionsSection}>
          <TouchableOpacity 
            style={styles.instructionsHeader}
            onPress={() => setShowAdvanced(!showAdvanced)}
          >
            <Text style={styles.instructionsTitle}>Setup Instructions</Text>
            <Ionicons 
              name={showAdvanced ? "chevron-up" : "chevron-down"} 
              size={20} 
              color={COLORS.textSecondary} 
            />
          </TouchableOpacity>

          {showAdvanced && (
            <View style={styles.instructionsContent}>
              <View style={styles.instructionStep}>
                <View style={styles.stepNumber}>
                  <Text style={styles.stepNumberText}>1</Text>
                </View>
                <View style={styles.stepContent}>
                  <Text style={styles.stepTitle}>Create Connected App</Text>
                  <Text style={styles.stepDescription}>
                    In Salesforce Setup, create a new Connected App with OAuth settings enabled
                  </Text>
                </View>
              </View>

              <View style={styles.instructionStep}>
                <View style={styles.stepNumber}>
                  <Text style={styles.stepNumberText}>2</Text>
                </View>
                <View style={styles.stepContent}>
                  <Text style={styles.stepTitle}>Configure OAuth</Text>
                  <Text style={styles.stepDescription}>
                    Set the callback URL to our secure endpoint
                  </Text>
                  <View style={styles.callbackUrl}>
                    <Text style={styles.callbackUrlText}>
                      https://luwlvmcixwdtuaffamgk.supabase.co/functions/v1/salesforce-oauth-callback
                    </Text>
                  </View>
                </View>
              </View>

              <View style={styles.instructionStep}>
                <View style={styles.stepNumber}>
                  <Text style={styles.stepNumberText}>3</Text>
                </View>
                <View style={styles.stepContent}>
                  <Text style={styles.stepTitle}>Get Credentials</Text>
                  <Text style={styles.stepDescription}>
                    Copy the Consumer Key and Consumer Secret from your Connected App
                  </Text>
                </View>
              </View>
            </View>
          )}
        </View>

        {/* Add bottom padding for better scrolling */}
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
  },
  scrollContent: {
    padding: SPACING.lg,
  },
  header: {
    backgroundColor: COLORS.primary,
    padding: SPACING.xl,
    borderRadius: BORDER_RADIUS.lg,
    alignItems: 'center',
    marginBottom: SPACING.lg,
    ...CARD_STYLES.shadow,
  },
  headerIcon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: 'rgba(255,255,255,0.2)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: SPACING.md,
  },
  headerTitle: {
    fontSize: FONTS.xxLarge,
    fontWeight: FONTS.bold,
    color: COLORS.white,
    textAlign: 'center',
    marginBottom: SPACING.sm,
  },
  headerSubtitle: {
    fontSize: FONTS.regular,
    color: 'rgba(255,255,255,0.9)',
    textAlign: 'center',
    lineHeight: 22,
  },
  progressContainer: {
    backgroundColor: COLORS.background,
    padding: SPACING.lg,
    borderRadius: BORDER_RADIUS.lg,
    marginBottom: SPACING.lg,
    ...CARD_STYLES.shadow,
  },
  progressTitle: {
    fontSize: FONTS.large,
    fontWeight: FONTS.bold,
    color: COLORS.text,
    marginBottom: SPACING.md,
    textAlign: 'center',
  },
  progressSteps: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    position: 'relative',
  },
  progressStep: {
    alignItems: 'center',
    flex: 1,
  },
  progressStepIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: SPACING.sm,
  },
  progressStepLabel: {
    fontSize: FONTS.small,
    fontWeight: FONTS.mediumWeight,
    textAlign: 'center',
  },
  progressStepLine: {
    position: 'absolute',
    top: 20,
    left: '50%',
    right: '-50%',
    height: 2,
    zIndex: -1,
  },
  statusCard: {
    backgroundColor: COLORS.background,
    padding: SPACING.lg,
    borderRadius: BORDER_RADIUS.lg,
    marginBottom: SPACING.lg,
    ...CARD_STYLES.shadow,
  },
  statusHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: SPACING.sm,
  },
  statusTitle: {
    fontSize: FONTS.large,
    fontWeight: FONTS.bold,
    color: COLORS.text,
    marginLeft: SPACING.sm,
  },
  statusMessage: {
    fontSize: FONTS.regular,
    color: COLORS.textSecondary,
    lineHeight: 20,
    marginBottom: SPACING.sm,
  },
  statusTime: {
    fontSize: FONTS.small,
    color: COLORS.textSecondary,
    fontStyle: 'italic',
  },
  configSection: {
    backgroundColor: COLORS.background,
    padding: SPACING.lg,
    borderRadius: BORDER_RADIUS.lg,
    marginBottom: SPACING.lg,
    ...CARD_STYLES.shadow,
  },
  sectionTitle: {
    fontSize: FONTS.large,
    fontWeight: FONTS.bold,
    color: COLORS.text,
    marginBottom: SPACING.lg,
  },
  environmentToggle: {
    marginBottom: SPACING.lg,
  },
  environmentLabel: {
    fontSize: FONTS.regular,
    fontWeight: FONTS.mediumWeight,
    color: COLORS.text,
    marginBottom: SPACING.sm,
  },
  switchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.grey50,
    padding: SPACING.md,
    borderRadius: BORDER_RADIUS.md,
  },
  switchLabel: {
    fontSize: FONTS.regular,
    color: COLORS.textSecondary,
    marginHorizontal: SPACING.md,
  },
  switchLabelActive: {
    color: COLORS.text,
    fontWeight: FONTS.bold,
  },
  input: {
    marginBottom: SPACING.md,
  },
  instanceUrlContainer: {
    backgroundColor: COLORS.infoLight,
    padding: SPACING.md,
    borderRadius: BORDER_RADIUS.md,
    borderLeftWidth: 4,
    borderLeftColor: COLORS.info,
    marginTop: SPACING.md,
  },
  instanceUrlLabel: {
    fontSize: FONTS.small,
    fontWeight: FONTS.bold,
    color: COLORS.text,
    marginBottom: SPACING.xs,
  },
  instanceUrlText: {
    fontSize: FONTS.small,
    color: COLORS.info,
    fontFamily: 'monospace',
  },
  actionButtons: {
    marginBottom: SPACING.lg,
  },
  primaryButton: {
    marginBottom: SPACING.md,
  },
  completeActions: {
    gap: SPACING.md,
  },
  saveButton: {
    backgroundColor: COLORS.success,
    marginBottom: SPACING.sm,
  },
  secondaryButton: {
    marginBottom: SPACING.sm,
  },
  retryButton: {
    marginBottom: SPACING.md,
  },
  resetButton: {
    alignItems: 'center',
    paddingVertical: SPACING.md,
  },
  resetButtonText: {
    fontSize: FONTS.regular,
    color: COLORS.error,
    textDecorationLine: 'underline',
  },
  instructionsSection: {
    backgroundColor: COLORS.background,
    borderRadius: BORDER_RADIUS.lg,
    overflow: 'hidden',
    ...CARD_STYLES.shadow,
  },
  instructionsHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: SPACING.lg,
    backgroundColor: COLORS.grey50,
  },
  instructionsTitle: {
    fontSize: FONTS.large,
    fontWeight: FONTS.bold,
    color: COLORS.text,
  },
  instructionsContent: {
    padding: SPACING.lg,
  },
  instructionStep: {
    flexDirection: 'row',
    marginBottom: SPACING.lg,
  },
  stepNumber: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: COLORS.primary,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: SPACING.md,
  },
  stepNumberText: {
    fontSize: FONTS.regular,
    fontWeight: FONTS.bold,
    color: COLORS.white,
  },
  stepContent: {
    flex: 1,
  },
  stepTitle: {
    fontSize: FONTS.medium,
    fontWeight: FONTS.bold,
    color: COLORS.text,
    marginBottom: SPACING.xs,
  },
  stepDescription: {
    fontSize: FONTS.regular,
    color: COLORS.textSecondary,
    lineHeight: 20,
    marginBottom: SPACING.sm,
  },
  callbackUrl: {
    backgroundColor: COLORS.grey100,
    padding: SPACING.sm,
    borderRadius: BORDER_RADIUS.sm,
    borderLeftWidth: 3,
    borderLeftColor: COLORS.primary,
  },
  callbackUrlText: {
    fontSize: FONTS.small,
    fontFamily: 'monospace',
    color: COLORS.primary,
  },
});

export default SalesforceConfigScreen;

