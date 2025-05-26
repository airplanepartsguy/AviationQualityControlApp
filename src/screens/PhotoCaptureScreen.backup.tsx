import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Image, Alert,
  ActivityIndicator, Platform, SafeAreaView, Dimensions, TextInput,
  Animated, Easing, Vibration
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { CameraView, useCameraPermissions, BarcodeScanningResult, CameraCapturedPicture } from 'expo-camera';
import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';
import * as Location from 'expo-location';
import * as FileSystem from 'expo-file-system';
import { useNavigation, useRoute, useIsFocused } from '@react-navigation/native';
import { PhotoData, PhotoMetadata, PhotoBatch } from '../types/data';

// Define LocationData interface since it's not in the types file
interface LocationData {
  latitude: number;
  longitude: number;
  accuracy: number;
  timestamp: number;
  altitude: number;
  altitudeAccuracy: number;
  heading: number;
  speed: number;
}
import { COLORS, SPACING, FONTS, BORDER_RADIUS, SHADOWS } from '../styles/theme';
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
import * as Haptics from 'expo-haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

// Constants
const { width: screenWidth, height: screenHeight } = Dimensions.get('window');
const SCAN_DEBOUNCE_DELAY = 300; // 300ms debounce for scans
const SCAN_FRAME_SIZE = Math.min(screenWidth * 0.7, 280); // Responsive scan frame size

