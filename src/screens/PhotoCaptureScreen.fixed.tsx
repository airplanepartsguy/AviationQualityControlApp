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

// All existing code before the render method...

// The final return statement with proper JSX structure:
return (
  <GestureHandlerRootView style={{ flex: 1 }}>
    <SafeAreaView style={styles.safeArea}>
      <StatusBar style="light" backgroundColor={COLORS.black} />
      {/* Main content View starts here, after StatusBar and potential global overlays */}
      <View style={{flex: 1}}>
        
        {/* This is where all existing content should go */}
        
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
