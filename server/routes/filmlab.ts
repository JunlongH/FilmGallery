import express, { Request, Response, Router } from 'express';
import path from 'path';
import fs from 'fs';
import sharp from 'sharp';

const db = require('../db');
const { uploadsDir } = require('../config/paths');
const { buildPipeline } = require('../services/filmlab-service');
const { computeWBGains } = require('../utils/filmlab-wb');

sharp.cache(false);

const router: Router = express.Router();

// ============= Type Definitions =============

interface CurvePoint {
  x: number;
  y: number;
}

interface CurvesConfig {
  rgb: CurvePoint[];
  red: CurvePoint[];
  green: CurvePoint[];
  blue: CurvePoint[];
}

interface CropRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface FilmLabParams {
  exposure?: number;
  contrast?: number;
  highlights?: number;
  shadows?: number;
  whites?: number;
  blacks?: number;
  curves?: Partial<CurvesConfig>;
  cropRect?: CropRect | null;
  inverted?: boolean;
  inversionMode?: 'linear' | 'log';
  temp?: number;
  tint?: number;
  red?: number;
  green?: number;
  blue?: number;
  rotation?: number;
  flipH?: boolean;
  flipV?: boolean;
}

interface PhotoRow {
  id: number;
  roll_id: number;
  filename: string | null;
  original_rel_path: string | null;
  positive_rel_path: string | null;
  full_rel_path: string | null;
  negative_rel_path: string | null;
}

interface ToneParams {
  exposure?: number;
  contrast?: number;
  highlights?: number;
  shadows?: number;
  whites?: number;
  blacks?: number;
}

// ============= Helper Functions: LUT Builders =============

/**
 * Build a tone mapping LUT applying exposure, contrast, highlights, shadows, whites, blacks.
 * Mirrors the client-side WebGL implementation.
 */
function buildToneLUT(params: ToneParams): Uint8Array {
  const lut = new Uint8Array(256);
  const expFactor = Math.pow(2, (Number(params.exposure) || 0) / 50);
  const ctr = Number(params.contrast) || 0;
  const contrastFactor = (259 * (ctr + 255)) / (255 * (259 - ctr));
  const blackPoint = -(Number(params.blacks) || 0) * 0.002;
  const whitePoint = 1 - (Number(params.whites) || 0) * 0.002;
  const sFactor = (Number(params.shadows) || 0) * 0.005;
  const hFactor = (Number(params.highlights) || 0) * 0.005;
  
  for (let i = 0; i < 256; i++) {
    let val = i / 255;
    // Exposure
    val *= expFactor;
    // Contrast around 0.5
    val = (val - 0.5) * contrastFactor + 0.5;
    // Blacks & Whites window
    if (whitePoint !== blackPoint) val = (val - blackPoint) / (whitePoint - blackPoint);
    // Shadows
    if (sFactor !== 0) val += sFactor * Math.pow(1 - val, 2) * val * 4;
    // Highlights
    if (hFactor !== 0) val += hFactor * Math.pow(val, 2) * (1 - val) * 4;
    lut[i] = Math.min(255, Math.max(0, Math.round(val * 255)));
  }
  return lut;
}

/**
 * Create a monotonic cubic spline interpolator.
 */
