import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Image, Alert,
  ActivityIndicator, Platform, SafeAreaView, Dimensions, TextInput,
  Animated, Easing, Vibration, Linking
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { CameraView, useCameraPermissions, CameraCapturedPicture, CameraType } from 'expo-camera';

import * as Location from 'expo-location';
import * as FileSystem from 'expo-file-system';
import { useNavigation, useRoute, useIsFocused } from '@react-navigation/native';
import { PhotoData, PhotoMetadata, PhotoBatch } from '../types/data';
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
import * as Crypto from 'expo-crypto';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

// Define LocationData interface for location tracking
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

const { width: screenWidth, height: screenHeight } = Dimensions.get('window');
const SCAN_DEBOUNCE_DELAY = 300; // 300ms debounce for scans
const SCAN_FRAME_SIZE = Math.min(screenWidth * 0.7, 280); // Responsive scan frame size
const ANIMATION_DURATION = 2000; // Animation duration in ms
const FEEDBACK_DURATION = 1500; // Feedback display duration in ms
const HAPTIC_DURATION = 100; // Haptic feedback duration in ms

// Styles - Optimized and organized by component area for aviation quality control
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.black,
  },
  camera: {
    flex: 1,
  },
  // Aviation-specific styles for part identification
  partGuidanceText: {
    fontSize: FONTS.regular,
    fontWeight: FONTS.semiBold,
    color: COLORS.white,
    marginBottom: SPACING.medium,
    textAlign: 'center',
    backgroundColor: 'rgba(0,0,0,0.6)',
    paddingHorizontal: SPACING.medium,
    paddingVertical: SPACING.small,
    borderRadius: BORDER_RADIUS.small,
  },
  formatExamplesContainer: {
    marginTop: SPACING.medium,
    backgroundColor: 'rgba(0,0,0,0.6)',
    paddingHorizontal: SPACING.medium,
    paddingVertical: SPACING.small,
    borderRadius: BORDER_RADIUS.small,
  },
  formatExampleText: {
    fontSize: FONTS.small,
    fontWeight: FONTS.normal,
    color: COLORS.white,
    textAlign: 'center',
  },
  successDetailText: {
    fontSize: FONTS.small,
    fontWeight: FONTS.normal,
    color: COLORS.white,
    textAlign: 'center',
    marginTop: SPACING.tiny,
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
  // Styles for Scan Frame Corners
  cornerBase: {
    position: 'absolute',
    width: 30, // Size of the corner leg
    height: 30, // Size of the corner leg
    borderColor: COLORS.primary,
    borderWidth: 4, // Thickness of the corner
  },
  topLeftCorner: {
    top: -2, // Offset by half of borderWidth to align with outer edge of scanFrame border
    left: -2,
    borderRightWidth: 0,
    borderBottomWidth: 0,
    borderTopLeftRadius: BORDER_RADIUS.small, // Match scanFrame's radius
  },
  topRightCorner: {
    top: -2,
    right: -2,
    borderLeftWidth: 0,
    borderBottomWidth: 0,
    borderTopRightRadius: BORDER_RADIUS.small,
  },
  bottomLeftCorner: {
    bottom: -2,
    left: -2,
    borderRightWidth: 0,
    borderTopWidth: 0,
    borderBottomLeftRadius: BORDER_RADIUS.small,
  },
  bottomRightCorner: {
    bottom: -2,
    right: -2,
    borderLeftWidth: 0,
    borderTopWidth: 0,
    borderBottomRightRadius: BORDER_RADIUS.small,
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
    width: 70,
    height: 70,
    borderRadius: 35,
    backgroundColor: COLORS.white,
    justifyContent: 'center',
    alignItems: 'center',
    ...SHADOWS.medium,
    borderWidth: 3,
    borderColor: COLORS.primary,
  },
  captureButtonInner: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: COLORS.white,
  },
  captureButtonDisabled: {
    opacity: 0.5,
    backgroundColor: COLORS.grey600,
  },
  disabledText: {
    color: COLORS.grey400,
  },
  galleryButton: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: COLORS.secondary,
    justifyContent: 'center',
    alignItems: 'center',
    ...SHADOWS.small,
  },
  captureButtonInnerDisabled: {
    opacity: 0.5,
  },
  disabledButton: {
    opacity: 0.5,
    backgroundColor: COLORS.grey600,
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
  manualInputHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    width: '100%',
    marginBottom: SPACING.medium,
  },
  manualInputTitle: {
    fontSize: FONTS.regular,
    fontWeight: FONTS.semiBold,
    color: COLORS.white,
  },
  closeButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  manualInputContainer: {
    flexDirection: 'row',
    backgroundColor: 'rgba(0,0,0,0.7)',
    borderRadius: BORDER_RADIUS.small,
    marginBottom: SPACING.medium,
    overflow: 'hidden',
    width: '100%',
  },
  manualInput: {
    flex: 1,
    height: 50,
    color: COLORS.white,
    paddingHorizontal: SPACING.medium,
    fontSize: FONTS.regular,
  },
  manualInputButton: {
    width: 50,
    height: 50,
    backgroundColor: COLORS.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  manualInputHint: {
    fontSize: FONTS.small,
    color: 'rgba(255,255,255,0.7)',
    textAlign: 'center',
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
    padding: SPACING.large,
    borderRadius: BORDER_RADIUS.medium,
    alignItems: 'center',
  },
  successText: {
    color: COLORS.white,
    fontSize: FONTS.regular,
    fontWeight: FONTS.semiBold,
    marginTop: SPACING.small,
    textAlign: 'center',
  },
  // Removed duplicated successFeedbackInner styles that were here

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
  // TODO: Verify PhotoCaptureScreenRouteProp in navigation types for route.params.batchId and route.params.identifier
  const navigation = useNavigation<PhotoCaptureScreenNavigationProp>();
  const route = useRoute<PhotoCaptureScreenRouteProp>();
  const isFocused = useIsFocused();
  const insets = useSafeAreaInsets();
  const auth = useAuth();
  const { userId } = auth;
  
  const cameraRef = useRef<CameraView>(null);
  const manualInputRef = useRef<TextInput>(null);
  const lastScanTime = useRef<number>(0);
  const lastScannedRef = useRef<string | null>(null);
  const mountedRef = useRef<boolean>(false);
  
  const scanLineAnimation = useRef(new Animated.Value(0)).current;
  const feedbackOpacity = useRef(new Animated.Value(0)).current; // For the new feedback system

  const [cameraPermissionInfo, requestCameraPermission] = useCameraPermissions();
  const [mediaLibraryPermissionInfo, requestMediaLibraryPermission] = MediaLibrary.usePermissions();
  const [locationPermissionInfo, requestLocationPermission] = Location.useForegroundPermissions();
  
  const [torch, setTorch] = useState(false);
  const [cameraMode, setCameraMode] = useState<CameraType>('back');
  const [cameraReady, setCameraReady] = useState(false);
  const [isCapturing, setIsCapturing] = useState(false);
  const [isLoading, setIsLoading] = useState(false); // For general loading states

  const [photoBatch, setPhotoBatch] = useState<PhotoData[]>([]);
  const [currentBatch, setCurrentBatch] = useState<PhotoBatch | null>(null);
  const [currentLocation, setCurrentLocation] = useState<Location.LocationObject | null>(null);
  const [identifier, setIdentifier] = useState<string | undefined>(undefined);
  const [identifierType, setIdentifierType] = useState<'Order' | 'Inventory' | 'Single' | 'Batch'>('Single');
  const [scanFeedback, setScanFeedback] = useState<string>('Scan barcode or QR code');
  const [isScanningActive, setIsScanningActive] = useState<boolean>(true);
  const [manualIdInput, setManualIdInput] = useState<string>('');
  const [lastCapturedPhoto, setLastCapturedPhoto] = useState<PhotoData | null>(null);
  const [showManualInput, setShowManualInput] = useState(false);

  const [feedback, setFeedback] = useState<{visible: boolean, message: string, type: 'success' | 'error'}>({visible: false, message: '', type: 'success'});

  // Component Mount/Unmount
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // Feedback Animations
  const showFeedbackAnimation = useCallback((message: string, type: 'success' | 'error' = 'success') => {
    if (!mountedRef.current) return;
    setFeedback({ visible: true, message, type });
    Animated.timing(feedbackOpacity, {
      toValue: 1,
      duration: 300,
      easing: Easing.out(Easing.ease),
      useNativeDriver: true,
    }).start(() => {
      if (!mountedRef.current) return;
      setTimeout(() => {
        if (mountedRef.current) hideFeedbackAnimation();
      }, FEEDBACK_DURATION);
    });
  }, [feedbackOpacity]);

  const hideFeedbackAnimation = useCallback(() => {
    if (!mountedRef.current) return;
    Animated.timing(feedbackOpacity, {
      toValue: 0,
      duration: 300,
      easing: Easing.in(Easing.ease),
      useNativeDriver: true,
    }).start(() => {
      if (mountedRef.current) setFeedback({ visible: false, message: '', type: 'success' });
    });
  }, [feedbackOpacity]);

  // Haptic Feedback Utility
  const triggerHapticFeedback = useCallback((type: Haptics.ImpactFeedbackStyle = Haptics.ImpactFeedbackStyle.Medium) => {
    Haptics.impactAsync(type);
  }, []);

  const resetBatch = useCallback((showAnim: boolean = true) => {
    if (!mountedRef.current) return;
    setCurrentBatch(null);
    setPhotoBatch([]);
    setIdentifier('');
    setIdentifierType('Inventory'); // Or 'Single' as a more generic default after reset
    setIsScanningActive(true);
    setShowManualInput(false);
    setScanFeedback('Scan barcode or QR code');
    setLastCapturedPhoto(null);
    lastScannedRef.current = null; // Reset last scanned ref
    if(showAnim) showFeedbackAnimation('Session Reset', 'success');
    triggerHapticFeedback(Haptics.ImpactFeedbackStyle.Light);
    logAnalyticsEvent('batch_reset');
  }, [showFeedbackAnimation, triggerHapticFeedback, logAnalyticsEvent]); // Added logAnalyticsEvent to dependencies

  // Permissions Request Logic
  useEffect(() => {
    const requestAllPermissions = async () => {
      if (!mountedRef.current) return;
      setIsLoading(true);
      setScanFeedback('Requesting permissions...');
      try {
        const [camPerm, mediaPerm, locPerm] = await Promise.all([
          requestCameraPermission(),
          requestMediaLibraryPermission(),
          requestLocationPermission(),
        ]);
        if (!mountedRef.current) return;

        if (!camPerm?.granted) {
          setScanFeedback('Camera permission is required.');
          Alert.alert('Permission Denied', 'Camera permission is required to use the app.');
          setIsLoading(false);
          return;
        }
        if (!mediaPerm?.granted) {
          Alert.alert('Optional Permission', 'Media Library access allows saving photos to your gallery. You can grant this later in settings.');
        }
        logAnalyticsEvent('permissions_checked', { cam: camPerm?.granted, media: mediaPerm?.granted, loc: locPerm?.granted });
        setScanFeedback('Ready to scan');
      } catch (error) {
        if (!mountedRef.current) return;
        console.error('Error requesting permissions:', error);
        const err = error instanceof Error ? error : new Error(String(error));
        showFeedbackAnimation('Permission Error', 'error');
        logErrorToFile('permission_request_error', err);
        setScanFeedback('Permission error.');
      }
      if (mountedRef.current) setIsLoading(false);
    };
    requestAllPermissions();
  }, []);

  // Scan Line Animation
  useEffect(() => {
    const animateScanLine = () => {
      scanLineAnimation.setValue(0);
      Animated.loop(
        Animated.sequence([
          Animated.timing(scanLineAnimation, {
            toValue: SCAN_FRAME_SIZE - 2, 
            duration: ANIMATION_DURATION / 2,
            easing: Easing.linear,
            useNativeDriver: true,
          }),
          Animated.timing(scanLineAnimation, {
            toValue: 0,
            duration: ANIMATION_DURATION / 2,
            easing: Easing.linear,
            useNativeDriver: true,
          }),
        ])
      ).start();
    };
    if (isScanningActive && cameraReady) {
      animateScanLine();
    } else {
      scanLineAnimation.stopAnimation();
    }
    return () => scanLineAnimation.stopAnimation();
  }, [isScanningActive, cameraReady, scanLineAnimation]);

  // Screen Focus/Blur Logic
  useEffect(() => {
    if (isFocused && route.params) {
      if ('batchId' in route.params && typeof route.params.batchId === 'number') {
        // Resuming existing batch
        const batchIdToFetch = route.params.batchId;
        setIsScanningActive(false);
        setScanFeedback(`Loading batch ${batchIdToFetch}...`);

        // Assuming getBatchDetails expects a number and returns { batch: PhotoBatch | null, photos: PhotoData[] | null }
        getBatchDetails(batchIdToFetch).then(result => {
          if (result && result.batch && mountedRef.current) {
            setCurrentBatch({
              id: result.batch.id,
              type: result.batch.type, // Should be 'Order' | 'Inventory' | 'Single'
              referenceId: result.batch.referenceId, // This should be the main identifier
              userId: result.batch.userId,
              createdAt: result.batch.createdAt,
              status: result.batch.status,
              photos: result.photos || []
            });
            setPhotoBatch(result.photos || []);

            const fetchedIdentifier = result.batch.referenceId || 
                                    (result.batch.orderNumber ? `ORD-${result.batch.orderNumber}` : 
                                    (result.batch.inventoryId ? `INV-${result.batch.inventoryId}` : `Batch ${result.batch.id}`));
            setIdentifier(fetchedIdentifier);
            // Ensure result.batch.type is one of 'Order', 'Inventory', or 'Single'
            const batchType = result.batch.type === 'Order' || result.batch.type === 'Inventory' || result.batch.type === 'Single' ? result.batch.type : 'Single';
            setIdentifierType(batchType);
            setScanFeedback(`Continuing: ${fetchedIdentifier}`);
          } else if (mountedRef.current) {
            showFeedbackAnimation('Batch details not found. Starting new session.', 'error');
            resetBatch(false);
          }
        }).catch(err => {
          if (!mountedRef.current) return;
          console.error('Error fetching batch details:', err);
          showFeedbackAnimation('Error loading batch. Starting new session.', 'error');
          resetBatch(false);
        });
      } else if ('mode' in route.params) {
        // Starting a new session based on mode, orderNumber, inventoryId
        const { mode, orderNumber, inventoryId } = route.params as { mode: 'Single' | 'Batch' | 'Inventory', orderNumber?: string, inventoryId?: string }; // Type assertion
        const id = orderNumber || inventoryId;
        if (id) {
          setIdentifier(id);
          setIdentifierType(orderNumber ? 'Order' : 'Inventory');
          setScanFeedback(`New session for: ${id}`);
        } else {
          setIdentifier(mode === 'Single' ? 'Single Photo' : 'New Session');
          setIdentifierType(mode === 'Inventory' ? 'Inventory' : (mode === 'Batch' ? 'Batch' : 'Single'));
          setScanFeedback(mode === 'Single' ? 'Ready for single capture' : 'Ready to scan or capture.');
        }
        setIsScanningActive(true);
        resetBatch(true); 
      } else {
        // Fallback: route.params exists but doesn't match known shapes
        // Or if route.params was initially undefined and isFocused became true
        setIdentifier('New Session');
        setIdentifierType('Single');
        setScanFeedback('Ready to scan or capture.');
        setIsScanningActive(true);
        resetBatch(true);
      }
    } else if (isFocused) {
      // route.params is undefined, treat as a fresh start
      setIdentifier('New Session');
      setIdentifierType('Single');
      setScanFeedback('Ready to scan or capture.');
      setIsScanningActive(true);
      resetBatch(true);
    }
  }, [isFocused, route.params, getBatchDetails, showFeedbackAnimation, resetBatch]);

  const handleScannedIdSubmit = useCallback(async (scannedId: string) => {
    if (isLoading || !mountedRef.current) return;
    setIsLoading(true);
    const cleanId = scannedId.trim().toUpperCase();

    if (!/^[A-Z0-9-]{4,}$/i.test(cleanId)) {
      showFeedbackAnimation('Invalid ID Format (min 4 chars)', 'error');
      triggerHapticFeedback(Haptics.ImpactFeedbackStyle.Heavy);
      if (mountedRef.current) setIsLoading(false);
      return;
    }

    try {
      await ensureDbOpen();
      const newIdType = cleanId.startsWith('ORD-') ? 'Order' : 'Inventory';
      // TODO: Verify return type of createPhotoBatch (e.g., string or number for batchId)
      const batchId = await createPhotoBatch(
        userId || 'unknown_user',
        newIdType === 'Order' ? cleanId : undefined,
        newIdType === 'Inventory' ? cleanId : undefined
      );
      if (!mountedRef.current) return;

      const newBatchData: PhotoBatch = {
        id: batchId, // batchId is a number, PhotoBatch.id is a number
        type: newIdType,
        referenceId: cleanId,
        userId: userId || 'unknown_user',
        createdAt: new Date().toISOString(),
        status: 'InProgress',
        photos: [],
      };
      setCurrentBatch(newBatchData);
      setPhotoBatch([]);
      setIdentifier(cleanId);
      setIdentifierType(newIdType);
      setIsScanningActive(false);
      setShowManualInput(false);
      setScanFeedback(`${newIdType}: ${cleanId}`);
      showFeedbackAnimation(`Batch Started: ${cleanId}`, 'success');
      triggerHapticFeedback(Haptics.ImpactFeedbackStyle.Heavy);
      logAnalyticsEvent('batch_created', { identifier: cleanId, type: newIdType });
    } catch (error) {
      if (!mountedRef.current) return;
      console.error('Error creating batch:', error);
      const err = error instanceof Error ? error : new Error(String(error));
      showFeedbackAnimation('Error Starting Batch', 'error');
      logErrorToFile('batch_creation_error', err); // TODO: Revisit logging context if needed
    }
    if (mountedRef.current) setIsLoading(false);
  }, [isLoading, userId, showFeedbackAnimation, triggerHapticFeedback]);

  const handleBarCodeScanned = useCallback(({ data }: { data: string }) => {
    if (!isScanningActive || isLoading || !mountedRef.current) return;
    const now = Date.now();
    if (now - lastScanTime.current < SCAN_DEBOUNCE_DELAY) return;
    lastScanTime.current = now;
    if (data === lastScannedRef.current && !__DEV__) return; // Allow re-scan in DEV
    lastScannedRef.current = data;

    console.log('Barcode scanned:', data);
    triggerHapticFeedback(Haptics.ImpactFeedbackStyle.Medium);
    setScanFeedback(`Processing: ${data.trim()}`);
    handleScannedIdSubmit(data.trim());
  }, [isScanningActive, isLoading, handleScannedIdSubmit, triggerHapticFeedback]);

  const handleManualIdSubmit = useCallback(() => {
    if (!manualIdInput.trim() || !mountedRef.current) return;
    triggerHapticFeedback(Haptics.ImpactFeedbackStyle.Light);
    handleScannedIdSubmit(manualIdInput.trim());
  }, [manualIdInput, handleScannedIdSubmit, triggerHapticFeedback]);

  const toggleManualInput = useCallback(() => {
    if (!mountedRef.current) return;
    setShowManualInput(prev => {
      const newShowManualInput = !prev;
      if (newShowManualInput) {
        setIsScanningActive(false);
        setTimeout(() => manualInputRef.current?.focus(), 100);
      } else {
        if (!currentBatch) setIsScanningActive(true);
      }
      return newShowManualInput;
    });
  }, [currentBatch]);

  const processAndSavePhoto = useCallback(async (photo: CameraCapturedPicture, isDefect: boolean) => {
    if (!currentBatch || !mountedRef.current) {
      throw new Error('No active batch to save photo to.');
    }
    setIsLoading(true);
    setScanFeedback('Processing photo...');
    try {
      const manipResultUri: string = photo.uri; // Using original URI as manipulation is removed

      // Location fetching removed as per user request
      const metadata: PhotoMetadata = {
        timestamp: new Date().toISOString(),
        userId: userId || 'unknown-user', // Use destructured userId
        // latitude: undefined, // Location data removed
        // longitude: undefined, // Location data removed
        deviceModel: `${Platform.OS} ${Platform.Version}`, // Added deviceModel
        hasDefects: isDefect,
        // defectSeverity: undefined, // TODO: Populate if/when severity is captured at photo time
        // defectNotes: undefined,    // TODO: Populate if/when notes are captured at photo time
      };
      const newPhotoId = Crypto.randomUUID();
      const photoDataToSave: PhotoData = {
        id: newPhotoId,
        batchId: currentBatch.id,
        uri: photo.uri, // Original URI from camera
        orderNumber: currentBatch.orderNumber || (currentBatch.type === 'Order' ? currentBatch.referenceId : undefined),
        inventoryId: currentBatch.inventoryId || (currentBatch.type === 'Inventory' ? currentBatch.referenceId : undefined),
        // partNumber: undefined, // Explicitly undefined or sourced if available
        metadata,
        syncStatus: 'pending',
        // Ensure other fields like annotations, annotationSavedUri are handled if/when implemented
      };

      console.time('DatabaseSavePhoto');
      const savedPhotoId = await savePhoto(currentBatch.id, photoDataToSave);
      console.timeEnd('DatabaseSavePhoto');
      if (!mountedRef.current) return;

      // It's good practice to use the ID confirmed by the database, which savePhoto now returns.
      const finalPhotoData: PhotoData = { ...photoDataToSave, id: savedPhotoId };

      setPhotoBatch(prev => [...prev, finalPhotoData]);
      setLastCapturedPhoto(finalPhotoData);

      if (!mountedRef.current) return;
      showFeedbackAnimation(`${isDefect ? 'Defect' : 'Photo'} Saved`, 'success');
      logAnalyticsEvent('photo_saved_db', { batchId: currentBatch.id, photoId: savedPhotoId, isDefect });
    } catch (error) {
      if (!mountedRef.current) return; // Early exit if component unmounted
      console.error('Error processing/saving photo:', error);
      const err = error instanceof Error ? error : new Error(String(error));
      logErrorToFile('Error in PhotoCaptureScreen.processAndSavePhoto', err);
      Alert.alert('Save Failed', 'Could not save photo. Please try again. Check logs for details.');
    } finally {
      if (mountedRef.current) { // Check mountedRef again before setting state
        setIsLoading(false);
        setScanFeedback('');
      }
    }
  }, [currentBatch, userId, locationPermissionInfo?.granted, showFeedbackAnimation]);

  const takePicture = useCallback(async (isDefect: boolean = false) => {
    if (isCapturing || !cameraReady || !mountedRef.current) return;
    if (!currentBatch) {
      showFeedbackAnimation('Start a Batch First!', 'error');
      triggerHapticFeedback(Haptics.ImpactFeedbackStyle.Heavy);
      if (!showManualInput) toggleManualInput(); 
      return;
    }
    setIsCapturing(true);
    setScanFeedback('Capturing...');
    triggerHapticFeedback(Haptics.ImpactFeedbackStyle.Medium);
    try {
      await new Promise(resolve => setTimeout(resolve, 50));
      const photo = await cameraRef.current?.takePictureAsync({
        quality: 1.0, // Maximize JPEG quality
        skipProcessing: true, 
        exif: true,
      });
      if (!photo || !mountedRef.current) throw new Error('Photo capture failed or component unmounted.');
      
      await processAndSavePhoto(photo, isDefect);
      logAnalyticsEvent('photo_captured_raw', { batchId: currentBatch.id, isDefect });
    } catch (error) {
      if (!mountedRef.current) return;
      console.error('Error in takePicture:', error);
      const err = error instanceof Error ? error : new Error(String(error));
      if (!err.message.includes('Error Saving Photo')) {
         showFeedbackAnimation('Capture Error', 'error');
      }
      logErrorToFile('takePicture_error', err); // TODO: Revisit logging context if needed
    } finally {
      if (mountedRef.current) setIsCapturing(false);
      logAnalyticsEvent('photo_capture_attempt_completed', { context: 'takePicture_finally' }); // Changed event and payload
    }
  }, [isCapturing, cameraReady, currentBatch, processAndSavePhoto, showFeedbackAnimation, triggerHapticFeedback, toggleManualInput, showManualInput]);

  if (isLoading && !cameraReady && !cameraPermissionInfo?.granted) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={COLORS.primary} />
          <Text style={styles.loadingText}>{scanFeedback}</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!cameraPermissionInfo?.granted) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.permissionContainer}>
          <Ionicons name="camera-outline" size={60} color={COLORS.warning} />
          <Text style={styles.permissionText}>Camera permission is essential to use this app.</Text>
          <TouchableOpacity style={styles.permissionButton} onPress={requestCameraPermission}>
            <Text style={styles.permissionButtonText}>Grant Camera Permission</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.permissionButton} onPress={() => Linking.openSettings()}>
            <Text style={styles.permissionButtonText}>Open Settings</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }
  
  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar style="light" backgroundColor={COLORS.black} />

      {feedback.visible && (
        <Animated.View style={[styles.successFeedback, { opacity: feedbackOpacity, zIndex: 20 }]}>
          <View style={styles.successFeedbackInner}>
            <Ionicons 
              name={feedback.type === 'success' ? "checkmark-circle" : "alert-circle"} 
              size={48} 
              color={feedback.type === 'success' ? COLORS.success : COLORS.error} 
            />
            <Text style={styles.successText}>{feedback.message}</Text>
          </View>
        </Animated.View>
      )}

      {isLoading && cameraReady && (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator size="large" color={COLORS.primary} />
          <Text style={styles.loadingText}>{scanFeedback || 'Processing...'}</Text>
        </View>
      )}

      <CameraView
        ref={cameraRef}
        style={styles.camera}
        facing={cameraMode}
        onCameraReady={() => { if (mountedRef.current) setCameraReady(true); }}
        ratio="4:3" // Set aspect ratio to 4:3 for potentially higher resolution
        barcodeScannerSettings={{
          barcodeTypes: ['qr', 'datamatrix', 'code128', 'code39', 'ean13', 'upc_a', 'pdf417', 'aztec'],
        }}
        onBarcodeScanned={isScanningActive && cameraReady && !isLoading ? handleBarCodeScanned : undefined}
        enableTorch={torch}
        onMountError={(error) => {
          if (!mountedRef.current) return;
          console.error('Camera mount error:', error);
          const err = error instanceof Error ? error : new Error(String(error));
          showFeedbackAnimation('Camera Mount Error', 'error');
          logErrorToFile('camera_mount_error', err);
        }}
      >
        {isScanningActive && cameraReady && (
          <View style={styles.scanOverlay}>
            <View style={styles.scanFrameContainer}>
              <View style={styles.scanFrame}>
                <Animated.View style={[styles.scanLine, { transform: [{ translateY: scanLineAnimation }] }]} />
                <View style={[styles.cornerBase, styles.topLeftCorner]} />
                <View style={[styles.cornerBase, styles.topRightCorner]} />
                <View style={[styles.cornerBase, styles.bottomLeftCorner]} />
                <View style={[styles.cornerBase, styles.bottomRightCorner]} />
              </View>
              <Text style={styles.scanText}>{scanFeedback}</Text>
            </View>
          </View>
        )}

        {!isScanningActive && currentBatch && !showManualInput && (
          <View style={[styles.overlayContainer, { top: insets.top + SPACING.medium, alignItems: 'center'}]}>
            <View style={styles.batchInfoContainer}>
              <Text style={styles.batchInfoText}>{currentBatch.type}: {identifier}</Text>
              <Text style={styles.photoCountText}>Photos: {photoBatch.length}</Text>
            </View>
          </View>
        )}

        {showManualInput && (
          <View style={[styles.overlayContainer, { top: insets.top + SPACING.medium, paddingHorizontal: SPACING.large, justifyContent: 'flex-start'}]}>
            <View style={styles.manualInputHeader}>
                <Text style={styles.manualInputTitle}>Enter ID Manually</Text>
                <TouchableOpacity onPress={toggleManualInput} style={styles.closeButton}>
                    <Ionicons name="close" size={24} color={COLORS.white} />
                </TouchableOpacity>
            </View>
            <View style={styles.manualInputContainer}>
              <TextInput
                ref={manualInputRef}
                style={styles.manualInput}
                placeholder="Enter Part/Order ID"
                placeholderTextColor={COLORS.grey400}
                value={manualIdInput}
                onChangeText={setManualIdInput}
                onSubmitEditing={handleManualIdSubmit}
                autoCapitalize="characters"
                returnKeyType="done"
                editable={!isLoading}
              />
              <TouchableOpacity style={styles.manualInputButton} onPress={handleManualIdSubmit} disabled={isLoading || !manualIdInput.trim()}>
                <Ionicons name="checkmark" size={28} color={COLORS.white} />
              </TouchableOpacity>
            </View>
            <Text style={styles.manualInputHint}>Min 4 chars. Examples: RLS-123, INV-A456</Text>
          </View>
        )}
      </CameraView>

      <View style={[styles.topControls, { top: insets.top }]}>
        <TouchableOpacity style={styles.iconButton} onPress={() => resetBatch()} disabled={isLoading}>
          <Ionicons name="refresh" size={24} color={COLORS.white} />
        </TouchableOpacity>
        <View style={styles.topRightControls}>
          <TouchableOpacity style={styles.iconButton} onPress={() => setTorch(t => !t)} disabled={isLoading || !cameraReady}>
            <Ionicons name={torch ? "flash" : "flash-off"} size={24} color={COLORS.white} />
          </TouchableOpacity>
          <TouchableOpacity style={styles.iconButton} onPress={() => setCameraMode(ct => ct === 'back' ? 'front' : 'back')} disabled={isLoading || !cameraReady}>
            <Ionicons name="camera-reverse" size={24} color={COLORS.white} />
          </TouchableOpacity>
          {(isScanningActive || !currentBatch) && !showManualInput && (
             <TouchableOpacity style={styles.iconButton} onPress={toggleManualInput} disabled={isLoading}>
                <Ionicons name="keypad-outline" size={24} color={COLORS.white} />
            </TouchableOpacity>
          )}
        </View>
      </View>

      <View style={[styles.bottomControls, { paddingBottom: insets.bottom || SPACING.medium }]}>
        <View style={styles.controlsRow}>
          <TouchableOpacity 
            style={styles.galleryButton} 
            onPress={() => { if (currentBatch) { navigation.navigate('BatchPreview', { batchId: currentBatch.id, identifier: currentBatch.referenceId }); } }} 
            disabled={isLoading}
          >
            {lastCapturedPhoto ? (
              <Image source={{ uri: lastCapturedPhoto.uri }} style={{width: '100%', height: '100%', borderRadius: 25}} />
            ) : (
              <Ionicons name="images" size={28} color={COLORS.white} />
            )}
          </TouchableOpacity>
          
          <View style={styles.captureButtonsContainer}>
            <TouchableOpacity 
              style={[styles.captureButton, (isCapturing || !cameraReady || !currentBatch) && styles.captureButtonDisabled]}
              onPress={() => takePicture(false)}
              disabled={isCapturing || !cameraReady || !currentBatch || isLoading}
            >
              <View style={styles.captureButtonInner} />
            </TouchableOpacity>
            {currentBatch && (
                <TouchableOpacity 
                    style={[styles.defectButton, (isCapturing || !cameraReady) && styles.disabledButton]}
                    onPress={() => takePicture(true)}
                    disabled={isCapturing || !cameraReady || isLoading}
                >
                    <Ionicons name="alert-circle-outline" size={20} color={COLORS.white} />
                    <Text style={styles.defectButtonText}>Mark Defect</Text>
                </TouchableOpacity>
            )}
          </View>

          <TouchableOpacity 
            style={[styles.controlButton, {width: 50, height: 50, borderRadius: 25, backgroundColor: COLORS.secondary}, (!currentBatch || photoBatch.length === 0) && styles.disabledButton]}
            disabled={!currentBatch || photoBatch.length === 0 || isLoading}
            onPress={() => {
              if (currentBatch) {
                navigation.navigate('BatchPreview', { batchId: currentBatch.id, identifier });
              }
            }}
          >
            <Ionicons name="checkmark-done" size={28} color={COLORS.white} />
            {photoBatch.length > 0 && (
                <View style={styles.photoCountBadge}><Text style={{color: COLORS.black, fontSize: 10, fontWeight: 'bold'}}>{photoBatch.length}</Text></View>
            )}
          </TouchableOpacity>
        </View>
        {currentBatch && photoBatch.length > 0 && (
            <TouchableOpacity
                style={[styles.finishButton, {marginTop: SPACING.medium}] }
                onPress={() => {
                    if (currentBatch) {
                        navigation.navigate('BatchPreview', { batchId: currentBatch.id, identifier });
                    }
                }}
                disabled={isLoading}
            >
                <Text style={styles.finishButtonText}>Review & Complete ({photoBatch.length})</Text>
                <Ionicons name="arrow-forward" size={20} color={COLORS.white} />
            </TouchableOpacity>
        )}
      </View>
    </SafeAreaView>
  );
};


export default PhotoCaptureScreen;

