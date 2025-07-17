import { openDatabase } from './databaseService';
import companyService from './companyService';

/**
 * Data Isolation Service - Multi-Tenant Data Security
 * Ensures complete data separation between companies/tenants
 */

export interface TenantContext {
  userId: string;
  companyId: string;
  role: string;
  permissions: string[];
}

export interface DataAccessRule {
  table: string;
  operation: 'SELECT' | 'INSERT' | 'UPDATE' | 'DELETE';
  condition: string;
  parameters: any[];
}

/**
 * Current tenant context (set during authentication)
 */
let currentTenantContext: TenantContext | null = null;

/**
 * Set the current tenant context
 */
export const setTenantContext = (context: TenantContext): void => {
  currentTenantContext = context;
  console.log('[DataIsolation] Tenant context set:', context.companyId, context.role);
};

/**
 * Get the current tenant context
 */
export const getTenantContext = (): TenantContext | null => {
  return currentTenantContext;
};

/**
 * Clear the tenant context (on logout)
 */
export const clearTenantContext = (): void => {
  currentTenantContext = null;
  console.log('[DataIsolation] Tenant context cleared');
};

/**
 * Validate tenant access to data
 */
export const validateTenantAccess = (requiredCompanyId: string): boolean => {
  if (!currentTenantContext) {
    console.warn('[DataIsolation] No tenant context set');
    return false;
  }

  if (currentTenantContext.companyId !== requiredCompanyId) {
    console.warn('[DataIsolation] Tenant access denied:', {
      current: currentTenantContext.companyId,
      required: requiredCompanyId
    });
    return false;
  }

  return true;
};

/**
 * Add company isolation to database tables
 */
export const addCompanyIsolationToTables = async (): Promise<void> => {
  try {
    const db = await openDatabase();
    
    // Add companyId column to existing tables that need tenant isolation
    const tables = [
      'photo_batches',
      'photos',
      'annotations',
      'sync_queue',
      'sync_conflicts',
      'user_sessions'
    ];

    for (const table of tables) {
      try {
        // Check if companyId column already exists
        const tableInfo = await db.getAllAsync(`PRAGMA table_info(${table})`);
        const hasCompanyId = (tableInfo as any[]).some(col => col.name === 'companyId');
        
        if (!hasCompanyId) {
          await db.execAsync(`ALTER TABLE ${table} ADD COLUMN companyId TEXT`);
          console.log(`[DataIsolation] Added companyId to ${table}`);
        }
      } catch (error) {
        // Table might not exist yet, which is fine
        console.log(`[DataIsolation] Skipping ${table} (table not found)`);
      }
    }

    // Create indexes for company-based queries
    const indexQueries = [
      'CREATE INDEX IF NOT EXISTS idx_photo_batches_company ON photo_batches (companyId)',
      'CREATE INDEX IF NOT EXISTS idx_photos_company ON photos (companyId)',
      'CREATE INDEX IF NOT EXISTS idx_annotations_company ON annotations (companyId)',
      'CREATE INDEX IF NOT EXISTS idx_sync_queue_company ON sync_queue (companyId)',
      'CREATE INDEX IF NOT EXISTS idx_sync_conflicts_company ON sync_conflicts (companyId)',
      'CREATE INDEX IF NOT EXISTS idx_user_sessions_company ON user_sessions (companyId)'
    ];

    for (const query of indexQueries) {
      try {
        await db.execAsync(query);
      } catch (error) {
        // Index might already exist or table might not exist
        console.log('[DataIsolation] Index creation skipped:', error);
      }
    }

    console.log('[DataIsolation] Company isolation added to tables');
  } catch (error) {
    console.error('[DataIsolation] Error adding company isolation:', error);
    throw error;
  }
};

/**
 * Generate tenant-safe SQL query
 */
