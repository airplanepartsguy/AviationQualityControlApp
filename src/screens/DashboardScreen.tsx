import React, { useEffect, useState, useCallback, useMemo } from 'react';
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
  RefreshControl
} from 'react-native';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { useAuth } from '../contexts/AuthContext'; 
import CustomButton from '../components/CustomButton'; 
import SyncStatusPanel from '../components/SyncStatusPanel';
import NetworkStatusIndicator from '../components/NetworkStatusIndicator';
import { COLORS, FONTS, SPACING, BORDER_RADIUS, SHADOWS } from '../styles/theme'; 
import { Ionicons } from '@expo/vector-icons'; 
import { RootStackParamList } from '../types/navigation';
import salesforceService from '../services/salesforceService';
import * as databaseService from '../services/databaseService';
import { logAnalyticsEvent } from '../services/analyticsService';

// Define the specific navigation prop type for this screen
type DashboardScreenNavigationProp = StackNavigationProp<RootStackParamList, 'MainTabs'>;

// Type for recent batch item
type RecentBatchItem = {
  id: string;
  orderNumber: string | null;
  createdAt: string;
  photoCount: number;
  status: 'complete' | 'in_progress' | 'syncing';
};

const DashboardScreen: React.FC = () => { 
  const navigation = useNavigation<DashboardScreenNavigationProp>();
  const { logout, userId } = useAuth(); 
  
  // State for recent batches
  const [recentBatches, setRecentBatches] = useState<RecentBatchItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [dailyStats, setDailyStats] = useState({
    photosToday: 0,
    batchesCompleted: 0,
    pendingSync: 0
  });

  // Animation for the quick action button
  const quickActionAnim = useState(new Animated.Value(1))[0];

  // Initialize Salesforce service when dashboard loads
  useEffect(() => {
    salesforceService.initSalesforceService();
  }, []);
  
  // Fetch recent batches when the screen is focused
  useFocusEffect(
    useCallback(() => {
      fetchRecentBatches();
      fetchDailyStats();
    }, [userId])
  );
  
  // Fetch recent batches from database
  const fetchRecentBatches = async () => {
    if (!userId) return;
    
    setIsLoading(true);
    try {
      // Get recent batches from database service
      const batches = await databaseService.getRecentBatches(userId, 10);
      
      // Transform to our UI format
      const formattedBatches: RecentBatchItem[] = batches.map(batch => ({
        id: batch.id,
        orderNumber: batch.orderNumber || `Batch #${batch.id.substring(0, 6)}`,
        createdAt: new Date(batch.createdAt).toLocaleString(),
        photoCount: batch.photoCount || 0,
        status: batch.syncStatus || 'complete'
      }));
      
      setRecentBatches(formattedBatches);
      logAnalyticsEvent('recent_batches_loaded', { userId, count: formattedBatches.length });
    } catch (error) {
      console.error('Failed to fetch recent batches:', error);
    } finally {
      setIsLoading(false);
      setRefreshing(false);
    }
  };
  
  // Fetch daily statistics
  const fetchDailyStats = async () => {
    if (!userId) return;
    
    try {
      // Get today's stats
      const stats = await databaseService.getDailyStats(userId);
      setDailyStats({
        photosToday: stats.photosToday || 0,
        batchesCompleted: stats.batchesCompleted || 0,
        pendingSync: stats.pendingSync || 0
      });
    } catch (error) {
      console.error('Failed to fetch daily stats:', error);
    }
  };

  // Handle pull-to-refresh
  const onRefresh = useCallback(() => {
    setRefreshing(true);
    fetchRecentBatches();
    fetchDailyStats();
  }, []);

  // Animate quick action button on press
  const animateQuickAction = () => {
    Animated.sequence([
      Animated.timing(quickActionAnim, {
        toValue: 0.8,
        duration: 100,
        useNativeDriver: true,
      }),
      Animated.timing(quickActionAnim, {
        toValue: 1,
        duration: 100,
        useNativeDriver: true,
      }),
    ]).start();
  };

  const handleNavigation = (mode: 'Single' | 'Batch' | 'Inventory') => {
    if (!userId) {
      Alert.alert("Error", "User ID not found. Please log in again.");
      logout(); // Log out if userId is missing
      return;
    }
    
    // Log analytics event
    logAnalyticsEvent('navigation_photo_capture', { userId, mode });
    
    navigation.navigate('PhotoCapture', { 
      mode: mode, 
      userId: userId, // Pass userId from context
    });
  };
  
  // Quick capture action - optimized for frequent use
  const handleQuickCapture = () => {
    animateQuickAction();
    if (!userId) {
      Alert.alert("Error", "User ID not found. Please log in again.");
      logout();
      return;
    }
    
    // Log analytics event
    logAnalyticsEvent('quick_capture_initiated', { userId });
    
    // Navigate directly to photo capture in batch mode
    navigation.navigate('PhotoCapture', {
      mode: 'Batch',
      userId: userId,
      quickCapture: true // Flag for optimized UI in photo capture
    });
  };
  
  // Continue existing batch
  const handleContinueBatch = (batchId: string) => {
    if (!userId) {
      Alert.alert("Error", "User ID not found. Please log in again.");
      logout();
      return;
    }
    
    // Log analytics event
    logAnalyticsEvent('continue_batch', { userId, batchId });
    
    // Navigate to batch preview - convert string ID to number
    navigation.navigate('BatchPreview', { batchId: parseInt(batchId, 10) });
  };

  const handleDebugNavigation = () => {
    navigation.navigate('Debug');
  };

  // Memoize the stats card component for better performance
  const StatsCard = useMemo(() => (
    <View style={styles.statsCard}>
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
  ), [dailyStats]);
  
  // Memoize the sync status panel to avoid unnecessary re-renders
  const SyncStatusSection = useMemo(() => (
    <View style={styles.syncStatusContainer}>
      <SyncStatusPanel />
    </View>
  ), []);

  // Render a recent batch item
  const renderBatchItem = ({ item }: { item: RecentBatchItem }) => {
    // Status indicator color
    const statusColor = 
      item.status === 'complete' ? COLORS.success :
      item.status === 'syncing' ? COLORS.primary :
      COLORS.warning;
    
    return (
      <TouchableOpacity 
        style={styles.batchItem} 
        onPress={() => handleContinueBatch(item.id)}
        activeOpacity={0.7}
      >
        <View style={styles.batchItemContent}>
          <View style={styles.batchItemHeader}>
            <Text style={styles.batchOrderNumber}>{item.orderNumber}</Text>
            <View style={[styles.statusIndicator, { backgroundColor: statusColor }]} />
          </View>
          
          <View style={styles.batchItemDetails}>
            <View style={styles.batchDetailItem}>
              <Ionicons name="time-outline" size={14} color={COLORS.textLight} />
              <Text style={styles.batchDetailText}>{item.createdAt}</Text>
            </View>
            
            <View style={styles.batchDetailItem}>
              <Ionicons name="images-outline" size={14} color={COLORS.textLight} />
              <Text style={styles.batchDetailText}>{item.photoCount} photos</Text>
            </View>
          </View>
        </View>
        
        <View style={styles.batchItemAction}>
          <Ionicons name="chevron-forward" size={20} color={COLORS.primary} />
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* Main Content */}
      <FlatList
        data={recentBatches}
        renderItem={renderBatchItem}
        keyExtractor={(item) => item.id}
        ListHeaderComponent={
          <>
            {/* Sync Status Panel */}
            <SyncStatusPanel />
            
            {/* Header */}
            <View style={styles.headerContainer}>
              <View>
                <Text style={styles.welcomeText}>Welcome,</Text>
                <Text style={styles.title}>{userId || 'User'}</Text>
              </View>
              <NetworkStatusIndicator 
                showLabel={true}
                size="medium"
                style={styles.networkIndicator}
              />
            </View>
            
            {/* Stats Card */}
            {StatsCard}
            
            {/* Quick Action Buttons */}
            <View style={styles.buttonContainer}>
              <CustomButton 
                title="Capture Single Part Photo" 
                onPress={() => handleNavigation('Single')} 
                variant="primary"
                icon={<Ionicons name="camera-outline" size={20} color={COLORS.white} />} 
              />
              <View style={{ height: SPACING.medium }} /> 
              <CustomButton 
                title="Capture Batch for Order" 
                onPress={() => handleNavigation('Batch')} 
                variant="secondary"
                icon={<Ionicons name="layers-outline" size={20} color={COLORS.white} />} 
              />
              <View style={{ height: SPACING.medium }} /> 
              <CustomButton 
                title="Random Inventory Check" 
                onPress={() => handleNavigation('Inventory')} 
                variant="secondary"
                icon={<Ionicons name="cube-outline" size={20} color={COLORS.white} />} 
              />
            </View>
            
            {/* Recent Batches Header */}
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Recent Batches</Text>
              {isLoading && <ActivityIndicator size="small" color={COLORS.primary} />}
            </View>
            
            {/* Empty state for no batches */}
            {!isLoading && recentBatches.length === 0 && (
              <View style={styles.emptyStateContainer}>
                <Ionicons name="images-outline" size={48} color={COLORS.textLight} />
                <Text style={styles.emptyStateText}>No recent batches</Text>
                <Text style={styles.emptyStateSubtext}>Start capturing photos to create a batch</Text>
              </View>
            )}
          </>
        }
        ListFooterComponent={
          <>
            {/* Debug Button */}
            <TouchableOpacity style={styles.debugButton} onPress={handleDebugNavigation}>
              <Ionicons name="bug-outline" size={16} color={COLORS.textLight} />
              <Text style={styles.debugButtonText}>View Debug Logs</Text>
            </TouchableOpacity>
            
            {/* Logout Button */}
            <TouchableOpacity style={styles.logoutButton} onPress={logout}>
              <Ionicons name="log-out-outline" size={24} color={COLORS.white} />
              <Text style={styles.logoutButtonText}>Logout</Text>
            </TouchableOpacity>
            
            {/* Extra padding at bottom */}
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
        contentContainerStyle={styles.scrollViewContent}
      />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  syncStatusContainer: {
    marginHorizontal: SPACING.large,
    marginTop: SPACING.medium,
    marginBottom: SPACING.small,
  },
  scrollViewContent: {
    padding: SPACING.large,
    paddingBottom: 100, // Extra padding for FAB
  },
  
  // Header section
  headerContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: SPACING.large,
    paddingVertical: SPACING.medium,
    backgroundColor: COLORS.white,
    ...SHADOWS.small,
  },
  welcomeText: {
    fontSize: FONTS.small,
    color: COLORS.textLight,
  },
  title: {
    fontSize: FONTS.xlarge,
    fontWeight: 'bold',
    color: COLORS.text,
  },
  networkIndicator: {
    marginLeft: SPACING.medium,
  },
  userIdText: {
    fontSize: FONTS.medium,
    color: COLORS.textLight, 
    marginBottom: SPACING.medium,
  },
  
  // Stats card
  statsCard: {
    backgroundColor: COLORS.white,
    borderRadius: BORDER_RADIUS.medium,
    padding: SPACING.medium,
    marginHorizontal: SPACING.large,
    marginTop: SPACING.medium,
    ...SHADOWS.small,
  },
  statsTitle: {
    fontSize: FONTS.medium,
    fontWeight: 'bold',
    color: COLORS.text,
    marginBottom: SPACING.small,
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
    fontSize: FONTS.xlarge,
    fontWeight: 'bold',
    color: COLORS.primary,
  },
  statLabel: {
    fontSize: FONTS.small,
    color: COLORS.textLight,
    marginTop: SPACING.tiny,
  },
  statDivider: {
    width: 1,
    height: 40,
    backgroundColor: COLORS.border,
  },
  
  // Button container
  buttonContainer: {
    marginHorizontal: SPACING.large,
    marginTop: SPACING.large,
    marginBottom: SPACING.large, 
    backgroundColor: COLORS.white, 
    borderRadius: BORDER_RADIUS.medium,
    padding: SPACING.large,
    ...SHADOWS.medium,
  },
  
  // Section headers
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: SPACING.large,
    marginTop: SPACING.large,
    marginBottom: SPACING.medium,
  },
  sectionTitle: {
    fontSize: FONTS.large,
    fontWeight: 'bold',
    color: COLORS.text,
  },
  
  // Batch items
  batchItem: {
    flexDirection: 'row',
    backgroundColor: COLORS.white,
    borderRadius: BORDER_RADIUS.medium,
    padding: SPACING.medium,
    marginHorizontal: SPACING.large,
    marginBottom: SPACING.medium,
    ...SHADOWS.small,
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
    fontWeight: 'bold',
    color: COLORS.text,
  },
  statusIndicator: {
    width: 10,
    height: 10,
    borderRadius: 5,
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
  },
  
  // Empty state
  emptyStateContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: SPACING.xlarge,
    backgroundColor: COLORS.white,
    borderRadius: BORDER_RADIUS.medium,
    marginHorizontal: SPACING.large,
    ...SHADOWS.small,
  },
  emptyStateText: {
    fontSize: FONTS.large,
    fontWeight: 'bold',
    color: COLORS.textLight,
    marginTop: SPACING.medium,
  },
  emptyStateSubtext: {
    fontSize: FONTS.medium,
    color: COLORS.textLight,
    textAlign: 'center',
    marginTop: SPACING.small,
  },
  
  // Debug & Logout buttons
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
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.error, 
    paddingVertical: SPACING.medium,
    paddingHorizontal: SPACING.large,
    borderRadius: BORDER_RADIUS.medium,
    marginTop: SPACING.medium,
    alignSelf: 'center', 
    ...SHADOWS.small, 
  },
  logoutButtonText: {
    color: COLORS.white,
    fontSize: FONTS.medium,
    fontWeight: FONTS.semiBold,
    marginLeft: SPACING.small,
  },
  
  // Floating Action Button
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
});

export default DashboardScreen;