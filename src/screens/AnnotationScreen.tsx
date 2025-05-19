import React, { useState, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ImageBackground,
  Alert,
  Dimensions,
  SafeAreaView,
} from 'react-native';
import { RouteProp, useRoute, useNavigation } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { AnnotationScreenNavigationProp, AnnotationScreenRouteProp, RootStackParamList } from '../types/navigation';
import { AnnotationData } from '../types/data'; // Assuming AnnotationData type exists
import CustomButton from '../components/CustomButton';
import { COLORS, SPACING } from '../styles/theme';
// Import drawing library (example: react-native-sketch-canvas or react-native-svg)
// import { SketchCanvas } from '@terrylinla/react-native-sketch-canvas'; // Example

const { width, height } = Dimensions.get('window');

const AnnotationScreen: React.FC = () => {
  const route = useRoute<AnnotationScreenRouteProp>();
  const navigation = useNavigation<AnnotationScreenNavigationProp>();
  const { photoId, photoUri, batchId, returnToBatch } = route.params;

  // State for annotations (paths, colors, etc.) - structure depends on drawing library
  const [currentAnnotations, setCurrentAnnotations] = useState<AnnotationData[]>([]);
  const [selectedTool, setSelectedTool] = useState<'pen' | 'marker'>('pen');
  const [selectedColor, setSelectedColor] = useState<string>(COLORS.error); // Default to red

  // Ref for drawing canvas component (if needed)
  // const canvasRef = useRef<any>(null);

  const handleSaveAnnotation = () => {
    console.log('Save Annotation logic to be implemented.');
    // 1. Capture annotation data (e.g., export paths/image from canvas)
    // 2. Save annotation data associated with photoId (likely update database)
    // 3. Navigate back or to next step
    Alert.alert('Save', 'Annotation saving not yet implemented.');
    // navigation.goBack();
  };

  const handleCancel = () => {
    Alert.alert(
        'Cancel Annotation',
        'Are you sure you want to discard annotations for this photo?',
        [
            { text: 'Keep Annotating', style: 'cancel' },
            { 
                text: 'Discard', 
                style: 'destructive', 
                onPress: () => {
                    // If returnToBatch is true, navigate back to PhotoCapture with the batch context
                    if (returnToBatch) {
                        navigation.navigate('PhotoCapture', { batchId });
                    } else {
                        // Otherwise just go back to previous screen
                        navigation.goBack();
                    }
                } 
            },
        ]
    );
  };

  if (!photoUri) {
    return (
      <SafeAreaView style={styles.container}>
        <Text style={styles.errorText}>Error: Photo URI not provided.</Text>
        <CustomButton title="Go Back" onPress={() => navigation.goBack()} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <Text style={styles.title}>Annotate Defect</Text>
      <Text style={styles.infoText}>Photo ID: {photoId}</Text>
      <Text style={styles.infoText}>Batch ID: {batchId}</Text>

      <View style={styles.canvasContainer}>
        <ImageBackground source={{ uri: photoUri }} style={styles.imageBackground}>
          {/* Drawing Canvas Component Goes Here */}
          {/* Example placeholder for where the drawing canvas would be */}
          <View style={styles.drawingPlaceholder}>
            <Text style={styles.placeholderText}>Drawing Canvas Area</Text>
            {/* 
            Example SketchCanvas usage:
            <SketchCanvas
              ref={canvasRef}
              style={{ flex: 1 }}
              strokeColor={selectedColor}
              strokeWidth={selectedTool === 'pen' ? 3 : 10}
              // Add other props: onStrokeEnd, paths, etc.
            /> 
            */}
          </View>
        </ImageBackground>
      </View>

      {/* Toolbar for drawing tools (placeholder) */}
      <View style={styles.toolbar}>
          <Text>Tools: [Pen] [Marker] [Color Picker] [Undo] [Clear]</Text>
          {/* Add buttons or components for tool selection here */}
      </View>

      <View style={styles.buttonContainer}>
        <CustomButton title="Save Annotation" onPress={handleSaveAnnotation} variant="primary" style={styles.button} />
        <CustomButton title="Cancel" onPress={handleCancel} variant="secondary" style={styles.button} />
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
    padding: SPACING.medium,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: COLORS.text,
    textAlign: 'center',
    marginBottom: SPACING.small,
  },
  infoText: {
      fontSize: 14,
      color: COLORS.grey600,
      textAlign: 'center',
      marginBottom: SPACING.small,
  },
  canvasContainer: {
    flex: 1,
    marginVertical: SPACING.medium,
    borderColor: COLORS.border,
    borderWidth: 1,
    overflow: 'hidden', // Ensure canvas doesn't overflow
  },
  imageBackground: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  drawingPlaceholder: {
      flex: 1,
      width: '100%',
      backgroundColor: 'rgba(200, 200, 200, 0.2)', // Semi-transparent placeholder
      justifyContent: 'center',
      alignItems: 'center',
  },
  placeholderText: {
      color: COLORS.grey600,
      fontSize: 16,
      fontWeight: 'bold',
  },
  toolbar: {
    paddingVertical: SPACING.small,
    alignItems: 'center',
    backgroundColor: COLORS.grey200,
    marginBottom: SPACING.medium,
    borderRadius: 5,
  },
  buttonContainer: {
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  button: {
      flex: 1,
      marginHorizontal: SPACING.small,
  },
  errorText: {
      color: COLORS.error,
      fontSize: 16,
      textAlign: 'center',
      marginBottom: SPACING.medium,
  }
});

export default AnnotationScreen;
