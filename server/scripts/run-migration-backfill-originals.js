/**
 * Runner: backfill original_rel_path for photos uploaded via single upload.
 * 
 * Usage:
 *   node server/scripts/run-migration-backfill-originals.js
 */
const { migrate } = require('../migrations/2026-02-08-backfill-original-rel-path');
const path = require('path');

// Ensure DB_PATH is set if not provided
if (!process.env.DB_PATH) {
  process.env.DB_PATH = path.join(__dirname, '../film.db');
}

(async () => {
  try {
    const result = await migrate();
    console.log('Migration completed:', JSON.stringify(result, null, 2));
    process.exit(result.success ? 0 : 1);
  } catch (err) {
    console.error('Migration failed:', err);
    process.exit(1);
  }
})();
