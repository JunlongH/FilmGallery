/**
 * Equipment Migration Script
 * 
 * This script handles:
 * 1. Creating new equipment tables (cameras, lenses, flashes, film_formats)
 * 2. Migrating existing camera/lens text data to equipment entities
 * 3. Linking rolls/photos to equipment IDs
 * 
 * Designed to be idempotent - safe to run multiple times.
 */

const sqlite3 = require('sqlite3');
const path = require('path');
const fs = require('fs');
const { getDbPath } = require('../config/db-config');

function log(msg) {
  const logPath = path.join(path.dirname(getDbPath()), 'equipment-migration.log');
  const ts = new Date().toISOString();
  fs.appendFileSync(logPath, `[${ts}] ${msg}\n`);
  console.log(`[EQUIP-MIGRATION] ${msg}`);
}

/**
 * Camera types enum
 */
const CAMERA_TYPES = [
  'slr',           // Single Lens Reflex (单反)
  'rangefinder',   // Rangefinder (旁轴)
  'point_and_shoot', // PS机/傻瓜机
  'tlr',           // Twin Lens Reflex (双反)
  'medium_format', // Medium Format (中画幅)
  'large_format',  // Large Format (大画幅)
  'instant',       // Instant Camera (拍立得)
  'half_frame',    // Half Frame (半格)
  'other'
];

/**
 * Film formats enum
 */
const FILM_FORMATS = [
  { name: '135', description: '35mm film (standard)', frame_size: '24x36mm' },
  { name: '120', description: 'Medium format roll film', frame_size: 'varies' },
  { name: '220', description: 'Medium format (double length)', frame_size: 'varies' },
  { name: '110', description: 'Pocket Instamatic', frame_size: '13x17mm' },
  { name: '127', description: 'Vest Pocket', frame_size: '40x40mm' },
  { name: 'Large Format 4x5', description: '4x5 inch sheet film', frame_size: '4x5 inch' },
  { name: 'Large Format 8x10', description: '8x10 inch sheet film', frame_size: '8x10 inch' },
  { name: 'Instant', description: 'Polaroid/Instax', frame_size: 'varies' },
  { name: 'APS', description: 'Advanced Photo System', frame_size: '16.7x30.2mm' },
  { name: 'Half Frame', description: '35mm half frame', frame_size: '18x24mm' }
];

/**
 * Common lens mounts
 */
const LENS_MOUNTS = [
  'M42', 'Pentax K', 'Nikon F', 'Canon FD', 'Canon EF', 
  'Minolta MD', 'Minolta A', 'Leica M', 'Leica R', 'Leica L',
  'Contax/Yashica', 'Olympus OM', 'Sony A', 'Sony E',
  'Micro Four Thirds', 'Fuji X', 'Hasselblad V', 'Mamiya 645',
  'Mamiya RB/RZ', 'Pentax 645', 'Pentax 67', 'Fixed'
];

