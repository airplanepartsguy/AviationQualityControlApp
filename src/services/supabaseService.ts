import { supabase } from '../lib/supabaseClient';
import { PhotoBatch, PhotoData, PhotoMetadata, AnnotationData } from '../types/data';

/**
 * Supabase Service - Enhanced service for offline-first sync with Supabase
 * Handles authentication, data sync, and multi-tenant operations
 */

// Authentication functions
export const signInWithEmail = async (email: string, password: string) => {
  try {
    console.log('[SupabaseService] Attempting sign in...');
    
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      console.error('[SupabaseService] Sign in error:', error.message);
      throw error;
    }

    if (data.user) {
      console.log('[SupabaseService] Sign in successful');
    }

    return { user: data.user, session: data.session };
  } catch (error) {
    console.error('[SupabaseService] Sign in failed:', error);
    throw error;
  }
};

export const signUpWithEmail = async (email: string, password: string, metadata?: any) => {
  try {
    console.log('[SupabaseService] Attempting sign up...');
    
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: metadata
      }
    });

    if (error) {
      console.error('[SupabaseService] Sign up error:', error.message);
      throw error;
    }

    console.log('[SupabaseService] Sign up successful');
    return { user: data.user, session: data.session };
  } catch (error) {
    console.error('[SupabaseService] Sign up failed:', error);
    throw error;
  }
};

export const signOut = async () => {
  try {
    console.log('[SupabaseService] Attempting sign out...');
    
    const { error } = await supabase.auth.signOut();
    
    if (error) {
      console.error('[SupabaseService] Sign out error:', error.message);
      throw error;
    }

    console.log('[SupabaseService] Sign out successful');
  } catch (error) {
    console.error('[SupabaseService] Sign out failed:', error);
    throw error;
  }
};

export const getCurrentUser = async () => {
  try {
    const { data: { user }, error } = await supabase.auth.getUser();
    
    if (error) {
      console.error('[SupabaseService] Get user error:', error.message);
      throw error;
    }

    return user;
  } catch (error) {
    console.error('[SupabaseService] Get user failed:', error);
    throw error;
  }
};

export const getCurrentSession = async () => {
  try {
    const { data: { session }, error } = await supabase.auth.getSession();
    
    if (error) {
      console.error('[SupabaseService] Get session error:', error.message);
      throw error;
    }

    return session;
  } catch (error) {
    console.error('[SupabaseService] Get session failed:', error);
    throw error;
  }
};

// Photo batch sync functions
export const syncPhotoBatch = async (batch: PhotoBatch): Promise<any> => {
  try {
    console.log(`[SupabaseService] Syncing photo batch ${batch.id}...`);
    
    const { data, error } = await supabase
      .from('photo_batches')
      .upsert({
        id: batch.id,
        reference_id: batch.referenceId,
        order_number: batch.orderNumber,
        inventory_id: batch.inventoryId,
        user_id: batch.userId,
        created_at: batch.createdAt,
        updated_at: new Date().toISOString(),
        status: batch.status,
        sync_status: 'synced'
      })
      .select()
      .single();

    if (error) {
      console.error('[SupabaseService] Batch sync error:', error.message);
      throw error;
    }

    console.log(`[SupabaseService] Batch ${batch.id} synced successfully`);
    return data;
  } catch (error) {
    console.error('[SupabaseService] Batch sync failed:', error);
    throw error;
  }
};

