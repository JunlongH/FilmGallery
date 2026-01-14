/**
 * Roll Creation Service
 * 
 * Encapsulates the atomic roll creation workflow:
 * 1. Parse and validate inputs
 * 2. Group files (main + thumb pairs)
 * 3. Process images in local temp directory
 * 4. Publish files to final destination (OneDrive)
 * 5. Insert database records atomically
 * 
 * Extracted from routes/rolls.js for maintainability and testability.
 */

const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const db = require('../db');
const { runAsync, allAsync, getAsync } = require('../utils/db-helpers');
const { moveFileAsync, copyFileAsyncWithRetry } = require('../utils/file-helpers');
const { localTmpDir, rollsDir } = require('../config/paths');
const { addOrUpdateGear } = require('./gear-service');
const { recomputeRollSequence } = require('./roll-service');
const { linkFilmItemToRoll } = require('./film/film-item-service');
const { sharpWithTimeout, THUMB_TIMEOUT, DEFAULT_TIMEOUT } = require('./thumbnail-service');

// Disable sharp cache to prevent file locking on Windows
sharp.cache(false);
sharp.concurrency(1);

/**
 * Parse and normalize roll creation inputs
 * @param {Object} body - Request body
 * @returns {Object} Normalized input parameters
 */
function parseRollInputs(body) {
  const parsed = {
    title: body.title || null,
    start_date: body.start_date || null,
    end_date: body.end_date || null,
    camera: body.camera || null,
    lens: body.lens || null,
    photographer: body.photographer || null,
    film_type: body.film_type || null,
    filmId: body.filmId ? Number(body.filmId) : null,
    film_item_id: body.film_item_id ? Number(body.film_item_id) : null,
    camera_equip_id: body.camera_equip_id ? Number(body.camera_equip_id) : null,
    lens_equip_id: body.lens_equip_id ? Number(body.lens_equip_id) : null,
    flash_equip_id: body.flash_equip_id ? Number(body.flash_equip_id) : null,
    notes: body.notes || null,
    coverIndex: body.coverIndex ? Number(body.coverIndex) : null,
    isNegativeGlobal: body.isNegative === 'true' || body.isNegative === true,
  };

  // Parse JSON fields
  parsed.tmpFiles = body.tmpFiles 
    ? (typeof body.tmpFiles === 'string' ? JSON.parse(body.tmpFiles) : body.tmpFiles) 
    : null;
  
  parsed.fileMetadata = body.fileMetadata 
    ? (typeof body.fileMetadata === 'string' ? JSON.parse(body.fileMetadata) : body.fileMetadata) 
    : {};

  return parsed;
}

/**
 * Validate date range for roll
 * @param {string} start_date - Start date string
 * @param {string} end_date - End date string  
 * @throws {Error} If dates are invalid
 */
function validateDateRange(start_date, end_date) {
  if (start_date && end_date) {
    const sd = new Date(start_date);
    const ed = new Date(end_date);
    if (isNaN(sd.getTime()) || isNaN(ed.getTime())) {
      throw new Error('Invalid start_date or end_date');
    }
    if (sd > ed) {
      throw new Error('start_date cannot be later than end_date');
    }
  }
}

/**
 * Load film_id from film_item if provided
 * @param {number|null} film_item_id - Film item ID
 * @param {number|null} defaultFilmId - Default film ID
 * @returns {Promise<number|null>} Film ID
 */
async function resolveFilmId(film_item_id, defaultFilmId) {
  if (!film_item_id) return defaultFilmId;
  
  try {
    const row = await getAsync(
      'SELECT film_id FROM film_items WHERE id = ? AND deleted_at IS NULL', 
      [film_item_id]
    );
    return row?.film_id || defaultFilmId;
  } catch (e) {
    console.error('[RollCreation] Failed to load film_item for filmId override', e.message);
    return defaultFilmId;
  }
}

/**
 * Load film ISO for default photo ISO
 * @param {number|null} filmId - Film ID
 * @returns {Promise<number|null>} Film ISO
 */
