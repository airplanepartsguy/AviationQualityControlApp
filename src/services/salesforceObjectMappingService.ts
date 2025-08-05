import supabaseService from './supabaseService';

export interface ObjectMapping {
  id: string;
  company_id: string;
  prefix: string; // e.g., "PO", "INV", "SO"
  salesforce_object: string; // e.g., "Purchase_Order__c", "Invoice__c", "Sales_Order__c"
  name_field: string; // Field to search by (usually "Name" or custom field)
  description?: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface ParsedDocumentId {
  prefix: string;
  number: string;
  fullId: string;
  mapping?: ObjectMapping;
}

class SalesforceObjectMappingService {
  // In-memory cache for mappings to improve performance
  private mappingCache: Map<string, ObjectMapping[]> = new Map();
  private cacheExpiryTime = 5 * 60 * 1000; // 5 minutes
  private cacheTimestamps: Map<string, number> = new Map();
  /**
   * Parse a scanned document ID into prefix and number
   * Examples: "PO-23" → {prefix: "PO", number: "23", fullId: "PO-23"}
   */
  parseDocumentId(documentId: string): ParsedDocumentId {
    // Support various formats: PO-23, PO_23, PO23, etc.
    const match = documentId.match(/^([A-Z]+)[-_]?(\d+)$/i);
    
    if (!match) {
      throw new Error(`Invalid document ID format: ${documentId}. Expected format like PO-23, INV-420, etc.`);
    }

    return {
      prefix: match[1].toUpperCase(),
      number: match[2],
      fullId: documentId.toUpperCase()
    };
  }

  /**
   * Get object mappings for a company
   */
  async getCompanyObjectMappings(companyId: string): Promise<ObjectMapping[]> {
    try {
      const { data, error } = await supabaseService.supabase
        .from('salesforce_object_mappings')
        .select('*')
        .eq('company_id', companyId)
        .eq('is_active', true)
        .order('prefix');

      if (error) {
        throw new Error(`Failed to fetch object mappings: ${error.message}`);
      }

      return data || [];
    } catch (error) {
      console.error('Error fetching object mappings:', error);
      throw error;
    }
  }

  /**
   * Find object mapping for a specific prefix
   */
  async findMappingForPrefix(companyId: string, prefix: string): Promise<ObjectMapping | null> {
    try {
      const { data, error } = await supabaseService.supabase
        .from('salesforce_object_mappings')
        .select('*')
        .eq('company_id', companyId)
        .eq('prefix', prefix.toUpperCase())
        .eq('is_active', true)
        .single();

      if (error && error.code !== 'PGRST116') { // PGRST116 = no rows returned
        throw new Error(`Failed to find mapping for prefix ${prefix}: ${error.message}`);
      }

      return data || null;
    } catch (error) {
      console.error(`Error finding mapping for prefix ${prefix}:`, error);
      return null;
    }
  }

  /**
   * Parse document ID and find its mapping
   */
  async parseDocumentIdWithMapping(companyId: string, documentId: string): Promise<ParsedDocumentId> {
    const parsed = this.parseDocumentId(documentId);
    const mapping = await this.findMappingForPrefix(companyId, parsed.prefix);
    
    return {
      ...parsed,
      mapping: mapping || undefined
    };
  }

  /**
   * Create or update object mapping
   */
  async upsertObjectMapping(mapping: Omit<ObjectMapping, 'id' | 'created_at' | 'updated_at'>): Promise<ObjectMapping> {
    try {
      const { data, error } = await supabaseService.supabase
        .from('salesforce_object_mappings')
        .upsert({
          ...mapping,
          prefix: mapping.prefix.toUpperCase(),
          updated_at: new Date().toISOString()
        }, {
          onConflict: 'company_id,prefix'
        })
        .select()
        .single();

      if (error) {
        throw new Error(`Failed to save object mapping: ${error.message}`);
      }

      return data;
    } catch (error) {
      console.error('Error saving object mapping:', error);
      throw error;
    }
  }

  /**
   * Delete object mapping
   */
  async deleteObjectMapping(companyId: string, prefix: string): Promise<void> {
    try {
      const { error } = await supabaseService.supabase
        .from('salesforce_object_mappings')
        .delete()
        .eq('company_id', companyId)
        .eq('prefix', prefix.toUpperCase());

      if (error) {
        throw new Error(`Failed to delete object mapping: ${error.message}`);
      }
    } catch (error) {
      console.error('Error deleting object mapping:', error);
      throw error;
    }
  }

