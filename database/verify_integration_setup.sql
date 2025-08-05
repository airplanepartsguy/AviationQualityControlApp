-- Comprehensive Schema Verification for Salesforce Integration
-- Run this after applying migrations to verify everything is set up correctly

-- ======================================================
-- 1. CHECK OAUTH_TOKENS TABLE
-- ======================================================
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'oauth_tokens') THEN
        RAISE NOTICE '✅ oauth_tokens table exists';
    ELSE
        RAISE WARNING '❌ oauth_tokens table is missing - run database/oauth_direct_exchange.sql';
    END IF;
END $$;

-- Check oauth_tokens columns
SELECT 
    'oauth_tokens columns' as check_type,
    CASE 
        WHEN COUNT(*) >= 9 THEN '✅ All expected columns present'
        ELSE '❌ Missing columns'
    END as status,
    STRING_AGG(column_name, ', ') as columns
FROM information_schema.columns
WHERE table_name = 'oauth_tokens' AND table_schema = 'public';

-- ======================================================
-- 2. CHECK PHOTO_BATCHES ERP TRACKING COLUMNS
-- ======================================================
SELECT 
    'photo_batches ERP columns' as check_type,
    CASE 
        WHEN COUNT(*) = 5 THEN '✅ All ERP tracking columns added'
        ELSE '❌ Missing ERP tracking columns - run database/add_erp_upload_tracking.sql'
    END as status,
    STRING_AGG(column_name, ', ') as columns
FROM information_schema.columns
WHERE table_name = 'photo_batches' 
    AND column_name IN ('erp_uploaded', 'erp_uploaded_at', 'erp_uploaded_by', 'erp_record_ids', 'erp_upload_error');

-- ======================================================
-- 3. CHECK INTEGRATION_ERRORS TABLE
-- ======================================================
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'integration_errors') THEN
        RAISE NOTICE '✅ integration_errors table exists';
    ELSE
        RAISE WARNING '❌ integration_errors table is missing - run database/create_integration_errors_table.sql';
    END IF;
END $$;

-- ======================================================
-- 4. CHECK RLS POLICIES
-- ======================================================
-- Check oauth_tokens policies
SELECT 
    'oauth_tokens RLS' as check_type,
    CASE 
        WHEN COUNT(*) >= 2 THEN '✅ RLS policies configured'
        ELSE '❌ Missing RLS policies on oauth_tokens'
    END as status,
    COUNT(*) as policy_count
FROM pg_policies
WHERE tablename = 'oauth_tokens' AND schemaname = 'public';

-- Check photo_batches policies
SELECT 
    'photo_batches RLS' as check_type,
    CASE 
        WHEN COUNT(*) > 0 THEN '✅ RLS policies configured'
        ELSE '❌ No RLS policies on photo_batches'
    END as status,
    COUNT(*) as policy_count
FROM pg_policies
WHERE tablename = 'photo_batches' AND schemaname = 'public';

-- ======================================================
-- 5. CHECK SALESFORCE_OBJECT_MAPPINGS
-- ======================================================
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'salesforce_object_mappings') THEN
        RAISE NOTICE '✅ salesforce_object_mappings table exists';
        
        -- Check if default mappings exist
        IF EXISTS (SELECT 1 FROM salesforce_object_mappings LIMIT 1) THEN
            RAISE NOTICE '✅ Object mappings have been initialized';
        ELSE
            RAISE WARNING '⚠️  No object mappings found - initialize default mappings';
        END IF;
    ELSE
        RAISE WARNING '❌ salesforce_object_mappings table is missing';
    END IF;
END $$;

-- ======================================================
-- 6. CHECK COMPANY_INTEGRATIONS TABLE
-- ======================================================
SELECT 
    'company_integrations' as check_type,
    CASE 
        WHEN COUNT(*) > 0 THEN '✅ Table exists with ' || COUNT(*) || ' columns'
        ELSE '❌ Table missing'
    END as status
FROM information_schema.columns
WHERE table_name = 'company_integrations' AND table_schema = 'public';

-- ======================================================
-- 7. CHECK DATA TYPES COMPATIBILITY
-- ======================================================
-- Verify photo_batches.id is BIGINT/BIGSERIAL
SELECT 
    'photo_batches.id type' as check_type,
    CASE 
        WHEN data_type IN ('bigint', 'integer') THEN '✅ Compatible type: ' || data_type
        ELSE '❌ Incompatible type: ' || data_type
    END as status
FROM information_schema.columns
WHERE table_name = 'photo_batches' AND column_name = 'id';

-- Verify companies.id is UUID
SELECT 
    'companies.id type' as check_type,
    CASE 
        WHEN data_type = 'uuid' THEN '✅ Correct type: UUID'
        ELSE '❌ Wrong type: ' || data_type
    END as status
FROM information_schema.columns
WHERE table_name = 'companies' AND column_name = 'id';

-- ======================================================
-- 8. CHECK VIEWS AND FUNCTIONS
-- ======================================================
-- Check if pending_erp_uploads view exists
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.views WHERE table_name = 'pending_erp_uploads') THEN
        RAISE NOTICE '✅ pending_erp_uploads view exists';
    ELSE
        RAISE WARNING '❌ pending_erp_uploads view is missing';
    END IF;
END $$;

-- Check if functions exist
SELECT 
    'ERP functions' as check_type,
    CASE 
        WHEN COUNT(*) = 2 THEN '✅ Both ERP functions exist'
        ELSE '❌ Missing ERP functions'
    END as status,
    STRING_AGG(routine_name, ', ') as functions
FROM information_schema.routines
WHERE routine_name IN ('mark_batch_uploaded_to_erp', 'mark_batch_upload_failed')
    AND routine_schema = 'public';

-- ======================================================
-- 9. SAMPLE DATA CHECK
-- ======================================================
-- Check if there are any companies
SELECT 
    'Sample companies' as check_type,
    CASE 
        WHEN COUNT(*) > 0 THEN '✅ ' || COUNT(*) || ' companies found'
        ELSE '⚠️  No companies found - create a test company first'
    END as status
FROM companies;

-- Check if there are any Salesforce connections
SELECT 
    'Salesforce connections' as check_type,
    CASE 
        WHEN COUNT(*) > 0 THEN '✅ ' || COUNT(*) || ' companies have Salesforce tokens'
        ELSE '⚠️  No Salesforce connections found'
    END as status
FROM oauth_tokens
WHERE integration_type = 'salesforce';

-- ======================================================
-- 10. FINAL SUMMARY
-- ======================================================
SELECT 
    'INTEGRATION READY' as status,
    CASE 
        WHEN (
            EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'oauth_tokens')
            AND EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'integration_errors')
            AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'photo_batches' AND column_name = 'erp_uploaded')
        ) THEN '✅ All core components are installed'
        ELSE '❌ Some components are missing - check warnings above'
    END as result;