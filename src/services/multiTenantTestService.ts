import companyService, { Company, CompanyUser } from './companyService';
import dataIsolationService from './dataIsolationService';
import batchManagementService from './batchManagementService';
import { openDatabase } from './databaseService';

/**
 * Multi-Tenant Test Service
 * Comprehensive testing for multi-tenant functionality
 */

interface TestResult {
  testName: string;
  passed: boolean;
  message: string;
  duration: number;
  details?: any;
}

interface TestSuite {
  suiteName: string;
  results: TestResult[];
  totalTests: number;
  passedTests: number;
  failedTests: number;
  totalDuration: number;
}

class MultiTenantTestService {
  private testResults: TestSuite[] = [];

  /**
   * Run all multi-tenant tests
   */
  async runAllTests(): Promise<TestSuite[]> {
    console.log('[MultiTenantTest] Starting comprehensive multi-tenant tests...');
    
    this.testResults = [];
    
    // Run test suites
    await this.runCompanyServiceTests();
    await this.runDataIsolationTests();
    await this.runBatchManagementTests();
    await this.runIntegrationTests();
    
    // Print summary
    this.printTestSummary();
    
    return this.testResults;
  }

  /**
   * Test company service functionality
   */
  private async runCompanyServiceTests(): Promise<void> {
    const suite: TestSuite = {
      suiteName: 'Company Service Tests',
      results: [],
      totalTests: 0,
      passedTests: 0,
      failedTests: 0,
      totalDuration: 0
    };

    // Test 1: Create company
    await this.runTest(suite, 'Create Company', async () => {
      const company = await companyService.createCompany(
        'Test Company',
        'TEST',
        'Aviation',
        'test-user-1'
      );
      
      if (!company || !company.id) {
        throw new Error('Failed to create company');
      }
      
      return { companyId: company.id, companyName: company.name };
    });

    // Test 2: Get company by ID
    await this.runTest(suite, 'Get Company By ID', async () => {
      const companies = await companyService.getUserCompanies('test-user-1');
      if (companies.length === 0) {
        throw new Error('No companies found for user');
      }
      
      const company = await companyService.getCompanyById(companies[0].id);
      if (!company) {
        throw new Error('Failed to retrieve company');
      }
      
      return { companyId: company.id };
    });

    // Test 3: Add user to company
    await this.runTest(suite, 'Add User to Company', async () => {
      const companies = await companyService.getUserCompanies('test-user-1');
      const companyId = companies[0].id;
      
      await companyService.addUserToCompany(
        companyId,
        'test-user-2',
        'member',
        ['view_batches', 'create_batches']
      );
      
      const companyUsers = await companyService.getCompanyUsers(companyId);
      const addedUser = companyUsers.find(u => u.userId === 'test-user-2');
      
      if (!addedUser) {
        throw new Error('User not added to company');
      }
      
      return { userId: addedUser.userId, role: addedUser.role };
    });

    // Test 4: Update company settings
    await this.runTest(suite, 'Update Company Settings', async () => {
      const companies = await companyService.getUserCompanies('test-user-1');
      const companyId = companies[0].id;
      
      const newSettings = {
        batchApprovalRequired: true,
        maxPhotosPerBatch: 100,
        allowGuestAccess: false
      };
      
      await companyService.updateCompanySettings(companyId, newSettings);
      
      const updatedCompany = await companyService.getCompanyById(companyId);
      if (!updatedCompany?.settings.batchApprovalRequired) {
        throw new Error('Company settings not updated');
      }
      
      return { settings: updatedCompany.settings };
    });

    this.testResults.push(suite);
  }

