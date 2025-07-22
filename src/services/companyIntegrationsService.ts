/**
 * Company-Level ERP Integrations Service
 * Manages centralized Salesforce, SharePoint, and other ERP configurations at the company level
 */

import { supabase } from './supabaseService';

export interface CompanyIntegration {
  id: string;
  company_id: string;
  integration_type: 'salesforce' | 'sharepoint' | 'sap' | 'dynamics';
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

export interface SalesforceConfig {
  instance_url: string;
  client_id: string;
  client_secret: string; // This should be encrypted
  username: string;
  security_token: string; // This should be encrypted
  sandbox: boolean;
  api_version: string;
  object_mappings: {
    photo_batch: string;
    photo: string;
  };
  field_mappings: {
    batch_name: string;
    batch_type: string;
    photo_url: string;
  };
  // Object prefix mappings for ID-based record lookup
  prefix_mappings: {
    [prefix: string]: {
      object_name: string;
      name_field: string; // Field to search by (usually 'Name')
    };
  };
}

export interface SharePointConfig {
  tenant_id: string;
  client_id: string;
  client_secret: string; // This should be encrypted
  site_url: string;
  document_library: string;
  folder_structure: string;
}

class CompanyIntegrationsService {
  /**
   * Get all integrations for a company
   */
  async getCompanyIntegrations(companyId: string): Promise<CompanyIntegration[]> {
    try {
      console.log(`[CompanyIntegrations] Fetching integrations for company ${companyId}...`);
      
      const { data, error } = await supabase
        .from('company_integrations')
        .select('*')
        .eq('company_id', companyId)
        .order('integration_type');

      if (error) {
        console.error('[CompanyIntegrations] Fetch error:', error.message);
        throw error;
      }

      console.log(`[CompanyIntegrations] Found ${data?.length || 0} integrations`);
      return data || [];
    } catch (error) {
      console.error('[CompanyIntegrations] Get integrations failed:', error);
      throw error;
    }
  }

  /**
   * Get specific integration by type
   */
  async getIntegration(companyId: string, integrationType: string): Promise<CompanyIntegration | null> {
    try {
      console.log(`[CompanyIntegrations] Fetching ${integrationType} for company ${companyId}...`);
      
      const { data, error } = await supabase
        .from('company_integrations')
        .select('*')
        .eq('company_id', companyId)
        .eq('integration_type', integrationType)
        .single();

      if (error) {
        if (error.code === 'PGRST116') {
          // No rows found
          console.log(`[CompanyIntegrations] No ${integrationType} integration found`);
          return null;
        }
        console.error('[CompanyIntegrations] Fetch integration error:', error.message);
        throw error;
      }

      console.log(`[CompanyIntegrations] ${integrationType} integration found`);
      return data;
    } catch (error) {
      console.error('[CompanyIntegrations] Get integration failed:', error);
      throw error;
    }
  }

  /**
   * Create or update Salesforce configuration (Admin only)
   */
  async configureSalesforce(
    companyId: string, 
    config: SalesforceConfig, 
    userId: string
  ): Promise<CompanyIntegration> {
    try {
      console.log(`[CompanyIntegrations] Configuring Salesforce for company ${companyId}...`);
      
      // Check if integration already exists
      const existing = await this.getIntegration(companyId, 'salesforce');
      
      const integrationData = {
        company_id: companyId,
        integration_type: 'salesforce' as const,
        config: config,
        status: 'pending' as const,
        configured_by: userId,
        configured_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };

      let result;
      if (existing) {
        // Update existing
        const { data, error } = await supabase
          .from('company_integrations')
          .update(integrationData)
          .eq('id', existing.id)
          .select()
          .single();

        if (error) throw error;
        result = data;
        console.log('[CompanyIntegrations] Salesforce configuration updated');
      } else {
        // Create new
        const { data, error } = await supabase
          .from('company_integrations')
          .insert(integrationData)
          .select()
          .single();

        if (error) throw error;
        result = data;
        console.log('[CompanyIntegrations] Salesforce configuration created');
      }

      return result;
    } catch (error) {
      console.error('[CompanyIntegrations] Configure Salesforce failed:', error);
      throw error;
    }
  }

