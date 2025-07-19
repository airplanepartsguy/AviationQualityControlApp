/**
 * Quick Sync Button Component
 * Provides one-click bulk sync of all pending batches to ERP
 */

import React, { useState } from 'react';
import { 
  View, 
  Text, 
  StyleSheet, 
  TouchableOpacity, 
  ActivityIndicator,
  Alert,
  Modal,
  FlatList
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, FONTS, SPACING, BORDER_RADIUS, SHADOWS } from '../styles/theme';
import erpSyncService, { BulkSyncResult, BatchSyncResult } from '../services/erpSyncService';
import ErpSyncStatusIndicator from './ErpSyncStatusIndicator';

export interface QuickSyncButtonProps {
  companyId: string;
  userId: string;
  erpSystem?: string;
  onSyncComplete?: (result: BulkSyncResult) => void;
  style?: any;
}

const QuickSyncButton: React.FC<QuickSyncButtonProps> = ({
  companyId,
  userId,
  erpSystem = 'salesforce',
  onSyncComplete,
  style
}) => {
  const [isLoading, setIsLoading] = useState(false);
  const [pendingCount, setPendingCount] = useState(0);
  const [showResults, setShowResults] = useState(false);
  const [syncResults, setSyncResults] = useState<BulkSyncResult | null>(null);

  // Load pending batches count
  React.useEffect(() => {
    loadPendingCount();
  }, [userId, erpSystem]);

  const loadPendingCount = async () => {
    try {
      const pendingBatches = await erpSyncService.getPendingBatches(userId, erpSystem);
      setPendingCount(pendingBatches.length);
    } catch (error) {
      console.error('[QuickSync] Failed to load pending count:', error);
    }
  };

  const handleQuickSync = async () => {
    try {
      setIsLoading(true);

      // Get pending batches
      const pendingBatches = await erpSyncService.getPendingBatches(userId, erpSystem);
      
      if (pendingBatches.length === 0) {
        Alert.alert(
          'No Pending Batches',
          'All batches are already synced with the ERP system.',
          [{ text: 'OK' }]
        );
        return;
      }

      // Confirm bulk sync
      Alert.alert(
        'Bulk Sync Confirmation',
        `Sync ${pendingBatches.length} pending batches to ${erpSystem.toUpperCase()}?`,
        [
          { text: 'Cancel', style: 'cancel' },
          { 
            text: 'Sync All', 
            style: 'default',
            onPress: () => performBulkSync(pendingBatches.map(b => b.id))
          }
        ]
      );

    } catch (error) {
      console.error('[QuickSync] Failed to start bulk sync:', error);
      Alert.alert(
        'Sync Error',
        'Failed to start bulk sync. Please try again.',
        [{ text: 'OK' }]
      );
    } finally {
      setIsLoading(false);
    }
  };

  const performBulkSync = async (batchIds: string[]) => {
    try {
      setIsLoading(true);

      console.log(`[QuickSync] Starting bulk sync of ${batchIds.length} batches`);

      const result = await erpSyncService.bulkSyncToErp(batchIds, companyId, erpSystem);
      
      setSyncResults(result);
      setShowResults(true);
      
      // Refresh pending count
      await loadPendingCount();

      // Notify parent component
      if (onSyncComplete) {
        onSyncComplete(result);
      }

      // Show summary alert
      const successMessage = result.successCount > 0 
        ? `${result.successCount} batches synced successfully` 
        : '';
      const failureMessage = result.failedCount > 0 
        ? `${result.failedCount} batches failed to sync` 
        : '';
      
      const message = [successMessage, failureMessage].filter(Boolean).join('\n');
      
      Alert.alert(
        'Bulk Sync Complete',
        message || 'Sync completed',
        [{ text: 'View Details', onPress: () => setShowResults(true) }]
      );

    } catch (error) {
      console.error('[QuickSync] Bulk sync failed:', error);
      Alert.alert(
        'Sync Failed',
        error instanceof Error ? error.message : 'Unknown error occurred',
        [{ text: 'OK' }]
      );
    } finally {
      setIsLoading(false);
    }
  };

  const renderSyncResult = ({ item }: { item: BatchSyncResult }) => (
    <View style={styles.resultItem}>
      <View style={styles.resultHeader}>
        <Text style={styles.batchId}>Batch {item.batchId}</Text>
        <ErpSyncStatusIndicator
          syncStatus={item.success ? 'synced' : 'failed'}
          size="small"
          showLabel={false}
        />
      </View>
      <Text style={[
        styles.resultMessage,
        { color: item.success ? COLORS.success : COLORS.error }
      ]}>
        {item.message}
      </Text>
      {item.attachmentId && (
        <Text style={styles.attachmentId}>
          Attachment: {item.attachmentId}
        </Text>
      )}
    </View>
  );

  if (pendingCount === 0) {
    return null; // Don't show button if no pending batches
  }

  return (
    <>
      <TouchableOpacity
        style={[styles.quickSyncButton, style]}
        onPress={handleQuickSync}
        disabled={isLoading}
        activeOpacity={0.8}
      >
        <View style={styles.buttonContent}>
          {isLoading ? (
            <ActivityIndicator size="small" color={COLORS.white} />
          ) : (
            <Ionicons name="cloud-upload" size={20} color={COLORS.white} />
          )}
          <Text style={styles.buttonText}>
            {isLoading ? 'Syncing...' : `Quick Sync (${pendingCount})`}
          </Text>
        </View>
      </TouchableOpacity>

      {/* Sync Results Modal */}
      <Modal
        visible={showResults}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowResults(false)}
      >
        <View style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Sync Results</Text>
            <TouchableOpacity
              onPress={() => setShowResults(false)}
              style={styles.closeButton}
            >
              <Ionicons name="close" size={24} color={COLORS.grey600} />
            </TouchableOpacity>
          </View>

          {syncResults && (
            <>
              <View style={styles.summaryContainer}>
                <View style={styles.summaryItem}>
                  <Text style={styles.summaryLabel}>Total Batches</Text>
                  <Text style={styles.summaryValue}>{syncResults.totalBatches}</Text>
                </View>
                <View style={styles.summaryItem}>
                  <Text style={styles.summaryLabel}>Successful</Text>
                  <Text style={[styles.summaryValue, { color: COLORS.success }]}>
                    {syncResults.successCount}
                  </Text>
                </View>
                <View style={styles.summaryItem}>
                  <Text style={styles.summaryLabel}>Failed</Text>
                  <Text style={[styles.summaryValue, { color: COLORS.error }]}>
                    {syncResults.failedCount}
                  </Text>
                </View>
                <View style={styles.summaryItem}>
                  <Text style={styles.summaryLabel}>Duration</Text>
                  <Text style={styles.summaryValue}>
                    {(syncResults.duration / 1000).toFixed(1)}s
                  </Text>
                </View>
              </View>

              <FlatList
                data={syncResults.results}
                renderItem={renderSyncResult}
                keyExtractor={(item) => item.batchId}
                style={styles.resultsList}
                contentContainerStyle={styles.resultsContent}
              />
            </>
          )}
        </View>
      </Modal>
    </>
  );
};