export const generateTenantSafeQuery = (
  baseQuery: string,
  table: string,
  operation: 'SELECT' | 'INSERT' | 'UPDATE' | 'DELETE'
): { query: string; parameters: any[] } => {
  if (!currentTenantContext) {
    throw new Error('No tenant context set');
  }

  const companyId = currentTenantContext.companyId;
  
  switch (operation) {
    case 'SELECT':
      // Add WHERE clause for company isolation
      if (baseQuery.toLowerCase().includes('where')) {
        return {
          query: baseQuery.replace(/where/i, `WHERE companyId = ? AND`),
          parameters: [companyId]
        };
      } else {
        return {
          query: `${baseQuery} WHERE companyId = ?`,
          parameters: [companyId]
        };
      }
      
    case 'INSERT':
      // Ensure companyId is included in INSERT
      if (!baseQuery.toLowerCase().includes('companyid')) {
        // This is a simplified approach - in practice, you'd need more sophisticated parsing
        console.warn('[DataIsolation] INSERT query should include companyId');
      }
      return { query: baseQuery, parameters: [] };
      
    case 'UPDATE':
      // Add WHERE clause for company isolation
      if (baseQuery.toLowerCase().includes('where')) {
        return {
          query: baseQuery.replace(/where/i, `WHERE companyId = ? AND`),
          parameters: [companyId]
        };
      } else {
        return {
          query: `${baseQuery} WHERE companyId = ?`,
          parameters: [companyId]
        };
      }
      
    case 'DELETE':
      // Add WHERE clause for company isolation
      if (baseQuery.toLowerCase().includes('where')) {
        return {
          query: baseQuery.replace(/where/i, `WHERE companyId = ? AND`),
          parameters: [companyId]
        };
      } else {
        return {
          query: `${baseQuery} WHERE companyId = ?`,
          parameters: [companyId]
        };
      }
      
    default:
      return { query: baseQuery, parameters: [] };
  }
};

/**
 * Tenant-safe database query wrapper
 */
export const executeTenantSafeQuery = async (
  query: string,
  parameters: any[] = [],
  table: string,
  operation: 'SELECT' | 'INSERT' | 'UPDATE' | 'DELETE'
): Promise<any> => {
  if (!currentTenantContext) {
    throw new Error('No tenant context set for database operation');
  }

  const db = await openDatabase();
  const { query: safeQuery, parameters: safeParams } = generateTenantSafeQuery(query, table, operation);
  const allParams = [...safeParams, ...parameters];

  try {
    switch (operation) {
      case 'SELECT':
        if (query.toLowerCase().includes('limit 1') || query.toLowerCase().includes('getfirstasync')) {
          return await db.getFirstAsync(safeQuery, allParams);
        } else {
          return await db.getAllAsync(safeQuery, allParams);
        }
      case 'INSERT':
      case 'UPDATE':
      case 'DELETE':
        return await db.runAsync(safeQuery, allParams);
      default:
        throw new Error(`Unsupported operation: ${operation}`);
    }
  } catch (error) {
    console.error('[DataIsolation] Tenant-safe query failed:', {
      query: safeQuery,
      parameters: allParams,
      error
    });
    throw error;
  }
};

/**
 * Check if user has permission for operation
 */
export const checkOperationPermission = (
  operation: string,
  resource: string
): boolean => {
  if (!currentTenantContext) {
    return false;
  }

  const { role, permissions } = currentTenantContext;

  // Owner and admin have all permissions
  if (role === 'owner' || role === 'admin') {
    return true;
  }

  // Check specific permission
  const requiredPermission = `${operation}_${resource}`;
  return permissions.includes(requiredPermission) || permissions.includes(`${operation}_*`);
};

/**
 * Audit log for tenant operations
 */
