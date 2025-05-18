import db from './databaseService';
import { AnalyticsEvent, AnalyticsEventName } from '../types/data';
import * as FileSystem from 'expo-file-system';

const LOG_FILE_URI = FileSystem.documentDirectory + 'error_log.txt';

/**
 * Logs an analytics event to the SQLite database.
 */
export const logAnalyticsEvent = async (eventName: AnalyticsEventName, details: Record<string, any> = {}): Promise<void> => {
  const timestamp = new Date().toISOString();
  const detailsString = JSON.stringify(details);

  return new Promise((resolve, reject) => {
    db.transaction((tx: any) => {
      tx.executeSql(
        'INSERT INTO analytics_events (eventName, timestamp, details) VALUES (?, ?, ?);',
        [eventName, timestamp, detailsString],
        (_tx: any, _result: any) => {
          console.log(`[Analytics] Logged event: ${eventName}`, details);
          resolve();
        },
        (_tx: any, error: any): boolean => {
          console.error(`[Analytics] Error logging event ${eventName}:`, error);
          // Attempt to log the logging error itself to the file as a fallback
          logErrorToFile(`Failed to log analytics event ${eventName} to DB: ${error?.message}`);
          reject(error);
          return false; // Rollback transaction
        }
      );
    });
  });
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
    const fileInfo = await FileSystem.getInfoAsync(LOG_FILE_URI);
    if (!fileInfo.exists) {
      await FileSystem.writeAsStringAsync(LOG_FILE_URI, '', { encoding: FileSystem.EncodingType.UTF8 });
      console.log(`[ErrorLog] Created log file at ${LOG_FILE_URI}`);
    }

    // Append the error message
    await FileSystem.writeAsStringAsync(LOG_FILE_URI, logEntry, {
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
 * Logs an error to the SQLite database.
 */
const logErrorToDb = (timestamp: string, message: string, stackTrace?: string): Promise<void> => {
  return new Promise((resolve, reject) => {
    db.transaction((tx: any) => {
      tx.executeSql(
        'INSERT INTO error_logs (timestamp, message, stackTrace) VALUES (?, ?, ?);',
        [timestamp, message, stackTrace ?? null],
        () => { console.log('[ErrorLog] Logged error to DB.'); resolve(); },
        (_tx: any, error: any): boolean => {
          console.error('[ErrorLog] Failed to log error to DB:', error);
          reject(error);
          return false;
        }
      );
    });
  });
};

/**
 * Retrieves all analytics events from the database.
 * (For potential use in AnalyticsScreen)
 */
export const getAnalyticsEvents = (): Promise<AnalyticsEvent[]> => {
  return new Promise((resolve, reject) => {
    db.transaction((tx: any) => {
      tx.executeSql(
        'SELECT * FROM analytics_events ORDER BY timestamp DESC;',
        [],
        (_tx: any, { rows }: any) => {
          const events: AnalyticsEvent[] = [];
          for (let i = 0; i < rows.length; i++) {
            const item = rows.item(i);
            try {
              events.push({
                id: item.id,
                eventName: item.eventName as AnalyticsEventName,
                timestamp: item.timestamp,
                details: item.details ? JSON.parse(item.details) : {},
              });
            } catch (e) {
              console.warn('[Analytics] Failed to parse event details:', e, item);
            }
          }
          resolve(events);
        },
        (_tx: any, error: any): boolean => {
          console.error('[Analytics] Failed to retrieve events:', error);
          reject(error);
          return false;
        }
      );
    });
  });
};

/**
 * Retrieves all error logs from the text file.
 * (For potential use in DebugScreen)
 */
export const getErrorLogsFromFile = async (): Promise<string> => {
  try {
    const fileInfo = await FileSystem.getInfoAsync(LOG_FILE_URI);
    if (!fileInfo.exists) {
      return 'Error log file does not exist.';
    }
    const content = await FileSystem.readAsStringAsync(LOG_FILE_URI, {
      encoding: FileSystem.EncodingType.UTF8,
    });
    return content || 'Error log file is empty.';
  } catch (error) {
    console.error('[ErrorLog] Failed to read error log file:', error);
    return `Failed to read log file: ${error instanceof Error ? error.message : String(error)}`;
  }
};
