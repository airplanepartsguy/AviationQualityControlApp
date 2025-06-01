import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Image, Alert,
  ActivityIndicator, Platform, SafeAreaView, Dimensions, TextInput,
  Animated, Easing, Vibration, Linking
} from 'react-native';
import { Picker } from '@react-native-picker/picker';
import { StatusBar } from 'expo-status-bar';
import { CameraView, useCameraPermissions, CameraCapturedPicture, CameraType, CameraMountError } from 'expo-camera';

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
import { PinchGestureHandler, State as GestureState, GestureHandlerRootView } from 'react-native-gesture-handler';

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

// Props type for the PhotoCaptureScreen component
interface PhotoCaptureScreenProps {
  route: PhotoCaptureScreenRouteProp;
  // navigation is accessed via useNavigation hook, so not listed as a direct prop here
}

const { width: screenWidth, height: screenHeight } = Dimensions.get('window');
const SCAN_DEBOUNCE_DELAY = 300; // 300ms debounce for scans
const SCAN_FRAME_SIZE = Math.min(screenWidth * 0.7, 280); // Responsive scan frame size
const ANIMATION_DURATION = 2000; // Animation duration in ms
const FEEDBACK_DURATION = 1500; // Feedback display duration in ms
const HAPTIC_DURATION = 100; // Haptic feedback duration in ms

// Photo classification options
const PHOTO_TITLE_OPTIONS = [
  'General Picture',
  'Data Plate',
  'Defect',
  'Part Overview',
  'Serial Number',
  'Test Certificate',
  'Packaging',
  'Shipping Label',
  'Quality Stamp'
];

