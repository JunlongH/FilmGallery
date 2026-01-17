# Upload Workflow Optimization Plan

## Objective
Optimize the file upload workflow for "Positive", "Negative", and "Original" files to streamline the creation of photo entries and automated processing of different file types, including RAW files.

## Workflows

### 1. Upload Positive
**User Intent**: Upload an already processed/developed image (e.g., JPEG export from Lightroom or lab scan).
*   **Action**: Create a new `photo` table entry.
*   **File Handling**:
    *   Store original upload in `rolls/{id}/originals/` (optional, but good for backup) or directly process to `full/`. *Refinement: Current logic stores original in `originals/` and processes to `full/`. Stick to this safe pattern.*
    *   Generate Optimized JPEG in `rolls/{id}/full/` -> `positive_rel_path`.
    *   Generate Thumbnail in `rolls/{id}/thumb/` -> `positive_thumb_rel_path` & `thumb_rel_path`.
*   **Database Fields**:
    *   `positive_rel_path`: Set
    *   `thumb_rel_path`: Set
    *   `negative_rel_path`: NULL

### 2. Upload Negative
**User Intent**: Upload a film scan of a negative (needs inversion or keeping raw).
*   **Action**: Create a new `photo` table entry.
*   **File Handling**:
    *   Store original upload in `rolls/{id}/originals/`.
    *   Generate Optimized JPEG in `rolls/{id}/negative/` -> `negative_rel_path`. *Note: Even if uploaded as TIFF/RAW, we convert to high-quality JPG for web display as "Negative".*
    *   Generate Thumbnail in `rolls/{id}/negative/thumb/` -> `negative_thumb_rel_path`.
    *   Copy Negative Thumbnail to `rolls/{id}/thumb/` -> `thumb_rel_path`.
*   **Database Fields**:
    *   `positive_rel_path`: NULL
    *   `thumb_rel_path`: Set
    *   `negative_rel_path`: Set

### 3. Upload Original (RAW/JPG/TIFF) - "Originals" Mode
**User Intent**: Upload a raw backup or master file, expecting `negative` style previews.
*   **Action**: Create a new `photo` table entry.
*   **File Processing**:
    *   **RAW Files**:
        *   Decode using `libraw-wasm` (to buffer) -> Convert to TIFF (via Sharp).
        *   Store original RAW in `rolls/{id}/originals/`.
        *   Save Decoded TIFF as temporary or alongside in `originals/` (optional, `_decoded.tiff`).
        *   Generate "Negative Preview" JPEG in `rolls/{id}/negative/` from the decoded data.
    *   **Image Files (TIFF/JPG)**:
        *   Store in `rolls/{id}/originals/`.
        *   Generate "Negative Preview" JPEG in `rolls/{id}/negative/`.
*   **Derived Assets**:
    *   `negative`/`negative_rel_path`: Created from source (treated as negative preview).
    *   `thumb`/`thumb_rel_path`: Created from the negative preview.
*   **Database Fields**:
    *   `positive_rel_path`: NULL
    *   `negative_rel_path`: Set (pointing to the generated preview)
    *   `thumb_rel_path`: Set
    *   `original_rel_path`: Set (new field or just implicit in file structure? *Current schema doesn't seem to have `original_rel_path` exposed in basic SELECTs, but we store it in `filename` potentially or need a column. Let's check schema.*)
    *   **Correction**: Schema `photos` likely doesn't have `original_rel_path`. We should probably add it or just rely on `negative_rel_path` for the preview.
    *   **Correction**: The User Request says "automatically generate negative jpeg and thumb". So we **treat "Original" upload as a "Negative" upload that just starts from a RAW source.**

## Implementation Tasks

1.  **Refine `POST /:rollId/photos` in `server/routes/rolls.js`**:
    *   Clean up the logic to distinctly handle `positive`, `negative`, `original` switch cases.
    *   Ensure `raw-decoder` is tightly integrated for `original` & `negative` modes if a RAW file is detected.
    *   Fix the logic where "Original" mode previously resulted in `negativeRelPath = null`. It should produce a `negative` preview.

## Detailed Logic Plan for Route

```javascript
/* Pseudocode for route logic */
const isRaw = checkRaw(file);
let sourceBuffer/Path = file.path;

// 1. RAW Decoding (if applicable)
if (isRaw) {
    const decodedBuffer = await rawDecoder.decode(file.path);
    // Use this buffer for subsequent Sharp operations
    sourceBuffer = decodedBuffer;
}

// 2. Branch by Type
if (type === 'positive') {
    // Sharp(source).to(full/*.jpg) -> positive_rel_path
    // Sharp(source).resize().to(thumb/*.jpg) -> thumb_rel_path
}
else if (type === 'negative' || type === 'original') {
    // Treating 'original' uploads as negatives for now (providing a base to invert later)
    
    // Sharp(source).to(negative/*.jpg) -> negative_rel_path
    // Sharp(source).resize().to(negative/thumb/*.jpg) -> negative_thumb_rel_path
    // Copy negative thumb to main thumb -> thumb_rel_path
}
```

## Schema Check
Does `photos` table have `original_rel_path`?
Based on `server/routes/rolls.js` lines ~1080: `SELECT id, full_rel_path, positive_rel_path, negative_rel_path, thumb_rel_path...`
It does not seem to select `original_rel_path`.
However, the file system stores it in `originals/`.
We might want to add `original_rel_path` to the INSERT if the column exists, or just ensure the file exists.
*Decision*: Stick to existing schema columns. "Original" upload primarily populates `negative_rel_path` (as a preview) and stores the file physically.

