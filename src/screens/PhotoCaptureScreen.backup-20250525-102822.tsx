import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Image, Alert,
  ActivityIndicator, Platform, SafeAreaView, Dimensions, TextInput,
  Animated, Easing, Vibration, PanResponder, ScrollView
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { CameraView, useCameraPermissions, CameraCapturedPicture, CameraType } from 'expo-camera';
import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';
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

// Constants - Memoized to prevent recalculations on re-renders
const { width: screenWidth, height: screenHeight } = Dimensions.get('window');
const SCAN_DEBOUNCE_DELAY = 300; // 300ms debounce for scans
const SCAN_FRAME_SIZE = Math.min(screenWidth * 0.7, 280); // Responsive scan frame size
const ANIMATION_DURATION = 2000; // Animation duration in ms
const FEEDBACK_DURATION = 1500; // Feedback display duration in ms
const HAPTIC_DURATION = 100; // Haptic feedback duration in ms
const CAMERA_READY_DELAY = 100; // 100ms delay to ensure camera readiness
const DEFAULT_ZOOM = 0;
const MAX_ZOOM = 0.7; // Maximum zoom level for the camera
const CAMERA_READY_DELAY = 100; // 100ms delay to ensure camera readiness
const DEFAULT_ZOOM = 0;
const MAX_ZOOM = 0.7; // Maximum zoom level for the camera

// Styles - Optimized and organized by component area for aviation quality control
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.black,
  },
  camera: {
    flex: 1,
  },
  flashEffect: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: COLORS.white,
    zIndex: 5,
  },
  flashEffect: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: COLORS.white,
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
  },
  cameraControls: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    width: '100%',
    marginBottom: SPACING.medium,
  },
  controlButton: {
    padding: SPACING.small,
    borderRadius: BORDER_RADIUS.small,
    backgroundColor: 'rgba(0,0,0,0.5)',
    flexDirection: 'row',
    alignItems: 'center',
  },
  controlButtonActive: {
    backgroundColor: COLORS.primary,
  },
  controlButtonText: {
    fontSize: FONTS.small,
    color: COLORS.white,
    marginLeft: SPACING.tiny,
  },
  zoomContainer: {
    flex: 1,
    marginLeft: SPACING.medium,
  },
  zoomText: {
    fontSize: FONTS.tiny,
    color: COLORS.white,
    marginBottom: 4,
  },
  zoomControls: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  zoomButton: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  zoomBar: {
    flex: 1,
    height: 4,
    backgroundColor: 'rgba(255,255,255,0.3)',
    borderRadius: 2,
    marginHorizontal: SPACING.small,
  },
  zoomBarFill: {
    height: 4,
    backgroundColor: COLORS.primary,
    borderRadius: 2,
  },
  cameraControls: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    width: '100%',
    marginBottom: SPACING.medium,
  },
  controlButton: {
    padding: SPACING.small,
    borderRadius: BORDER_RADIUS.small,
    backgroundColor: 'rgba(0,0,0,0.5)',
    flexDirection: 'row',
    alignItems: 'center',
  },
  controlButtonActive: {
    backgroundColor: COLORS.primary,
  },
  controlButtonText: {
    fontSize: FONTS.small,
    color: COLORS.white,
    marginLeft: SPACING.tiny,
  },
  zoomContainer: {
    flex: 1,
    marginLeft: SPACING.medium,
  },
  zoomText: {
    fontSize: FONTS.tiny,
    color: COLORS.white,
    marginBottom: 4,
  },
  zoomControls: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  zoomButton: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  zoomBar: {
    flex: 1,
    height: 4,
    backgroundColor: 'rgba(255,255,255,0.3)',
    borderRadius: 2,
    marginHorizontal: SPACING.small,
  },
  zoomBarFill: {
    height: 4,
    backgroundColor: COLORS.primary,
    borderRadius: 2,
  }
});

