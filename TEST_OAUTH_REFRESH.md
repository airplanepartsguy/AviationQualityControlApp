# Test OAuth Token Refresh

## Quick Test Steps

### 1. Force Token Refresh Test
In the app, go to **ERP Screen** and click **"Upload to ERP"** on any batch. 

Since your token is expired (from logs), this will trigger:
1. App detects expired token
2. Calls `refresh-salesforce-token` Edge Function
3. Uses refresh token to get new access token
4. Updates `oauth_tokens` table
5. Proceeds with upload

### 2. Check Results in Supabase
```sql
-- Run this in Supabase SQL editor to see the new token
SELECT 
    company_id,
    access_token,
    refresh_token,
    expires_at,
    updated_at
FROM oauth_tokens
WHERE integration_type = 'salesforce';
```

### 3. Verify Company-Wide Access
1. **Log out** of the app
2. **Log in as a different user** (same company)
3. Try to upload a batch
4. Should work WITHOUT OAuth prompt!

## What to Look For

✅ **Success Signs:**
- Upload works without re-authentication
- New token in `oauth_tokens` table
- `expires_at` is in the future
- Other users can upload without OAuth

❌ **If It Fails:**
- Check Edge Function logs:
```bash
supabase functions logs refresh-salesforce-token --project-ref luwlvmcixwdtuaffamgk
```

## Common Issues & Fixes

### "Refresh token invalid"
- Admin needs to reconnect Salesforce
- Check if refresh token exists in database

### "Edge function not found"
- Deploy the function:
```bash
supabase functions deploy refresh-salesforce-token --project-ref luwlvmcixwdtuaffamgk
```

### "No token found"
- Check `oauth_tokens` table has entry for your company
- May need to migrate from old storage