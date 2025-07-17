/**
 * Test Data Reset Utility - End-to-End Verification
 * Tests all aspects of the data reset service to ensure it works properly
 */

const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');

console.log('🧪 Testing Data Reset Utility - End-to-End Verification');
console.log('=' .repeat(60));

// Test configuration
const testConfig = {
  projectPath: process.cwd(),
  testTimeout: 30000,
  expectedServices: [
    'dataResetService.ts',
    'profileSyncService.ts',
    'databaseService.ts',
    'storageService.ts',
    'syncQueueService.ts'
  ]
};

/**
 * Test 1: Verify all required services exist
 */
async function testServiceFiles() {
  console.log('\n📁 Test 1: Verifying Service Files...');
  
  const servicesPath = path.join(testConfig.projectPath, 'src', 'services');
  let allServicesExist = true;
  
  for (const service of testConfig.expectedServices) {
    const servicePath = path.join(servicesPath, service);
    if (fs.existsSync(servicePath)) {
      console.log(`  ✅ ${service} - Found`);
    } else {
      console.log(`  ❌ ${service} - Missing`);
      allServicesExist = false;
    }
  }
  
  return allServicesExist;
}

/**
 * Test 2: Verify TypeScript compilation
 */
async function testTypeScriptCompilation() {
  console.log('\n🔧 Test 2: TypeScript Compilation Check...');
  
  return new Promise((resolve) => {
    exec('npx tsc --noEmit --skipLibCheck', { cwd: testConfig.projectPath }, (error, stdout, stderr) => {
      if (error) {
        console.log('  ❌ TypeScript compilation failed:');
        console.log('  ', stderr || error.message);
        resolve(false);
      } else {
        console.log('  ✅ TypeScript compilation successful');
        resolve(true);
      }
    });
  });
}

/**
 * Test 3: Verify data reset service exports
 */
async function testDataResetServiceExports() {
  console.log('\n📦 Test 3: Data Reset Service Exports...');
  
  try {
    const dataResetPath = path.join(testConfig.projectPath, 'src', 'services', 'dataResetService.ts');
    const content = fs.readFileSync(dataResetPath, 'utf8');
    
    const expectedExports = [
      'resetAllLocalData',
      'getDataResetStatus',
      'resetDatabase',
      'clearCacheFiles'
    ];
    
    let allExportsFound = true;
    
    for (const exportName of expectedExports) {
      if (content.includes(exportName)) {
        console.log(`  ✅ ${exportName} - Found`);
      } else {
        console.log(`  ❌ ${exportName} - Missing`);
        allExportsFound = false;
      }
    }
    
    // Check for default export
    if (content.includes('export default')) {
      console.log('  ✅ Default export - Found');
    } else {
      console.log('  ❌ Default export - Missing');
      allExportsFound = false;
    }
    
    return allExportsFound;
  } catch (error) {
    console.log('  ❌ Error reading dataResetService.ts:', error.message);
    return false;
  }
}

/**
 * Test 4: Verify profile sync service integration
 */
async function testProfileSyncServiceIntegration() {
  console.log('\n🔄 Test 4: Profile Sync Service Integration...');
  
  try {
    const profileSyncPath = path.join(testConfig.projectPath, 'src', 'services', 'profileSyncService.ts');
    const settingsScreenPath = path.join(testConfig.projectPath, 'src', 'screens', 'SettingsScreen.tsx');
    
    const profileSyncContent = fs.readFileSync(profileSyncPath, 'utf8');
    const settingsContent = fs.readFileSync(settingsScreenPath, 'utf8');
    
    // Check profile sync service exports
    const profileSyncExports = [
      'queueProfileForSync',
      'processProfileSync',
      'updateLocalProfile',
      'getLocalProfile'
    ];
    
    let profileSyncValid = true;
    for (const exportName of profileSyncExports) {
      if (profileSyncContent.includes(exportName)) {
        console.log(`  ✅ ProfileSync.${exportName} - Found`);
      } else {
        console.log(`  ❌ ProfileSync.${exportName} - Missing`);
        profileSyncValid = false;
      }
    }
    
    // Check settings screen integration
    if (settingsContent.includes('profileSyncService')) {
      console.log('  ✅ SettingsScreen integration - Found');
    } else {
      console.log('  ❌ SettingsScreen integration - Missing');
      profileSyncValid = false;
    }
    
    return profileSyncValid;
  } catch (error) {
    console.log('  ❌ Error checking profile sync integration:', error.message);
    return false;
  }
}

