/**
 * salesforceService.ts
 * Comprehensive service for interfacing with Salesforce/ERP system.
 * Features: 
 * - Offline support with persistent queue
 * - Auto retry for failed operations
 * - Sync status reporting and logs
 * - Network connectivity awareness
 * - Intelligent sync scheduling based on network conditions
 * - Mock implementation with configurable success rate for testing
 */
import * as FileSystem from 'expo-file-system';
import { PhotoData, SyncTask, QueueStatus, SyncResult } from '../types/data';
import { logAnalyticsEvent, logErrorToFile } from './analyticsService';
import { isNetworkConnected, addNetworkListener } from './networkService';

// Flag to track if a sync operation is in progress
let isSyncInProgress = false;

const MOCK_SALESFORCE_ENDPOINT = 'https://mock.salesforce.endpoint/records';
const LOG_FILE_URI = FileSystem.documentDirectory + 'salesforce_sync_log.txt';
const SYNC_QUEUE_FILE = FileSystem.documentDirectory + 'salesforce_sync_queue.json';

// Configuration
const CONFIG = {
  MAX_RETRY_ATTEMPTS: 3,
  SUCCESS_RATE: 0.85, // 85% success rate for mock implementation
  SYNC_INTERVAL: 30000, // 30 seconds between auto-sync attempts
  AUTO_SYNC: true, // Enable automatic sync attempts when online
  NETWORK_RECOVERY_DELAY: 5000, // Wait 5 seconds after network recovery before syncing
  BATCH_SIZE: 5, // Process this many items at once during sync
  STORAGE_QUOTA_MB: 50, // Maximum storage for offline queue (in MB)
};

// Using interfaces from ../types/data.ts

// Function to log sync attempts
async function logSyncAttempt(result: SyncResult): Promise<void> {
  const retryInfo = result.retryCount !== undefined ? `, Retry: ${result.retryCount}` : '';
  const logEntry = `${result.timestamp} - Success: ${result.success}, Message: ${result.message}${result.recordId ? ', RecordID: ' + result.recordId : ''}${retryInfo}\n`;
  
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
    
    // Keep logs to a reasonable size (last 500 entries)
    const contentLines = existingContent.split('\n');
    if (contentLines.length > 500) {
      existingContent = contentLines.slice(contentLines.length - 500).join('\n');
    }
    
    // Combine existing content with new entry
    const newContent = existingContent + logEntry;
    
    // Write the combined content back
    await FileSystem.writeAsStringAsync(LOG_FILE_URI, newContent, {
      encoding: FileSystem.EncodingType.UTF8,
    });
    
    // Also log to analytics
    await logAnalyticsEvent(result.success ? 'sync_success' : 'sync_fail', {
      recordId: result.recordId || 'none',
      retryCount: result.retryCount || 0
    });
  } catch (error) {
    console.error('Failed to write to Salesforce sync log:', error);
    await logErrorToFile('salesforceService.logSyncAttempt', error as Error);
  }
};

/**
 * Mock function to simulate syncing PDF data to Salesforce
 * In a real implementation, this would be an actual API call to Salesforce
 */
async function syncPdfToSalesforce(
  pdfUri: string,
  relatedData: { orderNumber?: string; inventoryId?: string; userId: string },
  retryCount: number = 0
): Promise<SyncResult> {
  console.log(`Attempting to sync PDF: ${pdfUri} for user: ${relatedData.userId}`);
  const timestamp = new Date().toISOString();

  // Simulate network delay
  await new Promise(resolve => setTimeout(resolve, 1500));

  // Simulate success/failure (e.g., 85% success rate)
  const isSuccess = Math.random() < CONFIG.SUCCESS_RATE;

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
      retryCount
    };
  } else {
    // Simulate a failure
    console.error('Mock Salesforce Sync Failed!');
    result = {
      success: false,
      message: 'Failed to sync PDF data. Mock network error.',
      timestamp,
      retryCount
    };
  }

  // Log the attempt
  await logSyncAttempt(result);

  return result;
};

