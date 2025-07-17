-- TurbineWorks Salesforce Object Mappings
-- Insert object mappings for TurbineWorks company

INSERT INTO salesforce_object_mappings (company_id, prefix, salesforce_object, name_field, description, is_active)
VALUES 
  ('70b41ce9-bf19-4b1a-9c37-5b00cb33cadf', 'RLS', 'inscor__Release__c', 'Name', 'Release Records', true),
  ('70b41ce9-bf19-4b1a-9c37-5b00cb33cadf', 'RLSL', 'inscor__Release_Line__c', 'Name', 'Release Line Records', true),
  ('70b41ce9-bf19-4b1a-9c37-5b00cb33cadf', 'PO', 'inscor__Purchase_Order__c', 'Name', 'Purchase Orders', true),
  ('70b41ce9-bf19-4b1a-9c37-5b00cb33cadf', 'POL', 'inscor__Purchase_Order_Line__c', 'Name', 'Purchase Order Lines', true),
  ('70b41ce9-bf19-4b1a-9c37-5b00cb33cadf', 'SO', 'inscor__Sales_Order__c', 'Name', 'Sales Orders', true),
  ('70b41ce9-bf19-4b1a-9c37-5b00cb33cadf', 'SOL', 'inscor__Sales_Order_Line__c', 'Name', 'Sales Order Lines', true),
  ('70b41ce9-bf19-4b1a-9c37-5b00cb33cadf', 'INV', 'inscor__Inventory_Line__c', 'Name', 'Inventory Lines', true),
  ('70b41ce9-bf19-4b1a-9c37-5b00cb33cadf', 'RO', 'inscor__Repair_Order__c', 'Name', 'Repair Orders', true),
  ('70b41ce9-bf19-4b1a-9c37-5b00cb33cadf', 'ROL', 'inscor__Repair_Order_Line__c', 'Name', 'Repair Order Lines', true),
  ('70b41ce9-bf19-4b1a-9c37-5b00cb33cadf', 'WO', 'inscor__Work_Order__c', 'Name', 'Work Orders', true),
  ('70b41ce9-bf19-4b1a-9c37-5b00cb33cadf', 'INVC', 'inscor__Invoice__c', 'Name', 'Invoices', true),
  ('70b41ce9-bf19-4b1a-9c37-5b00cb33cadf', 'RMA', 'inscor__RMA__c', 'Name', 'RMA Records', true),
  ('70b41ce9-bf19-4b1a-9c37-5b00cb33cadf', 'INVCL', 'inscor__Invoice_Line__c', 'Name', 'Invoice Lines', true)
ON CONFLICT (company_id, prefix) DO NOTHING;

-- Verify the mappings were inserted
SELECT prefix, salesforce_object, description 
FROM salesforce_object_mappings 
WHERE company_id = '70b41ce9-bf19-4b1a-9c37-5b00cb33cadf'
ORDER BY prefix;
