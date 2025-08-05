/**
 * Database Compatibility Helper
 * Handles mixed column naming conventions (camelCase vs snake_case)
 * Provides smart query building with automatic column detection
 */

import { SQLiteDatabase } from 'expo-sqlite';

interface ColumnInfo {
  name: string;
  type: string;
}

interface TableSchema {
  columns: ColumnInfo[];
  batchIdColumn?: string; // The actual column name for batch ID in this table
}

class DatabaseCompatibility {
  private schemaCache: Map<string, TableSchema> = new Map();
  private cacheExpiry = 10 * 60 * 1000; // 10 minutes
  private cacheTimestamps: Map<string, number> = new Map();

  /**
   * Get table schema with column information
   */
  async getTableSchema(db: SQLiteDatabase, tableName: string): Promise<TableSchema> {
    const cacheKey = tableName;
    const now = Date.now();
    const timestamp = this.cacheTimestamps.get(cacheKey);

    // Return cached schema if valid
    if (timestamp && (now - timestamp) < this.cacheExpiry) {
      const cached = this.schemaCache.get(cacheKey);
      if (cached) {
        console.log(`[DatabaseCompatibility] Using cached schema for ${tableName}`);
        return cached;
      }
    }

    try {
      console.log(`[DatabaseCompatibility] Fetching schema for table: ${tableName}`);
      
      // Get table info using PRAGMA
      const columns = await db.getAllAsync(`PRAGMA table_info(${tableName})`) as any[];
      
      const schema: TableSchema = {
        columns: columns.map(col => ({ name: col.name, type: col.type }))
      };

      // Detect batch ID column format
      const batchIdColumn = this.detectBatchIdColumn(schema.columns);
      if (batchIdColumn) {
        schema.batchIdColumn = batchIdColumn;
      }

      console.log(`[DatabaseCompatibility] Schema for ${tableName}:`, {
        columnCount: schema.columns.length,
        batchIdColumn: schema.batchIdColumn,
        columns: schema.columns.map(c => c.name)
      });

      // Cache the result
      this.schemaCache.set(cacheKey, schema);
      this.cacheTimestamps.set(cacheKey, now);

      return schema;
    } catch (error) {
      console.error(`[DatabaseCompatibility] Failed to get schema for ${tableName}:`, error);
      // Return empty schema as fallback
      return { columns: [] };
    }
  }

  /**
   * Detect the correct batch ID column name
   */
  private detectBatchIdColumn(columns: ColumnInfo[]): string | undefined {
    const columnNames = columns.map(c => c.name.toLowerCase());
    
    // Check for common batch ID column variations
    const variants = ['batchid', 'batch_id', 'batchId', 'batch_id'];
    
    for (const variant of variants) {
      const found = columns.find(col => col.name.toLowerCase() === variant.toLowerCase());
      if (found) {
        console.log(`[DatabaseCompatibility] Found batch ID column: ${found.name}`);
        return found.name;
      }
    }

    return undefined;
  }

  /**
   * Build a safe query that uses the correct column names
   */
  async buildSafeQuery(
    db: SQLiteDatabase, 
    tableName: string, 
    baseQuery: string, 
    batchIdValue?: string | number
  ): Promise<{ query: string; params: any[] }> {
    const schema = await this.getTableSchema(db, tableName);
    let safeQuery = baseQuery;
    const params: any[] = [];

    // Replace batch ID placeholder with actual column name
    if (schema.batchIdColumn && batchIdValue !== undefined) {
      // Replace common batch ID placeholders
      safeQuery = safeQuery.replace(/\bbatch_id\b/g, schema.batchIdColumn);
      safeQuery = safeQuery.replace(/\bbatchId\b/g, schema.batchIdColumn);
      
      // Add parameter if we have a value
      if (safeQuery.includes('?')) {
        params.push(batchIdValue);
      }
    }

    console.log(`[DatabaseCompatibility] Safe query for ${tableName}:`, {
      originalQuery: baseQuery,
      safeQuery,
      batchIdColumn: schema.batchIdColumn,
      paramCount: params.length
    });

    return { query: safeQuery, params };
  }

  /**
   * Execute a safe query with automatic column detection
   */
  async executeSafeQuery(
    db: SQLiteDatabase,
    tableName: string,
    query: string,
    params: any[] = []
  ): Promise<any[]> {
    try {
      // For now, just execute the query as-is
      // Later we can add more sophisticated column replacement
      const result = await db.getAllAsync(query, params);
      console.log(`[DatabaseCompatibility] Query executed successfully on ${tableName}`);
      return result as any[];
    } catch (error) {
      console.error(`[DatabaseCompatibility] Query failed on ${tableName}:`, {
        query,
        params,
        error: error.message
      });
      
      // Try to suggest the correct column name
      const schema = await this.getTableSchema(db, tableName);
      if (schema.batchIdColumn) {
        console.log(`[DatabaseCompatibility] Suggestion: Use column '${schema.batchIdColumn}' instead of batch_id/batchId`);
      }
      
      throw error;
    }
  }

  /**
   * Clear schema cache (useful for testing)
   */
  clearCache(): void {
    this.schemaCache.clear();
    this.cacheTimestamps.clear();
    console.log('[DatabaseCompatibility] Cache cleared');
  }
}

export const databaseCompatibility = new DatabaseCompatibility();
export default databaseCompatibility;