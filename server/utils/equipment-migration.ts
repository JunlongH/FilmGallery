/**
 * Equipment Migration Script - TypeScript Migration
 * 
 * This script handles:
 * 1. Creating new equipment tables (cameras, lenses, flashes, film_formats)
 * 2. Migrating existing camera/lens text data to equipment entities
 * 3. Linking rolls/photos to equipment IDs
 * 
 * Designed to be idempotent - safe to run multiple times.
 */

import sqlite3 from 'sqlite3';
import path from 'path';
import fs from 'fs';

import { getDbPath } from '../config/db-config';

type DbRow = Record<string, unknown>;
interface RunResult {
  error?: Error;
  changes: number;
  lastID?: number;
}

function log(msg: string): void {
  const logPath = path.join(path.dirname(getDbPath()), 'equipment-migration.log');
  const ts = new Date().toISOString();
  fs.appendFileSync(logPath, `[${ts}] ${msg}\n`);
  console.log(`[EQUIP-MIGRATION] ${msg}`);
}

/**
 * Camera types enum - Display-friendly names
 */
export const CAMERA_TYPES = [
  'SLR',           // Single Lens Reflex (单反)
  'Rangefinder',   // Rangefinder (旁轴)
  'P&S',           // Point & Shoot / PS机/傻瓜机
  'TLR',           // Twin Lens Reflex (双反)
  'Medium Format', // Medium Format (中画幅)
  'Large Format',  // Large Format (大画幅)
  'Instant',       // Instant Camera (拍立得)
  'Half Frame',    // Half Frame (半格)
  'Other'
];

/**
 * Film formats enum
 */
interface FilmFormat {
  name: string;
  description: string;
  frame_size: string;
}

