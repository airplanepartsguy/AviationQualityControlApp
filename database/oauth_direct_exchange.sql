-- OAuth Direct Exchange Tables
-- These tables support the direct token exchange approach in the Edge Function

-- Table for storing OAuth tokens (replaces SecureStore for server-side access)
CREATE TABLE IF NOT EXISTS oauth_tokens (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    integration_type TEXT NOT NULL,
    access_token TEXT NOT NULL,
    refresh_token TEXT,
    instance_url TEXT,
    token_data JSONB,
    expires_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    UNIQUE(company_id, integration_type)
);

-- Table for storing OAuth state (PKCE code verifiers, etc.)
CREATE TABLE IF NOT EXISTS oauth_state (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    integration_type TEXT NOT NULL DEFAULT 'salesforce',
    code_verifier TEXT NOT NULL,
    code_challenge TEXT,
    state_data JSONB,
    expires_at TIMESTAMP WITH TIME ZONE DEFAULT (NOW() + INTERVAL '10 minutes'),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    UNIQUE(company_id, integration_type)
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_oauth_tokens_company_integration 
ON oauth_tokens(company_id, integration_type);

CREATE INDEX IF NOT EXISTS idx_oauth_state_company_integration 
ON oauth_state(company_id, integration_type);

CREATE INDEX IF NOT EXISTS idx_oauth_state_expires 
ON oauth_state(expires_at);

-- RLS Policies for oauth_tokens
ALTER TABLE oauth_tokens ENABLE ROW LEVEL SECURITY;

-- Policy: Users can only access tokens for their company
CREATE POLICY oauth_tokens_company_access ON oauth_tokens
    FOR ALL USING (
        company_id IN (
            SELECT company_id FROM profiles WHERE id = auth.uid()
        )
    );

-- Policy: Service role can access all tokens (for Edge Functions)
CREATE POLICY oauth_tokens_service_access ON oauth_tokens
    FOR ALL USING (auth.role() = 'service_role');

-- RLS Policies for oauth_state
ALTER TABLE oauth_state ENABLE ROW LEVEL SECURITY;

-- Policy: Users can only access state for their company
CREATE POLICY oauth_state_company_access ON oauth_state
    FOR ALL USING (
        company_id IN (
            SELECT company_id FROM profiles WHERE id = auth.uid()
        )
    );

-- Policy: Service role can access all state (for Edge Functions)
CREATE POLICY oauth_state_service_access ON oauth_state
    FOR ALL USING (auth.role() = 'service_role');

-- Auto-cleanup expired state records
CREATE OR REPLACE FUNCTION cleanup_expired_oauth_state()
RETURNS void AS $$
BEGIN
    DELETE FROM oauth_state WHERE expires_at < NOW();
END;
$$ LANGUAGE plpgsql;

-- Optional: Create a scheduled job to clean up expired state
-- (This would need to be set up in Supabase dashboard or via pg_cron extension)
-- SELECT cron.schedule('cleanup-oauth-state', '*/5 * * * *', 'SELECT cleanup_expired_oauth_state();');
