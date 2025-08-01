import * as SQLite from 'expo-sqlite';
import * as FileSystem from 'expo-file-system';
import { PhotoBatch, PhotoData, PhotoMetadata, AnnotationData } from '../types/data';
import DatabaseMigrationService from './databaseMigrationService';
import DatabaseResetUtility from '../utils/databaseReset';
import { errorLogger } from '../utils/errorLogger';

// Global database instance to prevent multiple connections
let globalDb: SQLite.SQLiteDatabase | null = null;
let dbOpenPromise: Promise<SQLite.SQLiteDatabase> | null = null;

// Opens the database with connection management and timeout protection
export const openDatabase = async (): Promise<SQLite.SQLiteDatabase> => {
  console.log('[DB_DEBUG] openDatabase: Called');
  
  // If we already have a database instance, return it
  if (globalDb) {
    console.log('[DB_DEBUG] openDatabase: Using existing database instance');
    return globalDb;
  }
  
  // If there's already a pending open operation, wait for it
  if (dbOpenPromise) {
    console.log('[DB_DEBUG] openDatabase: Waiting for existing open operation');
    return dbOpenPromise;
  }
  
  console.log('[DB_DEBUG] openDatabase: Creating new database connection');
  
  // Create a new open operation with timeout protection
  dbOpenPromise = Promise.race([
    (async () => {
      try {
        console.log('[DB_DEBUG] openDatabase: Opening SQLite database file');
        const db = await SQLite.openDatabaseAsync('LocalPhotoDatabase.db');
        console.log('[DB_DEBUG] openDatabase: SQLite database opened successfully');
        
        // Set WAL mode for better concurrency
        console.log('[DB_DEBUG] openDatabase: Setting WAL mode');
        await db.execAsync('PRAGMA journal_mode = WAL');
        console.log('[DB_DEBUG] openDatabase: WAL mode set successfully');
        
        // Set busy timeout to handle locking (increased from 5 to 30 seconds)
        console.log('[DB_DEBUG] openDatabase: Setting busy timeout');
        await db.execAsync('PRAGMA busy_timeout = 30000');
        console.log('[DB_DEBUG] openDatabase: Busy timeout set successfully');
        
        // Run basic table setup (core tables only)
        console.log('[DB_DEBUG] openDatabase: Setting up core tables');
        await setupCoreTablesOnly(db);
        console.log('[DB_DEBUG] openDatabase: Core tables ready');
        
        globalDb = db;
        dbOpenPromise = null; // Clear the promise
        console.log('[DB_DEBUG] openDatabase: Database ready for immediate use');
        
        // Start full initialization in background (non-blocking)
        console.log('[DB_DEBUG] openDatabase: Starting background initialization');
        initializeFullDatabase(db).catch(error => {
          console.error('[DB_DEBUG] Background initialization failed:', error);
          // Don't fail the main database connection for background initialization failures
        });
        
        return db;
      } catch (error) {
        console.error('[DB_DEBUG] openDatabase: Error during database opening:', error);
        dbOpenPromise = null; // Clear the promise on error
        
        // Log database connection errors
        errorLogger.logDatabaseError(
          error instanceof Error ? error : new Error('Database connection failed'),
          'openDatabase',
          { operation: 'database_connection', additionalData: { phase: 'connection' } }
        );
        
        throw error;
      }
    })(),
    new Promise<never>((_, reject) => 
      setTimeout(() => {
        const timeoutError = new Error('Database open timeout - please try restarting the app');
        console.error('[DB_DEBUG] openDatabase: Database open operation timed out after 30 seconds');
        dbOpenPromise = null; // Clear the promise on timeout
        
        // Log timeout errors
        errorLogger.logDatabaseError(timeoutError, 'openDatabase', { 
          operation: 'database_timeout',
          additionalData: { phase: 'timeout', timeoutDuration: 30000 }
        });
        
        reject(timeoutError);
      }, 30000) // Increased from 15 to 30 seconds
    )
  ]);
  
  return dbOpenPromise;
};

