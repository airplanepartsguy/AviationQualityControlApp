import * as FileSystem from 'expo-file-system';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { openDatabase } from './databaseService';

/**
 * Storage Service - Manages local file storage, cache, and storage optimization
 * Implements efficient storage management for offline-first architecture
 */

// Storage directories
const STORAGE_DIRS = {
  PHOTOS: `${FileSystem.documentDirectory}photos/`,
  CACHE: `${FileSystem.cacheDirectory}`,
  TEMP: `${FileSystem.documentDirectory}temp/`,
  EXPORTS: `${FileSystem.documentDirectory}exports/`,
  ANNOTATIONS: `${FileSystem.documentDirectory}annotations/`
};

// Storage keys for AsyncStorage
const STORAGE_KEYS = {
  USER_PREFERENCES: 'user_preferences',
  APP_SETTINGS: 'app_settings',
  SYNC_SETTINGS: 'sync_settings',
  CACHE_METADATA: 'cache_metadata',
  STORAGE_STATS: 'storage_stats'
};

// Initialize storage directories
export const initializeStorage = async (): Promise<void> => {
  console.log('[Storage] Initializing storage directories...');
  
  try {
    // Create all necessary directories
    for (const [name, path] of Object.entries(STORAGE_DIRS)) {
      const dirInfo = await FileSystem.getInfoAsync(path);
      if (!dirInfo.exists) {
        await FileSystem.makeDirectoryAsync(path, { intermediates: true });
        console.log(`[Storage] Created directory: ${name} at ${path}`);
      }
    }
    
    // Initialize cache metadata
    await initializeCacheMetadata();
    
    console.log('[Storage] Storage initialization completed');
  } catch (error) {
    console.error('[Storage] Error initializing storage:', error);
    throw error;
  }
};

// Cache metadata management
interface CacheMetadata {
  totalSize: number;
  lastCleanup: string;
  itemCount: number;
  maxSize: number; // in bytes
}

const initializeCacheMetadata = async (): Promise<void> => {
  try {
    const existing = await AsyncStorage.getItem(STORAGE_KEYS.CACHE_METADATA);
    if (!existing) {
      const initialMetadata: CacheMetadata = {
        totalSize: 0,
        lastCleanup: new Date().toISOString(),
        itemCount: 0,
        maxSize: 500 * 1024 * 1024 // 500MB default cache limit
      };
      await AsyncStorage.setItem(STORAGE_KEYS.CACHE_METADATA, JSON.stringify(initialMetadata));
    }
  } catch (error) {
    console.error('[Storage] Error initializing cache metadata:', error);
  }
};

// Photo storage management
export const savePhotoToStorage = async (
  photoUri: string, 
  batchId: number, 
  photoId: string
): Promise<string> => {
  try {
    const fileName = `batch_${batchId}_photo_${photoId}_${Date.now()}.jpg`;
    const destinationPath = `${STORAGE_DIRS.PHOTOS}${fileName}`;
    
    // Copy photo to permanent storage
    await FileSystem.copyAsync({
      from: photoUri,
      to: destinationPath
    });
    
    console.log(`[Storage] Photo saved: ${fileName}`);
    return destinationPath;
  } catch (error) {
    console.error('[Storage] Error saving photo:', error);
    throw error;
  }
};

// Annotation storage management
export const saveAnnotationToStorage = async (
  annotationUri: string,
  photoId: string
): Promise<string> => {
  try {
    const fileName = `annotation_${photoId}_${Date.now()}.jpg`;
    const destinationPath = `${STORAGE_DIRS.ANNOTATIONS}${fileName}`;
    
    await FileSystem.copyAsync({
      from: annotationUri,
      to: destinationPath
    });
    
    console.log(`[Storage] Annotation saved: ${fileName}`);
    return destinationPath;
  } catch (error) {
    console.error('[Storage] Error saving annotation:', error);
    throw error;
  }
};

// Storage statistics
export interface StorageStats {
  totalUsed: number;
  photosSize: number;
  cacheSize: number;
  tempSize: number;
  exportsSize: number;
  annotationsSize: number;
  availableSpace: number;
  percentageUsed: number;
  photoCount: number;
  batchCount: number;
}