function runEquipmentMigration() {
  return new Promise(async (resolve, reject) => {
    const dbPath = getDbPath();
    log(`Starting equipment migration on: ${dbPath}`);

    const db = new sqlite3.Database(dbPath, (err) => {
      if (err) {
        log(`Failed to open DB: ${err.message}`);
        return reject(err);
      }
    });

    const run = (sql, params = []) => new Promise((res) => {
      db.run(sql, params, function(err) {
        if (err) {
          // Log but don't fail - many errors are expected (duplicate column, etc.)
          if (!err.message.includes('duplicate column') && 
              !err.message.includes('already exists') &&
              !err.message.includes('UNIQUE constraint failed')) {
            log(`SQL Warning: ${err.message}`);
          }
          res({ error: err, changes: 0 });
        } else {
          res({ error: null, changes: this.changes, lastID: this.lastID });
        }
      });
    });

    const all = (sql, params = []) => new Promise((res, rej) => {
      db.all(sql, params, (err, rows) => {
        if (err) rej(err);
        else res(rows || []);
      });
    });

    const get = (sql, params = []) => new Promise((res, rej) => {
      db.get(sql, params, (err, row) => {
        if (err) rej(err);
        else res(row);
      });
    });

    try {
      // ========================================
      // 1. CREATE REFERENCE TABLES
      // ========================================
      
      // Film Formats table
      await run(`CREATE TABLE IF NOT EXISTS ref_film_formats (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL UNIQUE,
        description TEXT,
        frame_size TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )`);

      // Seed film formats
      for (const fmt of FILM_FORMATS) {
        await run(
          `INSERT OR IGNORE INTO ref_film_formats (name, description, frame_size) VALUES (?, ?, ?)`,
          [fmt.name, fmt.description, fmt.frame_size]
        );
      }
      log('Film formats table ready');

      // ========================================
      // 2. CREATE EQUIPMENT TABLES
      // ========================================

      // Cameras table - comprehensive schema
      await run(`CREATE TABLE IF NOT EXISTS equip_cameras (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        brand TEXT,
        model TEXT,
        type TEXT,
        format_id INTEGER,
        sub_format TEXT,
        mount TEXT,
        has_fixed_lens INTEGER DEFAULT 0,
        fixed_lens_focal_length REAL,
        fixed_lens_max_aperture REAL,
        fixed_lens_min_aperture REAL,
        has_built_in_flash INTEGER DEFAULT 0,
        flash_gn REAL,
        production_year_start INTEGER,
        production_year_end INTEGER,
        serial_number TEXT,
        purchase_date TEXT,
        purchase_price REAL,
        condition TEXT,
        notes TEXT,
        image_path TEXT,
        status TEXT DEFAULT 'owned',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME,
        deleted_at DATETIME,
        FOREIGN KEY(format_id) REFERENCES ref_film_formats(id)
      )`);
      log('Cameras table ready');

      // Lenses table
      await run(`CREATE TABLE IF NOT EXISTS equip_lenses (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        brand TEXT,
        model TEXT,
        focal_length_min REAL,
        focal_length_max REAL,
        max_aperture REAL,
        min_aperture REAL,
        mount TEXT,
        focus_type TEXT DEFAULT 'manual',
        min_focus_distance REAL,
        filter_size REAL,
        weight_g REAL,
        elements INTEGER,
        groups INTEGER,
        blade_count INTEGER,
        production_year_start INTEGER,
        production_year_end INTEGER,
        serial_number TEXT,
        purchase_date TEXT,
        purchase_price REAL,
        condition TEXT,
        notes TEXT,
        image_path TEXT,
        status TEXT DEFAULT 'owned',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME,
        deleted_at DATETIME
      )`);
      log('Lenses table ready');

      // Flashes table
      await run(`CREATE TABLE IF NOT EXISTS equip_flashes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        brand TEXT,
        model TEXT,
        guide_number REAL,
        ttl_compatible INTEGER DEFAULT 0,
        has_auto_mode INTEGER DEFAULT 0,
        swivel_head INTEGER DEFAULT 0,
        bounce_head INTEGER DEFAULT 0,
        power_source TEXT,
        recycle_time REAL,
        serial_number TEXT,
        purchase_date TEXT,
        purchase_price REAL,
        condition TEXT,
        notes TEXT,
        image_path TEXT,
        status TEXT DEFAULT 'owned',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME,
        deleted_at DATETIME
      )`);
      log('Flashes table ready');

      // ========================================
      // 3. ADD FOREIGN KEY COLUMNS TO EXISTING TABLES
      // ========================================

      // Add equipment ID columns to rolls
      await run(`ALTER TABLE rolls ADD COLUMN camera_equip_id INTEGER REFERENCES equip_cameras(id)`);
      await run(`ALTER TABLE rolls ADD COLUMN lens_equip_id INTEGER REFERENCES equip_lenses(id)`);
      await run(`ALTER TABLE rolls ADD COLUMN flash_equip_id INTEGER REFERENCES equip_flashes(id)`);

      // Add equipment ID columns to photos  
      await run(`ALTER TABLE photos ADD COLUMN camera_equip_id INTEGER REFERENCES equip_cameras(id)`);
      await run(`ALTER TABLE photos ADD COLUMN lens_equip_id INTEGER REFERENCES equip_lenses(id)`);
      await run(`ALTER TABLE photos ADD COLUMN flash_equip_id INTEGER REFERENCES equip_flashes(id)`);

      // Add format_id to films table
      await run(`ALTER TABLE films ADD COLUMN format_id INTEGER REFERENCES ref_film_formats(id)`);

      // Add equipment ID to film_items for loaded_camera
      await run(`ALTER TABLE film_items ADD COLUMN camera_equip_id INTEGER REFERENCES equip_cameras(id)`);

      log('Foreign key columns added');

      // ========================================
      // 4. MIGRATE EXISTING DATA
      // ========================================

      log('Starting data migration...');

      // Helper to parse camera string and extract brand/model
      const parseCameraString = (str) => {
        if (!str) return null;
        str = str.trim();
        // Common patterns: "Brand Model", "Brand Model TTL", etc.
        const parts = str.split(/\s+/);
        if (parts.length === 0) return null;
        const brand = parts[0];
        const model = parts.slice(1).join(' ') || parts[0];
        return { name: str, brand, model };
      };

      // Helper to parse lens string
      const parseLensString = (str) => {
        if (!str) return null;
        str = str.trim();
        // Try to extract focal length and aperture from common patterns
        // e.g., "Pentax M 50mm f/1.7", "Zeiss 50/1.4", "Canon 50mm F1.8"
        const focalMatch = str.match(/(\d+)(?:\s*-\s*(\d+))?\s*mm/i);
        const apertureMatch = str.match(/[fF][\s\/]?(\d+\.?\d*)/);
        
        const parts = str.split(/\s+/);
        const brand = parts[0];
        
        return {
          name: str,
          brand,
          model: str,
          focal_length_min: focalMatch ? parseInt(focalMatch[1]) : null,
          focal_length_max: focalMatch && focalMatch[2] ? parseInt(focalMatch[2]) : (focalMatch ? parseInt(focalMatch[1]) : null),
          max_aperture: apertureMatch ? parseFloat(apertureMatch[1]) : null
        };
      };

      // 4a. Migrate cameras from rolls
      const rollCameras = await all(`SELECT DISTINCT camera FROM rolls WHERE camera IS NOT NULL AND camera != '' AND camera_equip_id IS NULL`);
      log(`Found ${rollCameras.length} unique cameras in rolls`);

      for (const row of rollCameras) {
        const parsed = parseCameraString(row.camera);
        if (!parsed) continue;

        // Check if already exists
        const existing = await get(`SELECT id FROM equip_cameras WHERE name = ?`, [parsed.name]);
        let cameraId;
        
        if (existing) {
          cameraId = existing.id;
        } else {
          const result = await run(
            `INSERT INTO equip_cameras (name, brand, model) VALUES (?, ?, ?)`,
            [parsed.name, parsed.brand, parsed.model]
          );
          cameraId = result.lastID;
          log(`Created camera: ${parsed.name} (ID: ${cameraId})`);
        }

        // Update rolls with this camera
        if (cameraId) {
          await run(`UPDATE rolls SET camera_equip_id = ? WHERE camera = ? AND camera_equip_id IS NULL`, [cameraId, row.camera]);
        }
      }

      // 4b. Migrate cameras from photos
      const photoCameras = await all(`SELECT DISTINCT camera FROM photos WHERE camera IS NOT NULL AND camera != '' AND camera_equip_id IS NULL`);
      log(`Found ${photoCameras.length} unique cameras in photos`);

      for (const row of photoCameras) {
        const parsed = parseCameraString(row.camera);
        if (!parsed) continue;

        const existing = await get(`SELECT id FROM equip_cameras WHERE name = ?`, [parsed.name]);
        let cameraId;
        
        if (existing) {
          cameraId = existing.id;
        } else {
          const result = await run(
            `INSERT INTO equip_cameras (name, brand, model) VALUES (?, ?, ?)`,
            [parsed.name, parsed.brand, parsed.model]
          );
          cameraId = result.lastID;
          log(`Created camera from photos: ${parsed.name} (ID: ${cameraId})`);
        }

        if (cameraId) {
          await run(`UPDATE photos SET camera_equip_id = ? WHERE camera = ? AND camera_equip_id IS NULL`, [cameraId, row.camera]);
        }
      }

      // 4c. Migrate cameras from film_items (loaded_camera)
      const filmItemCameras = await all(`SELECT DISTINCT loaded_camera FROM film_items WHERE loaded_camera IS NOT NULL AND loaded_camera != '' AND camera_equip_id IS NULL`);
      log(`Found ${filmItemCameras.length} unique cameras in film_items`);

      for (const row of filmItemCameras) {
        const parsed = parseCameraString(row.loaded_camera);
        if (!parsed) continue;

        const existing = await get(`SELECT id FROM equip_cameras WHERE name = ?`, [parsed.name]);
        let cameraId;
        
        if (existing) {
          cameraId = existing.id;
        } else {
          const result = await run(
            `INSERT INTO equip_cameras (name, brand, model) VALUES (?, ?, ?)`,
            [parsed.name, parsed.brand, parsed.model]
          );
          cameraId = result.lastID;
          log(`Created camera from film_items: ${parsed.name} (ID: ${cameraId})`);
        }

        if (cameraId) {
          await run(`UPDATE film_items SET camera_equip_id = ? WHERE loaded_camera = ? AND camera_equip_id IS NULL`, [cameraId, row.loaded_camera]);
        }
      }

      // 4d. Migrate lenses from rolls
      const rollLenses = await all(`SELECT DISTINCT lens FROM rolls WHERE lens IS NOT NULL AND lens != '' AND lens_equip_id IS NULL`);
      log(`Found ${rollLenses.length} unique lenses in rolls`);

      for (const row of rollLenses) {
        const parsed = parseLensString(row.lens);
        if (!parsed) continue;

        const existing = await get(`SELECT id FROM equip_lenses WHERE name = ?`, [parsed.name]);
        let lensId;
        
        if (existing) {
          lensId = existing.id;
        } else {
          const result = await run(
            `INSERT INTO equip_lenses (name, brand, model, focal_length_min, focal_length_max, max_aperture) VALUES (?, ?, ?, ?, ?, ?)`,
            [parsed.name, parsed.brand, parsed.model, parsed.focal_length_min, parsed.focal_length_max, parsed.max_aperture]
          );
          lensId = result.lastID;
          log(`Created lens: ${parsed.name} (ID: ${lensId})`);
        }

        if (lensId) {
          await run(`UPDATE rolls SET lens_equip_id = ? WHERE lens = ? AND lens_equip_id IS NULL`, [lensId, row.lens]);
        }
      }

      // 4e. Migrate lenses from photos
      const photoLenses = await all(`SELECT DISTINCT lens FROM photos WHERE lens IS NOT NULL AND lens != '' AND lens_equip_id IS NULL`);
      log(`Found ${photoLenses.length} unique lenses in photos`);

      for (const row of photoLenses) {
        const parsed = parseLensString(row.lens);
        if (!parsed) continue;

        const existing = await get(`SELECT id FROM equip_lenses WHERE name = ?`, [parsed.name]);
        let lensId;
        
        if (existing) {
          lensId = existing.id;
        } else {
          const result = await run(
            `INSERT INTO equip_lenses (name, brand, model, focal_length_min, focal_length_max, max_aperture) VALUES (?, ?, ?, ?, ?, ?)`,
            [parsed.name, parsed.brand, parsed.model, parsed.focal_length_min, parsed.focal_length_max, parsed.max_aperture]
          );
          lensId = result.lastID;
          log(`Created lens from photos: ${parsed.name} (ID: ${lensId})`);
        }

        if (lensId) {
          await run(`UPDATE photos SET lens_equip_id = ? WHERE lens = ? AND lens_equip_id IS NULL`, [lensId, row.lens]);
        }
      }

      // 4f. Migrate lenses from shot_logs in film_items
      const filmItemsWithLogs = await all(`SELECT id, shot_logs FROM film_items WHERE shot_logs IS NOT NULL AND shot_logs != ''`);
      for (const item of filmItemsWithLogs) {
        try {
          const logs = JSON.parse(item.shot_logs);
          if (!Array.isArray(logs)) continue;
          
          for (const log of logs) {
            if (!log.lens) continue;
            const parsed = parseLensString(log.lens);
            if (!parsed) continue;

            const existing = await get(`SELECT id FROM equip_lenses WHERE name = ?`, [parsed.name]);
            if (!existing) {
              await run(
                `INSERT INTO equip_lenses (name, brand, model, focal_length_min, focal_length_max, max_aperture) VALUES (?, ?, ?, ?, ?, ?)`,
                [parsed.name, parsed.brand, parsed.model, parsed.focal_length_min, parsed.focal_length_max, parsed.max_aperture]
              );
            }
          }
        } catch (e) {
          // Invalid JSON, skip
        }
      }

      // 4g. Migrate film formats (only if films table has format column)
      try {
        const filmsTableInfo = await all(`PRAGMA table_info(films)`);
        const hasFormatColumn = filmsTableInfo.some(col => col.name === 'format');
        const hasFormatIdColumn = filmsTableInfo.some(col => col.name === 'format_id');
        
        if (hasFormatColumn && hasFormatIdColumn) {
          const filmsWithFormat = await all(`SELECT id, format FROM films WHERE format IS NOT NULL AND format != '' AND format_id IS NULL`);
          log(`Found ${filmsWithFormat.length} films to migrate format`);

          for (const film of filmsWithFormat) {
            // Try to match format
            let formatName = film.format.trim();
            // Normalize common variations
            if (formatName === '35mm' || formatName === '35' || formatName.toLowerCase() === '135mm') {
              formatName = '135';
            } else if (formatName.toLowerCase() === 'medium format' || formatName === 'MF') {
              formatName = '120';
            }

            const format = await get(`SELECT id FROM ref_film_formats WHERE name = ?`, [formatName]);
            if (format) {
              await run(`UPDATE films SET format_id = ? WHERE id = ?`, [format.id, film.id]);
            }
          }
        } else {
          log(`Skipping film format migration - format column not found in films table`);
        }
      } catch (e) {
        log(`Skipping film format migration due to error: ${e.message}`);
      }

      // ========================================
      // 5. CREATE INDEXES
      // ========================================

      await run(`CREATE INDEX IF NOT EXISTS idx_cameras_name ON equip_cameras(name)`);
      await run(`CREATE INDEX IF NOT EXISTS idx_cameras_brand ON equip_cameras(brand)`);
      await run(`CREATE INDEX IF NOT EXISTS idx_cameras_mount ON equip_cameras(mount)`);
      await run(`CREATE INDEX IF NOT EXISTS idx_cameras_deleted ON equip_cameras(deleted_at)`);

      await run(`CREATE INDEX IF NOT EXISTS idx_lenses_name ON equip_lenses(name)`);
      await run(`CREATE INDEX IF NOT EXISTS idx_lenses_brand ON equip_lenses(brand)`);
      await run(`CREATE INDEX IF NOT EXISTS idx_lenses_mount ON equip_lenses(mount)`);
      await run(`CREATE INDEX IF NOT EXISTS idx_lenses_deleted ON equip_lenses(deleted_at)`);

      await run(`CREATE INDEX IF NOT EXISTS idx_flashes_name ON equip_flashes(name)`);
      await run(`CREATE INDEX IF NOT EXISTS idx_flashes_deleted ON equip_flashes(deleted_at)`);

      await run(`CREATE INDEX IF NOT EXISTS idx_rolls_camera_equip ON rolls(camera_equip_id)`);
      await run(`CREATE INDEX IF NOT EXISTS idx_rolls_lens_equip ON rolls(lens_equip_id)`);
      await run(`CREATE INDEX IF NOT EXISTS idx_photos_camera_equip ON photos(camera_equip_id)`);
      await run(`CREATE INDEX IF NOT EXISTS idx_photos_lens_equip ON photos(lens_equip_id)`);

      log('Indexes created');

      // ========================================
      // 6. SUMMARY
      // ========================================

      const cameraCount = await get(`SELECT COUNT(*) as count FROM equip_cameras WHERE deleted_at IS NULL`);
      const lensCount = await get(`SELECT COUNT(*) as count FROM equip_lenses WHERE deleted_at IS NULL`);
      const flashCount = await get(`SELECT COUNT(*) as count FROM equip_flashes WHERE deleted_at IS NULL`);
      const formatCount = await get(`SELECT COUNT(*) as count FROM ref_film_formats`);

      log(`Migration complete!`);
      log(`  - Cameras: ${cameraCount.count}`);
      log(`  - Lenses: ${lensCount.count}`);
      log(`  - Flashes: ${flashCount.count}`);
      log(`  - Film Formats: ${formatCount.count}`);

      db.close();
      resolve();

    } catch (err) {
      log(`Migration error: ${err.message}`);
      db.close();
      reject(err);
    }
  });
}

module.exports = { runEquipmentMigration, CAMERA_TYPES, FILM_FORMATS, LENS_MOUNTS };
