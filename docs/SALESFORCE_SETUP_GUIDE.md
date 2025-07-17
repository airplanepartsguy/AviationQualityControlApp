# Salesforce OAuth Integration Setup Guide

## Overview

This guide provides step-by-step instructions for setting up Salesforce OAuth integration in the Aviation Quality Control App. The integration uses company-level OAuth configuration, allowing admins to configure once and all company users to benefit from the integration.

## Architecture

- **Direct OAuth Integration**: No third-party services like n8n required
- **Company-Level Configuration**: Each company admin configures once
- **Secure Token Storage**: OAuth tokens stored securely with Expo SecureStore
- **Multi-Tenant Support**: Company-isolated configurations and data
- **Custom Objects**: Uses Custom_Batch__c and Custom_Photo__c in Salesforce

## Prerequisites

1. **Salesforce Org**: Production or Sandbox Salesforce organization
2. **Admin Access**: System Administrator privileges in Salesforce
3. **App License**: Premium or Enterprise license in Aviation QC App
4. **Company Admin Role**: Admin role in the Aviation QC App

## Part 1: Salesforce Connected App Setup

### Step 1: Create Connected App in Salesforce

1. **Login to Salesforce**
   - Go to your Salesforce org (production or sandbox)
   - Login with System Administrator credentials

2. **Navigate to App Manager**
   - Click the gear icon (Setup) in the top right
   - In Quick Find, search for "App Manager"
   - Click "App Manager" under Apps

3. **Create New Connected App**
   - Click "New Connected App" button
   - Fill in Basic Information:
     - **Connected App Name**: `Aviation Quality Control Integration`
     - **API Name**: `Aviation_Quality_Control_Integration`
     - **Contact Email**: Your admin email address
     - **Description**: `OAuth integration for Aviation Quality Control mobile app`

### Step 2: Configure OAuth Settings

1. **Enable OAuth Settings**
   - Check "Enable OAuth Settings"
   - **Callback URL**: `https://luwlvmcixwdtuaffamgk.supabase.co/functions/v1/salesforce-oauth-callback`
   
2. **Selected OAuth Scopes**
   Add these scopes (move from Available to Selected):
   - `Access and manage your data (api)`
   - `Perform requests on your behalf at any time (refresh_token, offline_access)`
   - `Access your basic information (id, profile, email, address, phone)`

3. **Additional OAuth Settings**
   - **Require Secret for Web Server Flow**: Checked
   - **Require Secret for Refresh Token Flow**: Checked
   - **Enable PKCE**: Checked (recommended for mobile apps)

### Step 3: Configure Security Settings

1. **IP Relaxation**
   - Set "IP Relaxation" to "Relax IP restrictions"
   - This allows mobile app access from various networks

2. **Refresh Token Policy**
   - Set "Refresh Token Policy" to "Refresh token is valid until revoked"
   - This ensures long-term access for mobile users

3. **Save the Connected App**
   - Click "Save"
   - Note: It may take 2-10 minutes for changes to take effect

### Step 4: Retrieve OAuth Credentials

1. **Get Consumer Key and Secret**
   - After saving, you'll see the Connected App details
   - Copy the **Consumer Key** (Client ID)
   - Click "Click to reveal" next to Consumer Secret and copy it
   - **IMPORTANT**: Store these securely - you'll need them for app configuration

2. **Note Your Instance URL**
   - Your Salesforce instance URL (e.g., `https://yourcompany.my.salesforce.com`)
   - For sandbox: `https://yourcompany--sandbox.sandbox.my.salesforce.com`

## Part 2: Custom Objects Setup

### Step 1: Create Custom Batch Object

1. **Navigate to Object Manager**
   - In Setup, search for "Object Manager"
   - Click "Object Manager"

2. **Create Custom Object**
   - Click "Create" → "Custom Object"
   - **Label**: `Custom Batch`
   - **Plural Label**: `Custom Batches`
   - **Object Name**: `Custom_Batch`
   - **Record Name**: `Batch Name`
   - **Data Type**: Text
   - Check "Allow Reports", "Allow Activities", "Allow Search"
   - Click "Save"

