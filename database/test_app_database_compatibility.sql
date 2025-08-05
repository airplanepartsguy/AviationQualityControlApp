-- Test App-Database Compatibility
-- This script verifies that the app's assumptions match the actual database schema

-- ======================================================
-- 1. TEST OAUTH TOKEN RETRIEVAL (Company-wide access)
-- ======================================================
-- The app expects to find tokens by company_id
DO $$
DECLARE
    test_company_id UUID;
BEGIN
    -- Get a test company
    SELECT id INTO test_company_id FROM companies LIMIT 1;
    
    IF test_company_id IS NOT NULL THEN
        -- Test the query pattern used by companySalesforceTokenService
        PERFORM * FROM oauth_tokens 
        WHERE company_id = test_company_id 
        AND integration_type = 'salesforce';
        
        RAISE NOTICE '✅ OAuth token query pattern works';
    ELSE
        RAISE NOTICE '⚠️  No companies found for testing';
    END IF;
END $$;

-- ======================================================
-- 2. TEST PROFILE ACCESS (RLS Policies)
-- ======================================================
-- The app assumes users can access their company's data via profiles
SELECT 
    'Profile RLS Test' as test,
    CASE 
        WHEN EXISTS (
            SELECT 1 FROM pg_policies 
            WHERE tablename = 'profiles' 
            AND schemaname = 'public'
        ) THEN '✅ Profiles table has RLS policies'
        ELSE '❌ No RLS policies on profiles table'
    END as result;

-- ======================================================
-- 3. TEST PHOTO BATCH QUERIES
-- ======================================================
-- Test the query pattern from erpSyncService.isBatchUploadedToErp
DO $$
DECLARE
    test_batch_id BIGINT;
BEGIN
    SELECT id INTO test_batch_id FROM photo_batches LIMIT 1;
    
    IF test_batch_id IS NOT NULL THEN
        -- This is the exact query pattern from the app
        PERFORM erp_uploaded FROM photo_batches
        WHERE id = test_batch_id;
        
        RAISE NOTICE '✅ Photo batch ERP upload check works';
    ELSE
        RAISE NOTICE '⚠️  No photo batches found for testing';
    END IF;
END $$;

-- ======================================================
-- 4. TEST OBJECT MAPPING QUERIES
-- ======================================================
-- Test the query pattern from salesforceObjectMappingService
DO $$
DECLARE
    test_company_id UUID;
BEGIN
    SELECT id INTO test_company_id FROM companies LIMIT 1;
    
    IF test_company_id IS NOT NULL THEN
        -- Test the mapping query
        PERFORM * FROM salesforce_object_mappings
        WHERE company_id = test_company_id
        AND is_active = true
        ORDER BY prefix;
        
        RAISE NOTICE '✅ Object mapping query pattern works';
    ELSE
        RAISE NOTICE '⚠️  No companies found for testing';
    END IF;
END $$;

-- ======================================================
-- 5. VERIFY COLUMN NAMES AND TYPES
-- ======================================================
-- Check critical columns that the app expects
WITH expected_columns AS (
    SELECT 'photo_batches' as table_name, 'id' as column_name, 'bigint' as expected_type
    UNION SELECT 'photo_batches', 'company_id', 'uuid'
    UNION SELECT 'photo_batches', 'user_id', 'uuid'
    UNION SELECT 'photo_batches', 'status', 'text'
    UNION SELECT 'photo_batches', 'erp_uploaded', 'boolean'
    UNION SELECT 'profiles', 'id', 'uuid'
    UNION SELECT 'profiles', 'company_id', 'uuid'
    UNION SELECT 'profiles', 'full_name', 'text'
    UNION SELECT 'oauth_tokens', 'company_id', 'uuid'
    UNION SELECT 'oauth_tokens', 'access_token', 'text'
    UNION SELECT 'oauth_tokens', 'refresh_token', 'text'
)
SELECT 
    ec.table_name,
    ec.column_name,
    CASE 
        WHEN c.data_type IS NULL THEN '❌ Column missing'
        WHEN c.data_type = ec.expected_type THEN '✅ Correct type'
        WHEN c.data_type LIKE '%int%' AND ec.expected_type LIKE '%int%' THEN '✅ Compatible int type'
        ELSE '⚠️  Type mismatch: ' || c.data_type || ' (expected ' || ec.expected_type || ')'
    END as status
FROM expected_columns ec
LEFT JOIN information_schema.columns c
    ON c.table_name = ec.table_name 
    AND c.column_name = ec.column_name
    AND c.table_schema = 'public'
ORDER BY ec.table_name, ec.column_name;

-- ======================================================
-- 6. TEST UPDATE QUERIES FROM APP
-- ======================================================
-- Test the update pattern from erpSyncService
DO $$
DECLARE
    test_batch_id BIGINT;
    test_user_id UUID;
BEGIN
    -- Get test data
    SELECT pb.id, pb.user_id 
    INTO test_batch_id, test_user_id
    FROM photo_batches pb
    WHERE pb.erp_uploaded = false
    LIMIT 1;
    
    IF test_batch_id IS NOT NULL THEN
        -- Test the update pattern (but rollback)
        BEGIN
            UPDATE photo_batches
            SET 
                erp_uploaded = true,
                erp_uploaded_at = NOW(),
                erp_uploaded_by = test_user_id,
                erp_record_ids = '{"test": true}'::jsonb,
                erp_upload_error = null
            WHERE id = test_batch_id;
            
            RAISE NOTICE '✅ Photo batch update pattern works';
            
            -- Rollback the test update
            ROLLBACK;
        EXCEPTION
            WHEN OTHERS THEN
                RAISE WARNING '❌ Photo batch update failed: %', SQLERRM;
        END;
    ELSE
        RAISE NOTICE '⚠️  No suitable photo batches for update testing';
    END IF;
END $$;

-- ======================================================
-- 7. CHECK FOR POTENTIAL ISSUES
-- ======================================================
-- Check for missing indexes that could cause performance issues
SELECT 
    'Performance Check' as category,
    CASE 
        WHEN NOT EXISTS (
            SELECT 1 FROM pg_indexes 
            WHERE tablename = 'photo_batches' 
            AND indexdef LIKE '%company_id%'
        ) THEN '⚠️  Missing index on photo_batches.company_id'
        WHEN NOT EXISTS (
            SELECT 1 FROM pg_indexes 
            WHERE tablename = 'oauth_tokens' 
            AND indexdef LIKE '%company_id%integration_type%'
        ) THEN '⚠️  Missing composite index on oauth_tokens'
        ELSE '✅ Key indexes are present'
    END as issue;

-- ======================================================
-- 8. SUMMARY
-- ======================================================
SELECT 
    '🎯 COMPATIBILITY SUMMARY' as status,
    'Run the corrected add_erp_upload_tracking.sql script to complete setup' as action;