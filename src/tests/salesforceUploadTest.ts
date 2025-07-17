/**
 * Salesforce Upload Integration Test
 * Tests the complete PDF upload flow to Salesforce
 */

import salesforceUploadService from '../services/salesforceUploadService';
import { salesforceObjectMappingService } from '../services/salesforceObjectMappingService';

// Test configuration
const TEST_COMPANY_ID = 'test-company-id';
const TEST_SCANNED_IDS = ['PO-12345', 'INV-67890', 'SO-11111'];

/**
 * Test the complete upload flow
 */
export async function testSalesforceUploadFlow() {
  console.log('🧪 Starting Salesforce Upload Integration Test...');
  
  try {
    // Test 1: Object Mapping Service
    console.log('\n📋 Testing Object Mapping Service...');
    for (const scannedId of TEST_SCANNED_IDS) {
      const parsed = await salesforceObjectMappingService.parseDocumentIdWithMapping(TEST_COMPANY_ID, scannedId);
      console.log(`✅ ${scannedId} -> ${parsed.mapping?.salesforce_object || 'No mapping'}`);
    }
    
    // Test 2: Upload Service (dry run)
    console.log('\n📤 Testing Upload Service...');
    const testPdfBase64 = 'JVBERi0xLjQKJdPr6eEKMSAwIG9iago8PAovVHlwZSAvQ2F0YWxvZwovUGFnZXMgMiAwIFIKPj4KZW5kb2JqCjIgMCBvYmoKPDwKL1R5cGUgL1BhZ2VzCi9LaWRzIFszIDAgUl0KL0NvdW50IDEKPD4KZW5kb2JqCjMgMCBvYmoKPDwKL1R5cGUgL1BhZ2UKL1BhcmVudCAyIDAgUgovTWVkaWFCb3ggWzAgMCA2MTIgNzkyXQovUmVzb3VyY2VzIDw8Ci9Gb250IDw8Ci9GMSA0IDAgUgo+Pgo+PgovQ29udGVudHMgNSAwIFIKPj4KZW5kb2JqCjQgMCBvYmoKPDwKL1R5cGUgL0ZvbnQKL1N1YnR5cGUgL1R5cGUxCi9CYXNlRm9udCAvSGVsdmV0aWNhCj4+CmVuZG9iago1IDAgb2JqCjw8Ci9MZW5ndGggNDQKPj4Kc3RyZWFtCkJUCi9GMSAxMiBUZgoxMDAgNzAwIFRkCihUZXN0IFBERikgVGoKRVQKZW5kc3RyZWFtCmVuZG9iagp4cmVmCjAgNgowMDAwMDAwMDAwIDY1NTM1IGYgCjAwMDAwMDAwMDkgMDAwMDAgbiAKMDAwMDAwMDA1OCAwMDAwMCBuIAowMDAwMDAwMTE1IDAwMDAwIG4gCjAwMDAwMDAyNDUgMDAwMDAgbiAKMDAwMDAwMDMxMiAwMDAwMCBuIAp0cmFpbGVyCjw8Ci9TaXplIDYKL1Jvb3QgMSAwIFIKPj4Kc3RhcnR4cmVmCjQwNgolJUVPRg==';
    
    const result = await salesforceUploadService.uploadPdfByScannedId(
      TEST_COMPANY_ID,
      'PO-12345',
      testPdfBase64
    );
    
    console.log(`📊 Upload Result: ${result.success ? '✅ SUCCESS' : '❌ FAILED'}`);
    console.log(`📝 Message: ${result.message}`);
    
    if (result.details) {
      console.log('📋 Details:', result.details);
    }
    
    console.log('\n🎉 Salesforce Upload Test Complete!');
    return result;
    
  } catch (error) {
    console.error('❌ Test failed:', error);
    throw error;
  }
}

// Export for use in other tests
export default testSalesforceUploadFlow;
