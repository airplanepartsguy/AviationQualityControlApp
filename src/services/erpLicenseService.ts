import { supabase } from './supabaseService';

// Types for ERP system availability based on company-specific license configuration
export interface ERPSystemAvailability {
  integration_type: string;
  is_enabled: boolean;
  is_primary: boolean;
  max_connections: number;
  current_connections: number;
  can_add_more: boolean;
}

// Types for ERP integration instance (existing company_integrations table)
export interface ERPIntegrationInstance {
  id: string;
  company_id: string;
  integration_type: string;
  config: any;
  status: 'active' | 'inactive' | 'error' | 'pending';
  last_test_at?: string;
  last_sync_at?: string;
  error_message?: string;
  configured_by?: string;
  configured_at: string;
  created_at: string;
  updated_at: string;
}

// Types for company integration permissions (new table)
export interface CompanyIntegrationPermission {
  id: string;
  company_id: string;
  integration_type: string;
  is_enabled: boolean;
  is_primary: boolean;
  max_connections: number;
  created_at: string;
  updated_at: string;
}

// ERP system types that can be configured
export type ERPSystemType = 
  | 'salesforce'
  | 'sharepoint'
  | 'sap'
  | 'dynamics';

// License types that determine available ERP systems
export type LicenseType = 'trial' | 'annual_subscription';

// ERP integration status for UI display
export type ERPIntegrationStatus = 'connected' | 'disconnected' | 'error' | 'configuring';

// Summary of ERP integrations for a company
export interface ERPIntegrationSummary {
  total_available: number;
  total_configured: number;
  total_active: number;
  total_errors: number;
  primary_system?: string;
  systems: ERPSystemAvailability[];
}

// Company integration status view type
export interface CompanyIntegrationStatus {
  company_id: string;
  integration_type: string;
  permission_enabled: boolean;
  permission_primary: boolean;
  permission_max_connections: number;
  active_connections: number;
  healthy_connections: number;
  error_connections: number;
  can_add_more: boolean;
}

// ERP system information for UI display
export interface ERPSystemInfo {
  type: ERPSystemType;
  name: string;
  description: string;
  icon: string;
  color: string;
  isPrimary: boolean;
}

class ERPLicenseService {
  /**
   * Get ERP system information for UI display
   */
  getERPSystemInfo(): Record<ERPSystemType, ERPSystemInfo> {
    return {
      salesforce: {
        type: 'salesforce',
        name: 'Salesforce',
        description: 'Customer relationship management and business automation',
        icon: 'cloud',
        color: '#1B96FF',
        isPrimary: true
      },
      sharepoint: {
        type: 'sharepoint',
        name: 'SharePoint',
        description: 'Microsoft SharePoint document management and collaboration',
        icon: 'folder',
        color: '#0078D4',
        isPrimary: false
      },
      sap: {
        type: 'sap',
        name: 'SAP',
        description: 'Enterprise resource planning and business management',
        icon: 'settings',
        color: '#0FAAFF',
        isPrimary: true
      },
      dynamics: {
        type: 'dynamics',
        name: 'Microsoft Dynamics',
        description: 'Business applications and CRM platform',
        icon: 'briefcase',
        color: '#742774',
        isPrimary: false
      }
    };
  }

  /**
   * Get available ERP systems for a company based on their specific license configuration
   */
  async getAvailableERPSystems(companyId: string): Promise<ERPSystemAvailability[]> {
    try {
      const { data, error } = await supabase
        .rpc('get_available_erp_systems', { company_uuid: companyId });

      if (error) {
        console.error('[ERPLicenseService] Error getting available ERP systems:', error);
        throw error;
      }

      return data || [];
    } catch (error) {
      console.error('[ERPLicenseService] Error getting available ERP systems:', error);
      throw error;
    }
  }

  /**
   * Get current ERP integrations for a company
   */
  async getCompanyERPIntegrations(companyId: string): Promise<ERPIntegrationInstance[]> {
    try {
      const { data, error } = await supabase
        .from('company_integrations')
        .select('*')
        .eq('company_id', companyId);

      if (error) {
        console.error('[ERPLicenseService] Error getting company ERP integrations:', error);
        throw error;
      }

      return data || [];
    } catch (error) {
      console.error('[ERPLicenseService] Error getting company ERP integrations:', error);
      throw error;
    }
  }

