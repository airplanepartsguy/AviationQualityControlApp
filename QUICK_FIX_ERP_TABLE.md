# Quick Fix: Create Missing ERP Sync Table

The error shows that the `erp_sync_status` table is missing. Let me add it to the database initialization.

## What's Wrong:
- The `erpSyncService` tries to use a table `erp_sync_status`
- But this table was never created during app initialization
- So when you click "Upload to ERP", it fails with "no such table"

## The Fix:
I need to add the table creation to the database initialization process.

## Table Schema Needed:
```sql
CREATE TABLE IF NOT EXISTS erp_sync_status (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  batch_id TEXT NOT NULL,
  erp_system TEXT NOT NULL,
  sync_status TEXT NOT NULL DEFAULT 'pending',
  synced_at TEXT,
  error_message TEXT,
  attachment_id TEXT,
  record_id TEXT,
  retry_count INTEGER DEFAULT 0,
  last_sync_attempt TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
```

## Immediate Solution:
Add this to the database initialization so the table exists when you try to upload.