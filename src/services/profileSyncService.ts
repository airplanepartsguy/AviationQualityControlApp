import { openDatabase } from './databaseService';
import { addToSyncQueue } from './syncQueueService';
import { isNetworkConnected } from './networkService';
import { SyncTask } from '../types/data';

/**
 * Profile Sync Service - Handles user profile updates and sync
 * Ensures profile changes are synced between local and Supabase
 */

interface ProfileUpdate {
  full_name?: string;
  company?: string;
  avatar_url?: string;
  phone?: string;
  updated_at: string;
}

/**
 * Queue profile update for sync
 */
export const queueProfileForSync = async (userId: string, updates: ProfileUpdate): Promise<void> => {
  try {
    const taskId = `profile_sync_${userId}_${Date.now()}`;
    
    const syncTask: Omit<SyncTask, 'attempts' | 'lastAttempted'> = {
      id: taskId,
      type: 'profile_sync',
      payload: {
        userId,
        updates,
        operation: 'profile_update'
      },
      status: 'queued'
    };
    
    await addToSyncQueue(syncTask);
    console.log(`[ProfileSync] Queued profile update for user ${userId}`);
    
    // Try immediate sync if online
    if (await isNetworkConnected()) {
      await processProfileSync();
    }
  } catch (error) {
    console.error('[ProfileSync] Error queuing profile for sync:', error);
  }
};

/**
 * Process profile sync queue
 */
export const processProfileSync = async (): Promise<void> => {
  try {
    if (!(await isNetworkConnected())) {
      console.log('[ProfileSync] No network connection, skipping profile sync');
      return;
    }

    // Import sync service to process profile sync tasks
    const { processSyncQueue } = await import('./offlineSyncService');
    await processSyncQueue();
    
    console.log('[ProfileSync] Profile sync processing completed');
  } catch (error) {
    console.error('[ProfileSync] Error processing profile sync:', error);
  }
};

/**
 * Update local profile cache
 */
export const updateLocalProfile = async (userId: string, updates: ProfileUpdate): Promise<void> => {
  try {
    const db = await openDatabase();
    
    // Create profiles table if it doesn't exist
    await db.execAsync(`
      CREATE TABLE IF NOT EXISTS user_profiles (
        id TEXT PRIMARY KEY,
        userId TEXT NOT NULL,
        full_name TEXT,
        company TEXT,
        avatar_url TEXT,
        phone TEXT,
        email TEXT,
        role TEXT,
        license_type TEXT,
        device_count INTEGER DEFAULT 1,
        max_devices INTEGER DEFAULT 1,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
        syncStatus TEXT DEFAULT 'pending',
        lastSyncAttempt TEXT,
        syncError TEXT
      );
      
      CREATE INDEX IF NOT EXISTS idx_user_profiles_userId ON user_profiles(userId);
      CREATE INDEX IF NOT EXISTS idx_user_profiles_syncStatus ON user_profiles(syncStatus);
    `);
    
    // Upsert profile data
    await db.runAsync(`
      INSERT OR REPLACE INTO user_profiles (
        id, userId, full_name, company, avatar_url, phone, updated_at, syncStatus
      ) VALUES (?, ?, ?, ?, ?, ?, ?, 'pending')
    `, [
      userId,
      userId,
      updates.full_name || null,
      updates.company || null,
      updates.avatar_url || null,
      updates.phone || null,
      updates.updated_at
    ]);
    
    console.log(`[ProfileSync] Updated local profile for user ${userId}`);
  } catch (error) {
    console.error('[ProfileSync] Error updating local profile:', error);
  }
};

/**
 * Get local profile data
 */
export const getLocalProfile = async (userId: string): Promise<any> => {
  try {
    const db = await openDatabase();
    
    const profile = await db.getFirstAsync(`
      SELECT * FROM user_profiles WHERE userId = ?
    `, [userId]);
    
    return profile;
  } catch (error) {
    console.error('[ProfileSync] Error getting local profile:', error);
    return null;
  }
};

