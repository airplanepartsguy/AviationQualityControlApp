# Temporary Fix: Disable Background Sync

To reduce database load and prevent timeouts, temporarily disable background sync:

## Quick Edit in `src/contexts/SyncContext.tsx`

Around line 50-60, find the `useEffect` that starts sync and comment it out:

```typescript
// Temporarily disable auto-sync to prevent database timeouts
// useEffect(() => {
//   if (isAuthenticated) {
//     initSync();
//   }
// }, [isAuthenticated]);
```

## OR in `App.tsx`

Comment out the SyncManager wrapper (around line 383):

```typescript
// <SyncManager>
  <RootNavigator />
// </SyncManager>
```

This will:
- Stop background photo sync
- Stop automatic Salesforce sync
- Reduce database load
- Let you test the main features

## To Re-enable Later:
Just uncomment the code when ready for production.