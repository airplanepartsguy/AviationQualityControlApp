/**
 * Salesforce Sync Service
 * Handles data synchronization between app and Salesforce
 * Supports flexible mapping per company configuration
 */

import { salesforceOAuthService } from './salesforceOAuthService';
import { supabaseService } from './supabaseService';
import { databaseService } from './databaseService';

export interface SalesforceMapping {
  // Object mappings
  objects: {
    batch: string;      // e.g., 'Custom_Batch__c'
    photo: string;      // e.g., 'Custom_Photo__c'
  };
  // Field mappings
  fields: {
    // Batch fields
    batch_name: string;         // e.g., 'Name'
    batch_type: string;         // e.g., 'Type__c'
    batch_status: string;       // e.g., 'Status__c'
    batch_created_date: string; // e.g., 'Created_Date__c'
    batch_location: string;     // e.g., 'Location__c'
    
    // Photo fields
    photo_name: string;         // e.g., 'Name'
    photo_url: string;          // e.g., 'Photo_URL__c'
    photo_type: string;         // e.g., 'Type__c'
    photo_batch_id: string;     // e.g., 'Batch__c'
    photo_metadata: string;     // e.g., 'Metadata__c'
  };
}

export interface SyncResult {
  success: boolean;
  recordsProcessed: number;
  recordsSucceeded: number;
  recordsFailed: number;
  errors: string[];
  salesforceIds: { [localId: string]: string };
}

export interface BatchSyncData {
  id: string;
  name: string;
  type: string;
  status: string;
  created_at: string;
  location?: string;
  metadata?: any;
  photos: PhotoSyncData[];
}

export interface PhotoSyncData {
  id: string;
  name: string;
  type: string;
  url: string;
  batch_id: string;
  metadata?: any;
}

class SalesforceSyncService {
  /**
   * Sync batches to Salesforce for a company
   */
  async syncBatches(
    companyId: string, 
    batchIds: string[] = []
  ): Promise<SyncResult> {
    try {
      console.log('[SalesforceSync] Starting batch sync for company:', companyId);
      
      // Get valid access token
      const accessToken = await salesforceOAuthService.getValidAccessToken(companyId);
      if (!accessToken) {
        throw new Error('No valid Salesforce access token available');
      }

      // Get company integration and mapping
      const integration = await supabaseService.getCompanyIntegration(companyId, 'salesforce');
      if (!integration?.config) {
        throw new Error('Salesforce integration not configured for company');
      }

      const mapping = this.getDefaultMapping(); // Use default or get from config
      const instanceUrl = await this.getInstanceUrl(companyId);
      
      // Get batches to sync
      const batches = await this.getBatchesForSync(companyId, batchIds);
      
      const result: SyncResult = {
        success: true,
        recordsProcessed: 0,
        recordsSucceeded: 0,
        recordsFailed: 0,
        errors: [],
        salesforceIds: {}
      };

      // Sync each batch
      for (const batch of batches) {
        try {
          result.recordsProcessed++;
          
          // Create batch in Salesforce
          const batchSfId = await this.createSalesforceBatch(
            instanceUrl, 
            accessToken, 
            batch, 
            mapping
          );
          
          if (batchSfId) {
            result.salesforceIds[batch.id] = batchSfId;
            result.recordsSucceeded++;
            
            // Sync photos for this batch
            const photoResult = await this.syncPhotosForBatch(
              instanceUrl,
              accessToken,
              batch,
              batchSfId,
              mapping
            );
            
            result.recordsProcessed += photoResult.recordsProcessed;
            result.recordsSucceeded += photoResult.recordsSucceeded;
            result.recordsFailed += photoResult.recordsFailed;
            result.errors.push(...photoResult.errors);
            Object.assign(result.salesforceIds, photoResult.salesforceIds);
          } else {
            result.recordsFailed++;
            result.errors.push(`Failed to create batch: ${batch.name}`);
          }
        } catch (error) {
          result.recordsFailed++;
          result.errors.push(`Batch ${batch.name}: ${error.message}`);
          console.error('[SalesforceSync] Error syncing batch:', error);
        }
      }

      // Update sync status
      await this.updateSyncStatus(companyId, result);
      
      result.success = result.recordsFailed === 0;
      console.log('[SalesforceSync] Batch sync completed:', result);
      
      return result;
    } catch (error) {
      console.error('[SalesforceSync] Error in batch sync:', error);
      return {
        success: false,
        recordsProcessed: 0,
        recordsSucceeded: 0,
        recordsFailed: 0,
        errors: [error.message],
        salesforceIds: {}
      };
    }
  }

