const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
sharp.cache(false);
const { buildPipeline } = require('../services/filmlab-service');
const { runAsync, allAsync, getAsync, validatePhotoUpdate } = require('../utils/db-helpers');
const { savePhotoTags, attachTagsToPhotos } = require('../services/tag-service');
const { uploadsDir } = require('../config/paths');
const { uploadDefault } = require('../config/multer');
const { moveFileSync } = require('../utils/file-helpers');
const PreparedStmt = require('../utils/prepared-statements');

// Helpers for tone and curves (mirror preview implementation)
function buildToneLUT({ exposure = 0, contrast = 0, highlights = 0, shadows = 0, whites = 0, blacks = 0 }) {
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
    if (whitePoint !== blackPoint) val = (val - blackPoint) / (whitePoint - blackPoint);
    if (sFactor !== 0) val += sFactor * Math.pow(1 - val, 2) * val * 4;
    if (hFactor !== 0) val += hFactor * Math.pow(val, 2) * (1 - val) * 4;
    lut[i] = Math.min(255, Math.max(0, Math.round(val * 255)));
  }
  return lut;
}

function createSpline(xs, ys) {
  const n = xs.length;
  const dys = [], dxs = [], ms = [];
  for (let i = 0; i < n - 1; i++) { dxs.push(xs[i + 1] - xs[i]); dys.push(ys[i + 1] - ys[i]); ms.push(dys[i] / dxs[i]); }
  const c1s = [ms[0]];
  for (let i = 0; i < n - 2; i++) {
    const m = ms[i], mNext = ms[i + 1];
    if (m * mNext <= 0) c1s.push(0);
    else {
      const dx = dxs[i], dxNext = dxs[i + 1];
      const common = dx + dxNext;
      c1s.push((3 * common) / ((common + dxNext) / m + (common + dx) / mNext));
    }
  }
  c1s.push(ms[ms.length - 1]);
  const c2s = [], c3s = [];
  for (let i = 0; i < n - 1; i++) {
    const c1 = c1s[i], m = ms[i], invDx = 1 / dxs[i];
    const common = c1 + c1s[i + 1] - 2 * m;
    c2s.push((m - c1 - common) * invDx);
    c3s.push(common * invDx * invDx);
  }
  return (x) => {
    let i = 0; while (i < n - 2 && x > xs[i + 1]) i++;
    const diff = x - xs[i];
    return ys[i] + c1s[i] * diff + c2s[i] * diff * diff + c3s[i] * diff * diff * diff;
  };
}

function buildCurveLUT(points) {
  const lut = new Uint8Array(256);
  const sorted = Array.isArray(points) ? [...points].sort((a, b) => a.x - b.x) : [{ x: 0, y: 0 }, { x: 255, y: 255 }];
  if (sorted.length < 2) { for (let i = 0; i < 256; i++) lut[i] = i; return lut; }
  const xs = sorted.map(p => p.x); const ys = sorted.map(p => p.y); const spline = createSpline(xs, ys);
  for (let i = 0; i < 256; i++) {
    if (i <= sorted[0].x) lut[i] = sorted[0].y;
    else if (i >= sorted[sorted.length - 1].x) lut[i] = sorted[sorted.length - 1].y;
    else lut[i] = Math.min(255, Math.max(0, Math.round(spline(i))));
  }
  return lut;
}

