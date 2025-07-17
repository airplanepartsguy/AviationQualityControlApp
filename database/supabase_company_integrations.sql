-- Company-level ERP integrations table for Supabase
-- This stores centralized configuration for Salesforce, SharePoint, etc.

CREATE TABLE IF NOT EXISTS company_integrations (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  integration_type TEXT NOT NULL CHECK (integration_type IN ('salesforce', 'sharepoint', 'sap', 'dynamics')),
  
  -- Configuration data (JSON)
  config JSONB NOT NULL DEFAULT '{}',
  
  -- Connection status
  status TEXT NOT NULL DEFAULT 'inactive' CHECK (status IN ('active', 'inactive', 'error', 'pending')),
  last_test_at TIMESTAMP WITH TIME ZONE,
  last_sync_at TIMESTAMP WITH TIME ZONE,
  error_message TEXT,
  
  -- Admin who configured this integration
  configured_by UUID REFERENCES profiles(id),
  configured_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  -- Metadata
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  -- Ensure one integration type per company
  UNIQUE(company_id, integration_type)
);

-- RLS policies
ALTER TABLE company_integrations ENABLE ROW LEVEL SECURITY;

-- Policy: Users can only access integrations for their company
CREATE POLICY "Users can access company integrations" ON company_integrations
  FOR ALL USING (
    company_id IN (
      SELECT company_id FROM profiles WHERE id = auth.uid()
    )
  );

-- Policy: Only admins can insert integrations
CREATE POLICY "Only admins can insert integrations" ON company_integrations
  FOR INSERT WITH CHECK (
    company_id IN (
      SELECT company_id FROM profiles 
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- Policy: Only admins can update integrations
CREATE POLICY "Only admins can update integrations" ON company_integrations
  FOR UPDATE USING (
    company_id IN (
      SELECT company_id FROM profiles 
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- Policy: Only admins can delete integrations
CREATE POLICY "Only admins can delete integrations" ON company_integrations
  FOR DELETE USING (
    company_id IN (
      SELECT company_id FROM profiles 
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- Indexes for performance
CREATE INDEX idx_company_integrations_company_id ON company_integrations(company_id);
CREATE INDEX idx_company_integrations_type ON company_integrations(integration_type);
CREATE INDEX idx_company_integrations_status ON company_integrations(status);

-- Example Salesforce configuration structure:
-- {
--   "instance_url": "https://yourcompany.salesforce.com",
--   "client_id": "your_connected_app_client_id",
--   "client_secret": "encrypted_client_secret",
--   "username": "integration@yourcompany.com",
--   "security_token": "encrypted_security_token",
--   "sandbox": false,
--   "api_version": "58.0",
--   "object_mappings": {
--     "photo_batch": "Custom_Photo_Batch__c",
--     "photo": "Custom_Photo__c"
--   },
--   "field_mappings": {
--     "batch_name": "Name",
--     "batch_type": "Type__c",
--     "photo_url": "Photo_URL__c"
--   }
-- }
