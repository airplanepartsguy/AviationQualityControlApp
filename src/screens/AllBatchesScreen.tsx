import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  SafeAreaView,
  Alert,
  ActivityIndicator,
  RefreshControl,
  TextInput,
  Dimensions,
} from 'react-native';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../contexts/AuthContext';
import { useCompany } from '../contexts/CompanyContext';
import { RootStackParamList } from '../types/navigation';
import { logAnalyticsEvent } from '../services/analyticsService';
import * as databaseService from '../services/databaseService';
import { COLORS, FONTS, SPACING, BORDER_RADIUS, SHADOWS, CARD_STYLES } from '../styles/theme';

type AllBatchesScreenNavigationProp = StackNavigationProp<RootStackParamList>;

interface BatchItem {
  id: string;
  referenceId: string;
  orderNumber: string;
  createdAt: string;
  photoCount: number;
  status: 'complete' | 'in_progress' | 'syncing' | 'error' | 'exported';
  type?: 'Order' | 'Inventory' | 'Unknown';
  companyName?: string;
  lastModified?: string;
}

type FilterType = 'all' | 'order' | 'inventory' | 'defects';
type SortType = 'newest' | 'oldest' | 'most_photos' | 'name';

const { width: screenWidth } = Dimensions.get('window');

const AllBatchesScreen: React.FC = () => {
  const navigation = useNavigation<AllBatchesScreenNavigationProp>();
  const { user } = useAuth();
  const { currentCompany } = useCompany();

  // State
  const [batches, setBatches] = useState<BatchItem[]>([]);
  const [filteredBatches, setFilteredBatches] = useState<BatchItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedFilter, setSelectedFilter] = useState<FilterType>('all');
  const [selectedSort, setSelectedSort] = useState<SortType>('newest');
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedBatches, setSelectedBatches] = useState<string[]>([]);
  const [showFilters, setShowFilters] = useState(false);

  // Filter options
  const filterOptions = [
    { id: 'all', title: 'All Batches', icon: 'folder-outline', count: batches.length },
    { id: 'order', title: 'Orders', icon: 'document-text-outline', count: batches.filter(b => b.type === 'Order').length },
    { id: 'inventory', title: 'Inventory', icon: 'list-outline', count: batches.filter(b => b.type === 'Inventory').length },
    { id: 'defects', title: 'With Defects', icon: 'warning-outline', count: 0 }, // Would need to calculate from photos
  ];

  const sortOptions = [
    { id: 'newest', title: 'Newest First', icon: 'time-outline' },
    { id: 'oldest', title: 'Oldest First', icon: 'time' },
    { id: 'most_photos', title: 'Most Photos', icon: 'images-outline' },
    { id: 'name', title: 'Name A-Z', icon: 'text-outline' },
  ];

  // Fetch batches
  const fetchBatches = useCallback(async () => {
    if (!user?.id) return;

    try {
      setIsLoading(true);
      console.log(`[AllBatchesScreen] Fetching batches for user: ${user.id}`);
      
      const allBatches = await databaseService.getRecentBatches(user.id, 1000); // Get many more
      
      const formattedBatches: BatchItem[] = allBatches.map(batch => ({
        id: batch.id.toString(),
        referenceId: batch.referenceId || batch.orderNumber || `Batch #${batch.id}`,
        orderNumber: batch.orderNumber || 'N/A',
        createdAt: new Date(batch.createdAt).toLocaleDateString(),
        photoCount: batch.photoCount || 0,
        status: batch.syncStatus === 'InProgress' ? 'in_progress' :
                batch.syncStatus === 'Completed' ? 'complete' :
                batch.syncStatus === 'Exported' ? 'exported' :
                batch.syncStatus === 'error' ? 'error' : 'complete',
        type: batch.type || 'Unknown',
        companyName: currentCompany?.name,
        lastModified: new Date(batch.createdAt).toISOString(),
      }));

      setBatches(formattedBatches);
      logAnalyticsEvent('all_batches_loaded', { count: formattedBatches.length });
    } catch (error) {
      console.error('[AllBatchesScreen] Error fetching batches:', error);
      Alert.alert('Error', 'Failed to load batches. Please try again.');
    } finally {
      setIsLoading(false);
      setRefreshing(false);
    }
  }, [user?.id, currentCompany]);

  // Apply filters and search
  const applyFiltersAndSearch = useCallback(() => {
    let filtered = [...batches];

    // Apply search
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(batch =>
        batch.referenceId.toLowerCase().includes(query) ||
        batch.orderNumber.toLowerCase().includes(query) ||
        batch.type?.toLowerCase().includes(query)
      );
    }

    // Apply filter
    switch (selectedFilter) {
      case 'order':
        filtered = filtered.filter(batch => batch.type === 'Order');
        break;
      case 'inventory':
        filtered = filtered.filter(batch => batch.type === 'Inventory');
        break;
      case 'defects':
        // Would need to filter based on actual defect photos
        break;
    }

    // Apply sort
    switch (selectedSort) {
      case 'newest':
        filtered.sort((a, b) => new Date(b.lastModified || b.createdAt).getTime() - new Date(a.lastModified || a.createdAt).getTime());
        break;
      case 'oldest':
        filtered.sort((a, b) => new Date(a.lastModified || a.createdAt).getTime() - new Date(b.lastModified || b.createdAt).getTime());
        break;
      case 'most_photos':
        filtered.sort((a, b) => b.photoCount - a.photoCount);
        break;
      case 'name':
        filtered.sort((a, b) => a.referenceId.localeCompare(b.referenceId));
        break;
    }

    setFilteredBatches(filtered);
  }, [batches, searchQuery, selectedFilter, selectedSort]);

  // Effects
  useFocusEffect(
    useCallback(() => {
      fetchBatches();
    }, [fetchBatches])
  );

  useEffect(() => {
    applyFiltersAndSearch();
  }, [applyFiltersAndSearch]);

  // Handlers
  const onRefresh = useCallback(() => {
    setRefreshing(true);
    fetchBatches();
  }, [fetchBatches]);

  const handleBatchPress = useCallback((batch: BatchItem) => {
    if (selectionMode) {
      toggleBatchSelection(batch.id);
    } else {
      navigation.navigate('BatchPreview', { batchId: parseInt(batch.id) });
      logAnalyticsEvent('batch_opened_from_all_batches', { batchId: batch.id });
    }
  }, [selectionMode, navigation]);

  const toggleBatchSelection = useCallback((batchId: string) => {
    setSelectedBatches(prev => 
      prev.includes(batchId) 
        ? prev.filter(id => id !== batchId)
        : [...prev, batchId]
    );
  }, []);

  const toggleSelectionMode = useCallback(() => {
    setSelectionMode(!selectionMode);
    setSelectedBatches([]);
  }, [selectionMode]);

  const handleBulkDelete = useCallback(() => {
    if (selectedBatches.length === 0) return;

    Alert.alert(
      'Delete Batches',
      `Are you sure you want to delete ${selectedBatches.length} batch(es)? This cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            // Implement bulk delete
            console.log('Bulk delete:', selectedBatches);
            setSelectedBatches([]);
            setSelectionMode(false);
            // Refresh batches after deletion
            fetchBatches();
          },
        },
      ]
    );
  }, [selectedBatches, fetchBatches]);

  // Render functions
  const renderSearchBar = () => (
    <View style={styles.searchContainer}>
      <View style={styles.searchBar}>
        <Ionicons name="search-outline" size={20} color={COLORS.grey500} />
        <TextInput
          style={styles.searchInput}
          placeholder="Search batches..."
          placeholderTextColor={COLORS.grey500}
          value={searchQuery}
          onChangeText={setSearchQuery}
        />
        {searchQuery.length > 0 && (
          <TouchableOpacity onPress={() => setSearchQuery('')}>
            <Ionicons name="close-circle" size={20} color={COLORS.grey500} />
          </TouchableOpacity>
        )}
      </View>
      <TouchableOpacity
        style={[styles.filterButton, showFilters && styles.filterButtonActive]}
        onPress={() => setShowFilters(!showFilters)}
      >
        <Ionicons name="options-outline" size={20} color={showFilters ? COLORS.white : COLORS.primary} />
      </TouchableOpacity>
    </View>
  );

  const renderFilters = () => {
    if (!showFilters) return null;

    return (
      <View style={styles.filtersContainer}>
        {/* Filter chips */}
        <View style={styles.filterSection}>
          <Text style={styles.filterSectionTitle}>Filter by Type</Text>
          <View style={styles.filterChips}>
            {filterOptions.map(option => (
              <TouchableOpacity
                key={option.id}
                style={[
                  styles.filterChip,
                  selectedFilter === option.id && styles.filterChipActive,
                ]}
                onPress={() => setSelectedFilter(option.id as FilterType)}
              >
                <Ionicons 
                  name={option.icon as keyof typeof Ionicons.glyphMap} 
                  size={16} 
                  color={selectedFilter === option.id ? COLORS.white : COLORS.primary} 
                />
                <Text style={[
                  styles.filterChipText,
                  selectedFilter === option.id && styles.filterChipTextActive,
                ]}>
                  {option.title} ({option.count})
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Sort options */}
        <View style={styles.filterSection}>
          <Text style={styles.filterSectionTitle}>Sort by</Text>
          <View style={styles.filterChips}>
            {sortOptions.map(option => (
              <TouchableOpacity
                key={option.id}
                style={[
                  styles.filterChip,
                  selectedSort === option.id && styles.filterChipActive,
                ]}
                onPress={() => setSelectedSort(option.id as SortType)}
              >
                <Ionicons 
                  name={option.icon as keyof typeof Ionicons.glyphMap} 
                  size={16} 
                  color={selectedSort === option.id ? COLORS.white : COLORS.primary} 
                />
                <Text style={[
                  styles.filterChipText,
                  selectedSort === option.id && styles.filterChipTextActive,
                ]}>
                  {option.title}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      </View>
    );
  };

  const renderBatchItem = ({ item }: { item: BatchItem }) => {
    const isSelected = selectedBatches.includes(item.id);
    const statusColor = item.status === 'complete' ? COLORS.success :
                       item.status === 'error' ? COLORS.error :
                       item.status === 'syncing' ? COLORS.primary :
                       COLORS.warning;

    return (
      <TouchableOpacity
        style={[
          styles.batchCard,
          isSelected && styles.selectedBatchCard,
        ]}
        onPress={() => handleBatchPress(item)}
        onLongPress={() => {
          if (!selectionMode) {
            setSelectionMode(true);
            setSelectedBatches([item.id]);
          }
        }}
        activeOpacity={0.7}
      >
        {/* Selection indicator */}
        {selectionMode && (
          <View style={styles.selectionIndicator}>
            <View style={[
              styles.checkbox,
              isSelected && styles.checkboxSelected,
            ]}>
              {isSelected && (
                <Ionicons name="checkmark" size={16} color={COLORS.white} />
              )}
            </View>
          </View>
        )}

        {/* Batch content */}
        <View style={styles.batchContent}>
          <View style={styles.batchHeader}>
            <View style={styles.batchInfo}>
              <Text style={styles.batchTitle}>{item.referenceId}</Text>
              <Text style={styles.batchSubtitle}>
                {item.type} • {item.createdAt}
              </Text>
            </View>
            <View style={[styles.statusBadge, { backgroundColor: statusColor }]}>
              <Text style={styles.statusText}>{item.photoCount}</Text>
            </View>
          </View>

          <View style={styles.batchFooter}>
            <View style={styles.batchMeta}>
              <Ionicons name="images-outline" size={14} color={COLORS.textSecondary} />
              <Text style={styles.batchMetaText}>
                {item.photoCount} photo{item.photoCount !== 1 ? 's' : ''}
              </Text>
            </View>
            <Text style={[styles.batchStatus, { color: statusColor }]}>
              {item.status.charAt(0).toUpperCase() + item.status.slice(1).replace('_', ' ')}
            </Text>
          </View>
        </View>

        {/* Arrow indicator */}
        {!selectionMode && (
          <View style={styles.arrowIndicator}>
            <Ionicons name="chevron-forward" size={20} color={COLORS.grey400} />
          </View>
        )}
      </TouchableOpacity>
    );
  };

  const renderEmptyState = () => (
    <View style={styles.emptyState}>
      <Ionicons name="folder-open-outline" size={64} color={COLORS.grey400} />
      <Text style={styles.emptyStateText}>
        {searchQuery ? 'No batches match your search' : 'No batches yet'}
      </Text>
      <Text style={styles.emptyStateSubtext}>
        {searchQuery 
          ? 'Try adjusting your search or filters'
          : 'Start capturing quality control photos to see batches here'
        }
      </Text>
      {searchQuery && (
        <TouchableOpacity
          style={styles.clearSearchButton}
          onPress={() => setSearchQuery('')}
        >
          <Text style={styles.clearSearchButtonText}>Clear Search</Text>
        </TouchableOpacity>
      )}
    </View>
  );

  // Loading state
  if (isLoading && batches.length === 0) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={COLORS.primary} />
          <Text style={styles.loadingText}>Loading batches...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerContent}>
          <Text style={styles.headerTitle}>All Batches</Text>
          <Text style={styles.headerSubtitle}>
            {filteredBatches.length} of {batches.length} batches
          </Text>
        </View>
        <TouchableOpacity
          style={styles.selectionButton}
          onPress={toggleSelectionMode}
        >
          <Ionicons 
            name={selectionMode ? "checkmark-done" : "checkmark-circle-outline"} 
            size={24} 
            color={selectionMode ? COLORS.primary : COLORS.grey600} 
          />
        </TouchableOpacity>
      </View>

      {/* Search and filters */}
      {renderSearchBar()}
      {renderFilters()}

      {/* Selection toolbar */}
      {selectionMode && (
        <View style={styles.selectionToolbar}>
          <Text style={styles.selectionCount}>
            {selectedBatches.length} selected
          </Text>
          <View style={styles.selectionActions}>
            <TouchableOpacity
              style={[styles.toolbarButton, { backgroundColor: COLORS.error }]}
              onPress={handleBulkDelete}
              disabled={selectedBatches.length === 0}
            >
              <Ionicons name="trash-outline" size={18} color={COLORS.white} />
              <Text style={styles.toolbarButtonText}>Delete</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* Batches list */}
      <FlatList
        data={filteredBatches}
        renderItem={renderBatchItem}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContainer}
        ListEmptyComponent={renderEmptyState}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            colors={[COLORS.primary]}
            tintColor={COLORS.primary}
          />
        }
        showsVerticalScrollIndicator={false}
      />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: COLORS.backgroundSecondary,
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
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.md,
    backgroundColor: COLORS.background,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  headerContent: {
    flex: 1,
  },
  headerTitle: {
    fontSize: FONTS.xLarge,
    fontWeight: FONTS.bold,
    color: COLORS.text,
  },
  headerSubtitle: {
    fontSize: FONTS.regular,
    color: COLORS.textSecondary,
    marginTop: 2,
  },
  selectionButton: {
    padding: SPACING.sm,
  },
  searchContainer: {
    flexDirection: 'row',
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    backgroundColor: COLORS.background,
    alignItems: 'center',
  },
  searchBar: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.backgroundSecondary,
    borderRadius: BORDER_RADIUS.md,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    marginRight: SPACING.sm,
  },
  searchInput: {
    flex: 1,
    marginLeft: SPACING.sm,
    fontSize: FONTS.regular,
    color: COLORS.text,
  },
  filterButton: {
    padding: SPACING.sm,
    borderRadius: BORDER_RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.primary,
  },
  filterButtonActive: {
    backgroundColor: COLORS.primary,
  },
  filtersContainer: {
    backgroundColor: COLORS.background,
    paddingHorizontal: SPACING.md,
    paddingBottom: SPACING.md,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  filterSection: {
    marginBottom: SPACING.md,
  },
  filterSectionTitle: {
    fontSize: FONTS.regular,
    fontWeight: FONTS.bold,
    color: COLORS.text,
    marginBottom: SPACING.sm,
  },
  filterChips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACING.sm,
  },
  filterChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACING.sm,
    paddingVertical: SPACING.xs,
    borderRadius: BORDER_RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.primary,
    backgroundColor: COLORS.background,
  },
  filterChipActive: {
    backgroundColor: COLORS.primary,
  },
  filterChipText: {
    fontSize: FONTS.small,
    color: COLORS.primary,
    marginLeft: SPACING.xs,
    fontWeight: FONTS.mediumWeight,
  },
  filterChipTextActive: {
    color: COLORS.white,
  },
  selectionToolbar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    backgroundColor: COLORS.primary,
  },
  selectionCount: {
    fontSize: FONTS.regular,
    color: COLORS.white,
    fontWeight: FONTS.bold,
  },
  selectionActions: {
    flexDirection: 'row',
    gap: SPACING.sm,
  },
  toolbarButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACING.sm,
    paddingVertical: SPACING.xs,
    borderRadius: BORDER_RADIUS.sm,
  },
  toolbarButtonText: {
    color: COLORS.white,
    fontSize: FONTS.small,
    fontWeight: FONTS.bold,
    marginLeft: SPACING.xs,
  },
  listContainer: {
    padding: SPACING.md,
  },
  batchCard: {
    ...CARD_STYLES.default,
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: SPACING.sm,
  },
  selectedBatchCard: {
    borderColor: COLORS.primary,
    borderWidth: 2,
  },
  selectionIndicator: {
    marginRight: SPACING.md,
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: COLORS.grey400,
    justifyContent: 'center',
    alignItems: 'center',
  },
  checkboxSelected: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },
  batchContent: {
    flex: 1,
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
    marginLeft: SPACING.sm,
  },
  statusText: {
    fontSize: FONTS.small,
    fontWeight: FONTS.bold,
    color: COLORS.white,
  },
  batchFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  batchMeta: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  batchMetaText: {
    fontSize: FONTS.small,
    color: COLORS.textSecondary,
    marginLeft: SPACING.xs,
  },
  batchStatus: {
    fontSize: FONTS.small,
    fontWeight: FONTS.mediumWeight,
  },
  arrowIndicator: {
    marginLeft: SPACING.sm,
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: SPACING.xxxl,
    paddingHorizontal: SPACING.xl,
  },
  emptyStateText: {
    fontSize: FONTS.large,
    fontWeight: FONTS.bold,
    color: COLORS.text,
    marginTop: SPACING.lg,
    marginBottom: SPACING.xs,
    textAlign: 'center',
  },
  emptyStateSubtext: {
    fontSize: FONTS.regular,
    color: COLORS.textSecondary,
    textAlign: 'center',
    lineHeight: FONTS.lineHeightRegular,
  },
  clearSearchButton: {
    marginTop: SPACING.lg,
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.sm,
    backgroundColor: COLORS.primary,
    borderRadius: BORDER_RADIUS.md,
  },
  clearSearchButtonText: {
    color: COLORS.white,
    fontSize: FONTS.regular,
    fontWeight: FONTS.bold,
  },
});

export default AllBatchesScreen;
