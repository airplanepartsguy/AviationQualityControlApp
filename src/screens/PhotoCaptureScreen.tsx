import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Image, Alert,
  ActivityIndicator, Platform, KeyboardAvoidingView, ScrollView, SafeAreaView, Dimensions, TextInput, Modal, Vibration
} from 'react-native';
import { CameraView, useCameraPermissions, BarcodeScanningResult, CameraCapturedPicture } from 'expo-camera';
import { CameraType } from 'expo-camera/build/Camera.types';
import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';
import * as Location from 'expo-location';
import * as FileSystem from 'expo-file-system';
import { useNavigation, useRoute, useIsFocused } from '@react-navigation/native';
import { PhotoData, PhotoMetadata, PhotoBatch, LocationData } from '../types/data';
import CustomButton from '../components/CustomButton';
import { COLORS, SPACING, FONTS, BORDER_RADIUS, SHADOWS } from '../styles/theme';
import CustomInput from '../components/CustomInput';
import SafeText from '../components/SafeText';
import { Ionicons } from '@expo/vector-icons';
import { logAnalyticsEvent, logErrorToFile } from '../services/analyticsService';
import { useAuth } from '../contexts/AuthContext';
import {
  ensureDbOpen,
  createPhotoBatch,
  savePhoto,
  getBatchDetails,
} from '../services/databaseService';
import { PhotoCaptureScreenNavigationProp, PhotoCaptureScreenRouteProp } from '../types/navigation';
import * as MediaLibrary from 'expo-media-library';
import performanceMonitor from '../utils/performanceMonitor';

const { width: screenWidth, height: screenHeight } = Dimensions.get('window');
// Reduced debounce delay to improve responsiveness while still preventing duplicate scans
const SCAN_DEBOUNCE_DELAY = 300; // 300ms debounce for scans

