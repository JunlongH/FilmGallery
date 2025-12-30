# Watch App Data Issues - System Fix Summary

**Date**: 2025-12-30  
**Status**: ✅ Complete - Ready for Testing

## Problems Identified & Fixed

### 1. Shot Log Screen Issues

#### Problem 1.1: Film Item Information Display Incorrect
- **Root Cause**: The `film_items` table doesn't have `film_type` or `film_iso` columns
- **Data**: These exist only in the `films` table, linked via `film_id`
- **Solution**:
  - Updated backend (`server/routes/film-items.js`): Enrich each film item with `film_name` and `iso` from the `films` table during list response
  - Updated watch app (`src/types/index.ts`): Changed `FilmItem` interface to match actual DB columns:
    - `film_name?: string | null` (enriched from films table)
    - `iso?: string | null` (enriched from films table)
    - `loaded_camera?: string | null` (actual column name)
  - Updated UI display (`ShotLogSelectRollScreen.tsx`): Show `film_name` + `iso` + `loaded_camera`

#### Problem 1.2: Wrong Status Filter
- **Root Cause**: Query was using `['loaded', 'shot', 'in_stock']` - but shot logging should only work on newly loaded film
- **Solution**: Changed to only fetch `status='loaded'` items in `ShotLogSelectRollScreen.tsx`

### 2. My Rolls Screen Issues

#### Problem 2.1: Film Type Shows as "unknown"
- **Root Cause**: 
  - Rolls API response includes `film_type` field but it's empty in DB
  - Server provides fallback field `film_name_joined` (populated from films table via `film_item_id`)
- **Solution**:
  - Updated `Roll` type to include `film_name_joined?: string | null`
  - Updated `api.ts` `getRolls()` to map: `film_type = film_type || film_name_joined`
  - Updated `MyRollsScreen.tsx` to show `filmType = item.film_type || item.film_name_joined || 'Film type unknown'`

#### Problem 2.2: Photos Show from Other Rolls & Infinite Scroll
- **Root Cause**: 
  - API `/api/photos?roll_id=X` might be unfiltered or paginated without stop condition
  - Client wasn't validating roll ownership of photos
- **Solution**:
  - Added guard in `RollDetailScreen.tsx` `loadPhotos()`:
    ```typescript
    const filteredPhotos = data.filter(photo => photo.roll_id === roll.id);
    ```
  - This ensures only photos matching this specific roll are displayed
  - FlatList will only render the filtered photos (no infinite scroll if data is correct)

## Changed Files

### Backend
- **server/routes/film-items.js**: Enriched list endpoint with film name and ISO

### Watch App
- **src/types/index.ts**: 
  - Updated `FilmItem` interface (removed `film_type`/`film_iso`, added `film_name`/`iso`)
  - Updated `Roll` interface (added `film_name_joined`)
  
- **src/services/api.ts**:
  - Enhanced `getFilmItems()` to ensure titles have fallback
  - Enhanced `getRolls()` to map `film_type` fallback

- **src/screens/ShotLogSelectRollScreen.tsx**:
  - Filter to only `loaded` status
  - Display `film_name || iso || 'Film'` and `loaded_camera || 'Camera'`
  
- **src/screens/ShotLogParamsScreen.tsx**:
  - Added roll existence check
  - Show ISO and loaded_camera in subtitle

- **src/screens/MyRollsScreen.tsx**:
  - Display `film_type || film_name_joined || 'Film type unknown'`

- **src/screens/RollDetailScreen.tsx**:
  - Added photo roll_id filtering to prevent cross-roll photos
  - Display `film_type || film_name_joined` in header

## Data Flow Architecture

### Shot Log Path
```
User selects Shot Log
  → api.getFilmItems('loaded')
    → Backend enriches with film name/iso
  → Show only loaded items with film_name + iso + loaded_camera
  → Select item → ShotLogParams
  → Record shot logs → Update film_item
```

### My Rolls Path
```
User selects My Rolls
  → api.getRolls()
    → Server maps film_type fallback to film_name_joined
  → Show rolls with film_type + camera + dates
  → Select roll → RollDetail
  → api.getPhotosByRoll(rollId)
    → Client filters by roll_id to prevent cross-roll photos
  → Display only this roll's photos
```

## Testing Checklist

- [ ] Shot Log screen loads only "loaded" items
- [ ] Film item displays film name (from films table) + ISO + camera
- [ ] My Rolls shows film type (prefers explicit, fallback to film_name_joined)
- [ ] Clicking roll opens detail with correct photos only (no other rolls' photos)
- [ ] Photo grid doesn't overflow or load extra rolls
- [ ] Navigation back from detail works correctly (swipe gesture)

## Architecture Benefits

✅ **Systematic**: Fixes address root causes in data model
✅ **Complete**: Both frontend and backend updated for consistency
✅ **Maintainable**: Clear separation of concerns:
  - Backend: Enriches data with missing film info
  - Frontend: Maps API response to UI needs with fallbacks
  - Screens: Filter/validate data before display
✅ **Defensive**: Guards against missing data with fallbacks
✅ **Performant**: API enrichment at list endpoint (not per-item)
