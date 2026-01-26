/**
 * Equipment Service - Centralized business logic for equipment management
 * 
 * Provides generic CRUD operations for all equipment types:
 * - Cameras, Lenses, Flashes, Scanners, Film Backs, Film Formats
 * 
 * Extracts common patterns to reduce code duplication in routes.
 */

const { runAsync, allAsync, getAsync } = require('../utils/db-helpers');

/**
 * Equipment type configurations
 * Defines table names, field mappings, and boolean field handling
 */
const EQUIPMENT_CONFIG = {
  cameras: {
    table: 'equip_cameras',
    displayName: 'Camera',
    fields: [
      'name', 'brand', 'model', 'type', 'format_id', 'sub_format', 'mount',
      'has_fixed_lens', 'fixed_lens_focal_length', 'fixed_lens_max_aperture', 'fixed_lens_min_aperture',
      'has_built_in_flash', 'flash_gn',
      'production_year_start', 'production_year_end',
      'meter_type', 'shutter_type', 'shutter_speed_min', 'shutter_speed_max', 'weight_g', 'battery_type',
      'serial_number', 'purchase_date', 'purchase_price', 'condition', 'notes', 'image_path', 'status'
    ],
    booleanFields: ['has_fixed_lens', 'has_built_in_flash'],
    requiredFields: ['name'],
    defaultValues: { status: 'owned' },
    listJoin: `
      SELECT c.*, f.name as format_name
      FROM equip_cameras c
      LEFT JOIN ref_film_formats f ON c.format_id = f.id
    `,
    listAlias: 'c'
  },
  lenses: {
    table: 'equip_lenses',
    displayName: 'Lens',
    fields: [
      'name', 'brand', 'model',
      'focal_length_min', 'focal_length_max', 'max_aperture', 'min_aperture', 'max_aperture_tele',
      'mount', 'focus_type', 'min_focus_distance', 'filter_size', 'weight_g',
      'elements', 'groups', 'blade_count',
      'is_macro', 'magnification_ratio', 'image_stabilization',
      'production_year_start', 'production_year_end',
      'serial_number', 'purchase_date', 'purchase_price', 'condition', 'notes', 'image_path', 'status'
    ],
    booleanFields: ['is_macro', 'image_stabilization'],
    requiredFields: ['name'],
    defaultValues: { status: 'owned', focus_type: 'manual' }
  },
  flashes: {
    table: 'equip_flashes',
    displayName: 'Flash',
    fields: [
      'name', 'brand', 'model', 'guide_number',
      'ttl_compatible', 'has_auto_mode', 'swivel_head', 'bounce_head',
      'power_source', 'recycle_time',
      'serial_number', 'purchase_date', 'purchase_price', 'condition', 'notes', 'image_path', 'status'
    ],
    booleanFields: ['ttl_compatible', 'has_auto_mode', 'swivel_head', 'bounce_head'],
    requiredFields: ['name'],
    defaultValues: { status: 'owned' }
  },
  scanners: {
    table: 'equip_scanners',
    displayName: 'Scanner',
    fields: [
      'name', 'brand', 'model', 'type', 'max_resolution', 'sensor_type', 'supported_formats',
      'has_infrared_cleaning', 'bit_depth', 'default_software',
      'camera_equip_id', 'lens_equip_id',
      'serial_number', 'purchase_date', 'purchase_price', 'condition', 'notes', 'image_path', 'status'
    ],
    booleanFields: ['has_infrared_cleaning'],
    requiredFields: ['name'],
    defaultValues: { status: 'owned' }
  },
  'film-backs': {
    table: 'equip_film_backs',
    displayName: 'Film Back',
    fields: [
      'name', 'brand', 'model',
      'format', 'sub_format', 'frame_width_mm', 'frame_height_mm', 'frames_per_roll',
      'compatible_cameras', 'mount_type',
      'magazine_type', 'is_motorized', 'has_dark_slide',
      'serial_number', 'purchase_date', 'purchase_price', 'condition', 'notes', 'image_path', 'status'
    ],
    booleanFields: ['is_motorized', 'has_dark_slide'],
    requiredFields: ['name'],
    defaultValues: { status: 'owned', format: '120', has_dark_slide: true }
  },
  formats: {
    table: 'ref_film_formats',
    displayName: 'Film Format',
    fields: ['name', 'description', 'frame_size'],
    booleanFields: [],
    requiredFields: ['name'],
    defaultValues: {},
    noSoftDelete: true // Formats use hard delete only
  }
};

/**
 * Convert value based on field type
 */
function convertValue(field, value, config) {
  if (config.booleanFields.includes(field)) {
    return value ? 1 : 0;
  }
  return value;
}

