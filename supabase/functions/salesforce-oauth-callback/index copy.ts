import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type'
};
serve(async (req)=>{
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', {
      headers: corsHeaders
    });
  }
  try {
    const url = new URL(req.url);
    const authCode = url.searchParams.get('code');
    const state = url.searchParams.get('state') // This is the companyId
    ;
    const error = url.searchParams.get('error');
    const errorDescription = url.searchParams.get('error_description');
    console.log('OAuth callback received:', {
      authCode: authCode ? 'present' : 'missing',
      state,
      error,
      errorDescription
    });
    // Store the callback data in Supabase for the app to retrieve
    if (state) {
      try {
        const supabaseUrl = Deno.env.get('SUPABASE_URL');
        const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
        const supabase = createClient(supabaseUrl, supabaseServiceKey);
        // Store the OAuth callback data
        const { error: dbError } = await supabase.from('oauth_callbacks').insert({
          company_id: state,
          auth_code: authCode,
          error: error,
          error_description: errorDescription,
          consumed: false,
          expires_at: new Date(Date.now() + 5 * 60 * 1000).toISOString() // 5 minutes
        });
        if (dbError) {
          console.error('Error storing OAuth callback:', dbError);
        } else {
          console.log('OAuth callback stored successfully for company:', state);
        }
      } catch (dbError) {
        console.error('Database error:', dbError);
      }
    }
    // Create a user-friendly success/error page
    let htmlContent = '';
    if (authCode && state) {
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
              <p><strong>You can now close this browser window and return to the app.</strong></p>
              <p>The connection will be automatically detected by the app.</p>
            </div>
            <button class="close-btn" onclick="window.close()">Close Window</button>
          </div>
        </body>
        </html>
      `;
    } else if (error) {
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
              <p><strong>Error:</strong> ${error}</p>
              ${errorDescription ? `<p><strong>Details:</strong> ${errorDescription}</p>` : ''}
              <p>Please close this window and try connecting again from the app.</p>
            </div>
            <button class="close-btn" onclick="window.close()">Close Window</button>
          </div>
        </body>
        </html>
      `;
    }
    console.log('Returning HTML success page');
    // Return the HTML page
    return new Response(htmlContent, {
      status: 200,
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0',
        ...corsHeaders
      }
    });
  } catch (error) {
    console.error('[OAuth Callback] Error:', error);
    // Error fallback
    const deepLink = `AviationQualityControlApp://oauth/error?error=callback_error`;
    return new Response(null, {
      status: 302,
      headers: {
        'Location': deepLink,
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0'
      }
    });
  }
});
