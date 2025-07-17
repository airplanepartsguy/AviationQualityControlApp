-- Fix RLS policies for oauth_callbacks table to allow Edge Function access
-- This allows the Salesforce OAuth callback Edge Function to insert callback data

-- First, check if the table exists and has RLS enabled
-- If RLS is enabled, we need to create policies that allow the anon role to insert

-- Allow anonymous inserts for OAuth callbacks (Edge Function uses anon key)
CREATE POLICY "Allow anonymous OAuth callback inserts" ON oauth_callbacks
  FOR INSERT 
  TO anon
  WITH CHECK (true);

-- Allow anonymous selects for OAuth callbacks (for retrieving callback data)
CREATE POLICY "Allow anonymous OAuth callback selects" ON oauth_callbacks
  FOR SELECT 
  TO anon
  USING (true);

-- Allow anonymous updates for OAuth callbacks (for marking as consumed)
CREATE POLICY "Allow anonymous OAuth callback updates" ON oauth_callbacks
  FOR UPDATE 
  TO anon
  USING (true)
  WITH CHECK (true);

-- Note: These policies are permissive for OAuth callbacks since they contain temporary
-- authorization codes that expire quickly. In production, you might want to add
-- additional restrictions based on IP address or other factors.
