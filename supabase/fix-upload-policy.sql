-- =====================================================
-- FIX: TurbineWorks Upload Policy WITH CHECK Condition
-- =====================================================

-- Drop the existing policy with missing WITH CHECK
DROP POLICY IF EXISTS "TurbineWorks Upload Access" ON storage.objects;

-- Recreate with proper WITH CHECK condition
CREATE POLICY "TurbineWorks Upload Access" ON storage.objects
FOR INSERT 
TO authenticated
WITH CHECK (
  -- Allow uploads to turbineworks bucket
  bucket_id = 'turbineworks' 
  AND
  -- Only allow uploads to company-specific paths
  (storage.foldername(name))[1] = '70b41ce9-bf19-4b1a-9c37-5b00cb33cadf'
  AND
  -- Ensure user is authenticated
  auth.role() = 'authenticated'
);

-- Verify the fix
SELECT policyname, cmd, qual 
FROM pg_policies 
WHERE tablename = 'objects' 
AND schemaname = 'storage' 
AND policyname = 'TurbineWorks Upload Access'; 