/**
 * Debug OAuth Test Script
 * Run this to test the OAuth flow and diagnose issues
 */

const { salesforceOAuthService } = require('./src/services/salesforceOAuthService');
const { companyIntegrationsService } = require('./src/services/companyIntegrationsService');

async function testOAuthFlow() {
  console.log('=== OAuth Flow Debug Test ===');
  
  const testCompanyId = '70b41ce9-bf19-4b1a-9c37-5b00cb33cadf'; // Your company ID
  
  try {
    // 1. Check if integration exists
    console.log('\n1. Checking Salesforce integration...');
    const integration = await companyIntegrationsService.getIntegration(testCompanyId, 'salesforce');
    if (!integration) {
      console.error('❌ No Salesforce integration found for company');
      return;
    }
    console.log('✅ Integration found:', {
      id: integration.id,
      status: integration.status,
      config: integration.config ? 'Present' : 'Missing'
    });
    
    // 2. Check for stored tokens
    console.log('\n2. Checking stored OAuth tokens...');
    const tokens = await salesforceOAuthService.getStoredTokens(testCompanyId);
    if (tokens) {
      console.log('✅ Tokens found:', {
        access_token: tokens.access_token ? '[PRESENT]' : '[MISSING]',
        refresh_token: tokens.refresh_token ? '[PRESENT]' : '[MISSING]',
        instance_url: tokens.instance_url
      });
    } else {
      console.log('❌ No stored tokens found');
    }
    
    // 3. Test connection
    console.log('\n3. Testing Salesforce connection...');
    const connectionTest = await salesforceOAuthService.testConnection(testCompanyId);
    console.log('Connection test result:', connectionTest ? '✅ SUCCESS' : '❌ FAILED');
    
    // 4. Check OAuth callback data
    console.log('\n4. Checking for pending OAuth callbacks...');
    const callbackData = await salesforceOAuthService.retrieveOAuthCallback(testCompanyId);
    if (callbackData.authCode) {
      console.log('✅ OAuth callback found with auth code');
    } else if (callbackData.error) {
      console.log('❌ OAuth callback has error:', callbackData.error);
    } else {
      console.log('ℹ️ No pending OAuth callback');
    }
    
  } catch (error) {
    console.error('❌ Test failed:', error);
  }
}

// Run the test
testOAuthFlow().catch(console.error);
