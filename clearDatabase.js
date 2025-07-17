#!/usr/bin/env node

/**
 * Database Clear Script - Remove old local data structures
 */

const fs = require('fs');
const path = require('path');

console.log('🗄️ Clearing Local Database - Remove Old Structures');
console.log('============================================================');

// Clear SQLite database files
const dbPaths = [
  './aviation_qc.db',
  './aviation_qc.db-journal',
  './aviation_qc.db-wal',
  './aviation_qc.db-shm',
  './database.db',
  './database.db-journal',
  './database.db-wal',
  './database.db-shm'
];

let clearedFiles = 0;
dbPaths.forEach(dbPath => {
  if (fs.existsSync(dbPath)) {
    try {
      fs.unlinkSync(dbPath);
      console.log(`✅ Removed: ${dbPath}`);
      clearedFiles++;
    } catch (error) {
      console.log(`❌ Failed to remove ${dbPath}:`, error.message);
    }
  }
});

// Clear cache directories
const cacheDirs = [
  './cache',
  './tmp',
  './.expo/cache',
  './node_modules/.cache'
];

cacheDirs.forEach(cacheDir => {
  if (fs.existsSync(cacheDir)) {
    try {
      fs.rmSync(cacheDir, { recursive: true, force: true });
      console.log(`✅ Cleared cache directory: ${cacheDir}`);
      clearedFiles++;
    } catch (error) {
      console.log(`❌ Failed to clear ${cacheDir}:`, error.message);
    }
  }
});

console.log(`\n📊 Database Clear Summary:`);
console.log(`   Files/Directories Cleared: ${clearedFiles}`);
console.log(`   ✅ Old database structures removed`);
console.log(`   ✅ Cache directories cleared`);
console.log(`   🚀 Ready for fresh database initialization`);
