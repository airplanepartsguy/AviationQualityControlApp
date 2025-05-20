/**
 * Types for drawing functionality in the Aviation Quality Control App
 */

// Drawing tool types
export type DrawingTool = 'pointer' | 'circle' | 'rectangle' | 'arrow' | 'freehand' | 'text';

// Drawing mode types
export type DrawingMode = 'draw' | 'select' | 'erase';

// Drawing path data structure
export interface DrawingPath {
  id: string;
  path: string;
  color: string;
  thickness: number;
  tool: DrawingTool;
}

// Text annotation data structure
export interface TextAnnotation {
  id: string;
  text: string;
  x: number;
  y: number;
  color: string;
}

// Annotation data structure (legacy format)
export interface AnnotationData {
  id: string;
  pathData: string;
  color: string;
  notes: string;
  severity: 'Critical' | 'Moderate' | 'Minor' | 'None';
  x: number;
  y: number;
}
