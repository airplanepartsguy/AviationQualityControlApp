# 🚀 Live Testing Guide - Follow These Steps

## Current Status:
- ✅ App is running on Expo
- ✅ You're logged in as: Samuel Barbour (TurbineWorks)
- ✅ 12 batches ready (INV-357, etc.)
- ⚠️ Token expired (perfect for testing auto-refresh!)

## Step 1: Navigate to ERP Screen
1. **In your phone/simulator**, tap the **"ERP"** tab (bottom navigation)
2. You should see:
   - Salesforce: **Connected** ✅
   - Last sync: Some date
   - Admin functions at bottom

## Step 2: Test Upload with Auto-Refresh
1. **Scroll down** to see your batches
2. **Tap on any INV-357 batch** (you have several)
3. **Tap "Upload to ERP"** button

### What Will Happen:
1. **"Preparing upload..."** - App detects expired token
2. **Auto-refresh happens** - Calls your Edge Function
3. **"Generating PDF..."** - Creates batch report
4. **"Uploading to Salesforce..."** - Finds record, uploads
5. **"Successfully uploaded!"** - Shows Salesforce record ID

## Step 3: Test Duplicate Prevention
1. **Wait 3 seconds** for UI to update
2. **Tap "Upload to ERP" again** on the SAME batch

### Expected Result:
- **"Batch has already been uploaded to ERP"** ✅
- No duplicate upload attempted!

## Step 4: Verify in Database (Optional)
While testing, I'll run this query to show the upload status:

```sql
SELECT 
    id,
    order_number,
    erp_uploaded,
    erp_uploaded_at,
    erp_record_ids
FROM photo_batches 
WHERE id = [batch_id_you_tested]
```

## 🔍 Watch the Terminal!
I'll be monitoring the logs to show you:
- Token refresh happening
- PDF generation
- Salesforce API calls
- Success/error messages

## Common Issues:
1. **"No Salesforce token found"**
   - Your admin already connected, so this shouldn't happen
   
2. **"Token refresh failed"**
   - Check if Edge Function is deployed
   
3. **"No object mapping"**
   - INV prefix should map to ascent__Inventory__c

## Ready? Start with Step 1! 
Tell me when you're on the ERP screen and I'll guide you through each step.