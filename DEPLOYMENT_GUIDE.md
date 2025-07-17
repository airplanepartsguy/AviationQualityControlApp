# Aviation Quality Control App - Deployment Guide

## 🚀 Production Deployment Checklist

### **Pre-Deployment Validation ✅**
- [x] Authentication system unified and tested
- [x] React Native Expo architecture validated
- [x] Supabase RLS policies and multi-tenant security confirmed
- [x] Single-device license enforcement implemented
- [x] Salesforce integration framework ready

---

## 📋 **1. Environment Setup**

### **Required Environment Variables**
```bash
# Supabase Configuration (Already Set)
EXPO_PUBLIC_SUPABASE_URL=https://luwlvmcixwdtuaffamgk.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...

# Salesforce Integration (To Be Updated)
N8N_WEBHOOK_URL=https://your-n8n-instance.com/webhook/salesforce-sync
```

### **Dependencies Status**
- ✅ React Native Expo SDK
- ✅ Supabase Client with SecureStore
- ✅ Camera and Media Library permissions
- ✅ Network connectivity monitoring
- ✅ Offline sync queue management

---

## 🔧 **2. Salesforce Connected App Setup**

### **Customer-Side Configuration**

#### **Step 1: Create Connected App in Salesforce**
1. Navigate to **Setup** → **App Manager** → **New Connected App**
2. Configure Basic Information:
   ```
   Connected App Name: Aviation Quality Control Integration
   API Name: Aviation_QC_Integration
   Contact Email: [customer-admin-email]
   ```

#### **Step 2: OAuth Settings**
```
Enable OAuth Settings: ✓
Callback URL: https://your-n8n-instance.com/oauth/callback
Selected OAuth Scopes:
  - Access and manage your data (api)
  - Perform requests on your behalf at any time (refresh_token, offline_access)
  - Access your basic information (id, profile, email, address, phone)
```

#### **Step 3: API Permissions**
```
Required Permissions:
  - Create, Read, Update custom objects
  - Access to Attachment/Document objects
  - File upload permissions
```

#### **Step 4: Generate Credentials**
After creation, note down:
- **Consumer Key** (Client ID)
- **Consumer Secret** (Client Secret)

---

## 🔄 **3. n8n Workflow Configuration**

### **Workflow Architecture**
```
Mobile App → n8n Webhook → Salesforce API
     ↓
Offline Queue → Retry Logic → Success/Failure Logging
```

### **Required n8n Nodes**
1. **Webhook Trigger**: Receive data from mobile app
2. **Salesforce OAuth**: Authenticate with customer's org
3. **Data Transformation**: Map mobile data to Salesforce objects
4. **File Upload**: Handle photo attachments
5. **Error Handling**: Manage failures and retries
6. **Response**: Send success/failure back to app

### **Sample n8n Workflow JSON**
```json
{
  "name": "Aviation QC Salesforce Sync",
  "nodes": [
    {
      "name": "Webhook",
      "type": "n8n-nodes-base.webhook",
      "parameters": {
        "path": "salesforce-sync",
        "httpMethod": "POST"
      }
    },
    {
      "name": "Salesforce",
      "type": "n8n-nodes-base.salesforce",
      "parameters": {
        "authentication": "oAuth2",
        "resource": "attachment",
        "operation": "create"
      }
    }
  ]
}
```

---

## 📱 **4. Mobile App Configuration**

### **Update Salesforce Config**
```typescript
// src/config/salesforceConfig.ts
export const N8N_WEBHOOK_URL = 'https://[customer-n8n-instance].com/webhook/salesforce-sync';

export const SALESFORCE_CONFIG = {
  endpoint: N8N_WEBHOOK_URL,
  MAX_RETRY_ATTEMPTS: 3,
  SYNC_INTERVAL: 60000, // 60 seconds
  AUTO_SYNC: true,
  NETWORK_RECOVERY_DELAY: 5000,
  BATCH_SIZE: 5,
  STORAGE_QUOTA_MB: 50,
};
```

### **Build Configuration**
```json
// app.json
{
  "expo": {
    "name": "Aviation Quality Control",
    "slug": "aviation-qc",
    "version": "1.0.0",
    "platforms": ["ios", "android"],
    "permissions": [
      "CAMERA",
      "MEDIA_LIBRARY",
      "LOCATION"
    ]
  }
}
```

---

## 🧪 **5. Testing Procedures**

### **Authentication Testing**
- [ ] User registration with company assignment
- [ ] Single-device login enforcement
- [ ] Role-based access (admin vs member)
- [ ] License limit validation

### **Core Functionality Testing**
- [ ] Photo capture with GPS metadata
- [ ] Barcode scanning for batch creation
- [ ] Batch management and organization
- [ ] Offline photo storage and sync queue

### **Salesforce Integration Testing**
- [ ] Online sync to Salesforce via n8n
- [ ] Offline queue management
- [ ] Network recovery and retry logic
- [ ] Error handling and logging

### **Multi-Tenant Testing**
- [ ] Company data isolation
- [ ] Admin dashboard functionality
- [ ] License management interface
- [ ] User invitation system

---

## 🚀 **6. Deployment Steps**

### **Phase 1: Infrastructure Setup**
1. Configure customer's Salesforce Connected App
2. Set up n8n instance with workflow
3. Update mobile app configuration
4. Test integration in staging environment

### **Phase 2: Mobile App Deployment**
```bash
# Build for iOS
expo build:ios

# Build for Android
expo build:android

# Or use EAS Build (recommended)
eas build --platform all
```

### **Phase 3: User Onboarding**
1. Create initial company and admin user in Supabase
2. Configure license limits
3. Distribute app to authorized devices
4. Provide admin training on license management

---

## 📊 **7. Monitoring & Maintenance**

### **Key Metrics to Monitor**
- Active device count vs license limits
- Sync success/failure rates
- Photo storage usage
- Network connectivity issues
- User authentication patterns

### **Maintenance Tasks**
- Regular sync log review
- License usage monitoring
- Supabase storage cleanup
- n8n workflow performance optimization

---

## 🔒 **8. Security Considerations**

### **Data Protection**
- All photos encrypted at rest in Supabase Storage
- RLS policies enforce company data isolation
- Single-device authentication prevents license abuse
- Secure token storage using Expo SecureStore

### **Network Security**
- HTTPS-only communication
- OAuth 2.0 for Salesforce authentication
- Webhook endpoint validation
- Rate limiting on API endpoints

---

## 📞 **9. Support & Troubleshooting**

### **Common Issues**
1. **Sync Failures**: Check n8n workflow logs and Salesforce API limits
2. **License Exceeded**: Review active devices in admin dashboard
3. **Photo Upload Issues**: Verify Supabase storage permissions
4. **Authentication Problems**: Check Supabase RLS policies

### **Support Contacts**
- Technical Support: [your-support-email]
- Salesforce Integration: [salesforce-specialist-email]
- Emergency Contact: [emergency-contact]

---

## ✅ **Deployment Completion Checklist**

- [ ] Salesforce Connected App configured
- [ ] n8n workflow deployed and tested
- [ ] Mobile app built and distributed
- [ ] Initial users and licenses configured
- [ ] Integration testing completed
- [ ] Monitoring systems active
- [ ] Support documentation provided
- [ ] User training completed

---

*Last Updated: January 2025*
*Version: 1.0.0*
