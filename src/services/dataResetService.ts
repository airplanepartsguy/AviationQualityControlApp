/**
 * Data Reset Service
 * Provides utilities to reset all local data for production deployment
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FileSystem from 'expo-file-system';
import { Alert } from 'react-native';
import { openDatabase } from './databaseService';
import { clearCompletedTasks } from './syncQueueService';
import * as storageService from './storageService';

export interface ResetOptions {
  clearDatabase?: boolean;
  clearAsyncStorage?: boolean;
  clearFileStorage?: boolean;
  clearSyncQueue?: boolean;
  clearCache?: boolean;
}

export interface ResetResult {
  success: boolean;
  message: string;
  details: {
    database: boolean;
    asyncStorage: boolean;
    fileStorage: boolean;
    syncQueue: boolean;
    cache: boolean;
  };
}

/**
 * Reset all local data - DESTRUCTIVE OPERATION
 */
export const resetAllLocalData = async (options: ResetOptions = {}): Promise<ResetResult> => {
  const {
    clearDatabase = true,
    clearAsyncStorage = true,
    clearFileStorage = true,
    clearSyncQueue = true,
    clearCache = true
  } = options;

  const result: ResetResult = {
    success: false,
    message: '',
    details: {
      database: false,
      asyncStorage: false,
      fileStorage: false,
      syncQueue: false,
      cache: false
    }
  };

  try {
    console.log('[DataResetService] Starting complete data reset...');

    // 1. Clear database
    if (clearDatabase) {
      try {
        await resetDatabase();
        result.details.database = true;
        console.log('[DataResetService] Database cleared successfully');
      } catch (error) {
        console.error('[DataResetService] Database reset failed:', error);
        throw new Error(`Database reset failed: ${error}`);
      }
    }

    // 2. Clear AsyncStorage
    if (clearAsyncStorage) {
      try {
        await AsyncStorage.clear();
        result.details.asyncStorage = true;
        console.log('[DataResetService] AsyncStorage cleared successfully');
      } catch (error) {
        console.error('[DataResetService] AsyncStorage reset failed:', error);
        throw new Error(`AsyncStorage reset failed: ${error}`);
      }
    }

    // 3. Clear file storage
    if (clearFileStorage) {
      try {
        await clearAllFiles();
        result.details.fileStorage = true;
        console.log('[DataResetService] File storage cleared successfully');
      } catch (error) {
        console.error('[DataResetService] File storage reset failed:', error);
        throw new Error(`File storage reset failed: ${error}`);
      }
    }

    // 4. Clear sync queue
    if (clearSyncQueue) {
      try {
        await clearCompletedTasks(0); // Clear all completed tasks
        result.details.syncQueue = true;
        console.log('[DataResetService] Sync queue cleared successfully');
      } catch (error) {
        console.error('[DataResetService] Sync queue reset failed:', error);
        // Don't throw - sync queue might not exist
        result.details.syncQueue = false;
      }
    }

    // 5. Clear cache
    if (clearCache) {
      try {
        await clearCacheFiles();
        result.details.cache = true;
        console.log('[DataResetService] Cache cleared successfully');
      } catch (error) {
        console.error('[DataResetService] Cache reset failed:', error);
        // Don't throw - cache might not exist
        result.details.cache = false;
      }
    }

    result.success = true;
    result.message = 'All local data has been successfully reset';
    console.log('[DataResetService] Complete data reset successful');

    return result;

  } catch (error) {
    console.error('[DataResetService] Data reset failed:', error);
    result.success = false;
    result.message = `Data reset failed: ${error}`;
    return result;
  }
};

/**
 * Reset database by dropping and recreating all tables
 */
const resetDatabase = async (): Promise<void> => {
  try {
    const db = await openDatabase();
    
    // Get all table names
    const tables = await db.getAllAsync<{ name: string }>(
      "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'"
    );
    
    // Drop all tables
    for (const table of tables) {
      await db.execAsync(`DROP TABLE IF EXISTS ${table.name}`);
      console.log(`[DataResetService] Dropped table: ${table.name}`);
    }
    
    console.log('[DataResetService] Database reset completed');
  } catch (error) {
    console.error('[DataResetService] Database reset failed:', error);
    throw error;
  }
};

