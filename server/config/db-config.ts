/**
 * Database Configuration - TypeScript Migration
 * 
 * Determines the path to the SQLite database file based on environment variables.
 */

import path from 'path';
import fs from 'fs';

function isUsableEnvValue(v: string | undefined): boolean {
  if (!v || typeof v !== 'string') return false;
  const s = v.trim();
  if (!s) return false;
  if (s.toLowerCase() === 'undefined' || s.toLowerCase() === 'null') return false;
  return true;
}

/**
 * Get the path to the SQLite database file.
 * 
 * Priority order:
 * 1. DB_PATH - explicit path (scripts / power users)
 * 2. DATA_ROOT - custom data root folder
 * 3. USER_DATA - Electron userData folder
 * 4. Fallback to server/film.db
 */
export function getDbPath(): string {
  let dbPath: string;

  // Highest priority: explicit DB_PATH (scripts / power users)
  if (isUsableEnvValue(process.env.DB_PATH)) {
    dbPath = process.env.DB_PATH!.trim();
  } else if (isUsableEnvValue(process.env.DATA_ROOT)) {
    // Highest priority: custom data root
    dbPath = path.join(process.env.DATA_ROOT!.trim(), 'film.db');
    const dir = path.dirname(dbPath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  } else if (isUsableEnvValue(process.env.USER_DATA)) {
    // prefer electron userData folder if provided via env
    dbPath = path.join(process.env.USER_DATA!.trim(), 'film.db');
    // ensure folder exists
    const dir = path.dirname(dbPath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  } else {
    dbPath = path.join(__dirname, '../film.db');
  }

  // If DB_PATH points to a file inside a folder that doesn't exist yet
  try {
    const dir = path.dirname(dbPath);
    if (dir && !fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  } catch {
    /* ignore - directory may already exist */
  }

  return dbPath;
}

// CommonJS compatibility
module.exports = {
  getDbPath
};
