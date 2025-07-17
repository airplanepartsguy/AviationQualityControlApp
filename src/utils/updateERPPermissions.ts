import { supabase } from '../lib/supabase';

/**
 * Utility to update ERP integration permissions for a company
 * Use this to grant/revoke access to different ERP systems
 */

export interface ERPPermissionUpdate {
  companyId: string;
  integrationType: 'salesforce' | 'sharepoint' | 'sap' | 'dynamics';
  isEnabled: boolean;
  isPrimary?: boolean;
  maxConnections?: number;
}

/**
 * Update ERP permissions for a company
 */
export const updateERPPermissions = async (update: ERPPermissionUpdate): Promise<boolean> => {
  try {
    const { companyId, integrationType, isEnabled, isPrimary = false, maxConnections = 1 } = update;
    
    console.log(`[ERPPermissions] Updating ${integrationType} for company ${companyId}`);
    
    // Use upsert to insert or update the permission
    const { error } = await supabase
      .from('company_integration_permissions')
      .upsert({
        company_id: companyId,
        integration_type: integrationType,
        is_enabled: isEnabled,
        is_primary: isPrimary,
        max_connections: maxConnections,
        updated_at: new Date().toISOString()
      }, {
        onConflict: 'company_id,integration_type'
      });
    
    if (error) {
      console.error('[ERPPermissions] Error updating permissions:', error);
      return false;
    }
    
    console.log(`[ERPPermissions] Successfully updated ${integrationType} permissions`);
    return true;
    
  } catch (error) {
    console.error('[ERPPermissions] Error updating ERP permissions:', error);
    return false;
  }
};

/**
 * Enable multiple ERP systems for a company at once
 */
export const enableMultipleERPSystems = async (
  companyId: string,
  systems: Array<{
    type: 'salesforce' | 'sharepoint' | 'sap' | 'dynamics';
    isPrimary?: boolean;
    maxConnections?: number;
  }>
): Promise<boolean> => {
  try {
    console.log(`[ERPPermissions] Enabling multiple ERP systems for company ${companyId}`);
    
    const updates = systems.map(system => ({
      company_id: companyId,
      integration_type: system.type,
      is_enabled: true,
      is_primary: system.isPrimary || false,
      max_connections: system.maxConnections || 1,
      updated_at: new Date().toISOString()
    }));
    
    const { error } = await supabase
      .from('company_integration_permissions')
      .upsert(updates, {
        onConflict: 'company_id,integration_type'
      });
    
    if (error) {
      console.error('[ERPPermissions] Error enabling multiple systems:', error);
      return false;
    }
    
    console.log('[ERPPermissions] Successfully enabled multiple ERP systems');
    return true;
    
  } catch (error) {
    console.error('[ERPPermissions] Error enabling multiple ERP systems:', error);
    return false;
  }
};

/**
 * Get current ERP permissions for a company (for debugging)
 */
export const getCompanyERPPermissions = async (companyId: string) => {
  try {
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
    console.error('[ERPPermissions] Error fetching ERP permissions:', error);
    return [];
  }
};

// Example usage functions you can call from console or test scripts:

/**
 * Example: Enable Salesforce as primary ERP for a company
 */
export const enableSalesforceForCompany = async (companyId: string) => {
  return await updateERPPermissions({
    companyId,
    integrationType: 'salesforce',
    isEnabled: true,
    isPrimary: true,
    maxConnections: 2
  });
};

/**
 * Example: Enable SharePoint as secondary integration
 */
export const enableSharePointForCompany = async (companyId: string) => {
  return await updateERPPermissions({
    companyId,
    integrationType: 'sharepoint',
    isEnabled: true,
    isPrimary: false,
    maxConnections: 1
  });
};

/**
 * Example: Set up a full enterprise company with multiple ERP systems
 */
export const setupEnterpriseERPAccess = async (companyId: string) => {
  return await enableMultipleERPSystems(companyId, [
    { type: 'salesforce', isPrimary: true, maxConnections: 3 },
    { type: 'sharepoint', isPrimary: false, maxConnections: 2 },
    { type: 'sap', isPrimary: false, maxConnections: 1 },
    { type: 'dynamics', isPrimary: false, maxConnections: 1 }
  ]);
};
