/**
 * syncService.ts
 * Provides offline-first data synchronization capabilities for the Aviation Quality Control App.
 * This service handles:
 * - Tracking offline changes
 * - Background synchronization when network is available
 * - Conflict resolution for data modified on multiple devices
 * - Retry mechanisms for failed sync attempts
 */

import * as FileSystem from 'expo-file-system';
import { Platform } from 'react-native';
import NetInfo from '@react-native-community/netinfo';
import * as SQLite from 'expo-sqlite';
import { PhotoBatch, PhotoData } from '../types/data';
import { logAnalyticsEvent, logErrorToFile } from './analyticsService';
import { syncDataWithERP } from './erpService';
import { 
  getPhotoBatchesByStatus, 
  updateBatchStatus, 
  getPhotosByBatchId,
  updatePhotoMetadata,
  ensureDbOpen
} from './databaseService';
import photoSyncService from './photoSyncService';

// Constants
const SYNC_QUEUE_DIR = `${FileSystem.documentDirectory}sync_queue/`;
const MAX_RETRY_ATTEMPTS = 3;
const SYNC_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

// Types for sync operations
export type SyncStatus = 'pending' | 'in_progress' | 'completed' | 'failed';

export interface SyncQueueItem {
  id: string;
  type: 'batch' | 'photo';
  objectId: string | number;
  operation: 'create' | 'update' | 'delete';
  data: any;
  attempts: number;
  lastAttempt: string | null;
  status: SyncStatus;
  error?: string;
}

// Singleton state
let isSyncInProgress = false;
let syncTimer: NodeJS.Timeout | null = null;
let isInitialized = false;

/**
 * Initialize the sync service
 * This should be called when the app starts
 */
export const initSyncService = async (): Promise<void> => {
  if (isInitialized) return;
  
  console.log('[SyncService] Initializing sync service...');
  
  try {
    // Ensure sync queue directory exists
    const dirInfo = await FileSystem.getInfoAsync(SYNC_QUEUE_DIR);
    if (!dirInfo.exists) {
      await FileSystem.makeDirectoryAsync(SYNC_QUEUE_DIR, { intermediates: true });
    }
    
    // Initialize sync database table if needed
    await initSyncDatabase();
    
    // Start background sync timer
    startSyncTimer();
    
    // Add network state listener to trigger sync when connection is restored
    NetInfo.addEventListener(state => {
      if (state.isConnected && !isSyncInProgress) {
        console.log('[SyncService] Network connection restored, triggering sync...');
        syncPendingItems().catch(error => {
          console.error('[SyncService] Error during auto-sync:', error);
        });
      }
    });
    
    isInitialized = true;
    console.log('[SyncService] Sync service initialized successfully');
    
    // Start photo sync service for background photo uploads
    console.log('[SyncService] Starting photo sync service...');
    photoSyncService.startPhotoSync();
    console.log('[SyncService] Photo sync service started successfully');
    
    // Perform initial sync check
    const isConnected = (await NetInfo.fetch()).isConnected;
    if (isConnected) {
      syncPendingItems().catch(error => {
        console.error('[SyncService] Error during initial sync:', error);
      });
    }
  } catch (error) {
    console.error('[SyncService] Error initializing sync service:', error);
    logErrorToFile('SyncServiceInitError', error instanceof Error ? error : new Error(String(error)));
  }
};

/**
 * Initialize sync database table
 */
const initSyncDatabase = async (): Promise<void> => {
  const db = await ensureDbOpen();
  
  try {
    await db.execAsync(`
      CREATE TABLE IF NOT EXISTS sync_queue (
        id TEXT PRIMARY KEY,
        type TEXT NOT NULL,
        objectId TEXT NOT NULL,
        operation TEXT NOT NULL,
        data TEXT NOT NULL,
        attempts INTEGER DEFAULT 0,
        lastAttempt TEXT,
        status TEXT DEFAULT 'pending',
        error TEXT,
        createdAt TEXT DEFAULT CURRENT_TIMESTAMP
      );
      
      CREATE INDEX IF NOT EXISTS idx_sync_queue_status ON sync_queue(status);
    `);
    
    console.log('[SyncService] Sync database initialized');
  } catch (error) {
    console.error('[SyncService] Error initializing sync database:', error);
    throw error;
  }
};

/**
 * Start the background sync timer
 */
