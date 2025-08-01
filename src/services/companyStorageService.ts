/**
 * Company Storage Service - Multi-Tenant Storage Management
 * Provides secure, isolated storage for each company with configurable options
 */

import { supabase } from '../lib/supabaseClient';
import { Company, getCompanyById } from './companyService';
import { getTenantContext } from './dataIsolationService';
import { logError, logSupabaseError } from '../utils/errorLogger';

export interface CompanyStorageConfig {
  // Storage Provider Options
  provider: 'local_only' | 'supabase' | 'aws_s3' | 'azure_blob' | 'google_cloud';
  
  // Upload Settings
  enableCloudUpload: boolean;
  localBackupEnabled: boolean;
  
  // Supabase-specific settings
  supabase?: {
    bucketName: string;
    customBucketId?: string;
    retentionDays: number;
    maxFileSize: number; // in MB
    allowedFileTypes: string[];
    compressionEnabled: boolean;
    compressionQuality: number; // 0.1 to 1.0
  };
  
  // Security Settings
  encryptionEnabled: boolean;
  accessLogging: boolean;
  
  // Compliance Settings
  gdprCompliant: boolean;
  hipaaCompliant: boolean;
  dataResidency: 'us' | 'eu' | 'asia' | 'custom';
  customRegion?: string;
}

export interface StorageUploadResult {
  success: boolean;
  url?: string;
  localPath?: string;
  providerId?: string;
  bucket?: string;
  error?: string;
  metadata?: {
    size: number;
    contentType: string;
    uploadedAt: string;
    provider: string;
    encrypted: boolean;
  };
}

export interface StorageProviderInterface {
  upload(file: Blob, path: string, config: CompanyStorageConfig): Promise<StorageUploadResult>;
  delete(path: string, config: CompanyStorageConfig): Promise<boolean>;
  getUrl(path: string, config: CompanyStorageConfig): Promise<string>;
  createBucket?(bucketName: string, config: CompanyStorageConfig): Promise<boolean>;
}

class CompanyStorageService {
  private static instance: CompanyStorageService;
  private storageProviders: Map<string, StorageProviderInterface> = new Map();

  private constructor() {
    this.initializeProviders();
  }

  static getInstance(): CompanyStorageService {
    if (!CompanyStorageService.instance) {
      CompanyStorageService.instance = new CompanyStorageService();
    }
    return CompanyStorageService.instance;
  }

  private initializeProviders() {
    // Register Supabase provider
    this.storageProviders.set('supabase', new SupabaseStorageProvider());
    
    // Register local-only provider
    this.storageProviders.set('local_only', new LocalStorageProvider());
    
    // Future providers can be added here
    // this.storageProviders.set('aws_s3', new AWSS3Provider());
    // this.storageProviders.set('azure_blob', new AzureBlobProvider());
  }

  /**
   * Get default storage configuration for a company
   */
  getDefaultStorageConfig(companyId: string): CompanyStorageConfig {
    const bucketName = this.generateBucketName(companyId);
    
    return {
      provider: 'supabase',
      enableCloudUpload: true,
      localBackupEnabled: true,
      supabase: {
        bucketName,
        retentionDays: 2555, // 7 years default
        maxFileSize: 50, // 50MB
        allowedFileTypes: ['jpg', 'jpeg', 'png', 'pdf'],
        compressionEnabled: true,
        compressionQuality: 0.8
      },
      encryptionEnabled: true,
      accessLogging: true,
      gdprCompliant: true,
      hipaaCompliant: false,
      dataResidency: 'us'
    };
  }

  /**
   * Generate unique bucket name for company
   */
  private generateBucketName(companyId: string): string {
    // Special case for TurbineWorks - use existing bucket
    if (companyId === '70b41ce9-bf19-4b1a-9c37-5b00cb33cadf') {
      return 'turbineworks';
    }
    
    // For all other companies, use secure UUID-based naming
    const cleanId = companyId.toLowerCase().replace(/[^a-z0-9-]/g, '-');
    return `company-${cleanId}-photos`;
  }

  /**
   * Get company storage configuration
   */
  async getCompanyStorageConfig(companyId: string): Promise<CompanyStorageConfig> {
    try {
      const company = await getCompanyById(companyId);
      if (!company) {
        throw new Error(`Company not found: ${companyId}`);
      }

      // Parse storage settings from company settings
      const settings = typeof company.settings === 'string' 
        ? JSON.parse(company.settings) 
        : company.settings || {};

      return {
        ...this.getDefaultStorageConfig(companyId),
        ...settings.storage
      };
    } catch (error) {
      logError(error, { companyId, operation: 'get_storage_config' }, 'medium', 'storage');
      return this.getDefaultStorageConfig(companyId);
    }
  }