// Function to read sync logs (e.g., for DebugScreen)
async function readSyncLogs(): Promise<string> {
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

/**
 * Offline sync queue management
 * This section handles queueing tasks for offline sync,
 * automatically retrying failed operations, and reporting sync status
 */

// Load the sync queue from storage
async function loadSyncQueue(): Promise<SyncTask[]> {
  try {
    const fileExists = await FileSystem.getInfoAsync(SYNC_QUEUE_FILE);
    if (!fileExists.exists) {
      console.log('[SalesforceService] Sync queue file not found, creating empty queue');
      return [];
    }
    
    const queueData = await FileSystem.readAsStringAsync(SYNC_QUEUE_FILE);
    const queue = JSON.parse(queueData) as SyncTask[];
    console.log(`[SalesforceService] Loaded sync queue with ${queue.length} items`);
    return queue;
  } catch (error) {
    console.error('[SalesforceService] Failed to load sync queue:', error);
    await logErrorToFile('salesforceService.loadSyncQueue', error instanceof Error ? error : new Error(String(error)));
    return []; // Return empty queue on error
  }
}

async function saveSyncQueue(queue: SyncTask[]): Promise<void> {
  try {
    await FileSystem.writeAsStringAsync(
      SYNC_QUEUE_FILE, 
      JSON.stringify(queue)
    );
  } catch (error) {
    console.error('Failed to save sync queue:', error);
    await logErrorToFile('salesforceService.saveSyncQueue', error as Error);
  }
}

// Add a task to the sync queue
async function addToSyncQueue(task: Omit<SyncTask, 'id' | 'attempts' | 'status' | 'lastAttempted'>): Promise<string> {
  try {
    const queue = await loadSyncQueue();
    
    // Create a new task with default properties
    const newTask: SyncTask = {
      id: `task_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
      type: task.type,
      payload: task.payload,
      status: 'queued',
      attempts: 0,
      lastAttempted: undefined
    };
    
    queue.push(newTask);
    await saveSyncQueue(queue);
    console.log(`[SalesforceService] Added task ${newTask.id} to sync queue`);
    return newTask.id;
  } catch (error) {
    console.error('[SalesforceService] Failed to add task to sync queue:', error);
    await logErrorToFile('salesforceService.addToSyncQueue', error as Error);
    throw error;
  }
}
/**
 * Process the sync queue with improved handling for network conditions
 * @returns Statistics about the sync operation
 */
async function processSyncQueue(): Promise<{
  processed: number;
  succeeded: number;
  failed: number;
  remaining: number;
  networkError?: boolean;
}> {
  // Declare variable for queue length outside try block for access in catch block
  let queueLength = 0;
  let queue: SyncTask[] = [];
  
  // Check if we're already syncing
  if (isSyncInProgress) {
    console.log('[SalesforceService] Sync already in progress, skipping');
    queue = await loadSyncQueue();
    return {
      processed: 0,
      succeeded: 0,
      failed: 0,
      remaining: queue.length,
      networkError: false
    };
  }
  
  // Set sync flag
  isSyncInProgress = true;
  
  try {
    // Check network connectivity first
    const networkConnected = await isNetworkConnected();
    if (!networkConnected) {
      console.log('[SalesforceService] No network connection, skipping sync');
      queue = await loadSyncQueue();
      isSyncInProgress = false;
      return {
        processed: 0,
        succeeded: 0,
        failed: 0,
        remaining: queue.length,
        networkError: true
      };
    }
    
    // Load the queue
    queue = await loadSyncQueue();
    queueLength = queue.length;
    
    if (queueLength === 0) {
      console.log('[SalesforceService] Sync queue is empty, nothing to process');
      isSyncInProgress = false;
      return {
        processed: 0,
        succeeded: 0,
        failed: 0,
        remaining: 0,
        networkError: false
      };
    }
    
    console.log(`[SalesforceService] Processing sync queue with ${queueLength} items`);
    
    // Process items in batches
    const batchSize = CONFIG.BATCH_SIZE;
    let processed = 0;
    let succeeded = 0;
    let failed = 0;
    
    // Process only pending items
    const pendingItems = queue.filter(item => item.status === 'queued');
    
    // Process in batches to avoid overwhelming the network
    for (let i = 0; i < pendingItems.length; i += batchSize) {
      const batch = pendingItems.slice(i, i + batchSize);
      
      // Process each item in the batch
      await Promise.all(batch.map(async (task) => {
        try {
          // Find the task in the original queue to update it
          const taskIndex = queue.findIndex(item => item.id === task.id);
          if (taskIndex === -1) return; // Skip if not found (shouldn't happen)
          
          // Update status to processing
          queue[taskIndex].status = 'processing';
          queue[taskIndex].lastAttempted = new Date().toISOString();
          await saveSyncQueue(queue); // Save immediately to prevent data loss
          
          // Process the task
          console.log(`[SalesforceService] Processing task ${task.id} (${task.type})`);
          
          // Attempt to sync based on task type
          let result: SyncResult;
          
          if (task.type === 'pdf_upload') {
            // Type assertion to access data properties safely
            const taskData = (task as any).data || {};
            result = await syncPdfToSalesforce(
              taskData.pdfUri || '',
              {
                orderNumber: taskData.orderNumber,
                inventoryId: taskData.inventoryId,
                userId: taskData.userId || 'unknown'
              },
              task.attempts
            );
          } else {
            // Unknown task type
            result = {
              success: false,
              timestamp: new Date().toISOString(),
              message: `Unknown task type: ${task.type}`,
              retryCount: task.attempts
            };
          }
          
          // Log the attempt
          await logSyncAttempt(result);
          
          // Update the task in the queue
          queue[taskIndex].attempts += 1;
          (queue[taskIndex] as any).lastResult = result;
          
          if (result.success) {
            queue[taskIndex].status = 'completed' as any; // Type assertion to allow 'completed'
            (queue[taskIndex] as any).completedAt = new Date().toISOString();
            succeeded++;
          } else if (queue[taskIndex].attempts >= CONFIG.MAX_RETRY_ATTEMPTS) {
            queue[taskIndex].status = 'failed';
            failed++;
          } else {
            queue[taskIndex].status = 'queued'; // Will be retried later
            failed++;
          }
          
          processed++;
        } catch (error) {
          console.error(`[SalesforceService] Error processing task ${task.id}:`, error);
          
          // Find the task again (in case queue was modified)
          const taskIndex = queue.findIndex(item => item.id === task.id);
          if (taskIndex !== -1) {
            queue[taskIndex].attempts += 1;
            (queue[taskIndex] as any).lastResult = {
              success: false,
              timestamp: new Date().toISOString(),
              message: `Exception: ${error instanceof Error ? error.message : String(error)}`,
              retryCount: queue[taskIndex].attempts
            };
            
            if (queue[taskIndex].attempts >= CONFIG.MAX_RETRY_ATTEMPTS) {
              queue[taskIndex].status = 'failed';
            } else {
              queue[taskIndex].status = 'queued'; // Will be retried later
            }
            
            failed++;
            processed++;
          }
        }
      }));
      
      // Save the queue after each batch is processed
      await saveSyncQueue(queue);
    }
    
    // Calculate remaining tasks
    const remainingTasks = queue.filter(item => item.status === 'queued').length;
    
    // Update sync flag
    isSyncInProgress = false;
    
    console.log(`[SalesforceService] Sync completed. Processed: ${processed}, Succeeded: ${succeeded}, Failed: ${failed}, Remaining: ${remainingTasks}`);
    
    return {
      processed,
      succeeded,
      failed,
      remaining: remainingTasks,
      networkError: false
    };
  } catch (error) {
    console.error('[SalesforceService] Error in processSyncQueue:', error);
    isSyncInProgress = false;
    return {
      processed: 0,
      succeeded: 0,
      failed: 0,
      remaining: queueLength,
      networkError: false
    };
  }
}

/**
 * Get current sync queue status
 * @returns Current status of the sync queue
 */
export async function getSyncQueueStatus(): Promise<QueueStatus> {
  const queue = await loadSyncQueue();
  
  // Find the most recent sync attempt
  let lastSyncAttempt: string | null = null;
  for (const task of queue) {
    if (task.lastAttempted && (!lastSyncAttempt || task.lastAttempted > lastSyncAttempt)) {
      lastSyncAttempt = task.lastAttempted;
    }
  }
  
  // Calculate queue size in bytes
  const queueSizeBytes = new TextEncoder().encode(JSON.stringify(queue)).length;
  const queueSizeMB = queueSizeBytes / (1024 * 1024);
  const quotaPercentage = (queueSizeMB / CONFIG.STORAGE_QUOTA_MB) * 100;
  
  return {
    pending: queue.filter(t => t.status === 'queued').length,
    processing: queue.filter(t => t.status === 'processing').length,
    failed: queue.filter(t => t.status === 'failed').length,
    completed: 0, // We remove completed tasks from the queue
    totalItems: queue.length,
    lastSyncAttempt,
    isOnline, // Use the tracked online state
    storageUsed: {
      bytes: queueSizeBytes,
      megabytes: queueSizeMB.toFixed(2),
      percentageOfQuota: quotaPercentage.toFixed(1)
    }
  };
}

// Reset failed tasks to try again
async function retryFailedTasks(): Promise<number> {
  const queue = await loadSyncQueue();
  let retryCount = 0;
  
  for (const task of queue) {
    if (task.status === 'failed') {
      task.status = 'queued';
      retryCount++;
    }
  }
  
  await saveSyncQueue(queue);
  return retryCount;
}

// Clear all tasks from the queue
async function clearSyncQueue(): Promise<number> {
  const queue = await loadSyncQueue();
  const count = queue.length;
  await saveSyncQueue([]);
  return count;
}

// Network and sync state tracking
let isOnline = false;
let syncInterval: NodeJS.Timeout | null = null;
let networkRecoveryTimeout: NodeJS.Timeout | null = null;
// isSyncInProgress is already declared at the top of the file

/**
 * Initialize network listener for intelligent sync
 * This should be called when the app starts
 */
function initSalesforceService(): void {
  console.log('[SalesforceService] Initializing with network monitoring');
  
  // Set initial online state
  isNetworkConnected().then(connected => {
    isOnline = connected;
    console.log(`[SalesforceService] Initial network state: ${isOnline ? 'Online' : 'Offline'}`);
    
    // If we're online at startup and auto-sync is enabled, start the sync process
    if (isOnline && CONFIG.AUTO_SYNC) {
      startAutoSync();
    }
  });
  
  // Add listener for network changes
  addNetworkListener((connected) => {
    const previousState = isOnline;
    isOnline = connected;
    
    console.log(`[SalesforceService] Network changed: ${isOnline ? 'Online' : 'Offline'}`);
    
    // Handle network recovery
    if (!previousState && isOnline) {
      console.log('[SalesforceService] Network recovered, scheduling sync');
      
      // Clear any existing recovery timeout
      if (networkRecoveryTimeout) {
        clearTimeout(networkRecoveryTimeout);
      }
      
      // Schedule sync after recovery delay
      networkRecoveryTimeout = setTimeout(async () => {
        const status = await getSyncQueueStatus();
        if (status.pending > 0 || status.failed > 0) {
          console.log('[SalesforceService] Network recovery sync starting...');
          await processSyncQueue();
        }
        
        // Start auto-sync if it's not running
        if (CONFIG.AUTO_SYNC && !syncInterval) {
          startAutoSync();
        }
      }, CONFIG.NETWORK_RECOVERY_DELAY);
    }
    
    // Handle network loss
    if (previousState && !isOnline) {
      console.log('[SalesforceService] Network lost, pausing auto-sync');
      stopAutoSync();
    }
  });
}

/**
 * Start automatic synchronization process
 */
function startAutoSync(): void {
  if (syncInterval) return;
  
  syncInterval = setInterval(async () => {
    // Only proceed if we're online and not already syncing
    if (isOnline && !isSyncInProgress) {
      const status = await getSyncQueueStatus();
      if (status.pending > 0 || status.failed > 0) {
        console.log('[SalesforceService] Auto-sync: Processing pending tasks...');
        await processSyncQueue();
      }
    }
  }, CONFIG.SYNC_INTERVAL);
  
  console.log('[SalesforceService] Auto-sync started with interval:', CONFIG.SYNC_INTERVAL, 'ms');
}

/**
 * Stop automatic synchronization process
 */
function stopAutoSync(): void {
  if (syncInterval) {
    clearInterval(syncInterval);
    syncInterval = null;
    console.log('[SalesforceService] Auto-sync stopped');
  }
}

// Export all functions as a single object
const salesforceService = {
  syncPdfToSalesforce,
  getSyncQueueStatus,
  initSalesforceService,
  startAutoSync,
  stopAutoSync,
  addToSyncQueue,
  loadSyncQueue,
  saveSyncQueue,
  retryFailedTasks,
  clearSyncQueue,
  readSyncLogs,
  processSyncQueue // Add this missing function
};

export default salesforceService;

// Note: We don't automatically start auto-sync here anymore.
// Instead, we initialize the service in App.tsx by calling initSalesforceService()