export const getStorageStats = async (): Promise<StorageStats> => {
  try {
    const [photosSize, cacheSize, tempSize, exportsSize, annotationsSize] = await Promise.all([
      getDirectorySize(STORAGE_DIRS.PHOTOS),
      getDirectorySize(STORAGE_DIRS.CACHE),
      getDirectorySize(STORAGE_DIRS.TEMP),
      getDirectorySize(STORAGE_DIRS.EXPORTS),
      getDirectorySize(STORAGE_DIRS.ANNOTATIONS)
    ]);
    
    const totalUsed = photosSize + cacheSize + tempSize + exportsSize + annotationsSize;
    
    // Get device storage info
    const freeSpace = await FileSystem.getFreeDiskStorageAsync();
    const totalSpace = freeSpace + totalUsed; // Approximation
    const percentageUsed = (totalUsed / totalSpace) * 100;
    
    // Get counts from database
    const db = await openDatabase();
    const photoCount = await db.getFirstAsync<{ count: number }>('SELECT COUNT(*) as count FROM photos');
    const batchCount = await db.getFirstAsync<{ count: number }>('SELECT COUNT(*) as count FROM photo_batches');
    
    const stats: StorageStats = {
      totalUsed,
      photosSize,
      cacheSize,
      tempSize,
      exportsSize,
      annotationsSize,
      availableSpace: freeSpace,
      percentageUsed,
      photoCount: photoCount?.count || 0,
      batchCount: batchCount?.count || 0
    };
    
    // Cache the stats
    await AsyncStorage.setItem(STORAGE_KEYS.STORAGE_STATS, JSON.stringify(stats));
    
    return stats;
  } catch (error) {
    console.error('[Storage] Error getting storage stats:', error);
    return {
      totalUsed: 0,
      photosSize: 0,
      cacheSize: 0,
      tempSize: 0,
      exportsSize: 0,
      annotationsSize: 0,
      availableSpace: 0,
      percentageUsed: 0,
      photoCount: 0,
      batchCount: 0
    };
  }
};

// Helper function to get directory size
const getDirectorySize = async (dirPath: string): Promise<number> => {
  try {
    const dirInfo = await FileSystem.getInfoAsync(dirPath);
    if (!dirInfo.exists || !dirInfo.isDirectory) return 0;
    
    const files = await FileSystem.readDirectoryAsync(dirPath);
    let totalSize = 0;
    
    for (const file of files) {
      const filePath = `${dirPath}${file}`;
      const fileInfo = await FileSystem.getInfoAsync(filePath);
      if (fileInfo.exists && !fileInfo.isDirectory) {
        totalSize += fileInfo.size || 0;
      }
    }
    
    return totalSize;
  } catch (error) {
    console.error(`[Storage] Error getting directory size for ${dirPath}:`, error);
    return 0;
  }
};

// Cache management
export const cleanupCache = async (maxAge: number = 7 * 24 * 60 * 60 * 1000): Promise<number> => {
  try {
    console.log('[Storage] Starting cache cleanup...');
    const cacheDir = STORAGE_DIRS.CACHE;
    const files = await FileSystem.readDirectoryAsync(cacheDir);
    
    let deletedCount = 0;
    const cutoffTime = Date.now() - maxAge;
    
    for (const file of files) {
      const filePath = `${cacheDir}${file}`;
      const fileInfo = await FileSystem.getInfoAsync(filePath);
      
      if (fileInfo.exists && fileInfo.modificationTime && fileInfo.modificationTime < cutoffTime) {
        await FileSystem.deleteAsync(filePath);
        deletedCount++;
      }
    }
    
    // Update cache metadata
    const metadata = await getCacheMetadata();
    metadata.lastCleanup = new Date().toISOString();
    await AsyncStorage.setItem(STORAGE_KEYS.CACHE_METADATA, JSON.stringify(metadata));
    
    console.log(`[Storage] Cache cleanup completed. Deleted ${deletedCount} files.`);
    return deletedCount;
  } catch (error) {
    console.error('[Storage] Error during cache cleanup:', error);
    return 0;
  }
};

// Temp file cleanup
export const cleanupTempFiles = async (): Promise<number> => {
  try {
    console.log('[Storage] Cleaning up temp files...');
    const tempDir = STORAGE_DIRS.TEMP;
    const files = await FileSystem.readDirectoryAsync(tempDir);
    
    let deletedCount = 0;
    for (const file of files) {
      const filePath = `${tempDir}${file}`;
      await FileSystem.deleteAsync(filePath);
      deletedCount++;
    }
    
    console.log(`[Storage] Temp cleanup completed. Deleted ${deletedCount} files.`);
    return deletedCount;
  } catch (error) {
    console.error('[Storage] Error cleaning temp files:', error);
    return 0;
  }
};

// Get cache metadata
const getCacheMetadata = async (): Promise<CacheMetadata> => {
  try {
    const metadata = await AsyncStorage.getItem(STORAGE_KEYS.CACHE_METADATA);
    if (metadata) {
      return JSON.parse(metadata);
    }
  } catch (error) {
    console.error('[Storage] Error getting cache metadata:', error);
  }
  
  // Return default metadata
  return {
    totalSize: 0,
    lastCleanup: new Date().toISOString(),
    itemCount: 0,
    maxSize: 500 * 1024 * 1024
  };
};

// User preferences management
export const saveUserPreferences = async (userId: string, preferences: any): Promise<void> => {
  try {
    const key = `${STORAGE_KEYS.USER_PREFERENCES}_${userId}`;
    await AsyncStorage.setItem(key, JSON.stringify(preferences));
    console.log(`[Storage] User preferences saved for: ${userId}`);
  } catch (error) {
    console.error('[Storage] Error saving user preferences:', error);
    throw error;
  }
};

