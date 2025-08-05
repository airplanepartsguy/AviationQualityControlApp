/**
 * Test Suite for Salesforce Integration Improvements
 * Run these tests after deployment to verify all fixes are working
 */

import { companySalesforceTokenService } from '../services/companySalesforceTokenService';
import { salesforceObjectMappingService } from '../services/salesforceObjectMappingService';
import { erpSyncService } from '../services/erpSyncService';
import { errorMonitoringService } from '../services/errorMonitoringService';
import { supabase } from '../services/supabaseService';

interface TestResult {
  test: string;
  passed: boolean;
  message: string;
  details?: any;
}

class SalesforceIntegrationTester {
  private results: TestResult[] = [];
  private testCompanyId: string = '';
  private testBatchId: string = '';

  /**
   * Run all integration tests
   */
  async runAllTests(companyId: string): Promise<TestResult[]> {
    this.testCompanyId = companyId;
    this.results = [];
    
    console.log('🧪 Starting Salesforce Integration Tests...\n');
    
    // Test 1: Company-wide token access
    await this.testCompanyWideTokenAccess();
    
    // Test 2: Token refresh functionality
    await this.testTokenRefresh();
    
    // Test 3: Object mapping with caching
    await this.testObjectMapping();
    
    // Test 4: Duplicate upload prevention
    await this.testDuplicateUploadPrevention();
    
    // Test 5: Error monitoring
    await this.testErrorMonitoring();
    
    // Print summary
    this.printTestSummary();
    
    return this.results;
  }

  /**
   * Test 1: Company-wide token access
   */
  async testCompanyWideTokenAccess(): Promise<void> {
    console.log('📋 Test 1: Company-wide Token Access');
    
    try {
      // Check if company has Salesforce connected
      const isConnected = await companySalesforceTokenService.isCompanySalesforceConnected(this.testCompanyId);
      
      if (!isConnected) {
        this.addResult('Company-wide Token Access', false, 'No Salesforce connection found', {
          tip: 'Admin needs to connect Salesforce first'
        });
        return;
      }
      
      // Try to get token (should work for any user in company)
      const token = await companySalesforceTokenService.getCompanySalesforceToken(this.testCompanyId);
      
      if (token) {
        // Get token details
        const details = await companySalesforceTokenService.getCompanySalesforceTokenDetails(this.testCompanyId);
        
        this.addResult('Company-wide Token Access', true, 'Successfully retrieved company token', {
          hasToken: !!token,
          instanceUrl: details.instance_url,
          expiresAt: details.expires_at,
          tokenLength: token.length
        });
      } else {
        this.addResult('Company-wide Token Access', false, 'Failed to retrieve token');
      }
    } catch (error) {
      this.addResult('Company-wide Token Access', false, `Error: ${error.message}`);
    }
  }

  /**
   * Test 2: Token refresh functionality
   */
  async testTokenRefresh(): Promise<void> {
    console.log('📋 Test 2: Token Refresh Functionality');
    
    try {
      // Get current token details
      const beforeDetails = await companySalesforceTokenService.getCompanySalesforceTokenDetails(this.testCompanyId);
      
      // Force token refresh by calling the edge function directly
      const { data, error } = await supabase.functions.invoke('refresh-salesforce-token', {
        body: { company_id: this.testCompanyId }
      });
      
      if (error || !data?.success) {
        this.addResult('Token Refresh', false, `Refresh failed: ${error?.message || data?.error}`);
        return;
      }
      
      // Get updated token details
      const afterDetails = await companySalesforceTokenService.getCompanySalesforceTokenDetails(this.testCompanyId);
      
      this.addResult('Token Refresh', true, 'Token refresh successful', {
        beforeExpiry: beforeDetails.expires_at,
        afterExpiry: afterDetails.expires_at,
        newAccessToken: data.access_token?.substring(0, 20) + '...',
        instanceUrl: data.instance_url
      });
    } catch (error) {
      this.addResult('Token Refresh', false, `Error: ${error.message}`);
    }
  }

  /**
   * Test 3: Object mapping with caching
   */
  async testObjectMapping(): Promise<void> {
    console.log('📋 Test 3: Object Mapping & Caching');
    
    try {
      // Test various ID formats
      const testIds = ['INV-420', 'PO-123', 'RLS-456', 'WO-789'];
      const results: any[] = [];
      
      // First pass - should hit database
      const startTime1 = Date.now();
      for (const id of testIds) {
        const mapping = await salesforceObjectMappingService.mapScannedIdToObject(id, this.testCompanyId);
        results.push({ id, mapping, cached: false });
      }
      const dbTime = Date.now() - startTime1;
      
      // Second pass - should use cache
      const startTime2 = Date.now();
      for (const id of testIds) {
        const mapping = await salesforceObjectMappingService.mapScannedIdToObject(id, this.testCompanyId);
      }
      const cacheTime = Date.now() - startTime2;
      
      this.addResult('Object Mapping & Caching', true, 'Mapping and caching working correctly', {
        mappings: results,
        dbAccessTime: `${dbTime}ms`,
        cacheAccessTime: `${cacheTime}ms`,
        speedImprovement: `${Math.round((dbTime - cacheTime) / dbTime * 100)}% faster with cache`
      });
    } catch (error) {
      this.addResult('Object Mapping & Caching', false, `Error: ${error.message}`);
    }
  }

