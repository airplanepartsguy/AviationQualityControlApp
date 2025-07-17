# Aviation Quality Control App - Testing Guide

## 🧪 **Comprehensive Testing Procedures**

### **Testing Environment Status**
- ✅ Expo Development Server: Running
- ✅ Supabase Backend: Configured and Ready
- ✅ Authentication System: Validated
- ✅ RLS Policies: Implemented and Tested

---

## 📱 **1. Authentication Testing**

### **User Registration Flow**
```
Test Case: New User Sign Up
Steps:
1. Open app → Navigate to Sign Up
2. Enter: Full Name, Email, Password
3. Verify: User created in Supabase auth.users
4. Verify: Profile created in public.profiles
5. Verify: Company assignment (if applicable)

Expected Results:
✅ User successfully registered
✅ Profile data includes full_name
✅ Default role assigned (member)
✅ Navigation to main app
```

### **Single-Device Login Enforcement**
```
Test Case: License Limit Validation
Steps:
1. Register user with device A
2. Attempt login from device B (same user)
3. Verify license limit enforcement
4. Check active_devices table

Expected Results:
✅ First device: Login successful
✅ Second device: License limit error
✅ Admin can view active devices
✅ Proper error messaging
```

### **Role-Based Access Control**
```
Test Case: Admin vs Member Permissions
Steps:
1. Login as admin user
2. Verify admin dashboard access
3. Login as member user
4. Verify restricted access

Expected Results:
✅ Admin: Full dashboard access
✅ Admin: License management visible
✅ Member: Limited dashboard view
✅ Member: No admin functions
```

---

## 📸 **2. Core Functionality Testing**

### **Photo Capture System**
```
Test Case: Camera and Photo Storage
Steps:
1. Navigate to Photo Capture screen
2. Grant camera permissions
3. Capture photo with GPS enabled
4. Verify photo saved to batch
5. Check local database storage

Expected Results:
✅ Camera initializes properly
✅ Photo captured with metadata
✅ GPS coordinates recorded
✅ Photo stored in Supabase Storage
✅ Batch record created/updated
```

### **Barcode Scanning**
```
Test Case: QR/Barcode Recognition
Steps:
1. Open camera in scan mode
2. Scan test barcode/QR code
3. Verify batch creation
4. Check order number assignment

Expected Results:
✅ Barcode detected and decoded
✅ New batch created automatically
✅ Order number properly assigned
✅ UI switches to capture mode
```

### **Batch Management**
```
Test Case: Batch Organization
Steps:
1. Create multiple photo batches
2. Add photos to different batches
3. Navigate to batch review
4. Verify batch status updates

Expected Results:
✅ Batches properly organized
✅ Photo count accurate
✅ Status updates correctly
✅ Batch metadata preserved
```

---

## 🔄 **3. Salesforce Integration Testing**

### **Offline Queue Management**
```
Test Case: Offline Sync Queue
Steps:
1. Disable network connectivity
2. Capture photos and create batches
3. Verify queue population
4. Re-enable network
5. Monitor sync process

Expected Results:
✅ Tasks queued when offline
✅ Queue persisted to storage
✅ Auto-sync on network recovery
✅ Retry logic for failures
```

### **Sync Status Monitoring**
```
Test Case: Sync Progress Tracking
Steps:
1. Add items to sync queue
2. Monitor sync status panel
3. Check sync logs
4. Verify success/failure handling

Expected Results:
✅ Real-time status updates
✅ Progress indicators working
✅ Detailed sync logs
✅ Error handling and retry
```

### **n8n Webhook Integration**
```
Test Case: API Endpoint Communication
Steps:
1. Configure test webhook URL
2. Trigger sync operation
3. Monitor network requests
4. Verify data format

Expected Results:
✅ Proper JSON payload format
✅ Authentication headers included
✅ File attachments handled
✅ Response processing correct
```

---

## 🔒 **4. Security Testing**

### **Multi-Tenant Data Isolation**
```
Test Case: Company Data Separation
Steps:
1. Create users in different companies
2. Attempt cross-company data access
3. Verify RLS policy enforcement
4. Test admin functions

Expected Results:
✅ Users only see own company data
✅ RLS policies block unauthorized access
✅ Admin functions company-scoped
✅ No data leakage between tenants
```