3. **Add Custom Fields**
   Create these custom fields on the Custom_Batch__c object:
   
   ```
   Field Label: Reference ID
   Field Name: Reference_ID__c
   Data Type: Text(255)
   Required: Yes
   
   Field Label: Order Number
   Field Name: Order_Number__c
   Data Type: Text(255)
   
   Field Label: Inventory ID
   Field Name: Inventory_ID__c
   Data Type: Text(255)
   
   Field Label: Status
   Field Name: Status__c
   Data Type: Picklist
   Values: Pending, In Progress, Completed, Synced
   Default: Pending
   
   Field Label: Photo Count
   Field Name: Photo_Count__c
   Data Type: Number(18,0)
   Default: 0
   
   Field Label: Created By User
   Field Name: Created_By_User__c
   Data Type: Text(255)
   
   Field Label: Company ID
   Field Name: Company_ID__c
   Data Type: Text(255)
   Required: Yes
   
   Field Label: Sync Status
   Field Name: Sync_Status__c
   Data Type: Picklist
   Values: Pending, Synced, Error
   Default: Pending
   ```

### Step 2: Create Custom Photo Object

1. **Create Custom Photo Object**
   - **Label**: `Custom Photo`
   - **Plural Label**: `Custom Photos`
   - **Object Name**: `Custom_Photo`
   - **Record Name**: `Photo Name`

2. **Add Custom Fields**
   Create these custom fields on the Custom_Photo__c object:
   
   ```
   Field Label: Batch
   Field Name: Batch__c
   Data Type: Lookup(Custom_Batch__c)
   Required: Yes
   
   Field Label: Photo Title
   Field Name: Photo_Title__c
   Data Type: Text(255)
   
   Field Label: Part Number
   Field Name: Part_Number__c
   Data Type: Text(255)
   
   Field Label: Photo Type
   Field Name: Photo_Type__c
   Data Type: Picklist
   Values: General, Data Plate, Defect, Compliance, Before, After, Detail, Overview, Documentation
   
   Field Label: File URL
   Field Name: File_URL__c
   Data Type: URL(255)
   
   Field Label: Metadata JSON
   Field Name: Metadata_JSON__c
   Data Type: Long Text Area(32768)
   
   Field Label: Location Data
   Field Name: Location_Data__c
   Data Type: Text(255)
   
   Field Label: Timestamp
   Field Name: Timestamp__c
   Data Type: Date/Time
   
   Field Label: Company ID
   Field Name: Company_ID__c
   Data Type: Text(255)
   Required: Yes
   ```

## Part 3: App Configuration

### Step 1: Configure in Aviation QC App

1. **Access Salesforce Configuration**
   - Open Aviation Quality Control App
   - Login as company admin
   - Navigate to ERP Integration screen
   - Tap "Configure" next to Salesforce

2. **Enter OAuth Credentials**
   - **Client ID**: Enter the Consumer Key from Salesforce
   - **Client Secret**: Enter the Consumer Secret from Salesforce
   - **Instance URL**: Enter your Salesforce instance URL
   - **Sandbox**: Toggle ON if using Salesforce Sandbox
   - **Redirect URI**: Use default or customize for production

3. **Test Connection**
   - Tap "Test Connection" to verify credentials
   - Should show "Connection successful" message

4. **Authenticate**
   - Tap "Authenticate with Salesforce"
   - You'll be redirected to Salesforce login
   - Login with your Salesforce credentials
   - Grant permissions to the app
   - You'll be redirected back to the app

### Step 2: Configure Field Mapping

1. **Batch Field Mapping**
   Configure how app data maps to Salesforce fields:
   ```
   App Field → Salesforce Field
   Reference ID → Reference_ID__c
   Order Number → Order_Number__c
   Inventory ID → Inventory_ID__c
   Status → Status__c
   Photo Count → Photo_Count__c
   User ID → Created_By_User__c
   Company ID → Company_ID__c
   ```