function createSpline(xs: number[], ys: number[]): (x: number) => number {
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
    const m = ms[i], mNext = ms[i + 1];
    if (m * mNext <= 0) {
      c1s.push(0);
    } else {
      const dx = dxs[i], dxNext = dxs[i + 1];
      const common = dx + dxNext;
      c1s.push((3 * common) / ((common + dxNext) / m + (common + dx) / mNext));
    }
  }
  c1s.push(ms[ms.length - 1]);
  
  const c2s: number[] = [];
  const c3s: number[] = [];
  for (let i = 0; i < n - 1; i++) {
    const c1 = c1s[i], m = ms[i], invDx = 1 / dxs[i];
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
 * Build a curve LUT from control points using cubic spline interpolation.
 */
function buildCurveLUT(points: CurvePoint[] | undefined): Uint8Array {
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
 * Get the default curves configuration.
 */
function getDefaultCurves(): CurvesConfig {
  return {
    rgb: [{ x: 0, y: 0 }, { x: 255, y: 255 }],
    red: [{ x: 0, y: 0 }, { x: 255, y: 255 }],
    green: [{ x: 0, y: 0 }, { x: 255, y: 255 }],
    blue: [{ x: 0, y: 0 }, { x: 255, y: 255 }]
  };
}

/**
 * Apply per-pixel color processing: log inversion, WB, tone, and curves.
 */
function processPixels(
  data: Buffer,
  width: number,
  height: number,
  channels: number,
  params: FilmLabParams,
  options: { debugCenter?: boolean } = {}
): Buffer {
  const out = Buffer.allocUnsafe(width * height * 3);
  
  // Build LUTs
  const toneLUT = buildToneLUT({
    exposure: params.exposure || 0,
    contrast: params.contrast || 0,
    highlights: params.highlights || 0,
    shadows: params.shadows || 0,
    whites: params.whites || 0,
    blacks: params.blacks || 0,
  });
  
  const curves = params.curves || getDefaultCurves();
  const lutRGB = buildCurveLUT(curves.rgb);
  const lutR = buildCurveLUT(curves.red);
  const lutG = buildCurveLUT(curves.green);
  const lutB = buildCurveLUT(curves.blue);
  
  // Get params for inversion and WB
  const inverted = params.inverted || false;
  const inversionMode = params.inversionMode || 'linear';
  const temp = params.temp || 0;
  const tint = params.tint || 0;
  const red = params.red ?? 1.0;
  const green = params.green ?? 1.0;
  const blue = params.blue ?? 1.0;
  
  // WB gains
  const [rBal, gBal, bBal] = computeWBGains({ red, green, blue, temp, tint });
  
  // Log inversion needs to be done in JS (Sharp can't do log math)
  const needsLogInversion = inverted && inversionMode === 'log';
  const needsWbInJs = needsLogInversion;
  
  // Debug: sample center pixel
  const centerX = Math.floor(width / 2);
  const centerY = Math.floor(height / 2);
  
  for (let i = 0, j = 0; i < data.length; i += channels, j += 3) {
    let r = data[i];
    let g = data[i + 1];
    let b = data[i + 2];
    
    // Log inversion: 255 * (1 - log(x+1) / log(256)) - matches client exactly
    if (needsLogInversion) {
      r = 255 * (1 - Math.log(r + 1) / Math.log(256));
      g = 255 * (1 - Math.log(g + 1) / Math.log(256));
      b = 255 * (1 - Math.log(b + 1) / Math.log(256));
    }
    
    // Apply WB gains (only if log inversion was deferred)
    if (needsWbInJs) {
      r *= rBal;
      g *= gBal;
      b *= bBal;
      r = Math.max(0, Math.min(255, r));
      g = Math.max(0, Math.min(255, g));
      b = Math.max(0, Math.min(255, b));
    }
    
    // Debug center pixel before tone/curves
    if (options.debugCenter) {
      const pixelY = Math.floor(i / channels / width);
      const pixelX = (i / channels) % width;
      if (pixelY === centerY && pixelX === centerX) {
        console.log('[Server Preview] Center pixel BEFORE tone/curves:', { r, g, b });
      }
    }
    
    // Apply tone mapping
    const rIdx = Math.floor(r);
    const gIdx = Math.floor(g);
    const bIdx = Math.floor(b);
    r = toneLUT[rIdx];
    g = toneLUT[gIdx];
    b = toneLUT[bIdx];
    
    // Debug center pixel after toneLUT
    if (options.debugCenter) {
      const pixelY = Math.floor(i / channels / width);
      const pixelX = (i / channels) % width;
      if (pixelY === centerY && pixelX === centerX) {
        console.log('[Server Preview] Center pixel AFTER toneLUT:', { r, g, b });
      }
    }
    
    // Apply curves: RGB then individual channels
    r = lutRGB[r];
    g = lutRGB[g];
    b = lutRGB[b];
    r = lutR[r];
    g = lutG[g];
    b = lutB[b];
    
    out[j] = r;
    out[j + 1] = g;
    out[j + 2] = b;
  }
  
  return out;
}

// ============= Routes =============

// POST /api/filmlab/preview
// Body: { photoId, params, maxWidth }
router.post('/preview', async (req: Request, res: Response) => {
  const { photoId, params, maxWidth } = req.body || {};
  if (!photoId) return res.status(400).json({ error: 'photoId required' });
  
  try {
    const row = await new Promise<PhotoRow | undefined>((resolve, reject) => {
      db.get(
        'SELECT id, roll_id, original_rel_path, positive_rel_path, full_rel_path, negative_rel_path FROM photos WHERE id = ?',
        [photoId],
        (err: Error | null, r: PhotoRow | undefined) => err ? reject(err) : resolve(r)
      );
    });
    
    if (!row) return res.status(404).json({ error: 'photo not found' });
    
    const relSource = row.original_rel_path || row.positive_rel_path || row.full_rel_path || row.negative_rel_path;
    if (!relSource) return res.status(400).json({ error: 'no usable source path' });
    
    const abs = path.join(uploadsDir, relSource);
    if (!fs.existsSync(abs)) return res.status(404).json({ error: 'source missing on disk' });
    
    // Build pipeline: rotate/resize/crop only. All color ops applied in JS for parity with client.
    const img = await buildPipeline(abs, params || {}, { 
      maxWidth: maxWidth || 1600, 
      cropRect: (params && params.cropRect) || null, 
      toneAndCurvesInJs: true 
    });
    
    // Pull raw buffer
    const { data, info } = await img.raw().toBuffer({ resolveWithObject: true });
    const width = info.width;
    const height = info.height;
    const channels = info.channels;
    
    // Process pixels with debugging enabled
    const out = processPixels(data, width, height, channels, params || {}, { debugCenter: true });
    
    console.log('[Server Preview] Final output buffer size:', out.length, 'bytes');
    console.log('[Server Preview] Output dimensions:', width, 'x', height);
    
    // Encode to JPEG and send
    res.setHeader('Content-Type', 'image/jpeg');
    const buf = await sharp(out, { raw: { width, height, channels: 3 } }).jpeg({ quality: 85 }).toBuffer();
    console.log('[Server Preview] JPEG buffer size:', buf.length, 'bytes');
    res.end(buf);
  } catch (e) {
    console.error('[FILMLAB] preview error', e);
    res.status(500).json({ error: e && (e as Error).message });
  }
});

// POST /api/filmlab/render
// Body: { photoId, params }
router.post('/render', async (req: Request, res: Response) => {
  const { photoId, params } = req.body || {};
  if (!photoId) return res.status(400).json({ error: 'photoId required' });
  
  try {
    const row = await new Promise<PhotoRow | undefined>((resolve, reject) => {
      db.get(
        'SELECT id, roll_id, original_rel_path, positive_rel_path, full_rel_path, negative_rel_path, filename FROM photos WHERE id = ?',
        [photoId],
        (err: Error | null, r: PhotoRow | undefined) => err ? reject(err) : resolve(r)
      );
    });
    
    if (!row) return res.status(404).json({ error: 'photo not found' });
    
    const relSource = row.original_rel_path || row.positive_rel_path || row.full_rel_path || row.negative_rel_path;
    if (!relSource) return res.status(400).json({ error: 'no usable source path' });
    
    const abs = path.join(uploadsDir, relSource);
    if (!fs.existsSync(abs)) return res.status(404).json({ error: 'source missing on disk' });
    
    // Full resolution pipeline: geometry only; color ops in JS
    const img = await buildPipeline(abs, params || {}, { 
      maxWidth: 4000, 
      cropRect: (params && params.cropRect) || null, 
      toneAndCurvesInJs: true 
    });
    
    const { data, info } = await img.raw().toBuffer({ resolveWithObject: true });
    const width = info.width;
    const height = info.height;
    const channels = info.channels;
    
    // Process pixels
    const out = processPixels(data, width, height, channels, params || {});
    
    // Save to positive file
    const rollDir = path.dirname(path.join(uploadsDir, relSource));
    const ext = path.extname(row.filename || 'image.jpg') || '.jpg';
    const base = path.basename(row.filename || 'image.jpg', ext);
    
    // Use consistent naming: if already has _pos, keep it; otherwise add _pos
    let newName: string;
    if (base.includes('_pos')) {
      newName = `${base}${ext}`;
    } else {
      newName = `${base}_pos${ext}`;
    }
    
    let outDir = rollDir;
    if (relSource.includes('/negative')) {
      outDir = rollDir.replace(/negative$/, 'full').replace(/negative[\\/]$/, 'full');
      if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
    }
    
    const outPath = path.join(outDir, newName);
    
    await sharp(out, { raw: { width, height, channels: 3 } }).jpeg({ quality: 95 }).toFile(outPath);
    
    const relOut = path.relative(uploadsDir, outPath).replace(/\\/g, '/');
    
    // Also update filename in database to match the actual file
    await new Promise<void>((resolve, reject) => {
      db.run(
        'UPDATE photos SET filename = ?, positive_rel_path = ?, full_rel_path = ? WHERE id = ?',
        [newName, relOut, relOut, photoId],
        (err: Error | null) => err ? reject(err) : resolve()
      );
    });
    
    res.json({ ok: true, path: relOut });
  } catch (e) {
    console.error('[FILMLAB] render error', e);
    res.status(500).json({ error: e && (e as Error).message });
  }
});

// POST /api/filmlab/export
// Body: { photoId, params }
router.post('/export', async (req: Request, res: Response) => {
  const { photoId, params } = req.body || {};
  if (!photoId) return res.status(400).json({ error: 'photoId required' });
  
  try {
    const row = await new Promise<PhotoRow | undefined>((resolve, reject) => {
      db.get(
        'SELECT id, roll_id, filename, original_rel_path, positive_rel_path, full_rel_path, negative_rel_path FROM photos WHERE id = ?',
        [photoId],
        (err: Error | null, r: PhotoRow | undefined) => err ? reject(err) : resolve(r)
      );
    });
    
    if (!row) return res.status(404).json({ error: 'photo not found' });
    
    const relSource = row.original_rel_path || row.positive_rel_path || row.full_rel_path || row.negative_rel_path;
    if (!relSource) return res.status(400).json({ error: 'no usable source path' });
    
    const abs = path.join(uploadsDir, relSource);
    if (!fs.existsSync(abs)) return res.status(404).json({ error: 'source missing on disk' });
    
    // Build pipeline with Inversion + WB applied in Sharp, Tone/Curves deferred to JS
    const img = await buildPipeline(abs, params || {}, { 
      maxWidth: 4000, 
      cropRect: (params && params.cropRect) || null, 
      toneAndCurvesInJs: true 
    });
    
    const { data, info } = await img.raw().toBuffer({ resolveWithObject: true });
    const width = info.width;
    const height = info.height;
    const channels = info.channels;
    
    // Process pixels
    const out = processPixels(data, width, height, channels, params || {});
    
    // Persist export to disk and update DB paths consistently
    const baseDir = path.dirname(path.join(uploadsDir, relSource));
    let outDir = baseDir;
    if (relSource.includes('/negative')) {
      outDir = baseDir.replace(/negative$/, 'full').replace(/negative[\\/]$/, 'full');
    } else if (!relSource.includes('/full')) {
      // If source is originals or other, use full directory sibling
      outDir = baseDir.replace(/originals$/, 'full').replace(/originals[\\/]$/, 'full');
    }
    if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
    
    // Build consistent file name based on existing filename
    const ext = path.extname(row.filename || 'image.jpg') || '.jpg';
    const base = path.basename(row.filename || 'image.jpg', ext);
    const outName = base.includes('_pos') ? `${base}${ext}` : `${base}_pos${ext}`;
    const outPath = path.join(outDir, outName);
    
    await sharp(out, { raw: { width, height, channels: 3 } }).jpeg({ quality: 95 }).toFile(outPath);
    const relOut = path.relative(uploadsDir, outPath).replace(/\\/g, '/');
    
    // Optionally generate/update thumbnail in thumb/ directory
    try {
      const rollsRoot = path.resolve(outDir, '..');
      const thumbDir = path.join(rollsRoot, 'thumb');
      if (!fs.existsSync(thumbDir)) fs.mkdirSync(thumbDir, { recursive: true });
      const thumbName = `${base.includes('_pos') ? base : base + '_pos'}-thumb.jpg`;
      const thumbPath = path.join(thumbDir, thumbName);
      
      await sharp(outPath)
        .resize({ width: 240, height: 240, fit: 'inside' })
        .jpeg({ quality: 40 })
        .toFile(thumbPath)
        .catch(() => {});
      
      const relThumb = path.relative(uploadsDir, thumbPath).replace(/\\/g, '/');
      
      // Update DB: filename, positive_rel_path, full_rel_path, positive_thumb_rel_path, thumb_rel_path
      await new Promise<void>((resolve, reject) => {
        db.run(
          'UPDATE photos SET filename = ?, positive_rel_path = ?, full_rel_path = ?, positive_thumb_rel_path = ?, thumb_rel_path = ? WHERE id = ?',
          [outName, relOut, relOut, relThumb, relThumb, photoId],
          (err: Error | null) => (err ? reject(err) : resolve())
        );
      });
    } catch (thumbErr) {
      // Fallback: update paths without thumbnail
      await new Promise<void>((resolve, reject) => {
        db.run(
          'UPDATE photos SET filename = ?, positive_rel_path = ?, full_rel_path = ? WHERE id = ?',
          [outName, relOut, relOut, photoId],
          (err: Error | null) => (err ? reject(err) : resolve())
        );
      });
    }
    
    res.json({ ok: true, path: relOut });
  } catch (e) {
    console.error('[FILMLAB] export error', e);
    res.status(500).json({ error: e && (e as Error).message });
  }
});

// CommonJS export for compatibility
module.exports = router;
export default router;
