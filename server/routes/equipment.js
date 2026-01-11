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

const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { uploadsDir } = require('../config/paths');
const { CAMERA_TYPES, LENS_MOUNTS } = require('../utils/equipment-migration');

// Ensure equipment images directory exists
const equipImagesDir = path.join(uploadsDir, 'equipment');
if (!fs.existsSync(equipImagesDir)) {
  fs.mkdirSync(equipImagesDir, { recursive: true });
}

// Multer config for equipment images
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, equipImagesDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    const name = `${req.params.type || 'equip'}_${Date.now()}${ext}`;
    cb(null, name);
  }
});
const upload = multer({ storage, limits: { fileSize: 10 * 1024 * 1024 } }); // 10MB limit

// Lazy-load db to avoid circular dependency
let db;
function getDb() {
  if (!db) db = require('../db');
  return db;
}

// Helper: promisified db methods
const runAsync = (sql, params = []) => {
  return new Promise((resolve, reject) => {
    getDb().run(sql, params, function(err) {
      if (err) reject(err);
      else resolve({ lastID: this.lastID, changes: this.changes });
    });
  });
};

const allAsync = (sql, params = []) => {
  return new Promise((resolve, reject) => {
    getDb().all(sql, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows || []);
    });
  });
};

const getAsync = (sql, params = []) => {
  return new Promise((resolve, reject) => {
    getDb().get(sql, params, (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  });
};

// ========================================
// CONSTANTS
// ========================================

router.get('/constants', (req, res) => {
  res.json({
    cameraTypes: CAMERA_TYPES,
    lensMounts: LENS_MOUNTS,
    focusTypes: ['manual', 'auto', 'hybrid'],
    conditions: ['mint', 'excellent', 'good', 'fair', 'poor'],
    statuses: ['owned', 'sold', 'wishlist', 'borrowed']
  });
});

// ========================================
// FILM FORMATS
// ========================================

router.get('/formats', async (req, res) => {
  try {
    const formats = await allAsync(`SELECT * FROM ref_film_formats ORDER BY name`);
    res.json(formats);
  } catch (err) {
    console.error('[EQUIPMENT] Error fetching formats:', err);
    res.status(500).json({ error: err.message });
  }
});

router.post('/formats', async (req, res) => {
  try {
    const { name, description, frame_size } = req.body;
    if (!name) return res.status(400).json({ error: 'Name is required' });

    const result = await runAsync(
      `INSERT INTO ref_film_formats (name, description, frame_size) VALUES (?, ?, ?)`,
      [name, description || null, frame_size || null]
    );
    
    const format = await getAsync(`SELECT * FROM ref_film_formats WHERE id = ?`, [result.lastID]);
    res.status(201).json(format);
  } catch (err) {
    console.error('[EQUIPMENT] Error creating format:', err);
    res.status(500).json({ error: err.message });
  }
});

// ========================================
// CAMERAS
// ========================================

router.get('/cameras', async (req, res) => {
  try {
    const { mount, type, format_id, status, includeDeleted } = req.query;
    
    let sql = `
      SELECT c.*, f.name as format_name
      FROM equip_cameras c
      LEFT JOIN ref_film_formats f ON c.format_id = f.id
      WHERE 1=1
    `;
    const params = [];

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

    const cameras = await allAsync(sql, params);
    res.json(cameras);
  } catch (err) {
    console.error('[EQUIPMENT] Error fetching cameras:', err);
    res.status(500).json({ error: err.message });
  }
});

router.get('/cameras/:id', async (req, res) => {
  try {
    const camera = await getAsync(`
      SELECT c.*, f.name as format_name
      FROM equip_cameras c
      LEFT JOIN ref_film_formats f ON c.format_id = f.id
      WHERE c.id = ?
    `, [req.params.id]);
    
    if (!camera) return res.status(404).json({ error: 'Camera not found' });
    res.json(camera);
  } catch (err) {
    console.error('[EQUIPMENT] Error fetching camera:', err);
    res.status(500).json({ error: err.message });
  }
});

router.post('/cameras', async (req, res) => {
  try {
    const {
      name, brand, model, type, format_id, sub_format, mount,
      has_fixed_lens, fixed_lens_focal_length, fixed_lens_max_aperture, fixed_lens_min_aperture,
      has_built_in_flash, flash_gn,
      production_year_start, production_year_end,
      serial_number, purchase_date, purchase_price, condition, notes, status
    } = req.body;

    if (!name) return res.status(400).json({ error: 'Name is required' });

    const result = await runAsync(`
      INSERT INTO equip_cameras (
        name, brand, model, type, format_id, sub_format, mount,
        has_fixed_lens, fixed_lens_focal_length, fixed_lens_max_aperture, fixed_lens_min_aperture,
        has_built_in_flash, flash_gn,
        production_year_start, production_year_end,
        serial_number, purchase_date, purchase_price, condition, notes, status,
        updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    `, [
      name, brand || null, model || null, type || null, format_id || null, sub_format || null, mount || null,
      has_fixed_lens ? 1 : 0, fixed_lens_focal_length || null, fixed_lens_max_aperture || null, fixed_lens_min_aperture || null,
      has_built_in_flash ? 1 : 0, flash_gn || null,
      production_year_start || null, production_year_end || null,
      serial_number || null, purchase_date || null, purchase_price || null, condition || null, notes || null, status || 'owned'
    ]);

    const camera = await getAsync(`SELECT * FROM equip_cameras WHERE id = ?`, [result.lastID]);
    res.status(201).json(camera);
  } catch (err) {
    console.error('[EQUIPMENT] Error creating camera:', err);
    res.status(500).json({ error: err.message });
  }
});

router.put('/cameras/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const fields = [
      'name', 'brand', 'model', 'type', 'format_id', 'sub_format', 'mount',
      'has_fixed_lens', 'fixed_lens_focal_length', 'fixed_lens_max_aperture', 'fixed_lens_min_aperture',
      'has_built_in_flash', 'flash_gn',
      'production_year_start', 'production_year_end',
      'serial_number', 'purchase_date', 'purchase_price', 'condition', 'notes', 'image_path', 'status'
    ];

    const updates = [];
    const params = [];
    
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
    
    const camera = await getAsync(`SELECT * FROM equip_cameras WHERE id = ?`, [id]);
    res.json(camera);
  } catch (err) {
    console.error('[EQUIPMENT] Error updating camera:', err);
    res.status(500).json({ error: err.message });
  }
});