// Styles
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.black,
  },
  camera: {
    flex: 1,
  },
  permissionContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: SPACING.large,
  },
  permissionText: {
    fontSize: FONTS.regular,
    fontWeight: FONTS.normal,
    color: COLORS.text,
    textAlign: 'center',
    marginVertical: SPACING.medium,
  },
  permissionButton: {
    backgroundColor: COLORS.primary,
    paddingVertical: SPACING.small,
    paddingHorizontal: SPACING.medium,
    borderRadius: BORDER_RADIUS.small,
    marginTop: SPACING.medium,
  },
  permissionButtonText: {
    fontSize: FONTS.regular,
    fontWeight: FONTS.semiBold,
    color: COLORS.white,
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 10,
  },
  loadingText: {
    fontSize: FONTS.regular,
    fontWeight: FONTS.normal,
    color: COLORS.white,
    marginTop: SPACING.small,
  },
  scanOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
  },
  scanFrameContainer: {
    alignItems: 'center',
  },
  scanFrame: {
    width: SCAN_FRAME_SIZE,
    height: SCAN_FRAME_SIZE,
    borderWidth: 2,
    borderColor: COLORS.white,
    borderRadius: BORDER_RADIUS.small,
    overflow: 'hidden',
  },
  scanLine: {
    height: 2,
    width: '100%',
    backgroundColor: COLORS.primary,
  },
  scanText: {
    fontSize: FONTS.regular,
    fontWeight: FONTS.normal,
    color: COLORS.white,
    marginTop: SPACING.medium,
    textAlign: 'center',
    backgroundColor: 'rgba(0,0,0,0.5)',
    paddingHorizontal: SPACING.medium,
    paddingVertical: SPACING.small,
    borderRadius: BORDER_RADIUS.small,
  },
  topControls: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'space-between',
    padding: SPACING.medium,
  },
  backButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  topRightControls: {
    flexDirection: 'row',
  },
  iconButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: SPACING.small,
  },
  bottomControls: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: SPACING.medium,
  },
  controlsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  controlButton: {
    width: 80,
    height: 80,
    borderRadius: BORDER_RADIUS.medium,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  controlButtonText: {
    fontSize: FONTS.small,
    fontWeight: FONTS.normal,
    color: COLORS.white,
    marginTop: SPACING.tiny,
  },
  captureButton: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: COLORS.primary,
    justifyContent: 'center',
    alignItems: 'center',
    ...SHADOWS.medium,
  },
  captureButtonDisabled: {
    opacity: 0.5,
  },
  captureButtonInner: {
    width: 70,
    height: 70,
    borderRadius: 35,
    borderWidth: 2,
    borderColor: COLORS.white,
    justifyContent: 'center',
    alignItems: 'center',
  },
  captureButtonsContainer: {
    alignItems: 'center',
  },
  defectButton: {
    backgroundColor: COLORS.error,
    paddingVertical: SPACING.small,
    paddingHorizontal: SPACING.medium,
    borderRadius: BORDER_RADIUS.small,
    marginTop: SPACING.small,
    flexDirection: 'row',
    alignItems: 'center',
  },
  defectButtonText: {
    fontSize: FONTS.small,
    fontWeight: FONTS.semiBold,
    color: COLORS.white,
    marginLeft: 5,
  },
  scanningIndicator: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  scanningText: {
    fontSize: FONTS.small,
    fontWeight: FONTS.normal,
    color: COLORS.white,
  },
  manualInputContainer: {
    flexDirection: 'row',
    backgroundColor: 'rgba(0,0,0,0.7)',
    borderRadius: BORDER_RADIUS.small,
    marginBottom: SPACING.medium,
    overflow: 'hidden',
  },
  manualInput: {
    flex: 1,
    height: 50,
    color: COLORS.white,
    fontSize: FONTS.regular,
    fontWeight: FONTS.normal,
    paddingHorizontal: SPACING.medium,
  },
  manualInputButton: {
    width: 50,
    height: 50,
    backgroundColor: COLORS.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  batchInfoContainer: {
    backgroundColor: 'rgba(0,0,0,0.7)',
    borderRadius: BORDER_RADIUS.small,
    padding: SPACING.medium,
    marginBottom: SPACING.medium,
  },
  batchInfoText: {
    fontSize: FONTS.regular,
    fontWeight: FONTS.normal,
    color: COLORS.white,
  },
  photoCountText: {
    fontSize: FONTS.small,
    fontWeight: FONTS.normal,
    color: COLORS.white,
    marginTop: SPACING.tiny,
  },
  finishButton: {
    flexDirection: 'row',
    backgroundColor: COLORS.success,
    borderRadius: BORDER_RADIUS.small,
    padding: SPACING.medium,
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: SPACING.medium,
    ...SHADOWS.small,
  },
  finishButtonDisabled: {
    opacity: 0.5,
  },
  finishButtonText: {
    fontSize: FONTS.regular,
    fontWeight: FONTS.semiBold,
    color: COLORS.white,
    marginRight: SPACING.small,
  },
  finishButtonContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  photoCountBadge: {
    backgroundColor: COLORS.white,
    borderRadius: 12,
    width: 24,
    height: 24,
    justifyContent: 'center',
    alignItems: 'center',
  },
  successFeedback: {
    position: 'absolute',
    top: '50%',
    left: '50%',
    width: 200,
    marginLeft: -100,
    marginTop: -50,
    alignItems: 'center',
    justifyContent: 'center',
  },
  successFeedbackInner: {
    backgroundColor: 'rgba(0,0,0,0.8)',
    borderRadius: BORDER_RADIUS.medium,
    padding: SPACING.medium,
    alignItems: 'center',
    justifyContent: 'center',
    ...SHADOWS.medium,
  },
  successFeedbackText: {
    fontSize: FONTS.regular,
    fontWeight: FONTS.normal,
    color: COLORS.white,
    textAlign: 'center',
    marginTop: SPACING.small,
  },
  safeArea: {
    flex: 1,
    backgroundColor: COLORS.black,
  },
  cameraContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: COLORS.black,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: COLORS.black,
    padding: SPACING.large,
  },
  overlayContainer: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 1,
  },
  overlayText: {
    color: COLORS.white,
    fontSize: FONTS.regular,
    fontWeight: 'bold',
  },
  controlsContainer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: SPACING.medium,
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: SPACING.medium,
    paddingBottom: Platform.OS === 'ios' ? SPACING.large : SPACING.medium,
    paddingTop: SPACING.small,
    backgroundColor: COLORS.black,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.1)',
    width: '100%',
    zIndex: 2,
  }
});