export const syncPhoto = async (photo: PhotoData, batchId: number): Promise<any> => {
  try {
    console.log(`[SupabaseService] Syncing photo ${photo.id}...`);
    
    // Parse metadata and annotations if they're strings
    let metadata = photo.metadata;
    let annotations = photo.annotations;
    
    if (typeof metadata === 'string') {
      metadata = JSON.parse(metadata);
    }
    
    if (typeof annotations === 'string') {
      annotations = JSON.parse(annotations);
    }
    
    const { data, error } = await supabase
      .from('photos')
      .upsert({
        id: photo.id,
        batch_id: batchId,
        part_number: photo.partNumber,
        photo_title: photo.photoTitle,
        uri: photo.uri,
        annotation_uri: photo.annotationSavedUri || null,
        metadata: metadata,
        annotations: annotations,
        sync_status: 'synced',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .select()
      .single();

    if (error) {
      console.error('[SupabaseService] Photo sync error:', error.message);
      throw error;
    }

    console.log(`[SupabaseService] Photo ${photo.id} synced successfully`);
    return data;
  } catch (error) {
    console.error('[SupabaseService] Photo sync failed:', error);
    throw error;
  }
};

// Fetch functions for pulling data from Supabase
export const fetchUserBatches = async (userId: string, limit: number = 50): Promise<any[]> => {
  try {
    console.log(`[SupabaseService] Fetching batches for user ${userId}...`);
    
    const { data, error } = await supabase
      .from('photo_batches')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) {
      console.error('[SupabaseService] Fetch batches error:', error.message);
      throw error;
    }

    console.log(`[SupabaseService] Fetched ${data?.length || 0} batches`);
    return data || [];
  } catch (error) {
    console.error('[SupabaseService] Fetch batches failed:', error);
    throw error;
  }
};

export const fetchBatchPhotos = async (batchId: number): Promise<any[]> => {
  try {
    console.log(`[SupabaseService] Fetching photos for batch ${batchId}...`);
    
    const { data, error } = await supabase
      .from('photos')
      .select('*')
      .eq('batch_id', batchId)
      .order('created_at', { ascending: true });

    if (error) {
      console.error('[SupabaseService] Fetch photos error:', error.message);
      throw error;
    }

    console.log(`[SupabaseService] Fetched ${data?.length || 0} photos`);
    return data || [];
  } catch (error) {
    console.error('[SupabaseService] Fetch photos failed:', error);
    throw error;
  }
};

// User profile and company functions
export const fetchUserProfile = async (userId: string): Promise<any> => {
  try {
    console.log(`[SupabaseService] Fetching profile for user ${userId}...`);
    
    // First get the user profile
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single();

    if (profileError) {
      console.error('[SupabaseService] Fetch profile error:', profileError.message);
      throw profileError;
    }

    // Get the company info separately if user has a company
    let companyData = null;
    if (profile?.company_id) {
      const { data: company, error: companyError } = await supabase
        .from('companies')
        .select('id, name, created_at')
        .eq('id', profile.company_id)
        .single();
      
      if (companyError) {
        console.warn('[SupabaseService] Company fetch error:', companyError.message);
      } else {
        companyData = company;
      }
    }

    // Get the company's license info (licenses are tied to companies, not users)
    let licenseData = null;
    if (profile?.company_id) {
      const { data: license, error: licenseError } = await supabase
        .from('licenses')
        .select('*')
        .eq('company_id', profile.company_id)
        .single();
      
      if (licenseError) {
        console.warn('[SupabaseService] License fetch error:', licenseError.message);
      } else {
        licenseData = license;
      }
    }

    // Combine the data in the expected format
    const combinedProfile = {
      ...profile,
      companies: companyData, // Keep the original structure expected by Settings screen
      license_data: licenseData
    };

    console.log('[SupabaseService] Profile fetched successfully:', {
      hasProfile: !!profile,
      hasCompany: !!companyData,
      hasLicense: !!licenseData,
      companyName: companyData?.name,
      licenseType: licenseData?.type
    });

    return combinedProfile;
  } catch (error) {
    console.error('[SupabaseService] Fetch profile failed:', error);
    throw error;
  }
};

// Note: fetchUserLicense removed - license data is now fetched in fetchUserProfile

export const updateUserProfile = async (userId: string, updates: any): Promise<any> => {
  try {
    console.log(`[SupabaseService] Updating profile for user ${userId}...`);
    
    const { data, error } = await supabase
      .from('profiles')
      .update({
        ...updates,
        updated_at: new Date().toISOString()
      })
      .eq('id', userId)
      .select()
      .single();

    if (error) {
      console.error('[SupabaseService] Update profile error:', error.message);
      throw error;
    }

    console.log('[SupabaseService] Profile updated successfully');
    return data;
  } catch (error) {
    console.error('[SupabaseService] Update profile failed:', error);
    throw error;
  }
};

// Storage functions with proper path structure
export const uploadPhoto = async (
  photoUri: string, 
  fileName: string, 
  companyId: string,
  scannedId: string,
  bucket: string = 'photos'
): Promise<string> => {
  try {
    // Create proper path: companyId/scannedId/image.jpg
    const storagePath = `${companyId}/${scannedId}/${fileName}`;
    console.log(`[SupabaseService] Uploading photo to path: ${storagePath}`);
    
    // Read the file as base64
    const response = await fetch(photoUri);
    if (!response || !response.ok) {
      const fetchError = new Error(`Failed to fetch photo from URI: ${photoUri}. Status: ${response?.status || 'No response'}`);
      
      // Enhanced error logging for fetch failures
      const { logNetworkError } = await import('../utils/errorLogger');
      logNetworkError(fetchError, photoUri, 'GET', {
        companyId,
        operation: 'fetch_photo_for_upload',
        additionalData: { 
          fileName, 
          scannedId, 
          bucket,
          responseStatus: response?.status,
          responseOk: response?.ok
        }
      });
      
      throw fetchError;
    }
    const blob = await response.blob();
    
    console.log(`[SupabaseService] Blob created, size: ${blob.size} bytes`);
    
    const { data, error } = await supabase.storage
      .from(bucket)
      .upload(storagePath, blob, {
        cacheControl: '3600',
        upsert: true
      });

    if (error) {
      console.error('[SupabaseService] Photo upload error:', error.message);
      console.error('[SupabaseService] Full error details:', JSON.stringify(error, null, 2));
      
      // Enhanced Supabase error logging
      const { logSupabaseError } = await import('../utils/errorLogger');
      logSupabaseError(error, 'photo_upload', {
        companyId,
        operation: 'upload_photo_to_storage',
        additionalData: {
          fileName,
          scannedId,
          bucket,
          storagePath,
          blobSize: blob.size,
          uploadConfig: { cacheControl: '3600', upsert: true }
        }
      });
      
      throw error;
    }

    // Get public URL
    const { data: { publicUrl } } = supabase.storage
      .from(bucket)
      .getPublicUrl(storagePath);

    console.log(`[SupabaseService] Photo uploaded successfully to: ${publicUrl}`);
    return publicUrl;
  } catch (error) {
    console.error('[SupabaseService] Photo upload failed:', error);
    console.error('[SupabaseService] Upload context:', {
      photoUri,
      fileName,
      companyId,
      scannedId,
      bucket
    });
    
    // Final catch-all error logging
    const { logSupabaseError } = await import('../utils/errorLogger');
    logSupabaseError(error, 'photo_upload_failed', {
      companyId,
      operation: 'uploadPhoto',
      additionalData: {
        photoUri,
        fileName,
        scannedId,
        bucket,
        errorType: error instanceof Error ? error.constructor.name : typeof error
      }
    });
    
    throw error;
  }
};

// Legacy upload function for backward compatibility
export const uploadPhotoLegacy = async (photoUri: string, fileName: string, bucket: string = 'photos'): Promise<string> => {
  try {
    console.log(`[SupabaseService] Legacy upload: ${fileName} to ${bucket}...`);
    
    const response = await fetch(photoUri);
    if (!response || !response.ok) {
      throw new Error(`Failed to fetch photo from URI: ${photoUri}. Status: ${response?.status || 'No response'}`);
    }
    const blob = await response.blob();
    
    const { data, error } = await supabase.storage
      .from(bucket)
      .upload(fileName, blob, {
        cacheControl: '3600',
        upsert: true
      });

    if (error) {
      console.error('[SupabaseService] Legacy photo upload error:', error.message);
      throw error;
    }

    const { data: { publicUrl } } = supabase.storage
      .from(bucket)
      .getPublicUrl(fileName);

    return publicUrl;
  } catch (error) {
    console.error('[SupabaseService] Legacy photo upload failed:', error);
    throw error;
  }
};

export const deletePhoto = async (fileName: string, bucket: string = 'photos'): Promise<void> => {
  try {
    console.log(`[SupabaseService] Deleting photo ${fileName} from ${bucket}...`);
    
    const { error } = await supabase.storage
      .from(bucket)
      .remove([fileName]);

    if (error) {
      console.error('[SupabaseService] Photo delete error:', error.message);
      throw error;
    }

    console.log(`[SupabaseService] Photo deleted successfully`);
  } catch (error) {
    console.error('[SupabaseService] Photo delete failed:', error);
    throw error;
  }
};

// Health check and connection test
export const testConnection = async (): Promise<boolean> => {
  try {
    console.log('[SupabaseService] Testing connection...');
    
    const { data, error } = await supabase
      .from('profiles')
      .select('count')
      .limit(1);

    if (error) {
      console.error('[SupabaseService] Connection test failed:', error.message);
      return false;
    }

    console.log('[SupabaseService] Connection test successful');
    return true;
  } catch (error) {
    console.error('[SupabaseService] Connection test error:', error);
    return false;
  }
};

// Real-time subscriptions
export const subscribeToUserBatches = (userId: string, callback: (payload: any) => void) => {
  console.log(`[SupabaseService] Subscribing to batches for user ${userId}...`);
  
  return supabase
    .channel(`user_batches_${userId}`)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'photo_batches',
        filter: `user_id=eq.${userId}`
      },
      callback
    )
    .subscribe();
};

