/**
 * Photo Sync Service
 * Handles background uploading of photos from the sync queue to company storage
 */

import { openDatabase } from './databaseService';
import { errorLogger } from '../utils/errorLogger';
import { logAnalyticsEvent } from './analyticsService';

interface PhotoSyncQueueItem {
  id: number;
  photo_id: string;
  batch_id: number;
  local_path: string;
  upload_status: 'pending' | 'uploading' | 'uploaded' | 'failed';
  created_at: string;
  retry_count: number;
  last_attempt?: string;
  error_message?: string;
}

class PhotoSyncService {
  private static instance: PhotoSyncService;
  private isRunning = false;
  private syncInterval?: NodeJS.Timeout;
  private readonly SYNC_INTERVAL_MS = 30000; // 30 seconds
  private readonly MAX_RETRIES = 3;
  private readonly BATCH_SIZE = 5; // Process 5 photos at a time

  static getInstance(): PhotoSyncService {
    if (!PhotoSyncService.instance) {
      PhotoSyncService.instance = new PhotoSyncService();
    }
    return PhotoSyncService.instance;
  }

  /**
   * Start the background photo sync process
   */
  public startPhotoSync(): void {
    if (this.isRunning) {
      console.log('[PhotoSync] Photo sync already running');
      return;
    }

    console.log('[PhotoSync] Starting background photo sync service');
    this.isRunning = true;

    // Run initial sync
    this.syncPendingPhotos();

    // Set up periodic sync
    this.syncInterval = setInterval(() => {
      this.syncPendingPhotos();
    }, this.SYNC_INTERVAL_MS);
  }

  /**
   * Stop the background photo sync process
   */
  public stopPhotoSync(): void {
    console.log('[PhotoSync] Stopping background photo sync service');
    this.isRunning = false;

    if (this.syncInterval) {
      clearInterval(this.syncInterval);
      this.syncInterval = undefined;
    }
  }

  /**
   * Manually trigger a sync of pending photos
   */
  public async triggerSync(): Promise<void> {
    console.log('[PhotoSync] Manual sync triggered');
    await this.syncPendingPhotos();
  }

  /**
   * Get sync statistics
   */
  public async getSyncStats(): Promise<{
    pending: number;
    failed: number;
    uploaded: number;
  }> {
    try {
      const db = await openDatabase();
      
      const stats = await db.getFirstAsync<{
        pending: number;
        failed: number;
        uploaded: number;
      }>(`
        SELECT 
          COUNT(CASE WHEN upload_status = 'pending' THEN 1 END) as pending,
          COUNT(CASE WHEN upload_status = 'failed' THEN 1 END) as failed,
          COUNT(CASE WHEN upload_status = 'uploaded' THEN 1 END) as uploaded
        FROM photo_sync_queue
      `);

      return stats || { pending: 0, failed: 0, uploaded: 0 };
    } catch (error) {
      console.error('[PhotoSync] Error getting sync stats:', error);
      return { pending: 0, failed: 0, uploaded: 0 };
    }
  }

  /**
   * Main sync function - processes pending photos
   */
  private async syncPendingPhotos(): Promise<void> {
    if (!this.isRunning) return;

    try {
      console.log('[PhotoSync] Starting sync cycle...');
      
      const pendingPhotos = await this.getPendingPhotos();
      console.log(`[PhotoSync] Found ${pendingPhotos.length} pending photos`);

      if (pendingPhotos.length === 0) {
        return;
      }

      // Process photos in batches
      for (let i = 0; i < pendingPhotos.length; i += this.BATCH_SIZE) {
        const batch = pendingPhotos.slice(i, i + this.BATCH_SIZE);
        await this.processBatch(batch);
      }

      console.log('[PhotoSync] Sync cycle completed');
    } catch (error) {
      console.error('[PhotoSync] Error during sync cycle:', error);
      
      errorLogger.logError(
        error instanceof Error ? error : new Error('Photo sync cycle failed'),
        {
          operation: 'photo_sync_cycle',
          additionalData: { service: 'PhotoSyncService' }
        },
        'medium',
        'sync'
      );
    }
  }

  /**
   * Get pending photos from sync queue
   */
  private async getPendingPhotos(): Promise<PhotoSyncQueueItem[]> {
    const db = await openDatabase();
    
    const photos = await db.getAllAsync<PhotoSyncQueueItem>(`
      SELECT * FROM photo_sync_queue 
      WHERE upload_status IN ('pending', 'failed') 
      AND retry_count < ?
      ORDER BY created_at ASC
      LIMIT ?
    `, [this.MAX_RETRIES, this.BATCH_SIZE * 2]);

    return photos || [];
  }

  /**
   * Process a batch of photos
   */
  private async processBatch(photos: PhotoSyncQueueItem[]): Promise<void> {
    console.log(`[PhotoSync] Processing batch of ${photos.length} photos`);

    const uploadPromises = photos.map(photo => this.uploadPhoto(photo));
    await Promise.allSettled(uploadPromises);
  }