/**
 * Sync profile to Supabase
 */
export const syncProfileToSupabase = async (userId: string, updates: ProfileUpdate): Promise<boolean> => {
  try {
    const { updateUserProfile } = await import('./supabaseService');
    
    await updateUserProfile(userId, updates);
    
    // Update local sync status
    const db = await openDatabase();
    await db.runAsync(`
      UPDATE user_profiles 
      SET syncStatus = 'synced', lastSyncAttempt = ?, syncError = NULL 
      WHERE userId = ?
    `, [new Date().toISOString(), userId]);
    
    console.log(`[ProfileSync] Successfully synced profile for user ${userId}`);
    return true;
  } catch (error) {
    console.error('[ProfileSync] Error syncing profile to Supabase:', error);
    
    // Update local error status
    const db = await openDatabase();
    await db.runAsync(`
      UPDATE user_profiles 
      SET syncStatus = 'error', lastSyncAttempt = ?, syncError = ? 
      WHERE userId = ?
    `, [new Date().toISOString(), error instanceof Error ? error.message : 'Unknown error', userId]);
    
    return false;
  }
};

/**
 * Get profile sync status
 */
export const getProfileSyncStatus = async (userId: string): Promise<{
  status: string;
  lastSync: string | null;
  error: string | null;
}> => {
  try {
    const db = await openDatabase();
    
    const result = await db.getFirstAsync<{
      syncStatus: string;
      lastSyncAttempt: string | null;
      syncError: string | null;
    }>(`
      SELECT syncStatus, lastSyncAttempt, syncError 
      FROM user_profiles 
      WHERE userId = ?
    `, [userId]);
    
    return {
      status: result?.syncStatus || 'unknown',
      lastSync: result?.lastSyncAttempt || null,
      error: result?.syncError || null
    };
  } catch (error) {
    console.error('[ProfileSync] Error getting profile sync status:', error);
    return {
      status: 'error',
      lastSync: null,
      error: 'Failed to get sync status'
    };
  }
};

/**
 * Force sync all pending profile updates
 */
export const forceSyncAllProfiles = async (): Promise<void> => {
  try {
    if (!(await isNetworkConnected())) {
      throw new Error('No network connection available');
    }
    
    const db = await openDatabase();
    
    // Get all pending profile updates
    const pendingProfiles = await db.getAllAsync<{
      userId: string;
      full_name: string;
      company: string;
      avatar_url: string;
      phone: string;
      updated_at: string;
    }>(`
      SELECT userId, full_name, company, avatar_url, phone, updated_at
      FROM user_profiles 
      WHERE syncStatus = 'pending' OR syncStatus = 'error'
    `);
    
    for (const profile of pendingProfiles) {
      const updates: ProfileUpdate = {
        full_name: profile.full_name,
        company: profile.company,
        avatar_url: profile.avatar_url,
        phone: profile.phone,
        updated_at: profile.updated_at
      };
      
      await queueProfileForSync(profile.userId, updates);
    }
    
    // Process the queue
    await processProfileSync();
    
    console.log(`[ProfileSync] Force synced ${pendingProfiles.length} profiles`);
  } catch (error) {
    console.error('[ProfileSync] Error force syncing profiles:', error);
    throw error;
  }
};

/**
 * Clear local profile data (for logout/reset)
 */
export const clearLocalProfiles = async (): Promise<void> => {
  try {
    const db = await openDatabase();
    await db.runAsync('DELETE FROM user_profiles');
    console.log('[ProfileSync] Cleared all local profile data');
  } catch (error) {
    console.error('[ProfileSync] Error clearing local profiles:', error);
  }
};

export default {
  queueProfileForSync,
  processProfileSync,
  updateLocalProfile,
  getLocalProfile,
  syncProfileToSupabase,
  getProfileSyncStatus,
  forceSyncAllProfiles,
  clearLocalProfiles
};
