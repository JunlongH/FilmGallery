/**
 * Photos API Routes - TypeScript Migration
 * 
 * Handles photo CRUD operations, FilmLab integration, and EXIF export.
 * 
 * Migrated from photos.js (1172 lines) with full type coverage.
 */

import express, { Request, Response, Router } from 'express';
import fs from 'fs';
import path from 'path';
import sharp from 'sharp';
import os from 'os';

const db = require('../db');
const { buildPipeline } = require('../services/filmlab-service');
const { runAsync, allAsync, getAsync, validatePhotoUpdate } = require('../utils/db-helpers');
const { savePhotoTags, attachTagsToPhotos } = require('../services/tag-service');
const { uploadsDir } = require('../config/paths');
const { uploadDefault } = require('../config/multer');
const { moveFileSync } = require('../utils/file-helpers');
const PreparedStmt = require('../utils/prepared-statements');
const { buildToneLUT, buildCurveLUT } = require('../utils/image-lut');
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
  orientation?: number;
  flipH?: boolean;
  flipV?: boolean;
}

interface PhotoRow {
  id: number;
  roll_id: number;
  filename: string | null;
  frame_number: string | null;
  caption: string | null;
  taken_at: string | null;
  date_taken: string | null;
  time_taken: string | null;
  rating: number | null;
  camera: string | null;
  lens: string | null;
  photographer: string | null;
  aperture: number | null;
  shutter_speed: string | null;
  iso: number | null;
  focal_length: number | null;
  location_id: number | null;
  detail_location: string | null;
  latitude: number | null;
  longitude: number | null;
  altitude: number | null;
  location_name: string | null;
  country: string | null;
  city: string | null;
  camera_equip_id: number | null;
  lens_equip_id: number | null;
  flash_equip_id: number | null;
  full_rel_path: string | null;
  thumb_rel_path: string | null;
  original_rel_path: string | null;
  negative_rel_path: string | null;
  positive_rel_path: string | null;
  positive_thumb_rel_path: string | null;
  negative_thumb_rel_path: string | null;
  is_negative_source: number;
  created_at: string;
  updated_at: string;
}

interface PhotoWithExtras extends PhotoRow {
  roll_title?: string;
  city_name?: string | null;
  country_name?: string | null;
  film_name?: string | null;
  camera_equip_name?: string | null;
  camera_equip_brand?: string | null;
  camera_equip_mount?: string | null;
  has_fixed_lens?: number;
  fixed_lens_focal_length?: number | null;
  fixed_lens_max_aperture?: string | null;
  lens_equip_name?: string | null;
  lens_equip_brand?: string | null;
  lens_equip_focal_min?: number | null;
  lens_equip_focal_max?: number | null;
  lens_equip_max_aperture?: string | null;
  flash_equip_name?: string | null;
  flash_equip_brand?: string | null;
  flash_equip_gn?: number | null;
  tags?: string[];
}

interface PhotoUpdateBody {
  frame_number?: string;
  caption?: string;
  taken_at?: string;
  rating?: number | string;
  tags?: string[];
  date_taken?: string;
  time_taken?: string;
  location_id?: number;
  detail_location?: string;
  latitude?: number;
  longitude?: number;
  altitude?: number;
  location_name?: string;
  country?: string;
  city?: string;
  camera?: string;
  lens?: string;
  photographer?: string;
  aperture?: number | string;
  shutter_speed?: string;
  iso?: number | string;
  camera_equip_id?: number;
  lens_equip_id?: number;
  flash_equip_id?: number;
}

interface PhotosQuery {
  camera?: string | string[];
  lens?: string | string[];
  photographer?: string | string[];
  location_id?: string | string[];
  film?: string | string[];
  year?: string | string[];
  month?: string | string[];
  ym?: string | string[];
}

interface RandomQuery {
  limit?: string;
}

interface ExportPositiveBody {
  params?: FilmLabParams;
  format?: 'jpeg' | 'tiff16' | 'both';
}

interface RenderPositiveBody {
  params?: FilmLabParams;
  format?: 'jpeg' | 'tiff16';
}

interface RunResult {
  lastID: number;
  changes: number;
}

interface MulterFile {
  fieldname: string;
  originalname: string;
  encoding: string;
  mimetype: string;
  size: number;
  destination: string;
  filename: string;
  path: string;
}

interface RequestWithFile extends Request<{ id: string }> {
  file?: MulterFile;
  params: { id: string };
}

// ============= Helper Functions =============

/**
 * Convert query param to array, handling comma-separated values.
 */
function toArray(v: string | string[] | undefined | null): string[] {
  if (v === undefined || v === null) return [];
  if (Array.isArray(v)) return v.filter(Boolean);
  if (typeof v === 'string' && v.includes(',')) return v.split(',').map(s => s.trim()).filter(Boolean);
  return v === '' ? [] : [v];
}

/**
 * Get default curves configuration.
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
 * Apply per-pixel color processing for export/render.
 */
