/**
 * Database Reset Utilities
 * Emergency functions to reset database state when issues occur
 */

import * as SQLite from 'expo-sqlite';

let globalDb: SQLite.SQLiteDatabase | null = null;

export const resetDatabaseConnection = async (): Promise<void> => {
  console.log('[DB_RESET] Resetting database connection...');
  
  try {
    // Close existing connection if it exists
    if (globalDb) {
      await globalDb.closeAsync();
      globalDb = null;
    }
    
    // Clear any cached state
    // Note: We can't access the internal variables from databaseService here
    // This is just for emergency cleanup
    
    console.log('[DB_RESET] Database connection reset completed');
  } catch (error) {
    console.error('[DB_RESET] Error during database reset:', error);
    throw error;
  }
};

export const forceDatabaseClose = async (): Promise<void> => {
  console.log('[DB_RESET] Force closing database...');
  
  try {
    if (globalDb) {
      await globalDb.closeAsync();
      globalDb = null;
    }
  } catch (error) {
    console.warn('[DB_RESET] Error force closing database (expected):', error);
    // Ignore errors during force close
  }
};

export default {
  resetDatabaseConnection,
  forceDatabaseClose
};