  /**
   * Test Salesforce connection with comprehensive validation
   */
  async testSalesforceConnection(companyId: string): Promise<{ success: boolean; message: string; details?: any }> {
    try {
      console.log(`[CompanyIntegrations] Testing Salesforce connection for company ${companyId}...`);
      
      const integration = await this.getIntegration(companyId, 'salesforce');
      if (!integration) {
        throw new Error('Salesforce integration not configured');
      }

      const config = integration.config as SalesforceConfig;
      
      // CRITICAL: Get stored OAuth tokens from secure storage, not config
      const tokens = await this.getSalesforceTokens(companyId);
      if (!tokens || !tokens.access_token) {
        console.log('[CompanyIntegrations] No valid OAuth tokens found');
        
        // Update integration status to reflect no authentication
        await this.updateIntegrationStatus(integration.id, 'pending', 'OAuth authentication required');
        
        return {
          success: false,
          message: 'OAuth authentication required. Please complete Salesforce login to establish connection.'
        };
      }
      
      const instanceUrl = config.instance_url;
      if (!instanceUrl) {
        return {
          success: false,
          message: 'Salesforce instance URL not configured.'
        };
      }
      
      console.log('[CompanyIntegrations] Testing connection to:', instanceUrl);
      
      // ENHANCED: Test multiple API endpoints to ensure comprehensive validation
      const testEndpoints = [
        { name: 'Identity', url: `${instanceUrl}/services/oauth2/userinfo` },
        { name: 'SObjects', url: `${instanceUrl}/services/data/v58.0/sobjects/` },
        { name: 'Limits', url: `${instanceUrl}/services/data/v58.0/limits/` }
      ];
      
      const testResults = [];
      let allTestsPassed = true;
      
      for (const endpoint of testEndpoints) {
        try {
          const response = await fetch(endpoint.url, {
            method: 'GET',
            headers: {
              'Authorization': `Bearer ${tokens.access_token}`,
              'Content-Type': 'application/json'
            }
          });
          
          const success = response.ok;
          if (!success) {
            allTestsPassed = false;
          }
          
          testResults.push({
            endpoint: endpoint.name,
            success,
            status: response.status,
            url: endpoint.url
          });
          
          console.log(`[CompanyIntegrations] ${endpoint.name} test:`, success ? 'PASS' : 'FAIL', response.status);
        } catch (error) {
          allTestsPassed = false;
          testResults.push({
            endpoint: endpoint.name,
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error'
          });
          console.error(`[CompanyIntegrations] ${endpoint.name} test failed:`, error);
        }
      }
      
      if (allTestsPassed) {
        // Update integration status to active with test timestamp
        await this.updateIntegrationStatus(integration.id, 'active', undefined, new Date().toISOString());
        
        return {
          success: true,
          message: 'Salesforce connection verified successfully. All API endpoints accessible.',
          details: {
            instanceUrl,
            testResults,
            testTimestamp: new Date().toISOString(),
            tokenPresent: true,
            comprehensiveTest: true
          }
        };
      } else {
        // Update integration status with error
        const failedTests = testResults.filter(r => !r.success).map(r => r.endpoint).join(', ');
        await this.updateIntegrationStatus(integration.id, 'error', `API tests failed: ${failedTests}`);
        
        return {
          success: false,
          message: `Salesforce connection test failed. Failed endpoints: ${failedTests}`,
          details: {
            testResults,
            instanceUrl,
            tokenPresent: true
          }
        };
      }
    } catch (error) {
      console.error('[CompanyIntegrations] Error testing Salesforce connection:', error);
      
      // Update integration status with error (only if integration exists)
      const integration = await this.getIntegration(companyId, 'salesforce');
      if (integration) {
        await this.updateIntegrationStatus(integration.id, 'error', error instanceof Error ? error.message : 'Connection test failed');
      }
      
      return {
        success: false,
        message: 'Failed to test Salesforce connection. Please check your configuration and try again.',
        details: { 
          error: error instanceof Error ? error.message : 'Unknown error',
          timestamp: new Date().toISOString()
        }
      };
    }
  }

  /**
   * Get active Salesforce configuration for company users
   */
  async getActiveSalesforceConfig(companyId: string): Promise<SalesforceConfig | null> {
    try {
      const integration = await this.getIntegration(companyId, 'salesforce');
      
      if (!integration || integration.status !== 'active') {
        console.log('[CompanyIntegrations] No active Salesforce configuration');
        return null;
      }

      return integration.config as SalesforceConfig;
    } catch (error) {
      console.error('[CompanyIntegrations] Get active Salesforce config failed:', error);
      return null;
    }
  }

  /**
   * Delete integration configuration (Admin only)
   */
  async deleteIntegration(companyId: string, integrationType: string): Promise<void> {
    try {
      console.log(`[CompanyIntegrations] Deleting ${integrationType} for company ${companyId}...`);
      
      const { error } = await supabase
        .from('company_integrations')
        .delete()
        .eq('company_id', companyId)
        .eq('integration_type', integrationType);

      if (error) throw error;
      
      console.log(`[CompanyIntegrations] ${integrationType} integration deleted`);
    } catch (error) {
      console.error('[CompanyIntegrations] Delete integration failed:', error);
      throw error;
    }
  }

  /**
   * Update integration status
   */
  async updateIntegrationStatus(
    integrationId: string, 
    status: 'active' | 'inactive' | 'error' | 'pending',
    errorMessage?: string,
    lastTestAt?: string
  ): Promise<void> {
    try {
      const updateData: any = {
        status,
        error_message: errorMessage || null,
        updated_at: new Date().toISOString()
      };
      
      // Add last_test_at if provided
      if (lastTestAt) {
        updateData.last_test_at = lastTestAt;
      }
      
      const { error } = await supabase
        .from('company_integrations')
        .update(updateData)
        .eq('id', integrationId);

      if (error) throw error;
      
      console.log(`[CompanyIntegrations] Integration status updated to ${status}`);
    } catch (error) {
      console.error('[CompanyIntegrations] Update status failed:', error);
      throw error;
    }
  }

