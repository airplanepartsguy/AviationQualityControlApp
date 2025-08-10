import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { 
  View, 
  Text, 
  StyleSheet, 
  TouchableOpacity, 
  Alert,
  SafeAreaView,
  StatusBar,
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  TextInput,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { BatchPreviewScreenProps } from '../types/navigation';
import { PhotoData } from '../types/data';
import CustomButton from '../components/CustomButton';
import BatchPhotoGrid from '../components/BatchPhotoGrid';
import WorkflowProgress from '../components/WorkflowProgress';
import UploadStatusCard from '../components/UploadStatusCard';
import { COLORS, FONTS, SPACING, BORDER_RADIUS, SHADOWS, CARD_STYLES } from '../styles/theme';
import { logAnalyticsEvent, logErrorToFile } from '../services/analyticsService';
import * as databaseService from '../services/databaseService';
import { useAuth } from '../contexts/AuthContext';
import { useCompany } from '../contexts/CompanyContext';
import erpSyncService from '../services/erpSyncService';
import { pdfGenerationService } from '../services/pdfGenerationService';
import * as Sharing from 'expo-sharing';
import * as FileSystem from 'expo-file-system';

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
    referenceId?: string;
    type?: string;
  }>({ 
    photos: [], 
    userId: user?.id || 'unknown'
  });
  
  // UI state
  const [isLoading, setIsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedPhotos, setSelectedPhotos] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  
  // Upload state
  const [isUploadingToSalesforce, setIsUploadingToSalesforce] = useState(false);
  const [isGeneratingPDF, setIsGeneratingPDF] = useState(false);
  const [uploadStatus, setUploadStatus] = useState<{
    status: 'idle' | 'uploading' | 'success' | 'error';
    message?: string;
    scannedId?: string;
  }>({ status: 'idle' });

  // Computed values
  const { photos, orderNumber, inventorySessionId, referenceId, type } = batchDetails;
  const filteredPhotos = useMemo(() => {
    if (!searchQuery.trim()) return photos;
    const query = searchQuery.toLowerCase();
    return photos.filter(photo => 
      photo.photoTitle?.toLowerCase().includes(query) ||
      photo.partNumber?.toLowerCase().includes(query) ||
      photo.id.toLowerCase().includes(query)
    );
  }, [photos, searchQuery]);

  const uploadStats = useMemo(() => {
    const total = photos.length;
    const uploaded = photos.filter(p => p.syncStatus === 'synced').length;
    const failed = photos.filter(p => p.syncStatus === 'error').length;
    const pending = total - uploaded - failed;
    
    return { total, uploaded, failed, pending };
  }, [photos]);

  // Enhanced fetch batch details
  const fetchBatchDetails = useCallback(async () => {
    if (!batchId || !user?.id) {
      console.error('[BatchPreview] Missing batchId or userId');
      setIsLoading(false);
      return;
    }

    try {
      console.log(`[BatchPreview] Fetching batch details for ID: ${batchId}`);
      
      // Get batch photos
      const batchPhotos = await databaseService.getPhotosForBatch(batchId, user.id);
      console.log(`[BatchPreview] Found ${batchPhotos.length} photos`);
      
      // Get batch metadata
      const batchMetadata = await databaseService.getBatchMetadata(batchId);
      
      setBatchDetails({
        photos: batchPhotos,
        orderNumber: batchMetadata?.orderNumber,
        inventorySessionId: batchMetadata?.inventoryId,
        referenceId: batchMetadata?.referenceId,
        type: batchMetadata?.type,
        userId: user.id,
      });

      logAnalyticsEvent('batch_preview_loaded', {
        batchId,
        photoCount: batchPhotos.length,
        hasOrder: !!batchMetadata?.orderNumber,
      });

    } catch (error) {
      console.error('[BatchPreview] Error fetching batch details:', error);
      logErrorToFile('batch_preview_fetch_error', error instanceof Error ? error : new Error(String(error)));
      Alert.alert('Error', 'Failed to load batch details. Please try again.');
    } finally {
      setIsLoading(false);
      setRefreshing(false);
    }
  }, [batchId, user?.id]);

  // Initialize data
  useEffect(() => {
    fetchBatchDetails();
  }, [fetchBatchDetails]);

  // Handlers
  const handleRefresh = useCallback(() => {
    setRefreshing(true);
    fetchBatchDetails();
  }, [fetchBatchDetails]);

  const handlePhotoPress = useCallback((photo: PhotoData) => {
    if (selectionMode) {
      togglePhotoSelection(photo.id);
    } else {
      navigation.navigate('DefectHighlighting', { photo });
    }
  }, [selectionMode, navigation]);

  const handlePhotoDelete = useCallback(async (photoId: string) => {
    Alert.alert(
      'Delete Photo',
      'Are you sure you want to delete this photo? This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await databaseService.deletePhoto(photoId);
              await fetchBatchDetails(); // Refresh the batch
              logAnalyticsEvent('photo_deleted', { photoId, batchId });
            } catch (error) {
              console.error('[BatchPreview] Error deleting photo:', error);
              Alert.alert('Error', 'Failed to delete photo.');
            }
          },
        },
      ]
    );
  }, [batchId, fetchBatchDetails]);

  const handlePhotoAnnotate = useCallback((photo: PhotoData) => {
    navigation.navigate('Annotation', { photo });
  }, [navigation]);

  const togglePhotoSelection = useCallback((photoId: string) => {
    setSelectedPhotos(prev => 
      prev.includes(photoId) 
        ? prev.filter(id => id !== photoId)
        : [...prev, photoId]
    );
  }, []);

  const toggleSelectionMode = useCallback(() => {
    setSelectionMode(!selectionMode);
    setSelectedPhotos([]);
  }, [selectionMode]);

  const handleBulkDelete = useCallback(async () => {
    if (selectedPhotos.length === 0) return;

    Alert.alert(
      'Delete Photos',
      `Are you sure you want to delete ${selectedPhotos.length} photo(s)? This cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              for (const photoId of selectedPhotos) {
                await databaseService.deletePhoto(photoId);
              }
              await fetchBatchDetails();
              setSelectedPhotos([]);
              setSelectionMode(false);
              logAnalyticsEvent('bulk_photos_deleted', { 
                count: selectedPhotos.length, 
                batchId 
              });
            } catch (error) {
              console.error('[BatchPreview] Error during bulk delete:', error);
              Alert.alert('Error', 'Failed to delete some photos.');
            }
          },
        },
      ]
    );
  }, [selectedPhotos, batchId, fetchBatchDetails]);

  const handleAddMorePhotos = useCallback(() => {
    navigation.navigate('PhotoCapture', {
      mode: 'Batch',
      userId: user?.id || '',
      existingBatchId: batchId,
    });
  }, [navigation, user?.id, batchId]);

  const handleGeneratePDF = useCallback(async () => {
    if (photos.length === 0) {
      Alert.alert('No Photos', 'Add some photos before generating a PDF report.');
      return;
    }

    setIsGeneratingPDF(true);
    try {
      // Use the correct method name and signature
      const result = await pdfGenerationService.generatePdfFromPhotos(
        photos,
        referenceId || orderNumber || batchId.toString(), // Use referenceId as scannedId
        {
          title: `${orderNumber ? `Order ${orderNumber}` : `Batch ${batchId}`} - ${currentCompany?.name || 'Quality Report'}`,
          includeMetadata: true,
        }
      );

      if (result.success && result.pdfUri) {
        // Generate a proper filename
        const fileName = `${orderNumber || `Batch_${batchId}`}_${currentCompany?.name || 'Report'}_${new Date().toISOString().split('T')[0]}.pdf`;
        
        // Show options to share the PDF
        Alert.alert(
          'PDF Generated Successfully! 📄',
          `Report created with ${result.photoCount} photos.\n\nWhat would you like to do?`,
          [
            {
              text: 'Share PDF',
              onPress: () => sharePDF(result.pdfUri!, fileName),
              style: 'default',
            },
            {
              text: 'Save & Share',
              onPress: () => saveAndSharePDF(result.pdfUri!, fileName),
              style: 'default',
            },
            {
              text: 'Done',
              style: 'cancel',
            },
          ],
          { cancelable: true }
        );

        logAnalyticsEvent('pdf_generated', { 
          batchId, 
          photoCount: result.photoCount,
          orderNumber,
          referenceId 
        });
      } else {
        Alert.alert('Error', result.error || 'Failed to generate PDF report.');
        logErrorToFile('pdf_generation_error', new Error(result.error || 'Unknown PDF generation error'));
      }
    } catch (error) {
      console.error('[BatchPreview] PDF generation error:', error);
      Alert.alert('Error', 'Failed to generate PDF report.');
      logErrorToFile('pdf_generation_error', error instanceof Error ? error : new Error(String(error)));
    } finally {
      setIsGeneratingPDF(false);
    }
  }, [photos, batchId, orderNumber, referenceId, currentCompany]);

  // Helper function to share PDF directly
  const sharePDF = useCallback(async (pdfUri: string, fileName: string) => {
    try {
      console.log('[BatchPreview] Sharing PDF:', fileName);
      
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(pdfUri, {
          UTI: 'com.adobe.pdf',
          mimeType: 'application/pdf',
          dialogTitle: fileName
        });
        
        logAnalyticsEvent('pdf_shared', { 
          batchId, 
          fileName, 
          shareMethod: 'direct' 
        });
      } else {
        Alert.alert('Sharing Not Available', 'Sharing is not available on this device.');
      }
    } catch (error) {
      console.error('[BatchPreview] Error sharing PDF:', error);
      Alert.alert('Error', 'Failed to share PDF. Please try again.');
    }
  }, [batchId]);

  // Helper function to save PDF with custom name and then share
  const saveAndSharePDF = useCallback(async (pdfUri: string, fileName: string) => {
    try {
      console.log('[BatchPreview] Saving and sharing PDF:', fileName);
      
      // Create a temp directory for the renamed file
      const tempDir = `${FileSystem.cacheDirectory}pdf_temp/`;
      await FileSystem.makeDirectoryAsync(tempDir, { intermediates: true });
      
      // Copy PDF to temp location with proper filename
      const tempPath = `${tempDir}${fileName}`;
      await FileSystem.copyAsync({
        from: pdfUri,
        to: tempPath
      });
      
      // Share the renamed file
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(tempPath, {
          UTI: 'com.adobe.pdf',
          mimeType: 'application/pdf',
          dialogTitle: fileName
        });
        
        logAnalyticsEvent('pdf_shared', { 
          batchId, 
          fileName, 
          shareMethod: 'saved_and_shared' 
        });
      }
      
      // Clean up temp file after a delay
      setTimeout(async () => {
        try {
          await FileSystem.deleteAsync(tempDir, { idempotent: true });
          console.log('[BatchPreview] Cleaned up temp PDF file');
        } catch (cleanupError) {
          console.warn('[BatchPreview] Error cleaning up temp file:', cleanupError);
        }
      }, 10000);
      
    } catch (error) {
      console.error('[BatchPreview] Error saving and sharing PDF:', error);
      Alert.alert('Error', 'Failed to save and share PDF. Please try again.');
    }
  }, [batchId]);

  const handleUploadToSalesforce = useCallback(async () => {
    if (photos.length === 0) {
      Alert.alert('No Photos', 'Add some photos before uploading to Salesforce.');
      return;
    }

    setIsUploadingToSalesforce(true);
    setUploadStatus({ status: 'uploading', message: 'Preparing upload...' });

    try {
      if (!currentCompany?.id) {
        throw new Error('No company selected');
      }

      const result = await erpSyncService.syncBatchToErp(
        batchId.toString(),
        currentCompany.id,
        'salesforce'
      );

      if (!result.success) {
        throw new Error(result.message || 'Upload failed');
      }

      setUploadStatus({
        status: 'success',
        message: result.message || 'Successfully uploaded to Salesforce',
        scannedId: result.recordId,
      });

      await fetchBatchDetails(); // Refresh to get updated sync status
      logAnalyticsEvent('salesforce_upload_success', { batchId, recordId: result.recordId });

    } catch (error) {
      console.error('[BatchPreview] Salesforce upload error:', error);
      setUploadStatus({
        status: 'error',
        message: error instanceof Error ? error.message : 'Upload failed',
      });
      logErrorToFile('salesforce_upload_error', error instanceof Error ? error : new Error(String(error)));
    } finally {
      setIsUploadingToSalesforce(false);
    }
  }, [photos, batchId, orderNumber, referenceId, currentCompany, fetchBatchDetails]);

  // Loading state
  if (isLoading) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={COLORS.primary} />
          <Text style={styles.loadingText}>Loading batch...</Text>
        </View>
      </SafeAreaView>
    );
  }

  // Error boundary for component rendering issues
  try {

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="light-content" backgroundColor={COLORS.primary} />
      
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerContent}>
          <Text style={styles.headerTitle}>
            {referenceId || orderNumber || `Batch #${batchId}`}
          </Text>
          <Text style={styles.headerSubtitle}>
            {photos.length} photo{photos.length !== 1 ? 's' : ''} • {type || 'Unknown'}
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

      <ScrollView 
        style={styles.container}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            colors={[COLORS.primary]}
            tintColor={COLORS.primary}
          />
        }
        showsVerticalScrollIndicator={false}
      >
        {/* Workflow Progress */}
        <WorkflowProgress currentStep={2} compact />
        
        {/* Upload Status Cards */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Upload Status</Text>
          <UploadStatusCard
            title="Supabase Storage"
            status={uploadStats.failed > 0 ? 'error' : uploadStats.pending > 0 ? 'pending' : 'success'}
            count={uploadStats.uploaded}
            subtitle={`${uploadStats.pending} pending • ${uploadStats.failed} failed`}
            lastUpdate={new Date().toLocaleTimeString()}
          />
          <UploadStatusCard
            title="Salesforce"
            status={uploadStatus.status === 'uploading' ? 'uploading' : 
                   uploadStatus.status === 'success' ? 'success' :
                   uploadStatus.status === 'error' ? 'error' : 'pending'}
            count={uploadStatus.status === 'success' ? 1 : 0}
            subtitle={uploadStatus.message || 'Ready to upload'}
            onPress={() => {}}
          />
        </View>

        {/* Search Bar */}
        {photos.length > 3 && (
          <View style={styles.searchContainer}>
            <View style={styles.searchBar}>
              <Ionicons name="search-outline" size={20} color={COLORS.grey500} />
              <TextInput
                style={styles.searchInput}
                placeholder="Search photos..."
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
          </View>
        )}

        {/* Selection Toolbar */}
        {selectionMode && (
          <View style={styles.selectionToolbar}>
            <Text style={styles.selectionCount}>
              {selectedPhotos.length} selected
            </Text>
            <View style={styles.selectionActions}>
              <TouchableOpacity
                style={[styles.toolbarButton, { backgroundColor: COLORS.error }]}
                onPress={handleBulkDelete}
                disabled={selectedPhotos.length === 0}
              >
                <Ionicons name="trash-outline" size={18} color={COLORS.white} />
                <Text style={styles.toolbarButtonText}>Delete</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* Photos Grid */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Photos</Text>
          <BatchPhotoGrid
            photos={filteredPhotos}
            onPhotoPress={handlePhotoPress}
            onPhotoDelete={handlePhotoDelete}
            onPhotoAnnotate={handlePhotoAnnotate}
            selectionMode={selectionMode}
            selectedPhotos={selectedPhotos}
            onPhotoSelect={togglePhotoSelection}
            showUploadStatus={true}
          />
        </View>

        {/* Actions */}
        <View style={styles.actionsContainer}>
          <CustomButton
            title="Add More Photos"
            onPress={handleAddMorePhotos}
            variant="outline"
            icon={<Ionicons name="camera-outline" size={20} />}
            style={styles.actionButton}
          />
          
          <CustomButton
            title="Generate PDF"
            onPress={handleGeneratePDF}
            variant="secondary"
            icon={<Ionicons name="document-text-outline" size={20} />}
            loading={isGeneratingPDF}
            style={styles.actionButton}
          />
          
          <CustomButton
            title="Upload to ERP"
            onPress={handleUploadToSalesforce}
            variant="primary"
            icon={<Ionicons name="cloud-upload-outline" size={20} />}
            loading={isUploadingToSalesforce}
            style={styles.actionButton}
          />
        </View>

        {/* Bottom padding for safe area */}
        <View style={{ height: 100 }} />
      </ScrollView>
    </SafeAreaView>
  );
  } catch (componentError) {
    console.error('[BatchPreview] Component rendering error:', componentError);
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.loadingContainer}>
          <Text style={styles.loadingText}>Error loading batch preview</Text>
          <TouchableOpacity 
            style={{
              backgroundColor: COLORS.primary,
              paddingVertical: SPACING.md,
              paddingHorizontal: SPACING.lg,
              borderRadius: BORDER_RADIUS.medium,
              marginTop: SPACING.md,
            }}
            onPress={() => navigation.goBack()}
          >
            <Text style={styles.actionButtonText}>Go Back</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }
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
  container: {
    flex: 1,
  },
  section: {
    marginHorizontal: SPACING.md,
    marginBottom: SPACING.lg,
  },
  sectionTitle: {
    fontSize: FONTS.large,
    fontWeight: FONTS.bold,
    color: COLORS.text,
    marginBottom: SPACING.md,
  },
  searchContainer: {
    paddingHorizontal: SPACING.md,
    marginBottom: SPACING.md,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    borderRadius: BORDER_RADIUS.md,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    ...SHADOWS.small,
  },
  searchInput: {
    flex: 1,
    marginLeft: SPACING.sm,
    fontSize: FONTS.regular,
    color: COLORS.text,
  },
  selectionToolbar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    backgroundColor: COLORS.primary,
    marginBottom: SPACING.md,
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
  actionsContainer: {
    paddingHorizontal: SPACING.md,
    gap: SPACING.md,
  },
  actionButton: {
    marginBottom: SPACING.sm,
  },
  actionButtonText: {
    color: COLORS.white,
    fontSize: FONTS.medium,
    fontWeight: FONTS.bold,
  },
});

export default BatchPreviewScreen;
