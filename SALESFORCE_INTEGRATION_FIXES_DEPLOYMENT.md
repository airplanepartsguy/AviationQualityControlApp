# Aviation QC App - Salesforce Integration Fixes Deployment Guide

## Overview
This guide covers the deployment of critical Salesforce OAuth integration fixes that enable company-wide token sharing, automatic token refresh, and duplicate upload prevention.

## Changes Implemented

### 1. OAuth Token Storage (Company-Wide Access)
- **Updated**: `supabase/functions/salesforce-oauth-callback/index.ts`
  - Now stores tokens in `oauth_tokens` table for company-wide access
  - Maintains backward compatibility with `company_integrations` table

### 2. Refresh Token Edge Function
- **Created**: `supabase/functions/refresh-salesforce-token/index.ts`
  - Automatic token refresh when access tokens expire
  - Updates both `oauth_tokens` and `company_integrations` tables

### 3. OAuth Service Updates
- **Updated**: `src/services/salesforceOAuthService.ts`
  - Modified `getStoredTokens()` to fetch from database (company-wide)
  - Updated `refreshAccessToken()` to use edge function
  - Three-tier token retrieval: oauth_tokens → company_integrations → SecureStore (legacy)

### 4. Company Token Helper Service
- **Created**: `src/services/companySalesforceTokenService.ts`
  - Centralized service for getting company-wide Salesforce tokens
  - Automatic refresh when tokens expire
  - Methods: `getCompanySalesforceToken()`, `getCompanySalesforceTokenDetails()`, `isCompanySalesforceConnected()`

### 5. Enhanced Object Mapping Service
- **Updated**: `src/services/salesforceObjectMappingService.ts`
  - Added in-memory caching with 5-minute expiry
  - New centralized method: `mapScannedIdToObject()`
  - Cache management methods for performance

### 6. ERP Upload Tracking
- **Created**: `database/add_erp_upload_tracking.sql`
  - Adds `erp_uploaded`, `erp_uploaded_at`, `erp_uploaded_by`, `erp_record_ids` fields
  - Helper functions: `mark_batch_uploaded_to_erp()`, `mark_batch_upload_failed()`
  - View: `pending_erp_uploads` for easy querying

- **Updated**: `src/services/erpSyncService.ts`
  - Added duplicate upload prevention check
  - Updates Supabase `photo_batches` table on successful/failed uploads
  - New method: `isBatchUploadedToErp()`

## Deployment Steps

### Step 1: Database Updates (Supabase)

1. **Create OAuth Tables** (if not exists):
```sql
-- Run the SQL from database/oauth_direct_exchange.sql
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

-- Enable RLS and create policies
ALTER TABLE oauth_tokens ENABLE ROW LEVEL SECURITY;

CREATE POLICY oauth_tokens_company_access ON oauth_tokens
    FOR ALL USING (
        company_id IN (
            SELECT company_id FROM profiles WHERE id = auth.uid()
        )
    );

CREATE POLICY oauth_tokens_service_access ON oauth_tokens
    FOR ALL USING (auth.role() = 'service_role');
```

2. **Add ERP Upload Tracking**:
```sql
-- Run the SQL from database/add_erp_upload_tracking.sql
ALTER TABLE public.photo_batches 
ADD COLUMN IF NOT EXISTS erp_uploaded BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS erp_uploaded_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS erp_uploaded_by UUID REFERENCES auth.users(id),
ADD COLUMN IF NOT EXISTS erp_record_ids JSONB,
ADD COLUMN IF NOT EXISTS erp_upload_error TEXT;

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_photo_batches_erp_uploaded 
ON public.photo_batches(erp_uploaded);
```

### Step 2: Deploy Edge Functions

1. **Install Supabase CLI** (if not installed):
```bash
npm install -g supabase
```

2. **Deploy OAuth Callback Function**:
```bash
supabase functions deploy salesforce-oauth-callback --project-ref luwlvmcixwdtuaffamgk
```

3. **Deploy Refresh Token Function**:
```bash
supabase functions deploy refresh-salesforce-token --project-ref luwlvmcixwdtuaffamgk
```

### Step 3: Update Mobile App

1. **Build and Deploy**:
```bash
# Install dependencies
npm install

# Build for production
npm run build

# Deploy to EAS (Expo Application Services)
eas build --platform all --profile production
eas submit --platform all
```

### Step 4: Testing

#### Test OAuth Flow:
1. Admin user connects Salesforce (one-time setup)
2. Verify token stored in `oauth_tokens` table
3. Other users in company can upload without OAuth

#### Test Token Refresh:
1. Manually expire token in database
2. Attempt upload
3. Verify automatic refresh occurs

#### Test Duplicate Prevention:
1. Upload batch to ERP
2. Attempt re-upload same batch
3. Verify prevented with appropriate message

### Step 5: Monitoring

1. **Check Edge Function Logs**:
```bash
supabase functions logs salesforce-oauth-callback --project-ref luwlvmcixwdtuaffamgk
supabase functions logs refresh-salesforce-token --project-ref luwlvmcixwdtuaffamgk
```

2. **Monitor OAuth Tokens Table**:
```sql
SELECT company_id, integration_type, expires_at, updated_at 
FROM oauth_tokens 
WHERE integration_type = 'salesforce'
ORDER BY updated_at DESC;
```

3. **Check Upload Status**:
```sql
SELECT id, batch_name, erp_uploaded, erp_uploaded_at, erp_upload_error
FROM photo_batches
WHERE company_id = '[COMPANY_ID]'
ORDER BY created_at DESC;
```

## Rollback Plan

If issues occur:

1. **Revert Edge Functions**:
   - Deploy previous versions from git history

2. **Remove Database Columns** (if needed):
```sql
ALTER TABLE photo_batches 
DROP COLUMN IF EXISTS erp_uploaded,
DROP COLUMN IF EXISTS erp_uploaded_at,
DROP COLUMN IF EXISTS erp_uploaded_by,
DROP COLUMN IF EXISTS erp_record_ids,
DROP COLUMN IF EXISTS erp_upload_error;
```

3. **Clear OAuth Tokens**:
```sql
DELETE FROM oauth_tokens WHERE integration_type = 'salesforce';
```

## Security Considerations

1. **Token Storage**: Tokens are stored encrypted in Supabase with RLS policies
2. **Company Isolation**: Each company can only access their own tokens
3. **Service Role**: Edge functions use service role for token management
4. **Audit Trail**: All uploads tracked with user and timestamp

## Support Contacts

- **Technical Issues**: Contact development team
- **Salesforce OAuth**: Check Connected App settings in Salesforce
- **Token Issues**: Review edge function logs

## Next Steps

1. **Monitor First Week**: Watch for any OAuth refresh failures
2. **User Training**: Brief admins on one-time OAuth setup
3. **Documentation**: Update user guides with new flow