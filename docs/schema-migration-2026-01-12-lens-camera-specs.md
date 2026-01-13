# Schema Migration: Enhanced Lens & Camera Specifications

**Date:** 2026-01-12  
**Purpose:** Add detailed technical specifications to lenses and cameras for better equipment cataloging.

## Overview

This migration adds the following new fields:

### Lenses (`equip_lenses`)
| Field | Type | Description |
|-------|------|-------------|
| `max_aperture_tele` | REAL | Maximum aperture at telephoto end (for variable aperture zooms, e.g., f/5.6 in 18-55 f/3.5-5.6) |
| `is_macro` | INTEGER | Boolean flag: 1 = macro lens, 0 = normal |
| `magnification_ratio` | TEXT | Macro magnification ratio (e.g., "1:1", "1:2") |
| `image_stabilization` | INTEGER | Boolean: 1 = has IS/VR/OS, 0 = none |
| `lens_type` | TEXT | 'prime' or 'zoom' (computed from focal lengths, but can override) |
| `aperture_type` | TEXT | 'constant' or 'variable' (computed, but can override) |

### Cameras (`equip_cameras`)
| Field | Type | Description |
|-------|------|-------------|
| `meter_type` | TEXT | Metering type: 'none', 'match-needle', 'center-weighted', 'matrix', 'spot' |
| `shutter_type` | TEXT | 'focal-plane', 'leaf', 'electronic' |
| `shutter_speed_min` | TEXT | Slowest shutter speed (e.g., "30" for 30s, "B" for bulb) |
| `shutter_speed_max` | TEXT | Fastest shutter speed (e.g., "1/4000") |
| `weight_g` | REAL | Camera body weight in grams |
| `battery_type` | TEXT | Battery type (e.g., "LR44", "CR123A", "AA x 4") |

## SQL Migration Script

Run these statements against your `film.db`:

```sql
-- ============================================
-- LENS TABLE ENHANCEMENTS
-- ============================================

-- Variable aperture support (tele end max aperture)
ALTER TABLE equip_lenses ADD COLUMN max_aperture_tele REAL;

-- Macro lens flag and magnification
ALTER TABLE equip_lenses ADD COLUMN is_macro INTEGER DEFAULT 0;
ALTER TABLE equip_lenses ADD COLUMN magnification_ratio TEXT;

-- Image stabilization flag
ALTER TABLE equip_lenses ADD COLUMN image_stabilization INTEGER DEFAULT 0;

-- ============================================
-- CAMERA TABLE ENHANCEMENTS
-- ============================================

-- Metering information
ALTER TABLE equip_cameras ADD COLUMN meter_type TEXT;

-- Shutter information
ALTER TABLE equip_cameras ADD COLUMN shutter_type TEXT;
ALTER TABLE equip_cameras ADD COLUMN shutter_speed_min TEXT;
ALTER TABLE equip_cameras ADD COLUMN shutter_speed_max TEXT;

-- Physical specs
ALTER TABLE equip_cameras ADD COLUMN weight_g REAL;

-- Power
ALTER TABLE equip_cameras ADD COLUMN battery_type TEXT;
```

## Derived/Computed Fields

These fields are computed in the application layer and do NOT need database columns:

1. **Lens Type (Prime/Zoom):**
   - If `focal_length_min === focal_length_max` → Prime
   - Otherwise → Zoom

2. **Aperture Type (Constant/Variable):**
   - If zoom lens AND `max_aperture !== max_aperture_tele` → Variable
   - Otherwise → Constant

## How to Apply

### Option 1: Automatic (Recommended)
The server will auto-apply this migration on startup. Simply restart the server.

### Option 2: Manual
1. Stop the server
2. Open a SQLite client: `sqlite3 film.db`
3. Run the SQL statements above
4. Restart the server

## Rollback

If needed, SQLite doesn't support `DROP COLUMN` directly. You would need to:
1. Create a new table without the columns
2. Copy data
3. Drop old table
4. Rename new table

This is rarely needed since unused columns have no negative impact.

## UI Changes

After migration:
- Desktop `EquipmentManager.jsx` will show new fields in the Lens/Camera edit forms
- Mobile `EquipmentScreen.js` will display specs in the detail view
- List items will show badges for "Macro", "IS", and aperture type

## Notes

- Existing data will have NULL values for new fields
- The `blade_count`, `filter_size`, `min_focus_distance`, and `production_year_*` columns already exist in the schema
- This migration only adds the truly new fields
