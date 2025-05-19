import React, { useState, useEffect } from 'react';
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
  ActivityIndicator
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { BatchPreviewScreenProps } from '../types/navigation';
import { PhotoData } from '../types/data';
import CustomButton from '../components/CustomButton';
import { COLORS, FONTS, SPACING, BORDER_RADIUS, SHADOWS } from '../styles/theme';
import * as FileSystem from 'expo-file-system';
import { logAnalyticsEvent, logErrorToFile } from '../services/analyticsService';
import * as databaseService from '../services/databaseService';

const BatchPreviewScreen = ({ navigation, route }: BatchPreviewScreenProps) => {
  // Extract the batchId from route params
  const { batchId } = route.params;
  
  // In a real app, we would fetch batch details from storage using the batchId
  // For now, we'll use mock data
  const [batchDetails, setBatchDetails] = useState<{
    photos: PhotoData[];
    orderNumber?: string;
    inventorySessionId?: string;
    userId: string;
  }>({ 
    photos: [], 
    userId: 'test-user' 
  });
  
  // Add loading state
  const [isLoading, setIsLoading] = useState(true);
  
  // Extract values from batch details
  const { photos: initialBatch, orderNumber, inventorySessionId, userId } = batchDetails;
  const [currentBatch, setCurrentBatch] = useState<PhotoData[]>(initialBatch);

  // Fetch batch data when component mounts or batchId changes
  useEffect(() => {
    const fetchBatchDetails = async () => {
      try {
        // Set loading state to true at the start
        setIsLoading(true);
        console.log(`[BatchPreviewScreen] Fetching details for batch: ${batchId}`);
        
        // Use the database service to get the actual batch details and photos
        const { batch, photos } = await databaseService.getBatchDetails(batchId);
        
        console.log(`[BatchPreviewScreen] Database returned ${photos.length} photos for batch ${batchId}`);
        
        if (batch) {
          // Use the actual batch data from the database
          const actualBatchData = {
            photos: photos,
            orderNumber: batch.orderNumber || route.params.identifier || `ORD-${batchId}`,
            userId: batch.userId || 'test-user'
          };
          
          setBatchDetails(actualBatchData);
          setCurrentBatch(photos);
          console.log('[BatchPreviewScreen] Batch loaded:', photos.length, 'photos');
        } else {
          console.warn(`[BatchPreviewScreen] No batch found with ID ${batchId}`);
          
          // If no batch was found but we have photos, still show them
          if (photos.length > 0) {
            const fallbackBatchData = {
              photos: photos,
              orderNumber: route.params.identifier || `ORD-${batchId}`,
              userId: 'test-user'
            };
            
            setBatchDetails(fallbackBatchData);
            setCurrentBatch(photos);
            console.log('[BatchPreviewScreen] Using photos without batch:', photos.length, 'photos');
          } else {
            // No batch and no photos - show empty state
            setBatchDetails({ photos: [], userId: 'test-user' });
            setCurrentBatch([]);
            console.log('[BatchPreviewScreen] No photos found for batch');
          }
        }
      } catch (error) {
        console.error('[BatchPreviewScreen] Failed to fetch batch details:', error);
        logErrorToFile('fetchBatchDetails', error instanceof Error ? error : new Error(String(error)));
        Alert.alert(
          "Error",
          "Failed to load batch details. Please try again.",
          [{ text: "OK", onPress: () => navigation.goBack() }]
        );
      } finally {
        // Set loading state to false when done, regardless of success or failure
        setIsLoading(false);
      }
    };
    
    fetchBatchDetails();
  }, [batchId]);

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
      orderNumber: orderNumber,
      photoCount: currentBatch.length,
      reportType: reportType,
      timestamp: new Date().toISOString(),
      userId: userId || 'test'
    });
    
    // Navigate to the PDF generation screen
    navigation.navigate('PDFGeneration', {
      batchId: batchId, // Use the same batch ID to ensure photos are found
      reportType: reportType === 'simple' ? 'order' : 'inventory', // Convert report type to match expected values
      orderNumber: orderNumber, // Pass the order number if available
      inventorySessionId: inventorySessionId // Pass the inventory session ID if available
    });
  };

  // Define renderPhotoItem inside the component
  const renderPhotoItem = ({ item }: { item: PhotoData }) => (
    <View style={styles.photoItemContainer}>
      <Image source={{ uri: item.uri }} style={styles.thumbnail} />
      <View style={styles.photoInfo}>
        <Text style={styles.infoText}>ID: {item.id}</Text>
        <Text style={styles.infoText}>Part: {item.partNumber}</Text>
        {/* Add more metadata if needed, e.g., timestamp */}
        {item.metadata.hasDefects && (
          <View style={styles.defectIndicator}>
            <Ionicons 
              name="warning" 
              size={16} 
              color={item.metadata.defectSeverity === 'critical' ? COLORS.error : COLORS.warning} 
            />
            <Text style={[styles.defectText, {
              color: item.metadata.defectSeverity === 'critical' ? COLORS.error : COLORS.warning
            }]}>
              {item.metadata.defectSeverity === 'critical' ? 'Critical Defect' : 'Defect'}
            </Text>
          </View>
        )}
      </View>
      <View style={styles.photoActions}>
        <TouchableOpacity onPress={() => handleAnnotatePhoto(item)} style={styles.actionButton}>
          <Ionicons name="create-outline" size={24} color={COLORS.primary} />
        </TouchableOpacity>
        <TouchableOpacity onPress={() => handleDeletePhoto(item.id)} style={styles.actionButton}>
          <Ionicons name="trash-outline" size={24} color={COLORS.error} />
        </TouchableOpacity>
      </View>
    </View>
  );

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="dark-content" backgroundColor={COLORS.background} />
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>
            Batch Preview ({currentBatch.length} Photos)
          </Text>
          <Text style={styles.subHeader}>
            {orderNumber ? `Order: ${orderNumber}` : `Inventory Session: ${inventorySessionId}`}
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