  /**
   * Upload a single photo
   */
  private async uploadPhoto(queueItem: PhotoSyncQueueItem): Promise<void> {
    const { photo_id, local_path, batch_id } = queueItem;
    
    try {
      console.log(`[PhotoSync] Uploading photo ${photo_id}...`);
      
      // Update status to uploading
      await this.updateQueueItem(queueItem.id, 'uploading');
      
      // Get company ID and reference ID for the photo
      const photoDetails = await this.getPhotoDetails(photo_id);
      if (!photoDetails) {
        throw new Error(`Photo details not found for ${photo_id}`);
      }

      // Import company storage service
      const { companyStorageService } = await import('./companyStorageService');
      
      // Generate filename
      const fileName = `${photo_id}_${Date.now()}.jpg`;
      
      // Upload to company storage
      const uploadResult = await companyStorageService.uploadPhoto(
        local_path,
        fileName,
        photoDetails.companyId,
        photoDetails.referenceId
      );

      if (uploadResult.success && uploadResult.url) {
        console.log(`[PhotoSync] Upload successful for photo ${photo_id}`);
        
        // Update photo record with storage URL
        await this.updatePhotoRecord(photo_id, uploadResult.url);
        
        // Mark as uploaded in sync queue
        await this.updateQueueItem(queueItem.id, 'uploaded');
        
        // Log analytics
        logAnalyticsEvent('photo_background_upload_success', {
          photoId: photo_id,
          batchId: batch_id.toString(),
          provider: uploadResult.metadata?.provider,
          bucket: uploadResult.bucket
        });
        
      } else {
        throw new Error(uploadResult.error || 'Upload failed without specific error');
      }
      
    } catch (error) {
      console.error(`[PhotoSync] Upload failed for photo ${photo_id}:`, error);
      
      // Update retry count and status
      await this.updateQueueItemWithError(
        queueItem.id, 
        queueItem.retry_count + 1,
        error instanceof Error ? error.message : String(error)
      );
      
      // Log error
      errorLogger.logError(
        error instanceof Error ? error : new Error('Photo upload failed'),
        {
          photoId: photo_id,
          batchId: batch_id.toString(),
          operation: 'background_photo_upload',
          additionalData: { 
            localPath: local_path,
            retryCount: queueItem.retry_count + 1
          }
        },
        queueItem.retry_count >= this.MAX_RETRIES - 1 ? 'high' : 'medium',
        'storage'
      );
      
      // Log analytics
      logAnalyticsEvent('photo_background_upload_failed', {
        photoId: photo_id,
        batchId: batch_id.toString(),
        error: error instanceof Error ? error.message : String(error),
        retryCount: queueItem.retry_count + 1
      });
    }
  }

  /**
   * Get photo details needed for upload
   */
  private async getPhotoDetails(photoId: string): Promise<{
    companyId: string;
    referenceId: string;
  } | null> {
    try {
      const db = await openDatabase();
      
      const result = await db.getFirstAsync<{
        companyId: string;
        referenceId: string;
      }>(`
        SELECT pb.companyId, pb.referenceId
        FROM photos p
        JOIN photo_batches pb ON p.batchId = pb.id
        WHERE p.id = ?
      `, [photoId]);
      
      return result;
    } catch (error) {
      console.error(`[PhotoSync] Error getting photo details for ${photoId}:`, error);
      return null;
    }
  }

  /**
   * Update photo record with storage URL
   */
  private async updatePhotoRecord(photoId: string, storageUrl: string): Promise<void> {
    const db = await openDatabase();
    
    await db.runAsync(`
      UPDATE photos 
      SET supabaseUrl = ?, syncStatus = 'uploaded', updatedAt = ?
      WHERE id = ?
    `, [storageUrl, new Date().toISOString(), photoId]);
  }

  /**
   * Update sync queue item status
   */
  private async updateQueueItem(
    queueId: number, 
    status: 'pending' | 'uploading' | 'uploaded' | 'failed'
  ): Promise<void> {
    const db = await openDatabase();
    
    await db.runAsync(`
      UPDATE photo_sync_queue 
      SET upload_status = ?, last_attempt = ?
      WHERE id = ?
    `, [status, new Date().toISOString(), queueId]);
  }

  /**
   * Update sync queue item with error
   */
  private async updateQueueItemWithError(
    queueId: number, 
    retryCount: number,
    errorMessage: string
  ): Promise<void> {
    const db = await openDatabase();
    
    const status = retryCount >= this.MAX_RETRIES ? 'failed' : 'pending';
    
    await db.runAsync(`
      UPDATE photo_sync_queue 
      SET upload_status = ?, retry_count = ?, last_attempt = ?, error_message = ?
      WHERE id = ?
    `, [status, retryCount, new Date().toISOString(), errorMessage, queueId]);
  }
}

// Export singleton instance
export const photoSyncService = PhotoSyncService.getInstance();
export default photoSyncService; 