/**
 * Clear cache files from storage
 */
const clearCacheFiles = async (): Promise<void> => {
  try {
    const documentDirectory = FileSystem.documentDirectory;
    if (!documentDirectory) return;
    
    const cacheDirectories = ['cache', 'temp'];
    
    for (const dir of cacheDirectories) {
      const dirPath = `${documentDirectory}${dir}`;
      const info = await FileSystem.getInfoAsync(dirPath);
      
      if (info.exists) {
        await FileSystem.deleteAsync(dirPath, { idempotent: true });
        await FileSystem.makeDirectoryAsync(dirPath, { intermediates: true });
        console.log(`[DataResetService] Cleared cache directory: ${dir}`);
      }
    }
  } catch (error) {
    console.error('[DataResetService] Cache clearing failed:', error);
    throw error;
  }
};

/**
 * Clear all local files and directories
 */
const clearAllFiles = async (): Promise<void> => {
  try {
    const documentDirectory = FileSystem.documentDirectory;
    if (!documentDirectory) {
      throw new Error('Document directory not available');
    }

    // Get all items in document directory
    const items = await FileSystem.readDirectoryAsync(documentDirectory);
    
    // Delete each item
    for (const item of items) {
      const itemPath = `${documentDirectory}${item}`;
      try {
        const info = await FileSystem.getInfoAsync(itemPath);
        if (info.exists) {
          await FileSystem.deleteAsync(itemPath, { idempotent: true });
          console.log(`[DataResetService] Deleted: ${item}`);
        }
      } catch (error) {
        console.warn(`[DataResetService] Failed to delete ${item}:`, error);
        // Continue with other files
      }
    }

    // Recreate essential directories
    await createEssentialDirectories();

  } catch (error) {
    console.error('[DataResetService] File clearing failed:', error);
    throw error;
  }
};

/**
 * Recreate essential directories after reset
 */
const createEssentialDirectories = async (): Promise<void> => {
  try {
    const documentDirectory = FileSystem.documentDirectory;
    if (!documentDirectory) return;

    const essentialDirs = [
      'photos',
      'cache',
      'temp',
      'exports',
      'annotations'
    ];

    for (const dir of essentialDirs) {
      const dirPath = `${documentDirectory}${dir}`;
      await FileSystem.makeDirectoryAsync(dirPath, { intermediates: true });
      console.log(`[DataResetService] Created directory: ${dir}`);
    }

  } catch (error) {
    console.error('[DataResetService] Directory creation failed:', error);
    // Don't throw - app can recreate these as needed
  }
};

/**
 * Reset only user data (keep app settings)
 */
export const resetUserDataOnly = async (): Promise<ResetResult> => {
  return resetAllLocalData({
    clearDatabase: true,
    clearAsyncStorage: false, // Keep app settings
    clearFileStorage: true,
    clearSyncQueue: true,
    clearCache: true
  });
};

/**
 * Reset only cache and temporary data
 */
export const resetCacheOnly = async (): Promise<ResetResult> => {
  return resetAllLocalData({
    clearDatabase: false,
    clearAsyncStorage: false,
    clearFileStorage: false,
    clearSyncQueue: false,
    clearCache: true
  });
};

/**
 * Show confirmation dialog and perform reset
 */
