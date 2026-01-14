/**
 * Image LUT (Look-Up Table) Utilities
 * 
 * Provides functions for generating tone and curve LUTs
 * used in FilmLab image processing.
 * 
 * These functions mirror the client-side preview implementation
 * for consistent results between preview and export.
 */

/** Tone adjustment parameters */
export interface ToneParams {
  exposure?: number;
  contrast?: number;
  highlights?: number;
  shadows?: number;
  whites?: number;
  blacks?: number;
}

/** Curve control point */
export interface CurvePoint {
  x: number;
  y: number;
}

/** Spline interpolation function */
export type SplineFunction = (x: number) => number;

/**
 * Build a tone adjustment LUT based on exposure, contrast, highlights, shadows, whites, blacks
 * @param params - Tone parameters
 * @returns 256-element LUT
 */
export function buildToneLUT(params: ToneParams): Uint8Array {
  const { exposure = 0, contrast = 0, highlights = 0, shadows = 0, whites = 0, blacks = 0 } = params;
  const lut = new Uint8Array(256);
  const expFactor = Math.pow(2, (Number(exposure) || 0) / 50);
  const ctr = Number(contrast) || 0;
  const contrastFactor = (259 * (ctr + 255)) / (255 * (259 - ctr));
  const blackPoint = -(Number(blacks) || 0) * 0.002;
  const whitePoint = 1 - (Number(whites) || 0) * 0.002;
  const sFactor = (Number(shadows) || 0) * 0.005;
  const hFactor = (Number(highlights) || 0) * 0.005;
  
  for (let i = 0; i < 256; i++) {
    let val = i / 255;
    val *= expFactor;
    val = (val - 0.5) * contrastFactor + 0.5;
    if (whitePoint !== blackPoint) {
      val = (val - blackPoint) / (whitePoint - blackPoint);
    }
    if (sFactor !== 0) {
      val += sFactor * Math.pow(1 - val, 2) * val * 4;
    }
    if (hFactor !== 0) {
      val += hFactor * Math.pow(val, 2) * (1 - val) * 4;
    }
    lut[i] = Math.min(255, Math.max(0, Math.round(val * 255)));
  }
  return lut;
}

/**
 * Create a monotonic cubic spline interpolator
 * Uses Fritsch-Carlson method for monotone interpolation
 * @param xs - X coordinates (sorted ascending)
 * @param ys - Y coordinates
 * @returns Interpolation function
 */
export function createSpline(xs: number[], ys: number[]): SplineFunction {
  const n = xs.length;
  const dys: number[] = [];
  const dxs: number[] = [];
  const ms: number[] = [];
  
  for (let i = 0; i < n - 1; i++) {
    dxs.push(xs[i + 1] - xs[i]);
    dys.push(ys[i + 1] - ys[i]);
    ms.push(dys[i] / dxs[i]);
  }
  
  const c1s: number[] = [ms[0]];
  for (let i = 0; i < n - 2; i++) {
    const m = ms[i];
    const mNext = ms[i + 1];
    if (m * mNext <= 0) {
      c1s.push(0);
    } else {
      const dx = dxs[i];
      const dxNext = dxs[i + 1];
      const common = dx + dxNext;
      c1s.push((3 * common) / ((common + dxNext) / m + (common + dx) / mNext));
    }
  }
  c1s.push(ms[ms.length - 1]);
  
  const c2s: number[] = [];
  const c3s: number[] = [];
  for (let i = 0; i < n - 1; i++) {
    const c1 = c1s[i];
    const m = ms[i];
    const invDx = 1 / dxs[i];
    const common = c1 + c1s[i + 1] - 2 * m;
    c2s.push((m - c1 - common) * invDx);
    c3s.push(common * invDx * invDx);
  }
  
  return (x: number): number => {
    let i = 0;
    while (i < n - 2 && x > xs[i + 1]) i++;
    const diff = x - xs[i];
    return ys[i] + c1s[i] * diff + c2s[i] * diff * diff + c3s[i] * diff * diff * diff;
  };
}

/**
 * Build a curve LUT from control points
 * @param points - Curve control points (0-255 range)
 * @returns 256-element LUT
 */
export function buildCurveLUT(points: CurvePoint[]): Uint8Array {
  const lut = new Uint8Array(256);
  const sorted = Array.isArray(points) 
    ? [...points].sort((a, b) => a.x - b.x) 
    : [{ x: 0, y: 0 }, { x: 255, y: 255 }];
  
  if (sorted.length < 2) {
    for (let i = 0; i < 256; i++) lut[i] = i;
    return lut;
  }
  
  const xs = sorted.map(p => p.x);
  const ys = sorted.map(p => p.y);
  const spline = createSpline(xs, ys);
  
  for (let i = 0; i < 256; i++) {
    if (i <= sorted[0].x) {
      lut[i] = sorted[0].y;
    } else if (i >= sorted[sorted.length - 1].x) {
      lut[i] = sorted[sorted.length - 1].y;
    } else {
      lut[i] = Math.min(255, Math.max(0, Math.round(spline(i))));
    }
  }
  return lut;
}

/**
 * Apply a LUT to a raw pixel buffer (in-place modification)
 * @param buffer - Raw pixel buffer (RGB or RGBA)
 * @param lut - 256-element LUT
 * @param channels - Number of channels (3 for RGB, 4 for RGBA)
 */
export function applyLUT(buffer: Buffer, lut: Uint8Array, channels: number = 3): void {
  for (let i = 0; i < buffer.length; i += channels) {
    buffer[i] = lut[buffer[i]];         // R
    buffer[i + 1] = lut[buffer[i + 1]]; // G
    buffer[i + 2] = lut[buffer[i + 2]]; // B
    // Alpha (if present) is unchanged
  }
}

/**
 * Apply per-channel LUTs to a raw pixel buffer (in-place modification)
 * @param buffer - Raw pixel buffer (RGB or RGBA)
 * @param rLut - Red channel LUT
 * @param gLut - Green channel LUT
 * @param bLut - Blue channel LUT
 * @param channels - Number of channels
 */
export function applyChannelLUTs(
  buffer: Buffer, 
  rLut: Uint8Array, 
  gLut: Uint8Array, 
  bLut: Uint8Array, 
  channels: number = 3
): void {
  for (let i = 0; i < buffer.length; i += channels) {
    buffer[i] = rLut[buffer[i]];         // R
    buffer[i + 1] = gLut[buffer[i + 1]]; // G
    buffer[i + 2] = bLut[buffer[i + 2]]; // B
  }
}

/**
 * Create an identity LUT (no change)
 * @returns 256-element identity LUT
 */
export function createIdentityLUT(): Uint8Array {
  const lut = new Uint8Array(256);
  for (let i = 0; i < 256; i++) lut[i] = i;
  return lut;
}

// CommonJS compatibility
module.exports = {
  buildToneLUT,
  buildCurveLUT,
  createSpline,
  applyLUT,
  applyChannelLUTs,
  createIdentityLUT
};
