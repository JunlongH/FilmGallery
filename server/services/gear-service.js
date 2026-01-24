const { runAsync, allAsync, getAsync } = require('../utils/db-helpers');

// ============================================================================
// FIXED LENS CAMERA UTILITIES
// ============================================================================

/**
 * Format fixed lens description for a camera
 * Generates a standardized string like "Konica bigmini 201 35mm f/3.5"
 * 
 * @param {Object} camera - Camera object with brand, model, fixed_lens_focal_length, fixed_lens_max_aperture
 * @returns {string|null} Formatted lens description or null if not a fixed-lens camera
 */
function formatFixedLensDescription(camera) {
  if (!camera) return null;
  
  const focal = camera.fixed_lens_focal_length;
  const aperture = camera.fixed_lens_max_aperture;
  
  // Must have focal length at minimum
  if (!focal) return null;
  
  // Build lens spec: "35mm f/3.5" or "35mm" if no aperture
  const lensSpec = aperture ? `${focal}mm f/${aperture}` : `${focal}mm`;
  
  // Build camera prefix: "Konica bigmini 201" or empty
  const brand = camera.brand || camera.camera_brand || '';
  const model = camera.model || camera.camera_model || '';
  const cameraPrefix = [brand, model].filter(Boolean).join(' ').trim();
  
  // Return full description: "Konica bigmini 201 35mm f/3.5"
  return cameraPrefix ? `${cameraPrefix} ${lensSpec}` : lensSpec;
}

/**
 * Check if a camera has a fixed lens and get the formatted description
 * 
 * @param {number} cameraEquipId - Camera equipment ID
 * @returns {Promise<{isFixedLens: boolean, lensDescription: string|null, camera: Object|null}>}
 */
async function getFixedLensInfo(cameraEquipId) {
  if (!cameraEquipId) {
    return { isFixedLens: false, lensDescription: null, camera: null };
  }
  
  try {
    const camera = await getAsync(`
      SELECT id, brand, model, has_fixed_lens, fixed_lens_focal_length, fixed_lens_max_aperture
      FROM equip_cameras WHERE id = ?
    `, [cameraEquipId]);
    
    if (!camera || camera.has_fixed_lens !== 1) {
      return { isFixedLens: false, lensDescription: null, camera };
    }
    
    const lensDescription = formatFixedLensDescription(camera);
    return { isFixedLens: true, lensDescription, camera };
  } catch (error) {
    console.error('[gear-service] getFixedLensInfo failed:', error);
    return { isFixedLens: false, lensDescription: null, camera: null };
  }
}

/**
 * Clean up roll_gear lens entries for a fixed-lens camera roll
 * Removes fragmented lens data and ensures only the canonical description exists
 * 
 * @param {number} rollId - Roll ID
 * @param {string} canonicalLens - The correct lens description to keep
 * @returns {Promise<{removed: number, added: boolean}>}
 */
async function cleanupFixedLensGear(rollId, canonicalLens) {
  if (!rollId || !canonicalLens) {
    return { removed: 0, added: false };
  }
  
  try {
    // Get all current lens entries for this roll
    const existingLenses = await allAsync(
      'SELECT value FROM roll_gear WHERE roll_id = ? AND type = ?',
      [rollId, 'lens']
    );
    
    let removed = 0;
    const canonicalLower = canonicalLens.toLowerCase();
    
    // Remove entries that are substrings of or contain partial matches with the canonical
    for (const { value } of existingLenses) {
      if (value === canonicalLens) continue; // Keep exact match
      
      const valueLower = value.toLowerCase();
      
      // Remove if:
      // 1. Value is a substring of canonical (e.g., "35mm f/3.5" in "Konica bigmini 201 35mm f/3.5")
      // 2. Canonical is a substring of value (shouldn't happen but handle it)
      // 3. Value looks like a partial lens spec (contains "mm" pattern but missing camera name)
      const isSubstring = canonicalLower.includes(valueLower) || valueLower.includes(canonicalLower);
      const isPartialSpec = /^\d+mm/.test(value) && !value.includes(' '); // "35mm" alone
      const isSpecWithAperture = /^\d+mm\s*f\/[\d.]+$/i.test(value); // "35mm f/3.5" alone
      
      if (isSubstring || isPartialSpec || isSpecWithAperture) {
        await runAsync(
          'DELETE FROM roll_gear WHERE roll_id = ? AND type = ? AND value = ?',
          [rollId, 'lens', value]
        );
        removed++;
      }
    }
    
    // Ensure canonical lens exists
    const result = await runAsync(
      'INSERT OR IGNORE INTO roll_gear (roll_id, type, value) VALUES (?, ?, ?)',
      [rollId, 'lens', canonicalLens]
    );
    const added = result && result.changes > 0;
    
    return { removed, added };
  } catch (error) {
    console.error('[gear-service] cleanupFixedLensGear failed:', error);
    return { removed: 0, added: false };
  }
}

