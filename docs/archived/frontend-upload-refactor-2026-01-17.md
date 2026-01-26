# Frontend Refactor: Upload Modularization

## Summary
Refactored the photo upload workflow to use a dedicated, modular modal component. This replaces the previous inline dropdown which had UI occlusion issues and limited functionality.

## Changes

### 1. New Component: `UploadModal.jsx`
*   **Path**: `client/src/components/UploadModal.jsx`
*   **Purpose**: Handles file selection, upload type configuration, queue management, and progress tracking.
*   **Key Features**:
    *   **Type Selection**: Explicit choices for Positive (Process JPG), Negative (Scan), and Original (RAW/Backup).
    *   **Queue System**: Manages strict sequential uploading to ensure stability and reliable progress tracking.
    *   **Visual Feedback**: Individual file status (Pending/Uploading/Success/Error) and specific error message display.
    *   **Drag & Drop**: Supported on the drop zone area.

### 2. Updated Controller: `RollDetail.jsx`
*   **Cleanup**: Removed the inline state variables (`showUploadTypeSelector`, `uploadType`, `onUpload` logic) and inline CSS hacks.
*   **Integration**: Added `showUploadModal` state and rendered `<UploadModal />` at the root of the component.
*   **UX**: The "Upload Photos" button now cleanly triggers the modal.

### 3. API Usage
*   The `UploadModal` reuses `uploadPhotoToRoll` from `api.js` but manages the loop internally. This allows for:
    *   Better error isolation (one fail doesn't stop others).
    *   Granular status updates per file.
    *   Potential for future retry logic.

## Verification Checklist
- [x] "Upload Photos" button opens the new modal.
- [x] Can select multiple files via dialog or drag & drop.
- [x] "Original" mode correctly passes `uploadType='original'` to the backend.
- [x] Upload queue processes files sequentially.
- [x] Success/Error icons update correctly.
- [x] Modal closure triggers a photo list refresh (`invalidateQueries`).
