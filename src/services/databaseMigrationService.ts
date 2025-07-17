import * as SQLite from 'expo-sqlite';

const DB_VERSION = 2; // Increment this when schema changes

interface Migration {
  version: number;
  description: string;
  up: (db: SQLite.SQLiteDatabase) => Promise<void>;
}

/**
 * Database migration system to handle schema changes safely
 */
export class DatabaseMigrationService {
  private static migrations: Migration[] = [
    {
      version: 1,
      description: 'Initial schema with basic tables',
      up: async (db: SQLite.SQLiteDatabase) => {
        await db.execAsync(`
          PRAGMA journal_mode = WAL;
          PRAGMA foreign_keys = ON;

          CREATE TABLE IF NOT EXISTS photo_batches (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            referenceId TEXT,
            orderNumber TEXT,
            inventoryId TEXT,
            userId TEXT NOT NULL,
            createdAt TEXT DEFAULT CURRENT_TIMESTAMP,
            updatedAt TEXT DEFAULT CURRENT_TIMESTAMP,
            status TEXT DEFAULT 'pending',
            syncStatus TEXT DEFAULT 'pending',
            lastSyncAttempt TEXT,
            syncError TEXT
          );

          CREATE TABLE IF NOT EXISTS photos (
            id TEXT PRIMARY KEY,
            batchId INTEGER NOT NULL,
            partNumber TEXT,
            photoTitle TEXT,
            uri TEXT NOT NULL,
            annotationUri TEXT,
            metadataJson TEXT NOT NULL,
            annotationsJson TEXT,
            syncStatus TEXT DEFAULT 'pending',
            lastSyncAttempt TEXT,
            syncError TEXT,
            createdAt TEXT DEFAULT CURRENT_TIMESTAMP,
            updatedAt TEXT DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (batchId) REFERENCES photo_batches (id) ON DELETE CASCADE
          );

          -- Performance indexes
          CREATE INDEX IF NOT EXISTS idx_photos_batchId ON photos(batchId);
          CREATE INDEX IF NOT EXISTS idx_batches_status ON photo_batches(status);
          CREATE INDEX IF NOT EXISTS idx_batches_syncStatus ON photo_batches(syncStatus);
          CREATE INDEX IF NOT EXISTS idx_photos_syncStatus ON photos(syncStatus);
          CREATE INDEX IF NOT EXISTS idx_batches_userId ON photo_batches(userId);
          CREATE INDEX IF NOT EXISTS idx_batches_createdAt ON photo_batches(createdAt);
        `);
      }
    },
    {
      version: 2,
      description: 'Add companies and multi-tenant support',
      up: async (db: SQLite.SQLiteDatabase) => {
        // Add companies table
        await db.execAsync(`
          CREATE TABLE IF NOT EXISTS companies (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            code TEXT UNIQUE NOT NULL,
            industry TEXT NOT NULL,
            address TEXT,
            phone TEXT,
            email TEXT,
            website TEXT,
            logoUrl TEXT,
            settings TEXT NOT NULL,
            subscription TEXT NOT NULL,
            isActive INTEGER DEFAULT 1,
            createdAt TEXT DEFAULT CURRENT_TIMESTAMP,
            updatedAt TEXT DEFAULT CURRENT_TIMESTAMP,
            syncStatus TEXT DEFAULT 'pending',
            lastSyncAt TEXT,
            version INTEGER DEFAULT 1
          );
        `);

        // Add company_users table
        await db.execAsync(`
          CREATE TABLE IF NOT EXISTS company_users (
            id TEXT PRIMARY KEY,
            companyId TEXT NOT NULL,
            userId TEXT NOT NULL,
            role TEXT NOT NULL CHECK (role IN ('owner', 'admin', 'manager', 'member', 'guest')),
            permissions TEXT NOT NULL,
            department TEXT,
            title TEXT,
            invitedBy TEXT NOT NULL,
            joinedAt TEXT DEFAULT CURRENT_TIMESTAMP,
            lastActiveAt TEXT DEFAULT CURRENT_TIMESTAMP,
            isActive INTEGER DEFAULT 1,
            syncStatus TEXT DEFAULT 'pending',
            lastSyncAt TEXT,
            version INTEGER DEFAULT 1,
            FOREIGN KEY (companyId) REFERENCES companies (id) ON DELETE CASCADE,
            UNIQUE(companyId, userId)
          );
        `);

        // Add companyId to existing tables if not exists
        try {
          await db.execAsync(`ALTER TABLE photo_batches ADD COLUMN companyId TEXT;`);
        } catch (error: any) {
          // Column might already exist, ignore duplicate column error
          if (!error.message?.includes('duplicate column')) {
            throw error;
          }
        }
        
        try {
          await db.execAsync(`ALTER TABLE photos ADD COLUMN companyId TEXT;`);
        } catch (error: any) {
          // Column might already exist, ignore duplicate column error
          if (!error.message?.includes('duplicate column')) {
            throw error;
          }
        }

        // Create indexes
        await db.execAsync(`
          CREATE INDEX IF NOT EXISTS idx_companies_code ON companies (code);
          CREATE INDEX IF NOT EXISTS idx_companies_active ON companies (isActive);
          CREATE INDEX IF NOT EXISTS idx_company_users_company ON company_users (companyId);
          CREATE INDEX IF NOT EXISTS idx_company_users_user ON company_users (userId);
          CREATE INDEX IF NOT EXISTS idx_batches_company ON photo_batches (companyId);
          CREATE INDEX IF NOT EXISTS idx_photos_company ON photos (companyId);
        `);
      }
    }
  ];

