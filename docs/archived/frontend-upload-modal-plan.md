# Frontend Upload Modal Implementation Plan

## Objective
Replace the current inline dropdown upload menu in `RollDetail` with a robust, modular `UploadModal` component. This new component will support batch uploads, visualize progress, handle different upload types (Positive, Negative, Original), and provide better feedback.

## Features
1.  **Dedicated Modal UI**: A clean overlay dialog.
2.  **Upload Type Selection**: Clear options for Positive, Negative, and Original (RAW/Backup).
3.  **Batch Selection**: Drag & drop support or multi-file selection.
4.  **Progress Tracking**:
    *   Overall batch progress.
    *   Individual file status (Pending → Uploading → Success/Fail).
5.  **Error Handling**: specific error messages for failed uploads (e.g., RAW decode errors).

## Technical Architecture

### 1. New Component: `client/src/components/UploadModal.jsx`
*   **Props**:
    *   `isOpen`: boolean
    *   `onClose`: function
    *   `rollId`: string/number
    *   `onUploadComplete`: function (to refresh parent)
*   **State**:
    *   `queue`: Array of file objects `{ id, file, status, progress, error }`
    *   `uploadType`: 'positive' | 'negative' | 'original'
    *   `isUploading`: boolean
*   **Logic**:
    *   Uses a concurrency-limited queue (e.g., max 3 parallel uploads) to prevent browser stuttering while maximizing throughput.
    *   Directly calls `api.uploadPhoto` (single) instead of the bulk wrapper, to have fine-grained control over progress and error reporting per file.

### 2. Update `client/src/api.js`
*   Ensure there is a single-file upload function that exposes `onUploadProgress`.
*   The current `uploadPhotosToRoll` might be doing `Promise.all`. We might want to break this down in the UI component for better granular progress bars.

### 3. Update `client/src/components/RollDetail.jsx`
*   Remove `showUploadTypeSelector` and the messy inline styles.
*   Add `showUploadModal` state.
*   Render `<UploadModal>` when active.

## Step-by-Step Implementation
1.  Check `client/src/api.js` to confirm single-upload capabilities.
2.  Create `client/src/components/UploadModal.jsx`.
3.  Modify `client/src/components/RollDetail.jsx` to respond to the "Upload" button by opening the modal.
4.  Verify functionality with RAW and Standard files.

