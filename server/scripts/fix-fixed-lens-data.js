/**
 * Fixed Lens Camera Data Repair Script
 * 
 * This script fixes inconsistent lens data for rolls using fixed-lens cameras (PS cameras).
 * 
 * Problem:
 * - Historical data has lens text in various formats:
 *   - "Konica big mini 201" (camera name only)
 *   - "35mm f/3.5" (spec only)
 *   - "Konica bigmini 201 35mm f/3.5" (expected format)
 * 
 * Solution:
 * - Standardize all fixed-lens camera rolls to use: "Brand Model Xmm f/Y"
 * - Clean up roll_gear table to remove fragmented entries
 * 
 * Run with: 
 *   node server/scripts/fix-fixed-lens-data.js [--dry-run]
 * 
 * Options:
 *   --dry-run   Preview changes without modifying the database
 */

const sqlite3 = require('sqlite3');
const path = require('path');
const fs = require('fs');

// Parse command line arguments
const isDryRun = process.argv.includes('--dry-run');
const isVerbose = process.argv.includes('--verbose') || process.argv.includes('-v');

// Get DB path from config
let dbPath;
try {
  const { getDbPath } = require('../config/db-config');
  dbPath = getDbPath();
} catch (e) {
  // Fallback to default location
  dbPath = path.join(__dirname, '..', 'data', 'film_gallery.db');
}

console.log('='.repeat(70));
console.log('Fixed Lens Camera Data Repair Script');
console.log('='.repeat(70));
console.log(`Mode: ${isDryRun ? 'DRY RUN (no changes will be made)' : 'LIVE (changes will be applied)'}`);
console.log(`Database: ${dbPath}`);
console.log('');

if (!fs.existsSync(dbPath)) {
  console.error('ERROR: Database file not found!');
  console.error('Please run this script from the project root directory.');
  process.exit(1);
}

const db = new sqlite3.Database(dbPath);

// Promisify database methods
const allAsync = (sql, params = []) => new Promise((resolve, reject) => {
  db.all(sql, params, (err, rows) => {
    if (err) reject(err);
    else resolve(rows);
  });
});

const runAsync = (sql, params = []) => new Promise((resolve, reject) => {
  db.run(sql, params, function(err) {
    if (err) reject(err);
    else resolve({ changes: this.changes, lastID: this.lastID });
  });
});

const getAsync = (sql, params = []) => new Promise((resolve, reject) => {
  db.get(sql, params, (err, row) => {
    if (err) reject(err);
    else resolve(row);
  });
});

/**
 * Format fixed lens description (same logic as gear-service.js)
 */
function formatFixedLensDescription(camera) {
  if (!camera) return null;
  
  const focal = camera.fixed_lens_focal_length;
  const aperture = camera.fixed_lens_max_aperture;
  
  if (!focal) return null;
  
  const lensSpec = aperture ? `${focal}mm f/${aperture}` : `${focal}mm`;
  const cameraPrefix = [camera.brand, camera.model].filter(Boolean).join(' ').trim();
  
  return cameraPrefix ? `${cameraPrefix} ${lensSpec}` : lensSpec;
}

/**
 * Check if a value looks like a partial lens spec
 */
function isPartialLensSpec(value, canonicalLens) {
  if (!value || value === canonicalLens) return false;
  
  const valueLower = value.toLowerCase();
  const canonicalLower = canonicalLens.toLowerCase();
  
  // Check if value is a substring of canonical
  if (canonicalLower.includes(valueLower)) return true;
  
  // Check if it's a bare spec like "35mm f/3.5"
  if (/^\d+mm\s*(f\/[\d.]+)?$/i.test(value)) return true;
  
  return false;
}

