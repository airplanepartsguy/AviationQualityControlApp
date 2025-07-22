import React, { useEffect, useState, useCallback, useMemo, Fragment } from 'react';
import { 
  View, 
  Text, 
  StyleSheet, 
  Alert, 
  TouchableOpacity, 
  ScrollView, 
  SafeAreaView, 
  Animated, 
  Dimensions, 
  FlatList,
  ActivityIndicator,
  RefreshControl,
  Modal // Added Modal import
} from 'react-native';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { useAuth } from '../contexts/AuthContext';
import { useCompany } from '../contexts/CompanyContext'; 
import CustomButton from '../components/CustomButton'; 
import SyncStatusPanel from '../components/SyncStatusPanel';
import NetworkStatusIndicator from '../components/NetworkStatusIndicator';
import ErpSyncStatusIndicator from '../components/ErpSyncStatusIndicator';
import QuickSyncButton from '../components/QuickSyncButton';
import { COLORS, FONTS, SPACING, BORDER_RADIUS, SHADOWS, CARD_STYLES, BUTTON_STYLES } from '../styles/theme'; 
import { Ionicons } from '@expo/vector-icons'; 
import { RootStackParamList } from '../types/navigation';
import salesforceService from '../services/salesforceService';
import * as databaseService from '../services/databaseService';
import { logAnalyticsEvent } from '../services/analyticsService';
import erpSyncService from '../services/erpSyncService';

// Define the specific navigation prop type for this screen
type DashboardScreenNavigationProp = StackNavigationProp<RootStackParamList, 'MainTabs'>;

// Type for recent batch item
type RecentBatchItem = {
  id: string;
  referenceId: string; // The actual scanned/entered ID
  orderNumber: string; // Now guaranteed by databaseService.getRecentBatches
  createdAt: string;
  photoCount: number;
  status: 'complete' | 'in_progress' | 'syncing' | 'error' | 'exported'; 
  type?: 'Order' | 'Inventory' | 'Unknown';
  erpSyncStatus?: 'pending' | 'syncing' | 'synced' | 'failed';
  erpSyncedAt?: string;
  erpAttachmentId?: string; 
};

