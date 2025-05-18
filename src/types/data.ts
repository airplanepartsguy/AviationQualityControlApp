// Represents a single annotation drawn on a photo
export interface AnnotationData {
  id: string; // Unique ID for the annotation layer/save
  pathData: string; // Data from sketch canvas (e.g., SVG path string)
  notes?: string;
  severity: 'Critical' | 'Moderate' | 'Minor' | 'None';
  color: string; // e.g., '#D32F2F', '#FFA000', '#388E3C'
}

// Metadata associated with a captured photo
export interface PhotoMetadata {
  timestamp: string; // ISO 8601 format
  userId: string; // Identifier for the user
  latitude?: number;
  longitude?: number;
  deviceModel?: string; // Example additional metadata
}

// Represents a single photo captured and potentially annotated
export interface PhotoData {
  id: string; // Unique photo ID (e.g., UUID)
  uri: string; // Local file URI of the original captured image
  compressedUri?: string; // Local file URI of the compressed image
  batchId: number; // Identifier linking photos in a session (e.g., PK from DB)
  orderNumber?: string; // Extracted/entered order number
  inventoryId?: string; // Extracted/entered inventory ID
  partNumber?: string; // Optional part number
  metadata: PhotoMetadata;
  annotations?: AnnotationData[]; // Array to hold annotation data
  annotationSavedUri?: string; // URI of the photo *with* annotation drawn on it (optional)
  syncStatus: 'pending' | 'synced' | 'error'; // For Salesforce sync
}

// Interface for a batch of photos
export interface PhotoBatch {
  id: number; // Use Autoincrement ID from DB
  type: 'Order' | 'Inventory';
  referenceId: string; // The actual Order Number or Inventory ID value
  orderNumber?: string; // Added for convenience after fetching
  inventoryId?: string; // Added for convenience after fetching
  userId: string;
  createdAt: string; // ISO 8601
  status: 'InProgress' | 'Completed' | 'Exported';
  photos: PhotoData[]; // Store full photo data objects
}

// Types for Analytics Service
export interface AnalyticsEvent {
  id: string;
  type: 'session_start' | 'scan_success' | 'scan_fail' | 'photo_capture' | 'defect_annotated' | 'pdf_generated' | 'sync_attempt' | 'sync_success' | 'sync_fail';
  timestamp: string;
  userId: string;
  details?: Record<string, any>; // e.g., { batchId: 'Order_123', photoCount: 5 }
}

// Represents data needed for PDF generation (can be single or batch)
export interface PdfGenerationData {
  orderNumber: string; // Order number for the inspection report
  photos: PhotoData[]; // Array of photos to include in the PDF
  generatedAt: string; // ISO 8601 format timestamp of generation
  userId?: string; // User ID who generated the PDF
  includeAnnotations?: boolean; // Whether to include annotations in the PDF
}

export interface InspectionData {
  photos: PhotoData[];
  inspectionId: string;
  date: string;
}

// --- Offline Sync Queue Task ---
export interface SyncTask {
  id: string;
  type: 'pdf_upload' | 'data_sync';
  payload: Record<string, any>; // e.g., { batchId: 'Order_123', pdfUri: '...' }
  status: 'queued' | 'processing' | 'failed';
  attempts: number;
  lastAttempted?: string;
  error?: string;
}
