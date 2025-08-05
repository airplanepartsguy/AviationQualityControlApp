-- Create integration_errors table for monitoring Salesforce integration issues
CREATE TABLE IF NOT EXISTS public.integration_errors (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    error_type TEXT NOT NULL CHECK (error_type IN ('oauth', 'token_refresh', 'upload', 'mapping', 'network', 'unknown')),
    error_message TEXT NOT NULL,
    error_details JSONB,
    component TEXT NOT NULL,
    user_id UUID REFERENCES auth.users(id),
    batch_id BIGINT REFERENCES public.photo_batches(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_integration_errors_company_id 
ON public.integration_errors(company_id);

CREATE INDEX IF NOT EXISTS idx_integration_errors_error_type 
ON public.integration_errors(error_type);

CREATE INDEX IF NOT EXISTS idx_integration_errors_created_at 
ON public.integration_errors(created_at);

CREATE INDEX IF NOT EXISTS idx_integration_errors_batch_id 
ON public.integration_errors(batch_id) 
WHERE batch_id IS NOT NULL;

-- RLS policies
ALTER TABLE public.integration_errors ENABLE ROW LEVEL SECURITY;

-- Users can view errors for their company
CREATE POLICY integration_errors_company_view ON public.integration_errors
    FOR SELECT USING (
        company_id IN (
            SELECT company_id FROM public.profiles WHERE id = auth.uid()
        )
    );

-- Users can insert errors for their company
CREATE POLICY integration_errors_company_insert ON public.integration_errors
    FOR INSERT WITH CHECK (
        company_id IN (
            SELECT company_id FROM public.profiles WHERE id = auth.uid()
        )
    );

-- Service role has full access
CREATE POLICY integration_errors_service_role ON public.integration_errors
    FOR ALL USING (auth.role() = 'service_role');

-- Create a view for error analytics
CREATE OR REPLACE VIEW integration_error_analytics AS
SELECT 
    company_id,
    error_type,
    DATE(created_at) as error_date,
    COUNT(*) as error_count,
    COUNT(DISTINCT user_id) as affected_users,
    COUNT(DISTINCT batch_id) as affected_batches
FROM public.integration_errors
GROUP BY company_id, error_type, DATE(created_at);

-- Grant access to the view
GRANT SELECT ON integration_error_analytics TO authenticated;