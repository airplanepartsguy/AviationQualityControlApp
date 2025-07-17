/**
 * Salesforce OAuth Debug Helper
 * Helps diagnose OAuth and integration status issues
 */

import * as SecureStore from 'expo-secure-store';
import companyIntegrationsService from '../services/companyIntegrationsService';

export interface SalesforceDebugInfo {
  hasTokens: boolean;
  tokenInfo?: {
    hasAccessToken: boolean;
    hasRefreshToken: boolean;
    tokenExpiry?: string;
  };
  integrationStatus?: {
    status: string;
    lastTest?: string;
    errorMessage?: string;
  };
  configInfo?: {
    hasClientId: boolean;
    hasInstanceUrl: boolean;
    instanceUrl?: string;
  };
}

/**
 * Get comprehensive debug info for Salesforce integration
 */
export async function getSalesforceDebugInfo(companyId: string): Promise<SalesforceDebugInfo> {
  const debugInfo: SalesforceDebugInfo = {
    hasTokens: false
  };

  try {
    // Check OAuth tokens in secure storage
    const tokenKey = `salesforce_tokens_${companyId}`;
    const tokensJson = await SecureStore.getItemAsync(tokenKey);
    
    if (tokensJson) {
      const tokens = JSON.parse(tokensJson);
      debugInfo.hasTokens = true;
      debugInfo.tokenInfo = {
        hasAccessToken: !!tokens.access_token,
        hasRefreshToken: !!tokens.refresh_token,
        tokenExpiry: tokens.expires_at
      };
    }

    // Check integration status in database
    const integration = await companyIntegrationsService.getIntegration(companyId, 'salesforce');
    if (integration) {
      debugInfo.integrationStatus = {
        status: integration.status,
        lastTest: integration.last_test_at,
        errorMessage: integration.error_message
      };

      const config = integration.config as any;
      debugInfo.configInfo = {
        hasClientId: !!config.client_id,
        hasInstanceUrl: !!config.instance_url,
        instanceUrl: config.instance_url
      };
    }

  } catch (error) {
    console.error('[SalesforceDebug] Error getting debug info:', error);
  }

  return debugInfo;
}

/**
 * Log comprehensive debug info to console
 */
export async function logSalesforceDebugInfo(companyId: string): Promise<void> {
  console.log('\n🔍 SALESFORCE DEBUG INFO');
  console.log('========================');
  
  const debugInfo = await getSalesforceDebugInfo(companyId);
  
  console.log('📱 OAuth Tokens:');
  console.log(`   Has Tokens: ${debugInfo.hasTokens}`);
  if (debugInfo.tokenInfo) {
    console.log(`   Access Token: ${debugInfo.tokenInfo.hasAccessToken ? '✅' : '❌'}`);
    console.log(`   Refresh Token: ${debugInfo.tokenInfo.hasRefreshToken ? '✅' : '❌'}`);
    console.log(`   Expires: ${debugInfo.tokenInfo.tokenExpiry || 'Unknown'}`);
  }
  
  console.log('\n📊 Integration Status:');
  if (debugInfo.integrationStatus) {
    console.log(`   Status: ${debugInfo.integrationStatus.status}`);
    console.log(`   Last Test: ${debugInfo.integrationStatus.lastTest || 'Never'}`);
    console.log(`   Error: ${debugInfo.integrationStatus.errorMessage || 'None'}`);
  } else {
    console.log('   ❌ No integration record found');
  }
  
  console.log('\n⚙️ Configuration:');
  if (debugInfo.configInfo) {
    console.log(`   Client ID: ${debugInfo.configInfo.hasClientId ? '✅' : '❌'}`);
    console.log(`   Instance URL: ${debugInfo.configInfo.hasInstanceUrl ? '✅' : '❌'}`);
    console.log(`   URL: ${debugInfo.configInfo.instanceUrl || 'Not set'}`);
  } else {
    console.log('   ❌ No configuration found');
  }
  
  console.log('========================\n');
}

/**
 * Clear all Salesforce data for debugging
 */
export async function clearSalesforceDebugData(companyId: string): Promise<void> {
  try {
    console.log('🧹 Clearing Salesforce debug data...');
    
    // Clear OAuth tokens
    const tokenKey = `salesforce_tokens_${companyId}`;
    await SecureStore.deleteItemAsync(tokenKey);
    
    // Reset integration status
    const integration = await companyIntegrationsService.getIntegration(companyId, 'salesforce');
    if (integration) {
      await companyIntegrationsService.updateIntegrationStatus(
        integration.id, 
        'inactive', 
        'Debug reset - reconfiguration required'
      );
    }
    
    console.log('✅ Salesforce debug data cleared');
  } catch (error) {
    console.error('❌ Error clearing debug data:', error);
  }
}
