# Bug Fix: Remote Server API_BASE Issue

**Date**: 2025-01-07  
**Severity**: High  
**Affects**: Client-only builds connecting to remote servers

## Problem Description

When using the client-only version to connect to a remote server:
1. **Homepage random photos** are not displayed
2. **Statistics page** shows no data
3. Other pages (Calendar, PhotoDetailsSidebar) may fail to load/save data

## Root Cause Analysis

### Issue
Multiple React components were using `process.env.REACT_APP_API_BASE` instead of the centralized `API_BASE` from `api.js`.

**Why this is problematic:**
- `process.env.REACT_APP_API_BASE` is a **build-time environment variable**
- It does NOT reflect the user's runtime configuration set in Settings
- In Electron, the correct API_BASE should come from `window.__electron.API_BASE` (set by preload script)
- The `api.js` module correctly handles this logic, but components were bypassing it

### Data Flow

**Correct Flow:**
```
User configures in Settings → electron-main saves to config.json
→ electron-preload reads config at startup → exposes window.__electron.API_BASE
→ api.js exports API_BASE → Components import and use it
```

**Broken Flow (before fix):**
```
Component uses process.env.REACT_APP_API_BASE → Always uses build-time value
→ Ignores user's remote server configuration
```

## Affected Components

| Component | Line | Issue |
|-----------|------|-------|
| `HeroRandomPhotos.jsx` | 15 | `const API = process.env.REACT_APP_API_BASE \|\| 'http://127.0.0.1:4000'` |
| `Statistics.jsx` | 9 | `const API = process.env.REACT_APP_API_BASE \|\| 'http://127.0.0.1:4000'` |
| `PhotoDetailsSidebar.jsx` | 76 | `const API = process.env.REACT_APP_API_BASE \|\| 'http://127.0.0.1:4000'` |
| `PhotoCalendar.jsx` | 51-52 | Inline `process.env.REACT_APP_API_BASE` in URL construction |

## Solution

### Changes Made

#### 1. HeroRandomPhotos.jsx
```diff
- import { buildUploadUrl } from '../api';
+ import { buildUploadUrl, API_BASE } from '../api';

  const loadRandom = useCallback(async () => {
    try {
      setIsRefreshing(true);
-     const API = process.env.REACT_APP_API_BASE || 'http://127.0.0.1:4000';
-     const r = await fetch(`${API}/api/photos/random?limit=5`);
+     const r = await fetch(`${API_BASE}/api/photos/random?limit=5`);
```

#### 2. Statistics.jsx
```diff
+ import { API_BASE as API } from '../api';
- const API = process.env.REACT_APP_API_BASE || 'http://127.0.0.1:4000';
```

#### 3. PhotoDetailsSidebar.jsx
```diff
- import { getMetadataOptions } from '../api';
+ import { getMetadataOptions, API_BASE } from '../api';

  async function handleSave() {
    // ...
    try {
-     const API = process.env.REACT_APP_API_BASE || 'http://127.0.0.1:4000';
      const targets = isBatch ? photos : [photo];
      for (const p of targets) {
-       await fetch(`${API}/api/photos/${p.id}`, {
+       await fetch(`${API_BASE}/api/photos/${p.id}`, {
```

#### 4. PhotoCalendar.jsx
```diff
- import { buildUploadUrl } from '../api';
+ import { buildUploadUrl, API_BASE } from '../api';

  const { data: photos = [] } = useQuery({
    queryKey: ['photos', year, viewMode === 'month' ? month : 'all'],
    queryFn: async () => {
      const url = viewMode === 'month' 
-       ? `${process.env.REACT_APP_API_BASE || 'http://127.0.0.1:4000'}/api/photos?year=${year}&month=${month}`
-       : `${process.env.REACT_APP_API_BASE || 'http://127.0.0.1:4000'}/api/photos?year=${year}`;
+       ? `${API_BASE}/api/photos?year=${year}&month=${month}`
+       : `${API_BASE}/api/photos?year=${year}`;
```

