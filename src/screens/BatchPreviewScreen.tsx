import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { 
  View, 
  Text, 
  StyleSheet, 
  FlatList, 
  Image, 
  TouchableOpacity, 
  Alert,
  SafeAreaView,
  StatusBar,
  ActivityIndicator,
  Dimensions,
  RefreshControl,
  Animated,
  Platform,
  Switch,
  TextInput
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { BatchPreviewScreenProps } from '../types/navigation';
import { PhotoData } from '../types/data';
import CustomButton from '../components/CustomButton';
import { COLORS, FONTS, SPACING, BORDER_RADIUS, SHADOWS } from '../styles/theme';
import * as FileSystem from 'expo-file-system';
import { logAnalyticsEvent, logErrorToFile } from '../services/analyticsService';
import * as databaseService from '../services/databaseService';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

// View mode options
type ViewMode = 'list' | 'grid';

// Selection mode for multi-select operations
type SelectionMode = 'none' | 'select';

const BatchPreviewScreen = ({ navigation, route }: BatchPreviewScreenProps) => {
  // Extract the batchId from route params
  const { batchId } = route.params;
  
  // State for batch details
  const [batchDetails, setBatchDetails] = useState<{
    photos: PhotoData[];
    orderNumber?: string;
    inventorySessionId?: string;
    userId: string;
  }>({ 
    photos: [], 
    userId: 'test-user' 
  });
  
  // UI state
  const [isLoading, setIsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>('list');
  const [selectionMode, setSelectionMode] = useState<SelectionMode>('none');
  const [selectedPhotos, setSelectedPhotos] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearchActive, setIsSearchActive] = useState(false);
  
  // Animation values
  const listOpacity = useRef(new Animated.Value(1)).current;
  const gridOpacity = useRef(new Animated.Value(0)).current;
  
  // FlatList reference for scrolling operations
  const listRef = useRef<FlatList>(null);
  
  // Extract values from batch details
  const { photos: initialBatch, orderNumber, inventorySessionId, userId } = batchDetails;
  const [currentBatch, setCurrentBatch] = useState<PhotoData[]>(initialBatch);

  // Toggle view mode between list and grid
  const toggleViewMode = useCallback(() => {
    const newMode = viewMode === 'list' ? 'grid' : 'list';
    
    // Animate transition between views
    Animated.parallel([
      Animated.timing(listOpacity, {
        toValue: newMode === 'list' ? 1 : 0,
        duration: 300,
        useNativeDriver: true,
      }),
      Animated.timing(gridOpacity, {
        toValue: newMode === 'grid' ? 1 : 0,
        duration: 300,
        useNativeDriver: true,
      }),
    ]).start();
    
    setViewMode(newMode);
  }, [viewMode, listOpacity, gridOpacity]);
  
  // Toggle selection mode for multi-select operations
  const toggleSelectionMode = useCallback(() => {
    if (selectionMode === 'none') {
      setSelectionMode('select');
    } else {
      setSelectionMode('none');
      setSelectedPhotos(new Set());
    }
  }, [selectionMode]);
  
  // Toggle selection of a photo
  const togglePhotoSelection = useCallback((photoId: string) => {
    setSelectedPhotos(prev => {
      const newSelection = new Set(prev);
      if (newSelection.has(photoId)) {
        newSelection.delete(photoId);
      } else {
        newSelection.add(photoId);
      }
      return newSelection;
    });
  }, []);
  
  // Select all photos
  const selectAllPhotos = useCallback(() => {
    const allPhotoIds = new Set(currentBatch.map(photo => photo.id));
    setSelectedPhotos(allPhotoIds);
  }, [currentBatch]);
  
  // Deselect all photos
  const deselectAllPhotos = useCallback(() => {
    setSelectedPhotos(new Set());
  }, []);
  
  // Handle pull-to-refresh
  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchBatchDetails();
    setRefreshing(false);
  }, []);
  
  // Fetch batch details from database
  const fetchBatchDetails = useCallback(async () => {
    try {
      setIsLoading(true);
      console.log(`[BatchPreviewScreen] Fetching details for batch: ${batchId}`);
      
      const { batch, photos } = await databaseService.getBatchDetails(batchId);
      
      console.log(`[BatchPreviewScreen] Database returned ${photos.length} photos for batch ${batchId}`);
      
      if (batch) {
        setBatchDetails({
          photos: photos,
          orderNumber: batch.orderNumber || route.params.identifier || `ORD-${batchId}`,
          inventorySessionId: batch.inventoryId,
          userId: batch.userId || 'test-user'
        });
        setCurrentBatch(photos);
      } else {
        // If batch doesn't exist, show error
        Alert.alert('Error', 'Batch not found');
        navigation.goBack();
      }
    } catch (error) {
      console.error('[BatchPreviewScreen] Error fetching batch details:', error);
      logErrorToFile('fetchBatchDetails', error instanceof Error ? error : new Error(String(error)));
      Alert.alert('Error', 'Failed to load batch details');
    } finally {
      setIsLoading(false);
    }
  }, [batchId, navigation, route.params.identifier]);
  
  // Bulk delete selected photos
  const handleBulkDelete = useCallback(() => {
    if (selectedPhotos.size === 0) return;
    
    Alert.alert(
      'Delete Selected Photos',
      `Are you sure you want to delete ${selectedPhotos.size} selected photo(s)?`,
      [
        { text: 'Cancel', style: 'cancel' },
        { 
          text: 'Delete', 
          style: 'destructive',
          onPress: async () => {
            try {
              // Create a new array without the deleted photos
              const remainingPhotos = currentBatch.filter(
                photo => !selectedPhotos.has(photo.id)
              );
              
              // Update state
              setCurrentBatch(remainingPhotos);
              setBatchDetails(prev => ({ ...prev, photos: remainingPhotos }));
              setSelectedPhotos(new Set());
              
              // Log analytics
              logAnalyticsEvent('bulk_delete_photos', { 
                count: selectedPhotos.size,
                batchId
              });
              
              // Exit selection mode if no photos left
              if (remainingPhotos.length === 0) {
                setSelectionMode('none');
              }
            } catch (error) {
              console.error('[BatchPreviewScreen] Error deleting photos:', error);
              Alert.alert('Error', 'Failed to delete selected photos');
            }
          }
        }
      ]
    );
  }, [selectedPhotos, currentBatch, batchId]);
  
  // Effect to load batch data when component mounts
  useEffect(() => {
    fetchBatchDetails();
  }, [fetchBatchDetails]);

  const handleDeletePhoto = async (photoId: string) => {
    const photoToDelete = currentBatch.find(p => p.id === photoId);
    if (!photoToDelete) return;

    Alert.alert(
      "Confirm Deletion",
      "Are you sure you want to delete this photo? This action cannot be undone.",
      [
        { text: "Cancel", style: "cancel" },
        { 
          text: "Delete", 
          style: "destructive", 
          onPress: async () => {
            try {
              // Delete the physical file
              await FileSystem.deleteAsync(photoToDelete.uri, { idempotent: true });
              console.log(`[BatchPreviewScreen] Deleted file: ${photoToDelete.uri}`);
              
              // Update state
              const updatedBatch = currentBatch.filter(photo => photo.id !== photoId);
              setCurrentBatch(updatedBatch);
              console.log(`[BatchPreviewScreen] Photo ${photoId} removed from batch. New size: ${updatedBatch.length}`);

              await logAnalyticsEvent('photo_deleted', { 
                photoId, 
                orderNumber, 
                inventorySessionId, 
                userId 
              });

              // If the batch becomes empty, maybe navigate back or show a message?
              if (updatedBatch.length === 0) {
                Alert.alert("Batch Empty", "All photos have been deleted.");
                // Optionally navigate back to Dashboard
                // navigation.navigate('Dashboard'); 
              }
            } catch (error) {
              console.error(`[BatchPreviewScreen] Failed to delete photo ${photoId}:`, error);
              await logErrorToFile(`[BatchPreviewScreen] Failed to delete photo ${photoId}: ${error instanceof Error ? error.message : String(error)}`);
              Alert.alert("Deletion Failed", "Could not delete the photo file. Please try again.");
            }
          } 
        },
      ]
    );
  };

  const handleAnnotatePhoto = (photo: PhotoData) => {
    console.log(`[BatchPreviewScreen] Navigating to Annotate for photo: ${photo.id}`);
    // Navigate to DefectHighlightingScreen, passing the photo
    navigation.navigate('DefectHighlighting', { photo });
  };

  const handleAddMorePhotos = () => {
    console.log('[BatchPreviewScreen] Navigating back to Photo Capture to add more photos.');
    // Navigate back to PhotoCapture, passing batch ID to continue the session
    navigation.navigate('PhotoCapture', { batchId });
  };

  const handleProceedToPDF = () => {
    // If there are no photos, show an error
    if (currentBatch.length === 0) {
      Alert.alert(
        'No Photos',
        'Please capture at least one photo before generating a PDF.',
        [{ text: 'OK' }]
      );
      return;
    }
    
    // Directly generate a simple PDF without showing a menu
    navigateToPdfGeneration('simple');
  };

  // Helper function to navigate after type selection
  const navigateToPdfGeneration = (reportType: 'simple' | 'detailed') => {
    // Log the navigation event
    console.log(`[BatchPreviewScreen] Navigating to PDF Generation with type: ${reportType}`);
    
    // Log the analytics event
    logAnalyticsEvent('pdf_generation_started', {
      batchId: batchId,
      orderNumber: orderNumber
    });
    
    // Navigate to PDF generation screen
    navigation.navigate('PDFGeneration', {
      batchId: batchId,
      reportType: reportType === 'simple' ? 'order' : 'inventory',
      orderNumber: orderNumber,
      inventorySessionId: inventorySessionId
    });
  };

  // We already have handleAnnotatePhoto and handleDeletePhoto defined above
  
  // Define renderPhotoItem inside the component
  const renderPhotoItem = ({ item }: { item: PhotoData }) => {
    return (
      <View style={styles.photoItemContainer}>
        <Image source={{ uri: item.uri }} style={styles.thumbnail} />
        <View style={styles.photoInfo}>
          <Text style={styles.infoText}>Type: {item.photoTitle || 'General Picture'}</Text>
          <Text style={styles.infoText}>
            {new Date(item.metadata.timestamp).toLocaleString()}
          </Text>
          {item.annotations && item.annotations.length > 0 && (
            <View style={styles.defectIndicator}>
              <Ionicons name="warning-outline" size={14} color={COLORS.warning} />
              <Text style={styles.defectText}>Defect Marked</Text>
            </View>
          )}
        </View>
        <View style={styles.photoActions}>
          <TouchableOpacity 
            style={styles.actionButton}
            onPress={() => handleAnnotatePhoto(item)}
          >
            <Ionicons name="create-outline" size={24} color={COLORS.primary} />
          </TouchableOpacity>
          <TouchableOpacity 
            style={styles.actionButton}
            onPress={() => handleDeletePhoto(item.id)}
          >
            <Ionicons name="trash-outline" size={24} color={COLORS.error} />
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  // Use the currentBatch state that's already defined above
  
  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="dark-content" backgroundColor={COLORS.background} />
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>
            Batch Preview ({currentBatch.length} Photos)
          </Text>
          <Text style={styles.subHeader}>
            {orderNumber ? `Order: ${orderNumber}` : `Inventory Session: ${inventorySessionId || 'Unknown'}`}
          </Text>
        </View>

        {/* Loading Indicator */}
        {isLoading && (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={COLORS.primary} />
            <Text style={styles.loadingText}>Loading photos...</Text>
          </View>
        )}

        {!isLoading && currentBatch.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Ionicons name="images-outline" size={60} color={COLORS.grey400} />
            <Text style={styles.emptyText}>This batch is empty.</Text>
            <CustomButton 
              title="Capture Photos" 
              onPress={handleAddMorePhotos}
              variant="primary" 
            />
          </View>
        ) : !isLoading && currentBatch.length > 0 ? (
            <FlatList
              data={currentBatch}
              renderItem={renderPhotoItem}
              keyExtractor={(item) => item.id}
              contentContainerStyle={styles.listContentContainer}
            />
        ) : null}

        <View style={styles.footerButtons}>
          <CustomButton 
            title="Add More Photos" 
            onPress={handleAddMorePhotos} 
            variant="outline"
            style={styles.footerButton}
          />
          <CustomButton 
            title="Generate PDF" 
            onPress={handleProceedToPDF} 
            variant="primary"
            disabled={currentBatch.length === 0} // Keep disabled state
            style={styles.footerButton}
            icon={<Ionicons name="document-text-outline" size={20} color={COLORS.white} />}
          />
        </View>
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
    backgroundColor: COLORS.background, // Use theme background
  },
  header: {
     marginBottom: SPACING.medium,
     alignItems: 'center',
  },
  headerTitle: {
    fontSize: FONTS.xlarge,
    fontWeight: 'bold',
    color: COLORS.text, // Use default theme text color
    marginBottom: SPACING.tiny,
  },
   subHeader: {
    fontSize: FONTS.regular,
    color: COLORS.textLight, // Use light theme text color
   },
  listContentContainer: {
    paddingBottom: 100, // Ensure space for footer buttons
    paddingHorizontal: SPACING.medium, // Padding for list items
  },
  photoItemContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.card, // Use card color
    borderRadius: BORDER_RADIUS.medium,
    padding: SPACING.medium,
    marginBottom: SPACING.large, // More space between items
    ...SHADOWS.small, // Apply theme shadow
  },
  thumbnail: {
    width: 60,
    height: 60,
    borderRadius: BORDER_RADIUS.small,
    marginRight: SPACING.medium,
    backgroundColor: COLORS.grey200, // Placeholder background
  },
  photoInfo: {
    flex: 1,
    justifyContent: 'center',
  },
  infoText: {
    fontSize: FONTS.small,
    color: COLORS.textLight, // Use light theme text color
    marginBottom: SPACING.tiny,
  },
   defectIndicator: {
      flexDirection: 'row',
      alignItems: 'center',
      marginTop: SPACING.tiny,
      backgroundColor: COLORS.warning + '20', // Light warning background
      paddingHorizontal: SPACING.small,
      paddingVertical: SPACING.tiny,
      borderRadius: BORDER_RADIUS.small,
      alignSelf: 'flex-start', // Prevent stretching
   },
   defectText: {
      marginLeft: SPACING.tiny,
      color: COLORS.warning, // Use warning color from theme
      fontSize: FONTS.small,
      fontWeight: '500',
   },
  photoActions: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  actionButton: {
    padding: SPACING.small,
    marginLeft: SPACING.small,
  },
  footerButtons: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'space-around',
    padding: SPACING.medium,
    backgroundColor: COLORS.white, // White background for button container
    borderTopWidth: 1,
    borderTopColor: COLORS.border, // Use theme border color
    paddingBottom: SPACING.large, // Extra padding for safe area bottom
  },
  footerButton: {
    flex: 1, // Make buttons share space
    marginHorizontal: SPACING.small, // Add space between buttons
  },
  emptyContainer: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
  },
  emptyText: {
      fontSize: FONTS.large,
      color: COLORS.textLight,
      marginTop: SPACING.large,
      marginBottom: SPACING.large,
  },
  loadingContainer: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      padding: SPACING.large,
  },
  loadingText: {
      fontSize: FONTS.medium,
      color: COLORS.textLight,
      marginTop: SPACING.medium,
  },
});

export default BatchPreviewScreen;