const DashboardScreen: React.FC = () => { 
  const navigation = useNavigation<DashboardScreenNavigationProp>();
  const { user, logout } = useAuth();
  const { currentCompany } = useCompany(); 
  
  const [recentBatches, setRecentBatches] = useState<RecentBatchItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [dailyStats, setDailyStats] = useState({
    photosToday: 0,
    batchesCompleted: 0,
    pendingSync: 0
  });
  const quickActionAnim = useState(new Animated.Value(1))[0];

  
  useEffect(() => {
    salesforceService.initSalesforceService();
  }, []);
  
  useFocusEffect(
    useCallback(() => {
      if (user?.id) {
        const currentUserId = user.id;
        fetchRecentBatches(currentUserId);
        fetchDailyStats(currentUserId);
      }
    }, [user?.id])
  );
  
  const fetchRecentBatches = async (userId: string) => {
    setIsLoading(true);
    try {
      console.log(`[DashboardScreen] fetchRecentBatches: Starting with userId=${userId}`);
      
      const batches = await databaseService.getRecentBatches(userId, 10); // Assuming user.id is guaranteed here by the check above
      console.log(`[DashboardScreen] fetchRecentBatches: Raw database result:`, batches);
      
      if (!batches || batches.length === 0) {
        console.log(`[DashboardScreen] fetchRecentBatches: No batches found for user ${userId}`);
        setRecentBatches([]);
        return;
      }
      
      const formattedBatches: RecentBatchItem[] = batches.map(batch => {
        console.log(`[DashboardScreen] fetchRecentBatches: Processing batch:`, batch);
        
        let uiStatus: RecentBatchItem['status'] = 'complete'; 
        switch (batch.syncStatus) {
          case 'InProgress': 
          case 'pending':    
            uiStatus = 'in_progress';
            break;
          case 'Completed':  
            uiStatus = 'complete';
            break;
          case 'Exported':   
            uiStatus = 'exported';
            break;
          case 'error':      
            uiStatus = 'error';
            break;
          default:
            if (typeof batch.syncStatus === 'string' && batch.syncStatus.toLowerCase() === 'error') {
              uiStatus = 'error';
            } else if (batch.syncStatus) { 
              console.warn(`Unknown batch syncStatus: ${batch.syncStatus}`);
              uiStatus = 'in_progress'; 
            }
            break;
        }
        
        const formatted = {
          id: batch.id.toString(),
          referenceId: batch.referenceId || batch.orderNumber || `Batch #${batch.id}`,
          orderNumber: batch.orderNumber || 'N/A', 
          createdAt: new Date(batch.createdAt).toLocaleDateString(),
          photoCount: batch.photoCount || 0,
          status: uiStatus,
          type: batch.type || 'Unknown',
        };
        
        console.log(`[DashboardScreen] fetchRecentBatches: Formatted batch:`, formatted);
        return formatted;
      });
      
      console.log(`[DashboardScreen] fetchRecentBatches: Setting ${formattedBatches.length} formatted batches`);
      setRecentBatches(formattedBatches);
    } catch (error) {
      console.error("[DashboardScreen] fetchRecentBatches: Error fetching recent batches:", error);
      Alert.alert("Error", "Could not load recent batches.");
      setRecentBatches([]);
    } finally {
      setIsLoading(false);
      setRefreshing(false);
    }
  };

  const fetchDailyStats = async (userId: string) => {
    try {
      const stats = await databaseService.getDailyStats(userId);
      setDailyStats(prevStats => ({ ...prevStats, batchesCompleted: stats.batchesCompleted, pendingSync: stats.pendingSync }));
    } catch (error) {
      console.error("Error fetching daily stats:", error);
    }
  };

  const onRefresh = useCallback(() => {
    if (user?.id) {
      const currentUserId = user.id;
      setRefreshing(true);
      fetchRecentBatches(currentUserId);
      fetchDailyStats(currentUserId);
      // Potentially re-fetch other data or re-init services if needed
      salesforceService.initSalesforceService(); // Example: Re-init SF service
      setRefreshing(false);
    }
  }, [user?.id]);

  const animateQuickAction = (toValue: number, callback?: () => void) => {
    Animated.spring(quickActionAnim, {
      toValue,
      friction: 7,
      tension: 100,
      useNativeDriver: true,
    }).start(() => callback && callback());
  };

  const handleNavigation = (mode: 'Single' | 'Batch' | 'Inventory') => {
    logAnalyticsEvent('DashboardNavigation', { mode });
    if (!user || !user.id) {
      console.warn('User ID is null, cannot navigate from handleNavigation.');
      animateQuickAction(1); // Reset animation if we bail early
      return;
    }
    animateQuickAction(0.8, () => {
      navigation.navigate('PhotoCapture', { mode, userId: user?.id, quickCapture: false, orderNumber: undefined, inventoryId: undefined });
      setTimeout(() => animateQuickAction(1), 100);
    });
  };

  const handleQuickCapture = useCallback(() => {
    logAnalyticsEvent('QuickCapturePressed');
    if (!user || !user.id) {
      console.warn('User ID is null, cannot navigate from handleQuickCapture.');
      animateQuickAction(1); // Reset animation if we bail early
      return;
    }
    animateQuickAction(0.8, () => {
      navigation.navigate('PhotoCapture', { mode: 'Batch', userId: user?.id, quickCapture: true, orderNumber: undefined, inventoryId: undefined });
      setTimeout(() => animateQuickAction(1), 100); 
    });
  }, [navigation, quickActionAnim]);

  const handleContinueBatch = useCallback((batchId: string) => {
    logAnalyticsEvent('ContinueBatch', { batchId });
    const batch = recentBatches.find(b => b.id === batchId);
    navigation.navigate('PhotoCapture', { batchId: parseInt(batchId, 10) });
  }, [navigation, recentBatches]);

  const handleDebugNavigation = () => {
    navigation.navigate('Debug');
  };

  const renderStatsCard = () => (
    <View style={styles.statsCardContainer}> 
      <Text style={styles.statsTitle}>Today's Activity</Text>
      <View style={styles.statsRow}>
        <View style={styles.statItem}>
          <Text style={styles.statValue}>{dailyStats.photosToday}</Text>
          <Text style={styles.statLabel}>Photos</Text>
        </View>
        <View style={styles.statDivider} />
        <View style={styles.statItem}>
          <Text style={styles.statValue}>{dailyStats.batchesCompleted}</Text>
          <Text style={styles.statLabel}>Batches</Text>
        </View>
        <View style={styles.statDivider} />
        <View style={styles.statItem}>
          <Text style={styles.statValue}>{dailyStats.pendingSync}</Text>
          <Text style={styles.statLabel}>Pending Sync</Text>
        </View>
      </View>
    </View>
  );

  const renderBatchItem = ({ item }: { item: RecentBatchItem }) => {
    const statusColor = item.status === 'complete' ? COLORS.success 
                      : item.status === 'in_progress' ? COLORS.warning 
                      : item.status === 'error' ? COLORS.error 
                      : item.status === 'exported' ? COLORS.info
                      : COLORS.textLight;
    return (
      <TouchableOpacity style={styles.batchItem} onPress={() => navigation.navigate('BatchPreview', { batchId: parseInt(item.id, 10), identifier: item.referenceId })}>
        <View style={styles.batchItemContent}>
          <View style={styles.batchItemHeader}>
            <Text style={styles.batchOrderNumber}>{item.orderNumber || item.referenceId}</Text>
            <View style={[styles.statusIndicator, { backgroundColor: statusColor }]} />
          </View>
          <View style={styles.batchItemDetails}>
            <View style={styles.batchDetailItem}>
              <Ionicons name="document-text-outline" size={20} color={COLORS.textLight} />
              <Text style={styles.batchDetailText}>{item.type === 'Order' ? 'Order: ' : 'ID: '}{item.orderNumber || item.referenceId}</Text>
            </View>
            <View style={styles.batchDetailItem}>
              <Ionicons name="time-outline" size={14} color={COLORS.textLight} />
              <Text style={styles.batchDetailText}>{item.createdAt}</Text>
            </View>
            <View style={styles.batchDetailItem}>
              <Ionicons name="images-outline" size={14} color={COLORS.textLight} />
              <Text style={styles.batchDetailText}>{`${item.photoCount} photos`}</Text>
            </View>
          </View>
        </View>
        <View style={styles.batchItemAction}>
          {item.erpSyncStatus && (
            <ErpSyncStatusIndicator
              syncStatus={item.erpSyncStatus}
              erpSystem="Salesforce"
              size="small"
              showLabel={false}
            />
          )}
          <Ionicons name="chevron-forward" size={20} color={COLORS.primary} style={{ marginLeft: SPACING.small }} />
        </View>
      </TouchableOpacity>
    );
  };

  const Fab = useMemo(() => (
    <Animated.View style={[styles.fabContainer, { transform: [{ scale: quickActionAnim }] }]}>
      <TouchableOpacity
        style={styles.fab}
        onPress={() => {
          animateQuickAction(0.9, () => {
            handleNavigation('Single'); 
            animateQuickAction(1);
          });
        }}
        activeOpacity={0.7}
      >
        <Ionicons name="camera-outline" size={28} color={COLORS.white} />
      </TouchableOpacity>
    </Animated.View>
  ), [quickActionAnim, handleNavigation, animateQuickAction]);

  return (
    <Fragment>
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.statusBarContainer}>
          <NetworkStatusIndicator />
        </View>

        <FlatList
          data={recentBatches}
          renderItem={renderBatchItem}
          keyExtractor={(item) => item.id}
          ListHeaderComponent={
            <>
              <View style={styles.dashboardHeader}>
                <View style={styles.headerWelcomeSection}>
                  <Text style={styles.headerWelcomeText}>Hello,</Text>
                  <Text style={styles.headerUserName}>Welcome back, {user?.email || user?.id || 'User'}!</Text>
                </View>
                <View style={styles.headerActionsSection}>
                  <QuickSyncButton 
                    companyId={currentCompany?.id || ''}
                    userId={user?.id || ''}
                  />
                </View>
              </View> 

              {/* Integrated Sync Status Section */}
              <View style={styles.syncStatusSection}>
                <SyncStatusPanel mode="full" />
              </View>

              {renderStatsCard()} 
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>Recent Batches</Text>
              </View>
            </>
          }
          ListEmptyComponent={
            <View style={styles.emptyStateContainer}>
              <Ionicons name="file-tray-stacked-outline" size={64} color={COLORS.textLight} />
              <Text style={styles.emptyStateText}>No Recent Batches</Text>
              <Text style={styles.emptyStateSubtext}>Start a new batch or pull down to refresh.</Text>
            </View>
          }
          ListFooterComponent={
            <>
              <TouchableOpacity style={styles.debugButton} onPress={handleDebugNavigation}>
                <Ionicons name="bug-outline" size={16} color={COLORS.textLight} />
                <Text style={styles.debugButtonText}>View Debug Logs</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.logoutButton} onPress={logout}>
                <Ionicons name="log-out-outline" size={24} color={COLORS.white} />
                <Text style={styles.logoutButtonText}>Logout</Text>
              </TouchableOpacity>
              <View style={{ height: 100 }} />
            </>
          }
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              colors={[COLORS.primary]}
              tintColor={COLORS.primary}
            />
          }
        />
        {Fab}
      </SafeAreaView>

    </Fragment>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: COLORS.background, 
  },
  statusBarContainer: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    paddingHorizontal: SPACING.medium,
    paddingTop: SPACING.small, 
    paddingBottom: SPACING.tiny,
    backgroundColor: COLORS.background, 
  },
  headerNetworkIndicator: {},
  headerSyncStatus: {},
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  contentContainer: { 
    paddingBottom: SPACING.large, 
  },
  userIdText: {
    fontSize: FONTS.medium,
    color: COLORS.textLight, 
    marginBottom: SPACING.medium,
  },
  dashboardHeader: {
    flexDirection: 'row',
    justifyContent: 'flex-start',
    alignItems: 'center',
    paddingHorizontal: SPACING.medium, 
    paddingVertical: SPACING.medium,   
    marginBottom: SPACING.medium, 
  },
  headerWelcomeSection: {
    flex: 1, 
  },
  headerWelcomeText: {
    fontSize: FONTS.large,
    color: COLORS.textLight,
  },
  headerUserName: {
    fontSize: FONTS.xlarge,
    fontWeight: FONTS.semiBold,
    color: COLORS.text,
    marginTop: SPACING.tiny,
  },
  headerActionsSection: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerStatusSection: {},
  statsCardContainer: {
    ...CARD_STYLES.elevated,
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginHorizontal: SPACING.medium, 
    marginTop: SPACING.medium,
  },
  statsTitle: {
    fontSize: FONTS.medium,
    fontWeight: FONTS.semiBold,
    color: COLORS.text,
  },
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
  },
  statItem: {
    alignItems: 'center',
    flex: 1, 
  },
  statValue: {
    fontSize: FONTS.large, 
    fontWeight: FONTS.bold,
    color: COLORS.primary,
  },
  statLabel: {
    fontSize: FONTS.small,
    color: COLORS.textLight,
    marginTop: SPACING.tiny,
  },
  statDivider: {
    width: 1,
    height: '60%', 
    backgroundColor: COLORS.border,
    alignSelf: 'center',
  },

  dashboardCard: {
    ...CARD_STYLES.elevated,
    marginVertical: SPACING.small,
    marginHorizontal: SPACING.medium,
  },
  syncStatusSection: {
    marginHorizontal: SPACING.medium,
    marginTop: SPACING.medium,
    marginBottom: SPACING.small,
    padding: SPACING.medium,
    borderRadius: BORDER_RADIUS.medium,
    backgroundColor: COLORS.card,
    ...SHADOWS.small,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: SPACING.medium, 
    marginTop: SPACING.large,
    marginBottom: SPACING.medium,
  },
  sectionTitle: {
    fontSize: FONTS.large,
    fontWeight: FONTS.bold,
    color: COLORS.text,
  },
  batchItem: {
    ...CARD_STYLES.elevated,
    flexDirection: 'row',
    marginHorizontal: SPACING.medium, 
    marginBottom: SPACING.small,
  },
  batchItemContent: {
    flex: 1,
  },
  batchItemHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: SPACING.small,
  },
  batchOrderNumber: {
    fontSize: FONTS.medium,
    fontWeight: FONTS.bold,
    color: COLORS.text,
  },
  statusIndicator: {
    width: 10,
    height: 10,
    borderRadius: 10 / 2, // Ensures a perfect circle
  },
  batchItemDetails: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  batchDetailItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginRight: SPACING.medium,
    marginTop: SPACING.tiny,
  },
  batchDetailText: {
    fontSize: FONTS.small,
    color: COLORS.textLight,
    marginLeft: SPACING.tiny,
  },
  batchItemAction: {
    justifyContent: 'center',
    alignItems: 'center', 
    paddingLeft: SPACING.small, 
  },
  emptyStateContainer: {
    ...CARD_STYLES.elevated,
    alignItems: 'center',
    justifyContent: 'center',
    marginHorizontal: SPACING.medium, 
    marginVertical: SPACING.small,
    marginTop: SPACING.xlarge, 
  },
  emptyStateText: {
    fontSize: FONTS.large,
    fontWeight: FONTS.bold,
    color: COLORS.textLight,
    marginTop: SPACING.medium,
  },
  emptyStateSubtext: {
    fontSize: FONTS.medium,
    color: COLORS.textLight,
    textAlign: 'center',
    marginTop: SPACING.small,
  },
  debugButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: SPACING.small,
    marginTop: SPACING.large,
    alignSelf: 'center',
  },
  debugButtonText: {
    color: COLORS.textLight,
    fontSize: FONTS.small,
    marginLeft: SPACING.tiny,
  },
  logoutButton: {
    ...BUTTON_STYLES.danger,
    flexDirection: 'row', // Keep for icon alignment
    alignItems: 'center', // Keep for icon alignment
    justifyContent: 'center', // Keep for icon alignment
    paddingVertical: SPACING.medium, // BUTTON_STYLES might not have padding
    paddingHorizontal: SPACING.large, // BUTTON_STYLES might not have padding
    borderRadius: BORDER_RADIUS.medium, // BUTTON_STYLES might not have borderRadius or a different one
    marginTop: SPACING.medium,
    alignSelf: 'center', 
    ...SHADOWS.small, // BUTTON_STYLES might not include shadow
  },
  logoutButtonText: {
    color: COLORS.white,
    fontSize: FONTS.medium,
    fontWeight: FONTS.semiBold,
    marginLeft: SPACING.small,
  },
  fabContainer: {
    position: 'absolute',
    bottom: SPACING.xlarge,
    right: SPACING.large,
    ...SHADOWS.large,
  },
  fab: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: COLORS.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalOverlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: COLORS.overlay, 
  },
  modalContent: {
    width: '90%',
    backgroundColor: COLORS.background, 
    borderRadius: BORDER_RADIUS.large,
    padding: SPACING.medium,
    ...SHADOWS.large,
    position: 'relative', 
  },
  closeModalButton: {
    position: 'absolute',
    top: SPACING.small,
    right: SPACING.small,
    padding: SPACING.tiny, 
    zIndex: 10, 
  },
});

export default DashboardScreen;