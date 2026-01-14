/**
 * Film Structure Migration Script - TypeScript Migration
 * 
 * This script handles:
 * 1. Adding new columns to films table (brand, format, thumbnail_url, process, deleted_at, category)
 * 2. Migrating existing data (parsing name to extract brand, updating paths)
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
  const logPath = path.join(path.dirname(getDbPath()), 'film-struct-migration.log');
  const ts = new Date().toISOString();
  fs.appendFileSync(logPath, `[${ts}] ${msg}\n`);
  console.log(`[FILM-STRUCT] ${msg}`);
}

/**
 * Film categories enum
 */
export const FILM_CATEGORIES = [
  'color-negative',   // Color Negative (彩色负片) - C-41
  'color-reversal',   // Color Reversal/Slide (彩色反转片) - E-6
  'bw-negative',      // Black & White Negative (黑白负片)
  'bw-reversal',      // Black & White Reversal (黑白反转片)
  'instant',          // Instant Film (拍立得)
  'cine',             // Cinema Film (电影胶片) - ECN-2
  'other'
];

/**
 * Film formats (画幅)
 */
export const FILM_FORMATS = [
  '135',              // 35mm standard
  '120',              // Medium format
  '220',              // Medium format double length
  '110',              // Pocket Instamatic
  '127',              // Vest Pocket
  '4x5',              // Large format 4x5
  '8x10',             // Large format 8x10
  'Instant',          // Polaroid/Instax
  'APS',              // Advanced Photo System
  'Half Frame',       // 35mm half frame
  'Super 8',          // Super 8 cine
  '16mm',             // 16mm cine
  '35mm Cine',        // 35mm cinema
  'Other'
];

/**
 * Common film brands for auto-detection
 */
export const KNOWN_BRANDS = [
  'Kodak', 'Fujifilm', 'Fuji', 'Ilford', 'Agfa', 'Lomography', 'Lomo',
  'CineStill', 'Cinestill', 'Foma', 'Rollei', 'Bergger', 'ORWO',
  'Polaroid', 'Instax', 'Impossible', 'Kentmere', 'Adox', 'JCH',
  'Shanghai', 'Lucky', 'Fomapan', 'Svema', 'Tasma', 'Ferrania',
  'Silberra', 'Washi', 'Dubblefilm', 'Kono', 'Yodica', 'Revolog',
  'Harman', 'Japan Camera Hunter'
];

interface ParsedBrand {
  brand: string;
  model: string;
}

/**
 * Parse film name to extract brand
 */
function parseBrandFromName(name: string | null | undefined): ParsedBrand {
  if (!name) return { brand: '', model: name || '' };
  
  const nameTrimmed = name.trim();
  
  // Check known brands
  for (const brand of KNOWN_BRANDS) {
    if (nameTrimmed.toLowerCase().startsWith(brand.toLowerCase())) {
      const model = nameTrimmed.substring(brand.length).trim();
      // Normalize some brands
      let normalizedBrand = brand;
      if (brand.toLowerCase() === 'fuji') normalizedBrand = 'Fujifilm';
      if (brand.toLowerCase() === 'lomo') normalizedBrand = 'Lomography';
      if (brand.toLowerCase() === 'cinestill') normalizedBrand = 'CineStill';
      return { brand: normalizedBrand, model: model || nameTrimmed };
    }
  }
  
  // Try to split on first space and check if first word looks like a brand
  const parts = nameTrimmed.split(/\s+/);
  if (parts.length >= 2) {
    const firstWord = parts[0];
    // If first word is capitalized and not a number, treat as brand
    if (/^[A-Z][a-zA-Z]*$/.test(firstWord) && !/^\d+$/.test(firstWord)) {
      return { brand: firstWord, model: parts.slice(1).join(' ') };
    }
  }
  
  return { brand: '', model: nameTrimmed };
}

/**
 * Detect format from film name or category
 */
function detectFormat(name: string | null | undefined, category: string | null | undefined): string {
  const lower = (name || '').toLowerCase();
  
  if (lower.includes('120') || lower.includes('medium format')) return '120';
  if (lower.includes('110')) return '110';
  if (lower.includes('127')) return '127';
  if (lower.includes('4x5') || lower.includes('large format')) return '4x5';
  if (lower.includes('8x10')) return '8x10';
  if (lower.includes('instant') || lower.includes('polaroid') || lower.includes('instax')) return 'Instant';
  if (lower.includes('super 8') || lower.includes('super8')) return 'Super 8';
  if (lower.includes('16mm')) return '16mm';
  if (category === 'instant') return 'Instant';
  
  // Default to 135 for most films
  return '135';
}

