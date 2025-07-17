import * as SQLite from 'expo-sqlite';
import * as FileSystem from 'expo-file-system';
import { PhotoBatch, PhotoData, PhotoMetadata, AnnotationData } from '../types/data';
import DatabaseMigrationService from './databaseMigrationService';
import DatabaseResetUtility from '../utils/databaseReset';

const DB_NAME = 'QualityControl.db';
let db: SQLite.SQLiteDatabase | null = null;

// --- Database Initialization ---
export const openDatabase = async (): Promise<SQLite.SQLiteDatabase> => {
  if (!db) {
    try {
      console.log('[databaseService] Opening database...');
      
      // Use safe initialization that handles schema issues automatically
      db = await DatabaseResetUtility.safeInitialize();
      
      console.log('[databaseService] Database opened successfully.');
      await initializeDatabase(db);
    } catch (error) {
      console.error('[databaseService] Failed to open or initialize database:', error);
      
      // Try one more time with forced reset
      try {
        console.log('[databaseService] Attempting database reset and retry...');
        await DatabaseResetUtility.resetDatabase();
        db = await SQLite.openDatabaseAsync(DB_NAME);
        await DatabaseMigrationService.migrate(db);
        await initializeDatabase(db);
        console.log('[databaseService] Database recovery successful');
      } catch (retryError) {
        console.error('[databaseService] Database recovery failed:', retryError);
        throw retryError;
      }
    }
  }
  return db;
};

const initializeDatabase = async (database: SQLite.SQLiteDatabase): Promise<void> => {
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
  if (db) {
    try {
      await db.closeAsync();
      db = null;
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
  const db = await openDatabase();
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
  const results = await db.getAllAsync<PhotoRow>(
    'SELECT id, batchId, partNumber, photoTitle, uri, metadataJson, annotationsJson FROM photos WHERE batchId = ?', // Explicitly list columns
    [batchId]
  );
  // Manually parse metadata back into an object
  return results.map((row: PhotoRow) => ({
    id: row.id,
    uri: row.uri,
    batchId: row.batchId,
    partNumber: row.partNumber || '', // Provide default or handle potential null
    photoTitle: row.photoTitle || 'General Picture', // Add photoTitle, default if null
    metadata: JSON.parse(row.metadataJson || '{}'), // Ensure metadata is parsed from JSON string
    annotations: row.annotationsJson ? JSON.parse(row.annotationsJson) : undefined, // Parse annotations if they exist
    syncStatus: 'pending' // Default sync status since it's not stored in the database
  }));
};

// Fetches batch details and all associated photos
export const getBatchDetails = async (batchId: number): Promise<{ batch: PhotoBatch | null; photos: PhotoData[] }> => {
  const db = await openDatabase();
  const batchRow = await db.getFirstAsync<any>('SELECT id, referenceId, orderNumber, inventoryId, userId, createdAt, status FROM photo_batches WHERE id = ?', [batchId]);
  const photos = await getPhotosForBatch(batchId); // Reuse existing function
  
  // If no batch was found, return null
  if (!batchRow) {
    return { batch: null, photos };
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
  
  return { batch, photos };
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
    console.log('[DB_DEBUG] getRecentBatches: Raw batches from DB:', JSON.stringify(batches, null, 2));
    
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

export { db }; // Export db instance if needed elsewhere, though encapsulation is preferred
