/**
 * Equipment Management API Routes
 * 
 * Handles CRUD operations for:
 * - Cameras (equip_cameras)
 * - Lenses (equip_lenses)
 * - Flashes (equip_flashes)
 * - Film Formats (ref_film_formats)
 * 
 * Also provides:
 * - Mount compatibility filtering
 * - Equipment suggestions
 * - Image upload for equipment
 */

import express, { Request, Response, Router } from 'express';
import multer, { StorageEngine } from 'multer';
import path from 'path';
import fs from 'fs';

const { uploadsDir } = require('../config/paths');
const { CAMERA_TYPES, LENS_MOUNTS } = require('../utils/equipment-migration');
const { runAsync, allAsync, getAsync } = require('../utils/db-helpers');

const router: Router = express.Router();

// ============= Type Definitions =============

// Film Format
interface FilmFormat {
  id: number;
  name: string;
  description: string | null;
  frame_size: string | null;
}

// Camera
interface Camera {
  id: number;
  name: string;
  brand: string | null;
  model: string | null;
  type: string | null;
  format_id: number | null;
  format_name?: string | null;
  sub_format: string | null;
  mount: string | null;
  has_fixed_lens: number;
  fixed_lens_focal_length: number | null;
  fixed_lens_max_aperture: string | null;
  fixed_lens_min_aperture: string | null;
  has_built_in_flash: number;
  flash_gn: number | null;
  production_year_start: number | null;
  production_year_end: number | null;
  meter_type: string | null;
  shutter_type: string | null;
  shutter_speed_min: string | null;
  shutter_speed_max: string | null;
  weight_g: number | null;
  battery_type: string | null;
  serial_number: string | null;
  purchase_date: string | null;
  purchase_price: number | null;
  condition: string | null;
  notes: string | null;
  image_path: string | null;
  status: string;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
}

// Lens
interface Lens {
  id: number;
  name: string;
  brand: string | null;
  model: string | null;
  focal_length_min: number | null;
  focal_length_max: number | null;
  max_aperture: string | null;
  min_aperture: string | null;
  max_aperture_tele: string | null;
  mount: string | null;
  focus_type: string;
  min_focus_distance: number | null;
  filter_size: number | null;
  weight_g: number | null;
  elements: number | null;
  groups: number | null;
  blade_count: number | null;
  is_macro: number;
  magnification_ratio: string | null;
  image_stabilization: number;
  production_year_start: number | null;
  production_year_end: number | null;
  serial_number: string | null;
  purchase_date: string | null;
  purchase_price: number | null;
  condition: string | null;
  notes: string | null;
  image_path: string | null;
  status: string;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
}

// Flash
interface Flash {
  id: number;
  name: string;
  brand: string | null;
  model: string | null;
  guide_number: number | null;
  ttl_compatible: number;
  has_auto_mode: number;
  swivel_head: number;
  bounce_head: number;
  power_source: string | null;
  recycle_time: number | null;
  serial_number: string | null;
  purchase_date: string | null;
  purchase_price: number | null;
  condition: string | null;
  notes: string | null;
  image_path: string | null;
  status: string;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
}

// Suggestions response
interface SuggestionsResponse {
  cameras: Partial<Camera>[];
  lenses: Partial<Lens>[];
  flashes: Partial<Flash>[];
  formats: FilmFormat[];
}

// Compatible lenses response
interface CompatibleLensesResponse {
  fixed_lens: boolean;
  camera_name: string;
  focal_length?: number | null;
  max_aperture?: string | null;
  camera_mount?: string | null;
  lenses: Partial<Lens>[];
  adapted_lenses?: Partial<Lens>[];
}

// Query interfaces
interface CameraQuery {
  mount?: string;
  type?: string;
  format_id?: string;
  status?: string;
  includeDeleted?: string;
}

interface LensQuery {
  mount?: string;
  status?: string;
  includeDeleted?: string;
  camera_id?: string;
}

interface FlashQuery {
  status?: string;
  includeDeleted?: string;
}

interface DeleteQuery {
  hard?: string;
}

// Multer file
interface MulterFile {
  filename: string;
  originalname: string;
  path: string;
  size: number;
  mimetype: string;
}

interface RequestWithFile extends Request {
  file?: MulterFile;
  params: { id: string };
}

