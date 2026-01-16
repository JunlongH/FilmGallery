const express = require('express');
const router = express.Router();
const db = require('../db');
const path = require('path');
const fs = require('fs');
const sharp = require('sharp');
sharp.cache(false);
const { uploadsDir } = require('../config/paths');
const { buildPipeline } = require('../services/filmlab-service');

// 使用统一渲染核心和源路径解析器
const {
  RenderCore,
  EXPORT_MAX_WIDTH,
  PREVIEW_MAX_WIDTH_SERVER,
  getEffectiveInverted
} = require('../../packages/shared');

const { 
  getStrictSourcePath, 
  SOURCE_TYPE 
} = require('../../packages/shared/sourcePathResolver');

// POST /api/filmlab/preview
// Body: { photoId, params, maxWidth, sourceType }
router.post('/preview', async (req, res) => {
  const { photoId, params, maxWidth, sourceType } = req.body || {};
  if (!photoId) return res.status(400).json({ error: 'photoId required' });
  try {
    const row = await new Promise((resolve, reject) => {
      db.get('SELECT id, roll_id, original_rel_path, positive_rel_path, full_rel_path, negative_rel_path FROM photos WHERE id = ?', [photoId], (err, r) => err ? reject(err) : resolve(r));
    });
    if (!row) return res.status(404).json({ error: 'photo not found' });
    
    // 【重要】使用严格源路径选择，不允许跨类型回退
    const sourceResult = getStrictSourcePath(row, sourceType || 'original', {
      allowFallbackWithinType: true,
      allowCrossTypeFallback: false  // 绝不允许正片模式回退到负片
    });
    
    if (!sourceResult.path) {
      // 如果正片模式但无正片文件，返回明确错误
      return res.status(400).json({ 
        error: 'source_type_unavailable',
        message: sourceResult.warning || `No ${sourceType} file available for this photo`,
        sourceType,
        photoId
      });
    }
    
    const relSource = sourceResult.path;
    
    // 记录警告（如有）
    if (sourceResult.warning) {
      console.log(`[FilmLab Preview] Photo ${photoId}: ${sourceResult.warning}`);
    }
    
    const abs = path.join(uploadsDir, relSource);
    if (!fs.existsSync(abs)) return res.status(404).json({ error: 'source missing on disk' });

    // Build pipeline: rotate/resize/crop only. All color ops applied via shared module for client/server parity.
    let img = await buildPipeline(abs, params || {}, { 
      maxWidth: maxWidth || PREVIEW_MAX_WIDTH_SERVER, 
      cropRect: (params && params.cropRect) || null, 
      toneAndCurvesInJs: true,
      skipColorOps: true // Skip all color ops in Sharp, do everything in JS for consistency
    });

    // Pull raw buffer
    const { data, info } = await img.raw().toBuffer({ resolveWithObject: true });
    const width = info.width;
    const height = info.height;
    const channels = info.channels; // expect 3
    const out = Buffer.allocUnsafe(width * height * 3);

    // 使用统一渲染核心
    // 使用 getEffectiveInverted 计算有效反转状态，正片模式不需要反转
    const effectiveInverted = getEffectiveInverted(sourceType, params?.inverted);
    const core = new RenderCore({ ...params, inverted: effectiveInverted });
    core.prepareLUTs();

    // Process pixels using RenderCore
    for (let i = 0, j = 0; i < data.length; i += channels, j += 3) {
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];

      const [rC, gC, bC] = core.processPixel(r, g, b);

      out[j] = rC;
      out[j + 1] = gC;
      out[j + 2] = bC;
    }

    // Encode to JPEG and send
    res.setHeader('Content-Type', 'image/jpeg');
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    res.setHeader('Surrogate-Control', 'no-store');
    const buf = await sharp(out, { raw: { width, height, channels: 3 } }).jpeg({ quality: 85 }).toBuffer();
    console.log('[Server Preview] JPEG buffer size:', buf.length, 'bytes');
    res.end(buf);
  } catch (e) {
    console.error('[FILMLAB] preview error', e);
    res.status(500).json({ error: e && e.message });
  }
});

