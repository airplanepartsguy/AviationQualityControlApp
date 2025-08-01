-- =====================================================
-- ALTERNATIVE FIX: TurbineWorks Upload Policy 
-- =====================================================

-- Drop the existing broken policy
DROP POLICY IF EXISTS "TurbineWorks Upload Access" ON storage.objects;

-- Try alternative syntax approach 1: Combined USING and WITH CHECK
CREATE POLICY "TurbineWorks Upload Access" ON storage.objects
FOR INSERT 
TO authenticated
USING (
  bucket_id = 'turbineworks' 
  AND (storage.foldername(name))[1] = '70b41ce9-bf19-4b1a-9c37-5b00cb33cadf'
  AND auth.role() = 'authenticated'
)
WITH CHECK (
  bucket_id = 'turbineworks' 
  AND (storage.foldername(name))[1] = '70b41ce9-bf19-4b1a-9c37-5b00cb33cadf'
  AND auth.role() = 'authenticated'
);

-- Verify the fix
SELECT policyname, cmd, qual, with_check 
FROM pg_policies 
WHERE tablename = 'objects' 
AND schemaname = 'storage' 
AND policyname = 'TurbineWorks Upload Access';

-- If the above doesn't work, try this simpler approach:
/*
-- Drop again if needed
DROP POLICY IF EXISTS "TurbineWorks Upload Access" ON storage.objects;

-- Simplified approach: Just check bucket and authentication
CREATE POLICY "TurbineWorks Upload Access" ON storage.objects
FOR INSERT 
TO authenticated
WITH CHECK (
  bucket_id = 'turbineworks' 
  AND auth.role() = 'authenticated'
);
*/ 