// Run result
interface RunResult {
  lastID: number;
  changes: number;
}

// ============= Setup =============

// Ensure equipment images directory exists
const equipImagesDir = path.join(uploadsDir, 'equipment');
if (!fs.existsSync(equipImagesDir)) {
  fs.mkdirSync(equipImagesDir, { recursive: true });
}

// Multer config for equipment images
const storage: StorageEngine = multer.diskStorage({
  destination: (req, file, cb) => cb(null, equipImagesDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    const name = `${req.params.type || 'equip'}_${Date.now()}${ext}`;
    cb(null, name);
  }
});
const upload = multer({ storage, limits: { fileSize: 10 * 1024 * 1024 } }); // 10MB limit

// ========================================
// CONSTANTS
// ========================================

router.get('/constants', (req: Request, res: Response) => {
  res.json({
    cameraTypes: CAMERA_TYPES,
    lensMounts: LENS_MOUNTS,
    focusTypes: ['manual', 'auto', 'hybrid'],
    conditions: ['mint', 'excellent', 'good', 'fair', 'poor'],
    statuses: ['owned', 'sold', 'wishlist', 'borrowed'],
    // New specification constants (2026-01-12)
    meterTypes: ['none', 'match-needle', 'center-weighted', 'matrix', 'spot', 'evaluative'],
    shutterTypes: ['focal-plane', 'leaf', 'electronic', 'hybrid'],
    magnificationRatios: ['1:1', '1:2', '1:3', '1:4', '1:5', '1:10']
  });
});

// ========================================
// FILM FORMATS
// ========================================

router.get('/formats', async (req: Request, res: Response) => {
  try {
    const formats = await allAsync(`SELECT * FROM ref_film_formats ORDER BY name`) as FilmFormat[];
    res.json(formats);
  } catch (err) {
    console.error('[EQUIPMENT] Error fetching formats:', err);
    res.status(500).json({ error: (err as Error).message });
  }
});

router.post('/formats', async (req: Request, res: Response) => {
  try {
    const { name, description, frame_size } = req.body;
    if (!name) return res.status(400).json({ error: 'Name is required' });

    const result = await runAsync(
      `INSERT INTO ref_film_formats (name, description, frame_size) VALUES (?, ?, ?)`,
      [name, description || null, frame_size || null]
    ) as RunResult;
    
    const format = await getAsync(`SELECT * FROM ref_film_formats WHERE id = ?`, [result.lastID]) as FilmFormat;
    res.status(201).json(format);
  } catch (err) {
    console.error('[EQUIPMENT] Error creating format:', err);
    res.status(500).json({ error: (err as Error).message });
  }
});

// ========================================
// CAMERAS
// ========================================

router.get('/cameras', async (req: Request<{}, {}, {}, CameraQuery>, res: Response) => {
  try {
    const { mount, type, format_id, status, includeDeleted } = req.query;
    
    let sql = `
      SELECT c.*, f.name as format_name
      FROM equip_cameras c
      LEFT JOIN ref_film_formats f ON c.format_id = f.id
      WHERE 1=1
    `;
    const params: (string | number)[] = [];

    if (!includeDeleted) {
      sql += ` AND c.deleted_at IS NULL`;
    }
    if (mount) {
      sql += ` AND c.mount = ?`;
      params.push(mount);
    }
    if (type) {
      sql += ` AND c.type = ?`;
      params.push(type);
    }
    if (format_id) {
      sql += ` AND c.format_id = ?`;
      params.push(format_id);
    }
    if (status) {
      sql += ` AND c.status = ?`;
      params.push(status);
    }

    sql += ` ORDER BY c.brand, c.name`;

    const cameras = await allAsync(sql, params) as Camera[];
    res.json(cameras);
  } catch (err) {
    console.error('[EQUIPMENT] Error fetching cameras:', err);
    res.status(500).json({ error: (err as Error).message });
  }
});

router.get('/cameras/:id', async (req: Request<{ id: string }>, res: Response) => {
  try {
    const camera = await getAsync(`
      SELECT c.*, f.name as format_name
      FROM equip_cameras c
      LEFT JOIN ref_film_formats f ON c.format_id = f.id
      WHERE c.id = ?
    `, [req.params.id]) as Camera | undefined;
    
    if (!camera) return res.status(404).json({ error: 'Camera not found' });
    res.json(camera);
  } catch (err) {
    console.error('[EQUIPMENT] Error fetching camera:', err);
    res.status(500).json({ error: (err as Error).message });
  }
});

