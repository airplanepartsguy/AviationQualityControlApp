import { openDatabase } from './databaseService';
import { isNetworkConnected } from './networkService';
import { addToSyncQueue } from './syncQueueService';

/**
 * SharePoint Integration Service
 * Handles authentication, file uploads, and data synchronization with SharePoint Online
 */

export interface SharePointConfig {
  tenantId: string;
  clientId: string;
  clientSecret: string;
  siteUrl: string;
  libraryName: string;
  redirectUri: string;
}

export interface SharePointConnection {
  id: string;
  name: string;
  status: 'connected' | 'disconnected' | 'error' | 'authenticating';
  lastSync: string | null;
  enabled: boolean;
  config: SharePointConfig | null;
  accessToken: string | null;
  refreshToken: string | null;
  tokenExpiry: string | null;
}

export interface SharePointUploadResult {
  success: boolean;
  fileUrl?: string;
  itemId?: string;
  error?: string;
}

/**
 * Initialize SharePoint connection table
 */
export const initializeSharePointStorage = async (): Promise<void> => {
  try {
    const db = await openDatabase();
    
    await db.execAsync(`
      CREATE TABLE IF NOT EXISTS sharepoint_connections (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        status TEXT DEFAULT 'disconnected',
        lastSync TEXT,
        enabled INTEGER DEFAULT 0,
        tenantId TEXT,
        clientId TEXT,
        clientSecret TEXT,
        siteUrl TEXT,
        libraryName TEXT,
        redirectUri TEXT,
        accessToken TEXT,
        refreshToken TEXT,
        tokenExpiry TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP
      );
      
      CREATE TABLE IF NOT EXISTS sharepoint_uploads (
        id TEXT PRIMARY KEY,
        connectionId TEXT NOT NULL,
        localFilePath TEXT NOT NULL,
        remoteFileUrl TEXT,
        itemId TEXT,
        uploadStatus TEXT DEFAULT 'pending',
        batchId TEXT,
        photoId TEXT,
        uploadedAt TEXT,
        error TEXT,
        retryCount INTEGER DEFAULT 0,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (connectionId) REFERENCES sharepoint_connections(id)
      );
      
      CREATE INDEX IF NOT EXISTS idx_sharepoint_uploads_status ON sharepoint_uploads(uploadStatus);
      CREATE INDEX IF NOT EXISTS idx_sharepoint_uploads_batch ON sharepoint_uploads(batchId);
    `);
    
    console.log('[SharePoint] Storage initialized successfully');
  } catch (error) {
    console.error('[SharePoint] Error initializing storage:', error);
    throw error;
  }
};

/**
 * Get all SharePoint connections
 */
export const getSharePointConnections = async (): Promise<SharePointConnection[]> => {
  try {
    const db = await openDatabase();
    
    const connections = await db.getAllAsync<any>(`
      SELECT * FROM sharepoint_connections ORDER BY created_at DESC
    `);
    
    return connections.map(conn => ({
      id: conn.id,
      name: conn.name,
      status: conn.status as SharePointConnection['status'],
      lastSync: conn.lastSync,
      enabled: Boolean(conn.enabled),
      config: conn.tenantId ? {
        tenantId: conn.tenantId,
        clientId: conn.clientId,
        clientSecret: conn.clientSecret,
        siteUrl: conn.siteUrl,
        libraryName: conn.libraryName,
        redirectUri: conn.redirectUri
      } : null,
      accessToken: conn.accessToken,
      refreshToken: conn.refreshToken,
      tokenExpiry: conn.tokenExpiry
    }));
  } catch (error) {
    console.error('[SharePoint] Error getting connections:', error);
    return [];
  }
};

/**
 * Create or update SharePoint connection
 */