// Setup only the core tables needed for basic operations (fast)
const setupCoreTablesOnly = async (database: SQLite.SQLiteDatabase): Promise<void> => {
  console.log('[DB_DEBUG] setupCoreTablesOnly: Setting up essential tables...');
  
  try {
    // Run minimal migrations first
    await DatabaseMigrationService.migrate(database);
    
    // Create only the essential tables
    await database.execAsync(`
      -- Core photo batches table
      CREATE TABLE IF NOT EXISTS photo_batches (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        referenceId TEXT,
        orderNumber TEXT,
        inventoryId TEXT,
        userId TEXT NOT NULL,
        createdAt TEXT DEFAULT CURRENT_TIMESTAMP,
        status TEXT DEFAULT 'pending',
        companyId TEXT
      );

      -- Core photos table  
      CREATE TABLE IF NOT EXISTS photos (
        id TEXT PRIMARY KEY,
        batchId INTEGER NOT NULL,
        partNumber TEXT,
        photoTitle TEXT,
        uri TEXT NOT NULL,
        metadataJson TEXT NOT NULL,
        annotationsJson TEXT,
        syncStatus TEXT DEFAULT 'pending',
        lastSyncAttempt TEXT,
        syncError TEXT,
        supabaseUrl TEXT,
        createdAt TEXT DEFAULT CURRENT_TIMESTAMP,
        updatedAt TEXT DEFAULT CURRENT_TIMESTAMP,
        companyId TEXT,
        FOREIGN KEY (batchId) REFERENCES photo_batches (id)
      );
    `);
    
    console.log('[DB_DEBUG] setupCoreTablesOnly: Core tables created successfully');
  } catch (error) {
    console.error('[DB_DEBUG] setupCoreTablesOnly: Error setting up core tables:', error);
    throw error;
  }
};

// Full database initialization (runs in background, non-blocking)
const initializeFullDatabase = async (database: SQLite.SQLiteDatabase): Promise<void> => {
  console.log('[DB_DEBUG] initializeFullDatabase: Starting background initialization...');
  
  try {
    // Setup all remaining tables
    await setupDatabaseTables(database);
    
    console.log('[DB_DEBUG] initializeFullDatabase: Full initialization completed successfully');
  } catch (error) {
    console.error('[DB_DEBUG] initializeFullDatabase: Error during full initialization:', error);
    // Don't throw - this is background initialization
  }
};

// Initialize database tables and migrations (legacy function, now calls full init)
const initializeDatabase = async (database: SQLite.SQLiteDatabase): Promise<void> => {
  console.log('[DB_DEBUG] initializeDatabase: Redirecting to full initialization...');
  await initializeFullDatabase(database);
};

const setupDatabaseTables = async (database: SQLite.SQLiteDatabase): Promise<void> => {
  console.log('[DB_DEBUG] initializeDatabase: Starting initialization...');
  console.log('[databaseService] Initializing database tables...');
  try {
    // Use migration system for safe schema updates
    await DatabaseMigrationService.migrate(database);
    
    // Initialize other services after core tables are ready
    await initializeAdditionalServices();
    
    console.log('[DB_DEBUG] initializeDatabase: Database tables initialized successfully.');
  } catch (error) {
    console.error('[DB_DEBUG] initializeDatabase: Error initializing database tables:', error);
    throw error;
  }
};

/**
 * Initialize OAuth tables for Salesforce and other OAuth integrations
 */
const initializeOAuthTables = async (): Promise<void> => {
  const db = await openDatabase();
  
  try {
    // Create oauth_state table for PKCE code verifiers and OAuth state
    await db.execAsync(`
      CREATE TABLE IF NOT EXISTS oauth_state (
        id TEXT PRIMARY KEY,
        company_id TEXT NOT NULL,
        integration_type TEXT NOT NULL,
        state_value TEXT NOT NULL,
        code_verifier TEXT,
        code_challenge TEXT,
        code_challenge_method TEXT DEFAULT 'S256',
        redirect_uri TEXT,
        scope TEXT,
        expires_at TEXT NOT NULL,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP
      );
    `);
    
    // Create indexes for performance
    await db.execAsync(`
      CREATE INDEX IF NOT EXISTS idx_oauth_state_company_integration 
      ON oauth_state(company_id, integration_type);
      
      CREATE INDEX IF NOT EXISTS idx_oauth_state_expires 
      ON oauth_state(expires_at);
      
      CREATE INDEX IF NOT EXISTS idx_oauth_state_value 
      ON oauth_state(state_value);
    `);
    
    // Create oauth_callbacks table for storing callback results
    await db.execAsync(`
      CREATE TABLE IF NOT EXISTS oauth_callbacks (
        id TEXT PRIMARY KEY,
        company_id TEXT NOT NULL,
        integration_type TEXT NOT NULL,
        state_value TEXT NOT NULL,
        authorization_code TEXT,
        access_token TEXT,
        refresh_token TEXT,
        token_type TEXT,
        expires_in INTEGER,
        scope TEXT,
        instance_url TEXT,
        status TEXT DEFAULT 'pending',
        error_code TEXT,
        error_description TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP
      );
    `);
    
    // Create indexes for oauth_callbacks
    await db.execAsync(`
      CREATE INDEX IF NOT EXISTS idx_oauth_callbacks_company_integration 
      ON oauth_callbacks(company_id, integration_type);
      
      CREATE INDEX IF NOT EXISTS idx_oauth_callbacks_state 
      ON oauth_callbacks(state_value);
      
      CREATE INDEX IF NOT EXISTS idx_oauth_callbacks_status 
      ON oauth_callbacks(status);
    `);
    
    console.log('[databaseService] OAuth tables created successfully');
  } catch (error) {
    console.error('[databaseService] Error creating OAuth tables:', error);
    throw error;
  }
};

