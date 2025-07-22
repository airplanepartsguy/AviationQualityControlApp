-- Emergency fix for OAuth callback 401 errors
-- Run this in your Supabase SQL editor

-- Ensure oauth_callbacks table exists and has proper permissions
CREATE TABLE IF NOT EXISTS public.oauth_callbacks (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    company_id UUID NOT NULL,
    auth_code TEXT,
    error TEXT,
    error_description TEXT,
    consumed BOOLEAN DEFAULT false,
    expires_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Drop any overly restrictive RLS policies on oauth_callbacks
DROP POLICY IF EXISTS "oauth_callbacks_policy" ON public.oauth_callbacks;
DROP POLICY IF EXISTS "Users can only access their company oauth callbacks" ON public.oauth_callbacks;

-- Temporarily disable RLS on oauth_callbacks to test
ALTER TABLE public.oauth_callbacks DISABLE ROW LEVEL SECURITY;

-- Or if you want to keep RLS enabled, add a permissive policy for service role
-- ALTER TABLE public.oauth_callbacks ENABLE ROW LEVEL SECURITY;
-- CREATE POLICY "Allow service role full access" ON public.oauth_callbacks
--     FOR ALL TO service_role USING (true);

-- Ensure companies table allows service role access
DROP POLICY IF EXISTS "Service role access" ON public.companies;
CREATE POLICY "Service role access" ON public.companies
    FOR ALL TO service_role USING (true);

-- Grant necessary permissions
GRANT ALL ON public.oauth_callbacks TO service_role;
GRANT ALL ON public.companies TO service_role;

-- Verify the changes
SELECT 
    schemaname, 
    tablename, 
    rowsecurity,
    'RLS ' || CASE WHEN rowsecurity THEN 'ENABLED' ELSE 'DISABLED' END as status
FROM pg_tables 
WHERE schemaname = 'public' 
AND tablename IN ('oauth_callbacks', 'companies'); 