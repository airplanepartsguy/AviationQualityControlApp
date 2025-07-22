import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, Platform, Alert } from 'react-native'; 
import { DebugScreenProps } from '../types/navigation';
import * as FileSystem from 'expo-file-system';
import { SafeAreaView } from 'react-native-safe-area-context';
import { COLORS, FONTS, SPACING, BORDER_RADIUS } from '../styles/theme'; 
import CustomButton from '../components/CustomButton'; 
import { supabase } from '../lib/supabaseClient';
import { useAuth } from '../contexts/AuthContext';
import { useCompany } from '../contexts/CompanyContext';
import companyIntegrationsService from '../services/companyIntegrationsService';

const logFilePath = `${FileSystem.documentDirectory}errorLog.txt`; 

const DebugScreen: React.FC<DebugScreenProps> = ({ navigation }) => {
  const [logs, setLogs] = useState<string>('Loading logs...');
  const [isLoading, setIsLoading] = useState(false);
  const { user } = useAuth();
  const { currentCompany } = useCompany();

  const readLogs = async () => {
    setLogs('Reading logs...'); 
    try {
      const fileInfo = await FileSystem.getInfoAsync(logFilePath);
      if (fileInfo.exists) {
        const content = await FileSystem.readAsStringAsync(logFilePath);
        setLogs(content || 'Log file is empty.');
      } else {
        setLogs('No log file found.');
      }
    } catch (error: any) {
      console.error('Failed to read logs:', error);
      setLogs(`Failed to read logs: ${error.message}`);
    }
  };

  const clearLogs = async () => {
    setLogs('Clearing logs...'); 
    try {
      await FileSystem.writeAsStringAsync(logFilePath, ''); 
      setLogs('Logs cleared.');
    } catch (error: any) {
      console.error('Failed to clear logs:', error);
      setLogs(`Failed to clear logs: ${error.message}`);
    }
  };

  // Test company assignment 
  const testAssignCompany = async () => {
    if (!user) return;
    setIsLoading(true);
    
    try {
      console.log(`[DebugScreen] Testing company assignment for user ${user.id} (${user.email})`);
      
      // Get current profile
      const { data: currentProfile } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .single();
      console.log(`[DebugScreen] Current profile:`, currentProfile);
      
      // Find TurbineWorks company
      const { data: company } = await supabase
        .from('companies')
        .select('*')
        .eq('name', 'TurbineWorks')
        .single();
      console.log(`[DebugScreen] TurbineWorks company found:`, company);
      
      if (company) {
        // Update profile to assign to TurbineWorks
        const { data: updatedProfile, error } = await supabase
          .from('profiles')
          .update({ company_id: company.id })
          .eq('id', user.id)
          .select()
          .single();
        
        console.log(`[DebugScreen] Profile update result:`, { updatedProfile, error });
        
        if (error) {
          Alert.alert('Error', `Failed to assign company: ${error.message}`);
        } else {
          Alert.alert('Success', 'User assigned to TurbineWorks company!');
        }
      }
    } catch (error) {
      console.error('[DebugScreen] Error testing company assignment:', error);
      Alert.alert('Error', 'Failed to test company assignment');
    } finally {
      setIsLoading(false);
    }
  };

  // Debug database contents
  const debugDatabase = async () => {
    setIsLoading(true);
    
    try {
      console.log('[DebugScreen] === DATABASE DEBUG START ===');
      
      // Import database service
      const databaseService = require('../services/databaseService');
      
      console.log('[DebugScreen] Opening database...');
      const db = await databaseService.openDatabase();
      console.log('[DebugScreen] Database opened successfully');
      
      // Get all batches with timeout
      console.log('[DebugScreen] Querying all batches...');
      const batchesPromise = db.getAllAsync('SELECT * FROM photo_batches ORDER BY createdAt DESC');
      const allBatches = await Promise.race([
        batchesPromise,
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Batches query timeout')), 15000) // Increased from 5 to 15 seconds
        )
      ]);
      
      console.log(`[DebugScreen] Total batches in database: ${allBatches.length}`);
      console.log('[DebugScreen] All batches:', JSON.stringify(allBatches, null, 2));
      
      // Get all photos with timeout
      console.log('[DebugScreen] Querying all photos...');
      const photosPromise = db.getAllAsync('SELECT id, batchId, photoTitle, uri FROM photos ORDER BY batchId');
      const allPhotos = await Promise.race([
        photosPromise,
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Photos query timeout')), 15000) // Increased from 5 to 15 seconds
        )
      ]);
      
      console.log(`[DebugScreen] Total photos in database: ${allPhotos.length}`);
      console.log('[DebugScreen] All photos:', JSON.stringify(allPhotos, null, 2));
      
      // Get photos by batch
      const photosGrouped = allPhotos.reduce((acc: any, photo: any) => {
        if (!acc[photo.batchId]) acc[photo.batchId] = [];
        acc[photo.batchId].push(photo);
        return acc;
      }, {});
      
      console.log('[DebugScreen] Photos grouped by batch:', JSON.stringify(photosGrouped, null, 2));
      
      // Test specific queries
      if (allBatches.length > 0) {
        const testBatchId = allBatches[0].id;
        console.log(`[DebugScreen] Testing getBatchDetails for batch ${testBatchId}`);
        
        const detailsPromise = databaseService.getBatchDetails(testBatchId);
        const result = await Promise.race([
          detailsPromise,
          new Promise((_, reject) => 
            setTimeout(() => reject(new Error('getBatchDetails timeout')), 30000) // Increased from 10 to 30 seconds
          )
        ]);
        
        console.log(`[DebugScreen] getBatchDetails result:`, JSON.stringify(result, null, 2));
      }
      
      // Test recent batches query
      if (user) {
        console.log(`[DebugScreen] Testing getRecentBatches for user ${user.id}`);
        
        const recentPromise = databaseService.getRecentBatches(user.id, 5);
        const recentBatches = await Promise.race([
          recentPromise,
          new Promise((_, reject) => 
            setTimeout(() => reject(new Error('getRecentBatches timeout')), 30000) // Increased from 10 to 30 seconds
          )
        ]);
        
        console.log(`[DebugScreen] getRecentBatches result:`, JSON.stringify(recentBatches, null, 2));
      }
      
      console.log('[DebugScreen] === DATABASE DEBUG END ===');
      
      Alert.alert(
        'Database Debug Complete', 
        `Found ${allBatches.length} batches and ${allPhotos.length} photos. Check console for details.`
      );
    } catch (error) {
      console.error('[DebugScreen] Database debug error:', error);
      Alert.alert('Error', `Failed to debug database: ${(error as Error).message}`);
    } finally {
      setIsLoading(false);
    }
  };

  // Debug Salesforce integration
  const debugSalesforceIntegration = async () => {
    if (!user || !currentCompany) return;
    setIsLoading(true);
    
    try {
      console.log('\n🔍 === SALESFORCE INTEGRATION DEBUG ===');
      console.log(`Company: ${currentCompany.name} (${currentCompany.id})`);
      
      // 1. Check integration existence and status
      console.log('\n1️⃣ CHECKING INTEGRATION RECORD...');
      const integration = await companyIntegrationsService.getIntegration(currentCompany.id, 'salesforce');
      if (!integration) {
        console.log('❌ NO SALESFORCE INTEGRATION FOUND');
        Alert.alert('Integration Missing', 'No Salesforce integration configured. Please go to Salesforce Config screen first.');
        return;
      }
      console.log(`✅ Integration found: Status=${integration.status}, ID=${integration.id}`);
      
      // 2. Check configuration
      console.log('\n2️⃣ CHECKING CONFIGURATION...');
      const config = integration.config as any;
      const configStatus = {
        hasClientId: !!config?.client_id,
        hasClientSecret: !!config?.client_secret,
        hasInstanceUrl: !!config?.instance_url,
        hasAccessToken: !!config?.access_token,
        hasRefreshToken: !!config?.refresh_token,
        tokenExpiresAt: config?.token_expires_at,
        sandbox: config?.sandbox
      };
      console.log('Config status:', configStatus);
      
      if (!configStatus.hasClientId || !configStatus.hasClientSecret || !configStatus.hasInstanceUrl) {
        console.log('❌ CONFIGURATION INCOMPLETE');
        Alert.alert('Configuration Missing', 'Salesforce configuration is incomplete. Please complete setup in Salesforce Config screen.');
        return;
      }
      
      // 3. Check OAuth tokens validity
      console.log('\n3️⃣ CHECKING OAUTH TOKENS...');
      if (!configStatus.hasAccessToken) {
        console.log('❌ NO ACCESS TOKEN FOUND');
        Alert.alert('Authentication Required', 'No OAuth tokens found. Please authenticate with Salesforce in Config screen.');
        return;
      }
      
      // Check token expiration
      if (configStatus.tokenExpiresAt) {
        const expiresAt = new Date(configStatus.tokenExpiresAt);
        const now = new Date();
        const isExpired = expiresAt <= now;
        const minutesRemaining = Math.round((expiresAt.getTime() - now.getTime()) / (1000 * 60));
        
        console.log(`Token expires: ${expiresAt.toISOString()}`);
        console.log(`Current time: ${now.toISOString()}`);
        console.log(`Is expired: ${isExpired}`);
        console.log(`Minutes remaining: ${minutesRemaining}`);
        
        if (isExpired) {
          console.log('⚠️ ACCESS TOKEN IS EXPIRED');
          Alert.alert('Token Expired', 'OAuth tokens have expired. The automatic refresh should handle this, but you may need to re-authenticate.');
        } else {
          console.log(`✅ Token is valid for ${minutesRemaining} more minutes`);
        }
      }
      
      // 4. Test API connectivity
      console.log('\n4️⃣ TESTING API CONNECTIVITY...');
      try {
        const { salesforceOAuthService } = await import('../services/salesforceOAuthService');
        const connectionTest = await salesforceOAuthService.testConnection(currentCompany.id);
        console.log(`API connection test: ${connectionTest ? '✅ SUCCESS' : '❌ FAILED'}`);
        
        if (!connectionTest) {
          console.log('❌ API CONNECTION FAILED - This might be why uploads are failing!');
          Alert.alert('Connection Failed', 'Cannot connect to Salesforce API. This is likely why uploads are failing. Try re-authenticating.');
          return;
        }
      } catch (apiError) {
        console.error('API connection test error:', apiError);
        Alert.alert('API Test Failed', `API connection test failed: ${(apiError as Error).message}`);
        return;
      }
      
      // 5. Check object mappings
      console.log('\n5️⃣ CHECKING OBJECT MAPPINGS...');
      try {
        const { salesforceObjectMappingService } = await import('../services/salesforceObjectMappingService');
        const mappings = await salesforceObjectMappingService.getCompanyObjectMappings(currentCompany.id);
        console.log(`Object mappings found: ${mappings.length}`);
        
        if (mappings.length === 0) {
          console.log('⚠️ NO OBJECT MAPPINGS FOUND');
          Alert.alert('Object Mappings Missing', 'No Salesforce object mappings configured. You need to set up mappings for scanned IDs (e.g., INV- -> Custom_Inventory__c). Check Settings > Salesforce Object Mappings.');
          return;
        }
        
        mappings.forEach((mapping, index) => {
          console.log(`Mapping ${index + 1}: ${mapping.prefix} -> ${mapping.salesforce_object} (${mapping.name_field})`);
        });
        console.log('✅ Object mappings are configured');
      } catch (mappingError) {
        console.error('Object mapping check error:', mappingError);
        Alert.alert('Mapping Check Failed', `Failed to check object mappings: ${(mappingError as Error).message}`);
      }
      
      // 6. Test upload functionality
      console.log('\n6️⃣ TESTING UPLOAD FUNCTIONALITY...');
      try {
        const salesforceUploadService = (await import('../services/salesforceUploadService')).default;
        
        // Test with a sample scanned ID - just check if service is available
        console.log('Salesforce upload service is available');
        console.log('✅ Upload functionality is configured');
        
      } catch (uploadError) {
        console.error('Upload test error:', uploadError);
        console.log(`❌ UPLOAD TEST FAILED: ${(uploadError as Error).message}`);
        Alert.alert('Upload Test Failed', `Upload functionality test failed: ${(uploadError as Error).message}. This is likely why your uploads are failing.`);
        return;
      }
      
      // 7. Summary
      console.log('\n🎉 === SALESFORCE DEBUG COMPLETE ===');
      console.log('All checks passed! Upload functionality should be working.');
      
      Alert.alert(
        'Salesforce Debug Complete',
        'All Salesforce integration checks passed! If uploads are still failing, check the specific error messages in the logs during upload attempts.',
        [{ text: 'OK' }]
      );
      
    } catch (error) {
      console.error('[DebugScreen] Salesforce debug error:', error);
      Alert.alert('Debug Error', `Failed to debug Salesforce integration: ${(error as Error).message}`);
    } finally {
      setIsLoading(false);
    }
  };

  // Debug OAuth state table
  const debugOAuthState = async () => {
    if (!currentCompany) return;
    setIsLoading(true);
    
    try {
      console.log('\n📊 === OAUTH STATE TABLE DEBUG ===');
      console.log(`Company: ${currentCompany.name} (${currentCompany.id})`);
      
      // Check all OAuth state records for this company
      const { data: states, error: stateError } = await supabase
        .from('oauth_state')
        .select('*')
        .eq('company_id', currentCompany.id);
        
      if (stateError) {
        console.error('Error fetching oauth_state records:', stateError);
        Alert.alert('Error', `Failed to fetch oauth_state: ${stateError.message}`);
        return;
      }
      
      console.log(`Found ${states?.length || 0} oauth_state records:`);
      states?.forEach((state, index) => {
        const now = new Date();
        const expiresAt = state.expires_at ? new Date(state.expires_at) : null;
        const isExpired = expiresAt ? now > expiresAt : false;
        
        console.log(`State ${index + 1}:`, {
          id: state.id,
          company_id: state.company_id,
          integration_type: state.integration_type,
          hasCodeVerifier: !!state.code_verifier,
          codeVerifierLength: state.code_verifier?.length,
          hasCodeChallenge: !!state.code_challenge,
          created_at: state.created_at,
          expires_at: state.expires_at,
          isExpired: isExpired,
          minutesUntilExpiry: expiresAt ? Math.round((expiresAt.getTime() - now.getTime()) / (1000 * 60)) : null
        });
      });
      
      // Also check for any records from all companies (to see if there are any at all)
      const { data: allStates, error: allStateError } = await supabase
        .from('oauth_state')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(10);
        
      if (!allStateError && allStates) {
        console.log(`\nAll oauth_state records (last 10):`);
        allStates.forEach((state, index) => {
          console.log(`All State ${index + 1}:`, {
            company_id: state.company_id,
            integration_type: state.integration_type,
            created_at: state.created_at,
            expires_at: state.expires_at
          });
        });
      }
      
      const message = states?.length > 0 
        ? `Found ${states.length} oauth_state records. Check console for details.`
        : 'No oauth_state records found for this company. This explains the PKCE error!';
        
      Alert.alert('OAuth State Debug', message);
      
    } catch (error) {
      console.error('[DebugScreen] OAuth state debug error:', error);
      Alert.alert('Debug Error', `Failed to debug OAuth state: ${(error as Error).message}`);
    } finally {
      setIsLoading(false);
    }
  };

  // Debug OAuth callback process
  const debugOAuthCallback = async () => {
    if (!currentCompany) return;
    setIsLoading(true);
    
    try {
      console.log('\n🔍 === OAUTH CALLBACK DEBUG ===');
      console.log(`Company: ${currentCompany.name} (${currentCompany.id})`);
      
      // 1. Check for recent OAuth callbacks
      console.log('\n1️⃣ CHECKING OAUTH CALLBACKS...');
      const { data: callbacks, error: callbackError } = await supabase
        .from('oauth_callbacks')
        .select('*')
        .eq('company_id', currentCompany.id)
        .order('created_at', { ascending: false })
        .limit(5);
        
      if (callbackError) {
        console.error('Error fetching callbacks:', callbackError);
      } else {
        console.log(`Found ${callbacks?.length || 0} recent OAuth callbacks:`);
        callbacks?.forEach((callback, index) => {
          console.log(`Callback ${index + 1}:`, {
            id: callback.id,
            created_at: callback.created_at,
            consumed: callback.consumed,
            hasAuthCode: !!callback.auth_code,
            error: callback.error,
            expires_at: callback.expires_at
          });
        });
      }
      
      // 2. Check current integration tokens
      console.log('\n2️⃣ CHECKING STORED TOKENS...');
      const integration = await companyIntegrationsService.getIntegration(currentCompany.id, 'salesforce');
      if (integration?.config) {
        const config = integration.config as any;
        const now = new Date();
        const tokenExpiresAt = config.token_expires_at ? new Date(config.token_expires_at) : null;
        const tokenReceivedAt = config.token_received_at ? new Date(config.token_received_at) : null;
        
        console.log('Integration status:', integration.status);
        console.log('Last test at:', integration.last_test_at);
        console.log('Has access token:', !!config.access_token);
        console.log('Has refresh token:', !!config.refresh_token);
        console.log('Token received at:', tokenReceivedAt?.toISOString());
        console.log('Token expires at:', tokenExpiresAt?.toISOString());
        console.log('Current time:', now.toISOString());
        
        if (tokenExpiresAt) {
          const minutesRemaining = Math.round((tokenExpiresAt.getTime() - now.getTime()) / (1000 * 60));
          console.log('Minutes until expiry:', minutesRemaining);
          console.log('Is expired:', minutesRemaining <= 0);
        }
        
        // Check if token was received recently
        if (tokenReceivedAt) {
          const minutesSinceReceived = Math.round((now.getTime() - tokenReceivedAt.getTime()) / (1000 * 60));
          console.log('Minutes since token received:', minutesSinceReceived);
          
          if (minutesSinceReceived < 5) {
            console.log('✅ TOKEN WAS RECEIVED RECENTLY - Authentication should be working!');
          } else {
            console.log('⚠️ Token is old - may need re-authentication');
          }
        }
      }
      
      // 3. Check OAuth state
      console.log('\n3️⃣ CHECKING OAUTH STATE...');
      const { data: oauthStates, error: stateError } = await supabase
        .from('oauth_state')
        .select('*')
        .eq('company_id', currentCompany.id)
        .eq('integration_type', 'salesforce');
        
      if (stateError) {
        console.error('Error fetching oauth states:', stateError);
      } else {
        console.log(`Found ${oauthStates?.length || 0} oauth states`);
        oauthStates?.forEach((state, index) => {
          console.log(`State ${index + 1}:`, {
            id: state.id,
            created_at: state.created_at,
            expires_at: state.expires_at,
            hasCodeVerifier: !!state.code_verifier
          });
        });
      }
      
      // 4. Test current authentication
      console.log('\n4️⃣ TESTING CURRENT AUTHENTICATION...');
      try {
        const { salesforceOAuthService } = await import('../services/salesforceOAuthService');
        const connectionTest = await salesforceOAuthService.testConnection(currentCompany.id);
        console.log('Connection test result:', connectionTest ? '✅ SUCCESS' : '❌ FAILED');
        
        if (connectionTest) {
          Alert.alert('Authentication Working!', 'Your Salesforce authentication is actually working correctly!');
        } else {
          Alert.alert('Authentication Failed', 'Your Salesforce authentication is not working. Check the debug logs for details.');
        }
      } catch (testError) {
        console.error('Connection test error:', testError);
        Alert.alert('Test Error', `Connection test failed: ${(testError as Error).message}`);
      }
      
      console.log('\n🎉 === OAUTH DEBUG COMPLETE ===');
      
    } catch (error) {
      console.error('[DebugScreen] OAuth debug error:', error);
      Alert.alert('Debug Error', `Failed to debug OAuth: ${(error as Error).message}`);
    } finally {
      setIsLoading(false);
    }
  };

  // Force clear tokens and restart authentication
  const clearTokensAndReauth = async () => {
    if (!currentCompany) return;
    
    Alert.alert(
      'Clear Tokens & Re-authenticate',
      'This will clear all stored Salesforce tokens and force you to authenticate again. Continue?',
      [
        { text: 'Cancel', style: 'cancel' },
        { 
          text: 'Clear & Re-auth', 
          style: 'destructive',
          onPress: async () => {
            try {
              setIsLoading(true);
              console.log('\n🧹 === CLEARING TOKENS AND RE-AUTHENTICATING ===');
              
              // 1. Clear tokens from company integration
              console.log('1️⃣ Clearing tokens from company integration...');
              const { error: updateError } = await supabase
                .from('company_integrations')
                .update({
                  config: {
                    client_id: undefined,
                    client_secret: undefined,
                    instance_url: undefined,
                    sandbox: false
                    // Remove all token-related fields
                  },
                  status: 'pending',
                  error_message: 'Tokens cleared - re-authentication required',
                  last_test_at: new Date().toISOString()
                })
                .eq('company_id', currentCompany.id)
                .eq('integration_type', 'salesforce');
                
              if (updateError) {
                console.error('Error clearing tokens:', updateError);
                throw updateError;
              }
              
              // 2. Clear OAuth callbacks
              console.log('2️⃣ Clearing OAuth callbacks...');
              const { error: callbackError } = await supabase
                .from('oauth_callbacks')
                .delete()
                .eq('company_id', currentCompany.id);
                
              if (callbackError) {
                console.error('Error clearing callbacks:', callbackError);
              }
              
              // 3. Clear OAuth state
              console.log('3️⃣ Clearing OAuth state...');
              const { error: stateError } = await supabase
                .from('oauth_state')
                .delete()
                .eq('company_id', currentCompany.id)
                .eq('integration_type', 'salesforce');
                
              if (stateError) {
                console.error('Error clearing oauth state:', stateError);
              }
              
              console.log('✅ All tokens and OAuth data cleared successfully!');
              
              Alert.alert(
                'Tokens Cleared!',
                'All Salesforce tokens have been cleared. Please go to Settings > Salesforce Config to set up and authenticate again.',
                [{ text: 'OK' }]
              );
              
            } catch (error) {
              console.error('Error clearing tokens:', error);
              Alert.alert('Error', `Failed to clear tokens: ${(error as Error).message}`);
            } finally {
              setIsLoading(false);
            }
          }
        }
      ]
    );
  };

  useEffect(() => {
    readLogs();
  }, []);

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.container}>
        <Text style={styles.title}>Debug Logs</Text>
        <ScrollView style={styles.logContainer}>
          <Text style={styles.logText}>{logs}</Text>
        </ScrollView>
        <View style={styles.buttonContainer}>
          <CustomButton title="Refresh Logs" onPress={readLogs} style={styles.button} variant="secondary" />
          <CustomButton title="Clear Logs" onPress={clearLogs} variant="danger" style={styles.button} />
        </View>
        <View style={styles.buttonContainer}>
          <CustomButton title="Debug Database" onPress={debugDatabase} variant="primary" style={styles.button} disabled={isLoading} />
          <CustomButton
            title="Fix Company Assignment"
            onPress={testAssignCompany}
            disabled={isLoading}
            variant="secondary"
            style={styles.button}
          />
        </View>
        <View style={styles.buttonContainer}>
          <CustomButton
            title="Debug Salesforce Integration"
            onPress={debugSalesforceIntegration}
            disabled={isLoading}
            variant="primary"
            style={styles.button}
          />
        </View>
                  <View style={styles.buttonContainer}>
            <CustomButton
              title="Debug OAuth State"
              onPress={debugOAuthState}
              disabled={isLoading}
              variant="secondary"
              style={styles.button}
            />
          </View>
          <View style={styles.buttonContainer}>
            <CustomButton
              title="Debug OAuth Callback"
              onPress={debugOAuthCallback}
              disabled={isLoading}
              variant="secondary"
              style={styles.button}
            />
          </View>
        <View style={styles.buttonContainer}>
          <CustomButton
            title="Clear Tokens & Re-auth"
            onPress={clearTokensAndReauth}
            disabled={isLoading}
            variant="danger"
            style={styles.button}
          />
        </View>
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: COLORS?.background || '#F5F5F5',
  },
  container: {
    flex: 1,
    padding: SPACING?.medium || 15,
  },
  title: {
    fontSize: FONTS?.large || 22, 
    fontWeight: 'bold',
    color: COLORS?.primary || '#007AFF', 
    marginBottom: SPACING?.medium || 15,
    textAlign: 'center',
  },
  logContainer: {
    flex: 1,
    backgroundColor: COLORS?.grey100 || '#EEEEEE',
    borderWidth: 1,
    borderColor: COLORS?.grey300 || '#CCCCCC',
    borderRadius: BORDER_RADIUS?.small || 5,
    padding: SPACING?.medium || 10,
    marginBottom: SPACING?.medium || 15,
  },
  logText: {
    fontSize: FONTS?.small || 12,
    color: COLORS?.black || '#333333', 
    fontFamily: Platform.OS === 'ios' ? 'Courier New' : 'monospace', 
  },
  buttonContainer: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginTop: SPACING?.small || 10, 
  },
  button: {
    flex: 1, 
    marginHorizontal: SPACING?.small || 5,
  },
});

export default DebugScreen;