async function getFilmIso(filmId) {
  if (!filmId) return null;
  
  try {
    const row = await getAsync('SELECT iso FROM films WHERE id = ?', [filmId]);
    return row?.iso || null;
  } catch (e) {
    console.warn('[RollCreation] Failed to load film iso', e.message);
    return null;
  }
}

/**
 * Handle fixed lens camera - derive lens from camera if needed
 * @param {number|null} camera_equip_id - Camera equipment ID
 * @param {number|null} lens_equip_id - Lens equipment ID  
 * @param {string|null} lensText - Legacy lens text
 * @returns {Promise<{lensEquipId: number|null, lensText: string|null}>}
 */
async function resolveFixedLens(camera_equip_id, lens_equip_id, lensText) {
  if (!camera_equip_id) {
    return { lensEquipId: lens_equip_id, lensText };
  }

  try {
    const camRow = await getAsync(
      'SELECT has_fixed_lens, fixed_lens_focal_length, fixed_lens_max_aperture FROM equip_cameras WHERE id = ?',
      [camera_equip_id]
    );
    
    if (camRow?.has_fixed_lens === 1) {
      // Fixed lens camera: nullify explicit lens, set text for backward compat
      const derivedLens = `${camRow.fixed_lens_focal_length}mm f/${camRow.fixed_lens_max_aperture}`;
      console.log(`[RollCreation] Fixed lens camera detected. Setting implicit lens: ${derivedLens}`);
      return { lensEquipId: null, lensText: derivedLens };
    }
  } catch (e) {
    console.warn('[RollCreation] Failed to check camera fixed lens status', e.message);
  }

  return { lensEquipId: lens_equip_id, lensText };
}

/**
 * Collect incoming files from multer upload and tmpFiles array
 * @param {Array} reqFiles - Files from multer (req.files)
 * @param {Array|null} tmpFiles - Pre-uploaded temp files array
 * @param {boolean} isNegativeGlobal - Default negative flag
 * @returns {Array<Object>} Normalized file list
 */
function collectIncomingFiles(reqFiles, tmpFiles, isNegativeGlobal) {
  const incoming = [];

  if (reqFiles?.length) {
    incoming.push(...reqFiles.map(f => ({
      tmpPath: f.path,
      originalName: f.originalname,
      tmpName: f.filename,
      isNegative: isNegativeGlobal
    })));
  }

  if (tmpFiles && Array.isArray(tmpFiles)) {
    for (const t of tmpFiles) {
      const tmpName = t.tmpName || t.filename;
      const tmpPath = path.join(localTmpDir, tmpName);
      if (!tmpName || !fs.existsSync(tmpPath)) continue;
      incoming.push({
        tmpPath,
        originalName: tmpName,
        tmpName,
        isNegative: t.isNegative !== undefined ? t.isNegative : isNegativeGlobal
      });
    }
  }

  return incoming;
}

/**
 * Group files by base name to handle main + thumb pairs
 * @param {Array} incoming - Incoming file list
 * @returns {Array<Object>} Sorted groups with main/thumb files
 */
function groupFilesByBaseName(incoming) {
  const groups = new Map();

  for (const f of incoming) {
    const originalName = f.originalName || f.tmpName;
    const parsed = path.parse(originalName);
    let base = parsed.name;
    let type = 'main';

    if (base.toLowerCase().endsWith('_thumb') || base.toLowerCase().endsWith('-thumb')) {
      base = base.replace(/[-_]thumb$/i, '');
      type = 'thumb';
    }

    if (!groups.has(base)) groups.set(base, { main: null, thumb: null });
    groups.get(base)[type] = f;
  }

  // Sort by original filename
  return Array.from(groups.values()).sort((a, b) => {
    const nameA = (a.main || a.thumb).originalName;
    const nameB = (b.main || b.thumb).originalName;
    return nameA.localeCompare(nameB);
  });
}

/**
 * Resolve metadata for a photo from fileMetadata map
 * @param {Object} metaMap - Metadata map
 * @param {Array<string>} keys - Keys to check
 * @returns {Object} Resolved metadata
 */
