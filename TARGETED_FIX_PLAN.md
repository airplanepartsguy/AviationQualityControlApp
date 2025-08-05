# 🎯 Targeted Fix Plan - Database Column Compatibility

## 🔍 Root Cause Analysis
Your app has **mixed column naming conventions**:
- **Photos table**: `batchId` (camelCase)
- **ERP sync table**: `batch_id` (snake_case)  
- **Error**: Code tries `batch_id` on photos table

## 🛠️ Targeted Fixes

### 1. Create Smart Query Helper
- Auto-detects column format per table
- Falls back gracefully between formats
- Caches results for performance

### 2. Fix Immediate Column Issues
- Update all photo queries to use `batchId`
- Update all ERP sync queries to use correct format
- Add error handling for missing columns

### 3. Add Debug Logging
- Show which columns exist in each table
- Log query attempts and failures
- Help identify schema mismatches

## 🚀 Implementation Steps
1. Create database compatibility helper
2. Update erpSyncService with smart queries
3. Test with existing data
4. Deploy and verify

This approach keeps your data intact and handles both formats automatically.