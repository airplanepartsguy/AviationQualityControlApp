import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, SPACING, FONTS, SHADOWS, BORDER_RADIUS } from '../styles/theme';
import salesforceService from '../services/salesforceService';
import { QueueStatus } from '../types/data';

// Define Props for the component
interface SyncStatusPanelProps {
  mode?: 'compact' | 'full';
  onPressCompact?: () => void;
}
import { useNetworkStatus } from '../services/networkService';

/**
 * SyncStatusPanel Component
 * 
 * Displays the current status of the Salesforce sync queue on the Dashboard.
 * Shows pending and failed tasks, and allows users to manually trigger syncs.
 * 
 * Features:
 * - Real-time sync queue status
 * - Manual sync trigger button
 * - Retry failed tasks button
 * - Network status awareness
 */
const SyncStatusPanel: React.FC<SyncStatusPanelProps> = ({ mode = 'full', onPressCompact }) => {
  const [queueStatus, setQueueStatus] = useState<QueueStatus | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const { isConnected } = useNetworkStatus();

  // Function to refresh the sync queue status
  const refreshStatus = useCallback(async () => {
    try {
      setIsRefreshing(true);
      const status = await salesforceService.getSyncQueueStatus();
      setQueueStatus(status);
    } catch (error) {
      console.error('Failed to get sync queue status:', error);
    } finally {
      setIsRefreshing(false);
    }
  }, []);

  // Refresh status when component mounts and when network status changes
  useEffect(() => {
    refreshStatus();
    
    // Set up an interval to refresh the status every 30 seconds
    const intervalId = setInterval(refreshStatus, 30000);
    
    // Clean up interval on unmount
    return () => clearInterval(intervalId);
  }, [refreshStatus, isConnected]);

  // Handle manual sync button press
  const handleSyncNow = async () => {
    if (!isConnected) {
      return; // Don't attempt sync if offline
    }
    
    try {
      setIsSyncing(true);
      const result = await salesforceService.processSyncQueue();
      console.log('Sync result:', result);
      // Refresh status after sync
      await refreshStatus();
    } catch (error) {
      console.error('Failed to process sync queue:', error);
    } finally {
      setIsSyncing(false);
    }
  };

  // Handle retry failed tasks button press
  const handleRetryFailed = async () => {
    if (!isConnected) {
      return; // Don't attempt retry if offline
    }
    
    try {
      setIsSyncing(true);
      const retriedCount = await salesforceService.retryFailedTasks();
      console.log(`Retried ${retriedCount} failed tasks`);
      
      // If there are tasks to retry, process the queue
      if (retriedCount > 0) {
        await salesforceService.processSyncQueue();
      }
      
      // Refresh status after retry
      await refreshStatus();
    } catch (error) {
      console.error('Failed to retry failed tasks:', error);
    } finally {
      setIsSyncing(false);
    }
  };

  // COMPACT MODE RENDERING
  if (mode === 'compact') {
    if (!queueStatus && isRefreshing) {
      return (
        <View style={styles.compactLoadingContainer}>
          <ActivityIndicator size="small" color={COLORS.primary} />
        </View>
      );
    }

    let iconName: React.ComponentProps<typeof Ionicons>['name'] = 'cloud-offline-outline';
    let iconColor = COLORS.textLight;
    let statusText = 'Offline';

    if (isConnected) {
      if (isSyncing) {
        iconName = 'cloud-upload-outline';
        iconColor = COLORS.primary;
        statusText = 'Syncing...';
      } else if (queueStatus) {
        if (queueStatus.failed > 0) {
          iconName = 'cloud-offline-outline'; // Or a warning icon like 'alert-circle-outline'
          iconColor = COLORS.error;
          statusText = `${queueStatus.failed} Failed`;
        } else if (queueStatus.pending > 0) {
          iconName = 'cloud-upload-outline';
          iconColor = COLORS.warning; // Use warning for pending, as it's not fully synced
          statusText = `${queueStatus.pending} Pending`;
        } else {
          iconName = 'cloud-done-outline';
          iconColor = COLORS.success;
          statusText = 'Synced';
        }
      }
    } else { // Explicitly offline
      iconName = 'cloud-offline-outline';
      iconColor = COLORS.error; // More prominent for offline
      statusText = 'Offline';
    }

    const CompactViewContent = (
      <View style={styles.compactContainer}>
        <Ionicons name={iconName} size={18} color={iconColor} style={styles.compactIcon} />
        <Text style={[styles.compactText, { color: iconColor }]}>{statusText}</Text>
      </View>
    );

    if (onPressCompact) {
      return (
        <TouchableOpacity onPress={onPressCompact} activeOpacity={0.7}>
          {CompactViewContent}
        </TouchableOpacity>
      );
    }
    return CompactViewContent;
  }

  // FULL MODE RENDERING (Original logic starts here)
  // If we don't have queue status yet, show a loading indicator
  if (!queueStatus && isRefreshing) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="small" color={COLORS.primary} />
        <Text style={styles.loadingText}>Loading sync status...</Text>
      </View>
    );
  }

  // If there are no pending or failed tasks, show a simplified view
  if (queueStatus && queueStatus.pending === 0 && queueStatus.failed === 0) {
    return (
      <View style={styles.container}>
        <View style={styles.headerRow}>
          <Ionicons name="cloud-done" size={20} color={COLORS.success} />
          <Text style={styles.headerText}>All Data Synced</Text>
          <TouchableOpacity onPress={refreshStatus} disabled={isRefreshing}>
            <Ionicons 
              name={isRefreshing ? "refresh-circle" : "refresh"} 
              size={20} 
              color={isRefreshing ? COLORS.grey400 : COLORS.primary} 
            />
          </TouchableOpacity>
        </View>
        <Text style={styles.infoText}>
          {queueStatus.completed > 0 
            ? `${queueStatus.completed} items successfully synced` 
            : 'No items in sync queue'}
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.headerRow}>
        <Ionicons 
          name={queueStatus?.failed ? "cloud-offline" : "cloud-upload"} 
          size={20} 
          color={queueStatus?.failed ? COLORS.error : COLORS.primary} 
        />
        <Text style={styles.headerText}>Sync Status</Text>
        <TouchableOpacity onPress={refreshStatus} disabled={isRefreshing}>
          <Ionicons 
            name={isRefreshing ? "refresh-circle" : "refresh"} 
            size={20} 
            color={isRefreshing ? COLORS.grey400 : COLORS.primary} 
          />
        </TouchableOpacity>
      </View>
      
      <View style={styles.statusRow}>
        <View style={styles.statusItem}>
          <Text style={styles.statusLabel}>Pending</Text>
          <Text style={styles.statusValue}>{queueStatus?.pending || 0}</Text>
        </View>
        <View style={styles.statusItem}>
          <Text style={styles.statusLabel}>Failed</Text>
          <Text style={[styles.statusValue, queueStatus?.failed ? styles.errorText : {}]}>
            {queueStatus?.failed || 0}
          </Text>
        </View>
        <View style={styles.statusItem}>
          <Text style={styles.statusLabel}>Completed</Text>
          <Text style={styles.statusValue}>{queueStatus?.completed || 0}</Text>
        </View>
      </View>
      
      <View style={styles.storageInfo}>
        <Text style={styles.storageText}>
          Storage: {queueStatus?.storageUsed.megabytes || '0'} MB ({queueStatus?.storageUsed.percentageOfQuota || '0'}%)
        </Text>
      </View>
      
      <View style={styles.actionRow}>
        <TouchableOpacity 
          style={[
            styles.actionButton, 
            !isConnected || isSyncing ? styles.disabledButton : {}
          ]}
          onPress={handleSyncNow}
          disabled={!isConnected || isSyncing}
        >
          {isSyncing ? (
            <ActivityIndicator size="small" color={COLORS.white} />
          ) : (
            <Text style={styles.actionButtonText}>Sync Now</Text>
          )}
        </TouchableOpacity>
        
        {queueStatus?.failed ? (
          <TouchableOpacity 
            style={[
              styles.actionButton, 
              styles.retryButton,
              !isConnected || isSyncing ? styles.disabledButton : {}
            ]}
            onPress={handleRetryFailed}
            disabled={!isConnected || isSyncing}
          >
            <Text style={styles.actionButtonText}>Retry Failed</Text>
          </TouchableOpacity>
        ) : null}
      </View>
      
      {!isConnected && (
        <Text style={styles.offlineText}>
          You are currently offline. Sync will resume when connection is restored.
        </Text>
      )}
      
      {queueStatus?.lastSyncAttempt && (
        <Text style={styles.lastSyncText}>
          Last sync attempt: {new Date(queueStatus.lastSyncAttempt).toLocaleTimeString()}
        </Text>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: COLORS.white,
    borderRadius: BORDER_RADIUS.medium,
    padding: SPACING.medium,
    marginHorizontal: SPACING.medium,
    marginVertical: SPACING.small,
    ...SHADOWS.small,
  },
  loadingContainer: {
    backgroundColor: COLORS.white,
    borderRadius: BORDER_RADIUS.medium,
    padding: SPACING.medium,
    marginHorizontal: SPACING.medium,
    marginVertical: SPACING.small,
    ...SHADOWS.small,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 100,
  },
  loadingText: {
    color: COLORS.textLight,
    marginTop: SPACING.small,
    fontSize: FONTS.small,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: SPACING.small,
  },
  headerText: {
    fontSize: FONTS.medium,
    fontWeight: FONTS.semiBold,
    color: COLORS.text,
  },
  statusRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: SPACING.medium,
  },
  statusItem: {
    flex: 1,
    alignItems: 'center',
  },
  statusLabel: {
    fontSize: FONTS.small,
    color: COLORS.textLight,
    marginBottom: 2,
  },
  statusValue: {
    fontSize: FONTS.large,
    fontWeight: FONTS.bold,
    color: COLORS.text,
  },
  errorText: {
    color: COLORS.error,
  },
  storageInfo: {
    marginBottom: SPACING.small,
  },
  storageText: {
    fontSize: FONTS.tiny,
    color: COLORS.textLight,
  },
  actionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  actionButton: {
    backgroundColor: COLORS.primary,
    borderRadius: BORDER_RADIUS.small,
    paddingVertical: SPACING.small,
    paddingHorizontal: SPACING.medium,
    alignItems: 'center',
    justifyContent: 'center',
    flex: 1,
    marginRight: SPACING.small,
  },
  retryButton: {
    backgroundColor: COLORS.warning,
    marginRight: 0,
    marginLeft: SPACING.small,
  },
  actionButtonText: {
    color: COLORS.white,
    fontSize: FONTS.small,
    fontWeight: FONTS.semiBold,
  },
  disabledButton: {
    backgroundColor: COLORS.grey400,
    opacity: 0.7,
  },
  offlineText: {
    fontSize: FONTS.tiny,
    color: COLORS.error,
    fontStyle: 'italic',
    marginTop: SPACING.small,
    textAlign: 'center',
  },
  lastSyncText: {
    fontSize: FONTS.tiny,
    color: COLORS.textLight,
    marginTop: SPACING.small,
    textAlign: 'right',
  },
  infoText: {
    fontSize: FONTS.small,
    color: COLORS.textLight,
    textAlign: 'center',
    marginVertical: SPACING.small,
  },
  // Compact mode styles
  compactContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: SPACING.tiny, // Minimal padding for embedding
    paddingHorizontal: SPACING.small,
    borderRadius: BORDER_RADIUS.small,
    // No background or shadow by default, designed to be embedded
  },
  compactLoadingContainer: {
    paddingVertical: SPACING.tiny,
    paddingHorizontal: SPACING.small,
  },
  compactIcon: {
    marginRight: SPACING.tiny,
  },
  compactText: {
    fontSize: FONTS.small,
    fontWeight: FONTS.normal, // Corrected from FONTS.regular
  },
});

export default SyncStatusPanel;
