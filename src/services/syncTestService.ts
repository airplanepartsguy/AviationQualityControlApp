import { openDatabase } from './databaseService';
import supabaseService from './supabaseService';
import { syncAllPendingData, getSyncStats } from './offlineSyncService';
import conflictResolutionService from './conflictResolutionService';
import { isNetworkConnected } from './networkService';
import { PhotoBatch, PhotoData } from '../types/data';

/**
 * Sync Test Service - Comprehensive testing for offline-first sync functionality
 * Tests authentication, data sync, conflict resolution, and network handling
 */

export interface SyncTestResult {
  testName: string;
  success: boolean;
  message: string;
  duration: number;
  details?: any;
}

export interface SyncTestSuite {
  totalTests: number;
  passedTests: number;
  failedTests: number;
  results: SyncTestResult[];
  overallSuccess: boolean;
  totalDuration: number;
}

/**
 * Test Supabase connection and authentication
 */
export const testSupabaseConnection = async (): Promise<SyncTestResult> => {
  const startTime = Date.now();
  
  try {
    console.log('[SyncTest] Testing Supabase connection...');
    
    // Test connection
    const isConnected = await supabaseService.testConnection();
    
    if (!isConnected) {
      return {
        testName: 'Supabase Connection',
        success: false,
        message: 'Failed to connect to Supabase',
        duration: Date.now() - startTime
      };
    }
    
    // Test session retrieval
    const session = await supabaseService.getCurrentSession();
    
    return {
      testName: 'Supabase Connection',
      success: true,
      message: `Connection successful. Session: ${session ? 'Active' : 'None'}`,
      duration: Date.now() - startTime,
      details: { hasSession: !!session }
    };
  } catch (error) {
    return {
      testName: 'Supabase Connection',
      success: false,
      message: `Connection test failed: ${error}`,
      duration: Date.now() - startTime
    };
  }
};

/**
 * Test network connectivity monitoring
 */
export const testNetworkMonitoring = async (): Promise<SyncTestResult> => {
  const startTime = Date.now();
  
  try {
    console.log('[SyncTest] Testing network monitoring...');
    
    const isConnected = await isNetworkConnected();
    
    return {
      testName: 'Network Monitoring',
      success: true,
      message: `Network status detected: ${isConnected ? 'Connected' : 'Disconnected'}`,
      duration: Date.now() - startTime,
      details: { isConnected }
    };
  } catch (error) {
    return {
      testName: 'Network Monitoring',
      success: false,
      message: `Network monitoring failed: ${error}`,
      duration: Date.now() - startTime
    };
  }
};

/**
 * Test local database operations
 */
export const testLocalDatabase = async (): Promise<SyncTestResult> => {
  const startTime = Date.now();
  
  try {
    console.log('[SyncTest] Testing local database operations...');
    
    const db = await openDatabase();
    
    // Test batch creation
    const testBatch = await db.runAsync(`
      INSERT INTO photo_batches (userId, referenceId, orderNumber, status) 
      VALUES (?, ?, ?, ?)
    `, ['test-user', 'TEST-001', 'ORDER-001', 'pending']);
    
    if (!testBatch.lastInsertRowId) {
      throw new Error('Failed to create test batch');
    }
    
    // Test photo creation
    const testPhoto = await db.runAsync(`
      INSERT INTO photos (id, batchId, uri, metadataJson, syncStatus) 
      VALUES (?, ?, ?, ?, ?)
    `, ['test-photo-1', testBatch.lastInsertRowId, 'file://test.jpg', '{}', 'pending']);
    
    // Clean up test data
    await db.runAsync('DELETE FROM photos WHERE id = ?', ['test-photo-1']);
    await db.runAsync('DELETE FROM photo_batches WHERE id = ?', [testBatch.lastInsertRowId]);
    
    return {
      testName: 'Local Database',
      success: true,
      message: 'Database operations successful',
      duration: Date.now() - startTime,
      details: { batchId: testBatch.lastInsertRowId }
    };
  } catch (error) {
    return {
      testName: 'Local Database',
      success: false,
      message: `Database test failed: ${error}`,
      duration: Date.now() - startTime
    };
  }
};

/**
 * Test conflict resolution functionality
 */
export const testConflictResolution = async (): Promise<SyncTestResult> => {
  const startTime = Date.now();
  
  try {
    console.log('[SyncTest] Testing conflict resolution...');
    
    // Create mock local and remote data with conflicts
    const localData = {
      id: 1,
      status: 'completed',
      orderNumber: 'ORDER-001',
      updatedAt: new Date().toISOString()
    };
    
    const remoteData = {
      id: 1,
      status: 'pending',
      order_number: 'ORDER-002',
      updated_at: new Date(Date.now() - 60000).toISOString() // 1 minute ago
    };
    
    // Test conflict detection
    const conflicts = await conflictResolutionService.detectConflicts(localData, remoteData, 'batch');
    
    if (conflicts.length === 0) {
      throw new Error('Expected conflicts not detected');
    }
    
    // Test timestamp resolution
    const resolution = await conflictResolutionService.resolveByTimestamp(localData, remoteData, conflicts);
    
    if (!resolution.success) {
      throw new Error('Conflict resolution failed');
    }
    
    return {
      testName: 'Conflict Resolution',
      success: true,
      message: `Conflicts detected and resolved using ${resolution.strategy}`,
      duration: Date.now() - startTime,
      details: { 
        conflictsFound: conflicts.length,
        strategy: resolution.strategy,
        conflicts: conflicts
      }
    };
  } catch (error) {
    return {
      testName: 'Conflict Resolution',
      success: false,
      message: `Conflict resolution test failed: ${error}`,
      duration: Date.now() - startTime
    };
  }
};