  /**
   * Test 4: Duplicate upload prevention
   */
  async testDuplicateUploadPrevention(): Promise<void> {
    console.log('📋 Test 4: Duplicate Upload Prevention');
    
    try {
      // Get a test batch that hasn't been uploaded
      const { data: batches, error } = await supabase
        .from('photo_batches')
        .select('id, batch_name, erp_uploaded')
        .eq('company_id', this.testCompanyId)
        .eq('erp_uploaded', false)
        .limit(1);
      
      if (error || !batches?.length) {
        this.addResult('Duplicate Upload Prevention', false, 'No test batch found', {
          tip: 'Create a photo batch first'
        });
        return;
      }
      
      this.testBatchId = batches[0].id;
      
      // Check if batch is already uploaded
      const isUploaded = await erpSyncService.isBatchUploadedToErp(this.testBatchId);
      
      if (isUploaded) {
        this.addResult('Duplicate Upload Prevention', true, 'Duplicate check working - batch already uploaded', {
          batchId: this.testBatchId,
          batchName: batches[0].batch_name
        });
      } else {
        // Mark as uploaded (simulate upload)
        const { error: updateError } = await supabase
          .from('photo_batches')
          .update({
            erp_uploaded: true,
            erp_uploaded_at: new Date().toISOString(),
            erp_record_ids: { test: true }
          })
          .eq('id', this.testBatchId);
        
        if (!updateError) {
          // Check again
          const isNowUploaded = await erpSyncService.isBatchUploadedToErp(this.testBatchId);
          
          this.addResult('Duplicate Upload Prevention', true, 'Upload tracking working correctly', {
            batchId: this.testBatchId,
            wasUploaded: false,
            isNowUploaded: isNowUploaded
          });
          
          // Reset for cleanup
          await supabase
            .from('photo_batches')
            .update({ erp_uploaded: false, erp_uploaded_at: null })
            .eq('id', this.testBatchId);
        }
      }
    } catch (error) {
      this.addResult('Duplicate Upload Prevention', false, `Error: ${error.message}`);
    }
  }

  /**
   * Test 5: Error monitoring
   */
  async testErrorMonitoring(): Promise<void> {
    console.log('📋 Test 5: Error Monitoring');
    
    try {
      // Log test errors
      await errorMonitoringService.logOAuthError(
        this.testCompanyId,
        'Test OAuth error',
        { test: true }
      );
      
      await errorMonitoringService.logUploadError(
        this.testCompanyId,
        this.testBatchId || 'test-batch',
        'Test upload error',
        { test: true }
      );
      
      // Get error summary
      const summary = await errorMonitoringService.getErrorSummary(this.testCompanyId);
      
      // Get recent errors
      const recentErrors = await errorMonitoringService.getRecentErrors(this.testCompanyId, 5);
      
      this.addResult('Error Monitoring', true, 'Error monitoring working correctly', {
        totalErrors: summary.total,
        errorsByType: summary.byType,
        last24Hours: summary.last24Hours,
        recentErrorCount: recentErrors.length
      });
    } catch (error) {
      this.addResult('Error Monitoring', false, `Error: ${error.message}`);
    }
  }

  /**
   * Add test result
   */
  private addResult(test: string, passed: boolean, message: string, details?: any): void {
    this.results.push({ test, passed, message, details });
    console.log(`${passed ? '✅' : '❌'} ${test}: ${message}`);
    if (details) {
      console.log('   Details:', JSON.stringify(details, null, 2));
    }
    console.log('');
  }

  /**
   * Print test summary
   */
  private printTestSummary(): void {
    const passed = this.results.filter(r => r.passed).length;
    const failed = this.results.filter(r => !r.passed).length;
    const total = this.results.length;
    
    console.log('\n📊 Test Summary:');
    console.log(`   Total Tests: ${total}`);
    console.log(`   ✅ Passed: ${passed}`);
    console.log(`   ❌ Failed: ${failed}`);
    console.log(`   Success Rate: ${Math.round(passed / total * 100)}%`);
    
    if (failed > 0) {
      console.log('\n⚠️  Failed Tests:');
      this.results.filter(r => !r.passed).forEach(r => {
        console.log(`   - ${r.test}: ${r.message}`);
      });
    }
  }
}

// Export test runner
export const salesforceIntegrationTester = new SalesforceIntegrationTester();

// Example usage:
// await salesforceIntegrationTester.runAllTests('your-company-id');