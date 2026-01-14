/**
 * Database connection and configuration module
 * 
 * Provides SQLite3 database connection with:
 * - WAL mode for OneDrive sync compatibility
 * - Write-through mode for immediate sync
 * - Periodic WAL checkpoints
 */

import sqlite3 from 'sqlite3';
import path from 'path';
import conflictResolver from './conflict-resolver';
import { getDbPath } from './config/db-config';

// Extended Database interface with custom properties
interface ExtendedDatabase extends sqlite3.Database {
  walCheckpoint: () => Promise<{ changes: number; mode: string }>;
  stopCheckpointScheduler: () => void;
  meta: {
    writeThrough: boolean;
    mode: 'WAL' | 'TRUNCATE';
  };
}

const dbPath = getDbPath();

// OneDrive write-through mode: ensure changes land in the main DB file immediately
const writeThrough = process.env.DB_WRITE_THROUGH === '1' || process.env.DB_ONEDRIVE_WRITE_THROUGH === '1';

// Auto-cleanup OneDrive conflict copies before opening DB
const dataDir = path.dirname(dbPath);
console.log('[DB] Checking for OneDrive conflict copies in', dataDir);
conflictResolver.autoCleanup(dataDir).catch((err: Error) => {
  console.error('[DB] Conflict cleanup error:', err.message);
});

// Create database connection
const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('Could not connect to database', err);
  } else {
    console.log('Connected to database at', dbPath);
  }
}) as ExtendedDatabase;

// Ensure tables exist
db.serialize(() => {
  if (writeThrough) {
    // Write-through mode: keep changes in main DB file immediately
    db.run('PRAGMA journal_mode = TRUNCATE', (err) => {
      if (err) console.error('[DB] Failed to set TRUNCATE journal mode:', err);
      else console.log('[DB] ✅ Write-through mode: TRUNCATE journal');
    });
    db.run('PRAGMA synchronous = FULL', (err) => {
      if (err) console.error('[DB] Synchronous FULL failed:', err);
    });
    db.run('PRAGMA locking_mode = NORMAL');
    db.run('PRAGMA busy_timeout = 15000');
    db.run('PRAGMA temp_store = MEMORY');
    db.run('PRAGMA foreign_keys = ON');
    db.run('PRAGMA page_size = 4096');
    db.run('PRAGMA cache_size = -16000');
    db.run('PRAGMA mmap_size = 134217728');
    db.run('PRAGMA journal_size_limit = 1048576');
  } else {
    // WAL mode: optimized for concurrency and OneDrive-friendly sync
    db.run('PRAGMA journal_mode = WAL', (err) => {
      if (err) {
        console.error('[DB] Failed to enable WAL mode:', err);
      } else {
        console.log('[DB] ✅ WAL mode enabled');
      }
    });
  
    db.run('PRAGMA synchronous = NORMAL', (err) => {
      if (err) console.error('[DB] Synchronous setting failed:', err);
    });
  
    db.run('PRAGMA busy_timeout = 15000');
    db.run('PRAGMA mmap_size = 268435456');
    db.run('PRAGMA locking_mode = NORMAL');
    db.run('PRAGMA cache_size = -32000');
    db.run('PRAGMA temp_store = MEMORY');
    db.run('PRAGMA foreign_keys = ON');
    db.run('PRAGMA page_size = 4096');
  
    db.run('PRAGMA wal_autocheckpoint = 1000', (err) => {
      if (err) console.error('[DB] WAL autocheckpoint failed:', err);
      else console.log('[DB] ✅ WAL autocheckpoint set to 1000 pages');
    });
  }

  // Create tables
  db.run(`CREATE TABLE IF NOT EXISTS films (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    iso INTEGER,
    format TEXT,
    type TEXT,
    description TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS rolls (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    film_id INTEGER,
    camera_id INTEGER,
    date_loaded DATE,
    date_finished DATE,
    notes TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(film_id) REFERENCES films(id)
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS photos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    roll_id INTEGER,
    filename TEXT NOT NULL,
    path TEXT,
    aperture REAL,
    shutter_speed TEXT,
    iso INTEGER,
    focal_length REAL,
    rating INTEGER DEFAULT 0,
    notes TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(roll_id) REFERENCES rolls(id)
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS tags (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT UNIQUE NOT NULL
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS photo_tags (
    photo_id INTEGER,
    tag_id INTEGER,
    PRIMARY KEY (photo_id, tag_id),
    FOREIGN KEY(photo_id) REFERENCES photos(id),
    FOREIGN KEY(tag_id) REFERENCES tags(id)
  )`);
  
  db.run(`CREATE TABLE IF NOT EXISTS presets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    params TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);
});

// WAL checkpoint scheduler
const WAL_CHECKPOINT_INTERVAL = 5 * 60 * 1000; // 5 minutes
let checkpointInterval: NodeJS.Timeout | null = null;
let checkpointStartTimer: NodeJS.Timeout | null = null;

function startWalCheckpoint(): void {
  if (writeThrough) return;
  if (checkpointInterval) return;
  
  checkpointInterval = setInterval(() => {
    db.run('PRAGMA wal_checkpoint(PASSIVE)', (err) => {
      if (err) {
        console.error('[DB] WAL checkpoint error:', err.message);
      } else {
        console.log('[DB] 🔄 WAL checkpoint completed');
      }
    });
  }, WAL_CHECKPOINT_INTERVAL);
  
  if (checkpointInterval.unref) {
    checkpointInterval.unref();
  }
  
  console.log('[DB] ✅ WAL checkpoint scheduler started (every 5 minutes)');
}

function stopWalCheckpoint(): void {
  if (checkpointStartTimer) {
    clearTimeout(checkpointStartTimer);
    checkpointStartTimer = null;
  }
  if (checkpointInterval) {
    clearInterval(checkpointInterval);
    checkpointInterval = null;
    console.log('[DB] WAL checkpoint scheduler stopped');
  }
}

// Start checkpoint scheduler after tables are created
checkpointStartTimer = setTimeout(() => {
  startWalCheckpoint();
}, 5000);

if (checkpointStartTimer.unref) {
  checkpointStartTimer.unref();
}

// Add custom methods
db.walCheckpoint = (): Promise<{ changes: number; mode: string }> => {
  return new Promise((resolve, reject) => {
    if (writeThrough) {
      return resolve({ changes: 0, mode: 'write-through' });
    }
    db.run('PRAGMA wal_checkpoint(TRUNCATE)', function(this: sqlite3.RunResult, err: Error | null) {
      if (err) return reject(err);
      resolve({ changes: this.changes, mode: 'wal' });
    });
  });
};

db.stopCheckpointScheduler = stopWalCheckpoint;

db.meta = {
  writeThrough,
  mode: writeThrough ? 'TRUNCATE' : 'WAL'
};

export default db;
export { db, ExtendedDatabase };
