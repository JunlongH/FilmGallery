/**
 * Equipment Data Cleanup Script
 * 
 * This script cleans up incorrect entries in equip_lenses table:
 * 1. Removes PS camera entries that shouldn't be in the lens table
 * 2. Removes duplicate lens entries
 * 3. Fixes brand/model formatting issues
 * 
 * Run with: 
 *   node server/scripts/cleanup-equipment-data.js [--dry-run]
 */

const sqlite3 = require('sqlite3');
const path = require('path');
const fs = require('fs');

const isDryRun = process.argv.includes('--dry-run');

// Get DB path
let dbPath;
try {
  const { getDbPath } = require('../config/db-config');
  dbPath = getDbPath();
} catch (e) {
  dbPath = path.join(__dirname, '..', 'data', 'film_gallery.db');
}

console.log('='.repeat(70));
console.log('Equipment Data Cleanup Script');
console.log('='.repeat(70));
console.log(`Mode: ${isDryRun ? 'DRY RUN' : 'LIVE'}`);
console.log(`Database: ${dbPath}`);
console.log('');

if (!fs.existsSync(dbPath)) {
  console.error('ERROR: Database file not found!');
  process.exit(1);
}

const db = new sqlite3.Database(dbPath);

const allAsync = (sql, params = []) => new Promise((resolve, reject) => {
  db.all(sql, params, (err, rows) => err ? reject(err) : resolve(rows));
});

const runAsync = (sql, params = []) => new Promise((resolve, reject) => {
  db.run(sql, params, function(err) { err ? reject(err) : resolve({ changes: this.changes }); });
});

async function main() {
  const stats = {
    lensesRemoved: 0,
    lensesUpdated: 0,
    rollGearCleaned: 0
  };

  try {
    // ========================================
    // Step 1: Find PS camera entries in equip_lenses (they shouldn't be there)
    // ========================================
    console.log('Step 1: Finding PS camera entries in equip_lenses...');
    
    const fixedLensCameras = await allAsync(`
      SELECT id, brand, model, name FROM equip_cameras WHERE has_fixed_lens = 1
    `);
    
    const psNames = fixedLensCameras.map(c => [c.brand, c.model, c.name]).flat().filter(Boolean);
    
    const suspiciousLenses = await allAsync(`
      SELECT * FROM equip_lenses 
      WHERE name LIKE '%Jelly Camera%' 
         OR name LIKE '%BigMini%' 
         OR name LIKE '%FF-3D%'
         OR (brand = model)
         OR model LIKE brand || '%'
    `);
    
    console.log(`Found ${suspiciousLenses.length} suspicious lens entries:`);
    suspiciousLenses.forEach(l => {
      console.log(`  ID ${l.id}: brand="${l.brand}" model="${l.model}" name="${l.name}"`);
    });
    
    // ========================================
    // Step 2: Check for lens usage before deletion
    // ========================================
    console.log('\nStep 2: Checking lens usage in rolls...');
    
    for (const lens of suspiciousLenses) {
      const usage = await allAsync(
        'SELECT COUNT(*) as cnt FROM rolls WHERE lens_equip_id = ?', 
        [lens.id]
      );
      const usageCount = usage[0]?.cnt || 0;
      
      if (usageCount > 0) {
        console.log(`  ID ${lens.id} "${lens.name}" is used by ${usageCount} rolls - will nullify lens_equip_id`);
        if (!isDryRun) {
          await runAsync('UPDATE rolls SET lens_equip_id = NULL WHERE lens_equip_id = ?', [lens.id]);
        }
      }
    }
    
    // ========================================
    // Step 3: Remove PS camera entries from equip_lenses
    // ========================================
    console.log('\nStep 3: Removing PS camera entries from equip_lenses...');
    
    for (const lens of suspiciousLenses) {
      console.log(`  Deleting ID ${lens.id}: "${lens.name}"`);
      if (!isDryRun) {
        await runAsync('DELETE FROM equip_lenses WHERE id = ?', [lens.id]);
        stats.lensesRemoved++;
      }
    }
    
    // ========================================
    // Step 4: Find and remove duplicate lens entries
    // ========================================
    console.log('\nStep 4: Finding duplicate lens entries...');
    
    const duplicates = await allAsync(`
      SELECT name, COUNT(*) as cnt, GROUP_CONCAT(id) as ids
      FROM equip_lenses 
      WHERE name NOT IN ('', '-', '--', '—')
      GROUP BY LOWER(TRIM(name))
      HAVING cnt > 1
    `);
    
    if (duplicates.length > 0) {
      console.log(`Found ${duplicates.length} duplicate lens names:`);
      for (const dup of duplicates) {
        console.log(`  "${dup.name}" appears ${dup.cnt} times (IDs: ${dup.ids})`);
        
        // Keep the first ID, remove the rest
        const ids = dup.ids.split(',').map(Number);
        const keepId = ids[0];
        const removeIds = ids.slice(1);
        
        // Update rolls to use the kept ID
        for (const removeId of removeIds) {
          if (!isDryRun) {
            await runAsync('UPDATE rolls SET lens_equip_id = ? WHERE lens_equip_id = ?', [keepId, removeId]);
            await runAsync('DELETE FROM equip_lenses WHERE id = ?', [removeId]);
            stats.lensesRemoved++;
          }
        }
      }
    } else {
      console.log('No duplicates found.');
    }
    
    // ========================================
    // Step 5: Clean up roll_gear fragmented entries
    // ========================================
    console.log('\nStep 5: Cleaning roll_gear fragmented entries...');
    
    // Remove entries that look like partial specs without camera name
    const fragmentedPatterns = [
      "^\\d+mm$",                    // "35mm" alone
      "^\\d+\\.?\\d*mm f/[\\d.]+$",  // "35mm f/3.5" alone without camera name
    ];
    
    const fragmented = await allAsync(`
      SELECT id, roll_id, value FROM roll_gear 
      WHERE type = 'lens' AND (
        value GLOB '[0-9]*mm' OR
        value GLOB '[0-9]*mm f/*'
      ) AND value NOT LIKE '% %mm%'
    `);
    
    if (fragmented.length > 0) {
      console.log(`Found ${fragmented.length} fragmented lens entries:`);
      fragmented.forEach(f => console.log(`  ID ${f.id}: "${f.value}"`));
      
      if (!isDryRun) {
        for (const f of fragmented) {
          await runAsync('DELETE FROM roll_gear WHERE id = ?', [f.id]);
          stats.rollGearCleaned++;
        }
      }
    } else {
      console.log('No fragmented entries found.');
    }
    
    // ========================================
    // Summary
    // ========================================
    console.log('\n' + '='.repeat(70));
    console.log('CLEANUP SUMMARY');
    console.log('='.repeat(70));
    console.log(`Lenses removed:     ${isDryRun ? suspiciousLenses.length + ' (would be)' : stats.lensesRemoved}`);
    console.log(`Roll gear cleaned:  ${isDryRun ? fragmented.length + ' (would be)' : stats.rollGearCleaned}`);
    console.log('');
    
    if (isDryRun) {
      console.log('This was a DRY RUN. No changes were made.');
      console.log('Run without --dry-run to apply changes.');
    } else {
      console.log('Cleanup completed successfully!');
    }
    
  } catch (error) {
    console.error('ERROR:', error.message);
    console.error(error.stack);
    process.exit(1);
  } finally {
    db.close();
  }
}

main();
