# Mobile App Thumbnail Path Fix Plan

## 1. Problem Diagnosis
After analyzing the mobile app code and the server's data structure documentation (`docs/THUMB-PATH-AUDIT.md`), the following issues have been identified:

*   **Server Data Structure Evolution**: The system has migrated from a legacy single `thumb_rel_path` to separate paths: `positive_thumb_rel_path` (for processed images) and `negative_thumb_rel_path` (for raw scans).
*   **Incomplete Frontend Logic**: The mobile app's legacy code primarily checks `thumb_rel_path`. For newly imported or processed images, the server populates `positive_thumb_rel_path` and leaves `thumb_rel_path` empty (or does not update it).
*   **Broken Fallback**: When `thumb_rel_path` is missing, the code falls back to a constructed URL based on `roll_id` and `filename`. If the actual thumbnail is stored elsewhere (as indicated by `positive_thumb_rel_path`), this fallback produces a 404 error.

## 2. Affected Areas

### A. Critical Failures (Broken Previews)
These screens implement inline logic that completely ignores `positive_thumb_rel_path`.

1.  **`mobile/src/screens/TagDetailScreen.js`**
    *   **Current Logic**: Checks `item.thumb_rel_path`, else constructs legacy path.
    *   **Result**: Fails for new images where `thumb_rel_path` is null.

2.  **`mobile/src/screens/FavoritesScreen.js`**
    *   **Current Logic**: Same as TagDetailScreen.
    *   **Result**: Fails for new images.

### B. Core Utility (Risk of Inconsistency)
3.  **`mobile/src/utils/urls.js`** (`getPhotoUrl` function)
    *   **Current Logic**: Checks `photo.thumb_rel_path` for thumbs, and `photo.full_rel_path` for full images.
    *   **Issue**: Does not prioritize or check `positive_thumb_rel_path` or `positive_rel_path`.
    *   **Impact**: Affects `RollDetailScreen` and `PhotoViewScreen` which rely on this utility.

### C. Inconsistent Implementations (Working but clean-up recommended)
4.  **`LibraryScreen.js` & `MapScreen.js`**
    *   These screens have inline fixes (`p.thumb_rel_path || p.positive_thumb_rel_path`), but do not use a centralized utility, leading to code duplication.

## 3. Implementation Plan

### Step 1: Upgrade `utils/urls.js`
Update the `getPhotoUrl` function to strictly follow formatting hierarchy:
1.  **Thumbnails**: Check `positive_thumb_rel_path` -> `thumb_rel_path`.
2.  **Full Images**: Check `positive_rel_path` -> `full_rel_path`.
3.  **Negatives**: Check `negative_rel_path`.

### Step 2: Refactor Screens
Replace inline URL construction logic in `TagDetailScreen.js` and `FavoritesScreen.js` with the imported `getPhotoUrl` helper. This ensures consistency across the app.

### Step 3: Verification
*   Verify that `RollDetailScreen` (uses `getPhotoUrl`) works correctly with the change.
*   (Optional) Refactor `LibraryScreen` and `MapScreen` to use `getPhotoUrl` to reduce technical debt.

## 4. Why this fixes it
By redirecting the mobile app to look at `positive_thumb_rel_path`, it aligns with the server's current "source of truth" for thumbnails, ensuring that both old (legacy) and new (positive-workflow) images display correctly.
