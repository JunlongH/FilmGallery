
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const { getDbPath } = require('../config/db-config');

const dbPath = getDbPath();
console.log('Connecting to DB:', dbPath);

const db = new sqlite3.Database(dbPath);

async function run() {
  try {
    // 1. Get Fixed Lens Cameras for mapping
    const fixedCameras = await query("SELECT name, fixed_lens_focal_length, fixed_lens_max_aperture FROM equip_cameras WHERE has_fixed_lens = 1 AND deleted_at IS NULL");
    
    const cleaningMap = new Map();
    const cameraSpecs = new Map(); // name -> spec

    console.log('--- Fixed Lens Camera Mappings ---');
    fixedCameras.forEach(c => {
      if (c.fixed_lens_focal_length) {
        const spec = `${c.fixed_lens_focal_length}mm${c.fixed_lens_max_aperture ? ` f/${c.fixed_lens_max_aperture.toString()}` : ''}`;
        
        // Map: Camera Name -> Lens Spec
        cleaningMap.set(c.name, spec);
        cameraSpecs.set(c.name, spec);
        
        console.log(`[Camera] "${c.name}" => Target Spec: "${spec}"`);
      }
    });

    // 2. Get Film Items with Shot Logs
    const items = await query("SELECT id, shot_logs FROM film_items WHERE shot_logs IS NOT NULL AND shot_logs != '' AND shot_logs != '[]'");
    
    let updateCount = 0;
    let logUpdateCount = 0;
    const updates = [];

    console.log(`\nChecking ${items.length} items with shot logs...`);

    for (const item of items) {
      let logs;
      try {
        logs = JSON.parse(item.shot_logs);
      } catch (e) {
        console.error(`Failed to parse logs for item ${item.id}`);
        continue;
      }

      if (!Array.isArray(logs) || logs.length === 0) continue;

      let hasChanges = false;
      
      logs.forEach(log => {
        if (!log.lens) return;
        
        // Exact Camera Name match
        if (cleaningMap.has(log.lens)) {
           const target = cleaningMap.get(log.lens);
           if (log.lens !== target) {
             console.log(`[Plan Update] Item ${item.id}: "${log.lens}" -> "${target}"`);
             log.lens = target;
             hasChanges = true;
             logUpdateCount++;
           }
        }
      });

      if (hasChanges) {
        updates.push({
            id: item.id,
            shot_logs: JSON.stringify(logs)
        });
      }
    }
    
    // Execute updates sequentially
    if (updates.length > 0) {
        console.log(`\nExecuting ${updates.length} updates...`);
        for (const update of updates) {
            await runSql("UPDATE film_items SET shot_logs = ? WHERE id = ?", [update.shot_logs, update.id]);
            updateCount++;
        }
    }

    console.log(`\nData Cleanup Complete.`);
    console.log(`Updated ${logUpdateCount} log entries across ${updateCount} film items.`);
    
  } catch (err) {
    console.error('Error:', err);
  } finally {
    db.close();
  }
}

function query(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) reject(err); else resolve(rows);
    });
  });
}

function runSql(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function(err) {
      if (err) reject(err); else resolve(this);
    });
  });
}

run();