const styles = StyleSheet.create({
  quickSyncButton: {
    backgroundColor: COLORS.primary,
    borderRadius: BORDER_RADIUS.medium,
    paddingHorizontal: SPACING.medium,
    paddingVertical: SPACING.small,
    ...SHADOWS.small,
    elevation: 3
  },
  buttonContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center'
  },
  buttonText: {
    color: COLORS.white,
    fontFamily: FONTS.semiBold,
    fontSize: 14,
    marginLeft: SPACING.small
  },
  modalContainer: {
    flex: 1,
    backgroundColor: COLORS.background
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: SPACING.large,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border
  },
  modalTitle: {
    fontSize: 20,
    fontFamily: FONTS.bold,
    color: COLORS.text
  },
  closeButton: {
    padding: SPACING.small
  },
  summaryContainer: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    padding: SPACING.large,
    backgroundColor: COLORS.card,
    margin: SPACING.medium,
    borderRadius: BORDER_RADIUS.medium
  },
  summaryItem: {
    alignItems: 'center'
  },
  summaryLabel: {
    fontSize: 12,
    fontFamily: FONTS.mediumWeight,
    color: COLORS.grey600,
    marginBottom: SPACING.tiny
  },
  summaryValue: {
    fontSize: 18,
    fontFamily: FONTS.bold,
    color: COLORS.text
  },
  resultsList: {
    flex: 1
  },
  resultsContent: {
    padding: SPACING.medium
  },
  resultItem: {
    backgroundColor: COLORS.card,
    padding: SPACING.medium,
    marginBottom: SPACING.small,
    borderRadius: BORDER_RADIUS.small,
    borderWidth: 1,
    borderColor: COLORS.border
  },
  resultHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: SPACING.tiny
  },
  batchId: {
    fontSize: 14,
    fontFamily: FONTS.semiBold,
    color: COLORS.text
  },
  resultMessage: {
    fontSize: 12,
    fontFamily: FONTS.normal,
    marginBottom: SPACING.tiny
  },
  attachmentId: {
    fontSize: 10,
    fontFamily: FONTS.normal,
    color: COLORS.grey600
  }
});

export default QuickSyncButton;
