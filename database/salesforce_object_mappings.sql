-- Salesforce Object Mappings Table
-- Maps document ID prefixes to Salesforce objects for each company

CREATE TABLE IF NOT EXISTS salesforce_object_mappings (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    prefix VARCHAR(10) NOT NULL, -- e.g., "PO", "INV", "SO"
    salesforce_object VARCHAR(100) NOT NULL, -- e.g., "Purchase_Order__c", "Invoice__c"
    name_field VARCHAR(50) NOT NULL DEFAULT 'Name', -- Field to search by in Salesforce
    description TEXT,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Ensure unique prefix per company
    UNIQUE(company_id, prefix)
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_salesforce_object_mappings_company_id ON salesforce_object_mappings(company_id);
CREATE INDEX IF NOT EXISTS idx_salesforce_object_mappings_prefix ON salesforce_object_mappings(prefix);
CREATE INDEX IF NOT EXISTS idx_salesforce_object_mappings_active ON salesforce_object_mappings(is_active) WHERE is_active = true;

-- Row Level Security (RLS)
ALTER TABLE salesforce_object_mappings ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Users can access their company's object mappings" ON salesforce_object_mappings;
DROP POLICY IF EXISTS "Company admins can manage object mappings" ON salesforce_object_mappings;

-- Policy: Users can access mappings for their company
CREATE POLICY "Users can access their company's object mappings" ON salesforce_object_mappings
    FOR ALL USING (
        company_id IN (
            SELECT company_id 
            FROM profiles 
            WHERE id = auth.uid() 
            AND role IN ('super_admin', 'admin')
        )
    );

-- Policy: Company admins can manage object mappings
CREATE POLICY "Company admins can manage object mappings" ON salesforce_object_mappings
    FOR ALL USING (
        company_id IN (
            SELECT company_id 
            FROM profiles 
            WHERE id = auth.uid() 
            AND role IN ('super_admin', 'admin')
        )
    );

-- Insert default mappings for existing companies (optional)
-- This can be run manually or as part of a migration

-- Example default mappings (uncomment to use):
/*
INSERT INTO salesforce_object_mappings (company_id, prefix, salesforce_object, name_field, description, is_active)
SELECT 
    c.id as company_id,
    mapping.prefix,
    mapping.salesforce_object,
    mapping.name_field,
    mapping.description,
    mapping.is_active
FROM companies c
CROSS JOIN (
    VALUES 
        ('PO', 'Purchase_Order__c', 'Name', 'Purchase Orders', true),
        ('INV', 'Invoice__c', 'Name', 'Invoices', true),
        ('SO', 'Sales_Order__c', 'Name', 'Sales Orders', true),
        ('WO', 'Work_Order__c', 'Name', 'Work Orders', true),
        ('QC', 'Quality_Control__c', 'Name', 'Quality Control Records', true)
) AS mapping(prefix, salesforce_object, name_field, description, is_active)
ON CONFLICT (company_id, prefix) DO NOTHING;
*/

-- Function to automatically update the updated_at timestamp
CREATE OR REPLACE FUNCTION update_salesforce_object_mappings_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Drop existing trigger if it exists
DROP TRIGGER IF EXISTS update_salesforce_object_mappings_updated_at ON salesforce_object_mappings;

-- Trigger to automatically update updated_at
CREATE TRIGGER update_salesforce_object_mappings_updated_at
    BEFORE UPDATE ON salesforce_object_mappings
    FOR EACH ROW
    EXECUTE FUNCTION update_salesforce_object_mappings_updated_at();
