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
import UploadStatusCard from '../components/UploadStatusCard';
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

// Quick action card type
type QuickAction = {
  id: string;
  title: string;
  subtitle: string;
  icon: keyof typeof Ionicons.glyphMap;
  color: string;
  onPress: () => void;
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
    pendingSync: 0,
    uploadedToday: 0,
    failedUploads: 0
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
              setDailyStats(prevStats => ({ 
          ...prevStats, 
          batchesCompleted: stats.batchesCompleted, 
          pendingSync: stats.pendingSync,
          photosToday: (stats as any).photosToday || 0,
          uploadedToday: (stats as any).uploadedToday || 0,
          failedUploads: (stats as any).failedUploads || 0
        }));
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



  // Quick actions configuration
  const quickActions: QuickAction[] = useMemo(() => [
    {
      id: 'single-photo',
      title: 'Single Photo',
      subtitle: 'Capture one photo',
      icon: 'camera-outline',
      color: COLORS.primary,
      onPress: () => handleNavigation('Single')
    },
    {
      id: 'batch-photos',
      title: 'Batch Photos',
      subtitle: 'Multiple photos',
      icon: 'images-outline',
      color: COLORS.secondary,
      onPress: () => handleNavigation('Batch')
    },
    {
      id: 'inventory',
      title: 'Inventory',
      subtitle: 'Inventory check',
      icon: 'list-outline',
      color: COLORS.warning,
      onPress: () => handleNavigation('Inventory')
    },
    {
      id: 'all-batches',
      title: 'All Batches',
      subtitle: 'View all batches',
      icon: 'folder-open-outline',
      color: COLORS.accent,
      onPress: () => navigation.navigate('MainTabs', { screen: 'AllBatchesTab' })
    }
  ], [handleNavigation, navigation]);

  const renderQuickAction = ({ item }: { item: QuickAction }) => (
    <TouchableOpacity 
      style={[styles.quickActionCard, { borderColor: item.color }]} 
      onPress={item.onPress}
      activeOpacity={0.7}
    >
      <View style={[styles.quickActionIcon, { backgroundColor: item.color }]}>
        <Ionicons name={item.icon} size={24} color={COLORS.white} />
      </View>
      <Text style={styles.quickActionTitle}>{item.title}</Text>
      <Text style={styles.quickActionSubtitle}>{item.subtitle}</Text>
    </TouchableOpacity>
  );

  const renderBatchItem = ({ item }: { item: RecentBatchItem }) => {
    const statusColor = item.status === 'complete' ? COLORS.success :
                       item.status === 'error' ? COLORS.error :
                       item.status === 'syncing' ? COLORS.primary :
                       COLORS.warning;

    return (
      <TouchableOpacity 
        style={styles.batchCard}
        onPress={() => navigation.navigate('BatchPreview', { batchId: parseInt(item.id) })}
        activeOpacity={0.7}
      >
        <View style={styles.batchHeader}>
          <View style={styles.batchInfo}>
            <Text style={styles.batchTitle}>{item.referenceId}</Text>
            <Text style={styles.batchSubtitle}>{item.type} • {item.createdAt}</Text>
          </View>
          <View style={[styles.statusBadge, { backgroundColor: statusColor }]}>
            <Text style={styles.statusText}>{item.photoCount}</Text>
          </View>
        </View>
        <View style={styles.batchFooter}>
          <Text style={[styles.batchStatus, { color: statusColor }]}>
            {item.status.charAt(0).toUpperCase() + item.status.slice(1)}
          </Text>
        </View>
      </TouchableOpacity>
    );
  };

  if (isLoading && recentBatches.length === 0) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={COLORS.primary} />
          <Text style={styles.loadingText}>Loading dashboard...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView 
        style={styles.container}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={styles.header}>
          <View>
            <Text style={styles.welcomeText}>Welcome back</Text>
            <Text style={styles.companyText}>
              {currentCompany?.name || 'Aviation QC'}
            </Text>
          </View>
          <NetworkStatusIndicator />
        </View>

        {/* Upload Status Cards */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Upload Status</Text>
          <UploadStatusCard
            title="Supabase Storage"
            status={dailyStats.failedUploads > 0 ? 'error' : dailyStats.pendingSync > 0 ? 'pending' : 'success'}
            count={dailyStats.uploadedToday}
            subtitle="Photos uploaded today"
            lastUpdate={new Date().toLocaleTimeString()}
            onPress={() => {/* Navigate to detailed upload status */}}
          />
          <UploadStatusCard
            title="Salesforce Sync"
            status={dailyStats.pendingSync > 0 ? 'pending' : 'success'}
            count={dailyStats.batchesCompleted}
            subtitle="Batches synced"
            onPress={() => navigation.navigate('MainTabs', { screen: 'ERPTab' })}
          />
        </View>

        {/* Quick Actions */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Quick Actions</Text>
          <FlatList
            data={quickActions}
            renderItem={renderQuickAction}
            keyExtractor={(item) => item.id}
            numColumns={2}
            scrollEnabled={false}
            columnWrapperStyle={styles.quickActionsRow}
          />
        </View>

        {/* Recent Batches */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Recent Batches</Text>
            <TouchableOpacity 
              onPress={() => navigation.navigate('MainTabs', { screen: 'AllBatchesTab' })}
            >
              <Text style={styles.seeAllText}>See All</Text>
            </TouchableOpacity>
          </View>
          
          {recentBatches.length === 0 ? (
            <View style={styles.emptyState}>
              <Ionicons name="folder-outline" size={48} color={COLORS.grey400} />
              <Text style={styles.emptyStateText}>No batches yet</Text>
              <Text style={styles.emptyStateSubtext}>
                Start by capturing your first quality control photos
              </Text>
            </View>
          ) : (
            <FlatList
              data={recentBatches.slice(0, 5)}
              renderItem={renderBatchItem}
              keyExtractor={(item) => item.id}
              scrollEnabled={false}
            />
          )}
        </View>

        {/* Add padding at bottom for better scrolling */}
        <View style={{ height: 50 }} />
      </ScrollView>

      {/* Legacy Sync Panel (keeping for now) */}
      <SyncStatusPanel />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: COLORS.backgroundSecondary,
  },
  container: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: SPACING.md,
    fontSize: FONTS.regular,
    color: COLORS.textSecondary,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: SPACING.screenHorizontal,
    paddingVertical: SPACING.screenVertical,
    backgroundColor: COLORS.background,
  },
  welcomeText: {
    fontSize: FONTS.regular,
    color: COLORS.textSecondary,
  },
  companyText: {
    fontSize: FONTS.xLarge,
    fontWeight: FONTS.bold,
    color: COLORS.text,
    marginTop: 2,
  },
  section: {
    paddingHorizontal: SPACING.screenHorizontal,
    paddingBottom: SPACING.lg,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: SPACING.md,
  },
  sectionTitle: {
    fontSize: FONTS.large,
    fontWeight: FONTS.bold,
    color: COLORS.text,
    marginBottom: SPACING.md,
  },
  seeAllText: {
    fontSize: FONTS.regular,
    color: COLORS.primary,
    fontWeight: FONTS.mediumWeight,
  },
  quickActionsRow: {
    justifyContent: 'space-between',
    marginBottom: SPACING.md,
  },
  quickActionCard: {
    ...CARD_STYLES.interactive,
    flex: 0.48,
    alignItems: 'center',
    paddingVertical: SPACING.lg,
    borderWidth: 2,
  },
  quickActionIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: SPACING.sm,
  },
  quickActionTitle: {
    fontSize: FONTS.medium,
    fontWeight: FONTS.bold,
    color: COLORS.text,
    textAlign: 'center',
    marginBottom: 2,
  },
  quickActionSubtitle: {
    fontSize: FONTS.small,
    color: COLORS.textSecondary,
    textAlign: 'center',
  },
  batchCard: {
    ...CARD_STYLES.default,
    marginBottom: SPACING.sm,
  },
  batchHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: SPACING.xs,
  },
  batchInfo: {
    flex: 1,
  },
  batchTitle: {
    fontSize: FONTS.medium,
    fontWeight: FONTS.bold,
    color: COLORS.text,
    marginBottom: 2,
  },
  batchSubtitle: {
    fontSize: FONTS.small,
    color: COLORS.textSecondary,
  },
  statusBadge: {
    minWidth: 32,
    height: 32,
    borderRadius: BORDER_RADIUS.badge,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: SPACING.xs,
  },
  statusText: {
    fontSize: FONTS.small,
    fontWeight: FONTS.bold,
    color: COLORS.white,
  },
  batchFooter: {
    borderTopWidth: 1,
    borderTopColor: COLORS.divider,
    paddingTop: SPACING.xs,
  },
  batchStatus: {
    fontSize: FONTS.small,
    fontWeight: FONTS.mediumWeight,
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: SPACING.xl,
  },
  emptyStateText: {
    fontSize: FONTS.medium,
    fontWeight: FONTS.bold,
    color: COLORS.text,
    marginTop: SPACING.md,
    marginBottom: SPACING.xs,
  },
  emptyStateSubtext: {
    fontSize: FONTS.regular,
    color: COLORS.textSecondary,
    textAlign: 'center',
  },
});

export default DashboardScreen;