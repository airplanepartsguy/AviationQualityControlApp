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
        prefix: 'PO',
        salesforce_object: 'Purchase_Order__c',
        name_field: 'Name',
        description: 'Purchase Orders',
        is_active: true
      },
      {
        prefix: 'INV',
        salesforce_object: 'Invoice__c',
        name_field: 'Name',
        description: 'Invoices',
        is_active: true
      },
      {
        prefix: 'SO',
        salesforce_object: 'Sales_Order__c',
        name_field: 'Name',
        description: 'Sales Orders',
        is_active: true
      },
      {
        prefix: 'WO',
        salesforce_object: 'Work_Order__c',
        name_field: 'Name',
        description: 'Work Orders',
        is_active: true
      },
      {
        prefix: 'QC',
        salesforce_object: 'Quality_Control__c',
        name_field: 'Name',
        description: 'Quality Control Records',
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

    return results;
  }
}

export const salesforceObjectMappingService = new SalesforceObjectMappingService();
