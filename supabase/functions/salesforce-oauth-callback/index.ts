import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS, PUT, DELETE',
}

serve(async (req) => {
  console.log('=== OAUTH CALLBACK - COMPLETE TOKEN EXCHANGE ===')
  console.log('Method:', req.method)
  console.log('URL:', req.url)
  console.log('User-Agent:', req.headers.get('user-agent'))
  
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders, status: 200 })
  }

  try {
    const url = new URL(req.url)
    const authCode = url.searchParams.get('code')
    const state = url.searchParams.get('state') // This is the company_id
    const error = url.searchParams.get('error')
    const errorDescription = url.searchParams.get('error_description')

    console.log('OAuth Parameters:', { 
      hasCode: !!authCode, 
      codeLength: authCode?.length,
      state, 
      hasError: !!error,
      errorType: error
    })

    // Get environment variables
    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    
    console.log('Environment check:', {
      hasUrl: !!supabaseUrl,
      hasServiceKey: !!supabaseServiceKey,
      urlDomain: supabaseUrl?.split('/')[2]
    })
    
    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error('Missing Supabase configuration')
    }

    // Create Supabase client with service role
    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    })

    console.log('Supabase client created successfully')

    // Handle OAuth error from Salesforce
    if (error) {
      console.log('OAuth error from Salesforce:', { error, errorDescription })
      
      // Store error in database for debugging
      try {
        await supabase
          .from('oauth_callbacks')
          .insert({
            company_id: state || 'unknown',
            auth_code: null,
            error: error,
            error_description: errorDescription,
            consumed: false,
            expires_at: new Date(Date.now() + 5 * 60 * 1000).toISOString()
          })
        console.log('Error callback stored in database')
      } catch (dbError) {
        console.error('Failed to store error callback:', dbError)
      }
      
      return new Response(`<!DOCTYPE html>
<html><head><title>OAuth Error</title><meta charset="utf-8"></head>
<body style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; text-align: center; padding: 50px; background: linear-gradient(135deg, #fff5f5, #ffe8e8);">
  <div style="max-width: 500px; margin: 0 auto; background: white; padding: 40px; border-radius: 12px; box-shadow: 0 4px 20px rgba(0,0,0,0.1); border-top: 4px solid #dc3545;">
    <div style="font-size: 48px; margin-bottom: 20px;">❌</div>
    <h2 style="color: #dc3545; margin-bottom: 20px;">Salesforce Connection Failed</h2>
    <div style="background: #f8f9fa; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #dc3545;">
      <p style="margin: 0; color: #495057;"><strong>Error:</strong> ${error}</p>
      ${errorDescription ? `<p style="margin: 10px 0 0 0; color: #6c757d; font-size: 14px;">${errorDescription}</p>` : ''}
    </div>
    <p style="color: #6c757d; margin: 20px 0;">Please return to the app and try connecting to Salesforce again. If the problem persists, contact support.</p>
    <button onclick="window.close()" style="background: #dc3545; color: white; border: none; padding: 12px 24px; border-radius: 6px; font-size: 16px; cursor: pointer; transition: background 0.2s;">Close Window</button>
  </div>
</body></html>`, {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'text/html; charset=utf-8' }
      })
    }

    // Handle successful OAuth callback - COMPLETE TOKEN EXCHANGE
    if (authCode && state) {
      console.log('Processing successful OAuth callback for company:', state)
      
      let callbackStored = false
      let tokenExchangeSuccessful = false
      let statusMessage = 'Processing OAuth callback...'
      
      // Store the callback data in Supabase first
      try {
        console.log('Attempting to store OAuth callback in database...')
        
        const { error: insertError } = await supabase
          .from('oauth_callbacks')
          .insert({
            company_id: state,
            auth_code: authCode,
            error: null,
            error_description: null,
            consumed: false,
            expires_at: new Date(Date.now() + 5 * 60 * 1000).toISOString()
          })

        if (insertError) {
          console.error('Database insert error:', insertError)
          statusMessage = `Storage error: ${insertError.message}`
        } else {
          callbackStored = true
          console.log('✅ OAuth callback stored successfully in database')
          statusMessage = 'Callback stored, exchanging for tokens...'
        }
      } catch (dbError) {
        console.error('Database storage exception:', dbError)
        statusMessage = `Storage exception: ${dbError.message}`
      }

      // NOW EXCHANGE THE AUTH CODE FOR TOKENS
      if (callbackStored) {
        try {
          console.log('🔄 Starting token exchange process...')
          
          // Get the company integration to retrieve OAuth config
          const { data: integration, error: integrationError } = await supabase
            .from('company_integrations')
            .select('config')
            .eq('company_id', state)
            .eq('integration_type', 'salesforce')
            .single()
            
          if (integrationError || !integration) {
            throw new Error(`No Salesforce integration found: ${integrationError?.message}`)
          }
          
          const config = integration.config as any
          if (!config.client_id || !config.client_secret || !config.instance_url) {
            throw new Error('Incomplete Salesforce configuration')
          }
          
          // Get PKCE code verifier from oauth_state table
          console.log('🔍 Looking for PKCE code verifier in oauth_state table...')
          console.log('Query parameters:', { company_id: state, integration_type: 'salesforce' })
          
          let { data: oauthState, error: stateError } = await supabase
            .from('oauth_state')
            .select('*')
            .eq('company_id', state)
            .eq('integration_type', 'salesforce')
            .single()
            
          console.log('OAuth state query result:', { 
            hasData: !!oauthState, 
            error: stateError?.message,
            codeVerifierLength: oauthState?.code_verifier?.length,
            expiresAt: oauthState?.expires_at
          })
          
          // ENHANCED: Try to find ANY oauth_state record for this company if single query fails
          if (stateError || !oauthState?.code_verifier) {
            console.log('🔍 Single query failed, searching for ANY oauth_state records...')
            
            const { data: allStates, error: allStatesError } = await supabase
              .from('oauth_state')
              .select('*')
              .eq('company_id', state)
              .eq('integration_type', 'salesforce')
              .order('created_at', { ascending: false })
            
            console.log('All oauth_state records found:', {
              count: allStates?.length || 0,
              records: allStates?.map(s => ({
                id: s.id.substring(0, 8) + '...',
                created_at: s.created_at,
                expires_at: s.expires_at,
                hasCodeVerifier: !!s.code_verifier,
                verifierLength: s.code_verifier?.length
              }))
            })
            
            // Try to use the most recent valid record
            const validState = allStates?.find(s => s.code_verifier && new Date(s.expires_at) > new Date())
            
            if (validState) {
              console.log('✅ Found valid oauth_state record, using it:', {
                id: validState.id.substring(0, 8) + '...',
                created_at: validState.created_at,
                expires_at: validState.expires_at,
                verifierLength: validState.code_verifier.length
              })
              
              // Use this state
              oauthState = validState
              stateError = null
            } else {
              const errorMsg = `CRITICAL: No valid PKCE code verifier found for company ${state}. 
                Original error: ${stateError?.message || 'No single record'}
                Total records found: ${allStates?.length || 0}
                Valid records: ${allStates?.filter(s => s.code_verifier && new Date(s.expires_at) > new Date()).length || 0}
                Cannot proceed with token exchange.`
              console.error(errorMsg)
              
              // Store detailed error for debugging
              await supabase.from('oauth_callbacks').update({
                error: 'pkce_not_found',
                error_description: `No PKCE verifier found. Records: ${allStates?.length || 0}`
              }).eq('company_id', state).eq('consumed', false)
              
              throw new Error(errorMsg)
            }
          }
          
          const codeVerifier = oauthState.code_verifier
          console.log('✅ Found PKCE code verifier:', {
            company_id: state,
            verifierLength: codeVerifier.length,
            verifierPreview: codeVerifier.substring(0, 10) + '...',
            storedAt: oauthState.created_at,
            expiresAt: oauthState.expires_at
          })
          
          // Determine OAuth base URL
          const baseUrl = config.sandbox ? 'https://test.salesforce.com' : 'https://login.salesforce.com'
          const tokenUrl = `${baseUrl}/services/oauth2/token`
          const redirectUri = `${supabaseUrl}/functions/v1/salesforce-oauth-callback`
          
          console.log('Token exchange details:', {
            tokenUrl,
            redirectUri,
            hasCodeVerifier: !!codeVerifier,
            sandbox: config.sandbox
          })
          
          // Prepare token request
          const tokenRequestBody = new URLSearchParams({
            grant_type: 'authorization_code',
            client_id: config.client_id,
            client_secret: config.client_secret,
            redirect_uri: redirectUri,
            code: authCode
          })
          
          // Add PKCE if available
          if (codeVerifier) {
            tokenRequestBody.append('code_verifier', codeVerifier)
          }
          
          console.log('🚀 Exchanging auth code for tokens...')
          
          // Exchange authorization code for tokens
          const tokenResponse = await fetch(tokenUrl, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/x-www-form-urlencoded',
              'Accept': 'application/json'
            },
            body: tokenRequestBody
          })
          
          const responseText = await tokenResponse.text()
          console.log('Token response status:', tokenResponse.status)
          console.log('Token response:', responseText.substring(0, 200) + '...')
          
          if (!tokenResponse.ok) {
            // ENHANCED: Better error handling for token exchange failures
            let errorDetails = `Token exchange failed: ${tokenResponse.status} ${responseText}`
            
            try {
              const errorJson = JSON.parse(responseText)
              if (errorJson.error) {
                errorDetails = `${errorJson.error}: ${errorJson.error_description || 'No description'}`
              }
            } catch (parseError) {
              // Response is not JSON, use as-is
            }
            
            console.error('❌ Token exchange failed:', errorDetails)
            
            // Store detailed error in callback for debugging
            await supabase.from('oauth_callbacks').update({
              error: 'token_exchange_failed',
              error_description: errorDetails
            }).eq('company_id', state).eq('consumed', false)
            
            throw new Error(errorDetails)
          }
          
          let tokens
          try {
            tokens = JSON.parse(responseText)
          } catch (parseError) {
            const errorMsg = `Invalid JSON response from Salesforce: ${responseText.substring(0, 200)}`
            console.error('❌ JSON parse error:', errorMsg)
            
            await supabase.from('oauth_callbacks').update({
              error: 'invalid_json_response',
              error_description: errorMsg
            }).eq('company_id', state).eq('consumed', false)
            
            throw new Error(errorMsg)
          }
          
          if (!tokens.access_token) {
            const errorMsg = `No access token in response: ${JSON.stringify(tokens)}`
            console.error('❌ Missing access token:', errorMsg)
            
            await supabase.from('oauth_callbacks').update({
              error: 'missing_access_token',
              error_description: errorMsg
            }).eq('company_id', state).eq('consumed', false)
            
            throw new Error(errorMsg)
          }
          
          console.log('✅ Tokens received successfully:', {
            hasAccessToken: !!tokens.access_token,
            hasRefreshToken: !!tokens.refresh_token,
            instanceUrl: tokens.instance_url,
            tokenType: tokens.token_type
          })
          
          // Update company integration with tokens and set status to active
          const updatedConfig = {
            ...config,
            access_token: tokens.access_token,
            refresh_token: tokens.refresh_token,
            instance_url: tokens.instance_url || config.instance_url,
            token_type: tokens.token_type,
            token_expires_at: new Date(Date.now() + (tokens.expires_in || 3600) * 1000).toISOString(),
            token_received_at: new Date().toISOString()
          }
          
          const { error: updateError } = await supabase
            .from('company_integrations')
            .update({
              config: updatedConfig,
              status: 'active',
              last_test_at: new Date().toISOString(),
              error_message: null
            })
            .eq('company_id', state)
            .eq('integration_type', 'salesforce')
          
          if (updateError) {
            throw new Error(`Failed to update integration: ${updateError.message}`)
          }
          
          console.log('✅ Integration status updated to ACTIVE')
          
          // Clean up oauth_state
          await supabase
            .from('oauth_state')
            .delete()
            .eq('company_id', state)
            .eq('integration_type', 'salesforce')
          
          // Mark callback as consumed
          await supabase
            .from('oauth_callbacks')
            .update({ consumed: true })
            .eq('company_id', state)
            .eq('consumed', false)
          
          tokenExchangeSuccessful = true
          statusMessage = 'OAuth tokens received and stored successfully!'
          
        } catch (tokenError) {
          console.error('❌ Token exchange failed:', tokenError)
          statusMessage = `Token exchange failed: ${tokenError.message}`
        }
      }
      
      // Return success page with detailed status
      return new Response(`<!DOCTYPE html>
<html><head><title>Salesforce Connected Successfully</title><meta charset="utf-8"></head>
<body style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; text-align: center; padding: 50px; background: linear-gradient(135deg, #f0f8ff, #e6f3ff);">
  <div style="max-width: 500px; margin: 0 auto; background: white; padding: 40px; border-radius: 12px; box-shadow: 0 4px 20px rgba(0,0,0,0.1); border-top: 4px solid #28a745;">
    <div style="font-size: 48px; margin-bottom: 20px;">✅</div>
    <h2 style="color: #28a745; margin-bottom: 20px;">Salesforce ${tokenExchangeSuccessful ? 'Connected' : 'OAuth Callback'} Successfully!</h2>
    <p style="color: #495057; font-size: 16px; line-height: 1.6; margin: 20px 0;">Your Salesforce account has been ${tokenExchangeSuccessful ? 'connected and authenticated with' : 'recognized by'} the Aviation Quality Control App.</p>
    
    <div style="background: #f8f9fa; padding: 20px; border-radius: 8px; margin: 20px 0; ${tokenExchangeSuccessful ? 'border-left: 4px solid #28a745;' : 'border-left: 4px solid #ffc107;'}">
      <div style="display: flex; align-items: center; justify-content: center; gap: 8px; margin-bottom: 10px;">
        <span style="font-size: 20px;">${tokenExchangeSuccessful ? '✅' : '⚠️'}</span>
        <strong style="color: #495057;">Connection Status</strong>
      </div>
      <p style="margin: 0; color: #6c757d; font-size: 14px;">
        ${statusMessage}
        ${tokenExchangeSuccessful 
          ? '<br><br><strong>Status:</strong> Integration is now ACTIVE and ready for data sync.' 
          : '<br><br><strong>Status:</strong> OAuth callback received, but token exchange may need to be completed in the app.'
        }
      </p>
    </div>
    
    <p style="color: #6c757d; margin: 30px 0 20px 0;"><strong>You can now close this window and return to the app.</strong></p>
    
    <button onclick="window.close()" style="background: linear-gradient(135deg, #007bff, #0056b3); color: white; border: none; padding: 14px 28px; border-radius: 6px; font-size: 16px; font-weight: 600; cursor: pointer; transition: transform 0.2s, box-shadow 0.2s; box-shadow: 0 2px 8px rgba(0,123,255,0.3);" onmouseover="this.style.transform='translateY(-2px)'; this.style.boxShadow='0 4px 12px rgba(0,123,255,0.4)'" onmouseout="this.style.transform='translateY(0)'; this.style.boxShadow='0 2px 8px rgba(0,123,255,0.3)'">Close Window</button>
    
    <div style="margin-top: 30px; padding: 15px; background: #e9ecef; border-radius: 8px;">
      <p style="margin: 0; color: #6c757d; font-size: 12px;">
        <strong>Next Steps:</strong> ${tokenExchangeSuccessful 
          ? 'Return to the ERP screen in the app to start syncing your inspection data with Salesforce.' 
          : 'Return to the app and check the connection status in the ERP screen.'
        }
      </p>
    </div>
  </div>
</body></html>`, {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'text/html; charset=utf-8' }
      })
    }

    // Handle unexpected callback (no code or error)
    console.log('Unexpected callback - missing required parameters')
    return new Response(`<!DOCTYPE html>
<html><head><title>OAuth Callback Received</title><meta charset="utf-8"></head>
<body style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; text-align: center; padding: 50px; background: linear-gradient(135deg, #f8f9fa, #e9ecef);">
  <div style="max-width: 500px; margin: 0 auto; background: white; padding: 40px; border-radius: 12px; box-shadow: 0 4px 20px rgba(0,0,0,0.1); border-top: 4px solid #6c757d;">
    <div style="font-size: 48px; margin-bottom: 20px;">ℹ️</div>
    <h2 style="color: #6c757d; margin-bottom: 20px;">OAuth Callback Received</h2>
    <p style="color: #495057; font-size: 16px; line-height: 1.6; margin: 20px 0;">The OAuth callback was received but is missing required parameters.</p>
    <p style="color: #6c757d; margin: 20px 0;">Please return to the app and try connecting to Salesforce again.</p>
    <button onclick="window.close()" style="background: #6c757d; color: white; border: none; padding: 12px 24px; border-radius: 6px; font-size: 16px; cursor: pointer; transition: background 0.2s;">Close Window</button>
  </div>
</body></html>`, {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'text/html; charset=utf-8' }
    })
    
  } catch (error) {
    console.error('❌ Function error:', error)
    console.error('Error stack:', error.stack)
    
    return new Response(`<!DOCTYPE html>
<html><head><title>Function Error</title><meta charset="utf-8"></head>
<body style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; text-align: center; padding: 50px; background: linear-gradient(135deg, #fff5f5, #ffe8e8);">
  <div style="max-width: 500px; margin: 0 auto; background: white; padding: 40px; border-radius: 12px; box-shadow: 0 4px 20px rgba(0,0,0,0.1); border-top: 4px solid #dc3545;">
    <div style="font-size: 48px; margin-bottom: 20px;">🚨</div>
    <h2 style="color: #dc3545; margin-bottom: 20px;">Function Error</h2>
    <div style="background: #f8f9fa; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #dc3545;">
      <p style="margin: 0; color: #495057; font-family: monospace; font-size: 14px; word-break: break-word;"><strong>Error:</strong> ${error.message}</p>
    </div>
    <p style="color: #6c757d; margin: 20px 0;">Please close this window and contact support if the issue persists. Include the error message above when reporting the issue.</p>
    <button onclick="window.close()" style="background: #dc3545; color: white; border: none; padding: 12px 24px; border-radius: 6px; font-size: 16px; cursor: pointer; transition: background 0.2s;">Close Window</button>
  </div>
</body></html>`, {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'text/html; charset=utf-8' }
    })
  }
})