/**
 * Apply default values to data object
 */
function applyDefaults(data, config) {
  const result = { ...data };
  for (const [key, defaultValue] of Object.entries(config.defaultValues || {})) {
    if (result[key] === undefined) {
      result[key] = defaultValue;
    }
  }
  return result;
}

/**
 * Validate required fields
 */
function validateRequired(data, config) {
  for (const field of config.requiredFields) {
    if (!data[field]) {
      throw new Error(`${field} is required`);
    }
  }
}

// ========================================
// GENERIC CRUD OPERATIONS
// ========================================

/**
 * List equipment with optional filters
 */
async function listEquipment(type, filters = {}) {
  const config = EQUIPMENT_CONFIG[type];
  if (!config) throw new Error(`Unknown equipment type: ${type}`);

  const alias = config.listAlias || '';
  const prefix = alias ? `${alias}.` : '';
  
  let sql = config.listJoin || `SELECT * FROM ${config.table}`;
  sql += ` WHERE 1=1`;
  
  const params = [];

  // Handle soft delete
  if (!config.noSoftDelete && !filters.includeDeleted) {
    sql += ` AND ${prefix}deleted_at IS NULL`;
  }

  // Apply dynamic filters
  for (const [key, value] of Object.entries(filters)) {
    if (value === undefined || key === 'includeDeleted') continue;
    sql += ` AND ${prefix}${key} = ?`;
    params.push(value);
  }

  sql += ` ORDER BY ${prefix}brand, ${prefix}name`;

  return allAsync(sql, params);
}

/**
 * Get single equipment by ID
 */
async function getEquipmentById(type, id) {
  const config = EQUIPMENT_CONFIG[type];
  if (!config) throw new Error(`Unknown equipment type: ${type}`);

  // Use join query if available
  if (config.listJoin) {
    const sql = config.listJoin + ` WHERE ${config.listAlias || ''}.id = ?`;
    return getAsync(sql.replace('WHERE 1=1', ''), [id]);
  }

  return getAsync(`SELECT * FROM ${config.table} WHERE id = ?`, [id]);
}

/**
 * Create new equipment
 */
async function createEquipment(type, data) {
  const config = EQUIPMENT_CONFIG[type];
  if (!config) throw new Error(`Unknown equipment type: ${type}`);

  validateRequired(data, config);
  const finalData = applyDefaults(data, config);

  const fieldsToInsert = config.fields.filter(f => f !== 'image_path');
  const values = fieldsToInsert.map(f => convertValue(f, finalData[f] ?? null, config));
  
  const columns = fieldsToInsert.join(', ');
  const placeholders = fieldsToInsert.map(() => '?').join(', ');
  
  // Add updated_at for tables that have it
  const hasUpdatedAt = !config.noSoftDelete;
  const sql = hasUpdatedAt
    ? `INSERT INTO ${config.table} (${columns}, updated_at) VALUES (${placeholders}, CURRENT_TIMESTAMP)`
    : `INSERT INTO ${config.table} (${columns}) VALUES (${placeholders})`;

  const result = await runAsync(sql, values);
  return getAsync(`SELECT * FROM ${config.table} WHERE id = ?`, [result.lastID]);
}

/**
 * Update equipment by ID
 */
async function updateEquipment(type, id, data) {
  const config = EQUIPMENT_CONFIG[type];
  if (!config) throw new Error(`Unknown equipment type: ${type}`);

  const updates = [];
  const params = [];

  for (const field of config.fields) {
    if (data[field] !== undefined) {
      updates.push(`${field} = ?`);
      params.push(convertValue(field, data[field], config));
    }
  }

  if (updates.length === 0) {
    throw new Error('No fields to update');
  }

  // Add updated_at for tables that have it
  if (!config.noSoftDelete) {
    updates.push('updated_at = CURRENT_TIMESTAMP');
  }
  params.push(id);

  await runAsync(`UPDATE ${config.table} SET ${updates.join(', ')} WHERE id = ?`, params);
  return getAsync(`SELECT * FROM ${config.table} WHERE id = ?`, [id]);
}

/**
 * Delete equipment (soft or hard)
 */
async function deleteEquipment(type, id, hard = false) {
  const config = EQUIPMENT_CONFIG[type];
  if (!config) throw new Error(`Unknown equipment type: ${type}`);

  if (hard || config.noSoftDelete) {
    await runAsync(`DELETE FROM ${config.table} WHERE id = ?`, [id]);
  } else {
    await runAsync(
      `UPDATE ${config.table} SET deleted_at = CURRENT_TIMESTAMP WHERE id = ?`,
      [id]
    );
  }

  return { ok: true };
}

