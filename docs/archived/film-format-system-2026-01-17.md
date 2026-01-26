# Film Format System Enhancement

**Date**: 2026-01-17  
**Status**: Implementation Plan  

## Overview

This document describes the comprehensive enhancement to the film format system, including:
1. Camera format field enhancement
2. Roll inherits camera format
3. 35mm equivalent focal length calculation
4. LensMake EXIF field fix
5. Film Back equipment type
6. Film Library format filtering
7. NewRollForm film format display

---

## 1. Camera Format Field

### Current State
- `equip_cameras` has `format_id` (FK to `ref_film_formats`) and `sub_format` columns
- However, camera format information is not being actively used
- Medium format cameras don't need sub_format distinction (6x6, 6x7, 645) as cameras often support multiple backs

### Changes
- Keep `format_id` simple: 135, 120, 4x5, 8x10, etc.
- Remove complexity of sub_format for cameras (handled by Film Back equipment)
- Update camera creation/edit forms to include format selection

### Files to Modify
- `server/routes/equipment.js` - Already supports format_id
- `client/src/components/EquipmentManager.jsx` - Add format dropdown to camera form

---

## 2. Roll Inherits Camera Format

### Logic
When creating a roll, the format should be determined from:
1. Camera's format (primary source)
2. Film's format (validation/fallback)

### Implementation
- Add `format` column to `rolls` table (TEXT: '135', '120', etc.)
- On roll creation, derive format from camera_equip_id
- Store directly on roll for easy access

### Files to Modify
- `server/utils/equipment-migration.js` - Add `rolls.format` column
- `server/routes/rolls.js` - Populate format on roll creation

---

## 3. 35mm Equivalent Focal Length Calculation

### Formula
```
FocalLengthIn35mmFormat = focal_length × (36 / format_width)
```

### Format Width Mapping
| Format | Width (mm) | Crop Factor |
|--------|------------|-------------|
| 135 (35mm) | 36 | 1.0 |
| Half Frame | 24 | 1.5 |
| APS | 30.2 | 1.19 |
| 120 | 60 | 0.6 |
| 4x5 | 127 | 0.28 |
| 8x10 | 254 | 0.14 |
| 110 | 17 | 2.12 |
| 127 | 40 | 0.9 |

For 120 medium format, use 60mm as the standard width (typical for 6x6).

### Implementation
Add to `buildExifData()`:
```javascript
const FORMAT_WIDTH_MM = {
  '135': 36,
  'Half Frame': 24,
  'APS': 30.2,
  '120': 60,
  '220': 60,
  '127': 40,
  '110': 17,
  'Large Format 4x5': 127,
  '4x5': 127,
  'Large Format 8x10': 254,
  '8x10': 254,
  'Instant': 79  // Polaroid 600/SX-70
};

// Calculate 35mm equivalent
if (focalLength && filmFormat) {
  const formatWidth = FORMAT_WIDTH_MM[filmFormat] || 36;
  const cropFactor = 36 / formatWidth;
  exif.FocalLengthIn35mmFormat = Math.round(focalLength * cropFactor);
}
```

### Files to Modify
- `server/services/exif-service.js` - Add calculation in buildExifData()
- `server/routes/photos.js` - Ensure format is included in download query

---

## 4. LensMake EXIF Field Fix

### Current Issue
Currently uses combined string for LensModel but LensMake may be missing

### Solution
```javascript
if (lensBrand) {
  exif.LensMake = lensBrand;
}
if (lensBrand && lensModel) {
  exif.LensModel = `${lensBrand} ${lensModel}`;
} else if (lensName) {
  exif.LensModel = lensName;
}
```

### Files to Modify
- `server/services/exif-service.js` - Update buildExifData() lens section

---

## 5. Film Back Equipment Type

### Purpose
Medium format cameras often use interchangeable film backs with different formats (6x6, 6x7, 645, etc.). The Film Back equipment type tracks these accessories.

### Database Schema
```sql
CREATE TABLE IF NOT EXISTS equip_film_backs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,                    -- Display name: "Hasselblad A12 6x6"
  brand TEXT,                            -- Manufacturer: "Hasselblad"
  model TEXT,                            -- Model: "A12"
  
  -- Format info
  format TEXT,                           -- Base format: '120', '220'
  sub_format TEXT,                       -- Frame size: '6x6', '6x7', '645', '6x9', '6x4.5'
  frame_width_mm REAL,                   -- Actual frame width in mm
  frame_height_mm REAL,                  -- Actual frame height in mm
  frames_per_roll INTEGER,               -- Number of frames per 120 roll
  
  -- Compatibility
  compatible_cameras TEXT,               -- JSON array of camera_equip_ids or mount types
  mount_type TEXT,                       -- Mount system: 'Hasselblad V', 'Mamiya RB', etc.
  
  -- Magazine type
  magazine_type TEXT,                    -- 'A12', 'A16', 'A24', 'insert', 'rollfilm', 'sheet'
  is_motorized INTEGER DEFAULT 0,        -- Has motor drive
  has_dark_slide INTEGER DEFAULT 1,      -- Has dark slide for mid-roll changes
  
  -- Purchase/ownership
  serial_number TEXT,
  purchase_date TEXT,
  purchase_price REAL,
  condition TEXT,
  notes TEXT,
  image_path TEXT,
  status TEXT DEFAULT 'owned',
  
  -- Timestamps
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME,
  deleted_at DATETIME
);
```