router.delete('/cameras/:id', async (req, res) => {
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
    res.status(500).json({ error: err.message });
  }
});

// Camera image upload
router.post('/cameras/:id/image', upload.single('image'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    
    const relativePath = `equipment/${req.file.filename}`;
    await runAsync(`UPDATE equip_cameras SET image_path = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`, 
      [relativePath, req.params.id]);
    
    res.json({ image_path: relativePath });
  } catch (err) {
    console.error('[EQUIPMENT] Error uploading camera image:', err);
    res.status(500).json({ error: err.message });
  }
});

// ========================================
// LENSES
// ========================================

router.get('/lenses', async (req, res) => {
  try {
    const { mount, status, includeDeleted, camera_id } = req.query;
    
    let sql = `SELECT * FROM equip_lenses WHERE 1=1`;
    const params = [];

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

    let lenses = await allAsync(sql, params);

    // If camera_id provided, filter by compatible mount
    if (camera_id) {
      const camera = await getAsync(`SELECT mount, has_fixed_lens FROM equip_cameras WHERE id = ?`, [camera_id]);
      if (camera) {
        // If camera has fixed lens, return empty (or could return camera's built-in lens info)
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
    res.status(500).json({ error: err.message });
  }
});

router.get('/lenses/:id', async (req, res) => {
  try {
    const lens = await getAsync(`SELECT * FROM equip_lenses WHERE id = ?`, [req.params.id]);
    if (!lens) return res.status(404).json({ error: 'Lens not found' });
    res.json(lens);
  } catch (err) {
    console.error('[EQUIPMENT] Error fetching lens:', err);
    res.status(500).json({ error: err.message });
  }
});

router.post('/lenses', async (req, res) => {
  try {
    const {
      name, brand, model,
      focal_length_min, focal_length_max, max_aperture, min_aperture,
      mount, focus_type, min_focus_distance, filter_size, weight_g,
      elements, groups, blade_count,
      production_year_start, production_year_end,
      serial_number, purchase_date, purchase_price, condition, notes, status
    } = req.body;

    if (!name) return res.status(400).json({ error: 'Name is required' });

    const result = await runAsync(`
      INSERT INTO equip_lenses (
        name, brand, model,
        focal_length_min, focal_length_max, max_aperture, min_aperture,
        mount, focus_type, min_focus_distance, filter_size, weight_g,
        elements, groups, blade_count,
        production_year_start, production_year_end,
        serial_number, purchase_date, purchase_price, condition, notes, status,
        updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    `, [
      name, brand || null, model || null,
      focal_length_min || null, focal_length_max || null, max_aperture || null, min_aperture || null,
      mount || null, focus_type || 'manual', min_focus_distance || null, filter_size || null, weight_g || null,
      elements || null, groups || null, blade_count || null,
      production_year_start || null, production_year_end || null,
      serial_number || null, purchase_date || null, purchase_price || null, condition || null, notes || null, status || 'owned'
    ]);

    const lens = await getAsync(`SELECT * FROM equip_lenses WHERE id = ?`, [result.lastID]);
    res.status(201).json(lens);
  } catch (err) {
    console.error('[EQUIPMENT] Error creating lens:', err);
    res.status(500).json({ error: err.message });
  }
});

router.put('/lenses/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const fields = [
      'name', 'brand', 'model',
      'focal_length_min', 'focal_length_max', 'max_aperture', 'min_aperture',
      'mount', 'focus_type', 'min_focus_distance', 'filter_size', 'weight_g',
      'elements', 'groups', 'blade_count',
      'production_year_start', 'production_year_end',
      'serial_number', 'purchase_date', 'purchase_price', 'condition', 'notes', 'image_path', 'status'
    ];

    const updates = [];
    const params = [];
    
    for (const field of fields) {
      if (req.body[field] !== undefined) {
        updates.push(`${field} = ?`);
        params.push(req.body[field]);
      }
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    updates.push('updated_at = CURRENT_TIMESTAMP');
    params.push(id);

    await runAsync(`UPDATE equip_lenses SET ${updates.join(', ')} WHERE id = ?`, params);
    
    const lens = await getAsync(`SELECT * FROM equip_lenses WHERE id = ?`, [id]);
    res.json(lens);
  } catch (err) {
    console.error('[EQUIPMENT] Error updating lens:', err);
    res.status(500).json({ error: err.message });
  }
});

