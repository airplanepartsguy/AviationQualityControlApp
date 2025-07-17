import { openDatabase } from './databaseService';
import supabaseService from './supabaseService';
import { PhotoBatch, PhotoData } from '../types/data';

/**
 * Conflict Resolution Service - Handles sync conflicts between local and remote data
 * Implements various conflict resolution strategies for offline-first architecture
 */

export interface ConflictData {
  id: string;
  type: 'batch' | 'photo';
  localData: any;
  remoteData: any;
  conflictFields: string[];
  timestamp: string;
  resolved: boolean;
  resolutionStrategy?: 'local_wins' | 'remote_wins' | 'merge' | 'manual';
}

export interface ConflictResolutionResult {
  success: boolean;
  resolvedData: any;
  strategy: string;
  conflictsFound: number;
  message: string;
}

/**
 * Detect conflicts between local and remote data
 */
export const detectConflicts = async (
  localData: any,
  remoteData: any,
  type: 'batch' | 'photo'
): Promise<string[]> => {
  const conflicts: string[] = [];
  
  try {
    // Common fields to check for conflicts
    const fieldsToCheck = type === 'batch' 
      ? ['status', 'orderNumber', 'inventoryId', 'referenceId']
      : ['partNumber', 'photoTitle', 'metadata', 'annotations'];
    
    for (const field of fieldsToCheck) {
      if (localData[field] !== remoteData[field]) {
        // Special handling for nested objects
        if (typeof localData[field] === 'object' && typeof remoteData[field] === 'object') {
          if (JSON.stringify(localData[field]) !== JSON.stringify(remoteData[field])) {
            conflicts.push(field);
          }
        } else if (localData[field] !== remoteData[field]) {
          conflicts.push(field);
        }
      }
    }
    
    console.log(`[ConflictResolution] Detected ${conflicts.length} conflicts for ${type}:`, conflicts);
    return conflicts;
  } catch (error) {
    console.error('[ConflictResolution] Error detecting conflicts:', error);
    return [];
  }
};

/**
 * Resolve conflicts using timestamp-based strategy (most recent wins)
 */
export const resolveByTimestamp = async (
  localData: any,
  remoteData: any,
  conflictFields: string[]
): Promise<ConflictResolutionResult> => {
  try {
    const localTimestamp = new Date(localData.updatedAt || localData.createdAt);
    const remoteTimestamp = new Date(remoteData.updated_at || remoteData.created_at);
    
    const useLocal = localTimestamp > remoteTimestamp;
    const resolvedData = useLocal ? localData : remoteData;
    
    console.log(`[ConflictResolution] Timestamp resolution: ${useLocal ? 'local' : 'remote'} wins`);
    
    return {
      success: true,
      resolvedData,
      strategy: useLocal ? 'local_wins' : 'remote_wins',
      conflictsFound: conflictFields.length,
      message: `Resolved ${conflictFields.length} conflicts using timestamp strategy (${useLocal ? 'local' : 'remote'} data is newer)`
    };
  } catch (error) {
    console.error('[ConflictResolution] Error in timestamp resolution:', error);
    throw error;
  }
};

/**
 * Resolve conflicts using merge strategy (combine non-conflicting fields)
 */
export const resolveByMerge = async (
  localData: any,
  remoteData: any,
  conflictFields: string[]
): Promise<ConflictResolutionResult> => {
  try {
    // Start with remote data as base
    const resolvedData = { ...remoteData };
    
    // For each conflict field, use the most recent or apply specific merge logic
    for (const field of conflictFields) {
      switch (field) {
        case 'annotations':
          // Merge annotations arrays, keeping unique entries
          const localAnnotations = localData.annotations || [];
          const remoteAnnotations = remoteData.annotations || [];
          const mergedAnnotations = [...remoteAnnotations];
          
          for (const localAnnotation of localAnnotations) {
            if (!mergedAnnotations.find(a => a.id === localAnnotation.id)) {
              mergedAnnotations.push(localAnnotation);
            }
          }
          resolvedData.annotations = mergedAnnotations;
          break;
          
        case 'metadata':
          // Merge metadata objects
          resolvedData.metadata = {
            ...remoteData.metadata,
            ...localData.metadata
          };
          break;
          
        default:
          // For other fields, use timestamp-based resolution
          const localTimestamp = new Date(localData.updatedAt || localData.createdAt);
          const remoteTimestamp = new Date(remoteData.updated_at || remoteData.created_at);
          
          if (localTimestamp > remoteTimestamp) {
            resolvedData[field] = localData[field];
          }
          break;
      }
    }
    
    console.log(`[ConflictResolution] Merge resolution completed for ${conflictFields.length} conflicts`);
    
    return {
      success: true,
      resolvedData,
      strategy: 'merge',
      conflictsFound: conflictFields.length,
      message: `Successfully merged ${conflictFields.length} conflicting fields`
    };
  } catch (error) {
    console.error('[ConflictResolution] Error in merge resolution:', error);
    throw error;
  }
};

/**
 * Store conflict for manual resolution
 */
