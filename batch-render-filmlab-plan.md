# FilmLab Batch Render Integration Plan

## Goal
Enable "Use FilmLab Adjustment" functionality in the Batch Render dialog. This allows users to pick a reference photo, adjust parameters in FilmLab, and then apply those parameters to a batch export of photos.

## Modularization Analysis
**Question:** Can FilmLab bypass ImageViewer as an independent module?

**Analysis:**
Currently, `FilmLab` is tightly coupled with `ImageViewer` in the UI flow because:
1.  **Image Context:** `FilmLab` requires a specific image URL and metadata (roll ID, photo ID) to function. `ImageViewer` encapsulates the logic for resolving these URLs (positive vs negative vs original) and navigating between photos.
2.  **User Experience:** When adjusting batch parameters, the user naturally needs to see the effect on a specific photo (a reference photo). `ImageViewer` already provides the "canvas" for selecting and viewing this reference photo.
3.  **Code Reuse:** Bypassing `ImageViewer` would require duplicating the logic for:
    *   Fetching/Resolving the image path.
    *   Handling "Positive" vs "Negative" mode selection.
    *   Initializing the `FilmLab` component with the correct dimensions and source type.

**Decision:**
To maintain **system consistency** and **avoid code duplication**, we will route the Batch Render flow through `ImageViewer`. We will treat `ImageViewer` as the "host" for `FilmLab`, even in batch mode. This is "preserving the status quo" but enhancing `ImageViewer` to support a "batch callback" mode.

## detailed Implementation Plan

### 1. `client/src/components/RollDetail.jsx` (Orchestrator)
*   **State:** Add `batchRenderCallback` state. This holds the resolve function from the Batch Render modal.
*   **Handler:** `handleOpenFilmLabForBatch(callback)`
    *   Stores the callback.
    *   Hides `BatchRenderModal`.
    *   Opens `ImageViewer` (sets `selectedPhotoIndex`).
*   **Integration:**
    *   Pass `onOpenFilmLab={handleOpenFilmLabForBatch}` to `BatchRenderModal`.
    *   Pass `batchRenderCallback` to `ImageViewer`.
    *   Update `ImageViewer.onClose`: If `batchRenderCallback` was active, reopen `BatchRenderModal` and clear the callback.

### 2. `client/src/components/ImageViewer.js` (Host)
*   **Props:** Accept `batchRenderCallback`.
*   **Auto-Open Logic:** Use `useEffect` to detect `batchRenderCallback`. When present:
    *   Determine the best available source type (e.g., Negative if available, else Original/Positive).
    *   Set `filmLabSourceType`.
    *   Set `showInverter` to `true` (Open FilmLab).
*   **FilmLab Props:**
    *   Pass `onFinishBatchParams` prop to `FilmLab`.
    *   The handler for this prop will:
        1.  Execute `batchRenderCallback(params)`.
        2.  Close FilmLab (`setShowInverter(false)`).
        3.  Close ImageViewer (`onClose()`).

### 3. `client/src/components/FilmLab/FilmLab.jsx` (Editor Logic)
*   **Props:** Accept `onFinishBatchParams`.
*   **Pass-through:** Pass this prop down to `FilmLabControls`.

### 4. `client/src/components/FilmLab/FilmLabControls.jsx` (UI Controls)
*   **Props:** Accept `onFinishBatchParams` and `currentParams`.
*   **UI Changes:**
    *   Check if `onFinishBatchParams` is truthy.
    *   **If True (Batch Mode):**
        *   Hide "SAVE", "HQ EXPORT", "GPU EXPORT" buttons.
        *   Hide "SAVE AS" / "DOWNLOAD" section (to avoid confusion).
        *   Show a prominent **"DONE"** or **"FINISH"** button.
        *   Clicking "DONE" calls `onFinishBatchParams(currentParams)`.
    *   **If False (Normal Mode):**
        *   Show standard buttons.

## Verification
*   **Workflow:** Open Batch Render -> Select "Use FilmLab Adjustment" -> Click "Open FilmLab" -> Adjust Params -> Click "Done" -> Modal Reappears -> "Custom Params" selected.
*   **Data Flow:** Ensure parameters (exposure, contrast, curves, WB, etc.) are correctly captured and passed back.