/**
 * Initialize additional services after core database is ready
 * This prevents circular dependency issues
 */
const initializeAdditionalServices = async (): Promise<void> => {
  try {
    // Initialize sync queue
    const { initializeSyncQueue } = await import('./syncQueueService');
    await initializeSyncQueue();
    
    // Initialize storage
    const { initializeStorage } = await import('./storageService');
    await initializeStorage();
    
    // Initialize licensing system
    const { initializeLicensingTables } = await import('./licensingService');
    await initializeLicensingTables();
    
    // Initialize batch management
    const { initializeBatchManagementTables } = await import('./batchManagementService');
    await initializeBatchManagementTables();
    
    // Initialize OAuth tables
    try {
      await initializeOAuthTables();
      console.log('[databaseService] OAuth tables initialized successfully');
    } catch (oauthError) {
      console.error('[databaseService] OAuth table initialization failed:', oauthError);
    }
    
    // Initialize SharePoint service
    try {
      const { initializeSharePointStorage } = await import('./sharepointService');
      await initializeSharePointStorage();
      console.log('[databaseService] SharePoint storage initialized successfully');
    } catch (sharepointError) {
      console.error('[databaseService] SharePoint initialization failed:', sharepointError);
      // Try to create the table manually as fallback
      try {
        const db = await openDatabase();
        await db.execAsync(`
          CREATE TABLE IF NOT EXISTS sharepoint_connections (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            status TEXT DEFAULT 'disconnected',
            lastSync TEXT,
            enabled INTEGER DEFAULT 0,
            tenantId TEXT,
            clientId TEXT,
            clientSecret TEXT,
            siteUrl TEXT,
            libraryName TEXT,
            redirectUri TEXT,
            accessToken TEXT,
            refreshToken TEXT,
            tokenExpiry TEXT,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP,
            updated_at TEXT DEFAULT CURRENT_TIMESTAMP
          );
          
          CREATE TABLE IF NOT EXISTS sharepoint_uploads (
            id TEXT PRIMARY KEY,
            connectionId TEXT NOT NULL,
            localFilePath TEXT NOT NULL,
            remoteFileUrl TEXT,
            itemId TEXT,
            uploadStatus TEXT DEFAULT 'pending',
            batchId TEXT,
            photoId TEXT,
            uploadedAt TEXT,
            error TEXT,
            retryCount INTEGER DEFAULT 0,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (connectionId) REFERENCES sharepoint_connections(id)
          );
          
          CREATE INDEX IF NOT EXISTS idx_sharepoint_uploads_status ON sharepoint_uploads(uploadStatus);
          CREATE INDEX IF NOT EXISTS idx_sharepoint_uploads_batch ON sharepoint_uploads(batchId);
        `);
        console.log('[databaseService] SharePoint tables created via fallback method');
      } catch (fallbackError) {
        console.error('[databaseService] SharePoint fallback creation also failed:', fallbackError);
      }
    }
    
    console.log('[databaseService] Additional services initialized successfully');
  } catch (error) {
    console.error('[databaseService] Error initializing additional services:', error);
    // Don't throw here - core database is working
    console.log('[databaseService] Continuing with core database functionality');
  }
};

// --- Batch Operations ---

// Create a new batch record and return its ID
export const createPhotoBatch = async (
  userId: string,
  referenceId?: string, 
  orderNumber?: string,
  inventoryId?: string
): Promise<number> => {
  console.log(`[DB_DEBUG] createPhotoBatch: Called with userId=${userId}, referenceId=${referenceId}, orderNumber=${orderNumber}, inventoryId=${inventoryId}`);
  const database = await openDatabase();
  try {
    console.log('[DB_DEBUG] createPhotoBatch: Attempting to insert into photo_batches...');
    const result = await database.runAsync(
      'INSERT INTO photo_batches (userId, referenceId, orderNumber, inventoryId) VALUES (?, ?, ?, ?)',
      [userId, referenceId ?? null, orderNumber ?? null, inventoryId ?? null]
    );
    console.log(`[DB_DEBUG] createPhotoBatch: Insert result - lastInsertRowId: ${result.lastInsertRowId}, changes: ${result.changes}`);
    if (result.lastInsertRowId === undefined) {
        throw new Error('Failed to get last insert row ID for photo batch.');
    }
    console.log(`[databaseService] Created photo batch with ID: ${result.lastInsertRowId}`);
    return result.lastInsertRowId;
  } catch (error) {
    console.error('[DB_DEBUG] createPhotoBatch: Error creating photo batch:', error);
    throw error;
  }
};

