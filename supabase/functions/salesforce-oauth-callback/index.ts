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
        
        // Get stored PKCE code verifier from oauth_state table
        console.log('Querying oauth_state table for company_id:', state)
        const { data: oauthState, error: stateError } = await supabase
          .from('oauth_state')
          .select('*')
          .eq('company_id', state)
          .eq('integration_type', 'salesforce')
          .order('created_at', { ascending: false })
          .limit(1)
          .single()
        
        console.log('OAuth state query result:', { oauthState, stateError })
        
        if (stateError || !oauthState) {
          console.error('Failed to retrieve PKCE code verifier:', stateError)
          throw new Error('PKCE code verifier not found. Please try the OAuth flow again.')
        }
        
        const codeVerifier = oauthState.code_verifier
        if (!codeVerifier) {
          console.error('Code verifier is empty in oauth_state:', oauthState)
          throw new Error('PKCE code verifier is empty. Please try the OAuth flow again.')
        }
        
        console.log('Retrieved PKCE code verifier successfully, length:', codeVerifier.length)
        console.log('Code verifier (first 20 chars):', codeVerifier.substring(0, 20) + '...')
        
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

    // Return simple HTML pages that work on mobile browsers
    // Keep the existing polling approach - it's simpler and more reliable
    
    let htmlContent = ''
    
    if (tokenExchangeSuccess) {
      console.log('OAuth success - returning HTML success page')
      htmlContent = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Success</title>
  <style>
    body { font-family: Arial, sans-serif; text-align: center; padding: 20px; background: #f0f8ff; }
    .container { max-width: 400px; margin: 0 auto; background: white; padding: 30px; border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.1); }
    .success { color: #28a745; font-size: 20px; margin-bottom: 15px; }
    .message { color: #333; line-height: 1.5; }
    .close-btn { background: #007bff; color: white; border: none; padding: 10px 20px; border-radius: 4px; font-size: 14px; cursor: pointer; margin-top: 15px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="success">✅ Connected Successfully!</div>
    <div class="message">
      <p>Salesforce has been connected to your Aviation Quality Control App.</p>
      <p><strong>You can now close this window and return to the app.</strong></p>
    </div>
    <button class="close-btn" onclick="window.close()">Close Window</button>
  </div>
</body>
</html>`
    } else if (error || tokenExchangeError) {
      console.log('OAuth error - returning HTML error page')
      const errorMsg = error || tokenExchangeError || 'Unknown error'
      htmlContent = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Connection Error</title>
  <style>
    body { font-family: Arial, sans-serif; text-align: center; padding: 20px; background: #fff5f5; }
    .container { max-width: 400px; margin: 0 auto; background: white; padding: 30px; border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.1); }
    .error { color: #dc3545; font-size: 20px; margin-bottom: 15px; }
    .message { color: #333; line-height: 1.5; }
    .close-btn { background: #6c757d; color: white; border: none; padding: 10px 20px; border-radius: 4px; font-size: 14px; cursor: pointer; margin-top: 15px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="error">❌ Connection Failed</div>
    <div class="message">
      <p><strong>Error:</strong> ${errorMsg}</p>
      <p>Please close this window and try connecting again from the app.</p>
    </div>
    <button class="close-btn" onclick="window.close()">Close Window</button>
  </div>
</body>
</html>`
    } else {
      console.log('Unexpected OAuth callback state')
      htmlContent = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>OAuth Callback</title>
  <style>
    body { font-family: Arial, sans-serif; text-align: center; padding: 20px; background: #f8f9fa; }
    .container { max-width: 400px; margin: 0 auto; background: white; padding: 30px; border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.1); }
    .message { color: #333; line-height: 1.5; }
    .close-btn { background: #6c757d; color: white; border: none; padding: 10px 20px; border-radius: 4px; font-size: 14px; cursor: pointer; margin-top: 15px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="message">
      <p>OAuth callback received. Please return to the app.</p>
    </div>
    <button class="close-btn" onclick="window.close()">Close Window</button>
  </div>
</body>
</html>`
    }

    return new Response(htmlContent, {
      status: 200,
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0',
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