async function main() {
  const stats = {
    rollsChecked: 0,
    rollsUpdated: 0,
    gearEntriesRemoved: 0,
    gearEntriesAdded: 0
  };

  try {
    // ========================================
    // STEP 1: Find all rolls with fixed-lens cameras
    // ========================================
    console.log('Step 1: Identifying rolls with fixed-lens cameras...');
    console.log('');

    const affectedRolls = await allAsync(`
      SELECT 
        r.id as roll_id,
        r.title,
        r.lens as current_lens,
        r.camera_equip_id,
        c.brand,
        c.model,
        c.fixed_lens_focal_length,
        c.fixed_lens_max_aperture
      FROM rolls r
      JOIN equip_cameras c ON r.camera_equip_id = c.id
      WHERE c.has_fixed_lens = 1
      ORDER BY r.id
    `);

    console.log(`Found ${affectedRolls.length} rolls with fixed-lens cameras.`);
    console.log('');

    if (affectedRolls.length === 0) {
      console.log('No rolls to repair. Database is already clean!');
      db.close();
      return;
    }

    // ========================================
    // STEP 2: Repair each roll
    // ========================================
    console.log('Step 2: Repairing lens data...');
    console.log('');

    for (const roll of affectedRolls) {
      stats.rollsChecked++;
      
      const expectedLens = formatFixedLensDescription(roll);
      if (!expectedLens) {
        console.log(`  [SKIP] Roll #${roll.roll_id}: Camera missing focal length data`);
        continue;
      }

      const needsUpdate = roll.current_lens !== expectedLens;
      
      if (isVerbose || needsUpdate) {
        console.log(`  Roll #${roll.roll_id}: "${roll.title || 'Untitled'}"`);
        console.log(`    Camera: ${roll.brand} ${roll.model}`);
        console.log(`    Current lens: "${roll.current_lens || '(empty)'}"`);
        console.log(`    Expected lens: "${expectedLens}"`);
      }

      if (needsUpdate) {
        stats.rollsUpdated++;
        
        if (!isDryRun) {
          // Update rolls.lens
          await runAsync('UPDATE rolls SET lens = ? WHERE id = ?', [expectedLens, roll.roll_id]);
        }
        
        if (isVerbose) console.log(`    → Updated rolls.lens`);
      }

      // ========================================
      // STEP 3: Clean up roll_gear entries
      // ========================================
      const existingGear = await allAsync(
        'SELECT id, value FROM roll_gear WHERE roll_id = ? AND type = ?',
        [roll.roll_id, 'lens']
      );

      let hasCanonical = false;
      
      for (const gear of existingGear) {
        if (gear.value === expectedLens) {
          hasCanonical = true;
          continue;
        }

        // Check if this is a partial/fragmented entry that should be removed
        if (isPartialLensSpec(gear.value, expectedLens)) {
          stats.gearEntriesRemoved++;
          
          if (!isDryRun) {
            await runAsync('DELETE FROM roll_gear WHERE id = ?', [gear.id]);
          }
          
          if (isVerbose) console.log(`    → Removed gear entry: "${gear.value}"`);
        }
      }

      // Ensure canonical lens exists in roll_gear
      if (!hasCanonical) {
        stats.gearEntriesAdded++;
        
        if (!isDryRun) {
          await runAsync(
            'INSERT OR IGNORE INTO roll_gear (roll_id, type, value) VALUES (?, ?, ?)',
            [roll.roll_id, 'lens', expectedLens]
          );
        }
        
        if (isVerbose) console.log(`    → Added gear entry: "${expectedLens}"`);
      }

      if (isVerbose && needsUpdate) console.log('');
    }

    // ========================================
    // STEP 4: Summary
    // ========================================
    console.log('');
    console.log('='.repeat(70));
    console.log('REPAIR SUMMARY');
    console.log('='.repeat(70));
    console.log(`Rolls checked:        ${stats.rollsChecked}`);
    console.log(`Rolls updated:        ${stats.rollsUpdated}`);
    console.log(`Gear entries removed: ${stats.gearEntriesRemoved}`);
    console.log(`Gear entries added:   ${stats.gearEntriesAdded}`);
    console.log('');
    
    if (isDryRun) {
      console.log('This was a DRY RUN. No changes were made.');
      console.log('Run without --dry-run to apply changes.');
    } else {
      console.log('Repair completed successfully!');
    }

  } catch (error) {
    console.error('');
    console.error('ERROR:', error.message);
    console.error(error.stack);
    process.exit(1);
  } finally {
    db.close();
  }
}

main();