function resolvePhotoMetadata(metaMap, keys = []) {
  for (const k of keys) {
    if (!k) continue;
    const m = metaMap[k];
    if (!m) continue;
    if (typeof m === 'string') {
      return { date: m, lens: null, country: null, city: null, detail_location: null, aperture: null, shutter_speed: null };
    }
    if (typeof m === 'object') {
      return {
        date: m.date || null,
        lens: m.lens || null,
        country: m.country || null,
        city: m.city || null,
        detail_location: m.detail_location || null,
        aperture: m.aperture ?? null,
        shutter_speed: m.shutter_speed || null
      };
    }
  }
  return { date: null, lens: null, country: null, city: null, detail_location: null, aperture: null, shutter_speed: null };
}

/**
 * Ensure a location exists and return its ID
 * @param {string} country - Country name or code
 * @param {string} city - City name
 * @param {Map} cache - Location cache
 * @returns {Promise<number|null>} Location ID
 */
async function ensureLocationId(country, city, cache) {
  const normCity = (city || '').trim();
  const normCountry = (country || '').trim();
  if (!normCity) return null;
  
  const key = `${normCountry.toLowerCase()}||${normCity.toLowerCase()}`;
  if (cache.has(key)) return cache.get(key);

  // Try to match existing location
  const existing = await getAsync(
    `SELECT id FROM locations
     WHERE LOWER(city_name) = LOWER(?)
       AND (
         LOWER(country_name) = LOWER(?) OR country_code = ? OR country_code IS NULL OR country_name IS NULL
       )
     LIMIT 1`,
    [normCity, normCountry, normCountry]
  );
  
  if (existing?.id) {
    cache.set(key, existing.id);
    return existing.id;
  }

  // Insert new location
  const insertedId = await runAsync(
    'INSERT INTO locations (country_name, city_name) VALUES (?, ?)',
    [normCountry || null, normCity]
  ).then(res => res.lastID).catch(() => null);
  
  if (insertedId) cache.set(key, insertedId);
  return insertedId;
}

/**
 * Process a single image (positive or negative) to JPEG
 * @param {Object} params - Processing parameters
 * @returns {Promise<Object>} Processing result with staged operations
 */