router.post('/cameras', async (req: Request, res: Response) => {
  try {
    const {
      name, brand, model, type, format_id, sub_format, mount,
      has_fixed_lens, fixed_lens_focal_length, fixed_lens_max_aperture, fixed_lens_min_aperture,
      has_built_in_flash, flash_gn,
      production_year_start, production_year_end,
      meter_type, shutter_type, shutter_speed_min, shutter_speed_max, weight_g, battery_type,
      serial_number, purchase_date, purchase_price, condition, notes, status
    } = req.body;

    if (!name) return res.status(400).json({ error: 'Name is required' });

    const result = await runAsync(`
      INSERT INTO equip_cameras (
        name, brand, model, type, format_id, sub_format, mount,
        has_fixed_lens, fixed_lens_focal_length, fixed_lens_max_aperture, fixed_lens_min_aperture,
        has_built_in_flash, flash_gn,
        production_year_start, production_year_end,
        meter_type, shutter_type, shutter_speed_min, shutter_speed_max, weight_g, battery_type,
        serial_number, purchase_date, purchase_price, condition, notes, status,
        updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    `, [
      name, brand || null, model || null, type || null, format_id || null, sub_format || null, mount || null,
      has_fixed_lens ? 1 : 0, fixed_lens_focal_length || null, fixed_lens_max_aperture || null, fixed_lens_min_aperture || null,
      has_built_in_flash ? 1 : 0, flash_gn || null,
      production_year_start || null, production_year_end || null,
      meter_type || null, shutter_type || null, shutter_speed_min || null, shutter_speed_max || null, weight_g || null, battery_type || null,
      serial_number || null, purchase_date || null, purchase_price || null, condition || null, notes || null, status || 'owned'
    ]) as RunResult;

    const camera = await getAsync(`SELECT * FROM equip_cameras WHERE id = ?`, [result.lastID]) as Camera;
    res.status(201).json(camera);
  } catch (err) {
    console.error('[EQUIPMENT] Error creating camera:', err);
    res.status(500).json({ error: (err as Error).message });
  }
});

router.put('/cameras/:id', async (req: Request<{ id: string }>, res: Response) => {
  try {
    const { id } = req.params;
    const fields = [
      'name', 'brand', 'model', 'type', 'format_id', 'sub_format', 'mount',
      'has_fixed_lens', 'fixed_lens_focal_length', 'fixed_lens_max_aperture', 'fixed_lens_min_aperture',
      'has_built_in_flash', 'flash_gn',
      'production_year_start', 'production_year_end',
      'meter_type', 'shutter_type', 'shutter_speed_min', 'shutter_speed_max', 'weight_g', 'battery_type',
      'serial_number', 'purchase_date', 'purchase_price', 'condition', 'notes', 'image_path', 'status'
    ];

    const updates: string[] = [];
    const params: (string | number | null)[] = [];
    
    for (const field of fields) {
      if (req.body[field] !== undefined) {
        updates.push(`${field} = ?`);
        let value = req.body[field];
        // Handle boolean fields
        if (field === 'has_fixed_lens' || field === 'has_built_in_flash') {
          value = value ? 1 : 0;
        }
        params.push(value);
      }
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    updates.push('updated_at = CURRENT_TIMESTAMP');
    params.push(id);

    await runAsync(`UPDATE equip_cameras SET ${updates.join(', ')} WHERE id = ?`, params);
    
    const camera = await getAsync(`SELECT * FROM equip_cameras WHERE id = ?`, [id]) as Camera;
    res.json(camera);
  } catch (err) {
    console.error('[EQUIPMENT] Error updating camera:', err);
    res.status(500).json({ error: (err as Error).message });
  }
});

router.delete('/cameras/:id', async (req: Request<{ id: string }, {}, {}, DeleteQuery>, res: Response) => {
  try {
    const { id } = req.params;
    const { hard } = req.query;

    if (hard === 'true') {
      await runAsync(`DELETE FROM equip_cameras WHERE id = ?`, [id]);
    } else {
      await runAsync(`UPDATE equip_cameras SET deleted_at = CURRENT_TIMESTAMP WHERE id = ?`, [id]);
    }
    
    res.json({ ok: true });
  } catch (err) {
    console.error('[EQUIPMENT] Error deleting camera:', err);
    res.status(500).json({ error: (err as Error).message });
  }
});

// Camera image upload
router.post('/cameras/:id/image', upload.single('image'), async (req: RequestWithFile, res: Response) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    
    const relativePath = `equipment/${req.file.filename}`;
    await runAsync(`UPDATE equip_cameras SET image_path = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`, 
      [relativePath, req.params.id]);
    
    res.json({ image_path: relativePath });
  } catch (err) {
    console.error('[EQUIPMENT] Error uploading camera image:', err);
    res.status(500).json({ error: (err as Error).message });
  }
});