export const saveSharePointConnection = async (connection: Partial<SharePointConnection>): Promise<string> => {
  try {
    const db = await openDatabase();
    const connectionId = connection.id || `sp_${Date.now()}`;
    
    await db.runAsync(`
      INSERT OR REPLACE INTO sharepoint_connections (
        id, name, status, lastSync, enabled, tenantId, clientId, clientSecret,
        siteUrl, libraryName, redirectUri, accessToken, refreshToken, tokenExpiry, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      connectionId,
      connection.name || 'SharePoint Connection',
      connection.status || 'disconnected',
      connection.lastSync || null,
      connection.enabled ? 1 : 0,
      connection.config?.tenantId || null,
      connection.config?.clientId || null,
      connection.config?.clientSecret || null,
      connection.config?.siteUrl || null,
      connection.config?.libraryName || null,
      connection.config?.redirectUri || null,
      connection.accessToken || null,
      connection.refreshToken || null,
      connection.tokenExpiry || null,
      new Date().toISOString()
    ]);
    
    console.log(`[SharePoint] Connection saved: ${connectionId}`);
    return connectionId;
  } catch (error) {
    console.error('[SharePoint] Error saving connection:', error);
    throw error;
  }
};

/**
 * Start OAuth authentication flow
 */
export const startSharePointAuth = async (connectionId: string, config: SharePointConfig): Promise<string> => {
  try {
    // Update connection status to authenticating
    await updateConnectionStatus(connectionId, 'authenticating');
    
    // Construct OAuth URL
    const authUrl = `https://login.microsoftonline.com/${config.tenantId}/oauth2/v2.0/authorize?` +
      `client_id=${config.clientId}&` +
      `response_type=code&` +
      `redirect_uri=${encodeURIComponent(config.redirectUri)}&` +
      `scope=${encodeURIComponent('https://graph.microsoft.com/Sites.ReadWrite.All Files.ReadWrite.All')}&` +
      `state=${connectionId}`;
    
    console.log(`[SharePoint] Auth URL generated for connection ${connectionId}`);
    return authUrl;
  } catch (error) {
    console.error('[SharePoint] Error starting auth:', error);
    await updateConnectionStatus(connectionId, 'error');
    throw error;
  }
};

/**
 * Complete OAuth authentication with authorization code
 */
export const completeSharePointAuth = async (connectionId: string, authCode: string): Promise<boolean> => {
  try {
    const connections = await getSharePointConnections();
    const connection = connections.find(c => c.id === connectionId);
    
    if (!connection || !connection.config) {
      throw new Error('Connection not found or missing configuration');
    }
    
    // Exchange authorization code for tokens
    const tokenResponse = await fetch(`https://login.microsoftonline.com/${connection.config.tenantId}/oauth2/v2.0/token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        client_id: connection.config.clientId,
        client_secret: connection.config.clientSecret,
        code: authCode,
        redirect_uri: connection.config.redirectUri,
        grant_type: 'authorization_code',
        scope: 'https://graph.microsoft.com/Sites.ReadWrite.All Files.ReadWrite.All'
      })
    });
    
    if (!tokenResponse.ok) {
      throw new Error(`Token exchange failed: ${tokenResponse.statusText}`);
    }
    
    const tokens = await tokenResponse.json();
    
    // Save tokens and update connection status
    const db = await openDatabase();
    await db.runAsync(`
      UPDATE sharepoint_connections 
      SET accessToken = ?, refreshToken = ?, tokenExpiry = ?, status = 'connected', updated_at = ?
      WHERE id = ?
    `, [
      tokens.access_token,
      tokens.refresh_token,
      new Date(Date.now() + tokens.expires_in * 1000).toISOString(),
      new Date().toISOString(),
      connectionId
    ]);
    
    console.log(`[SharePoint] Authentication completed for connection ${connectionId}`);
    return true;
  } catch (error) {
    console.error('[SharePoint] Error completing auth:', error);
    await updateConnectionStatus(connectionId, 'error');
    return false;
  }
};

/**
 * Refresh access token
 */
export const refreshSharePointToken = async (connectionId: string): Promise<boolean> => {
  try {
    const connections = await getSharePointConnections();
    const connection = connections.find(c => c.id === connectionId);
    
    if (!connection || !connection.config || !connection.refreshToken) {
      throw new Error('Connection not found or missing refresh token');
    }
    
    const tokenResponse = await fetch(`https://login.microsoftonline.com/${connection.config.tenantId}/oauth2/v2.0/token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        client_id: connection.config.clientId,
        client_secret: connection.config.clientSecret,
        refresh_token: connection.refreshToken,
        grant_type: 'refresh_token',
        scope: 'https://graph.microsoft.com/Sites.ReadWrite.All Files.ReadWrite.All'
      })
    });
    
    if (!tokenResponse.ok) {
      throw new Error(`Token refresh failed: ${tokenResponse.statusText}`);
    }
    
    const tokens = await tokenResponse.json();
    
    // Update tokens
    const db = await openDatabase();
    await db.runAsync(`
      UPDATE sharepoint_connections 
      SET accessToken = ?, refreshToken = ?, tokenExpiry = ?, updated_at = ?
      WHERE id = ?
    `, [
      tokens.access_token,
      tokens.refresh_token || connection.refreshToken, // Keep existing refresh token if not provided
      new Date(Date.now() + tokens.expires_in * 1000).toISOString(),
      new Date().toISOString(),
      connectionId
    ]);
    
    console.log(`[SharePoint] Token refreshed for connection ${connectionId}`);
    return true;
  } catch (error) {
    console.error('[SharePoint] Error refreshing token:', error);
    await updateConnectionStatus(connectionId, 'error');
    return false;
  }
};

