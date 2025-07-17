/**
 * Salesforce OAuth Service
 * Handles company-level OAuth authentication with Salesforce
 * Stores and manages refresh tokens securely per company
 */

import * as SecureStore from 'expo-secure-store';
import * as AuthSession from 'expo-auth-session';
import { Platform } from 'react-native';
import Constants from 'expo-constants';
import * as Crypto from 'expo-crypto';
import supabaseService from './supabaseService';

export interface SalesforceOAuthConfig {
  clientId: string;
  clientSecret: string;
  instanceUrl: string;
  redirectUri: string;
  sandbox: boolean;
}

export interface SalesforceTokens {
  access_token: string;
  refresh_token: string;
  instance_url: string;
  id: string;
  token_type: string;
  issued_at: string;
  signature: string;
}

export interface SalesforceUserInfo {
  id: string;
  email: string;
  display_name: string;
  organization_id: string;
  username: string;
}

class SalesforceOAuthService {
  private readonly SECURE_STORE_PREFIX = 'sf_tokens_';
  
  /**
   * Generate a random code verifier for PKCE (43-128 characters)
   */
  private generateCodeVerifier(): string {
    const charset = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~';
    const length = 128; // Maximum length for better security
    let result = '';
    
    for (let i = 0; i < length; i++) {
      result += charset.charAt(Math.floor(Math.random() * charset.length));
    }
    
    return result;
  }
  
  /**
   * Get the correct redirect URI based on the current environment
   */
  private getRedirectUri(): string {
    // Use Supabase Edge Function for OAuth callback in all environments
    // This provides a stable HTTPS endpoint for production deployment
    const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL || 'https://luwlvmcixwdtuaffamgk.supabase.co';
    return `${supabaseUrl}/functions/v1/salesforce-oauth-callback`;
  }
  
  /**
   * Initiate OAuth flow for a company
   */
  async initiateOAuthFlow(
    companyId: string, 
    config: SalesforceOAuthConfig
  ): Promise<{ authUrl: string; codeChallenge: string }> {
    try {
      console.log('[SalesforceOAuth] Initiating OAuth flow for company:', companyId);
      
      const baseUrl = config.sandbox 
        ? 'https://test.salesforce.com' 
        : 'https://login.salesforce.com';
      
      // CRITICAL FIX: OAuth should always use login.salesforce.com (or test.salesforce.com for sandbox)
      // NOT the instance URL (like https://yourcompany.my.salesforce.com) which causes file download issues
      console.log('[SalesforceOAuth] Using OAuth base URL:', baseUrl);
      console.log('[SalesforceOAuth] Instance URL (for API calls):', config.instanceUrl);
      
      // Generate PKCE challenge for security
      // Generate a random code verifier (43-128 characters)
      const codeVerifier = this.generateCodeVerifier();
      const codeChallenge = await Crypto.digestStringAsync(
        Crypto.CryptoDigestAlgorithm.SHA256,
        codeVerifier,
        { encoding: Crypto.CryptoEncoding.BASE64 }
      );
      // Remove padding and make URL-safe
      const urlSafeCodeChallenge = codeChallenge.replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
      
      const redirectUri = this.getRedirectUri();
      console.log('[SalesforceOAuth] Using redirect URI:', redirectUri);
      
      const authUrl = `${baseUrl}/services/oauth2/authorize?` +
        `response_type=code&` +
        `client_id=${encodeURIComponent(config.clientId)}&` +
        `redirect_uri=${encodeURIComponent(redirectUri)}&` +
        `scope=${encodeURIComponent('api refresh_token offline_access')}&` +
        `code_challenge=${urlSafeCodeChallenge}&` +
        `code_challenge_method=S256&` +
        `state=${companyId}`;
      
      return { authUrl, codeChallenge: codeVerifier };
    } catch (error) {
      console.error('[SalesforceOAuth] Error initiating OAuth flow:', error);
      throw new Error('Failed to initiate OAuth flow');
    }
  }

  /**
   * Retrieve OAuth callback data from Supabase
   */
  async retrieveOAuthCallback(companyId: string): Promise<{ authCode?: string; error?: string; errorDescription?: string }> {
    try {
      const { data, error } = await supabaseService.supabase
        .from('oauth_callbacks')
        .select('auth_code, error, error_description')
        .eq('company_id', companyId)
        .eq('consumed', false)
        .gt('expires_at', new Date().toISOString())
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

      if (error) {
        console.error('[SalesforceOAuth] Error retrieving callback:', error);
        return {};
      }

      if (data) {
        // Mark as consumed
        await supabaseService.supabase
          .from('oauth_callbacks')
          .update({ consumed: true })
          .eq('company_id', companyId)
          .eq('auth_code', data.auth_code);

        return {
          authCode: data.auth_code,
          error: data.error,
          errorDescription: data.error_description
        };
      }

      return {};
    } catch (error) {
      console.error('[SalesforceOAuth] Error retrieving OAuth callback:', error);
      return {};
    }
  }

