# 🚀 Test the New OAuth Re-Authentication Button

## Start the App Again
```bash
npm start
```

## Navigate to Salesforce Setup
1. **In the app**: Go to Settings → Integrations  
2. **Tap**: "Configure Salesforce"

## What You Should See Now
✅ **Status message**: "Authentication expired - please re-authenticate"  
✅ **Big blue button**: "Re-authenticate with Salesforce" (with refresh icon)

## Test the OAuth Flow
1. **Tap the "Re-authenticate" button**
2. **Browser opens**: Salesforce login page
3. **Login**: Use your TurbineWorks credentials
4. **Authorize**: Grant permissions to the app
5. **Return**: Back to the app automatically
6. **Success**: Should show "Connected and authenticated"

## Then Test Upload
1. **Go back**: To ERP screen
2. **Try upload**: Any batch to test the new tokens
3. **Should work**: Without "Batch not found" error!

## Expected Flow
```
Expired Tokens → Re-authenticate Button → OAuth Flow → Fresh Tokens → Upload Works
```

The button will automatically appear because you have existing configuration with expired tokens!