// Styles - Optimized and organized by component area for aviation quality control
const styles = StyleSheet.create({
  // New styles for layout structure
  cameraWrapper: {
    flex: 1,
  },
  // Main bottom action area with merged styles
  bottomActionArea: {
    paddingHorizontal: SPACING.medium,
    paddingBottom: SPACING.medium, // Base padding, safe area insets will add to this if needed via SafeAreaView
    paddingVertical: SPACING.medium,
    backgroundColor: COLORS.grey900,
    borderTopWidth: 1,
    borderTopColor: COLORS.grey800,
    width: '100%',
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    zIndex: 2,
  },
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
  primaryPermissionButton: {
    backgroundColor: COLORS.secondary, // Or COLORS.primaryDark for more emphasis
    paddingVertical: SPACING.small,
    paddingHorizontal: SPACING.medium,
    borderRadius: BORDER_RADIUS.small,
    marginTop: SPACING.medium,
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 10, // Keep zIndex if other elements might overlap, though less likely now
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
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  scanFrameContainer: {
    alignItems: 'center',
  },
  scanFrame: {
    width: SCAN_FRAME_SIZE,
    height: SCAN_FRAME_SIZE,
    borderWidth: 3,
    borderColor: 'rgba(255, 215, 0, 0.8)', // More visible gold/yellow color
    borderRadius: BORDER_RADIUS.small,
    overflow: 'hidden',
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    shadowColor: '#FFD700',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.5,
    shadowRadius: 12,
    elevation: 8,
  },
  scanLine: {
    height: 3,
    width: '100%',
    backgroundColor: '#FFD700', // Matching gold color for better visibility
    position: 'absolute',
    shadowColor: '#FFD700',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.9,
    shadowRadius: 6,
    elevation: 7,
  },
  // Removed duplicate scanText definition
  topControlsContainer: {
    position: 'absolute',
    top: 0, // Will be adjusted by insets.top in usage
    left: 0,
    right: 0,
    paddingHorizontal: SPACING.medium,
    zIndex: 5, // Ensure it's above camera but below critical modals
    // alignItems: 'center', // Uncomment if children should be centered horizontally
  },
  pickerContainer: {
    flex: 1, // Allows it to grow and take available space in its flex row parent
    height: 56, // Increased height for better touchability with gloves
    backgroundColor: 'rgba(40, 40, 40, 0.95)',
    borderRadius: BORDER_RADIUS.small,
    justifyContent: 'center', // Vertically center the Picker's content
    marginLeft: SPACING.small, // Space from the gallery icon
    paddingHorizontal: SPACING.medium, // Increased padding for better readability
    overflow: 'hidden', // Prevent text from visually overflowing if possible
    borderWidth: 1.5,
    borderColor: 'rgba(255, 215, 0, 0.5)', // Subtle gold border for consistency
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.4,
    shadowRadius: 3,
  },
  picker: {
    color: '#FFFFFF',
    height: 56, // Match updated container height
    width: '100%', // Take full width of its container
    fontWeight: '500',
  },
  pickerItem: {
    fontSize: FONTS.medium, // Style for items in the dropdown if possible
    color: Platform.OS === 'android' ? COLORS.text : COLORS.primary, // Android text color, iOS uses tintColor
    fontWeight: '500',
    letterSpacing: 0.5,
  },
  // Styles for Scan Frame Corners
  cornerBase: {
    position: 'absolute',
    width: 24,
    height: 24,
    borderColor: 'rgba(255, 215, 0, 0.8)', // Match scan frame gold color
    borderWidth: 4,
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
    fontWeight: '600',
    color: '#FFD700', // Gold color to match scan frame
    marginTop: SPACING.medium,
    textAlign: 'center',
    backgroundColor: 'rgba(0,0,0,0.7)',
    paddingHorizontal: SPACING.medium,
    overflow: 'hidden',
    paddingVertical: SPACING.small,
    borderRadius: BORDER_RADIUS.small,
    textShadowColor: 'rgba(0,0,0,0.75)',
    textShadowOffset: {width: 1, height: 1},
    textShadowRadius: 3,
    letterSpacing: 0.5,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
  },
  topControls: {
    position: 'absolute',
    top: 12, // Moved up closer to the blue navigation bar
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.medium,
    paddingVertical: SPACING.small,
    zIndex: 10,
  },
  backButton: {
    width: 50, // Increased size for better touchability with gloves
    height: 50, // Increased size for better touchability with gloves
    borderRadius: 25,
    backgroundColor: 'rgba(40,40,40,0.95)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: 'rgba(255, 215, 0, 0.4)', // Subtle gold border for consistency
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.4,
    shadowRadius: 3,
  },
  topRightControls: {
    flexDirection: 'row',
  },
  iconButton: {
    width: 50, // Increased size for better touchability with gloves
    height: 50, // Increased size for better touchability with gloves
    borderRadius: 25, // Half of width/height for circular shape
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(40,40,40,0.95)', // Darker, more opaque background
    marginHorizontal: SPACING.small, // Increased spacing between buttons for gloved operation
    borderWidth: 1.5, // Increased border width for better visibility
    borderColor: 'rgba(255, 215, 0, 0.4)', // Subtle gold border for consistency
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.4,
    shadowRadius: 3,
  },
  iconButtonActive: {
    backgroundColor: 'rgba(255, 215, 0, 0.7)', // Gold color to match other accent elements
    borderColor: '#FFFFFF', // White border for active state
    borderWidth: 2, // Thicker border for better visibility in active state
    elevation: 6, // Increased elevation for better visual feedback
    shadowColor: 'rgba(255, 215, 0, 0.9)',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.6,
    shadowRadius: 5,
  },
  bottomControlsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: SPACING.medium,
    width: '100%',
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
    width: 84, // Increased size for better touchability with gloves
    height: 84, // Increased size for better touchability with gloves
    borderRadius: 42,
    backgroundColor: 'rgba(40, 167, 69, 0.85)', // More visible green with less transparency
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 4, // Thicker border for better visibility
    borderColor: '#FFFFFF', // Pure white for maximum contrast
    alignSelf: 'center',
    elevation: 8, // Increased elevation for more prominence
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.6,
    shadowRadius: 5,
    marginVertical: SPACING.small, // Added margin for better spacing
  },
  captureButtonInner: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#FFFFFF', // Pure white for maximum contrast
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.4,
    shadowRadius: 2,
  },
  captureButtonDisabled: {
    opacity: 0.5,
    backgroundColor: COLORS.grey600,
  },
  galleryButton: {
    width: 56, // Slightly larger for better touchability with gloves
    height: 56, // Slightly larger for better touchability with gloves
    borderRadius: BORDER_RADIUS.medium,
    backgroundColor: 'rgba(40,40,40,0.95)', // Darker, more opaque background
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
    borderWidth: 1.5, // Thicker border for better visibility
    borderColor: 'rgba(255, 215, 0, 0.5)', // Subtle gold border for consistency
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.4,
    shadowRadius: 3,
  },
  captureButtonInnerDisabled: {
    opacity: 0.5,
    backgroundColor: 'rgba(180,180,180,0.8)', // Light gray for better visibility in disabled state
    borderWidth: 1,
    borderColor: 'rgba(255, 215, 0, 0.3)', // Subtle gold border for consistency even in disabled state
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
    paddingVertical: SPACING.medium, // Increased padding for better touchability
    paddingHorizontal: SPACING.medium,
    borderRadius: BORDER_RADIUS.small,
    elevation: 5, // Increased elevation for better visibility
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.4,
    shadowRadius: 3,
    alignSelf: 'flex-end',
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.4)', // Light border for better contrast
    minHeight: 48, // Ensuring minimum touch target size
    minWidth: 110, // Ensuring adequate width for label
    justifyContent: 'center',
    width: '100%', // Match Review button width
  },
  defectButtonText: {
    fontSize: FONTS.small,
    fontWeight: '600',
    color: '#FFFFFF',
    letterSpacing: 0.5,
    textAlign: 'center',
    textShadowColor: 'rgba(0,0,0,0.5)',
    textShadowOffset: {width: 0.5, height: 0.5},
    textShadowRadius: 1,
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
    backgroundColor: 'rgba(40, 40, 40, 0.9)',
    padding: SPACING.small,
    borderRadius: BORDER_RADIUS.small,
    borderWidth: 1,
    borderColor: 'rgba(255, 215, 0, 0.4)', // Subtle gold border for consistency
  },
  manualInputTitle: {
    fontSize: FONTS.regular,
    fontWeight: '600',
    color: '#FFFFFF',
    letterSpacing: 0.5,
    textShadowColor: 'rgba(0,0,0,0.75)',
    textShadowOffset: {width: 1, height: 1},
    textShadowRadius: 2,
  },
  closeButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: 'rgba(50,50,50,0.9)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.3)',
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 2,
  },
  manualInputContainer: {
    flexDirection: 'row',
    backgroundColor: 'rgba(50, 50, 50, 0.95)',
    borderRadius: BORDER_RADIUS.small,
    marginBottom: SPACING.medium,
    overflow: 'hidden',
    width: '100%',
    borderWidth: 1.5,
    borderColor: 'rgba(255, 215, 0, 0.5)', // Subtle gold border for consistency with scan frame
    elevation: 5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.4,
    shadowRadius: 4,
    height: 56, // Increased height for better touchability with gloves
  },
  manualInput: {
    flex: 1,
    height: 56, // Match container height
    color: '#FFFFFF',
    paddingHorizontal: SPACING.medium,
    fontSize: FONTS.regular,
    fontWeight: '500', // Slightly bolder for better readability
    letterSpacing: 0.5, // Better character spacing for industrial displays
  },
  manualInputButton: {
    width: 70, // Wider button for better touchability with gloves
    height: 56, // Match container height
    backgroundColor: COLORS.secondary, // More vibrant color for better visibility
    justifyContent: 'center',
    alignItems: 'center',
    borderLeftWidth: 1.5,
    borderLeftColor: 'rgba(255, 215, 0, 0.5)', // Match container border
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: -1, height: 0 },
    shadowOpacity: 0.4,
    shadowRadius: 3,
  },
  manualInputHint: {
    fontSize: FONTS.small,
    color: 'rgba(255,255,255,0.85)',
    textAlign: 'center',
    backgroundColor: 'rgba(40,40,40,0.8)',
    paddingVertical: SPACING.tiny,
    paddingHorizontal: SPACING.small,
    borderRadius: BORDER_RADIUS.small,
    marginTop: SPACING.tiny,
    fontWeight: '500',
    letterSpacing: 0.3,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
  },
  batchInfoContainer: {
    backgroundColor: 'rgba(40, 40, 40, 0.95)',
    borderRadius: BORDER_RADIUS.small,
    padding: SPACING.medium,
    marginBottom: SPACING.medium,
    borderWidth: 1.5,
    borderColor: 'rgba(255, 215, 0, 0.5)', // Subtle gold border for consistency
    elevation: 5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.4,
    shadowRadius: 4,
  },
  batchInfoText: {
    fontSize: FONTS.medium, // Slightly larger font for better readability
    fontWeight: '600', // Using string value instead of FONTS.semiBold
    color: '#FFFFFF',
    letterSpacing: 0.5, // Increased for better clarity in industrial settings
    textShadowColor: 'rgba(0,0,0,0.5)',
    textShadowOffset: {width: 0.5, height: 0.5},
    textShadowRadius: 1,
  },
  photoCountText: {
    fontSize: FONTS.small,
    fontWeight: '500', // Using string value instead of FONTS.medium
    color: 'rgba(255, 215, 0, 0.9)', // Gold color for better highlighting of count
    marginTop: SPACING.small, // Slightly more separation
    letterSpacing: 0.5, // Increased for better clarity
    textShadowColor: 'rgba(0,0,0,0.5)',
    textShadowOffset: {width: 0.5, height: 0.5},
    textShadowRadius: 1,
  },
  // Removed duplicate successDetailText, original is at lines 99-105
  finishButton: {
    flexDirection: 'row',
    backgroundColor: COLORS.success,
    borderRadius: BORDER_RADIUS.small,
    paddingVertical: SPACING.medium, // Consistent padding
    paddingHorizontal: SPACING.medium, // Match defect button padding
    justifyContent: 'center', // Center contents for better appearance
    alignItems: 'center',
    marginTop: SPACING.medium,
    borderWidth: 1.5, // Thicker border for better visibility
    borderColor: 'rgba(255, 215, 0, 0.5)', // Matching gold border theme
    elevation: 5, // Increased elevation for better visibility
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.5,
    shadowRadius: 4,
    minHeight: 48, // Same height as defect button
    minWidth: 110, // Same width as defect button
    width: '100%', // Use full width of the container
  },
  finishButtonDisabled: {
    opacity: 0.5,
  },
  finishButtonText: {
    fontSize: FONTS.small,
    fontWeight: '600',
    color: '#FFFFFF',
    letterSpacing: 0.5,
    textAlign: 'center',
    textShadowColor: 'rgba(0,0,0,0.5)',
    textShadowOffset: {width: 0.5, height: 0.5},
    textShadowRadius: 1,
  },
  // Removed defectButtonText (lines 458-463) to debug duplicate key error
  finishButtonContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
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
    flexDirection: 'row',
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: SPACING.medium,
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: COLORS.black,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.1)',
    width: '100%',
    zIndex: 2,
  },
  // Bottom action area styling moved to main definition above
  
  // Photo classification styles
  photoClassificationContainer: {
    position: 'absolute',
    bottom: 160, // Moved higher up to prevent clashing with bottom controls
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: SPACING.medium,
    paddingVertical: SPACING.medium, // Increased padding for better touchability
    backgroundColor: 'rgba(30,30,30,0.95)', // Darker, more opaque background
    borderTopWidth: 1.5,
    borderBottomWidth: 1.5,
    borderColor: 'rgba(255, 215, 0, 0.4)', // Subtle gold border for consistency
    zIndex: 3,
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 5,
  },
  photoClassificationLabel: {
    color: '#FFFFFF',
    fontSize: FONTS.small,
    fontWeight: '600',
    marginRight: SPACING.medium,
    letterSpacing: 0.5,
    textShadowColor: 'rgba(0,0,0,0.75)',
    textShadowOffset: {width: 1, height: 1},
    textShadowRadius: 2,
    backgroundColor: 'rgba(40,40,40,0.8)',
    paddingHorizontal: SPACING.small,
    paddingVertical: SPACING.tiny,
    borderRadius: BORDER_RADIUS.small,
  },
  photoClassificationPickerContainer: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: 'rgba(50,50,50,0.95)',
    borderRadius: BORDER_RADIUS.small,
    borderWidth: 1.5,
    borderColor: 'rgba(255, 215, 0, 0.5)', // Subtle gold border for consistency
    paddingHorizontal: SPACING.medium,
    paddingVertical: SPACING.small,
    maxWidth: 240, // Slightly wider for better usability
    height: 48, // Consistent height for better touchability
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.4,
    shadowRadius: 3,
  },
  photoClassificationText: {
    color: '#FFFFFF',
    fontSize: FONTS.small,
    fontWeight: '600',
    letterSpacing: 0.5,
    textShadowColor: 'rgba(0,0,0,0.5)',
    textShadowOffset: {width: 0.5, height: 0.5},
    textShadowRadius: 1,
  },
  photoClassificationPicker: {
    width: '100%',
    color: '#FFFFFF',
    backgroundColor: 'transparent',
    height: 48, // Match container height
    fontWeight: '500',
  },
  zoomDisplayContainer: {
    backgroundColor: 'rgba(40,40,40,0.95)',
    borderRadius: BORDER_RADIUS.small,
    paddingHorizontal: SPACING.medium, // Increased horizontal padding for better visibility
    paddingVertical: SPACING.small, // Increased vertical padding for better visibility
    borderWidth: 1.5, // Thicker border for better visibility
    borderColor: 'rgba(255, 215, 0, 0.5)', // Matching gold border theme
    elevation: 4, // Added elevation for better visibility
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.4,
    shadowRadius: 3,
    minWidth: 70, // Ensuring minimum width for visibility
    marginHorizontal: SPACING.tiny,
  },
  zoomDisplayText: {
    color: '#FFFFFF',
    fontSize: FONTS.small,
    fontWeight: '600', // Using string value for better readability
    letterSpacing: 0.5, // Better character spacing for industrial displays
    textAlign: 'center',
    textShadowColor: 'rgba(0,0,0,0.5)',
    textShadowOffset: {width: 0.5, height: 0.5},
    textShadowRadius: 1,
  },
});

