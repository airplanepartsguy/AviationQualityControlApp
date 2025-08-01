-- =====================================================
-- SUPABASE STORAGE POLICIES FOR TURBINEWORKS BUCKET
-- =====================================================

-- Company: TurbineWorks
-- Company ID: 70b41ce9-bf19-4b1a-9c37-5b00cb33cadf
-- Bucket: turbineworks
-- Path Structure: {companyId}/{scannedId}/{filename}

-- =====================================================
-- 1. UPLOAD POLICY (INSERT) - Allow TurbineWorks uploads
-- =====================================================

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

-- =====================================================
-- 2. READ POLICY (SELECT) - Allow public read access to TurbineWorks photos
-- =====================================================

CREATE POLICY "TurbineWorks Read Access" ON storage.objects
FOR SELECT 
TO public
USING (
  -- Allow reading from turbineworks bucket
  bucket_id = 'turbineworks' 
  AND
  -- Only allow reading TurbineWorks company paths
  (storage.foldername(name))[1] = '70b41ce9-bf19-4b1a-9c37-5b00cb33cadf'
);

-- =====================================================
-- 3. UPDATE POLICY - Allow authenticated users to update metadata
-- =====================================================

CREATE POLICY "TurbineWorks Update Access" ON storage.objects
FOR UPDATE 
TO authenticated
USING (
  bucket_id = 'turbineworks' 
  AND
  (storage.foldername(name))[1] = '70b41ce9-bf19-4b1a-9c37-5b00cb33cadf'
  AND
  auth.role() = 'authenticated'
)
WITH CHECK (
  bucket_id = 'turbineworks' 
  AND
  (storage.foldername(name))[1] = '70b41ce9-bf19-4b1a-9c37-5b00cb33cadf'
);

-- =====================================================
-- 4. DELETE POLICY - Allow authenticated users to delete their own uploads
-- =====================================================

CREATE POLICY "TurbineWorks Delete Access" ON storage.objects
FOR DELETE 
TO authenticated
USING (
  bucket_id = 'turbineworks' 
  AND
  (storage.foldername(name))[1] = '70b41ce9-bf19-4b1a-9c37-5b00cb33cadf'
  AND
  auth.role() = 'authenticated'
);

-- =====================================================
-- 5. ALTERNATIVE SIMPLIFIED POLICY (Use this if above doesn't work)
-- =====================================================

-- If the above policies are too restrictive, you can replace them with this simpler version:

/*
-- Drop existing policies first (if needed)
DROP POLICY IF EXISTS "TurbineWorks Upload Access" ON storage.objects;
DROP POLICY IF EXISTS "TurbineWorks Read Access" ON storage.objects;
DROP POLICY IF EXISTS "TurbineWorks Update Access" ON storage.objects;
DROP POLICY IF EXISTS "TurbineWorks Delete Access" ON storage.objects;

-- Simple policy: Allow all authenticated users full access to turbineworks bucket
CREATE POLICY "Authenticated Full Access" ON storage.objects
FOR ALL 
TO authenticated
USING (bucket_id = 'turbineworks')
WITH CHECK (bucket_id = 'turbineworks');

-- Public read access
CREATE POLICY "Public Read Access" ON storage.objects
FOR SELECT 
TO public
USING (bucket_id = 'turbineworks');
*/

-- =====================================================
-- VERIFICATION QUERIES
-- =====================================================

-- Check if policies were created successfully
SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual 
FROM pg_policies 
WHERE tablename = 'objects' AND schemaname = 'storage';

-- Check bucket settings
SELECT * FROM storage.buckets WHERE name = 'turbineworks'; 