export const confirmAndResetData = (
  resetType: 'all' | 'user' | 'cache' = 'all',
  onComplete?: (result: ResetResult) => void
): void => {
  const resetMessages = {
    all: {
      title: 'Reset All Data',
      message: 'This will permanently delete ALL local data including photos, batches, settings, and cache. This action cannot be undone.\n\nAre you sure you want to continue?',
      action: resetAllLocalData
    },
    user: {
      title: 'Reset User Data',
      message: 'This will delete all photos, batches, and user data but keep app settings. This action cannot be undone.\n\nAre you sure you want to continue?',
      action: resetUserDataOnly
    },
    cache: {
      title: 'Clear Cache',
      message: 'This will clear temporary files and cache data. Your photos and settings will be preserved.\n\nContinue?',
      action: resetCacheOnly
    }
  };

  const config = resetMessages[resetType];

  Alert.alert(
    config.title,
    config.message,
    [
      {
        text: 'Cancel',
        style: 'cancel'
      },
      {
        text: 'Reset',
        style: 'destructive',
        onPress: async () => {
          try {
            const result = await config.action();
            
            if (result.success) {
              Alert.alert('Success', result.message);
            } else {
              Alert.alert('Error', result.message);
            }
            
            onComplete?.(result);
          } catch (error) {
            console.error('[DataResetService] Reset operation failed:', error);
            Alert.alert('Error', 'Reset operation failed. Please try again.');
            onComplete?.({
              success: false,
              message: `Reset failed: ${error}`,
              details: {
                database: false,
                asyncStorage: false,
                fileStorage: false,
                syncQueue: false,
                cache: false
              }
            });
          }
        }
      }
    ]
  );
};

/**
 * Get storage usage information
 */
export const getStorageUsage = async (): Promise<{
  totalSize: number;
  photoCount: number;
  batchCount: number;
  cacheSize: number;
}> => {
  try {
    // Get database counts
    const db = await openDatabase();
    const batchResult = await db.getAllAsync('SELECT COUNT(*) as count FROM photo_batches');
    const photoResult = await db.getAllAsync('SELECT COUNT(*) as count FROM photos');
    
    const batchCount = (batchResult[0] as any)?.count || 0;
    const photoCount = (photoResult[0] as any)?.count || 0;

    // Calculate file sizes
    let totalSize = 0;
    let cacheSize = 0;

    const documentDirectory = FileSystem.documentDirectory;
    if (documentDirectory) {
      const items = await FileSystem.readDirectoryAsync(documentDirectory);
      
      for (const item of items) {
        try {
          const itemPath = `${documentDirectory}${item}`;
          const info = await FileSystem.getInfoAsync(itemPath);
          
          if (info.exists && !info.isDirectory) {
            totalSize += info.size || 0;
            
            if (item.includes('cache') || item.includes('temp')) {
              cacheSize += info.size || 0;
            }
          }
        } catch (error) {
          // Skip files we can't access
        }
      }
    }

    return {
      totalSize,
      photoCount,
      batchCount,
      cacheSize
    };

  } catch (error) {
    console.error('[DataResetService] Storage usage calculation failed:', error);
    return {
      totalSize: 0,
      photoCount: 0,
      batchCount: 0,
      cacheSize: 0
    };
  }
};

/**
 * Get current data reset status and storage information
 */
const getDataResetStatus = async (): Promise<{
  canReset: boolean;
  storageInfo: {
    totalSize: number;
    photoCount: number;
    batchCount: number;
    cacheSize: number;
  };
  lastReset: string | null;
}> => {
  try {
    const storageInfo = await getStorageUsage();
    
    // Check if reset is possible (basic validation)
    const canReset = true; // Always allow reset for now
    
    // Get last reset time from storage
    let lastReset: string | null = null;
    try {
      const AsyncStorage = await import('@react-native-async-storage/async-storage');
      lastReset = await AsyncStorage.default.getItem('lastDataReset');
    } catch (error) {
      console.log('[DataResetService] Could not get last reset time:', error);
    }
    
    return {
      canReset,
      storageInfo,
      lastReset
    };
  } catch (error) {
    console.error('[DataResetService] Error getting reset status:', error);
    return {
      canReset: false,
      storageInfo: {
        totalSize: 0,
        photoCount: 0,
        batchCount: 0,
        cacheSize: 0
      },
      lastReset: null
    };
  }
};

export default {
  resetAllLocalData,
  getDataResetStatus,
  resetDatabase,
  clearCacheFiles,
  resetUserDataOnly,
  resetCacheOnly,
  confirmAndResetData,
  getStorageUsage
};