export const logTenantOperation = async (
  operation: string,
  resource: string,
  resourceId: string,
  details?: any
): Promise<void> => {
  if (!currentTenantContext) {
    return;
  }

  try {
    const db = await openDatabase();
    
    // Create audit log table if it doesn't exist
    await db.execAsync(`
      CREATE TABLE IF NOT EXISTS tenant_audit_log (
        id TEXT PRIMARY KEY,
        companyId TEXT NOT NULL,
        userId TEXT NOT NULL,
        operation TEXT NOT NULL,
        resource TEXT NOT NULL,
        resourceId TEXT NOT NULL,
        details TEXT,
        timestamp TEXT DEFAULT CURRENT_TIMESTAMP,
        ipAddress TEXT,
        userAgent TEXT
      )
    `);

    const logId = `audit_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    await db.runAsync(`
      INSERT INTO tenant_audit_log (
        id, companyId, userId, operation, resource, resourceId, details
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `, [
      logId,
      currentTenantContext.companyId,
      currentTenantContext.userId,
      operation,
      resource,
      resourceId,
      details ? JSON.stringify(details) : null
    ]);
  } catch (error) {
    console.error('[DataIsolation] Error logging tenant operation:', error);
    // Don't throw - audit logging shouldn't break the main operation
  }
};

/**
 * Get tenant statistics
 */
export const getTenantStatistics = async (companyId: string): Promise<any> => {
  if (!validateTenantAccess(companyId)) {
    throw new Error('Access denied to tenant statistics');
  }

  try {
    const db = await openDatabase();
    
    const stats = {
      totalBatches: 0,
      totalPhotos: 0,
      totalUsers: 0,
      storageUsed: 0,
      lastActivity: null
    };

    // Get batch count
    const batchResult = await db.getFirstAsync(`
      SELECT COUNT(*) as count FROM photo_batches WHERE companyId = ?
    `, [companyId]) as any;
    stats.totalBatches = batchResult?.count || 0;

    // Get photo count
    const photoResult = await db.getFirstAsync(`
      SELECT COUNT(*) as count FROM photos WHERE companyId = ?
    `, [companyId]) as any;
    stats.totalPhotos = photoResult?.count || 0;

    // Get user count
    const userResult = await db.getFirstAsync(`
      SELECT COUNT(*) as count FROM company_users WHERE companyId = ? AND isActive = 1
    `, [companyId]) as any;
    stats.totalUsers = userResult?.count || 0;

    // Get storage usage (approximate)
    const storageResult = await db.getFirstAsync(`
      SELECT SUM(fileSize) as total FROM photos WHERE companyId = ?
    `, [companyId]) as any;
    stats.storageUsed = storageResult?.total || 0;

    // Get last activity
    const activityResult = await db.getFirstAsync(`
      SELECT MAX(lastActiveAt) as lastActivity FROM company_users WHERE companyId = ?
    `, [companyId]) as any;
    stats.lastActivity = activityResult?.lastActivity;

    return stats;
  } catch (error) {
    console.error('[DataIsolation] Error getting tenant statistics:', error);
    throw error;
  }
};

/**
 * Cleanup tenant data (for account deletion)
 */
export const cleanupTenantData = async (companyId: string): Promise<void> => {
  if (!currentTenantContext || currentTenantContext.role !== 'owner') {
    throw new Error('Only company owner can cleanup tenant data');
  }

  if (!validateTenantAccess(companyId)) {
    throw new Error('Access denied to cleanup tenant data');
  }

  try {
    const db = await openDatabase();
    
    // List of tables to cleanup
    const tables = [
      'photo_batches',
      'photos',
      'annotations',
      'sync_queue',
      'sync_conflicts',
      'user_sessions',
      'company_users',
      'company_invitations',
      'tenant_audit_log'
    ];

    // Delete data from each table
    for (const table of tables) {
      try {
        await db.runAsync(`DELETE FROM ${table} WHERE companyId = ?`, [companyId]);
        console.log(`[DataIsolation] Cleaned up ${table} for company ${companyId}`);
      } catch (error) {
        console.warn(`[DataIsolation] Failed to cleanup ${table}:`, error);
      }
    }

    // Finally delete the company record
    await db.runAsync(`DELETE FROM companies WHERE id = ?`, [companyId]);
    
    console.log('[DataIsolation] Tenant data cleanup completed:', companyId);
  } catch (error) {
    console.error('[DataIsolation] Error cleaning up tenant data:', error);
    throw error;
  }
};

export default {
  setTenantContext,
  getTenantContext,
  clearTenantContext,
  validateTenantAccess,
  addCompanyIsolationToTables,
  generateTenantSafeQuery,
  executeTenantSafeQuery,
  checkOperationPermission,
  logTenantOperation,
  getTenantStatistics,
  cleanupTenantData
};