// POST /api/filmlab/render
// Body: { photoId, params }
router.post('/render', async (req, res) => {
  const { photoId, params } = req.body || {};
  if (!photoId) return res.status(400).json({ error: 'photoId required' });
  try {
    const row = await new Promise((resolve, reject) => {
      db.get('SELECT id, roll_id, original_rel_path, positive_rel_path, full_rel_path, negative_rel_path, filename FROM photos WHERE id = ?', [photoId], (err, r) => err ? reject(err) : resolve(r));
    });
    if (!row) return res.status(404).json({ error: 'photo not found' });
    const relSource = row.original_rel_path || row.positive_rel_path || row.full_rel_path || row.negative_rel_path;
    if (!relSource) return res.status(400).json({ error: 'no usable source path' });
    const abs = path.join(uploadsDir, relSource);
    if (!fs.existsSync(abs)) return res.status(404).json({ error: 'source missing on disk' });

    // Full resolution pipeline: geometry only; color ops via shared module
    let img = await buildPipeline(abs, params || {}, { 
      maxWidth: EXPORT_MAX_WIDTH, 
      cropRect: (params && params.cropRect) || null, 
      toneAndCurvesInJs: true,
      skipColorOps: true
    });

    const { data, info } = await img.raw().toBuffer({ resolveWithObject: true });
    const width = info.width;
    const height = info.height;
    const channels = info.channels;
    const out = Buffer.allocUnsafe(width * height * 3);

    // 使用统一渲染核心
    const core = new RenderCore(params || {});
    core.prepareLUTs();

    // Process pixels using RenderCore
    for (let i = 0, j = 0; i < data.length; i += channels, j += 3) {
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];

      const [rC, gC, bC] = core.processPixel(r, g, b);

      out[j] = rC;
      out[j + 1] = gC;
      out[j + 2] = bC;
    }

    // Save to positive file
    const rollDir = path.dirname(path.join(uploadsDir, relSource));
    const ext = path.extname(row.filename || 'image.jpg') || '.jpg';
    const base = path.basename(row.filename || 'image.jpg', ext);
    
    // Use consistent naming: if already has _pos, keep it; otherwise add _pos
    let newName;
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
    await new Promise((resolve, reject) => {
        db.run('UPDATE photos SET filename = ?, positive_rel_path = ?, full_rel_path = ? WHERE id = ?', [newName, relOut, relOut, photoId], (err) => err ? reject(err) : resolve());
    });

    res.json({ ok: true, path: relOut });
  } catch (e) {
    console.error('[FILMLAB] render error', e);
    res.status(500).json({ error: e && e.message });
  }
});

// POST /api/filmlab/export
// Body: { photoId, params }
router.post('/export', async (req, res) => {
  const { photoId, params } = req.body || {};
  if (!photoId) return res.status(400).json({ error: 'photoId required' });
  try {
    const row = await new Promise((resolve, reject) => {
      db.get('SELECT id, roll_id, filename, original_rel_path, positive_rel_path, full_rel_path, negative_rel_path FROM photos WHERE id = ?', [photoId], (err, r) => err ? reject(err) : resolve(r));
    });
    if (!row) return res.status(404).json({ error: 'photo not found' });
    const relSource = row.original_rel_path || row.positive_rel_path || row.full_rel_path || row.negative_rel_path;
    if (!relSource) return res.status(400).json({ error: 'no usable source path' });
    const abs = path.join(uploadsDir, relSource);
    if (!fs.existsSync(abs)) return res.status(404).json({ error: 'source missing on disk' });

    // Full resolution pipeline: geometry only; color ops via shared module
    let img = await buildPipeline(abs, params || {}, { 
      maxWidth: EXPORT_MAX_WIDTH, 
      cropRect: (params && params.cropRect) || null, 
      toneAndCurvesInJs: true,
      skipColorOps: true
    });

    const { data, info } = await img.raw().toBuffer({ resolveWithObject: true });
    const width = info.width;
    const height = info.height;
    const channels = info.channels;
    const out = Buffer.allocUnsafe(width * height * 3);

    // 使用统一渲染核心
    const core = new RenderCore(params || {});
    core.prepareLUTs();

    // Process pixels using RenderCore
    for (let i = 0, j = 0; i < data.length; i += channels, j += 3) {
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];

      const [rC, gC, bC] = core.processPixel(r, g, b);

      out[j] = rC;
      out[j + 1] = gC;
      out[j + 2] = bC;
    }

    // Persist export to disk and update DB paths consistently
    // Determine output directory (prefer full/ under the same roll)
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
      await new Promise((resolve, reject) => {
        db.run(
          'UPDATE photos SET filename = ?, positive_rel_path = ?, full_rel_path = ?, positive_thumb_rel_path = ?, thumb_rel_path = ? WHERE id = ?',
          [outName, relOut, relOut, relThumb, relThumb, photoId],
          (err) => (err ? reject(err) : resolve())
        );
      });
    } catch (e) {
      // Fallback: update paths without thumbnail
      await new Promise((resolve, reject) => {
        db.run(
          'UPDATE photos SET filename = ?, positive_rel_path = ?, full_rel_path = ? WHERE id = ?',
          [outName, relOut, relOut, photoId],
          (err) => (err ? reject(err) : resolve())
        );
      });
    }

    res.json({ ok: true, path: relOut });
  } catch (e) {
    console.error('[FILMLAB] export error', e);
    res.status(500).json({ error: e && e.message });
  }
});

module.exports = router;
