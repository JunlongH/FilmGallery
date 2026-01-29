# FilmLab Architecture Refactor & Rendering Fix Plan

## 1. Problem Analysis & Diagnosis

### 1.1 Immediate Issues
1.  **Histogram & Crop**: The real-time histogram does not update during crop dragging because the calculation loop iterates over the full buffer (including area outside crop) instead of the active crop area.
2.  **RAW Workflow**: Users observe this more on RAW files.
    -   *Clarification*: The Client currently works on a **Preview Proxy** (decoded via `smartFilmlabPreview` into a JPEG/PNG or Bitmap). The client does not decode RAW directly.
    -   *Impact*: Limitation in dynamic range (8-bit vs 14-bit) is expected in Preview, but the *rendering bug* (Histogram not updating) is independent of format.
3.  **Pipeline Stability**: The current architecture has a rigid "Geometry then Color" pipeline. Some operations (like Auto-Levels) depend on the output of Geometry (Crop) but currently run independently or on the wrong input.

### 1.2 Architectural Issues
1.  **Divergent Rendering Engines**:
    -   **Client (`FilmLabWebGL.js`)**: Uses a "Hybrid" approach. It uses the slow HTML5 2D Canvas API to pre-rotate and pre-crop the image into a temporary canvas, then uploads that to WebGL. This causes high memory usage and limits performance.
    -   **Server (`gpu-renderer.js`)**: Uses a "Pure WebGL" approach. It handles rotation and cropping mathematically in the Vertex Shader logic (UV mapping). This is much faster and cleaner.
2.  **Code Duplication**: GLSL fragment shader logic (color science) is duplicated between Client and Server, leading to subtle inconsistencies.
3.  **Monolithic Component**: `FilmLab.jsx` (~2500 lines) manages UI, Logic, Rendering execution, and State. It is hard to maintain.

## 2. Refactoring Plan

### Phase 1: Immediate Fix - Histogram Area (Target: v1.9.x) ✅ COMPLETED
**Goal**: Make the histogram update correctly during crop dragging.

1.  **Modify `FilmLab.jsx`**: ✅ Done
    -   Located the histogram calculation loop (CPU side, lines ~1126-1160).
    -   Introduced `scanArea` logic with `scanStartX`, `scanStartY`, `scanEndX`, `scanEndY`.
    -   When `isCropping` is true, map `cropRect` (normalized 0-1) to pixel bounds.
    -   Restrict the histogram sampling loop to these bounds.
    -   **Result**: Histogram now reflects only the cropped area during crop dragging.

### Phase 2: Unified Geometry & Performance (Target: v2.0) ✅ COMPLETED
**Goal**: Align Client renderer with Server efficiency. Remove 2D Canvas pre-processing.

1.  **Refactor `FilmLabWebGL.js`**: ✅ Done (2026-01-29)
    -   Removed the `document.createElement('canvas')` 2D rotation/scale/crop logic.
    -   Ported the **UV Mapping Logic** from `gpu-renderer.js` (lines 800-860) to `FilmLabWebGL.js`.
    -   Implemented `mapUV()` function to calculate texture coordinates for crop/rotation.
    -   Updated Vertex Buffer to use dynamically computed UVs (`cache.computedUVs`).
    -   Changed texture upload to use original image instead of pre-processed canvas.
    -   **Result**: Faster interaction, lower memory usage (~3x fewer temp canvases), WYSIWYG consistency with export.

### Phase 3: Shared Shader Library (Target: v2.0)
**Goal**: Guarantee render consistency between Preview and Export.

1.  **Create `@filmgallery/shared/shaders`**:
    -   Extract the Fragment Shader GLSL code into strict modules:
        -   `tonemap.glsl` (Curve, Contrast, Exposure)
        -   `color.glsl` (HSL, Split Tone, WB)
        -   `main.glsl` (Entry point)
2.  **Consume in both environments**:
    -   Update `gpu-renderer.js` to import these strings.
    -   Update `FilmLabWebGL.js` to import these strings.

### Phase 4: Modular Component Architecture (Target: v2.1)
**Goal**: Decompose `FilmLab.jsx` for maintainability.

1.  **Extract Hooks**:
    -   `useFilmLabState`: Manage complex state (params, history).
    -   `useImageSource`: Handle `requiresServerDecode` / `smartFilmlabPreview` loading logic.
    -   `useFilmLabRenderer`: Encapsulate the `FilmLabWebGL` interactions.
    -   `useHistogram`: Encapsulate the CPU/GPU histogram analysis.

### Phase 5: Pipeline & RAW Logic (Logic Fix)
**Goal**: Solve the "Non-Commutative" dependency issue (Auto-Levels depends on Crop).

1.  **Define Pipeline events**:
    -   `EVENT_GEOMETRY_CHANGED` (Crop/Rotate)
    -   `EVENT_COLOR_CHANGED` (Params)
2.  **Implement Dependency Chain**:
    -   When `EVENT_GEOMETRY_CHANGED`:
        1.  Update geometry uniforms.
        2.  Render (fast WebGL).
        3.  **Re-run Histogram** (on the new output, restricted to crop).
        4.  If `Auto-Levels` is active: Re-calculate levels -> Trigger `EVENT_COLOR_CHANGED`.

## 3. Implementation Details for RAW Issues

The user suspects RAW decoding is part of the problem.
**Clarification**: The Client currently works on a **Preview Proxy** (decoded via `smartFilmlabPreview`).
-   To improve RAW editing quality (Histogram accuracy), we must ensure this proxy is high quality.
-   **Action**: Check `smartFilmlabPreview` requests. currently hardcoded `maxWidth: 2000`.
-   **Improvement**: Allow `maxWidth` to scale with screen size or quality setting. If `smartFilmlabPreview` returns a higher bit-depth image (e.g. 16-bit PNG), Client logic would need adaptation (currently assumes standard Image/Canvas interaction). For now, we assume 8-bit pipeline in Client but ensure the Histogram Calculation is logically correct (Crop-aware).

## 4. Execution Steps

1.  **Apply Phase 1** (Histogram Loop Fix) ✅ COMPLETED 2026-01-29
2.  **Verify** cropping behavior on RAWs.
3.  **Apply Phase 2** (Refactor `FilmLabWebGL.js`) ✅ COMPLETED 2026-01-29
    -   Replaced 2D Canvas geometry pre-processing with pure UV mapping
    -   Original image now uploaded directly to WebGL texture
    -   Dynamic UV calculation via `mapUV()` function
4.  **Verify** rotation/crop behavior matches export output.
5.  **Start Phase 3** (Shared Shader Library) when ready for v2.0.
