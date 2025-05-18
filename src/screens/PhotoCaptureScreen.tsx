import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Image, Alert,
  ActivityIndicator, Platform, KeyboardAvoidingView, ScrollView, SafeAreaView, Dimensions, TextInput, Modal
} from 'react-native';
import { CameraView, useCameraPermissions, CameraType, BarcodeScanningResult } from 'expo-camera';
import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';
import * as Location from 'expo-location';
import * as FileSystem from 'expo-file-system';
import { useNavigation, useRoute, useIsFocused } from '@react-navigation/native';
import { PhotoData, PhotoMetadata, PhotoBatch, PhotoBatchData } from '../types/data';
import CustomButton from '../components/CustomButton';
import { COLORS, SPACING, FONTS, BORDER_RADIUS, SHADOWS } from '../styles/theme';
import CustomInput from '../components/CustomInput';
import { Ionicons } from '@expo/vector-icons'; // Added Ionicons import
import { logAnalyticsEvent, logErrorToFile } from '../services/analyticsService';
import { useAuth } from '../contexts/AuthContext';
import {
  ensureDbOpen,
  createPhotoBatch,
  savePhoto,
  getBatchDetails,
} from '../services/databaseService';
import { PhotoCaptureScreenNavigationProp, PhotoCaptureScreenRouteProp } from '../types/navigation';

const { width: screenWidth, height: screenHeight } = Dimensions.get('window');
const SCAN_DEBOUNCE_DELAY = 1000; // 1 second debounce for scans

