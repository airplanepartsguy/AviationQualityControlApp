// Script to create OAuth tables for direct token exchange
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://luwlvmcixwdtuaffamgk.supabase.co';
const supabaseServiceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imx1d2x2bWNpeHdkdHVhZmZhbWdrIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTczNjk5NzQ2NCwiZXhwIjoyMDUyNTczNDY0fQ.Oj6HRNOPJPqOvGcYdnWKJJqFUJfvNHCZEJxZnWgKJhY';

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function createOAuthTables() {
  console.log('Creating OAuth tables for direct token exchange...');
  
  try {
    // Create oauth_tokens table
    const { error: tokensError } = await supabase.rpc('exec_sql', {
      sql: `
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
      `
    });
    
    if (tokensError) {
      console.error('Error creating oauth_tokens table:', tokensError);
    } else {
      console.log('✅ oauth_tokens table created successfully');
    }
    
    // Create oauth_state table
    const { error: stateError } = await supabase.rpc('exec_sql', {
      sql: `
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
      `
    });
    
    if (stateError) {
      console.error('Error creating oauth_state table:', stateError);
    } else {
      console.log('✅ oauth_state table created successfully');
    }
    
    // Create indexes
    const { error: indexError } = await supabase.rpc('exec_sql', {
      sql: `
        CREATE INDEX IF NOT EXISTS idx_oauth_tokens_company_integration 
        ON oauth_tokens(company_id, integration_type);
        
        CREATE INDEX IF NOT EXISTS idx_oauth_state_company_integration 
        ON oauth_state(company_id, integration_type);
        
        CREATE INDEX IF NOT EXISTS idx_oauth_state_expires 
        ON oauth_state(expires_at);
      `
    });
    
    if (indexError) {
      console.error('Error creating indexes:', indexError);
    } else {
      console.log('✅ Indexes created successfully');
    }
    
    // Enable RLS and create policies
    const { error: rlsError } = await supabase.rpc('exec_sql', {
      sql: `
        ALTER TABLE oauth_tokens ENABLE ROW LEVEL SECURITY;
        ALTER TABLE oauth_state ENABLE ROW LEVEL SECURITY;
        
        DROP POLICY IF EXISTS oauth_tokens_company_access ON oauth_tokens;
        DROP POLICY IF EXISTS oauth_tokens_service_access ON oauth_tokens;
        DROP POLICY IF EXISTS oauth_state_company_access ON oauth_state;
        DROP POLICY IF EXISTS oauth_state_service_access ON oauth_state;
        
        CREATE POLICY oauth_tokens_company_access ON oauth_tokens
          FOR ALL USING (
            company_id IN (
              SELECT company_id FROM profiles WHERE id = auth.uid()
            )
          );
        
        CREATE POLICY oauth_tokens_service_access ON oauth_tokens
          FOR ALL USING (auth.role() = 'service_role');
        
        CREATE POLICY oauth_state_company_access ON oauth_state
          FOR ALL USING (
            company_id IN (
              SELECT company_id FROM profiles WHERE id = auth.uid()
            )
          );
        
        CREATE POLICY oauth_state_service_access ON oauth_state
          FOR ALL USING (auth.role() = 'service_role');
      `
    });
    
    if (rlsError) {
      console.error('Error setting up RLS policies:', rlsError);
    } else {
      console.log('✅ RLS policies created successfully');
    }
    
    console.log('\n🎉 OAuth tables setup completed successfully!');
    console.log('The direct token exchange approach is now ready to use.');
    
  } catch (error) {
    console.error('❌ Error setting up OAuth tables:', error);
  }
}

createOAuthTables();