export const FILM_FORMATS: FilmFormat[] = [
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
export const LENS_MOUNTS = [
  'M42', 'Pentax K', 'Nikon F', 'Canon FD', 'Canon EF', 
  'Minolta MD', 'Minolta A', 'Leica M', 'Leica R', 'Leica L',
  'Contax/Yashica', 'Olympus OM', 'Sony A', 'Sony E',
  'Micro Four Thirds', 'Fuji X', 'Hasselblad V', 'Mamiya 645',
  'Mamiya RB/RZ', 'Pentax 645', 'Pentax 67', 'Fixed'
];

interface ParsedCamera {
  name: string;
  brand: string;
  model: string;
}

interface ParsedLens {
  name: string;
  brand: string;
  model: string;
  focal_length_min: number | null;
  focal_length_max: number | null;
  max_aperture: number | null;
}

export async function runEquipmentMigration(): Promise<void> {
  const dbPath = getDbPath();
  log(`Starting equipment migration on: ${dbPath}`);

  const db = await new Promise<sqlite3.Database>((resolve, reject) => {
    const database = new sqlite3.Database(dbPath, (err) => {
      if (err) {
        log(`Failed to open DB: ${err.message}`);
        return reject(err);
      }
      resolve(database);
    });
  });

  const run = (sql: string, params: unknown[] = []): Promise<RunResult> => new Promise((res) => {
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
        res({ error: undefined, changes: this.changes, lastID: this.lastID });
      }
    });
  });

  const all = <T = DbRow>(sql: string, params: unknown[] = []): Promise<T[]> => new Promise((res, rej) => {
    db.all(sql, params, (err, rows) => {
      if (err) rej(err);
      else res((rows as T[]) || []);
    });
  });

  const get = <T = DbRow>(sql: string, params: unknown[] = []): Promise<T | undefined> => new Promise((res, rej) => {
    db.get(sql, params, (err, row) => {
      if (err) rej(err);
      else res(row as T | undefined);
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

    // 2b. ADD NEW LENS SPECIFICATION COLUMNS (2026-01-12)
    await run(`ALTER TABLE equip_lenses ADD COLUMN max_aperture_tele REAL`);
    await run(`ALTER TABLE equip_lenses ADD COLUMN is_macro INTEGER DEFAULT 0`);
    await run(`ALTER TABLE equip_lenses ADD COLUMN magnification_ratio TEXT`);
    await run(`ALTER TABLE equip_lenses ADD COLUMN image_stabilization INTEGER DEFAULT 0`);
    log('Lens specification columns added');

    // 2c. ADD NEW CAMERA SPECIFICATION COLUMNS (2026-01-12)
    await run(`ALTER TABLE equip_cameras ADD COLUMN meter_type TEXT`);
    await run(`ALTER TABLE equip_cameras ADD COLUMN shutter_type TEXT`);
    await run(`ALTER TABLE equip_cameras ADD COLUMN shutter_speed_min TEXT`);
    await run(`ALTER TABLE equip_cameras ADD COLUMN shutter_speed_max TEXT`);
    await run(`ALTER TABLE equip_cameras ADD COLUMN weight_g REAL`);
    await run(`ALTER TABLE equip_cameras ADD COLUMN battery_type TEXT`);
    log('Camera specification columns added');

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

    await run(`ALTER TABLE rolls ADD COLUMN camera_equip_id INTEGER REFERENCES equip_cameras(id)`);
    await run(`ALTER TABLE rolls ADD COLUMN lens_equip_id INTEGER REFERENCES equip_lenses(id)`);
    await run(`ALTER TABLE rolls ADD COLUMN flash_equip_id INTEGER REFERENCES equip_flashes(id)`);
    await run(`ALTER TABLE photos ADD COLUMN camera_equip_id INTEGER REFERENCES equip_cameras(id)`);
    await run(`ALTER TABLE photos ADD COLUMN lens_equip_id INTEGER REFERENCES equip_lenses(id)`);
    await run(`ALTER TABLE photos ADD COLUMN flash_equip_id INTEGER REFERENCES equip_flashes(id)`);

    // 3b. ADD GEOLOCATION COLUMNS TO PHOTOS (2026-01-13)
    await run(`ALTER TABLE photos ADD COLUMN latitude REAL`);
    await run(`ALTER TABLE photos ADD COLUMN longitude REAL`);
    await run(`ALTER TABLE photos ADD COLUMN altitude REAL`);
    await run(`ALTER TABLE photos ADD COLUMN location_name TEXT`);
    await run(`ALTER TABLE photos ADD COLUMN country TEXT`);
    await run(`ALTER TABLE photos ADD COLUMN city TEXT`);
    log('Photo geolocation columns added');

    await run(`ALTER TABLE films ADD COLUMN format_id INTEGER REFERENCES ref_film_formats(id)`);
    await run(`ALTER TABLE film_items ADD COLUMN camera_equip_id INTEGER REFERENCES equip_cameras(id)`);
    log('Foreign key columns added');

    // ========================================
    // 4. MIGRATE EXISTING DATA
    // ========================================

    log('Starting data migration...');

    // Helper to parse camera string and extract brand/model
    const parseCameraString = (str: string | null | undefined): ParsedCamera | null => {
      if (!str) return null;
      str = str.trim();
      const parts = str.split(/\s+/);
      if (parts.length === 0) return null;
      const brand = parts[0];
      const model = parts.slice(1).join(' ') || parts[0];
      return { name: str, brand, model };
    };

    // Helper to parse lens string
    const parseLensString = (str: string | null | undefined): ParsedLens | null => {
      if (!str) return null;
      str = str.trim();
      const focalMatch = str.match(/(\d+)(?:\s*-\s*(\d+))?\s*mm/i);
      const apertureMatch = str.match(/[fF][\s/]?(\d+\.?\d*)/);
      
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
    interface CameraRow { camera: string }
    const rollCameras = await all<CameraRow>(`SELECT DISTINCT camera FROM rolls WHERE camera IS NOT NULL AND camera != '' AND camera_equip_id IS NULL`);
    log(`Found ${rollCameras.length} unique cameras in rolls`);

    for (const row of rollCameras) {
      const parsed = parseCameraString(row.camera);
      if (!parsed) continue;

      interface IdRow { id: number }
      const existing = await get<IdRow>(`SELECT id FROM equip_cameras WHERE name = ?`, [parsed.name]);
      let cameraId: number | undefined;
      
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

      if (cameraId) {
        await run(`UPDATE rolls SET camera_equip_id = ? WHERE camera = ? AND camera_equip_id IS NULL`, [cameraId, row.camera]);
      }
    }

    // 4b. Migrate cameras from photos
    const photoCameras = await all<CameraRow>(`SELECT DISTINCT camera FROM photos WHERE camera IS NOT NULL AND camera != '' AND camera_equip_id IS NULL`);
    log(`Found ${photoCameras.length} unique cameras in photos`);

    for (const row of photoCameras) {
      const parsed = parseCameraString(row.camera);
      if (!parsed) continue;

      interface IdRow { id: number }
      const existing = await get<IdRow>(`SELECT id FROM equip_cameras WHERE name = ?`, [parsed.name]);
      let cameraId: number | undefined;
      
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
    interface LoadedCameraRow { loaded_camera: string }
    const filmItemCameras = await all<LoadedCameraRow>(`SELECT DISTINCT loaded_camera FROM film_items WHERE loaded_camera IS NOT NULL AND loaded_camera != '' AND camera_equip_id IS NULL`);
    log(`Found ${filmItemCameras.length} unique cameras in film_items`);

    for (const row of filmItemCameras) {
      const parsed = parseCameraString(row.loaded_camera);
      if (!parsed) continue;

      interface IdRow { id: number }
      const existing = await get<IdRow>(`SELECT id FROM equip_cameras WHERE name = ?`, [parsed.name]);
      let cameraId: number | undefined;
      
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
    interface LensRow { lens: string }
    const rollLenses = await all<LensRow>(`SELECT DISTINCT lens FROM rolls WHERE lens IS NOT NULL AND lens != '' AND lens_equip_id IS NULL`);
    log(`Found ${rollLenses.length} unique lenses in rolls`);

    for (const row of rollLenses) {
      const parsed = parseLensString(row.lens);
      if (!parsed) continue;

      interface IdRow { id: number }
      const existing = await get<IdRow>(`SELECT id FROM equip_lenses WHERE name = ?`, [parsed.name]);
      let lensId: number | undefined;
      
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
    const photoLenses = await all<LensRow>(`SELECT DISTINCT lens FROM photos WHERE lens IS NOT NULL AND lens != '' AND lens_equip_id IS NULL`);
    log(`Found ${photoLenses.length} unique lenses in photos`);

    for (const row of photoLenses) {
      const parsed = parseLensString(row.lens);
      if (!parsed) continue;

      interface IdRow { id: number }
      const existing = await get<IdRow>(`SELECT id FROM equip_lenses WHERE name = ?`, [parsed.name]);
      let lensId: number | undefined;
      
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
    interface FilmItemLogRow { id: number; shot_logs: string }
    const filmItemsWithLogs = await all<FilmItemLogRow>(`SELECT id, shot_logs FROM film_items WHERE shot_logs IS NOT NULL AND shot_logs != ''`);
    for (const item of filmItemsWithLogs) {
      try {
        const logs = JSON.parse(item.shot_logs) as Array<{ lens?: string }>;
        if (!Array.isArray(logs)) continue;
        
        for (const logEntry of logs) {
          if (!logEntry.lens) continue;
          const parsed = parseLensString(logEntry.lens);
          if (!parsed) continue;

          interface IdRow { id: number }
          const existing = await get<IdRow>(`SELECT id FROM equip_lenses WHERE name = ?`, [parsed.name]);
          if (!existing) {
            await run(
              `INSERT INTO equip_lenses (name, brand, model, focal_length_min, focal_length_max, max_aperture) VALUES (?, ?, ?, ?, ?, ?)`,
              [parsed.name, parsed.brand, parsed.model, parsed.focal_length_min, parsed.focal_length_max, parsed.max_aperture]
            );
          }
        }
      } catch {
        // Invalid JSON, skip
      }
    }

    // 4g. Migrate film formats
    interface FilmFormatRow { id: number; format: string }
    const filmsWithFormat = await all<FilmFormatRow>(`SELECT id, format FROM films WHERE format IS NOT NULL AND format != '' AND format_id IS NULL`);
    log(`Found ${filmsWithFormat.length} films to migrate format`);

    for (const film of filmsWithFormat) {
      let formatName = film.format.trim();
      // Normalize common variations
      if (formatName === '35mm' || formatName === '35' || formatName.toLowerCase() === '135mm') {
        formatName = '135';
      } else if (formatName.toLowerCase() === 'medium format' || formatName === 'MF') {
        formatName = '120';
      }

      interface IdRow { id: number }
      const format = await get<IdRow>(`SELECT id FROM ref_film_formats WHERE name = ?`, [formatName]);
      if (format) {
        await run(`UPDATE films SET format_id = ? WHERE id = ?`, [format.id, film.id]);
      }
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

    interface CountRow { count: number }
    const cameraCount = await get<CountRow>(`SELECT COUNT(*) as count FROM equip_cameras WHERE deleted_at IS NULL`);
    const lensCount = await get<CountRow>(`SELECT COUNT(*) as count FROM equip_lenses WHERE deleted_at IS NULL`);
    const flashCount = await get<CountRow>(`SELECT COUNT(*) as count FROM equip_flashes WHERE deleted_at IS NULL`);
    const formatCount = await get<CountRow>(`SELECT COUNT(*) as count FROM ref_film_formats`);

    log(`Migration complete!`);
    log(`  - Cameras: ${cameraCount?.count ?? 0}`);
    log(`  - Lenses: ${lensCount?.count ?? 0}`);
    log(`  - Flashes: ${flashCount?.count ?? 0}`);
    log(`  - Film Formats: ${formatCount?.count ?? 0}`);

    db.close();

  } catch (err) {
    const error = err as Error;
    log(`Migration error: ${error.message}`);
    db.close();
    throw err;
  }
}

// CommonJS compatibility
module.exports = { runEquipmentMigration, CAMERA_TYPES, FILM_FORMATS, LENS_MOUNTS };