// Get all photos with optional filtering
router.get('/', async (req, res) => {
  const { camera, lens, photographer, location_id, film, year, month, ym } = req.query;

  const toArray = (v) => {
    if (v === undefined || v === null) return [];
    if (Array.isArray(v)) return v.filter(Boolean);
    if (typeof v === 'string' && v.includes(',')) return v.split(',').map(s=>s.trim()).filter(Boolean);
    return v === '' ? [] : [v];
  };

  const cameras = toArray(camera);
  const lenses = toArray(lens);
  const photographers = toArray(photographer);
  const locations = toArray(location_id).map(v => String(v).split('::')[0]);
  const years = toArray(year);
  const months = toArray(month);
  const yms = toArray(ym);
  const films = toArray(film);

  // Check if locations table exists
  const locationsTableExists = await getAsync("SELECT name FROM sqlite_master WHERE type='table' AND name='locations'", []);

  let sql = locationsTableExists ? `
    SELECT p.*, r.title as roll_title, l.city_name, l.country_name, COALESCE(f.name, r.film_type) AS film_name,
           cam.name AS camera_equip_name, cam.brand AS camera_equip_brand, cam.mount AS camera_equip_mount,
           cam.has_fixed_lens, cam.fixed_lens_focal_length, cam.fixed_lens_max_aperture,
           lens.name AS lens_equip_name, lens.brand AS lens_equip_brand,
           lens.focal_length_min AS lens_equip_focal_min, lens.focal_length_max AS lens_equip_focal_max,
           lens.max_aperture AS lens_equip_max_aperture,
           flash.name AS flash_equip_name, flash.brand AS flash_equip_brand, flash.guide_number AS flash_equip_gn
    FROM photos p
    JOIN rolls r ON p.roll_id = r.id
    LEFT JOIN locations l ON p.location_id = l.id
    LEFT JOIN films f ON r.filmId = f.id
    LEFT JOIN equip_cameras cam ON p.camera_equip_id = cam.id
    LEFT JOIN equip_lenses lens ON p.lens_equip_id = lens.id
    LEFT JOIN equip_flashes flash ON p.flash_equip_id = flash.id
    WHERE 1=1
  ` : `
    SELECT p.*, r.title as roll_title, NULL as city_name, NULL as country_name, COALESCE(f.name, r.film_type) AS film_name,
           cam.name AS camera_equip_name, cam.brand AS camera_equip_brand, cam.mount AS camera_equip_mount,
           cam.has_fixed_lens, cam.fixed_lens_focal_length, cam.fixed_lens_max_aperture,
           lens.name AS lens_equip_name, lens.brand AS lens_equip_brand,
           lens.focal_length_min AS lens_equip_focal_min, lens.focal_length_max AS lens_equip_focal_max,
           lens.max_aperture AS lens_equip_max_aperture,
           flash.name AS flash_equip_name, flash.brand AS flash_equip_brand, flash.guide_number AS flash_equip_gn
    FROM photos p
    JOIN rolls r ON p.roll_id = r.id
    LEFT JOIN films f ON r.filmId = f.id
    LEFT JOIN equip_cameras cam ON p.camera_equip_id = cam.id
    LEFT JOIN equip_lenses lens ON p.lens_equip_id = lens.id
    LEFT JOIN equip_flashes flash ON p.flash_equip_id = flash.id
    WHERE 1=1
  `;
  const params = [];

  if (cameras.length) {
    const cs = cameras.map(() => `p.camera = ?`).join(' OR ');
    sql += ` AND (${cs})`;
    cameras.forEach(c => { params.push(c); });
  }

  if (lenses.length) {
    const ls = lenses.map(() => `p.lens = ?`).join(' OR ');
    sql += ` AND (${ls})`;
    lenses.forEach(l => { params.push(l); });
  }

  if (photographers.length) {
    const ps = photographers.map(() => `p.photographer = ?`).join(' OR ');
    sql += ` AND (${ps})`;
    photographers.forEach(pv => { params.push(pv); });
  }

  if (locations.length) {
    const placeholders = locations.map(()=>'?').join(',');
    sql += ` AND p.location_id IN (${placeholders})`;
    params.push(...locations);
  }

  if (films.length) {
    const fs = films.map(() => `(
      r.filmId = ? OR f.name = ? OR r.film_type = ?
    )`).join(' OR ');
    sql += ` AND (${fs})`;
    films.forEach(fv => { params.push(fv, fv, fv); });
  }

  if (years.length || months.length || yms.length) {
    const parts = [];
    if (yms.length) {
      parts.push(`strftime('%Y-%m', p.date_taken) IN (${yms.map(()=>'?').join(',')})`); params.push(...yms);
    } else {
      if (years.length) { parts.push(`strftime('%Y', p.date_taken) IN (${years.map(()=>'?').join(',')})`); params.push(...years); }
      if (months.length) { parts.push(`strftime('%m', p.date_taken) IN (${months.map(()=>'?').join(',')})`); params.push(...months); }
    }
    if (parts.length) sql += ` AND (${parts.join(' OR ')})`;
  }

  sql += ` ORDER BY p.date_taken DESC, p.id DESC`;

  try {
    const rows = await allAsync(sql, params);
    // Normalize paths: prefer positive_rel_path when present
    const normalized = (rows || []).map(r => {
      const fullPath = r.positive_rel_path || r.full_rel_path || null;
      const thumbPath = r.positive_thumb_rel_path || r.thumb_rel_path || null;
      return Object.assign({}, r, {
        full_rel_path: fullPath,
        thumb_rel_path: thumbPath,
      });
    });
    const withTags = await attachTagsToPhotos(normalized);
    res.json(withTags);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get random photos for hero section
router.get('/random', async (req, res) => {
  const limit = parseInt(req.query.limit) || 10;
  const sql = `
    SELECT p.*, r.title as roll_title 
    FROM photos p
    JOIN rolls r ON p.roll_id = r.id
    WHERE p.full_rel_path IS NOT NULL
    ORDER BY RANDOM() 
    LIMIT ?
  `;
  try {
    const rows = await allAsync(sql, [limit]);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get liked photos
router.get('/favorites', async (req, res) => {
  console.log('[GET] /api/photos/favorites');
  const sql = `
    SELECT p.*, COALESCE(f.name, r.film_type) AS film_name, r.title AS roll_title
    FROM photos p
    JOIN rolls r ON r.id = p.roll_id
    LEFT JOIN films f ON f.id = r.filmId
    WHERE IFNULL(CAST(p.rating AS INTEGER), 0) <> 0
    ORDER BY p.id DESC
  `;
  try {
    const rows = await allAsync(sql, []);
    console.log(`[GET] Favorites found: ${rows.length}`);
    const withTags = await attachTagsToPhotos(rows);
    res.json(withTags);
  } catch (err) {
    console.error('[GET] Favorites error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// Get negative source photos (original scanned negatives)
router.get('/negatives', async (req, res) => {
  console.log('[GET] /api/photos/negatives');
  const sql = `
    SELECT p.*, COALESCE(f.name, r.film_type) AS film_name, r.title AS roll_title
    FROM photos p
    JOIN rolls r ON r.id = p.roll_id
    LEFT JOIN films f ON f.id = r.filmId
    WHERE IFNULL(CAST(p.is_negative_source AS INTEGER), 0) = 1
    ORDER BY p.id DESC
  `;
  try {
    const rows = await allAsync(sql, []);
    const withTags = await attachTagsToPhotos(rows);
    res.json(withTags);
  } catch (err) {
    console.error('[GET] Negatives error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// update photo (adds tags support)
router.put('/:id', async (req, res) => {
  const id = req.params.id;
  const { frame_number, caption, taken_at, rating, tags, date_taken, time_taken, location_id, detail_location, latitude, longitude, altitude, location_name, country, city, camera, lens, photographer, aperture, shutter_speed, iso, camera_equip_id, lens_equip_id, flash_equip_id } = req.body;
  console.log(`[PUT] Update photo ${id}`, req.body);

  const updates = [];
  const params = [];
  if (frame_number !== undefined) { updates.push('frame_number=?'); params.push(frame_number); }
  if (caption !== undefined) { updates.push('caption=?'); params.push(caption); }
  if (taken_at !== undefined) { updates.push('taken_at=?'); params.push(taken_at); }
  if (rating !== undefined) { updates.push('rating=?'); params.push(parseInt(rating)); }
  if (date_taken !== undefined) { updates.push('date_taken=?'); params.push(date_taken); }
  if (time_taken !== undefined) { updates.push('time_taken=?'); params.push(time_taken); }
  if (location_id !== undefined) { updates.push('location_id=?'); params.push(location_id); }
  if (detail_location !== undefined) { updates.push('detail_location=?'); params.push(detail_location); }
  if (latitude !== undefined) { updates.push('latitude=?'); params.push(latitude); }
  if (longitude !== undefined) { updates.push('longitude=?'); params.push(longitude); }
  if (altitude !== undefined) { updates.push('altitude=?'); params.push(altitude); }
  if (location_name !== undefined) { updates.push('location_name=?'); params.push(location_name); }
  if (country !== undefined) { updates.push('country=?'); params.push(country); }
  if (city !== undefined) { updates.push('city=?'); params.push(city); }
  if (camera !== undefined) { updates.push('camera=?'); params.push(camera); }
  if (lens !== undefined) { updates.push('lens=?'); params.push(lens); }
  if (photographer !== undefined) { updates.push('photographer=?'); params.push(photographer); }
  if (aperture !== undefined) { updates.push('aperture=?'); params.push(aperture !== null && aperture !== '' ? parseFloat(aperture) : null); }
  if (shutter_speed !== undefined) { updates.push('shutter_speed=?'); params.push(shutter_speed || null); }
  if (iso !== undefined) { updates.push('iso=?'); params.push(iso !== null && iso !== '' ? parseInt(iso) : null); }
  // Equipment IDs
  if (camera_equip_id !== undefined) { updates.push('camera_equip_id=?'); params.push(camera_equip_id); }
  if (lens_equip_id !== undefined) { updates.push('lens_equip_id=?'); params.push(lens_equip_id); }
  if (flash_equip_id !== undefined) { updates.push('flash_equip_id=?'); params.push(flash_equip_id); }

  if (!updates.length && tags === undefined) {
    return res.json({ updated: 0 });
  }

  try {
    // Validate and initialize missing lat/lng from location city
    const v = await validatePhotoUpdate(id, req.body);
    let updated = 0;
    if (updates.length) {
      params.push(id);
      const sql = `UPDATE photos SET ${updates.join(', ')} WHERE id=?`;
      const result = await runAsync(sql, params);
      updated = result && typeof result.changes === 'number' ? result.changes : 0;
    }

    let appliedTags;
    if (tags !== undefined) {
      console.log(`[PUT] About to save tags for photo ${id}:`, tags);
      try {
        appliedTags = await savePhotoTags(id, Array.isArray(tags) ? tags : []);
        console.log(`[PUT] Tags saved successfully:`, appliedTags);
      } catch (tagErr) {
        console.error(`[PUT] savePhotoTags failed for photo ${id}:`, tagErr);
        throw tagErr; // Re-throw to trigger outer catch
      }
    }

    // Auto-add location to roll if missing
    if (v.location_id) {
      const row = await getAsync('SELECT roll_id FROM photos WHERE id = ?', [id]);
      if (row && row.roll_id) {
        await runAsync('INSERT OR IGNORE INTO roll_locations (roll_id, location_id) VALUES (?, ?)', [row.roll_id, v.location_id]);
      }
    }

    // Add gear values to roll_gear with intelligent deduplication
    if (camera || lens || photographer) {
      const { addOrUpdateGear } = require('../services/gear-service');
      const photo = await getAsync('SELECT roll_id FROM photos WHERE id = ?', [id]);
      if (photo && photo.roll_id) {
        if (camera) await addOrUpdateGear(photo.roll_id, 'camera', camera).catch(e => console.error('Add camera failed', e));
        if (lens) await addOrUpdateGear(photo.roll_id, 'lens', lens).catch(e => console.error('Add lens failed', e));
        if (photographer) await addOrUpdateGear(photo.roll_id, 'photographer', photographer).catch(e => console.error('Add photographer failed', e));
      }
    }

    res.json({ ok: true, updated, tags: appliedTags });
  } catch (err) {
    console.error('[PUT] Update photo error', err.message);
    console.error('[PUT] Stack trace:', err.stack);
    res.status(500).json({ error: err.message });
  }
});

// Update positive image from negative (FilmLab save)
router.put('/:id/update-positive', uploadDefault.single('image'), async (req, res) => {
  const id = req.params.id;
  if (!req.file) return res.status(400).json({ error: 'image file required' });

  try {
    const row = await PreparedStmt.getAsync('photos.getByRollSimple', [id]);

    if (!row) return res.status(404).json({ error: 'Photo not found' });

    // If full_rel_path is null (negative only), we need to create a path for the positive
    // Even if it exists, we ALWAYS create a new versioned filename to avoid OneDrive/OS file locking issues.
    
    const rollId = row.roll_id;
    const frameNum = row.frame_number || '00';
    const folderName = String(rollId);
    
    // Ensure full directory exists
    const fullDir = path.join(uploadsDir, 'rolls', folderName, 'full');
    if (!fs.existsSync(fullDir)) fs.mkdirSync(fullDir, { recursive: true });

    // Generate new unique filename: rollID_frame.jpg (stable filename to avoid proliferation)
    const newFileName = `${rollId}_${frameNum}.jpg`;
    const newFullRelPath = path.join('rolls', folderName, 'full', newFileName).replace(/\\/g, '/');
    const newFullPath = path.join(fullDir, newFileName);

    // Move uploaded file to new path
    try {
        console.log(`[UPDATE-POSITIVE] Moving file from ${req.file.path} to ${newFullPath}`);
        // Direct overwrite using moveFileSync. Do NOT unlink beforehand to prevent data loss if move fails.
        moveFileSync(req.file.path, newFullPath);
    } catch (moveErr) {
        console.error('[UPDATE-POSITIVE] Move failed:', moveErr);
        return res.status(500).json({ error: 'Failed to save file to disk: ' + moveErr.message });
    }

    // Update DB with new path
    try {
        await runAsync('UPDATE photos SET full_rel_path = ? WHERE id = ?', [newFullRelPath, id]);
    } catch (dbErr) {
        console.error('[UPDATE-POSITIVE] DB update failed:', dbErr);
        return res.status(500).json({ error: 'Failed to update database: ' + dbErr.message });
    }

    // Try to delete the old file if it existed and is different from new file
    if (row.full_rel_path) {
        try {
            const oldFullPath = path.join(uploadsDir, row.full_rel_path);
            if (oldFullPath !== newFullPath && fs.existsSync(oldFullPath)) {
                // Attempt delete, ignore if locked
                fs.unlinkSync(oldFullPath);
            }
        } catch (e) {
            console.warn('[UPDATE-POSITIVE] Could not delete old file (locked?), leaving as orphan:', e.message);
        }
    }

    // Update variables for thumbnail generation
    const fullPath = newFullPath;
    const thumbPath = row.thumb_rel_path ? path.join(uploadsDir, row.thumb_rel_path) : null;

    // Regenerate thumbnail
    if (thumbPath) {
      try {
        console.log(`[UPDATE-POSITIVE] Regenerating thumbnail at ${thumbPath}`);
        // Try to unlink thumb first to avoid lock
        if (fs.existsSync(thumbPath)) {
            try { fs.unlinkSync(thumbPath); } catch(e) {}
        }
        
        // Read file to buffer to avoid Sharp holding a file lock on Windows
        const fileBuf = fs.readFileSync(fullPath);
        await sharp(fileBuf)
          .resize({ width: 240, height: 240, fit: 'inside' })
          .jpeg({ quality: 40 })
          .toFile(thumbPath);
      } catch (sharpErr) {
        console.error('[UPDATE-POSITIVE] Thumbnail regeneration failed:', sharpErr);
        // Do not fail the request if thumbnail fails, just log it
      }
    }

    res.json({ ok: true, newPath: newFullRelPath });
  } catch (err) {
    console.error('[UPDATE-POSITIVE] General error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Ingest a positive JPEG (e.g., from GPU export) into roll storage and update DB
// POST /api/photos/:id/ingest-positive  (multipart form field 'image')
router.post('/:id/ingest-positive', uploadDefault.single('image'), async (req, res) => {
  const id = req.params.id;
  console.log('[INGEST-POSITIVE] Request for photo ID:', id);
  console.log('[INGEST-POSITIVE] File received:', req.file ? 'yes' : 'no');
  if (req.file) {
    console.log('[INGEST-POSITIVE] File details:', {
      fieldname: req.file.fieldname,
      originalname: req.file.originalname,
      mimetype: req.file.mimetype,
      size: req.file.size,
      path: req.file.path
    });
  }
  
  if (!req.file) {
    console.error('[INGEST-POSITIVE] No file received in request');
    return res.status(400).json({ error: 'image file required' });
  }
  
  try {
    const row = await getAsync('SELECT roll_id, frame_number, positive_rel_path, full_rel_path, positive_thumb_rel_path FROM photos WHERE id = ?', [id]);
    if (!row) {
      console.error('[INGEST-POSITIVE] Photo not found:', id);
      return res.status(404).json({ error: 'Photo not found' });
    }
    console.log('[INGEST-POSITIVE] Photo row:', row);

    const rollId = row.roll_id;
    const frameNum = row.frame_number || '00';
    const folderName = String(rollId);
    const fullDir = path.join(uploadsDir, 'rolls', folderName, 'full');
    const thumbDir = path.join(uploadsDir, 'rolls', folderName, 'thumb');
    
    console.log('[INGEST-POSITIVE] Target directories:', { fullDir, thumbDir });
    
    if (!fs.existsSync(fullDir)) {
      console.log('[INGEST-POSITIVE] Creating fullDir:', fullDir);
      fs.mkdirSync(fullDir, { recursive: true });
    }
    if (!fs.existsSync(thumbDir)) {
      console.log('[INGEST-POSITIVE] Creating thumbDir:', thumbDir);
      fs.mkdirSync(thumbDir, { recursive: true });
    }

    // GPU export always generates JPG, so we use a distinct suffix to avoid conflicts
    // This way we don't overwrite the original JPG/jpg file
    const exportName = `${rollId}_${frameNum}_positive.jpg`;
    const newFullRelPath = path.join('rolls', folderName, 'full', exportName).replace(/\\/g, '/');
    const newFullPath = path.join(fullDir, exportName);

    console.log('[INGEST-POSITIVE] Moving file from', req.file.path, 'to', newFullPath);
    
    // Clean up old positive file first if it exists and is different
    if (row.positive_rel_path && row.positive_rel_path !== newFullRelPath) {
      try {
        const oldPosAbs = path.join(uploadsDir, row.positive_rel_path);
        if (fs.existsSync(oldPosAbs)) {
          console.log('[INGEST-POSITIVE] Removing old positive:', oldPosAbs);
          fs.unlinkSync(oldPosAbs);
        }
      } catch (e) { 
        console.warn('[INGEST-POSITIVE] Cleanup old positive failed', e.message); 
      }
    }
    
    try {
      // Ensure target does not exist to avoid Windows file locking issues
      if (fs.existsSync(newFullPath)) {
        console.log('[INGEST-POSITIVE] Target exists, removing:', newFullPath);
        try { fs.unlinkSync(newFullPath); } catch(e) { console.warn('[INGEST-POSITIVE] Unlink target failed', e.message); }
      }
      
      // Direct overwrite
      moveFileSync(req.file.path, newFullPath);
      console.log('[INGEST-POSITIVE] File moved successfully');
    } catch (e) {
      console.error('[INGEST-POSITIVE] Failed to move file:', e.message);
      return res.status(500).json({ error: 'Failed to save file: ' + e.message });
    }

    // Verify file exists and has content
    if (!fs.existsSync(newFullPath)) {
      console.error('[INGEST-POSITIVE] File does not exist after move:', newFullPath);
      return res.status(500).json({ error: 'File was not saved correctly' });
    }
    const stats = fs.statSync(newFullPath);
    console.log('[INGEST-POSITIVE] File verified at:', newFullPath, 'size:', stats.size);
    if (stats.size === 0) {
      console.error('[INGEST-POSITIVE] File size is 0!');
      return res.status(500).json({ error: 'File was saved but has 0 size' });
    }

    // Generate/update positive thumbnail
    const thumbName = `${rollId}_${frameNum}_positive-thumb.jpg`;
    const thumbPath = path.join(thumbDir, thumbName);
    console.log('[INGEST-POSITIVE] Generating thumbnail:', thumbPath);
    
    try {
      if (fs.existsSync(thumbPath)) { 
        console.log('[INGEST-POSITIVE] Removing old thumbnail');
        try { fs.unlinkSync(thumbPath); } catch(_){} 
      }
      // Read to buffer to avoid file lock
      const fileBuf = fs.readFileSync(newFullPath);
      await sharp(fileBuf).resize({ width: 240, height: 240, fit: 'inside' }).jpeg({ quality: 40 }).toFile(thumbPath);
      console.log('[INGEST-POSITIVE] Thumbnail generated successfully');
    } catch (e) {
      // log but do not fail
      console.error('[INGEST-POSITIVE] thumb failed', e.message);
    }
    const relThumb = path.join('rolls', folderName, 'thumb', thumbName).replace(/\\/g, '/');

    // Update DB: set positive paths; ensure full_rel_path has a value for legacy viewers
    console.log('[INGEST-POSITIVE] Updating DB with paths:', { newFullRelPath, relThumb });
    await runAsync('UPDATE photos SET positive_rel_path=?, positive_thumb_rel_path=?, full_rel_path=COALESCE(full_rel_path, ?) WHERE id=?', [newFullRelPath, relThumb, newFullRelPath, id]);
    console.log('[INGEST-POSITIVE] DB updated');

    // Cleanup old positive thumbnail if it was different
    if (row.positive_thumb_rel_path && row.positive_thumb_rel_path !== relThumb) {
      try {
        const oldThumbAbs = path.join(uploadsDir, row.positive_thumb_rel_path);
        if (fs.existsSync(oldThumbAbs)) {
          console.log('[INGEST-POSITIVE] Removing old positive thumbnail:', oldThumbAbs);
          fs.unlinkSync(oldThumbAbs);
        }
      } catch (e) { console.warn('[INGEST-POSITIVE] Cleanup old thumb failed', e.message); }
    }

    const updatedPhoto = await PreparedStmt.getAsync('photos.getById', [id]);
    console.log('[INGEST-POSITIVE] Success! Returning updated photo');
    res.json({ ok: true, photo: updatedPhoto, positive_rel_path: newFullRelPath, positive_thumb_rel_path: relThumb });
  } catch (err) {
    console.error('[INGEST-POSITIVE] error', err);
    res.status(500).json({ error: err.message });
  }
});

// High-quality export from original scan applying Film Lab parameters
// POST /api/photos/:id/export-positive
// Body: { params: { inverted, inversionMode, exposure, contrast, temp, tint, red, green, blue, rotation, orientation } }
// NOTE: Initial implementation: applies inversion, WB gains, exposure, contrast, rotation. (Curves, tone sliders, LUTs deferred)
router.post('/:id/export-positive', async (req, res) => {
  console.log('[POST] /api/photos/:id/export-positive', req.params.id);
  const id = req.params.id;
  const body = req.body || {};
  const p = (body.params) || {};
  const format = (body.format || 'jpeg').toLowerCase(); // 'jpeg' | 'tiff16' | 'both'
  // Extract params with defaults
  const inverted = !!p.inverted;
  const inversionMode = p.inversionMode === 'log' ? 'log' : 'linear';
  const exposure = Number.isFinite(p.exposure) ? p.exposure : 0; // -100..100
  const contrast = Number.isFinite(p.contrast) ? p.contrast : 0; // -100..100
  const temp = Number.isFinite(p.temp) ? p.temp : 0; // -100..100
  const tint = Number.isFinite(p.tint) ? p.tint : 0; // -100..100
  const redGain = Number.isFinite(p.red) ? p.red : 1.0;
  const greenGain = Number.isFinite(p.green) ? p.green : 1.0;
  const blueGain = Number.isFinite(p.blue) ? p.blue : 1.0;
  const rotation = Number.isFinite(p.rotation) ? p.rotation : 0; // arbitrary degrees
  const orientation = Number.isFinite(p.orientation) ? p.orientation : 0; // multiples of 90 from UI

  try {
    // Fetch photo row to get original path & roll info
    const row = await getAsync('SELECT id, roll_id, frame_number, original_rel_path, positive_rel_path, full_rel_path, positive_thumb_rel_path FROM photos WHERE id = ?', [id]);
    if (!row) return res.status(404).json({ error: 'Photo not found' });
    // Pick best available source: prefer original; fallback to positive/full; then negative
    let relSource = row.original_rel_path || row.positive_rel_path || row.full_rel_path || row.negative_rel_path;
    if (!relSource) {
      return res.status(400).json({ error: 'No usable image source for export (missing original/positive/full/negative paths)' });
    }
    let sourceAbs = path.join(uploadsDir, relSource);
    if (!fs.existsSync(sourceAbs)) {
      return res.status(404).json({ error: 'Source file missing on disk: ' + relSource });
    }

    // Resolve roll folder paths
    const rollFolder = path.join(uploadsDir, 'rolls', String(row.roll_id));
    const fullDir = path.join(rollFolder, 'full');
    const thumbDir = path.join(rollFolder, 'thumb');
    if (!fs.existsSync(fullDir)) fs.mkdirSync(fullDir, { recursive: true });
    if (!fs.existsSync(thumbDir)) fs.mkdirSync(thumbDir, { recursive: true });

    const frameNumber = row.frame_number || '00';
    const baseName = `${row.roll_id}_${frameNumber}`;
    const timestamp = Date.now();
    // Use stable filename for positive to avoid proliferation
    const exportName = `${baseName}.jpg`;
    const destPath = path.join(fullDir, exportName);
    const relDest = path.join('rolls', String(row.roll_id), 'full', exportName).replace(/\\/g, '/').replace(/\\/g, '/');

    // Build base pipeline (rotate/resize/crop, invert, WB)
    let imgBase = await buildPipeline(sourceAbs, {
      inverted, inversionMode, exposure, contrast, temp, tint,
      red: redGain, green: greenGain, blue: blueGain, rotation, orientation
    }, { maxWidth: null, cropRect: (p && p.cropRect) || null, toneAndCurvesInJs: true });

    // Build LUTs for tones and curves
    const toneLUT = buildToneLUT({
      exposure, contrast,
      highlights: Number.isFinite(p.highlights) ? p.highlights : 0,
      shadows: Number.isFinite(p.shadows) ? p.shadows : 0,
      whites: Number.isFinite(p.whites) ? p.whites : 0,
      blacks: Number.isFinite(p.blacks) ? p.blacks : 0,
    });
    const curves = p.curves || { rgb: [{ x: 0, y: 0 }, { x: 255, y: 255 }], red: [{ x: 0, y: 0 }, { x: 255, y: 255 }], green: [{ x: 0, y: 0 }, { x: 255, y: 255 }], blue: [{ x: 0, y: 0 }, { x: 255, y: 255 }] };
    const lutRGB = buildCurveLUT(curves.rgb || []);
    const lutR = buildCurveLUT(curves.red || []);
    const lutG = buildCurveLUT(curves.green || []);
    const lutB = buildCurveLUT(curves.blue || []);
    
    // WB gains for JS processing when log inversion is used
    const { computeWBGains } = require('../utils/filmlab-wb');
    const [rBal, gBal, bBal] = computeWBGains({ red: redGain, green: greenGain, blue: blueGain, temp, tint });
    const needsLogInversion = inverted && inversionMode === 'log';
    const needsWbInJs = needsLogInversion;

    // Pull raw, apply LUTs, then encode to JPEG
    const { data, info } = await imgBase.raw().toBuffer({ resolveWithObject: true });
    const width = info.width; const height = info.height; const channels = info.channels;
    const out = Buffer.allocUnsafe(width * height * 3);
    for (let i = 0, j = 0; i < data.length; i += channels, j += 3) {
      let r = data[i]; let g = data[i + 1]; let b = data[i + 2];
      
      // Log inversion: 255 * (1 - log(x+1) / log(256)) - matches client exactly
      if (needsLogInversion) {
        r = 255 * (1 - Math.log(r + 1) / Math.log(256));
        g = 255 * (1 - Math.log(g + 1) / Math.log(256));
        b = 255 * (1 - Math.log(b + 1) / Math.log(256));
      }
      
      // Apply WB gains (only if log inversion was deferred)
      if (needsWbInJs) {
        r *= rBal; g *= gBal; b *= bBal;
        r = Math.max(0, Math.min(255, r));
        g = Math.max(0, Math.min(255, g));
        b = Math.max(0, Math.min(255, b));
      }
      
      r = toneLUT[Math.floor(r)]; g = toneLUT[Math.floor(g)]; b = toneLUT[Math.floor(b)];
      r = lutRGB[r]; g = lutRGB[g]; b = lutRGB[b];
      r = lutR[r]; g = lutG[g]; b = lutB[b];
      out[j] = r; out[j + 1] = g; out[j + 2] = b;
    }
    await sharp(out, { raw: { width, height, channels: 3 } }).jpeg({ quality: 95 }).toFile(destPath);

    // Optional: write 16-bit TIFF sidecar
    let tiffRelPath = null;
    if (format === 'tiff16' || format === 'both') {
      const tiffName = `${baseName}_exp_${timestamp}.tiff`;
      const tiffPath = path.join(fullDir, tiffName);
      try {
          // Generate TIFF16 with tone & curves parity (approximate 16-bit LUT expansion)
          const imgTiffBase = await buildPipeline(sourceAbs, {
            inverted, inversionMode, exposure, contrast, temp, tint,
            red: redGain, green: greenGain, blue: blueGain, rotation, orientation
          }, { maxWidth: null, cropRect: (p && p.cropRect) || null, toneAndCurvesInJs: true });
          // Fetch raw 8-bit buffer then upscale to 16-bit applying curves already baked (toned & curved in JS via toneAndCurvesInJs)
          const { data: raw8, info: info8 } = await imgTiffBase.raw().toBuffer({ resolveWithObject: true });
          const width8 = info8.width; const height8 = info8.height; const channels8 = info8.channels;
          const raw16 = Buffer.allocUnsafe(width8 * height8 * channels8 * 2);
          
          // Apply log inversion and WB before converting to 16-bit (same as JPEG path)
          for (let i = 0; i < raw8.length; i += channels8) {
            let r = raw8[i]; let g = raw8[i + 1]; let b = raw8[i + 2];
            
            // Log inversion
            if (needsLogInversion) {
              r = 255 * (1 - Math.log(r + 1) / Math.log(256));
              g = 255 * (1 - Math.log(g + 1) / Math.log(256));
              b = 255 * (1 - Math.log(b + 1) / Math.log(256));
            }
            
            // WB gains
            if (needsWbInJs) {
              r *= rBal; g *= gBal; b *= bBal;
              r = Math.max(0, Math.min(255, r));
              g = Math.max(0, Math.min(255, g));
              b = Math.max(0, Math.min(255, b));
            }
            
            // Apply tone and curves
            r = toneLUT[Math.floor(r)]; g = toneLUT[Math.floor(g)]; b = toneLUT[Math.floor(b)];
            r = lutRGB[r]; g = lutRGB[g]; b = lutRGB[b];
            r = lutR[r]; g = lutG[g]; b = lutB[b];
            
            // Update the buffer in place for 16-bit conversion below
            raw8[i] = r; raw8[i + 1] = g; raw8[i + 2] = b;
          }
          
          for (let i=0, j=0; i<raw8.length; i++, j+=2) {
            // Scale 8-bit to 16-bit (simple upscale)
            const v8 = raw8[i];
            const v16 = (v8 << 8) | v8; // replicate bits for smoother gradient
            raw16[j] = v16 & 0xFF;
            raw16[j+1] = (v16 >> 8) & 0xFF;
          }
          await sharp(raw16, { raw: { width: width8, height: height8, channels: channels8, depth: 'ushort' } })
            .tiff({ compression: 'lzw', bitdepth: 16 })
            .toFile(tiffPath);
        tiffRelPath = path.join('rolls', String(row.roll_id), 'full', tiffName).replace(/\\/g, '/');
      } catch (tErr) {
        console.error('[EXPORT-POSITIVE] TIFF16 generation failed', tErr.message);
      }
    }

    // Generate thumbnail (240px inside) with lower quality
    const thumbName = `${baseName}-thumb.jpg`; // keep consistent naming; overwrite existing
    const thumbPath = path.join(thumbDir, thumbName);
    try {
      await sharp(destPath)
        .resize({ width: 240, height: 240, fit: 'inside' })
        .jpeg({ quality: 40 })
        .toFile(thumbPath);
    } catch (thErr) {
      console.error('[EXPORT-POSITIVE] Thumbnail generation failed', thErr.message);
    }
    const relThumb = path.join('rolls', String(row.roll_id), 'thumb', thumbName).replace(/\\/g, '/').replace(/\\/g, '/');

    // Remove previous positive if existed and is different (optional cleanup)
    if (row.positive_rel_path && row.positive_rel_path !== relDest) {
      try {
        const oldPosAbs = path.join(uploadsDir, row.positive_rel_path);
        if (fs.existsSync(oldPosAbs)) fs.unlinkSync(oldPosAbs);
      } catch (delErr) {
        console.warn('[EXPORT-POSITIVE] Could not delete previous positive file:', delErr.message);
      }
    }
    // Remove previous thumbnail if existed and is different
    if (row.positive_thumb_rel_path && row.positive_thumb_rel_path !== relThumb) {
      try {
        const oldThumbAbs = path.join(uploadsDir, row.positive_thumb_rel_path);
        if (fs.existsSync(oldThumbAbs)) fs.unlinkSync(oldThumbAbs);
      } catch (delErr) {
        console.warn('[EXPORT-POSITIVE] Could not delete previous thumbnail file:', delErr.message);
      }
    }

    // Update DB; also set full_rel_path if legacy null to keep compatibility
    await runAsync('UPDATE photos SET positive_rel_path = ?, positive_thumb_rel_path = ?, full_rel_path = COALESCE(full_rel_path, ?) WHERE id = ?', [relDest, relThumb, relDest, id]);

    // Return updated row
    const updatedPhoto = await PreparedStmt.getAsync('photos.getById', [id]);
    console.log('[POST] export-positive done', { id, positive_rel_path: relDest });
    res.json({ ok: true, photo: updatedPhoto, tiff_rel_path: tiffRelPath });
  } catch (err) {
    console.error('[EXPORT-POSITIVE] Error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Ad-hoc render (no DB mutation) of processed positive image
// POST /api/photos/:id/render-positive
// Body: { params: {...}, format: 'jpeg' | 'tiff16' }
router.post('/:id/render-positive', async (req, res) => {
  const id = req.params.id;
  const body = req.body || {};
  const p = body.params || {};
  const format = (body.format || 'jpeg').toLowerCase();
  if (!['jpeg','tiff16'].includes(format)) {
    return res.status(400).json({ error: 'Unsupported format for render-positive' });
  }
  const inverted = !!p.inverted;
  const inversionMode = p.inversionMode === 'log' ? 'log' : 'linear';
  const exposure = Number.isFinite(p.exposure) ? p.exposure : 0;
  const contrast = Number.isFinite(p.contrast) ? p.contrast : 0;
  const temp = Number.isFinite(p.temp) ? p.temp : 0;
  const tint = Number.isFinite(p.tint) ? p.tint : 0;
  const redGain = Number.isFinite(p.red) ? p.red : 1.0;
  const greenGain = Number.isFinite(p.green) ? p.green : 1.0;
  const blueGain = Number.isFinite(p.blue) ? p.blue : 1.0;
  const rotation = Number.isFinite(p.rotation) ? p.rotation : 0;
  const orientation = Number.isFinite(p.orientation) ? p.orientation : 0;
  try {
    const row = await getAsync('SELECT id, roll_id, original_rel_path, positive_rel_path, full_rel_path, negative_rel_path FROM photos WHERE id = ?', [id]);
    if (!row) return res.status(404).json({ error: 'Photo not found' });
    let relSource = row.original_rel_path || row.positive_rel_path || row.full_rel_path || row.negative_rel_path;
    if (!relSource) return res.status(400).json({ error: 'No usable source for render-positive' });
    const sourceAbs = path.join(uploadsDir, relSource);
    if (!fs.existsSync(sourceAbs)) return res.status(404).json({ error: 'Source file missing on disk' });

    if (format === 'tiff16') {
      // Sharp pipeline without JS tone/curves for now (parity later)
        const imgTiffBase = await buildPipeline(sourceAbs, {
          inverted, inversionMode, exposure, contrast, temp, tint,
          red: redGain, green: greenGain, blue: blueGain, rotation, orientation
        }, { maxWidth: null, cropRect: (p && p.cropRect) || null, toneAndCurvesInJs: true });
        const { data: raw8, info: info8 } = await imgTiffBase.raw().toBuffer({ resolveWithObject: true });
        const width8 = info8.width; const height8 = info8.height; const channels8 = info8.channels;
        
        // Build LUTs and WB gains for JS processing
        const toneLUT = buildToneLUT({
          exposure, contrast,
          highlights: Number.isFinite(p.highlights) ? p.highlights : 0,
          shadows: Number.isFinite(p.shadows) ? p.shadows : 0,
          whites: Number.isFinite(p.whites) ? p.whites : 0,
          blacks: Number.isFinite(p.blacks) ? p.blacks : 0,
        });
        const curves = p.curves || { rgb: [{ x: 0, y: 0 }, { x: 255, y: 255 }], red: [{ x: 0, y: 0 }, { x: 255, y: 255 }], green: [{ x: 0, y: 0 }, { x: 255, y: 255 }], blue: [{ x: 0, y: 0 }, { x: 255, y: 255 }] };
        const lutRGB = buildCurveLUT(curves.rgb || []);
        const lutR = buildCurveLUT(curves.red || []);
        const lutG = buildCurveLUT(curves.green || []);
        const lutB = buildCurveLUT(curves.blue || []);
        const { computeWBGains } = require('../utils/filmlab-wb');
        const [rBal, gBal, bBal] = computeWBGains({ red: redGain, green: greenGain, blue: blueGain, temp, tint });
        const needsLogInversion = inverted && inversionMode === 'log';
        const needsWbInJs = needsLogInversion;
        
        // Apply log inversion, WB, tone, curves before 16-bit conversion
        for (let i = 0; i < raw8.length; i += channels8) {
          let r = raw8[i]; let g = raw8[i + 1]; let b = raw8[i + 2];
          if (needsLogInversion) {
            r = 255 * (1 - Math.log(r + 1) / Math.log(256));
            g = 255 * (1 - Math.log(g + 1) / Math.log(256));
            b = 255 * (1 - Math.log(b + 1) / Math.log(256));
          }
          if (needsWbInJs) {
            r *= rBal; g *= gBal; b *= bBal;
            r = Math.max(0, Math.min(255, r)); g = Math.max(0, Math.min(255, g)); b = Math.max(0, Math.min(255, b));
          }
          r = toneLUT[Math.floor(r)]; g = toneLUT[Math.floor(g)]; b = toneLUT[Math.floor(b)];
          r = lutRGB[r]; g = lutRGB[g]; b = lutRGB[b];
          r = lutR[r]; g = lutG[g]; b = lutB[b];
          raw8[i] = r; raw8[i + 1] = g; raw8[i + 2] = b;
        }
        
        const raw16 = Buffer.allocUnsafe(width8 * height8 * channels8 * 2);
        for (let i=0, j=0; i<raw8.length; i++, j+=2) {
          const v8 = raw8[i];
          const v16 = (v8 << 8) | v8;
          raw16[j] = v16 & 0xFF;
          raw16[j+1] = (v16 >> 8) & 0xFF;
        }
        const buf = await sharp(raw16, { raw: { width: width8, height: height8, channels: channels8, depth: 'ushort' } })
          .tiff({ compression: 'lzw', bitdepth: 16 })
          .toBuffer();
      res.setHeader('Content-Type', 'image/tiff');
      res.setHeader('Content-Disposition', 'attachment; filename="render_positive_'+id+'_'+Date.now()+'.tiff"');
      return res.send(buf);
    }
    // JPEG path with JS tone & curves
    let imgBase = await buildPipeline(sourceAbs, {
      inverted, inversionMode, exposure, contrast, temp, tint,
      red: redGain, green: greenGain, blue: blueGain, rotation, orientation
    }, { maxWidth: null, cropRect: (p && p.cropRect) || null, toneAndCurvesInJs: true });
    const toneLUT = buildToneLUT({
      exposure, contrast,
      highlights: Number.isFinite(p.highlights) ? p.highlights : 0,
      shadows: Number.isFinite(p.shadows) ? p.shadows : 0,
      whites: Number.isFinite(p.whites) ? p.whites : 0,
      blacks: Number.isFinite(p.blacks) ? p.blacks : 0,
    });
    const curves = p.curves || { rgb: [{ x: 0, y: 0 }, { x: 255, y: 255 }], red: [{ x: 0, y: 0 }, { x: 255, y: 255 }], green: [{ x: 0, y: 0 }, { x: 255, y: 255 }], blue: [{ x: 0, y: 0 }, { x: 255, y: 255 }] };
    const lutRGB = buildCurveLUT(curves.rgb || []);
    const lutR = buildCurveLUT(curves.red || []);
    const lutG = buildCurveLUT(curves.green || []);
    const lutB = buildCurveLUT(curves.blue || []);
    
    // WB gains and log inversion flags for JS processing
    const { computeWBGains } = require('../utils/filmlab-wb');
    const [rBal, gBal, bBal] = computeWBGains({ red: redGain, green: greenGain, blue: blueGain, temp, tint });
    const needsLogInversion = inverted && inversionMode === 'log';
    const needsWbInJs = needsLogInversion;
    
    const { data, info } = await imgBase.raw().toBuffer({ resolveWithObject: true });
    const width = info.width; const height = info.height; const channels = info.channels;
    const out = Buffer.allocUnsafe(width * height * 3);
    for (let i = 0, j = 0; i < data.length; i += channels, j += 3) {
      let r = data[i]; let g = data[i + 1]; let b = data[i + 2];
      
      // Log inversion
      if (needsLogInversion) {
        r = 255 * (1 - Math.log(r + 1) / Math.log(256));
        g = 255 * (1 - Math.log(g + 1) / Math.log(256));
        b = 255 * (1 - Math.log(b + 1) / Math.log(256));
      }
      // WB gains
      if (needsWbInJs) {
        r *= rBal; g *= gBal; b *= bBal;
        r = Math.max(0, Math.min(255, r)); g = Math.max(0, Math.min(255, g)); b = Math.max(0, Math.min(255, b));
      }
      
      r = toneLUT[Math.floor(r)]; g = toneLUT[Math.floor(g)]; b = toneLUT[Math.floor(b)];
      r = lutRGB[r]; g = lutRGB[g]; b = lutRGB[b];
      r = lutR[r]; g = lutG[g]; b = lutB[b];
      out[j] = r; out[j + 1] = g; out[j + 2] = b;
    }
    const jpegBuf = await sharp(out, { raw: { width, height, channels: 3 } }).jpeg({ quality: 95 }).toBuffer();
    res.setHeader('Content-Type', 'image/jpeg');
    res.setHeader('Content-Disposition', 'attachment; filename="render_positive_'+id+'_'+Date.now()+'.jpg"');
    return res.send(jpegBuf);
  } catch (err) {
    console.error('[RENDER-POSITIVE] Error:', err);
    res.status(500).json({ error: err.message });
  }
});

// delete photo (enhanced to remove file from disk if in rolls folder)
router.delete('/:id', async (req, res) => {
  const id = req.params.id;
  try {
    const row = await getAsync('SELECT filename, full_rel_path, thumb_rel_path, original_rel_path, negative_rel_path, positive_rel_path, positive_thumb_rel_path, negative_thumb_rel_path FROM photos WHERE id = ?', [id]);
    
    if (row) {
      const pathsToDelete = [
        row.thumb_rel_path,
        row.full_rel_path,
        row.original_rel_path,
        row.negative_rel_path,
        row.positive_rel_path,
        row.positive_thumb_rel_path,
        row.negative_thumb_rel_path
      ];

      // Filter out nulls and duplicates
      const uniquePaths = [...new Set(pathsToDelete.filter(p => p))];

      // Delete files from disk
      for (const relPath of uniquePaths) {
        const filePath = path.join(uploadsDir, relPath);
        try {
          await fs.promises.unlink(filePath);
        } catch (e) {
          if (e.code !== 'ENOENT') console.warn(`Failed to delete ${filePath}`, e.message);
        }
      }
      
      // Fallback for legacy filename if no paths found
      if (uniquePaths.length === 0 && row.filename && !row.full_rel_path) {
        const filePath = path.join(__dirname, '../', row.filename.replace(/^\//, ''));
        try {
          await fs.promises.unlink(filePath);
        } catch (e) {
          if (e.code !== 'ENOENT') console.warn(`Failed to delete legacy file ${filePath}`, e.message);
        }
      }
    }

    // Delete DB row
    const result = await runAsync('DELETE FROM photos WHERE id = ?', [id]);
    
    // Cleanup orphaned tags
    try {
      await runAsync('DELETE FROM tags WHERE id NOT IN (SELECT DISTINCT tag_id FROM photo_tags)');
    } catch (cleanupErr) {
      console.error('Tag cleanup error', cleanupErr);
    }

    res.json({ deleted: result?.changes || 0 });
  } catch (err) {
    console.error('[DELETE] Photo error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/photos/:id/download-with-exif
// Returns JPEG with embedded EXIF metadata (camera, lens, ISO, aperture, shutter, GPS, tags, etc.)
router.post('/:id/download-with-exif', async (req, res) => {
  const id = req.params.id;
  console.log('[DOWNLOAD-WITH-EXIF] Request received for photo ID:', id);
  
  const { exiftool } = require('exiftool-vendored');
  const os = require('os');
  
  try {
    // Fetch photo with all metadata including roll, film, and equipment info
    const photo = await getAsync(`
      SELECT p.*, r.title as roll_title, r.camera as roll_camera, r.lens as roll_lens, 
             r.photographer as roll_photographer, r.start_date as roll_start_date,
             COALESCE(f.name, r.film_type) AS film_name,
             -- Photo equipment
             pcam.name AS photo_camera_name, pcam.brand AS photo_camera_brand, pcam.model AS photo_camera_model,
             pcam.has_fixed_lens, pcam.fixed_lens_focal_length, pcam.fixed_lens_max_aperture,
             plens.name AS photo_lens_name, plens.brand AS photo_lens_brand, plens.model AS photo_lens_model,
             plens.focal_length_min AS photo_lens_focal_min, plens.focal_length_max AS photo_lens_focal_max,
             plens.max_aperture AS photo_lens_max_aperture,
             -- Roll equipment (fallback)
             rcam.name AS roll_camera_name, rcam.brand AS roll_camera_brand, rcam.model AS roll_camera_model,
             rcam.has_fixed_lens AS roll_has_fixed_lens, rcam.fixed_lens_focal_length AS roll_fixed_lens_focal,
             rcam.fixed_lens_max_aperture AS roll_fixed_lens_aperture,
             rlens.name AS roll_lens_name, rlens.brand AS roll_lens_brand, rlens.model AS roll_lens_model,
             rlens.focal_length_min AS roll_lens_focal_min, rlens.focal_length_max AS roll_lens_focal_max,
             rlens.max_aperture AS roll_lens_max_aperture
      FROM photos p
      JOIN rolls r ON r.id = p.roll_id
      LEFT JOIN films f ON f.id = r.filmId
      LEFT JOIN equip_cameras pcam ON p.camera_equip_id = pcam.id
      LEFT JOIN equip_lenses plens ON p.lens_equip_id = plens.id
      LEFT JOIN equip_cameras rcam ON r.camera_equip_id = rcam.id
      LEFT JOIN equip_lenses rlens ON r.lens_equip_id = rlens.id
      WHERE p.id = ?
    `, [id]);
    
    if (!photo) return res.status(404).json({ error: 'Photo not found' });
    
    // Determine camera and lens from equipment tables first, then fallback to text fields
    const cameraName = photo.photo_camera_name || photo.roll_camera_name || photo.camera || photo.roll_camera;
    const cameraBrand = photo.photo_camera_brand || photo.roll_camera_brand || (cameraName ? cameraName.split(' ')[0] : null);
    const lensName = photo.photo_lens_name || photo.roll_lens_name || photo.lens || photo.roll_lens;
    const lensBrand = photo.photo_lens_brand || photo.roll_lens_brand;
    
    // For PS cameras with fixed lens, get lens info from camera
    let fixedLensFocal = null, fixedLensAperture = null;
    if (photo.has_fixed_lens || photo.roll_has_fixed_lens) {
      fixedLensFocal = photo.fixed_lens_focal_length || photo.roll_fixed_lens_focal;
      fixedLensAperture = photo.fixed_lens_max_aperture || photo.roll_fixed_lens_aperture;
    }
    
    console.log('[DOWNLOAD-WITH-EXIF] Photo metadata:', {
      id: photo.id,
      camera: cameraName,
      cameraBrand,
      lens: lensName,
      lensBrand,
      fixedLensFocal,
      fixedLensAperture,
      photographer: photo.photographer || photo.roll_photographer,
      iso: photo.iso,
      aperture: photo.aperture,
      shutter_speed: photo.shutter_speed,
      focal_length: photo.focal_length,
      date_taken: photo.date_taken,
      latitude: photo.latitude,
      longitude: photo.longitude
    });
    
    // Get tags for this photo
    const tagRows = await allAsync('SELECT t.name FROM photo_tags pt JOIN tags t ON t.id = pt.tag_id WHERE pt.photo_id = ?', [id]);
    const tags = tagRows.map(t => t.name);
    console.log('[DOWNLOAD-WITH-EXIF] Tags:', tags);
    
    // Determine source image path (prefer positive, fallback to full)
    let sourcePath = photo.positive_rel_path || photo.full_rel_path;
    if (!sourcePath) {
      return res.status(400).json({ error: 'No image available for download' });
    }
    
    const sourceAbs = path.join(uploadsDir, sourcePath);
    if (!fs.existsSync(sourceAbs)) {
      console.error('[DOWNLOAD-WITH-EXIF] Source file not found:', sourceAbs);
      return res.status(404).json({ error: 'Image file not found on disk' });
    }
    
    console.log('[DOWNLOAD-WITH-EXIF] Source file:', sourceAbs);
    
    // Only process JPEG files for EXIF writing
    const ext = path.extname(sourceAbs).toLowerCase();
    if (!['.jpg', '.jpeg'].includes(ext)) {
      // For non-JPEG, just return the file as-is
      const filename = photo.filename ? path.basename(photo.filename) : `photo_${id}${ext}`;
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      return res.sendFile(sourceAbs);
    }
    
    // Create temp file for EXIF writing (avoid modifying original)
    const tempPath = path.join(os.tmpdir(), `filmgallery_exif_${Date.now()}.jpg`);
    fs.copyFileSync(sourceAbs, tempPath);
    console.log('[DOWNLOAD-WITH-EXIF] Created temp file:', tempPath);
    
    // Build EXIF metadata object
    const exifData = {};
    
    // Camera info (from equipment library, with text field fallback)
    if (cameraName) {
      exifData.Make = cameraBrand || cameraName.split(' ')[0] || cameraName;
      exifData.Model = cameraName;
    }
    
    // Lens info (from equipment library, with text field fallback)
    // For fixed-lens cameras, use the built-in lens info
    if (fixedLensFocal) {
      // Fixed lens camera - construct lens model from camera data
      const lensStr = fixedLensAperture 
        ? `${fixedLensFocal}mm f/${fixedLensAperture}` 
        : `${fixedLensFocal}mm`;
      exifData.LensModel = `${cameraName} ${lensStr}`;
      // Also set focal length if not already specified
      if (!photo.focal_length) {
        exifData.FocalLength = fixedLensFocal;
      }
    } else if (lensName) {
      exifData.LensModel = lensName;
      if (lensBrand) {
        exifData.LensMake = lensBrand;
      }
    }
    
    // Photographer (Artist & Copyright)
    const photographer = photo.photographer || photo.roll_photographer;
    if (photographer) {
      exifData.Artist = photographer;
      exifData.Copyright = `© ${photographer}`;
    }
    
    // Shooting parameters
    if (photo.iso) exifData.ISO = photo.iso;
    if (photo.aperture) exifData.FNumber = photo.aperture;
    if (photo.shutter_speed) exifData.ExposureTime = photo.shutter_speed;
    if (photo.focal_length) exifData.FocalLength = photo.focal_length;
    
    // Date/Time (format: YYYY:MM:DD HH:mm:ss)
    if (photo.date_taken) {
      const dateStr = photo.date_taken;
      const timeStr = photo.time_taken || '12:00:00';
      const formatted = `${dateStr.replace(/-/g, ':')} ${timeStr}`;
      exifData.DateTimeOriginal = formatted;
      exifData.CreateDate = formatted;
    }
    
    // GPS Location
    if (photo.latitude && photo.longitude) {
      exifData.GPSLatitude = photo.latitude;
      exifData.GPSLongitude = photo.longitude;
    }
    
    // Description combining caption, roll info, film info, frame number
    const descParts = [];
    if (photo.caption) descParts.push(photo.caption);
    if (photo.roll_title) descParts.push(`Roll: ${photo.roll_title}`);
    if (photo.film_name) descParts.push(`Film: ${photo.film_name}`);
    if (photo.frame_number) descParts.push(`Frame: ${photo.frame_number}`);
    if (descParts.length > 0) {
      exifData.ImageDescription = descParts.join(' | ');
    }
    
    // Keywords (tags) - IPTC/XMP compatible
    if (tags.length > 0) {
      exifData.Subject = tags;
      exifData.Keywords = tags;
    }
    
    // Software tag
    exifData.Software = 'FilmGallery v1.8.0';
    
    console.log('[DOWNLOAD-WITH-EXIF] EXIF data to write:', JSON.stringify(exifData, null, 2));
    
    // Write EXIF to temp file
    try {
      console.log('[DOWNLOAD-WITH-EXIF] Writing EXIF with exiftool...');
      await exiftool.write(tempPath, exifData, ['-overwrite_original']);
      console.log('[DOWNLOAD-WITH-EXIF] ✅ EXIF write successful');
    } catch (exifErr) {
      console.error('[DOWNLOAD-WITH-EXIF] exiftool write failed:', exifErr);
      // Clean up and return original file if EXIF write fails
      try { fs.unlinkSync(tempPath); } catch(_) {}
      const filename = photo.filename ? path.basename(photo.filename) : `photo_${id}.jpg`;
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      return res.sendFile(sourceAbs);
    }
    
    // Send file with embedded EXIF
    const filename = photo.filename ? path.basename(photo.filename) : `photo_${id}.jpg`;
    console.log('[DOWNLOAD-WITH-EXIF] Sending file with EXIF:', filename);
    res.download(tempPath, filename, (err) => {
      // Clean up temp file after download completes
      try {
        fs.unlinkSync(tempPath);
      } catch (cleanupErr) {
        console.warn('[DOWNLOAD-WITH-EXIF] Failed to cleanup temp file:', cleanupErr.message);
      }
      if (err && !res.headersSent) {
        console.error('[DOWNLOAD-WITH-EXIF] Download error:', err);
      }
    });
    
  } catch (err) {
    console.error('[DOWNLOAD-WITH-EXIF] Error:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