export async function runFilmStructMigration(): Promise<void> {
  const dbPath = getDbPath();
  log(`Starting film structure migration on: ${dbPath}`);

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
        // Ignore "duplicate column" errors for idempotency
        if (err.message && err.message.includes('duplicate column')) {
          res({ changes: 0 });
        } else {
          log(`SQL Error: ${err.message} | SQL: ${sql.substring(0, 100)}`);
          res({ error: err, changes: 0 });
        }
      } else {
        res({ changes: this.changes, lastID: this.lastID });
      }
    });
  });

  const all = <T = DbRow>(sql: string, params: unknown[] = []): Promise<T[]> => new Promise((res, rej) => {
    db.all(sql, params, (err, rows) => {
      if (err) rej(err);
      else res((rows as T[]) || []);
    });
  });

  try {
    // ========================================
    // 1. ADD NEW COLUMNS TO FILMS TABLE
    // ========================================

    // Check current columns
    interface ColumnInfo { name: string }
    const tableInfo = await all<ColumnInfo>(`PRAGMA table_info(films)`);
    const existingColumns = tableInfo.map(c => c.name);
    log(`Existing films columns: ${existingColumns.join(', ')}`);

    // Add brand column
    if (!existingColumns.includes('brand')) {
      await run(`ALTER TABLE films ADD COLUMN brand TEXT`);
      log('Added brand column to films');
    }

    // Add format column (画幅 - 135, 120, etc.)
    if (!existingColumns.includes('format')) {
      await run(`ALTER TABLE films ADD COLUMN format TEXT DEFAULT '135'`);
      log('Added format column to films');
    }

    // Add thumbnail_url column (for consistency with equipment)
    if (!existingColumns.includes('thumbnail_url')) {
      await run(`ALTER TABLE films ADD COLUMN thumbnail_url TEXT`);
      log('Added thumbnail_url column to films');
    }

    // Add process column (C-41, E-6, BW, ECN-2)
    if (!existingColumns.includes('process')) {
      await run(`ALTER TABLE films ADD COLUMN process TEXT`);
      log('Added process column to films');
    }

    // Add deleted_at for soft delete (consistency with equipment)
    if (!existingColumns.includes('deleted_at')) {
      await run(`ALTER TABLE films ADD COLUMN deleted_at DATETIME`);
      log('Added deleted_at column to films');
    }

    // Ensure category column exists (might be missing in old schemas)
    if (!existingColumns.includes('category')) {
      await run(`ALTER TABLE films ADD COLUMN category TEXT`);
      log('Added category column to films');
    }

    // Ensure thumbPath column exists
    if (!existingColumns.includes('thumbPath')) {
      await run(`ALTER TABLE films ADD COLUMN thumbPath TEXT`);
      log('Added thumbPath column to films');
    }

    // ========================================
    // 2. MIGRATE EXISTING DATA
    // ========================================

    log('Starting data migration...');

    // Build SELECT query dynamically based on existing columns
    const selectCols = ['id', 'name'];
    if (existingColumns.includes('category')) selectCols.push('category');
    if (existingColumns.includes('thumbPath')) selectCols.push('thumbPath');
    if (existingColumns.includes('thumbnail_url')) selectCols.push('thumbnail_url');
    if (existingColumns.includes('brand')) selectCols.push('brand');
    if (existingColumns.includes('format')) selectCols.push('format');
    if (existingColumns.includes('type')) selectCols.push('type');

    // Get all films that need brand parsing
    interface FilmRow {
      id: number;
      name: string;
      category?: string;
      thumbPath?: string;
      thumbnail_url?: string;
      type?: string;
    }
    const filmsToMigrate = await all<FilmRow>(`SELECT ${selectCols.join(', ')} FROM films WHERE brand IS NULL OR brand = ''`);
    log(`Found ${filmsToMigrate.length} films to migrate brand/format`);

    for (const film of filmsToMigrate) {
      const { brand, model: _model } = parseBrandFromName(film.name);
      const format = detectFormat(film.name, film.category || film.type);
      
      // Detect process from category
      let process: string | null = null;
      const categoryOrType = film.category || film.type;
      if (categoryOrType === 'color-negative') {
        process = 'C-41';
      } else if (categoryOrType === 'color-reversal') {
        process = 'E-6';
      } else if (categoryOrType === 'bw-negative' || categoryOrType === 'bw-reversal') {
        process = 'BW';
      } else if (categoryOrType === 'cine') {
        process = 'ECN-2';
      }

      // Migrate category from type if needed
      let category = film.category;
      if (!category && film.type) {
        category = film.type;
      }

      // Migrate thumbPath to thumbnail_url if needed
      let thumbnailUrl = film.thumbnail_url;
      if (!thumbnailUrl && film.thumbPath) {
        thumbnailUrl = film.thumbPath;
      }

      await run(
        `UPDATE films SET brand = ?, format = ?, process = ?, category = ?, thumbnail_url = ? WHERE id = ?`,
        [brand || null, format, process, category, thumbnailUrl, film.id]
      );
      log(`Migrated film #${film.id}: ${film.name} -> Brand: ${brand || '(none)'}, Format: ${format}`);
    }

    // ========================================
    // 3. CREATE INDEXES
    // ========================================

    await run(`CREATE INDEX IF NOT EXISTS idx_films_brand ON films(brand)`);
    await run(`CREATE INDEX IF NOT EXISTS idx_films_format ON films(format)`);
    await run(`CREATE INDEX IF NOT EXISTS idx_films_category ON films(category)`);
    await run(`CREATE INDEX IF NOT EXISTS idx_films_deleted ON films(deleted_at)`);
    log('Created indexes on films table');

    // ========================================
    // DONE
    // ========================================

    log('Film structure migration completed successfully!');
    
    await new Promise<void>((resolve, reject) => {
      db.close((err) => {
        if (err) {
          log(`Error closing DB: ${err.message}`);
          reject(err);
        } else {
          resolve();
        }
      });
    });

  } catch (err) {
    const error = err as Error;
    log(`Migration error: ${error.message}`);
    db.close();
    throw err;
  }
}

// CommonJS compatibility
module.exports = { runFilmStructMigration, FILM_CATEGORIES, FILM_FORMATS, KNOWN_BRANDS };
