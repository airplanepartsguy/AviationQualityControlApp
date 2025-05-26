import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Image, Alert,
  ActivityIndicator, Platform, KeyboardAvoidingView, ScrollView, SafeAreaView, Dimensions, TextInput, Modal, Vibration,
  Animated, Easing, LayoutAnimation, UIManager
} from 'react-native';

// Enable LayoutAnimation for Android
if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}
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

const PhotoCaptureScreen = () => {
  const navigation = useNavigation<PhotoCaptureScreenNavigationProp>();
  const route = useRoute<PhotoCaptureScreenRouteProp>();
  const manualInputRef = useRef<TextInput>(null); // Ref for manual input field
  const isFocused = useIsFocused();
  
  // Animation values for scanning and feedback
  const scanLineAnimation = useRef(new Animated.Value(0)).current;
  const successFeedbackOpacity = useRef(new Animated.Value(0)).current;
  const successFeedbackScale = useRef(new Animated.Value(0.8)).current;

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

  const [manualIdInput, setManualIdInput] = useState<string>(''); // State for manual input
  const [showManualInput, setShowManualInput] = useState<boolean>(false); // Control visibility of manual input overlay

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
    setManualIdInput(data);
    
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
    const requestPermissionsAsync = async () => {
      await requestPermissions();
    };
    
    performanceMonitor.trackPerformance('requestPermissions', requestPermissionsAsync);
  }, [requestPermissions]);

  // Define initialization function outside useEffect so it can be shared
  const initializeAsync = useCallback(async () => {
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
            setIsScanningActive(true);
            setIsLoading(false);
            setScanFeedback('Scan QR/Barcode or Enter ID');
        }
      } else {
          // Invalid parameters
          logErrorToFile('Initialization Error', new Error('Invalid parameters passed to PhotoCaptureScreen.'));
          Alert.alert('Navigation Error', 'Invalid parameters received. Please go back and try again.');
          // Set a default state or prevent interaction
          setCurrentMode('Batch');
          setIsScanningActive(true);
          setIsLoading(false);
          setScanFeedback('Error: Invalid state. Please go back.');
      }

      setIsLoading(false);
    }, [contextUserId, route.params, ensureDbOpen, createPhotoBatch, getBatchDetails, logAnalyticsEvent]);  
    
  useEffect(() => {
    // Execute the initialization function when component mounts
    if (isFocused && contextUserId) {
      initializeAsync();
    }
  }, [isFocused, contextUserId, route.params, initializeAsync]); // Add dependencies

  // Start scan line animation - runs continuously when scanning is active with improved animation
  const startScanLineAnimation = useCallback(() => {
    scanLineAnimation.setValue(0);
    // Enhanced animation with better timing and easing for a more professional look
    Animated.loop(
      Animated.timing(scanLineAnimation, {
        toValue: 1,
        duration: 1500, // Faster 1.5 seconds for one complete scan - better for industrial environments
        easing: Easing.bezier(0.4, 0.0, 0.2, 1), // Material Design standard easing
        useNativeDriver: true,
      })
    ).start();
  }, [scanLineAnimation]);

  // Show enhanced success feedback animation with haptic feedback
  const showSuccessFeedback = useCallback(() => {
    // Reset animation values
    successFeedbackOpacity.setValue(0);
    successFeedbackScale.setValue(0.8);
    
    // Add haptic feedback for successful captures - important for industrial environments
    if (Platform.OS === 'ios') {
      Vibration.vibrate([0, 40]); // Short vibration on iOS
    } else {
      // Android needs a pattern
      Vibration.vibrate(40); // Short vibration
    }

    // Run enhanced animations in parallel with spring physics for more natural feel
    Animated.parallel([
      Animated.timing(successFeedbackOpacity, {
        toValue: 1,
        duration: 250, // Faster appearance
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.spring(successFeedbackScale, {
        toValue: 1.2,
        friction: 7, // Less oscillation
        tension: 40, // Quicker spring
        useNativeDriver: true,
      }),
    ]).start(() => {
      // After appearing, fade out with spring physics
      Animated.timing(successFeedbackOpacity, {
        toValue: 0,
        duration: 400,
        delay: 600, // Stay visible slightly longer for better feedback
        easing: Easing.in(Easing.cubic),
        useNativeDriver: true,
      }).start();
    });
  }, [successFeedbackOpacity, successFeedbackScale]);
  
  // Define styles
  const styles = StyleSheet.create({
    safeArea: {
      flex: 1,
      backgroundColor: COLORS.black,
    },
    // Removed scan indicator styles
    scanFrameContainer: {
      width: 280, // Slightly wider for better scanning
      height: 240, // Slightly taller for better scanning
      borderRadius: BORDER_RADIUS.medium,
      overflow: 'hidden',
      alignSelf: 'center',
      marginTop: 20,
      position: 'relative',
      borderWidth: 2,
      borderColor: COLORS.primary,
      // Add subtle pulsing shadow for better visibility
      shadowColor: COLORS.primary,
      shadowOffset: { width: 0, height: 0 },
      shadowOpacity: 0.5,
      shadowRadius: 10,
      elevation: 10,
    },
    scanCorner: {
      position: 'absolute',
      width: 20,
      height: 20,
      borderColor: COLORS.white,
      borderWidth: 3,
    },
    scanCornerTopLeft: {
      top: 0,
      left: 0,
      borderBottomWidth: 0,
      borderRightWidth: 0,
      borderTopLeftRadius: 8,
    },
    scanCornerTopRight: {
      top: 0,
      right: 0,
      borderBottomWidth: 0,
      borderLeftWidth: 0,
      borderTopRightRadius: 8,
    },
    scanCornerBottomLeft: {
      bottom: 0,
      left: 0,
      borderTopWidth: 0,
      borderRightWidth: 0,
      borderBottomLeftRadius: 8,
    },
    scanCornerBottomRight: {
      bottom: 0,
      right: 0,
      borderTopWidth: 0,
      borderLeftWidth: 0,
      borderBottomRightRadius: 8,
    },
    scanLine: {
      height: 2,
      backgroundColor: COLORS.accent,
      width: '100%',
      position: 'absolute',
      left: 0,
      // Add glow effect to scan line
      shadowColor: COLORS.accent,
      shadowOffset: { width: 0, height: 0 },
      shadowOpacity: 0.8,
      shadowRadius: 5,
      elevation: 3,
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
    overlayText: {
      color: COLORS.white,
      marginTop: SPACING.small,
      fontSize: FONTS.medium,
      fontWeight: 'bold',
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
      width: 80, // Larger button for easier tapping in industrial environment
      height: 80, // Larger button for easier tapping in industrial environment
      borderRadius: 40,
      backgroundColor: COLORS.primary,
      justifyContent: 'center',
      alignItems: 'center',
      ...SHADOWS.medium,
      borderWidth: 4,
      borderColor: COLORS.white,
      // Add inner shadow effect for more depth
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.5,
      shadowRadius: 5,
      elevation: 8,
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
    defectButtonText: {
      color: COLORS.white,
      marginLeft: 5,
      fontWeight: 'bold',
  
  // Enhanced success feedback UI component with better visual indicators
  const renderSuccessFeedback = () => {
    return (
      <Animated.View
        style={[
          styles.successFeedback,
          {
            opacity: successFeedbackOpacity,
            transform: [{ scale: successFeedbackScale }],
          },
        ]}
      >
        <View style={styles.successFeedbackInner}>
          <Ionicons name="checkmark-circle" size={80} color={COLORS.success} />
          <Animated.Text 
            style={[styles.successFeedbackText, { opacity: successFeedbackOpacity }]}
          >
            Photo Captured
          </Animated.Text>
        </View>
      </Animated.View>
    );
  };
  
  // Function to take a picture
  const takePicture = useCallback(async (isDefectPhoto: boolean = false) => {
    if (!cameraRef.current || isCapturing || !identifier || !currentBatch || !contextUserId) {
        if (!identifier) Alert.alert("Missing ID", "Please scan or enter an Order/Inventory ID before taking photos.");
        if (!currentBatch) Alert.alert("Batch Error", "Cannot capture photo, batch not initialized.");
        if (isCapturing) console.log("Capture already in progress");
      return;
    }

    setIsCapturing(true); // Indicate capture process started
    // Show feedback to user
    setScanFeedback(isDefectPhoto ? 'Capturing defect photo...' : 'Capturing photo...');
    
    try {
      // Take photo with reduced quality for faster processing
      const photo = await cameraRef.current.takePictureAsync({
        quality: 0.5, // Reduced quality for faster processing
        base64: false, // Don't need base64 if saving to file
        skipProcessing: true, // Skip default processing
        exif: false, // Skip EXIF data for speed
      });

      if (photo && photo.uri) {
        // Show success animation
        showSuccessFeedback();
        
        // Update UI with a more informative message
        setScanFeedback(`Photo ${photoBatch.length + 1} captured successfully${isDefectPhoto ? ' (Defect)' : ''}`);
      }
    } catch (error: any) {
      logErrorToFile('Photo Capture Error', error);
      Alert.alert('Capture Error', `Failed to capture photo: ${error.message}. Please try again.`);
    } finally {
      setIsCapturing(false); // Indicate capture process finished
    }
  }, [cameraRef, isCapturing, identifier, currentBatch, contextUserId, showSuccessFeedback, photoBatch.length]);

  // Check if permissions are granted
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

  // Main component render
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
        
        {/* Success Feedback Animation */}
        {renderSuccessFeedback()}
        
        {/* Removed the floating scan info popup completely */}
            
            {/* Scan Frame with Corner Indicators */}
            <View style={styles.scanFrameContainer}>
              {/* Top Left Corner */}
              <View style={[styles.scanCorner, styles.scanCornerTopLeft]} />
              {/* Top Right Corner */}
              <View style={[styles.scanCorner, styles.scanCornerTopRight]} />
              {/* Bottom Left Corner */}
              <View style={[styles.scanCorner, styles.scanCornerBottomLeft]} />
              {/* Bottom Right Corner */}
              <View style={[styles.scanCorner, styles.scanCornerBottomRight]} />
              
              {/* Animated Scan Line */}
              <Animated.View 
                style={[
                  styles.scanLine,
                  {
                    transform: [{
                      translateY: scanLineAnimation.interpolate({
                        inputRange: [0, 1],
                        outputRange: [0, 240] // Height of scan frame
                      })
                    }]
                  }
                ]}
              />
            </View>
          </View>
        ) : (
          /* --- Manual Input Active UI --- */
          <View style={styles.manualInputContainer}>
            <CustomInput
              ref={manualInputRef}
              placeholder="Enter Identifier Manually"
              value={manualIdInput}
              onChangeText={setManualIdInput}
              style={styles.manualInputField}
              keyboardType="default"
              returnKeyType="done"
            />
          </View>
        )}
      </View>

      {/* --- Controls Container (Positioned Absolutely at Bottom) --- */}
      <View style={styles.controlsContainer}>
        {/* Simplified Control Layout */}
        <View style={styles.controlsRow}>
          {/* Left: Gallery Button */}
          <TouchableOpacity 
            style={styles.iconButton}
            onPress={() => {
              if (currentBatch && photoBatch.length > 0) {
                navigation.navigate('BatchPreview', {
                  batchId: currentBatch.id,
                  identifier: identifier
                });
              } else {
                Alert.alert('No Photos', 'Take some photos first to view them in the gallery.');
              }
            }}
          >
            <Ionicons name="images" size={28} color={COLORS.white} />
          </TouchableOpacity>

          {/* Center: Capture Buttons */}
          <View style={styles.captureButtonsContainer}>
            {/* Regular Photo Button */}
            <TouchableOpacity
              disabled={!cameraReady || !currentBatch || isCapturing || isLoading}
              style={[
                styles.captureButton,
                (!cameraReady || !currentBatch || isCapturing || isLoading) && styles.captureButtonDisabled
              ]}
              onPress={() => takePicture(false)}
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
              onPress={() => takePicture(true)}
            >
              <Ionicons name="warning" size={24} color={COLORS.white} />
              <SafeText style={styles.defectButtonText}>Defect</SafeText>
            </TouchableOpacity>
          </View>

          {/* Right: Flash Toggle */}
          <TouchableOpacity
            onPress={() => setTorch(!torch)}
            style={styles.iconButton}
          >
            <Ionicons
              name={torch ? "flash" : "flash-off"}
              size={28}
              color={torch ? "#FFCC00" : COLORS.white}
            />
          </TouchableOpacity>
        </View>

        {/* Bottom Row with Finish Button */}
        {currentBatch && (
          <TouchableOpacity
            style={[styles.finishButton, photoBatch.length === 0 && styles.finishButtonDisabled]}
            disabled={photoBatch.length === 0}
            onPress={() => {
              if (currentBatch && photoBatch.length > 0) {
                navigation.navigate('BatchPreview', {
                  batchId: currentBatch.id,
                  identifier: identifier
                });
              }
            }}
          >
            <View style={styles.finishButtonContent}>
              <Ionicons name="checkmark-circle" size={24} color={COLORS.white} />
              <SafeText style={styles.finishButtonText}>Finish</SafeText>
            </View>
            <View style={styles.photoCountBadge}>
              <SafeText style={styles.photoCountText}>{photoBatch.length}</SafeText>
            </View>
          </TouchableOpacity>
        )}
            <TouchableOpacity
              onPress={() => setTorch(!torch)}
              style={styles.controlButton}
            >
              <Ionicons
                name={torch ? "flash" : "flash-off"}
                size={28}
                color={torch ? "#FFCC00" : COLORS.white}
              />
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => setCameraType(prev => prev === 'back' ? 'front' : 'back')}
              style={styles.controlButton}
            >
              <Ionicons name="camera-reverse-outline" size={28} color={COLORS.white} />
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </SafeAreaView>
  );
};

export default PhotoCaptureScreen;