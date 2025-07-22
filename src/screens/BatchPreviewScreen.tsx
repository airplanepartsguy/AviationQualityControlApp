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
import { useAuth } from '../contexts/AuthContext';
import { useCompany } from '../contexts/CompanyContext';
import salesforceUploadService from '../services/salesforceUploadService';
import { pdfGenerationService } from '../services/pdfGenerationService';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

// View mode options
type ViewMode = 'list' | 'grid';

// Selection mode for multi-select operations
type SelectionMode = 'none' | 'select';

const BatchPreviewScreen = ({ navigation, route }: BatchPreviewScreenProps) => {
  // Extract the batchId from route params
  const { batchId } = route.params;
  
  // Contexts
  const { user } = useAuth();
  const { currentCompany } = useCompany();
  
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
  
  // Salesforce upload state
  const [isUploadingToSalesforce, setIsUploadingToSalesforce] = useState(false);
  const [uploadStatus, setUploadStatus] = useState<{
    status: 'idle' | 'uploading' | 'success' | 'error';
    message?: string;
    scannedId?: string;
  }>({ status: 'idle' });
  
  // Animation values
  const listOpacity = useRef(new Animated.Value(1)).current;
  const gridOpacity = useRef(new Animated.Value(0)).current;
  
  // FlatList reference for scrolling operations
  const listRef = useRef<FlatList>(null);
  
  // Extract values from batch details
  const { photos: initialBatch, orderNumber, inventorySessionId, userId } = batchDetails;
  const [currentBatch, setCurrentBatch] = useState<PhotoData[]>(initialBatch);

  // Import additional services for functionality
  const { AsyncStorage } = require('@react-native-async-storage/async-storage');

  // Auto-refresh sync status
  const [autoRefreshInterval, setAutoRefreshInterval] = useState<NodeJS.Timeout | null>(null);

  // View mode persistence key
  const VIEW_MODE_KEY = 'batch_preview_view_mode';

  // Load saved view mode on mount
  useEffect(() => {
    const loadSavedViewMode = async () => {
      try {
        const savedMode = await AsyncStorage.getItem(VIEW_MODE_KEY);
        if (savedMode && (savedMode === 'list' || savedMode === 'grid')) {
          setViewMode(savedMode as ViewMode);
        }
      } catch (error) {
        console.log('[BatchPreview] Could not load saved view mode:', error);
      }
    };
    loadSavedViewMode();
  }, []);

  // Enhanced toggle view mode with persistence
  const toggleViewMode = useCallback(async () => {
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
    
    // Persist view mode preference
    try {
      await AsyncStorage.setItem(VIEW_MODE_KEY, newMode);
    } catch (error) {
      console.log('[BatchPreview] Could not save view mode preference:', error);
    }
  }, [viewMode, listOpacity, gridOpacity]);

  // Enhanced fetch batch details with real sync status
  const fetchBatchDetails = useCallback(async () => {
    if (isLoading) return; // Prevent concurrent fetches
    
    setIsLoading(true);
    try {
      console.log(`[BatchPreviewScreen] Fetching batch details for batch ${batchId}`);
      
      // Parse batchId correctly
      const numericBatchId = typeof batchId === 'string' ? parseInt(batchId, 10) : batchId;
      
      // Small delay to allow background saves
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // Get batch details with photos
      const { batch, photos } = await databaseService.getBatchDetails(numericBatchId);
      
      console.log(`[BatchPreviewScreen] Fetched batch with ${photos.length} photos`);
      
      // Map database photos to PhotoData with real sync status
      const mappedPhotos: PhotoData[] = photos.map(photo => ({
        id: photo.id,
        uri: photo.uri,
        batchId: photo.batchId,
        partNumber: photo.partNumber,
        photoTitle: photo.photoTitle,
        orderNumber: batch?.orderNumber,
        inventoryId: batch?.inventoryId,
        metadata: photo.metadata || {},
        annotations: photo.annotations || undefined,
        syncStatus: photo.syncStatus as 'pending' | 'synced' | 'error',
        annotationSavedUri: photo.annotationSavedUri
      }));

      // Update state with real data
      setBatchDetails({
        photos: mappedPhotos,
        orderNumber: batch?.orderNumber,
        inventorySessionId: batch?.inventoryId,
        userId: batch?.userId || user?.id || 'unknown'
      });
      
      setCurrentBatch(mappedPhotos);
      
      // Clear any error states from upload status
      if (uploadStatus.status === 'error') {
        setUploadStatus({ status: 'idle' });
      }
      
    } catch (error) {
      console.error(`[BatchPreviewScreen] Error fetching batch details:`, error);
      Alert.alert('Error', `Failed to load batch details: ${(error as Error).message}`);
    } finally {
      setIsLoading(false);
      setRefreshing(false);
    }
  }, [batchId, user, isLoading, uploadStatus.status]);

  // Auto-refresh sync status every 30 seconds
  useEffect(() => {
    const startAutoRefresh = () => {
      const interval = setInterval(async () => {
        try {
          // Only refresh sync status, not full data to avoid disrupting user
          const numericBatchId = typeof batchId === 'string' ? parseInt(batchId, 10) : batchId;
          const { photos } = await databaseService.getBatchDetails(numericBatchId);
          
          // Update only sync status without disrupting UI
          setCurrentBatch(prevBatch => 
            prevBatch.map(photo => {
              const dbPhoto = photos.find(p => p.id === photo.id);
              return dbPhoto ? { ...photo, syncStatus: dbPhoto.syncStatus as 'pending' | 'synced' | 'error' } : photo;
            })
          );
          
          console.log(`[BatchPreview] Auto-refreshed sync status for ${photos.length} photos`);
        } catch (error) {
          console.log('[BatchPreview] Auto-refresh failed:', error);
        }
      }, 30000); // 30 seconds
      
      setAutoRefreshInterval(interval);
      return interval;
    };

    const interval = startAutoRefresh();
    
    // Cleanup on unmount
    return () => {
      if (interval) {
        clearInterval(interval);
      }
    };
  }, [batchId]);

  // Effect to load batch data when component mounts
  useEffect(() => {
    fetchBatchDetails();
  }, [fetchBatchDetails]);
  
  // Add focus effect to refresh data when screen is focused
  const { useFocusEffect } = require('@react-navigation/native');
  useFocusEffect(
    useCallback(() => {
      console.log(`[BatchPreviewScreen] Screen focused, refreshing batch ${batchId}`);
      fetchBatchDetails();
    }, [fetchBatchDetails])
  );

  // Initial load effect
  useEffect(() => {
    console.log('[BatchPreview] Component mounted, loading initial data');
    fetchBatchDetails();
  }, []);

  // Cleanup effect for auto-refresh
  useEffect(() => {
    return () => {
      if (autoRefreshInterval) {
        clearInterval(autoRefreshInterval);
        console.log('[BatchPreview] Cleaned up auto-refresh interval');
      }
    };
  }, [autoRefreshInterval]);
  
  // Enhanced bulk delete with real database operations
  const handleBulkDelete = useCallback(async () => {
    if (selectedPhotos.size === 0) return;
    
    Alert.alert(
      'Delete Selected Photos',
      `Are you sure you want to delete ${selectedPhotos.size} selected photo(s)? This action cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        { 
          text: 'Delete', 
          style: 'destructive',
          onPress: async () => {
            try {
              setIsLoading(true);
              
              // Delete photos from database
              for (const photoId of Array.from(selectedPhotos)) {
                console.log(`[BatchPreview] Deleting photo: ${photoId}`);
                await databaseService.deletePhotoById(photoId);
              }
              
              // Update UI state
              const remainingPhotos = currentBatch.filter(
                photo => !selectedPhotos.has(photo.id)
              );
              
              setCurrentBatch(remainingPhotos);
              setBatchDetails(prev => ({ ...prev, photos: remainingPhotos }));
              setSelectedPhotos(new Set());
              setSelectionMode('none');
              
              // Log analytics
              logAnalyticsEvent('bulk_delete_photos', { 
                count: selectedPhotos.size,
                batchId: batchId
              });
              
              Alert.alert('Success', `Deleted ${selectedPhotos.size} photo(s) successfully`);
              
            } catch (error) {
              console.error('[BatchPreview] Error during bulk delete:', error);
              Alert.alert('Error', `Failed to delete photos: ${(error as Error).message}`);
            } finally {
              setIsLoading(false);
            }
          }
        }
      ]
    );
  }, [selectedPhotos, currentBatch, batchId]);
  
  // Enhanced photo deletion with real database operations
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
              setIsLoading(true);
              
              // Delete from database
              console.log(`[BatchPreview] Deleting photo from database: ${photoId}`);
              await databaseService.deletePhotoById(photoId);
              
              // Delete the physical file
              if (photoToDelete.uri) {
                await FileSystem.deleteAsync(photoToDelete.uri, { idempotent: true });
                console.log(`[BatchPreview] Deleted file: ${photoToDelete.uri}`);
              }
              
              // Update UI state
              const updatedBatch = currentBatch.filter(photo => photo.id !== photoId);
              setCurrentBatch(updatedBatch);
              setBatchDetails(prev => ({ ...prev, photos: updatedBatch }));
              
              await logAnalyticsEvent('photo_deleted', { 
                photoId, 
                batchId: batchId,
                userId: user?.id 
              });

              // Show feedback
              if (updatedBatch.length === 0) {
                Alert.alert("Batch Empty", "All photos have been deleted.");
              }
              
            } catch (error) {
              console.error(`[BatchPreview] Failed to delete photo ${photoId}:`, error);
              await logErrorToFile(`[BatchPreview] Failed to delete photo ${photoId}: ${error instanceof Error ? error.message : String(error)}`);
              Alert.alert("Deletion Failed", "Could not delete the photo. Please try again.");
            } finally {
              setIsLoading(false);
            }
          } 
        },
      ]
    );
  };

  // Real-time sync status checker
  const getSyncStatusInfo = (photo: PhotoData) => {
    const syncInfo = {
      status: photo.syncStatus || 'pending',
      icon: 'cloud-upload-outline' as any,
      color: COLORS.textLight,
      label: 'Pending'
    };

    switch (photo.syncStatus) {
      case 'synced':
        syncInfo.icon = 'checkmark-circle';
        syncInfo.color = COLORS.success;
        syncInfo.label = 'Synced';
        break;
      case 'error':
        syncInfo.icon = 'alert-circle';
        syncInfo.color = COLORS.error;
        syncInfo.label = 'Error';
        break;
      case 'pending':
      default:
        syncInfo.icon = 'cloud-upload-outline';
        syncInfo.color = COLORS.info;
        syncInfo.label = 'Pending';
        break;
    }

    return syncInfo;
  };

  // Real defect detection
  const hasDefects = useCallback((photo: PhotoData): boolean => {
    return !!(photo.annotations && Array.isArray(photo.annotations) && photo.annotations.length > 0);
  }, []);

  // Manual sync trigger for individual photos
  const triggerPhotoSync = useCallback(async (photo: PhotoData) => {
    try {
      console.log(`[BatchPreview] Triggering manual sync for photo: ${photo.id}`);
      
      // Queue photo for sync
      const { queuePhotoForSync } = await import('../services/offlineSyncService');
      await queuePhotoForSync(photo.id, photo.batchId);
      
      // Show feedback
      Alert.alert('Sync Queued', `Photo ${photo.id.substring(0, 8)}... has been queued for sync.`);
      
      // Refresh sync status after a short delay
      setTimeout(() => {
        fetchBatchDetails();
      }, 1000);
      
    } catch (error) {
      console.error('[BatchPreview] Error triggering manual sync:', error);
      Alert.alert('Sync Error', `Failed to queue photo for sync: ${(error as Error).message}`);
    }
  }, [fetchBatchDetails]);

  // Enhanced pull-to-refresh functionality
  const handleRefresh = useCallback(async () => {
    console.log('[BatchPreview] Manual refresh triggered');
    setRefreshing(true);
    await fetchBatchDetails();
    
    // Also refresh sync queue status
    try {
      const numericBatchId = typeof batchId === 'string' ? parseInt(batchId, 10) : batchId;
      // Trigger any pending syncs
      const { processSyncQueue } = await import('../services/offlineSyncService');
      await processSyncQueue();
    } catch (error) {
      console.log('[BatchPreview] Could not trigger sync queue processing:', error);
    }
  }, [fetchBatchDetails, batchId]);

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
  // const handleRefresh = useCallback(async () => {
  //   setRefreshing(true);
  //   await fetchBatchDetails();
  //   setRefreshing(false);
  // }, []);
  
  // Fetch batch details from database
  // const fetchBatchDetails = useCallback(async () => {
  //   try {
  //     setIsLoading(true);
  //     console.log(`[BatchPreviewScreen] Fetching details for batch: ${batchId}`);
  //     console.log(`[BatchPreviewScreen] batchId type: ${typeof batchId}, value: ${batchId}`);
      
  //     // Ensure batchId is a number
  //     const numericBatchId = typeof batchId === 'string' ? parseInt(batchId, 10) : batchId;
  //     console.log(`[BatchPreviewScreen] Converted batchId to: ${numericBatchId} (type: ${typeof numericBatchId})`);
      
  //     // Add a small delay to ensure any background saves are complete
  //     await new Promise(resolve => setTimeout(resolve, 100));
      
  //     const { batch, photos } = await databaseService.getBatchDetails(numericBatchId);
      
  //     console.log(`[BatchPreviewScreen] Database returned ${photos.length} photos for batch ${numericBatchId}`);
  //     console.log(`[BatchPreviewScreen] Batch details:`, batch);
  //     console.log(`[BatchPreviewScreen] Photo details:`, photos.map(p => ({ id: p.id, uri: p.uri, title: p.photoTitle })));
      
  //     if (batch) {
  //       setBatchDetails({
  //         photos: photos,
  //         orderNumber: batch.orderNumber || route.params.identifier || `ORD-${numericBatchId}`,
  //         inventorySessionId: batch.inventoryId,
  //         userId: batch.userId || 'test-user'
  //       });
  //       setCurrentBatch(photos);
        
  //       console.log(`[BatchPreviewScreen] State updated with ${photos.length} photos`);
  //     } else {
  //       console.warn(`[BatchPreviewScreen] No batch found with ID ${numericBatchId}`);
  //       Alert.alert('Error', 'Batch not found');
  //       navigation.goBack();
  //     }
  //   } catch (error) {
  //     console.error('[BatchPreviewScreen] Error fetching batch details:', error);
  //     logErrorToFile('fetchBatchDetails', error instanceof Error ? error : new Error(String(error)));
  //     Alert.alert('Error', 'Failed to load batch details');
  //   } finally {
  //     setIsLoading(false);
  //   }
  // }, [batchId, navigation, route.params.identifier]);
  
  // Effect to load batch data when component mounts
  // useEffect(() => {
  //   fetchBatchDetails();
  // }, [fetchBatchDetails]);

  const handleAnnotatePhoto = (photo: PhotoData) => {
    console.log(`[BatchPreviewScreen] Navigating to Annotate for photo: ${photo.id}`);
    // Navigate to DefectHighlightingScreen, passing the photo
    navigation.navigate('DefectHighlighting', { photo });
  };

  const handleAddMorePhotos = () => {
    console.log(`[BatchPreviewScreen] Navigating back to Photo Capture to add more photos for batch ${batchId}`);
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

  // Handle Salesforce upload
  const handleUploadToSalesforce = async () => {
    if (!currentCompany) {
      Alert.alert('Error', 'No company selected');
      return;
    }

    if (currentBatch.length === 0) {
      Alert.alert('Error', 'No photos to upload');
      return;
    }

    // Prompt user for scanned ID
    Alert.prompt(
      'Upload to Salesforce',
      'Enter the scanned ID (e.g., INV-420, PO-123):',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Upload',
          onPress: async (scannedId) => {
            if (!scannedId?.trim()) {
              Alert.alert('Error', 'Please enter a valid scanned ID');
              return;
            }
            await performSalesforceUpload(scannedId.trim());
          }
        }
      ],
      'plain-text',
      orderNumber || '' // Pre-fill with order number if available
    );
  };

  // Perform the actual Salesforce upload
  const performSalesforceUpload = async (scannedId: string) => {
    try {
      setIsUploadingToSalesforce(true);
      setUploadStatus({ status: 'uploading', scannedId });

      console.log('[BatchPreview] Starting Salesforce upload for:', scannedId);
      console.log(`[BatchPreview] Generating PDF from ${currentBatch.length} photos`);
      
      // Generate PDF from current batch photos
      const pdfResult = await pdfGenerationService.generatePdfFromPhotos(
        currentBatch,
        scannedId,
        {
          title: `${scannedId} - Quality Control Photos`,
          includeMetadata: true
        }
      );

      if (!pdfResult.success) {
        throw new Error(`PDF generation failed: ${pdfResult.error}`);
      }

      console.log(`[BatchPreview] PDF generated successfully with ${pdfResult.photoCount} photos`);

      const result = await salesforceUploadService.uploadPdfByScannedId(
        currentCompany!.id,
        scannedId,
        pdfResult.pdfBase64!
      );

      if (result.success) {
        setUploadStatus({
          status: 'success',
          message: result.message,
          scannedId
        });
        
        Alert.alert(
          'Upload Successful!',
          result.message,
          [{ text: 'OK' }]
        );
        
        // Log analytics event
        logAnalyticsEvent('salesforce_upload_success', {
          batchId,
          scannedId,
          photoCount: currentBatch.length
        });
      } else {
        setUploadStatus({
          status: 'error',
          message: result.message,
          scannedId
        });
        
        Alert.alert(
          'Upload Failed',
          result.message,
          [{ text: 'OK' }]
        );
        
        // Log analytics event
        logAnalyticsEvent('salesforce_upload_error', {
          batchId,
          scannedId,
          error: result.message,
          photoCount: currentBatch.length
        });
      }
    } catch (error) {
      console.error('[BatchPreview] Salesforce upload failed:', error);
      
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      setUploadStatus({
        status: 'error',
        message: errorMessage,
        scannedId
      });
      
      Alert.alert(
        'Upload Error',
        errorMessage,
        [{ text: 'OK' }]
      );
      
      // Log error
      logErrorToFile('salesforce_upload_error', error instanceof Error ? error : new Error(String(error)));
    } finally {
      setIsUploadingToSalesforce(false);
    }
  };

  // Create a simple test PDF in base64 format
  const createTestPdfBase64 = (scannedId: string): string => {
    // This is a minimal PDF file in base64 format
    // In a real app, this would be the merged PDF from photos
    return 'JVBERi0xLjQKMSAwIG9iago8PAovVHlwZSAvQ2F0YWxvZwovUGFnZXMgMiAwIFIKPj4KZW5kb2JqCjIgMCBvYmoKPDwKL1R5cGUgL1BhZ2VzCi9LaWRzIFszIDAgUl0KL0NvdW50IDEKPD4KZW5kb2JqCjMgMCBvYmoKPDwKL1R5cGUgL1BhZ2UKL1BhcmVudCAyIDAgUgovTWVkaWFCb3ggWzAgMCA2MTIgNzkyXQovQ29udGVudHMgNCAwIFIKPj4KZW5kb2JqCjQgMCBvYmoKPDwKL0xlbmd0aCA0NAo+PgpzdHJlYW0KQLQKMC4wNzUgMCAwIDAuMDc1IDAgMCBjbQpCVAovRjEgMTIgVGYKNzIgNzIwIFRkCihUZXN0IFBERikgVGoKRVQKZW5kc3RyZWFtCmVuZG9iago1IDAgb2JqCjw8Ci9UeXBlIC9Gb250Ci9TdWJ0eXBlIC9UeXBlMQovQmFzZUZvbnQgL0hlbHZldGljYQo+PgplbmRvYmoKeHJlZgowIDYKMDAwMDAwMDAwMCA2NTUzNSBmIAowMDAwMDAwMDA5IDAwMDAwIG4gCjAwMDAwMDAwNTggMDAwMDAgbiAKMDAwMDAwMDExNSAwMDAwMCBuIAowMDAwMDAwMjA3IDAwMDAwIG4gCjAwMDAwMDAzMDEgMDAwMDAgbiAKdHJhaWxlcgo8PAovU2l6ZSA2Ci9Sb290IDEgMCBSCj4+CnN0YXJ0eHJlZgozNzAKJSVFT0Y=';
  };

  // Enhanced photo item renderer with modern UI
  const renderPhotoItem = ({ item, index }: { item: PhotoData; index: number }) => {
    const isSelected = selectedPhotos.has(item.id);
    const scale = useRef(new Animated.Value(1)).current;

    const handlePressIn = () => {
      Animated.spring(scale, {
        toValue: 0.95,
        useNativeDriver: true,
      }).start();
    };

    const handlePressOut = () => {
      Animated.spring(scale, {
        toValue: 1,
        useNativeDriver: true,
      }).start();
    };

    const handlePhotoPress = () => {
      if (selectionMode === 'select') {
        togglePhotoSelection(item.id);
      } else {
        // Navigate to full-screen photo view
        navigation.navigate('DefectHighlighting', { photo: item });
      }
    };

    return (
      <Animated.View 
        style={[
          styles.modernPhotoCard,
          isSelected && styles.selectedPhotoCard,
          { transform: [{ scale }] }
        ]}
      >
        <TouchableOpacity
          onPress={handlePhotoPress}
          onPressIn={handlePressIn}
          onPressOut={handlePressOut}
          activeOpacity={0.9}
        >
          <View style={styles.photoContainer}>
            {/* Large Thumbnail */}
            <View style={styles.thumbnailContainer}>
              <Image source={{ uri: item.uri }} style={styles.modernThumbnail} />
              
              {/* Selection Overlay */}
              {selectionMode === 'select' && (
                <View style={styles.selectionOverlay}>
                  <View style={[styles.selectionCheckbox, isSelected && styles.selectedCheckbox]}>
                    {isSelected && (
                      <Ionicons name="checkmark" size={16} color={COLORS.white} />
                    )}
                  </View>
                </View>
              )}
              
              {/* Photo Number Badge */}
              <View style={styles.photoBadge}>
                <Text style={styles.photoBadgeText}>#{index + 1}</Text>
              </View>
            </View>

            {/* Enhanced Photo Info */}
            <View style={styles.modernPhotoInfo}>
                           <Text style={styles.photoTitle}>
               {item.orderNumber || item.inventoryId || `Photo ${index + 1}`}
             </Text>
             <Text style={styles.photoSubtitle}>
               {item.metadata?.timestamp ? new Date(item.metadata.timestamp).toLocaleString() : 'No timestamp'}
             </Text>
             
                            {/* Status Indicators */}
               <View style={styles.statusRow}>
                 {hasDefects(item) && (
                   <View style={styles.modernDefectIndicator}>
                     <Ionicons name="warning" size={12} color={COLORS.warning} />
                     <Text style={styles.defectLabel}>Defect</Text>
                   </View>
                 )}
                 {(() => {
                   const syncInfo = getSyncStatusInfo(item);
                   return (
                     <TouchableOpacity 
                       style={[
                         styles.syncIndicator,
                         syncInfo.status === 'synced' && styles.syncedIndicator,
                         syncInfo.status === 'error' && styles.errorIndicator,
                         styles.tappableSyncIndicator
                       ]}
                       onPress={() => {
                         if (syncInfo.status === 'error' || syncInfo.status === 'pending') {
                           triggerPhotoSync(item);
                         }
                       }}
                       disabled={syncInfo.status === 'synced'}
                     >
                       <Ionicons name={syncInfo.icon} size={12} color={syncInfo.color} />
                       <Text style={[
                         styles.syncLabel,
                         syncInfo.status === 'synced' && styles.syncedLabel,
                         syncInfo.status === 'error' && styles.errorLabel
                       ]}>
                         {syncInfo.label}
                       </Text>
                     </TouchableOpacity>
                   );
                 })()}
               </View>
            </View>

            {/* Modern Action Buttons */}
            {selectionMode === 'none' && (
              <View style={styles.modernPhotoActions}>
                <TouchableOpacity 
                  style={[styles.modernActionButton, styles.editButton]}
                  onPress={() => handleAnnotatePhoto(item)}
                >
                  <Ionicons name="create-outline" size={18} color={COLORS.primary} />
                </TouchableOpacity>
                <TouchableOpacity 
                  style={[styles.modernActionButton, styles.deleteButton]}
                  onPress={() => handleDeletePhoto(item.id)}
                >
                  <Ionicons name="trash-outline" size={18} color={COLORS.error} />
                </TouchableOpacity>
              </View>
            )}
          </View>
        </TouchableOpacity>
      </Animated.View>
    );
  };

  // Grid item renderer for grid view
  const renderGridPhotoItem = ({ item, index }: { item: PhotoData; index: number }) => {
    const isSelected = selectedPhotos.has(item.id);
    
    return (
      <TouchableOpacity
        style={[
          styles.gridPhotoContainer,
          isSelected && styles.selectedGridPhoto
        ]}
        onPress={() => {
          if (selectionMode === 'select') {
            togglePhotoSelection(item.id);
          } else {
            navigation.navigate('DefectHighlighting', { photo: item });
          }
        }}
      >
        <Image source={{ uri: item.uri }} style={styles.gridThumbnail} />
        
        {/* Grid Photo Badge */}
        <View style={styles.gridPhotoBadge}>
          <Text style={styles.gridPhotoBadgeText}>#{index + 1}</Text>
        </View>
        
        {/* Selection Indicator for Grid */}
        {selectionMode === 'select' && (
          <View style={styles.gridSelectionOverlay}>
            <View style={[styles.selectionCheckbox, isSelected && styles.selectedCheckbox]}>
              {isSelected && (
                <Ionicons name="checkmark" size={14} color={COLORS.white} />
              )}
            </View>
          </View>
        )}
        
                          {/* Grid Status Indicators */}
         <View style={styles.gridStatusRow}>
           {hasDefects(item) && (
             <View style={styles.gridStatusBadge}>
               <Ionicons name="warning" size={10} color={COLORS.warning} />
             </View>
           )}
           {(() => {
             const syncInfo = getSyncStatusInfo(item);
             if (syncInfo.status === 'synced') {
               return (
                 <View style={[styles.gridStatusBadge, styles.gridSyncedBadge]}>
                   <Ionicons name="checkmark-circle" size={10} color={COLORS.success} />
                 </View>
               );
             } else if (syncInfo.status === 'error') {
               return (
                 <View style={[styles.gridStatusBadge, styles.gridErrorBadge]}>
                   <Ionicons name="alert-circle" size={10} color={COLORS.error} />
                 </View>
               );
             }
             return null;
           })()}
         </View>
      </TouchableOpacity>
    );
  };

  // Use the currentBatch state that's already defined above
  
  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="dark-content" backgroundColor={COLORS.background} />
      <View style={styles.container}>
        {/* Modern Header with Toolbar */}
        <View style={styles.modernHeader}>
          <View style={styles.headerTop}>
            <View style={styles.headerInfo}>
              <Text style={styles.modernHeaderTitle}>
                Batch Preview
              </Text>
              <Text style={styles.modernSubHeader}>
                {orderNumber ? `Order: ${orderNumber}` : `Inventory Session: ${inventorySessionId || 'Unknown'}`}
              </Text>
            </View>
            
            <View style={styles.headerStats}>
              <View style={styles.statBadge}>
                <Ionicons name="images-outline" size={16} color={COLORS.primary} />
                <Text style={styles.statText}>{currentBatch.length}</Text>
              </View>
              {currentBatch.some(photo => photo.annotations && photo.annotations.length > 0) && (
                <View style={[styles.statBadge, styles.defectStatBadge]}>
                  <Ionicons name="warning-outline" size={16} color={COLORS.warning} />
                  <Text style={styles.defectStatText}>
                    {currentBatch.filter(photo => photo.annotations && photo.annotations.length > 0).length}
                  </Text>
                </View>
              )}
            </View>
          </View>

          {/* Modern Toolbar */}
          <View style={styles.modernToolbar}>
            {/* View Toggle */}
            <View style={styles.viewToggle}>
              <TouchableOpacity
                style={[styles.toggleButton, viewMode === 'list' && styles.activeToggleButton]}
                onPress={() => toggleViewMode()}
              >
                <Ionicons 
                  name="list-outline" 
                  size={20} 
                  color={viewMode === 'list' ? COLORS.white : COLORS.textLight} 
                />
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.toggleButton, viewMode === 'grid' && styles.activeToggleButton]}
                onPress={() => toggleViewMode()}
              >
                <Ionicons 
                  name="grid-outline" 
                  size={20} 
                  color={viewMode === 'grid' ? COLORS.white : COLORS.textLight} 
                />
              </TouchableOpacity>
            </View>

            {/* Selection Mode Toggle */}
            <TouchableOpacity
              style={[styles.selectionToggle, selectionMode === 'select' && styles.activeSelectionToggle]}
              onPress={() => setSelectionMode(selectionMode === 'select' ? 'none' : 'select')}
            >
              <Ionicons 
                name={selectionMode === 'select' ? "checkmark-circle" : "checkmark-circle-outline"} 
                size={20} 
                color={selectionMode === 'select' ? COLORS.white : COLORS.textLight} 
              />
              <Text style={[styles.selectionToggleText, selectionMode === 'select' && styles.activeSelectionText]}>
                Select
              </Text>
            </TouchableOpacity>

            {/* Bulk Actions (when in selection mode) */}
            {selectionMode === 'select' && selectedPhotos.size > 0 && (
              <View style={styles.bulkActions}>
                <TouchableOpacity
                  style={styles.bulkActionButton}
                  onPress={() => handleBulkDelete()}
                >
                  <Ionicons name="trash-outline" size={18} color={COLORS.error} />
                  <Text style={styles.bulkActionText}>Delete ({selectedPhotos.size})</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
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
              renderItem={viewMode === 'list' ? renderPhotoItem : renderGridPhotoItem}
              keyExtractor={(item) => item.id}
              contentContainerStyle={styles.listContentContainer}
              numColumns={viewMode === 'grid' ? 2 : 1}
              key={viewMode} // Force re-render when switching between list/grid
              columnWrapperStyle={viewMode === 'grid' ? styles.gridRow : undefined}
              refreshControl={
                <RefreshControl
                  refreshing={refreshing}
                  onRefresh={handleRefresh}
                  colors={[COLORS.primary]}
                />
              }
            />
        ) : null}

        {/* Modern Footer with Enhanced Buttons */}
        <View style={styles.modernFooter}>
          {/* Primary Action Row */}
          <View style={styles.primaryActionsRow}>
            <TouchableOpacity 
              style={styles.modernAddButton}
              onPress={handleAddMorePhotos}
            >
              <View style={styles.buttonIconContainer}>
                <Ionicons name="camera-outline" size={24} color={COLORS.primary} />
              </View>
              <Text style={styles.modernAddButtonText}>Add Photos</Text>
            </TouchableOpacity>

            <TouchableOpacity 
              style={[
                styles.modernPrimaryButton,
                currentBatch.length === 0 && styles.disabledButton
              ]}
              onPress={handleProceedToPDF}
              disabled={currentBatch.length === 0}
            >
              <View style={styles.buttonIconContainer}>
                <Ionicons 
                  name="document-text-outline" 
                  size={24} 
                  color={currentBatch.length === 0 ? COLORS.grey400 : COLORS.white} 
                />
              </View>
              <Text style={[
                styles.modernPrimaryButtonText,
                currentBatch.length === 0 && styles.disabledButtonText
              ]}>
                Generate PDF
              </Text>
            </TouchableOpacity>
          </View>

          {/* Secondary Action Row */}
          <TouchableOpacity 
            style={[
              styles.modernSalesforceButton,
              currentBatch.length === 0 && styles.disabledButton,
              uploadStatus.status === 'success' && styles.successSalesforceButton,
              uploadStatus.status === 'error' && styles.errorSalesforceButton,
              isUploadingToSalesforce && styles.uploadingSalesforceButton
            ]}
            onPress={handleUploadToSalesforce}
            disabled={currentBatch.length === 0 || isUploadingToSalesforce}
          >
            <View style={styles.salesforceButtonContent}>
              <View style={styles.salesforceIconContainer}>
                {isUploadingToSalesforce ? (
                  <ActivityIndicator size={20} color={COLORS.white} />
                ) : (
                  <Ionicons 
                    name={
                      uploadStatus.status === 'success' ? "checkmark-circle" :
                      uploadStatus.status === 'error' ? "alert-circle" :
                      "cloud-upload-outline"
                    }
                    size={20} 
                    color={
                      currentBatch.length === 0 ? COLORS.grey400 :
                      uploadStatus.status === 'success' ? COLORS.white :
                      uploadStatus.status === 'error' ? COLORS.white :
                      COLORS.white
                    } 
                  />
                )}
              </View>
              <View style={styles.salesforceTextContainer}>
                <Text style={[
                  styles.salesforceButtonText,
                  currentBatch.length === 0 && styles.disabledButtonText
                ]}>
                  {isUploadingToSalesforce ? "Uploading to Salesforce..." : 
                   uploadStatus.status === 'success' ? "✓ Uploaded to Salesforce" :
                   uploadStatus.status === 'error' ? "✗ Upload Failed - Retry" :
                   "Upload to Salesforce"}
                </Text>
                {!isUploadingToSalesforce && uploadStatus.scannedId && (
                  <Text style={styles.salesforceSubtext}>
                    {uploadStatus.status === 'success' ? `Uploaded as: ${uploadStatus.scannedId}` :
                     uploadStatus.status === 'error' ? `Failed: ${uploadStatus.scannedId}` : ''}
                  </Text>
                )}
              </View>
            </View>
          </TouchableOpacity>
        </View>
        
        {/* Upload Status Indicator */}
        {uploadStatus.status !== 'idle' && (
          <View style={styles.statusIndicator}>
            <View style={[
              styles.statusBadge,
              uploadStatus.status === 'uploading' && styles.uploadingBadge,
              uploadStatus.status === 'success' && styles.successBadge,
              uploadStatus.status === 'error' && styles.errorBadge
            ]}>
              <Ionicons 
                name={
                  uploadStatus.status === 'uploading' ? "cloud-upload-outline" :
                  uploadStatus.status === 'success' ? "checkmark-circle" :
                  "alert-circle"
                }
                size={16}
                color={COLORS.white}
              />
              <Text style={styles.statusText}>
                {uploadStatus.status === 'uploading' && `Uploading ${uploadStatus.scannedId}...`}
                {uploadStatus.status === 'success' && `✓ Uploaded ${uploadStatus.scannedId}`}
                {uploadStatus.status === 'error' && `✗ Upload failed: ${uploadStatus.message}`}
              </Text>
            </View>
          </View>
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
  successButton: {
    backgroundColor: COLORS.success,
  },
  errorButton: {
    backgroundColor: COLORS.error,
  },
  statusIndicator: {
    position: 'absolute',
    bottom: 80, // Above footer buttons
    left: SPACING.medium,
    right: SPACING.medium,
    zIndex: 1000,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACING.medium,
    paddingVertical: SPACING.small,
    borderRadius: BORDER_RADIUS.medium,
    ...SHADOWS.small,
  },
  uploadingBadge: {
    backgroundColor: COLORS.primary,
  },
  successBadge: {
    backgroundColor: COLORS.success,
  },
  errorBadge: {
    backgroundColor: COLORS.error,
  },
  statusText: {
    color: COLORS.white,
    fontSize: FONTS.small,
    fontWeight: '500',
    marginLeft: SPACING.small,
    flex: 1,
  },
  // New styles for modern UI
  modernPhotoCard: {
    backgroundColor: COLORS.card,
    borderRadius: BORDER_RADIUS.large,
    marginBottom: SPACING.medium,
    ...SHADOWS.medium,
    overflow: 'hidden', // Ensure content doesn't overflow
  },
  selectedPhotoCard: {
    borderColor: COLORS.primary,
    borderWidth: 2,
  },
  photoContainer: {
    padding: SPACING.large,
  },
  thumbnailContainer: {
    position: 'relative',
    width: '100%',
    height: 200, // Larger thumbnail for list view
    borderRadius: BORDER_RADIUS.medium,
    backgroundColor: COLORS.grey200,
    overflow: 'hidden',
  },
  modernThumbnail: {
    width: '100%',
    height: '100%',
    borderRadius: BORDER_RADIUS.medium,
  },
  selectionOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.5)',
    borderRadius: BORDER_RADIUS.medium,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 1,
  },
  selectionCheckbox: {
    width: 40,
    height: 40,
    borderRadius: BORDER_RADIUS.small,
    backgroundColor: COLORS.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  selectedCheckbox: {
    backgroundColor: COLORS.white,
    borderWidth: 1,
    borderColor: COLORS.primary,
  },
  photoBadge: {
    position: 'absolute',
    top: SPACING.small,
    right: SPACING.small,
    backgroundColor: COLORS.primary + '80',
    borderRadius: BORDER_RADIUS.small,
    paddingHorizontal: SPACING.tiny,
    paddingVertical: SPACING.tiny,
  },
  photoBadgeText: {
    color: COLORS.white,
    fontSize: FONTS.small,
    fontWeight: 'bold',
  },
  modernPhotoInfo: {
    marginTop: SPACING.medium,
    marginBottom: SPACING.small,
  },
  photoTitle: {
    fontSize: FONTS.medium,
    fontWeight: 'bold',
    color: COLORS.text,
    marginBottom: SPACING.tiny,
  },
  photoSubtitle: {
    fontSize: FONTS.small,
    color: COLORS.textLight,
    marginBottom: SPACING.tiny,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  modernDefectIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.warning + '20',
    paddingHorizontal: SPACING.small,
    paddingVertical: SPACING.tiny,
    borderRadius: BORDER_RADIUS.small,
  },
  defectLabel: {
    marginLeft: SPACING.tiny,
    color: COLORS.warning,
    fontSize: FONTS.small,
    fontWeight: '500',
  },
  syncIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.info + '20',
    paddingHorizontal: SPACING.small,
    paddingVertical: SPACING.tiny,
    borderRadius: BORDER_RADIUS.small,
    marginLeft: SPACING.small,
  },
  syncLabel: {
    marginLeft: SPACING.tiny,
    color: COLORS.info,
    fontSize: FONTS.small,
    fontWeight: '500',
  },
  syncedIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.success + '20',
    paddingHorizontal: SPACING.small,
    paddingVertical: SPACING.tiny,
    borderRadius: BORDER_RADIUS.small,
    marginLeft: SPACING.small,
  },
     syncedLabel: {
     marginLeft: SPACING.tiny,
     color: COLORS.success,
     fontSize: FONTS.small,
     fontWeight: '500',
   },
   errorIndicator: {
     backgroundColor: COLORS.error + '20',
   },
   errorLabel: {
     marginLeft: SPACING.tiny,
     color: COLORS.error,
     fontSize: FONTS.small,
     fontWeight: '500',
   },
   tappableSyncIndicator: {
     borderRadius: BORDER_RADIUS.small,
     padding: SPACING.tiny,
     elevation: 1,
     shadowOffset: { width: 0, height: 1 },
     shadowOpacity: 0.1,
     shadowRadius: 2,
   },
  modernPhotoActions: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginTop: SPACING.medium,
  },
  modernActionButton: {
    padding: SPACING.small,
    borderRadius: BORDER_RADIUS.medium,
  },
  editButton: {
    backgroundColor: COLORS.primary + '10',
    borderWidth: 1,
    borderColor: COLORS.primary,
  },
  deleteButton: {
    backgroundColor: COLORS.error + '10',
    borderWidth: 1,
    borderColor: COLORS.error,
  },
  // New styles for grid view
  gridPhotoContainer: {
    position: 'relative',
    width: '48%', // Two columns in a row
    height: 200, // Grid item height
    marginBottom: SPACING.medium,
    borderRadius: BORDER_RADIUS.large,
    backgroundColor: COLORS.card,
    overflow: 'hidden',
    ...SHADOWS.medium,
  },
  selectedGridPhoto: {
    borderColor: COLORS.primary,
    borderWidth: 2,
  },
  gridThumbnail: {
    width: '100%',
    height: '100%',
    borderRadius: BORDER_RADIUS.large,
  },
  gridPhotoBadge: {
    position: 'absolute',
    top: SPACING.small,
    left: SPACING.small,
    backgroundColor: COLORS.primary + '80',
    borderRadius: BORDER_RADIUS.small,
    paddingHorizontal: SPACING.tiny,
    paddingVertical: SPACING.tiny,
  },
  gridPhotoBadgeText: {
    color: COLORS.white,
    fontSize: FONTS.small,
    fontWeight: 'bold',
  },
  gridSelectionOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.5)',
    borderRadius: BORDER_RADIUS.large,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 1,
  },
  gridStatusRow: {
    position: 'absolute',
    bottom: SPACING.small,
    left: SPACING.small,
    flexDirection: 'row',
  },
  gridStatusBadge: {
    backgroundColor: COLORS.warning + '20',
    paddingHorizontal: SPACING.tiny,
    paddingVertical: SPACING.tiny,
    borderRadius: BORDER_RADIUS.small,
  },
     gridSyncedBadge: {
     backgroundColor: COLORS.success + '20',
   },
   gridErrorBadge: {
     backgroundColor: COLORS.error + '20',
   },
   gridRow: {
     justifyContent: 'space-between',
   },
   
   // Modern header styles
   modernHeader: {
     backgroundColor: COLORS.card,
     borderRadius: BORDER_RADIUS.large,
     marginBottom: SPACING.medium,
     padding: SPACING.medium,
     ...SHADOWS.small,
   },
   headerTop: {
     flexDirection: 'row',
     justifyContent: 'space-between',
     alignItems: 'center',
     marginBottom: SPACING.medium,
   },
   headerInfo: {
     flex: 1,
   },
   modernHeaderTitle: {
     fontSize: FONTS.xlarge,
     fontWeight: 'bold',
     color: COLORS.text,
     marginBottom: SPACING.tiny,
   },
   modernSubHeader: {
     fontSize: FONTS.medium,
     color: COLORS.textLight,
   },
   headerStats: {
     flexDirection: 'row',
     alignItems: 'center',
   },
   statBadge: {
     flexDirection: 'row',
     alignItems: 'center',
     backgroundColor: COLORS.primary + '20',
     paddingHorizontal: SPACING.small,
     paddingVertical: SPACING.tiny,
     borderRadius: BORDER_RADIUS.small,
     marginLeft: SPACING.small,
   },
   statText: {
     marginLeft: SPACING.tiny,
     color: COLORS.primary,
     fontSize: FONTS.small,
     fontWeight: 'bold',
   },
   defectStatBadge: {
     backgroundColor: COLORS.warning + '20',
   },
   defectStatText: {
     marginLeft: SPACING.tiny,
     color: COLORS.warning,
     fontSize: FONTS.small,
     fontWeight: 'bold',
   },
   modernToolbar: {
     flexDirection: 'row',
     alignItems: 'center',
     justifyContent: 'space-between',
   },
   viewToggle: {
     flexDirection: 'row',
     backgroundColor: COLORS.grey100,
     borderRadius: BORDER_RADIUS.medium,
     padding: SPACING.tiny,
   },
   toggleButton: {
     paddingHorizontal: SPACING.medium,
     paddingVertical: SPACING.small,
     borderRadius: BORDER_RADIUS.small,
   },
   activeToggleButton: {
     backgroundColor: COLORS.primary,
   },
   selectionToggle: {
     flexDirection: 'row',
     alignItems: 'center',
     paddingHorizontal: SPACING.medium,
     paddingVertical: SPACING.small,
     borderRadius: BORDER_RADIUS.medium,
     backgroundColor: COLORS.grey100,
   },
   activeSelectionToggle: {
     backgroundColor: COLORS.primary,
   },
   selectionToggleText: {
     marginLeft: SPACING.tiny,
     color: COLORS.textLight,
     fontSize: FONTS.small,
     fontWeight: '500',
   },
   activeSelectionText: {
     color: COLORS.white,
   },
   bulkActions: {
     flexDirection: 'row',
   },
   bulkActionButton: {
     flexDirection: 'row',
     alignItems: 'center',
     backgroundColor: COLORS.error + '20',
     paddingHorizontal: SPACING.medium,
     paddingVertical: SPACING.small,
     borderRadius: BORDER_RADIUS.medium,
     borderWidth: 1,
     borderColor: COLORS.error,
   },
   bulkActionText: {
     marginLeft: SPACING.tiny,
     color: COLORS.error,
     fontSize: FONTS.small,
     fontWeight: '500',
   },
   
   // Modern footer styles
   modernFooter: {
     backgroundColor: COLORS.card,
     borderRadius: BORDER_RADIUS.large,
     padding: SPACING.large,
     ...SHADOWS.medium,
   },
   primaryActionsRow: {
     flexDirection: 'row',
     justifyContent: 'space-between',
     marginBottom: SPACING.medium,
   },
   modernAddButton: {
     flex: 1,
     flexDirection: 'row',
     alignItems: 'center',
     justifyContent: 'center',
     backgroundColor: COLORS.primary + '10',
     borderWidth: 2,
     borderColor: COLORS.primary,
     borderRadius: BORDER_RADIUS.medium,
     paddingVertical: SPACING.medium,
     marginRight: SPACING.small,
   },
   modernPrimaryButton: {
     flex: 1,
     flexDirection: 'row',
     alignItems: 'center',
     justifyContent: 'center',
     backgroundColor: COLORS.primary,
     borderRadius: BORDER_RADIUS.medium,
     paddingVertical: SPACING.medium,
     marginLeft: SPACING.small,
   },
   disabledButton: {
     backgroundColor: COLORS.grey200,
     borderColor: COLORS.grey300,
   },
   buttonIconContainer: {
     marginRight: SPACING.small,
   },
   modernAddButtonText: {
     color: COLORS.primary,
     fontSize: FONTS.medium,
     fontWeight: 'bold',
   },
   modernPrimaryButtonText: {
     color: COLORS.white,
     fontSize: FONTS.medium,
     fontWeight: 'bold',
   },
   disabledButtonText: {
     color: COLORS.grey400,
   },
   modernSalesforceButton: {
     backgroundColor: COLORS.secondary,
     borderRadius: BORDER_RADIUS.medium,
     paddingVertical: SPACING.medium,
     paddingHorizontal: SPACING.large,
   },
   successSalesforceButton: {
     backgroundColor: COLORS.success,
   },
   errorSalesforceButton: {
     backgroundColor: COLORS.error,
   },
   uploadingSalesforceButton: {
     backgroundColor: COLORS.info,
   },
   salesforceButtonContent: {
     flexDirection: 'row',
     alignItems: 'center',
     justifyContent: 'center',
   },
   salesforceIconContainer: {
     marginRight: SPACING.medium,
   },
   salesforceTextContainer: {
     alignItems: 'center',
   },
   salesforceButtonText: {
     color: COLORS.white,
     fontSize: FONTS.medium,
     fontWeight: 'bold',
     textAlign: 'center',
   },
   salesforceSubtext: {
     color: COLORS.white + '80',
     fontSize: FONTS.small,
     marginTop: SPACING.tiny,
     textAlign: 'center',
   },
 });

export default BatchPreviewScreen;
