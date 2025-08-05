/**
 * ERP Sync Service
 * Manages batch synchronization status with ERP systems (Salesforce, SAP, etc.)
 */

import * as databaseService from './databaseService';
import salesforceUploadService from './salesforceUploadService';
import { pdfGenerationService } from './pdfGenerationService';
import { PhotoData } from '../types/data';
import { logAnalyticsEvent, logErrorToFile } from './analyticsService';
import supabaseService from './supabaseService';

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
   * Check if batch has already been uploaded to ERP
   */
  async isBatchUploadedToErp(batchId: string): Promise<boolean> {
    try {
      const { data, error } = await supabaseService.supabase
        .from('photo_batches')
        .select('erp_uploaded')
        .eq('id', batchId)
        .single();

      if (error || !data) {
        return false;
      }

      return data.erp_uploaded === true;
    } catch (error) {
      console.error('[ErpSync] Error checking batch upload status:', error);
      return false;
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
      
      // Check if batch has already been uploaded to prevent duplicates
      const isAlreadyUploaded = await this.isBatchUploadedToErp(batchId);
      if (isAlreadyUploaded) {
        console.log(`[ErpSync] Batch ${batchId} has already been uploaded to ERP`);
        return {
          batchId,
          success: true,
          message: 'Batch has already been uploaded to ERP'
        };
      }
      
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
        // Update status to synced in local database
        await this.updateBatchSyncStatus(batchId, erpSystem, 'synced', {
          attachmentId: uploadResult.attachmentId,
          recordId: uploadResult.recordId
        });

        // Update Supabase to mark batch as uploaded to ERP
        try {
          const { error } = await supabaseService.supabase
            .from('photo_batches')
            .update({
              erp_uploaded: true,
              erp_uploaded_at: new Date().toISOString(),
              erp_uploaded_by: await supabaseService.getCurrentUserId(),
              erp_record_ids: {
                [erpSystem]: {
                  recordId: uploadResult.recordId,
                  attachmentId: uploadResult.attachmentId
                }
              },
              erp_upload_error: null
            })
            .eq('id', batchId);

          if (error) {
            console.error('[ErpSync] Failed to update Supabase photo_batches:', error);
          }
        } catch (error) {
          console.error('[ErpSync] Error updating Supabase:', error);
        }

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

        // Update Supabase to mark batch upload as failed
        try {
          const { error } = await supabaseService.supabase
            .from('photo_batches')
            .update({
              erp_uploaded: false,
              erp_upload_error: uploadResult.message
            })
            .eq('id', batchId);

          if (error) {
            console.error('[ErpSync] Failed to update Supabase photo_batches:', error);
          }
        } catch (error) {
          console.error('[ErpSync] Error updating Supabase:', error);
        }

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
      
      // Import compatibility helper
      const { databaseCompatibility } = await import('../utils/databaseCompatibility');
      
      console.log('[ErpSync] Getting batch details for batch:', batchId);
      
      // Get batch info  
      const batch = await db.getFirstAsync(
        'SELECT * FROM photo_batches WHERE id = ?',
        [batchId]
      ) as any;

      if (!batch) {
        console.log('[ErpSync] No batch found with ID:', batchId);
        return null;
      }

      console.log('[ErpSync] Found batch:', {
        id: batch.id,
        referenceId: batch.referenceId || batch.orderNumber || batch.inventoryId,
        hasReferenceId: !!(batch.referenceId || batch.orderNumber || batch.inventoryId)
      });

      // Get photos for batch using compatibility layer
      let photos: any[] = [];
      
      try {
        // First try with batchId (camelCase)
        photos = await db.getAllAsync(
          'SELECT * FROM photos WHERE batchId = ? ORDER BY id ASC',
          [batchId]
        ) as any[];
        console.log('[ErpSync] Retrieved photos using batchId (camelCase):', photos.length);
      } catch (camelCaseError) {
        console.log('[ErpSync] CamelCase query failed, trying snake_case...', camelCaseError.message);
        
        try {
          // Fallback to batch_id (snake_case)
          photos = await db.getAllAsync(
            'SELECT * FROM photos WHERE batch_id = ? ORDER BY id ASC',
            [batchId]
          ) as any[];
          console.log('[ErpSync] Retrieved photos using batch_id (snake_case):', photos.length);
        } catch (snakeCaseError) {
          console.error('[ErpSync] Both camelCase and snake_case queries failed:', {
            camelCaseError: camelCaseError.message,
            snakeCaseError: snakeCaseError.message
          });
          
          // Get schema information for debugging
          const schema = await databaseCompatibility.getTableSchema(db, 'photos');
          console.error('[ErpSync] Photos table schema:', schema);
          
          throw new Error(`No photos found for batch ${batchId}. Schema: ${JSON.stringify(schema)}`);
        }
      }

      if (photos.length === 0) {
        console.log('[ErpSync] No photos found for batch:', batchId);
      }

      return {
        photos: photos.map(photo => ({
          id: photo.id,
          uri: photo.uri || photo.file_path, // Support both column names
          timestamp: photo.metadataJson ? JSON.parse(photo.metadataJson).timestamp : (photo.created_at || new Date().toISOString()),
          batchId: photo.batchId || photo.batch_id // Support both column names
        })),
        referenceId: batch.referenceId || batch.orderNumber || batch.inventoryId
      };
    } catch (error) {
      console.error('[ErpSync] Failed to get batch details:', error);
      return null;
    }
  }
}

export const erpSyncService = new ErpSyncService();
export default erpSyncService;