async function processImage({
  file,
  frameNumber,
  rollId,
  folderName,
  thumbFile,
  isNegative,
  localTmpDir,
  rollsDir
}) {
  const rollFolderPath = path.join(rollsDir, folderName);
  const baseName = `${rollId}_${frameNumber}`;
  const originalExt = path.extname(file.originalName || file.tmpName) || '.jpg';
  const finalName = `${baseName}.jpg`;
  
  const stagedOps = [];
  const stagedTempArtifacts = [];
  const result = {
    finalName,
    negativeRelPath: null,
    fullRelPath: null,
    thumbRelPath: null,
    originalRelPath: null,
    positiveRelPath: null,
    positiveThumbRelPath: null,
    negativeThumbRelPath: null,
    isNegativeSource: 0
  };

  // Original file destination
  const originalName = `${baseName}_original${originalExt}`;
  const finalOriginalPath = path.join(rollFolderPath, 'originals', originalName);
  result.originalRelPath = path.join('rolls', folderName, 'originals', originalName).replace(/\\/g, '/');

  if (isNegative) {
    // Process negative image
    const negName = `${baseName}_neg.jpg`;
    const negThumbName = `${baseName}-thumb.jpg`;
    const finalNegPath = path.join(rollFolderPath, 'negative', negName);
    const finalNegThumbPath = path.join(rollFolderPath, 'negative', 'thumb', negThumbName);
    const finalMainThumbPath = path.join(rollFolderPath, 'thumb', negThumbName);
    const tempNegPath = path.join(localTmpDir, `proc_${baseName}_neg.jpg`);
    stagedTempArtifacts.push(tempNegPath);

    console.log(`[RollCreation] Processing negative ${frameNumber}: ${path.basename(file.tmpPath)} (${(fs.statSync(file.tmpPath).size / 1024 / 1024).toFixed(2)} MB)`);
    const startTime = Date.now();
    
    try {
      await sharpWithTimeout(
        sharp(file.tmpPath).jpeg({ quality: 95 }).toFile(tempNegPath)
      );
      console.log(`[RollCreation] Negative ${frameNumber} processed in ${Date.now() - startTime}ms`);
    } catch (err) {
      const error = new Error(`Failed to process negative image ${path.basename(file.tmpPath)}: ${err.message}`);
      error.originalError = err;
      error.fileInfo = { name: path.basename(file.tmpPath), size: fs.statSync(file.tmpPath).size };
      throw error;
    }

    // Generate thumbnail if no separate thumb file
    let tempNegThumbPath = null;
    if (!thumbFile) {
      tempNegThumbPath = path.join(localTmpDir, `proc_${baseName}_neg_thumb.jpg`);
      stagedTempArtifacts.push(tempNegThumbPath);
      
      try {
        await sharpWithTimeout(
          sharp(tempNegPath)
            .resize({ width: 240, height: 240, fit: 'inside' })
            .jpeg({ quality: 40 })
            .toFile(tempNegThumbPath),
          THUMB_TIMEOUT
        );
      } catch (err) {
        const error = new Error(`Failed to generate thumbnail for ${path.basename(file.tmpPath)}: ${err.message}`);
        error.originalError = err;
        throw error;
      }
    }

    // Stage file operations
    stagedOps.push({ type: 'move', src: file.tmpPath, dest: finalOriginalPath });
    stagedOps.push({ type: 'move', src: tempNegPath, dest: finalNegPath });
    
    const thumbSrc = thumbFile ? thumbFile.tmpPath : tempNegThumbPath;
    stagedOps.push({ type: 'copy', src: thumbSrc, dest: finalMainThumbPath });
    stagedOps.push({ type: 'move', src: thumbSrc, dest: finalNegThumbPath });

    result.negativeRelPath = path.join('rolls', folderName, 'negative', negName).replace(/\\/g, '/');
    result.thumbRelPath = path.join('rolls', folderName, 'thumb', negThumbName).replace(/\\/g, '/');
    result.negativeThumbRelPath = path.join('rolls', folderName, 'negative', 'thumb', negThumbName).replace(/\\/g, '/');
    result.isNegativeSource = 1;

  } else {
    // Process positive image
    const thumbName = `${baseName}-thumb.jpg`;
    const destPath = path.join(rollFolderPath, 'full', finalName);
    const thumbPath = path.join(rollFolderPath, 'thumb', thumbName);
    const tempFullPath = path.join(localTmpDir, `proc_${baseName}_full.jpg`);
    stagedTempArtifacts.push(tempFullPath);

    console.log(`[RollCreation] Processing positive ${frameNumber}: ${path.basename(file.tmpPath)} (${(fs.statSync(file.tmpPath).size / 1024 / 1024).toFixed(2)} MB)`);
    const startTime = Date.now();
    
    try {
      await sharpWithTimeout(
        sharp(file.tmpPath).jpeg({ quality: 95 }).toFile(tempFullPath)
      );
      console.log(`[RollCreation] Positive ${frameNumber} processed in ${Date.now() - startTime}ms`);
    } catch (err) {
      const error = new Error(`Failed to process image ${path.basename(file.tmpPath)}: ${err.message}`);
      error.originalError = err;
      error.fileInfo = { name: path.basename(file.tmpPath), size: fs.statSync(file.tmpPath).size };
      throw error;
    }

    // Generate thumbnail if no separate thumb file  
    let tempThumbPath = null;
    if (!thumbFile) {
      tempThumbPath = path.join(localTmpDir, `proc_${baseName}_thumb.jpg`);
      stagedTempArtifacts.push(tempThumbPath);
      
      try {
        await sharpWithTimeout(
          sharp(tempFullPath)
            .resize({ width: 240, height: 240, fit: 'inside' })
            .jpeg({ quality: 40 })
            .toFile(tempThumbPath),
          THUMB_TIMEOUT
        );
      } catch (err) {
        const error = new Error(`Failed to generate thumbnail for ${path.basename(file.tmpPath)}: ${err.message}`);
        error.originalError = err;
        throw error;
      }
    }

    // Stage file operations
    stagedOps.push({ type: 'move', src: file.tmpPath, dest: finalOriginalPath });
    stagedOps.push({ type: 'move', src: tempFullPath, dest: destPath });
    stagedOps.push({ type: 'move', src: thumbFile ? thumbFile.tmpPath : tempThumbPath, dest: thumbPath });

    result.fullRelPath = path.join('rolls', folderName, 'full', finalName).replace(/\\/g, '/');
    result.positiveRelPath = result.fullRelPath;
    result.thumbRelPath = path.join('rolls', folderName, 'thumb', thumbName).replace(/\\/g, '/');
    result.positiveThumbRelPath = result.thumbRelPath;
  }

  return { result, stagedOps, stagedTempArtifacts };
}

