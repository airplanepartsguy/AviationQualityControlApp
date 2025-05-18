// Placeholder for salesforceService.ts
import * as FileSystem from 'expo-file-system';
import { PhotoData } from '../types/data'; // Assuming types are defined

const MOCK_SALESFORCE_ENDPOINT = 'https://mock.salesforce.endpoint/records';
const LOG_FILE_URI = FileSystem.documentDirectory + 'salesforce_sync_log.txt';

interface SyncResult {
  success: boolean;
  message: string;
  recordId?: string; // Mock Salesforce record ID
  timestamp: string;
}

// Function to log sync attempts
const logSyncAttempt = async (result: SyncResult): Promise<void> => {
  const logEntry = `${result.timestamp} - Success: ${result.success}, Message: ${result.message}${result.recordId ? ', RecordID: ' + result.recordId : ''}\n`;
  try {
    // Read existing content first (if file exists)
    let existingContent = '';
    try {
      existingContent = await FileSystem.readAsStringAsync(LOG_FILE_URI, {
        encoding: FileSystem.EncodingType.UTF8,
      });
    } catch (readError) {
      // Ignore if file doesn't exist, it will be created by writeAsStringAsync
      if ((readError as any).code !== 'ERR_FILE_NOT_FOUND') {
        console.error('Failed to read existing Salesforce sync log:', readError);
      }
    }
    // Combine existing content with new entry
    const newContent = existingContent + logEntry;
    // Write the combined content back
    await FileSystem.writeAsStringAsync(LOG_FILE_URI, newContent, {
      encoding: FileSystem.EncodingType.UTF8,
    });
  } catch (error) {
    console.error('Failed to write to Salesforce sync log:', error);
  }
};

// Mock function to simulate syncing PDF data to Salesforce
export const syncPdfToSalesforce = async (
  pdfUri: string,
  relatedData: { orderNumber?: string; inventoryId?: string; userId: string }
): Promise<SyncResult> => {
  console.log(`Attempting to sync PDF: ${pdfUri} for user: ${relatedData.userId}`);
  const timestamp = new Date().toISOString();

  // Simulate network delay
  await new Promise(resolve => setTimeout(resolve, 1500));

  // Simulate success/failure (e.g., 80% success rate)
  const isSuccess = Math.random() < 0.8;

  let result: SyncResult;

  if (isSuccess) {
    // Simulate a successful API call
    const mockRecordId = `sf_mock_${Date.now()}`;
    console.log(`Mock Salesforce Sync Success! Record ID: ${mockRecordId}`);
    result = {
      success: true,
      message: `Successfully synced PDF for ${relatedData.orderNumber || relatedData.inventoryId || 'N/A'}.`,
      recordId: mockRecordId,
      timestamp,
    };
    // TODO: In a real scenario, you might delete the local PDF or mark it as synced
  } else {
    // Simulate a failure
    console.error('Mock Salesforce Sync Failed!');
    result = {
      success: false,
      message: 'Failed to sync PDF data. Mock network error.',
      timestamp,
    };
    // TODO: Implement retry logic or queueing for offline support
  }

  // Log the attempt
  await logSyncAttempt(result);

  return result;
};

// Function to read sync logs (e.g., for DebugScreen)
export const readSyncLogs = async (): Promise<string> => {
  try {
    const logContent = await FileSystem.readAsStringAsync(LOG_FILE_URI, {
      encoding: FileSystem.EncodingType.UTF8,
    });
    return logContent;
  } catch (error) {
    // If the file doesn't exist, return empty string
    if ((error as any).code === 'ERR_FILE_NOT_FOUND') {
      return 'No sync logs found.';
    }
    console.error('Failed to read Salesforce sync log:', error);
    return 'Error reading sync logs.';
  }
};
