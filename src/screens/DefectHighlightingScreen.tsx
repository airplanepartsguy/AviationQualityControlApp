import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  Image,
  TouchableOpacity,
  SafeAreaView,
  StyleSheet,
  Alert,
  Modal,
  TextInput,
  ScrollView,
  GestureResponderEvent,
  Dimensions,
  TouchableWithoutFeedback,
  StatusBar,
  Platform,
  KeyboardAvoidingView,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRoute, useNavigation } from '@react-navigation/native';
import { COLORS, SPACING, FONTS, SHADOWS, BORDER_RADIUS } from '../styles/theme';
import CustomButton from '../components/CustomButton';
import { PhotoData, AnnotationData } from '../types/data';
import { logAnalyticsEvent } from '../services/analyticsService';
import { trackPerformance, useRenderTracker, createTrackedFunction } from '../utils/performanceMonitor';
import useImagePreloader from '../hooks/useImagePreloader';
import { DefectHighlightingScreenProps } from '../types/navigation';

// Get screen dimensions for responsive layouts
const { width: screenWidth, height: screenHeight } = Dimensions.get('window');

// Color mapping for defect severity
const DEFECT_SEVERITY_COLORS = {
  'Minor': '#FFEB3B',    // Yellow
  'Moderate': '#FF9800', // Orange
  'Critical': '#F44336', // Red
  'None': '#9E9E9E',     // Grey
};

/**
 * DefectHighlightingScreen Component
 * 
 * This screen allows users to mark and annotate defects on aircraft part photos.
 * Users can add annotations, specify severity, and add notes for each annotation.
 * 
 * Performance optimizations:
 * - Uses useCallback for event handlers to prevent unnecessary re-renders
 * - Uses useMemo for expensive UI calculations
 * - Implements proper error handling with retry options
 * - Includes offline capability considerations
 */
