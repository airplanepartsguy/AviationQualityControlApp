-- Quick check to see what already exists

-- 1. Check if ERP columns exist
SELECT 
    'ERP Columns' as check_type,
    COUNT(*) as count,
    STRING_AGG(column_name, ', ') as columns
FROM information_schema.columns 
WHERE table_name = 'photo_batches' 
AND column_name IN ('erp_uploaded', 'erp_uploaded_at', 'erp_uploaded_by', 'erp_record_ids', 'erp_upload_error');

-- 2. Check if RLS policy exists
SELECT 
    'RLS Policy' as check_type,
    COUNT(*) as count,
    STRING_AGG(policyname, ', ') as policies
FROM pg_policies
WHERE tablename = 'photo_batches' 
AND policyname = 'photo_batches_erp_upload_status';

-- 3. Check if functions exist
SELECT 
    'Functions' as check_type,
    COUNT(*) as count,
    STRING_AGG(routine_name, ', ') as functions
FROM information_schema.routines
WHERE routine_name IN ('mark_batch_uploaded_to_erp', 'mark_batch_upload_failed')
AND routine_schema = 'public';

-- 4. Check if view exists
SELECT 
    'View' as check_type,
    CASE WHEN COUNT(*) > 0 THEN 'EXISTS' ELSE 'NOT EXISTS' END as status
FROM information_schema.views 
WHERE table_name = 'pending_erp_uploads';