export const storeConflictForManualResolution = async (
  id: string,
  type: 'batch' | 'photo',
  localData: any,
  remoteData: any,
  conflictFields: string[]
): Promise<void> => {
  try {
    const db = await openDatabase();
    
    const conflictData: ConflictData = {
      id,
      type,
      localData,
      remoteData,
      conflictFields,
      timestamp: new Date().toISOString(),
      resolved: false
    };
    
    await db.runAsync(`
      INSERT OR REPLACE INTO sync_conflicts (
        id, type, localData, remoteData, conflictFields, timestamp, resolved
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `, [
      id,
      type,
      JSON.stringify(localData),
      JSON.stringify(remoteData),
      JSON.stringify(conflictFields),
      conflictData.timestamp,
      0
    ]);
    
    console.log(`[ConflictResolution] Stored conflict for manual resolution: ${id}`);
  } catch (error) {
    console.error('[ConflictResolution] Error storing conflict:', error);
    throw error;
  }
};

/**
 * Get pending conflicts for manual resolution
 */
export const getPendingConflicts = async (): Promise<ConflictData[]> => {
  try {
    const db = await openDatabase();
    
    const conflicts = await db.getAllAsync<any>(`
      SELECT * FROM sync_conflicts WHERE resolved = 0 ORDER BY timestamp DESC
    `);
    
    return conflicts.map(conflict => ({
      id: conflict.id,
      type: conflict.type,
      localData: JSON.parse(conflict.localData),
      remoteData: JSON.parse(conflict.remoteData),
      conflictFields: JSON.parse(conflict.conflictFields),
      timestamp: conflict.timestamp,
      resolved: conflict.resolved === 1
    }));
  } catch (error) {
    console.error('[ConflictResolution] Error getting pending conflicts:', error);
    return [];
  }
};

/**
 * Resolve a specific conflict manually
 */
export const resolveConflictManually = async (
  conflictId: string,
  resolutionStrategy: 'local_wins' | 'remote_wins' | 'merge',
  customData?: any
): Promise<ConflictResolutionResult> => {
  try {
    const db = await openDatabase();
    
    // Get the conflict data
    const conflict = await db.getFirstAsync<any>(`
      SELECT * FROM sync_conflicts WHERE id = ?
    `, [conflictId]);
    
    if (!conflict) {
      throw new Error(`Conflict ${conflictId} not found`);
    }
    
    const localData = JSON.parse(conflict.localData);
    const remoteData = JSON.parse(conflict.remoteData);
    const conflictFields = JSON.parse(conflict.conflictFields);
    
    let resolvedData;
    
    switch (resolutionStrategy) {
      case 'local_wins':
        resolvedData = localData;
        break;
      case 'remote_wins':
        resolvedData = remoteData;
        break;
      case 'merge':
        const mergeResult = await resolveByMerge(localData, remoteData, conflictFields);
        resolvedData = mergeResult.resolvedData;
        break;
      default:
        throw new Error(`Unknown resolution strategy: ${resolutionStrategy}`);
    }
    
    // If custom data provided, use it
    if (customData) {
      resolvedData = { ...resolvedData, ...customData };
    }
    
    // Mark conflict as resolved
    await db.runAsync(`
      UPDATE sync_conflicts SET resolved = 1, resolutionStrategy = ? WHERE id = ?
    `, [resolutionStrategy, conflictId]);
    
    console.log(`[ConflictResolution] Manually resolved conflict ${conflictId} using ${resolutionStrategy}`);
    
    return {
      success: true,
      resolvedData,
      strategy: resolutionStrategy,
      conflictsFound: conflictFields.length,
      message: `Manually resolved conflict using ${resolutionStrategy} strategy`
    };
  } catch (error) {
    console.error('[ConflictResolution] Error in manual resolution:', error);
    throw error;
  }
};

/**
 * Main conflict resolution function - automatically resolves conflicts using configured strategy
 */
export const resolveConflict = async (
  id: string,
  type: 'batch' | 'photo',
  localData: any,
  remoteData: any,
  strategy: 'timestamp' | 'merge' | 'manual' = 'timestamp'
): Promise<ConflictResolutionResult> => {
  try {
    console.log(`[ConflictResolution] Resolving conflict for ${type} ${id} using ${strategy} strategy`);
    
    // Detect conflicts
    const conflictFields = await detectConflicts(localData, remoteData, type);
    
    if (conflictFields.length === 0) {
      return {
        success: true,
        resolvedData: remoteData, // No conflicts, use remote data
        strategy: 'no_conflict',
        conflictsFound: 0,
        message: 'No conflicts detected'
      };
    }
    
    // Apply resolution strategy
    switch (strategy) {
      case 'timestamp':
        return await resolveByTimestamp(localData, remoteData, conflictFields);
        
      case 'merge':
        return await resolveByMerge(localData, remoteData, conflictFields);
        
      case 'manual':
        await storeConflictForManualResolution(id, type, localData, remoteData, conflictFields);
        return {
          success: false,
          resolvedData: null,
          strategy: 'manual',
          conflictsFound: conflictFields.length,
          message: `Conflict stored for manual resolution (${conflictFields.length} fields)`
        };
        
      default:
        throw new Error(`Unknown resolution strategy: ${strategy}`);
    }
  } catch (error) {
    console.error('[ConflictResolution] Error resolving conflict:', error);
    throw error;
  }
};

export default {
  detectConflicts,
  resolveConflict,
  resolveByTimestamp,
  resolveByMerge,
  storeConflictForManualResolution,
  getPendingConflicts,
  resolveConflictManually
};
