/**
 * Company-wide Salesforce Token Service
 * Manages centralized Salesforce OAuth tokens for all users in a company
 */

import { supabase } from './supabaseService';

export interface CompanySalesforceToken {
  access_token: string;
  refresh_token: string;
  instance_url: string;
  expires_at: string;
  token_data?: any;
}

class CompanySalesforceTokenService {
  /**
   * Get valid Salesforce access token for a company
   * Automatically refreshes if expired
   */
  async getCompanySalesforceToken(companyId: string): Promise<string> {
    try {
      console.log('[CompanySalesforceToken] Getting token for company:', companyId);
      
      // Get token from oauth_tokens table
      const { data, error } = await supabase
        .from('oauth_tokens')
        .select('*')
        .eq('company_id', companyId)
        .eq('integration_type', 'salesforce')
        .single();
      
      if (error || !data) {
        // Check if there's a token in company_integrations (backward compatibility)
        const { data: integration, error: integrationError } = await supabase
          .from('company_integrations')
          .select('config, status')
          .eq('company_id', companyId)
          .eq('integration_type', 'salesforce')
          .single();
        
        if (integrationError || !integration?.config?.access_token) {
          throw new Error('No Salesforce token found. Admin must connect Salesforce first.');
        }
        
        if (integration.status !== 'active') {
          throw new Error('Salesforce integration is not active. Admin must reconnect.');
        }
        
        // Use token from company_integrations
        return integration.config.access_token;
      }
      
      // Check if token is expired
      const isExpired = data.expires_at && new Date(data.expires_at) <= new Date();
      
      if (isExpired) {
        console.log('[CompanySalesforceToken] Token expired, refreshing...');
        
        // Call refresh edge function
        const { data: refreshData, error: refreshError } = await supabase.functions.invoke(
          'refresh-salesforce-token',
          {
            body: { company_id: companyId }
          }
        );
        
        if (refreshError || !refreshData?.success) {
          throw new Error(`Token refresh failed: ${refreshError?.message || refreshData?.error || 'Unknown error'}`);
        }
        
        return refreshData.access_token;
      }
      
      return data.access_token;
    } catch (error) {
      console.error('[CompanySalesforceToken] Error getting token:', error);
      throw error;
    }
  }
  
  /**
   * Get full token details including instance URL
   */
  async getCompanySalesforceTokenDetails(companyId: string): Promise<CompanySalesforceToken> {
    try {
      // Get token from oauth_tokens table
      const { data, error } = await supabase
        .from('oauth_tokens')
        .select('*')
        .eq('company_id', companyId)
        .eq('integration_type', 'salesforce')
        .single();
      
      if (error || !data) {
        // Check company_integrations for backward compatibility
        const { data: integration, error: integrationError } = await supabase
          .from('company_integrations')
          .select('config, status')
          .eq('company_id', companyId)
          .eq('integration_type', 'salesforce')
          .single();
        
        if (integrationError || !integration?.config?.access_token) {
          throw new Error('No Salesforce token found. Admin must connect Salesforce first.');
        }
        
        if (integration.status !== 'active') {
          throw new Error('Salesforce integration is not active. Admin must reconnect.');
        }
        
        // Convert from company_integrations format
        return {
          access_token: integration.config.access_token,
          refresh_token: integration.config.refresh_token,
          instance_url: integration.config.instance_url,
          expires_at: integration.config.token_expires_at || new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(),
          token_data: {
            token_type: integration.config.token_type || 'Bearer',
            from_legacy: true
          }
        };
      }
      
      // Check if token needs refresh
      const isExpired = data.expires_at && new Date(data.expires_at) <= new Date();
      
      if (isExpired) {
        console.log('[CompanySalesforceToken] Token expired, refreshing...');
        
        // Call refresh edge function
        const { data: refreshData, error: refreshError } = await supabase.functions.invoke(
          'refresh-salesforce-token',
          {
            body: { company_id: companyId }
          }
        );
        
        if (refreshError || !refreshData?.success) {
          throw new Error(`Token refresh failed: ${refreshError?.message || refreshData?.error || 'Unknown error'}`);
        }
        
        // Get updated token details
        const { data: updatedData } = await supabase
          .from('oauth_tokens')
          .select('*')
          .eq('company_id', companyId)
          .eq('integration_type', 'salesforce')
          .single();
        
        if (updatedData) {
          return {
            access_token: updatedData.access_token,
            refresh_token: updatedData.refresh_token,
            instance_url: updatedData.instance_url,
            expires_at: updatedData.expires_at,
            token_data: updatedData.token_data
          };
        }
      }
      
      return {
        access_token: data.access_token,
        refresh_token: data.refresh_token,
        instance_url: data.instance_url,
        expires_at: data.expires_at,
        token_data: data.token_data
      };
    } catch (error) {
      console.error('[CompanySalesforceToken] Error getting token details:', error);
      throw error;
    }
  }
  
  /**
   * Check if a company has Salesforce connected
   */
  async isCompanySalesforceConnected(companyId: string): Promise<boolean> {
    try {
      // Check oauth_tokens table first
      const { data: tokenData, error: tokenError } = await supabase
        .from('oauth_tokens')
        .select('id')
        .eq('company_id', companyId)
        .eq('integration_type', 'salesforce')
        .single();
      
      if (!tokenError && tokenData) {
        return true;
      }
      
      // Check company_integrations for backward compatibility
      const { data: integration, error: integrationError } = await supabase
        .from('company_integrations')
        .select('status')
        .eq('company_id', companyId)
        .eq('integration_type', 'salesforce')
        .single();
      
      return !integrationError && integration?.status === 'active';
    } catch (error) {
      console.error('[CompanySalesforceToken] Error checking connection:', error);
      return false;
    }
  }
  
  /**
   * Clear company's Salesforce tokens (for logout/disconnect)
   */
  async clearCompanySalesforceTokens(companyId: string): Promise<void> {
    try {
      // Delete from oauth_tokens
      await supabase
        .from('oauth_tokens')
        .delete()
        .eq('company_id', companyId)
        .eq('integration_type', 'salesforce');
      
      // Update company_integrations status
      await supabase
        .from('company_integrations')
        .update({
          status: 'inactive',
          config: supabase.raw(`config - 'access_token' - 'refresh_token'`),
          error_message: 'Disconnected by user',
          last_test_at: new Date().toISOString()
        })
        .eq('company_id', companyId)
        .eq('integration_type', 'salesforce');
      
      console.log('[CompanySalesforceToken] Cleared tokens for company:', companyId);
    } catch (error) {
      console.error('[CompanySalesforceToken] Error clearing tokens:', error);
      throw error;
    }
  }
}

export const companySalesforceTokenService = new CompanySalesforceTokenService();