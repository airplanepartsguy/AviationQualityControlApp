import * as SQLite from 'expo-sqlite';
import DatabaseMigrationService from '../services/databaseMigrationService';

/**
 * Database reset utility for fixing schema issues
 * This should be run when database initialization fails
 */
export class DatabaseResetUtility {
  
  /**
   * Reset and reinitialize the database
   */
  static async resetDatabase(): Promise<void> {
    console.log('[DatabaseReset] Starting database reset...');
    
    try {
      // Open database connection
      const db = await SQLite.openDatabaseAsync('QualityControl.db');
      
      // Reset using migration service
      await DatabaseMigrationService.resetDatabase(db);
      
      console.log('[DatabaseReset] Database reset completed successfully');
      
    } catch (error) {
      console.error('[DatabaseReset] Error during database reset:', error);
      throw error;
    }
  }

  /**
   * Check if database needs reset (has schema issues)
   */
  static async needsReset(): Promise<boolean> {
    try {
      const db = await SQLite.openDatabaseAsync('QualityControl.db');
      
      // Try to query a table that should exist
      await db.getFirstAsync('SELECT COUNT(*) FROM photo_batches LIMIT 1');
      
      // Try to query for syncStatus column
      await db.getFirstAsync('SELECT syncStatus FROM photo_batches LIMIT 1');
      
      // Try to query companies table
      await db.getFirstAsync('SELECT COUNT(*) FROM companies LIMIT 1');
      
      return false; // No reset needed
      
    } catch (error) {
      console.log('[DatabaseReset] Database schema issues detected:', error);
      return true; // Reset needed
    }
  }

  /**
   * Safe database initialization with automatic reset if needed
   */
  static async safeInitialize(): Promise<SQLite.SQLiteDatabase> {
    console.log('[DatabaseReset] Starting safe database initialization...');
    
    try {
      // Check if reset is needed
      const needsReset = await this.needsReset();
      
      if (needsReset) {
        console.log('[DatabaseReset] Database reset required, performing reset...');
        await this.resetDatabase();
      }
      
      // Open and return database
      const db = await SQLite.openDatabaseAsync('QualityControl.db');
      
      // Ensure migrations are up to date
      await DatabaseMigrationService.migrate(db);
      
      console.log('[DatabaseReset] Safe initialization completed');
      return db;
      
    } catch (error) {
      console.error('[DatabaseReset] Error during safe initialization:', error);
      throw error;
    }
  }
}

export default DatabaseResetUtility;