  /**
   * Test data isolation functionality
   */
  private async runDataIsolationTests(): Promise<void> {
    const suite: TestSuite = {
      suiteName: 'Data Isolation Tests',
      results: [],
      totalTests: 0,
      passedTests: 0,
      failedTests: 0,
      totalDuration: 0
    };

    // Test 1: Set tenant context
    await this.runTest(suite, 'Set Tenant Context', async () => {
      const companies = await companyService.getUserCompanies('test-user-1');
      const companyId = companies[0].id;
      
      dataIsolationService.setTenantContext({
        userId: 'test-user-1',
        companyId: companyId,
        role: 'owner',
        permissions: ['*']
      });
      
      const context = dataIsolationService.getTenantContext();
      if (!context || context.companyId !== companyId) {
        throw new Error('Tenant context not set correctly');
      }
      
      return { context };
    });

    // Test 2: Validate tenant access
    await this.runTest(suite, 'Validate Tenant Access', async () => {
      const companies = await companyService.getUserCompanies('test-user-1');
      const companyId = companies[0].id;
      
      const hasAccess = await dataIsolationService.validateTenantAccess(
        'test-user-1',
        companyId
      );
      
      if (!hasAccess) {
        throw new Error('User should have access to their company');
      }
      
      // Test access to different company (should fail)
      const noAccess = await dataIsolationService.validateTenantAccess(
        'test-user-1',
        'non-existent-company'
      );
      
      if (noAccess) {
        throw new Error('User should not have access to non-existent company');
      }
      
      return { hasAccess, noAccess };
    });

    // Test 3: Check permissions
    await this.runTest(suite, 'Check Permissions', async () => {
      const hasManageUsers = dataIsolationService.checkPermission('manage_users');
      const hasViewReports = dataIsolationService.checkPermission('view_reports');
      
      // Owner should have all permissions
      if (!hasManageUsers || !hasViewReports) {
        throw new Error('Owner should have all permissions');
      }
      
      return { hasManageUsers, hasViewReports };
    });

    // Test 4: Audit logging
    await this.runTest(suite, 'Audit Logging', async () => {
      await dataIsolationService.logTenantOperation(
        'test_operation',
        'photo_batches',
        'test-record-id',
        { test: 'data' }
      );
      
      // Verify audit log was created
      const db = await openDatabase();
      const auditLogs = await db.getAllAsync(
        'SELECT * FROM tenant_audit_logs WHERE operation = ? ORDER BY createdAt DESC LIMIT 1',
        ['test_operation']
      );
      
      if (auditLogs.length === 0) {
        throw new Error('Audit log not created');
      }
      
      return { auditLogId: auditLogs[0].id };
    });

    this.testResults.push(suite);
  }

  /**
   * Test batch management functionality
   */
  private async runBatchManagementTests(): Promise<void> {
    const suite: TestSuite = {
      suiteName: 'Batch Management Tests',
      results: [],
      totalTests: 0,
      passedTests: 0,
      failedTests: 0,
      totalDuration: 0
    };

    // Test 1: Create batch template
    await this.runTest(suite, 'Create Batch Template', async () => {
      const companies = await companyService.getUserCompanies('test-user-1');
      const companyId = companies[0].id;
      
      const template = await batchManagementService.createBatchTemplate({
        companyId,
        name: 'Test Template',
        description: 'Test batch template',
        category: 'inspection',
        requiredFields: ['partNumber', 'serialNumber'],
        photoRequirements: {
          minPhotos: 2,
          maxPhotos: 10,
          requiredTypes: ['general', 'defect']
        },
        approvalWorkflow: {
          enabled: true,
          stages: [
            { name: 'Initial Review', requiredRole: 'member' },
            { name: 'Final Approval', requiredRole: 'admin' }
          ]
        },
        createdBy: 'test-user-1'
      });
      
      if (!template || !template.id) {
        throw new Error('Failed to create batch template');
      }
      
      return { templateId: template.id };
    });

    // Test 2: Create batch from template
    await this.runTest(suite, 'Create Batch from Template', async () => {
      const companies = await companyService.getUserCompanies('test-user-1');
      const companyId = companies[0].id;
      
      const templates = await batchManagementService.getBatchTemplates(companyId);
      if (templates.length === 0) {
        throw new Error('No templates found');
      }
      
      const batch = await batchManagementService.createBatchFromTemplate(
        templates[0].id,
        {
          name: 'Test Batch from Template',
          assignedTo: 'test-user-1',
          dueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
          metadata: { partNumber: 'TEST-001', serialNumber: 'SN123' }
        }
      );
      
      if (!batch || !batch.id) {
        throw new Error('Failed to create batch from template');
      }
      
      return { batchId: batch.id, templateId: batch.templateId };
    });

    // Test 3: Update batch status
    await this.runTest(suite, 'Update Batch Status', async () => {
      const companies = await companyService.getUserCompanies('test-user-1');
      const companyId = companies[0].id;
      
      const batches = await batchManagementService.getBatches(companyId, {
        limit: 1
      });
      
      if (batches.batches.length === 0) {
        throw new Error('No batches found');
      }
      
      const batchId = batches.batches[0].id;
      
      await batchManagementService.updateBatchStatus(
        batchId,
        'in_progress',
        'test-user-1'
      );
      
      // Verify status was updated
      const updatedBatches = await batchManagementService.getBatches(companyId, {
        batchIds: [batchId]
      });
      
      if (updatedBatches.batches[0].status !== 'in_progress') {
        throw new Error('Batch status not updated');
      }
      
      return { batchId, newStatus: 'in_progress' };
    });

    // Test 4: Add batch comment
    await this.runTest(suite, 'Add Batch Comment', async () => {
      const companies = await companyService.getUserCompanies('test-user-1');
      const companyId = companies[0].id;
      
      const batches = await batchManagementService.getBatches(companyId, {
        limit: 1
      });
      
      const batchId = batches.batches[0].id;
      
      await batchManagementService.addBatchComment(
        batchId,
        'test-user-1',
        'Test comment for batch',
        'general'
      );
      
      // Verify comment was added
      const db = await openDatabase();
      const comments = await db.getAllAsync(
        'SELECT * FROM batch_comments WHERE batchId = ? ORDER BY createdAt DESC LIMIT 1',
        [batchId]
      );
      
      if (comments.length === 0) {
        throw new Error('Batch comment not added');
      }
      
      return { commentId: comments[0].id, batchId };
    });

    this.testResults.push(suite);
  }