### **Permission Validation**
```
Test Case: API Security
Steps:
1. Test unauthenticated requests
2. Test with expired tokens
3. Verify permission boundaries
4. Check sensitive data access

Expected Results:
✅ Unauthenticated requests blocked
✅ Token validation working
✅ Permissions properly enforced
✅ Sensitive data protected
```

---

## 📊 **5. Performance Testing**

### **Large Dataset Handling**
```
Test Case: Bulk Photo Operations
Steps:
1. Create batch with 50+ photos
2. Monitor memory usage
3. Test sync performance
4. Verify UI responsiveness

Expected Results:
✅ Smooth photo capture
✅ Reasonable memory usage
✅ Efficient sync processing
✅ UI remains responsive
```

### **Network Resilience**
```
Test Case: Connection Stability
Steps:
1. Test with poor network conditions
2. Simulate connection drops
3. Verify retry mechanisms
4. Check data integrity

Expected Results:
✅ Graceful degradation
✅ Automatic retry logic
✅ Data consistency maintained
✅ User feedback provided
```

---

## 🎯 **6. User Experience Testing**

### **Navigation Flow**
```
Test Case: App Navigation
Steps:
1. Test all screen transitions
2. Verify back button behavior
3. Check deep linking
4. Test drawer navigation

Expected Results:
✅ Smooth transitions
✅ Proper navigation stack
✅ Consistent UI behavior
✅ Intuitive user flow
```

### **Error Handling**
```
Test Case: Error States
Steps:
1. Trigger various error conditions
2. Verify error messages
3. Test recovery actions
4. Check user guidance

Expected Results:
✅ Clear error messages
✅ Helpful recovery suggestions
✅ Graceful error handling
✅ User can continue working
```

---

## 🔧 **7. Device-Specific Testing**

### **iOS Testing**
```
Devices to Test:
- iPhone 12/13/14 (iOS 15+)
- iPad (latest iOS)

Key Areas:
✅ Camera permissions
✅ File system access
✅ Background sync
✅ Push notifications
```

### **Android Testing**
```
Devices to Test:
- Samsung Galaxy S21+ (Android 11+)
- Google Pixel 6 (Android 12+)

Key Areas:
✅ Camera API compatibility
✅ Storage permissions
✅ Background processing
✅ Network state changes
```

---

## 📋 **8. Testing Checklist**

### **Pre-Deployment Testing**
- [ ] Authentication flows tested
- [ ] Core functionality validated
- [ ] Salesforce integration working
- [ ] Security policies enforced
- [ ] Performance benchmarks met
- [ ] Error handling verified
- [ ] Multi-device testing completed
- [ ] Network resilience confirmed

### **User Acceptance Testing**
- [ ] Admin user training completed
- [ ] End-user workflow tested
- [ ] Documentation reviewed
- [ ] Support procedures validated
- [ ] Backup/recovery tested
- [ ] Monitoring systems active

---

## 🚨 **9. Known Issues & Workarounds**

### **Current Limitations**
1. **Camera Initialization**: May take 2-3 seconds on older devices
2. **Large File Sync**: Files >10MB may require multiple retry attempts
3. **Background Sync**: iOS may limit background processing time

### **Workarounds**
1. **Loading Indicators**: Show camera initialization progress
2. **File Compression**: Implement photo compression before sync
3. **Foreground Sync**: Encourage users to keep app active during sync

---

## 📞 **10. Testing Support**

### **Test Data**
```sql
-- Sample test companies
INSERT INTO companies (name) VALUES ('Test Aviation Corp');

-- Sample test users
-- (Created through app registration)

-- Sample test batches
-- (Created through app workflow)
```

### **Debug Tools**
- **Expo DevTools**: Real-time debugging
- **Supabase Dashboard**: Database monitoring
- **Network Inspector**: API call monitoring
- **Device Logs**: Native debugging

---

## ✅ **Testing Completion Criteria**

### **Functional Testing**
- [ ] All user stories tested and passing
- [ ] Integration points validated
- [ ] Error scenarios handled
- [ ] Performance requirements met

### **Security Testing**
- [ ] Authentication mechanisms secure
- [ ] Data isolation confirmed
- [ ] API endpoints protected
- [ ] Sensitive data encrypted

### **Deployment Readiness**
- [ ] Production configuration tested
- [ ] Monitoring systems validated
- [ ] Support documentation complete
- [ ] User training materials ready

---

*Testing Guide Version: 1.0.0*
*Last Updated: January 2025*