// ============================================================================
// GEAR MANAGEMENT FUNCTIONS
// ============================================================================

/**
 * Add or update gear for a roll with intelligent deduplication
 * - Removes old values that are substrings of new values
 * - Example: "Junlong" absorbs "Junlong Huang" when updating to "Junlong"
 * 
 * @param {number} rollId - Roll ID
 * @param {string} type - Gear type: 'camera', 'lens', or 'photographer'
 * @param {string} newValue - New gear value to add
 * @returns {Promise<{added: boolean, removed: string[]}>}
 */
async function addOrUpdateGear(rollId, type, newValue) {
  if (!rollId || !type || !newValue || typeof newValue !== 'string') {
    return { added: false, removed: [] };
  }

  const trimmedValue = newValue.trim();
  // Ignore placeholder or empty values
  const isPlaceholder = trimmedValue === '-' || trimmedValue === '--' || trimmedValue === '—';
  if (!trimmedValue || isPlaceholder) {
    // Proactively remove any existing placeholder entries for this type
    try {
      await runAsync('DELETE FROM roll_gear WHERE roll_id = ? AND type = ? AND (value = "" OR value = "-" OR value = "--" OR value = "—")', [rollId, type]);
    } catch(e) {}
    return { added: false, removed: [] };
  }

  try {
    // Get all existing gear of this type for this roll
    const existing = await allAsync(
      'SELECT value FROM roll_gear WHERE roll_id = ? AND type = ?',
      [rollId, type]
    );

    const existingValues = existing.map(r => r.value);
    const removed = [];
    let needsInsert = true;

    // Check if new value already exists (exact match)
    if (existingValues.includes(trimmedValue)) {
      needsInsert = false;
    }

    // Find values to remove (intelligent deduplication)
    for (const oldValue of existingValues) {
      // Skip self
      if (oldValue === trimmedValue) continue;

      // Remove placeholders
      if (!oldValue || oldValue === '-' || oldValue === '--' || oldValue === '—') {
        await runAsync('DELETE FROM roll_gear WHERE roll_id = ? AND type = ? AND value = ?', [rollId, type, oldValue]);
        removed.push(oldValue);
        continue;
      }

      // Case 1: Old value is a substring of new value
      // Example: "Junlong" contains "Jun" -> remove "Jun"
      if (trimmedValue.toLowerCase().includes(oldValue.toLowerCase())) {
        await runAsync(
          'DELETE FROM roll_gear WHERE roll_id = ? AND type = ? AND value = ?',
          [rollId, type, oldValue]
        );
        removed.push(oldValue);
      }
      // Case 2: New value is a substring of old value
      // Example: "Junlong" is contained in "Junlong Huang" -> remove "Junlong Huang"
      else if (oldValue.toLowerCase().includes(trimmedValue.toLowerCase())) {
        await runAsync(
          'DELETE FROM roll_gear WHERE roll_id = ? AND type = ? AND value = ?',
          [rollId, type, oldValue]
        );
        removed.push(oldValue);
      }
    }

    // Add new value if needed
    if (needsInsert) {
      try {
        await runAsync(
          'INSERT INTO roll_gear (roll_id, type, value) VALUES (?, ?, ?)',
          [rollId, type, trimmedValue]
        );
        return { added: true, removed };
      } catch (err) {
        // If INSERT fails due to UNIQUE constraint, it means another process added it
        if (err.code === 'SQLITE_CONSTRAINT') {
          return { added: false, removed };
        }
        throw err;
      }
    }
    
    return { added: false, removed };

  } catch (error) {
    console.error('[gear-service] addOrUpdateGear failed:', error);
    throw error;
  }
}

/**
 * Batch add multiple gear items to a roll
 * 
 * @param {number} rollId - Roll ID
 * @param {Object} gearData - { cameras: string[], lenses: string[], photographers: string[] }
 * @returns {Promise<{cameras: number, lenses: number, photographers: number}>}
 */
