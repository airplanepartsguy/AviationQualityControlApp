-- Create table for storing OAuth callback data temporarily
CREATE TABLE IF NOT EXISTS oauth_callbacks (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id TEXT NOT NULL,
  auth_code TEXT,
  error TEXT,
  error_description TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
  consumed BOOLEAN DEFAULT FALSE
);

-- Add index for efficient lookups
CREATE INDEX IF NOT EXISTS idx_oauth_callbacks_company_id ON oauth_callbacks(company_id);
CREATE INDEX IF NOT EXISTS idx_oauth_callbacks_expires_at ON oauth_callbacks(expires_at);

-- Add RLS policy
ALTER TABLE oauth_callbacks ENABLE ROW LEVEL SECURITY;

-- Policy: Allow service role to manage all records
CREATE POLICY "Service role can manage oauth callbacks" ON oauth_callbacks
  FOR ALL USING (auth.role() = 'service_role');

-- Policy: Allow authenticated users to read their company's callbacks
CREATE POLICY "Users can read own company oauth callbacks" ON oauth_callbacks
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM profiles 
      WHERE profiles.id = auth.uid() 
      AND profiles.company_id = oauth_callbacks.company_id
    )
  );

-- Function to clean up expired callbacks
CREATE OR REPLACE FUNCTION cleanup_expired_oauth_callbacks()
RETURNS void AS $$
BEGIN
  DELETE FROM oauth_callbacks 
  WHERE expires_at < NOW() OR consumed = TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Schedule cleanup to run every 10 minutes
SELECT cron.schedule('cleanup-oauth-callbacks', '*/10 * * * *', 'SELECT cleanup_expired_oauth_callbacks();');
