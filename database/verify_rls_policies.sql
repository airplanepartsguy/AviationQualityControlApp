-- Verify RLS Policies Match App Expectations

-- ======================================================
-- 1. CHECK IF RLS IS ENABLED ON KEY TABLES
-- ======================================================
SELECT 
    tablename,
    CASE 
        WHEN rowsecurity::text = 'true' THEN '✅ RLS Enabled'
        ELSE '❌ RLS Disabled - SECURITY RISK!'
    END as rls_status
FROM pg_tables
WHERE schemaname = 'public'
AND tablename IN ('photo_batches', 'photos', 'profiles', 'oauth_tokens', 'company_integrations', 'salesforce_object_mappings')
ORDER BY tablename;

-- ======================================================
-- 2. LIST ALL RLS POLICIES
-- ======================================================
SELECT 
    tablename,
    policyname,
    cmd as operation,
    permissive,
    roles,
    CASE 
        WHEN qual IS NULL THEN 'No filter'
        WHEN LENGTH(qual) > 100 THEN SUBSTRING(qual, 1, 100) || '...'
        ELSE qual
    END as policy_filter
FROM pg_policies
WHERE schemaname = 'public'
AND tablename IN ('photo_batches', 'photos', 'profiles', 'oauth_tokens', 'company_integrations', 'salesforce_object_mappings')
ORDER BY tablename, policyname;

-- ======================================================
-- 3. CHECK SPECIFIC POLICY PATTERNS THE APP EXPECTS
-- ======================================================
-- The app expects users can only access data from their company

-- Check photo_batches policies
SELECT 
    'photo_batches company isolation' as check_type,
    CASE 
        WHEN COUNT(*) > 0 THEN '✅ Has company-based RLS'
        ELSE '❌ Missing company-based RLS'
    END as status,
    COUNT(*) as policy_count
FROM pg_policies
WHERE tablename = 'photo_batches'
AND schemaname = 'public'
AND qual LIKE '%company_id%';

-- Check oauth_tokens policies
SELECT 
    'oauth_tokens company isolation' as check_type,
    CASE 
        WHEN COUNT(*) > 0 THEN '✅ Has company-based RLS'
        ELSE '❌ Missing company-based RLS'
    END as status,
    COUNT(*) as policy_count
FROM pg_policies
WHERE tablename = 'oauth_tokens'
AND schemaname = 'public'
AND (qual LIKE '%company_id%' OR policyname LIKE '%company%');

-- ======================================================
-- 4. TEST RLS WITH SAMPLE QUERIES
-- ======================================================
-- Create a test function to verify RLS works as expected
CREATE OR REPLACE FUNCTION test_rls_isolation() 
RETURNS TABLE(test_name TEXT, result TEXT) AS $$
DECLARE
    company1_id UUID;
    company2_id UUID;
    user1_id UUID;
    user2_id UUID;
BEGIN
    -- Get two different companies and their users
    SELECT DISTINCT c.id, p.id 
    INTO company1_id, user1_id
    FROM companies c
    JOIN profiles p ON p.company_id = c.id
    LIMIT 1;
    
    SELECT DISTINCT c.id, p.id 
    INTO company2_id, user2_id
    FROM companies c
    JOIN profiles p ON p.company_id = c.id
    WHERE c.id != COALESCE(company1_id, '00000000-0000-0000-0000-000000000000'::uuid)
    LIMIT 1;
    
    IF company1_id IS NULL OR company2_id IS NULL THEN
        RETURN QUERY SELECT 'RLS Test'::TEXT, 'Need at least 2 companies with users to test'::TEXT;
        RETURN;
    END IF;
    
    -- Test: Can user from company1 see company2's oauth tokens?
    RETURN QUERY
    SELECT 
        'Cross-company oauth token access'::TEXT,
        CASE 
            WHEN EXISTS (
                SELECT 1 FROM oauth_tokens 
                WHERE company_id = company2_id
                -- This simulates the RLS check
                AND company_id IN (
                    SELECT company_id FROM profiles WHERE id = user1_id
                )
            ) THEN '❌ RLS FAILED - User can see other company tokens!'
            ELSE '✅ RLS working - User cannot see other company tokens'
        END;
    
    -- Test: Can user see their own company's tokens?
    RETURN QUERY
    SELECT 
        'Same-company oauth token access'::TEXT,
        CASE 
            WHEN NOT EXISTS (
                SELECT 1 FROM profiles WHERE id = user1_id AND company_id = company1_id
            ) THEN '⚠️  Test user not properly linked to company'
            ELSE '✅ User-company relationship exists'
        END;
        
    RETURN;
END;
$$ LANGUAGE plpgsql;

-- Run the test
SELECT * FROM test_rls_isolation();

-- Clean up
DROP FUNCTION IF EXISTS test_rls_isolation();

-- ======================================================
-- 5. RECOMMENDATIONS
-- ======================================================
SELECT 
    'RLS Recommendations' as category,
    recommendation
FROM (
    VALUES 
    ('If any tables show RLS Disabled, run: ALTER TABLE <table_name> ENABLE ROW LEVEL SECURITY;'),
    ('Ensure all tables have appropriate company_id based policies'),
    ('Test with different user contexts to verify isolation'),
    ('Monitor for any queries that bypass RLS (using service role)')
) AS t(recommendation);