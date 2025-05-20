import React, { useRef, useState, useCallback, useEffect, memo } from 'react';
import { View, StyleSheet, PanResponder, GestureResponderEvent, PanResponderGestureState } from 'react-native';
import Svg, { Path, Circle, Rect, Line, G, Text as SvgText } from 'react-native-svg';
import { DrawingTool, DrawingPath, TextAnnotation } from '../types/drawing';

interface DrawingCanvasProps {
  width: number;
  height: number;
  currentTool: DrawingTool;
  currentColor: string;
  lineThickness: number;
  paths: DrawingPath[];
  textAnnotations: TextAnnotation[];
  onPathAdded: (path: DrawingPath) => void;
  onTextRequested: (x: number, y: number) => void;
  isEnabled: boolean;
}

/**
 * A high-performance drawing canvas component using react-native-svg
 * Optimized for smooth drawing and minimal re-renders
 */
const DrawingCanvas = memo(({
  width,
  height,
  currentTool,
  currentColor,
  lineThickness,
  paths,
  textAnnotations,
  onPathAdded,
  onTextRequested,
  isEnabled
}: DrawingCanvasProps) => {
  // Drawing state
  const [currentPath, setCurrentPath] = useState<string | null>(null);
  const [startPoint, setStartPoint] = useState<{ x: number, y: number } | null>(null);
  const [endPoint, setEndPoint] = useState<{ x: number, y: number } | null>(null);
  
  // Track if currently drawing
  const isDrawingRef = useRef(false);
  
  // Reset state when tool changes
  useEffect(() => {
    setCurrentPath(null);
    setStartPoint(null);
    setEndPoint(null);
    isDrawingRef.current = false;
  }, [currentTool]);
  
  // Create a unique ID for new paths
  const createUniqueId = useCallback(() => {
    return `drawing_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
  }, []);
  
  // Handle shape drawing preview
  const getShapePath = useCallback((start: { x: number, y: number }, end: { x: number, y: number }, tool: DrawingTool) => {
    if (!start || !end) return '';
    
    const { x: startX, y: startY } = start;
    const { x: endX, y: endY } = end;
    
    switch (tool) {
      case 'circle': {
        const radius = Math.sqrt(Math.pow(endX - startX, 2) + Math.pow(endY - startY, 2));
        return `M ${startX} ${startY} m -${radius} 0 a ${radius} ${radius} 0 1 0 ${radius*2} 0 a ${radius} ${radius} 0 1 0 -${radius*2} 0`;
      }
      case 'rectangle':
        return `M ${startX} ${startY} L ${endX} ${startY} L ${endX} ${endY} L ${startX} ${endY} Z`;
      case 'arrow': {
        // Simple arrow implementation
        const arrowHeadSize = Math.min(15, Math.sqrt(Math.pow(endX - startX, 2) + Math.pow(endY - startY, 2)) / 3);
        const angle = Math.atan2(endY - startY, endX - startX);
        const arrowPoint1X = endX - arrowHeadSize * Math.cos(angle - Math.PI/6);
        const arrowPoint1Y = endY - arrowHeadSize * Math.sin(angle - Math.PI/6);
        const arrowPoint2X = endX - arrowHeadSize * Math.cos(angle + Math.PI/6);
        const arrowPoint2Y = endY - arrowHeadSize * Math.sin(angle + Math.PI/6);
        
        return `M ${startX} ${startY} L ${endX} ${endY} M ${endX} ${endY} L ${arrowPoint1X} ${arrowPoint1Y} M ${endX} ${endY} L ${arrowPoint2X} ${arrowPoint2Y}`;
      }
      default:
        return '';
    }
  }, []);
  
  // Create pan responder for handling touch gestures
  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => isEnabled && currentTool !== 'pointer',
      onMoveShouldSetPanResponder: () => isEnabled && currentTool !== 'pointer',
      
      onPanResponderGrant: (event: GestureResponderEvent) => {
        if (!isEnabled || currentTool === 'pointer') return;
        
        const { locationX, locationY } = event.nativeEvent;
        isDrawingRef.current = true;
        
        if (currentTool === 'text') {
          onTextRequested(locationX, locationY);
          return;
        }
        
        setStartPoint({ x: locationX, y: locationY });
        setEndPoint({ x: locationX, y: locationY });
        
        if (currentTool === 'freehand') {
          setCurrentPath(`M ${locationX} ${locationY}`);
        }
      },
      
      onPanResponderMove: (event: GestureResponderEvent, gestureState: PanResponderGestureState) => {
        if (!isDrawingRef.current) return;
        
        const { locationX, locationY } = event.nativeEvent;
        setEndPoint({ x: locationX, y: locationY });
        
        if (currentTool === 'freehand') {
          // Optimize path updates by batching points
          setCurrentPath(prev => `${prev} L ${locationX} ${locationY}`);
        }
      },
      
      onPanResponderRelease: () => {
        if (!isDrawingRef.current) return;
        
        if (startPoint && endPoint && currentTool !== 'text') {
          let finalPath = '';
          
          if (currentTool === 'freehand') {
            finalPath = currentPath || '';
          } else {
            finalPath = getShapePath(startPoint, endPoint, currentTool);
          }
          
          if (finalPath) {
            onPathAdded({
              id: createUniqueId(),
              path: finalPath,
              color: currentColor,
              thickness: lineThickness,
              tool: currentTool
            });
          }
        }
        
        // Reset state
        setCurrentPath(null);
        setStartPoint(null);
        setEndPoint(null);
        isDrawingRef.current = false;
      },
      
      onPanResponderTerminate: () => {
        // Reset state
        setCurrentPath(null);
        setStartPoint(null);
        setEndPoint(null);
        isDrawingRef.current = false;
      }
    })
  ).current;
  
  // Render shape preview during drawing
  const renderShapePreview = useCallback(() => {
    if (!startPoint || !endPoint || currentTool === 'freehand' || currentTool === 'text' || currentTool === 'pointer') {
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
  }, [startPoint, endPoint, currentTool, currentColor, lineThickness]);
  
  // Memoize the paths rendering to prevent unnecessary re-renders
  const renderedPaths = React.useMemo(() => {
    return paths.map(path => (
      <Path
        key={path.id}
        d={path.path}
        stroke={path.color}
        strokeWidth={path.thickness}
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    ));
  }, [paths]);
  
  // Memoize the text annotations rendering
  const renderedTextAnnotations = React.useMemo(() => {
    return textAnnotations.map(annotation => (
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
    ));
  }, [textAnnotations]);
  
  return (
    <View style={[styles.container, { width, height }]} {...panResponder.panHandlers}>
      <Svg width={width} height={height}>
        {/* Render existing paths */}
        {renderedPaths}
        
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
        {renderedTextAnnotations}
      </Svg>
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 0,
    left: 0,
    backgroundColor: 'transparent',
  },
});

export default DrawingCanvas;
