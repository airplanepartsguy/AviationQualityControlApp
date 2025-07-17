// Follow this setup guide to integrate the Deno language server with your editor:
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';
serve(async (req)=>{
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', {
      headers: corsHeaders
    });
  }
  try {
    // Create a Supabase client with the user's authorization
    const supabaseClient = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_ANON_KEY') ?? '', {
      global: {
        headers: {
          Authorization: req.headers.get('Authorization')
        }
      }
    });
    // Get the user from the token
    const { data: { user } } = await supabaseClient.auth.getUser();
    if (!user) {
      return new Response(JSON.stringify({
        error: 'Unauthorized'
      }), {
        status: 401,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json'
        }
      });
    }
    // Create a Supabase admin client to perform privileged operations
    const supabaseAdmin = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '');
    // Get the inviting user's profile to verify they are an admin
    const { data: profile, error: profileError } = await supabaseAdmin.from('profiles').select('company_id, role').eq('id', user.id).single();
    if (profileError || !profile || profile.role !== 'admin') {
      return new Response(JSON.stringify({
        error: 'Forbidden: Not an admin.'
      }), {
        status: 403,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json'
        }
      });
    }
    const { company_id } = profile;
    const { email, role } = await req.json();
    if (!email || !role) {
      return new Response(JSON.stringify({
        error: 'Email and role are required.'
      }), {
        status: 400,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json'
        }
      });
    }
    // Check license limit before proceeding
    const { data: license, error: licenseError } = await supabaseAdmin.from('licenses').select('license_count').eq('company_id', company_id).single();
    if (licenseError || !license) {
      return new Response(JSON.stringify({
        error: 'Could not verify company license.'
      }), {
        status: 500,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json'
        }
      });
    }
    const { count: userCount } = await supabaseAdmin.from('profiles').select('*', {
      count: 'exact',
      head: true
    }).eq('company_id', company_id);
    const { count: invitationCount } = await supabaseAdmin.from('invitations').select('*', {
      count: 'exact',
      head: true
    }).eq('company_id', company_id);
    if ((userCount ?? 0) + (invitationCount ?? 0) >= license.license_count) {
      return new Response(JSON.stringify({
        error: 'License limit reached. Cannot invite more users.'
      }), {
        status: 403,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json'
        }
      });
    }
    // Proceed with sending the invitation
    const { data: inviteData, error: inviteError } = await supabaseAdmin.auth.admin.inviteUserByEmail(email, {
      data: {
        role: role
      }
    });
    if (inviteError) throw inviteError;
    // Log the invitation in our public table for tracking
    await supabaseAdmin.from('invitations').insert({
      company_id: company_id,
      email: email,
      role: role,
      invited_by: user.id
    });
    return new Response(JSON.stringify(inviteData), {
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json'
      },
      status: 200
    });
  } catch (error) {
    return new Response(JSON.stringify({
      error: error.message
    }), {
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json'
      },
      status: 500
    });
  }
}); /* To invoke locally:

  1. Run `supabase start` (see: https://supabase.com/docs/reference/cli/supabase-start)
  2. Make an HTTP request:
  curl -i --location --request POST 'http://127.0.0.1:54321/functions/v1/invite-user' \
    --header 'Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0' \
    --header 'Content-Type: application/json' \
    --data '{"name":"Functions"}'

*/ 