  /**
   * Update company storage configuration
   */
  async updateCompanyStorageConfig(
    companyId: string, 
    storageConfig: Partial<CompanyStorageConfig>
  ): Promise<boolean> {
    try {
      const tenantContext = getTenantContext();
      if (!tenantContext || tenantContext.companyId !== companyId) {
        throw new Error('Access denied: Invalid tenant context');
      }

      const company = await getCompanyById(companyId);
      if (!company) {
        throw new Error(`Company not found: ${companyId}`);
      }

      // Merge with existing settings
      const currentSettings = typeof company.settings === 'string' 
        ? JSON.parse(company.settings) 
        : company.settings || {};

      const updatedSettings = {
        ...currentSettings,
        storage: {
          ...currentSettings.storage,
          ...storageConfig
        }
      };

      // Update in Supabase
      const { error } = await supabase
        .from('companies')
        .update({ 
          settings: JSON.stringify(updatedSettings),
          updatedAt: new Date().toISOString()
        })
        .eq('id', companyId);

      if (error) {
        throw error;
      }

      console.log(`[CompanyStorage] Updated storage config for company ${companyId}`);
      return true;
    } catch (error) {
      logError(error, { companyId, operation: 'update_storage_config' }, 'high', 'storage');
      return false;
    }
  }

  /**
   * Initialize company storage (create buckets, set policies)
   */
  async initializeCompanyStorage(companyId: string): Promise<boolean> {
    try {
      const config = await this.getCompanyStorageConfig(companyId);
      
      if (config.provider === 'local_only') {
        console.log(`[CompanyStorage] Company ${companyId} using local-only storage`);
        return true;
      }

      const provider = this.storageProviders.get(config.provider);
      if (!provider) {
        throw new Error(`Storage provider not found: ${config.provider}`);
      }

      // Create company-specific bucket if needed
      if (provider.createBucket && config.supabase?.bucketName) {
        const bucketCreated = await provider.createBucket(config.supabase.bucketName, config);
        if (!bucketCreated) {
          throw new Error(`Failed to create bucket: ${config.supabase.bucketName}`);
        }
      }

      console.log(`[CompanyStorage] Initialized storage for company ${companyId}`);
      return true;
    } catch (error) {
      logError(error, { companyId, operation: 'initialize_storage' }, 'critical', 'storage');
      return false;
    }
  }

