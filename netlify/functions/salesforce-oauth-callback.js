exports.handler = async (event, context) => {
  // Handle CORS preflight
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      },
      body: '',
    };
  }

  try {
    // Extract OAuth parameters
    const { code, state, error } = event.queryStringParameters || {};
    
    console.log('OAuth callback received:', { 
      code: !!code, 
      state, 
      error,
      method: event.httpMethod,
      headers: event.headers
    });

    // Handle OAuth error
    if (error) {
      console.error('OAuth error:', error);
      const errorHtml = `
        <!DOCTYPE html>
        <html lang="en">
        <head>
          <meta charset="utf-8">
          <title>OAuth Error - Aviation QC</title>
          <meta name="viewport" content="width=device-width, initial-scale=1">
          <style>
            body { 
              font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
              max-width: 400px; 
              margin: 50px auto; 
              padding: 20px; 
              text-align: center;
              background: #f8f9fa;
            }
            .card {
              background: white;
              border-radius: 12px;
              padding: 30px;
              box-shadow: 0 2px 10px rgba(0,0,0,0.1);
            }
            .error { color: #dc3545; font-size: 48px; margin-bottom: 20px; }
            h1 { color: #333; margin-bottom: 10px; }
            p { color: #666; line-height: 1.5; margin-bottom: 20px; }
            .button {
              display: inline-block;
              background: #6c757d;
              color: white;
              padding: 12px 24px;
              border-radius: 8px;
              text-decoration: none;
              font-weight: 500;
            }
          </style>
        </head>
        <body>
          <div class="card">
            <div class="error">❌</div>
            <h1>Authorization Failed</h1>
            <p>There was an error connecting your Salesforce account:</p>
            <p><strong>${error}</strong></p>
            <p>Please return to the app and try again.</p>
            <a href="AviationQualityControlApp://oauth/error?error=${encodeURIComponent(error)}" class="button">Return to App</a>
          </div>
        </body>
        </html>
      `;
      
      return {
        statusCode: 200,
        headers: {
          'Content-Type': 'text/html; charset=utf-8',
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          'Pragma': 'no-cache',
          'Expires': '0',
          'X-Content-Type-Options': 'nosniff',
          'Content-Disposition': 'inline',
          'Access-Control-Allow-Origin': '*',
        },
        body: errorHtml,
      };
    }

    // Success case
    if (code && state) {
      console.log('OAuth success - processing callback');
      
      const successHtml = `
        <!DOCTYPE html>
        <html lang="en">
        <head>
          <meta charset="utf-8">
          <title>OAuth Success - Aviation QC</title>
          <meta name="viewport" content="width=device-width, initial-scale=1">
          <style>
            body { 
              font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
              max-width: 400px; 
              margin: 50px auto; 
              padding: 20px; 
              text-align: center;
              background: #f8f9fa;
            }
            .card {
              background: white;
              border-radius: 12px;
              padding: 30px;
              box-shadow: 0 2px 10px rgba(0,0,0,0.1);
            }
            .success { color: #28a745; font-size: 48px; margin-bottom: 20px; }
            h1 { color: #333; margin-bottom: 10px; }
            p { color: #666; line-height: 1.5; margin-bottom: 20px; }
            .button {
              display: inline-block;
              background: #007bff;
              color: white;
              padding: 12px 24px;
              border-radius: 8px;
              text-decoration: none;
              font-weight: 500;
              cursor: pointer;
              border: none;
            }
            .button:hover { background: #0056b3; }
            .debug {
              font-size: 12px;
              color: #999;
              margin-top: 20px;
            }
          </style>
        </head>
        <body>
          <div class="card">
            <div class="success">✅</div>
            <h1>Authorization Successful!</h1>
            <p>Your Salesforce account has been connected successfully.</p>
            <p>You can now return to the Aviation QC app to complete the setup.</p>
            <button onclick="returnToApp()" class="button">Return to App</button>
            <div class="debug">
              <p>State: ${state}</p>
              <p>Code: Present</p>
              <p>Error: None</p>
              <p>Time: ${new Date().toISOString()}</p>
              <p>Function Version: Netlify v1.0</p>
            </div>
          </div>
          <script>
            function returnToApp() {
              window.location.href = 'AviationQualityControlApp://oauth/success?state=${state}&code=${code}';
            }
            // Automatic redirect after 3 seconds
            setTimeout(() => {
              returnToApp();
            }, 3000);
          </script>
        </body>
        </html>
      `;

      return {
        statusCode: 200,
        headers: {
          'Content-Type': 'text/html; charset=utf-8',
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          'Pragma': 'no-cache',
          'Expires': '0',
          'X-Content-Type-Options': 'nosniff',
          'Content-Disposition': 'inline',
          'Access-Control-Allow-Origin': '*',
        },
        body: successHtml,
      };
    }

    // Missing parameters
    return {
      statusCode: 400,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
      body: JSON.stringify({
        error: 'Missing required parameters',
        received: { code: !!code, state: !!state }
      }),
    };

  } catch (error) {
    console.error('Unexpected error:', error);
    return {
      statusCode: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
      body: JSON.stringify({ error: 'Internal server error' }),
    };
  }
};