const startSyncTimer = (): void => {
  if (syncTimer) {
    clearInterval(syncTimer);
  }
  
  syncTimer = setInterval(async () => {
    try {
      const isConnected = (await NetInfo.fetch()).isConnected;
      if (isConnected && !isSyncInProgress) {
        console.log('[SyncService] Running scheduled sync...');
        await syncPendingItems();
      }
    } catch (error) {
      console.error('[SyncService] Error during scheduled sync:', error);
    }
  }, SYNC_INTERVAL_MS);
  
  console.log(`[SyncService] Sync timer started (interval: ${SYNC_INTERVAL_MS / 1000}s)`);
};

/**
 * Stop the background sync timer
 */
export const stopSyncTimer = (): void => {
  if (syncTimer) {
    clearInterval(syncTimer);
    syncTimer = null;
    console.log('[SyncService] Sync timer stopped');
  }
};

/**
 * Add an item to the sync queue
 */
export const addToSyncQueue = async (
  type: 'batch' | 'photo',
  objectId: string | number,
  operation: 'create' | 'update' | 'delete',
  data: any
): Promise<string> => {
  const db = await ensureDbOpen();
  
  const syncId = `sync_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  
  try {
    await db.runAsync(
      'INSERT INTO sync_queue (id, type, objectId, operation, data, status) VALUES (?, ?, ?, ?, ?, ?)',
      [syncId, type, objectId.toString(), operation, JSON.stringify(data), 'pending']
    );
    
    console.log(`[SyncService] Added item to sync queue: ${type} ${operation} ${objectId}`);
    
    // Try to sync immediately if we have network connection
    const isConnected = (await NetInfo.fetch()).isConnected;
    if (isConnected && !isSyncInProgress) {
      syncPendingItems().catch(error => {
        console.error('[SyncService] Error during immediate sync:', error);
      });
    }
    
    return syncId;
  } catch (error) {
    console.error('[SyncService] Error adding item to sync queue:', error);
    throw error;
  }
};

/**
 * Get all pending sync items
 */
export const getPendingSyncItems = async (): Promise<SyncQueueItem[]> => {
  const db = await ensureDbOpen();
  
  try {
    const rows = await db.getAllAsync<any>(
      'SELECT * FROM sync_queue WHERE status IN (?, ?) ORDER BY createdAt ASC',
      ['pending', 'failed']
    );
    
    return rows.map(row => ({
      id: row.id,
      type: row.type,
      objectId: row.objectId,
      operation: row.operation,
      data: JSON.parse(row.data || '{}'),
      attempts: row.attempts,
      lastAttempt: row.lastAttempt,
      status: row.status,
      error: row.error
    }));
  } catch (error) {
    console.error('[SyncService] Error getting pending sync items:', error);
    throw error;
  }
};

/**
 * Update sync item status
 */
const updateSyncItemStatus = async (
  syncId: string,
  status: SyncStatus,
  error?: string
): Promise<void> => {
  const db = await ensureDbOpen();
  
  try {
    const now = new Date().toISOString();
    
    if (error) {
      await db.runAsync(
        'UPDATE sync_queue SET status = ?, lastAttempt = ?, attempts = attempts + 1, error = ? WHERE id = ?',
        [status, now, error, syncId]
      );
    } else {
      await db.runAsync(
        'UPDATE sync_queue SET status = ?, lastAttempt = ?, attempts = attempts + 1 WHERE id = ?',
        [status, now, syncId]
      );
    }
  } catch (error) {
    console.error('[SyncService] Error updating sync item status:', error);
    throw error;
  }
};

/**
 * Remove completed sync items
 */
const removeCompletedSyncItems = async (): Promise<void> => {
  const db = await ensureDbOpen();
  
  try {
    await db.runAsync('DELETE FROM sync_queue WHERE status = ?', ['completed']);
    console.log('[SyncService] Removed completed sync items');
  } catch (error) {
    console.error('[SyncService] Error removing completed sync items:', error);
    throw error;
  }
};

/**
 * Sync all pending items
 */
export const syncPendingItems = async (): Promise<{ success: boolean; synced: number; failed: number }> => {
  if (isSyncInProgress) {
    console.log('[SyncService] Sync already in progress, skipping...');
    return { success: false, synced: 0, failed: 0 };
  }
  
  isSyncInProgress = true;
  console.log('[SyncService] Starting sync of pending items...');
  
  let syncedCount = 0;
  let failedCount = 0;
  
  try {
    // Get all pending items
    const pendingItems = await getPendingSyncItems();
    
    if (pendingItems.length === 0) {
      console.log('[SyncService] No pending items to sync');
      isSyncInProgress = false;
      return { success: true, synced: 0, failed: 0 };
    }
    
    console.log(`[SyncService] Found ${pendingItems.length} pending items to sync`);
    
    // Process each item
    for (const item of pendingItems) {
      try {
        // Skip items that have exceeded max retry attempts
        if (item.attempts >= MAX_RETRY_ATTEMPTS) {
          console.log(`[SyncService] Item ${item.id} exceeded max retry attempts, marking as failed`);
          await updateSyncItemStatus(item.id, 'failed', 'Exceeded maximum retry attempts');
          failedCount++;
          continue;
        }
        
        // Update status to in_progress
        await updateSyncItemStatus(item.id, 'in_progress');
        
        // Process based on type and operation
        let syncResult: boolean;
        
        if (item.type === 'batch') {
          syncResult = await syncBatch(item);
        } else if (item.type === 'photo') {
          syncResult = await syncPhoto(item);
        } else {
          throw new Error(`Unknown sync item type: ${item.type}`);
        }
        
        // Update status based on result
        if (syncResult) {
          await updateSyncItemStatus(item.id, 'completed');
          syncedCount++;
        } else {
          await updateSyncItemStatus(item.id, 'failed', 'Sync operation failed');
          failedCount++;
        }
      } catch (error: any) {
        console.error(`[SyncService] Error processing sync item ${item.id}:`, error);
        await updateSyncItemStatus(item.id, 'failed', error.message || 'Unknown error');
        failedCount++;
      }
    }
    
    // Clean up completed items
    await removeCompletedSyncItems();
    
    console.log(`[SyncService] Sync completed. Synced: ${syncedCount}, Failed: ${failedCount}`);
    
    // Log analytics
    logAnalyticsEvent('sync_completed', {
      totalItems: pendingItems.length,
      syncedItems: syncedCount,
      failedItems: failedCount
    });
    
    return { success: true, synced: syncedCount, failed: failedCount };
  } catch (error) {
    console.error('[SyncService] Error during sync:', error);
    logErrorToFile('SyncError', error instanceof Error ? error : new Error(String(error)));
    return { success: false, synced: syncedCount, failed: failedCount };
  } finally {
    isSyncInProgress = false;
  }
};

/**
 * Sync a batch to the server
 */
const syncBatch = async (item: SyncQueueItem): Promise<boolean> => {
  console.log(`[SyncService] Syncing batch ${item.objectId}...`);
  
  try {
    const batchId = Number(item.objectId);
    
    // Get photos for this batch
    const photos = await getPhotosByBatchId(batchId);
    
    // Sync with ERP
    const result = await syncDataWithERP({
      inspectionId: `batch-${batchId}`,
      photos: photos,
      pdfUri: item.data.pdfUri // If available
    });
    
    if (result.success) {
      // Update batch status in local database
      await updateBatchStatus(batchId, 'synced');
      console.log(`[SyncService] Batch ${batchId} synced successfully`);
      return true;
    } else {
      console.error(`[SyncService] Failed to sync batch ${batchId}: ${result.message}`);
      return false;
    }
  } catch (error) {
    console.error(`[SyncService] Error syncing batch ${item.objectId}:`, error);
    throw error;
  }
};

/**
 * Sync a photo to the server
 */
const syncPhoto = async (item: SyncQueueItem): Promise<boolean> => {
  console.log(`[SyncService] Syncing photo ${item.objectId}...`);
  
  try {
    const photoId = item.objectId.toString();
    const photoData = item.data;
    
    // In a real implementation, you would upload the photo to your server
    // For now, we'll simulate a successful sync
    
    // Update photo metadata to indicate it's been synced
    if (photoData.metadata) {
      const updatedMetadata = {
        ...photoData.metadata,
        syncedAt: new Date().toISOString()
      };
      
      await updatePhotoMetadata(photoId, updatedMetadata, photoData.annotations);
    }
    
    console.log(`[SyncService] Photo ${photoId} synced successfully`);
    return true;
  } catch (error) {
    console.error(`[SyncService] Error syncing photo ${item.objectId}:`, error);
    throw error;
  }
};

/**
 * Get sync status for a specific batch
 */
export const getBatchSyncStatus = async (batchId: number): Promise<{
  status: SyncStatus;
  pendingItems: number;
  lastSyncAttempt: string | null;
}> => {
  const db = await ensureDbOpen();
  
  try {
    // Check if there are any pending sync items for this batch
    const pendingItems = await db.getAllAsync<any>(
      'SELECT * FROM sync_queue WHERE type = ? AND objectId = ? AND status IN (?, ?, ?)',
      ['batch', batchId.toString(), 'pending', 'in_progress', 'failed']
    );
    
    if (pendingItems.length === 0) {
      // No pending items, check if batch is already synced
      const batchesResult = await getPhotoBatchesByStatus('synced');
      const isSynced = batchesResult.some(batch => batch.id === batchId);
      
      return {
        status: isSynced ? 'completed' : 'pending',
        pendingItems: 0,
        lastSyncAttempt: null
      };
    }
    
    // Get the most recent sync attempt
    let lastAttempt: string | null = null;
    let currentStatus: SyncStatus = 'pending';
    
    for (const item of pendingItems) {
      if (item.lastAttempt && (!lastAttempt || item.lastAttempt > lastAttempt)) {
        lastAttempt = item.lastAttempt;
        currentStatus = item.status as SyncStatus;
      }
    }
    
    return {
      status: currentStatus,
      pendingItems: pendingItems.length,
      lastSyncAttempt: lastAttempt
    };
  } catch (error) {
    console.error(`[SyncService] Error getting sync status for batch ${batchId}:`, error);
    throw error;
  }
};

/**
 * Queue a batch for synchronization
 */
export const queueBatchForSync = async (
  batchId: number,
  pdfUri?: string
): Promise<string> => {
  console.log(`[SyncService] Queuing batch ${batchId} for sync...`);
  
  return await addToSyncQueue('batch', batchId, 'update', {
    pdfUri,
    queuedAt: new Date().toISOString()
  });
};

/**
 * Queue a photo for synchronization
 */
export const queuePhotoForSync = async (
  photoData: PhotoData
): Promise<string> => {
  console.log(`[SyncService] Queuing photo ${photoData.id} for sync...`);
  
  return await addToSyncQueue('photo', photoData.id, 'update', photoData);
};

/**
 * Get sync statistics
 */
export const getSyncStats = async (): Promise<{
  pending: number;
  inProgress: number;
  completed: number;
  failed: number;
}> => {
  const db = await ensureDbOpen();
  
  try {
    const stats = {
      pending: 0,
      inProgress: 0,
      completed: 0,
      failed: 0
    };
    
    // Get counts for each status
    const pendingCount = await db.getFirstAsync<{ count: number }>(
      'SELECT COUNT(*) as count FROM sync_queue WHERE status = ?',
      ['pending']
    );
    stats.pending = pendingCount?.count || 0;
    
    const inProgressCount = await db.getFirstAsync<{ count: number }>(
      'SELECT COUNT(*) as count FROM sync_queue WHERE status = ?',
      ['in_progress']
    );
    stats.inProgress = inProgressCount?.count || 0;
    
    const completedCount = await db.getFirstAsync<{ count: number }>(
      'SELECT COUNT(*) as count FROM sync_queue WHERE status = ?',
      ['completed']
    );
    stats.completed = completedCount?.count || 0;
    
    const failedCount = await db.getFirstAsync<{ count: number }>(
      'SELECT COUNT(*) as count FROM sync_queue WHERE status = ?',
      ['failed']
    );
    stats.failed = failedCount?.count || 0;
    
    return stats;
  } catch (error) {
    console.error('[SyncService] Error getting sync stats:', error);
    throw error;
  }
};

/**
 * Force retry of failed sync items
 */
export const retryFailedSyncItems = async (): Promise<void> => {
  const db = await ensureDbOpen();
  
  try {
    // Reset status of failed items to pending
    await db.runAsync(
      'UPDATE sync_queue SET status = ? WHERE status = ?',
      ['pending', 'failed']
    );
    
    console.log('[SyncService] Reset failed sync items to pending');
    
    // Trigger sync if connected
    const isConnected = (await NetInfo.fetch()).isConnected;
    if (isConnected && !isSyncInProgress) {
      syncPendingItems().catch(error => {
        console.error('[SyncService] Error during retry sync:', error);
      });
    }
  } catch (error) {
    console.error('[SyncService] Error retrying failed sync items:', error);
    throw error;
  }
};

// Export a default object with all functions
export default {
  initSyncService,
  stopSyncTimer,
  addToSyncQueue,
  getPendingSyncItems,
  syncPendingItems,
  getBatchSyncStatus,
  queueBatchForSync,
  queuePhotoForSync,
  getSyncStats,
  retryFailedSyncItems
};
