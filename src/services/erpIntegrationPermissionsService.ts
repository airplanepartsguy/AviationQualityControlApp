import { supabase } from './supabaseService';

/**
 * ERP Integration Permissions Service
 * Manages company-level permissions for ERP integrations based on license types
 */

export interface ERPIntegrationPermission {
  id: string;
  company_id: string;
  integration_type: 'salesforce' | 'sharepoint' | 'sap' | 'dynamics';
  is_enabled: boolean;
  is_primary: boolean;
  max_connections: number;
  created_at: string;
  updated_at: string;
}

export interface ERPIntegrationAvailability {
  salesforce: {
    enabled: boolean;
    isPrimary: boolean;
    maxConnections: number;
  };
  sharepoint: {
    enabled: boolean;
    isPrimary: boolean;
    maxConnections: number;
  };
  sap: {
    enabled: boolean;
    isPrimary: boolean;
    maxConnections: number;
  };
  dynamics: {
    enabled: boolean;
    isPrimary: boolean;
    maxConnections: number;
  };
}

/**
 * Get ERP integration permissions for a company
 */
export const getCompanyERPPermissions = async (companyId: string): Promise<ERPIntegrationPermission[]> => {
  try {
    console.log('[ERPPermissions] Getting ERP permissions for company:', companyId);
    
    const { data, error } = await supabase
      .from('company_integration_permissions')
      .select('*')
      .eq('company_id', companyId);
    
    if (error) {
      console.error('[ERPPermissions] Error fetching permissions:', error);
      return [];
    }
    
    return data || [];
  } catch (error) {
    console.error('[ERPPermissions] Error getting company ERP permissions:', error);
    return [];
  }
};

/**
 * Get available ERP integrations for a company in a structured format
 */
export const getAvailableERPIntegrations = async (companyId: string): Promise<ERPIntegrationAvailability> => {
  try {
    const permissions = await getCompanyERPPermissions(companyId);
    
    const availability: ERPIntegrationAvailability = {
      salesforce: { enabled: false, isPrimary: false, maxConnections: 0 },
      sharepoint: { enabled: false, isPrimary: false, maxConnections: 0 },
      sap: { enabled: false, isPrimary: false, maxConnections: 0 },
      dynamics: { enabled: false, isPrimary: false, maxConnections: 0 }
    };
    
    permissions.forEach(permission => {
      if (permission.integration_type in availability) {
        availability[permission.integration_type] = {
          enabled: permission.is_enabled,
          isPrimary: permission.is_primary,
          maxConnections: permission.max_connections
        };
      }
    });
    
    return availability;
  } catch (error) {
    console.error('[ERPPermissions] Error getting available integrations:', error);
    return {
      salesforce: { enabled: false, isPrimary: false, maxConnections: 0 },
      sharepoint: { enabled: false, isPrimary: false, maxConnections: 0 },
      sap: { enabled: false, isPrimary: false, maxConnections: 0 },
      dynamics: { enabled: false, isPrimary: false, maxConnections: 0 }
    };
  }
};

/**
 * Check if a specific ERP integration is available for a company
 */
export const isERPIntegrationAvailable = async (
  companyId: string, 
  integrationType: ERPIntegrationPermission['integration_type']
): Promise<boolean> => {
  try {
    const permissions = await getCompanyERPPermissions(companyId);
    const permission = permissions.find(p => p.integration_type === integrationType);
    return permission?.is_enabled || false;
  } catch (error) {
    console.error('[ERPPermissions] Error checking integration availability:', error);
    return false;
  }
};

/**
 * Create default ERP permissions for a new company
 */
export const createDefaultERPPermissions = async (companyId: string): Promise<void> => {
  try {
    console.log('[ERPPermissions] Creating default ERP permissions for company:', companyId);
    
    // Default permissions: Salesforce as primary, SharePoint as secondary
    const defaultPermissions = [
      {
        company_id: companyId,
        integration_type: 'salesforce' as const,
        is_enabled: true,
        is_primary: true,
        max_connections: 1
      },
      {
        company_id: companyId,
        integration_type: 'sharepoint' as const,
        is_enabled: true,
        is_primary: false,
        max_connections: 2
      }
    ];
    
    const { error } = await supabase
      .from('company_integration_permissions')
      .insert(defaultPermissions);
    
    if (error) {
      console.error('[ERPPermissions] Error creating default permissions:', error);
      throw error;
    }
    
    console.log('[ERPPermissions] Default ERP permissions created successfully');
  } catch (error) {
    console.error('[ERPPermissions] Error creating default ERP permissions:', error);
    throw error;
  }
};

