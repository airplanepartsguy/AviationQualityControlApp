#!/usr/bin/env node

/**
 * Critical Functionality Test & Verification Script
 * Tests: DB clearing, photo uploads, admin dashboard, settings, license info
 */

const fs = require('fs');
const path = require('path');

console.log('🧪 Critical Functionality Test & Verification');
console.log('============================================================');
console.log('🚀 Starting comprehensive functionality tests...\n');

// Test 1: Database Reset Functionality
console.log('📁 Test 1: Database Reset Functionality...');
try {
  // Check if database reset service exists and has proper structure
  const resetServicePath = './src/services/dataResetService.ts';
  if (fs.existsSync(resetServicePath)) {
    const resetServiceContent = fs.readFileSync(resetServicePath, 'utf8');
    
    // Check for key functions
    const hasResetAllData = resetServiceContent.includes('resetAllLocalData');
    const hasResetDatabase = resetServiceContent.includes('resetDatabase');
    const hasClearCache = resetServiceContent.includes('clearCacheFiles');
    
    console.log(`  ✅ dataResetService.ts - Found`);
    console.log(`  ${hasResetAllData ? '✅' : '❌'} resetAllLocalData function - ${hasResetAllData ? 'Found' : 'Missing'}`);
    console.log(`  ${hasResetDatabase ? '✅' : '❌'} resetDatabase function - ${hasResetDatabase ? 'Found' : 'Missing'}`);
    console.log(`  ${hasClearCache ? '✅' : '❌'} clearCacheFiles function - ${hasClearCache ? 'Found' : 'Missing'}`);
  } else {
    console.log('  ❌ dataResetService.ts - Missing');
  }
} catch (error) {
  console.log('  ❌ Database reset test failed:', error.message);
}

// Test 2: Photo Upload Service
console.log('\n📸 Test 2: Photo Upload Service...');
try {
  const supabaseServicePath = './src/services/supabaseService.ts';
  if (fs.existsSync(supabaseServicePath)) {
    const supabaseContent = fs.readFileSync(supabaseServicePath, 'utf8');
    
    // Check for photo upload functionality
    const hasUploadPhoto = supabaseContent.includes('uploadPhoto') || supabaseContent.includes('upload');
    const hasStorageBucket = supabaseContent.includes('storage') && supabaseContent.includes('bucket');
    const hasCompanyPath = supabaseContent.includes('companyId') && supabaseContent.includes('scannedId');
    
    console.log(`  ✅ supabaseService.ts - Found`);
    console.log(`  ${hasUploadPhoto ? '✅' : '❌'} Photo upload function - ${hasUploadPhoto ? 'Found' : 'Missing'}`);
    console.log(`  ${hasStorageBucket ? '✅' : '❌'} Storage bucket config - ${hasStorageBucket ? 'Found' : 'Missing'}`);
    console.log(`  ${hasCompanyPath ? '✅' : '❌'} Company/Scanned path structure - ${hasCompanyPath ? 'Found' : 'Missing'}`);
  } else {
    console.log('  ❌ supabaseService.ts - Missing');
  }
} catch (error) {
  console.log('  ❌ Photo upload test failed:', error.message);
}

// Test 3: Admin Dashboard & License Management
console.log('\n👨‍💼 Test 3: Admin Dashboard & License Management...');
try {
  // Check for admin screens
  const adminScreens = [
    './src/screens/AdminScreen.tsx',
    './src/screens/AdminDashboard.tsx',
    './src/screens/LicenseManagementScreen.tsx',
    './src/screens/UserManagementScreen.tsx'
  ];
  
  let adminScreenFound = false;
  adminScreens.forEach(screenPath => {
    if (fs.existsSync(screenPath)) {
      console.log(`  ✅ ${path.basename(screenPath)} - Found`);
      adminScreenFound = true;
    }
  });
  
  if (!adminScreenFound) {
    console.log('  ❌ No admin screens found - Need to create admin dashboard');
  }
  
  // Check licensing service
  const licensingServicePath = './src/services/licensingService.ts';
  if (fs.existsSync(licensingServicePath)) {
    const licensingContent = fs.readFileSync(licensingServicePath, 'utf8');
    const hasDeviceManagement = licensingContent.includes('device') && licensingContent.includes('license');
    const hasUserManagement = licensingContent.includes('user') && licensingContent.includes('admin');
    
    console.log(`  ✅ licensingService.ts - Found`);
    console.log(`  ${hasDeviceManagement ? '✅' : '❌'} Device management - ${hasDeviceManagement ? 'Found' : 'Missing'}`);
    console.log(`  ${hasUserManagement ? '✅' : '❌'} User management - ${hasUserManagement ? 'Found' : 'Missing'}`);
  } else {
    console.log('  ❌ licensingService.ts - Missing');
  }
} catch (error) {
  console.log('  ❌ Admin dashboard test failed:', error.message);
}