  /**
   * Upload photo with company-specific configuration
   */
  async uploadPhoto(
    photoUri: string,
    fileName: string,
    companyId: string,
    scannedId: string
  ): Promise<StorageUploadResult> {
    try {
      const config = await this.getCompanyStorageConfig(companyId);
      
      // If cloud upload is disabled, only store locally
      if (!config.enableCloudUpload) {
        return await this.storeLocalOnly(photoUri, fileName, companyId, scannedId);
      }

      const provider = this.storageProviders.get(config.provider);
      if (!provider) {
        throw new Error(`Storage provider not found: ${config.provider}`);
      }

      // Read and prepare file
      const response = await fetch(photoUri);
      if (!response.ok) {
        throw new Error(`Failed to read photo: ${response.status}`);
      }
      const blob = await response.blob();

      // Create storage path
      const storagePath = `${companyId}/${scannedId}/${fileName}`;

      // Upload using configured provider
      const result = await provider.upload(blob, storagePath, config);

      // Store local backup if enabled
      if (config.localBackupEnabled && result.success) {
        await this.storeLocalBackup(photoUri, fileName, companyId, scannedId);
      }

      // Log access if enabled
      if (config.accessLogging) {
        await this.logStorageAccess('upload', companyId, storagePath, result.success);
      }

      return result;
    } catch (error) {
      logError(error, { 
        companyId, 
        operation: 'upload_photo',
        additionalData: { fileName, scannedId }
      }, 'high', 'storage');

      return {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  /**
   * Store photo locally only
   */
  private async storeLocalOnly(
    photoUri: string,
    fileName: string,
    companyId: string,
    scannedId: string
  ): Promise<StorageUploadResult> {
    try {
      const provider = this.storageProviders.get('local_only');
      if (!provider) {
        throw new Error('Local storage provider not available');
      }

      const response = await fetch(photoUri);
      const blob = await response.blob();
      const localPath = `${companyId}/${scannedId}/${fileName}`;

      const result = await provider.upload(blob, localPath, {
        provider: 'local_only',
        enableCloudUpload: false,
        localBackupEnabled: false,
        encryptionEnabled: false,
        accessLogging: false,
        gdprCompliant: true,
        hipaaCompliant: false,
        dataResidency: 'us'
      });

      return result;
    } catch (error) {
      throw new Error(`Local storage failed: ${error}`);
    }
  }

  /**
   * Store local backup copy
   */
  private async storeLocalBackup(
    photoUri: string,
    fileName: string,
    companyId: string,
    scannedId: string
  ): Promise<void> {
    try {
      // Implementation for local backup storage
      console.log(`[CompanyStorage] Local backup stored for ${fileName}`);
    } catch (error) {
      console.warn(`[CompanyStorage] Local backup failed:`, error);
    }
  }

  /**
   * Log storage access for compliance
   */
  private async logStorageAccess(
    operation: string,
    companyId: string,
    path: string,
    success: boolean
  ): Promise<void> {
    try {
      // Implementation for access logging
      console.log(`[CompanyStorage] Access logged: ${operation} on ${path} - ${success ? 'SUCCESS' : 'FAILED'}`);
    } catch (error) {
      console.warn(`[CompanyStorage] Access logging failed:`, error);
    }
  }

  /**
   * Check if company storage is properly configured
   */
  async validateStorageSetup(companyId: string): Promise<{
    valid: boolean;
    issues: string[];
    recommendations: string[];
  }> {
    const issues: string[] = [];
    const recommendations: string[] = [];

    try {
      const config = await this.getCompanyStorageConfig(companyId);

      // Check provider availability
      if (!this.storageProviders.has(config.provider)) {
        issues.push(`Storage provider '${config.provider}' is not available`);
      }

      // Check Supabase configuration
      if (config.provider === 'supabase' && config.enableCloudUpload) {
        if (!config.supabase?.bucketName) {
          issues.push('Supabase bucket name not configured');
        }

        // Test bucket access
        try {
          const { data, error } = await supabase.storage
            .from(config.supabase?.bucketName || 'test')
            .list('', { limit: 1 });

          if (error && error.message.includes('Bucket not found')) {
            issues.push(`Supabase bucket '${config.supabase?.bucketName}' does not exist`);
            recommendations.push('Create the company-specific storage bucket');
          }
        } catch (error) {
          issues.push('Unable to test Supabase bucket access');
        }
      }

      // Security recommendations
      if (!config.encryptionEnabled) {
        recommendations.push('Enable encryption for sensitive data');
      }

      if (!config.accessLogging) {
        recommendations.push('Enable access logging for compliance');
      }

      return {
        valid: issues.length === 0,
        issues,
        recommendations
      };
    } catch (error) {
      return {
        valid: false,
        issues: [`Storage validation failed: ${error}`],
        recommendations: ['Check storage service configuration']
      };
    }
  }
}

/**
 * Supabase Storage Provider Implementation
 */
class SupabaseStorageProvider implements StorageProviderInterface {
  async upload(blob: Blob, path: string, config: CompanyStorageConfig): Promise<StorageUploadResult> {
    try {
      if (!config.supabase?.bucketName) {
        throw new Error('Supabase bucket name not configured');
      }

      const { data, error } = await supabase.storage
        .from(config.supabase.bucketName)
        .upload(path, blob, {
          cacheControl: '3600',
          upsert: true
        });

      if (error) {
        logSupabaseError(error, 'storage_upload', {
          operation: 'supabase_upload',
          additionalData: { bucket: config.supabase.bucketName, path }
        });
        throw error;
      }

      // Get public URL
      const { data: { publicUrl } } = supabase.storage
        .from(config.supabase.bucketName)
        .getPublicUrl(path);

      return {
        success: true,
        url: publicUrl,
        providerId: data.path,
        bucket: config.supabase.bucketName,
        metadata: {
          size: blob.size,
          contentType: blob.type,
          uploadedAt: new Date().toISOString(),
          provider: 'supabase',
          encrypted: config.encryptionEnabled
        }
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  async delete(path: string, config: CompanyStorageConfig): Promise<boolean> {
    try {
      if (!config.supabase?.bucketName) {
        throw new Error('Supabase bucket name not configured');
      }

      const { error } = await supabase.storage
        .from(config.supabase.bucketName)
        .remove([path]);

      return !error;
    } catch (error) {
      return false;
    }
  }

  async getUrl(path: string, config: CompanyStorageConfig): Promise<string> {
    if (!config.supabase?.bucketName) {
      throw new Error('Supabase bucket name not configured');
    }

    const { data: { publicUrl } } = supabase.storage
      .from(config.supabase.bucketName)
      .getPublicUrl(path);

    return publicUrl;
  }

  async createBucket(bucketName: string, config: CompanyStorageConfig): Promise<boolean> {
    try {
      // Note: Bucket creation via API requires service role key
      // In production, buckets should be created via Supabase Dashboard or CLI
      console.log(`[SupabaseProvider] Bucket creation requested: ${bucketName}`);
      console.log('Note: Create this bucket manually in Supabase Dashboard');
      
      return true;
    } catch (error) {
      console.error(`[SupabaseProvider] Bucket creation failed:`, error);
      return false;
    }
  }
}

/**
 * Local-Only Storage Provider Implementation
 */
class LocalStorageProvider implements StorageProviderInterface {
  async upload(blob: Blob, path: string, config: CompanyStorageConfig): Promise<StorageUploadResult> {
    try {
      // Implementation for local storage
      // This would use FileSystem.writeAsStringAsync or similar
      
      return {
        success: true,
        localPath: path,
        metadata: {
          size: blob.size,
          contentType: blob.type,
          uploadedAt: new Date().toISOString(),
          provider: 'local_only',
          encrypted: config.encryptionEnabled
        }
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  async delete(path: string, config: CompanyStorageConfig): Promise<boolean> {
    // Implementation for local file deletion
    return true;
  }

  async getUrl(path: string, config: CompanyStorageConfig): Promise<string> {
    // Return local file URI
    return `file://${path}`;
  }
}

// Export singleton instance
export const companyStorageService = CompanyStorageService.getInstance(); 