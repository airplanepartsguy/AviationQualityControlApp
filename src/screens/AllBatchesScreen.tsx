import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, SafeAreaView, FlatList, TextInput, ActivityIndicator, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../contexts/AuthContext'; // Adjust path if needed
import { getAllPhotoBatchesForUser, BatchListItem } from '../services/databaseService'; // Adjust path if needed
import { COLORS, FONTS, SPACING, BORDER_RADIUS } from '../styles/theme'; // Assuming theme import

const AllBatchesScreen: React.FC = () => {
  const { userId } = useAuth();
  const [allBatches, setAllBatches] = useState<BatchListItem[]>([]);
  const [displayedBatches, setDisplayedBatches] = useState<BatchListItem[]>([]);
  const [searchText, setSearchText] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  // Fetch all batches for the user
  useEffect(() => {
    const fetchBatches = async () => {
      if (!userId) {
        setAllBatches([]);
        setDisplayedBatches([]);
        return;
      }
      setIsLoading(true);
      try {
        const batches = await getAllPhotoBatchesForUser(userId);
        setAllBatches(batches);
        setDisplayedBatches(batches); // Initially, display all fetched batches
      } catch (error) {
        console.error('Failed to fetch batches:', error);
        setAllBatches([]);
        setDisplayedBatches([]);
        // Optionally, show a user-friendly error message
      } finally {
        setIsLoading(false);
      }
    };

    fetchBatches();
  }, [userId]);

  // Handle search filtering
  useEffect(() => {
    if (!searchText) {
      setDisplayedBatches(allBatches);
      return;
    }
    const lowerSearchText = searchText.toLowerCase();
    const filteredBatches = allBatches.filter(batch => {
      const refMatch = batch.referenceId?.toLowerCase().includes(lowerSearchText);
      const orderMatch = batch.orderNumber?.toLowerCase().includes(lowerSearchText);
      const inventoryMatch = batch.inventoryId?.toLowerCase().includes(lowerSearchText);
      return refMatch || orderMatch || inventoryMatch;
    });
    setDisplayedBatches(filteredBatches);
  }, [searchText, allBatches]);

  const renderBatchItem = ({ item }: { item: BatchListItem }) => {
    const statusColor =
      item.syncStatus === 'complete' ? COLORS.success :
      item.syncStatus === 'pending' ? COLORS.warning : // Assuming 'pending' maps to warning
      item.syncStatus === 'failed' ? COLORS.error :
      COLORS.grey500; // Default for 'unknown' or other statuses

    // Consistent date formatting
    const formattedDate = new Date(item.createdAt).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });

    return (
      <TouchableOpacity 
        style={styles.batchItem} // Will define this style
        // onPress={() => console.log('Batch item pressed:', item.id)} // Placeholder for future action
        activeOpacity={0.7}
      >
        <View style={styles.batchItemContent}> {/* Will define this style */}
          <View style={styles.batchItemHeader}> {/* Will define this style */}
            <Text style={styles.batchOrderNumber}>{item.referenceId || `Batch #${item.id.substring(0,6)}`}</Text> {/* Will define this style */}
            <View style={[styles.statusIndicator, { backgroundColor: statusColor }]} /> {/* Will define this style */}
          </View>
          
          <View style={styles.batchItemDetails}> {/* Will define this style */}
            <View style={styles.batchDetailRow}> {/* Will define this style */}
              <Ionicons name="document-text-outline" size={16} color={COLORS.textLight} style={styles.detailIcon} />
              <Text style={styles.batchDetailText}>{item.type}</Text> {/* Will define this style */}
            </View>
            <View style={styles.batchDetailRow}>
              <Ionicons name="images-outline" size={16} color={COLORS.textLight} style={styles.detailIcon} />
              <Text style={styles.batchDetailText}>{`${item.photoCount} photos`}</Text>
            </View>
            <View style={styles.batchDetailRow}>
              <Ionicons name="time-outline" size={16} color={COLORS.textLight} style={styles.detailIcon} />
              <Text style={styles.batchDetailText}>{formattedDate}</Text>
            </View>
          </View>
        </View>
        {/* We can add a chevron or other indicator if items become pressable for navigation */}
        {/* <View style={styles.batchItemAction}> 
          <Ionicons name="chevron-forward" size={20} color={COLORS.primary} />
        </View> */}
      </TouchableOpacity>
    );
  };

  const ListEmpty = () => (
    <View style={styles.emptyListContainer}>
      <Text style={styles.emptyListText}>
        {searchText ? 'No batches match your search.' : (allBatches.length === 0 && !isLoading ? 'No batches found.' : '')}
      </Text>
    </View>
  );

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.container}>
        <Text style={styles.title}>All Batches</Text>
        <Text style={styles.subtitle}>Search and manage all your photo batches.</Text>

        <TextInput
          style={styles.searchInput}
          placeholder="Search by ID, Order No, Inventory No..."
          value={searchText}
          onChangeText={setSearchText}
          placeholderTextColor={COLORS.grey500}
        />

        {isLoading ? (
          <ActivityIndicator size="large" color={COLORS.primary} style={styles.loader} />
        ) : (
          <FlatList
            data={displayedBatches}
            renderItem={renderBatchItem}
            keyExtractor={(item) => item.id}
            ListEmptyComponent={ListEmpty}
            contentContainerStyle={styles.listContentContainer}
          />
        )}
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  container: {
    flex: 1,
    padding: SPACING.medium,
  },
  title: {
    fontSize: FONTS.large,
    fontWeight: FONTS.bold,
    color: COLORS.primary,
    textAlign: 'center',
    marginBottom: SPACING.medium,
  },
  subtitle: {
    fontSize: FONTS.regular,
    color: COLORS.textLight,
    textAlign: 'center',
    marginBottom: SPACING.medium,
  },
  searchInput: {
    height: 50,
    borderColor: COLORS.grey300,
    borderWidth: 1,
    borderRadius: SPACING.small,
    paddingHorizontal: SPACING.medium,
    marginBottom: SPACING.medium,
    fontSize: FONTS.regular,
    backgroundColor: COLORS.white,
    color: COLORS.black,
  },
  loader: {
    marginTop: SPACING.large,
  },
  listContentContainer: {
    paddingBottom: SPACING.large,
  },
  batchItem: {
    flexDirection: 'row',
    backgroundColor: COLORS.card,
    borderRadius: BORDER_RADIUS.medium,
    padding: SPACING.medium,
    marginHorizontal: SPACING.small, 
    marginBottom: SPACING.medium, 
    borderWidth: 1, 
    borderColor: COLORS.border, 
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
    fontSize: FONTS.medium, // Corrected from FONTS.body1
    fontWeight: 'bold',
    color: COLORS.text,
    flexShrink: 1, 
  },
  statusIndicator: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginLeft: SPACING.small, 
  },
  batchItemDetails: {
    marginTop: SPACING.small, 
  },
  batchDetailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: SPACING.tiny,
  },
  detailIcon: {
    marginRight: SPACING.small, 
  },
  batchDetailText: {
    fontSize: FONTS.small, // Corrected from FONTS.body3
    color: COLORS.textLight, // Corrected from COLORS.textSecondary
    flexShrink: 1, 
  },
  emptyListContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: SPACING.large,
  },
  emptyListText: {
    fontSize: FONTS.regular,
    color: COLORS.grey600,
    textAlign: 'center',
  },
});

export default AllBatchesScreen;