// Retrieve a specific batch by ID (optional)
export const getPhotoBatchById = async (batchId: number): Promise<PhotoBatch | null> => {
  const database = await openDatabase();
  try {
    const batchRow = await database.getFirstAsync<any>(
      'SELECT * FROM photo_batches WHERE id = ?',
      [batchId]
    );
    if (!batchRow) return null;

    // Retrieve associated photos
    const photos = await getPhotosByBatchId(batchId);

    return {
      id: batchRow.id,
      type: batchRow.orderNumber ? 'Order' : 'Inventory',
      referenceId: batchRow.orderNumber || batchRow.inventoryId || `batch-${batchRow.id}`,
      orderNumber: batchRow.orderNumber,
      inventoryId: batchRow.inventoryId,
      userId: batchRow.userId,
      createdAt: batchRow.createdAt,
      status: batchRow.status === 'pending' ? 'InProgress' : 
              batchRow.status === 'completed' ? 'Completed' : 'Exported',
      photos: photos, // Embed photos directly
    };
  } catch (error) {
    console.error(`[databaseService] Error getting photo batch ${batchId}:`, error);
    throw error;
  }
};

// Retrieve all batches with a specific status (e.g., 'pending')
export const getPhotoBatchesByStatus = async (status: string): Promise<PhotoBatch[]> => {
  const database = await openDatabase();
  try {
    const batchRows = await database.getAllAsync<any>(
      'SELECT * FROM photo_batches WHERE status = ? ORDER BY createdAt DESC',
      [status]
    );

    const batches: PhotoBatch[] = [];
    for (const row of batchRows) {
      // Optionally fetch photos for each batch here if needed immediately,
      // or fetch them on demand when a batch is selected.
      // For simplicity, let's fetch them here for now.
      const photos = await getPhotosByBatchId(row.id);
      batches.push({
        id: row.id,
        orderNumber: row.orderNumber,
        inventoryId: row.inventoryId,
        userId: row.userId,
        createdAt: row.createdAt,
        status: row.status,
        photos: photos,
      } as PhotoBatch);
    }
    return batches;
  } catch (error) {
    console.error(`[databaseService] Error getting batches with status ${status}:`, error);
    throw error;
  }
};

// Update batch status
export const updateBatchStatus = async (batchId: number, status: 'pending' | 'completed' | 'synced'): Promise<void> => {
  const database = await openDatabase();
  try {
    await database.runAsync('UPDATE photo_batches SET status = ? WHERE id = ?', [status, batchId]);
    console.log(`[databaseService] Updated status for batch ${batchId} to ${status}`);
  } catch (error) {
    console.error(`[databaseService] Error updating status for batch ${batchId}:`, error);
    throw error;
  }
};

// Delete a batch and its associated photos (and files)
export const deletePhotoBatch = async (batchId: number): Promise<void> => {
  const database = await openDatabase();
  try {
    // 1. Get photos associated with the batch to delete files
    const photosToDelete = await getPhotosByBatchId(batchId);

    // 2. Begin transaction
    await database.runAsync('BEGIN TRANSACTION;');

    // 3. Delete photos from the database
    await database.runAsync('DELETE FROM photos WHERE batchId = ?', [batchId]);

    // 4. Delete the batch record
    await database.runAsync('DELETE FROM photo_batches WHERE id = ?', [batchId]);

    // 5. Commit transaction
    await database.runAsync('COMMIT;');
    console.log(`[databaseService] Deleted batch ${batchId} and associated photo records.`);

    // 6. Delete actual photo files (outside transaction)
    for (const photo of photosToDelete) {
      try {
        await FileSystem.deleteAsync(photo.uri, { idempotent: true });
        console.log(`[databaseService] Deleted photo file: ${photo.uri}`);
      } catch (fileError) {
        console.error(`[databaseService] Error deleting photo file ${photo.uri}:`, fileError);
        // Decide if this should halt the process or just log
      }
    }

  } catch (error) {
    console.error(`[databaseService] Error deleting batch ${batchId}:`, error);
    // Rollback if transaction was started and failed
    try { await database.runAsync('ROLLBACK;'); } catch (rollbackError) { /* ignore */ }
    throw error;
  }
};

// --- Photo Operations ---