  /**
   * Test integration between services
   */
  private async runIntegrationTests(): Promise<void> {
    const suite: TestSuite = {
      suiteName: 'Integration Tests',
      results: [],
      totalTests: 0,
      passedTests: 0,
      failedTests: 0,
      totalDuration: 0
    };

    // Test 1: Multi-tenant data isolation
    await this.runTest(suite, 'Multi-Tenant Data Isolation', async () => {
      // Create second company
      const company2 = await companyService.createCompany(
        'test-user-3',
        'Test Company 2',
        'TEST2',
        'Manufacturing'
      );
      
      // Set context for first company
      const companies1 = await companyService.getUserCompanies('test-user-1');
      dataIsolationService.setTenantContext({
        userId: 'test-user-1',
        companyId: companies1[0].id,
        role: 'owner',
        permissions: ['*']
      });
      
      // Get batches for first company
      const batches1 = await batchManagementService.getBatches(companies1[0].id);
      
      // Set context for second company
      dataIsolationService.setTenantContext({
        userId: 'test-user-3',
        companyId: company2.id,
        role: 'owner',
        permissions: ['*']
      });
      
      // Get batches for second company
      const batches2 = await batchManagementService.getBatches(company2.id);
      
      // Verify data isolation
      const company1BatchIds = batches1.batches.map(b => b.id);
      const company2BatchIds = batches2.batches.map(b => b.id);
      
      const overlap = company1BatchIds.filter(id => company2BatchIds.includes(id));
      
      if (overlap.length > 0) {
        throw new Error('Data isolation failed - batches visible across companies');
      }
      
      return { 
        company1Batches: company1BatchIds.length,
        company2Batches: company2BatchIds.length,
        isolation: 'verified'
      };
    });

    // Test 2: Permission-based access control
    await this.runTest(suite, 'Permission-Based Access Control', async () => {
      const companies = await companyService.getUserCompanies('test-user-1');
      const companyId = companies[0].id;
      
      // Set limited permissions for test-user-2
      dataIsolationService.setTenantContext({
        userId: 'test-user-2',
        companyId: companyId,
        role: 'member',
        permissions: ['view_batches']
      });
      
      // Should be able to view batches
      const canView = dataIsolationService.checkPermission('view_batches');
      
      // Should not be able to manage users
      const canManage = dataIsolationService.checkPermission('manage_users');
      
      if (!canView) {
        throw new Error('User should be able to view batches');
      }
      
      if (canManage) {
        throw new Error('User should not be able to manage users');
      }
      
      return { canView, canManage };
    });

    // Test 3: Cross-service data consistency
    await this.runTest(suite, 'Cross-Service Data Consistency', async () => {
      const companies = await companyService.getUserCompanies('test-user-1');
      const companyId = companies[0].id;
      
      // Get company user count
      const companyUsers = await companyService.getCompanyUsers(companyId);
      
      // Get tenant statistics
      const stats = await dataIsolationService.getTenantStatistics(companyId);
      
      // Verify consistency
      if (stats.userCount !== companyUsers.length) {
        throw new Error('User count mismatch between services');
      }
      
      return { 
        companyUserCount: companyUsers.length,
        statsUserCount: stats.userCount,
        consistency: 'verified'
      };
    });

    this.testResults.push(suite);
  }

