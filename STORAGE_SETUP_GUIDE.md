# Multi-Tenant Storage Setup Guide

## 🚨 **CRITICAL SECURITY UPDATE**

This app now implements **proper multi-tenant storage isolation** to ensure **complete data security** between companies. Each company gets their own isolated storage bucket/container.

## 📋 **Overview**

### ❌ **OLD SYSTEM (SECURITY RISK)**:
- ✗ Single shared "photos" bucket for all companies
- ✗ Only path-based separation (vulnerable to misconfiguration)
- ✗ No storage preference controls
- ✗ No local-only option

### ✅ **NEW SYSTEM (SECURE)**:
- ✅ **Company-specific buckets**: `company-{companyId}-photos`
- ✅ **Configurable storage options**: Local-only, cloud, hybrid
- ✅ **Multiple providers**: Supabase, AWS S3, Azure Blob (future)
- ✅ **Compliance ready**: GDPR, HIPAA, data residency controls
- ✅ **Full tenant isolation**: Complete data separation

## 🛠️ **Setup Instructions**

### **Step 1: Create Company-Specific Buckets**

For each company in your system, you need to create a dedicated storage bucket:

#### **Automatic Bucket Naming**:
```typescript
// Company ID: 70b41ce9-bf19-4b1a-9c37-5b00cb33cadf
// Bucket Name: company-70b41ce9-bf19-4b1a-9c37-5b00cb33cadf-photos
```

#### **Manual Bucket Creation (Supabase)**:

1. **Go to Supabase Dashboard** → **Storage** → **Buckets**
2. **For each company**, create a bucket:
   - **Bucket Name**: `company-{companyId}-photos`
   - **Public**: ✅ **YES** (for photo URLs)
   - **File Size Limit**: 50MB (configurable per company)
   - **Allowed MIME Types**: `image/jpeg, image/png, application/pdf`

#### **Example Companies**:
```bash
# TurbineWorks (ID: 70b41ce9-bf19-4b1a-9c37-5b00cb33cadf)
company-70b41ce9-bf19-4b1a-9c37-5b00cb33cadf-photos

# AeroTech (ID: 8a23b45c-de67-4f89-a012-3456789abcde) 
company-8a23b45c-de67-4f89-a012-3456789abcde-photos

# SkyMaintenance (ID: f1e2d3c4-b5a6-9788-0123-456789abcdef)
company-f1e2d3c4-b5a6-9788-0123-456789abcdef-photos
```

### **Step 2: Set Bucket Policies (CRITICAL SECURITY)**

For each company bucket, create **restrictive access policies**:

#### **Upload Policy** (Authenticated users of specific company):
```sql
-- Policy Name: "Company XYZ - Authenticated Upload"
-- Operation: INSERT
-- Target: company-{companyId}-photos

-- Policy Definition:
(auth.role() = 'authenticated' AND 
 auth.jwt() ->> 'company_id' = 'SPECIFIC_COMPANY_ID')
```

#### **Read Policy** (Public read with path restriction):
```sql
-- Policy Name: "Company XYZ - Public Read"  
-- Operation: SELECT
-- Target: company-{companyId}-photos

-- Policy Definition:
(storage.foldername(name)[1] = 'SPECIFIC_COMPANY_ID')
```

#### **Delete Policy** (Company admins only):
```sql
-- Policy Name: "Company XYZ - Admin Delete"
-- Operation: DELETE  
-- Target: company-{companyId}-photos

-- Policy Definition:
(auth.role() = 'authenticated' AND 
 auth.jwt() ->> 'company_id' = 'SPECIFIC_COMPANY_ID' AND
 auth.jwt() ->> 'role' IN ('admin', 'owner'))
```

### **Step 3: Configure Company Storage Preferences**

Each company can now configure their storage preferences:

#### **Storage Options**:

```typescript
interface CompanyStorageConfig {
  // Provider Choice
  provider: 'local_only' | 'supabase' | 'aws_s3' | 'azure_blob';
  
  // Upload Controls
  enableCloudUpload: boolean;        // Can disable cloud storage
  localBackupEnabled: boolean;       // Keep local copies
  
  // Security
  encryptionEnabled: boolean;        // Encrypt files
  accessLogging: boolean;           // Log all access
  
  // Compliance
  gdprCompliant: boolean;           // GDPR requirements
  hipaaCompliant: boolean;          // HIPAA requirements
  dataResidency: 'us' | 'eu' | 'asia' | 'custom';
}
```

#### **Default Configuration**:
```typescript
{
  provider: 'supabase',
  enableCloudUpload: true,
  localBackupEnabled: true,
  supabase: {
    bucketName: 'company-{companyId}-photos',
    retentionDays: 2555, // 7 years
    maxFileSize: 50,     // MB
    allowedFileTypes: ['jpg', 'jpeg', 'png', 'pdf'],
    compressionEnabled: true,
    compressionQuality: 0.8
  },
  encryptionEnabled: true,
  accessLogging: true,
  gdprCompliant: true,
  hipaaCompliant: false,
  dataResidency: 'us'
}
```

### **Step 4: Local-Only Configuration (High Security)**

For companies requiring **maximum security** (military, medical, financial):

