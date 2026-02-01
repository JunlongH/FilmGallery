
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const { getDbPath } = require('../config/db-config');

const dbPath = getDbPath();
console.log('Connecting to DB:', dbPath);

const db = new sqlite3.Database(dbPath);

async function run() {
  const equipLenses = await new Promise((resolve, reject) => {
    db.all("SELECT id, name FROM equip_lenses WHERE deleted_at IS NULL", (err, rows) => {
      if (err) reject(err); else resolve(rows);
    });
  });

  const fixedLensCameras = await new Promise((resolve, reject) => {
    db.all("SELECT id, name, fixed_lens_focal_length, fixed_lens_max_aperture FROM equip_cameras WHERE has_fixed_lens = 1 AND deleted_at IS NULL", (err, rows) => {
      if (err) reject(err); else resolve(rows);
    });
  });

  const uniqueShotLogLenses = await new Promise((resolve, reject) => {
    // shot_logs is stored as JSON in film_items or is it a separate table?
    // User request implies "shot logs" is a table or structure I can "map".
    // Migration 2025-12-02-add-shot-logs.js implies it might be a table or column.
    // Let's check if 'shot_logs' table exists.
    db.all("SELECT name FROM sqlite_master WHERE type='table' AND name='shot_logs'", (err, rows) => {
      if (err) reject(err);
      else if (rows.length > 0) {
        db.all("SELECT DISTINCT lens FROM shot_logs WHERE lens IS NOT NULL AND lens != ''", (err, rows) => {
           if (err) reject(err); else resolve(rows.map(r => r.lens));
        });
      } else {
        // It might be a JSON column in film_items (aka rolls/sheets/etc?)
        // Let's check film_items table
        resolve(null);
      }
    });
  });

  // Decide source
  let distinctLenses = [];
  let isJson = false;

  if (uniqueShotLogLenses === null) {
      console.log('shot_logs table not found. Checking if it is a JSON column in film_items...');
      try {
        const rows = await new Promise((resolve, reject) => {
            db.all("SELECT id, shot_logs FROM film_items WHERE shot_logs IS NOT NULL", (err, rows) => {
                if(err) reject(err); else resolve(rows);
            });
        });
        const allLenses = new Set();
        rows.forEach(row => {
            try {
                const logs = JSON.parse(row.shot_logs);
                if (Array.isArray(logs)) {
                    logs.forEach(log => {
                        if (log.lens) allLenses.add(log.lens);
                    });
                }
            } catch (e) {}
        });
        distinctLenses = Array.from(allLenses);
        isJson = true;
      } catch (e) {
        console.error("Error reading film_items:", e);
      }
  } else {
      distinctLenses = uniqueShotLogLenses;
      isJson = false;
  }
  
  processLenses(equipLenses, fixedLensCameras, distinctLenses, isJson);
}

function processLenses(equipLenses, fixedLensCameras, shotLogLenses, isJson) {
  console.log(`Found ${equipLenses.length} equipment lenses.`);
  console.log(`Found ${fixedLensCameras.length} fixed lens cameras.`);
  console.log(`Found ${shotLogLenses.length} unique lenses in shot logs.`);
  
  const standardNames = equipLenses.map(l => l.name);
  console.log('Standard Lens Names:', standardNames);

  const fixedCameraNames = fixedLensCameras.map(c => {
      const lensSpec = c.fixed_lens_focal_length 
        ? `${c.fixed_lens_focal_length}mm${c.fixed_lens_max_aperture ? ` f/${c.fixed_lens_max_aperture}` : ''}`
        : 'Fixed Lens';
      return {
          cameraName: c.name,
          lensSpec: lensSpec,
          fullName: `${c.name} ${lensSpec}` // e.g. "Ricoh GR 28mm f/2.8"
      };
  });
  console.log('Fixed Lens Cameras:', fixedCameraNames);
  
  console.log('\n--- Non-Standard Lens Names in Shot Logs ---');
  shotLogLenses.forEach(logLens => {
      // 1. Direct match with equip_lenses
      if (standardNames.includes(logLens)) return;

      // 2. Direct match with fixed Camera lens spec? (e.g. "35mm f/2.8")
      // Although multiple cameras might have same spec, it's technically a "standard" format for fixed lens.
      // But strictly speaking, we are looking for mapping to "Library" items.

      console.log(`"${logLens}"`);
      
      const suggestions = [];

      // Check standard lenses
      standardNames.forEach(n => {
          if (n.toLowerCase().includes(logLens.toLowerCase()) || logLens.toLowerCase().includes(n.toLowerCase())) {
              suggestions.push(`[Lens] ${n}`);
          }
      });

      // Check fixed cameras
      fixedCameraNames.forEach(c => {
          // Check if logLens matches camera name
          if (c.cameraName.toLowerCase().includes(logLens.toLowerCase()) || logLens.toLowerCase().includes(c.cameraName.toLowerCase())) {
              suggestions.push(`[FixedCam] ${c.cameraName} (${c.lensSpec})`);
          }
          // Check if logLens matches full spec
           if (logLens.toLowerCase().includes(c.lensSpec.toLowerCase()) && c.lensSpec.length > 3) {
              suggestions.push(`[FixedCam Spec] ${c.cameraName} (${c.lensSpec})`);
          }
      });

      if (suggestions.length > 0) {
          console.log(`   -> Potential matches: ${suggestions.join(' | ')}`);
      } else {
          console.log(`   -> No obvious match found.`);
      }
  });

  if (isJson) {
      console.log('\nNOTE: shot_logs are stored as JSON in film_items table.');
  } else {
      console.log('\nNOTE: shot_logs is a separate table.');
  }
}

run();