  /**
   * Get current database version
   */
  private static async getCurrentVersion(db: SQLite.SQLiteDatabase): Promise<number> {
    try {
      // First check if db_version table exists
      const tableExists = await db.getFirstAsync<{ count: number }>(`
        SELECT COUNT(*) as count FROM sqlite_master 
        WHERE type='table' AND name='db_version'
      `);

      if (!tableExists || tableExists.count === 0) {
        console.log('[Migration] db_version table does not exist, assuming version 0');
        return 0;
      }

      // Table exists, try to get version
      const result = await db.getFirstAsync<{ version: number }>(`
        SELECT version FROM db_version ORDER BY version DESC LIMIT 1
      `);

      return result?.version || 0;
    } catch (error) {
      console.log('[Migration] Error getting version, assuming version 0:', error);
      return 0;
    }
  }

  /**
   * Set database version
   */
  private static async setVersion(db: SQLite.SQLiteDatabase, version: number): Promise<void> {
    // Ensure db_version table exists before trying to insert
    await db.execAsync(`
      CREATE TABLE IF NOT EXISTS db_version (
        version INTEGER PRIMARY KEY
      );
    `);
    
    // Use INSERT OR REPLACE to avoid UNIQUE constraint failures
    await db.runAsync(`INSERT OR REPLACE INTO db_version (version) VALUES (?);`, [version]);
  }

  /**
   * Run all pending migrations
   */
  public static async migrate(db: SQLite.SQLiteDatabase): Promise<void> {
    console.log('[Migration] Starting database migration...');
    
    const currentVersion = await this.getCurrentVersion(db);
    console.log(`[Migration] Current database version: ${currentVersion}`);
    console.log(`[Migration] Target database version: ${DB_VERSION}`);

    if (currentVersion >= DB_VERSION) {
      console.log('[Migration] Database is up to date');
      return;
    }

    // Run migrations in order
    for (const migration of this.migrations) {
      if (migration.version > currentVersion) {
        console.log(`[Migration] Running migration ${migration.version}: ${migration.description}`);
        
        try {
          await migration.up(db);
          await this.setVersion(db, migration.version);
          console.log(`[Migration] Migration ${migration.version} completed successfully`);
        } catch (error) {
          console.error(`[Migration] Migration ${migration.version} failed:`, error);
          throw error;
        }
      }
    }

    console.log('[Migration] All migrations completed successfully');
  }

  /**
   * Check if database needs migration
   */
  public static async needsMigration(db: SQLite.SQLiteDatabase): Promise<boolean> {
    const currentVersion = await this.getCurrentVersion(db);
    return currentVersion < DB_VERSION;
  }

  /**
   * Reset database (for development/testing)
   */
  public static async resetDatabase(db: SQLite.SQLiteDatabase): Promise<void> {
    console.log('[Migration] Resetting database...');
    
    try {
      // Drop all tables safely
      await db.execAsync(`
        DROP TABLE IF EXISTS photos;
        DROP TABLE IF EXISTS photo_batches;
        DROP TABLE IF EXISTS companies;
        DROP TABLE IF EXISTS company_users;
        DROP TABLE IF EXISTS company_invitations;
        DROP TABLE IF EXISTS sync_queue;
        DROP TABLE IF EXISTS sync_conflicts;
        DROP TABLE IF EXISTS user_sessions;
        DROP TABLE IF EXISTS device_registrations;
        DROP TABLE IF EXISTS license_usage;
        DROP TABLE IF EXISTS user_licenses;
        DROP TABLE IF EXISTS user_roles;
        DROP TABLE IF EXISTS license_validation_cache;
        DROP TABLE IF EXISTS batch_templates;
        DROP TABLE IF EXISTS batch_approvals;
        DROP TABLE IF EXISTS batch_comments;
        DROP TABLE IF EXISTS db_version;
      `);

      // Create db_version table and set to 0
      await db.execAsync(`
        CREATE TABLE IF NOT EXISTS db_version (
          version INTEGER PRIMARY KEY
        );
      `);
      
      // Use INSERT OR REPLACE to avoid UNIQUE constraint failures
      await db.runAsync(`INSERT OR REPLACE INTO db_version (version) VALUES (?);`, [0]);

      // Run all migrations from scratch
      await this.migrate(db);
      
      console.log('[Migration] Database reset completed successfully');
    } catch (error) {
      console.error('[Migration] Error during database reset:', error);
      throw error;
    }
  }
}

export default DatabaseMigrationService;