const PhotoCaptureScreen: React.FC = () => {
  const navigation = useNavigation<PhotoCaptureScreenNavigationProp>();
  const route = useRoute<PhotoCaptureScreenRouteProp>();
  const manualInputRef = useRef<TextInput>(null); // Ref for manual input field
  const isFocused = useIsFocused();

  const [cameraPermission, requestCameraPermission] = useCameraPermissions();
  const [mediaLibraryPermission, requestMediaLibraryPermission] = useMediaLibraryPermissions();
  const [locationPermission, requestLocationPermission] = Location.useForegroundPermissions();
  const cameraRef = useRef<CameraView>(null);

  const [torch, setTorch] = useState(false);
  const [cameraType, setCameraType] = useState<CameraType>('back'); // Default to back camera
  const [photoBatch, setPhotoBatch] = useState<PhotoData[]>([]);
  const [isLoading, setIsLoading] = useState(false); // General loading state
  const [isCapturing, setIsCapturing] = useState(false); // Specific state for capture process
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

  const [currentBatch, setCurrentBatch] = useState<PhotoBatchData | null>(null); // Store the active batch details
  const [currentMode, setCurrentMode] = useState<'Single' | 'Batch' | 'Inventory'>('Single'); // From route params or default

  // --- NEW State ---
  const [showAnnotationModal, setShowAnnotationModal] = useState(false);
  const [lastCapturedPhoto, setLastCapturedPhoto] = useState<PhotoData | null>(null);

  const [equipmentId, setEquipmentId] = useState<string>('');
  const [componentId, setComponentId] = useState<string>('');
  const [currentBatchId, setCurrentBatchId] = useState<number | null>(null); // Store the ID of the active batch

  // Permissions and Initialization
  useEffect(() => {
    const requestPermissions = async () => {
      try {
        const camStatus = await requestCameraPermission();
        const mediaStatus = await requestMediaLibraryPermission();
        const locStatus = await requestLocationPermission();
        if (!camStatus?.granted) Alert.alert('Camera permission denied', 'Camera access is required to take photos and scan barcodes.');
        if (!mediaStatus?.granted) Alert.alert('Media Library permission denied', 'Storage access is required to save photos.');
        // Location is optional, don't block if denied
        if (!locStatus?.granted) console.log('Location permission denied or not requested.');
      } catch (error) {
        logErrorToFile('Permission Request Error', error);
        Alert.alert('Permission Error', 'Failed to request necessary permissions.');
      }
    };
    requestPermissions();
  }, []);

  // Initialize DB, User, Mode, and Batch Logic
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
                const newBatch = await createPhotoBatch(initialIdentifier, initialIdentifierType, mode, contextUserId);
                setCurrentBatch(newBatch);
                setPhotoBatch([]); // Initialize photo array for the new batch
                logAnalyticsEvent('BatchStartedOnNavigation', { batchId: newBatch.id, identifier: initialIdentifier, mode });
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

  // --- Barcode Scanning ---
  const handleBarcodeScanned = useCallback(({ type, data }: BarcodeScanningResult) => {
    const now = Date.now();
    // Debounce: Only process scan if enough time has passed since the last one
    if (now - lastScanTime.current < SCAN_DEBOUNCE_DELAY) {
        return;
    }
    lastScanTime.current = now;

    // Only process if scanning is active and no identifier is set yet
    if (isScanningActive && !identifier && data) {
        setIsScanningActive(false); // Stop scanning once a valid code is found
        setScannedData(data);
        setIdentifier(data); // Set the main identifier
        const detectedType = data.toUpperCase().startsWith('ORD') ? 'Order' : 'Inventory'; // Basic type detection
        setIdentifierType(detectedType);
        setScanFeedback(`ID Detected: ${data}. Ready to capture.`);
        logAnalyticsEvent('BarcodeScanned', { type: type.toString(), data, userId: contextUserId });
        // Vibration.vibrate(); // Provide haptic feedback

        // If no batch exists yet, create one now that we have an identifier
        if (!currentBatch && contextUserId) {
            const createNewBatch = async () => {
                 setIsLoading(true); // Show loading while creating batch
                 try {
                     const newBatch = await createPhotoBatch(data, detectedType, currentMode, contextUserId);
                     setCurrentBatch(newBatch);
                     setPhotoBatch([]); // Start with empty photo array for the new batch
                     logAnalyticsEvent('BatchStartedOnScan', { batchId: newBatch.id, identifier: data, mode: currentMode });
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
            };
            createNewBatch();
        }
    } else if (isScanningActive && identifier) {
        // If scanning is somehow active but we already have an ID, just provide feedback
        setScanFeedback(`Already using ID: ${identifier}. Capture photos.`);
        setIsScanningActive(false); // Ensure scanning stops
    }
  }, [isScanningActive, identifier, currentBatch, currentMode, contextUserId]); // Dependencies for the callback

  // --- Manual ID Input ---
   const handleManualIdSubmit = async () => {
        if (manualIdentifier.trim() && !identifier && contextUserId) {
            const manualId = manualIdentifier.trim();
            setIdentifier(manualId);
            const detectedType = manualId.toUpperCase().startsWith('ORD') ? 'Order' : 'Inventory';
            setIdentifierType(detectedType);
            setIsScanningActive(false);
            setScanFeedback(`Using Manual ID: ${manualId}. Ready to capture.`);
            logAnalyticsEvent('ManualIdEntered', { data: manualId, userId: contextUserId });
            setManualIdentifier(''); // Clear input field

             // Create batch if none exists
             if (!currentBatch) {
                 setIsLoading(true);
                 try {
                     const newBatch = await createPhotoBatch(manualId, detectedType, currentMode, contextUserId);
                     setCurrentBatch(newBatch);
                     setPhotoBatch([]);
                     logAnalyticsEvent('BatchStartedOnManualID', { batchId: newBatch.id, identifier: manualId, mode: currentMode });
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

  // --- Photo Capture ---
  const takePicture = async () => {
    if (!cameraRef.current || isCapturing || !identifier || !currentBatch || !contextUserId) {
        if (!identifier) Alert.alert("Missing ID", "Please scan or enter an Order/Inventory ID before taking photos.");
        if (!currentBatch) Alert.alert("Batch Error", "Cannot capture photo, batch not initialized.");
        if (isCapturing) console.log("Capture already in progress");
      return;
    }

    setIsCapturing(true); // Indicate capture process started
    logAnalyticsEvent('PhotoCaptureStarted', { identifier, mode: currentMode, batchId: currentBatch.id, userId: contextUserId });

    try {
      const photo = await cameraRef.current.takePictureAsync({
        quality: 1, // Take full quality first
        base64: false, // Don't need base64 if saving to file
        skipProcessing: true, // Skip default processing if using ImageManipulator
      });

      if (photo && photo.uri) {
        // 1. Compress Image
        const compressedImage = await manipulateAsync(
          photo.uri,
          [], // No transformations like rotate/flip needed
          {
            compress: 0.8, // Compress to 80% quality
            format: SaveFormat.JPEG, // Save as JPEG
          }
        );

        // 2. Move to Persistent Storage
        const timestampForId = Date.now(); // Use consistent timestamp for ID/filename
        const photoId = `photo_${timestampForId}_${Math.random().toString(36).substring(2, 9)}`;
        const persistentDirectory = FileSystem.documentDirectory + 'photos/';
        // Ensure directory exists
        await FileSystem.makeDirectoryAsync(persistentDirectory, { intermediates: true });
        const persistentUri = `${persistentDirectory}${photoId}.jpg`;

        await FileSystem.moveAsync({
            from: compressedImage.uri, // Move the *compressed* image
            to: persistentUri,
        });
        console.log(`[PhotoCaptureScreen] Compressed photo moved to: ${persistentUri}`);

        // 3. Prepare Metadata
        const timestampISO = new Date(timestampForId).toISOString();
        let locationData: LocationData | null = null; // Use LocationData type
        if (locationPermission?.granted) {
          try {
            // Get current location (consider adding timeout)
            let locationResult = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
            locationData = {
              latitude: locationResult.coords.latitude,
              longitude: locationResult.coords.longitude,
              altitude: locationResult.coords.altitude,
              accuracy: locationResult.coords.accuracy,
              altitudeAccuracy: locationResult.coords.altitudeAccuracy,
              heading: locationResult.coords.heading,
              speed: locationResult.coords.speed,
              timestamp: locationResult.timestamp, // Keep original location timestamp
            };
          } catch (locationError: any) {
            console.warn("Could not get location:", locationError);
            logErrorToFile('Location Error during photo capture', locationError);
          }
        }

        const metadata: PhotoMetadata = {
          identifier: identifier, // Order or Inventory ID
          identifierType: identifierType || 'Unknown',
          timestamp: timestampISO, // Use the ISO timestamp string
          userId: contextUserId,
          location: locationData,
          notes: notes, // Include notes taken *before* this specific photo
          batchId: currentBatch.id,
          mode: currentMode,
          // Initial state for annotation/severity
          annotationPath: null,
          severity: null,
        };

        // 4. Construct PhotoData object for saving
        const newPhotoData: PhotoData = {
            id: photoId,
            batchId: currentBatch.id,
            partNumber: identifier, // Use the main identifier as partNumber for now
            uri: persistentUri, // Use the PERSISTENT URI
            metadata: metadata, // Pass the metadata object directly
            annotations: [], // Initialize with empty annotations
            syncStatus: 'pending', // Initial sync status
            createdAt: timestampISO, // Add createdAt field
        };

        // 5. Save Photo Data via Database Service
        // databaseService.savePhoto expects batchId and PhotoData object
        await savePhoto(currentBatch.id, newPhotoData);

        // 6. Update State and Proceed
        setPhotoBatch(prev => [...prev, newPhotoData]); // Add new photo data to local state
        setLastCapturedPhoto(newPhotoData); // Store for annotation decision
        setNotes(''); // Clear notes field after capture
        logAnalyticsEvent('PhotoCaptureSuccess', { photoId: newPhotoData.id, batchId: currentBatch.id, identifier });

        // 7. Decide Next Step (Annotation or Continue/Finish)
        setShowAnnotationModal(true); // Show modal to ask about annotation

      } else {
          throw new Error("Camera failed to capture photo (URI missing).");
      }
    } catch (error: any) {
      logErrorToFile('Photo Capture/Save Error', error); // Use logErrorToFile
      Alert.alert('Capture Error', `Failed to capture or save photo: ${error.message}. Please try again.`);
      // Optionally add a retry button or mechanism here
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
    navigation.navigate('BatchPreview', { batchId: currentBatch.id });
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
        {/* Camera View or Placeholder */}
        {isFocused ? (
          <CameraView
            ref={cameraRef}
            style={styles.camera}
            facing={cameraType}
            enableTorch={torch}
            onCameraReady={() => setCameraReady(true)}
            onBarcodeScanned={isScanningActive ? handleBarcodeScanned : undefined}
          />
        ) : (
          <View style={styles.loadingContainer}> {/* Re-use loading container style */}
            <ActivityIndicator size="large" color={COLORS.secondary} />
            <Text style={styles.loadingText}>Initializing Camera...</Text> {/* Re-use loading text style */}
          </View>
        )}
        {(isLoading || isCapturing) && (
          <View style={styles.overlayContainer}>
            <ActivityIndicator size="large" color={COLORS.white} />
            <Text style={styles.overlayText}>{isCapturing ? 'Processing...' : 'Loading...'}</Text>
          </View>
        )}
        {currentBatch && (
          <View style={styles.batchInfoContainer}>
            <Text style={styles.batchInfoText}>
              Batch: {currentBatch.id} | ID: {identifier || 'N/A'} | Photos: {photoBatch.length}
            </Text>
          </View>
        )}
        {isScanningActive ? (
          /* --- Scanning Active UI --- */
          <View style={styles.scanFeedbackContainer}>
            <Text style={styles.scanFeedbackText}>{scanFeedback}</Text>
          </View>
        ) : (
          /* --- Manual Input Active UI --- */
          <View style={styles.manualInputContainer}>
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
            <Text style={[styles.controlText, { color: isScanningActive ? COLORS.white : COLORS.primaryLight }]}>
              {isScanningActive ? 'Enter ID' : 'Use Scan'}
            </Text>
          </TouchableOpacity>
        </View>
        <TouchableOpacity onPress={handleFinishBatch} style={styles.controlButton}>
          <Ionicons name="checkmark-done-circle-outline" size={30} color={photoBatch.length > 0 ? COLORS.accent : COLORS.grey600} />
          <Text style={[styles.controlText, { color: photoBatch.length > 0 ? COLORS.accent : COLORS.grey600 }]}>
            Finish ({photoBatch.length})
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          disabled={!cameraReady || !currentBatch || isCapturing || isLoading} // Disable conditions
          style={[
            styles.captureButton,
            (!cameraReady || !currentBatch || isCapturing || isLoading) && styles.captureButtonDisabled // Apply disabled style
          ]}
          onPress={takePicture} // Already checks internally, but disabled prop prevents press
        >
          {isCapturing ? (
            <ActivityIndicator size="small" color={COLORS.white} />
          ) : (
            <Ionicons name="camera" size={40} color={COLORS.white} />
          )}
        </TouchableOpacity>

        <View style={styles.sideControls}>
          <TouchableOpacity
            onPress={() => {
              console.log("Flash button pressed. Current torch state:", torch, "New state:", !torch);
              setTorch(!torch);
            }}
            style={styles.controlButton}
          >
            <Ionicons name={torch ? "flash" : "flash-off"} size={30} color={COLORS.white} />
          </TouchableOpacity>
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
            <Text style={styles.modalText}>Defect Found?</Text>
            <Text style={styles.modalSubText}>Do you need to annotate a defect on the photo you just took?</Text>
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
    backgroundColor: COLORS.grey500, // Use a grey color when disabled
    opacity: 0.6,
  },
  sideControls: {
    // Use flex to push side controls away from center capture button
    flex: 1,
    flexDirection: 'row', // Arrange side-by-side for left group
    justifyContent: 'center', // Center items horizontally
    alignItems: 'center',
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
});

export default PhotoCaptureScreen;