/**
 * Update equipment image path
 */
async function updateEquipmentImage(type, id, imagePath) {
  const config = EQUIPMENT_CONFIG[type];
  if (!config) throw new Error(`Unknown equipment type: ${type}`);

  if (config.noSoftDelete) {
    throw new Error(`${config.displayName} does not support images`);
  }

  await runAsync(
    `UPDATE ${config.table} SET image_path = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
    [imagePath, id]
  );

  return { image_path: imagePath };
}

// ========================================
// SPECIALIZED QUERIES
// ========================================

/**
 * Get all equipment suggestions (for dropdowns)
 */
async function getEquipmentSuggestions() {
  const [cameras, lenses, flashes, formats] = await Promise.all([
    allAsync(`
      SELECT id, name, brand, model, mount, type, has_fixed_lens, 
             fixed_lens_focal_length, fixed_lens_max_aperture, image_path
      FROM equip_cameras 
      WHERE deleted_at IS NULL 
      ORDER BY brand, name
    `),
    allAsync(`
      SELECT id, name, brand, model, mount, focal_length_min, focal_length_max, 
             max_aperture, focus_type, image_path
      FROM equip_lenses 
      WHERE deleted_at IS NULL 
      ORDER BY brand, focal_length_min, name
    `),
    allAsync(`
      SELECT id, name, brand, model, guide_number, image_path
      FROM equip_flashes 
      WHERE deleted_at IS NULL 
      ORDER BY brand, name
    `),
    allAsync(`SELECT * FROM ref_film_formats ORDER BY name`)
  ]);

  return { cameras, lenses, flashes, formats };
}

/**
 * Get compatible lenses for a camera
 */
async function getCompatibleLenses(cameraId) {
  const camera = await getAsync(`
    SELECT id, brand, model, mount, has_fixed_lens, fixed_lens_focal_length, fixed_lens_max_aperture 
    FROM equip_cameras WHERE id = ?
  `, [cameraId]);

  if (!camera) {
    return null;
  }

  const cameraName = `${camera.brand || ''} ${camera.model || ''}`.trim();

  // If camera has fixed lens, return that info
  if (camera.has_fixed_lens) {
    return {
      fixed_lens: true,
      camera_name: cameraName,
      focal_length: camera.fixed_lens_focal_length,
      max_aperture: camera.fixed_lens_max_aperture,
      lenses: [],
      adapted_lenses: []
    };
  }

  let nativeLenses = [];
  let adaptedLenses = [];

  if (camera.mount) {
    // Native lenses: exact mount match or Universal
    nativeLenses = await allAsync(`
      SELECT id, name, brand, model, mount, focal_length_min, focal_length_max, 
             max_aperture, focus_type, image_path
      FROM equip_lenses 
      WHERE deleted_at IS NULL AND (mount = ? OR mount = 'Universal')
      ORDER BY brand, focal_length_min, name
    `, [camera.mount]);

    // Adapted lenses: different mount
    adaptedLenses = await allAsync(`
      SELECT id, name, brand, model, mount, focal_length_min, focal_length_max, 
             max_aperture, focus_type, image_path
      FROM equip_lenses 
      WHERE deleted_at IS NULL AND mount != ? AND mount != 'Universal'
      ORDER BY mount, brand, focal_length_min, name
    `, [camera.mount]);
  } else {
    nativeLenses = await allAsync(`
      SELECT id, name, brand, model, mount, focal_length_min, focal_length_max, 
             max_aperture, focus_type, image_path
      FROM equip_lenses 
      WHERE deleted_at IS NULL
      ORDER BY brand, focal_length_min, name
    `);
  }

  return {
    fixed_lens: false,
    camera_name: cameraName,
    camera_mount: camera.mount,
    lenses: nativeLenses,
    adapted_lenses: adaptedLenses
  };
}

/**
 * Get lenses filtered by camera compatibility
 */
async function getLensesByCamera(cameraId, lenses) {
  const camera = await getAsync(
    `SELECT mount, has_fixed_lens FROM equip_cameras WHERE id = ?`,
    [cameraId]
  );

  if (!camera) return lenses;

  if (camera.has_fixed_lens) {
    return [];
  }

  if (camera.mount) {
    return lenses.filter(l => l.mount === camera.mount || l.mount === 'Universal');
  }

  return lenses;
}

module.exports = {
  EQUIPMENT_CONFIG,
  listEquipment,
  getEquipmentById,
  createEquipment,
  updateEquipment,
  deleteEquipment,
  updateEquipmentImage,
  getEquipmentSuggestions,
  getCompatibleLenses,
  getLensesByCamera
};
