# Salesforce Integration Setup Guide

This guide explains how to set up Salesforce integration for the Aviation Quality Control App using OAuth 2.0 authentication.

## Overview

The app uses a **company-level OAuth integration** where:
- Company admins configure the Salesforce connection once per company
- All users in the company share the same Salesforce integration
- No user passwords are stored - only OAuth tokens
- Supports both Salesforce Production and Sandbox environments

## Salesforce Connected App Setup

### Step 1: Create Connected App in Salesforce

1. **Login to your Salesforce org** (Production or Sandbox)
2. **Navigate to Setup** → App Manager
3. **Click "New Connected App"**
4. **Fill in Basic Information:**
   - Connected App Name: `Aviation Quality Control App`
   - API Name: `Aviation_Quality_Control_App`
   - Contact Email: Your admin email
   - Description: `Mobile app integration for aviation quality control data`

### Step 2: Configure OAuth Settings

1. **Enable OAuth Settings:** Check "Enable OAuth Settings"
2. **Callback URL:** Add these URLs:
   ```
   exp://localhost:8081/--/salesforce-oauth
   https://your-app-domain.com/salesforce-oauth
   ```
3. **Selected OAuth Scopes:** Add these scopes:
   - `Access and manage your data (api)`
   - `Perform requests on your behalf at any time (refresh_token, offline_access)`
   - `Access your basic information (id, profile, email, address, phone)`

### Step 3: Security Settings

1. **Client Credentials Flow:** Leave unchecked
2. **Require Secret for Web Server Flow:** Check this
3. **Require Secret for Refresh Token Flow:** Check this
4. **Enable PKCE:** Check this (recommended for mobile apps)
5. **IP Relaxation:** Set to "Relax IP restrictions"

### Step 4: Get Client Credentials

After saving the Connected App:
1. **Consumer Key (Client ID):** Copy this value
2. **Consumer Secret (Client Secret):** Click "Click to reveal" and copy
3. **Save these values** - you'll need them in the app configuration

## Custom Objects Setup

### Step 1: Create Custom Objects

Create these custom objects in Salesforce:

#### Custom Batch Object (`Custom_Batch__c`)
```
Object Label: Custom Batch
Object Name: Custom_Batch__c
Record Name: Batch Name
Data Type: Text
```

**Custom Fields:**
- `Type__c` (Picklist): Batch type values
- `Status__c` (Picklist): Active, Completed, Archived
- `Created_Date__c` (Date/Time): When batch was created
- `Location__c` (Text): Batch location/facility

#### Custom Photo Object (`Custom_Photo__c`)
```
Object Label: Custom Photo
Object Name: Custom_Photo__c
Record Name: Photo Name
Data Type: Text
```

**Custom Fields:**
- `Photo_URL__c` (URL): Link to photo file
- `Type__c` (Text): Photo type/category
- `Batch__c` (Lookup): Relationship to Custom_Batch__c
- `Metadata__c` (Long Text Area): JSON metadata

### Step 2: Set Permissions

1. **Create Permission Set:** "Aviation Quality Control Integration"
2. **Object Permissions:**
   - Custom_Batch__c: Read, Create, Edit, Delete
   - Custom_Photo__c: Read, Create, Edit, Delete
3. **Assign to Integration User**

## App Configuration

### Step 1: Configure in App

In the Aviation Quality Control App:

1. **Navigate to:** Settings → Integrations → Salesforce
2. **Enter Configuration:**
   - **Client ID:** Your Consumer Key from Connected App
   - **Client Secret:** Your Consumer Secret from Connected App
   - **Instance URL:** Your Salesforce instance URL
     - Production: `https://your-domain.my.salesforce.com`
     - Sandbox: `https://your-domain--sandbox.my.salesforce.com`
   - **Sandbox:** Check if using Sandbox environment

### Step 2: Authenticate

1. **Click "Authenticate with Salesforce"**
2. **Login to Salesforce** when redirected
3. **Grant Permissions** to the app
4. **Return to App** - authentication should complete automatically

### Step 3: Test Connection

1. **Click "Test Connection"** in the app
2. **Verify Success** - should show green status
3. **Test Data Sync** with a sample batch

## Data Flow

### Sync Process
```
App Batch Created → Local Storage → Sync to Salesforce → Custom_Batch__c Record
App Photos Added → Local Storage → Sync to Salesforce → Custom_Photo__c Records
```

### Field Mapping
```
App Field           → Salesforce Field
batch.name          → Custom_Batch__c.Name
batch.type          → Custom_Batch__c.Type__c
batch.status        → Custom_Batch__c.Status__c
batch.created_at    → Custom_Batch__c.Created_Date__c
batch.location      → Custom_Batch__c.Location__c

photo.name          → Custom_Photo__c.Name
photo.url           → Custom_Photo__c.Photo_URL__c
photo.type          → Custom_Photo__c.Type__c
photo.batch_id      → Custom_Photo__c.Batch__c
photo.metadata      → Custom_Photo__c.Metadata__c
```

## Security Considerations

### OAuth Token Management
- **Access Tokens:** Automatically refreshed (2-hour expiry)
- **Refresh Tokens:** Stored securely using Expo SecureStore
- **Token Revocation:** Supported for disconnecting integration

### Data Security
- **No Password Storage:** Only OAuth tokens stored
- **Company Isolation:** Each company has separate integration
- **Admin Only:** Only company admins can configure integration
- **Encrypted Storage:** All tokens encrypted at rest

## Troubleshooting

### Common Issues

1. **"Invalid Client" Error**
   - Verify Client ID and Secret are correct
   - Check Connected App is deployed and active

2. **"Redirect URI Mismatch"**
   - Ensure callback URLs match exactly in Connected App
   - Check for trailing slashes or case sensitivity

3. **"Insufficient Privileges"**
   - Verify user has access to custom objects
   - Check permission sets are assigned correctly

4. **"Invalid Grant" on Token Refresh**
   - Refresh token may be expired or revoked
   - Re-authenticate through the app

### Debug Steps

1. **Check Salesforce Setup Audit Trail** for Connected App changes
2. **Review App Logs** for detailed error messages
3. **Test API Access** using Salesforce Workbench
4. **Verify Object Permissions** in Salesforce Setup

## Production Deployment

### Pre-Deployment Checklist
- [ ] Connected App configured in Production org
- [ ] Custom objects and fields created
- [ ] Permission sets configured and assigned
- [ ] Callback URLs updated for production domain
- [ ] Client credentials securely stored
- [ ] Integration tested end-to-end

### Monitoring
- Monitor OAuth token refresh rates
- Track sync success/failure rates
- Set up Salesforce login history monitoring
- Configure app error logging and alerts

## Support

For technical support:
- Check app logs for detailed error messages
- Review Salesforce Setup Audit Trail
- Contact your Salesforce administrator for org-specific issues
- Refer to Salesforce OAuth 2.0 documentation for advanced troubleshooting