async function addGearBatch(rollId, gearData = {}) {
  const result = { cameras: 0, lenses: 0, photographers: 0 };

  if (!rollId) return result;

  const { cameras = [], lenses = [], photographers = [] } = gearData;

  // Process cameras
  for (const camera of cameras) {
    if (camera && typeof camera === 'string') {
      const { added } = await addOrUpdateGear(rollId, 'camera', camera);
      if (added) result.cameras++;
    }
  }

  // Process lenses
  for (const lens of lenses) {
    if (lens && typeof lens === 'string') {
      const { added } = await addOrUpdateGear(rollId, 'lens', lens);
      if (added) result.lenses++;
    }
  }

  // Process photographers
  for (const photographer of photographers) {
    if (photographer && typeof photographer === 'string') {
      const { added } = await addOrUpdateGear(rollId, 'photographer', photographer);
      if (added) result.photographers++;
    }
  }

  return result;
}

/**
 * Remove a specific gear value from a roll
 * 
 * @param {number} rollId - Roll ID
 * @param {string} type - Gear type
 * @param {string} value - Value to remove
 * @returns {Promise<boolean>}
 */
async function removeGear(rollId, type, value) {
  if (!rollId || !type || !value) return false;

  try {
    const result = await runAsync(
      'DELETE FROM roll_gear WHERE roll_id = ? AND type = ? AND value = ?',
      [rollId, type, value]
    );
    return result.changes > 0;
  } catch (error) {
    console.error('[gear-service] removeGear failed:', error);
    throw error;
  }
}

/**
 * Get all gear for a roll, grouped by type
 * 
 * @param {number} rollId - Roll ID
 * @returns {Promise<{cameras: string[], lenses: string[], photographers: string[]}>}
 */
async function getRollGear(rollId) {
  const gear = { cameras: [], lenses: [], photographers: [] };

  if (!rollId) return gear;

  try {
    const rows = await allAsync(
      'SELECT type, value FROM roll_gear WHERE roll_id = ? ORDER BY type, value',
      [rollId]
    );

    rows.forEach(r => {
      if (r.type === 'camera') gear.cameras.push(r.value);
      else if (r.type === 'lens') gear.lenses.push(r.value);
      else if (r.type === 'photographer') gear.photographers.push(r.value);
    });

    return gear;
  } catch (error) {
    console.error('[gear-service] getRollGear failed:', error);
    throw error;
  }
}

/**
 * Deduplicate all gear entries across all rolls
 * Removes substring duplicates (e.g., "Jun" when "Junlong" exists)
 * 
 * @returns {Promise<{processed: number, removed: number}>}
 */
async function deduplicateAllGear() {
  try {
    const rolls = await allAsync('SELECT DISTINCT roll_id FROM roll_gear');
    let totalRemoved = 0;

    for (const { roll_id } of rolls) {
      // Process each gear type separately
      for (const type of ['camera', 'lens', 'photographer']) {
        const values = await allAsync(
          'SELECT value FROM roll_gear WHERE roll_id = ? AND type = ? ORDER BY LENGTH(value) DESC',
          [roll_id, type]
        );

        const valueStrings = values.map(v => v.value);
        const toRemove = new Set();

        // Find substring duplicates
        for (let i = 0; i < valueStrings.length; i++) {
          for (let j = i + 1; j < valueStrings.length; j++) {
            const longer = valueStrings[i];
            const shorter = valueStrings[j];

            if (longer.toLowerCase().includes(shorter.toLowerCase())) {
              toRemove.add(shorter);
            }
          }
        }

        // Remove duplicates
        for (const value of toRemove) {
          await runAsync(
            'DELETE FROM roll_gear WHERE roll_id = ? AND type = ? AND value = ?',
            [roll_id, type, value]
          );
          totalRemoved++;
        }
      }
    }

    return { processed: rolls.length, removed: totalRemoved };
  } catch (error) {
    console.error('[gear-service] deduplicateAllGear failed:', error);
    throw error;
  }
}

module.exports = {
  // Fixed lens utilities
  formatFixedLensDescription,
  getFixedLensInfo,
  cleanupFixedLensGear,
  // Gear management
  addOrUpdateGear,
  addGearBatch,
  removeGear,
  getRollGear,
  deduplicateAllGear
};
