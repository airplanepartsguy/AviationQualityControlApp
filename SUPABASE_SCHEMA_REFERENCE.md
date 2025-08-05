# Supabase Schema Reference for Aviation QC App

## ✅ Fixed Migration Scripts

1. **`add_erp_upload_tracking.sql`** - Fixed to use `p.full_name` instead of `p.name`
2. **`create_integration_errors_table.sql`** - Fixed to use `batch_id BIGINT` instead of UUID

## 📊 Actual Database Schema

### photo_batches
```sql
id: BIGSERIAL (BIGINT) -- NOT UUID!
company_id: UUID
user_id: UUID -- NOT created_by!
type: batch_type
order_number: TEXT
inventory_id: TEXT
status: TEXT -- NOT sync_status!
created_at: TIMESTAMPTZ
updated_at: TIMESTAMPTZ

-- New columns added by migration:
erp_uploaded: BOOLEAN
erp_uploaded_at: TIMESTAMPTZ
erp_uploaded_by: UUID
erp_record_ids: JSONB
erp_upload_error: TEXT
```

### profiles
```sql
id: UUID (same as auth.users.id)
company_id: UUID
role: user_role
full_name: TEXT -- NOT name!
updated_at: TIMESTAMPTZ
created_at: TIMESTAMPTZ
```

### oauth_tokens
```sql
id: UUID
company_id: UUID
integration_type: TEXT
access_token: TEXT
refresh_token: TEXT
instance_url: TEXT
token_data: JSONB
expires_at: TIMESTAMPTZ
created_at: TIMESTAMPTZ
updated_at: TIMESTAMPTZ
```

### companies
```sql
id: UUID
name: TEXT
code: TEXT
industry: TEXT
subscription_plan: subscription_plan
subscription_status: subscription_status
license_count: INTEGER
created_at: TIMESTAMPTZ
updated_at: TIMESTAMPTZ
```

## 🔍 Key Points for App-Database Compatibility

### 1. **Column Name Mappings**
- Mobile App (SQLite) uses camelCase: `userId`, `companyId`, `batchId`
- Supabase uses snake_case: `user_id`, `company_id`, `batch_id`
- The sync process handles this conversion automatically

### 2. **Data Type Considerations**
- `photo_batches.id` is BIGINT (comes as string in JSON)
- All company/user IDs are UUID
- Dates are TIMESTAMPTZ in Supabase

### 3. **RLS Policy Dependencies**
The app relies on these RLS patterns:
```sql
-- Users can only see their company's data
company_id IN (
    SELECT company_id FROM profiles WHERE id = auth.uid()
)
```

### 4. **Service Interactions**

#### companySalesforceTokenService
```typescript
// Queries oauth_tokens table
SELECT * FROM oauth_tokens 
WHERE company_id = ? AND integration_type = 'salesforce'
```

#### erpSyncService
```typescript
// Updates photo_batches
UPDATE photo_batches 
SET erp_uploaded = true, erp_uploaded_at = NOW()
WHERE id = ?

// Checks upload status
SELECT erp_uploaded FROM photo_batches WHERE id = ?
```

#### salesforceObjectMappingService
```typescript
// Gets mappings
SELECT * FROM salesforce_object_mappings
WHERE company_id = ? AND is_active = true
```

## 🚀 Next Steps

1. **Run the fixed migration**:
```sql
-- This should now work without errors
psql $DATABASE_URL < database/add_erp_upload_tracking.sql
```

2. **Verify with test queries**:
```sql
-- Run these test scripts
psql $DATABASE_URL < database/test_app_database_compatibility.sql
psql $DATABASE_URL < database/verify_rls_policies.sql
```

3. **Initialize object mappings** (if not done):
```typescript
// In your app or via Supabase dashboard
await salesforceObjectMappingService.initializeDefaultMappings(companyId);
```

## ⚠️ Common Pitfalls

1. **Don't assume column names** - Always check the actual schema
2. **BIGINT vs UUID** - photo_batches.id is BIGINT, not UUID
3. **Snake_case in Supabase** - Always use underscore notation
4. **RLS is critical** - Ensure it's enabled on all tables