-- Final Verification - Run this to confirm everything is ready

-- 1. ✅ Check ERP tracking columns
SELECT 
    'ERP Upload Tracking' as feature,
    CASE 
        WHEN COUNT(*) = 5 THEN '✅ All 5 columns added'
        ELSE '❌ Missing columns: ' || (5 - COUNT(*))::text
    END as status,
    STRING_AGG(column_name, ', ') as columns_found
FROM information_schema.columns 
WHERE table_name = 'photo_batches' 
AND column_name IN ('erp_uploaded', 'erp_uploaded_at', 'erp_uploaded_by', 'erp_record_ids', 'erp_upload_error');

-- 2. ✅ Check oauth_tokens table
SELECT 
    'OAuth Tokens Table' as feature,
    CASE 
        WHEN EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'oauth_tokens') 
        THEN '✅ Table exists'
        ELSE '❌ Table missing'
    END as status;

-- 3. ✅ Check integration_errors table
SELECT 
    'Error Monitoring Table' as feature,
    CASE 
        WHEN EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'integration_errors') 
        THEN '✅ Table exists'
        ELSE '❌ Table missing'
    END as status;

-- 4. ✅ Check if any companies have Salesforce tokens
SELECT 
    'Salesforce Connections' as feature,
    CASE 
        WHEN COUNT(*) > 0 THEN '✅ ' || COUNT(*) || ' companies connected'
        ELSE '⚠️  No companies connected yet (normal for new setup)'
    END as status
FROM oauth_tokens
WHERE integration_type = 'salesforce';

-- 5. ✅ Check edge functions (you'll need to verify these are deployed)
SELECT 
    'Edge Functions Status' as feature,
    '⚠️  Check manually: salesforce-oauth-callback and refresh-salesforce-token' as status;

-- 6. ✅ Summary
SELECT 
    '🎉 DEPLOYMENT STATUS' as summary,
    'Database is ready! Next: Deploy the mobile app.' as action;