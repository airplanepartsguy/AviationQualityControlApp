import * as SQLite from 'expo-sqlite';
import { SyncTask, QueueStatus, SyncResult } from '../types/data';
import { openDatabase } from './databaseService';

/**
 * Sync Queue Service - Manages offline operations queue for robust sync
 * Implements offline-first philosophy with reliable sync when connectivity returns
 */

let syncQueueDb: SQLite.SQLiteDatabase | null = null;

// Initialize sync queue tables
export const initializeSyncQueue = async (): Promise<void> => {
  try {
    console.log('[SyncQueue] Initializing sync queue tables...');
    const db = await openDatabase();
    
    // First, create tables with all required columns
    await db.execAsync(`
      -- Sync queue for managing upload operations
      CREATE TABLE IF NOT EXISTS sync_queue (
        id TEXT PRIMARY KEY,
        type TEXT NOT NULL, -- 'batch', 'photo', 'user_profile', etc.
        payload TEXT NOT NULL, -- JSON string with data to sync
        status TEXT NOT NULL DEFAULT 'pending', -- 'pending', 'in_progress', 'completed', 'failed'
        attempts INTEGER DEFAULT 0,
        maxAttempts INTEGER DEFAULT 3,
        createdAt TEXT DEFAULT CURRENT_TIMESTAMP,
        lastAttempted TEXT,
        completedAt TEXT,
        error TEXT,
        priority INTEGER DEFAULT 1 -- Higher number = higher priority
      );
    `);
    
    // Check if priority column exists and add it if missing
    console.log('[SyncQueue] Checking priority column...');
    const tableInfo = await db.getAllAsync("PRAGMA table_info(sync_queue)");
    const hasPriorityColumn = tableInfo.some((column: any) => column.name === 'priority');
    
    if (!hasPriorityColumn) {
      console.log('[SyncQueue] Adding missing priority column...');
      await db.execAsync('ALTER TABLE sync_queue ADD COLUMN priority INTEGER DEFAULT 1');
      console.log('[SyncQueue] Priority column added successfully');
    } else {
      console.log('[SyncQueue] Priority column already exists');
    }
    
    // Continue with the rest of the table creation
    await db.execAsync(`
      -- User sessions for offline tracking
      CREATE TABLE IF NOT EXISTS user_sessions (
        id TEXT PRIMARY KEY,
        userId TEXT NOT NULL,
        startTime TEXT DEFAULT CURRENT_TIMESTAMP,
        endTime TEXT,
        deviceInfo TEXT, -- JSON string with device details
        isActive INTEGER DEFAULT 1,
        photosCount INTEGER DEFAULT 0,
        batchesCount INTEGER DEFAULT 0
      );

      -- App settings for local storage
      CREATE TABLE IF NOT EXISTS app_settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        userId TEXT,
        updatedAt TEXT DEFAULT CURRENT_TIMESTAMP
      );

      -- Network status log for sync optimization
      CREATE TABLE IF NOT EXISTS network_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        timestamp TEXT DEFAULT CURRENT_TIMESTAMP,
        isOnline INTEGER NOT NULL,
        connectionType TEXT, -- 'wifi', 'cellular', 'none'
        syncTriggered INTEGER DEFAULT 0
      );

      -- Create sync conflicts table for conflict resolution
      CREATE TABLE IF NOT EXISTS sync_conflicts (
        id TEXT PRIMARY KEY,
        type TEXT NOT NULL, -- 'batch' or 'photo'
        localData TEXT NOT NULL, -- JSON string of local data
        remoteData TEXT NOT NULL, -- JSON string of remote data
        conflictFields TEXT NOT NULL, -- JSON array of conflicting field names
        timestamp TEXT NOT NULL,
        resolved INTEGER NOT NULL DEFAULT 0, -- 0 = unresolved, 1 = resolved
        resolutionStrategy TEXT -- 'local_wins', 'remote_wins', 'merge', 'manual'
      );

      -- Indexes for performance
      CREATE INDEX IF NOT EXISTS idx_sync_queue_status ON sync_queue(status);
      CREATE INDEX IF NOT EXISTS idx_sync_queue_priority ON sync_queue(priority DESC);
      CREATE INDEX IF NOT EXISTS idx_sync_queue_type ON sync_queue(type);
      CREATE INDEX IF NOT EXISTS idx_sync_conflicts_resolved ON sync_conflicts(resolved);
      CREATE INDEX IF NOT EXISTS idx_sync_conflicts_type ON sync_conflicts(type);
      CREATE INDEX IF NOT EXISTS idx_user_sessions_active ON user_sessions(isActive);
      CREATE INDEX IF NOT EXISTS idx_app_settings_user ON app_settings(userId);
    `);
    
    console.log('[SyncQueue] Sync queue tables initialized successfully');
  } catch (error) {
    console.error('[SyncQueue] Error initializing sync queue tables:', error);
    throw error;
  }
};

