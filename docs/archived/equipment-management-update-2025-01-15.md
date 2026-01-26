# Equipment Management System Update

## 📅 Date: 2025-01-15

## 🎯 Overview
This update introduces a comprehensive equipment management system to FilmGallery, replacing text-based camera/lens inputs with a structured equipment library.

## ✨ New Features

### 1. Equipment Library
- **Cameras**: Store brand, model, type (SLR, Rangefinder, Point-and-Shoot, TLR, Medium Format, Large Format), mount, film format, and image
- **Lenses**: Store brand, model, mount, focal length range, max aperture, and image
- **Flashes**: Store brand, model, guide number, TTL compatibility
- **Film Formats**: Reference table for 135, 120, 127, APS, 4x5, 8x10

### 2. Point-and-Shoot Camera Support
- Fixed lens cameras can store lens specs (focal length, max aperture) directly
- When a fixed-lens camera is selected, the lens picker is automatically disabled
- Fixed lens info is shown in the lens field

### 3. Mount Compatibility
- Lenses are filtered by camera mount when a camera is selected
- Compatible mounts are automatically determined (e.g., Nikon F mount cameras can use Nikon F lenses)

### 4. Data Migration
- Existing camera/lens text values are automatically parsed and migrated to equipment library
- Migration runs on server startup
- New foreign key columns link rolls and photos to equipment entities

### 5. EXIF Integration
- Photo downloads with EXIF now use equipment library data
- Fallback to text fields for backwards compatibility

## 📁 New Files

### Server
- `server/utils/equipment-migration.js` - Database schema and data migration
- `server/routes/equipment.js` - Full CRUD API for equipment management

### Desktop Client
- `client/src/components/EquipmentSelector.jsx` - Universal equipment picker component
- `client/src/components/EquipmentManager.jsx` - Equipment library management page
- `client/src/components/EquipmentManager.css` - Styling for equipment manager

### Mobile App
- `mobile/src/api/equipment.js` - Equipment API functions
- `mobile/src/components/EquipmentPicker.js` - Mobile equipment selector
- `mobile/src/screens/EquipmentScreen.js` - Mobile equipment management screen

## 📝 Modified Files

### Server
- `server/server.js` - Added equipment migration and routes
- `server/routes/rolls.js` - Added camera_equip_id, lens_equip_id, flash_equip_id support
- `server/routes/photos.js` - Added equipment ID fields and EXIF integration

### Desktop Client
- `client/src/App.js` - Added Equipment route and navigation
- `client/src/api.js` - Added 20+ equipment API functions
- `client/src/components/NewRollForm.jsx` - Replaced datalist with EquipmentSelector
- `client/src/components/RollDetail.jsx` - Replaced datalist with EquipmentSelector
- `client/src/components/PhotoDetailsSidebar.jsx` - Replaced datalist with EquipmentSelector
- `client/src/components/FilmActionModals.jsx` - Added camera selector to Load Film modal

### Mobile App
- `mobile/App.js` - Added Equipment screen route
- `mobile/src/screens/FilmItemDetailScreen.js` - Added camera picker for Load action
- `mobile/src/screens/SettingsScreen.js` - Added Equipment Library button

## 🗄️ Database Changes

### New Tables
```sql
CREATE TABLE equip_cameras (
  id INTEGER PRIMARY KEY,
  brand TEXT,
  model TEXT,
  camera_type TEXT, -- SLR, Rangefinder, Point-and-Shoot, TLR, Medium Format, Large Format
  mount TEXT, -- Nikon F, Canon EF, M42, etc.
  film_format TEXT, -- 135, 120, etc.
  has_fixed_lens INTEGER DEFAULT 0,
  fixed_lens_focal_length REAL,
  fixed_lens_max_aperture REAL,
  image_url TEXT,
  notes TEXT,
  created_at TEXT,
  updated_at TEXT
);

CREATE TABLE equip_lenses (
  id INTEGER PRIMARY KEY,
  brand TEXT,
  model TEXT,
  mount TEXT,
  focal_length_min REAL,
  focal_length_max REAL,
  max_aperture REAL,
  image_url TEXT,
  notes TEXT,
  created_at TEXT,
  updated_at TEXT
);

CREATE TABLE equip_flashes (
  id INTEGER PRIMARY KEY,
  brand TEXT,
  model TEXT,
  guide_number REAL,
  ttl_compatible INTEGER DEFAULT 0,
  image_url TEXT,
  notes TEXT,
  created_at TEXT,
  updated_at TEXT
);

CREATE TABLE ref_film_formats (
  code TEXT PRIMARY KEY,
  name TEXT,
  frame_width REAL,
  frame_height REAL,
  notes TEXT
);
```

### Modified Tables
- `rolls`: Added `camera_equip_id`, `lens_equip_id`, `flash_equip_id` columns
- `photos`: Added `camera_equip_id`, `lens_equip_id`, `flash_equip_id` columns
- `film_items`: Added `loaded_camera_equip_id` column

## 🔄 API Endpoints

### Equipment
- `GET /api/equipment/cameras` - List all cameras
- `POST /api/equipment/cameras` - Create camera
- `GET /api/equipment/cameras/:id` - Get camera by ID
- `PUT /api/equipment/cameras/:id` - Update camera
- `DELETE /api/equipment/cameras/:id` - Delete camera
- `POST /api/equipment/cameras/:id/image` - Upload camera image

- `GET /api/equipment/lenses` - List all lenses
- `POST /api/equipment/lenses` - Create lens
- `GET /api/equipment/lenses/:id` - Get lens by ID
- `PUT /api/equipment/lenses/:id` - Update lens
- `DELETE /api/equipment/lenses/:id` - Delete lens

- `GET /api/equipment/compatible-lenses/:cameraId` - Get lenses compatible with camera
- `GET /api/equipment/flashes` - List all flashes
- `GET /api/equipment/film-formats` - List all film formats
- `GET /api/equipment/suggestions` - Get suggested equipment from existing data

## 🚀 Usage

### Desktop
1. Navigate to "Equipment" in the sidebar
2. Add cameras, lenses, and flashes to your library
3. When creating/editing rolls or photos, use the new equipment pickers

### Mobile
1. Go to Settings → Equipment Library
2. Manage your equipment from the Equipment screen
3. When loading film, select a camera from the picker

## ⚠️ Notes
- Text fields (camera, lens) are still maintained for backwards compatibility
- Equipment selectors populate both the ID field and the text field
- Existing data is migrated automatically on first server start