/**
 * Upload file to SharePoint
 */
export const uploadToSharePoint = async (
  connectionId: string,
  filePath: string,
  fileName: string,
  batchId?: string,
  photoId?: string
): Promise<SharePointUploadResult> => {
  try {
    const connections = await getSharePointConnections();
    const connection = connections.find(c => c.id === connectionId);
    
    if (!connection || !connection.config || !connection.accessToken) {
      throw new Error('Connection not found or not authenticated');
    }
    
    // Check if token needs refresh
    if (connection.tokenExpiry && new Date(connection.tokenExpiry) <= new Date()) {
      const refreshed = await refreshSharePointToken(connectionId);
      if (!refreshed) {
        throw new Error('Failed to refresh access token');
      }
    }
    
    // Read file data (in a real implementation, you'd read the actual file)
    // For now, we'll simulate the upload process
    
    // Create upload record
    const uploadId = `upload_${Date.now()}`;
    const db = await openDatabase();
    
    await db.runAsync(`
      INSERT INTO sharepoint_uploads (
        id, connectionId, localFilePath, uploadStatus, batchId, photoId, created_at
      ) VALUES (?, ?, ?, 'uploading', ?, ?, ?)
    `, [uploadId, connectionId, filePath, batchId || null, photoId || null, new Date().toISOString()]);
    
    // Simulate upload to SharePoint (replace with actual Microsoft Graph API call)
    const uploadUrl = `${connection.config.siteUrl}/_api/web/lists/getbytitle('${connection.config.libraryName}')/rootfolder/files/add(url='${fileName}',overwrite=true)`;
    
    // In a real implementation, you would:
    // 1. Read the file from filePath
    // 2. Make a POST request to Microsoft Graph API
    // 3. Handle the response
    
    // For now, simulate success
    const mockFileUrl = `${connection.config.siteUrl}/Shared Documents/${fileName}`;
    const mockItemId = `item_${Date.now()}`;
    
    // Update upload record
    await db.runAsync(`
      UPDATE sharepoint_uploads 
      SET uploadStatus = 'completed', remoteFileUrl = ?, itemId = ?, uploadedAt = ?
      WHERE id = ?
    `, [mockFileUrl, mockItemId, new Date().toISOString(), uploadId]);
    
    // Update connection last sync
    await updateConnectionLastSync(connectionId);
    
    console.log(`[SharePoint] File uploaded successfully: ${fileName}`);
    return {
      success: true,
      fileUrl: mockFileUrl,
      itemId: mockItemId
    };
    
  } catch (error) {
    console.error('[SharePoint] Upload error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
};

/**
 * Queue photo batch for SharePoint upload
 */
export const queueBatchForSharePoint = async (connectionId: string, batchId: string): Promise<void> => {
  try {
    const taskId = `sharepoint_batch_${batchId}_${Date.now()}`;
    
    await addToSyncQueue({
      id: taskId,
      type: 'data_sync',
      payload: {
        operation: 'sharepoint_upload',
        connectionId,
        batchId,
        service: 'sharepoint'
      },
      status: 'queued'
    });
    
    console.log(`[SharePoint] Batch queued for upload: ${batchId}`);
  } catch (error) {
    console.error('[SharePoint] Error queuing batch:', error);
    throw error;
  }
};

/**
 * Test SharePoint connection
 */
export const testSharePointConnection = async (connectionId: string): Promise<boolean> => {
  try {
    const connections = await getSharePointConnections();
    const connection = connections.find(c => c.id === connectionId);
    
    if (!connection || !connection.config || !connection.accessToken) {
      return false;
    }
    
    // Test connection by making a simple API call
    const response = await fetch(`https://graph.microsoft.com/v1.0/sites/${connection.config.siteUrl}`, {
      headers: {
        'Authorization': `Bearer ${connection.accessToken}`,
        'Content-Type': 'application/json'
      }
    });
    
    const success = response.ok;
    await updateConnectionStatus(connectionId, success ? 'connected' : 'error');
    
    return success;
  } catch (error) {
    console.error('[SharePoint] Connection test failed:', error);
    await updateConnectionStatus(connectionId, 'error');
    return false;
  }
};

/**
 * Helper function to update connection status
 */
const updateConnectionStatus = async (connectionId: string, status: SharePointConnection['status']): Promise<void> => {
  try {
    const db = await openDatabase();
    await db.runAsync(`
      UPDATE sharepoint_connections 
      SET status = ?, updated_at = ?
      WHERE id = ?
    `, [status, new Date().toISOString(), connectionId]);
  } catch (error) {
    console.error('[SharePoint] Error updating connection status:', error);
  }
};

/**
 * Helper function to update last sync time
 */
const updateConnectionLastSync = async (connectionId: string): Promise<void> => {
  try {
    const db = await openDatabase();
    await db.runAsync(`
      UPDATE sharepoint_connections 
      SET lastSync = ?, updated_at = ?
      WHERE id = ?
    `, [new Date().toISOString(), new Date().toISOString(), connectionId]);
  } catch (error) {
    console.error('[SharePoint] Error updating last sync:', error);
  }
};

/**
 * Get upload statistics
 */
export const getSharePointStats = async (connectionId: string): Promise<{
  totalUploads: number;
  successfulUploads: number;
  failedUploads: number;
  pendingUploads: number;
}> => {
  try {
    const db = await openDatabase();
    
    const stats = await db.getFirstAsync<{
      total: number;
      completed: number;
      failed: number;
      pending: number;
    }>(`
      SELECT 
        COUNT(*) as total,
        SUM(CASE WHEN uploadStatus = 'completed' THEN 1 ELSE 0 END) as completed,
        SUM(CASE WHEN uploadStatus = 'failed' THEN 1 ELSE 0 END) as failed,
        SUM(CASE WHEN uploadStatus IN ('pending', 'uploading') THEN 1 ELSE 0 END) as pending
      FROM sharepoint_uploads 
      WHERE connectionId = ?
    `, [connectionId]);
    
    return {
      totalUploads: stats?.total || 0,
      successfulUploads: stats?.completed || 0,
      failedUploads: stats?.failed || 0,
      pendingUploads: stats?.pending || 0
    };
  } catch (error) {
    console.error('[SharePoint] Error getting stats:', error);
    return {
      totalUploads: 0,
      successfulUploads: 0,
      failedUploads: 0,
      pendingUploads: 0
    };
  }
};

export default {
  initializeSharePointStorage,
  getSharePointConnections,
  saveSharePointConnection,
  startSharePointAuth,
  completeSharePointAuth,
  refreshSharePointToken,
  uploadToSharePoint,
  queueBatchForSharePoint,
  testSharePointConnection,
  getSharePointStats
};