// ========================================
// LENSES
// ========================================

router.get('/lenses', async (req: Request<{}, {}, {}, LensQuery>, res: Response) => {
  try {
    const { mount, status, includeDeleted, camera_id } = req.query;
    
    let sql = `SELECT * FROM equip_lenses WHERE 1=1`;
    const params: (string | number)[] = [];

    if (!includeDeleted) {
      sql += ` AND deleted_at IS NULL`;
    }
    if (mount) {
      sql += ` AND mount = ?`;
      params.push(mount);
    }
    if (status) {
      sql += ` AND status = ?`;
      params.push(status);
    }

    sql += ` ORDER BY brand, focal_length_min, name`;

    let lenses = await allAsync(sql, params) as Lens[];

    // If camera_id provided, filter by compatible mount
    if (camera_id) {
      const camera = await getAsync(`SELECT mount, has_fixed_lens FROM equip_cameras WHERE id = ?`, [camera_id]) as { mount: string | null; has_fixed_lens: number } | undefined;
      if (camera) {
        // If camera has fixed lens, return empty
        if (camera.has_fixed_lens) {
          return res.json([]);
        }
        // Filter lenses by mount compatibility
        if (camera.mount) {
          lenses = lenses.filter(l => l.mount === camera.mount || l.mount === 'Universal');
        }
      }
    }

    res.json(lenses);
  } catch (err) {
    console.error('[EQUIPMENT] Error fetching lenses:', err);
    res.status(500).json({ error: (err as Error).message });
  }
});

router.get('/lenses/:id', async (req: Request<{ id: string }>, res: Response) => {
  try {
    const lens = await getAsync(`SELECT * FROM equip_lenses WHERE id = ?`, [req.params.id]) as Lens | undefined;
    if (!lens) return res.status(404).json({ error: 'Lens not found' });
    res.json(lens);
  } catch (err) {
    console.error('[EQUIPMENT] Error fetching lens:', err);
    res.status(500).json({ error: (err as Error).message });
  }
});

router.post('/lenses', async (req: Request, res: Response) => {
  try {
    const {
      name, brand, model,
      focal_length_min, focal_length_max, max_aperture, min_aperture, max_aperture_tele,
      mount, focus_type, min_focus_distance, filter_size, weight_g,
      elements, groups, blade_count,
      is_macro, magnification_ratio, image_stabilization,
      production_year_start, production_year_end,
      serial_number, purchase_date, purchase_price, condition, notes, status
    } = req.body;

    if (!name) return res.status(400).json({ error: 'Name is required' });

    const result = await runAsync(`
      INSERT INTO equip_lenses (
        name, brand, model,
        focal_length_min, focal_length_max, max_aperture, min_aperture, max_aperture_tele,
        mount, focus_type, min_focus_distance, filter_size, weight_g,
        elements, groups, blade_count,
        is_macro, magnification_ratio, image_stabilization,
        production_year_start, production_year_end,
        serial_number, purchase_date, purchase_price, condition, notes, status,
        updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    `, [
      name, brand || null, model || null,
      focal_length_min || null, focal_length_max || null, max_aperture || null, min_aperture || null, max_aperture_tele || null,
      mount || null, focus_type || 'manual', min_focus_distance || null, filter_size || null, weight_g || null,
      elements || null, groups || null, blade_count || null,
      is_macro ? 1 : 0, magnification_ratio || null, image_stabilization ? 1 : 0,
      production_year_start || null, production_year_end || null,
      serial_number || null, purchase_date || null, purchase_price || null, condition || null, notes || null, status || 'owned'
    ]) as RunResult;

    const lens = await getAsync(`SELECT * FROM equip_lenses WHERE id = ?`, [result.lastID]) as Lens;
    res.status(201).json(lens);
  } catch (err) {
    console.error('[EQUIPMENT] Error creating lens:', err);
    res.status(500).json({ error: (err as Error).message });
  }
});