// Save a single photo linked to a batch
export const savePhoto = async (batchId: number, photoData: PhotoData): Promise<string> => {
  const database = await openDatabase();
  try {
    // Convert metadata and annotations to JSON strings
    const metadataJson = JSON.stringify(photoData.metadata || {});
    const annotationsJson = photoData.annotations ? JSON.stringify(photoData.annotations) : null;
    const partNumber = photoData.partNumber || null; // Use null for undefined values
    const photoTitle = photoData.photoTitle || 'General Picture'; // Default if undefined

    await database.runAsync(
      'INSERT OR REPLACE INTO photos (id, batchId, partNumber, photoTitle, uri, metadataJson, annotationsJson) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [photoData.id, batchId, partNumber, photoTitle, photoData.uri, metadataJson, annotationsJson]
    );
    console.log(`[databaseService] Saved photo ${photoData.id} to batch ${batchId}`);
    return photoData.id; // Return the ID of the saved photo
  } catch (e) {
    const err = e instanceof Error ? e : new Error(String(e));
    console.error(`[databaseService] Error saving photo to batch ${batchId}:`, err);
    throw err;
  }
};

// Retrieve all photos for a specific batch ID
export const getPhotosByBatchId = async (batchId: number): Promise<PhotoData[]> => {
  const database = await openDatabase();
  try {
    const rows = await database.getAllAsync<any>(
      'SELECT * FROM photos WHERE batchId = ?',
      [batchId]
    );
    
    return rows.map(row => ({
      id: row.id,
      uri: row.uri,
      batchId: batchId,
      partNumber: row.partNumber || '',
      metadata: JSON.parse(row.metadataJson || '{}'),
      annotations: row.annotationsJson ? JSON.parse(row.annotationsJson) : undefined,
      syncStatus: 'pending' // Default sync status
    }));
  } catch (error) {
    console.error(`[databaseService] Error getting photos for batch ${batchId}:`, error);
    throw error;
  }
};

// Update photo metadata (e.g., after adding annotations)
export const updatePhotoMetadata = async (photoId: string, metadata: PhotoMetadata, annotations?: AnnotationData[]): Promise<void> => {
  const database = await openDatabase();
  try {
    const metadataJson = JSON.stringify(metadata);
    const annotationsJson = annotations ? JSON.stringify(annotations) : null;
    await database.runAsync(
      'UPDATE photos SET metadataJson = ?, annotationsJson = ? WHERE id = ?',
      [metadataJson, annotationsJson, photoId]
    );
    console.log(`[databaseService] Updated metadata/annotations for photo ${photoId}`);
  } catch (error) {
    console.error(`[databaseService] Error updating metadata for photo ${photoId}:`, error);
    throw error;
  }
};

// Delete a single photo record and its file
export const deletePhotoById = async (photoId: string): Promise<void> => {
  const database = await openDatabase();
  try {
    // 1. Get the photo URI before deleting the record
    const photoRow = await database.getFirstAsync<any>(
      'SELECT uri FROM photos WHERE id = ?',
      [photoId]
    );

    if (!photoRow) {
      console.warn(`[databaseService] Photo record ${photoId} not found for deletion.`);
      return; // Or throw error?
    }

    // 2. Delete the database record
    await database.runAsync('DELETE FROM photos WHERE id = ?', [photoId]);
    console.log(`[databaseService] Deleted photo record ${photoId}.`);

    // 3. Delete the actual photo file
    try {
      await FileSystem.deleteAsync(photoRow.uri, { idempotent: true });
      console.log(`[databaseService] Deleted photo file: ${photoRow.uri}`);
    } catch (fileError) {
      console.error(`[databaseService] Error deleting photo file ${photoRow.uri}:`, fileError);
      // Decide if this should be re-thrown
    }

  } catch (error) {
    console.error(`[databaseService] Error deleting photo ${photoId}:`, error);
    throw error;
  }
};

// --- Utility ---

// Close the database connection (optional, usually managed by Expo)
export const closeDatabase = async (): Promise<void> => {
  if (globalDb) {
    try {
      await globalDb.closeAsync();
      globalDb = null;
      console.log('[databaseService] Database closed.');
    } catch (error) {
      console.error('[databaseService] Error closing database:', error);
    }
  }
};

// Helper function to ensure the database is open and return the instance
export const ensureDbOpen = async (): Promise<SQLite.SQLiteDatabase> => {
  return await openDatabase();
};

