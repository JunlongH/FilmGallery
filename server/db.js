// db.js
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');
const conflictResolver = require('./conflict-resolver');

let dbPath;
if (process.env.DATA_ROOT) {
  // Highest priority: custom data root
  dbPath = path.join(process.env.DATA_ROOT, 'film.db');
  const dir = path.dirname(dbPath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
} else if (process.env.USER_DATA) {
  // prefer electron userData folder if provided via env
  dbPath = path.join(process.env.USER_DATA, 'film.db');
  // ensure folder exists
  const dir = path.dirname(dbPath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
} else {
  dbPath = path.join(__dirname, 'film.db');
}

// Auto-cleanup OneDrive conflict copies before opening DB
const dataDir = path.dirname(dbPath);
console.log('[DB] Checking for OneDrive conflict copies in', dataDir);
conflictResolver.autoCleanup(dataDir).catch(err => {
  console.error('[DB] Conflict cleanup error:', err.message);
});

const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('Failed to open DB', dbPath, err.message);
    process.exit(1);
  }
  console.log('DB opened successfully at', dbPath);
  
  // Optimize for concurrency and Cloud/OneDrive compatibility
  db.configure('busyTimeout', 5000); // Wait up to 5s for locks

  // Decide journal mode based on environment and path
  // - WAL uses film.db-wal and film.db-shm (bad for cloud sync)
  // - DELETE keeps a single film.db file (cloud friendly)
  const lowerPath = String(dbPath).toLowerCase();
  const isCloudPath = lowerPath.includes('onedrive') || lowerPath.includes('dropbox') || lowerPath.includes('googledrive') || lowerPath.includes('icloud');
  const envMode = (process.env.DB_JOURNAL_MODE || '').toUpperCase(); // 'WAL' | 'DELETE' | 'TRUNCATE' | 'MEMORY'
  let journalMode = 'WAL';
  if (envMode) {
    journalMode = envMode;
  } else if (isCloudPath) {
    journalMode = 'DELETE';
  }

  // Apply journal mode and synchronous tuned per mode
  db.run(`PRAGMA journal_mode = ${journalMode};`);
  if (journalMode === 'DELETE' || journalMode === 'TRUNCATE') {
    // Safer sync for single-file journal, better for cloud folders
    db.run('PRAGMA synchronous = FULL;');
  } else {
    // Default for local performance
    db.run('PRAGMA synchronous = NORMAL;');
  }

  db.run('PRAGMA foreign_keys = ON;');
});

// Graceful shutdown: close database properly on exit
let isClosing = false;
const closeDB = (signal) => {
  if (isClosing) return;
  isClosing = true;
  console.log(`[DB] Closing database (signal: ${signal})...`);
  
  // If using WAL mode, checkpoint before closing to merge WAL into main file
  db.get('PRAGMA journal_mode', (err, row) => {
    const mode = row && row.journal_mode;
    if (mode === 'wal' || mode === 'WAL') {
      console.log('[DB] Checkpointing WAL before close...');
      db.run('PRAGMA wal_checkpoint(TRUNCATE)', (e) => {
        if (e) console.error('[DB] WAL checkpoint error:', e.message);
        else console.log('[DB] WAL checkpoint complete');
        finalizeClose(signal);
      });
    } else {
      finalizeClose(signal);
    }
  });
};

const finalizeClose = (signal) => {
  db.close((err) => {
    if (err) {
      console.error('[DB] Error closing database:', err.message);
      process.exit(1);
    }
    console.log('[DB] Database closed successfully');
    process.exit(0);
  });
};

// Listen to process signals for graceful shutdown
process.on('SIGINT', () => closeDB('SIGINT'));
process.on('SIGTERM', () => closeDB('SIGTERM'));

module.exports = db;
module.exports.closeDB = closeDB;