router.put('/lenses/:id', async (req: Request<{ id: string }>, res: Response) => {
  try {
    const { id } = req.params;
    const fields = [
      'name', 'brand', 'model',
      'focal_length_min', 'focal_length_max', 'max_aperture', 'min_aperture', 'max_aperture_tele',
      'mount', 'focus_type', 'min_focus_distance', 'filter_size', 'weight_g',
      'elements', 'groups', 'blade_count',
      'is_macro', 'magnification_ratio', 'image_stabilization',
      'production_year_start', 'production_year_end',
      'serial_number', 'purchase_date', 'purchase_price', 'condition', 'notes', 'image_path', 'status'
    ];

    const updates: string[] = [];
    const params: (string | number | null)[] = [];
    
    for (const field of fields) {
      if (req.body[field] !== undefined) {
        updates.push(`${field} = ?`);
        let value = req.body[field];
        // Handle boolean fields
        if (field === 'is_macro' || field === 'image_stabilization') {
          value = value ? 1 : 0;
        }
        params.push(value);
      }
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    updates.push('updated_at = CURRENT_TIMESTAMP');
    params.push(id);

    await runAsync(`UPDATE equip_lenses SET ${updates.join(', ')} WHERE id = ?`, params);
    
    const lens = await getAsync(`SELECT * FROM equip_lenses WHERE id = ?`, [id]) as Lens;
    res.json(lens);
  } catch (err) {
    console.error('[EQUIPMENT] Error updating lens:', err);
    res.status(500).json({ error: (err as Error).message });
  }
});

router.delete('/lenses/:id', async (req: Request<{ id: string }, {}, {}, DeleteQuery>, res: Response) => {
  try {
    const { id } = req.params;
    const { hard } = req.query;

    if (hard === 'true') {
      await runAsync(`DELETE FROM equip_lenses WHERE id = ?`, [id]);
    } else {
      await runAsync(`UPDATE equip_lenses SET deleted_at = CURRENT_TIMESTAMP WHERE id = ?`, [id]);
    }
    
    res.json({ ok: true });
  } catch (err) {
    console.error('[EQUIPMENT] Error deleting lens:', err);
    res.status(500).json({ error: (err as Error).message });
  }
});

// Lens image upload
router.post('/lenses/:id/image', upload.single('image'), async (req: RequestWithFile, res: Response) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    
    const relativePath = `equipment/${req.file.filename}`;
    await runAsync(`UPDATE equip_lenses SET image_path = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`, 
      [relativePath, req.params.id]);
    
    res.json({ image_path: relativePath });
  } catch (err) {
    console.error('[EQUIPMENT] Error uploading lens image:', err);
    res.status(500).json({ error: (err as Error).message });
  }
});

// ========================================
// FLASHES
// ========================================

router.get('/flashes', async (req: Request<{}, {}, {}, FlashQuery>, res: Response) => {
  try {
    const { status, includeDeleted } = req.query;
    
    let sql = `SELECT * FROM equip_flashes WHERE 1=1`;
    const params: string[] = [];

    if (!includeDeleted) {
      sql += ` AND deleted_at IS NULL`;
    }
    if (status) {
      sql += ` AND status = ?`;
      params.push(status);
    }

    sql += ` ORDER BY brand, name`;

    const flashes = await allAsync(sql, params) as Flash[];
    res.json(flashes);
  } catch (err) {
    console.error('[EQUIPMENT] Error fetching flashes:', err);
    res.status(500).json({ error: (err as Error).message });
  }
});

router.get('/flashes/:id', async (req: Request<{ id: string }>, res: Response) => {
  try {
    const flash = await getAsync(`SELECT * FROM equip_flashes WHERE id = ?`, [req.params.id]) as Flash | undefined;
    if (!flash) return res.status(404).json({ error: 'Flash not found' });
    res.json(flash);
  } catch (err) {
    console.error('[EQUIPMENT] Error fetching flash:', err);
    res.status(500).json({ error: (err as Error).message });
  }
});