/**
 * Execute staged file operations (moves/copies)
 * @param {Array} stagedOps - Array of staged operations
 * @param {Array} createdPaths - Array to track created paths for rollback
 */
async function publishFileOperations(stagedOps, createdPaths) {
  console.log(`[RollCreation] Publishing ${stagedOps.length} file operations...`);
  
  for (let i = 0; i < stagedOps.length; i++) {
    const op = stagedOps[i];
    try {
      const srcSize = fs.existsSync(op.src) ? (fs.statSync(op.src).size / 1024 / 1024).toFixed(2) : 'N/A';
      console.log(`[RollCreation] [${i + 1}/${stagedOps.length}] ${op.type} ${path.basename(op.src)} (${srcSize} MB) -> ${path.basename(op.dest)}`);
      
      if (op.type === 'copy') {
        await copyFileAsyncWithRetry(op.src, op.dest);
      } else {
        await moveFileAsync(op.src, op.dest);
      }
      createdPaths.push(op.dest);
    } catch (err) {
      const error = new Error(`Failed to ${op.type} file ${path.basename(op.src)}: ${err.message}`);
      error.originalError = err;
      error.operation = { type: op.type, src: op.src, dest: op.dest };
      throw error;
    }
  }
  
  console.log(`[RollCreation] All files published successfully.`);
}

/**
 * Cleanup temporary artifacts
 * @param {Array} artifacts - Array of temp file paths
 */
async function cleanupTempArtifacts(artifacts) {
  for (const t of artifacts) {
    try { 
      if (fs.existsSync(t)) await fs.promises.unlink(t); 
    } catch (_) { /* ignore cleanup error */ }
  }
}

/**
 * Remove directory with retry logic
 * @param {string} absPath - Absolute path to remove
 * @param {number} retries - Number of retries
 */
async function rmWithRetry(absPath, retries = 3) {
  for (let i = 0; i < retries; i++) {
    try {
      await fs.promises.rm(absPath, { recursive: true, force: true });
      return;
    } catch (e) {
      if (i === retries - 1) return;
      await new Promise(r => setTimeout(r, 300 * (i + 1)));
    }
  }
}

/**
 * Create roll directories
 * @param {string} rollFolderPath - Base roll folder path
 */
async function createRollDirectories(rollFolderPath) {
  const dirs = [
    rollFolderPath,
    path.join(rollFolderPath, 'full'),
    path.join(rollFolderPath, 'thumb'),
    path.join(rollFolderPath, 'originals'),
    path.join(rollFolderPath, 'negative'),
    path.join(rollFolderPath, 'negative', 'thumb')
  ];
  
  for (const dir of dirs) {
    await fs.promises.mkdir(dir, { recursive: true });
  }
}

module.exports = {
  parseRollInputs,
  validateDateRange,
  resolveFilmId,
  getFilmIso,
  resolveFixedLens,
  collectIncomingFiles,
  groupFilesByBaseName,
  resolvePhotoMetadata,
  ensureLocationId,
  processImage,
  publishFileOperations,
  cleanupTempArtifacts,
  rmWithRetry,
  createRollDirectories
};
