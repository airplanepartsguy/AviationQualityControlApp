# 🚀 Aviation QC App - Deployment Checklist

## ✅ Completed Steps

1. **Database Migrations** ✅
   - Added ERP upload tracking columns
   - Created integration_errors table
   - Set up oauth_tokens table
   - Fixed all schema issues

2. **Edge Functions Deployed** ✅
   - salesforce-oauth-callback
   - refresh-salesforce-token

## 📱 Next Steps: Deploy the Mobile App

### 1. Build the App
```bash
# Install dependencies (if needed)
npm install

# Clean build cache
cd android && ./gradlew clean && cd ..

# Build for testing
npm run android  # For Android
npm run ios      # For iOS
```

### 2. Test Key Features

#### A. Test OAuth Flow (Admin Only)
1. Login as an admin user
2. Go to Settings → Integrations → Salesforce
3. Click "Connect to Salesforce"
4. Complete OAuth login
5. Verify: Check `oauth_tokens` table has an entry

#### B. Test Company-Wide Access
1. Login as a non-admin user (same company)
2. Create a photo batch
3. Click "Upload to ERP"
4. Should work without OAuth prompt!

#### C. Test Duplicate Prevention
1. Upload a batch to ERP
2. Try uploading the same batch again
3. Should show "Already uploaded" message

### 3. Production Build & Deploy
```bash
# Build for production
eas build --platform all --profile production

# Submit to app stores
eas submit --platform ios
eas submit --platform android
```

## 🧪 Testing Queries

### Check if everything is working:
```sql
-- 1. See which companies are connected
SELECT 
    c.name as company_name,
    ot.integration_type,
    ot.expires_at,
    CASE 
        WHEN ot.expires_at > NOW() THEN '✅ Active'
        ELSE '❌ Expired'
    END as status
FROM companies c
LEFT JOIN oauth_tokens ot ON c.id = ot.company_id
WHERE ot.integration_type = 'salesforce';

-- 2. Check recent uploads
SELECT 
    pb.id,
    c.name as company_name,
    pb.order_number,
    pb.erp_uploaded,
    pb.erp_uploaded_at,
    u.email as uploaded_by
FROM photo_batches pb
JOIN companies c ON pb.company_id = c.id
LEFT JOIN auth.users u ON pb.erp_uploaded_by = u.id
WHERE pb.erp_uploaded = true
ORDER BY pb.erp_uploaded_at DESC
LIMIT 10;

-- 3. Check for any errors
SELECT * FROM integration_errors 
ORDER BY created_at DESC 
LIMIT 20;
```

## 🔍 Monitor After Deployment

### 1. Edge Function Logs
```bash
supabase functions logs salesforce-oauth-callback --project-ref luwlvmcixwdtuaffamgk
supabase functions logs refresh-salesforce-token --project-ref luwlvmcixwdtuaffamgk
```

### 2. Common Issues & Fixes

**"No Salesforce token found"**
- Admin needs to connect Salesforce first

**"Token refresh failed"**
- Check if refresh token is valid
- May need to reconnect Salesforce

**"Upload failed"**
- Check object mappings are initialized
- Verify Salesforce permissions

## 📊 Success Metrics

After deployment, you should see:
- ✅ Admins can connect Salesforce (once per company)
- ✅ All users can upload without individual OAuth
- ✅ Tokens auto-refresh when expired
- ✅ No duplicate uploads
- ✅ Errors logged for debugging

## 🎯 Final Steps

1. **Test with one company first**
2. **Monitor for 24-48 hours**
3. **Roll out to all companies**
4. **Update user documentation**

## 📞 Support

If issues arise:
1. Check `integration_errors` table
2. Review edge function logs
3. Verify oauth_tokens are valid
4. Check Salesforce Connected App settings

The app is now ready for production deployment! 🎉