/**
 * Update ERP integration permission for a company
 */
export const updateERPPermission = async (
  companyId: string,
  integrationType: ERPIntegrationPermission['integration_type'],
  updates: Partial<Pick<ERPIntegrationPermission, 'is_enabled' | 'is_primary' | 'max_connections'>>
): Promise<boolean> => {
  try {
    console.log('[ERPPermissions] Updating ERP permission:', { companyId, integrationType, updates });
    
    const { error } = await supabase
      .from('company_integration_permissions')
      .update({
        ...updates,
        updated_at: new Date().toISOString()
      })
      .eq('company_id', companyId)
      .eq('integration_type', integrationType);
    
    if (error) {
      console.error('[ERPPermissions] Error updating permission:', error);
      return false;
    }
    
    console.log('[ERPPermissions] ERP permission updated successfully');
    return true;
  } catch (error) {
    console.error('[ERPPermissions] Error updating ERP permission:', error);
    return false;
  }
};

/**
 * Get the primary ERP integration for a company
 */
export const getPrimaryERPIntegration = async (companyId: string): Promise<ERPIntegrationPermission | null> => {
  try {
    const permissions = await getCompanyERPPermissions(companyId);
    return permissions.find(p => p.is_primary && p.is_enabled) || null;
  } catch (error) {
    console.error('[ERPPermissions] Error getting primary ERP integration:', error);
    return null;
  }
};

/**
 * Set primary ERP integration for a company (ensures only one primary)
 */
export const setPrimaryERPIntegration = async (
  companyId: string,
  integrationType: ERPIntegrationPermission['integration_type']
): Promise<boolean> => {
  try {
    console.log('[ERPPermissions] Setting primary ERP integration:', { companyId, integrationType });
    
    // First, remove primary flag from all integrations
    await supabase
      .from('company_integration_permissions')
      .update({ 
        is_primary: false,
        updated_at: new Date().toISOString()
      })
      .eq('company_id', companyId);
    
    // Then set the specified integration as primary
    const { error } = await supabase
      .from('company_integration_permissions')
      .update({ 
        is_primary: true,
        is_enabled: true, // Ensure it's enabled when set as primary
        updated_at: new Date().toISOString()
      })
      .eq('company_id', companyId)
      .eq('integration_type', integrationType);
    
    if (error) {
      console.error('[ERPPermissions] Error setting primary integration:', error);
      return false;
    }
    
    console.log('[ERPPermissions] Primary ERP integration set successfully');
    return true;
  } catch (error) {
    console.error('[ERPPermissions] Error setting primary ERP integration:', error);
    return false;
  }
};

/**
 * Initialize ERP permissions table in Supabase (fallback for missing schema)
 */
export const initializeERPPermissionsTable = async (): Promise<void> => {
  try {
    console.log('[ERPPermissions] Initializing ERP permissions table...');
    
    // This would normally be done via Supabase migrations, but as a fallback
    // we can check if the table exists and create it if needed
    const { data, error } = await supabase
      .from('company_integration_permissions')
      .select('id')
      .limit(1);
    
    if (error && error.code === 'PGRST116') {
      // Table doesn't exist - this should be handled by proper migrations
      console.warn('[ERPPermissions] company_integration_permissions table does not exist. Please run Supabase migrations.');
      throw new Error('ERP permissions table not found. Database migration required.');
    }
    
    console.log('[ERPPermissions] ERP permissions table verified');
  } catch (error) {
    console.error('[ERPPermissions] Error initializing ERP permissions table:', error);
    throw error;
  }
};

export default {
  getCompanyERPPermissions,
  getAvailableERPIntegrations,
  isERPIntegrationAvailable,
  createDefaultERPPermissions,
  updateERPPermission,
  getPrimaryERPIntegration,
  setPrimaryERPIntegration,
  initializeERPPermissionsTable
};
