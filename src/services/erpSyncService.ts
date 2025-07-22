/**
 * ERP Sync Service
 * Manages batch synchronization status with ERP systems (Salesforce, SAP, etc.)
 */

import * as databaseService from './databaseService';
import salesforceUploadService from './salesforceUploadService';
import { pdfGenerationService } from './pdfGenerationService';
import { PhotoData } from '../types/data';
import { logAnalyticsEvent, logErrorToFile } from './analyticsService';

export interface ErpSyncStatus {
  batchId: string;
  erpSystem: 'salesforce' | 'sap' | 'sharepoint';
  syncStatus: 'pending' | 'syncing' | 'synced' | 'failed';
  syncedAt?: string;
  errorMessage?: string;
  attachmentId?: string;
  recordId?: string;
  retryCount: number;
  lastSyncAttempt?: string;
}

export interface BatchSyncResult {
  batchId: string;
  success: boolean;
  message: string;
  attachmentId?: string;
  recordId?: string;
  error?: string;
}

export interface BulkSyncResult {
  totalBatches: number;
  successCount: number;
  failedCount: number;
  results: BatchSyncResult[];
  duration: number;
}

export class ErpSyncService {
  /**
   * Initialize sync status tables
   */
  async initializeSyncTables(): Promise<void> {
    try {
      const db = await databaseService.openDatabase();
      
      // Create ERP sync status table
      await db.execAsync(`
        CREATE TABLE IF NOT EXISTS erp_sync_status (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          batch_id TEXT NOT NULL,
          erp_system TEXT NOT NULL,
          sync_status TEXT NOT NULL DEFAULT 'pending',
          synced_at TEXT,
          error_message TEXT,
          attachment_id TEXT,
          record_id TEXT,
          retry_count INTEGER DEFAULT 0,
          last_sync_attempt TEXT,
          created_at TEXT NOT NULL DEFAULT (datetime('now')),
          updated_at TEXT NOT NULL DEFAULT (datetime('now')),
          FOREIGN KEY (batch_id) REFERENCES batches (id)
        )
      `);

      console.log('[ErpSync] Sync status tables initialized');
    } catch (error) {
      console.error('[ErpSync] Failed to initialize sync tables:', error);
      throw error;
    }
  }

  /**
   * Get ERP sync status for a batch
   */
  async getBatchSyncStatus(batchId: string, erpSystem: string): Promise<ErpSyncStatus | null> {
    try {
      const db = await databaseService.openDatabase();
      const result = await db.getFirstAsync(
        'SELECT * FROM erp_sync_status WHERE batch_id = ? AND erp_system = ?',
        [batchId, erpSystem]
      ) as any;

      if (!result) return null;

      return {
        batchId: result.batch_id,
        erpSystem: result.erp_system,
        syncStatus: result.sync_status,
        syncedAt: result.synced_at,
        errorMessage: result.error_message,
        attachmentId: result.attachment_id,
        recordId: result.record_id,
        retryCount: result.retry_count,
        lastSyncAttempt: result.last_sync_attempt
      };
    } catch (error) {
      console.error('[ErpSync] Failed to get batch sync status:', error);
      return null;
    }
  }

  /**
   * Update ERP sync status for a batch
   */
  async updateBatchSyncStatus(
    batchId: string,
    erpSystem: string,
    status: ErpSyncStatus['syncStatus'],
    options: {
      errorMessage?: string;
      attachmentId?: string;
      recordId?: string;
      incrementRetry?: boolean;
    } = {}
  ): Promise<void> {
    try {
      const db = await databaseService.openDatabase();
      const now = new Date().toISOString();

      const syncedAt = status === 'synced' ? now : null;
      const retryIncrement = options.incrementRetry ? 1 : 0;

      await db.runAsync(`
        INSERT OR REPLACE INTO erp_sync_status (
          batch_id, erp_system, sync_status, synced_at, error_message,
          attachment_id, record_id, retry_count, last_sync_attempt, updated_at
        ) VALUES (
          ?, ?, ?, ?, ?, ?, ?, 
          COALESCE((SELECT retry_count FROM erp_sync_status WHERE batch_id = ? AND erp_system = ?), 0) + ?,
          ?, ?
        )
      `, [
        batchId, erpSystem, status, syncedAt, options.errorMessage,
        options.attachmentId, options.recordId, batchId, erpSystem, retryIncrement, now, now
      ]);

      console.log(`[ErpSync] Updated sync status for batch ${batchId}: ${status}`);
    } catch (error) {
      console.error('[ErpSync] Failed to update batch sync status:', error);
      throw error;
    }
  }

  /**
   * Get all batches with their ERP sync status
   */
  async getBatchesWithSyncStatus(userId: string, erpSystem: string = 'salesforce'): Promise<any[]> {
    try {
      const db = await databaseService.openDatabase();
      const result = await db.getAllAsync(`
        SELECT 
          pb.*,
          ess.sync_status,
          ess.synced_at,
          ess.error_message,
          ess.attachment_id,
          ess.record_id,
          ess.retry_count
        FROM photo_batches pb
        LEFT JOIN erp_sync_status ess ON pb.id = ess.batch_id AND ess.erp_system = ?
        WHERE pb.user_id = ?
        ORDER BY pb.created_at DESC
      `, [erpSystem, userId]) as any[];

      return result.map(batch => ({
        ...batch,
        syncStatus: batch.sync_status || 'pending',
        syncedAt: batch.synced_at,
        errorMessage: batch.error_message,
        attachmentId: batch.attachment_id,
        recordId: batch.record_id,
        retryCount: batch.retry_count || 0
      }));
    } catch (error) {
      console.error('[ErpSync] Failed to get batches with sync status:', error);
      return [];
    }
  }