router.post('/flashes', async (req: Request, res: Response) => {
  try {
    const {
      name, brand, model, guide_number,
      ttl_compatible, has_auto_mode, swivel_head, bounce_head,
      power_source, recycle_time,
      serial_number, purchase_date, purchase_price, condition, notes, status
    } = req.body;

    if (!name) return res.status(400).json({ error: 'Name is required' });

    const result = await runAsync(`
      INSERT INTO equip_flashes (
        name, brand, model, guide_number,
        ttl_compatible, has_auto_mode, swivel_head, bounce_head,
        power_source, recycle_time,
        serial_number, purchase_date, purchase_price, condition, notes, status,
        updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    `, [
      name, brand || null, model || null, guide_number || null,
      ttl_compatible ? 1 : 0, has_auto_mode ? 1 : 0, swivel_head ? 1 : 0, bounce_head ? 1 : 0,
      power_source || null, recycle_time || null,
      serial_number || null, purchase_date || null, purchase_price || null, condition || null, notes || null, status || 'owned'
    ]) as RunResult;

    const flash = await getAsync(`SELECT * FROM equip_flashes WHERE id = ?`, [result.lastID]) as Flash;
    res.status(201).json(flash);
  } catch (err) {
    console.error('[EQUIPMENT] Error creating flash:', err);
    res.status(500).json({ error: (err as Error).message });
  }
});

router.put('/flashes/:id', async (req: Request<{ id: string }>, res: Response) => {
  try {
    const { id } = req.params;
    const fields = [
      'name', 'brand', 'model', 'guide_number',
      'ttl_compatible', 'has_auto_mode', 'swivel_head', 'bounce_head',
      'power_source', 'recycle_time',
      'serial_number', 'purchase_date', 'purchase_price', 'condition', 'notes', 'image_path', 'status'
    ];

    const updates: string[] = [];
    const params: (string | number | null)[] = [];
    
    for (const field of fields) {
      if (req.body[field] !== undefined) {
        updates.push(`${field} = ?`);
        let value = req.body[field];
        // Handle boolean fields
        if (['ttl_compatible', 'has_auto_mode', 'swivel_head', 'bounce_head'].includes(field)) {
          value = value ? 1 : 0;
        }
        params.push(value);
      }
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    updates.push('updated_at = CURRENT_TIMESTAMP');
    params.push(id);

    await runAsync(`UPDATE equip_flashes SET ${updates.join(', ')} WHERE id = ?`, params);
    
    const flash = await getAsync(`SELECT * FROM equip_flashes WHERE id = ?`, [id]) as Flash;
    res.json(flash);
  } catch (err) {
    console.error('[EQUIPMENT] Error updating flash:', err);
    res.status(500).json({ error: (err as Error).message });
  }
});

router.delete('/flashes/:id', async (req: Request<{ id: string }, {}, {}, DeleteQuery>, res: Response) => {
  try {
    const { id } = req.params;
    const { hard } = req.query;

    if (hard === 'true') {
      await runAsync(`DELETE FROM equip_flashes WHERE id = ?`, [id]);
    } else {
      await runAsync(`UPDATE equip_flashes SET deleted_at = CURRENT_TIMESTAMP WHERE id = ?`, [id]);
    }
    
    res.json({ ok: true });
  } catch (err) {
    console.error('[EQUIPMENT] Error deleting flash:', err);
    res.status(500).json({ error: (err as Error).message });
  }
});

// Flash image upload
router.post('/flashes/:id/image', upload.single('image'), async (req: RequestWithFile, res: Response) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    
    const relativePath = `equipment/${req.file.filename}`;
    await runAsync(`UPDATE equip_flashes SET image_path = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`, 
      [relativePath, req.params.id]);
    
    res.json({ image_path: relativePath });
  } catch (err) {
    console.error('[EQUIPMENT] Error uploading flash image:', err);
    res.status(500).json({ error: (err as Error).message });
  }
});

// ========================================
// UNIFIED SUGGESTIONS (for backwards compatibility)
// ========================================

