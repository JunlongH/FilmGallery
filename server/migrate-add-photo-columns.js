// Migration: Add missing columns to photos table
// This adds columns that are used in the code but missing from the schema
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

// Helper to check if column exists
function columnExists(db, tableName, columnName) {
  return new Promise((resolve, reject) => {
    db.all(`PRAGMA table_info(${tableName})`, (err, rows) => {
      if (err) return reject(err);
      const exists = rows.some(row => row.name === columnName);
      resolve(exists);
    });
  });
}

// Helper to run SQL with error handling
function runSQL(db, sql, description) {
  return new Promise((resolve, reject) => {
    db.run(sql, function(err) {
      if (err) {
        // Ignore duplicate column errors (column already exists)
        if (err.message && err.message.includes('duplicate column name')) {
          console.log(`[PHOTO-COLS] ⊙ ${description} - already exists, skipping`);
          resolve({ skipped: true });
        } else {
          console.error(`[PHOTO-COLS] ✗ Failed: ${description}`);
          console.error(`[PHOTO-COLS]   Error: ${err.message}`);
          reject(err);
        }
      } else {
        console.log(`[PHOTO-COLS] ✓ ${description}`);
        resolve({ skipped: false });
      }
    });
  });
}

// Main migration function (can be called from startup or standalone)
async function migratePhotoColumns(dbPath) {
  console.log(`[PHOTO-COLS] Checking photos table columns...`);

  return new Promise((resolve, reject) => {
    const db = new sqlite3.Database(dbPath, async (err) => {
      if (err) {
        console.error('[PHOTO-COLS] Failed to open database:', err);
        return reject(err);
      }

      try {
        // List of columns to add to photos table
        // These match the columns used in rolls.js INSERT INTO photos statement
        const columnsToAdd = [
          { name: 'frame_number', type: 'TEXT', description: 'Frame number on roll' },
          { name: 'full_rel_path', type: 'TEXT', description: 'Full size image path' },
          { name: 'thumb_rel_path', type: 'TEXT', description: 'Thumbnail image path' },
          { name: 'negative_rel_path', type: 'TEXT', description: 'Negative version path' },
          { name: 'original_rel_path', type: 'TEXT', description: 'Original upload path' },
          { name: 'positive_rel_path', type: 'TEXT', description: 'Positive version path' },
          { name: 'positive_thumb_rel_path', type: 'TEXT', description: 'Positive thumbnail path' },
          { name: 'negative_thumb_rel_path', type: 'TEXT', description: 'Negative thumbnail path' },
          { name: 'is_negative_source', type: 'INTEGER DEFAULT 0', description: 'Source is negative' },
          { name: 'taken_at', type: 'DATETIME', description: 'Photo taken timestamp' },
          { name: 'date_taken', type: 'DATE', description: 'Date photo was taken' },
          { name: 'time_taken', type: 'TIME', description: 'Time photo was taken' },
          { name: 'location_id', type: 'INTEGER', description: 'Location reference' },
          { name: 'detail_location', type: 'TEXT', description: 'Detailed location text' },
          { name: 'camera', type: 'TEXT', description: 'Camera used' },
          { name: 'lens', type: 'TEXT', description: 'Lens used' },
          { name: 'photographer', type: 'TEXT', description: 'Photographer name' },
          { name: 'aperture', type: 'REAL', description: 'Aperture value (f-stop)' },
          { name: 'shutter_speed', type: 'TEXT', description: 'Shutter speed' },
          { name: 'iso', type: 'INTEGER', description: 'ISO sensitivity' },
          { name: 'edit_params', type: 'TEXT', description: 'Edit parameters JSON' },
        ];

        let addedCount = 0;
        let skippedCount = 0;

        for (const column of columnsToAdd) {
          const exists = await columnExists(db, 'photos', column.name);
          
          if (exists) {
            skippedCount++;
          } else {
            try {
              const result = await runSQL(
                db,
                `ALTER TABLE photos ADD COLUMN ${column.name} ${column.type}`,
                `Added column '${column.name}'`
              );
              if (result && result.skipped) {
                skippedCount++;
              } else {
                addedCount++;
              }
            } catch (err) {
              // If it's a duplicate column error despite our check, skip it
              if (err.message && err.message.includes('duplicate column name')) {
                console.log(`[PHOTO-COLS] ⊙ Column '${column.name}' seems to exist, skipping`);
                skippedCount++;
              } else {
                // For other errors, log but continue with remaining columns
                console.error(`[PHOTO-COLS] ⚠ Failed to add '${column.name}': ${err.message}`);
                console.error(`[PHOTO-COLS] ⚠ Continuing with remaining columns...`);
              }
            }
          }
        }

        console.log(`[PHOTO-COLS] ✓ Migration completed: ${addedCount} added, ${skippedCount} already existed`);

        db.close((err) => {
          if (err) {
            console.error('[PHOTO-COLS] Error closing database:', err);
            reject(err);
          } else {
            resolve({ addedCount, skippedCount });
          }
        });

      } catch (err) {
        console.error('[PHOTO-COLS] ✗ Migration failed:', err.message);
        db.close();
        reject(err);
      }
    });
  });
}

// Export for use in startup sequence
module.exports = { migratePhotoColumns };

// Allow standalone execution
if (require.main === module) {
  (async () => {
    // Determine database path
    let dbPath;
    if (process.env.DATA_ROOT) {
      dbPath = path.join(process.env.DATA_ROOT, 'film.db');
    } else if (process.env.USER_DATA) {
      dbPath = path.join(process.env.USER_DATA, 'film.db');
    } else {
      dbPath = path.join(__dirname, 'film.db');
    }

    console.log(`[PHOTO-COLS] Using database: ${dbPath}`);

    if (!fs.existsSync(dbPath)) {
      console.error('[PHOTO-COLS] ERROR: Database file not found!');
      console.error('[PHOTO-COLS] Please ensure the application has been run at least once.');
      process.exit(1);
    }

    try {
      await migratePhotoColumns(dbPath);
      console.log('\n[PHOTO-COLS] ✓ Standalone migration completed successfully!\n');
      process.exit(0);
    } catch (err) {
      console.error('\n[PHOTO-COLS] ✗ Standalone migration failed:', err.message);
      process.exit(1);
    }
  })();
}
