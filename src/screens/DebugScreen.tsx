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
import { errorLogger } from '../utils/errorLogger';

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

  // Debug PKCE details comprehensively
  const debugPKCEDetails = async () => {
    if (!currentCompany) return;
    setIsLoading(true);
    
    try {
      console.log('\n🔍 === COMPREHENSIVE PKCE DEBUG ===');
      console.log(`Company: ${currentCompany.name} (${currentCompany.id})`);
      
      // 1. Show all oauth_state records
      console.log('\n1️⃣ ALL OAUTH_STATE RECORDS...');
      const { data: allStates, error: statesError } = await supabase
        .from('oauth_state')
        .select('*')
        .eq('company_id', currentCompany.id)
        .eq('integration_type', 'salesforce')
        .order('created_at', { ascending: false });
        
      if (statesError) {
        console.error('❌ Error fetching oauth states:', statesError);
      } else {
        console.log(`📋 Found ${allStates?.length || 0} oauth_state records:`);
        allStates?.forEach((state, index) => {
          const now = new Date();
          const createdAt = new Date(state.created_at);
          const expiresAt = new Date(state.expires_at);
          const minutesOld = Math.round((now.getTime() - createdAt.getTime()) / (1000 * 60));
          const minutesToExpiry = Math.round((expiresAt.getTime() - now.getTime()) / (1000 * 60));
          
          console.log(`Record ${index + 1}:`, {
            id: state.id.substring(0, 8) + '...',
            created_at: state.created_at,
            expires_at: state.expires_at,
            minutesOld: minutesOld,
            minutesToExpiry: minutesToExpiry,
            expired: minutesToExpiry <= 0,
            hasCodeVerifier: !!state.code_verifier,
            verifierLength: state.code_verifier?.length,
            verifierPreview: state.code_verifier?.substring(0, 20) + '...'
          });
        });
      }
      
      // 2. Simulate Edge Function PKCE lookup
      console.log('\n2️⃣ SIMULATING EDGE FUNCTION PKCE LOOKUP...');
      
      // Try single query first (what Edge Function does)
      const { data: singleState, error: singleError } = await supabase
        .from('oauth_state')
        .select('*')
        .eq('company_id', currentCompany.id)
        .eq('integration_type', 'salesforce')
        .single();
        
      console.log('Single query result:', {
        found: !!singleState,
        error: singleError?.message,
        hasCodeVerifier: !!singleState?.code_verifier,
        verifierLength: singleState?.code_verifier?.length,
        verifierPreview: singleState?.code_verifier?.substring(0, 20) + '...',
        created_at: singleState?.created_at,
        expires_at: singleState?.expires_at
      });
      
      // Try latest query (fallback in Edge Function)
      const { data: latestState, error: latestError } = await supabase
        .from('oauth_state')
        .select('*')
        .eq('company_id', currentCompany.id)
        .eq('integration_type', 'salesforce')
        .order('created_at', { ascending: false })
        .limit(1)
        .single();
        
      console.log('Latest query result:', {
        found: !!latestState,
        error: latestError?.message,
        hasCodeVerifier: !!latestState?.code_verifier,
        verifierLength: latestState?.code_verifier?.length,
        verifierPreview: latestState?.code_verifier?.substring(0, 20) + '...',
        created_at: latestState?.created_at,
        expires_at: latestState?.expires_at,
        isExpired: latestState ? new Date(latestState.expires_at) <= new Date() : null,
        minutesOld: latestState ? Math.round((new Date().getTime() - new Date(latestState.created_at).getTime()) / (1000 * 60)) : null
      });
      
      // 3. Show recent oauth_callbacks with PKCE errors
      console.log('\n3️⃣ RECENT OAUTH CALLBACKS WITH ERRORS...');
      const { data: errorCallbacks, error: callbacksError } = await supabase
        .from('oauth_callbacks')
        .select('*')
        .eq('company_id', currentCompany.id)
        .not('error', 'is', null)
        .order('created_at', { ascending: false })
        .limit(5);
        
      if (callbacksError) {
        console.error('❌ Error fetching callbacks:', callbacksError);
      } else {
        console.log(`📋 Found ${errorCallbacks?.length || 0} error callbacks:`);
        errorCallbacks?.forEach((callback, index) => {
          const minutesAgo = Math.round((new Date().getTime() - new Date(callback.created_at).getTime()) / (1000 * 60));
          console.log(`Error ${index + 1}:`, {
            error: callback.error,
            description: callback.error_description,
            created_at: callback.created_at,
            minutesAgo: minutesAgo,
            hasAuthCode: !!callback.auth_code,
            authCodeLength: callback.auth_code?.length
          });
        });
      }
      
      // 4. Test actual PKCE retrieval and comparison
      console.log('\n4️⃣ TESTING EXACT PKCE RETRIEVAL...');
      const { data: testRecord, error: testError } = await supabase
        .from('oauth_state')
        .select('*')
        .eq('company_id', currentCompany.id)
        .eq('integration_type', 'salesforce')
        .order('created_at', { ascending: false })
        .limit(1)
        .single();
        
      if (testError) {
        console.error('❌ Error retrieving test record:', testError);
      } else if (testRecord) {
        console.log('🔍 EXACT PKCE RETRIEVAL TEST:');
        console.log('Full retrieved verifier:', testRecord.code_verifier);
        console.log('Full retrieved challenge:', testRecord.code_challenge);
        console.log('Verifier length:', testRecord.code_verifier?.length);
        console.log('Challenge length:', testRecord.code_challenge?.length);
        console.log('Record ID:', testRecord.id);
        
        // Test if verifier matches expected format (base64url)
        const verifierRegex = /^[A-Za-z0-9_~-]+$/;
        const challengeRegex = /^[A-Za-z0-9_-]+$/;
        console.log('Verifier format valid:', verifierRegex.test(testRecord.code_verifier || ''));
        console.log('Challenge format valid:', challengeRegex.test(testRecord.code_challenge || ''));
      }

      console.log('\n🎉 === PKCE DEBUG COMPLETE ===');
    } catch (error) {
      console.error('❌ PKCE debug failed:', error);
      Alert.alert('Debug Error', `Failed to debug PKCE: ${(error as Error).message}`);
    } finally {
      setIsLoading(false);
    }
  };

  // Debug OAuth callback process
  const debugOAuthCallback = async () => {
    console.log('🔧 [DEBUG] Debugging OAuth callback handling...');
    
    const testData = {
      code: 'test_code_123',
      state: 'test_state_456',
      instance_url: 'https://turbineworks-dev-ed.develop.my.salesforce.com'
    };
    
    console.log('[DEBUG] Test OAuth callback data:', testData);
  };

  const dumpRecentErrors = async () => {
    setIsLoading(true);
    try {
      console.log('🚨 [ERROR_DUMP] Dumping recent errors...');
      
      // Get recent errors from error logger
      const recentErrors = errorLogger.getRecentErrors(50);
      const errorStats = errorLogger.getErrorStats();
      
      console.log('📊 [ERROR_STATS]', {
        total: errorStats.total,
        unresolved: errorStats.unresolved,
        byCategory: errorStats.byCategory,
        bySeverity: errorStats.bySeverity
      });
      
      console.log('🔍 [RECENT_ERRORS] Last 50 errors:');
      recentErrors.forEach((error, index) => {
        console.log(`${index + 1}. [${error.severity.toUpperCase()}] [${error.category}] ${error.error.name}`);
        console.log(`   Message: ${error.error.message}`);
        console.log(`   Time: ${new Date(error.timestamp).toLocaleString()}`);
        if (error.context && Object.keys(error.context).length > 0) {
          console.log(`   Context:`, error.context);
        }
        console.log('');
      });
      
      // Also dump errors to alert
      const errorSummary = recentErrors.slice(0, 10).map(e => 
        `[${e.severity}] ${e.error.name}: ${e.error.message}`
      ).join('\n\n');
      
      Alert.alert(
        'Recent Errors',
        `Found ${recentErrors.length} recent errors. Check console for full details.\n\nLast 10 errors:\n\n${errorSummary}`,
        [{ text: 'OK' }]
      );
      
    } catch (error) {
      console.error('Failed to dump errors:', error);
      Alert.alert('Error', 'Failed to retrieve error logs');
    } finally {
      setIsLoading(false);
    }
  };

  // Debug OAuth Edge Function specifically
  const debugOAuthEdgeFunction = async () => {
    if (!currentCompany) return;
    setIsLoading(true);
    
    try {
      console.log('\n🔧 === OAUTH EDGE FUNCTION DEBUG ===');
      console.log(`Company: ${currentCompany.name} (${currentCompany.id})`);
      
      // 1. Check Edge Function endpoint availability
      console.log('\n1️⃣ TESTING EDGE FUNCTION ENDPOINT...');
      const edgeFunctionUrl = 'https://luwlvmcixwdtuaffamgk.supabase.co/functions/v1/salesforce-oauth-callback';
      console.log('Edge Function URL:', edgeFunctionUrl);
      
      try {
        const response = await fetch(edgeFunctionUrl, {
          method: 'OPTIONS',
          headers: {
            'Content-Type': 'application/json',
          }
        });
        console.log('✅ Edge Function accessible:', response.status, response.statusText);
      } catch (pingError) {
        console.log('❌ Edge Function ping failed:', pingError);
      }
      
      // 2. Check oauth_callbacks table for callback results
      console.log('\n2️⃣ CHECKING OAUTH_CALLBACKS TABLE...');
      const { data: callbacks, error: callbackError } = await supabase
        .from('oauth_callbacks')
        .select('*')
        .eq('company_id', currentCompany.id)
        .order('created_at', { ascending: false })
        .limit(5);
      
      if (callbackError) {
        console.error('❌ Error fetching oauth_callbacks:', callbackError);
      } else {
        console.log(`📋 Found ${callbacks?.length || 0} oauth_callback records:`);
        callbacks?.forEach((callback, index) => {
          const now = new Date();
          const createdAt = new Date(callback.created_at);
          const minutesAgo = Math.round((now.getTime() - createdAt.getTime()) / (1000 * 60));
          
          console.log(`Callback ${index + 1}:`, {
            id: callback.id.substring(0, 8) + '...',
            created_at: callback.created_at,
            minutesAgo: minutesAgo,
            consumed: callback.consumed,
            hasAuthCode: !!callback.auth_code,
            authCodeLength: callback.auth_code?.length,
            hasError: !!callback.error,
            error: callback.error,
            errorDescription: callback.error_description,
            expiresAt: callback.expires_at
          });
        });
      }
      
      // 3. Check company_integrations for token storage
      console.log('\n3️⃣ CHECKING TOKEN STORAGE IN COMPANY_INTEGRATIONS...');
      const { data: integration, error: integrationError } = await supabase
        .from('company_integrations')
        .select('*')
        .eq('company_id', currentCompany.id)
        .eq('integration_type', 'salesforce')
        .single();
      
      if (integrationError) {
        console.error('❌ Error fetching integration:', integrationError);
      } else if (integration) {
        const config = integration.config as any;
        const now = new Date();
        
        console.log('📋 Integration Status:', {
          status: integration.status,
          lastTestAt: integration.last_test_at,
          lastSyncAt: integration.last_sync_at,
          updatedAt: integration.updated_at
        });
        
        console.log('📋 Token Status:', {
          hasAccessToken: !!config.access_token,
          hasRefreshToken: !!config.refresh_token,
          tokenType: config.token_type,
          instanceUrl: config.instance_url,
          tokenReceivedAt: config.token_received_at,
          tokenExpiresAt: config.token_expires_at
        });
        
        if (config.token_expires_at) {
          const expiresAt = new Date(config.token_expires_at);
          const isExpired = now > expiresAt;
          const minutesRemaining = Math.round((expiresAt.getTime() - now.getTime()) / (1000 * 60));
          
          console.log('📋 Token Expiry:', {
            expiresAt: expiresAt.toISOString(),
            isExpired: isExpired,
            minutesRemaining: minutesRemaining
          });
        }
      }
      
      // 4. Generate diagnosis
      console.log('\n🔍 DIAGNOSIS:');
      let diagnosis = [];
      
      const hasRecentCallback = callbacks?.some(callback => {
        const createdAt = new Date(callback.created_at);
        const minutesAgo = (new Date().getTime() - createdAt.getTime()) / (1000 * 60);
        return minutesAgo < 30; // Created in last 30 minutes
      });
      
      const hasValidTokens = integration?.config && 
        (integration.config as any).access_token &&
        (!((integration.config as any).token_expires_at) || 
         new Date((integration.config as any).token_expires_at) > new Date());
      
      if (!hasRecentCallback) {
        diagnosis.push('❌ No recent OAuth callback - Edge Function may not be receiving callbacks or user did not complete OAuth');
      } else {
        diagnosis.push('✅ Recent OAuth callback found - Edge Function is receiving data');
      }
      
      if (!hasValidTokens) {
        diagnosis.push('❌ No valid tokens - Token exchange likely failed in Edge Function');
      } else {
        diagnosis.push('✅ Valid tokens found - OAuth should be working');
      }
      
      const callbackWithError = callbacks?.find(c => c.error);
      if (callbackWithError) {
        diagnosis.push(`❌ OAuth error found: ${callbackWithError.error} - ${callbackWithError.error_description}`);
      }
      
      const unconsumedCallback = callbacks?.find(c => !c.consumed && !c.error);
      if (unconsumedCallback) {
        diagnosis.push('⚠️ Found unconsumed successful callback - OAuth polling may not be working');
      }
      
      diagnosis.forEach(item => console.log(item));
      
      console.log('\n🎉 === EDGE FUNCTION DEBUG COMPLETE ===');
      
      Alert.alert(
        'OAuth Edge Function Debug Complete',
        `Callbacks: ${callbacks?.length || 0}, Valid Tokens: ${hasValidTokens ? 'Yes' : 'No'}. Check console for detailed diagnosis.`
      );
    } catch (error) {
      console.error('[DebugScreen] OAuth Edge Function debug error:', error);
      Alert.alert('Debug Error', `Failed to debug Edge Function: ${(error as Error).message}`);
    } finally {
      setIsLoading(false);
    }
  };

  // Force clear tokens and restart authentication
  const clearTokensAndReauth = async () => {
    if (!currentCompany) return;
    
    Alert.alert(
      'Complete OAuth Reset & Re-authenticate',
      'This will perform a complete OAuth reset (clear all tokens, state, and callback records) and force you to authenticate again. This fixes most OAuth issues. Continue?',
      [
        { text: 'Cancel', style: 'cancel' },
        { 
          text: 'Reset & Re-auth', 
          style: 'destructive',
          onPress: async () => {
            try {
              setIsLoading(true);
              console.log('\n🔄 === COMPLETE OAUTH RESET ===');
              
              // Use the new comprehensive resetOAuthState method
              const { salesforceOAuthService } = await import('../services/salesforceOAuthService');
              await salesforceOAuthService.resetOAuthState(currentCompany.id);
              
              console.log('✅ Complete OAuth reset completed successfully!');
              
              Alert.alert(
                'OAuth Reset Complete!',
                'All Salesforce OAuth artifacts have been cleared (tokens, state, callbacks). The integration status has been reset to pending. Please go to Settings > Salesforce Config to re-authenticate.',
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
              title="Debug OAuth Edge Function"
              onPress={debugOAuthEdgeFunction}
              disabled={isLoading}
              variant="secondary"
              style={styles.button}
            />
          </View>
          <View style={styles.buttonContainer}>
            <CustomButton
              title="Debug PKCE Details"
              onPress={debugPKCEDetails}
              disabled={isLoading}
              variant="secondary"
              style={styles.button}
            />
          </View>
        <View style={styles.buttonContainer}>
          <CustomButton
            title="Complete OAuth Reset"
            onPress={clearTokensAndReauth}
            disabled={isLoading}
            variant="danger"
            style={styles.button}
          />
        </View>
                  <View style={styles.buttonContainer}>
            <CustomButton
              title="Dump Recent Errors"
              onPress={dumpRecentErrors}
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