export const getUserPreferences = async <T = any>(userId: string): Promise<T | null> => {
  try {
    const key = `${STORAGE_KEYS.USER_PREFERENCES}_${userId}`;
    const preferences = await AsyncStorage.getItem(key);
    return preferences ? JSON.parse(preferences) : null;
  } catch (error) {
    console.error('[Storage] Error getting user preferences:', error);
    return null;
  }
};

// App settings management
export const saveAppSettings = async (settings: any): Promise<void> => {
  try {
    await AsyncStorage.setItem(STORAGE_KEYS.APP_SETTINGS, JSON.stringify(settings));
    console.log('[Storage] App settings saved');
  } catch (error) {
    console.error('[Storage] Error saving app settings:', error);
    throw error;
  }
};

export const getAppSettings = async <T = any>(): Promise<T | null> => {
  try {
    const settings = await AsyncStorage.getItem(STORAGE_KEYS.APP_SETTINGS);
    return settings ? JSON.parse(settings) : null;
  } catch (error) {
    console.error('[Storage] Error getting app settings:', error);
    return null;
  }
};

// Sync settings management
export const saveSyncSettings = async (userId: string, settings: any): Promise<void> => {
  try {
    const key = `${STORAGE_KEYS.SYNC_SETTINGS}_${userId}`;
    await AsyncStorage.setItem(key, JSON.stringify(settings));
    console.log(`[Storage] Sync settings saved for: ${userId}`);
  } catch (error) {
    console.error('[Storage] Error saving sync settings:', error);
    throw error;
  }
};

export const getSyncSettings = async <T = any>(userId: string): Promise<T | null> => {
  try {
    const key = `${STORAGE_KEYS.SYNC_SETTINGS}_${userId}`;
    const settings = await AsyncStorage.getItem(key);
    return settings ? JSON.parse(settings) : null;
  } catch (error) {
    console.error('[Storage] Error getting sync settings:', error);
    return null;
  }
};

// Storage optimization
export const optimizeStorage = async (): Promise<{
  cacheCleared: number;
  tempCleared: number;
  spaceSaved: number;
}> => {
  try {
    console.log('[Storage] Starting storage optimization...');
    
    const beforeStats = await getStorageStats();
    
    // Clean up cache and temp files
    const cacheCleared = await cleanupCache();
    const tempCleared = await cleanupTempFiles();
    
    const afterStats = await getStorageStats();
    const spaceSaved = beforeStats.totalUsed - afterStats.totalUsed;
    
    console.log(`[Storage] Optimization completed. Space saved: ${spaceSaved} bytes`);
    
    return {
      cacheCleared,
      tempCleared,
      spaceSaved
    };
  } catch (error) {
    console.error('[Storage] Error during storage optimization:', error);
    return {
      cacheCleared: 0,
      tempCleared: 0,
      spaceSaved: 0
    };
  }
};

// Delete photo from storage
export const deletePhotoFromStorage = async (photoUri: string): Promise<void> => {
  try {
    const fileInfo = await FileSystem.getInfoAsync(photoUri);
    if (fileInfo.exists) {
      await FileSystem.deleteAsync(photoUri);
      console.log(`[Storage] Deleted photo: ${photoUri}`);
    }
  } catch (error) {
    console.error('[Storage] Error deleting photo:', error);
    throw error;
  }
};

// Export data for backup
export const exportUserData = async (userId: string): Promise<string> => {
  try {
    console.log(`[Storage] Exporting data for user: ${userId}`);
    
    const db = await openDatabase();
    
    // Get user's batches and photos
    const batches = await db.getAllAsync(`
      SELECT * FROM photo_batches WHERE userId = ?
    `, [userId]);
    
    const photos = await db.getAllAsync(`
      SELECT * FROM photos p
      JOIN photo_batches pb ON p.batchId = pb.id
      WHERE pb.userId = ?
    `, [userId]);
    
    // Get user preferences
    const preferences = await getUserPreferences(userId);
    const syncSettings = await getSyncSettings(userId);
    
    const exportData = {
      userId,
      exportedAt: new Date().toISOString(),
      batches,
      photos,
      preferences,
      syncSettings
    };
    
    const fileName = `user_data_export_${userId}_${Date.now()}.json`;
    const exportPath = `${STORAGE_DIRS.EXPORTS}${fileName}`;
    
    await FileSystem.writeAsStringAsync(exportPath, JSON.stringify(exportData, null, 2));
    
    console.log(`[Storage] Data exported to: ${exportPath}`);
    return exportPath;
  } catch (error) {
    console.error('[Storage] Error exporting user data:', error);
    throw error;
  }
};

// Format bytes for display
export const formatBytes = (bytes: number): string => {
  if (bytes === 0) return '0 Bytes';
  
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};