  /**
   * Check if a company can add a specific ERP integration
   */
  async canAddERPIntegration(companyId: string, erpSystem: ERPSystemType): Promise<boolean> {
    try {
      const { data, error } = await supabase
        .rpc('can_add_erp_integration', { 
          company_uuid: companyId, 
          erp_type: erpSystem 
        });

      if (error) {
        console.error('[ERPLicenseService] Error checking ERP integration availability:', error);
        throw error;
      }

      return data === true;
    } catch (error) {
      console.error('[ERPLicenseService] Error checking ERP integration availability:', error);
      throw error;
    }
  }

  /**
   * Create or update a company ERP integration
   */
  async upsertCompanyERPIntegration(
    companyId: string,
    erpSystem: ERPSystemType,
    updates: Partial<ERPIntegrationInstance>
  ): Promise<ERPIntegrationInstance> {
    try {
      // Check if company can add this integration
      const canAdd = await this.canAddERPIntegration(companyId, erpSystem);
      if (!canAdd) {
        throw new Error(`Company license does not allow ${erpSystem} integration or maximum connections reached`);
      }

      const { data, error } = await supabase
        .from('company_erp_integrations')
        .upsert({
          company_id: companyId,
          erp_system: erpSystem,
          ...updates,
          updated_at: new Date().toISOString()
        }, {
          onConflict: 'company_id,erp_system'
        })
        .select()
        .single();

      if (error) {
        console.error('[ERPLicenseService] Error upserting company ERP integration:', error);
        throw error;
      }

      return data;
    } catch (error) {
      console.error('[ERPLicenseService] Error upserting company ERP integration:', error);
      throw error;
    }
  }

  /**
   * Update ERP integration status
   */
  async updateERPIntegrationStatus(
    companyId: string,
    erpSystem: ERPSystemType,
    status: ERPIntegrationInstance['status'],
    testResult?: string
  ): Promise<void> {
    try {
      const updates: any = {
        status,
        updated_at: new Date().toISOString()
      };

      if (testResult !== undefined) {
        updates.last_test_at = new Date().toISOString();
        updates.last_test_result = testResult;
      }

      const { error } = await supabase
        .from('company_erp_integrations')
        .update(updates)
        .eq('company_id', companyId)
        .eq('erp_system', erpSystem);

      if (error) {
        console.error('[ERPLicenseService] Error updating ERP integration status:', error);
        throw error;
      }
    } catch (error) {
      console.error('[ERPLicenseService] Error updating ERP integration status:', error);
      throw error;
    }
  }

  /**
   * Delete a company ERP integration
   */
  async deleteERPIntegration(companyId: string, erpSystem: ERPSystemType): Promise<void> {
    try {
      const { error } = await supabase
        .from('company_erp_integrations')
        .delete()
        .eq('company_id', companyId)
        .eq('erp_system', erpSystem);

      if (error) {
        console.error('[ERPLicenseService] Error deleting ERP integration:', error);
        throw error;
      }
    } catch (error) {
      console.error('[ERPLicenseService] Error deleting ERP integration:', error);
      throw error;
    }
  }

  /**
   * Get company's license type
   */
  async getCompanyLicenseType(companyId: string): Promise<LicenseType | null> {
    try {
      const { data, error } = await supabase
        .from('licenses')
        .select('type')
        .eq('company_id', companyId)
        .eq('status', 'active')
        .single();

      if (error) {
        console.error('[ERPLicenseService] Error getting company license type:', error);
        return null;
      }

      return data?.type || null;
    } catch (error) {
      console.error('[ERPLicenseService] Error getting company license type:', error);
      return null;
    }
  }

  /**
   * Get formatted ERP integration summary for UI
   */
  async getERPIntegrationSummary(companyId: string): Promise<{
    available: (ERPSystemAvailability & ERPSystemInfo)[];
    configured: (CompanyERPIntegration & ERPSystemInfo)[];
    licenseType: LicenseType | null;
  }> {
    try {
      const [availableSystems, configuredSystems, licenseType] = await Promise.all([
        this.getAvailableERPSystems(companyId),
        this.getCompanyERPIntegrations(companyId),
        this.getCompanyLicenseType(companyId)
      ]);

      const systemInfo = this.getERPSystemInfo();

      const available = availableSystems.map(system => ({
        ...system,
        ...systemInfo[system.integration_type as ERPSystemType]
      }));

      const configured = configuredSystems.map(system => ({
        ...system,
        ...systemInfo[system.integration_type as ERPSystemType]
      }));

      return {
        available,
        configured,
        licenseType
      };
    } catch (error) {
      console.error('[ERPLicenseService] Error getting ERP integration summary:', error);
      throw error;
    }
  }
}

export const erpLicenseService = new ERPLicenseService();
export default erpLicenseService;