/**
 * PhotoCaptureScreen Component
 * 
 * A streamlined camera interface for industrial quality control photography.
 * Optimized for high-volume workflows in shipping & receiving environments.
 */

const PhotoCaptureScreen: React.FC<PhotoCaptureScreenProps> = ({ route }) => {
  // TODO: Verify PhotoCaptureScreenRouteProp in navigation types for route.params.batchId and route.params.identifier
  const navigation = useNavigation<PhotoCaptureScreenNavigationProp>();
  // 'route' is already available as a prop, no need to call useRoute() again.
  const isFocused = useIsFocused();
  const insets = useSafeAreaInsets();
  const auth = useAuth();
  // User ID is accessed from the user object within the auth context.
  const userId = auth.user?.id;
  
  const cameraRef = useRef<CameraView>(null);
  const manualInputRef = useRef<TextInput>(null);
  const lastScanTime = useRef<number>(0);
  const lastScannedRef = useRef<string | null>(null);
  const mountedRef = useRef<boolean>(false);
  
  const scanLineAnimation = useRef(new Animated.Value(0)).current;
  const feedbackOpacity = useRef(new Animated.Value(0)).current; // For the new feedback system

  const _baseZoom = useRef(0);

  const [cameraPermissionInfo, requestCameraPermission] = useCameraPermissions();
  const [mediaLibraryPermissionInfo, requestMediaLibraryPermission] = MediaLibrary.usePermissions();
  const [locationPermissionInfo, requestLocationPermission] = Location.useForegroundPermissions();
  
  const [torch, setTorch] = useState(false);
  const [cameraMode, setCameraMode] = useState<CameraType>('back');
  const [cameraReady, setCameraReady] = useState(false);
  const [isCapturing, setIsCapturing] = useState(false);
  const [zoomLevel, setZoomLevel] = useState(0); // 0 (zoomed out) to 1 (max zoom)
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
  const [selectedPhotoTitle, setSelectedPhotoTitle] = useState<string>('General Picture');

  const [feedback, setFeedback] = useState<{visible: boolean, message: string, type: 'success' | 'error'}>({visible: false, message: '', type: 'success'});

  const ZOOM_STEP = 0.1;

  const handleZoomIn = useCallback(() => {
    setZoomLevel(prevZoom => Math.min(prevZoom + ZOOM_STEP, 1.0));
    // Haptic feedback can be added here if desired, after triggerHapticFeedback is defined
  }, []);

  const handleZoomOut = useCallback(() => {
    setZoomLevel(prevZoom => Math.max(prevZoom - ZOOM_STEP, 0.0));
    // Haptic feedback can be added here if desired
  }, []);

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
        setScanFeedback('Scan order barcode or enter ID manually.');
        setIsScanningActive(true);
        resetBatch(true);
      }
    } else if (isFocused) {
      // route.params is undefined, treat as a fresh start
      setIdentifier('New Session');
      setIdentifierType('Single');
      setScanFeedback('Scan order barcode or enter ID manually.');
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
      const newIdType = cleanId.startsWith('ORD-') ? 'Order' : 'Inventory'; // Moved declaration up
      console.log(`[PCS_DEBUG] handleScannedIdSubmit: Attempting to create batch with cleanId=${cleanId}, newIdType=${newIdType}`);
      await ensureDbOpen();
      // TODO: Verify return type of createPhotoBatch (e.g., string or number for batchId)
      // Always use scanned ID as orderNumber to ensure it displays on Dashboard
      // Fix for the issue where scanned IDs weren't showing up on Dashboard
      console.log(`[PCS_DEBUG] handleScannedIdSubmit: Calling createPhotoBatch with userId=${userId || 'unknown_user'}, cleanId=${cleanId}, orderNumArg=${cleanId}, invIdArg=${newIdType === 'Inventory' ? cleanId : undefined}`);
      const batchId = await createPhotoBatch(
        userId || 'unknown_user',
        cleanId, // Pass cleanId as referenceId
        cleanId, // Always use the scanned ID as orderNumber for proper Dashboard display
        newIdType === 'Inventory' ? cleanId : undefined
      );
      if (!mountedRef.current) return;
      console.log(`[PCS_DEBUG] handleScannedIdSubmit: Batch created with batchId=${batchId}`);

      const newBatchData: PhotoBatch = {
        id: batchId, // batchId is a number, PhotoBatch.id is a number
        type: newIdType,
        referenceId: cleanId,
        orderNumber: newIdType === 'Order' ? cleanId : undefined,
        inventoryId: newIdType === 'Inventory' ? cleanId : undefined,
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
      console.error(`[PCS_DEBUG] handleScannedIdSubmit: Error during batch creation for ${cleanId}:`, error);
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

  // Pinch to Zoom Handlers
  const onPinchHandlerStateChangeSimplified = (event: any) => {
    const { nativeEvent } = event;
    if (nativeEvent.state === GestureState.BEGAN) {
      _baseZoom.current = zoomLevel; // Capture zoom at gesture start
    } else if (nativeEvent.oldState === GestureState.ACTIVE && nativeEvent.state !== GestureState.ACTIVE) {
      // Update base zoom to the final zoom level after the gesture for the next gesture.
      _baseZoom.current = zoomLevel;
    }
  };

  const onPinchGestureEventSimplified = (event: any) => {
    const { nativeEvent } = event;
    if (nativeEvent.state === GestureState.ACTIVE) {
      // nativeEvent.scale is a factor; 1.0 means no change from the start of the pinch.
      // Adjust zoom additively from the zoom level at the start of the pinch.
      let newZoom = _baseZoom.current + (nativeEvent.scale - 1.0);
      newZoom = Math.max(0, Math.min(1, newZoom)); // Clamp between 0 and 1
      setZoomLevel(newZoom);
    }
  };

  const toggleManualInput = useCallback(() => {
    if (!mountedRef.current) return;
    setShowManualInput((prev: boolean) => {
      const newShowManualInput = !prev;
      if (newShowManualInput) {
        setIsScanningActive(false);
        // Consider focusing input here if refs are set up
        // setTimeout(() => manualInputRef.current?.focus(), 100);
      } else {
        // Only re-enable scanning if no batch is active, otherwise stay in capture mode
        if (!currentBatch) setIsScanningActive(true);
      }
      return newShowManualInput;
    });
  }, [currentBatch, mountedRef, setIsScanningActive]);

  const processAndSavePhoto = useCallback(async (photo: CameraCapturedPicture, isDefect: boolean) => {
    if (!currentBatch || !mountedRef.current) {
      showFeedbackAnimation('No active batch.', 'error');
      if (mountedRef.current) setIsLoading(false);
      return;
    }
    if (!mountedRef.current) return;
    setIsLoading(true);
    setScanFeedback('Processing photo...');
    try {
      const metadata: PhotoMetadata = {
        timestamp: new Date().toISOString(),
        userId: userId || 'unknown-user',
        deviceModel: `${Platform.OS} ${Platform.Version}`,
        hasDefects: isDefect,
      };
      const newPhotoId = Crypto.randomUUID();

      const photoDataToSave: PhotoData = {
        id: newPhotoId,
        batchId: currentBatch.id,
        uri: photo.uri,
        orderNumber: currentBatch.orderNumber || (currentBatch.type === 'Order' ? currentBatch.referenceId : undefined),
        inventoryId: currentBatch.inventoryId || (currentBatch.type === 'Inventory' ? currentBatch.referenceId : undefined),
        metadata,
        syncStatus: 'pending',
        photoTitle: selectedPhotoTitle, // Added photoTitle
      };

      const savedPhotoId = await savePhoto(currentBatch.id, photoDataToSave);

      if (!mountedRef.current) return;

      const finalPhotoData: PhotoData = { ...photoDataToSave, id: savedPhotoId };

      setPhotoBatch((prevValue: PhotoData[]) => [...prevValue, finalPhotoData]); // Typed 'prevValue'
      setLastCapturedPhoto(finalPhotoData);

      if (!mountedRef.current) return;
      showFeedbackAnimation(`${isDefect ? 'Defect' : 'Photo'} Saved`, 'success');
      logAnalyticsEvent('photo_saved_to_db', { batchId: currentBatch.id, photoId: savedPhotoId, isDefect });

    } catch (error) {
      if (!mountedRef.current) return;
      console.error('Error processing/saving photo:', error);
      const err = error instanceof Error ? error : new Error(String(error));
      showFeedbackAnimation(`Error Saving Photo: ${err.message.substring(0,30)}`, 'error');
      logErrorToFile('processAndSavePhoto_error', err);
    } finally {
      if (mountedRef.current) {
        setIsLoading(false);
        setScanFeedback(isScanningActive ? 'Scan barcode or QR code' : 'Ready to capture');
      }
    }
  }, [currentBatch, userId, mountedRef, setIsLoading, setScanFeedback, savePhoto, setPhotoBatch, setLastCapturedPhoto, showFeedbackAnimation, logAnalyticsEvent, logErrorToFile, isScanningActive, selectedPhotoTitle, Platform, Crypto]);

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
      
      // Auto-mark as defect if the photo type is 'Defect'
      const shouldMarkAsDefect = isDefect || selectedPhotoTitle === 'Defect';
      
      await processAndSavePhoto(photo, shouldMarkAsDefect);
      logAnalyticsEvent('photo_captured_raw', { batchId: currentBatch.id, isDefect: shouldMarkAsDefect });
    } catch (error: any) {
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
          {cameraPermissionInfo?.canAskAgain && (
            <TouchableOpacity style={styles.permissionButton} onPress={requestCameraPermission}>
              <Text style={styles.permissionButtonText}>Grant Camera Permission</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity 
            style={[styles.permissionButton, !cameraPermissionInfo?.canAskAgain && styles.primaryPermissionButton]} 
            onPress={() => Linking.openSettings()}
          >
            <Text style={styles.permissionButtonText}>Open Settings</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }
  
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaView style={styles.safeArea}>
        <StatusBar style="light" backgroundColor={COLORS.black} />
        {/* Main content View starts here, after StatusBar and potential global overlays */}
        <View style={{flex: 1}}>

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

          {/* Conditional rendering for isLoading and cameraReady overlay */}
          {isLoading && cameraReady && !isCapturing && (
            <View style={styles.loadingOverlay}>
              <ActivityIndicator size="large" color={COLORS.primary} />
              <Text style={styles.loadingText}>{scanFeedback || 'Processing...'}</Text>
            </View>
          )}

      <PinchGestureHandler
        onGestureEvent={onPinchGestureEventSimplified}
        onHandlerStateChange={onPinchHandlerStateChangeSimplified}
      >
        <View style={{flex: 1}}>{/* Wrapper View for PinchGestureHandler */}
          <CameraView
            ref={cameraRef}
            style={styles.camera}
            facing={cameraMode}
            onCameraReady={() => { if (mountedRef.current) setCameraReady(true); }}
            zoom={zoomLevel}
            ratio="4:3"
            barcodeScannerSettings={{
              barcodeTypes: ['qr', 'datamatrix', 'code128', 'code39', 'ean13', 'upc_a', 'pdf417', 'aztec'],
            }}
            onBarcodeScanned={isScanningActive && cameraReady && !isLoading ? handleBarCodeScanned : undefined}
            enableTorch={torch}
            onMountError={(event: CameraMountError) => {
              if (!mountedRef.current) return;
              console.error('Camera mount error:', event.message);
              const err = new Error(event.message);
              showFeedbackAnimation('Camera Mount Error', 'error');
              logErrorToFile('camera_mount_error', err);
            }}
          />
          {/* scanOverlay is now a sibling, positioned absolutely */}
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
                <Text style={styles.scanText}>Scan Order Barcode</Text>
              </View>
            </View>
          )}
          </View>
        {/* Closing Wrapper View for PinchGestureHandler */}
      </PinchGestureHandler>

      {/* TOP OVERLAY CONTROLS */}
      <View style={styles.topControls}>
        <TouchableOpacity style={styles.iconButton} onPress={() => resetBatch()} disabled={isLoading}>
          <Ionicons name="refresh" size={24} color={COLORS.white} />
        </TouchableOpacity>
        
        <View style={styles.topRightControls}>
          <TouchableOpacity style={styles.iconButton} onPress={() => setCameraMode((currentMode: CameraType) => currentMode === 'back' ? 'front' : 'back')} disabled={isLoading || !cameraReady}>
            <Ionicons name="camera-reverse-outline" size={24} color={COLORS.white} />
          </TouchableOpacity>
          <View style={styles.zoomDisplayContainer}>
            <Text style={styles.zoomDisplayText}>{(1 + zoomLevel * 9).toFixed(1) + 'x'}</Text>
          </View>
          <TouchableOpacity style={[styles.iconButton, torch && styles.iconButtonActive]} onPress={() => { setTorch((t: boolean) => !t); triggerHapticFeedback(Haptics.ImpactFeedbackStyle.Light); }} disabled={isLoading || !cameraReady}>
            <Ionicons name={torch ? "flash" : "flash-off"} size={24} color={COLORS.white} />
          </TouchableOpacity>
        </View>
      </View>
      
      {/* Record identifier badge positioned below top controls */}
      {currentBatch && identifier && (
        <View style={{
          position: 'absolute',
          top: 70, // Position below the top controls
          left: SPACING.medium,
          backgroundColor: 'rgba(0,0,0,0.7)',
          borderRadius: 16,
          paddingHorizontal: 12,
          paddingVertical: 6,
          borderWidth: 1,
          borderColor: COLORS.primary,
          flexDirection: 'row',
          alignItems: 'center',
          zIndex: 5
        }}>
          <Ionicons 
            name={identifier.startsWith('ORD-') ? 'document-text' : 'cube'} 
            size={16} 
            color={COLORS.primary} 
            style={{marginRight: 4}} 
          />
          <Text style={{
            color: COLORS.white,
            fontSize: FONTS.small,
            fontWeight: 'bold'
          }}>{identifier}</Text>
        </View>
      )}
          <TouchableOpacity
            style={styles.iconButton}
            onPress={() => { handleZoomOut(); triggerHapticFeedback(Haptics.ImpactFeedbackStyle.Light); }}
            disabled={isLoading || !cameraReady || zoomLevel <= 0}
          >
            <Ionicons name="remove-circle-outline" size={24} color={COLORS.white} />
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.iconButton}
            onPress={() => { handleZoomIn(); triggerHapticFeedback(Haptics.ImpactFeedbackStyle.Light); }}
            disabled={isLoading || !cameraReady || zoomLevel >= 1.0}
          >
            <Ionicons name="add-circle-outline" size={24} color={COLORS.white} />
          </TouchableOpacity>
          {(isScanningActive || !currentBatch) && !showManualInput && (
            <TouchableOpacity style={styles.iconButton} onPress={toggleManualInput} disabled={isLoading}>
              <Ionicons name="keypad-outline" size={24} color={COLORS.white} />
            </TouchableOpacity>
          )}
        </View>
      </View>
      {/* End of cameraWrapper */}
      
      {/* PHOTO CLASSIFICATION DROPDOWN - Using simplified approach for all platforms */}
      <View style={{
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: SPACING.medium,
        paddingVertical: SPACING.small,
        backgroundColor: COLORS.grey900,
        borderTopWidth: 1,
        borderTopColor: COLORS.grey800,
      }}>
        <Text style={{
          fontSize: FONTS.small,
          fontWeight: FONTS.semiBold,
          color: COLORS.white,
          marginRight: SPACING.small,
        }}>Photo Type:</Text>
        
        {/* Using touchable for all platforms to avoid text string errors with Picker */}
        <TouchableOpacity 
          style={{
            flex: 1,
            flexDirection: 'row',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: SPACING.small,
            borderRadius: BORDER_RADIUS.small,
            backgroundColor: 'rgba(0,0,0,0.4)',
          }}
          onPress={() => {
            Alert.alert(
              'Select Photo Type',
              'Choose the type of photo you are taking:',
              PHOTO_TITLE_OPTIONS.map(option => ({
                text: option,
                onPress: () => setSelectedPhotoTitle(option)
              })),
              { cancelable: true }
            );
          }}
        >
          <Text style={{ color: COLORS.white }}>{selectedPhotoTitle}</Text>
          <Ionicons name="chevron-down" size={16} color={COLORS.white} />
        </TouchableOpacity>
      </View>

      {/* BOTTOM ACTION AREA */}
      <View style={[styles.bottomActionArea, { paddingBottom: Math.max(insets.bottom, SPACING.medium) }]}>
        <View style={styles.bottomControlsRow}>
          {/* Left Section: Gallery + Picker */}
          <View style={{ flexDirection: 'row', alignItems: 'center', width: '30%' }}> 
            <TouchableOpacity
              style={styles.galleryButton}
              onPress={() => { if (currentBatch) { navigation.navigate('BatchPreview', { batchId: currentBatch.id, identifier: currentBatch.referenceId }); } }}
              disabled={isLoading || !currentBatch}
            >
              {lastCapturedPhoto && lastCapturedPhoto.uri ? (
                <Image 
                  source={{ uri: lastCapturedPhoto.uri }} 
                  style={{ width: '100%', height: '100%', borderRadius: BORDER_RADIUS.medium }} 
                />
              ) : (
                <Ionicons name="images" size={28} color={COLORS.white} />
              )}
            </TouchableOpacity>
          </View>

          {/* Center: Capture Button */}
          <View style={{ alignItems: 'center', justifyContent: 'center', width: '40%' }}>
            <TouchableOpacity
              style={[styles.captureButton, (isCapturing || !cameraReady || !currentBatch) && styles.captureButtonDisabled]}
              onPress={() => takePicture(false)}
              disabled={isCapturing || !cameraReady || !currentBatch || isLoading}
            >
              <View style={styles.captureButtonInner} />
            </TouchableOpacity>
          </View>

          {/* Right Section: Review Button Only */}
          <View style={{ alignItems: 'center', justifyContent: 'center', width: '30%', paddingRight: SPACING.small }}>
            {currentBatch && (
              <TouchableOpacity 
                style={[
                  styles.finishButton,
                  (isLoading || photoBatch.length === 0) && styles.disabledButton
                ]}
                onPress={() => {
                  if (currentBatch) {
                    navigation.navigate('BatchPreview', { batchId: currentBatch.id, identifier: currentBatch.referenceId || identifier });
                  }
                }}
                disabled={isLoading || !currentBatch || photoBatch.length === 0}
              >
                <View style={styles.finishButtonContent}>
                  <Text style={styles.finishButtonText}>
                    Review ({photoBatch.length || 0})
                  </Text>
                  <Ionicons name="arrow-forward" size={18} color={COLORS.white} style={{marginLeft: SPACING.small}} />
                </View>
              </TouchableOpacity>
            )}
          </View>
        </View>
      </View>
    </View>
  </SafeAreaView>
</GestureHandlerRootView>
);
};

export default PhotoCaptureScreen;
