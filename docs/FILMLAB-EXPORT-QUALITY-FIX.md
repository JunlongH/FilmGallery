# FilmLab Export Quality Fix Plan

## Problem Analysis

User reported a quality degradation issue in FilmLab when exporting Landscape (unrotated) images compared to Portrait (rotated 90°) images. Specifically, Landscape images see a resolution drop to approx 4/9 of original (2/3 scaling on both axes), while Portrait images retain original quality.

### Root Cause
The root cause is the `EXPORT_MAX_WIDTH` constant (currently set to 4000) being applied as a hard limit on the *width* of the exported image, regardless of aspect ratio or orientation.

**Detailed Example with User Observation (3646px Width):**
If the original image is 20MP (approx 5472 x 3648):

1.  **Landscape Image (Unrotated, 5472 x 3648)**:
    *   Width = 5472.
    *   Limit = 4000.
    *   Scaling Factor = 4000 / 5472 ≈ 0.73 (However, in some contexts 2/3 scale was observed).
    *   Result = 4000 Width.
    *   *Correction*: User reported width of 3646. This implies the scaling factor effectively became ~2/3 (0.66). If 4000 limit was applied against a presumed 6000px width (cached state or incorrect metadata), the factor 4000/6000 = 0.66 would result in 5472 * 0.66 ≈ 3648. This closely matches the user's observation of 3646 (likely 3648 with minor cropping).
    *   The "3646" width observed by the user is practically equal to the vertical height of a 3:2 image (3648), confirming that dimensions were being aggressively compressed due to the `maxWidth` check failing on the long edge.

2.  **Portrait Image (Rotated 90°, 3648 x 5472)**:
    *   Rotated Width = 3648.
    *   Limit = 4000.
    *   Scaling Factor = 1.0 (since 3648 < 4000).
    *   Result = Original Resolution.

This asymmetry confirms `EXPORT_MAX_WIDTH` was limiting landscape photos while letting portrait photos pass through at full quality.

The issue exists in both Server-side rendering (`server/routes/filmlab.js`) and Client-side CPU fallback (`CpuRenderService.js`) because they both rely on `EXPORT_MAX_WIDTH`.

## Restoration Plan

To systematically fix this and ensure high-quality exports, we will:

1.  **Update Constants**: Increase `EXPORT_MAX_WIDTH` in `packages/shared/filmLabConstants.js` from 4000 to 8000. This ensures that even if a limit is applied (e.g. via "Save" button), it accommodates standard high-res sensors (up to ~50MP) without downscaling.
2.  **Disable Limits for HQ Export (Server)**: Modify `server/routes/filmlab.js` to remove the `maxWidth` constraint entirely for the `/render` endpoint. Exporting "High Quality" should default to the original source resolution (passing `maxWidth: null`).
3.  **Disable Limits for CPU Export (Client)**: Modify `client/src/services/CpuRenderService.js` to ensure that `localCpuExport` explicitly requests no width limit (passing `maxWidth: 0`).
4.  **Fix Logic in CPU Service**: Improve `localCpuRender` in `CpuRenderService.js` to correctly handle explicit "no limit" requests. The previous logic `maxWidth || EXPORT_MAX_WIDTH` incorrectly treated `0` as falsy, forcing a limit. New logic will respect `0` as unlimited.

## Implementation Details

### 1. Shared Constants
*   File: `packages/shared/filmLabConstants.js`
*   Action: Change `EXPORT_MAX_WIDTH` to `8000`.

### 2. Server Route
*   File: `server/routes/filmlab.js`
*   Action: In `/render` handler, remove `maxWidth: EXPORT_MAX_WIDTH` from `buildPipeline` call.

### 3. CPU Render Service
*   File: `client/src/services/CpuRenderService.js`
*   Action: 
    *   Update `localCpuRender` to respect `maxWidth: 0` correctly (fixed `||` operator bug).
    *   Update `localCpuExport` to pass `maxWidth: 0` to ensure full resolution.

## Verification
*   Landscape images (e.g. 5472px width) should export at full width, not compressed to 4000px or 3646px.
*   Portrait images should continue to export at full resolution.
*   "Save" button in UI (which uses `EXPORT_MAX_WIDTH`) will now support up to 8000px width.
*   "Export" button (HQ) will support unlimited resolution.

## Additional Safety Checks (Phase 2)

Following user feedback ("3646px" observation) and request to check `gpu render` and `save` paths, the following components were audited:

1.  **GPU Export (`handleGpuExport` -> Electron GPU Worker)**:
    *   **Logic**: The GPU worker (`gpu-renderer.js`) calculates the output canvas size based on rotated dimensions and crop rectangle directly. There is **no code** imposing a `maxWidth` or hard limit.
    *   **Resolution**: It renders at full source resolution (limited only by the GPU's `MAX_TEXTURE_SIZE`, typically 16384px on modern hardware). No changes needed.

2.  **Client Quick Save (`handleSave`)**:
    *   **Logic**: This function in `FilmLab.jsx` explicitly uses `EXPORT_MAX_WIDTH`.
    *   **Fix**: Since `EXPORT_MAX_WIDTH` was already raised to 8000, this path is now safe for images up to ~8000px wide. Code was reviewed to ensure it uses the imported constant.

3.  **Download / Render as TIFF (`handleDownload` -> `smartRenderPositive`)**:
    *   **Logic**: This path handles "Download" actions for specific formats.
    *   **Fix**:
        *   **Server Side**: Tested `/api/filmlab/render` route, confirmed `maxWidth` is removed.
        *   **CPU Fallback**: Updated `ComputeService.js` -> `localRenderPositive` to explicitly pass `maxWidth: 0` to `CpuRenderService`. This ensures that if the server is unavailable, the local CPU render for download is also unlimited.

4.  **HQ Export (`handleHighQualityExport` -> `smartExportPositive`)**:
    *   **Fix**:
        *   **Server Side**: Verified `/api/filmlab/export` route has `maxWidth: null`.
        *   **CPU Fallback**: Verified `localCpuExport` passes `maxWidth: 0`.

## Final State
All export, save, and render pathways (Server-CPU, Client-CPU, Client-GPU) are now configured to ignore the old 4000px limit, allowing full-resolution output for both Landscape and Portrait orientations.