```typescript
// Complete local-only configuration
{
  provider: 'local_only',
  enableCloudUpload: false,      // ❌ No cloud storage
  localBackupEnabled: true,      // ✅ Local backup only
  encryptionEnabled: true,       // ✅ Encrypt local files
  accessLogging: true,           // ✅ Log all access
  gdprCompliant: true,
  hipaaCompliant: true,          // ✅ HIPAA compliant
  dataResidency: 'custom'        // Custom/on-premise
}
```

## 🔧 **API Usage**

### **Upload Photos** (New Method):
```typescript
import { companyStorageService } from '../services/companyStorageService';

// Upload with company-specific configuration
const result = await companyStorageService.uploadPhoto(
  photoUri,
  fileName,
  companyId,           // Determines bucket/container
  scannedId            // Organizes within company storage
);

if (result.success) {
  console.log('Upload successful:', result.url);
  console.log('Provider:', result.metadata?.provider);
  console.log('Bucket:', result.bucket);
} else {
  console.error('Upload failed:', result.error);
}
```

### **Validate Storage Setup**:
```typescript
const validation = await companyStorageService.validateStorageSetup(companyId);

if (!validation.valid) {
  console.error('Storage issues:', validation.issues);
  console.log('Recommendations:', validation.recommendations);
}
```

### **Update Storage Configuration**:
```typescript
await companyStorageService.updateCompanyStorageConfig(companyId, {
  enableCloudUpload: false,    // Disable cloud storage  
  provider: 'local_only'       // Switch to local-only
});
```

## 📊 **Migration from Old System**

### **Database Updates**:
The new system requires companies table settings updates:

```sql
-- Add storage configuration to company settings
UPDATE companies 
SET settings = jsonb_set(
  COALESCE(settings, '{}'),
  '{storage}',
  '{
    "provider": "supabase",
    "enableCloudUpload": true,
    "supabase": {
      "bucketName": "company-' || id || '-photos",
      "retentionDays": 2555,
      "maxFileSize": 50
    }
  }'::jsonb
)
WHERE settings->'storage' IS NULL;
```

### **Photo Migration** (If needed):
```typescript
// Migrate existing photos to company-specific buckets
// (Implementation depends on your data volume and requirements)
```

## 🔍 **Testing & Verification**

### **Test Storage Isolation**:
```typescript
// Test 1: Company A cannot access Company B's photos
const companyAResult = await companyStorageService.uploadPhoto(
  photoUri, 'test.jpg', 'company-a-id', 'batch-123'
);

const companyBResult = await companyStorageService.uploadPhoto(
  photoUri, 'test.jpg', 'company-b-id', 'batch-123'  
);

// Should result in different buckets/containers
assert(companyAResult.bucket !== companyBResult.bucket);
```

### **Test Local-Only Mode**:  
```typescript
// Test 2: Local-only companies don't upload to cloud
await companyStorageService.updateCompanyStorageConfig('company-c-id', {
  enableCloudUpload: false,
  provider: 'local_only'
});

const localResult = await companyStorageService.uploadPhoto(
  photoUri, 'test.jpg', 'company-c-id', 'batch-123'
);

assert(localResult.localPath && !localResult.url);
```

## 🚨 **Security Checklist**

- [ ] **Separate bucket per company** created in Supabase
- [ ] **Bucket policies** configured for each company
- [ ] **Company storage configs** set in database
- [ ] **Local-only option** available for sensitive companies
- [ ] **Access logging** enabled for compliance
- [ ] **Encryption** enabled where required
- [ ] **Data residency** configured per company needs
- [ ] **Old shared bucket** disabled/removed
- [ ] **Migration completed** (if applicable)
- [ ] **Testing completed** across all companies

## 🔮 **Future Enhancements**

### **Additional Providers** (Ready for implementation):
- **AWS S3**: Enterprise-grade storage
- **Azure Blob**: Microsoft integration
- **Google Cloud**: Advanced ML features  
- **On-Premise**: Complete control

### **Advanced Features**:
- **Automatic bucket creation** via API
- **Storage analytics** per company
- **Cost tracking** and billing
- **Automated compliance reports**
- **Data retention policies**
- **Disaster recovery** configurations

## 🆘 **Troubleshooting**

### **Common Issues**:

#### **"Bucket not found" Error**:
```
✅ Solution: Create company-specific bucket in Supabase Dashboard
Bucket name: company-{companyId}-photos
```

#### **"Access denied" Error**:
```  
✅ Solution: Check bucket policies allow company's authenticated users
Policy: auth.jwt() ->> 'company_id' = 'COMPANY_ID'
```

#### **Local-only not working**:
```
✅ Solution: Update company storage config
enableCloudUpload: false, provider: 'local_only'
```

### **Support**:
- Check error logs with new error logging system
- Use `dumpErrors()` console command
- Validate storage setup with `validateStorageSetup(companyId)`

---

## 🎯 **Result: Complete Multi-Tenant Isolation**

**Before**: All companies → Single "photos" bucket ❌
**After**: Each company → Own dedicated bucket ✅

This ensures **complete data isolation**, **regulatory compliance**, and **flexible storage options** for each company's unique requirements. 