2. **Photo Field Mapping**
   ```
   App Field → Salesforce Field
   Photo Title → Photo_Title__c
   Part Number → Part_Number__c
   Photo Type → Photo_Type__c
   File URL → File_URL__c
   Metadata → Metadata_JSON__c
   Location → Location_Data__c
   Timestamp → Timestamp__c
   Company ID → Company_ID__c
   ```

## Part 4: Testing the Integration

### Step 1: Test Data Sync

1. **Create Test Batch**
   - In the Aviation QC App, create a new photo batch
   - Add some photos to the batch
   - Complete the batch

2. **Sync to Salesforce**
   - Navigate to ERP Integration screen
   - Tap "Sync Now" for Salesforce
   - Check sync status and logs

3. **Verify in Salesforce**
   - Go to Salesforce
   - Navigate to Custom Batches tab
   - Verify the batch was created with correct data
   - Check related Custom Photos records

### Step 2: Test Error Handling

1. **Test Invalid Credentials**
   - Temporarily change Client Secret to invalid value
   - Attempt sync - should show authentication error
   - Restore correct credentials

2. **Test Network Issues**
   - Disable internet connection
   - Attempt sync - should queue for later
   - Re-enable internet - should auto-sync

## Part 5: Production Deployment

### Step 1: Update Redirect URI

1. **For Production App**
   - Update Connected App in Salesforce
   - Change Callback URL to production scheme
   - Example: `aviationqc://oauth/callback`

2. **Update App Configuration**
   - Update redirect URI in app configuration
   - Test OAuth flow with production URLs

### Step 2: Security Considerations

1. **IP Restrictions**
   - Consider enabling IP restrictions for production
   - Add your company's IP ranges if needed

2. **User Permissions**
   - Create custom permission sets for integration users
   - Limit access to only necessary objects and fields

3. **Monitoring**
   - Set up login history monitoring
   - Monitor API usage limits
   - Set up alerts for failed authentications

## Troubleshooting

### Common Issues

1. **"Invalid Client" Error**
   - Verify Client ID and Secret are correct
   - Ensure Connected App is deployed (wait 2-10 minutes)
   - Check if sandbox/production URLs match

2. **"Redirect URI Mismatch" Error**
   - Verify Callback URL in Connected App matches app configuration
   - For development: `exp://127.0.0.1:19000/--/oauth/callback`
   - For production: Your custom app scheme

3. **"Insufficient Privileges" Error**
   - Verify user has access to Custom Objects
   - Check field-level security settings
   - Ensure user has API access enabled

4. **Token Refresh Issues**
   - Check refresh token policy in Connected App
   - Verify "offline_access" scope is included
   - Check token expiration settings

### Debug Steps

1. **Enable Debug Logging**
   - In app, enable debug mode for Salesforce integration
   - Check console logs for detailed error messages

2. **Check Salesforce Debug Logs**
   - In Salesforce Setup, go to Debug Logs
   - Create debug log for integration user
   - Monitor API calls and responses

3. **Verify Object Permissions**
   - Check user profile has CRUD access to Custom Objects
   - Verify field-level security allows read/write access

## Support

For technical support with the integration:

1. **App Issues**: Contact Aviation QC App support
2. **Salesforce Issues**: Contact your Salesforce administrator
3. **OAuth Issues**: Check Salesforce Connected App documentation

## Security Best Practices

1. **Credential Management**
   - Never hardcode credentials in the app
   - Use secure storage for tokens
   - Rotate secrets regularly

2. **Access Control**
   - Use principle of least privilege
   - Regular access reviews
   - Monitor API usage

3. **Data Protection**
   - Encrypt sensitive data in transit and at rest
   - Implement proper error handling
   - Log security events

---

**Last Updated**: January 2025
**Version**: 1.0
**Compatible with**: Aviation Quality Control App v2.0+
