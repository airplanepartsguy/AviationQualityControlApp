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
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string>('Ready to configure');

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
        
        const isActive = salesforceIntegration.status === 'active';
        setIsAuthenticated(isActive);
        setStatusMessage(isActive ? 'Connected and authenticated' : 'Configuration found but not authenticated');
        setConnectionStatus(isActive ? 'success' : 'idle');
      } else {
        setStatusMessage('No configuration found');
      }
    } catch (error) {
      console.error('[SalesforceConfig] Error loading configuration:', error);
      setStatusMessage('Error loading configuration');
    } finally {
      setLoading(false);
    }
  };

  const validateConfiguration = (): string | null => {
    if (!config.client_id.trim()) return 'Client ID is required';
    if (!config.client_secret.trim()) return 'Client Secret is required';
    if (config.client_id.length < 20) return 'Client ID appears to be invalid (too short)';
    if (config.client_secret.length < 20) return 'Client Secret appears to be invalid (too short)';
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
      
      // First, save the configuration temporarily to test it
      await companyIntegrationsService.configureSalesforce(currentCompany.id, config, user.id);
      
      // Then test the connection
      const result = await companyIntegrationsService.testSalesforceConnection(currentCompany.id);
      
      if (result.success) {
        setConnectionStatus('success');
        setStatusMessage('Connection successful! Ready to authenticate.');
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

    if (!currentCompany?.id) {
      Alert.alert('Error', 'Company information is missing');
      return;
    }

    try {
      setStatusMessage('Starting Salesforce authentication...');
      
      const result = await salesforceOAuthService.initiateOAuthFlow(currentCompany.id, {
        clientId: config.client_id,
        clientSecret: config.client_secret,
        instanceUrl: config.instance_url,
        sandbox: config.sandbox,
        redirectUri: ''
      });
      
      if (result.authUrl) {
        const supported = await Linking.canOpenURL(result.authUrl);
        if (supported) {
          await Linking.openURL(result.authUrl);
          
          Alert.alert(
            'Authentication Started',
            'Please complete the authentication in your browser. You will be redirected back to the app when complete.',
            [
              {
                text: 'I completed authentication',
                onPress: checkAuthenticationStatus
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
        Alert.alert('Error', 'Failed to start authentication');
      }
    } catch (error) {
      console.error('[SalesforceConfig] Authentication error:', error);
      Alert.alert('Error', `Authentication failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  };

  const checkAuthenticationStatus = async () => {
    try {
      if (currentCompany?.id) {
        const tokens = await salesforceOAuthService.getStoredTokens(currentCompany.id);
        if (tokens?.access_token) {
          setIsAuthenticated(true);
          setStatusMessage('Successfully authenticated with Salesforce');
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

      await companyIntegrationsService.configureSalesforce(currentCompany.id, config, user.id);

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
      'This will clear all Salesforce settings. Are you sure?',
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
                batch_name: 'Name',
                batch_type: 'Type__c',
                photo_url: 'Photo_URL__c'
              },
              prefix_mappings: {}
            });
            setConnectionStatus('idle');
            setIsAuthenticated(false);
            setStatusMessage('Configuration reset');
          }
        }
      ]
    );
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
      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        
        {/* Header */}
        <View style={styles.header}>
          <Ionicons name="cloud-outline" size={48} color={COLORS.primary} />
          <Text style={styles.title}>Salesforce Integration</Text>
          <Text style={styles.subtitle}>
            Connect with Salesforce to sync your quality control data
          </Text>
        </View>

        {/* Status */}
        <View style={styles.statusCard}>
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
          <Text style={styles.statusMessage}>{statusMessage}</Text>
        </View>

        {/* Configuration */}
        <View style={styles.configSection}>
          <Text style={styles.sectionTitle}>Configuration</Text>
          
          {/* Environment Toggle */}
          <View style={styles.environmentToggle}>
            <Text style={styles.environmentLabel}>Environment</Text>
            <View style={styles.switchContainer}>
              <Text style={styles.switchLabel}>Production</Text>
              <Switch
                value={config.sandbox}
                onValueChange={(value) => setConfig(prev => ({ ...prev, sandbox: value }))}
                trackColor={{ false: COLORS.primary, true: COLORS.warning }}
                thumbColor={COLORS.white}
              />
              <Text style={styles.switchLabel}>Sandbox</Text>
            </View>
          </View>

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
            <Text style={styles.instanceUrl}>
              Instance: {config.instance_url}
            </Text>
          )}
        </View>

        {/* Actions */}
        <View style={styles.actionSection}>
          <CustomButton
            title={connectionStatus === 'testing' ? 'Testing...' : 'Test Connection'}
            onPress={testConnection}
            disabled={connectionStatus === 'testing' || !config.client_id || !config.client_secret}
            style={styles.button}
            variant="secondary"
          />

          {connectionStatus === 'success' && !isAuthenticated && (
            <CustomButton
              title="Authenticate with Salesforce"
              onPress={authenticateWithSalesforce}
              style={styles.button}
              variant="primary"
            />
          )}

          {isAuthenticated && (
            <CustomButton
              title={saving ? 'Saving...' : 'Save Configuration'}
              onPress={saveConfiguration}
              disabled={saving}
              style={styles.button}
              variant="primary"
            />
          )}

          <TouchableOpacity onPress={resetConfiguration} style={styles.resetButton}>
            <Text style={styles.resetButtonText}>Reset Configuration</Text>
          </TouchableOpacity>
        </View>

        {/* Instructions */}
        <View style={styles.instructionsSection}>
          <Text style={styles.sectionTitle}>Setup Instructions</Text>
          <Text style={styles.instructionText}>
            1. Create a Connected App in Salesforce Setup{'\n'}
            2. Enable OAuth settings and configure callback URL{'\n'}
            3. Copy the Consumer Key and Consumer Secret{'\n'}
            4. Test the connection before authenticating
          </Text>
          
          <View style={styles.callbackContainer}>
            <Text style={styles.callbackLabel}>Callback URL:</Text>
            <Text style={styles.callbackUrl}>
              https://luwlvmcixwdtuaffamgk.supabase.co/functions/v1/salesforce-oauth-callback
            </Text>
          </View>
        </View>

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
    marginBottom: SPACING.lg,
    ...CARD_STYLES.elevated,
  },
  title: {
    fontSize: FONTS.xxLarge,
    fontWeight: FONTS.bold,
    color: COLORS.text,
    marginTop: SPACING.md,
    marginBottom: SPACING.sm,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: FONTS.regular,
    color: COLORS.textSecondary,
    textAlign: 'center',
    lineHeight: 22,
  },
  statusCard: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: SPACING.lg,
    ...CARD_STYLES.elevated,
  },
  statusMessage: {
    fontSize: FONTS.regular,
    color: COLORS.text,
    marginLeft: SPACING.md,
    flex: 1,
  },
  configSection: {
    marginBottom: SPACING.lg,
    ...CARD_STYLES.elevated,
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
    color: COLORS.text,
    marginHorizontal: SPACING.md,
  },
  input: {
    marginBottom: SPACING.md,
  },
  instanceUrl: {
    fontSize: FONTS.small,
    color: COLORS.info,
    textAlign: 'center',
    marginTop: SPACING.md,
    fontStyle: 'italic',
  },
  actionSection: {
    marginBottom: SPACING.lg,
    ...CARD_STYLES.elevated,
  },
  button: {
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
    ...CARD_STYLES.elevated,
  },
  instructionText: {
    fontSize: FONTS.regular,
    color: COLORS.textSecondary,
    lineHeight: 22,
    marginBottom: SPACING.lg,
  },
  callbackContainer: {
    backgroundColor: COLORS.grey50,
    padding: SPACING.md,
    borderRadius: BORDER_RADIUS.md,
    borderLeftWidth: 4,
    borderLeftColor: COLORS.primary,
  },
  callbackLabel: {
    fontSize: FONTS.small,
    fontWeight: FONTS.bold,
    color: COLORS.text,
    marginBottom: SPACING.xs,
  },
  callbackUrl: {
    fontSize: FONTS.small,
    color: COLORS.primary,
    fontFamily: 'monospace',
  },
});

export default SalesforceConfigScreen;

