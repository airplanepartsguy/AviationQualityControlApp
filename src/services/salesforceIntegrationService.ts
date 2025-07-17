/**
 * Salesforce Integration Service
 * High-level service that orchestrates OAuth and sync operations
 */

import { salesforceOAuthService, SalesforceOAuthConfig } from './salesforceOAuthService';
import { salesforceSyncService } from './salesforceSyncService';
import { supabaseService } from './supabaseService';

export interface SalesforceIntegrationStatus {
  isConfigured: boolean;
  isAuthenticated: boolean;
  lastSync?: string;
  userInfo?: {
    email: string;
    displayName: string;
    organizationId: string;
  };
  connectionTest?: {
    success: boolean;
    message: string;
  };
}

class SalesforceIntegrationService {
  /**
   * Get integration status for a company
   */
  async getIntegrationStatus(companyId: string): Promise<SalesforceIntegrationStatus> {
    try {
      // Check if integration is configured
      const integration = await supabaseService.getCompanyIntegration(companyId, 'salesforce');
      const isConfigured = !!integration?.config;
      
      if (!isConfigured) {
        return {
          isConfigured: false,
          isAuthenticated: false
        };
      }

      // Check if authenticated (has valid tokens)
      const accessToken = await salesforceOAuthService.getValidAccessToken(companyId);
      const isAuthenticated = !!accessToken;

      const status: SalesforceIntegrationStatus = {
        isConfigured,
        isAuthenticated,
        lastSync: integration?.last_sync_at
      };

      if (isAuthenticated) {
        // Get user info
        const userInfo = await salesforceOAuthService.getUserInfo(companyId);
        if (userInfo) {
          status.userInfo = {
            email: userInfo.email,
            displayName: userInfo.display_name,
            organizationId: userInfo.organization_id
          };
        }

        // Test connection
        const connectionTest = await salesforceSyncService.testSalesforceAPI(companyId);
        status.connectionTest = connectionTest;
      }

      return status;
    } catch (error) {
      console.error('[SalesforceIntegration] Error getting status:', error);
      return {
        isConfigured: false,
        isAuthenticated: false
      };
    }
  }

  /**
   * Configure Salesforce integration for a company
   */
  async configureIntegration(
    companyId: string,
    config: SalesforceOAuthConfig,
    userId: string
  ): Promise<void> {
    try {
      console.log('[SalesforceIntegration] Configuring integration for company:', companyId);
      
      // Save configuration to Supabase
      await supabaseService.createOrUpdateCompanyIntegration({
        company_id: companyId,
        integration_type: 'salesforce',
        config: config,
        status: 'configured',
        created_by: userId,
        updated_by: userId
      });

      console.log('[SalesforceIntegration] Configuration saved successfully');
    } catch (error) {
      console.error('[SalesforceIntegration] Error configuring integration:', error);
      throw error;
    }
  }

  /**
   * Start OAuth authentication flow
   */
  async startAuthentication(companyId: string): Promise<{
    authUrl: string;
    codeChallenge: string;
  }> {
    try {
      // Get company configuration
      const integration = await supabaseService.getCompanyIntegration(companyId, 'salesforce');
      if (!integration?.config) {
        throw new Error('Salesforce integration not configured for this company');
      }

      const config = integration.config as SalesforceOAuthConfig;
      
      // Generate redirect URI for the app
      config.redirectUri = 'exp://localhost:8081/--/salesforce-oauth'; // Expo development
      
      return await salesforceOAuthService.initiateOAuthFlow(companyId, config);
    } catch (error) {
      console.error('[SalesforceIntegration] Error starting authentication:', error);
      throw error;
    }
  }

  /**
   * Complete OAuth authentication
   */
  async completeAuthentication(
    companyId: string,
    authCode: string,
    codeVerifier: string
  ): Promise<void> {
    try {
      // Get company configuration
      const integration = await supabaseService.getCompanyIntegration(companyId, 'salesforce');
      if (!integration?.config) {
        throw new Error('Salesforce integration not configured for this company');
      }

      const config = integration.config as SalesforceOAuthConfig;
      config.redirectUri = 'exp://localhost:8081/--/salesforce-oauth';
      
      await salesforceOAuthService.completeOAuthFlow(companyId, authCode, codeVerifier, config);
      
      console.log('[SalesforceIntegration] Authentication completed successfully');
    } catch (error) {
      console.error('[SalesforceIntegration] Error completing authentication:', error);
      throw error;
    }
  }

  /**
   * Test Salesforce connection
   */
  async testConnection(companyId: string): Promise<boolean> {
    try {
      const result = await salesforceSyncService.testSalesforceAPI(companyId);
      return result.success;
    } catch (error) {
      console.error('[SalesforceIntegration] Connection test failed:', error);
      return false;
    }
  }

  /**
   * Sync data to Salesforce
   */
  async syncData(companyId: string, batchIds?: string[]): Promise<{
    success: boolean;
    message: string;
    details?: any;
  }> {
    try {
      console.log('[SalesforceIntegration] Starting data sync for company:', companyId);
      
      const result = await salesforceSyncService.syncBatches(companyId, batchIds);
      
      return {
        success: result.success,
        message: result.success 
          ? `Successfully synced ${result.recordsSucceeded} records`
          : `Sync failed: ${result.errors.join(', ')}`,
        details: result
      };
    } catch (error) {
      console.error('[SalesforceIntegration] Sync failed:', error);
      return {
        success: false,
        message: `Sync failed: ${error.message}`
      };
    }
  }

  /**
   * Disconnect Salesforce integration
   */
  async disconnect(companyId: string): Promise<void> {
    try {
      console.log('[SalesforceIntegration] Disconnecting integration for company:', companyId);
      
      // Revoke OAuth tokens
      await salesforceOAuthService.revokeAccess(companyId);
      
      // Update integration status
      await supabaseService.updateCompanyIntegrationStatus(companyId, 'salesforce', 'inactive');
      
      console.log('[SalesforceIntegration] Integration disconnected successfully');
    } catch (error) {
      console.error('[SalesforceIntegration] Error disconnecting integration:', error);
      throw error;
    }
  }
}

export const salesforceIntegrationService = new SalesforceIntegrationService();
