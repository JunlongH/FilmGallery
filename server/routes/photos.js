const express = require('express');
const router = express.Router();
const db = require('../db');
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
sharp.cache(false);
const { runAsync, allAsync, getAsync, validatePhotoUpdate } = require('../utils/db-helpers');
const { savePhotoTags, attachTagsToPhotos } = require('../services/tag-service');
const { uploadsDir } = require('../config/paths');
const { uploadDefault } = require('../config/multer');
const { moveFileSync } = require('../utils/file-helpers');

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

  let sql = `
    SELECT p.*, r.title as roll_title, l.city_name, l.country_name, COALESCE(f.name, r.film_type) AS film_name
    FROM photos p
    JOIN rolls r ON p.roll_id = r.id
    LEFT JOIN locations l ON p.location_id = l.id
    LEFT JOIN films f ON r.filmId = f.id
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
    const withTags = await attachTagsToPhotos(rows);
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

// update photo (adds tags support)
router.put('/:id', async (req, res) => {
  const id = req.params.id;
  const { frame_number, caption, taken_at, rating, tags, date_taken, time_taken, location_id, detail_location, latitude, longitude, camera, lens, photographer } = req.body;
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
  if (camera !== undefined) { updates.push('camera=?'); params.push(camera); }
  if (lens !== undefined) { updates.push('lens=?'); params.push(lens); }
  if (photographer !== undefined) { updates.push('photographer=?'); params.push(photographer); }

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
      appliedTags = await savePhotoTags(id, Array.isArray(tags) ? tags : []);
    }

    // Auto-add location to roll if missing
    if (v.location_id) {
      const row = await getAsync('SELECT roll_id FROM photos WHERE id = ?', [id]);
      if (row && row.roll_id) {
        await runAsync('INSERT OR IGNORE INTO roll_locations (roll_id, location_id) VALUES (?, ?)', [row.roll_id, v.location_id]);
      }
    }

    // Add gear values to roll_gear without replacing roll fields
    if (camera || lens || photographer) {
      const photo = await getAsync('SELECT roll_id FROM photos WHERE id = ?', [id]);
      if (photo && photo.roll_id) {
        if (camera) await runAsync('INSERT OR IGNORE INTO roll_gear (roll_id, type, value) VALUES (?,?,?)', [photo.roll_id, 'camera', camera]);
        if (lens) await runAsync('INSERT OR IGNORE INTO roll_gear (roll_id, type, value) VALUES (?,?,?)', [photo.roll_id, 'lens', lens]);
        if (photographer) await runAsync('INSERT OR IGNORE INTO roll_gear (roll_id, type, value) VALUES (?,?,?)', [photo.roll_id, 'photographer', photographer]);
      }
    }

    res.json({ ok: true, updated, tags: appliedTags });
  } catch (err) {
    console.error('[PUT] Update photo error', err.message);
    res.status(500).json({ error: err.message });
  }
});

// Update positive image from negative (FilmLab save)
router.put('/:id/update-positive', uploadDefault.single('image'), async (req, res) => {
  const id = req.params.id;
  if (!req.file) return res.status(400).json({ error: 'image file required' });

  try {
    const row = await new Promise((resolve, reject) => {
      db.get('SELECT roll_id, frame_number, full_rel_path, thumb_rel_path FROM photos WHERE id = ?', [id], (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });

    if (!row) return res.status(404).json({ error: 'Photo not found' });

    // If full_rel_path is null (negative only), we need to create a path for the positive
    // Even if it exists, we ALWAYS create a new versioned filename to avoid OneDrive/OS file locking issues.
    
    const rollId = row.roll_id;
    const frameNum = row.frame_number || '00';
    const folderName = String(rollId);
    
    // Ensure full directory exists
    const fullDir = path.join(uploadsDir, 'rolls', folderName, 'full');
    if (!fs.existsSync(fullDir)) fs.mkdirSync(fullDir, { recursive: true });

    // Generate new unique filename: rollID_frame_timestamp.jpg
    const newFileName = `${rollId}_${frameNum}_${Date.now()}.jpg`;
    const newFullRelPath = path.join('rolls', folderName, 'full', newFileName).replace(/\\/g, '/');
    const newFullPath = path.join(fullDir, newFileName);

    // Move uploaded file to new path
    try {
        console.log(`[UPDATE-POSITIVE] Moving file from ${req.file.path} to ${newFullPath}`);
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

    // Try to delete the old file if it existed
    if (row.full_rel_path) {
        try {
            const oldFullPath = path.join(uploadsDir, row.full_rel_path);
            if (fs.existsSync(oldFullPath)) {
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
        
        await sharp(fullPath)
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

// delete photo (enhanced to remove file from disk if in rolls folder)
router.delete('/:id', (req, res) => {
  const id = req.params.id;
  db.get('SELECT filename, full_rel_path, thumb_rel_path FROM photos WHERE id = ?', [id], (err, row) => {
    if (err) return res.status(500).json({ error: err.message });
    
    const deleteDbRow = () => {
      db.run('DELETE FROM photos WHERE id = ?', [id], async function(e){
        if (e) return res.status(500).json({ error: e.message });
        
        // Cleanup orphaned tags
        try {
          await runAsync('DELETE FROM tags WHERE id NOT IN (SELECT DISTINCT tag_id FROM photo_tags)');
        } catch (cleanupErr) {
          console.error('Tag cleanup error', cleanupErr);
        }

        res.json({ deleted: this.changes });
      });
    };

    if (row) {
      // Try to delete thumbnail if exists
      if (row.thumb_rel_path) {
        const thumbPath = path.join(uploadsDir, row.thumb_rel_path);
        fs.unlink(thumbPath, () => {});
      }

      const mainRelPath = row.full_rel_path;
      if (mainRelPath) {
        const filePath = path.join(uploadsDir, mainRelPath);
        fs.unlink(filePath, deleteDbRow);
      } else if (row.filename) {
        const filePath = path.join(__dirname, '../', row.filename.replace(/^\//, ''));
        fs.unlink(filePath, deleteDbRow);
      } else {
        deleteDbRow();
      }
    } else {
      deleteDbRow();
    }
  });
});

module.exports = router;