  /**
   * Run individual test
   */
  private async runTest(
    suite: TestSuite,
    testName: string,
    testFunction: () => Promise<any>
  ): Promise<void> {
    const startTime = Date.now();
    
    try {
      const result = await testFunction();
      const duration = Date.now() - startTime;
      
      suite.results.push({
        testName,
        passed: true,
        message: 'Test passed',
        duration,
        details: result
      });
      
      suite.passedTests++;
      console.log(`✅ ${testName} - ${duration}ms`);
    } catch (error) {
      const duration = Date.now() - startTime;
      
      suite.results.push({
        testName,
        passed: false,
        message: error instanceof Error ? error.message : 'Unknown error',
        duration,
        details: { error: error instanceof Error ? error.stack : error }
      });
      
      suite.failedTests++;
      console.log(`❌ ${testName} - ${duration}ms - ${error instanceof Error ? error.message : error}`);
    }
    
    suite.totalTests++;
    suite.totalDuration += Date.now() - startTime;
  }

  /**
   * Print test summary
   */
  private printTestSummary(): void {
    console.log('\n=== MULTI-TENANT TEST SUMMARY ===');
    
    let totalTests = 0;
    let totalPassed = 0;
    let totalFailed = 0;
    let totalDuration = 0;
    
    for (const suite of this.testResults) {
      console.log(`\n${suite.suiteName}:`);
      console.log(`  Tests: ${suite.totalTests}`);
      console.log(`  Passed: ${suite.passedTests}`);
      console.log(`  Failed: ${suite.failedTests}`);
      console.log(`  Duration: ${suite.totalDuration}ms`);
      
      totalTests += suite.totalTests;
      totalPassed += suite.passedTests;
      totalFailed += suite.failedTests;
      totalDuration += suite.totalDuration;
    }
    
    console.log(`\n=== OVERALL SUMMARY ===`);
    console.log(`Total Tests: ${totalTests}`);
    console.log(`Passed: ${totalPassed}`);
    console.log(`Failed: ${totalFailed}`);
    console.log(`Success Rate: ${((totalPassed / totalTests) * 100).toFixed(1)}%`);
    console.log(`Total Duration: ${totalDuration}ms`);
    
    if (totalFailed === 0) {
      console.log('🎉 All multi-tenant tests passed!');
    } else {
      console.log(`⚠️  ${totalFailed} test(s) failed`);
    }
  }

  /**
   * Clean up test data
   */
  async cleanupTestData(): Promise<void> {
    console.log('[MultiTenantTest] Cleaning up test data...');
    
    try {
      const db = await openDatabase();
      
      // Clean up test companies and related data
      await db.runAsync('DELETE FROM companies WHERE code LIKE ?', ['TEST%']);
      await db.runAsync('DELETE FROM company_users WHERE userId LIKE ?', ['test-user-%']);
      await db.runAsync('DELETE FROM batch_templates WHERE name LIKE ?', ['Test%']);
      await db.runAsync('DELETE FROM tenant_audit_logs WHERE userId LIKE ?', ['test-user-%']);
      
      console.log('[MultiTenantTest] Test data cleanup completed');
    } catch (error) {
      console.error('[MultiTenantTest] Error cleaning up test data:', error);
    }
  }
}

export default new MultiTenantTestService();
