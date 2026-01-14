/**
 * Legacy Database Migration - TypeScript Migration
 * 
 * Handles migration from legacy database locations to the proper DATA_ROOT location.
 */

import fs from 'fs';
import path from 'path';
import sqlite3 from 'sqlite3';

import { getDbPath } from '../config/db-config';

/**
 * Simple file logger for packaged app debugging
 */
function log(msg: string): void {
  const logPath = path.join(path.dirname(getDbPath()), 'migration.log');
  const ts = new Date().toISOString();
  fs.appendFileSync(logPath, `[${ts}] ${msg}\n`);
  console.log(`[MIGRATION] ${msg}`);
}

/**
 * Get photo count from a database
 */
function getPhotoCount(dbPath: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const db = new sqlite3.Database(dbPath, sqlite3.OPEN_READONLY, (err) => {
      if (err) return reject(err);
    });
    db.get('SELECT COUNT(*) as c FROM photos', (err, row: { c: number } | undefined) => {
      db.close();
      if (err) return reject(err);
      resolve(row ? row.c : 0);
    });
  });
}

/**
 * Run the legacy database migration
 */
export async function runMigration(): Promise<void> {
  const targetDbPath = getDbPath();
  log(`Target DB Path: ${targetDbPath}`);

  // 1. Identify Legacy Candidates
  const legacyCandidates = [
    'd:\\Program Files\\FilmGalery\\film.db', // Explicit user path
    path.join(process.cwd(), 'film.db'),
    path.join(__dirname, '../../film.db')
  ];

  let sourceDbPath: string | null = null;
  for (const cand of legacyCandidates) {
    if (fs.existsSync(cand) && cand.toLowerCase() !== targetDbPath.toLowerCase()) {
      sourceDbPath = cand;
      break;
    }
  }

  if (!sourceDbPath) {
    log('No legacy DB found. Skipping migration.');
    return;
  }

  log(`Found Legacy DB: ${sourceDbPath}`);

  // 2. Check Target State
  let targetPhotos = 0;
  const targetExists = fs.existsSync(targetDbPath);
  
  if (targetExists) {
    try {
      targetPhotos = await getPhotoCount(targetDbPath);
      log(`Target DB has ${targetPhotos} photos.`);
    } catch (e) {
      const error = e as Error;
      log(`Error reading target DB: ${error.message}. Assuming corrupted/empty.`);
      targetPhotos = 0;
    }
  } else {
    log('Target DB does not exist.');
  }

  // 3. Check Source State
  let sourcePhotos = 0;
  try {
    sourcePhotos = await getPhotoCount(sourceDbPath);
    log(`Source DB has ${sourcePhotos} photos.`);
  } catch (e) {
    const error = e as Error;
    log(`Error reading source DB: ${error.message}`);
    return; // Cannot migrate from broken source
  }

  // 4. Decision
  if (targetPhotos === 0 && sourcePhotos > 0) {
    log('CONDITION MET: Target has 0 photos, Source has data. Overwriting...');
    try {
      // Ensure target directory exists
      const targetDir = path.dirname(targetDbPath);
      if (!fs.existsSync(targetDir)) fs.mkdirSync(targetDir, { recursive: true });

      // Copy
      fs.copyFileSync(sourceDbPath, targetDbPath);
      log('Migration SUCCESS: DB file copied.');
    } catch (e) {
      const error = e as Error;
      log(`Migration FAILED: ${error.message}`);
    }
  } else {
    log('Migration SKIPPED: Conditions not met (Target not empty or Source empty).');
  }
}

// CommonJS compatibility
module.exports = { runMigration };