/**
 * PhotoCaptureScreen Component
 * 
 * A streamlined camera interface for industrial quality control photography
 * Optimized for high-volume workflows in shipping & receiving environments
 */
const PhotoCaptureScreen = ({ navigation }) => {
  const navigation = useNavigation<PhotoCaptureScreenNavigationProp>();
  const route = useRoute<PhotoCaptureScreenRouteProp>();
  const isFocused = useIsFocused();
  const insets = useSafeAreaInsets();
  const { userId } = useAuth();
  
  // Refs - Using useRef for values that don't trigger re-renders
  const cameraRef = useRef<CameraView>(null);
  const manualInputRef = useRef<TextInput>(null);
  const lastScanTime = useRef<number>(0); // For debouncing scans
  const lastScannedRef = useRef<string | null>(null); // For debouncing scans
  const mountedRef = useRef<boolean>(false); // Track component mount state
  
  // Animation values for scan line  // Animation references
  const scanLinePosition = useRef(new Animated.Value(0)).current;
  const flashOpacity = useRef(new Animated.Value(0)).current;
  const successFeedbackOpacity = useRef(new Animated.Value(0)).current;
  const successFeedbackScale = useRef(new Animated.Value(0.8)).current;
  
  // Permissions - Using permission hooks for camera, media library, and location
  const [cameraPermissionInfo, requestCameraPermission] = useCameraPermissions();
  const [mediaLibraryPermissionInfo, requestMediaLibraryPermission] = MediaLibrary.usePermissions();
  const [torch, setTorch] = useState(false);
  const [cameraType, setCameraType] = useState('back');
  const [cameraReady, setCameraReady] = useState(false);
  const [isCapturing, setIsCapturing] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [flashEnabled, setFlashEnabled] = useState(false);
  const [zoomLevel, setZoomLevel] = useState(DEFAULT_ZOOM);
  const [lastZoomGesture, setLastZoomGesture] = useState(0);
  const flashOpacity = useRef(new Animated.Value(0)).current;
  const scanLinePosition = useRef(new Animated.Value(0)).current;
  const scanLineAnimation = useRef(new Animated.Value(0)).current;
  const panResponder = useRef(null);

  const [photoBatch, setPhotoBatch] = useState<PhotoData[]>([]);
  const [currentBatch, setCurrentBatch] = useState<PhotoBatch | null>(null);

  const handleScannedIdSubmit = useCallback(async (scannedId: string) => {
    // ... existing code ...
  }, [isLoading, userId]);

  const handleBarCodeScanned = useCallback(({ data }: { data: string }) => {
    // ... existing code ...
  }, [isScanningActive, isLoading, handleScannedIdSubmit]);

  const handleManualIdSubmit = useCallback(() => {
    // ... existing code ...
  }, [manualIdInput, handleScannedIdSubmit, isLoading]);

  const processAndSavePhoto = useCallback(async (photo: CameraCapturedPicture, isDefect: boolean) => {
    // ... existing code ...
  }, [cameraRef, identifier, currentBatch, userId, locationPermissionInfo?.granted, mediaLibraryPermissionInfo?.granted]);

  const resetBatch = useCallback(() => {
    // ... existing code ...
  }, [photoBatch.length]);

  const toggleManualInput = useCallback(() => {
    // ... existing code ...
  }, [showManualInput]);

  const takePicture = useCallback(async (isDefect = false) => {
    // ... existing code ...
  }, [cameraRef, isCapturing, cameraReady, currentBatch, identifier, photoBatch.length, showSuccessFeedback, toggleManualInput]);

  const handleZoomGesture = useCallback((gestureState) => {
    // ... existing code ...
  }, [zoomLevel, lastZoomGesture]);

  useEffect(() => {
    // ... existing code ...
  }, [isScanningActive, isFocused, scanLinePosition, currentBatch]);

  useEffect(() => {
    // ... existing code ...
  }, []);

  useEffect(() => {
    // ... existing code ...
  }, [resetState]);

  const resetState = useCallback(() => {
    // ... existing code ...
  }, []);

  if (!cameraPermissionInfo || !mediaLibraryPermissionInfo || !locationPermissionInfo) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={COLORS.primary} />
        <Text style={styles.loadingText}>Requesting permissions...</Text>
      </View>
    );
  }

  if (!permissionsReady) {
    return (
      <View style={styles.permissionContainer}>
        <Ionicons name="alert-circle" size={60} color={COLORS.error} />
        <Text style={styles.permissionText}>
          {/* ... existing code ... */}
        </Text>
        <TouchableOpacity 
          style={styles.permissionButton}
          onPress={async () => {
            // ... existing code ...
          }}
        >
          <Text style={styles.permissionButtonText}>Grant Permissions</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar style="light" />
      <View style={styles.container}>
        {/* Camera flash effect */}
        <Animated.View
          style={[
            styles.flashEffect,
            { opacity: flashOpacity },
          ]}
        />
        <CameraView
          ref={cameraRef}
          style={styles.camera}
          facing={cameraType}
          onCameraReady={() => {
            console.log('Camera ready');
            setCameraReady(true);
          }}
          barcodeScannerSettings={{
            barcodeTypes: ['code128', 'code39', 'code93', 'codabar', 'ean13', 'ean8', 'upc_e', 'datamatrix', 'qr', 'pdf417', 'aztec', 'itf14']
          }}
          onBarcodeScanned={isScanningActive ? handleBarCodeScanned : undefined}
          enableTorch={torch}
          flashMode={flashEnabled ? 'on' : 'off'}
          zoom={zoomLevel}
          {...panResponder.panHandlers}
          onMountError={(error) => {
            console.error('Camera mount error:', error);
            setScanFeedback('Camera error. Please restart the app.');
            logErrorToFile('camera_mount_error', new Error(String(error)));
          }}
        >
          {/* Scanning overlay and UI elements */}
          {isScanningActive && (
            <View style={styles.scanFrameContainer}>
              <View style={styles.scanFrame}>
                <Animated.View style={[styles.scanLine, {
                  transform: [{
                    translateY: scanLineAnimation.interpolate({
                      inputRange: [0, 1],
                      outputRange: [0, SCAN_FRAME_SIZE]
                    })
                  }]
                }]} />
              </View>
              <Text style={styles.scanText}>{scanFeedback}</Text>
            </View>
          )}
        </CameraView>
        {/* Top controls */}
        <View style={[styles.topControls, { marginTop: insets.top }]}>
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
            <View style={styles.manualInputHeader}>
              <Text style={styles.manualInputTitle}>Enter ID Number</Text>
              <TouchableOpacity 
                style={styles.closeButton} 
                onPress={() => setShowManualInput(false)}
              >
                <Ionicons name="close" size={24} color={COLORS.white} />
              </TouchableOpacity>
            </View>
            <View style={styles.manualInputContainer}>
              <TextInput
                ref={manualInputRef}
                style={styles.manualInput}
                placeholder="Enter part or order number"
                placeholderTextColor="rgba(255,255,255,0.6)"
                value={manualIdInput}
                onChangeText={setManualIdInput}
                autoCapitalize="characters"
                autoCorrect={false}
                returnKeyType="done"
                onSubmitEditing={handleManualIdSubmit}
              />
              <TouchableOpacity style={styles.manualInputButton} onPress={handleManualIdSubmit}>
                <Ionicons name="checkmark" size={24} color={COLORS.white} />
              </TouchableOpacity>
            </View>
            <Text style={styles.manualInputHint}>Format example: INV-12345</Text>
          </View>
        )}
        
        {/* Batch info display with enhanced aviation context */}
        {currentBatch && !showManualInput && (
          <View style={[styles.overlayContainer, { top: insets.top + 60, padding: SPACING.medium }]}>
            <View style={styles.batchInfoContainer}>
              <Text style={styles.batchInfoText}>
                {currentBatch.type}: {identifier}
              </Text>
              <Text style={styles.photoCountText}>
                Photos: {photoBatch.length} | Part Type: {
                  identifier.startsWith('ENG-') ? 'Engine' : 
                  identifier.startsWith('STRUCT-') ? 'Structural' : 
                  identifier.startsWith('ELEC-') ? 'Electrical' : 'General'
                }
              </Text>
            </View>
          </View>
        )}
        
        {/* Bottom controls with enhanced camera features */}
        <View style={styles.controlsContainer}>
          {/* Flash and Zoom Controls */}
          <View style={styles.cameraControls}>
            {/* Flash control for low-light environments */}
            <TouchableOpacity
              style={[styles.controlButton, flashEnabled && styles.controlButtonActive]}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                setFlashEnabled(!flashEnabled);
              }}
              activeOpacity={0.7}
            >
              <Ionicons
                name={flashEnabled ? "flash" : "flash-off"}
                size={24}
                color={COLORS.white}
              />
              <Text style={styles.controlButtonText}>
                {flashEnabled ? "Flash On" : "Flash Off"}
              </Text>
            </TouchableOpacity>
            
            {/* Zoom controls - only show when batch is active */}
            {currentBatch && (
              <View style={styles.zoomContainer}>
                <Text style={styles.zoomText}>Zoom: {Math.round(zoomLevel * 100)}%</Text>
                <View style={styles.zoomControls}>
                  <TouchableOpacity 
                    style={styles.zoomButton}
                    onPress={() => {
                      const newZoom = Math.max(0, zoomLevel - 0.1);
                      setZoomLevel(newZoom);
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    }}
                    disabled={zoomLevel <= 0}
                  >
                    <Ionicons name="remove" size={20} color={COLORS.white} />
                  </TouchableOpacity>
                  
                  <View style={styles.zoomBar}>
                    <View style={[styles.zoomBarFill, { width: `${(zoomLevel / MAX_ZOOM) * 100}%` }]} />
                  </View>
                  
                  <TouchableOpacity 
                    style={styles.zoomButton}
                    onPress={() => {
                      const newZoom = Math.min(MAX_ZOOM, zoomLevel + 0.1);
                      setZoomLevel(newZoom);
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    }}
                    disabled={zoomLevel >= MAX_ZOOM}
                  >
                    <Ionicons name="add" size={20} color={COLORS.white} />
                  </TouchableOpacity>
                </View>
              </View>
            )}
          </View>
          
          <View style={styles.bottomControls}>
            <TouchableOpacity
              style={styles.galleryButton}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                navigation.navigate('PhotoGallery');
              }}
              activeOpacity={0.7}
            >
              <Ionicons name="images" size={28} color={COLORS.white} />
            </TouchableOpacity>
            
            <TouchableOpacity 
              style={[styles.captureButton, (!cameraReady || isCapturing) && styles.captureButtonDisabled]}
              onPress={() => takePicture(false)}
              disabled={isCapturing || !cameraReady}
              activeOpacity={0.7}
            >
              <View style={[styles.captureButtonInner, isCapturing && styles.captureButtonInnerDisabled]} />
            </TouchableOpacity>
            
            <TouchableOpacity
              style={[styles.defectButton, (photoBatch.length === 0 || !cameraReady || isCapturing) && styles.disabledButton]}
              onPress={() => takePicture(true)}
              disabled={isCapturing || !cameraReady || photoBatch.length === 0}
              activeOpacity={0.7}
            >
              <Ionicons name="alert-circle" size={28} color={photoBatch.length === 0 ? COLORS.grey400 : COLORS.white} />
              <Text style={[styles.defectButtonText, photoBatch.length === 0 && styles.disabledText]}>Defect</Text>
            </TouchableOpacity>
          </View>

          {/* Bottom Row with Finish Button - Enhanced for aviation QC workflows */}
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
                <Text style={styles.finishButtonText}>Complete Inspection</Text>
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