// Add task to sync queue
export const addToSyncQueue = async (task: Omit<SyncTask, 'attempts' | 'lastAttempted'>): Promise<void> => {
  const db = await openDatabase();
  
  try {
    await db.runAsync(
      `INSERT INTO sync_queue (id, type, payload, status, priority) VALUES (?, ?, ?, ?, ?)`,
      [
        task.id,
        task.type,
        JSON.stringify(task.payload),
        task.status || 'queued',
        1 // Default priority
      ]
    );
    
    console.log(`[SyncQueue] Added task to queue: ${task.id} (${task.type})`);
  } catch (error) {
    console.error('[SyncQueue] Error adding task to queue:', error);
    throw error;
  }
};

// Get next queued task for processing
export const getNextQueuedTask = async (): Promise<SyncTask | null> => {
  const db = await openDatabase();
  
  try {
    const result = await db.getFirstAsync<{
      id: string;
      type: string;
      payload: string;
      status: string;
      attempts: number;
      lastAttempted: string | null;
      error: string | null;
    }>(`
      SELECT id, type, payload, status, attempts, lastAttempted, error
      FROM sync_queue 
      WHERE status = 'queued' AND attempts < maxAttempts
      ORDER BY priority DESC, createdAt ASC
      LIMIT 1
    `);
    
    if (!result) return null;
    
    return {
      id: result.id,
      type: result.type as SyncTask['type'],
      payload: JSON.parse(result.payload),
      status: result.status as SyncTask['status'],
      attempts: result.attempts,
      lastAttempted: result.lastAttempted || undefined,
      error: result.error || undefined
    };
  } catch (error) {
    console.error('[SyncQueue] Error getting next queued task:', error);
    return null;
  }
};

// Update task status
export const updateTaskStatus = async (
  taskId: string, 
  status: SyncTask['status'], 
  error?: string
): Promise<void> => {
  const db = await openDatabase();
  
  try {
    const now = new Date().toISOString();
    
    if (status === 'processing') {
      await db.runAsync(
        `UPDATE sync_queue SET status = ?, lastAttempted = ?, attempts = attempts + 1 WHERE id = ?`,
        [status, now, taskId]
      );
    } else if (status === 'failed') {
      await db.runAsync(
        `UPDATE sync_queue SET status = ?, error = ?, lastAttempted = ? WHERE id = ?`,
        [status, error || 'Unknown error', now, taskId]
      );
    } else if (status === 'queued') {
      // Reset for retry
      await db.runAsync(
        `UPDATE sync_queue SET status = ?, error = NULL WHERE id = ?`,
        [status, taskId]
      );
    } else {
      // Completed
      await db.runAsync(
        `UPDATE sync_queue SET status = ?, completedAt = ? WHERE id = ?`,
        [status, now, taskId]
      );
    }
    
    console.log(`[SyncQueue] Updated task ${taskId} status to: ${status}`);
  } catch (error) {
    console.error('[SyncQueue] Error updating task status:', error);
    throw error;
  }
};

// Get queue status summary
export const getQueueStatus = async (): Promise<QueueStatus> => {
  const db = await openDatabase();
  
  try {
    const stats = await db.getFirstAsync<{
      pending: number;
      processing: number;
      failed: number;
      completed: number;
      total: number;
    }>(`
      SELECT 
        SUM(CASE WHEN status = 'queued' THEN 1 ELSE 0 END) as pending,
        SUM(CASE WHEN status = 'processing' THEN 1 ELSE 0 END) as processing,
        SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed,
        SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed,
        COUNT(*) as total
      FROM sync_queue
    `);
    
    const lastSync = await db.getFirstAsync<{ lastAttempted: string | null }>(`
      SELECT lastAttempted FROM sync_queue 
      WHERE lastAttempted IS NOT NULL 
      ORDER BY lastAttempted DESC 
      LIMIT 1
    `);
    
    return {
      pending: stats?.pending || 0,
      processing: stats?.processing || 0,
      failed: stats?.failed || 0,
      completed: stats?.completed || 0,
      totalItems: stats?.total || 0,
      lastSyncAttempt: lastSync?.lastAttempted || null,
      isOnline: true, // Will be updated by network service
      storageUsed: {
        bytes: 0,
        megabytes: '0.0',
        percentageOfQuota: '0%'
      }
    };
  } catch (error) {
    console.error('[SyncQueue] Error getting queue status:', error);
    return {
      pending: 0,
      processing: 0,
      failed: 0,
      completed: 0,
      totalItems: 0,
      lastSyncAttempt: null,
      isOnline: false,
      storageUsed: {
        bytes: 0,
        megabytes: '0.0',
        percentageOfQuota: '0%'
      }
    };
  }
};

