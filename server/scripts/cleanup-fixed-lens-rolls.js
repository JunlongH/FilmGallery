/**
 * Cleanup Script: Fixed Lens Camera Rolls
 * 
 * This script identifies and fixes rolls where:
 * 1. The roll is linked to a camera with has_fixed_lens=1
 * 2. The roll also has a lens_equip_id set (which is incorrect)
 * 
 * For fixed-lens cameras, the lens should be implicit (derived from camera data),
 * not explicitly selected. This script nullifies the lens_equip_id for such rolls.
 * 
 * Run with: node server/scripts/cleanup-fixed-lens-rolls.js
 */

const sqlite3 = require('sqlite3');
const path = require('path');
const fs = require('fs');

// Get DB path from config
let dbPath;
try {
  const { getDbPath } = require('../config/db-config');
  dbPath = getDbPath();
} catch (e) {
  // Fallback to default location
  dbPath = path.join(__dirname, '..', 'data', 'film_gallery.db');
}

console.log('='.repeat(60));
console.log('Fixed Lens Camera Rolls Cleanup Script');
console.log('='.repeat(60));
console.log(`Database: ${dbPath}`);
console.log('');

if (!fs.existsSync(dbPath)) {
  console.error('ERROR: Database file not found!');
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

async function main() {
  try {
    // 1. Find rolls with fixed-lens cameras that have explicit lens selection
    console.log('Step 1: Finding affected rolls...');
    
    const affectedRolls = await allAsync(`
      SELECT 
        r.id as roll_id,
        r.title as roll_title,
        r.camera,
        r.lens,
        r.camera_equip_id,
        r.lens_equip_id,
        c.brand || ' ' || c.model as camera_name,
        c.has_fixed_lens,
        c.fixed_lens_focal_length,
        c.fixed_lens_max_aperture,
        l.brand || ' ' || l.model as lens_name
      FROM rolls r
      JOIN equip_cameras c ON r.camera_equip_id = c.id
      LEFT JOIN equip_lenses l ON r.lens_equip_id = l.id
      WHERE c.has_fixed_lens = 1 AND r.lens_equip_id IS NOT NULL
    `);

    if (affectedRolls.length === 0) {
      console.log('✓ No affected rolls found. Database is clean.');
      db.close();
      return;
    }

    console.log(`Found ${affectedRolls.length} rolls with incorrect lens selection:`);
    console.log('');

    for (const roll of affectedRolls) {
      console.log(`  Roll #${roll.roll_id}: "${roll.roll_title || 'Untitled'}"`);
      console.log(`    Camera: ${roll.camera_name} (Fixed lens: ${roll.fixed_lens_focal_length}mm f/${roll.fixed_lens_max_aperture})`);
      console.log(`    Incorrectly selected lens: ${roll.lens_name}`);
    }
    console.log('');

    // 2. Fix the rolls - set lens_equip_id to NULL and update lens text to fixed lens description
    console.log('Step 2: Fixing lens selections for fixed-lens cameras...');
    
    // Update each roll individually to set the correct fixed lens text
    let updatedCount = 0;
    for (const roll of affectedRolls) {
      const fixedLensText = `${roll.fixed_lens_focal_length}mm f/${roll.fixed_lens_max_aperture}`;
      await runAsync(`
        UPDATE rolls 
        SET lens_equip_id = NULL, 
            lens = ?,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `, [fixedLensText, roll.roll_id]);
      updatedCount++;
    }

    console.log(`✓ Updated ${updatedCount} rolls.`);
    console.log('');

    // 3. Also check film_items for consistency
    console.log('Step 3: Checking film_items...');
    
    const affectedFilmItems = await allAsync(`
      SELECT COUNT(*) as count
      FROM film_items fi
      JOIN equip_cameras c ON fi.camera_equip_id = c.id
      WHERE c.has_fixed_lens = 1
    `);

    console.log(`  Found ${affectedFilmItems[0].count} film_items loaded on fixed-lens cameras (OK, no action needed).`);
    console.log('');

    // 4. Summary
    console.log('='.repeat(60));
    console.log('Cleanup Complete!');
    console.log('='.repeat(60));
    console.log('');
    console.log('Summary:');
    console.log(`  - Rolls fixed: ${updatedCount}`);
    console.log('');
    console.log('Note: Fixed-lens camera rolls now rely on implicit lens data.');
    console.log('The Statistics page will correctly attribute shots to each camera\'s fixed lens.');
    
    db.close();
  } catch (err) {
    console.error('ERROR:', err.message);
    db.close();
    process.exit(1);
  }
}

main();
