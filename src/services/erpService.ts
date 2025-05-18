import * as FileSystem from 'expo-file-system';
import { Alert } from 'react-native';
import { PhotoData } from '../types/data';
import { logAnalyticsEvent } from './analyticsService';

// Define a mock API endpoint (replace with actual ERP endpoint later)
const MOCK_ERP_ENDPOINT = 'https://mock-erp.example.com/api/qcdata';

// Directory to store mock responses/logs
const syncLogDir = `${FileSystem.documentDirectory}erp_sync_logs/`;

// Ensure log directory exists
const ensureLogDirExists = async () => {
  const dirInfo = await FileSystem.getInfoAsync(syncLogDir);
  if (!dirInfo.exists) {
    console.log('Creating ERP sync log directory...');
    await FileSystem.makeDirectoryAsync(syncLogDir, { intermediates: true });
  }
};

interface SyncData {
  pdfUri: string;
  metadata: {
    partNumber: string;
    batchId: string;
    timestamp: string;
    userId: string | null;
  };
  // Add other relevant data if needed
}

/**
 * Simulates sending PDF data to an ERP system.
 * In a real scenario, this would involve uploading the file and metadata.
 */
export const mockSyncToErp = async (data: SyncData): Promise<{ success: boolean; message: string; logFile?: string }> => {
  await ensureLogDirExists();
  const timestamp = new Date().toISOString();
  const logFileName = `sync_attempt_${timestamp.replace(/[:.]/g, '-')}.json`;
  const logFilePath = `${syncLogDir}${logFileName}`;

  console.log(`Attempting mock ERP sync for Batch ID: ${data.metadata.batchId}`);

  // Prepare mock payload
  const payload = {
    ...data.metadata,
    pdfFileName: data.pdfUri.split('/').pop(), // Extract filename
    syncTimestamp: timestamp,
  };

  try {
    // Simulate network request (replace with actual fetch)
    console.log(`Mock POST to ${MOCK_ERP_ENDPOINT} with payload:`, payload);
    await new Promise(resolve => setTimeout(resolve, 1500)); // Simulate network delay

    // Simulate successful response
    const mockResponse = {
      status: 'success',
      message: `Data for Batch ID ${data.metadata.batchId} synced successfully at ${timestamp}`,
      transactionId: `ERP-${Date.now()}`,
    };

    // Log the attempt and mock response
    const logContent = JSON.stringify({ request: payload, response: mockResponse, timestamp }, null, 2);
    await FileSystem.writeAsStringAsync(logFilePath, logContent);

    console.log(`Mock ERP sync successful. Log saved to: ${logFilePath}`);
    Alert.alert('Sync Successful', `Mock ERP sync completed for Batch ID: ${data.metadata.batchId}.`);
    return { success: true, message: mockResponse.message, logFile: logFilePath };

  } catch (error: any) {
    console.error('Mock ERP sync failed:', error);

    // Log the error
    const errorLogContent = JSON.stringify({ request: payload, error: error.message || 'Unknown error', timestamp }, null, 2);
    await FileSystem.writeAsStringAsync(logFilePath, errorLogContent);

    Alert.alert('Sync Failed', `Mock ERP sync failed for Batch ID: ${data.metadata.batchId}. Check logs.`);
    return { success: false, message: error.message || 'Sync failed', logFile: logFilePath };
  }
};

/**
 * Function to retrieve sync logs (optional, for debug screen)
 */
export const getSyncLogs = async () => {
  await ensureLogDirExists();
  try {
    const logFiles = await FileSystem.readDirectoryAsync(syncLogDir);
    const logs = await Promise.all(
      logFiles.map(async (fileName) => {
        const fileUri = `${syncLogDir}${fileName}`;
        try {
          const content = await FileSystem.readAsStringAsync(fileUri);
          return { fileName, content: JSON.parse(content) };
        } catch {
          return { fileName, content: 'Error reading log file' };
        }
      })
    );
    return logs.sort((a, b) => b.fileName.localeCompare(a.fileName)); // Sort newest first
  } catch (error) {
    console.error('Error reading sync logs:', error);
    return [];
  }
};

const MOCK_ERP_ENDPOINT_SYNC = 'https://mock-erp.example.com/api/sync';
const MOCK_API_KEY = 'dummy-key-12345'; // Example: Replace with actual or config

/**
 * Simulates sending processed inspection data (like a generated PDF or photo data) to an ERP system.
 * In a real scenario, this would involve making a network request (e.g., POST) with proper authentication
 * and data formatting (e.g., sending the PDF file or structured JSON).
 */
export async function syncDataWithERP(data: { inspectionId: string; pdfUri?: string; photos: PhotoData[] }): Promise<{ success: boolean; message: string }> {
  console.log(`[ERP Service] Attempting to sync data for inspection ${data.inspectionId}...`);

  // Log the attempt
  await logAnalyticsEvent('erp_sync_attempt', { inspectionId: data.inspectionId, photoCount: data.photos.length });

  // --- MOCK IMPLEMENTATION --- //
  // Simulate network delay
  await new Promise(resolve => setTimeout(resolve, 1500));

  // Simulate potential failure (e.g., 10% chance)
  if (Math.random() < 0.1) {
    console.error('[ERP Service] Mock Sync Failed: Network error or invalid data.');
    // Log specific ERP failure event
    await logAnalyticsEvent('erp_sync_failed', { 
        inspectionId: data.inspectionId, 
        reason: 'Simulated network failure' // Use a more structured payload if needed
    }); 
    return { success: false, message: 'Mock Sync Failed: Simulated network error.' };
  }

  // Simulate success
  console.log(`[ERP Service] Mock Sync Success for inspection ${data.inspectionId}`);
  console.log('[ERP Service] Data payload (mock): ', JSON.stringify({ 
    inspectionId: data.inspectionId,
    pdfUri: data.pdfUri ?? 'N/A',
    numberOfPhotos: data.photos.length,
    apiKey: MOCK_API_KEY.substring(0, 5) + '...' // Don't log full key
  }, null, 2));

  return { success: true, message: 'Data synced successfully (Mock)' };
  // --- END MOCK --- //

  /*
  // --- REAL IMPLEMENTATION EXAMPLE (using fetch) ---
  try {
    const formData = new FormData();
    formData.append('inspectionId', data.inspectionId);
    // If sending PDF:
    if (data.pdfUri) {
      const fileType = 'application/pdf'; // Or determine dynamically
      const fileName = data.pdfUri.split('/').pop() || 'inspection.pdf';
      formData.append('file', {
        uri: data.pdfUri,
        name: fileName,
        type: fileType,
      } as any);
    }
    // Or if sending structured photo data:
    // formData.append('photos', JSON.stringify(data.photos));

    const response = await fetch(MOCK_ERP_ENDPOINT_SYNC, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${MOCK_API_KEY}`,
        // 'Content-Type': 'multipart/form-data', // fetch handles this with FormData
      },
      body: formData,
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`ERP sync failed: ${response.status} ${errorText}`);
    }

    const responseData = await response.json();
    console.log('[ERP Service] Sync successful:', responseData);
    return { success: true, message: responseData.message || 'Synced successfully.' };

  } catch (error: any) {
    console.error('[ERP Service] Error syncing with ERP:', error);
    await logAnalyticsEvent('error_occurred', { context: 'ERP Sync', error: error.message });
    return { success: false, message: `ERP sync failed: ${error.message}` };
  }
  */
}
