# Salesforce OAuth Production Deployment Guide

## 🚀 **Production-Ready OAuth Architecture**

This guide explains how to deploy the Salesforce OAuth integration for production using Supabase Edge Functions as the callback endpoint.

## 📋 **Architecture Overview**

```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   Mobile App    │    │   Salesforce     │    │   Supabase      │
│                 │    │   OAuth Server   │    │   Edge Function │
└─────────────────┘    └──────────────────┘    └─────────────────┘
         │                        │                        │
         │ 1. Initiate OAuth      │                        │
         │───────────────────────▶│                        │
         │                        │                        │
         │                        │ 2. User Authorizes     │
         │                        │                        │
         │                        │ 3. Redirect to Callback│
         │                        │───────────────────────▶│
         │                        │                        │
         │                        │                        │ 4. Store Auth Code
         │                        │                        │    in Database
         │                        │                        │
         │ 5. Deep Link Redirect  │                        │
         │◀───────────────────────────────────────────────│
         │                        │                        │
         │ 6. Retrieve Auth Code  │                        │
         │───────────────────────────────────────────────▶│
         │                        │                        │
         │ 7. Exchange for Tokens │                        │
         │───────────────────────▶│                        │
```

## 🔧 **Deployment Steps**

### **Step 1: Deploy Supabase Edge Function**

1. **Install Supabase CLI** (if not already installed):
   ```bash
   npm install -g supabase
   ```

2. **Login to Supabase**:
   ```bash
   supabase login
   ```

3. **Link to your project**:
   ```bash
   supabase link --project-ref YOUR_PROJECT_REF
   ```

4. **Deploy the Edge Function**:
   ```bash
   supabase functions deploy salesforce-oauth-callback
   ```

5. **Set Environment Variables** (if needed):
   ```bash
   supabase secrets set SUPABASE_URL=https://your-project.supabase.co
   supabase secrets set SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
   ```

### **Step 2: Run Database Migration**

```bash
supabase db push
```

This creates the `oauth_callbacks` table and sets up the cleanup function.

### **Step 3: Configure Salesforce Connected App**

In your Salesforce Connected App settings:

**Callback URL**: `https://your-project.supabase.co/functions/v1/salesforce-oauth-callback`

Replace `your-project` with your actual Supabase project reference.

### **Step 4: Update App Configuration**

Ensure your app's `.env` file has:
```
EXPO_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
```

## 🔄 **OAuth Flow Details**

### **1. Initiate OAuth**
- App generates PKCE challenge
- Opens Salesforce OAuth URL with Supabase callback
- User authorizes in browser

### **2. Handle Callback**
- Salesforce redirects to Supabase Edge Function
- Edge Function stores auth code in database (5-minute expiry)
- Edge Function redirects to app deep link

### **3. Complete in App**
- App detects deep link return
- App retrieves auth code from Supabase
- App exchanges code for tokens using PKCE
- Tokens stored securely in device

## 🛡️ **Security Features**

- ✅ **PKCE**: Prevents authorization code interception
- ✅ **Short-lived codes**: 5-minute expiry on auth codes
- ✅ **One-time use**: Auth codes marked as consumed
- ✅ **Company isolation**: Each company's data is isolated
- ✅ **Automatic cleanup**: Expired codes cleaned up automatically

## 🧪 **Testing**

### **Development Testing**
1. Use Expo Go or development build
2. Same Supabase callback URL works for all environments
3. Test OAuth flow end-to-end

### **Production Testing**
1. Build standalone app
2. Test OAuth flow with production Salesforce org
3. Verify token storage and refresh

## 🔍 **Monitoring & Debugging**

### **Edge Function Logs**
```bash
supabase functions logs salesforce-oauth-callback
```

### **Database Monitoring**
Check `oauth_callbacks` table for:
- Successful callbacks
- Error conditions
- Cleanup effectiveness

### **Common Issues**

1. **Callback URL Mismatch**
   - Ensure Salesforce Connected App has correct callback URL
   - Check Supabase project URL is correct

2. **Deep Link Not Working**
   - Verify app scheme configuration
   - Test deep link handling in app

3. **Auth Code Expired**
   - Codes expire in 5 minutes
   - User needs to retry OAuth flow

## 📱 **App Store Deployment**

When deploying to app stores:

1. **iOS**: Configure URL scheme in `Info.plist`
2. **Android**: Configure intent filters in `AndroidManifest.xml`
3. **Both**: Test deep link handling thoroughly

## 🔄 **Maintenance**

- **Monitor Edge Function performance**
- **Check database cleanup effectiveness**
- **Update Salesforce Connected App settings as needed**
- **Rotate secrets periodically**

## 🆘 **Troubleshooting**

### **OAuth Flow Fails**
1. Check Edge Function logs
2. Verify Salesforce Connected App configuration
3. Test callback URL directly in browser

### **Deep Link Issues**
1. Verify app scheme configuration
2. Test on physical devices
3. Check platform-specific deep link handling

### **Token Issues**
1. Verify PKCE implementation
2. Check token storage and retrieval
3. Test token refresh flow

---

This production-ready architecture eliminates the need for Expo-specific callback URLs and provides a stable, secure OAuth implementation for all deployment scenarios.