  /**
   * Get pending batches for ERP sync
   */
  async getPendingBatches(userId: string, erpSystem: string = 'salesforce'): Promise<any[]> {
    try {
      const batches = await this.getBatchesWithSyncStatus(userId, erpSystem);
      return batches.filter(batch => 
        batch.syncStatus === 'pending' || batch.syncStatus === 'failed'
      );
    } catch (error) {
      console.error('[ErpSync] Failed to get pending batches:', error);
      return [];
    }
  }

  /**
   * Sync single batch to ERP
   */
  async syncBatchToErp(
    batchId: string,
    companyId: string,
    erpSystem: string = 'salesforce'
  ): Promise<BatchSyncResult> {
    try {
      console.log(`[ErpSync] Starting sync for batch ${batchId} to ${erpSystem}`);
      
      // Update status to syncing
      await this.updateBatchSyncStatus(batchId, erpSystem, 'syncing');

      // Get batch details and photos
      const batchDetails = await this.getBatchDetails(batchId);
      if (!batchDetails) {
        throw new Error(`Batch ${batchId} not found`);
      }

      const { photos, referenceId } = batchDetails;
      if (!photos || photos.length === 0) {
        throw new Error(`No photos found for batch ${batchId}`);
      }

      // Generate PDF from photos
      const pdfResult = await pdfGenerationService.generatePdfFromPhotos(
        photos,
        referenceId,
        {
          title: `${referenceId} - Quality Control Photos`,
          includeMetadata: true
        }
      );

      if (!pdfResult.success) {
        throw new Error(`PDF generation failed: ${pdfResult.error}`);
      }

      // Upload to ERP system
      let uploadResult;
      switch (erpSystem) {
        case 'salesforce':
          uploadResult = await salesforceUploadService.uploadPdfByScannedId(
            companyId,
            referenceId,
            pdfResult.pdfBase64!
          );
          break;
        default:
          throw new Error(`Unsupported ERP system: ${erpSystem}`);
      }

      if (uploadResult.success) {
        // Update status to synced
        await this.updateBatchSyncStatus(batchId, erpSystem, 'synced', {
          attachmentId: uploadResult.attachmentId,
          recordId: uploadResult.recordId
        });

        // Log analytics
        logAnalyticsEvent('erp_sync_success', {
          batchId,
          erpSystem,
          photoCount: photos.length,
          attachmentId: uploadResult.attachmentId
        });

        return {
          batchId,
          success: true,
          message: uploadResult.message,
          attachmentId: uploadResult.attachmentId,
          recordId: uploadResult.recordId
        };
      } else {
        // Update status to failed
        await this.updateBatchSyncStatus(batchId, erpSystem, 'failed', {
          errorMessage: uploadResult.message,
          incrementRetry: true
        });

        return {
          batchId,
          success: false,
          message: uploadResult.message,
          error: uploadResult.message
        };
      }

    } catch (error) {
      console.error(`[ErpSync] Sync failed for batch ${batchId}:`, error);
      
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      
      // Update status to failed
      await this.updateBatchSyncStatus(batchId, erpSystem, 'failed', {
        errorMessage,
        incrementRetry: true
      });

      // Log error
      logErrorToFile('erp_sync_error', error instanceof Error ? error : new Error(String(error)));

      return {
        batchId,
        success: false,
        message: errorMessage,
        error: errorMessage
      };
    }
  }

  /**
   * Bulk sync multiple batches to ERP
   */
  async bulkSyncToErp(
    batchIds: string[],
    companyId: string,
    erpSystem: string = 'salesforce'
  ): Promise<BulkSyncResult> {
    const startTime = Date.now();
    const results: BatchSyncResult[] = [];
    let successCount = 0;
    let failedCount = 0;

    console.log(`[ErpSync] Starting bulk sync of ${batchIds.length} batches to ${erpSystem}`);

    for (const batchId of batchIds) {
      try {
        const result = await this.syncBatchToErp(batchId, companyId, erpSystem);
        results.push(result);
        
        if (result.success) {
          successCount++;
        } else {
          failedCount++;
        }
      } catch (error) {
        console.error(`[ErpSync] Bulk sync failed for batch ${batchId}:`, error);
        failedCount++;
        results.push({
          batchId,
          success: false,
          message: error instanceof Error ? error.message : 'Unknown error',
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    }

    const duration = Date.now() - startTime;
    
    // Log bulk sync analytics
    logAnalyticsEvent('erp_bulk_sync_complete', {
      erpSystem,
      totalBatches: batchIds.length,
      successCount,
      failedCount,
      duration
    });

    console.log(`[ErpSync] Bulk sync completed: ${successCount} success, ${failedCount} failed, ${duration}ms`);

    return {
      totalBatches: batchIds.length,
      successCount,
      failedCount,
      results,
      duration
    };
  }

  /**
   * Get batch details with photos
   */
  private async getBatchDetails(batchId: string): Promise<{ photos: PhotoData[]; referenceId: string } | null> {
    try {
      const db = await databaseService.openDatabase();
      
      // Get batch info
      const batch = await db.getFirstAsync(
        'SELECT * FROM photo_batches WHERE id = ?',
        [batchId]
      ) as any;

      if (!batch) return null;

      // Get photos for batch
      const photos = await db.getAllAsync(
        'SELECT * FROM photos WHERE batch_id = ? ORDER BY created_at ASC',
        [batchId]
      ) as any[];

      return {
        photos: photos.map(photo => ({
          id: photo.id,
          uri: photo.file_path,
          timestamp: photo.created_at,
          batchId: photo.batch_id
        })),
        referenceId: batch.reference_id || batch.order_number || batch.inventory_id
      };
    } catch (error) {
      console.error('[ErpSync] Failed to get batch details:', error);
      return null;
    }
  }
}

export default new ErpSyncService();
