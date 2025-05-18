import React, { useState, useEffect, useRef } from 'react';
import { 
  View, 
  Text, 
  StyleSheet, 
  Image, 
  TouchableOpacity, 
  Alert,
  SafeAreaView,
  StatusBar,
  ScrollView,
  Modal,
  TextInput,
  Dimensions
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { DefectHighlightingScreenProps } from '../types/navigation';
import { AnnotationData, PhotoData } from '../types/data';
import Svg, { Path } from 'react-native-svg';
import CustomButton from '../components/CustomButton';
import { logAnalyticsEvent, logErrorToFile } from '../services/analyticsService';
import { COLORS, FONTS, SPACING, SHADOWS, BORDER_RADIUS } from '../styles/theme';
import * as FileSystem from 'expo-file-system';

const { width: screenWidth } = Dimensions.get('window');

// Available colors for marking defects
const DEFECT_COLORS = [
  { name: 'Critical', value: COLORS.criticalDefect, severity: 'Critical' as const },
  { name: 'Moderate', value: COLORS.moderateDefect, severity: 'Moderate' as const },
  { name: 'Minor', value: COLORS.minorDefect, severity: 'Minor' as const },
];

export default function DefectHighlightingScreen({ route, navigation }: DefectHighlightingScreenProps) {
  // Extract photos and initial index from route params
  const { photosToAnnotate = [], currentPhotoIndex = 0 } = route.params ?? {};

  const currentPhoto = photosToAnnotate[currentPhotoIndex];
  const { uri, metadata } = currentPhoto;
  const { partNumber, timestamp, orderNumber } = metadata;

  // State for annotations
  const [annotations, setAnnotations] = useState<AnnotationData[]>(currentPhoto.annotations || []);
  const [selectedColor, setSelectedColor] = useState(DEFECT_COLORS[0]);
  const [selectedAnnotation, setSelectedAnnotation] = useState<AnnotationData | null>(null);
  const [defectNotes, setDefectNotes] = useState('');
  const [showNotesModal, setShowNotesModal] = useState(false);

  // Handle touch on image to add annotation
  const handleImagePress = (event: any) => {
    if (!currentPhoto.metadata.hasDefects) return; // Only allow annotations if there are defects
    
    // Get coordinates relative to the image
    const { locationX, locationY } = event.nativeEvent;
    
    // Create new annotation that matches the AnnotationData interface
    const newAnnotation: AnnotationData = {
      id: Date.now().toString(),
      pathData: `M${locationX},${locationY} L${locationX+1},${locationY+1}`, // Simple path data
      color: selectedColor.value,
      strokeWidth: 3,
      notes: '',
      severity: selectedColor.severity,
    };
    
    setAnnotations([...annotations, newAnnotation]);
    setSelectedAnnotation(newAnnotation);
    setDefectNotes('');
    setShowNotesModal(true);
    
    // Log analytics event
    logAnalyticsEvent('annotation_added', { 
      partNumber, 
      severity: selectedColor.severity 
    });
  };

  // Handle annotation selection
  const handleAnnotationPress = (annotation: AnnotationData) => {
    setSelectedAnnotation(annotation);
    setDefectNotes(annotation.notes || '');
    setShowNotesModal(true);
  };

  // Save notes for the selected annotation
  const saveAnnotationNotes = () => {
    if (!selectedAnnotation) return;
    
    const updatedAnnotations = annotations.map(ann => 
      ann.id === selectedAnnotation.id 
        ? { ...ann, notes: defectNotes } 
        : ann
    );
    
    setAnnotations(updatedAnnotations);
    setShowNotesModal(false);
    
    // Log analytics event
    logAnalyticsEvent('annotation_updated', { 
      partNumber,
      notes: defectNotes,
      severity: selectedAnnotation?.severity || 'Unknown'
    });
  };

  // Clear all annotations
  const clearAllAnnotations = () => {
    Alert.alert(
      'Clear All Annotations',
      'Are you sure you want to remove all annotations?',
      [
        { text: 'Cancel', style: 'cancel' },
        { 
          text: 'Clear All', 
          style: 'destructive',
          onPress: () => {
            setAnnotations([]);
            setSelectedAnnotation(null);
            
            // Log analytics event
            logAnalyticsEvent('annotations_cleared', { 
              partNumber
            });
          } 
        }
      ]
    );
  };

  // Save annotations and navigate back
  const saveAnnotations = () => {
    if (!currentPhoto) {
      console.error('[DefectHighlightingScreen] No photo data available to save annotations');
      return;
    }
    
    // Log analytics event
    logAnalyticsEvent('annotations_saved', { 
      partNumber, 
      annotationCount: annotations.length 
    });
    
    // Create updated photo data with annotations
    const updatedPhotoData: PhotoData = {
      ...currentPhoto,
      annotations: annotations
    };
    
    // Save to database
    savePhotoToDatabase(updatedPhotoData);
    
    // Show success message and navigate back
    Alert.alert(
      'Annotations Saved',
      'Defect annotations have been saved successfully.',
      [
        {
          text: 'OK',
          onPress: () => {
            // Navigate back to the previous screen
            navigation.goBack();
          }
        }
      ]
    );
  };

  // Save annotations and go directly to take another photo
  const saveAndTakeAnotherPhoto = async () => {
    if (!currentPhoto) {
      console.error('[DefectHighlightingScreen] No photo data available to save annotations');
      return;
    }
    
    try {
      // Log analytics event
      logAnalyticsEvent('annotations_saved_and_continue', { 
        partNumber, 
        annotationCount: annotations.length 
      });
      
      // Create updated photo data with annotations
      const updatedPhotoData: PhotoData = {
        ...currentPhoto,
        annotations: annotations
      };
      
      // Save to database
      await savePhotoToDatabase(updatedPhotoData);
      
      // Navigate directly to photo capture screen
      navigation.navigate('PhotoCapture', {
        mode: 'Batch', // Indicate returning to batch mode
        userId: 'user123', // Pass necessary parameters back
        orderNumber: currentPhoto.metadata.orderNumber, // Maintain context if available
        partNumber: currentPhoto.metadata.partNumber, // Maintain context if available
      });
    } catch (error) {
      console.error('[DefectHighlightingScreen] Error saving and continuing:', error);
      Alert.alert('Error', 'Failed to save photo. Please try again.');
    }
  };

  // Simple function to save photo to database (mock implementation)
  const savePhotoToDatabase = async (photoData: PhotoData) => {
    try {
      // In a real app, this would save to a database
      console.log('[DefectHighlightingScreen] Saving photo with annotations:', photoData);
      
      // Mock implementation - in a real app, this would be an API call or database operation
      // For demo purposes, we'll just simulate a delay
      await new Promise(resolve => setTimeout(resolve, 500));
      
      // Log success
      console.log('[DefectHighlightingScreen] Photo saved successfully');
      
      // Log analytics event
      await logAnalyticsEvent('photo_saved', {
        orderNumber: photoData.metadata.orderNumber,
        partNumber: photoData.metadata.partNumber,
        annotationCount: photoData.annotations?.length || 0
      });
      
    } catch (error: any) {
      console.error('[DefectHighlightingScreen] Error saving photo:', error);
      await logErrorToFile(`Error saving photo: ${error.message}`);
      Alert.alert('Error', 'Failed to save photo. Please try again.');
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={COLORS.primaryDark} />
      
      <View style={styles.header}>
        <TouchableOpacity 
          style={styles.backButton} 
          onPress={() => navigation.goBack()}
        >
          <Ionicons name="arrow-back" size={24} color={COLORS.white} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Defect Highlighting</Text>
        <View style={styles.headerRight} />
      </View>

      <View style={styles.infoContainer}>
        <View style={styles.infoRow}>
          <View style={styles.infoItem}>
            <Text style={styles.infoLabel}>Order:</Text>
            <Text style={styles.infoValue}>{orderNumber}</Text>
          </View>
          <View style={styles.infoItem}>
            <Text style={styles.infoLabel}>Part:</Text>
            <Text style={styles.infoValue}>{partNumber}</Text>
          </View>
        </View>
        <View style={styles.infoRow}>
          <View style={styles.infoItem}>
            <Text style={styles.infoLabel}>Time:</Text>
            <Text style={styles.infoValue}>{new Date(timestamp).toLocaleTimeString()}</Text>
          </View>
          <View style={styles.infoItem}>
            <Text style={styles.infoLabel}>Status:</Text>
            <View style={[
              styles.statusBadge, 
              { backgroundColor: currentPhoto.metadata.hasDefects ? COLORS.error : COLORS.success }
            ]}>
              <Text style={styles.statusText}>
                {currentPhoto.metadata.hasDefects ? 'Defects' : 'No Defects'}
              </Text>
            </View>
          </View>
        </View>
      </View>

      {currentPhoto.metadata.hasDefects ? (
        <View style={styles.instructionsContainer}>
          <Ionicons name="information-circle" size={20} color={COLORS.primary} />
          <Text style={styles.instructions}>
            Tap on the image to mark defect locations. Use different colors to indicate severity.
          </Text>
        </View>
      ) : (
        <View style={styles.noDefectsContainer}>
          <Ionicons name="checkmark-circle" size={20} color={COLORS.success} />
          <Text style={styles.noDefectsText}>
            No defects reported for this part. You can still review the image or add annotations if needed.
          </Text>
        </View>
      )}

      <View style={styles.colorPickerContainer}>
        <Text style={styles.colorPickerLabel}>Select Defect Severity:</Text>
        <View style={styles.colorPicker}>
          {DEFECT_COLORS.map(color => (
            <TouchableOpacity
              key={color.name}
              style={[
                styles.colorOption,
                { backgroundColor: color.value },
                selectedColor.name === color.name && styles.selectedColorOption
              ]}
              onPress={() => setSelectedColor(color)}
            >
              <Text style={styles.colorName}>{color.name}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      <View style={styles.imageContainer}>
        <TouchableOpacity onPress={handleImagePress} activeOpacity={0.9}>
          <Image source={{ uri }} style={styles.image} resizeMode="contain" />
          
          {/* Render annotations */}
          {annotations.map(annotation => (
            <TouchableOpacity
              key={annotation.id}
              style={[
                styles.annotationMarker,
                { 
                  left: parseInt(annotation.pathData.split(' ')[0].substring(1).split(',')[0]) - 10, 
                  top: parseInt(annotation.pathData.split(' ')[0].substring(1).split(',')[1]) - 10,
                  backgroundColor: annotation.color,
                  borderColor: selectedAnnotation?.id === annotation.id ? COLORS.white : 'transparent'
                }
              ]}
              onPress={() => handleAnnotationPress(annotation)}
            />
          ))}
        </TouchableOpacity>
      </View>

      <View style={styles.footer}>
        <View style={styles.footerInfo}>
          <Text style={styles.footerText}>
            {annotations.length} {annotations.length === 1 ? 'annotation' : 'annotations'} added
          </Text>
        </View>
        <View style={styles.footerButtons}>
          <CustomButton 
            title="Clear All" 
            onPress={clearAllAnnotations}
            variant="outline"
            icon={<Ionicons name="trash" size={20} color={COLORS.primary} />}
            style={styles.footerButton}
            disabled={annotations.length === 0}
          />
          <CustomButton 
            title="Save" 
            onPress={saveAnnotations}
            variant="primary"
            icon={<Ionicons name="checkmark-circle" size={20} color={COLORS.white} />}
            style={[styles.footerButton, { flex: 1 }]}
          />
          <CustomButton 
            title="Save & Take Another" 
            onPress={saveAndTakeAnotherPhoto}
            variant="primary"
            icon={<Ionicons name="camera" size={20} color={COLORS.white} />}
            style={[styles.footerButton, { flex: 1.5 }]}
          />
        </View>
      </View>

      {/* Notes Modal */}
      <Modal
        visible={showNotesModal}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setShowNotesModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>
                Defect Notes ({selectedAnnotation?.severity || 'Unknown'})
              </Text>
              <TouchableOpacity onPress={() => setShowNotesModal(false)}>
                <Ionicons name="close" size={24} color={COLORS.grey700} />
              </TouchableOpacity>
            </View>
            
            <TextInput
              style={styles.notesInput}
              multiline
              value={defectNotes}
              onChangeText={setDefectNotes}
              placeholder="Enter notes about this defect..."
              placeholderTextColor={COLORS.grey500}
            />
            
            <View style={styles.modalButtons}>
              <CustomButton 
                title="Cancel" 
                onPress={() => setShowNotesModal(false)}
                variant="outline"
                style={styles.modalButton}
              />
              <CustomButton 
                title="Save Notes" 
                onPress={saveAnnotationNotes}
                variant="primary"
                style={styles.modalButton}
              />
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  header: {
    backgroundColor: COLORS.primary,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: SPACING.medium,
    paddingHorizontal: SPACING.medium,
    ...SHADOWS.medium,
  },
  backButton: {
    padding: SPACING.small,
  },
  headerTitle: {
    color: COLORS.white,
    fontSize: FONTS.large,
    fontWeight: FONTS.bold,
  },
  headerRight: {
    width: 40, // To balance the header
  },
  infoContainer: {
    backgroundColor: COLORS.white,
    padding: SPACING.medium,
    ...SHADOWS.small,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: SPACING.small,
  },
  infoItem: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  infoLabel: {
    fontSize: FONTS.medium,
    fontWeight: FONTS.semiBold,
    color: COLORS.text,
    marginRight: SPACING.small,
  },
  infoValue: {
    fontSize: FONTS.medium,
    color: COLORS.text,
  },
  statusBadge: {
    paddingHorizontal: SPACING.small,
    paddingVertical: SPACING.tiny,
    borderRadius: BORDER_RADIUS.small,
  },
  statusText: {
    color: COLORS.white,
    fontSize: FONTS.small,
    fontWeight: FONTS.semiBold,
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
  noDefectsContainer: {
    backgroundColor: COLORS.secondary,
    padding: SPACING.medium,
    flexDirection: 'row',
    alignItems: 'center',
  },
  noDefectsText: {
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