// Fetches all photos associated with a specific batch ID
export const getPhotosForBatch = async (batchId: number): Promise<PhotoData[]> => {
  console.log(`[DB_DEBUG] getPhotosForBatch: Called with batchId=${batchId}`);
  
  try {
    console.log(`[DB_DEBUG] getPhotosForBatch: Opening database...`);
    const db = await openDatabase();
    console.log(`[DB_DEBUG] getPhotosForBatch: Database opened successfully`);
    
    // Define an interface for the row structure coming from the DB
    // Reflects the actual columns in the 'photos' table
    interface PhotoRow {
        id: string;
        batchId: number;
        partNumber?: string; // Added partNumber, make optional if it can be null
        photoTitle?: string; // Added photoTitle
        uri: string;
        metadataJson: string;
        annotationsJson?: string;
        // Add other fields from the photos table if necessary
    }
    
    console.log(`[DB_DEBUG] getPhotosForBatch: Executing query for batchId=${batchId}`);
    const queryPromise = db.getAllAsync<PhotoRow>(
      'SELECT id, batchId, partNumber, photoTitle, uri, metadataJson, annotationsJson FROM photos WHERE batchId = ?', // Explicitly list columns
      [batchId]
    );
    
    // Add timeout protection
    const results = await Promise.race([
      queryPromise,
      new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Photos query timeout')), 15000) // Increased from 5 to 15 seconds
      )
    ]) as PhotoRow[];
    
    console.log(`[DB_DEBUG] getPhotosForBatch: Query returned ${results.length} photos`);
    console.log(`[DB_DEBUG] getPhotosForBatch: Raw results:`, JSON.stringify(results, null, 2));
    
    // Let's also check what photos exist in the database overall (with timeout)
    console.log(`[DB_DEBUG] getPhotosForBatch: Checking total photos in database...`);
    const allPhotosPromise = db.getAllAsync('SELECT id, batchId FROM photos');
    const allPhotos = await Promise.race([
      allPhotosPromise,
      new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Total photos query timeout')), 10000) // Increased from 3 to 10 seconds
      )
    ]) as any[];
    
    console.log(`[DB_DEBUG] getPhotosForBatch: Total photos in database:`, allPhotos);
    
    // Manually parse metadata back into an object
    const mappedResults = results.map((row: PhotoRow) => ({
      id: row.id,
      uri: row.uri,
      batchId: row.batchId,
      partNumber: row.partNumber || '', // Provide default or handle potential null
      photoTitle: row.photoTitle || 'General Picture', // Add photoTitle, default if null
      metadata: JSON.parse(row.metadataJson || '{}'), // Ensure metadata is parsed from JSON string
      annotations: row.annotationsJson ? JSON.parse(row.annotationsJson) : undefined, // Parse annotations if they exist
      syncStatus: 'pending' as const // Default sync status since it's not stored in the database
    }));
    
    console.log(`[DB_DEBUG] getPhotosForBatch: Returning ${mappedResults.length} mapped photos`);
    return mappedResults;
    
  } catch (error) {
    console.error(`[DB_DEBUG] getPhotosForBatch: Error in getPhotosForBatch for batch ${batchId}:`, error);
    // Return empty array on error to prevent app crash
    return [];
  }
};

// Fetches batch details and all associated photos
export const getBatchDetails = async (batchId: number): Promise<{ batch: PhotoBatch | null; photos: PhotoData[] }> => {
  console.log(`[DB_DEBUG] getBatchDetails: Called with batchId=${batchId}`);
  
  try {
    const db = await openDatabase();
    console.log(`[DB_DEBUG] getBatchDetails: Database opened successfully for batch ${batchId}`);
    
    // Add timeout protection for the batch query
    console.log(`[DB_DEBUG] getBatchDetails: Executing batch query for ID ${batchId}`);
    const batchQueryPromise = db.getFirstAsync<any>(
      'SELECT id, referenceId, orderNumber, inventoryId, userId, createdAt, status FROM photo_batches WHERE id = ?', 
      [batchId]
    );
    
    const batchRow = await Promise.race([
      batchQueryPromise,
      new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Batch query timeout')), 15000) // Increased from 5 to 15 seconds
      )
    ]) as any;
    
    console.log(`[DB_DEBUG] getBatchDetails: Batch query result:`, batchRow);
    
    // Add timeout protection for the photos query
    console.log(`[DB_DEBUG] getBatchDetails: Now fetching photos for batch ${batchId}`);
    const photosPromise = getPhotosForBatch(batchId);
    
    const photos = await Promise.race([
      photosPromise,
      new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Photos query timeout')), 15000) // Increased from 5 to 15 seconds
      )
    ]) as PhotoData[];
    
    console.log(`[DB_DEBUG] getBatchDetails: Got ${photos.length} photos from getPhotosForBatch`);
    
    // If no batch was found, return null
    if (!batchRow) {
      console.log(`[DB_DEBUG] getBatchDetails: Batch with ID ${batchId} not found.`);
      return { batch: null, photos: [] };
    }

    // Map the database row to a PhotoBatch object
    const batch: PhotoBatch = {
      id: batchRow.id,
      type: batchRow.referenceId?.startsWith('ORD-') ? 'Order' : (batchRow.referenceId?.startsWith('INV-') ? 'Inventory' : (batchRow.orderNumber ? 'Order' : (batchRow.inventoryId ? 'Inventory' : 'Single'))),
      referenceId: batchRow.referenceId, // Use the direct referenceId
      orderNumber: batchRow.orderNumber,
      inventoryId: batchRow.inventoryId,
      userId: batchRow.userId,
      createdAt: batchRow.createdAt,
      status: batchRow.status === 'pending' ? 'InProgress' : 
              batchRow.status === 'completed' ? 'Completed' : 'Exported',
      photos: photos
    };

    console.log(`[DB_DEBUG] getBatchDetails: Returning batch details for ID ${batchId}: batch=${JSON.stringify(batch, null, 2)}, photos.length=${photos.length}`);
    return { batch, photos };
    
  } catch (error) {
    console.error(`[DB_DEBUG] getBatchDetails: Error in getBatchDetails for batch ${batchId}:`, error);
    
    // Return empty result on error to prevent app crash
    return { 
      batch: null, 
      photos: [] 
    };
  }
};

