import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  SafeAreaView,
  TextInput,
  ActivityIndicator,
  Linking
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { COLORS, FONTS, SPACING, BORDER_RADIUS, CARD_STYLES } from '../styles/theme';
import * as sharepointService from '../services/sharepointService';

interface SharePointConfigForm {
  name: string;
  tenantId: string;
  clientId: string;
  clientSecret: string;
  siteUrl: string;
  libraryName: string;
  redirectUri: string;
}

const SharePointConfigScreen: React.FC = () => {
  const navigation = useNavigation();
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const [connectionId, setConnectionId] = useState<string | null>(null);
  
  const [config, setConfig] = useState<SharePointConfigForm>({
    name: 'SharePoint Online',
    tenantId: '',
    clientId: '',
    clientSecret: '',
    siteUrl: '',
    libraryName: 'Documents',
    redirectUri: 'https://your-app.com/oauth/callback'
  });

  useEffect(() => {
    loadExistingConnection();
  }, []);

  const loadExistingConnection = async () => {
    try {
      setIsLoading(true);
      const connections = await sharepointService.getSharePointConnections();
      const existingConnection = connections.find(c => c.name === 'SharePoint Online');
      
      if (existingConnection && existingConnection.config) {
        setConnectionId(existingConnection.id);
        setConfig({
          name: existingConnection.name,
          tenantId: existingConnection.config.tenantId,
          clientId: existingConnection.config.clientId,
          clientSecret: existingConnection.config.clientSecret,
          siteUrl: existingConnection.config.siteUrl,
          libraryName: existingConnection.config.libraryName,
          redirectUri: existingConnection.config.redirectUri
        });
      }
    } catch (error) {
      console.error('Error loading existing connection:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSaveConfiguration = async () => {
    try {
      // Validate required fields
      if (!config.tenantId || !config.clientId || !config.clientSecret || !config.siteUrl) {
        Alert.alert('Validation Error', 'Please fill in all required fields.');
        return;
      }

      setIsSaving(true);

      const connectionData: Partial<sharepointService.SharePointConnection> = {
        id: connectionId || undefined,
        name: config.name,
        status: 'disconnected',
        enabled: false,
        config: {
          tenantId: config.tenantId,
          clientId: config.clientId,
          clientSecret: config.clientSecret,
          siteUrl: config.siteUrl,
          libraryName: config.libraryName,
          redirectUri: config.redirectUri
        }
      };

      const savedConnectionId = await sharepointService.saveSharePointConnection(connectionData);
      setConnectionId(savedConnectionId);

      Alert.alert('Success', 'SharePoint configuration saved successfully!');
    } catch (error) {
      console.error('Error saving configuration:', error);
      Alert.alert('Error', 'Failed to save configuration. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleStartAuthentication = async () => {
    try {
      if (!connectionId) {
        Alert.alert('Error', 'Please save the configuration first.');
        return;
      }

      setIsAuthenticating(true);

      const authUrl = await sharepointService.startSharePointAuth(connectionId, {
        tenantId: config.tenantId,
        clientId: config.clientId,
        clientSecret: config.clientSecret,
        siteUrl: config.siteUrl,
        libraryName: config.libraryName,
        redirectUri: config.redirectUri
      });

      // Open authentication URL in browser
      const canOpen = await Linking.canOpenURL(authUrl);
      if (canOpen) {
        await Linking.openURL(authUrl);
        
        Alert.alert(
          'Authentication Started',
          'Please complete the authentication in your browser. After completing authentication, return to the app and tap "Complete Authentication".',
          [
            { text: 'OK', style: 'default' }
          ]
        );
      } else {
        Alert.alert('Error', 'Cannot open authentication URL');
      }
    } catch (error) {
      console.error('Error starting authentication:', error);
      Alert.alert('Error', 'Failed to start authentication process.');
    } finally {
      setIsAuthenticating(false);
    }
  };

  const handleCompleteAuthentication = () => {
    Alert.prompt(
      'Complete Authentication',
      'Please paste the authorization code from the browser:',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Complete',
          onPress: async (authCode) => {
            if (authCode && connectionId) {
              try {
                setIsAuthenticating(true);
                const success = await sharepointService.completeSharePointAuth(connectionId, authCode);
                
                if (success) {
                  Alert.alert('Success', 'SharePoint authentication completed successfully!');
                  navigation.goBack();
                } else {
                  Alert.alert('Error', 'Authentication failed. Please try again.');
                }
              } catch (error) {
                console.error('Error completing authentication:', error);
                Alert.alert('Error', 'Authentication failed. Please try again.');
              } finally {
                setIsAuthenticating(false);
              }
            }
          }
        }
      ],
      'plain-text'
    );
  };

  const handleTestConnection = async () => {
    if (!connectionId) {
      Alert.alert('Error', 'Please save and authenticate the connection first.');
      return;
    }

    try {
      setIsLoading(true);
      const success = await sharepointService.testSharePointConnection(connectionId);
      
      Alert.alert(
        success ? 'Success' : 'Error',
        success ? 'SharePoint connection test successful!' : 'Connection test failed. Please check your configuration.'
      );
    } catch (error) {
      console.error('Error testing connection:', error);
      Alert.alert('Error', 'Failed to test connection.');
    } finally {
      setIsLoading(false);
    }
  };

  const renderInputField = (
    label: string,
    value: string,
    onChangeText: (text: string) => void,
    placeholder: string,
    required: boolean = false,
    secure: boolean = false
  ) => (
    <View style={styles.inputContainer}>
      <Text style={styles.inputLabel}>
        {label} {required && <Text style={styles.required}>*</Text>}
      </Text>
      <TextInput
        style={styles.textInput}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={COLORS.textLight}
        secureTextEntry={secure}
        autoCapitalize="none"
        autoCorrect={false}
      />
    </View>
  );

  if (isLoading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={COLORS.primary} />
          <Text style={styles.loadingText}>Loading configuration...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={24} color={COLORS.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>SharePoint Configuration</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Connection Details</Text>
          <Text style={styles.sectionDescription}>
            Configure your SharePoint Online connection settings. You'll need to create an Azure AD app registration first.
          </Text>
        </View>

        {renderInputField(
          'Connection Name',
          config.name,
          (text) => setConfig(prev => ({ ...prev, name: text })),
          'Enter connection name',
          true
        )}

        {renderInputField(
          'Tenant ID',
          config.tenantId,
          (text) => setConfig(prev => ({ ...prev, tenantId: text })),
          'Enter your Azure AD tenant ID',
          true
        )}

        {renderInputField(
          'Client ID',
          config.clientId,
          (text) => setConfig(prev => ({ ...prev, clientId: text })),
          'Enter your app registration client ID',
          true
        )}

        {renderInputField(
          'Client Secret',
          config.clientSecret,
          (text) => setConfig(prev => ({ ...prev, clientSecret: text })),
          'Enter your app registration client secret',
          true,
          true
        )}

        {renderInputField(
          'Site URL',
          config.siteUrl,
          (text) => setConfig(prev => ({ ...prev, siteUrl: text })),
          'https://yourcompany.sharepoint.com/sites/yoursite',
          true
        )}

        {renderInputField(
          'Library Name',
          config.libraryName,
          (text) => setConfig(prev => ({ ...prev, libraryName: text })),
          'Documents'
        )}

        {renderInputField(
          'Redirect URI',
          config.redirectUri,
          (text) => setConfig(prev => ({ ...prev, redirectUri: text })),
          'https://your-app.com/oauth/callback',
          true
        )}

        <View style={styles.buttonContainer}>
          <TouchableOpacity
            style={[styles.button, styles.primaryButton]}
            onPress={handleSaveConfiguration}
            disabled={isSaving}
          >
            {isSaving ? (
              <ActivityIndicator size="small" color={COLORS.white} />
            ) : (
              <>
                <Ionicons name="save" size={20} color={COLORS.white} />
                <Text style={styles.buttonText}>Save Configuration</Text>
              </>
            )}
          </TouchableOpacity>

          {connectionId && (
            <>
              <TouchableOpacity
                style={[styles.button, styles.secondaryButton]}
                onPress={handleStartAuthentication}
                disabled={isAuthenticating}
              >
                {isAuthenticating ? (
                  <ActivityIndicator size="small" color={COLORS.primary} />
                ) : (
                  <>
                    <Ionicons name="log-in" size={20} color={COLORS.primary} />
                    <Text style={[styles.buttonText, { color: COLORS.primary }]}>Start Authentication</Text>
                  </>
                )}
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.button, styles.secondaryButton]}
                onPress={handleCompleteAuthentication}
                disabled={isAuthenticating}
              >
                <Ionicons name="checkmark-circle" size={20} color={COLORS.primary} />
                <Text style={[styles.buttonText, { color: COLORS.primary }]}>Complete Authentication</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.button, styles.outlineButton]}
                onPress={handleTestConnection}
                disabled={isLoading}
              >
                <Ionicons name="wifi" size={20} color={COLORS.text} />
                <Text style={[styles.buttonText, { color: COLORS.text }]}>Test Connection</Text>
              </TouchableOpacity>
            </>
          )}
        </View>

        <View style={styles.helpSection}>
          <Text style={styles.helpTitle}>Setup Instructions</Text>
          <Text style={styles.helpText}>
            1. Go to Azure Portal → Azure Active Directory → App registrations{'\n'}
            2. Create a new app registration{'\n'}
            3. Configure API permissions: Sites.ReadWrite.All, Files.ReadWrite.All{'\n'}
            4. Create a client secret{'\n'}
            5. Copy the Tenant ID, Client ID, and Client Secret here
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
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.medium,
    paddingVertical: SPACING.small,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  headerTitle: {
    fontSize: FONTS.large,
    fontWeight: FONTS.semiBold,
    color: COLORS.text,
  },
  content: {
    flex: 1,
    paddingHorizontal: SPACING.medium,
  },
  section: {
    marginVertical: SPACING.large,
  },
  sectionTitle: {
    fontSize: FONTS.large,
    fontWeight: FONTS.semiBold,
    color: COLORS.text,
    marginBottom: SPACING.tiny,
  },
  sectionDescription: {
    fontSize: FONTS.small,
    color: COLORS.textLight,
    lineHeight: 20,
  },
  inputContainer: {
    marginBottom: SPACING.medium,
  },
  inputLabel: {
    fontSize: FONTS.small,
    fontWeight: FONTS.mediumWeight,
    color: COLORS.text,
    marginBottom: SPACING.tiny,
  },
  required: {
    color: COLORS.error,
  },
  textInput: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: BORDER_RADIUS.medium,
    paddingHorizontal: SPACING.medium,
    paddingVertical: SPACING.small,
    fontSize: FONTS.medium,
    color: COLORS.text,
    backgroundColor: COLORS.white,
  },
  buttonContainer: {
    marginVertical: SPACING.large,
    gap: SPACING.small,
  },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: SPACING.medium,
    paddingHorizontal: SPACING.large,
    borderRadius: BORDER_RADIUS.medium,
    gap: SPACING.tiny,
  },
  primaryButton: {
    backgroundColor: COLORS.primary,
  },
  secondaryButton: {
    backgroundColor: COLORS.white,
    borderWidth: 1,
    borderColor: COLORS.primary,
  },
  outlineButton: {
    backgroundColor: COLORS.white,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  buttonText: {
    fontSize: FONTS.medium,
    fontWeight: FONTS.mediumWeight,
    color: COLORS.white,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: SPACING.small,
    fontSize: FONTS.medium,
    color: COLORS.textLight,
  },
  helpSection: {
    marginVertical: SPACING.large,
    padding: SPACING.medium,
    backgroundColor: COLORS.white,
    borderRadius: BORDER_RADIUS.medium,
    borderLeftWidth: 4,
    borderLeftColor: COLORS.primary,
  },
  helpTitle: {
    fontSize: FONTS.medium,
    fontWeight: FONTS.semiBold,
    color: COLORS.text,
    marginBottom: SPACING.small,
  },
  helpText: {
    fontSize: FONTS.small,
    color: COLORS.textLight,
    lineHeight: 20,
  },
});

export default SharePointConfigScreen;
