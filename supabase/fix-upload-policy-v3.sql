-- =====================================================
-- CORRECT FIX: TurbineWorks Upload Policy (INSERT only uses WITH CHECK)
-- =====================================================

-- Drop the existing broken policy
DROP POLICY IF EXISTS "TurbineWorks Upload Access" ON storage.objects;

-- CORRECT SYNTAX: INSERT policies only use WITH CHECK (no USING clause)
CREATE POLICY "TurbineWorks Upload Access" ON storage.objects
FOR INSERT 
TO authenticated
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

-- Alternative simplified version if path checking doesn't work:
/*
DROP POLICY IF EXISTS "TurbineWorks Upload Access" ON storage.objects;

CREATE POLICY "TurbineWorks Upload Access" ON storage.objects
FOR INSERT 
TO authenticated
WITH CHECK (
  bucket_id = 'turbineworks' 
  AND auth.role() = 'authenticated'
);
*/ 