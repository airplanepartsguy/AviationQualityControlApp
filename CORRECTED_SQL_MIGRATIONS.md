# Corrected SQL Migration Scripts

## Issues Found and Fixed

### 1. **photo_batches Table Structure**
- **Issue**: The migration assumed `created_by` column, but the table has `user_id`
- **Issue**: The migration assumed `batch_id` is UUID, but it's actually BIGINT (BIGSERIAL)
- **Issue**: The migration referenced `sync_status`, but the column is `status`

### 2. **Data Type Mismatches**
- Supabase uses snake_case (user_id, company_id)
- photo_batches.id is BIGINT, not UUID
- companies.id is UUID (correct)

## Run These Corrected Scripts in Order:

### 1. First, check if oauth_tokens table exists (if not, create it):
```sql
-- Only run this if oauth_tokens doesn't exist
-- Check first: SELECT * FROM information_schema.tables WHERE table_name = 'oauth_tokens';

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

-- Enable RLS
ALTER TABLE oauth_tokens ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY oauth_tokens_company_access ON oauth_tokens
    FOR ALL USING (
        company_id IN (
            SELECT company_id FROM profiles WHERE id = auth.uid()
        )
    );

CREATE POLICY oauth_tokens_service_access ON oauth_tokens
    FOR ALL USING (auth.role() = 'service_role');
```

### 2. Run the corrected ERP upload tracking script:
```bash
# This has been fixed in the file
psql $DATABASE_URL < database/add_erp_upload_tracking.sql
```

### 3. Run the corrected integration errors script:
```bash
# This has been fixed in the file
psql $DATABASE_URL < database/create_integration_errors_table.sql
```

### 4. Verify everything is set up correctly:
```bash
psql $DATABASE_URL < database/verify_integration_setup.sql
```

## Key Schema Facts for Reference:

1. **photo_batches**:
   - id: BIGSERIAL (BIGINT)
   - user_id: UUID (references auth.users)
   - company_id: UUID (references companies)
   - status: TEXT (not sync_status)

2. **companies**:
   - id: UUID

3. **profiles**:
   - id: UUID (same as auth.users.id)
   - company_id: UUID

4. **oauth_tokens** (new):
   - company_id: UUID
   - integration_type: TEXT
   - Stores tokens at company level

## TypeScript Compatibility Notes:

The mobile app uses camelCase but Supabase uses snake_case. The sync process handles this conversion automatically. When working with Supabase directly:
- Use snake_case: user_id, company_id, batch_id
- BIGINT values (like batch_id) come as strings in JSON responses