const PhotoCaptureScreen: React.FC = () => {
  const navigation = useNavigation<PhotoCaptureScreenNavigationProp>();
  const route = useRoute<PhotoCaptureScreenRouteProp>();
  const manualInputRef = useRef<TextInput>(null); // Ref for manual input field
  const isFocused = useIsFocused();

  const [cameraPermission, requestCameraPermission] = useCameraPermissions();
  const [mediaLibraryPermission, requestMediaLibraryPermission] = MediaLibrary.usePermissions();
  const [locationPermission, requestLocationPermission] = Location.useForegroundPermissions();
  const cameraRef = useRef<CameraView>(null);

  const [torch, setTorch] = useState(false);
  const [cameraType, setCameraType] = useState<CameraType>('back'); // Default to back camera
  const [photoBatch, setPhotoBatch] = useState<PhotoData[]>([]);
  const [isLoading, setIsLoading] = useState(false); // General loading state
  const [isCapturing, setIsCapturing] = useState(false); // Specific state for capture process
  const [photoDirectoryCreated, setPhotoDirectoryCreated] = useState(false); // Specific state for capture process
  const [cameraReady, setCameraReady] = useState(false);

  const [identifier, setIdentifier] = useState<string>(''); // Consolidated ID (Order or Inventory)
  const [identifierType, setIdentifierType] = useState<'Order' | 'Inventory' | null>(null); // Type of ID
  const [notes, setNotes] = useState<string>('');
  const { userId: contextUserId } = useAuth(); // Renamed to avoid conflict

  const [isScanningActive, setIsScanningActive] = useState(true); // Start in scanning mode
  const [scannedData, setScannedData] = useState<string | null>(null);
  const [scanFeedback, setScanFeedback] = useState<string>('Scan QR/Barcode or Enter ID');
  const lastScanTime = useRef<number>(0); // For debouncing scans

  const [manualIdentifier, setManualIdentifier] = useState<string>(''); // State for manual input

  const [currentBatch, setCurrentBatch] = useState<PhotoBatch | null>(null); // Store the active batch details
  const [currentMode, setCurrentMode] = useState<'Single' | 'Batch' | 'Inventory'>('Single'); // From route params or default

  // --- NEW State ---
  const [showAnnotationModal, setShowAnnotationModal] = useState(false);
  const [lastCapturedPhoto, setLastCapturedPhoto] = useState<PhotoData | null>(null);

  const [equipmentId, setEquipmentId] = useState<string>('');
  const [componentId, setComponentId] = useState<string>('');
  const [currentBatchId, setCurrentBatchId] = useState<number | null>(null); // Store the ID of the active batch

  // Handle barcode scanning results
  const handleBarCodeScanned = useCallback(({ type, data }: BarcodeScanningResult) => {
    const now = Date.now();
    // Debounce scans to prevent duplicates
    if (now - lastScanTime.current < SCAN_DEBOUNCE_DELAY) {
      return;
    }
    lastScanTime.current = now;
    
    // Only process if scanning is active and we don't have a current batch
    if (!isScanningActive || currentBatch) {
      return;
    }
    
    console.log(`Barcode scanned: ${type} - ${data}`);
    
    // Provide haptic feedback
    if (Platform.OS === 'ios' || Platform.OS === 'android') {
      Vibration.vibrate(100); // Short vibration
    }
    
    // Update UI with scanned data
    setScannedData(data);
    setScanFeedback(`Barcode detected: ${data}`);
    
    // Auto-use the scanned barcode as the identifier
    setManualIdentifier(data);
    
    // Automatically submit the scanned barcode as the ID
    handleScannedIdSubmit(data);
  }, [isScanningActive, currentBatch]);
  
  // Handle automatic submission of scanned ID
  const handleScannedIdSubmit = async (scannedId: string) => {
    if (!contextUserId) {
      Alert.alert('Authentication Error', 'User ID is not available. Please log in again.');
      logErrorToFile('User ID null in handleScannedIdSubmit', new Error('contextUserId is null'));
      return;
    }
    try {
      if (!scannedId.trim()) {
        Alert.alert('Invalid ID', 'Please scan a valid barcode or enter an ID manually.');
        return;
      }
      
      setIsLoading(true);
      setScanFeedback(`Processing ID: ${scannedId}...`);
      
      // Determine ID type - this is a simplified example, adjust based on your ID format
      // For example, if IDs starting with 'INV' are inventory IDs
      const detectedType: 'Order' | 'Inventory' = 
        scannedId.toUpperCase().startsWith('INV') ? 'Inventory' : 'Order';
      
      // Create a new batch with the scanned ID
      const batchId = await createPhotoBatch(
        contextUserId,
        detectedType === 'Order' ? scannedId : undefined,
        detectedType === 'Inventory' ? scannedId : undefined
      );
      
      // Create a PhotoBatch object
      const newBatch: PhotoBatch = {
        id: batchId,
        type: detectedType,
        referenceId: scannedId,
        orderNumber: detectedType === 'Order' ? scannedId : undefined,
        inventoryId: detectedType === 'Inventory' ? scannedId : undefined,
        userId: contextUserId,
        createdAt: new Date().toISOString(),
        status: 'InProgress',
        photos: []
      };
      
      // Update state with the new batch
      setCurrentBatch(newBatch);
      setIdentifier(scannedId);
      setIdentifierType(detectedType);
      setIsScanningActive(false); // Stop scanning once we have an ID
      setScanFeedback(`Ready: ${scannedId}. Capture photos.`);
      
      // Log the event
      logAnalyticsEvent('BatchCreatedFromBarcode', { 
        batchId, 
        identifier: scannedId, 
        type: detectedType 
      });
      
    } catch (error: any) {
      logErrorToFile('Barcode Processing Error', error);
      Alert.alert('Error', `Failed to process barcode: ${error.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  // Memoize the permissions request function to avoid recreating it on each render
  const requestPermissions = useCallback(async () => {
    try {
      const camStatus = await requestCameraPermission();
      const mediaStatus = await requestMediaLibraryPermission();
      const locStatus = await requestLocationPermission();
      if (!camStatus?.granted) Alert.alert('Camera permission denied', 'Camera access is required to take photos and scan barcodes.');
      if (!mediaStatus?.granted) Alert.alert('Media Library permission denied', 'Storage access is required to save photos.');
      // Location is optional, don't block if denied
      if (!locStatus?.granted) console.log('Location permission denied or not requested.');
    } catch (error) {
      logErrorToFile('Permission Request Error', error as Error);
      Alert.alert('Permission Error', 'Failed to request necessary permissions.');
    }
  }, [requestCameraPermission, requestMediaLibraryPermission, requestLocationPermission]);

  useEffect(() => {
    // Request permissions when component mounts
    performanceMonitor.trackPerformance('requestPermissions', async () => {
      await requestPermissions();
    });
  }, [requestPermissions]);

  // Initialize when screen comes into focus
  useEffect(() => {
    const initialize = async () => {
      setIsLoading(true);
      setScanFeedback('Initializing...');
      await ensureDbOpen();
      if (!contextUserId) {
        logErrorToFile('Initialization Error', new Error('User ID missing in context during PhotoCaptureScreen init.'));
        Alert.alert('Authentication Error', 'User session not found. Please log in again.');
        setIsLoading(false);
        // Consider navigating back to login or showing a blocking error
        // navigation.navigate('Login'); // Example if AuthStack exists
        return;
      }

      // Type guard to check which params were passed
      if ('mode' in route.params) {
        // Starting a new batch
        const { mode, orderNumber, inventoryId } = route.params;
        const initialIdentifier = orderNumber ?? inventoryId;
        const initialIdentifierType = orderNumber ? 'Order' : inventoryId ? 'Inventory' : null;

        console.log(`[PhotoCaptureScreen] Initializing in ${mode} mode. Identifier: ${initialIdentifier || 'None'}, User: ${contextUserId}`);
        logAnalyticsEvent('ScreenView_PhotoCapture', { mode, userId: contextUserId, identifier: initialIdentifier });

        setCurrentMode(mode);
        if (initialIdentifier && initialIdentifierType) {
            setIdentifier(initialIdentifier);
            setIdentifierType(initialIdentifierType);
            setIsScanningActive(false); // ID provided, no need to scan initially
            setScanFeedback(`Ready for ${mode}: ${initialIdentifier}. Capture photos.`);
            // Create batch immediately if ID is provided
            try {
                // createPhotoBatch expects (userId, orderNumber?, inventoryId?)
                const batchId = await createPhotoBatch(
                    contextUserId,
                    initialIdentifierType === 'Order' ? initialIdentifier : undefined,
                    initialIdentifierType === 'Inventory' ? initialIdentifier : undefined
                );
                
                // Create a PhotoBatch object from the returned ID
                const newBatch: PhotoBatch = {
                    id: batchId,
                    type: initialIdentifierType,
                    referenceId: initialIdentifier,
                    orderNumber: initialIdentifierType === 'Order' ? initialIdentifier : undefined,
                    inventoryId: initialIdentifierType === 'Inventory' ? initialIdentifier : undefined,
                    userId: contextUserId,
                    createdAt: new Date().toISOString(),
                    status: 'InProgress',
                    photos: []
                };
                
                setCurrentBatch(newBatch);
                setPhotoBatch([]); // Initialize photo array for the new batch
                logAnalyticsEvent('BatchStartedOnNavigation', { batchId: batchId, identifier: initialIdentifier, mode });
            } catch (error: any) {
                logErrorToFile('Batch Creation Error on Init', error);
                Alert.alert('Batch Creation Error', `Failed to create batch: ${error.message}. Please try again or go back.`);
                // Handle error state, maybe disable capture button
            }
        } else {
            // No initial ID provided, enable scanning/manual input
            setIdentifier('');
            setIdentifierType(null);
            setCurrentBatch(null);
            setIsScanningActive(true);
            setScanFeedback('Scan QR/Barcode or Enter ID');
        }

      } else if ('batchId' in route.params) {
        // Resuming an existing batch
        const { batchId } = route.params;
        console.log(`[PhotoCaptureScreen] Resuming batch ID: ${batchId}, User: ${contextUserId}`);
        logAnalyticsEvent('ScreenView_PhotoCapture', { mode: 'Resume', userId: contextUserId, batchId });

        try {
            const existingBatch = await getBatchDetails(batchId);
            if (existingBatch && existingBatch.batch) {
                if (existingBatch.batch.userId !== contextUserId) {
                    throw new Error('Batch belongs to a different user.');
                }
                // Determine mode from batch type (assuming orderNumber means 'Order', etc.)
                const resumedIdentifier = existingBatch.batch.orderNumber ?? existingBatch.batch.inventoryId ?? 'Unknown';
                const resumedIdentifierType = existingBatch.batch.orderNumber ? 'Order' : 'Inventory';

                setCurrentMode('Batch'); // When resuming, mode is typically 'Batch'
                setCurrentBatch(existingBatch.batch);
                setPhotoBatch(existingBatch.photos || []);
                setIdentifier(resumedIdentifier);
                setIdentifierType(resumedIdentifierType);
                setIsScanningActive(false); // Resuming, ID is known
                setScanFeedback(`Resumed Batch ${batchId}: ${resumedIdentifier}. Capture photos.`);
            } else {
                throw new Error(`Batch with ID ${batchId} not found.`);
            }
        } catch (error: any) {
            logErrorToFile('Batch Resume Error', error);
            Alert.alert('Resume Error', `Failed to resume batch ${batchId}: ${error.message}. Starting fresh.`);
            // Fallback to fresh state if resume fails
            setCurrentMode('Batch'); // Default mode
            setIdentifier('');
            setIdentifierType(null);
            setCurrentBatch(null);
            setPhotoBatch([]);
            setIsScanningActive(true);
            setScanFeedback('Scan QR/Barcode or Enter ID');
        }
      } else {
          // Invalid parameters
          logErrorToFile('Initialization Error', new Error('Invalid parameters passed to PhotoCaptureScreen.'));
          Alert.alert('Navigation Error', 'Invalid parameters received. Please go back and try again.');
          // Set a default state or prevent interaction
          setCurrentMode('Batch');
          setIsScanningActive(true);
          setScanFeedback('Error: Invalid state. Please go back.');
      }

      setIsLoading(false);
    };

    if (isFocused && contextUserId) {
      initialize();
    }

    // Cleanup function if needed when screen loses focus
    return () => {
      // console.log('[PhotoCaptureScreen] Screen unfocused');
      // Reset any temporary state if necessary
    };
  }, [isFocused, route.params, contextUserId]); // Depend on focus, route params, and userId

  // --- Optimized Barcode Scanning ---
  // Pre-compute regex patterns for barcode validation
  const orderPattern = useMemo(() => /^ORD/i, []);
  const validBarcodePattern = useMemo(() => /^[A-Z0-9-]{4,}$/i, []); // Basic validation for barcode format
  
  // Optimized barcode detection function with performance monitoring
  const handleBarcodeScanned = useCallback(({ type, data }: BarcodeScanningResult) => {
    // Skip empty data immediately
    if (!data || !isScanningActive || identifier) return;
    
    // Start performance tracking
    const startTime = performance.now();
    
    // Debounce: Only process scan if enough time has passed since the last one
    const now = Date.now();
    if (now - lastScanTime.current < SCAN_DEBOUNCE_DELAY) {
      return;
    }
    
    // Validate barcode format quickly before proceeding
    if (!validBarcodePattern.test(data)) {
      // Invalid format, don't process further
      return;
    }
    
    lastScanTime.current = now;
    
    // Process the barcode data
    setIsScanningActive(false); // Stop scanning once a valid code is found
    setScannedData(data);
    setIdentifier(data); // Set the main identifier
    
    // Use pre-computed regex for faster type detection
    const detectedType = orderPattern.test(data) ? 'Order' : 'Inventory';
    setIdentifierType(detectedType);
    
    // Provide immediate feedback
    setScanFeedback(`ID Detected: ${data}. Ready to capture.`);
    Vibration.vibrate(50); // Short vibration for feedback (50ms)
    
    // Log analytics asynchronously to not block UI
    setTimeout(() => {
      logAnalyticsEvent('BarcodeScanned', { 
        type: type.toString(), 
        data, 
        userId: contextUserId,
        scanTime: performance.now() - startTime
      });
    }, 0);
    
    // If no batch exists yet, create one now that we have an identifier
    if (!currentBatch && contextUserId) {
      // Use the performance monitor for batch creation
      performanceMonitor.trackPerformance('createBatchFromScan', async () => {
        setIsLoading(true);
        try {
          // createPhotoBatch returns a batch ID (number), not a PhotoBatch object
          const batchId = await createPhotoBatch(contextUserId, detectedType === 'Order' ? data : undefined, detectedType === 'Inventory' ? data : undefined);
          
          // Fetch the complete batch details using the ID
          const batchDetails = await getBatchDetails(batchId);
          if (!batchDetails.batch) {
            throw new Error('Failed to retrieve batch after creation');
          }
          
          setCurrentBatch(batchDetails.batch);
          setPhotoBatch([]);
          logAnalyticsEvent('BatchStartedOnScan', { 
            batchId: batchId, 
            identifier: data, 
            mode: currentMode 
          });
        } catch (error: any) {
          logErrorToFile('Batch Creation Error on Scan', error);
          Alert.alert('Batch Creation Error', `Failed to create batch: ${error.message}`);
          // Reset identifier and allow scanning again
          setIdentifier('');
          setIdentifierType(null);
          setIsScanningActive(true);
          setScanFeedback('Error creating batch. Please scan again.');
        } finally {
          setIsLoading(false);
        }
      });
    }
    
    // Log performance
    const endTime = performance.now();
    console.log(`[PERF] Barcode scan processing: ${(endTime - startTime).toFixed(2)}ms`);
  }, [isScanningActive, identifier, currentBatch, currentMode, contextUserId, orderPattern, validBarcodePattern]);

  // --- Manual ID Input ---
   const handleManualIdSubmit = async () => {
        if (manualIdentifier.trim() && !identifier && contextUserId) {
            const manualId = manualIdentifier.trim();
            setIdentifier(manualId);
            const detectedType = manualId.toUpperCase().startsWith('ORD') ? 'Order' : 'Inventory';
            setIdentifierType(detectedType);
            setIsScanningActive(true); // Automatically close the manual input by switching back to scanning mode
            setScanFeedback(`Using Manual ID: ${manualId}. Ready to capture.`);
            logAnalyticsEvent('ManualIdEntered', { data: manualId, userId: contextUserId });
            setManualIdentifier(''); // Clear input field

             // Create batch if none exists
             if (!currentBatch) {
                 setIsLoading(true);
                 try {
                     // createPhotoBatch returns a batch ID (number), not a PhotoBatch object
                     const batchId = await createPhotoBatch(contextUserId, detectedType === 'Order' ? manualId : undefined, detectedType === 'Inventory' ? manualId : undefined);
                     
                     // Fetch the complete batch details using the ID
                     const batchDetails = await getBatchDetails(batchId);
                     if (!batchDetails.batch) {
                       throw new Error('Failed to retrieve batch after creation');
                     }
                     
                     setCurrentBatch(batchDetails.batch);
                     setPhotoBatch([]);
                     logAnalyticsEvent('BatchStartedOnManualID', { batchId: batchId, identifier: manualId, mode: currentMode });
                 } catch (error: any) {
                     logErrorToFile('Batch Creation Error on Manual ID', error);
                     Alert.alert('Batch Creation Error', `Failed to create batch: ${error.message}`);
                     setIdentifier('');
                     setIdentifierType(null);
                     setIsScanningActive(true);
                     setScanFeedback('Error creating batch. Please enter ID again.');
                 } finally {
                     setIsLoading(false);
                 }
             }
        } else if (!manualIdentifier.trim()) {
             Alert.alert("Input Error", "Please enter a valid Order or Inventory ID.");
        } else if (identifier) {
             Alert.alert("Input Error", `Already using ID: ${identifier}. Cannot change mid-batch.`);
        }
   };
   
   // Function to close the manual input panel
   const closeManualInput = () => {
       setIsScanningActive(true);
       setManualIdentifier(''); // Clear the input field when closing
   };

  // --- Photo Capture ---
  const takePicture = async (isDefectPhoto: boolean = false) => {
    if (!cameraRef.current || isCapturing || !identifier || !currentBatch || !contextUserId) {
        if (!identifier) Alert.alert("Missing ID", "Please scan or enter an Order/Inventory ID before taking photos.");
        if (!currentBatch) Alert.alert("Batch Error", "Cannot capture photo, batch not initialized.");
        if (isCapturing) console.log("Capture already in progress");
      return;
    }

    setIsCapturing(true); // Indicate capture process started
    // Show feedback to user
    setScanFeedback(isDefectPhoto ? 'Capturing defect photo...' : 'Capturing photo...');
    
    logAnalyticsEvent('PhotoCaptureStarted', { 
      identifier, 
      mode: currentMode, 
      batchId: currentBatch.id, 
      userId: contextUserId,
      isDefectPhoto
    });

    try {
      // Take photo with reduced quality for faster processing
      const photo = await cameraRef.current.takePictureAsync({
        quality: 0.5, // Reduced quality for faster processing
        base64: false, // Don't need base64 if saving to file
        skipProcessing: true, // Skip default processing
        exif: false, // Skip EXIF data for speed
      });

      if (photo && photo.uri) {
        // 1. Use lighter compression settings for speed
        const compressedImage = await manipulateAsync(
          photo.uri,
          [{ resize: { width: 1200 } }], // Resize to reasonable dimensions
          {
            compress: 0.6, // More compression for faster processing
            format: SaveFormat.JPEG, // Save as JPEG
          }
        );

        // 2. Move to Persistent Storage (optimized)
        const timestampForId = Date.now();
        const photoId = `photo_${timestampForId}_${Math.random().toString(36).substring(2, 9)}`;
        const persistentDirectory = FileSystem.documentDirectory + 'photos/';
        
        // Ensure directory exists (only once per session)
        if (!photoDirectoryCreated) {
          await FileSystem.makeDirectoryAsync(persistentDirectory, { intermediates: true });
          setPhotoDirectoryCreated(true);
        }
        const persistentUri = `${persistentDirectory}${photoId}.jpg`;

        await FileSystem.moveAsync({
            from: compressedImage.uri,
            to: persistentUri,
        });
        console.log(`[PhotoCaptureScreen] Compressed photo moved to: ${persistentUri}`);

        // 3. Prepare Metadata (optimized - get location in background)
        const timestampISO = new Date(timestampForId).toISOString();
        
        // Create metadata without waiting for location
        const metadata: PhotoMetadata = {
          timestamp: timestampISO,
          userId: contextUserId,
          hasDefects: isDefectPhoto,
          defectNotes: notes || undefined
        };
        
        // Start location fetch in background
        if (locationPermission?.granted) {
          // We'll update the database with location later if needed
          Location.getCurrentPositionAsync({ 
            accuracy: Location.Accuracy.Balanced // Use balanced accuracy for speed
          }).then(locationResult => {
            // This runs asynchronously and doesn't block the UI
            if (locationResult) {
              // Could update the photo metadata in database here if needed
              console.log(`[PhotoCaptureScreen] Location obtained for photo ${photoId}`);
            }
          }).catch(locationError => {
            console.warn("Could not get location:", locationError);
            logErrorToFile('Location Error during photo capture', locationError);
          });
        }

        // 4. Construct PhotoData object for saving
        const newPhotoData: PhotoData = {
            id: photoId,
            batchId: currentBatch.id,
            partNumber: identifier, // Use the main identifier as partNumber for now
            uri: persistentUri, // Use the PERSISTENT URI
            metadata: metadata, // Pass the metadata object directly
            annotations: [], // Initialize with empty annotations
            syncStatus: 'pending', // Initial sync status
        };

        // 5. Save Photo Data via Database Service
        await savePhoto(currentBatch.id, newPhotoData);

        // 6. Update State and Proceed
        setPhotoBatch(prev => [...prev, newPhotoData]); // Add new photo data to local state
        setLastCapturedPhoto(newPhotoData); // Store for annotation decision
        setNotes(''); // Clear notes field after capture
        
        logAnalyticsEvent('PhotoCaptureSuccess', { 
          photoId: newPhotoData.id, 
          batchId: currentBatch.id, 
          identifier,
          isDefectPhoto
        });
        
        // Show success feedback to user
        setScanFeedback(isDefectPhoto ? 'Defect photo saved!' : 'Photo saved successfully!');
        // Optional: Vibrate to provide haptic feedback on success
        Vibration.vibrate(100);

        // 7. Decide Next Step based on photo type
        if (isDefectPhoto) {
          // If it's a defect photo, go straight to annotation
          // Pass the current batch context to ensure it's preserved when returning
          navigation.navigate('Annotation', {
            photoId: newPhotoData.id,
            photoUri: newPhotoData.uri,
            batchId: currentBatch.id,
            returnToBatch: true // Flag to indicate we should preserve batch context
          });
        } else {
          // For regular photos, don't show the annotation modal
          // Just continue without interruption
        }
      } else {
        throw new Error("Camera failed to capture photo (URI missing).");
      }
    } catch (error: any) {
      logErrorToFile('Photo Capture/Save Error', error);
      Alert.alert('Capture Error', `Failed to capture or save photo: ${error.message}. Please try again.`);
    } finally {
      setIsCapturing(false); // Indicate capture process finished
    }
  };

  // --- Annotation Modal Logic ---
  const handleAnnotationDecision = (annotate: boolean) => {
    setShowAnnotationModal(false); // Hide the modal
    if (!lastCapturedPhoto) {
        logErrorToFile('Annotation Decision Error', new Error('lastCapturedPhoto is null when making decision.'));
        Alert.alert('Error', 'Cannot proceed with annotation, photo data missing.');
        return;
    }

    if (annotate) {
        // Ensure batch context exists before navigating
        if (!currentBatch) {
            logErrorToFile('Annotation Navigation Error', new Error('currentBatch is null when trying to navigate to AnnotationScreen.'));
            Alert.alert('Error', 'Cannot proceed with annotation, batch context missing.');
            setLastCapturedPhoto(null); // Clear photo ref even on error
            return;
        }
        // User wants to annotate
        logAnalyticsEvent('AnnotationStarted', { photoId: lastCapturedPhoto.id, batchId: currentBatch.id });
        // Navigate to AnnotationScreen, passing the photo ID and URI
        navigation.navigate('Annotation', {
            photoId: lastCapturedPhoto.id,
            photoUri: lastCapturedPhoto.uri,
            batchId: currentBatch.id, // Now guaranteed to exist
        });
    } else {
        // User chose not to annotate this photo
        logAnalyticsEvent('AnnotationSkipped', { photoId: lastCapturedPhoto.id, batchId: currentBatch?.id });
        setScanFeedback('Photo saved. Capture next or finish.'); // Update feedback
    }
    // Clear the last captured photo reference after decision is made
    setLastCapturedPhoto(null);
  };

  // --- Finishing Batch ---
  const handleFinishBatch = () => {
    if (!currentBatch) {
      Alert.alert("Error", "No active batch to finish.");
      return;
    }

    // Log the attempt only if a valid batch exists
    logAnalyticsEvent('batch_finish_attempt', { userId: contextUserId, batchId: currentBatch.id });
    
    // Pass both the batch ID and identifier to ensure proper context is maintained
    navigation.navigate('BatchPreview', { 
      batchId: currentBatch.id,
      identifier: identifier // Pass the identifier to maintain context
    });
  };

  if (!cameraPermission || !mediaLibraryPermission || !locationPermission) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={COLORS.primary} />
        <Text style={styles.loadingText}>Requesting permissions...</Text>
      </View>
    );
  }

  if (!cameraPermission.granted || !mediaLibraryPermission.granted) {
    return (
      <View style={styles.loadingContainer}>
        <Ionicons name="alert-circle-outline" size={60} color={COLORS.error} />
        <Text style={styles.loadingText}>
          { !cameraPermission.granted && !mediaLibraryPermission.granted
            ? 'Camera and Media Library permissions are required.'
            : !cameraPermission.granted
            ? 'Camera permission is required.'
            : 'Media Library permission is required.'
          }
        </Text>
        <Text style={styles.permissionText}>Please grant permissions in your device settings.</Text>
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.cameraContainer}>
        {isFocused ? (
          /* Camera View with Barcode Scanning */
          <CameraView
            ref={cameraRef}
            style={styles.camera}
            facing={cameraType}
            enableTorch={torch}
            onCameraReady={() => setCameraReady(true)}
            barcodeScannerSettings={{
              barcodeTypes: [
                'aztec', 'codabar', 'code39', 'code93', 'code128', 
                'datamatrix', 'ean13', 'ean8', 'pdf417',
                'qr', 'upc_e', 'upc_a'
              ],
            }}
            onBarcodeScanned={isScanningActive ? handleBarCodeScanned : undefined}
          />
        ) : (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={COLORS.secondary} />
            <SafeText style={styles.loadingText}>Initializing Camera...</SafeText>
          </View>
        )}
        {(isLoading || isCapturing) && (
          <View style={styles.overlayContainer}>
            <ActivityIndicator size="large" color={COLORS.white} />
            <SafeText style={styles.overlayText}>{isCapturing ? 'Processing...' : 'Loading...'}</SafeText>
          </View>
        )}
        {currentBatch && (
          <View style={styles.batchInfoContainer}>
            <SafeText style={styles.batchInfoText}>
              Batch: {currentBatch.id} | ID: {identifier || 'N/A'} | Photos: {photoBatch.length}
            </SafeText>
          </View>
        )}
        {isScanningActive ? (
          /* --- Scanning Active UI --- */
          <View style={styles.scanFeedbackContainer}>
            <SafeText style={styles.scanFeedbackText}>{scanFeedback}</SafeText>
            {scannedData && (
              <SafeText style={styles.scannedDataText}>
                {scannedData.length > 20 ? `${scannedData.substring(0, 20)}...` : scannedData}
              </SafeText>
            )}
          </View>
        ) : (
          /* --- Manual Input Active UI --- */
          <View style={styles.manualInputContainer}>
            {/* Close button in top-right corner */}
            <TouchableOpacity 
              style={styles.closeButton} 
              onPress={closeManualInput}
            >
              <Ionicons name="close-circle" size={28} color={COLORS.grey600} />
            </TouchableOpacity>
            
            <CustomInput
              ref={manualInputRef} // Assign ref
              placeholder="Enter Identifier Manually"
              value={manualIdentifier}
              onChangeText={setManualIdentifier}
              style={styles.manualInputField} // Use specific style
              keyboardType="default"
              returnKeyType="done"
              onSubmitEditing={handleManualIdSubmit} // Allow submit via keyboard
            />
            <CustomButton
              title="Submit ID"
              onPress={handleManualIdSubmit}
              variant="primary"
              style={styles.manualSubmitButton} // Use specific style
              disabled={!manualIdentifier.trim()} // Disable if input is empty
            />
            {/* Notes Input (Only show when manual ID is active) */}
            <TextInput
              style={[styles.metadataInput, styles.notesInput]} // Reuse existing styles
              placeholder="Notes (Optional)"
              placeholderTextColor={COLORS.grey400}
              value={notes}
              onChangeText={setNotes}
              multiline
              blurOnSubmit={true} // Dismiss keyboard on submit/blur
            />
          </View>
        )}
      </View>
      {/* Finish Button - Positioned prominently at the top right */}
      <TouchableOpacity 
        onPress={handleFinishBatch} 
        style={[styles.finishButton, { opacity: photoBatch.length > 0 ? 1 : 0.5 }]}
        disabled={photoBatch.length === 0}
      >
        <Ionicons 
          name="checkmark-done-circle" 
          size={30} 
          color={COLORS.white} 
        />
        <SafeText style={styles.finishButtonText}>
          Finish ({photoBatch.length})
        </SafeText>
      </TouchableOpacity>

      {/* --- Controls Container (Positioned Absolutely at Bottom) --- */}
      <View style={styles.controlsContainer}>
        {/* --- Left Side Controls --- */}
        <View style={styles.sideControls}>
          {/* Thumbnail/Gallery Button */}
          <TouchableOpacity style={styles.controlButton} onPress={() => {/* TODO: Gallery */}}>
            <Ionicons name="images" size={28} color={COLORS.white} />
            {photoBatch.length > 0 && (
              <Image
                source={{ uri: photoBatch[photoBatch.length - 1].uri }} // Use 'uri' directly
                style={styles.thumbnailPreview}
              />
            )}
          </TouchableOpacity>

          {/* Scan / Manual Toggle Button */}
          <TouchableOpacity
            style={[styles.controlButton, !isScanningActive && styles.manualActiveButton]} // Highlight when manual is active
            onPress={() => {
              const goingToManual = isScanningActive; // Current state is scanning, will switch to manual
              setIsScanningActive(!isScanningActive); 
              if (goingToManual) {
                // Use timeout to ensure input is rendered before focusing
                setTimeout(() => manualInputRef.current?.focus(), 50);
              }
            }}
          >
            <Ionicons 
              name={isScanningActive ? "keypad-outline" : "barcode-outline"} // Show keypad icon when scanning, barcode when manual
              size={28} 
              color={isScanningActive ? COLORS.white : COLORS.primaryLight} // Highlight color when manual
            />
            <SafeText style={[styles.controlText, { color: isScanningActive ? COLORS.white : COLORS.primaryLight }]}>
              {isScanningActive ? 'Enter ID' : 'Use Scan'}
            </SafeText>
          </TouchableOpacity>
        </View>
        
        {/* Center Controls */}
        <View style={styles.centerControls}>
          {/* Regular Photo Button */}
          <TouchableOpacity
            disabled={!cameraReady || !currentBatch || isCapturing || isLoading} // Disable conditions
            style={[
              styles.captureButton,
              (!cameraReady || !currentBatch || isCapturing || isLoading) && styles.captureButtonDisabled // Apply disabled style
            ]}
            onPress={() => takePicture(false)} // Call with false for regular photo
          >
            {isCapturing ? (
              <ActivityIndicator size="small" color={COLORS.white} />
            ) : (
              <Ionicons name="camera" size={40} color={COLORS.white} />
            )}
          </TouchableOpacity>

          {/* Defect Photo Button */}
          <TouchableOpacity
            disabled={!cameraReady || !currentBatch || isCapturing || isLoading}
            style={[
              styles.defectButton,
              (!cameraReady || !currentBatch || isCapturing || isLoading) && styles.captureButtonDisabled
            ]}
            onPress={() => takePicture(true)} // Call with true for defect photo
          >
            <Ionicons name="warning" size={24} color={COLORS.white} />
            <SafeText style={styles.defectButtonText}>Defect</SafeText>
          </TouchableOpacity>
        </View>
        
        {/* Right Side Controls */}
        <View style={styles.sideControls}>
          <View style={styles.cameraControlButtons}>
            <TouchableOpacity
              onPress={() => {
                console.log("Flash button pressed. Current torch state:", torch, "New state:", !torch);
                setTorch(!torch);
              }}
              style={styles.controlButton}
            >
              <Ionicons
                name={torch ? "flash" : "flash-off"}
                size={28}
                color={torch ? "#FFCC00" : COLORS.white}
              />
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => {
                console.log("Camera flip button pressed");
                setCameraType(prev => prev === 'back' ? 'front' : 'back');
              }}
              style={styles.controlButton}
            >
              <Ionicons name="camera-reverse-outline" size={28} color={COLORS.white} />
            </TouchableOpacity>
          </View>
        </View>
      </View>

      {/* ----- Annotation Decision Modal ----- */}
      <Modal
        animationType="slide"
        transparent={true}
        visible={showAnnotationModal}
        onRequestClose={() => handleAnnotationDecision(false)} // Treat closing as 'No Annotation'
      >
        <View style={styles.modalCenteredView}>
          <View style={styles.modalView}>
            <SafeText style={styles.modalText}>Defect Found?</SafeText>
            <SafeText style={styles.modalSubText}>Do you need to annotate a defect on the photo you just took?</SafeText>
            <View style={styles.modalButtonContainer}>
              <CustomButton
                title="Yes, Annotate Defect"
                onPress={() => handleAnnotationDecision(true)}
                variant="primary"
                style={styles.modalButton}
              />
              <CustomButton
                title="No Defect / Continue"
                onPress={() => handleAnnotationDecision(false)}
                variant="secondary"
                style={styles.modalButton}
              />
            </View>
          </View>
        </View>
      </Modal>

    </SafeAreaView>
  );
};

// Define styles
const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  cameraContainer: {
    flex: 1, // Takes up available space above controls
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: COLORS.black, // Camera background
  },
  camera: {
    // Make camera view fill the container
    ...StyleSheet.absoluteFillObject,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: COLORS.background,
    padding: SPACING.large,
  },
  loadingText: {
    marginTop: SPACING.medium,
    fontSize: FONTS.large,
    color: COLORS.text,
    textAlign: 'center',
    paddingHorizontal: SPACING.large,
  },
  permissionText: {
    marginTop: SPACING.small,
    fontSize: FONTS.medium,
    color: COLORS.grey600,
    textAlign: 'center',
    paddingHorizontal: SPACING.large,
  },
  overlayContainer: {
    ...StyleSheet.absoluteFillObject, // Make overlay cover the parent
    zIndex: 1, // Ensure overlays are on top of camera but below controls
  },
  processingOverlay: { // Renamed from generic 'overlay' for clarity
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  overlayText: {
    color: COLORS.white,
    marginTop: SPACING.small,
    fontSize: FONTS.medium,
    fontWeight: 'bold',
  },
  batchInfoContainer: {
    position: 'absolute',
    top: SPACING.large + (Platform.OS === 'ios' ? 40 : 10), // Position below status bar
    left: SPACING.medium,
    right: SPACING.medium,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    paddingVertical: SPACING.tiny + 2,
    paddingHorizontal: SPACING.medium,
    borderRadius: BORDER_RADIUS.small,
    alignItems: 'center',
  },
  batchInfoText: {
    color: COLORS.white,
    fontSize: FONTS.small,
    fontWeight: 'bold',
  },
  scanFeedbackContainer: {
    position: 'absolute',
    bottom: 80, // Move up slightly to avoid overlap with main controls
    left: SPACING.medium,
    right: SPACING.medium,
    backgroundColor: 'rgba(0, 0, 0, 0.75)', // Slightly darker background
    paddingVertical: SPACING.small + 2, // Increase vertical padding
    paddingHorizontal: SPACING.medium,
    borderRadius: BORDER_RADIUS.medium, // Slightly larger radius
    alignItems: 'center', // Center text horizontally
  },
  scanFeedbackText: {
    color: COLORS.white,
    textAlign: 'center',
    fontSize: FONTS.medium, // Increase font size
    fontWeight: '500',
  },
  scannedDataText: {
    color: COLORS.accent,
    textAlign: 'center',
    fontSize: FONTS.medium,
    fontWeight: 'bold',
    marginTop: SPACING.tiny,
  },
  controlsContainer: {
    position: 'absolute', // Keep controls absolutely positioned
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: SPACING.medium,
    paddingBottom: Platform.OS === 'ios' ? SPACING.large : SPACING.medium, // Adjust padding for notch/home bar
    paddingTop: SPACING.small,
    backgroundColor: COLORS.black,
    borderTopWidth: 1,
    borderTopColor: COLORS.grey800,
    width: '100%',
    zIndex: 2, // Ensure controls are above overlays
  },
  captureButton: {
    width: 70,
    height: 70,
    borderRadius: 35,
    backgroundColor: COLORS.primary,
    justifyContent: 'center',
    alignItems: 'center',
    ...SHADOWS.medium,
    borderWidth: 3,
    borderColor: COLORS.white,
  },
  captureButtonDisabled: {
    opacity: 0.5, // Visual indicator that the button is disabled
  },
  defectButton: {
    backgroundColor: COLORS.error,
    borderRadius: 30,
    padding: 10,
    marginHorizontal: 10,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    height: 50,
  },
  finishButtonText: {
    color: COLORS.white,
    marginLeft: 5,
    fontWeight: 'bold',
  },
  defectButtonText: {
    color: COLORS.white,
    marginLeft: 5,
    fontWeight: 'bold',
  },
  sideControls: {
    // Use flex to push side controls away from center capture button
    flex: 1,
    flexDirection: 'row', // Arrange side-by-side for left group
    justifyContent: 'center', // Center items horizontally
    alignItems: 'center',
  },
  centerControls: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginHorizontal: SPACING.medium,
  },
  controlButton: {
    paddingHorizontal: SPACING.medium, // Add horizontal padding for touch area
    paddingVertical: SPACING.small,
    alignItems: 'center',
    justifyContent: 'center',
  },
  controlText: {
    color: COLORS.white,
    fontSize: FONTS.small,
    marginTop: 4,
  },
  manualActiveButton: {
    // Optional: Add distinct style when manual mode button is active (e.g., background)
    // backgroundColor: COLORS.secondary, 
    // borderRadius: BORDER_RADIUS.medium, 
  },
  scanActiveButton: {
    backgroundColor: COLORS.primaryLight,
    borderRadius: BORDER_RADIUS.medium,
    padding: SPACING.small,
  },
  manualInputContainer: {
    position: 'absolute',
    top: '25%', // Position it somewhere prominent, adjust as needed
    left: SPACING.large,
    right: SPACING.large,
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.9)', // Semi-transparent white background
    padding: SPACING.medium,
    borderRadius: BORDER_RADIUS.medium,
    ...SHADOWS.medium,
  },
  closeButton: {
    position: 'absolute',
    top: 10,
    right: 10,
    zIndex: 10,
  },
  manualInputField: {
    width: '100%', 
    marginBottom: SPACING.medium,
    backgroundColor: COLORS.white, // Ensure solid background for input
  },
  manualSubmitButton: {
    width: '100%',
    marginTop: SPACING.small, // Add space above notes
  },
  metadataInput: {
    backgroundColor: COLORS.white,
    borderColor: COLORS.grey400,
    borderWidth: 1,
    borderRadius: BORDER_RADIUS.small,
    paddingHorizontal: SPACING.medium,
    paddingVertical: SPACING.small,
    fontSize: FONTS.regular,
    color: COLORS.grey800,
    marginBottom: SPACING.small,
    width: '100%', // Ensure it takes container width
  },
  notesInput: {
    minHeight: 60,
    textAlignVertical: 'top',
  },
  modalCenteredView: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 22,
  },
  modalView: {
    margin: 20,
    backgroundColor: 'white',
    borderRadius: 20,
    padding: 35,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 5,
  },
  modalText: {
    marginBottom: 15,
    textAlign: 'center',
    fontSize: FONTS.large, // Make modal text slightly larger
    fontWeight: '600',
  },
  modalSubText: {
    marginBottom: 15,
    textAlign: 'center',
    fontSize: FONTS.small,
  },
  modalButtonContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    width: '100%', // Ensure buttons take full width
  },
  modalButton: {
    flex: 1, // Make buttons share space
    marginHorizontal: SPACING.small,
  },
  thumbnailPreview: {
    width: 35,
    height: 35,
    borderRadius: BORDER_RADIUS.tiny,
    position: 'absolute', // Overlay on the gallery icon
    bottom: 5,
    right: 5,
    borderWidth: 1,
    borderColor: COLORS.white,
  },
  finishButton: {
    position: 'absolute',
    top: 50,
    right: 20,
    backgroundColor: COLORS.accent,
    borderRadius: 30,
    padding: 10,
    flexDirection: 'row',
    alignItems: 'center',
    zIndex: 100,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
  },
  cameraControlButtons: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
  },
});

export default PhotoCaptureScreen;