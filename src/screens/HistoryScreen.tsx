import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  RefreshControl,
  Alert,
  Modal,
  SafeAreaView
} from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../contexts/AuthContext';
import { COLORS, FONTS, SPACING, BORDER_RADIUS, SHADOWS, CARD_STYLES } from '../styles/theme';
import { RootStackParamList } from '../types/navigation';
import * as databaseService from '../services/databaseService';

type HistoryScreenNavigationProp = StackNavigationProp<RootStackParamList>;

interface HistoryBatch {
  id: string;
  referenceId: string;
  orderNumber: string;
  type: 'Order' | 'Inventory' | 'Unknown';
  createdAt: string;
  photoCount: number;
  syncStatus: string;
  status: 'complete' | 'in_progress' | 'syncing' | 'error' | 'exported';
}

interface FilterOptions {
  type: 'All' | 'Order' | 'Inventory';
  status: 'All' | 'complete' | 'in_progress' | 'error';
  dateRange: 'All' | 'Today' | 'Week' | 'Month';
}

const HistoryScreen: React.FC = () => {
  const navigation = useNavigation<HistoryScreenNavigationProp>();
  const { user } = useAuth();
  
  const [batches, setBatches] = useState<HistoryBatch[]>([]);
  const [filteredBatches, setFilteredBatches] = useState<HistoryBatch[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [filters, setFilters] = useState<FilterOptions>({
    type: 'All',
    status: 'All',
    dateRange: 'All'
  });

  const fetchBatches = useCallback(async () => {
    if (!user?.id) return;
    
    try {
      setIsLoading(true);
      const batches = await databaseService.getAllPhotoBatchesForUser(user.id);
      
      const formattedBatches: HistoryBatch[] = batches.map((batch: any) => {
        let uiStatus: HistoryBatch['status'] = 'complete';
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
            uiStatus = 'complete';
            break;
        }
        
        return {
          id: batch.id.toString(),
          referenceId: batch.referenceId || batch.orderNumber || `Batch #${batch.id}`,
          orderNumber: batch.orderNumber || 'N/A',
          type: batch.type || 'Unknown',
          createdAt: batch.createdAt,
          photoCount: batch.photoCount || 0,
          syncStatus: batch.syncStatus || 'unknown',
          status: uiStatus
        };
      });
      
      setBatches(formattedBatches);
    } catch (error) {
      console.error('Error fetching batches:', error);
      Alert.alert('Error', 'Failed to load batch history');
    } finally {
      setIsLoading(false);
    }
  }, [user?.id]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchBatches();
    setRefreshing(false);
  }, [fetchBatches]);

  useFocusEffect(
    useCallback(() => {
      fetchBatches();
    }, [fetchBatches])
  );

  // Apply filters and search
  useEffect(() => {
    let filtered = [...batches];

    // Apply search
    if (searchQuery.trim()) {
      filtered = filtered.filter(batch => 
        batch.orderNumber.toLowerCase().includes(searchQuery.toLowerCase()) ||
        batch.referenceId.toLowerCase().includes(searchQuery.toLowerCase())
      );
    }

    // Apply type filter
    if (filters.type !== 'All') {
      filtered = filtered.filter(batch => batch.type === filters.type);
    }

    // Apply status filter
    if (filters.status !== 'All') {
      filtered = filtered.filter(batch => batch.status === filters.status);
    }

    // Apply date range filter
    if (filters.dateRange !== 'All') {
      const now = new Date();
      const filterDate = new Date();
      
      switch (filters.dateRange) {
        case 'Today':
          filterDate.setHours(0, 0, 0, 0);
          break;
        case 'Week':
          filterDate.setDate(now.getDate() - 7);
          break;
        case 'Month':
          filterDate.setMonth(now.getMonth() - 1);
          break;
      }
      
      filtered = filtered.filter(batch => 
        new Date(batch.createdAt) >= filterDate
      );
    }

    // Sort by creation date (newest first)
    filtered.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    
    setFilteredBatches(filtered);
  }, [batches, searchQuery, filters]);

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'complete':
      case 'exported':
        return COLORS.success;
      case 'in_progress':
        return COLORS.warning;
      case 'error':
        return COLORS.error;
      default:
        return COLORS.textSecondary;
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'complete':
      case 'exported':
        return 'checkmark-circle';
      case 'in_progress':
        return 'time';
      case 'error':
        return 'alert-circle';
      default:
        return 'help-circle';
    }
  };

  const handleBatchPress = (batch: HistoryBatch) => {
    navigation.navigate('BatchPreview', { 
      batchId: parseInt(batch.id),
      identifier: batch.referenceId
    });
  };

  const renderBatchItem = ({ item }: { item: HistoryBatch }) => (
    <TouchableOpacity 
      style={styles.batchItem} 
      onPress={() => handleBatchPress(item)}
      activeOpacity={0.7}
    >
      <View style={styles.batchItemContent}>
        <View style={styles.batchItemHeader}>
          <Text style={styles.batchOrderNumber}>{item.orderNumber}</Text>
          <View style={styles.statusContainer}>
            <Ionicons 
              name={getStatusIcon(item.status)} 
              size={16} 
              color={getStatusColor(item.status)} 
            />
            <Text style={[styles.statusText, { color: getStatusColor(item.status) }]}>
              {item.status.replace('_', ' ').toUpperCase()}
            </Text>
          </View>
        </View>
        
        <View style={styles.batchItemDetails}>
          <View style={styles.batchDetailItem}>
            <Ionicons name="document-text" size={14} color={COLORS.textLight} />
            <Text style={styles.batchDetailText}>{item.referenceId}</Text>
          </View>
          <View style={styles.batchDetailItem}>
            <Ionicons name="camera" size={14} color={COLORS.textLight} />
            <Text style={styles.batchDetailText}>{item.photoCount} photos</Text>
          </View>
          <View style={styles.batchDetailItem}>
            <Ionicons name="calendar" size={14} color={COLORS.textLight} />
            <Text style={styles.batchDetailText}>
              {new Date(item.createdAt).toLocaleDateString()}
            </Text>
          </View>
          <View style={styles.batchDetailItem}>
            <Ionicons name="pricetag" size={14} color={COLORS.textLight} />
            <Text style={styles.batchDetailText}>{item.type}</Text>
          </View>
        </View>
      </View>
      
      <View style={styles.batchItemAction}>
        <Ionicons name="chevron-forward" size={20} color={COLORS.textLight} />
      </View>
    </TouchableOpacity>
  );

  const renderFilterModal = () => (
    <Modal
      visible={showFilters}
      transparent
      animationType="slide"
      onRequestClose={() => setShowFilters(false)}
    >
      <View style={styles.modalOverlay}>
        <View style={styles.modalContent}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Filter Batches</Text>
            <TouchableOpacity onPress={() => setShowFilters(false)}>
              <Ionicons name="close" size={24} color={COLORS.text} />
            </TouchableOpacity>
          </View>
          
          {/* Filter options would go here */}
          <View style={styles.filterSection}>
            <Text style={styles.filterLabel}>Type</Text>
            <View style={styles.filterOptions}>
              {['All', 'Order', 'Inventory'].map(type => (
                <TouchableOpacity
                  key={type}
                  style={[
                    styles.filterOption,
                    filters.type === type && styles.filterOptionActive
                  ]}
                  onPress={() => setFilters(prev => ({ ...prev, type: type as FilterOptions['type'] }))}
                >
                  <Text style={[
                    styles.filterOptionText,
                    filters.type === type && styles.filterOptionTextActive
                  ]}>
                    {type}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
          
          <View style={styles.filterSection}>
            <Text style={styles.filterLabel}>Status</Text>
            <View style={styles.filterOptions}>
              {['All', 'complete', 'in_progress', 'error'].map(status => (
                <TouchableOpacity
                  key={status}
                  style={[
                    styles.filterOption,
                    filters.status === status && styles.filterOptionActive
                  ]}
                  onPress={() => setFilters(prev => ({ ...prev, status: status as FilterOptions['status'] }))}
                >
                  <Text style={[
                    styles.filterOptionText,
                    filters.status === status && styles.filterOptionTextActive
                  ]}>
                    {status === 'in_progress' ? 'In Progress' : status.charAt(0).toUpperCase() + status.slice(1)}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
          
          <View style={styles.filterSection}>
            <Text style={styles.filterLabel}>Date Range</Text>
            <View style={styles.filterOptions}>
              {['All', 'Today', 'Week', 'Month'].map(range => (
                <TouchableOpacity
                  key={range}
                  style={[
                    styles.filterOption,
                    filters.dateRange === range && styles.filterOptionActive
                  ]}
                  onPress={() => setFilters(prev => ({ ...prev, dateRange: range as FilterOptions['dateRange'] }))}
                >
                  <Text style={[
                    styles.filterOptionText,
                    filters.dateRange === range && styles.filterOptionTextActive
                  ]}>
                    {range}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        </View>
      </View>
    </Modal>
  );

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={COLORS.primary} />
        <Text style={styles.loadingText}>Loading history...</Text>
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      {/* Search and Filter Header */}
      <View style={styles.searchContainer}>
        <View style={styles.searchInputContainer}>
          <Ionicons name="search" size={20} color={COLORS.textLight} style={styles.searchIcon} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search batches..."
            placeholderTextColor={COLORS.textLight}
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
        </View>
        <TouchableOpacity 
          style={styles.filterButton}
          onPress={() => setShowFilters(true)}
        >
          <Ionicons name="filter" size={20} color={COLORS.primary} />
        </TouchableOpacity>
      </View>

      {/* Results Summary */}
      <View style={styles.summaryContainer}>
        <Text style={styles.summaryText}>
          {filteredBatches.length} of {batches.length} batches
        </Text>
      </View>

      {/* Batch List */}
      <FlatList
        data={filteredBatches}
        renderItem={renderBatchItem}
        keyExtractor={item => item.id}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            colors={[COLORS.primary]}
            tintColor={COLORS.primary}
          />
        }
        contentContainerStyle={styles.listContainer}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Ionicons name="document-text-outline" size={64} color={COLORS.textLight} />
            <Text style={styles.emptyTitle}>No batches found</Text>
            <Text style={styles.emptySubtitle}>
              {searchQuery || filters.type !== 'All' || filters.status !== 'All' || filters.dateRange !== 'All'
                ? 'Try adjusting your search or filters'
                : 'Start capturing photos to see your batch history'}
            </Text>
          </View>
        }
      />

      {renderFilterModal()}
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: COLORS.background,
  },
  loadingText: {
    marginTop: SPACING.medium,
    fontSize: FONTS.medium,
    color: COLORS.textLight,
  },
  searchContainer: {
    flexDirection: 'row',
    paddingHorizontal: SPACING.medium,
    paddingVertical: SPACING.small,
    alignItems: 'center',
  },
  searchInputContainer: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.card,
    borderRadius: BORDER_RADIUS.medium,
    paddingHorizontal: SPACING.medium,
    marginRight: SPACING.small,
  },
  searchIcon: {
    marginRight: SPACING.small,
  },
  searchInput: {
    flex: 1,
    paddingVertical: SPACING.medium,
    fontSize: FONTS.medium,
    color: COLORS.text,
  },
  filterButton: {
    padding: SPACING.medium,
    backgroundColor: COLORS.card,
    borderRadius: BORDER_RADIUS.medium,
  },
  summaryContainer: {
    paddingHorizontal: SPACING.medium,
    paddingBottom: SPACING.small,
  },
  summaryText: {
    fontSize: FONTS.small,
    color: COLORS.textLight,
  },
  listContainer: {
    paddingBottom: SPACING.large,
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
  statusContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  statusText: {
    fontSize: FONTS.small,
    fontWeight: FONTS.semiBold,
    marginLeft: SPACING.tiny,
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
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: SPACING.xlarge * 2,
    paddingHorizontal: SPACING.large,
  },
  emptyTitle: {
    fontSize: FONTS.large,
    fontWeight: FONTS.bold,
    color: COLORS.textLight,
    marginTop: SPACING.medium,
    textAlign: 'center',
  },
  emptySubtitle: {
    fontSize: FONTS.medium,
    color: COLORS.textLight,
    textAlign: 'center',
    marginTop: SPACING.small,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: COLORS.background,
    borderTopLeftRadius: BORDER_RADIUS.large,
    borderTopRightRadius: BORDER_RADIUS.large,
    paddingBottom: SPACING.large,
    maxHeight: '80%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: SPACING.large,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  modalTitle: {
    fontSize: FONTS.large,
    fontWeight: FONTS.bold,
    color: COLORS.text,
  },
  filterSection: {
    paddingHorizontal: SPACING.large,
    paddingVertical: SPACING.medium,
  },
  filterLabel: {
    fontSize: FONTS.medium,
    fontWeight: FONTS.semiBold,
    color: COLORS.text,
    marginBottom: SPACING.small,
  },
  filterOptions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  filterOption: {
    paddingHorizontal: SPACING.medium,
    paddingVertical: SPACING.small,
    borderRadius: BORDER_RADIUS.medium,
    backgroundColor: COLORS.card,
    marginRight: SPACING.small,
    marginBottom: SPACING.small,
  },
  filterOptionActive: {
    backgroundColor: COLORS.primary,
  },
  filterOptionText: {
    fontSize: FONTS.small,
    color: COLORS.text,
  },
  filterOptionTextActive: {
    color: COLORS.white,
    fontWeight: FONTS.semiBold,
  },
});

export default HistoryScreen;