export const subscribeToBatchPhotos = (batchId: number, callback: (payload: any) => void) => {
  console.log(`[SupabaseService] Subscribing to photos for batch ${batchId}...`);
  
  return supabase
    .channel(`batch_photos_${batchId}`)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'photos',
        filter: `batch_id=eq.${batchId}`
      },
      callback
    )
    .subscribe();
};

// Company Integration functions
export const getCompanyIntegration = async (companyId: string, integrationType: string): Promise<any> => {
  try {
    console.log(`[SupabaseService] Getting ${integrationType} integration for company:`, companyId);
    
    const { data, error } = await supabase
      .from('company_integrations')
      .select('*')
      .eq('company_id', companyId)
      .eq('integration_type', integrationType)
      .single();

    if (error && error.code !== 'PGRST116') { // PGRST116 = no rows returned
      console.error('[SupabaseService] Get company integration error:', error.message);
      throw error;
    }

    return data;
  } catch (error) {
    console.error('[SupabaseService] Get company integration failed:', error);
    return null;
  }
};

export const createOrUpdateCompanyIntegration = async (integration: {
  company_id: string;
  integration_type: string;
  config: any;
  status: string;
  created_by: string;
  updated_by: string;
}): Promise<any> => {
  try {
    console.log('[SupabaseService] Creating/updating company integration:', integration.integration_type);
    
    const { data, error } = await supabase
      .from('company_integrations')
      .upsert({
        ...integration,
        updated_at: new Date().toISOString()
      })
      .select()
      .single();

    if (error) {
      console.error('[SupabaseService] Company integration upsert error:', error.message);
      throw error;
    }

    console.log('[SupabaseService] Company integration saved successfully');
    return data;
  } catch (error) {
    console.error('[SupabaseService] Company integration upsert failed:', error);
    throw error;
  }
};