router.get('/suggestions', async (req: Request, res: Response) => {
  try {
    const cameras = await allAsync(`
      SELECT id, name, brand, model, mount, type, has_fixed_lens, 
             fixed_lens_focal_length, fixed_lens_max_aperture, image_path
      FROM equip_cameras 
      WHERE deleted_at IS NULL 
      ORDER BY brand, name
    `) as Partial<Camera>[];
    
    const lenses = await allAsync(`
      SELECT id, name, brand, model, mount, focal_length_min, focal_length_max, 
             max_aperture, focus_type, image_path
      FROM equip_lenses 
      WHERE deleted_at IS NULL 
      ORDER BY brand, focal_length_min, name
    `) as Partial<Lens>[];
    
    const flashes = await allAsync(`
      SELECT id, name, brand, model, guide_number, image_path
      FROM equip_flashes 
      WHERE deleted_at IS NULL 
      ORDER BY brand, name
    `) as Partial<Flash>[];

    const formats = await allAsync(`SELECT * FROM ref_film_formats ORDER BY name`) as FilmFormat[];

    const response: SuggestionsResponse = { cameras, lenses, flashes, formats };
    res.json(response);
  } catch (err) {
    console.error('[EQUIPMENT] Error fetching suggestions:', err);
    res.status(500).json({ error: (err as Error).message });
  }
});

// ========================================
// MOUNT COMPATIBILITY CHECK
// ========================================

router.get('/compatible-lenses/:cameraId', async (req: Request<{ cameraId: string }>, res: Response) => {
  try {
    interface CameraWithMount {
      id: number;
      brand: string | null;
      model: string | null;
      mount: string | null;
      has_fixed_lens: number;
      fixed_lens_focal_length: number | null;
      fixed_lens_max_aperture: string | null;
    }
    
    const camera = await getAsync(`
      SELECT id, brand, model, mount, has_fixed_lens, fixed_lens_focal_length, fixed_lens_max_aperture 
      FROM equip_cameras WHERE id = ?
    `, [req.params.cameraId]) as CameraWithMount | undefined;

    if (!camera) {
      return res.status(404).json({ error: 'Camera not found' });
    }
    
    const cameraName = `${camera.brand || ''} ${camera.model || ''}`.trim();

    // If camera has fixed lens, return that info
    if (camera.has_fixed_lens) {
      const response: CompatibleLensesResponse = {
        fixed_lens: true,
        camera_name: cameraName,
        focal_length: camera.fixed_lens_focal_length,
        max_aperture: camera.fixed_lens_max_aperture,
        lenses: [],
        adapted_lenses: []
      };
      return res.json(response);
    }

    // Get native lenses (matching mount or Universal)
    let nativeLenses: Partial<Lens>[] = [];
    let adaptedLenses: Partial<Lens>[] = [];
    
    if (camera.mount) {
      // Native lenses: exact mount match or Universal
      nativeLenses = await allAsync(`
        SELECT id, name, brand, model, mount, focal_length_min, focal_length_max, 
               max_aperture, focus_type, image_path
        FROM equip_lenses 
        WHERE deleted_at IS NULL AND (mount = ? OR mount = 'Universal')
        ORDER BY brand, focal_length_min, name
      `, [camera.mount]) as Partial<Lens>[];
      
      // Adapted lenses: different mount (can be adapted to camera)
      adaptedLenses = await allAsync(`
        SELECT id, name, brand, model, mount, focal_length_min, focal_length_max, 
               max_aperture, focus_type, image_path
        FROM equip_lenses 
        WHERE deleted_at IS NULL AND mount != ? AND mount != 'Universal'
        ORDER BY mount, brand, focal_length_min, name
      `, [camera.mount]) as Partial<Lens>[];
    } else {
      // No mount specified, return all lenses as native
      nativeLenses = await allAsync(`
        SELECT id, name, brand, model, mount, focal_length_min, focal_length_max, 
               max_aperture, focus_type, image_path
        FROM equip_lenses 
        WHERE deleted_at IS NULL
        ORDER BY brand, focal_length_min, name
      `) as Partial<Lens>[];
    }

    const response: CompatibleLensesResponse = {
      fixed_lens: false,
      camera_name: cameraName,
      camera_mount: camera.mount || undefined,
      lenses: nativeLenses,
      adapted_lenses: adaptedLenses
    };
    res.json(response);
  } catch (err) {
    console.error('[EQUIPMENT] Error fetching compatible lenses:', err);
    res.status(500).json({ error: (err as Error).message });
  }
});

// CommonJS export for compatibility
module.exports = router;
export default router;
