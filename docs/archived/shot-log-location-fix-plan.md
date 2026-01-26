# Shot Log Location Fix & UI Enhancement Plan

## Problem
The user reports that shot log location data (country, city, address, lat/long) is lost upon server restart/disconnect, despite appearing to be saved initially. Additionally, the UI needs to be improved to allow manual editing of this data and address lookup, similar to the "create new log" flow.

## Root Cause Analysis

### 🚨 BUG FOUND: `ShotLogModal.jsx` line 72-80

The **root cause** is in the client-side parsing logic in `ShotLogModal.jsx`. When the modal opens and parses existing `shot_logs` from the database:

```javascript
const normalized = parsed.map(entry => ({
  date: entry.date,
  count: Number(entry.count || entry.shots || 0) || 0,
  lens: entry.lens || '',
  aperture: entry.aperture !== undefined && entry.aperture !== null ? Number(entry.aperture) : null,
  shutter_speed: entry.shutter_speed || '',
  country: entry.country || '',
  city: entry.city || '',
  detail_location: entry.detail_location || ''
  // ❌ MISSING: latitude, longitude are NOT preserved!
}))
```

**The `latitude` and `longitude` fields are completely dropped during normalization!**

This means:
1. User adds a log with coordinates → saved correctly to DB ✅
2. User reopens the modal → parsing code drops `latitude`/`longitude` ❌
3. User saves (even without changes) → stripped entries saved back ❌
4. **Data loss occurs on next save, NOT on server restart!**

The server restart is a red herring - the data loss happens whenever the modal is opened and saved again.

### Additional Findings
- Server-side persistence is working correctly (WAL mode with checkpoints)
- OneDrive conflict resolver does NOT touch `shot_logs` data
- Database schema is correct (`shot_logs TEXT` column exists)

## Implementation Steps

### ✅ Phase 1: Fix Data Loss Bug (COMPLETED)
**File**: `client/src/components/ShotLogModal.jsx`

Changed the normalization logic to preserve latitude and longitude:
```javascript
const normalized = parsed.map(entry => ({
  date: entry.date,
  count: Number(entry.count || entry.shots || 0) || 0,
  lens: entry.lens || '',
  aperture: entry.aperture !== undefined && entry.aperture !== null ? Number(entry.aperture) : null,
  shutter_speed: entry.shutter_speed || '',
  country: entry.country || '',
  city: entry.city || '',
  detail_location: entry.detail_location || '',
  // ✅ NOW PRESERVED:
  latitude: entry.latitude !== undefined && entry.latitude !== null ? Number(entry.latitude) : null,
  longitude: entry.longitude !== undefined && entry.longitude !== null ? Number(entry.longitude) : null
}))
```

### ✅ Phase 2: Enhanced Entries List UI (COMPLETED)
**File**: `client/src/components/ShotLogModal.jsx`

Updated the "Entries" section with:
1. **Latitude/Longitude columns** - Direct input fields for manual coordinate entry
2. **Integrated GeoSearchInput** - Each entry's "Detail" field now uses `GeoSearchInput` component
3. **Auto-fill on address selection** - When user selects a search result:
   - `detail_location` is filled with the address
   - `country` and `city` are auto-populated
   - `latitude` and `longitude` are automatically set

### ✅ Phase 3: Card Layout & Edit Modal (COMPLETED)
1. **Card-based Entries** - Replaced cramped table with spacious card layout
2. **EntryEditModal** - Dedicated modal for editing entries with proper GeoSearchInput
3. **Edit buttons** - Added ✏️ and 🗑️ buttons to each entry

### ✅ Phase 4: CSV Import Feature (COMPLETED)

#### CSV Format (matches export)
```csv
date,count,lens,aperture,shutter_speed,country,city,detail_location,latitude,longitude
2026-01-18,3,35mm f/3.5,5.6,1/250,China,Beijing,清华路,40.00119,116.32000
```

#### Implementation Details

**New UI Elements:**
- **📥 Import CSV** button - Opens file picker for .csv files
- **📋 Template** button - Downloads empty CSV template with headers
- **Import Options Dialog** - Appears after file selection with 3 strategies:
  - **Append** - Add imported entries to existing logs
  - **Merge** - Combine entries (allows duplicates on same date)
  - **Replace** - Delete all existing entries and use imported ones

**CSV Parser Features:**
- Handles quoted fields with commas inside
- Flexible column name matching (e.g., `lat` or `latitude`, `s` or `shutter_speed`)
- Validates required fields (date, count > 0)
- Ignores `iso` column (comes from film definition)
- Sorts final result by date

**Files Modified:**
- `client/src/components/ShotLogModal.jsx` - Added import logic, file input, options dialog

## Files Modified (Summary)
- `client/src/components/ShotLogModal.jsx` - Bug fix + UI enhancement + CSV Import
- `docs/shot-log-location-fix-plan.md` - This document