### Sub-format Frame Dimensions
| Sub-format | Width (mm) | Height (mm) | Frames/120 |
|------------|------------|-------------|------------|
| 6x4.5 (645) | 56 | 41.5 | 15-16 |
| 6x6 | 56 | 56 | 12 |
| 6x7 | 56 | 70 | 10 |
| 6x8 | 56 | 76 | 9 |
| 6x9 | 56 | 84 | 8 |
| 6x12 | 56 | 112 | 6 |
| 6x17 | 56 | 168 | 4 |

### API Endpoints
- `GET /api/equipment/film-backs` - List all film backs
- `GET /api/equipment/film-backs/:id` - Get film back details
- `POST /api/equipment/film-backs` - Create film back
- `PUT /api/equipment/film-backs/:id` - Update film back
- `DELETE /api/equipment/film-backs/:id` - Soft delete film back
- `POST /api/equipment/film-backs/:id/image` - Upload image

### Files to Create/Modify
- `server/utils/equipment-migration.js` - Add table creation
- `server/routes/equipment.js` - Add CRUD routes
- `client/src/api.js` - Add API functions
- `client/src/components/EquipmentManager.jsx` - Add tab and forms

---

## 6. Film Library Format Filtering

### Current State
Film Library shows all films without format filtering, making it hard to find films of specific formats when same stock exists in multiple formats (e.g., Portra 400 in 135 and 120).

### Changes
Add format filter dropdown above the film grid:
- "All Formats" (default)
- "135 (35mm)"
- "120 (Medium Format)"
- "220"
- "4x5"
- "Instant"
- etc.

### UI Design
```jsx
<select value={formatFilter} onChange={e => setFormatFilter(e.target.value)}>
  <option value="">All Formats</option>
  <option value="135">135 (35mm)</option>
  <option value="120">120 (Medium Format)</option>
  {/* ... */}
</select>
```

### Files to Modify
- `client/src/components/FilmLibrary.jsx` - Add format filter state and UI

---

## 7. NewRollForm Film Format Display

### Current State
When selecting a film in NewRollForm, format is not visible, making it unclear which format is being selected.

### Changes
Display format alongside film name in the dropdown:
- "Kodak Portra 400 (135) - ISO 400"
- "Kodak Portra 400 (120) - ISO 400"

### Implementation
```jsx
{films.map(f => (
  <option key={f.id} value={f.id}>
    {f.brand ? `${f.brand} ` : ''}{f.name} ({f.format || '135'}) - ISO {f.iso}
  </option>
))}
```

### Files to Modify
- `client/src/components/NewRollForm.jsx` - Update film selector display
- `client/src/components/FilmSelector.jsx` - If used, update display format

---

## Implementation Order

1. **Database Migration** (equipment-migration.js)
   - Add `equip_film_backs` table
   - Add `rolls.format` column

2. **Server Routes** (equipment.js)
   - Add Film Back CRUD endpoints
   - Export FILM_BACK_SUB_FORMATS constant

3. **Client API** (api.js)
   - Add Film Back API functions

4. **EXIF Service** (exif-service.js)
   - Add FORMAT_WIDTH_MM mapping
   - Implement 35mm equivalent calculation
   - Fix LensMake field

5. **Roll Creation** (rolls.js)
   - Derive format from camera on roll creation

6. **Download Query** (photos.js)
   - Add camera format to query for EXIF

7. **Equipment Manager UI** (EquipmentManager.jsx)
   - Add Film Backs tab
   - Add format to camera form

8. **Film Library UI** (FilmLibrary.jsx)
   - Add format filter

9. **NewRollForm UI** (NewRollForm.jsx)
   - Display format in film selection

---

## Testing Checklist

- [ ] Camera can be created with format
- [ ] Roll inherits camera format
- [ ] Film back can be created with sub_format
- [ ] 35mm equivalent is calculated correctly for 135 film
- [ ] 35mm equivalent is calculated correctly for 120 film (uses 60mm width)
- [ ] LensMake EXIF field is populated correctly
- [ ] Film Library can filter by format
- [ ] NewRollForm shows film format in dropdown
- [ ] Download includes correct 35mm equivalent in EXIF

---

## Migration Notes

This migration is **additive** and non-breaking:
- New columns have defaults
- New table is independent
- UI changes are enhancements

No data migration required for existing records.