/**
 * Test sync statistics and queue status
 */
export const testSyncStatistics = async (): Promise<SyncTestResult> => {
  const startTime = Date.now();
  
  try {
    console.log('[SyncTest] Testing sync statistics...');
    
    const stats = await getSyncStats();
    
    if (!stats || typeof stats.queueStatus === 'undefined') {
      throw new Error('Failed to retrieve sync statistics');
    }
    
    return {
      testName: 'Sync Statistics',
      success: true,
      message: 'Sync statistics retrieved successfully',
      duration: Date.now() - startTime,
      details: stats
    };
  } catch (error) {
    return {
      testName: 'Sync Statistics',
      success: false,
      message: `Sync statistics test failed: ${error}`,
      duration: Date.now() - startTime
    };
  }
};

/**
 * Test end-to-end sync workflow (if network is available)
 */
export const testEndToEndSync = async (): Promise<SyncTestResult> => {
  const startTime = Date.now();
  
  try {
    console.log('[SyncTest] Testing end-to-end sync workflow...');
    
    // Check network connectivity
    const isConnected = await isNetworkConnected();
    
    if (!isConnected) {
      return {
        testName: 'End-to-End Sync',
        success: true,
        message: 'Skipped - No network connection available',
        duration: Date.now() - startTime,
        details: { skipped: true, reason: 'offline' }
      };
    }
    
    // Test sync process
    const syncResult = await syncAllPendingData();
    
    return {
      testName: 'End-to-End Sync',
      success: syncResult.success,
      message: syncResult.message,
      duration: Date.now() - startTime,
      details: syncResult
    };
  } catch (error) {
    return {
      testName: 'End-to-End Sync',
      success: false,
      message: `End-to-end sync test failed: ${error}`,
      duration: Date.now() - startTime
    };
  }
};

/**
 * Run comprehensive sync test suite
 */
export const runSyncTestSuite = async (): Promise<SyncTestSuite> => {
  console.log('[SyncTest] Starting comprehensive sync test suite...');
  const suiteStartTime = Date.now();
  
  const tests = [
    testSupabaseConnection,
    testNetworkMonitoring,
    testLocalDatabase,
    testConflictResolution,
    testSyncStatistics,
    testEndToEndSync
  ];
  
  const results: SyncTestResult[] = [];
  let passedTests = 0;
  let failedTests = 0;
  
  for (const test of tests) {
    try {
      const result = await test();
      results.push(result);
      
      if (result.success) {
        passedTests++;
        console.log(`✅ ${result.testName}: ${result.message}`);
      } else {
        failedTests++;
        console.log(`❌ ${result.testName}: ${result.message}`);
      }
    } catch (error) {
      const failedResult: SyncTestResult = {
        testName: test.name,
        success: false,
        message: `Test execution failed: ${error}`,
        duration: 0
      };
      results.push(failedResult);
      failedTests++;
      console.log(`❌ ${test.name}: Test execution failed`);
    }
  }
  
  const totalDuration = Date.now() - suiteStartTime;
  const overallSuccess = failedTests === 0;
  
  const suite: SyncTestSuite = {
    totalTests: tests.length,
    passedTests,
    failedTests,
    results,
    overallSuccess,
    totalDuration
  };
  
  console.log(`[SyncTest] Test suite completed: ${passedTests}/${tests.length} tests passed`);
  console.log(`[SyncTest] Total duration: ${totalDuration}ms`);
  
  return suite;
};

/**
 * Generate test report
 */
export const generateTestReport = (suite: SyncTestSuite): string => {
  let report = `# Sync Test Suite Report\n\n`;
  report += `**Overall Result:** ${suite.overallSuccess ? '✅ PASSED' : '❌ FAILED'}\n`;
  report += `**Tests Passed:** ${suite.passedTests}/${suite.totalTests}\n`;
  report += `**Total Duration:** ${suite.totalDuration}ms\n\n`;
  
  report += `## Test Results\n\n`;
  
  for (const result of suite.results) {
    const status = result.success ? '✅' : '❌';
    report += `### ${status} ${result.testName}\n`;
    report += `- **Status:** ${result.success ? 'PASSED' : 'FAILED'}\n`;
    report += `- **Message:** ${result.message}\n`;
    report += `- **Duration:** ${result.duration}ms\n`;
    
    if (result.details) {
      report += `- **Details:** ${JSON.stringify(result.details, null, 2)}\n`;
    }
    
    report += `\n`;
  }
  
  return report;
};

export default {
  testSupabaseConnection,
  testNetworkMonitoring,
  testLocalDatabase,
  testConflictResolution,
  testSyncStatistics,
  testEndToEndSync,
  runSyncTestSuite,
  generateTestReport
};
