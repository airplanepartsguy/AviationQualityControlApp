import * as FileSystem from 'expo-file-system';

// Constants
const ERROR_LOG_FILE_URI = `${FileSystem.documentDirectory}error_logs.txt`;
const ANALYTICS_LOG_FILE_URI = `${FileSystem.documentDirectory}analytics_logs.txt`;

/**
 * Logs an analytics event to the console and eventually to a file
 * @param eventType The type of the event to log
 * @param eventData Additional data to log with the event
 */
export const logAnalyticsEvent = async (
  eventType: string,
  eventData: Record<string, any> = {}
): Promise<void> => {
  try {
    const timestamp = new Date().toISOString();
    
    // Clean up eventData by removing undefined values
    const cleanEventData = Object.entries(eventData).reduce((acc, [key, value]) => {
      if (value !== undefined) {
        acc[key] = value;
      }
      return acc;
    }, {} as Record<string, any>);
    
    // In a real app, this would insert into a database
    // For now, just log to console
    console.log(`[Analytics] Logged event: ${eventType}`, {
      timestamp,
      ...cleanEventData
    });
    
    // Log to analytics file instead of error file
    await logAnalyticsToFile(eventType, cleanEventData);
  } catch (error) {
    console.error(`[Analytics] Failed to log event ${eventType}:`, error);
    await logErrorToFile(`Failed to log analytics event ${eventType}`, error instanceof Error ? error : new Error(String(error)));
  }
};

/**
 * Logs analytics events to a dedicated analytics log file
 * Separates analytics from actual errors
 */
const logAnalyticsToFile = async (eventType: string, eventData: Record<string, any>): Promise<void> => {
  try {
    const timestamp = new Date().toISOString();
    const logEntry = `${timestamp}: ${eventType} - ${JSON.stringify(eventData, null, 2)}\n`;

    // Ensure file exists (create if not)
    const fileInfo = await FileSystem.getInfoAsync(ANALYTICS_LOG_FILE_URI);
    if (!fileInfo.exists) {
      await FileSystem.writeAsStringAsync(ANALYTICS_LOG_FILE_URI, '', { encoding: FileSystem.EncodingType.UTF8 });
      console.log(`[Analytics] Created analytics log file at ${ANALYTICS_LOG_FILE_URI}`);
    }

    // Append the analytics event
    await FileSystem.writeAsStringAsync(ANALYTICS_LOG_FILE_URI, logEntry, {
      encoding: FileSystem.EncodingType.UTF8,
      append: true, // Use append option
    } as any); // Add type assertion to bypass WritingOptions check
  } catch (err) {
    console.error('[Analytics] Failed to write analytics log to file:', err);
  }
};

/**
 * Logs an error message to a simple text file in the app's document directory.
 * Includes a timestamp for each entry.
 * Also logs to console.
 */
export const logErrorToFile = async (message: string, error?: Error): Promise<void> => {
  console.error(`[ErrorLog] ${message}`, error); // Log to console immediately

  const timestamp = new Date().toISOString();
  const stackTrace = error?.stack ? `\nStack Trace:\n${error.stack}` : '';
  const logEntry = `${timestamp}: ${message}${stackTrace}\n`;

  try {
    // Ensure file exists (create if not)
    const fileInfo = await FileSystem.getInfoAsync(ERROR_LOG_FILE_URI);
    if (!fileInfo.exists) {
      await FileSystem.writeAsStringAsync(ERROR_LOG_FILE_URI, '', { encoding: FileSystem.EncodingType.UTF8 });
      console.log(`[ErrorLog] Created log file at ${ERROR_LOG_FILE_URI}`);
    }

    // Append the error message
    await FileSystem.writeAsStringAsync(ERROR_LOG_FILE_URI, logEntry, {
      encoding: FileSystem.EncodingType.UTF8,
      append: true, // Use append option
    } as any); // Add type assertion to bypass WritingOptions check
    console.log(`[ErrorLog] Successfully logged error to file.`);

    // Optionally, also log to DB table
    logErrorToDb(timestamp, message, error?.stack);

  } catch (err) {
    console.error('[ErrorLog] CRITICAL: Failed to write error log to file:', err);
  }
};

/**
 * Mock function for logging errors to a database
 * In a real app, this would use SQLite or another database
 */
const logErrorToDb = async (timestamp: string, message: string, stackTrace?: string): Promise<void> => {
  console.log('[ErrorLog] Would log to DB:', { timestamp, message, stackTrace });
  // No actual DB operations in this mock version
};

/**
 * Mock function that would retrieve analytics events from a database
 * In a real app, this would fetch from SQLite or another database
 */
export const getAnalyticsEvents = async (): Promise<any[]> => {
  // This is a mock implementation that returns empty array
  // In a real app, this would query the database
  console.log('[Analytics] Would fetch events from database');
  return [];
};

