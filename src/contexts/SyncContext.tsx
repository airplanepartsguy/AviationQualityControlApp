/**
 * SyncContext.tsx
 * Provides a React context for offline-first data synchronization throughout the app.
 * Components can use this context to:
 * - Check sync status
 * - Queue items for synchronization
 * - Trigger manual sync
 * - Display sync status indicators
 */

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { Alert } from 'react-native';
import syncService, { 
  SyncStatus, 
  initSyncService, 
  syncPendingItems,
  queueBatchForSync,
  queuePhotoForSync,
  getBatchSyncStatus,
  getSyncStats,
  retryFailedSyncItems
} from '../services/syncService';
import { useNetworkStatus } from '../services/networkService';
import { PhotoData } from '../types/data';

// Define the context interface
interface SyncContextType {
  // Sync status
  isSyncing: boolean;
  syncStats: {
    pending: number;
    inProgress: number;
    completed: number;
    failed: number;
  };
  lastSyncTime: Date | null;
  
  // Batch-specific sync status
  getBatchSyncStatus: (batchId: number) => Promise<{
    status: SyncStatus;
    pendingItems: number;
    lastSyncAttempt: string | null;
  }>;
  
  // Actions
  queueBatchForSync: (batchId: number, pdfUri?: string) => Promise<string>;
  queuePhotoForSync: (photoData: PhotoData) => Promise<string>;
  syncNow: () => Promise<void>;
  retryFailedItems: () => Promise<void>;
}

// Create the context with default values
const SyncContext = createContext<SyncContextType>({
  isSyncing: false,
  syncStats: {
    pending: 0,
    inProgress: 0,
    completed: 0,
    failed: 0
  },
  lastSyncTime: null,
  getBatchSyncStatus: async () => ({ status: 'pending', pendingItems: 0, lastSyncAttempt: null }),
  queueBatchForSync: async () => '',
  queuePhotoForSync: async () => '',
  syncNow: async () => {},
  retryFailedItems: async () => {}
});

// Provider component
export const SyncProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncStats, setSyncStats] = useState({
    pending: 0,
    inProgress: 0,
    completed: 0,
    failed: 0
  });
  const [lastSyncTime, setLastSyncTime] = useState<Date | null>(null);
  
  const { isConnected } = useNetworkStatus();
  
  // Initialize sync service
  useEffect(() => {
    const initialize = async () => {
      try {
        await initSyncService();
        refreshSyncStats();
      } catch (error) {
        console.error('[SyncContext] Error initializing sync service:', error);
      }
    };
    
    initialize();
  }, []);
  
  // Refresh sync stats
  const refreshSyncStats = useCallback(async () => {
    try {
      const stats = await getSyncStats();
      setSyncStats(stats);
    } catch (error) {
      console.error('[SyncContext] Error refreshing sync stats:', error);
    }
  }, []);
  
  // Trigger sync when network becomes available
  useEffect(() => {
    if (isConnected && syncStats.pending > 0 && !isSyncing) {
      syncNow();
    }
  }, [isConnected, syncStats.pending, isSyncing]);
  
  // Sync now function
  const syncNow = useCallback(async () => {
    if (!isConnected) {
      Alert.alert(
        'No Network Connection',
        'Cannot sync without an internet connection. Your changes will be synced automatically when a connection is available.'
      );
      return;
    }
    
    if (isSyncing) {
      console.log('[SyncContext] Sync already in progress');
      return;
    }
    
    setIsSyncing(true);
    
    try {
      const result = await syncPendingItems();
      setLastSyncTime(new Date());
      
      if (result.synced > 0) {
        console.log(`[SyncContext] Synced ${result.synced} items successfully`);
      }
      
      if (result.failed > 0) {
        console.warn(`[SyncContext] Failed to sync ${result.failed} items`);
      }
      
      await refreshSyncStats();
    } catch (error) {
      console.error('[SyncContext] Error during sync:', error);
    } finally {
      setIsSyncing(false);
    }
  }, [isConnected, isSyncing, refreshSyncStats]);
  
  // Retry failed items
  const retryFailedItems = useCallback(async () => {
    try {
      await retryFailedSyncItems();
      await refreshSyncStats();
      
      if (isConnected) {
        syncNow();
      }
    } catch (error) {
      console.error('[SyncContext] Error retrying failed items:', error);
    }
  }, [isConnected, syncNow, refreshSyncStats]);
  
  // Queue batch for sync
  const queueBatchForSyncHandler = useCallback(async (batchId: number, pdfUri?: string) => {
    try {
      const syncId = await queueBatchForSync(batchId, pdfUri);
      await refreshSyncStats();
      return syncId;
    } catch (error) {
      console.error(`[SyncContext] Error queuing batch ${batchId} for sync:`, error);
      throw error;
    }
  }, [refreshSyncStats]);
  
  // Queue photo for sync
  const queuePhotoForSyncHandler = useCallback(async (photoData: PhotoData) => {
    try {
      const syncId = await queuePhotoForSync(photoData);
      await refreshSyncStats();
      return syncId;
    } catch (error) {
      console.error(`[SyncContext] Error queuing photo ${photoData.id} for sync:`, error);
      throw error;
    }
  }, [refreshSyncStats]);
  
  // Get batch sync status
  const getBatchSyncStatusHandler = useCallback(async (batchId: number) => {
    try {
      return await getBatchSyncStatus(batchId);
    } catch (error) {
      console.error(`[SyncContext] Error getting sync status for batch ${batchId}:`, error);
      throw error;
    }
  }, []);
  
  // Refresh sync stats periodically
  useEffect(() => {
    const interval = setInterval(() => {
      refreshSyncStats();
    }, 30000); // Every 30 seconds
    
    return () => clearInterval(interval);
  }, [refreshSyncStats]);
  
  // Context value
  const contextValue: SyncContextType = {
    isSyncing,
    syncStats,
    lastSyncTime,
    getBatchSyncStatus: getBatchSyncStatusHandler,
    queueBatchForSync: queueBatchForSyncHandler,
    queuePhotoForSync: queuePhotoForSyncHandler,
    syncNow,
    retryFailedItems
  };
  
  return (
    <SyncContext.Provider value={contextValue}>
      {children}
    </SyncContext.Provider>
  );
};

// Custom hook to use the sync context
export const useSync = () => useContext(SyncContext);

export default SyncContext;