/**
 * PhotoCaptureScreen Component
 * 
 * A streamlined camera interface for industrial quality control photography
 * Optimized for high-volume workflows in shipping & receiving environments
 */
const PhotoCaptureScreen: React.FC = () => {
  const navigation = useNavigation<PhotoCaptureScreenNavigationProp>();
  const route = useRoute<PhotoCaptureScreenRouteProp>();
  const isFocused = useIsFocused();
  const insets = useSafeAreaInsets();
  const { userId } = useAuth();
  
  // Refs
  const cameraRef = useRef<CameraView>(null);
  const manualInputRef = useRef<TextInput>(null);
  const lastScanTime = useRef<number>(0); // For debouncing scans
  
  // Permissions
  const [cameraPermissionInfo, requestCameraPermission] = useCameraPermissions();
  const [mediaLibraryPermissionInfo, requestMediaLibraryPermission] = MediaLibrary.usePermissions();
  const [locationPermissionInfo, requestLocationPermission] = Location.useForegroundPermissions();
  
  // Camera state
  const [torch, setTorch] = useState(false);
  const [cameraType, setCameraType] = useState('back');
  const [cameraReady, setCameraReady] = useState(false);
  const [isCapturing, setIsCapturing] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isCameraInitialized, setIsCameraInitialized] = useState(false);
  
  // Batch and photo state
  const [photoBatch, setPhotoBatch] = useState<PhotoData[]>([]);
  const [currentBatch, setCurrentBatch] = useState<PhotoBatch | null>(null);
  const [identifier, setIdentifier] = useState<string>('');
  const [identifierType, setIdentifierType] = useState<'Order' | 'Inventory' | null>(null);
  
  // Scanning state
  const [isScanningActive, setIsScanningActive] = useState(true);
  const [scannedData, setScannedData] = useState<string | null>(null);
  const [scanFeedback, setScanFeedback] = useState<string>('Scan barcode or QR code');
  
  // UI state
  const [showManualInput, setShowManualInput] = useState(false);
  const [manualIdInput, setManualIdInput] = useState('');
  const [showFeedback, setShowFeedback] = useState(false);
  const [feedbackMessage, setFeedbackMessage] = useState('');
  
  // Animation values
  const scanLineAnimation = useRef(new Animated.Value(0)).current;
  const feedbackOpacity = useRef(new Animated.Value(0)).current;
  const successFeedbackOpacity = useRef(new Animated.Value(0)).current;
  const successFeedbackScale = useRef(new Animated.Value(0.3)).current;

  // Request permissions when component mounts
  useEffect(() => {
    const requestPermissions = async () => {
      await requestCameraPermission();
      await requestMediaLibraryPermission();
      await requestLocationPermission();
      // Initialize camera after permissions are granted
      setIsCameraInitialized(true);
    };
    
    requestPermissions();
  }, [requestCameraPermission, requestMediaLibraryPermission, requestLocationPermission]);

  // Start scan animation when component mounts or when isFocused changes
  useEffect(() => {
    if (isFocused) {
      startScanAnimation();
    }
    return () => {
      // Clean up animations
      scanLineAnimation.stopAnimation();
    };
  }, [isFocused, scanLineAnimation]);

  // Handle route params when screen is focused
  useEffect(() => {
    if (isFocused && route.params) {
      if ('batchId' in route.params && route.params.batchId) {
        loadExistingBatch(route.params.batchId.toString());
      } else if ('identifier' in route.params && route.params.identifier && 'identifierType' in route.params) {
        setIdentifier(route.params.identifier);
        setIdentifierType((route.params.identifierType as 'Order' | 'Inventory') || 'Inventory');
        setIsScanningActive(false);
        setScanFeedback(`Using ${route.params.identifierType || 'Inventory'}: ${route.params.identifier}`);
      }
    }
  }, [isFocused, route.params]);

  // Start scan line animation
  const startScanAnimation = useCallback(() => {
    scanLineAnimation.setValue(0);
    Animated.loop(
      Animated.timing(scanLineAnimation, {
        toValue: 1,
        duration: 2000,
        easing: Easing.linear,
        useNativeDriver: true,
      })
    ).start();
  }, [scanLineAnimation]);

  // Show success feedback animation
  const showSuccessFeedback = useCallback((message: string) => {
    successFeedbackOpacity.setValue(0);
    successFeedbackScale.setValue(0.3);
    setFeedbackMessage(message);
    
    Animated.sequence([
      Animated.parallel([
        Animated.timing(successFeedbackOpacity, {
          toValue: 1,
          duration: 300,
          useNativeDriver: true,
        }),
        Animated.timing(successFeedbackScale, {
          toValue: 1,
          duration: 300,
          useNativeDriver: true,
        }),
      ]),
      Animated.delay(1500),
      Animated.timing(successFeedbackOpacity, {
        toValue: 0,
        duration: 300,
        useNativeDriver: true,
      }),
    ]).start();
    
    // Provide haptic feedback
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    Vibration.vibrate(100);
  }, [successFeedbackOpacity, successFeedbackScale]);

  // Load existing batch by ID
  const loadExistingBatch = async (batchId: string) => {
    try {
      setIsLoading(true);
      setScanFeedback('Loading batch...');
      
      await ensureDbOpen();
      const batchDetails = await getBatchDetails(Number(batchId));
      
      if (batchDetails && batchDetails.batch) {
        setCurrentBatch(batchDetails.batch);
        const identifier = batchDetails.batch.referenceId || '';
        const identifierType = batchDetails.batch.type || 'Inventory';
        setIdentifier(identifier);
        setIdentifierType(identifierType);
        setIsScanningActive(false);
        setScanFeedback(`Using ${identifierType}: ${identifier}`);
        showSuccessFeedback(`Loaded batch: ${identifier}`);
      } else {
        Alert.alert('Error', 'Could not find the specified batch.');
      }
    } catch (error) {
      console.error('Error loading batch:', error);
      Alert.alert('Error', 'Failed to load batch. Please try again.');
      logErrorToFile('loadExistingBatch', error instanceof Error ? error : new Error(String(error)));
    } finally {
      setIsLoading(false);
    }
  };

  // Handle barcode scanning
  const handleBarCodeScanned = useCallback(({ type, data }: { type: string; data: string }) => {
    const currentTime = Date.now();
    
    // Debounce scans
    if (currentTime - lastScanTime.current < SCAN_DEBOUNCE_DELAY) {
      return;
    }
    
    lastScanTime.current = currentTime;
    
    if (isScanningActive && !currentBatch) {
      setScannedData(data);
      setScanFeedback(`Scanned: ${data}`);
      setShowFeedback(true);
      setScanFeedback(`Processing: ${data}`);
      
      // Provide haptic feedback
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      
      // Handle the scanned ID
      handleScannedIdSubmit(data);
    }
  }, [isScanningActive, currentBatch]);

  // Handle manual ID input submission
  const handleManualIdSubmit = useCallback(() => {
    if (manualIdInput.trim()) {
      setShowManualInput(false);
      handleScannedIdSubmit(manualIdInput.trim());
      setManualIdInput('');
    }
  }, [manualIdInput]);

  // Handle scanned ID submission
  const handleScannedIdSubmit = async (scannedId: string) => {
    if (!scannedId || isLoading) return;
    
    try {
      setIsLoading(true);
      setScanFeedback(`Creating batch for: ${scannedId}`);
      
      // Determine identifier type (could be enhanced with regex patterns)
      const detectedType: 'Order' | 'Inventory' = 
        scannedId.startsWith('O-') || scannedId.startsWith('ORD') ? 'Order' : 'Inventory';
      
      await ensureDbOpen();
      
      // Create batch in the database
      const batchId = await createPhotoBatch(
        userId || 'unknown',
        detectedType === 'Order' ? scannedId : undefined,
        detectedType === 'Inventory' ? scannedId : undefined
      );
      
      if (batchId) {
        const batchDetails = await getBatchDetails(batchId);
        
        if (batchDetails && batchDetails.batch) {
          setCurrentBatch(batchDetails.batch);
          setPhotoBatch([]);
          setIdentifier(scannedId);
          setIdentifierType(detectedType);
          setIsScanningActive(false);
          setScanFeedback(`Using ${detectedType}: ${scannedId}`);
          showSuccessFeedback(`Created batch: ${scannedId}`);
        }
      } else {
        throw new Error('Failed to create batch');
      }
    } catch (error) {
      setIsScanningActive(true);
      setScanFeedback('Error creating batch. Try again.');
      console.error('Error creating batch:', error);
      Alert.alert('Error', 'Failed to create batch. Please try again.');
      logErrorToFile('handleScannedIdSubmit', error instanceof Error ? error : new Error(String(error)));
    } finally {
      setIsLoading(false);
    }
  };

  // Take a picture using the camera
  const takePicture = async (isDefect: boolean = false) => {
    if (!cameraRef.current || isCapturing || !identifier || !currentBatch) {
      return;
    }
    
    try {
      setIsCapturing(true);
      setScanFeedback('Capturing photo...');
      
      // Capture the photo
      const photo = await cameraRef.current.takePictureAsync({
        quality: 0.8,
        skipProcessing: false,
      });
      
      if (!photo) {
        throw new Error('Failed to capture photo');
      }
      
      // Provide haptic feedback
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      
      // Process and save the photo
      await processAndSavePhoto(photo, isDefect);
      
      // Update feedback
      setScanFeedback(`Photo ${photoBatch.length + 1} captured`);
      showSuccessFeedback('Photo captured');
      
    } catch (error) {
      console.error('Error taking picture:', error);
      Alert.alert('Error', 'Failed to capture photo. Please try again.');
      logErrorToFile('takePicture', error instanceof Error ? error : new Error(String(error)));
    } finally {
      setIsCapturing(false);
    }
  };

  // Process and save the captured photo
  const processAndSavePhoto = async (photo: CameraCapturedPicture, isDefect: boolean) => {
    if (!cameraRef.current || !identifier || !currentBatch) return;
    
    try {
      // Get current location if permission is granted
      let location: LocationData | null = null;
      
      if (locationPermissionInfo?.granted) {
        const locationResult = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Highest,
        });
        
        location = {
          latitude: locationResult.coords.latitude,
          longitude: locationResult.coords.longitude,
          accuracy: locationResult.coords.accuracy || 0,
          timestamp: locationResult.timestamp,
          altitude: locationResult.coords.altitude || 0,
          altitudeAccuracy: locationResult.coords.altitudeAccuracy || 0,
          heading: locationResult.coords.heading || 0,
          speed: locationResult.coords.speed || 0
        };
      }
      
      // Compress the image
      const compressedPhoto = await manipulateAsync(
        photo.uri,
        [{ resize: { width: 1200 } }],
        { compress: 0.8, format: SaveFormat.JPEG }
      );
      
      // Create photo metadata
      const metadata: PhotoMetadata = {
        timestamp: new Date().toISOString(),
        userId: userId || 'unknown',
        latitude: location?.latitude,
        longitude: location?.longitude,
        deviceModel: Platform.OS === 'ios' ? 'iOS Device' : 'Android Device',
        hasDefects: isDefect,
        defectSeverity: isDefect ? 'moderate' : undefined,
      };
      
      // Save to media library if permission is granted
      if (mediaLibraryPermissionInfo?.granted) {
        await MediaLibrary.saveToLibraryAsync(compressedPhoto.uri);
      }
      
      // Save photo to database
      if (currentBatch) {
        const photoData: PhotoData = {
          id: `photo_${Date.now()}`,
          batchId: currentBatch.id,
          uri: compressedPhoto.uri,
          metadata,
          syncStatus: 'pending',
        };
        
        // Save to database
        await savePhoto(currentBatch.id, photoData);
        
        // Update local state
        setPhotoBatch(prev => [...prev, photoData]);
      }
      
    } catch (error) {
      console.error('Error processing photo:', error);
      logErrorToFile('processAndSavePhoto', error instanceof Error ? error : new Error(String(error)));
      throw error;
    }
  };

  // Reset the current batch and return to scanning mode
  const resetBatch = useCallback(() => {
    if (photoBatch.length > 0) {
      Alert.alert(
        'Discard Batch?',
        'Are you sure you want to discard the current batch and start over?',
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Discard',
            style: 'destructive',
            onPress: () => {
              setCurrentBatch(null);
              setPhotoBatch([]);
              setIdentifier('');
              setIdentifierType(null);
              setIsScanningActive(true);
              setScanFeedback('Scan barcode or QR code');
            },
          },
        ]
      );
    } else {
      setCurrentBatch(null);
      setPhotoBatch([]);
      setIdentifier('');
      setIdentifierType(null);
      setIsScanningActive(true);
      setScanFeedback('Scan barcode or QR code');
    }
  }, [photoBatch.length]);

  // Toggle manual input mode
  const toggleManualInput = useCallback(() => {
    setShowManualInput(!showManualInput);
    if (!showManualInput) {
      setTimeout(() => {
        manualInputRef.current?.focus();
      }, 100);
    }
  }, [showManualInput]);

  // Check if permissions are granted
  if (!cameraPermissionInfo || !mediaLibraryPermissionInfo || !locationPermissionInfo) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={COLORS.primary} />
        <Text style={styles.loadingText}>Requesting permissions...</Text>
      </View>
    );
  }

  if (!cameraPermissionInfo.granted || !mediaLibraryPermissionInfo.granted) {
    return (
      <View style={styles.permissionContainer}>
        <Ionicons name="alert-circle" size={60} color={COLORS.error} />
        <Text style={styles.permissionText}>
          {!cameraPermissionInfo.granted && !mediaLibraryPermissionInfo.granted
            ? 'Camera and Media Library permissions are required.'
            : !cameraPermissionInfo.granted
            ? 'Camera permission is required.'
            : 'Media Library permission is required.'}
        </Text>
        <TouchableOpacity 
          style={styles.permissionButton}
          onPress={async () => {
            if (!cameraPermissionInfo.granted) await requestCameraPermission();
            if (!mediaLibraryPermissionInfo.granted) await requestMediaLibraryPermission();
          }}
        >
          <Text style={styles.permissionButtonText}>Grant Permissions</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // Main component render
  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.cameraContainer}>
        {isCameraInitialized ? (
          /* Camera View with Barcode Scanning */
          <CameraView
            style={styles.camera}
            ref={cameraRef}
            onCameraReady={() => setCameraReady(true)}
            onMountError={(error) => {
              console.error('Camera mount error:', error);
              Alert.alert('Camera Error', 'Failed to initialize camera. Please restart the app.');
            }}
            facing={cameraType === 'back' ? 'back' : 'front'}
            flashMode={torch ? 'on' : 'off'}
            enableTorch={torch}
            barcodeScannerEnabled={isScanningActive}
            onBarcodeScanned={isScanningActive ? handleBarCodeScanned : undefined}
          >
            {/* Scan overlay when scanning is active */}
            {isScanningActive && (
              <View style={styles.scanOverlay}>
                <View style={styles.scanFrameContainer}>
                  <View style={styles.scanFrame}>
                    <Animated.View
                      style={[
                        styles.scanLine,
                        {
                          transform: [
                            {
                              translateY: scanLineAnimation.interpolate({
                                inputRange: [0, 1],
                                outputRange: [0, SCAN_FRAME_SIZE - 2],
                              }),
                            },
                          ],
                        },
                      ]}
                    />
                  </View>
                  <Text style={styles.scanText}>{scanFeedback}</Text>
                </View>
              </View>
            )}
          </CameraView>
        ) : (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={COLORS.primary} />
            <Text style={styles.loadingText}>Initializing camera...</Text>
          </View>
        )}

        {/* Loading overlay */}
        {isLoading && (
          <View style={styles.loadingOverlay}>
            <ActivityIndicator size="large" color={COLORS.primary} />
            <Text style={styles.loadingText}>{scanFeedback}</Text>
          </View>
        )}
        
        {/* Top controls */}
        <View style={[styles.topControls, { marginTop: insets.top }]}>
          <TouchableOpacity 
            style={styles.backButton}
            onPress={() => navigation.goBack()}
          >
            <Ionicons name="arrow-back" size={24} color={COLORS.white} />
          </TouchableOpacity>
          
          <View style={styles.topRightControls}>
            {isScanningActive && (
              <TouchableOpacity 
                style={styles.iconButton}
                onPress={toggleManualInput}
              >
                <Ionicons name="create-outline" size={24} color={COLORS.white} />
              </TouchableOpacity>
            )}
            
            {currentBatch && (
              <TouchableOpacity 
                style={styles.iconButton}
                onPress={resetBatch}
              >
                <Ionicons name="refresh" size={24} color={COLORS.white} />
              </TouchableOpacity>
            )}
          </View>
        </View>
        
        {/* Manual input overlay */}
        {showManualInput && (
          <View style={[styles.overlayContainer, { justifyContent: 'center', padding: SPACING.medium }]}>
            <View style={styles.manualInputContainer}>
              <TextInput
                ref={manualInputRef}
                style={styles.manualInput}
                placeholder="Enter ID manually"
                placeholderTextColor="rgba(255,255,255,0.5)"
                value={manualIdInput}
                onChangeText={setManualIdInput}
                autoCapitalize="characters"
                returnKeyType="done"
                onSubmitEditing={handleManualIdSubmit}
              />
              <TouchableOpacity 
                style={styles.manualInputButton}
                onPress={handleManualIdSubmit}
              >
                <Ionicons name="checkmark" size={24} color={COLORS.white} />
              </TouchableOpacity>
            </View>
          </View>
        )}
        
        {/* Batch info display */}
        {currentBatch && !showManualInput && (
          <View style={[styles.overlayContainer, { top: insets.top + 60, padding: SPACING.medium }]}>
            <View style={styles.batchInfoContainer}>
              <Text style={styles.batchInfoText}>
                {identifierType}: {identifier}
              </Text>
              <Text style={styles.photoCountText}>
                Photos: {photoBatch.length}
              </Text>
            </View>
          </View>
        )}
        
        {/* Success feedback animation */}
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
            <Ionicons name="checkmark-circle" size={50} color={COLORS.success} />
            <Text style={styles.successFeedbackText}>{feedbackMessage}</Text>
          </View>
        </Animated.View>
        
        {/* Bottom controls */}
        <View style={styles.bottomControls}>
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
                <Text style={styles.defectButtonText}>Defect</Text>
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
                <Text style={styles.finishButtonText}>Finish</Text>
              </View>
              <View style={styles.photoCountBadge}>
                <Text style={{color: COLORS.black, fontWeight: 'bold'}}>{photoBatch.length}</Text>
              </View>
            </TouchableOpacity>
          )}
        </View>
      </View>
    </SafeAreaView>
  );
};

export default PhotoCaptureScreen;
