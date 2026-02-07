# FilmLab Rendering Discrepancy Report

**Date:** February 7, 2026  
**Module:** FilmLab (Server CPU Render vs Client GPU Render)  
**Severity:** High (Visual inconsistency in High Quality exports)

## 1. Executive Summary

There is a fundamental architectural difference between the CPU-based rendering (used for "High Quality Export" and "Save") and the GPU-based rendering (used for Realtime Preview and "GPU Export"). 

*   **GPU Pipeline:** Operates in **Floating Point (32-bit float)** precision throughout the pipeline. Clamping primarily occurs at the very end of the fragment shader.
*   **CPU Pipeline:** Operates in **8-bit Integer (0-255)** precision for the Tone Mapping stage due to the use of a Look-Up Table (LUT).

**Result:** The CPU pipeline irreparably destructs highlight information *before* exposure/contrast adjustments can recover it. This results in clipped highlights in CPU exports that appear perfectly preserved in GPU exports/previews.

## 2. Detailed Technical Analysis

### 2.1 The "Tone LUT" Bottleneck (CPU)

The `RenderCore.js` (CPU) pipeline assumes that Tone Mapping (Exposure + Contrast + Shadows/Highlights + Whites/Blacks) can be pre-calculated into a 256-element array (`toneLUT`).

**CPU Code Flow (`RenderCore.js`):**

```javascript
// Step 4: White Balance
r *= luts.rBal;
g *= luts.gBal;
b *= luts.bBal;

// Step 5: Clamping (DESTRUCTIVE)
// All values > 255 are clipped here
r = this._clamp255(r);
g = this._clamp255(g);
b = this._clamp255(b);

// Step 6: Tone Mapping via LUT
// The lookup index is limited to 0-255
r = luts.toneLUT[Math.floor(r)];
g = luts.toneLUT[Math.floor(g)];
b = luts.toneLUT[Math.floor(b)];
```

**Scenario: High Exposure Recovery**
If a user reduces Exposure (`-2.0 EV`) to recover bright details:
1.  **Input Pixel:** `R=300` (after White Balance)
2.  **Clamping:** `R` becomes `255`.
3.  **LUT Lookup:** `toneLUT[255]` applies -2.0 EV $\rightarrow$ Output `64` (approx).
4.  **Result:** A pixel that was `255` and a pixel that was `300` both become `64`. Contrast is lost.

### 2.2 The Floating Point Advantage (GPU)

The GPU shader (`gpu-renderer.js`) calculates math on live float values without intermediate clamping.

**GPU Code Flow:**

```glsl
// White Balance
c *= u_gains;

// Exposure (Math applied directly to float)
float expFactor = pow(2.0, u_exposure / 50.0);
c *= expFactor; // 300 * 0.25 = 75

// Contrast / Shadows / Highlights...
// ...

// Final Clamping only happens here
gl_FragColor = vec4(c, 1.0);
```

**Scenario: High Exposure Recovery**
1.  **Input Pixel:** `R=1.2` (~306 in 8-bit)
2.  **Exposure:** `1.2 * 0.25` = `0.3` (~76)
3.  **Input Pixel B:** `R=1.0` (255)
4.  **Exposure:** `1.0 * 0.25` = `0.25` (~64)
5.  **Result:** `76` vs `64`. Contrast is preserved. Details are recovered.

## 3. Secondary Discrepancies

### 3.1 Curve Precision
*   **CPU:** Uses `buildCurveLUT` (256 steps). Quantization errors may occur for steep curves.
*   **GPU:** Uses `u_toneCurveTex` (256 width texture). Linear interpolation (filtering) in texture lookup gives slightly smoother results than integer array lookup, relying on `texture2D`.

### 3.2 Color Space & Bit Depth
*   **CPU:** Input images are loaded via `sharp` usually as 8-bit buffers. `RenderCore` processes them as `0-255` numbers.
*   **GPU:** WebGL implementation loads images into textures. Depending on the source loading mechanism, it might be 8-bit texture, but math is float.

## 4. Recommendations for Fix

Do **NOT** attempt to fix the GPU implementation to match the CPU (downgrading quality). Instead, upgrade the CPU implementation.

### Option A: Direct Computation (Recommended for HQ Export)
Modify `RenderCore.js` to support a `precision: 'float'` mode.
In this mode, skip the `toneLUT` generation and `_clamp255`. Instead, call a shared `applyToneMappingMath(r, params)` function that acts on raw numbers (potentially > 255).

**Pro:** Matches GPU behavior 1:1. Best quality.
**Con:** Slower than LUT lookup (more math per pixel).

### Option B: High-Depth LUT
Use a 12-bit (4096 step) or 16-bit LUT for the CPU pipeline.

**Pro:** Faster than direct math.
**Con:** Still has a clamping ceiling, just higher. Memory usage increases slightly.

### Next Steps
1.  Verify if `RenderCore.js` is used by *other* low-latency features (e.g. thumbnails) where headers might be needed.
2.  Create a separate `RenderCoreFloat.js` or add a mode flag to `RenderCore` to bypass LUTs for specific operations.