  /**
   * Get default object mappings for new companies
   */
  getDefaultMappings(): Omit<ObjectMapping, 'id' | 'company_id' | 'created_at' | 'updated_at'>[] {
    return [
      {
        prefix: 'RLS',
        salesforce_object: 'inscor__Release__c',
        name_field: 'Name',
        description: 'Releases',
        is_active: true
      },
      {
        prefix: 'RLSL',
        salesforce_object: 'inscor__Release_Line__c',
        name_field: 'Name',
        description: 'Release Lines',
        is_active: true
      },
      {
        prefix: 'PO',
        salesforce_object: 'inscor__Purchase_Order__c',
        name_field: 'Name',
        description: 'Purchase Orders',
        is_active: true
      },
      {
        prefix: 'POL',
        salesforce_object: 'inscor__Purchase_Order_Line__c',
        name_field: 'Name',
        description: 'Purchase Order Lines',
        is_active: true
      },
      {
        prefix: 'SO',
        salesforce_object: 'inscor__Sales_Order__c',
        name_field: 'Name',
        description: 'Sales Orders',
        is_active: true
      },
      {
        prefix: 'SOL',
        salesforce_object: 'inscor__Sales_Order_Line__c',
        name_field: 'Name',
        description: 'Sales Order Lines',
        is_active: true
      },
      {
        prefix: 'INV',
        salesforce_object: 'inscor__Inventory_Line__c',
        name_field: 'Name',
        description: 'Inventory Lines',
        is_active: true
      },
      {
        prefix: 'RO',
        salesforce_object: 'inscor__Repair_Order__c',
        name_field: 'Name',
        description: 'Repair Orders',
        is_active: true
      },
      {
        prefix: 'ROL',
        salesforce_object: 'inscor__Repair_Order_Line__c',
        name_field: 'Name',
        description: 'Repair Order Lines',
        is_active: true
      },
      {
        prefix: 'WO',
        salesforce_object: 'inscor__Work_Order__c',
        name_field: 'Name',
        description: 'Work Orders',
        is_active: true
      },
      {
        prefix: 'INVC',
        salesforce_object: 'inscor__Invoice__c',
        name_field: 'Name',
        description: 'Invoices',
        is_active: true
      },
      {
        prefix: 'RMA',
        salesforce_object: 'inscor__RMA__c',
        name_field: 'Name',
        description: 'RMAs',
        is_active: true
      },
      {
        prefix: 'INVCL',
        salesforce_object: 'inscor__Invoice_Line__c',
        name_field: 'Name',
        description: 'Invoice Lines',
        is_active: true
      }
    ];
  }

  /**
   * Initialize default mappings for a company
   */
  async initializeDefaultMappings(companyId: string): Promise<ObjectMapping[]> {
    const defaultMappings = this.getDefaultMappings();
    const results: ObjectMapping[] = [];

    for (const mapping of defaultMappings) {
      try {
        const result = await this.upsertObjectMapping({
          ...mapping,
          company_id: companyId
        });
        results.push(result);
      } catch (error) {
        console.error(`Failed to create default mapping for ${mapping.prefix}:`, error);
      }
    }

    // Clear cache for this company after initialization
    this.clearCacheForCompany(companyId);

    return results;
  }

  /**
   * Centralized function to map scanned ID to Salesforce object
   * This is the main function that should be used throughout the app
   */
  async mapScannedIdToObject(scannedId: string, companyId: string): Promise<{
    objectApi: string;
    nameField: string;
    recordId: string;
    prefix: string;
  } | null> {
    try {
      // Parse the scanned ID
      const parsed = this.parseDocumentId(scannedId);
      
      // Get cached mappings or fetch from database
      const mappings = await this.getCachedMappings(companyId);
      
      // Find the mapping for this prefix
      const mapping = mappings.find(m => m.prefix === parsed.prefix && m.is_active);
      
      if (!mapping) {
        console.warn(`No mapping found for prefix ${parsed.prefix} in company ${companyId}`);
        return null;
      }
      
      return {
        objectApi: mapping.salesforce_object,
        nameField: mapping.name_field,
        recordId: parsed.fullId,
        prefix: parsed.prefix
      };
    } catch (error) {
      console.error('Error mapping scanned ID to object:', error);
      return null;
    }
  }

  /**
   * Get cached mappings or fetch from database
   */
  private async getCachedMappings(companyId: string): Promise<ObjectMapping[]> {
    const cacheKey = `mappings_${companyId}`;
    const cachedTime = this.cacheTimestamps.get(cacheKey);
    const now = Date.now();
    
    // Check if cache is still valid
    if (cachedTime && (now - cachedTime) < this.cacheExpiryTime) {
      const cached = this.mappingCache.get(cacheKey);
      if (cached) {
        return cached;
      }
    }
    
    // Fetch from database
    const mappings = await this.getCompanyObjectMappings(companyId);
    
    // Update cache
    this.mappingCache.set(cacheKey, mappings);
    this.cacheTimestamps.set(cacheKey, now);
    
    return mappings;
  }

  /**
   * Clear cache for a specific company
   */
  clearCacheForCompany(companyId: string): void {
    const cacheKey = `mappings_${companyId}`;
    this.mappingCache.delete(cacheKey);
    this.cacheTimestamps.delete(cacheKey);
  }

  /**
   * Clear all cached mappings
   */
  clearAllCache(): void {
    this.mappingCache.clear();
    this.cacheTimestamps.clear();
  }
}

export const salesforceObjectMappingService = new SalesforceObjectMappingService();
