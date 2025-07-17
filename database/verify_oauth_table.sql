-- Verify oauth_callbacks table exists and check RLS policies
-- Run this to diagnose the database issue

-- Check if table exists
SELECT EXISTS (
   SELECT FROM information_schema.tables 
   WHERE  table_schema = 'public'
   AND    table_name   = 'oauth_callbacks'
);

-- Check RLS status
SELECT schemaname, tablename, rowsecurity 
FROM pg_tables 
WHERE tablename = 'oauth_callbacks';

-- Check existing policies
SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual 
FROM pg_policies 
WHERE tablename = 'oauth_callbacks';

-- If table doesn't exist, create it
CREATE TABLE IF NOT EXISTS oauth_callbacks (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    company_id UUID NOT NULL,
    auth_code TEXT,
    error TEXT,
    error_description TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    expires_at TIMESTAMPTZ NOT NULL,
    consumed_at TIMESTAMPTZ
);

-- Enable RLS
ALTER TABLE oauth_callbacks ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist (to avoid conflicts)
DROP POLICY IF EXISTS "Allow anonymous OAuth callback inserts" ON oauth_callbacks;
DROP POLICY IF EXISTS "Allow anonymous OAuth callback selects" ON oauth_callbacks;
DROP POLICY IF EXISTS "Allow anonymous OAuth callback updates" ON oauth_callbacks;

-- Create new policies for anon role
CREATE POLICY "Allow anonymous OAuth callback inserts" ON oauth_callbacks
  FOR INSERT 
  TO anon
  WITH CHECK (true);

CREATE POLICY "Allow anonymous OAuth callback selects" ON oauth_callbacks
  FOR SELECT 
  TO anon
  USING (true);

CREATE POLICY "Allow anonymous OAuth callback updates" ON oauth_callbacks
  FOR UPDATE 
  TO anon
  USING (true)
  WITH CHECK (true);