router.delete('/lenses/:id', async (req, res) => {
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
    res.status(500).json({ error: err.message });
  }
});

// Lens image upload
router.post('/lenses/:id/image', upload.single('image'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    
    const relativePath = `equipment/${req.file.filename}`;
    await runAsync(`UPDATE equip_lenses SET image_path = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`, 
      [relativePath, req.params.id]);
    
    res.json({ image_path: relativePath });
  } catch (err) {
    console.error('[EQUIPMENT] Error uploading lens image:', err);
    res.status(500).json({ error: err.message });
  }
});

// ========================================
// FLASHES
// ========================================

router.get('/flashes', async (req, res) => {
  try {
    const { status, includeDeleted } = req.query;
    
    let sql = `SELECT * FROM equip_flashes WHERE 1=1`;
    const params = [];

    if (!includeDeleted) {
      sql += ` AND deleted_at IS NULL`;
    }
    if (status) {
      sql += ` AND status = ?`;
      params.push(status);
    }

    sql += ` ORDER BY brand, name`;

    const flashes = await allAsync(sql, params);
    res.json(flashes);
  } catch (err) {
    console.error('[EQUIPMENT] Error fetching flashes:', err);
    res.status(500).json({ error: err.message });
  }
});

router.get('/flashes/:id', async (req, res) => {
  try {
    const flash = await getAsync(`SELECT * FROM equip_flashes WHERE id = ?`, [req.params.id]);
    if (!flash) return res.status(404).json({ error: 'Flash not found' });
    res.json(flash);
  } catch (err) {
    console.error('[EQUIPMENT] Error fetching flash:', err);
    res.status(500).json({ error: err.message });
  }
});

router.post('/flashes', async (req, res) => {
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
    ]);

    const flash = await getAsync(`SELECT * FROM equip_flashes WHERE id = ?`, [result.lastID]);
    res.status(201).json(flash);
  } catch (err) {
    console.error('[EQUIPMENT] Error creating flash:', err);
    res.status(500).json({ error: err.message });
  }
});