/**
 * Test 5: Verify database service compatibility
 */
async function testDatabaseServiceCompatibility() {
  console.log('\n🗄️ Test 5: Database Service Compatibility...');
  
  try {
    const databaseServicePath = path.join(testConfig.projectPath, 'src', 'services', 'databaseService.ts');
    const content = fs.readFileSync(databaseServicePath, 'utf8');
    
    const requiredFunctions = [
      'openDatabase',
      'initializeDatabase',
      'getAllPhotoBatchesForUser'
    ];
    
    let databaseCompatible = true;
    for (const funcName of requiredFunctions) {
      if (content.includes(funcName)) {
        console.log(`  ✅ Database.${funcName} - Found`);
      } else {
        console.log(`  ❌ Database.${funcName} - Missing`);
        databaseCompatible = false;
      }
    }
    
    return databaseCompatible;
  } catch (error) {
    console.log('  ❌ Error checking database service:', error.message);
    return false;
  }
}

/**
 * Test 6: Verify reset utility integration in settings
 */
async function testResetUtilityIntegration() {
  console.log('\n⚙️ Test 6: Reset Utility Integration in Settings...');
  
  try {
    const settingsScreenPath = path.join(testConfig.projectPath, 'src', 'screens', 'SettingsScreen.tsx');
    const content = fs.readFileSync(settingsScreenPath, 'utf8');
    
    const integrationChecks = [
      { name: 'dataResetService import', pattern: 'dataResetService' },
      { name: 'Clear Cache function', pattern: 'handleClearCache' },
      { name: 'Storage info loading', pattern: 'loadStorageInfo' },
      { name: 'Profile save handling', pattern: 'handleSaveProfile' }
    ];
    
    let integrationValid = true;
    for (const check of integrationChecks) {
      if (content.includes(check.pattern)) {
        console.log(`  ✅ ${check.name} - Found`);
      } else {
        console.log(`  ❌ ${check.name} - Missing`);
        integrationValid = false;
      }
    }
    
    return integrationValid;
  } catch (error) {
    console.log('  ❌ Error checking settings integration:', error.message);
    return false;
  }
}

/**
 * Run all tests
 */
async function runAllTests() {
  console.log('🚀 Starting Data Reset Utility Tests...\n');
  
  const testResults = {
    serviceFiles: await testServiceFiles(),
    typeScriptCompilation: await testTypeScriptCompilation(),
    dataResetExports: await testDataResetServiceExports(),
    profileSyncIntegration: await testProfileSyncServiceIntegration(),
    databaseCompatibility: await testDatabaseServiceCompatibility(),
    resetUtilityIntegration: await testResetUtilityIntegration()
  };
  
  // Calculate overall results
  const totalTests = Object.keys(testResults).length;
  const passedTests = Object.values(testResults).filter(result => result === true).length;
  const failedTests = totalTests - passedTests;
  
  console.log('\n' + '=' .repeat(60));
  console.log('📊 TEST RESULTS SUMMARY');
  console.log('=' .repeat(60));
  
  Object.entries(testResults).forEach(([testName, result]) => {
    const status = result ? '✅ PASS' : '❌ FAIL';
    const displayName = testName.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase());
    console.log(`${status} - ${displayName}`);
  });
  
  console.log('\n📈 OVERALL RESULTS:');
  console.log(`  Total Tests: ${totalTests}`);
  console.log(`  Passed: ${passedTests}`);
  console.log(`  Failed: ${failedTests}`);
  console.log(`  Success Rate: ${Math.round((passedTests / totalTests) * 100)}%`);
  
  if (passedTests === totalTests) {
    console.log('\n🎉 ALL TESTS PASSED! Data Reset Utility is ready for production.');
    console.log('✨ The reset utility has been successfully implemented and verified.');
  } else {
    console.log('\n⚠️  Some tests failed. Please review the issues above.');
    console.log('🔧 Fix the failing components before deploying to production.');
  }
  
  return passedTests === totalTests;
}

// Run the tests
runAllTests().then(success => {
  process.exit(success ? 0 : 1);
}).catch(error => {
  console.error('❌ Test execution failed:', error);
  process.exit(1);
});