function processPixelsForExport(
  data: Buffer,
  width: number,
  height: number,
  channels: number,
  params: FilmLabParams
): Buffer {
  const out = Buffer.allocUnsafe(width * height * 3);
  
  const toneLUT = buildToneLUT({
    exposure: params.exposure || 0,
    contrast: params.contrast || 0,
    highlights: params.highlights || 0,
    shadows: params.shadows || 0,
    whites: params.whites || 0,
    blacks: params.blacks || 0,
  });
  
  const curves = params.curves || getDefaultCurves();
  const lutRGB = buildCurveLUT(curves.rgb || []);
  const lutR = buildCurveLUT(curves.red || []);
  const lutG = buildCurveLUT(curves.green || []);
  const lutB = buildCurveLUT(curves.blue || []);
  
  const inverted = params.inverted || false;
  const inversionMode = params.inversionMode || 'linear';
  const temp = params.temp || 0;
  const tint = params.tint || 0;
  const red = params.red ?? 1.0;
  const green = params.green ?? 1.0;
  const blue = params.blue ?? 1.0;
  
  const [rBal, gBal, bBal] = computeWBGains({ red, green, blue, temp, tint });
  const needsLogInversion = inverted && inversionMode === 'log';
  const needsWbInJs = needsLogInversion;
  
  for (let i = 0, j = 0; i < data.length; i += channels, j += 3) {
    let r = data[i];
    let g = data[i + 1];
    let b = data[i + 2];
    
    if (needsLogInversion) {
      r = 255 * (1 - Math.log(r + 1) / Math.log(256));
      g = 255 * (1 - Math.log(g + 1) / Math.log(256));
      b = 255 * (1 - Math.log(b + 1) / Math.log(256));
    }
    
    if (needsWbInJs) {
      r *= rBal;
      g *= gBal;
      b *= bBal;
      r = Math.max(0, Math.min(255, r));
      g = Math.max(0, Math.min(255, g));
      b = Math.max(0, Math.min(255, b));
    }
    
    r = toneLUT[Math.floor(r)];
    g = toneLUT[Math.floor(g)];
    b = toneLUT[Math.floor(b)];
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

/**
 * Convert 8-bit buffer to 16-bit buffer for TIFF export.
 */
function convert8To16Bit(raw8: Buffer, channels: number): Buffer {
  const raw16 = Buffer.allocUnsafe(raw8.length * 2);
  for (let i = 0, j = 0; i < raw8.length; i++, j += 2) {
    const v8 = raw8[i];
    const v16 = (v8 << 8) | v8;
    raw16[j] = v16 & 0xFF;
    raw16[j + 1] = (v16 >> 8) & 0xFF;
  }
  return raw16;
}

// ============= CRUD Routes =============

// GET /api/photos - Get all photos with optional filtering
router.get('/', async (req: Request<{}, {}, {}, PhotosQuery>, res: Response) => {
  const { camera, lens, photographer, location_id, film, year, month, ym } = req.query;

  const cameras = toArray(camera);
  const lenses = toArray(lens);
  const photographers = toArray(photographer);
  const locations = toArray(location_id).map(v => String(v).split('::')[0]);
  const years = toArray(year);
  const months = toArray(month);
  const yms = toArray(ym);
  const films = toArray(film);

  // Check if locations table exists
  const locationsTableExists = await new Promise<boolean>((resolve) => {
    db.get("SELECT name FROM sqlite_master WHERE type='table' AND name='locations'", [], (err: Error | null, row: { name: string } | undefined) => {
      resolve(!!row);
    });
  });

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
  const params: (string | number)[] = [];

  if (cameras.length) {
    const cs = cameras.map(() => `p.camera = ?`).join(' OR ');
    sql += ` AND (${cs})`;
    cameras.forEach(c => params.push(c));
  }

  if (lenses.length) {
    const ls = lenses.map(() => `p.lens = ?`).join(' OR ');
    sql += ` AND (${ls})`;
    lenses.forEach(l => params.push(l));
  }

  if (photographers.length) {
    const ps = photographers.map(() => `p.photographer = ?`).join(' OR ');
    sql += ` AND (${ps})`;
    photographers.forEach(pv => params.push(pv));
  }

  if (locations.length) {
    const placeholders = locations.map(() => '?').join(',');
    sql += ` AND p.location_id IN (${placeholders})`;
    params.push(...locations);
  }

  if (films.length) {
    const fs = films.map(() => `(r.filmId = ? OR f.name = ? OR r.film_type = ?)`).join(' OR ');
    sql += ` AND (${fs})`;
    films.forEach(fv => { params.push(fv, fv, fv); });
  }

  if (years.length || months.length || yms.length) {
    const parts: string[] = [];
    if (yms.length) {
      parts.push(`strftime('%Y-%m', p.date_taken) IN (${yms.map(() => '?').join(',')})`);
      params.push(...yms);
    } else {
      if (years.length) {
        parts.push(`strftime('%Y', p.date_taken) IN (${years.map(() => '?').join(',')})`);
        params.push(...years);
      }
      if (months.length) {
        parts.push(`strftime('%m', p.date_taken) IN (${months.map(() => '?').join(',')})`);
        params.push(...months);
      }
    }
    if (parts.length) sql += ` AND (${parts.join(' OR ')})`;
  }

  sql += ` ORDER BY p.date_taken DESC, p.id DESC`;

  try {
    const rows = await allAsync(sql, params) as PhotoWithExtras[];
    const normalized = (rows || []).map(r => {
      const fullPath = r.positive_rel_path || r.full_rel_path || null;
      const thumbPath = r.positive_thumb_rel_path || r.thumb_rel_path || null;
      return { ...r, full_rel_path: fullPath, thumb_rel_path: thumbPath };
    });
    const withTags = await attachTagsToPhotos(normalized);
    res.json(withTags);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// GET /api/photos/random - Get random photos for hero section
router.get('/random', async (req: Request<{}, {}, {}, RandomQuery>, res: Response) => {
  const limit = parseInt(req.query.limit || '10') || 10;
  const sql = `
    SELECT p.*, r.title as roll_title 
    FROM photos p
    JOIN rolls r ON p.roll_id = r.id
    WHERE p.full_rel_path IS NOT NULL
    ORDER BY RANDOM() 
    LIMIT ?
  `;
  try {
    const rows = await allAsync(sql, [limit]) as PhotoWithExtras[];
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// GET /api/photos/favorites - Get liked photos
router.get('/favorites', async (req: Request, res: Response) => {
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
    const rows = await allAsync(sql, []) as PhotoWithExtras[];
    console.log(`[GET] Favorites found: ${rows.length}`);
    const withTags = await attachTagsToPhotos(rows);
    res.json(withTags);
  } catch (err) {
    console.error('[GET] Favorites error:', (err as Error).message);
    res.status(500).json({ error: (err as Error).message });
  }
});

// GET /api/photos/negatives - Get negative source photos
router.get('/negatives', async (req: Request, res: Response) => {
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
    const rows = await allAsync(sql, []) as PhotoWithExtras[];
    const withTags = await attachTagsToPhotos(rows);
    res.json(withTags);
  } catch (err) {
    console.error('[GET] Negatives error:', (err as Error).message);
    res.status(500).json({ error: (err as Error).message });
  }
});

// PUT /api/photos/:id - Update photo with tags support
router.put('/:id', async (req: Request<{ id: string }, {}, PhotoUpdateBody>, res: Response) => {
  const id = req.params.id;
  const { 
    frame_number, caption, taken_at, rating, tags, date_taken, time_taken, 
    location_id, detail_location, latitude, longitude, altitude, location_name, 
    country, city, camera, lens, photographer, aperture, shutter_speed, iso, 
    camera_equip_id, lens_equip_id, flash_equip_id 
  } = req.body;
  console.log(`[PUT] Update photo ${id}`, req.body);

  const updates: string[] = [];
  const params: (string | number | null)[] = [];
  
  if (frame_number !== undefined) { updates.push('frame_number=?'); params.push(frame_number); }
  if (caption !== undefined) { updates.push('caption=?'); params.push(caption); }
  if (taken_at !== undefined) { updates.push('taken_at=?'); params.push(taken_at); }
  if (rating !== undefined) { updates.push('rating=?'); params.push(parseInt(String(rating))); }
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
  if (aperture !== undefined) { 
    updates.push('aperture=?'); 
    params.push(aperture !== null && aperture !== '' ? parseFloat(String(aperture)) : null); 
  }
  if (shutter_speed !== undefined) { updates.push('shutter_speed=?'); params.push(shutter_speed || null); }
  if (iso !== undefined) { 
    updates.push('iso=?'); 
    params.push(iso !== null && iso !== '' ? parseInt(String(iso)) : null); 
  }
  if (camera_equip_id !== undefined) { updates.push('camera_equip_id=?'); params.push(camera_equip_id); }
  if (lens_equip_id !== undefined) { updates.push('lens_equip_id=?'); params.push(lens_equip_id); }
  if (flash_equip_id !== undefined) { updates.push('flash_equip_id=?'); params.push(flash_equip_id); }

  if (!updates.length && tags === undefined) {
    return res.json({ updated: 0 });
  }

  try {
    const v = await validatePhotoUpdate(id, req.body);
    let updated = 0;
    
    if (updates.length) {
      params.push(id);
      const sql = `UPDATE photos SET ${updates.join(', ')} WHERE id=?`;
      const result = await runAsync(sql, params) as RunResult;
      updated = result && typeof result.changes === 'number' ? result.changes : 0;
    }

    let appliedTags: string[] | undefined;
    if (tags !== undefined) {
      console.log(`[PUT] About to save tags for photo ${id}:`, tags);
      try {
        appliedTags = await savePhotoTags(id, Array.isArray(tags) ? tags : []);
        console.log(`[PUT] Tags saved successfully:`, appliedTags);
      } catch (tagErr) {
        console.error(`[PUT] savePhotoTags failed for photo ${id}:`, tagErr);
        throw tagErr;
      }
    }

    // Auto-add location to roll if missing
    if (v.location_id) {
      const row = await getAsync('SELECT roll_id FROM photos WHERE id = ?', [id]) as { roll_id: number } | undefined;
      if (row && row.roll_id) {
        await runAsync('INSERT OR IGNORE INTO roll_locations (roll_id, location_id) VALUES (?, ?)', [row.roll_id, v.location_id]);
      }
    }

    // Add gear values to roll_gear with deduplication
    if (camera || lens || photographer) {
      const { addOrUpdateGear } = require('../services/gear-service');
      const photo = await getAsync('SELECT roll_id FROM photos WHERE id = ?', [id]) as { roll_id: number } | undefined;
      if (photo && photo.roll_id) {
        if (camera) await addOrUpdateGear(photo.roll_id, 'camera', camera).catch((e: Error) => console.error('Add camera failed', e));
        if (lens) await addOrUpdateGear(photo.roll_id, 'lens', lens).catch((e: Error) => console.error('Add lens failed', e));
        if (photographer) await addOrUpdateGear(photo.roll_id, 'photographer', photographer).catch((e: Error) => console.error('Add photographer failed', e));
      }
    }

    res.json({ ok: true, updated, tags: appliedTags });
  } catch (err) {
    console.error('[PUT] Update photo error', (err as Error).message);
    console.error('[PUT] Stack trace:', (err as Error).stack);
    res.status(500).json({ error: (err as Error).message });
  }
});

// DELETE /api/photos/:id - Delete photo and files
router.delete('/:id', (req: Request<{ id: string }>, res: Response) => {
  const id = req.params.id;
  
  db.get(
    'SELECT filename, full_rel_path, thumb_rel_path, original_rel_path, negative_rel_path, positive_rel_path, positive_thumb_rel_path, negative_thumb_rel_path FROM photos WHERE id = ?',
    [id],
    (err: Error | null, row: PhotoRow | undefined) => {
      if (err) return res.status(500).json({ error: err.message });
      
      const deleteDbRow = () => {
        db.run('DELETE FROM photos WHERE id = ?', [id], async function(this: { changes: number }, e: Error | null) {
          if (e) return res.status(500).json({ error: e.message });
          
          try {
            await runAsync('DELETE FROM tags WHERE id NOT IN (SELECT DISTINCT tag_id FROM photo_tags)');
          } catch (cleanupErr) {
            console.error('Tag cleanup error', cleanupErr);
          }

          res.json({ deleted: this.changes });
        });
      };

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

        const uniquePaths = [...new Set(pathsToDelete.filter(p => p))] as string[];

        if (uniquePaths.length === 0) {
          if (row.filename && !row.full_rel_path) {
            const filePath = path.join(__dirname, '../', row.filename.replace(/^\//, ''));
            fs.unlink(filePath, deleteDbRow);
          } else {
            deleteDbRow();
          }
          return;
        }

        let processed = 0;
        const checkDone = () => {
          processed++;
          if (processed >= uniquePaths.length) {
            deleteDbRow();
          }
        };

        uniquePaths.forEach(relPath => {
          const filePath = path.join(uploadsDir, relPath);
          fs.unlink(filePath, (unlinkErr) => {
            if (unlinkErr && (unlinkErr as NodeJS.ErrnoException).code !== 'ENOENT') {
              console.warn(`Failed to delete ${filePath}`, unlinkErr.message);
            }
            checkDone();
          });
        });
      } else {
        deleteDbRow();
      }
    }
  );
});

// ============= Update/Ingest Positive Routes =============

// PUT /api/photos/:id/update-positive - Update positive image from negative
router.put('/:id/update-positive', uploadDefault.single('image'), async (req: RequestWithFile, res: Response) => {
  const id = req.params.id;
  if (!req.file) return res.status(400).json({ error: 'image file required' });

  try {
    const row = await PreparedStmt.getAsync('photos.getByRollSimple', [id]) as PhotoRow | undefined;
    if (!row) return res.status(404).json({ error: 'Photo not found' });

    const rollId = row.roll_id;
    const frameNum = row.frame_number || '00';
    const folderName = String(rollId);

    const fullDir = path.join(uploadsDir, 'rolls', folderName, 'full');
    if (!fs.existsSync(fullDir)) fs.mkdirSync(fullDir, { recursive: true });

    const newFileName = `${rollId}_${frameNum}.jpg`;
    const newFullRelPath = path.join('rolls', folderName, 'full', newFileName).replace(/\\/g, '/');
    const newFullPath = path.join(fullDir, newFileName);

    try {
      console.log(`[UPDATE-POSITIVE] Moving file from ${req.file.path} to ${newFullPath}`);
      moveFileSync(req.file.path, newFullPath);
    } catch (moveErr) {
      console.error('[UPDATE-POSITIVE] Move failed:', moveErr);
      return res.status(500).json({ error: 'Failed to save file to disk: ' + (moveErr as Error).message });
    }

    try {
      await runAsync('UPDATE photos SET full_rel_path = ? WHERE id = ?', [newFullRelPath, id]);
    } catch (dbErr) {
      console.error('[UPDATE-POSITIVE] DB update failed:', dbErr);
      return res.status(500).json({ error: 'Failed to update database: ' + (dbErr as Error).message });
    }

    if (row.full_rel_path) {
      try {
        const oldFullPath = path.join(uploadsDir, row.full_rel_path);
        if (oldFullPath !== newFullPath && fs.existsSync(oldFullPath)) {
          fs.unlinkSync(oldFullPath);
        }
      } catch (e) {
        console.warn('[UPDATE-POSITIVE] Could not delete old file:', (e as Error).message);
      }
    }

    const thumbPath = row.thumb_rel_path ? path.join(uploadsDir, row.thumb_rel_path) : null;
    if (thumbPath) {
      try {
        console.log(`[UPDATE-POSITIVE] Regenerating thumbnail at ${thumbPath}`);
        if (fs.existsSync(thumbPath)) {
          try { fs.unlinkSync(thumbPath); } catch (_) { /* ignore */ }
        }
        const fileBuf = fs.readFileSync(newFullPath);
        await sharp(fileBuf)
          .resize({ width: 240, height: 240, fit: 'inside' })
          .jpeg({ quality: 40 })
          .toFile(thumbPath);
      } catch (sharpErr) {
        console.error('[UPDATE-POSITIVE] Thumbnail regeneration failed:', sharpErr);
      }
    }

    res.json({ ok: true, newPath: newFullRelPath });
  } catch (err) {
    console.error('[UPDATE-POSITIVE] General error:', err);
    res.status(500).json({ error: (err as Error).message });
  }
});

// POST /api/photos/:id/ingest-positive - Ingest positive JPEG from GPU export
router.post('/:id/ingest-positive', uploadDefault.single('image'), async (req: RequestWithFile, res: Response) => {
  const id = req.params.id;
  console.log('[INGEST-POSITIVE] Request for photo ID:', id);
  console.log('[INGEST-POSITIVE] File received:', req.file ? 'yes' : 'no');

  if (!req.file) {
    console.error('[INGEST-POSITIVE] No file received in request');
    return res.status(400).json({ error: 'image file required' });
  }

  try {
    const row = await new Promise<PhotoRow | undefined>((resolve, reject) => {
      db.get('SELECT roll_id, frame_number, positive_rel_path, full_rel_path, positive_thumb_rel_path FROM photos WHERE id = ?', [id], (err: Error | null, r: PhotoRow | undefined) => err ? reject(err) : resolve(r));
    });
    if (!row) {
      console.error('[INGEST-POSITIVE] Photo not found:', id);
      return res.status(404).json({ error: 'Photo not found' });
    }

    const rollId = row.roll_id;
    const frameNum = row.frame_number || '00';
    const folderName = String(rollId);
    const fullDir = path.join(uploadsDir, 'rolls', folderName, 'full');
    const thumbDir = path.join(uploadsDir, 'rolls', folderName, 'thumb');

    if (!fs.existsSync(fullDir)) fs.mkdirSync(fullDir, { recursive: true });
    if (!fs.existsSync(thumbDir)) fs.mkdirSync(thumbDir, { recursive: true });

    const exportName = `${rollId}_${frameNum}_positive.jpg`;
    const newFullRelPath = path.join('rolls', folderName, 'full', exportName).replace(/\\/g, '/');
    const newFullPath = path.join(fullDir, exportName);

    if (row.positive_rel_path && row.positive_rel_path !== newFullRelPath) {
      try {
        const oldPosAbs = path.join(uploadsDir, row.positive_rel_path);
        if (fs.existsSync(oldPosAbs)) fs.unlinkSync(oldPosAbs);
      } catch (e) {
        console.warn('[INGEST-POSITIVE] Cleanup old positive failed', (e as Error).message);
      }
    }

    try {
      if (fs.existsSync(newFullPath)) {
        try { fs.unlinkSync(newFullPath); } catch (_) { /* ignore */ }
      }
      moveFileSync(req.file.path, newFullPath);
    } catch (e) {
      console.error('[INGEST-POSITIVE] Failed to move file:', (e as Error).message);
      return res.status(500).json({ error: 'Failed to save file: ' + (e as Error).message });
    }

    if (!fs.existsSync(newFullPath)) {
      return res.status(500).json({ error: 'File was not saved correctly' });
    }
    const stats = fs.statSync(newFullPath);
    if (stats.size === 0) {
      return res.status(500).json({ error: 'File was saved but has 0 size' });
    }

    const thumbName = `${rollId}_${frameNum}_positive-thumb.jpg`;
    const thumbPath = path.join(thumbDir, thumbName);
    try {
      if (fs.existsSync(thumbPath)) {
        try { fs.unlinkSync(thumbPath); } catch (_) { /* ignore */ }
      }
      const fileBuf = fs.readFileSync(newFullPath);
      await sharp(fileBuf).resize({ width: 240, height: 240, fit: 'inside' }).jpeg({ quality: 40 }).toFile(thumbPath);
    } catch (e) {
      console.error('[INGEST-POSITIVE] thumb failed', (e as Error).message);
    }
    const relThumb = path.join('rolls', folderName, 'thumb', thumbName).replace(/\\/g, '/');

    await runAsync('UPDATE photos SET positive_rel_path=?, positive_thumb_rel_path=?, full_rel_path=COALESCE(full_rel_path, ?) WHERE id=?', [newFullRelPath, relThumb, newFullRelPath, id]);

    if (row.positive_thumb_rel_path && row.positive_thumb_rel_path !== relThumb) {
      try {
        const oldThumbAbs = path.join(uploadsDir, row.positive_thumb_rel_path);
        if (fs.existsSync(oldThumbAbs)) fs.unlinkSync(oldThumbAbs);
      } catch (e) {
        console.warn('[INGEST-POSITIVE] Cleanup old thumb failed', (e as Error).message);
      }
    }

    const updatedPhoto = await PreparedStmt.getAsync('photos.getById', [id]);
    res.json({ ok: true, photo: updatedPhoto, positive_rel_path: newFullRelPath, positive_thumb_rel_path: relThumb });
  } catch (err) {
    console.error('[INGEST-POSITIVE] error', err);
    res.status(500).json({ error: (err as Error).message });
  }
});

// ============= Export/Render Routes =============

// POST /api/photos/:id/export-positive - High-quality export from original
router.post('/:id/export-positive', async (req: Request<{ id: string }, {}, ExportPositiveBody>, res: Response) => {
  console.log('[POST] /api/photos/:id/export-positive', req.params.id);
  const id = req.params.id;
  const body = req.body || {};
  const p = body.params || {};
  const format = (body.format || 'jpeg').toLowerCase() as 'jpeg' | 'tiff16' | 'both';

  const inverted = !!p.inverted;
  const inversionMode = p.inversionMode === 'log' ? 'log' : 'linear';
  const exposure = Number.isFinite(p.exposure) ? p.exposure! : 0;
  const contrast = Number.isFinite(p.contrast) ? p.contrast! : 0;
  const temp = Number.isFinite(p.temp) ? p.temp! : 0;
  const tint = Number.isFinite(p.tint) ? p.tint! : 0;
  const redGain = Number.isFinite(p.red) ? p.red! : 1.0;
  const greenGain = Number.isFinite(p.green) ? p.green! : 1.0;
  const blueGain = Number.isFinite(p.blue) ? p.blue! : 1.0;
  const rotation = Number.isFinite(p.rotation) ? p.rotation! : 0;
  const orientation = Number.isFinite(p.orientation) ? p.orientation! : 0;

  try {
    const row = await new Promise<PhotoRow | undefined>((resolve, reject) => {
      db.get('SELECT id, roll_id, frame_number, original_rel_path, positive_rel_path, full_rel_path, positive_thumb_rel_path, negative_rel_path FROM photos WHERE id = ?', [id], (err: Error | null, r: PhotoRow | undefined) => {
        if (err) reject(err); else resolve(r);
      });
    });
    if (!row) return res.status(404).json({ error: 'Photo not found' });

    const relSource = row.original_rel_path || row.positive_rel_path || row.full_rel_path || row.negative_rel_path;
    if (!relSource) {
      return res.status(400).json({ error: 'No usable image source for export' });
    }
    const sourceAbs = path.join(uploadsDir, relSource);
    if (!fs.existsSync(sourceAbs)) {
      return res.status(404).json({ error: 'Source file missing on disk: ' + relSource });
    }

    const rollFolder = path.join(uploadsDir, 'rolls', String(row.roll_id));
    const fullDir = path.join(rollFolder, 'full');
    const thumbDir = path.join(rollFolder, 'thumb');
    if (!fs.existsSync(fullDir)) fs.mkdirSync(fullDir, { recursive: true });
    if (!fs.existsSync(thumbDir)) fs.mkdirSync(thumbDir, { recursive: true });

    const frameNumber = row.frame_number || '00';
    const baseName = `${row.roll_id}_${frameNumber}`;
    const timestamp = Date.now();
    const exportName = `${baseName}.jpg`;
    const destPath = path.join(fullDir, exportName);
    const relDest = path.join('rolls', String(row.roll_id), 'full', exportName).replace(/\\/g, '/');

    const imgBase = await buildPipeline(sourceAbs, {
      inverted, inversionMode, exposure, contrast, temp, tint,
      red: redGain, green: greenGain, blue: blueGain, rotation, orientation
    }, { maxWidth: null, cropRect: p.cropRect || null, toneAndCurvesInJs: true });

    const { data, info } = await imgBase.raw().toBuffer({ resolveWithObject: true });
    const width = info.width;
    const height = info.height;
    const channels = info.channels;

    const out = processPixelsForExport(data, width, height, channels, p);
    await sharp(out, { raw: { width, height, channels: 3 } }).jpeg({ quality: 95 }).toFile(destPath);

    // Optional TIFF export
    let tiffRelPath: string | null = null;
    if (format === 'tiff16' || format === 'both') {
      const tiffName = `${baseName}_exp_${timestamp}.tiff`;
      const tiffPath = path.join(fullDir, tiffName);
      try {
        const imgTiffBase = await buildPipeline(sourceAbs, {
          inverted, inversionMode, exposure, contrast, temp, tint,
          red: redGain, green: greenGain, blue: blueGain, rotation, orientation
        }, { maxWidth: null, cropRect: p.cropRect || null, toneAndCurvesInJs: true });
        
        const { data: raw8, info: info8 } = await imgTiffBase.raw().toBuffer({ resolveWithObject: true });
        const processedRaw8 = processPixelsForExport(raw8, info8.width, info8.height, info8.channels, p);
        const raw16 = convert8To16Bit(processedRaw8, 3);
        
        // Note: depth and bitdepth options are valid but not in @types/sharp
        await (sharp as unknown as (input: Buffer, opts: { raw: { width: number; height: number; channels: number; depth: string } }) => sharp.Sharp)(
          raw16, 
          { raw: { width: info8.width, height: info8.height, channels: 3, depth: 'ushort' } }
        )
          .tiff({ compression: 'lzw', bitdepth: 16 } as unknown as sharp.TiffOptions)
          .toFile(tiffPath);
        tiffRelPath = path.join('rolls', String(row.roll_id), 'full', tiffName).replace(/\\/g, '/');
      } catch (tErr) {
        console.error('[EXPORT-POSITIVE] TIFF16 generation failed', (tErr as Error).message);
      }
    }

    // Generate thumbnail
    const thumbName = `${baseName}-thumb.jpg`;
    const thumbPath = path.join(thumbDir, thumbName);
    try {
      await sharp(destPath)
        .resize({ width: 240, height: 240, fit: 'inside' })
        .jpeg({ quality: 40 })
        .toFile(thumbPath);
    } catch (thErr) {
      console.error('[EXPORT-POSITIVE] Thumbnail generation failed', (thErr as Error).message);
    }
    const relThumb = path.join('rolls', String(row.roll_id), 'thumb', thumbName).replace(/\\/g, '/');

    // Cleanup old files
    if (row.positive_rel_path && row.positive_rel_path !== relDest) {
      try {
        const oldPosAbs = path.join(uploadsDir, row.positive_rel_path);
        if (fs.existsSync(oldPosAbs)) fs.unlinkSync(oldPosAbs);
      } catch (delErr) {
        console.warn('[EXPORT-POSITIVE] Could not delete previous positive file:', (delErr as Error).message);
      }
    }
    if (row.positive_thumb_rel_path && row.positive_thumb_rel_path !== relThumb) {
      try {
        const oldThumbAbs = path.join(uploadsDir, row.positive_thumb_rel_path);
        if (fs.existsSync(oldThumbAbs)) fs.unlinkSync(oldThumbAbs);
      } catch (delErr) {
        console.warn('[EXPORT-POSITIVE] Could not delete previous thumbnail:', (delErr as Error).message);
      }
    }

    await runAsync('UPDATE photos SET positive_rel_path = ?, positive_thumb_rel_path = ?, full_rel_path = COALESCE(full_rel_path, ?) WHERE id = ?', [relDest, relThumb, relDest, id]);

    const updatedPhoto = await PreparedStmt.getAsync('photos.getById', [id]);
    console.log('[POST] export-positive done', { id, positive_rel_path: relDest });
    res.json({ ok: true, photo: updatedPhoto, tiff_rel_path: tiffRelPath });
  } catch (err) {
    console.error('[EXPORT-POSITIVE] Error:', err);
    res.status(500).json({ error: (err as Error).message });
  }
});

// POST /api/photos/:id/render-positive - Ad-hoc render (no DB mutation)
router.post('/:id/render-positive', async (req: Request<{ id: string }, {}, RenderPositiveBody>, res: Response) => {
  const id = req.params.id;
  const body = req.body || {};
  const p = body.params || {};
  const format = (body.format || 'jpeg').toLowerCase() as 'jpeg' | 'tiff16';
  
  if (!['jpeg', 'tiff16'].includes(format)) {
    return res.status(400).json({ error: 'Unsupported format for render-positive' });
  }

  const inverted = !!p.inverted;
  const inversionMode = p.inversionMode === 'log' ? 'log' : 'linear';
  const exposure = Number.isFinite(p.exposure) ? p.exposure! : 0;
  const contrast = Number.isFinite(p.contrast) ? p.contrast! : 0;
  const temp = Number.isFinite(p.temp) ? p.temp! : 0;
  const tint = Number.isFinite(p.tint) ? p.tint! : 0;
  const redGain = Number.isFinite(p.red) ? p.red! : 1.0;
  const greenGain = Number.isFinite(p.green) ? p.green! : 1.0;
  const blueGain = Number.isFinite(p.blue) ? p.blue! : 1.0;
  const rotation = Number.isFinite(p.rotation) ? p.rotation! : 0;
  const orientation = Number.isFinite(p.orientation) ? p.orientation! : 0;

  try {
    const row = await new Promise<PhotoRow | undefined>((resolve, reject) => {
      db.get('SELECT id, roll_id, original_rel_path, positive_rel_path, full_rel_path, negative_rel_path FROM photos WHERE id = ?', [id], (err: Error | null, r: PhotoRow | undefined) => {
        if (err) reject(err); else resolve(r);
      });
    });
    if (!row) return res.status(404).json({ error: 'Photo not found' });

    const relSource = row.original_rel_path || row.positive_rel_path || row.full_rel_path || row.negative_rel_path;
    if (!relSource) return res.status(400).json({ error: 'No usable source for render-positive' });
    const sourceAbs = path.join(uploadsDir, relSource);
    if (!fs.existsSync(sourceAbs)) return res.status(404).json({ error: 'Source file missing on disk' });

    if (format === 'tiff16') {
      const imgTiffBase = await buildPipeline(sourceAbs, {
        inverted, inversionMode, exposure, contrast, temp, tint,
        red: redGain, green: greenGain, blue: blueGain, rotation, orientation
      }, { maxWidth: null, cropRect: p.cropRect || null, toneAndCurvesInJs: true });

      const { data: raw8, info: info8 } = await imgTiffBase.raw().toBuffer({ resolveWithObject: true });
      const processedRaw8 = processPixelsForExport(raw8, info8.width, info8.height, info8.channels, p);
      const raw16 = convert8To16Bit(processedRaw8, 3);

      // Note: depth and bitdepth options are valid but not in @types/sharp
      const buf = await (sharp as unknown as (input: Buffer, opts: { raw: { width: number; height: number; channels: number; depth: string } }) => sharp.Sharp)(
        raw16, 
        { raw: { width: info8.width, height: info8.height, channels: 3, depth: 'ushort' } }
      )
        .tiff({ compression: 'lzw', bitdepth: 16 } as unknown as sharp.TiffOptions)
        .toBuffer();
      res.setHeader('Content-Type', 'image/tiff');
      res.setHeader('Content-Disposition', `attachment; filename="render_positive_${id}_${Date.now()}.tiff"`);
      return res.send(buf);
    }

    // JPEG path
    const imgBase = await buildPipeline(sourceAbs, {
      inverted, inversionMode, exposure, contrast, temp, tint,
      red: redGain, green: greenGain, blue: blueGain, rotation, orientation
    }, { maxWidth: null, cropRect: p.cropRect || null, toneAndCurvesInJs: true });

    const { data, info } = await imgBase.raw().toBuffer({ resolveWithObject: true });
    const out = processPixelsForExport(data, info.width, info.height, info.channels, p);
    const jpegBuf = await sharp(out, { raw: { width: info.width, height: info.height, channels: 3 } }).jpeg({ quality: 95 }).toBuffer();
    
    res.setHeader('Content-Type', 'image/jpeg');
    res.setHeader('Content-Disposition', `attachment; filename="render_positive_${id}_${Date.now()}.jpg"`);
    return res.send(jpegBuf);
  } catch (err) {
    console.error('[RENDER-POSITIVE] Error:', err);
    res.status(500).json({ error: (err as Error).message });
  }
});

// ============= EXIF Export Route =============

interface PhotoWithEXIFData extends PhotoRow {
  roll_title: string | null;
  roll_camera: string | null;
  roll_lens: string | null;
  roll_photographer: string | null;
  roll_start_date: string | null;
  film_name: string | null;
  // Photo-level camera equipment
  photo_camera_name: string | null;
  photo_camera_brand: string | null;
  photo_camera_model: string | null;
  has_fixed_lens: number | null;  // from photo's camera
  fixed_lens_focal_length: number | null;  // from photo's camera
  fixed_lens_max_aperture: string | null;  // from photo's camera
  // Photo-level lens equipment
  photo_lens_name: string | null;
  photo_lens_brand: string | null;
  photo_lens_model: string | null;
  photo_lens_focal_min: number | null;
  photo_lens_focal_max: number | null;
  photo_lens_max_aperture: string | null;
  // Roll-level camera equipment
  roll_camera_name: string | null;
  roll_camera_brand: string | null;
  roll_camera_model: string | null;
  roll_has_fixed_lens: number | null;
  roll_fixed_lens_focal: number | null;
  roll_fixed_lens_aperture: string | null;
  // Roll-level lens equipment
  roll_lens_name: string | null;
  roll_lens_brand: string | null;
  roll_lens_model: string | null;
  roll_lens_focal_min: number | null;
  roll_lens_focal_max: number | null;
  roll_lens_max_aperture: string | null;
}

interface TagRow {
  name: string;
}

interface ExifData {
  Make?: string;
  Model?: string;
  LensModel?: string;
  LensMake?: string;
  Artist?: string;
  Copyright?: string;
  ISO?: number;
  FNumber?: number;
  ExposureTime?: string;
  FocalLength?: number;
  DateTimeOriginal?: string;
  CreateDate?: string;
  GPSLatitude?: number;
  GPSLongitude?: number;
  ImageDescription?: string;
  Subject?: string[];
  Keywords?: string[];
  Software?: string;
}

// POST /api/photos/:id/download-with-exif - Download JPEG with embedded EXIF
router.post('/:id/download-with-exif', async (req: Request<{ id: string }>, res: Response) => {
  const id = req.params.id;
  console.log('[DOWNLOAD-WITH-EXIF] Request received for photo ID:', id);

  const { exiftool } = require('exiftool-vendored');

  try {
    const photo = await getAsync(`
      SELECT p.*, r.title as roll_title, r.camera as roll_camera, r.lens as roll_lens, 
             r.photographer as roll_photographer, r.start_date as roll_start_date,
             COALESCE(f.name, r.film_type) AS film_name,
             pcam.name AS photo_camera_name, pcam.brand AS photo_camera_brand, pcam.model AS photo_camera_model,
             pcam.has_fixed_lens, pcam.fixed_lens_focal_length, pcam.fixed_lens_max_aperture,
             plens.name AS photo_lens_name, plens.brand AS photo_lens_brand, plens.model AS photo_lens_model,
             plens.focal_length_min AS photo_lens_focal_min, plens.focal_length_max AS photo_lens_focal_max,
             plens.max_aperture AS photo_lens_max_aperture,
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
    `, [id]) as PhotoWithEXIFData | undefined;

    if (!photo) return res.status(404).json({ error: 'Photo not found' });

    const cameraName = photo.photo_camera_name || photo.roll_camera_name || photo.camera || photo.roll_camera;
    const cameraBrand = photo.photo_camera_brand || photo.roll_camera_brand || (cameraName ? cameraName.split(' ')[0] : null);
    const lensName = photo.photo_lens_name || photo.roll_lens_name || photo.lens || photo.roll_lens;
    const lensBrand = photo.photo_lens_brand || photo.roll_lens_brand;

    let fixedLensFocal: number | null = null;
    let fixedLensAperture: string | null = null;
    if (photo.has_fixed_lens || photo.roll_has_fixed_lens) {
      fixedLensFocal = photo.fixed_lens_focal_length || photo.roll_fixed_lens_focal;
      fixedLensAperture = photo.fixed_lens_max_aperture || photo.roll_fixed_lens_aperture;
    }

    console.log('[DOWNLOAD-WITH-EXIF] Photo metadata:', {
      id: photo.id, camera: cameraName, cameraBrand, lens: lensName, lensBrand,
      fixedLensFocal, fixedLensAperture, photographer: photo.photographer || photo.roll_photographer,
      iso: photo.iso, aperture: photo.aperture, shutter_speed: photo.shutter_speed,
      focal_length: photo.focal_length, date_taken: photo.date_taken,
      latitude: photo.latitude, longitude: photo.longitude
    });

    const tagRows = await allAsync('SELECT t.name FROM photo_tags pt JOIN tags t ON t.id = pt.tag_id WHERE pt.photo_id = ?', [id]) as TagRow[];
    const tags = tagRows.map(t => t.name);
    console.log('[DOWNLOAD-WITH-EXIF] Tags:', tags);

    const sourcePath = photo.positive_rel_path || photo.full_rel_path;
    if (!sourcePath) {
      return res.status(400).json({ error: 'No image available for download' });
    }

    const sourceAbs = path.join(uploadsDir, sourcePath);
    if (!fs.existsSync(sourceAbs)) {
      console.error('[DOWNLOAD-WITH-EXIF] Source file not found:', sourceAbs);
      return res.status(404).json({ error: 'Image file not found on disk' });
    }

    console.log('[DOWNLOAD-WITH-EXIF] Source file:', sourceAbs);

    const ext = path.extname(sourceAbs).toLowerCase();
    if (!['.jpg', '.jpeg'].includes(ext)) {
      const filename = photo.filename ? path.basename(photo.filename) : `photo_${id}${ext}`;
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      return res.sendFile(sourceAbs);
    }

    const tempPath = path.join(os.tmpdir(), `filmgallery_exif_${Date.now()}.jpg`);
    fs.copyFileSync(sourceAbs, tempPath);
    console.log('[DOWNLOAD-WITH-EXIF] Created temp file:', tempPath);

    const exifData: ExifData = {};

    if (cameraName) {
      exifData.Make = cameraBrand || cameraName.split(' ')[0] || cameraName;
      exifData.Model = cameraName;
    }

    if (fixedLensFocal) {
      const lensStr = fixedLensAperture ? `${fixedLensFocal}mm f/${fixedLensAperture}` : `${fixedLensFocal}mm`;
      exifData.LensModel = `${cameraName} ${lensStr}`;
      if (!photo.focal_length) {
        exifData.FocalLength = fixedLensFocal;
      }
    } else if (lensName) {
      exifData.LensModel = lensName;
      if (lensBrand) {
        exifData.LensMake = lensBrand;
      }
    }

    const photographer = photo.photographer || photo.roll_photographer;
    if (photographer) {
      exifData.Artist = photographer;
      exifData.Copyright = `© ${photographer}`;
    }

    if (photo.iso) exifData.ISO = photo.iso;
    if (photo.aperture) exifData.FNumber = photo.aperture;
    if (photo.shutter_speed) exifData.ExposureTime = photo.shutter_speed;
    if (photo.focal_length) exifData.FocalLength = photo.focal_length;

    if (photo.date_taken) {
      const dateStr = photo.date_taken;
      const timeStr = photo.time_taken || '12:00:00';
      const formatted = `${dateStr.replace(/-/g, ':')} ${timeStr}`;
      exifData.DateTimeOriginal = formatted;
      exifData.CreateDate = formatted;
    }

    if (photo.latitude && photo.longitude) {
      exifData.GPSLatitude = photo.latitude;
      exifData.GPSLongitude = photo.longitude;
    }

    const descParts: string[] = [];
    if (photo.caption) descParts.push(photo.caption);
    if (photo.roll_title) descParts.push(`Roll: ${photo.roll_title}`);
    if (photo.film_name) descParts.push(`Film: ${photo.film_name}`);
    if (photo.frame_number) descParts.push(`Frame: ${photo.frame_number}`);
    if (descParts.length > 0) {
      exifData.ImageDescription = descParts.join(' | ');
    }

    if (tags.length > 0) {
      exifData.Subject = tags;
      exifData.Keywords = tags;
    }

    exifData.Software = 'FilmGallery v1.8.0';

    console.log('[DOWNLOAD-WITH-EXIF] EXIF data to write:', JSON.stringify(exifData, null, 2));

    try {
      console.log('[DOWNLOAD-WITH-EXIF] Writing EXIF with exiftool...');
      await exiftool.write(tempPath, exifData, ['-overwrite_original']);
      console.log('[DOWNLOAD-WITH-EXIF] ✅ EXIF write successful');
    } catch (exifErr) {
      console.error('[DOWNLOAD-WITH-EXIF] exiftool write failed:', exifErr);
      try { fs.unlinkSync(tempPath); } catch (_) { /* ignore */ }
      const filename = photo.filename ? path.basename(photo.filename) : `photo_${id}.jpg`;
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      return res.sendFile(sourceAbs);
    }

    const filename = photo.filename ? path.basename(photo.filename) : `photo_${id}.jpg`;
    console.log('[DOWNLOAD-WITH-EXIF] Sending file with EXIF:', filename);
    res.download(tempPath, filename, (err) => {
      try {
        fs.unlinkSync(tempPath);
      } catch (cleanupErr) {
        console.warn('[DOWNLOAD-WITH-EXIF] Failed to cleanup temp file:', (cleanupErr as Error).message);
      }
      if (err && !res.headersSent) {
        console.error('[DOWNLOAD-WITH-EXIF] Download error:', err);
      }
    });

  } catch (err) {
    console.error('[DOWNLOAD-WITH-EXIF] Error:', err);
    res.status(500).json({ error: (err as Error).message });
  }
});

// CommonJS export for compatibility
module.exports = router;
export default router;
