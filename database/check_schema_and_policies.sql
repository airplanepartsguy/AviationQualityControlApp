-- Schema Verification Queries for Aviation QC App
-- Run these queries to verify database structure and RLS policies

-- 1. Check photo_batches table structure
SELECT 
    column_name, 
    data_type, 
    is_nullable,
    column_default
FROM information_schema.columns
WHERE table_schema = 'public' 
    AND table_name = 'photo_batches'
ORDER BY ordinal_position;

-- 2. Check if oauth_tokens table exists and its structure
SELECT 
    column_name, 
    data_type, 
    is_nullable
FROM information_schema.columns
WHERE table_schema = 'public' 
    AND table_name = 'oauth_tokens'
ORDER BY ordinal_position;

-- 3. Check company_integrations table structure
SELECT 
    column_name, 
    data_type, 
    is_nullable
FROM information_schema.columns
WHERE table_schema = 'public' 
    AND table_name = 'company_integrations'
ORDER BY ordinal_position;

-- 4. Check salesforce_object_mappings table
SELECT 
    column_name, 
    data_type, 
    is_nullable
FROM information_schema.columns
WHERE table_schema = 'public' 
    AND table_name = 'salesforce_object_mappings'
ORDER BY ordinal_position;

-- 5. Check RLS policies on photo_batches
SELECT 
    schemaname,
    tablename,
    policyname,
    permissive,
    roles,
    cmd,
    qual,
    with_check
FROM pg_policies
WHERE schemaname = 'public' 
    AND tablename = 'photo_batches';

-- 6. Check RLS policies on oauth_tokens
SELECT 
    schemaname,
    tablename,
    policyname,
    permissive,
    roles,
    cmd,
    qual
FROM pg_policies
WHERE schemaname = 'public' 
    AND tablename = 'oauth_tokens';

-- 7. Check if profiles table has company_id
SELECT 
    column_name, 
    data_type
FROM information_schema.columns
WHERE table_schema = 'public' 
    AND table_name = 'profiles'
    AND column_name IN ('id', 'company_id', 'user_id');

-- 8. Check companies table structure
SELECT 
    column_name, 
    data_type
FROM information_schema.columns
WHERE table_schema = 'public' 
    AND table_name = 'companies'
    AND column_name = 'id';

-- 9. Check foreign key constraints on photo_batches
SELECT
    tc.constraint_name,
    tc.table_name,
    kcu.column_name,
    ccu.table_name AS foreign_table_name,
    ccu.column_name AS foreign_column_name
FROM information_schema.table_constraints AS tc
JOIN information_schema.key_column_usage AS kcu
    ON tc.constraint_name = kcu.constraint_name
JOIN information_schema.constraint_column_usage AS ccu
    ON ccu.constraint_name = tc.constraint_name
WHERE tc.constraint_type = 'FOREIGN KEY' 
    AND tc.table_name = 'photo_batches';

-- 10. Check if photos table exists and its ID type
SELECT 
    column_name, 
    data_type
FROM information_schema.columns
WHERE table_schema = 'public' 
    AND table_name = 'photos'
    AND column_name IN ('id', 'batch_id');

-- 11. List all tables to understand the schema
SELECT 
    table_name
FROM information_schema.tables
WHERE table_schema = 'public'
    AND table_type = 'BASE TABLE'
ORDER BY table_name;