  /**
   * Complete OAuth flow by exchanging authorization code for tokens
   */
  async completeOAuthFlow(
    companyId: string,
    authCode: string,
    codeVerifier: string,
    config: SalesforceOAuthConfig
  ): Promise<SalesforceTokens> {
    try {
      console.log('[SalesforceOAuth] Completing OAuth flow for company:', companyId);
      
      const baseUrl = config.sandbox 
        ? 'https://test.salesforce.com' 
        : 'https://login.salesforce.com';
      
      // CRITICAL FIX: OAuth should always use login.salesforce.com (or test.salesforce.com for sandbox)
      // NOT the instance URL (like https://yourcompany.my.salesforce.com) which causes file download issues
      console.log('[SalesforceOAuth] Using OAuth base URL:', baseUrl);
      console.log('[SalesforceOAuth] Instance URL (for API calls):', config.instanceUrl);
      
      const tokenUrl = `${baseUrl}/services/oauth2/token`;
      
      const redirectUri = this.getRedirectUri();
    
    const body = new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: config.clientId,
      client_secret: config.clientSecret,
      redirect_uri: redirectUri,
      code: authCode,
      code_verifier: codeVerifier
    });

      const response = await fetch(tokenUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Accept': 'application/json'
        },
        body: body.toString()
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('[SalesforceOAuth] Token exchange failed:', errorText);
        throw new Error(`OAuth token exchange failed: ${response.status}`);
      }

      const tokens: SalesforceTokens = await response.json();
      
      // Store tokens securely
      await this.storeTokens(companyId, tokens);
      
      // Update company integration record
      await this.updateCompanyIntegration(companyId, tokens);
      
      console.log('[SalesforceOAuth] OAuth flow completed successfully');
      return tokens;
    } catch (error) {
      console.error('[SalesforceOAuth] Error completing OAuth flow:', error);
      throw error;
    }
  }

  /**
   * Get valid access token for company (refresh if needed)
   */
  async getValidAccessToken(companyId: string): Promise<string | null> {
    try {
      const tokens = await this.getStoredTokens(companyId);
      if (!tokens) {
        console.log('[SalesforceOAuth] No tokens found for company:', companyId);
        return null;
      }

      // Check if token is still valid (Salesforce tokens typically last 2 hours)
      const issuedAt = parseInt(tokens.issued_at);
      const now = Date.now();
      const tokenAge = now - issuedAt;
      const twoHours = 2 * 60 * 60 * 1000;

      if (tokenAge < twoHours) {
        return tokens.access_token;
      }

      // Refresh token if expired
      console.log('[SalesforceOAuth] Access token expired, refreshing...');
      const refreshedTokens = await this.refreshAccessToken(companyId, tokens.refresh_token);
      return refreshedTokens?.access_token || null;
    } catch (error) {
      console.error('[SalesforceOAuth] Error getting valid access token:', error);
      return null;
    }
  }

  /**
   * Refresh access token using refresh token
   */
  async refreshAccessToken(companyId: string, refreshToken: string): Promise<SalesforceTokens | null> {
    try {
      console.log('[SalesforceOAuth] Refreshing access token for company:', companyId);
      
      // Get company integration to get config
      const integration = await supabaseService.getCompanyIntegration(companyId, 'salesforce');
      if (!integration?.config) {
        throw new Error('Company Salesforce configuration not found');
      }

      const config = integration.config as SalesforceOAuthConfig;
      const baseUrl = config.sandbox 
        ? 'https://test.salesforce.com' 
        : 'https://login.salesforce.com';
      
      // CRITICAL FIX: OAuth should always use login.salesforce.com (or test.salesforce.com for sandbox)
      // NOT the instance URL (like https://yourcompany.my.salesforce.com) which causes file download issues
      console.log('[SalesforceOAuth] Using OAuth base URL:', baseUrl);
      console.log('[SalesforceOAuth] Instance URL (for API calls):', config.instanceUrl);
      
      const tokenUrl = `${baseUrl}/services/oauth2/token`;
      
      const body = new URLSearchParams({
        grant_type: 'refresh_token',
        client_id: config.clientId,
        client_secret: config.clientSecret,
        refresh_token: refreshToken
      });

      const response = await fetch(tokenUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Accept': 'application/json'
        },
        body: body.toString()
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('[SalesforceOAuth] Token refresh failed:', errorText);
        
        // If refresh fails, clear stored tokens
        await this.clearTokens(companyId);
        return null;
      }

      const newTokens: SalesforceTokens = await response.json();
      
      // Preserve refresh token if not provided in response
      if (!newTokens.refresh_token) {
        newTokens.refresh_token = refreshToken;
      }
      
      // Store new tokens
      await this.storeTokens(companyId, newTokens);
      
      console.log('[SalesforceOAuth] Access token refreshed successfully');
      return newTokens;
    } catch (error) {
      console.error('[SalesforceOAuth] Error refreshing access token:', error);
      return null;
    }
  }

  /**
   * Get Salesforce user info
   */
  async getUserInfo(companyId: string): Promise<SalesforceUserInfo | null> {
    try {
      const accessToken = await this.getValidAccessToken(companyId);
      if (!accessToken) {
        return null;
      }

      const tokens = await this.getStoredTokens(companyId);
      if (!tokens?.id) {
        return null;
      }

      const response = await fetch(tokens.id, {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Accept': 'application/json'
        }
      });

      if (!response.ok) {
        console.error('[SalesforceOAuth] Failed to get user info:', response.status);
        return null;
      }

      const userInfo: SalesforceUserInfo = await response.json();
      return userInfo;
    } catch (error) {
      console.error('[SalesforceOAuth] Error getting user info:', error);
      return null;
    }
  }

  /**
   * Test Salesforce connection
   */
  async testConnection(companyId: string): Promise<boolean> {
    try {
      const accessToken = await this.getValidAccessToken(companyId);
      if (!accessToken) {
        return false;
      }

      const tokens = await this.getStoredTokens(companyId);
      if (!tokens?.instance_url) {
        return false;
      }

      // Test with a simple API call
      const response = await fetch(`${tokens.instance_url}/services/data/v58.0/`, {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Accept': 'application/json'
        }
      });

      return response.ok;
    } catch (error) {
      console.error('[SalesforceOAuth] Connection test failed:', error);
      return false;
    }
  }

  /**
   * Revoke OAuth tokens and clear stored data
   */
  async revokeAccess(companyId: string): Promise<void> {
    try {
      console.log('[SalesforceOAuth] Revoking access for company:', companyId);
      
      const tokens = await this.getStoredTokens(companyId);
      if (tokens?.refresh_token) {
        // Get company integration to get config
        const integration = await supabaseService.getCompanyIntegration(companyId, 'salesforce');
        if (integration?.config) {
          const config = integration.config as SalesforceOAuthConfig;
          const baseUrl = config.sandbox 
            ? 'https://test.salesforce.com' 
            : config.instanceUrl || 'https://login.salesforce.com';
          
          // Revoke refresh token
          await fetch(`${baseUrl}/services/oauth2/revoke`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/x-www-form-urlencoded'
            },
            body: `token=${tokens.refresh_token}`
          });
        }
      }

      // Clear stored tokens
      await this.clearTokens(companyId);
      
      // Update company integration status
      await supabaseService.updateCompanyIntegrationStatus(companyId, 'salesforce', 'inactive');
      
      console.log('[SalesforceOAuth] Access revoked successfully');
    } catch (error) {
      console.error('[SalesforceOAuth] Error revoking access:', error);
      throw error;
    }
  }

  /**
   * Store tokens securely
   */
  private async storeTokens(companyId: string, tokens: SalesforceTokens): Promise<void> {
    try {
      const key = `${this.SECURE_STORE_PREFIX}${companyId}`;
      await SecureStore.setItemAsync(key, JSON.stringify(tokens));
    } catch (error) {
      console.error('[SalesforceOAuth] Error storing tokens:', error);
      throw error;
    }
  }

  /**
   * Get stored tokens
   */
  async getStoredTokens(companyId: string): Promise<SalesforceTokens | null> {
    try {
      const key = `${this.SECURE_STORE_PREFIX}${companyId}`;
      const tokensJson = await SecureStore.getItemAsync(key);
      return tokensJson ? JSON.parse(tokensJson) : null;
    } catch (error) {
      console.error('[SalesforceOAuth] Error getting stored tokens:', error);
      return null;
    }
  }

  /**
   * Clear stored tokens
   */
  private async clearTokens(companyId: string): Promise<void> {
    try {
      const key = `${this.SECURE_STORE_PREFIX}${companyId}`;
      await SecureStore.deleteItemAsync(key);
    } catch (error) {
      console.error('[SalesforceOAuth] Error clearing tokens:', error);
    }
  }

  /**
   * Update company integration record with OAuth info
   */
  private async updateCompanyIntegration(companyId: string, tokens: SalesforceTokens): Promise<void> {
    try {
      // Import the company integrations service to update status
      const { default: companyIntegrationsService } = await import('./companyIntegrationsService');
      
      // Get the integration record
      const integration = await companyIntegrationsService.getIntegration(companyId, 'salesforce');
      if (!integration) {
        console.error('[SalesforceOAuth] No Salesforce integration found for company:', companyId);
        return;
      }
      
      // Update status to active with timestamp
      await companyIntegrationsService.updateIntegrationStatus(
        integration.id, 
        'active', 
        undefined, // no error message
        new Date().toISOString() // last_test_at timestamp
      );
      
      console.log('[SalesforceOAuth] Company integration status updated to active');
    } catch (error) {
      console.error('[SalesforceOAuth] Error updating company integration:', error);
    }
  }
}

export const salesforceOAuthService = new SalesforceOAuthService();