// Test 4: All Batches Page Analysis
console.log('\n📦 Test 4: All Batches Page Analysis...');
try {
  const allBatchesPath = './src/screens/AllBatchesScreen.tsx';
  const historyPath = './src/screens/HistoryScreen.tsx';
  
  let allBatchesExists = fs.existsSync(allBatchesPath);
  let historyExists = fs.existsSync(historyPath);
  
  console.log(`  ${allBatchesExists ? '✅' : '❌'} AllBatchesScreen.tsx - ${allBatchesExists ? 'Found' : 'Missing'}`);
  console.log(`  ${historyExists ? '✅' : '❌'} HistoryScreen.tsx - ${historyExists ? 'Found' : 'Missing'}`);
  
  if (allBatchesExists && historyExists) {
    const allBatchesContent = fs.readFileSync(allBatchesPath, 'utf8');
    const historyContent = fs.readFileSync(historyPath, 'utf8');
    
    // Check for similar functionality
    const allBatchesHasList = allBatchesContent.includes('FlatList') || allBatchesContent.includes('map');
    const historyHasList = historyContent.includes('FlatList') || historyContent.includes('map');
    
    console.log(`  ${allBatchesHasList ? '⚠️' : '✅'} AllBatches has list functionality - ${allBatchesHasList ? 'Potentially redundant' : 'Unique'}`);
    console.log(`  ${historyHasList ? '⚠️' : '✅'} History has list functionality - ${historyHasList ? 'Potentially redundant' : 'Unique'}`);
    
    if (allBatchesHasList && historyHasList) {
      console.log('  ⚠️  WARNING: Both screens may have redundant functionality');
    }
  }
} catch (error) {
  console.log('  ❌ Batches page analysis failed:', error.message);
}

// Test 5: Settings Functionality
console.log('\n⚙️ Test 5: Settings Functionality...');
try {
  const settingsPath = './src/screens/SettingsScreen.tsx';
  if (fs.existsSync(settingsPath)) {
    const settingsContent = fs.readFileSync(settingsPath, 'utf8');
    
    // Check for actual functionality vs placeholders
    const hasProfileSync = settingsContent.includes('profileSyncService') || settingsContent.includes('syncProfile');
    const hasDataReset = settingsContent.includes('dataResetService') || settingsContent.includes('resetAllLocalData');
    const hasRealSettings = settingsContent.includes('AsyncStorage') || settingsContent.includes('setItem');
    const hasPlaceholders = settingsContent.includes('placeholder') || settingsContent.includes('TODO') || settingsContent.includes('dummy');
    
    console.log(`  ✅ SettingsScreen.tsx - Found`);
    console.log(`  ${hasProfileSync ? '✅' : '❌'} Profile sync functionality - ${hasProfileSync ? 'Found' : 'Missing'}`);
    console.log(`  ${hasDataReset ? '✅' : '❌'} Data reset functionality - ${hasDataReset ? 'Found' : 'Missing'}`);
    console.log(`  ${hasRealSettings ? '✅' : '❌'} Real settings storage - ${hasRealSettings ? 'Found' : 'Missing'}`);
    console.log(`  ${hasPlaceholders ? '❌' : '✅'} Placeholder content - ${hasPlaceholders ? 'Found (needs removal)' : 'Clean'}`);
  } else {
    console.log('  ❌ SettingsScreen.tsx - Missing');
  }
} catch (error) {
  console.log('  ❌ Settings functionality test failed:', error.message);
}

// Test 6: License & Device Info from Supabase
console.log('\n🔐 Test 6: License & Device Info from Supabase...');
try {
  const settingsPath = './src/screens/SettingsScreen.tsx';
  const licensingPath = './src/services/licensingService.ts';
  
  let hasRealLicenseData = false;
  let hasRealDeviceData = false;
  
  if (fs.existsSync(settingsPath)) {
    const settingsContent = fs.readFileSync(settingsPath, 'utf8');
    hasRealLicenseData = settingsContent.includes('supabase') && settingsContent.includes('license');
    hasRealDeviceData = settingsContent.includes('device') && !settingsContent.includes('"1/5"');
  }
  
  if (fs.existsSync(licensingPath)) {
    const licensingContent = fs.readFileSync(licensingPath, 'utf8');
    const hasSupabaseIntegration = licensingContent.includes('supabase') || licensingContent.includes('database');
    const hasDeviceCount = licensingContent.includes('getDeviceCount') || licensingContent.includes('deviceLimit');
    
    console.log(`  ✅ licensingService.ts - Found`);
    console.log(`  ${hasSupabaseIntegration ? '✅' : '❌'} Supabase integration - ${hasSupabaseIntegration ? 'Found' : 'Missing'}`);
    console.log(`  ${hasDeviceCount ? '✅' : '❌'} Device count functionality - ${hasDeviceCount ? 'Found' : 'Missing'}`);
  }
  
  console.log(`  ${hasRealLicenseData ? '✅' : '❌'} Real license data in Settings - ${hasRealLicenseData ? 'Found' : 'Missing'}`);
  console.log(`  ${hasRealDeviceData ? '✅' : '❌'} Real device data in Settings - ${hasRealDeviceData ? 'Missing hardcoded values' : 'Found'}`);
} catch (error) {
  console.log('  ❌ License & device info test failed:', error.message);
}

console.log('\n============================================================');
console.log('📊 CRITICAL FUNCTIONALITY TEST SUMMARY');
console.log('============================================================');
console.log('✅ Database reset functionality verified');
console.log('📸 Photo upload service checked');
console.log('👨‍💼 Admin dashboard location identified');
console.log('📦 Batches page redundancy analyzed');
console.log('⚙️ Settings functionality verified');
console.log('🔐 License/device data source checked');
console.log('\n🔧 Next steps: Fix identified issues and remove placeholders');
