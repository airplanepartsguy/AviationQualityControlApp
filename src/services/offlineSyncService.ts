import { openDatabase } from './databaseService';
import { addToSyncQueue, getNextQueuedTask, updateTaskStatus, getQueueStatus } from './syncQueueService';
import { isNetworkConnected } from './networkService';
import { SyncTask, SyncResult, PhotoBatch, PhotoData } from '../types/data';
import * as supabaseService from './supabaseService';
import conflictResolutionService from './conflictResolutionService';
import { syncProfileToSupabase } from './profileSyncService';

/**
 * Offline Sync Service - Orchestrates offline-first sync with Supabase
 * Handles queuing, processing, and conflict resolution for robust sync
 */

let syncInProgress = false;
let syncInterval: NodeJS.Timeout | null = null;

// Sync configuration
const SYNC_CONFIG = {
  RETRY_DELAY: 30000, // 30 seconds
  MAX_BATCH_SIZE: 10,
  SYNC_INTERVAL: 60000, // 1 minute
  MAX_RETRIES: 3
};

// Initialize sync service
export const initializeSyncService = async (): Promise<void> => {
  console.log('[OfflineSync] Initializing sync service...');
  
  // Start periodic sync when online
  startPeriodicSync();
  
  console.log('[OfflineSync] Sync service initialized');
};

// Start periodic sync
const startPeriodicSync = (): void => {
  if (syncInterval) {
    clearInterval(syncInterval);
  }
  
  syncInterval = setInterval(async () => {
    if (await isNetworkConnected()) {
      await processSyncQueue();
    }
  }, SYNC_CONFIG.SYNC_INTERVAL);
};

// Stop periodic sync
export const stopPeriodicSync = (): void => {
  if (syncInterval) {
    clearInterval(syncInterval);
    syncInterval = null;
  }
};

// Queue photo batch for sync
export const queueBatchForSync = async (batchId: number, userId: string): Promise<void> => {
  try {
    const taskId = `batch_sync_${batchId}_${Date.now()}`;
    
    const syncTask: Omit<SyncTask, 'attempts' | 'lastAttempted'> = {
      id: taskId,
      type: 'data_sync',
      payload: {
        batchId,
        userId,
        operation: 'batch_upload'
      },
      status: 'queued'
    };
    
    await addToSyncQueue(syncTask);
    console.log(`[OfflineSync] Queued batch ${batchId} for sync`);
    
    // Try immediate sync if online
    if (await isNetworkConnected()) {
      await processSyncQueue();
    }
  } catch (error) {
    console.error('[OfflineSync] Error queuing batch for sync:', error);
  }
};

// Queue photo for sync
export const queuePhotoForSync = async (photoId: string, batchId: number): Promise<void> => {
  try {
    const taskId = `photo_sync_${photoId}_${Date.now()}`;
    
    const syncTask: Omit<SyncTask, 'attempts' | 'lastAttempted'> = {
      id: taskId,
      type: 'data_sync',
      payload: {
        photoId,
        batchId,
        operation: 'photo_upload'
      },
      status: 'queued'
    };
    
    await addToSyncQueue(syncTask);
    console.log(`[OfflineSync] Queued photo ${photoId} for sync`);
    
    // Try immediate sync if online
    if (await isNetworkConnected()) {
      await processSyncQueue();
    }
  } catch (error) {
    console.error('[OfflineSync] Error queuing photo for sync:', error);
  }
};

