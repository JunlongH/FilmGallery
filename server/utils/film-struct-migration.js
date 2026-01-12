/**
 * Film Structure Migration Script
 * 
 * This script handles:
 * 1. Adding new columns to films table (brand, format, thumbnail_url)
 * 2. Migrating existing data (parsing name to extract brand, updating paths)
 * 3. Removing ref_film_formats table (no longer needed)
 * 
 * Designed to be idempotent - safe to run multiple times.
 */

const sqlite3 = require('sqlite3');
const path = require('path');
const fs = require('fs');
const { getDbPath } = require('../config/db-config');

function log(msg) {
  const logPath = path.join(path.dirname(getDbPath()), 'film-struct-migration.log');
  const ts = new Date().toISOString();
  fs.appendFileSync(logPath, `[${ts}] ${msg}\n`);
  console.log(`[FILM-STRUCT] ${msg}`);
}

/**
 * Film categories enum
 */
const FILM_CATEGORIES = [
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
const FILM_FORMATS = [
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
const KNOWN_BRANDS = [
  'Kodak', 'Fujifilm', 'Fuji', 'Ilford', 'Agfa', 'Lomography', 'Lomo',
  'CineStill', 'Cinestill', 'Foma', 'Rollei', 'Bergger', 'ORWO',
  'Polaroid', 'Instax', 'Impossible', 'Kentmere', 'Adox', 'JCH',
  'Shanghai', 'Lucky', 'Fomapan', 'Svema', 'Tasma', 'Ferrania',
  'Silberra', 'Washi', 'Dubblefilm', 'Kono', 'Yodica', 'Revolog',
  'Harman', 'Japan Camera Hunter'
];

/**
 * Parse film name to extract brand
 */
function parseBrandFromName(name) {
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
function detectFormat(name, category) {
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

function runFilmStructMigration() {
  return new Promise(async (resolve, reject) => {
    const dbPath = getDbPath();
    log(`Starting film structure migration on: ${dbPath}`);

    const db = new sqlite3.Database(dbPath, (err) => {
      if (err) {
        log(`Failed to open DB: ${err.message}`);
        return reject(err);
      }
    });

    const run = (sql, params = []) => new Promise((res) => {
      db.run(sql, params, function(err) {
        if (err) {
          // Ignore "duplicate column" errors for idempotency
          if (err.message && err.message.includes('duplicate column')) {
            res({ changes: 0 });
          } else {
            log(`SQL Error: ${err.message} | SQL: ${sql.substring(0, 100)}`);
            res({ error: err });
          }
        } else {
          res({ changes: this.changes, lastID: this.lastID });
        }
      });
    });

    const get = (sql, params = []) => new Promise((res, rej) => {
      db.get(sql, params, (err, row) => {
        if (err) rej(err);
        else res(row);
      });
    });

    const all = (sql, params = []) => new Promise((res, rej) => {
      db.all(sql, params, (err, rows) => {
        if (err) rej(err);
        else res(rows || []);
      });
    });

    try {
      // ========================================
      // 1. ADD NEW COLUMNS TO FILMS TABLE
      // ========================================

      // Check current columns
      const tableInfo = await all(`PRAGMA table_info(films)`);
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

      // Get all films that need brand parsing
      const filmsToMigrate = await all(`SELECT id, name, category, thumbPath, thumbnail_url, brand, format, type FROM films WHERE brand IS NULL OR brand = ''`);
      log(`Found ${filmsToMigrate.length} films to migrate brand/format`);

      for (const film of filmsToMigrate) {
        const { brand, model } = parseBrandFromName(film.name);
        const format = detectFormat(film.name, film.category || film.type);
        
        // Detect process from category
        let process = null;
        if (film.category === 'color-negative' || film.type === 'color-negative') {
          process = 'C-41';
        } else if (film.category === 'color-reversal' || film.type === 'color-reversal') {
          process = 'E-6';
        } else if (film.category === 'bw-negative' || film.category === 'bw-reversal' || 
                   film.type === 'bw-negative' || film.type === 'bw-reversal') {
          process = 'BW';
        } else if (film.category === 'cine' || film.type === 'cine') {
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
      // 4. CLEANUP - Drop ref_film_formats if exists
      // ========================================

      try {
        // Check if ref_film_formats exists
        const refTable = await get(`SELECT name FROM sqlite_master WHERE type='table' AND name='ref_film_formats'`);
        if (refTable) {
          // First check if any tables reference it
          const filmsHasFormatId = existingColumns.includes('format_id');
          if (filmsHasFormatId) {
            // Remove format_id references first (SQLite doesn't support DROP COLUMN easily)
            log('Note: format_id column exists but SQLite cannot drop columns. Will be ignored.');
          }
          // Drop the table
          await run(`DROP TABLE IF EXISTS ref_film_formats`);
          log('Dropped ref_film_formats table');
        }
      } catch (e) {
        log(`Note: ref_film_formats cleanup skipped: ${e.message}`);
      }

      // ========================================
      // DONE
      // ========================================

      log('Film structure migration completed successfully!');
      
      db.close((err) => {
        if (err) log(`Error closing DB: ${err.message}`);
        resolve();
      });

    } catch (err) {
      log(`Migration error: ${err.message}`);
      db.close();
      reject(err);
    }
  });
}

// Export for use in server startup
module.exports = { runFilmStructMigration, FILM_CATEGORIES, FILM_FORMATS, KNOWN_BRANDS };
