// init-db.js
// 
// DEPRECATED: This script is only for creating a fresh empty database.
// The main server.js automatically runs schema-migration.js on startup.
// 
// For development seed data, run: node init-db.js --seed
// 
const fs = require('fs');
const path = require('path');
const db = require('./db');
const { runSchemaMigration } = require('./utils/schema-migration');
const { runEquipmentMigration } = require('./utils/equipment-migration');
const { runFilmStructMigration } = require('./utils/film-struct-migration');

// allow optional seed file in same dir
const seedPath = path.join(__dirname, 'seed.sql');
const shouldSeed = process.argv.includes('--seed');

async function initDatabase() {
  console.log('[INIT-DB] Starting database initialization...');
  
  try {
    // Run all migrations in order (they are idempotent)
    await runSchemaMigration();
    console.log('[INIT-DB] Schema migration completed.');
    
    await runEquipmentMigration();
    console.log('[INIT-DB] Equipment migration completed.');
    
    await runFilmStructMigration();
    console.log('[INIT-DB] Film structure migration completed.');
    
    // Only seed if explicitly requested
    if (shouldSeed && fs.existsSync(seedPath)) {
      console.log('[INIT-DB] Seeding database with sample data...');
      const sql = fs.readFileSync(seedPath, 'utf8');
      await new Promise((resolve, reject) => {
        db.exec(sql, (err) => {
          if (err) reject(err);
          else resolve();
        });
      });
      console.log('[INIT-DB] Seed data inserted.');
    } else if (shouldSeed) {
      console.log('[INIT-DB] No seed.sql found, skipping seed.');
    }
    
    console.log('[INIT-DB] Database initialization complete.');
    db.close();
    
  } catch (err) {
    console.error('[INIT-DB] Failed:', err);
    process.exit(1);
  }
}

initDatabase();