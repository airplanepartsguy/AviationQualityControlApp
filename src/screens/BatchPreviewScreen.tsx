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
  StatusBar
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { BatchPreviewScreenProps } from '../types/navigation';
import { PhotoData } from '../types/data';
import CustomButton from '../components/CustomButton';
import { COLORS, FONTS, SPACING, BORDER_RADIUS, SHADOWS } from '../styles/theme';
import * as FileSystem from 'expo-file-system';
import { logAnalyticsEvent, logErrorToFile } from '../services/analyticsService';

const BatchPreviewScreen = ({ navigation, route }: BatchPreviewScreenProps) => {
  const { photosBatch: initialBatch, orderNumber, inventorySessionId, userId } = route.params;
  const [currentBatch, setCurrentBatch] = useState<PhotoData[]>(initialBatch);

  useEffect(() => {
    // Update local state if the batch passed via params changes (e.g., navigating back after deletion/annotation)
    // This might be needed if we modify the batch in DefectHighlighting and navigate back here.
    // A more robust solution might involve a global state manager (like Context or Redux),
    // but for now, we'll rely on potentially re-passing the updated batch.
    setCurrentBatch(initialBatch); 
    console.log('[BatchPreviewScreen] Received batch:', initialBatch.length, 'photos');
  }, [initialBatch]);

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
    // Navigate to DefectHighlightingScreen, passing the single photo and batch context
    navigation.navigate('DefectHighlighting', { 
      photosToAnnotate: [photo], 
      currentPhotoIndex: 0 
    });
  };

  const handleAddMorePhotos = () => {
    console.log('[BatchPreviewScreen] Navigating back to Photo Capture to add more photos.');
    // Navigate back to PhotoCapture, passing necessary context to continue the session
    navigation.navigate('PhotoCapture', {
      mode: orderNumber ? 'Batch' : 'Inventory', // Determine mode based on context
      userId: userId,
      orderNumber: orderNumber || undefined,
      // If batch mode, pass the part number from the first photo? Assumes same part for batch.
      partNumber: orderNumber && currentBatch.length > 0 ? currentBatch[0].partNumber : undefined, 
      // We don't pass the current batch back, PhotoCapture manages its own temporary batch
    });
  };

  const handleProceedToPDF = () => {
    if (currentBatch.length === 0) {
        Alert.alert("Cannot Proceed", "The batch is empty. Please add or capture photos.");
        return;
    }

    // Ask user for report type
    Alert.alert(
      "Choose Report Type",
      "Select the type of PDF report you want to generate:",
      [
        {
          text: "Simple Image List",
          onPress: () => navigateToPdfGeneration('simple')
        },
        {
          text: "Detailed Defect Report",
          onPress: () => navigateToPdfGeneration('detailed')
        },
        {
          text: "Cancel",
          style: "cancel"
        }
      ],
      { cancelable: true }
    );
  };

  // Helper function to navigate after type selection
  const navigateToPdfGeneration = (reportType: 'simple' | 'detailed') => {
    console.log(`[BatchPreviewScreen] Navigating to PDF Generation with type: ${reportType}`);
    navigation.navigate('PDFGeneration', {
        photos: currentBatch,
        reportType: reportType, // Pass the selected type
        orderNumber: orderNumber,
        inventorySessionId: inventorySessionId,
        userId: userId,
     });
  };

  const renderPhotoItem = ({ item }: { item: PhotoData }) => (
    <View style={styles.photoItemContainer}>
      <Image source={{ uri: item.uri }} style={styles.thumbnail} />
      <View style={styles.photoInfo}>
        <Text style={styles.infoText}>ID: {item.id}</Text>
        <Text style={styles.infoText}>Part: {item.partNumber}</Text>
        {/* Add more metadata if needed, e.g., timestamp */}
        {item.metadata.hasDefects && (
             <View style={styles.defectIndicator}>
                  <Ionicons name="warning" size={16} color={COLORS.warning} />
                  <Text style={styles.defectText}>Defects Noted</Text>
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

        {currentBatch.length === 0 ? (
            <View style={styles.emptyContainer}>
                 <Ionicons name="images-outline" size={60} color={COLORS.grey400} />
                 <Text style={styles.emptyText}>This batch is empty.</Text>
                 <CustomButton 
                      title="Capture Photos" 
                      onPress={handleAddMorePhotos}
                      variant="primary" 
                 />
            </View>
        ) : (
            <FlatList
              data={currentBatch}
              renderItem={renderPhotoItem}
              keyExtractor={(item) => item.id}
              contentContainerStyle={styles.listContentContainer}
            />
        )}

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
});

export default BatchPreviewScreen;