router.put('/flashes/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const fields = [
      'name', 'brand', 'model', 'guide_number',
      'ttl_compatible', 'has_auto_mode', 'swivel_head', 'bounce_head',
      'power_source', 'recycle_time',
      'serial_number', 'purchase_date', 'purchase_price', 'condition', 'notes', 'image_path', 'status'
    ];

    const updates = [];
    const params = [];
    
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
    
    const flash = await getAsync(`SELECT * FROM equip_flashes WHERE id = ?`, [id]);
    res.json(flash);
  } catch (err) {
    console.error('[EQUIPMENT] Error updating flash:', err);
    res.status(500).json({ error: err.message });
  }
});

router.delete('/flashes/:id', async (req, res) => {
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
    res.status(500).json({ error: err.message });
  }
});

// Flash image upload
router.post('/flashes/:id/image', upload.single('image'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    
    const relativePath = `equipment/${req.file.filename}`;
    await runAsync(`UPDATE equip_flashes SET image_path = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`, 
      [relativePath, req.params.id]);
    
    res.json({ image_path: relativePath });
  } catch (err) {
    console.error('[EQUIPMENT] Error uploading flash image:', err);
    res.status(500).json({ error: err.message });
  }
});

// ========================================
// UNIFIED SUGGESTIONS (for backwards compatibility)
// ========================================

router.get('/suggestions', async (req, res) => {
  try {
    const cameras = await allAsync(`
      SELECT id, name, brand, model, mount, type, has_fixed_lens, 
             fixed_lens_focal_length, fixed_lens_max_aperture, image_path
      FROM equip_cameras 
      WHERE deleted_at IS NULL 
      ORDER BY brand, name
    `);
    
    const lenses = await allAsync(`
      SELECT id, name, brand, model, mount, focal_length_min, focal_length_max, 
             max_aperture, focus_type, image_path
      FROM equip_lenses 
      WHERE deleted_at IS NULL 
      ORDER BY brand, focal_length_min, name
    `);
    
    const flashes = await allAsync(`
      SELECT id, name, brand, model, guide_number, image_path
      FROM equip_flashes 
      WHERE deleted_at IS NULL 
      ORDER BY brand, name
    `);

    const formats = await allAsync(`SELECT * FROM ref_film_formats ORDER BY name`);

    res.json({ cameras, lenses, flashes, formats });
  } catch (err) {
    console.error('[EQUIPMENT] Error fetching suggestions:', err);
    res.status(500).json({ error: err.message });
  }
});

// ========================================
// MOUNT COMPATIBILITY CHECK
// ========================================

router.get('/compatible-lenses/:cameraId', async (req, res) => {
  try {
    const camera = await getAsync(`
      SELECT mount, has_fixed_lens, fixed_lens_focal_length, fixed_lens_max_aperture 
      FROM equip_cameras WHERE id = ?
    `, [req.params.cameraId]);

    if (!camera) {
      return res.status(404).json({ error: 'Camera not found' });
    }

    // If camera has fixed lens, return that info
    if (camera.has_fixed_lens) {
      return res.json({
        fixed_lens: true,
        focal_length: camera.fixed_lens_focal_length,
        max_aperture: camera.fixed_lens_max_aperture,
        lenses: []
      });
    }

    // Get lenses with matching mount
    let lenses;
    if (camera.mount) {
      lenses = await allAsync(`
        SELECT id, name, brand, model, mount, focal_length_min, focal_length_max, 
               max_aperture, focus_type, image_path
        FROM equip_lenses 
        WHERE deleted_at IS NULL AND (mount = ? OR mount = 'Universal')
        ORDER BY brand, focal_length_min, name
      `, [camera.mount]);
    } else {
      // No mount specified, return all lenses
      lenses = await allAsync(`
        SELECT id, name, brand, model, mount, focal_length_min, focal_length_max, 
               max_aperture, focus_type, image_path
        FROM equip_lenses 
        WHERE deleted_at IS NULL
        ORDER BY brand, focal_length_min, name
      `);
    }

    res.json({
      fixed_lens: false,
      camera_mount: camera.mount,
      lenses
    });
  } catch (err) {
    console.error('[EQUIPMENT] Error fetching compatible lenses:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
