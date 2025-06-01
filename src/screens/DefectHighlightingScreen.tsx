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
  PanResponder,
  PanResponderGestureState,
} from 'react-native';
import Svg, { Path, Circle, Rect, Line, G, Text as SvgText } from 'react-native-svg';
import { Ionicons } from '@expo/vector-icons';
import { useRoute, useNavigation } from '@react-navigation/native';
import { COLORS, SPACING, FONTS, SHADOWS, BORDER_RADIUS } from '../styles/theme';
import CustomButton from '../components/CustomButton';
import { PhotoData, AnnotationData } from '../types/data';
import { DrawingPath, TextAnnotation } from '../types/drawing';
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

// Drawing tool types
type DrawingTool = 'pointer' | 'circle' | 'rectangle' | 'arrow' | 'freehand' | 'text';
type DrawingMode = 'draw' | 'select' | 'erase';

// Line thickness options
const LINE_THICKNESS = {
  thin: 2,
  medium: 4,
  thick: 6
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
  console.log('[DefectHighlightingScreen] Component mounted.'); // <-- ADD THIS
  // Track component renders in development mode
  useRenderTracker('DefectHighlightingScreen');
  const navigation = useNavigation<DefectHighlightingScreenProps['navigation']>();
  const route = useRoute<DefectHighlightingScreenProps['route']>();
  
  console.log('[DefectHighlightingScreen] route.params:', JSON.stringify(route.params, null, 2)); // <-- ADD THIS
  const { photo } = route.params || {};
  
  console.log('[DefectHighlightingScreen] Received photo object:', JSON.stringify(photo, null, 2)); // <-- ADD THIS
  if (photo && photo.uri) {
    console.log('[DefectHighlightingScreen] Photo URI to load:', photo.uri); // <-- ADD THIS
  } else {
    console.warn('[DefectHighlightingScreen] Photo URI is missing or photo object is invalid.'); // <-- ADD THIS
  }
  
  // State for defect status
  const [hasDefects, setHasDefects] = useState<boolean>(false);
  const [defectSeverity, setDefectSeverity] = useState<'Critical' | 'Moderate' | 'Minor' | 'None'>('Moderate');
  const [defectNotes, setDefectNotes] = useState<string>('');
  
  // Drawing tool state - optimized for SVG rendering
  const [currentTool, setCurrentTool] = useState<DrawingTool>('pointer');
  const [drawingMode, setDrawingMode] = useState<DrawingMode>('draw');
  const [lineThickness, setLineThickness] = useState<number>(LINE_THICKNESS.medium);
  const [isDrawing, setIsDrawing] = useState<boolean>(false);
  const [currentPath, setCurrentPath] = useState<string>('');
  const [startPoint, setStartPoint] = useState<{x: number, y: number} | null>(null);
  const [endPoint, setEndPoint] = useState<{x: number, y: number} | null>(null);
  const [paths, setPaths] = useState<DrawingPath[]>([]);
  const [textAnnotations, setTextAnnotations] = useState<TextAnnotation[]>([]);
  const [showTextInput, setShowTextInput] = useState<boolean>(false);
  const [textInputPosition, setTextInputPosition] = useState<{x: number, y: number}>({x: 0, y: 0});
  const [textInputValue, setTextInputValue] = useState<string>('');
  
  // Use refs for values that don't trigger re-renders
  const isDrawingRef = useRef<boolean>(false);
  const imageContainerRef = useRef<View>(null);
  const svgRef = useRef<Svg>(null);
  
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

  // Handle start of drawing on the image - optimized for SVG rendering
  const handleDrawStart = useCallback((event: GestureResponderEvent) => {
    if (!imageUri || currentTool === 'pointer') return;
    
    const { locationX, locationY } = event.nativeEvent;
    setIsDrawing(true);
    isDrawingRef.current = true;
    
    // Set start point for all drawing tools
    setStartPoint({ x: locationX, y: locationY });
    setEndPoint({ x: locationX, y: locationY });
    
    switch (currentTool) {
      case 'freehand':
        // For freehand, initialize the path data
        setCurrentPath(`M ${locationX} ${locationY}`);
        break;
      case 'text':
        // For text tool, show text input at tap location
        setTextInputPosition({ x: locationX, y: locationY });
        setShowTextInput(true);
        setIsDrawing(false); // Not actually drawing for text
        isDrawingRef.current = false;
        break;
      // For shapes, we just need the start point which we've already set
    }
  }, [imageUri, currentTool]);
  
  // Handle drawing movement - optimized for SVG rendering
  const handleDrawMove = useCallback((event: GestureResponderEvent) => {
    if (!isDrawingRef.current || !imageUri) return;
    
    const { locationX, locationY } = event.nativeEvent;
    setEndPoint({ x: locationX, y: locationY });
    
    // Update path based on selected tool
    switch (currentTool) {
      case 'freehand':
        // For freehand, we append to the path data
        // Using a batch update approach for better performance
        setCurrentPath(prev => `${prev} L ${locationX} ${locationY}`);
        break;
      // For shapes, we just update the end point which we've already set
      // The shape preview will be rendered using the start and end points
    }
  }, [isDrawingRef, imageUri, currentTool]);
  
  // Handle end of drawing - optimized for SVG rendering
  const handleDrawEnd = useCallback(() => {
    if (!isDrawingRef.current || !imageUri || (!currentPath && currentTool === 'freehand')) {
      setIsDrawing(false);
      isDrawingRef.current = false;
      return;
    }
    
    // Create a unique ID for this drawing
    const uniqueId = `drawing_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
    
    // Finalize the path based on the tool
    let finalPath = currentPath;
    
    // For shapes, we construct the complete SVG path from start and end points
    if (currentTool !== 'freehand' && startPoint && endPoint) {
      switch (currentTool) {
        case 'circle': {
          const radius = Math.sqrt(
            Math.pow(endPoint.x - startPoint.x, 2) + 
            Math.pow(endPoint.y - startPoint.y, 2)
          );
          finalPath = `M ${startPoint.x} ${startPoint.y} m -${radius} 0 a ${radius} ${radius} 0 1 0 ${radius*2} 0 a ${radius} ${radius} 0 1 0 -${radius*2} 0`;
          break;
        }
        case 'rectangle':
          finalPath = `M ${startPoint.x} ${startPoint.y} L ${endPoint.x} ${startPoint.y} L ${endPoint.x} ${endPoint.y} L ${startPoint.x} ${endPoint.y} Z`;
          break;
        case 'arrow': {
          // Simple arrow implementation
          const arrowHeadSize = Math.min(15, Math.sqrt(
            Math.pow(endPoint.x - startPoint.x, 2) + 
            Math.pow(endPoint.y - startPoint.y, 2)
          ) / 3);
          const angle = Math.atan2(endPoint.y - startPoint.y, endPoint.x - startPoint.x);
          const arrowPoint1X = endPoint.x - arrowHeadSize * Math.cos(angle - Math.PI/6);
          const arrowPoint1Y = endPoint.y - arrowHeadSize * Math.sin(angle - Math.PI/6);
          const arrowPoint2X = endPoint.x - arrowHeadSize * Math.cos(angle + Math.PI/6);
          const arrowPoint2Y = endPoint.y - arrowHeadSize * Math.sin(angle + Math.PI/6);
          
          finalPath = `M ${startPoint.x} ${startPoint.y} L ${endPoint.x} ${endPoint.y} M ${endPoint.x} ${endPoint.y} L ${arrowPoint1X} ${arrowPoint1Y} M ${endPoint.x} ${endPoint.y} L ${arrowPoint2X} ${arrowPoint2Y}`;
          break;
        }
      }
    }
    
    // Add the new path to paths array
    setPaths(prev => [
      ...prev, 
      {
        id: uniqueId,
        path: finalPath,
        color: currentColor,
        thickness: lineThickness,
        tool: currentTool
      }
    ]);
    
    // Reset current path and drawing state
    setCurrentPath('');
    setStartPoint(null);
    setEndPoint(null);
    setIsDrawing(false);
    isDrawingRef.current = false;
    setHasDefects(true); // Mark that there are defects on the image
  }, [imageUri, currentPath, currentTool, currentColor, lineThickness, startPoint, endPoint]);
  
  // Render SVG shape preview - optimized for performance
  const renderShapePreview = useCallback(() => {
    if (!startPoint || !endPoint || !isDrawingRef.current || currentTool === 'freehand' || currentTool === 'text' || currentTool === 'pointer') {
      return null;
    }
    
    const { x: startX, y: startY } = startPoint;
    const { x: endX, y: endY } = endPoint;
    
    switch (currentTool) {
      case 'circle': {
        const radius = Math.sqrt(Math.pow(endX - startX, 2) + Math.pow(endY - startY, 2));
        return (
          <Circle
            cx={startX}
            cy={startY}
            r={radius}
            stroke={currentColor}
            strokeWidth={lineThickness}
            fill="none"
          />
        );
      }
      case 'rectangle':
        return (
          <Rect
            x={Math.min(startX, endX)}
            y={Math.min(startY, endY)}
            width={Math.abs(endX - startX)}
            height={Math.abs(endY - startY)}
            stroke={currentColor}
            strokeWidth={lineThickness}
            fill="none"
          />
        );
      case 'arrow': {
        const arrowHeadSize = Math.min(15, Math.sqrt(Math.pow(endX - startX, 2) + Math.pow(endY - startY, 2)) / 3);
        const angle = Math.atan2(endY - startY, endX - startX);
        const arrowPoint1X = endX - arrowHeadSize * Math.cos(angle - Math.PI/6);
        const arrowPoint1Y = endY - arrowHeadSize * Math.sin(angle - Math.PI/6);
        const arrowPoint2X = endX - arrowHeadSize * Math.cos(angle + Math.PI/6);
        const arrowPoint2Y = endY - arrowHeadSize * Math.sin(angle + Math.PI/6);
        
        return (
          <G>
            <Line
              x1={startX}
              y1={startY}
              x2={endX}
              y2={endY}
              stroke={currentColor}
              strokeWidth={lineThickness}
            />
            <Line
              x1={endX}
              y1={endY}
              x2={arrowPoint1X}
              y2={arrowPoint1Y}
              stroke={currentColor}
              strokeWidth={lineThickness}
            />
            <Line
              x1={endX}
              y1={endY}
              x2={arrowPoint2X}
              y2={arrowPoint2Y}
              stroke={currentColor}
              strokeWidth={lineThickness}
            />
          </G>
        );
      }
      default:
        return null;
    }
  }, [startPoint, endPoint, isDrawingRef, currentTool, currentColor, lineThickness]);
  
  // Create a pan responder for optimized drawing gesture handling
  const panResponder = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => currentTool !== 'pointer',
    onMoveShouldSetPanResponder: () => currentTool !== 'pointer',
    
    onPanResponderGrant: (event: GestureResponderEvent) => {
      handleDrawStart(event);
    },
    
    onPanResponderMove: (event: GestureResponderEvent) => {
      handleDrawMove(event);
    },
    
    onPanResponderRelease: () => {
      handleDrawEnd();
    },
    
    onPanResponderTerminate: () => {
      // Reset drawing state
      setCurrentPath('');
      setStartPoint(null);
      setEndPoint(null);
      setIsDrawing(false);
      isDrawingRef.current = false;
    }
  }), [handleDrawStart, handleDrawMove, handleDrawEnd, currentTool]);
  
  // Handle text annotation submission
  const handleTextSubmit = useCallback((text: string) => {
    if (!text.trim() || !imageUri) return;
    
    // Create a unique ID for this text annotation
    const uniqueId = `text_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
    
    // Add the new text annotation
    setTextAnnotations(prev => [
      ...prev,
      {
        id: uniqueId,
        text,
        x: textInputPosition.x,
        y: textInputPosition.y,
        color: currentColor
      }
    ]);
    
    // Reset text input state
    setShowTextInput(false);
    setTextInputValue('');
    setHasDefects(true); // Mark that there are defects on the image
  }, [imageUri, textInputPosition, currentColor]);
  
  // Handle tool selection
  const handleToolSelect = useCallback((tool: DrawingTool) => {
    setCurrentTool(tool);
    // Reset any active drawing
    setIsDrawing(false);
    setCurrentPath('');
    setShowTextInput(false);
  }, []);
  
  // Handle line thickness selection
  const handleThicknessSelect = useCallback((thickness: number) => {
    setLineThickness(thickness);
  }, []);
  
  // Legacy annotation handling - kept for backward compatibility
  const handleImagePress = useCallback((event: GestureResponderEvent) => {
    if (!imageUri) return;
    if (currentTool !== 'pointer') return; // Only handle in pointer mode
    
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
  }, [imageUri, currentColor, defectSeverity, currentTool]);

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
                <View style={styles.drawingContainer} ref={imageContainerRef}>
                  <TouchableWithoutFeedback onPress={handleImagePress}>
                    <Image
                      ref={imageRef}
                      source={{ uri: imageUri }}
                      style={[styles.image, { aspectRatio }]}
                      resizeMode="contain"
                    />
                  </TouchableWithoutFeedback>
                  
                  {/* SVG Drawing Layer - Optimized for performance */}
                  <View style={[styles.svgContainer, { aspectRatio }]} {...panResponder.panHandlers}>
                    <Svg width="100%" height="100%" ref={svgRef}>
                      {/* Render existing paths */}
                      {paths.map(path => (
                        <Path
                          key={path.id}
                          d={path.path}
                          stroke={path.color}
                          strokeWidth={path.thickness}
                          fill="none"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      ))}
                      
                      {/* Render current path for freehand drawing */}
                      {currentPath && currentTool === 'freehand' && (
                        <Path
                          d={currentPath}
                          stroke={currentColor}
                          strokeWidth={lineThickness}
                          fill="none"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      )}
                      
                      {/* Render shape preview */}
                      {renderShapePreview()}
                      
                      {/* Render text annotations */}
                      {textAnnotations.map(annotation => (
                        <SvgText
                          key={annotation.id}
                          x={annotation.x}
                          y={annotation.y}
                          fill={annotation.color}
                          fontSize="16"
                          fontWeight="bold"
                          textAnchor="middle"
                        >
                          {annotation.text}
                        </SvgText>
                      ))}
                    </Svg>
                  </View>
                </View>
                
                {/* Drawing Tools Toolbar */}
                <View style={styles.toolbarContainer}>
                  <TouchableOpacity 
                    style={[styles.toolButton, currentTool === 'pointer' && styles.activeToolButton]}
                    onPress={() => handleToolSelect('pointer')}
                  >
                    <Ionicons name="finger-print-outline" size={24} color={currentTool === 'pointer' ? COLORS.primary : COLORS.text} />
                    <Text style={styles.toolText}>Select</Text>
                  </TouchableOpacity>
                  
                  <TouchableOpacity 
                    style={[styles.toolButton, currentTool === 'freehand' && styles.activeToolButton]}
                    onPress={() => handleToolSelect('freehand')}
                  >
                    <Ionicons name="pencil" size={24} color={currentTool === 'freehand' ? COLORS.primary : COLORS.text} />
                    <Text style={styles.toolText}>Draw</Text>
                  </TouchableOpacity>
                  
                  <TouchableOpacity 
                    style={[styles.toolButton, currentTool === 'circle' && styles.activeToolButton]}
                    onPress={() => handleToolSelect('circle')}
                  >
                    <Ionicons name="ellipse-outline" size={24} color={currentTool === 'circle' ? COLORS.primary : COLORS.text} />
                    <Text style={styles.toolText}>Circle</Text>
                  </TouchableOpacity>
                  
                  <TouchableOpacity 
                    style={[styles.toolButton, currentTool === 'rectangle' && styles.activeToolButton]}
                    onPress={() => handleToolSelect('rectangle')}
                  >
                    <Ionicons name="square-outline" size={24} color={currentTool === 'rectangle' ? COLORS.primary : COLORS.text} />
                    <Text style={styles.toolText}>Rectangle</Text>
                  </TouchableOpacity>
                  
                  <TouchableOpacity 
                    style={[styles.toolButton, currentTool === 'arrow' && styles.activeToolButton]}
                    onPress={() => handleToolSelect('arrow')}
                  >
                    <Ionicons name="arrow-forward" size={24} color={currentTool === 'arrow' ? COLORS.primary : COLORS.text} />
                    <Text style={styles.toolText}>Arrow</Text>
                  </TouchableOpacity>
                  
                  <TouchableOpacity 
                    style={[styles.toolButton, currentTool === 'text' && styles.activeToolButton]}
                    onPress={() => handleToolSelect('text')}
                  >
                    <Ionicons name="text" size={24} color={currentTool === 'text' ? COLORS.primary : COLORS.text} />
                    <Text style={styles.toolText}>Text</Text>
                  </TouchableOpacity>
                </View>
                
                {/* Line Thickness Controls */}
                {currentTool !== 'pointer' && currentTool !== 'text' && (
                  <View style={styles.thicknessControls}>
                    <TouchableOpacity 
                      style={[styles.thicknessOption, lineThickness === LINE_THICKNESS.thin && styles.activeThicknessOption]}
                      onPress={() => handleThicknessSelect(LINE_THICKNESS.thin)}
                    >
                      <View style={[styles.thicknessSample, { height: LINE_THICKNESS.thin }]}>
                        <View style={[styles.thicknessLine, { height: LINE_THICKNESS.thin }]} />
                      </View>
                      <Text style={styles.thicknessText}>Thin</Text>
                    </TouchableOpacity>
                    
                    <TouchableOpacity 
                      style={[styles.thicknessOption, lineThickness === LINE_THICKNESS.medium && styles.activeThicknessOption]}
                      onPress={() => handleThicknessSelect(LINE_THICKNESS.medium)}
                    >
                      <View style={[styles.thicknessSample, { height: LINE_THICKNESS.medium }]}>
                        <View style={[styles.thicknessLine, { height: LINE_THICKNESS.medium }]} />
                      </View>
                      <Text style={styles.thicknessText}>Medium</Text>
                    </TouchableOpacity>
                    
                    <TouchableOpacity 
                      style={[styles.thicknessOption, lineThickness === LINE_THICKNESS.thick && styles.activeThicknessOption]}
                      onPress={() => handleThicknessSelect(LINE_THICKNESS.thick)}
                    >
                      <View style={[styles.thicknessSample, { height: LINE_THICKNESS.thick }]}>
                        <View style={[styles.thicknessLine, { height: LINE_THICKNESS.thick }]} />
                      </View>
                      <Text style={styles.thicknessText}>Thick</Text>
                    </TouchableOpacity>
                  </View>
                )}
                
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
  toolbarContainer: {
    flexDirection: 'row',
    backgroundColor: COLORS.white,
    padding: SPACING.small,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    justifyContent: 'space-around',
    ...SHADOWS.small,
  },
  toolButton: {
    padding: SPACING.small,
    borderRadius: BORDER_RADIUS.small,
    alignItems: 'center',
    justifyContent: 'center',
  },
  activeToolButton: {
    backgroundColor: COLORS.primaryLight,
  },
  toolText: {
    fontSize: FONTS.tiny,
    marginTop: 2,
    color: COLORS.text,
  },
  thicknessControls: {
    flexDirection: 'row',
    justifyContent: 'center',
    backgroundColor: COLORS.white,
    padding: SPACING.small,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  thicknessOption: {
    marginHorizontal: SPACING.small,
    padding: SPACING.tiny,
    borderRadius: BORDER_RADIUS.small,
    alignItems: 'center',
  },
  activeThicknessOption: {
    backgroundColor: COLORS.primaryLight,
  },
  thicknessSample: {
    width: 30,
    height: 30,
    justifyContent: 'center',
    alignItems: 'center',
  },
  thicknessLine: {
    width: '80%',
    backgroundColor: COLORS.primary,
  },
  thicknessText: {
    fontSize: FONTS.tiny,
    marginTop: 2,
    color: COLORS.text,
  },
  textAnnotation: {
    position: 'absolute',
    maxWidth: 150,
    padding: SPACING.tiny,
    backgroundColor: 'rgba(255, 255, 255, 0.8)',
    borderRadius: BORDER_RADIUS.small,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  textAnnotationContent: {
    fontSize: FONTS.small,
    fontWeight: 'bold',
  },
  textInputContainer: {
    position: 'absolute',
    width: 200,
    backgroundColor: COLORS.white,
    borderRadius: BORDER_RADIUS.small,
    padding: SPACING.small,
    ...SHADOWS.medium,
    zIndex: 1000,
  },
  textInput: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: BORDER_RADIUS.tiny,
    padding: SPACING.small,
    marginBottom: SPACING.small,
  },
  textInputButtons: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  textInputButton: {
    padding: SPACING.small,
    borderRadius: BORDER_RADIUS.small,
    alignItems: 'center',
    justifyContent: 'center',
    flex: 1,
    marginHorizontal: 2,
  },
  textInputSubmitButton: {
    backgroundColor: COLORS.primary,
  },
  textInputButtonText: {
    color: COLORS.text,
    fontWeight: 'bold',
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
  drawingContainer: {
    position: 'relative',
    width: '100%',
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
  },
  svgContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'transparent',
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
