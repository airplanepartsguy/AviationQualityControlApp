-- ERP License Integration System Migration
-- This migration modifies the existing company_integrations table structure
-- to add company-specific ERP integration permissions while preserving existing functionality

-- Step 1: Add new columns to existing company_integrations table for licensing control
ALTER TABLE public.company_integrations 
    ADD COLUMN IF NOT EXISTS is_enabled BOOLEAN DEFAULT true,
    ADD COLUMN IF NOT EXISTS is_primary BOOLEAN DEFAULT false,
    ADD COLUMN IF NOT EXISTS max_connections INTEGER DEFAULT 1;

-- Step 2: Create company_integration_permissions table for defining which integrations companies can access
-- This is separate from the actual integration instances in company_integrations
CREATE TABLE IF NOT EXISTS public.company_integration_permissions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    integration_type TEXT NOT NULL CHECK (integration_type = ANY (ARRAY['salesforce'::text, 'sharepoint'::text, 'sap'::text, 'dynamics'::text])),
    is_enabled BOOLEAN DEFAULT true, -- Is this integration type enabled for this company?
    is_primary BOOLEAN DEFAULT false, -- Can this be the primary ERP system?
    max_connections INTEGER DEFAULT 1, -- How many connections allowed for this company
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(company_id, integration_type)
);

-- Step 3: Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_company_integration_permissions_company_id ON public.company_integration_permissions(company_id);
CREATE INDEX IF NOT EXISTS idx_company_integration_permissions_integration_type ON public.company_integration_permissions(integration_type);
CREATE INDEX IF NOT EXISTS idx_company_integration_permissions_enabled ON public.company_integration_permissions(is_enabled);

-- Step 4: Create trigger for updated_at on permissions table
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

DROP TRIGGER IF EXISTS update_company_integration_permissions_updated_at ON public.company_integration_permissions;
CREATE TRIGGER update_company_integration_permissions_updated_at
    BEFORE UPDATE ON public.company_integration_permissions
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();

-- Step 5: Insert default company integration permissions for existing companies
-- Each company gets exactly the integrations they need, regardless of license type

-- Example Company 1: TurbineWorks - Salesforce + SharePoint
INSERT INTO public.company_integration_permissions (company_id, integration_type, is_enabled, is_primary, max_connections) VALUES
('70b41ce9-bf19-4b1a-9c37-5b00cb33cadf', 'salesforce', true, true, 2),
('70b41ce9-bf19-4b1a-9c37-5b00cb33cadf', 'sharepoint', true, false, 3)

-- Add more companies as needed:
-- ('another-company-uuid', 'sap', true, true, 1),
-- ('another-company-uuid', 'dynamics', true, false, 1)

ON CONFLICT (company_id, integration_type) DO UPDATE SET
    is_enabled = EXCLUDED.is_enabled,
    is_primary = EXCLUDED.is_primary,
    max_connections = EXCLUDED.max_connections,
    updated_at = NOW();

-- Step 6: Create RLS policies for the new permissions table
ALTER TABLE public.company_integration_permissions ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "company_integration_permissions_select" ON public.company_integration_permissions;
DROP POLICY IF EXISTS "company_integration_permissions_insert" ON public.company_integration_permissions;
DROP POLICY IF EXISTS "company_integration_permissions_update" ON public.company_integration_permissions;
DROP POLICY IF EXISTS "company_integration_permissions_delete" ON public.company_integration_permissions;

-- Company integration permissions are only accessible by company members
CREATE POLICY "company_integration_permissions_select" ON public.company_integration_permissions
    FOR SELECT TO authenticated USING (
        company_id IN (
            SELECT company_id FROM public.profiles WHERE id = auth.uid()
        )
    );

CREATE POLICY "company_integration_permissions_insert" ON public.company_integration_permissions
    FOR INSERT TO authenticated WITH CHECK (
        company_id IN (
            SELECT company_id FROM public.profiles WHERE id = auth.uid() AND role IN ('admin', 'super_admin')
        )
    );