  /**
   * Get stored Salesforce OAuth tokens for a company
   */
  private async getSalesforceTokens(companyId: string): Promise<{access_token: string, refresh_token?: string} | null> {
    try {
      console.log(`[CompanyIntegrations] getSalesforceTokens called for company: ${companyId}`);
      
      // FIRST: Check if tokens are stored in Supabase database (Edge Function stores them there)
      const integration = await this.getIntegration(companyId, 'salesforce');
      console.log(`[CompanyIntegrations] Integration check:`, {
        exists: !!integration,
        hasConfig: !!integration?.config,
        status: integration?.status,
        lastTestAt: integration?.last_test_at
      });
      
      if (integration && integration.config) {
        const config = integration.config as any;
        console.log(`[CompanyIntegrations] Config contents:`, {
          hasClientId: !!config.client_id,
          hasClientSecret: !!config.client_secret,
          hasInstanceUrl: !!config.instance_url,
          hasAccessToken: !!config.access_token,
          hasRefreshToken: !!config.refresh_token,
          tokenExpiresAt: config.token_expires_at,
          tokenReceivedAt: config.token_received_at
        });
        
        if (config.access_token) {
          console.log('[CompanyIntegrations] Found OAuth tokens in database for company:', companyId);
          
          // Also check if tokens are expired
          if (config.token_expires_at) {
            const expiresAt = new Date(config.token_expires_at);
            const now = new Date();
            console.log(`[CompanyIntegrations] Token expiry check:`, {
              expiresAt: expiresAt.toISOString(),
              now: now.toISOString(),
              isExpired: expiresAt <= now,
              minutesRemaining: Math.round((expiresAt.getTime() - now.getTime()) / (1000 * 60))
            });
            
            if (expiresAt <= now) {
              console.log('[CompanyIntegrations] Database tokens are expired');
              return null;
            }
          }
          
          console.log('[CompanyIntegrations] ✅ Returning valid database tokens');
          return {
            access_token: config.access_token,
            refresh_token: config.refresh_token
          };
        } else {
          console.log('[CompanyIntegrations] ❌ No access_token found in config');
        }
      } else {
        console.log('[CompanyIntegrations] ❌ No integration or config found');
      }
      
      // FALLBACK: Check if we have OAuth tokens stored in Expo SecureStore (legacy)
      console.log('[CompanyIntegrations] Checking SecureStore for tokens...');
      try {
        const { salesforceOAuthService } = await import('./salesforceOAuthService');
        const tokens = await salesforceOAuthService.getStoredTokens(companyId);
        console.log(`[CompanyIntegrations] SecureStore check:`, {
          hasTokens: !!tokens,
          hasAccessToken: !!tokens?.access_token,
          hasRefreshToken: !!tokens?.refresh_token
        });
        
        if (tokens && tokens.access_token) {
          console.log('[CompanyIntegrations] Found OAuth tokens in SecureStore for company:', companyId);
          
          // Check if SecureStore tokens are expired
          if (tokens.issued_at) {
            const issuedAt = parseInt(tokens.issued_at);
            const now = Date.now();
            const tokenAge = now - issuedAt;
            const twoHours = 2 * 60 * 60 * 1000;
            
            console.log(`[CompanyIntegrations] SecureStore token age check:`, {
              issuedAt: new Date(issuedAt).toISOString(),
              now: new Date(now).toISOString(),
              ageMinutes: Math.round(tokenAge / (1000 * 60)),
              isExpired: tokenAge >= twoHours
            });
            
            if (tokenAge >= twoHours) {
              console.log('[CompanyIntegrations] SecureStore tokens are expired');
              return null;
            }
          }
          
          console.log('[CompanyIntegrations] ✅ Returning valid SecureStore tokens');
          return tokens;
        } else {
          console.log('[CompanyIntegrations] ❌ No valid tokens in SecureStore');
        }
      } catch (secureStoreError) {
        console.warn('[CompanyIntegrations] Error checking SecureStore:', secureStoreError);
      }
      
      console.log('[CompanyIntegrations] ❌ FINAL RESULT: No valid OAuth tokens found for company:', companyId);
      return null;
    } catch (error) {
      console.error('[CompanyIntegrations] Failed to get Salesforce tokens:', error);
      return null;
    }
  }

  /**
   * Get integration statistics for admin dashboard
   */
  async getIntegrationStats(companyId: string): Promise<{
    total: number;
    active: number;
    inactive: number;
    error: number;
    byType: Record<string, number>;
  }> {
    try {
      const integrations = await this.getCompanyIntegrations(companyId);
      
      const stats = {
        total: integrations.length,
        active: integrations.filter(i => i.status === 'active').length,
        inactive: integrations.filter(i => i.status === 'inactive').length,
        error: integrations.filter(i => i.status === 'error').length,
        byType: {} as Record<string, number>
      };

      // Count by type
      integrations.forEach(integration => {
        stats.byType[integration.integration_type] = (stats.byType[integration.integration_type] || 0) + 1;
      });

      return stats;
    } catch (error) {
      console.error('[CompanyIntegrations] Get stats failed:', error);
      throw error;
    }
  }
}

export default new CompanyIntegrationsService();
