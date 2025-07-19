// Simple test version to verify HTML rendering
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

serve(async (req) => {
  // Simple HTML test page
  const htmlContent = `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>OAuth Callback Test</title>
      <style>
        body { 
          font-family: Arial, sans-serif; 
          text-align: center; 
          padding: 50px; 
          background: #f5f5f5; 
        }
        .container { 
          max-width: 500px; 
          margin: 0 auto; 
          background: white; 
          padding: 40px; 
          border-radius: 10px; 
          box-shadow: 0 2px 10px rgba(0,0,0,0.1); 
        }
        .success { 
          color: #28a745; 
          font-size: 24px; 
          margin-bottom: 20px; 
        }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="success">✅ HTML Rendering Test</div>
        <p>If you can see this page properly formatted, HTML rendering is working!</p>
        <p>URL Parameters:</p>
        <pre>${new URL(req.url).searchParams.toString()}</pre>
      </div>
    </body>
    </html>
  `

  return new Response(htmlContent, {
    status: 200,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      'Access-Control-Allow-Origin': '*',
    }
  })
})
