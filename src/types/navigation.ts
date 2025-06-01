import type { StackScreenProps } from '@react-navigation/stack';
import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import type { CompositeScreenProps } from '@react-navigation/native';
import { PhotoData } from './data'; // Assuming PhotoData is defined here

// === Parameter Lists ===

// --- Authentication Stack ---
export type AuthStackParamList = {
  Login: undefined;
};

// --- Bottom Tab Navigator ---
export type BottomTabParamList = {
  HomeTab: undefined; // Renamed from DashboardTab
  HistoryTab: undefined; // Replaces AnalyticsTab
  CaptureActionTab: undefined; // Central action button
  ERPTab: undefined;
  AllBatchesTab: undefined; // New tab for all batches view
  SettingsTab: undefined;
};

// --- Main Stack Navigator ---
// Combining initial params and potential params after navigation
export interface RootStackParamList {
  [key: string]: object | undefined; // Index signature to satisfy ParamListBase
  MainTabs: { screen: keyof BottomTabParamList }; // Entry point to tabs
  PhotoCapture: 
    | { mode: 'Single' | 'Batch' | 'Inventory'; userId?: string; orderNumber?: string; inventoryId?: string; quickCapture?: boolean } // Starting new
    | { batchId: number }; // Resuming existing batch
  DefectHighlighting: { photo: PhotoData }; // Pass the specific photo to annotate
  Annotation: { photoId: string; photoUri: string; batchId: number; returnToBatch?: boolean }; // Add Annotation Screen
  BatchPreview: { batchId: number; identifier?: string };
  PDFGeneration: { 
    batchId: number; 
    reportType?: 'order' | 'inventory'; 
    orderNumber?: string; 
    inventorySessionId?: string; 
    pictureType?: 'Pictures' | 'Defect Pictures';
  };
  Debug: undefined; // For DebugScreen
  // No AnalyticsScreen here, it's a Tab
}

// === Screen Props ===

// --- Tab Screen Props ---
export type HomeTabScreenProps = CompositeScreenProps<
  BottomTabScreenProps<BottomTabParamList, 'HomeTab'>,
  StackScreenProps<RootStackParamList>
>;

export type HistoryTabScreenProps = CompositeScreenProps<
  BottomTabScreenProps<BottomTabParamList, 'HistoryTab'>,
  StackScreenProps<RootStackParamList>
>;

export type ERPTabScreenProps = CompositeScreenProps<
  BottomTabScreenProps<BottomTabParamList, 'ERPTab'>,
  StackScreenProps<RootStackParamList>
>;

export type SettingsTabScreenProps = CompositeScreenProps<
  BottomTabScreenProps<BottomTabParamList, 'SettingsTab'>,
  StackScreenProps<RootStackParamList>
>;

// --- Stack Screen Props ---
export type PhotoCaptureScreenProps = StackScreenProps<RootStackParamList, 'PhotoCapture'>;
// Keep separate RouteProp if needed for easier access within the component
export type PhotoCaptureScreenRouteProp = PhotoCaptureScreenProps['route'];
export type PhotoCaptureScreenNavigationProp = PhotoCaptureScreenProps['navigation'];

export type DefectHighlightingScreenProps = StackScreenProps<RootStackParamList, 'DefectHighlighting'>;
export type DefectHighlightingScreenRouteProp = DefectHighlightingScreenProps['route'];
export type DefectHighlightingScreenNavigationProp = DefectHighlightingScreenProps['navigation'];

export type AnnotationScreenProps = StackScreenProps<RootStackParamList, 'Annotation'>;
export type AnnotationScreenRouteProp = AnnotationScreenProps['route'];
export type AnnotationScreenNavigationProp = AnnotationScreenProps['navigation'];

export type BatchPreviewScreenProps = StackScreenProps<RootStackParamList, 'BatchPreview'>;
export type BatchPreviewScreenRouteProp = BatchPreviewScreenProps['route'];
export type BatchPreviewScreenNavigationProp = BatchPreviewScreenProps['navigation'];

export type PDFGenerationScreenProps = StackScreenProps<RootStackParamList, 'PDFGeneration'>;
export type PDFGenerationScreenRouteProp = PDFGenerationScreenProps['route'];
export type PDFGenerationScreenNavigationProp = PDFGenerationScreenProps['navigation'];

export type DebugScreenProps = StackScreenProps<RootStackParamList, 'Debug'>;
