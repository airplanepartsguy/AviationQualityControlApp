import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS, PUT, DELETE',
}

serve(async (req) => {
  console.log('=== REFRESH SALESFORCE TOKEN ===')
  console.log('Method:', req.method)
  console.log('Timestamp:', new Date().toISOString())
  
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders, status: 200 })
  }

  try {
    // Get environment variables
    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    
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

    // Get request body
    const { company_id } = await req.json()
    
    if (!company_id) {
      throw new Error('Missing company_id in request body')
    }
    
    console.log('Refreshing token for company:', company_id)

    // Get current token from oauth_tokens table
    const { data: tokenData, error: tokenError } = await supabase
      .from('oauth_tokens')
      .select('*')
      .eq('company_id', company_id)
      .eq('integration_type', 'salesforce')
      .single()
    
    if (tokenError || !tokenData) {
      throw new Error(`No Salesforce token found for company: ${tokenError?.message}`)
    }
    
    if (!tokenData.refresh_token) {
      throw new Error('No refresh token available')
    }
    
    console.log('Found existing token, expires at:', tokenData.expires_at)
    
    // Get Salesforce configuration
    const { data: integration, error: integrationError } = await supabase
      .from('company_integrations')
      .select('config')
      .eq('company_id', company_id)
      .eq('integration_type', 'salesforce')
      .single()
    
    if (integrationError || !integration) {
      throw new Error(`No Salesforce integration found: ${integrationError?.message}`)
    }
    
    const config = integration.config as any
    if (!config.client_id || !config.client_secret) {
      throw new Error('Incomplete Salesforce configuration')
    }
    
    // Determine OAuth base URL
    const baseUrl = config.sandbox ? 'https://test.salesforce.com' : 'https://login.salesforce.com'
    const tokenUrl = `${baseUrl}/services/oauth2/token`
    
    console.log('Refreshing token with Salesforce...')
    
    // Refresh the token
    const refreshResponse = await fetch(tokenUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Accept': 'application/json'
      },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        client_id: config.client_id,
        client_secret: config.client_secret,
        refresh_token: tokenData.refresh_token
      })
    })
    
    const responseText = await refreshResponse.text()
    console.log('Refresh response status:', refreshResponse.status)
    
    if (!refreshResponse.ok) {
      let errorDetails = `Token refresh failed: ${refreshResponse.status} ${responseText}`
      
      try {
        const errorJson = JSON.parse(responseText)
        if (errorJson.error) {
          errorDetails = `${errorJson.error}: ${errorJson.error_description || 'No description'}`
        }
      } catch (parseError) {
        // Response is not JSON, use as-is
      }
      
      console.error('❌ Token refresh failed:', errorDetails)
      throw new Error(errorDetails)
    }
    
    let newTokens
    try {
      newTokens = JSON.parse(responseText)
    } catch (parseError) {
      throw new Error(`Invalid JSON response from Salesforce: ${responseText.substring(0, 200)}`)
    }
    
    if (!newTokens.access_token) {
      throw new Error('No access token in refresh response')
    }
    
    console.log('✅ Token refreshed successfully')
    
    // Update oauth_tokens table with new token
    const updatedTokenData = {
      access_token: newTokens.access_token,
      // Salesforce may return a new refresh token, use it if provided
      refresh_token: newTokens.refresh_token || tokenData.refresh_token,
      instance_url: newTokens.instance_url || tokenData.instance_url,
      token_data: {
        ...tokenData.token_data,
        token_type: newTokens.token_type || tokenData.token_data?.token_type,
        expires_in: newTokens.expires_in,
        refreshed_at: new Date().toISOString(),
        scope: newTokens.scope || tokenData.token_data?.scope
      },
      expires_at: new Date(Date.now() + (newTokens.expires_in || 3600) * 1000).toISOString(),
      updated_at: new Date().toISOString()
    }
    
    const { error: updateError } = await supabase
      .from('oauth_tokens')
      .update(updatedTokenData)
      .eq('company_id', company_id)
      .eq('integration_type', 'salesforce')
    
    if (updateError) {
      console.error('Failed to update oauth_tokens:', updateError)
      throw new Error(`Failed to store refreshed token: ${updateError.message}`)
    }
    
    // Also update company_integrations for backward compatibility
    const { error: integrationUpdateError } = await supabase
      .from('company_integrations')
      .update({
        config: {
          ...config,
          access_token: newTokens.access_token,
          refresh_token: newTokens.refresh_token || config.refresh_token,
          instance_url: newTokens.instance_url || config.instance_url,
          token_type: newTokens.token_type,
          token_expires_at: new Date(Date.now() + (newTokens.expires_in || 3600) * 1000).toISOString(),
          token_refreshed_at: new Date().toISOString()
        },
        last_test_at: new Date().toISOString()
      })
      .eq('company_id', company_id)
      .eq('integration_type', 'salesforce')
    
    if (integrationUpdateError) {
      console.error('Failed to update company_integrations:', integrationUpdateError)
      // Don't throw here, as the main token update succeeded
    }
    
    console.log('✅ Token refresh completed successfully')
    
    return new Response(
      JSON.stringify({
        success: true,
        access_token: newTokens.access_token,
        expires_at: updatedTokenData.expires_at,
        instance_url: updatedTokenData.instance_url
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200
      }
    )
    
  } catch (error) {
    console.error('❌ Function error:', error)
    
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message || 'Unknown error'
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400
      }
    )
  }
})