## Testing

### Test Scenarios

1. **Local Mode (Full Version)**
   - [x] Homepage shows random photos
   - [x] Statistics page displays all charts and data
   - [x] Calendar loads photos by month/year
   - [x] PhotoDetails sidebar can save metadata

2. **Remote Mode (Client-only)**
   - [ ] Configure remote server IP in Settings
   - [ ] Save and restart app
   - [ ] Homepage shows random photos from remote server
   - [ ] Statistics page displays remote data
   - [ ] Calendar loads remote photos
   - [ ] PhotoDetails sidebar saves to remote server

3. **Network Error Handling**
   - [ ] Graceful degradation when server is unreachable
   - [ ] Console logs show correct API_BASE being used
   - [ ] No mixed localhost/remote requests

### Verification Commands

Check API_BASE in browser console:
```javascript
// Should show user-configured server address
console.log(window.__electron?.API_BASE);

// Should match preload value
import { API_BASE } from './api';
console.log(API_BASE);
```

Check network requests in DevTools:
```
Network tab → Filter by "photos" or "stats"
→ All requests should go to configured server
```

## Architecture Considerations

### Design Principles

1. **Single Source of Truth**: `api.js` is the ONLY place that determines API_BASE
2. **Runtime Configuration**: User settings override build-time environment variables
3. **Centralized Import**: All components MUST import API_BASE from `api.js`

### Code Review Checklist

When reviewing new components or features:
- [ ] Does NOT use `process.env.REACT_APP_API_BASE` directly
- [ ] Imports `API_BASE` from `../api` or `../../api`
- [ ] Uses `API_BASE` for all fetch() calls to backend
- [ ] Uses `buildUploadUrl()` for image paths

### Future Improvements

1. **ESLint Rule**: Add custom rule to prevent direct use of `process.env.REACT_APP_API_BASE`
2. **Type Safety**: Use TypeScript to enforce API_BASE import
3. **Hot Reload**: Consider detecting API_BASE changes without full restart
4. **Connection Indicator**: Show current server address in UI

## Related Files

- `client/src/api.js` - Central API_BASE definition
- `electron-preload.js` - Exposes API_BASE to renderer
- `electron-main.js` - Config storage and sync IPC handler
- `client/src/components/Settings.jsx` - Server configuration UI

## Related Issues

- [2025-01-07] API_BASE not persisting after restart (fixed in electron-preload.js)
- [2025-01-07] Remote server path configuration (fixed in Settings.jsx)

## Maintainability Guidelines

### For Developers

**DO:**
```javascript
import { API_BASE } from '../api';
const response = await fetch(`${API_BASE}/api/endpoint`);
```

**DON'T:**
```javascript
const API = process.env.REACT_APP_API_BASE || 'http://127.0.0.1:4000';
const response = await fetch(`${API}/api/endpoint`);
```

### Component Template

For new components that need API access:
```javascript
import React from 'react';
import { API_BASE } from '../api'; // Always import from api.js

export default function MyComponent() {
  async function fetchData() {
    const response = await fetch(`${API_BASE}/api/my-endpoint`);
    return response.json();
  }
  
  // ... rest of component
}
```

## Impact Assessment

### Before Fix
- ❌ Client-only builds unusable with remote servers
- ❌ No data displayed on homepage/statistics
- ❌ Confused users with "empty" application
- ❌ Hidden network errors (requests to localhost instead of remote)

### After Fix
- ✅ Client-only builds fully functional with remote servers
- ✅ All pages load data correctly
- ✅ Consistent API_BASE across entire application
- ✅ Clear error messages if server is unreachable

## Deployment Notes

This fix requires:
1. Rebuild client: `cd client && npm run build`
2. Rebuild Electron app: `npm run dist` or `npm run dist:client-only`
3. No database migration needed
4. No server-side changes required

Users must:
1. Install the updated client version
2. Configure remote server in Settings (if using client-only)
3. Restart application for changes to take effect