  /**
   * Create a batch record in Salesforce
   */
  private async createSalesforceBatch(
    instanceUrl: string,
    accessToken: string,
    batch: BatchSyncData,
    mapping: SalesforceMapping
  ): Promise<string | null> {
    try {
      const batchData = {
        [mapping.fields.batch_name]: batch.name,
        [mapping.fields.batch_type]: batch.type,
        [mapping.fields.batch_status]: batch.status,
        [mapping.fields.batch_created_date]: batch.created_at,
        [mapping.fields.batch_location]: batch.location || '',
      };

      const response = await fetch(
        `${instanceUrl}/services/data/v58.0/sobjects/${mapping.objects.batch}/`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
            'Accept': 'application/json'
          },
          body: JSON.stringify(batchData)
        }
      );

      if (!response.ok) {
        const errorText = await response.text();
        console.error('[SalesforceSync] Failed to create batch:', errorText);
        return null;
      }

      const result = await response.json();
      return result.id;
    } catch (error) {
      console.error('[SalesforceSync] Error creating Salesforce batch:', error);
      return null;
    }
  }

  /**
   * Sync photos for a batch
   */
  private async syncPhotosForBatch(
    instanceUrl: string,
    accessToken: string,
    batch: BatchSyncData,
    batchSfId: string,
    mapping: SalesforceMapping
  ): Promise<SyncResult> {
    const result: SyncResult = {
      success: true,
      recordsProcessed: 0,
      recordsSucceeded: 0,
      recordsFailed: 0,
      errors: [],
      salesforceIds: {}
    };

    for (const photo of batch.photos) {
      try {
        result.recordsProcessed++;
        
        const photoData = {
          [mapping.fields.photo_name]: photo.name,
          [mapping.fields.photo_url]: photo.url,
          [mapping.fields.photo_type]: photo.type,
          [mapping.fields.photo_batch_id]: batchSfId,
          [mapping.fields.photo_metadata]: JSON.stringify(photo.metadata || {})
        };

        const response = await fetch(
          `${instanceUrl}/services/data/v58.0/sobjects/${mapping.objects.photo}/`,
          {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${accessToken}`,
              'Content-Type': 'application/json',
              'Accept': 'application/json'
            },
            body: JSON.stringify(photoData)
          }
        );

        if (response.ok) {
          const photoResult = await response.json();
          result.salesforceIds[photo.id] = photoResult.id;
          result.recordsSucceeded++;
        } else {
          const errorText = await response.text();
          result.recordsFailed++;
          result.errors.push(`Photo ${photo.name}: ${errorText}`);
        }
      } catch (error) {
        result.recordsFailed++;
        result.errors.push(`Photo ${photo.name}: ${error.message}`);
      }
    }

    return result;
  }

  /**
   * Get batches for sync from local database
   */
  private async getBatchesForSync(
    companyId: string, 
    batchIds: string[] = []
  ): Promise<BatchSyncData[]> {
    try {
      // Get batches from local database
      const db = await databaseService.getDatabase();
      
      let query = `
        SELECT 
          b.*,
          p.id as photo_id,
          p.name as photo_name,
          p.type as photo_type,
          p.file_path as photo_url,
          p.metadata as photo_metadata
        FROM photo_batches b
        LEFT JOIN photos p ON b.id = p.batch_id
        WHERE b.company_id = ?
      `;
      
      const params = [companyId];
      
      if (batchIds.length > 0) {
        query += ` AND b.id IN (${batchIds.map(() => '?').join(',')})`;
        params.push(...batchIds);
      }
      
      query += ` ORDER BY b.created_at DESC, p.created_at ASC`;
      
      const rows = await db.getAllAsync(query, params);
      
      // Group by batch
      const batchMap = new Map<string, BatchSyncData>();
      
      for (const row of rows) {
        if (!batchMap.has(row.id)) {
          batchMap.set(row.id, {
            id: row.id,
            name: row.name,
            type: row.type,
            status: row.status,
            created_at: row.created_at,
            location: row.location,
            metadata: row.metadata ? JSON.parse(row.metadata) : {},
            photos: []
          });
        }
        
        if (row.photo_id) {
          const batch = batchMap.get(row.id)!;
          batch.photos.push({
            id: row.photo_id,
            name: row.photo_name,
            type: row.photo_type,
            url: row.photo_url, // This should be converted to public URL
            batch_id: row.id,
            metadata: row.photo_metadata ? JSON.parse(row.photo_metadata) : {}
          });
        }
      }
      
      return Array.from(batchMap.values());
    } catch (error) {
      console.error('[SalesforceSync] Error getting batches for sync:', error);
      return [];
    }
  }

  /**
   * Get Salesforce instance URL for company
   */
  private async getInstanceUrl(companyId: string): Promise<string> {
    const integration = await supabaseService.getCompanyIntegration(companyId, 'salesforce');
    return integration?.metadata?.instance_url || 'https://login.salesforce.com';
  }

  /**
   * Update sync status in company integration
   */
  private async updateSyncStatus(companyId: string, result: SyncResult): Promise<void> {
    try {
      await supabaseService.updateCompanyIntegration(companyId, 'salesforce', {
        last_sync_at: new Date().toISOString(),
        metadata: {
          last_sync_result: {
            success: result.success,
            records_processed: result.recordsProcessed,
            records_succeeded: result.recordsSucceeded,
            records_failed: result.recordsFailed,
            error_count: result.errors.length
          }
        }
      });
    } catch (error) {
      console.error('[SalesforceSync] Error updating sync status:', error);
    }
  }

  /**
   * Get default field mapping (can be customized per company)
   */
  private getDefaultMapping(): SalesforceMapping {
    return {
      objects: {
        batch: 'Custom_Batch__c',
        photo: 'Custom_Photo__c'
      },
      fields: {
        batch_name: 'Name',
        batch_type: 'Type__c',
        batch_status: 'Status__c',
        batch_created_date: 'Created_Date__c',
        batch_location: 'Location__c',
        photo_name: 'Name',
        photo_url: 'Photo_URL__c',
        photo_type: 'Type__c',
        photo_batch_id: 'Batch__c',
        photo_metadata: 'Metadata__c'
      }
    };
  }

  /**
   * Test Salesforce API connection and permissions
   */
  async testSalesforceAPI(companyId: string): Promise<{
    success: boolean;
    message: string;
    details?: any;
  }> {
    try {
      const accessToken = await salesforceOAuthService.getValidAccessToken(companyId);
      if (!accessToken) {
        return {
          success: false,
          message: 'No valid access token available'
        };
      }

      const instanceUrl = await this.getInstanceUrl(companyId);
      const mapping = this.getDefaultMapping();

      // Test API access
      const apiResponse = await fetch(`${instanceUrl}/services/data/v58.0/`, {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Accept': 'application/json'
        }
      });

      if (!apiResponse.ok) {
        return {
          success: false,
          message: 'Failed to access Salesforce API'
        };
      }

      // Test object access
      const objectResponse = await fetch(
        `${instanceUrl}/services/data/v58.0/sobjects/${mapping.objects.batch}/describe/`,
        {
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Accept': 'application/json'
          }
        }
      );

      if (!objectResponse.ok) {
        return {
          success: false,
          message: `Cannot access ${mapping.objects.batch} object. Please check permissions.`
        };
      }

      const objectInfo = await objectResponse.json();
      
      return {
        success: true,
        message: 'Salesforce API connection successful',
        details: {
          api_version: '58.0',
          instance_url: instanceUrl,
          batch_object: mapping.objects.batch,
          object_accessible: true,
          fields_count: objectInfo.fields?.length || 0
        }
      };
    } catch (error) {
      console.error('[SalesforceSync] API test failed:', error);
      return {
        success: false,
        message: `API test failed: ${error.message}`
      };
    }
  }
}

export const salesforceSyncService = new SalesforceSyncService();