/**
 * Retrieves all error logs from the text file.
 * (For potential use in DebugScreen)
 */
export const getErrorLogsFromFile = async (): Promise<string> => {
  try {
    const fileInfo = await FileSystem.getInfoAsync(ERROR_LOG_FILE_URI);
    if (!fileInfo.exists) {
      return 'Error log file does not exist.';
    }
    const content = await FileSystem.readAsStringAsync(ERROR_LOG_FILE_URI, {
      encoding: FileSystem.EncodingType.UTF8,
    });
    return content || 'Error log file is empty.';
  } catch (error) {
    console.error('[ErrorLog] Failed to read error log file:', error);
    return `Failed to read log file: ${error instanceof Error ? error.message : String(error)}`;
  }
};

/**
 * Generates mock analytics data for the AnalyticsScreen.
 * In a production app, this would fetch real data from the database.
 */
export const getAnalyticsData = async (timeRange: 'day' | 'week' | 'month'): Promise<any> => {
  // Simulate network delay
  await new Promise(resolve => setTimeout(resolve, 500));
  
  // Generate dates for the chart based on time range
  const dates = generateDateLabels(timeRange);
  
  // Generate random data for each date
  const photoCountsByDate = dates.map(() => Math.floor(Math.random() * 10) + 1);
  const dateLabels = dates.map(date => date.split('T')[0].substring(5)); // Format as MM-DD
  
  // Generate random defect counts
  const criticalDefects = Math.floor(Math.random() * 15) + 5;
  const moderateDefects = Math.floor(Math.random() * 25) + 10;
  const minorDefects = Math.floor(Math.random() * 35) + 15;
  
  // Generate random scan stats
  const totalScans = Math.floor(Math.random() * 100) + 50;
  const successfulScans = Math.floor(totalScans * (0.7 + Math.random() * 0.25)); // 70-95% success rate
  const failedScans = totalScans - successfulScans;
  
  // Generate PDF stats
  const generatedPdfs = Math.floor(Math.random() * 40) + 10;
  const sharedPdfs = Math.floor(generatedPdfs * (0.5 + Math.random() * 0.3)); // 50-80% share rate
  
  // Generate sync stats
  const attemptedSyncs = Math.floor(Math.random() * 50) + 20;
  const successfulSyncs = Math.floor(attemptedSyncs * (0.6 + Math.random() * 0.35)); // 60-95% success rate
  const failedSyncs = Math.floor((attemptedSyncs - successfulSyncs) * 0.7); // Some failed syncs
  const pendingSyncs = attemptedSyncs - successfulSyncs - failedSyncs; // Remaining are pending
  
  return {
    photoStats: {
      total: photoCountsByDate.reduce((sum, count) => sum + count, 0),
      withDefects: criticalDefects + moderateDefects + minorDefects,
      withoutDefects: photoCountsByDate.reduce((sum, count) => sum + count, 0) - (criticalDefects + moderateDefects + minorDefects),
      byDate: dates.map((date, index) => ({ date, count: photoCountsByDate[index] })),
    },
    defectStats: {
      critical: criticalDefects,
      moderate: moderateDefects,
      minor: minorDefects,
    },
    scanStats: {
      total: totalScans,
      successful: successfulScans,
      failed: failedScans,
      successRate: Math.round((successfulScans / totalScans) * 100),
    },
    pdfStats: {
      generated: generatedPdfs,
      averageGenerationTime: Math.floor(Math.random() * 1000) + 500, // 500-1500ms
      shared: sharedPdfs,
    },
    syncStats: {
      attempted: attemptedSyncs,
      successful: successfulSyncs,
      failed: failedSyncs,
      pending: pendingSyncs,
    },
  };
};

/**
 * Helper function to generate date labels for charts based on time range
 */
const generateDateLabels = (timeRange: 'day' | 'week' | 'month'): string[] => {
  const now = new Date();
  const dates: string[] = [];
  
  let numDays: number;
  let interval: number;
  
  switch (timeRange) {
    case 'day':
      numDays = 24; // 24 hours
      interval = 1; // 1 hour intervals
      for (let i = 0; i < numDays; i += interval) {
        const date = new Date(now);
        date.setHours(date.getHours() - i);
        dates.unshift(date.toISOString());
      }
      break;
    case 'week':
      numDays = 7; // 7 days
      interval = 1; // 1 day intervals
      for (let i = 0; i < numDays; i += interval) {
        const date = new Date(now);
        date.setDate(date.getDate() - i);
        dates.unshift(date.toISOString());
      }
      break;
    case 'month':
      numDays = 30; // 30 days
      interval = 3; // 3 day intervals
      for (let i = 0; i < numDays; i += interval) {
        const date = new Date(now);
        date.setDate(date.getDate() - i);
        dates.unshift(date.toISOString());
      }
      break;
  }
  
  return dates;
};