// Deletes a batch and all associated photos
export const deleteBatch = async (batchId: number): Promise<void> => {
  const db = await openDatabase();
  // Optional: Delete associated photo files first
  // const photos = await getPhotosForBatch(batchId);
  // for (const photo of photos) { try { await FileSystem.deleteAsync(photo.uri); } catch (e) { console.error("Error deleting photo file:", e); } }
  await db.runAsync('DELETE FROM photos WHERE batchId = ?', [batchId]);
  await db.runAsync('DELETE FROM photo_batches WHERE id = ?', [batchId]);
  console.log(`Batch ${batchId} and associated photos deleted successfully.`);
  // TODO: Add analytics log for batch deletion
};

// Get recent batches for a user with limit
export const getRecentBatches = async (userId: string, limit: number = 10): Promise<BatchListItem[]> => {
  console.log(`[DB_DEBUG] getRecentBatches: Called with userId=${userId}, limit=${limit}`);
  const db = await openDatabase();
  try {
    // Get batches with photo counts
    console.log(`[DB_DEBUG] getRecentBatches: Executing query...`);
    const batches = await db.getAllAsync<RawBatchData>(`
      SELECT 
        pb.id, 
        pb.referenceId, -- Added referenceId
        pb.orderNumber, 
        pb.inventoryId, 
        pb.createdAt, 
        pb.status as syncStatus,
        COUNT(p.id) as photoCount
      FROM 
        photo_batches pb
      LEFT JOIN 
        photos p ON pb.id = p.batchId
      WHERE 
        pb.userId = ?
      GROUP BY 
        pb.id
      ORDER BY 
        pb.createdAt DESC
      LIMIT ?
    `, [userId, limit]);
    console.log('[DB_DEBUG] getRecentBatches: Raw query completed, got', batches.length, 'rows');
    console.log('[DB_DEBUG] getRecentBatches: Raw batches from DB:', JSON.stringify(batches, null, 2));
    
    if (batches.length === 0) {
      console.log(`[DB_DEBUG] getRecentBatches: No batches found in database for user ${userId}`);
      
      // Let's also check if there are ANY batches in the table
      const allBatches = await db.getAllAsync('SELECT COUNT(*) as total FROM photo_batches');
      console.log(`[DB_DEBUG] getRecentBatches: Total batches in database:`, allBatches);
      
      // Check if there are batches for this specific user
      const userBatches = await db.getAllAsync('SELECT COUNT(*) as total FROM photo_batches WHERE userId = ?', [userId]);
      console.log(`[DB_DEBUG] getRecentBatches: User batches count:`, userBatches);
      
      return [];
    }
    
    const mappedBatches = batches.map(batch => ({
      id: batch.id.toString(), // Convert to string for consistency
      referenceId: batch.referenceId || `Batch #${batch.id.toString().substring(0, 6)}`, // Primary display ID
      orderNumber: batch.orderNumber, // Actual orderNumber from DB (can be null)
      inventoryId: batch.inventoryId, // Actual inventoryId from DB (can be null)
      createdAt: batch.createdAt,
      syncStatus: batch.syncStatus || 'complete', // Default to 'complete' if null
      photoCount: batch.photoCount || 0,
      // Determine type based on referenceId primarily, then orderNumber, then inventoryId
      type: (batch.referenceId?.startsWith('ORD-') ? 'Order' 
            : batch.referenceId?.startsWith('INV-') ? 'Inventory' 
            : batch.orderNumber ? 'Order' 
            : batch.inventoryId ? 'Inventory' 
            : 'Unknown') as BatchListItem['type']
    }));
    console.log('[DB_DEBUG] getRecentBatches: Mapped batches:', JSON.stringify(mappedBatches, null, 2));
    return mappedBatches;
  } catch (error) {
    console.error('[DB_DEBUG] getRecentBatches: Error fetching recent batches:', error);
    return [];
  }
};