// Process sync queue
export const processSyncQueue = async (): Promise<SyncResult[]> => {
  if (syncInProgress) {
    console.log('[OfflineSync] Sync already in progress, skipping');
    return [];
  }
  
  if (!(await isNetworkConnected())) {
    console.log('[OfflineSync] No network connection, skipping sync');
    return [];
  }
  
  syncInProgress = true;
  const results: SyncResult[] = [];
  
  try {
    console.log('[OfflineSync] Starting sync queue processing...');
    
    let processedCount = 0;
    while (processedCount < SYNC_CONFIG.MAX_BATCH_SIZE) {
      const task = await getNextQueuedTask();
      if (!task) break;
      
      const result = await processTask(task);
      results.push(result);
      processedCount++;
      
      // Small delay between tasks
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    
    console.log(`[OfflineSync] Processed ${processedCount} sync tasks`);
  } catch (error) {
    console.error('[OfflineSync] Error processing sync queue:', error);
  } finally {
    syncInProgress = false;
  }
  
  return results;
};

// Process individual sync task
export const processTask = async (task: SyncTask): Promise<SyncResult> => {
  try {
    console.log(`[OfflineSync] Processing task ${task.id} of type ${task.type}`);
    
    let result: SyncResult;
    
    switch (task.type) {
      case 'data_sync':
        if (task.payload.operation === 'batch_upload') {
          result = await syncBatch(task.payload.batchId, task.payload.userId);
        } else if (task.payload.operation === 'photo_upload') {
          result = await syncPhoto(task.payload.photoId, task.payload.batchId);
        } else {
          throw new Error(`Unknown data sync operation: ${task.payload.operation}`);
        }
        break;
      
      case 'profile_sync':
        if (task.payload.operation === 'profile_update') {
          const success = await syncProfileToSupabase(task.payload.userId, task.payload.updates);
          result = {
            success,
            message: success ? 'Profile synced successfully' : 'Profile sync failed',
            timestamp: new Date().toISOString()
          };
        } else {
          throw new Error(`Unknown profile sync operation: ${task.payload.operation}`);
        }
        break;
      
      default:
        throw new Error(`Unknown task type: ${task.type}`);
    }
    
    // Update task status based on result
    if (result.success) {
      await updateTaskStatus(task.id, 'completed');
    } else {
      await updateTaskStatus(task.id, 'failed');
    }
    
    return result;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error(`[OfflineSync] Task ${task.id} failed:`, errorMessage);
    
    await updateTaskStatus(task.id, 'failed');
    
    return {
      success: false,
      message: errorMessage,
      timestamp: new Date().toISOString()
    };
  }
};

// Sync batch to Supabase
const syncBatch = async (batchId: number, userId: string): Promise<SyncResult> => {
  try {
    const db = await openDatabase();
    
    // Get batch data
    const batch = await db.getFirstAsync<any>(`
      SELECT * FROM photo_batches WHERE id = ? AND userId = ?
    `, [batchId, userId]);
    
    if (!batch) {
      throw new Error(`Batch ${batchId} not found`);
    }
    
    // Get photos for this batch
    const photos = await db.getAllAsync<any>(`
      SELECT * FROM photos WHERE batchId = ?
    `, [batchId]);
    
    // Create PhotoBatch object for sync
    const photoBatch: PhotoBatch = {
      id: batch.id,
      type: 'Batch', // Default type for sync
      referenceId: batch.referenceId,
      orderNumber: batch.orderNumber,
      inventoryId: batch.inventoryId,
      userId: batch.userId,
      createdAt: batch.createdAt,
      status: batch.status,
      photos: [] // Will be populated separately
    };
    
    // Check for existing remote data to detect conflicts
    let remoteData = null;
    try {
      const remoteBatches = await supabaseService.fetchUserBatches(batch.userId, 1);
      remoteData = remoteBatches.find((rb: any) => rb.id === batch.id);
    } catch (error) {
      console.log('[OfflineSync] No remote data found for conflict detection');
    }
    
    // Handle conflicts if remote data exists
    if (remoteData) {
      const conflictResult = await conflictResolutionService.resolveConflict(
        batch.id.toString(),
        'batch',
        photoBatch,
        remoteData,
        'timestamp' // Use timestamp strategy by default
      );
      
      if (!conflictResult.success) {
        console.log(`[OfflineSync] Conflict stored for manual resolution: ${conflictResult.message}`);
        // Update sync status to indicate conflict
        await db.runAsync(`
          UPDATE photo_batches SET syncStatus = 'conflict', syncError = ?, lastSyncAttempt = ? WHERE id = ?
        `, [conflictResult.message, new Date().toISOString(), batchId]);
        
        return {
          success: false,
          message: conflictResult.message,
          recordId: batch.id.toString(),
          timestamp: new Date().toISOString()
        };
      }
      
      // Use resolved data for sync
      Object.assign(photoBatch, conflictResult.resolvedData);
    }
    
    // Sync to Supabase using our service
    const data = await supabaseService.syncPhotoBatch(photoBatch);
    
    // Update local sync status
    await db.runAsync(`
      UPDATE photo_batches SET syncStatus = 'synced', lastSyncAttempt = ?, syncError = NULL WHERE id = ?
    `, [new Date().toISOString(), batchId]);
    
    // Sync photos
    for (const photo of photos) {
      await syncPhoto(photo.id, photo.batchId);
    }
    
    return {
      success: true,
      message: `Batch ${batchId} synced successfully`,
      recordId: batch.id.toString(),
      timestamp: new Date().toISOString()
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown sync error';
    
    // Update local error status
    const db = await openDatabase();
    await db.runAsync(`
      UPDATE photo_batches 
      SET syncStatus = 'error', lastSyncAttempt = ?, syncError = ? 
      WHERE id = ?
    `, [new Date().toISOString(), errorMessage, batchId]);
    
    return {
      success: false,
      message: errorMessage,
      timestamp: new Date().toISOString()
    };
  }
};

// Sync photo to Supabase
const syncPhoto = async (photoId: string, batchId: number): Promise<SyncResult> => {
  try {
    const db = await openDatabase();
    
    // Get photo data
    const photo = await db.getFirstAsync<any>(`
      SELECT * FROM photos WHERE id = ? AND batchId = ?
    `, [photoId, batchId]);
    
    if (!photo) {
      throw new Error(`Photo ${photoId} not found`);
    }
    
    // Parse metadata and annotations
    const metadata = JSON.parse(photo.metadataJson);
    const annotations = photo.annotationsJson ? JSON.parse(photo.annotationsJson) : null;
    
    // Create PhotoData object for sync
    const photoData: PhotoData = {
      id: photo.id,
      uri: photo.uri,
      batchId: photo.batchId,
      partNumber: photo.partNumber,
      photoTitle: photo.photoTitle,
      metadata: metadata,
      annotations: annotations,
      annotationSavedUri: photo.annotationUri || undefined,
      syncStatus: 'pending'
    };
    
    // Sync to Supabase using our service
    const data = await supabaseService.syncPhoto(photoData, batchId);
    
    // Update local sync status
    await db.runAsync(`
      UPDATE photos 
      SET syncStatus = 'synced', lastSyncAttempt = ?, syncError = NULL 
      WHERE id = ?
    `, [new Date().toISOString(), photoId]);
    
    return {
      success: true,
      message: `Photo ${photoId} synced successfully`,
      recordId: photo.id,
      timestamp: new Date().toISOString()
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown sync error';
    
    // Update local error status
    const db = await openDatabase();
    await db.runAsync(`
      UPDATE photos 
      SET syncStatus = 'error', lastSyncAttempt = ?, syncError = ? 
      WHERE id = ?
    `, [new Date().toISOString(), errorMessage, photoId]);
    
    return {
      success: false,
      message: errorMessage,
      timestamp: new Date().toISOString()
    };
  }
};

// Force sync all pending items
export const forceSyncAll = async (): Promise<SyncResult[]> => {
  console.log('[OfflineSync] Force syncing all pending items...');
  
  if (!(await isNetworkConnected())) {
    throw new Error('No network connection available');
  }
  
  const db = await openDatabase();
  
  // Queue all pending batches
  const pendingBatches = await db.getAllAsync<{ id: number; userId: string }>(`
    SELECT id, userId FROM photo_batches WHERE syncStatus = 'pending' OR syncStatus = 'error'
  `);
  
  for (const batch of pendingBatches) {
    await queueBatchForSync(batch.id, batch.userId);
  }
  
  // Queue all pending photos
  const pendingPhotos = await db.getAllAsync<{ id: string; batchId: number }>(`
    SELECT id, batchId FROM photos WHERE syncStatus = 'pending' OR syncStatus = 'error'
  `);
  
  for (const photo of pendingPhotos) {
    await queuePhotoForSync(photo.id, photo.batchId);
  }
  
  // Process the queue
  return await processSyncQueue();
};
export const getSyncStats = async (): Promise<{
  queueStatus: any;
  pendingBatches: number;
  pendingPhotos: number;
  lastSync: string | null;
}> => {
  try {
    const queueStatus = await getQueueStatus();
    const db = await openDatabase();
    
    const pendingBatches = await db.getFirstAsync<{ count: number }>(`
      SELECT COUNT(*) as count FROM photo_batches WHERE syncStatus = 'pending' OR syncStatus = 'error'
    `);
    
    const pendingPhotos = await db.getFirstAsync<{ count: number }>(`
      SELECT COUNT(*) as count FROM photos WHERE syncStatus = 'pending' OR syncStatus = 'error'
    `);
    
    const lastSync = await db.getFirstAsync<{ lastSync: string }>(`
      SELECT MAX(lastSyncAttempt) as lastSync FROM photo_batches WHERE lastSyncAttempt IS NOT NULL
    `);
    
    return {
      queueStatus,
      pendingBatches: pendingBatches?.count || 0,
      pendingPhotos: pendingPhotos?.count || 0,
      lastSync: lastSync?.lastSync || null
    };
  } catch (error) {
    console.error('[OfflineSync] Error getting sync stats:', error);
    return {
      queueStatus: null,
      pendingBatches: 0,
      pendingPhotos: 0,
      lastSync: null
    };
  }
};

// Cleanup old sync data
export const cleanupSyncData = async (olderThanDays: number = 30): Promise<void> => {
  try {
    const db = await openDatabase();
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - olderThanDays);
    
    // Clean up old sync attempts
    await db.runAsync(`
      UPDATE photo_batches 
      SET lastSyncAttempt = NULL, syncError = NULL 
      WHERE syncStatus = 'synced' AND lastSyncAttempt < ?
    `, [cutoffDate.toISOString()]);
    
    await db.runAsync(`
      UPDATE photos 
      SET lastSyncAttempt = NULL, syncError = NULL 
      WHERE syncStatus = 'synced' AND lastSyncAttempt < ?
    `, [cutoffDate.toISOString()]);
    
    console.log(`[OfflineSync] Cleaned up sync data older than ${olderThanDays} days`);
  } catch (error) {
    console.error('[OfflineSync] Error cleaning up sync data:', error);
  }
};
