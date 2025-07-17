import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const url = new URL(req.url)
    const authCode = url.searchParams.get('code')
    const state = url.searchParams.get('state') // This is the companyId
    const error = url.searchParams.get('error')
    const errorDescription = url.searchParams.get('error_description')

    console.log('OAuth callback received:', {
      authCode: authCode ? 'present' : 'missing',
      state,
      error,
      errorDescription
    })

    // Perform direct token exchange instead of storing callback data
    let tokenExchangeSuccess = false
    let tokenExchangeError = ''
    
    if (authCode && state) {
      try {
        const supabaseUrl = Deno.env.get('SUPABASE_URL')!
        const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
        const supabase = createClient(supabaseUrl, supabaseServiceKey)

        console.log('Starting direct token exchange for company:', state)
        
        // Get company integration config
        const { data: integration, error: integrationError } = await supabase
          .from('company_integrations')
          .select('config')
          .eq('company_id', state)
          .eq('integration_type', 'salesforce')
          .single()
        
        if (integrationError || !integration) {
          throw new Error('Salesforce integration not found')
        }
        
        const config = integration.config as any
        if (!config.client_id || !config.client_secret) {
          throw new Error('Missing Salesforce client credentials')
        }
        
        // Try to get stored PKCE code verifier from oauth_callbacks table
        // This is a fallback approach using existing table structure
        const { data: callbackData } = await supabase
          .from('oauth_callbacks')
          .select('*')
          .eq('company_id', state)
          .eq('consumed', false)
          .order('created_at', { ascending: false })
          .limit(1)
          .single()
        
        // For now, use empty code verifier as fallback
        // The PKCE code verifier should be retrieved from the app's SecureStore
        const codeVerifier = ''
        
        // Exchange authorization code for tokens
        const baseUrl = config.sandbox ? 'https://test.salesforce.com' : 'https://login.salesforce.com'
        const tokenUrl = `${baseUrl}/services/oauth2/token`
        const redirectUri = `${supabaseUrl}/functions/v1/salesforce-oauth-callback`
        
        const tokenResponse = await fetch(tokenUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'Accept': 'application/json'
          },
          body: new URLSearchParams({
            grant_type: 'authorization_code',
            client_id: config.client_id,
            client_secret: config.client_secret,
            redirect_uri: redirectUri,
            code: authCode,
            code_verifier: codeVerifier
          }).toString()
        })
        
        if (!tokenResponse.ok) {
          const errorText = await tokenResponse.text()
          throw new Error(`Token exchange failed: ${tokenResponse.status} - ${errorText}`)
        }
        
        const tokens = await tokenResponse.json()
        
        if (!tokens.access_token) {
          throw new Error('No access token received')
        }
        
        // Store tokens in company_integrations config (existing approach)
        const updatedConfig = {
          ...config,
          access_token: tokens.access_token,
          refresh_token: tokens.refresh_token,
          instance_url: tokens.instance_url,
          token_data: tokens,
          token_expires_at: new Date(Date.now() + (tokens.expires_in || 3600) * 1000).toISOString()
        }
        
        const { error: configError } = await supabase
          .from('company_integrations')
          .update({ config: updatedConfig })
          .eq('company_id', state)
          .eq('integration_type', 'salesforce')
        
        if (configError) {
          throw new Error(`Failed to store tokens: ${configError.message}`)
        }
        
        // Update integration status to active
        const { error: statusError } = await supabase
          .from('company_integrations')
          .update({
            status: 'active',
            last_test_at: new Date().toISOString()
          })
          .eq('company_id', state)
          .eq('integration_type', 'salesforce')
        
        if (statusError) {
          console.error('Failed to update integration status:', statusError)
        }
        
        // Store success status in oauth_callbacks table for app polling
        await supabase
          .from('oauth_callbacks')
          .insert({
            company_id: state,
            auth_code: authCode,
            error: null,
            error_description: null,
            consumed: false,
            expires_at: new Date(Date.now() + 5 * 60 * 1000).toISOString() // 5 minutes
          })
        
        tokenExchangeSuccess = true
        console.log('Direct token exchange completed successfully')
        
      } catch (exchangeError) {
        console.error('Token exchange error:', exchangeError)
        tokenExchangeError = exchangeError.message || 'Unknown error'
      }
    }

    // Create a user-friendly success/error page
    let htmlContent = ''
    
    if (tokenExchangeSuccess) {
      htmlContent = `
        <!DOCTYPE html>
        <html lang="en">
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Salesforce Connected Successfully</title>
          <style>
            body { font-family: Arial, sans-serif; text-align: center; padding: 50px; background: #f5f5f5; }
            .container { max-width: 500px; margin: 0 auto; background: white; padding: 40px; border-radius: 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
            .success { color: #28a745; font-size: 24px; margin-bottom: 20px; }
            .instructions { color: #666; line-height: 1.6; }
            .close-btn { background: #007bff; color: white; border: none; padding: 12px 24px; border-radius: 5px; font-size: 16px; cursor: pointer; margin-top: 20px; }
            .close-btn:hover { background: #0056b3; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="success">✅ Salesforce Connected Successfully!</div>
            <div class="instructions">
              <p>Your Salesforce account has been connected to the Aviation Quality Control App.</p>
              <p><strong>Integration is now active and ready to use.</strong></p>
              <p>You can now close this browser window and return to the app.</p>
            </div>
            <button class="close-btn" onclick="window.close()">Close Window</button>
          </div>
        </body>
        </html>
      `
    } else if (error || tokenExchangeError) {
      htmlContent = `
        <!DOCTYPE html>
        <html lang="en">
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Salesforce Connection Error</title>
          <style>
            body { font-family: Arial, sans-serif; text-align: center; padding: 50px; background: #f5f5f5; }
            .container { max-width: 500px; margin: 0 auto; background: white; padding: 40px; border-radius: 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
            .error { color: #dc3545; font-size: 24px; margin-bottom: 20px; }
            .instructions { color: #666; line-height: 1.6; }
            .close-btn { background: #6c757d; color: white; border: none; padding: 12px 24px; border-radius: 5px; font-size: 16px; cursor: pointer; margin-top: 20px; }
            .close-btn:hover { background: #545b62; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="error">❌ Connection Failed</div>
            <div class="instructions">
              <p><strong>Error:</strong> ${error || tokenExchangeError}</p>
              ${errorDescription ? `<p><strong>Details:</strong> ${errorDescription}</p>` : ''}
              ${tokenExchangeError ? `<p><strong>Token Exchange Error:</strong> ${tokenExchangeError}</p>` : ''}
              <p>Please close this window and try connecting again from the app.</p>
            </div>
            <button class="close-btn" onclick="window.close()">Close Window</button>
          </div>
        </body>
        </html>
      `
    }

    console.log('Returning HTML success page')

    // Return the HTML page with proper headers
    return new Response(htmlContent, {
      status: 200,
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0',
        'X-Content-Type-Options': 'nosniff',
        'X-Frame-Options': 'DENY',
        ...corsHeaders
      }
    })
  } catch (error) {
    console.error('[OAuth Callback] Error:', error)

    // Error fallback
    const deepLink = `AviationQualityControlApp://oauth/error?error=callback_error`
    return new Response(null, {
      status: 302,
      headers: {
        'Location': deepLink,
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0'
      }
    })
  }
})