// Get daily statistics for a user
export const getDailyStats = async (userId: string): Promise<{ photosToday: number; batchesCompleted: number; pendingSync: number }> => {
  const db = await openDatabase();
  try {
    // Get today's date in YYYY-MM-DD format
    const today = new Date().toISOString().split('T')[0];
    
    // Get photos taken today
    const photosResult = await db.getFirstAsync<{ count: number }>(`
      SELECT COUNT(*) as count
      FROM photos p
      JOIN photo_batches pb ON p.batchId = pb.id
      WHERE pb.userId = ? AND date(pb.createdAt) = ?
    `, [userId, today]);
    
    // Get batches completed today
    const batchesResult = await db.getFirstAsync<{ count: number }>(`
      SELECT COUNT(*) as count
      FROM photo_batches
      WHERE userId = ? AND date(createdAt) = ? AND status = 'completed'
    `, [userId, today]);
    
    // Get pending sync items
    const pendingSyncResult = await db.getFirstAsync<{ count: number }>(`
      SELECT COUNT(*) as count
      FROM photo_batches
      WHERE userId = ? AND status = 'pending'
    `, [userId]);
    
    return {
      photosToday: photosResult?.count || 0,
      batchesCompleted: batchesResult?.count || 0,
      pendingSync: pendingSyncResult?.count || 0
    };
  } catch (error) {
    console.error('[databaseService] Error fetching daily stats:', error);
    return {
      photosToday: 0,
      batchesCompleted: 0,
      pendingSync: 0
    };
  }
};


// Raw data structure from the photo_batches table with photo count
interface RawBatchData {
  id: number;
  referenceId: string | null;
  orderNumber: string | null;
  inventoryId: string | null;
  createdAt: string;
  syncStatus: string | null;
  photoCount: number;
}

// Define a type for the items returned by getAllPhotoBatchesForUser and getRecentBatches
export interface BatchListItem {
  id: string;
  referenceId: string; // Primary display ID
  orderNumber?: string | null;
  inventoryId?: string | null;
  createdAt: string;
  syncStatus: string; // 'pending', 'completed', 'synced', etc.
  photoCount: number;
  type: 'Order' | 'Inventory' | 'Unknown';
}

// Get all batches for a user
export const getAllPhotoBatchesForUser = async (userId: string): Promise<BatchListItem[]> => {
  console.log(`[DB_DEBUG] getAllPhotoBatchesForUser: Called with userId=${userId}`);
  const db = await openDatabase();
  try {
    const batches = await db.getAllAsync<RawBatchData>(`
      SELECT 
        pb.id, 
        pb.referenceId,
        pb.orderNumber, 
        pb.inventoryId, 
        pb.createdAt, 
        pb.status as syncStatus,
        COUNT(p.id) as photoCount
      FROM 
        photo_batches pb
      LEFT JOIN 
        photos p ON pb.id = p.batchId
      WHERE 
        pb.userId = ?
      GROUP BY 
        pb.id
      ORDER BY 
        pb.createdAt DESC
    `, [userId]);
    console.log('[DB_DEBUG] getAllPhotoBatchesForUser: Raw batches from DB:', JSON.stringify(batches, null, 2));
    
    const mappedBatches: BatchListItem[] = batches.map(batch => ({
      id: batch.id.toString(),
      referenceId: batch.referenceId || `Batch #${batch.id.toString().substring(0, 6)}`,
      orderNumber: batch.orderNumber,
      inventoryId: batch.inventoryId,
      createdAt: batch.createdAt,
      syncStatus: batch.syncStatus || 'complete',
      photoCount: batch.photoCount || 0,
      type: (batch.referenceId?.startsWith('ORD-') ? 'Order' 
            : batch.referenceId?.startsWith('INV-') ? 'Inventory' 
            : batch.orderNumber ? 'Order' 
            : batch.inventoryId ? 'Inventory' 
            : 'Unknown') as BatchListItem['type']
    }));
    console.log('[DB_DEBUG] getAllPhotoBatchesForUser: Mapped batches:', JSON.stringify(mappedBatches, null, 2));
    return mappedBatches;
  } catch (error) {
    console.error('[DB_DEBUG] getAllPhotoBatchesForUser: Error fetching all batches:', error);
    return [];
  }
};

export { globalDb }; // Export db instance if needed elsewhere, though encapsulation is preferred
