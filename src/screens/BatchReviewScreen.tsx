import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, FlatList, Image, TouchableOpacity, SafeAreaView, Alert, Platform, ActivityIndicator } from 'react-native';
import { RouteProp, useRoute, useNavigation, useFocusEffect } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { Ionicons } from '@expo/vector-icons';

import { RootStackParamList } from '../types/navigation';
import { PhotoData, PhotoBatch } from '../types/data'; 
import { COLORS, FONTS, SPACING, BORDER_RADIUS, SHADOWS } from '../styles/theme';
import { logAnalyticsEvent } from '../services/analyticsService';
import { getCredentials } from '../services/authService';
import { getBatchDetails, deletePhotoById, deleteBatch } from '../services/databaseService';

const BatchPreviewScreen: React.FC = () => {
  const navigation = useNavigation<StackNavigationProp<RootStackParamList, 'BatchPreview'>>();
  const route = useRoute<RouteProp<RootStackParamList, 'BatchPreview'>>();
  const { batchId } = route.params; 

  const [batchDetails, setBatchDetails] = useState<PhotoBatch | null>(null);
  const [photos, setPhotos] = useState<PhotoData[]>([]);
  const [userId, setUserId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const fetchBatchData = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      console.log(`[BatchPreviewScreen] Fetching data for batchId: ${batchId}`);
      const creds = await getCredentials();
      if (creds) {
        setUserId(creds.userId);
      } else {
        console.warn('[BatchPreviewScreen] Could not retrieve user credentials.');
      }
      const { batch, photos: fetchedPhotos } = await getBatchDetails(batchId);
      if (batch) {
        setBatchDetails(batch);
        setPhotos(fetchedPhotos);
        console.log(`[BatchPreviewScreen] Fetched ${fetchedPhotos.length} photos for batch ${batchId}`);
      } else {
        setError('Batch details not found.');
        console.error(`[BatchPreviewScreen] Batch with ID ${batchId} not found.`);
      }
    } catch (err: any) {
      console.error('[BatchPreviewScreen] Error fetching batch data:', err);
      setError('Failed to load batch data. Please try again.');
      logAnalyticsEvent('error_fetch_batch', { userId, batchId, error: err.message });
    } finally {
      setIsLoading(false);
    }
  }, [batchId, userId]); 

  useFocusEffect(
    useCallback(() => {
      fetchBatchData();
    }, [fetchBatchData])
  );

  const handleAddMorePhotos = () => {
    navigation.navigate('PhotoCapture', { batchId }); 
  };

  const handleGeneratePDF = () => {
    logAnalyticsEvent('pdf_generation_started', { userId, batchId, photoCount: photos.length });
    navigation.navigate('PDFGeneration', { batchId }); 
    console.log('Navigating to PDF Generation for batch:', batchId);
  };

  const handleDeletePhoto = (photoId: string, photoUri?: string) => {
    Alert.alert(
      'Delete Photo?',
      'Are you sure you want to delete this photo? This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              console.log(`[BatchPreviewScreen] Deleting photo ${photoId}`);
              await deletePhotoById(photoId); 
              logAnalyticsEvent('photo_deleted', { userId, batchId, photoId });
              setPhotos(currentPhotos => currentPhotos.filter(p => p.id !== photoId));
              Alert.alert('Success', 'Photo deleted successfully.');
            } catch (err: any) {
              console.error('[BatchPreviewScreen] Error deleting photo:', err);
              Alert.alert('Error', 'Failed to delete photo. Please try again.');
              logAnalyticsEvent('error_delete_photo', { userId, batchId, photoId, error: err.message });
            }
          },
        },
      ],
    );
  };

  const handleAnnotatePhoto = (photoId: string) => {
    console.log(`[BatchPreviewScreen] Navigating to annotate photo ${photoId} for batch ${batchId}`);
    // Find the photo in the photos array
    const photo = photos.find(p => p.id === photoId);
    if (photo) {
      navigation.navigate('DefectHighlighting', { photo });
    } else {
      console.error(`[BatchPreviewScreen] Photo with ID ${photoId} not found in batch`);
      Alert.alert('Error', 'Photo not found in batch. Please try again.');
    }
  };

  const handleDiscardBatch = () => {
    Alert.alert(
      'Discard Batch?',
      `Are you sure you want to discard all ${photos.length} photos in this batch? This cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Discard',
          style: 'destructive',
          onPress: async () => {
            try {
              console.log(`[BatchPreviewScreen] Discarding batch ${batchId}`);
              setIsLoading(true); 
              await deleteBatch(batchId); 
              logAnalyticsEvent('batch_discarded', { userId, batchId, photoCount: photos.length });
              Alert.alert('Success', 'Batch discarded successfully.');
              navigation.navigate('MainTabs', { screen: 'DashboardTab' });
            } catch (err: any) {
              setIsLoading(false);
              console.error('[BatchPreviewScreen] Error discarding batch:', err);
              Alert.alert('Error', 'Failed to discard batch. Please try again.');
              logAnalyticsEvent('error_discard_batch', { userId, batchId, error: err.message });
            }
          },
        },
      ],
    );
  };

  const renderPhotoItem = ({ item }: { item: PhotoData }) => (
    <View style={styles.photoItemContainer}>
      <Image source={{ uri: item.uri }} style={styles.thumbnail} />
      <View style={styles.photoDetails}>
        <Text style={styles.detailText}>Part No: {item.partNumber || 'N/A'}</Text>
        <Text style={styles.detailText}>Equipment: {(item.metadata as any)?.equipmentId || 'Unknown'}</Text>
        <Text style={styles.detailText}>Component: {(item.metadata as any)?.componentId || 'Unknown'}</Text>
        <Text style={styles.detailText} numberOfLines={1}>Notes: {item.metadata?.defectNotes || 'N/A'}</Text>
        {item.annotations && item.annotations.length > 0 && (
            <Text style={styles.annotationIndicator}>Annotated</Text>
        )}
      </View>
      <View style={styles.photoActions}>
        <TouchableOpacity onPress={() => handleAnnotatePhoto(item.id)} style={styles.actionButton}>
          <Ionicons name="create-outline" size={24} color={COLORS.primary} />
        </TouchableOpacity>
        <TouchableOpacity onPress={() => handleDeletePhoto(item.id, item.uri)} style={styles.actionButton}>
          <Ionicons name="trash-outline" size={24} color={COLORS.error} />
        </TouchableOpacity>
      </View>
    </View>
  );

  const renderListHeader = () => (
     <TouchableOpacity onPress={handleAddMorePhotos} style={styles.addMoreButton}>
        <Ionicons name="add-circle-outline" size={22} color={COLORS.white} style={styles.buttonIcon} />
        <Text style={styles.addMoreButtonText}>Add More Photos</Text>
    </TouchableOpacity>
  );

  if (isLoading && !batchDetails) { 
    return (
      <SafeAreaView style={[styles.safeArea, styles.centered]}>
        <ActivityIndicator size="large" color={COLORS.primary} />
        <Text style={styles.loadingText}>Loading Batch...</Text>
      </SafeAreaView>
    );
  }

  if (error) {
    return (
      <SafeAreaView style={[styles.safeArea, styles.centered]}>
        <Ionicons name="alert-circle-outline" size={40} color={COLORS.error} />
        <Text style={styles.errorText}>{error}</Text>
        <TouchableOpacity onPress={fetchBatchData} style={styles.retryButton}>
            <Text style={styles.retryButtonText}>Retry</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  const batchTitle = batchDetails?.orderNumber
    ? `Order #${batchDetails.orderNumber}`
    : batchDetails?.inventoryId
    ? `Inventory ${batchDetails.inventoryId}`
    : `Batch #${batchId}`;

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={28} color={COLORS.primary} />
        </TouchableOpacity>
        <Text style={styles.title} numberOfLines={1}>{batchTitle} ({photos.length} Photos)</Text>
        <View style={{ width: 40 }} />
      </View>

      <FlatList
        data={photos}
        renderItem={renderPhotoItem}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContentContainer}
        ListHeaderComponent={renderListHeader} 
        ListEmptyComponent={<Text style={styles.emptyText}>No photos in this batch yet. Tap 'Add More Photos' to start.</Text>}
      />

      {isLoading && photos.length > 0 && (
         <View style={styles.loadingOverlay}>
           <ActivityIndicator size="small" color={COLORS.primary} />
         </View>
       )}

      <View style={styles.footer}>
        <TouchableOpacity onPress={handleDiscardBatch} style={[styles.footerButtonBase, styles.discardButton]}>
          <Ionicons name="trash-outline" size={20} color={COLORS.white} style={styles.buttonIcon} />
          <Text style={styles.buttonText}>Discard Batch</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={handleGeneratePDF} style={[styles.footerButtonBase, styles.generateButton]} disabled={photos.length === 0}>
          <Ionicons name="document-text-outline" size={20} color={COLORS.white} style={styles.buttonIcon} />
          <Text style={styles.buttonText}>Generate PDF</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  centered: {
    justifyContent: 'center',
    alignItems: 'center',
    padding: SPACING.large,
  },
  loadingText: {
    marginTop: SPACING.medium,
    fontSize: FONTS.medium,
    color: COLORS.textLight,
  },
  errorText: {
    marginTop: SPACING.medium,
    fontSize: FONTS.medium,
    color: COLORS.error,
    textAlign: 'center',
    marginBottom: SPACING.large,
  },
  retryButton: {
      backgroundColor: COLORS.primary,
      paddingVertical: SPACING.small,
      paddingHorizontal: SPACING.large,
      borderRadius: BORDER_RADIUS.medium,
  },
  retryButtonText: {
      color: COLORS.white,
      fontSize: FONTS.medium,
      fontWeight: 'bold',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.medium,
    paddingVertical: SPACING.small,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    backgroundColor: COLORS.white,
  },
  backButton: {
    padding: SPACING.small,
    marginLeft: -SPACING.small,
  },
  title: {
    flex: 1, 
    textAlign: 'center', 
    fontSize: FONTS.large,
    fontWeight: 'bold',
    color: COLORS.text,
    marginHorizontal: SPACING.small, 
  },
  listContentContainer: {
    padding: SPACING.medium,
    paddingBottom: 120, 
  },
  photoItemContainer: {
    flexDirection: 'row',
    backgroundColor: COLORS.white,
    borderRadius: BORDER_RADIUS.medium,
    padding: SPACING.medium, 
    marginBottom: SPACING.medium,
    ...SHADOWS.small,
    alignItems: 'center',
  },
  thumbnail: {
    width: 70,
    height: 70,
    borderRadius: BORDER_RADIUS.small,
    marginRight: SPACING.medium,
    backgroundColor: COLORS.grey200,
  },
  photoDetails: {
    flex: 1,
    marginRight: SPACING.small, 
  },
  detailText: {
    fontSize: FONTS.small,
    color: COLORS.textLight,
    marginBottom: SPACING.tiny,
  },
  annotationIndicator: {
    fontSize: FONTS.tiny,
    color: COLORS.secondary, 
    fontWeight: 'bold',
    marginTop: SPACING.tiny,
  },
  photoActions: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  actionButton: {
    padding: SPACING.small,
    marginLeft: SPACING.small, 
  },
  addMoreButton: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: COLORS.primary, 
      paddingVertical: SPACING.medium,
      borderRadius: BORDER_RADIUS.medium,
      marginBottom: SPACING.medium,
      ...SHADOWS.medium,
  },
  addMoreButtonText: {
      color: COLORS.white,
      fontSize: FONTS.medium,
      fontWeight: 'bold',
  },
  emptyText: {
    textAlign: 'center',
    marginTop: SPACING.xlarge,
    fontSize: FONTS.medium,
    color: COLORS.textLight,
  },
  loadingOverlay: { 
    position: 'absolute',
    top: 60, 
    left: 0,
    right: 0,
    alignItems: 'center',
    zIndex: 10,
  },
  footer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'space-around',
    padding: SPACING.medium,
    paddingBottom: Platform.OS === 'ios' ? SPACING.large + 10 : SPACING.large,
    backgroundColor: COLORS.white,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },
  footerButtonBase: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: SPACING.medium,
    borderRadius: BORDER_RADIUS.medium,
    marginHorizontal: SPACING.small,
    ...SHADOWS.small,
  },
  buttonIcon: {
    marginRight: SPACING.small,
  },
  buttonText: {
    color: COLORS.white,
    fontSize: FONTS.medium,
    fontWeight: 'bold',
  },
  discardButton: {
    backgroundColor: COLORS.error,
  },
  generateButton: {
    backgroundColor: COLORS.success, 
  },
});

export default BatchPreviewScreen;