export const updateCompanyIntegration = async (
  companyId: string, 
  integrationType: string, 
  updates: any
): Promise<void> => {
  try {
    console.log(`[SupabaseService] Updating ${integrationType} integration for company:`, companyId);
    
    const { error } = await supabase
      .from('company_integrations')
      .update({
        ...updates,
        updated_at: new Date().toISOString()
      })
      .eq('company_id', companyId)
      .eq('integration_type', integrationType);

    if (error) {
      console.error('[SupabaseService] Update company integration error:', error.message);
      throw error;
    }

    console.log('[SupabaseService] Company integration updated successfully');
  } catch (error) {
    console.error('[SupabaseService] Update company integration failed:', error);
    throw error;
  }
};

export const updateCompanyIntegrationStatus = async (
  companyId: string, 
  integrationType: string, 
  status: string
): Promise<void> => {
  try {
    console.log(`[SupabaseService] Updating ${integrationType} integration status to ${status} for company:`, companyId);
    
    const { error } = await supabase
      .from('company_integrations')
      .update({
        status,
        updated_at: new Date().toISOString()
      })
      .eq('company_id', companyId)
      .eq('integration_type', integrationType);

    if (error) {
      console.error('[SupabaseService] Update integration status error:', error.message);
      throw error;
    }

    console.log('[SupabaseService] Integration status updated successfully');
  } catch (error) {
    console.error('[SupabaseService] Update integration status failed:', error);
    throw error;
  }
};

// Export the supabase client for direct access if needed
export { supabase };

export default {
  // Auth
  signInWithEmail,
  signUpWithEmail,
  signOut,
  getCurrentUser,
  getCurrentSession,
  
  // Sync
  syncPhotoBatch,
  syncPhoto,
  
  // Fetch
  fetchUserBatches,
  fetchBatchPhotos,
  fetchUserProfile,
  updateUserProfile,
  
  // Storage
  uploadPhoto,
  deletePhoto,
  
  // Utility
  testConnection,
  subscribeToUserBatches,
  subscribeToBatchPhotos,
  
  // Company Integrations
  getCompanyIntegration,
  createOrUpdateCompanyIntegration,
  updateCompanyIntegration,
  updateCompanyIntegrationStatus,
  
  // Direct client access
  supabase
};