CREATE POLICY "company_integration_permissions_update" ON public.company_integration_permissions
    FOR UPDATE TO authenticated USING (
        company_id IN (
            SELECT company_id FROM public.profiles WHERE id = auth.uid() AND role IN ('admin', 'super_admin')
        )
    );

CREATE POLICY "company_integration_permissions_delete" ON public.company_integration_permissions
    FOR DELETE TO authenticated USING (
        company_id IN (
            SELECT company_id FROM public.profiles WHERE id = auth.uid() AND role IN ('admin', 'super_admin')
        )
    );

-- Step 7: Helper function to get available ERP systems for a company
-- This checks permissions and current usage to determine what integrations can be added
CREATE OR REPLACE FUNCTION public.get_available_erp_systems(company_uuid UUID)
RETURNS TABLE (
    integration_type TEXT,
    is_enabled BOOLEAN,
    is_primary BOOLEAN,
    max_connections INTEGER,
    current_connections BIGINT,
    can_add_more BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    RETURN QUERY
    SELECT 
        cip.integration_type,
        cip.is_enabled,
        cip.is_primary,
        cip.max_connections,
        COALESCE(ci_count.current_count, 0) as current_connections,
        (cip.is_enabled AND COALESCE(ci_count.current_count, 0) < cip.max_connections) as can_add_more
    FROM public.company_integration_permissions cip
    LEFT JOIN (
        SELECT 
            integration_type,
            COUNT(*) as current_count
        FROM public.company_integrations 
        WHERE company_id = company_uuid
        GROUP BY integration_type
    ) ci_count ON ci_count.integration_type = cip.integration_type
    WHERE cip.company_id = company_uuid
    ORDER BY cip.is_primary DESC, cip.integration_type;
END;
$$;

-- Step 8: Helper function to check if a company can add a specific integration
CREATE OR REPLACE FUNCTION public.can_add_integration(company_uuid UUID, integration_type_param TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    permission_record RECORD;
    current_count INTEGER;
BEGIN
    -- Get permission record for this company and integration type
    SELECT * INTO permission_record
    FROM public.company_integration_permissions
    WHERE company_id = company_uuid AND integration_type = integration_type_param;
    
    -- If no permission record exists, deny access
    IF NOT FOUND THEN
        RETURN FALSE;
    END IF;
    
    -- If integration is disabled, deny access
    IF NOT permission_record.is_enabled THEN
        RETURN FALSE;
    END IF;
    
    -- Count current integrations of this type
    SELECT COUNT(*) INTO current_count
    FROM public.company_integrations
    WHERE company_id = company_uuid AND integration_type = integration_type_param;
    
    -- Check if under the limit
    RETURN current_count < permission_record.max_connections;
END;
$$;

-- Step 9: Grant necessary permissions
GRANT USAGE ON SCHEMA public TO authenticated;
GRANT ALL ON public.company_integration_permissions TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_available_erp_systems(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_add_integration(UUID, TEXT) TO authenticated;

-- Step 10: Create view for easy querying of company integration status
CREATE OR REPLACE VIEW public.company_integration_status AS
SELECT 
    cip.company_id,
    cip.integration_type,
    cip.is_enabled as permission_enabled,
    cip.is_primary as permission_primary,
    cip.max_connections as permission_max_connections,
    COUNT(ci.id) as active_connections,
    COUNT(CASE WHEN ci.status = 'active' THEN 1 END) as healthy_connections,
    COUNT(CASE WHEN ci.status = 'error' THEN 1 END) as error_connections,
    (cip.is_enabled AND COUNT(ci.id) < cip.max_connections) as can_add_more
FROM public.company_integration_permissions cip
LEFT JOIN public.company_integrations ci ON ci.company_id = cip.company_id AND ci.integration_type = cip.integration_type
GROUP BY cip.company_id, cip.integration_type, cip.is_enabled, cip.is_primary, cip.max_connections;

-- Grant access to the view
GRANT SELECT ON public.company_integration_status TO authenticated;