const DefectHighlightingScreen: React.FC<DefectHighlightingScreenProps> = () => {
  // Track component renders in development mode
  useRenderTracker('DefectHighlightingScreen');
  const navigation = useNavigation<DefectHighlightingScreenProps['navigation']>();
  const route = useRoute<DefectHighlightingScreenProps['route']>();
  const { photo } = route.params || {};
  
  // State for defect status
  const [hasDefects, setHasDefects] = useState<boolean>(false);
  const [defectSeverity, setDefectSeverity] = useState<'Critical' | 'Moderate' | 'Minor' | 'None'>('Moderate');
  const [defectNotes, setDefectNotes] = useState<string>('');
  
  // State for annotations
  const [annotations, setAnnotations] = useState<AnnotationData[]>([]);
  const [selectedAnnotation, setSelectedAnnotation] = useState<AnnotationData | null>(null);
  
  // UI state
  const [showNotesModal, setShowNotesModal] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(false);
  const [currentColor, setCurrentColor] = useState<string>(DEFECT_SEVERITY_COLORS.Moderate);
  
  // Image state
  const [imageUri, setImageUri] = useState<string | null>(photo?.uri || null);
  const imageRef = useRef<Image>(null);
  
  // Use the image preloader hook for optimized image loading
  const { isLoaded, dimensions: imageDimensions, error: imageError, aspectRatio } = useImagePreloader(imageUri);

  // Guard against missing photo data
  useEffect(() => {
    if (!photo?.uri) {
      Alert.alert(
        'Error', 
        'Photo data is missing or corrupted.',
        [{ text: 'Go Back', onPress: () => navigation.goBack() }]
      );
      return;
    }
  }, [photo, navigation]);
  
  // Handle image loading errors
  useEffect(() => {
    if (imageError) {
      console.error('Image loading error:', imageError);
      Alert.alert(
        'Warning', 
        'Could not load image properly. Annotation positioning may be affected.',
        [{ text: 'Continue Anyway', style: 'default' }]
      );
    }
  }, [imageError]);

  // Handles when user taps on the image to create a new annotation
  const handleImagePress = useCallback((event: GestureResponderEvent) => {
    if (!imageUri) return;
    
    // Get touch coordinates relative to image
    const { locationX, locationY } = event.nativeEvent;
    
    const uniqueId = `annotation_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
    
    // Create an SVG path data for a circle at the tap location
    const radius = 15; // Size of the annotation marker
    const pathData = `M ${locationX} ${locationY} m -${radius} 0 a ${radius} ${radius} 0 1 0 ${radius*2} 0 a ${radius} ${radius} 0 1 0 -${radius*2} 0`;
    
    const newAnnotation: AnnotationData = {
      id: uniqueId,
      pathData,
      color: currentColor,
      notes: '',
      severity: defectSeverity,
      x: locationX,
      y: locationY
    };
    
    setAnnotations(prev => [...prev, newAnnotation]);
    setSelectedAnnotation(newAnnotation);
    setHasDefects(true);
    
    // Show notes modal for new annotation
    setShowNotesModal(true);
  }, [imageUri, currentColor, defectSeverity]);

  // Handles when user taps on an existing annotation
  const handleAnnotationPress = useCallback((annotation: AnnotationData) => {
    setDefectSeverity(annotation.severity);
    setCurrentColor(DEFECT_SEVERITY_COLORS[annotation.severity]);
    setSelectedAnnotation(annotation);
    setShowNotesModal(true);
  }, []);

  // Saves notes for the selected annotation
  const saveAnnotationNotes = useCallback((notes: string) => {
    if (!selectedAnnotation) return;
    
    setAnnotations(prevAnnotations => 
      prevAnnotations.map(annotation => 
        annotation.id === selectedAnnotation.id 
          ? { ...annotation, notes, severity: defectSeverity, color: DEFECT_SEVERITY_COLORS[defectSeverity] }
          : annotation
      )
    );
    
    setShowNotesModal(false);
    setSelectedAnnotation(null);
    
    // Log the annotation event for analytics
    logAnalyticsEvent('defect_annotated', {
      photoId: photo?.id,
      severity: defectSeverity,
      hasNotes: notes.trim().length > 0
    });
  }, [selectedAnnotation, defectSeverity, photo?.id]);

  // Clears all annotations from the image after confirmation
  const clearAllAnnotations = useCallback(() => {
    Alert.alert(
      'Clear All Annotations',
      'Are you sure you want to remove all annotations from this image?',
      [
        { text: 'Cancel', style: 'cancel' },
        { 
          text: 'Clear All', 
          style: 'destructive', 
          onPress: () => {
            setAnnotations([]);
            setHasDefects(false);
            setDefectNotes('');
          } 
        }
      ]
    );
  }, []);

  // Saves the photo with all annotations and metadata
  const savePhotoWithMetadata = useCallback(async () => {
    // Track the entire save operation performance
    setLoading(true);
    
    return await trackPerformance('Save photo with annotations', async () => {
      try {
        // Validate required data before proceeding
        if (!photo?.id) {
          throw new Error('Photo ID is missing');
        }

      // Update the photo data with annotation information
      const updatedPhoto: PhotoData = {
        ...photo,
        annotations: annotations,
        metadata: {
          ...photo.metadata,
          hasDefects,
          defectSeverity: hasDefects ? defectSeverity.toLowerCase() as 'critical' | 'moderate' | 'minor' : undefined,
          defectNotes
        }
      };
      
      // In a real app, we would save this to database or storage
      console.log('Saving photo with annotations:', updatedPhoto);
      
      // Save to local storage first (for offline capability)
      // This is where we would implement local database storage
      // For now, simulate a save operation
      const saveResult = await new Promise<boolean>((resolve) => {
        setTimeout(() => resolve(true), 300);
      });
      
      if (!saveResult) {
        throw new Error('Failed to save to local storage');
      }
      
      // Then try to sync with backend if online
      // This is where we would implement network requests to a backend
      // For now, simulate a backend sync
      await new Promise((resolve) => setTimeout(resolve, 200));
      
      // Log the event
      logAnalyticsEvent('photo_annotated', {
        photoId: photo?.id,
        annotationsCount: annotations.length,
        hasDefects
      });
      
      // Navigate back to batch preview screen
      Alert.alert(
        'Success',
        'Photo annotations saved successfully',
        [{ text: 'OK', onPress: () => navigation.goBack() }]
      );
    } catch (error) {
      console.error('Error saving annotations:', error);
      
      // More detailed error handling
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      
      // Log the error for analytics and debugging
      logAnalyticsEvent('error', {
        context: 'DefectHighlightingScreen',
        action: 'savePhotoWithMetadata',
        error: errorMessage
      });
      
      Alert.alert(
        'Error', 
        'Failed to save annotations. Please try again.',
        [
          { text: 'Cancel', style: 'cancel' },
          { 
            text: 'Retry', 
            onPress: () => savePhotoWithMetadata() 
          }
        ]
      );
      } finally {
        setLoading(false);
      }
    });
  }, [photo, annotations, hasDefects, defectSeverity, defectNotes, navigation]);

  // Memoize severity options to prevent unnecessary re-renders
  const severityOptions = useMemo(() => (
    <View style={styles.colorPickerContainer}>
      <Text style={styles.colorPickerLabel}>Select Defect Severity:</Text>
      <View style={styles.colorPicker}>
        {Object.entries(DEFECT_SEVERITY_COLORS).map(([severity, color]) => (
          <TouchableOpacity
            key={severity}
            style={[
              styles.colorOption,
              { backgroundColor: color },
              defectSeverity === severity && styles.selectedColorOption
            ]}
            onPress={() => {
              setDefectSeverity(severity as 'Critical' | 'Moderate' | 'Minor' | 'None');
              setCurrentColor(color);
            }}
          >
            <Text style={styles.colorName}>{severity}</Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  ), [defectSeverity]);

  // Memoize annotation markers to prevent unnecessary re-renders
  const annotationMarkers = useMemo(() => (
    <>
      {annotations.map((annotation) => (
        <TouchableOpacity
          key={annotation.id}
          style={[
            styles.annotationMarker,
            {
              left: annotation.x - 10,
              top: annotation.y - 10,
              backgroundColor: annotation.color,
              borderColor: COLORS.white
            }
          ]}
          onPress={() => handleAnnotationPress(annotation)}
        >
          <Text style={{ color: COLORS.white, fontSize: 10 }}>
            {annotation.notes ? '✓' : ''}
          </Text>
        </TouchableOpacity>
      ))}
    </>
  ), [annotations, handleAnnotationPress]);

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar backgroundColor={COLORS.background} barStyle="dark-content" />
      
      {!imageUri ? (
        <View style={styles.loadingContainer}>
          <Text style={styles.loadingText}>No photo available.</Text>
          <CustomButton 
            title="Go Back"
            onPress={() => navigation.goBack()}
            variant="primary"
          />
        </View>
      ) : (
        <>
          {/* Instructions */}
          <View style={styles.instructionsContainer}>
            <Ionicons name="information-circle-outline" size={24} color={COLORS.text} />
            <Text style={styles.instructions}>
              Tap on the image to mark defects. Select severity and add notes for each marker.
            </Text>
          </View>

          {/* Defect Severity Selector */}
          {severityOptions}
          
          {/* Photo with Annotations */}
          <View style={styles.imageContainer}>
            {!isLoaded ? (
              <ActivityIndicator size="large" color={COLORS.primary} style={styles.imageLoadingIndicator} />
            ) : (
              <>
                <TouchableWithoutFeedback onPress={handleImagePress}>
                  <Image
                    ref={imageRef}
                    source={{ uri: imageUri }}
                    style={[styles.image, { aspectRatio }]}
                    resizeMode="contain"
                  />
                </TouchableWithoutFeedback>
                
                {/* Annotation Markers */}
                {annotationMarkers}
              </>
            )}
          </View>
          
          {/* Footer */}
          <View style={styles.footer}>
            <View style={styles.footerInfo}>
              <Text style={styles.footerText}>
                {annotations.length} annotation{annotations.length !== 1 ? 's' : ''} marked
              </Text>
            </View>
            
            <View style={styles.footerButtons}>
              <CustomButton
                title="Clear All"
                onPress={clearAllAnnotations}
                variant="danger"
                icon={<Ionicons name="trash-outline" size={18} color={COLORS.white} />}
                style={styles.footerButton}
                disabled={annotations.length === 0}
              />
              
              <CustomButton
                title="Save & Continue"
                onPress={savePhotoWithMetadata}
                variant="primary"
                icon={<Ionicons name="checkmark-circle-outline" size={18} color={COLORS.white} />}
                style={styles.footerButton}
              />
            </View>
          </View>
          
          {/* Notes Modal */}
          <Modal
            visible={showNotesModal}
            transparent
            animationType="fade"
            onRequestClose={() => setShowNotesModal(false)}
          >
            <KeyboardAvoidingView 
              behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
              style={styles.modalOverlay}
            >
              <TouchableWithoutFeedback onPress={() => setShowNotesModal(false)}>
                <View style={styles.modalOverlay}>
                  <TouchableWithoutFeedback onPress={e => e.stopPropagation()}>
                    <View style={styles.modalContent}>
                      <View style={styles.modalHeader}>
                        <Text style={styles.modalTitle}>Defect Details</Text>
                        <TouchableOpacity onPress={() => setShowNotesModal(false)}>
                          <Ionicons name="close-circle-outline" size={24} color={COLORS.text} />
                        </TouchableOpacity>
                      </View>
                      
                      <TextInput
                        style={styles.notesInput}
                        placeholder="Add notes about this defect..."
                        multiline
                        value={selectedAnnotation?.notes || ''}
                        onChangeText={(text) => {
                          if (selectedAnnotation) {
                            setSelectedAnnotation({
                              ...selectedAnnotation,
                              notes: text
                            });
                          }
                        }}
                        autoFocus
                        returnKeyType="done"
                        blurOnSubmit
                        onSubmitEditing={() => saveAnnotationNotes(selectedAnnotation?.notes || '')}
                      />
                      
                      <View style={styles.modalButtons}>
                        <CustomButton
                          title="Cancel"
                          onPress={() => setShowNotesModal(false)}
                          variant="secondary"
                          style={styles.modalButton}
                        />
                        <CustomButton
                          title="Save Details"
                          onPress={() => saveAnnotationNotes(selectedAnnotation?.notes || '')}
                          variant="primary"
                          style={styles.modalButton}
                        />
                      </View>
                    </View>
                  </TouchableWithoutFeedback>
                </View>
              </TouchableWithoutFeedback>
            </KeyboardAvoidingView>
          </Modal>
          
          {/* Loading Overlay */}
          {loading && (
            <View style={styles.loadingOverlay}>
              <ActivityIndicator size="large" color={COLORS.primary} />
              <Text style={styles.loadingText}>Saving annotations...</Text>
            </View>
          )}
        </>
      )}
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: SPACING.medium,
    fontSize: FONTS.large,
    color: COLORS.text,
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.medium,
    paddingVertical: SPACING.small,
    backgroundColor: COLORS.white,
    ...SHADOWS.small,
  },
  headerTitle: {
    fontSize: FONTS.large,
    fontWeight: FONTS.bold,
    color: COLORS.text,
  },
  backButton: {
    width: 40, 
    alignItems: 'center',
  },
  saveButton: {
    width: 40, // To balance the header
  },
  instructionsContainer: {
    backgroundColor: COLORS.primaryLight,
    padding: SPACING.medium,
    flexDirection: 'row',
    alignItems: 'center',
  },
  instructions: {
    color: COLORS.text,
    fontSize: FONTS.small,
    marginLeft: SPACING.small,
    flex: 1,
  },
  colorPickerContainer: {
    backgroundColor: COLORS.white,
    padding: SPACING.medium,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  colorPickerLabel: {
    fontSize: FONTS.medium,
    fontWeight: FONTS.semiBold,
    color: COLORS.text,
    marginBottom: SPACING.small,
  },
  colorPicker: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  colorOption: {
    flex: 1,
    padding: SPACING.medium,
    borderRadius: BORDER_RADIUS.medium,
    alignItems: 'center',
    justifyContent: 'center',
    marginHorizontal: SPACING.tiny,
    ...SHADOWS.small,
  },
  selectedColorOption: {
    borderWidth: 2,
    borderColor: COLORS.black,
  },
  colorName: {
    color: COLORS.white,
    fontSize: FONTS.small,
    fontWeight: FONTS.bold,
    textShadowColor: 'rgba(0, 0, 0, 0.75)',
    textShadowOffset: { width: 1, height: 1 },
    textShadowRadius: 1,
  },
  imageContainer: {
    flex: 1,
    position: 'relative',
    backgroundColor: COLORS.black,
  },
  image: {
    width: '100%',
    height: '100%',
  },
  imageLoadingIndicator: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  annotationMarker: {
    position: 'absolute',
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    justifyContent: 'center',
    alignItems: 'center',
  },
  footer: {
    backgroundColor: COLORS.white,
    padding: SPACING.medium,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    ...SHADOWS.medium,
  },
  footerInfo: {
    marginBottom: SPACING.small,
  },
  footerText: {
    fontSize: FONTS.medium,
    color: COLORS.textLight,
  },
  footerButtons: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  footerButton: {
    flex: 1,
    marginHorizontal: SPACING.tiny,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    backgroundColor: COLORS.white,
    borderRadius: BORDER_RADIUS.medium,
    padding: SPACING.large,
    width: screenWidth - SPACING.xlarge * 2,
    ...SHADOWS.large,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: SPACING.medium,
  },
  modalTitle: {
    fontSize: FONTS.large,
    fontWeight: FONTS.semiBold,
    color: COLORS.text,
  },
  notesInput: {
    backgroundColor: COLORS.grey100,
    borderRadius: BORDER_RADIUS.medium,
    padding: SPACING.medium,
    minHeight: 120,
    fontSize: FONTS.medium,
    color: COLORS.text,
    textAlignVertical: 'top',
    marginBottom: SPACING.medium,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  modalButtons: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  modalButton: {
    flex: 1,
    marginHorizontal: SPACING.tiny,
  },
});

export default DefectHighlightingScreen;
