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
   * RFC 7636 compliant: [A-Z] / [a-z] / [0-9] / "-" / "." / "_" / "~"
   */
  private generateCodeVerifier(): string {
    // Use only RFC 7636 compliant characters (no periods to avoid issues)
    const charset = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_~';
    const length = 128; // Maximum length for better security
    let result = '';
    
    for (let i = 0; i < length; i++) {
      result += charset.charAt(Math.floor(Math.random() * charset.length));
    }
    
    console.log('[SalesforceOAuth] Generated code verifier length:', result.length);
    console.log('[SalesforceOAuth] Code verifier (first 20 chars):', result.substring(0, 20) + '...');
    
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
      
      console.log('[SalesforceOAuth] Using OAuth base URL:', baseUrl);
      console.log('[SalesforceOAuth] Instance URL (for API calls):', config.instanceUrl);
      
      // Generate PKCE challenge for security
      const codeVerifier = this.generateCodeVerifier();
      
      // Generate SHA256 hash of the code verifier
      const codeChallenge = await Crypto.digestStringAsync(
        Crypto.CryptoDigestAlgorithm.SHA256,
        codeVerifier,
        { encoding: Crypto.CryptoEncoding.BASE64 }
      );
      
      // Make Base64 URL-safe (RFC 7636 compliant)
      const urlSafeCodeChallenge = codeChallenge.replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
      
      console.log('[SalesforceOAuth] PKCE Details:', {
        codeVerifierLength: codeVerifier.length,
        codeVerifierPreview: codeVerifier.substring(0, 20) + '...',
        originalChallengeLength: codeChallenge.length,
        urlSafeChallengeLength: urlSafeCodeChallenge.length,
        challengePreview: urlSafeCodeChallenge.substring(0, 20) + '...'
      });
      
      // Store PKCE code verifier in Supabase cloud database for Edge Function to retrieve
      console.log('[SalesforceOAuth] Storing PKCE code verifier in Supabase cloud database...');
      
      try {
        // First, delete any existing oauth_state records for this company/integration to prevent conflicts
        const { error: deleteError } = await supabaseService.supabase
          .from('oauth_state')
          .delete()
          .eq('company_id', companyId)
          .eq('integration_type', 'salesforce');
        
        if (deleteError) {
          console.warn('[SalesforceOAuth] Warning: Could not delete old oauth_state:', deleteError);
        } else {
          console.log('[SalesforceOAuth] Cleaned up existing oauth_state records');
        }
        
        // Now insert the new PKCE code verifier with extended expiry
        const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString(); // 15 minutes
        
        const pkceRecord = {
          company_id: companyId,
          integration_type: 'salesforce',
          code_verifier: codeVerifier,
          code_challenge: urlSafeCodeChallenge,
          expires_at: expiresAt
        };
        
        console.log('[SalesforceOAuth] 💾 Inserting PKCE record:', {
          company_id: companyId,
          integration_type: 'salesforce',
          code_verifier_length: codeVerifier.length,
          code_challenge_length: urlSafeCodeChallenge.length,
          expires_at: expiresAt
        });
        
        const { data: insertData, error: storeError } = await supabaseService.supabase
          .from('oauth_state')
          .insert(pkceRecord)
          .select();
        
        if (storeError) {
          console.error('[SalesforceOAuth] CRITICAL: Failed to store PKCE code verifier in Supabase:', storeError);
          console.error('[SalesforceOAuth] Insert data that failed:', pkceRecord);
          throw new Error(`Failed to store PKCE code verifier: ${storeError.message}`);
        }
        
        console.log('[SalesforceOAuth] ✅ PKCE code verifier stored successfully in Supabase:', {
          company_id: companyId,
          integration_type: 'salesforce',
          code_verifier_length: codeVerifier.length,
          code_challenge_length: urlSafeCodeChallenge.length,
          expires_at: expiresAt,
          record_id: insertData?.[0]?.id,
          created_at: insertData?.[0]?.created_at
        });
        
        // VERIFICATION: Immediately query back to confirm storage worked
        console.log('[SalesforceOAuth] 🔍 Verifying PKCE storage...');
        const { data: verifyData, error: verifyError } = await supabaseService.supabase
          .from('oauth_state')
          .select('*')
          .eq('company_id', companyId)
          .eq('integration_type', 'salesforce');
          
        if (verifyError) {
          console.error('[SalesforceOAuth] ⚠️ Cannot verify PKCE storage:', verifyError);
        } else {
          console.log('[SalesforceOAuth] 📊 Verification result:', {
            recordCount: verifyData?.length || 0,
            records: verifyData?.map(r => ({
              id: r.id,
              company_id: r.company_id,
              verifierLength: r.code_verifier?.length,
              expiresAt: r.expires_at
            }))
          });
        }
        
      } catch (storeError: any) {
        console.error('[SalesforceOAuth] CRITICAL ERROR: Cannot proceed without storing PKCE code verifier:', storeError);
        throw new Error(`OAuth setup failed: ${storeError.message}`);
      }
      
      // Build OAuth URL with all required parameters
      const redirectUri = this.getRedirectUri();
      const state = companyId; // Use company ID as state parameter
      const scope = 'api refresh_token offline_access'; // Standard scopes for API access
      
      const params = new URLSearchParams({
        response_type: 'code',
        client_id: config.clientId,
        redirect_uri: redirectUri,
        scope: scope,
        code_challenge: urlSafeCodeChallenge,
        code_challenge_method: 'S256', // SHA256 hash method
        state: state
      });
      
      const authUrl = `${baseUrl}/services/oauth2/authorize?${params.toString()}`;
      
      console.log('[SalesforceOAuth] OAuth URL constructed:', {
        baseUrl,
        clientId: config.clientId.substring(0, 15) + '...',
        redirectUri,
        scope,
        challenge: urlSafeCodeChallenge.substring(0, 20) + '...',
        state,
        fullUrlLength: authUrl.length
      });
      
      return { 
        authUrl, 
        codeChallenge: urlSafeCodeChallenge 
      };
      
    } catch (error) {
      console.error('[SalesforceOAuth] Failed to initiate OAuth flow:', error);
      throw error;
    }
  }

  /**
   * Check if OAuth tokens are available (direct approach)
   */
  async checkOAuthTokens(companyId: string): Promise<{ success: boolean; error?: string }> {
    try {
      console.log('[SalesforceOAuth] Checking OAuth tokens for company:', companyId);
      
      // First check if there are any successful OAuth callbacks
      const { data: callbackData, error: callbackError } = await supabaseService.supabase
        .from('oauth_callbacks')
        .select('*')
        .eq('company_id', companyId)
        .is('error', null)
        .eq('consumed', false)
        .order('created_at', { ascending: false })
        .limit(1)
        .single();
      
      if (callbackData && !callbackError) {
        console.log('[SalesforceOAuth] Found successful OAuth callback, checking for tokens...');
        
        // Mark callback as consumed
        await supabaseService.supabase
          .from('oauth_callbacks')
          .update({ consumed: true })
          .eq('id', callbackData.id);
      }
      
      // Check if tokens are stored in company_integrations config
      const { data: integration, error: integrationError } = await supabaseService.supabase
        .from('company_integrations')
        .select('config')
        .eq('company_id', companyId)
        .eq('integration_type', 'salesforce')
        .single();
      
      if (integrationError || !integration) {
        console.log('[SalesforceOAuth] No Salesforce integration found:', integrationError?.message);
        return { success: false };
      }
      
      const config = integration.config as any;
      if (!config?.access_token) {
        console.log('[SalesforceOAuth] No access token found in config');
        return { success: false };
      }
      
      // Check if token is expired
      if (config.token_expires_at && new Date(config.token_expires_at) < new Date()) {
        console.log('[SalesforceOAuth] OAuth tokens are expired');
        return { success: false, error: 'tokens_expired' };
      }
      
      console.log('[SalesforceOAuth] Valid OAuth tokens found in config');
    
    // Update integration status to active if tokens are valid
    try {
      await supabaseService.supabase
        .from('company_integrations')
        .update({ 
          status: 'active',
          last_sync_at: new Date().toISOString()
        })
        .eq('company_id', companyId)
        .eq('integration_type', 'salesforce');
      
      console.log('[SalesforceOAuth] Integration status updated to active');
    } catch (statusError) {
      console.error('[SalesforceOAuth] Error updating integration status:', statusError);
      // Don't fail the whole operation if status update fails
    }
    
    return { success: true };
    } catch (error) {
      console.error('[SalesforceOAuth] Error checking tokens:', error);
      return { success: false, error: 'token_check_failed' };
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
      console.log('[SalesforceOAuth] Auth code length:', authCode?.length || 0);
      console.log('[SalesforceOAuth] Code verifier length:', codeVerifier?.length || 0);
      
      // Validate required parameters
      if (!authCode) {
        throw new Error('Authorization code is required');
      }
      if (!codeVerifier) {
        throw new Error('PKCE code verifier is required');
      }
      if (!config.clientId || !config.clientSecret) {
        throw new Error('Client ID and Client Secret are required');
      }
      
      const baseUrl = config.sandbox 
        ? 'https://test.salesforce.com' 
        : 'https://login.salesforce.com';
      
      console.log('[SalesforceOAuth] Using OAuth base URL:', baseUrl);
      console.log('[SalesforceOAuth] Instance URL (for API calls):', config.instanceUrl);
      
      const tokenUrl = `${baseUrl}/services/oauth2/token`;
      const redirectUri = this.getRedirectUri();
      
      console.log('[SalesforceOAuth] Token URL:', tokenUrl);
      console.log('[SalesforceOAuth] Redirect URI:', redirectUri);
      
      const requestBody = {
        grant_type: 'authorization_code',
        client_id: config.clientId,
        client_secret: config.clientSecret,
        redirect_uri: redirectUri,
        code: authCode,
        code_verifier: codeVerifier
      };
      
      console.log('[SalesforceOAuth] Request body params:', {
        grant_type: requestBody.grant_type,
        client_id: requestBody.client_id.substring(0, 10) + '...',
        client_secret: requestBody.client_secret ? '[PRESENT]' : '[MISSING]',
        redirect_uri: requestBody.redirect_uri,
        code: requestBody.code.substring(0, 10) + '...',
        code_verifier: requestBody.code_verifier.substring(0, 10) + '...'
      });
      
      const body = new URLSearchParams(requestBody);
      
      console.log('[SalesforceOAuth] Making token exchange request...');
      const response = await fetch(tokenUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Accept': 'application/json'
        },
        body: body.toString()
      });
      
      console.log('[SalesforceOAuth] Token exchange response status:', response.status);
      console.log('[SalesforceOAuth] Token exchange response headers:', Object.fromEntries(response.headers.entries()));

      if (!response.ok) {
        const errorText = await response.text();
        console.error('[SalesforceOAuth] Token exchange failed with status:', response.status);
        console.error('[SalesforceOAuth] Token exchange error response:', errorText);
        
        // Try to parse error as JSON for better error messages
        let errorMessage = `OAuth token exchange failed: ${response.status}`;
        try {
          const errorJson = JSON.parse(errorText);
          if (errorJson.error_description) {
            errorMessage += ` - ${errorJson.error_description}`;
          } else if (errorJson.error) {
            errorMessage += ` - ${errorJson.error}`;
          }
        } catch (parseError) {
          errorMessage += ` - ${errorText}`;
        }
        
        throw new Error(errorMessage);
      }

      const responseText = await response.text();
      console.log('[SalesforceOAuth] Token exchange response body:', responseText);
      
      let tokens: SalesforceTokens;
      try {
        tokens = JSON.parse(responseText);
      } catch (parseError) {
        console.error('[SalesforceOAuth] Failed to parse token response as JSON:', parseError);
        throw new Error('Invalid JSON response from Salesforce token endpoint');
      }
      
      // Validate token response
      if (!tokens.access_token) {
        console.error('[SalesforceOAuth] No access token in response:', tokens);
        throw new Error('No access token received from Salesforce');
      }
      
      console.log('[SalesforceOAuth] Successfully received tokens:', {
        access_token: tokens.access_token ? '[PRESENT]' : '[MISSING]',
        refresh_token: tokens.refresh_token ? '[PRESENT]' : '[MISSING]',
        instance_url: tokens.instance_url,
        token_type: tokens.token_type
      });
      
      // Store tokens securely
      console.log('[SalesforceOAuth] Storing tokens securely...');
      await this.storeTokens(companyId, tokens);
      console.log('[SalesforceOAuth] Tokens stored successfully');
      
      // Update company integration record
      console.log('[SalesforceOAuth] Updating company integration status...');
      await this.updateCompanyIntegration(companyId, tokens);
      console.log('[SalesforceOAuth] Company integration status updated');
      
      console.log('[SalesforceOAuth] OAuth flow completed successfully');
      return tokens;
    } catch (error) {
      console.error('[SalesforceOAuth] Error completing OAuth flow:', error);
      if (error instanceof Error) {
        console.error('[SalesforceOAuth] Error stack:', error.stack);
      }
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

      // Add null check to prevent runtime error
      if (!body) {
        throw new Error('Failed to create request body for token refresh');
      }

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
