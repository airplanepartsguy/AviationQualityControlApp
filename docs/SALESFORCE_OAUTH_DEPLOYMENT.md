# Salesforce OAuth Deployment Guide

## Current Status
✅ **Deep Link Handling**: Added to App.tsx for `oauth/success` route  
✅ **OAuth Callback Logic**: Implemented in SalesforceConfigScreen  
✅ **Edge Function**: Ready for deployment  
✅ **Database Schema**: oauth_callbacks table configured  
⚠️ **PKCE Code Verifier**: Needs proper storage/retrieval implementation  
🔄 **Edge Function Deployment**: Needs to be deployed to Supabase  

## Deployment Steps

### 1. Deploy Supabase Edge Function

Since the Supabase CLI is not available locally, deploy manually:

1. **Go to Supabase Dashboard**:
   - Navigate to https://supabase.com/dashboard
   - Select your project: `luwlvmcixwdtuaffamgk`

2. **Deploy Edge Function**:
   - Go to Edge Functions section
   - Create new function named: `salesforce-oauth-callback`
   - Copy the contents from: `supabase/functions/salesforce-oauth-callback/index.ts`
   - Deploy the function

3. **Verify Deployment**:
   - Test the endpoint: `https://luwlvmcixwdtuaffamgk.supabase.co/functions/v1/salesforce-oauth-callback`
   - Should return a 405 error for GET requests (expected behavior)

### 2. Test OAuth Flow

#### Prerequisites:
- Salesforce Connected App configured with:
  - Consumer Key: `3MVG9ux34Ig8G5epos1WTwMmQWuDb4gS5HhJy1DGGntowR3HhTU9PA2r9wJmFbedJa7OFv487PfMqjDyURDqX`
  - Callback URL: `https://luwlvmcixwdtuaffamgk.supabase.co/functions/v1/salesforce-oauth-callback`
  - App is deployed and running on device/emulator

#### Testing Steps:

1. **Configure Salesforce in App**:
   - Open Aviation Quality Control App
   - Navigate to ERP → Salesforce Configuration
   - Enter Salesforce credentials (Consumer Key, Secret, Instance URL)
   - Save configuration

2. **Initiate OAuth Flow**:
   - Tap "Authenticate with Salesforce" button
   - App should open device browser (Chrome/Safari)
   - Browser should navigate to Salesforce login page

3. **Complete Authentication**:
   - Login to Salesforce in browser
   - Grant permissions to the app
   - Browser should redirect to Edge Function
   - Edge Function should process callback and redirect to app

4. **Verify Deep Link**:
   - App should reopen automatically
   - SalesforceConfigScreen should process OAuth callback
   - Success message should appear
   - Configuration should be updated with OAuth status

## Known Issues & Limitations

### 1. PKCE Code Verifier Storage
**Issue**: Code verifier is not properly stored/retrieved for PKCE validation.

**Impact**: OAuth flow may work but without full PKCE security.

**Solution**: Update `salesforceOAuthService` to store code verifier when initiating OAuth and retrieve it during completion.

### 2. Deep Link URL Scheme
**Current**: `AviationQualityControlApp://oauth/success`

**Verification Needed**: Ensure app.json/expo.json has correct scheme configuration.

### 3. Edge Function CORS
**Status**: CORS headers are configured in Edge Function.

**Verification**: Test from browser to ensure no CORS issues.

## Troubleshooting

### OAuth Flow Doesn't Complete
1. Check browser network tab for redirect URLs
2. Verify Edge Function is deployed and accessible
3. Check app logs for deep link handling
4. Verify Salesforce Connected App callback URL matches exactly

### App Doesn't Reopen After Authentication
1. Check device deep link handling settings
2. Verify app scheme in app.json matches linking config
3. Test deep link manually: `AviationQualityControlApp://oauth/success?code=test&state=companyId`

### Authentication Fails
1. Check Salesforce Connected App permissions
2. Verify Consumer Key/Secret are correct
3. Check Edge Function logs in Supabase dashboard
4. Verify oauth_callbacks table has proper RLS policies

## Next Steps

1. **Deploy Edge Function** (highest priority)
2. **Test complete OAuth flow** on real device
3. **Fix PKCE code verifier storage** for enhanced security
4. **Add error handling** for edge cases
5. **Document production deployment** process

## Production Checklist

- [ ] Edge Function deployed to production Supabase project
- [ ] Salesforce Connected App configured for production domain
- [ ] OAuth callback URL updated for production environment
- [ ] Deep link scheme tested on iOS and Android
- [ ] Error handling tested for all failure scenarios
- [ ] PKCE implementation completed for security compliance
- [ ] Documentation updated with production URLs and credentials

## Security Notes

- Consumer Secret should be stored securely (environment variables)
- OAuth tokens are stored in Expo SecureStore (encrypted)
- RLS policies ensure company-level data isolation
- PKCE provides additional security for mobile OAuth flows