// Clear completed tasks (cleanup)
export const clearCompletedTasks = async (olderThanDays: number = 7): Promise<number> => {
  const db = await openDatabase();
  
  try {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - olderThanDays);
    
    const result = await db.runAsync(
      `DELETE FROM sync_queue WHERE status = 'completed' AND completedAt < ?`,
      [cutoffDate.toISOString()]
    );
    
    console.log(`[SyncQueue] Cleared ${result.changes} completed tasks older than ${olderThanDays} days`);
    return result.changes || 0;
  } catch (error) {
    console.error('[SyncQueue] Error clearing completed tasks:', error);
    return 0;
  }
};

// Retry failed tasks
export const retryFailedTasks = async (): Promise<number> => {
  const db = await openDatabase();
  
  try {
    const result = await db.runAsync(
      `UPDATE sync_queue SET status = 'queued', error = NULL WHERE status = 'failed' AND attempts < maxAttempts`
    );
    
    console.log(`[SyncQueue] Reset ${result.changes} failed tasks for retry`);
    return result.changes || 0;
  } catch (error) {
    console.error('[SyncQueue] Error retrying failed tasks:', error);
    return 0;
  }
};

// App Settings Management
export const setSetting = async (key: string, value: any, userId?: string): Promise<void> => {
  const db = await openDatabase();
  
  try {
    await db.runAsync(
      `INSERT OR REPLACE INTO app_settings (key, value, userId, updatedAt) VALUES (?, ?, ?, ?)`,
      [key, JSON.stringify(value), userId || null, new Date().toISOString()]
    );
    
    console.log(`[SyncQueue] Setting saved: ${key}`);
  } catch (error) {
    console.error('[SyncQueue] Error saving setting:', error);
    throw error;
  }
};

export const getSetting = async <T = any>(key: string, userId?: string): Promise<T | null> => {
  const db = await openDatabase();
  
  try {
    const result = await db.getFirstAsync<{ value: string }>(`
      SELECT value FROM app_settings 
      WHERE key = ? AND (userId = ? OR userId IS NULL)
      ORDER BY userId DESC
      LIMIT 1
    `, [key, userId || null]);
    
    if (!result) return null;
    
    return JSON.parse(result.value) as T;
  } catch (error) {
    console.error('[SyncQueue] Error getting setting:', error);
    return null;
  }
};

// User Session Management
export const startUserSession = async (userId: string, deviceInfo: any): Promise<string> => {
  const db = await openDatabase();
  
  try {
    const sessionId = `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    // End any existing active sessions
    await db.runAsync(
      `UPDATE user_sessions SET isActive = 0, endTime = ? WHERE userId = ? AND isActive = 1`,
      [new Date().toISOString(), userId]
    );
    
    // Start new session
    await db.runAsync(
      `INSERT INTO user_sessions (id, userId, deviceInfo) VALUES (?, ?, ?)`,
      [sessionId, userId, JSON.stringify(deviceInfo)]
    );
    
    console.log(`[SyncQueue] Started user session: ${sessionId}`);
    return sessionId;
  } catch (error) {
    console.error('[SyncQueue] Error starting user session:', error);
    throw error;
  }
};

export const endUserSession = async (sessionId: string): Promise<void> => {
  const db = await openDatabase();
  
  try {
    await db.runAsync(
      `UPDATE user_sessions SET isActive = 0, endTime = ? WHERE id = ?`,
      [new Date().toISOString(), sessionId]
    );
    
    console.log(`[SyncQueue] Ended user session: ${sessionId}`);
  } catch (error) {
    console.error('[SyncQueue] Error ending user session:', error);
    throw error;
  }
};

// Network status logging
export const logNetworkStatus = async (isOnline: boolean, connectionType: string): Promise<void> => {
  const db = await openDatabase();
  
  try {
    await db.runAsync(
      `INSERT INTO network_log (isOnline, connectionType) VALUES (?, ?)`,
      [isOnline ? 1 : 0, connectionType]
    );
    
    // Keep only last 100 entries
    await db.runAsync(
      `DELETE FROM network_log WHERE id NOT IN (
        SELECT id FROM network_log ORDER BY timestamp DESC LIMIT 100
      )`
    );
  } catch (error) {
    console.error('[SyncQueue] Error logging network status:', error);
  }
};
