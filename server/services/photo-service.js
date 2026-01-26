/**
 * Photo Service
 * 
 * Business logic and database operations for photos.
 * Separates concerns from the controller layer (routes/rolls.js, routes/photos.js).
 * 
 * @module server/services/photo-service
 */

const { runAsync, allAsync, getAsync } = require('../utils/db-helpers');
const PreparedStmt = require('../utils/prepared-statements');
const { attachTagsToPhotos } = require('./tag-service');

// ============================================================================
// PHOTO CRUD OPERATIONS
// ============================================================================

/**
 * List photos by roll ID
 * @param {number} rollId - Roll ID
 * @param {Object} options - Query options
 * @param {boolean} [options.includeTags=true] - Include tags in response
 * @returns {Promise<Array>}
 */
async function listByRoll(rollId, options = {}) {
  const { includeTags = true } = options;
  
  const rows = await PreparedStmt.allAsync('photos.listByRoll', [rollId]);
  
  // Normalize paths: prefer positive paths, fall back to full/negative
  const normalized = (rows || []).map(r => {
    const fullPath = r.positive_rel_path || r.full_rel_path || null;
    const thumbPath = r.positive_thumb_rel_path || r.thumb_rel_path || null;
    return Object.assign({}, r, {
      full_rel_path: fullPath,
      thumb_rel_path: thumbPath,
    });
  });
  
  if (includeTags) {
    return attachTagsToPhotos(normalized);
  }
  
  return normalized;
}

/**
 * Get single photo by ID
 * @param {number} photoId - Photo ID
 * @returns {Promise<Object|null>}
 */
async function getPhotoById(photoId) {
  return getAsync('SELECT * FROM photos WHERE id = ?', [photoId]);
}

/**
 * Get photo by ID with roll context
 * @param {number} photoId - Photo ID
 * @param {number} rollId - Roll ID for context
 * @returns {Promise<Object|null>}
 */
async function getPhotoByIdAndRoll(photoId, rollId) {
  return getAsync(
    'SELECT * FROM photos WHERE id = ? AND roll_id = ?',
    [photoId, rollId]
  );
}

/**
 * Get photo count for a roll
 * @param {number} rollId - Roll ID
 * @returns {Promise<number>}
 */
async function getPhotoCountByRoll(rollId) {
  const row = await PreparedStmt.getAsync('rolls.countPhotos', [rollId]);
  return row?.cnt || 0;
}

/**
 * Update photo
 * @param {number} photoId - Photo ID
 * @param {Object} data - Update data
 * @returns {Promise<{updated: number}>}
 */
async function updatePhoto(photoId, data) {
  const allowedFields = [
    'caption', 'taken_at', 'date_taken', 'time_taken', 'rating',
    'camera', 'lens', 'photographer', 'aperture', 'shutter_speed', 
    'iso', 'focal_length', 'location_id', 'detail_location',
    'country', 'city', 'latitude', 'longitude',
    'full_rel_path', 'thumb_rel_path', 'positive_rel_path', 
    'negative_rel_path', 'original_rel_path',
    'positive_thumb_rel_path', 'negative_thumb_rel_path',
    'is_negative_source', 'favorite'
  ];
  
  const updates = [];
  const params = [];
  
  for (const field of allowedFields) {
    if (data[field] !== undefined) {
      updates.push(`${field} = ?`);
      params.push(data[field]);
    }
  }
  
  if (updates.length === 0) {
    return { updated: 0 };
  }
  
  params.push(photoId);
  const sql = `UPDATE photos SET ${updates.join(', ')} WHERE id = ?`;
  const result = await runAsync(sql, params);
  return { updated: result?.changes || 0 };
}

/**
 * Delete photo from database
 * @param {number} photoId - Photo ID
 * @returns {Promise<{deleted: boolean, photo: Object|null}>}
 */
async function deletePhotoFromDb(photoId) {
  // Get photo data before deletion for cleanup
  const photo = await getPhotoById(photoId);
  if (!photo) {
    return { deleted: false, photo: null };
  }
  
  await runAsync('BEGIN');
  try {
    await runAsync('DELETE FROM photo_tags WHERE photo_id = ?', [photoId]);
    await runAsync('DELETE FROM photos WHERE id = ?', [photoId]);
    await runAsync('COMMIT');
    return { deleted: true, photo };
  } catch (e) {
    try { await runAsync('ROLLBACK'); } catch(_) {}
    throw e;
  }
}

/**
 * Get roll metadata for photo defaults
 * @param {number} rollId - Roll ID
 * @returns {Promise<{camera: string|null, lens: string|null, photographer: string|null}>}
 */
async function getRollMetaForPhoto(rollId) {
  const row = await getAsync(
    'SELECT camera, lens, photographer FROM rolls WHERE id = ?', 
    [rollId]
  );
  return row || { camera: null, lens: null, photographer: null };
}

/**
 * Insert new photo
 * @param {Object} photoData - Photo data
 * @returns {Promise<{id: number}>}
 */
async function insertPhoto(photoData) {
  const {
    roll_id, frame_number, filename,
    full_rel_path, thumb_rel_path, negative_rel_path,
    original_rel_path, positive_rel_path, 
    positive_thumb_rel_path, negative_thumb_rel_path,
    is_negative_source, caption, taken_at, rating,
    camera, lens, photographer,
    source_make, source_model, source_software
  } = photoData;
  
  const sql = `INSERT INTO photos (
    roll_id, frame_number, filename,
    full_rel_path, thumb_rel_path, negative_rel_path,
    original_rel_path, positive_rel_path,
    positive_thumb_rel_path, negative_thumb_rel_path,
    is_negative_source, caption, taken_at, rating,
    camera, lens, photographer,
    source_make, source_model, source_software
  ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`;
  
  const result = await runAsync(sql, [
    roll_id, frame_number, filename,
    full_rel_path, thumb_rel_path, negative_rel_path,
    original_rel_path, positive_rel_path,
    positive_thumb_rel_path, negative_thumb_rel_path,
    is_negative_source || 0, caption, taken_at, rating,
    camera, lens, photographer,
    source_make, source_model, source_software
  ]);
  
  return { id: result?.lastID };
}

// ============================================================================
// EXPORTS
// ============================================================================

module.exports = {
  // CRUD operations
  listByRoll,
  getPhotoById,
  getPhotoByIdAndRoll,
  getPhotoCountByRoll,
  updatePhoto,
  deletePhotoFromDb,
  insertPhoto,
  
  // Utilities
  getRollMetaForPhoto
};
