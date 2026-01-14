/**
 * Database helper functions with Promise wrappers and retry logic
 */

import db from '../db';
import type { RunResult } from 'sqlite3';

// Type definitions for database rows
interface PhotoRollRow {
  id: number;
  roll_id: number;
  start_date: string | null;
  end_date: string | null;
}

interface LocationRow {
  city_lat: number | null;
  city_lng: number | null;
}

interface PhotoUpdateBody {
  date_taken?: string;
  time_taken?: string;
  location_id?: number;
  detail_location?: string;
  latitude?: number;
  longitude?: number;
}

interface ValidatedPhotoUpdate {
  date_taken?: string;
  time_taken?: string;
  location_id?: number;
  detail_location?: string;
  latitude?: number;
  longitude?: number;
}

/**
 * Execute a SQL statement (INSERT, UPDATE, DELETE) with retry logic for SQLITE_BUSY
 * @param sql - SQL statement
 * @param params - Query parameters
 * @returns Promise resolving to RunResult with lastID and changes
 */
export function runAsync(sql: string, params: unknown[] = []): Promise<RunResult> {
  return new Promise((resolve, reject) => {
    let retries = 0;
    const maxRetries = 3;
    
    const attempt = (): void => {
      db.run(sql, params, function(this: RunResult, err: Error | null) {
        if (err) {
          const sqliteError = err as Error & { code?: string };
          if (sqliteError.code === 'SQLITE_BUSY' && retries < maxRetries) {
            retries++;
            console.warn(`[DB] SQLITE_BUSY, retrying (${retries}/${maxRetries})...`);
            setTimeout(attempt, 200);
            return;
          }
          return reject(err);
        }
        resolve(this);
      });
    };
    attempt();
  });
}

/**
 * Execute a query and return all matching rows
 * @param sql - SQL query
 * @param params - Query parameters
 * @returns Promise resolving to array of rows
 */
export function allAsync<T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T[]> {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err: Error | null, rows: T[]) => {
      if (err) return reject(err);
      resolve(rows || []);
    });
  });
}

/**
 * Execute a query and return first matching row
 * @param sql - SQL query
 * @param params - Query parameters
 * @returns Promise resolving to single row or null
 */
export function getAsync<T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T | null> {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err: Error | null, row: T) => {
      if (err) return reject(err);
      resolve(row || null);
    });
  });
}

/**
 * Validate photo update against roll date range and resolve location coordinates
 * @param photoId - Photo ID
 * @param body - Update body with date_taken, location_id, etc.
 * @returns Validated and enriched update object
 */
export async function validatePhotoUpdate(
  photoId: number,
  body: PhotoUpdateBody
): Promise<ValidatedPhotoUpdate> {
  const row = await getAsync<PhotoRollRow>(
    'SELECT p.id, p.roll_id, r.start_date, r.end_date FROM photos p JOIN rolls r ON r.id=p.roll_id WHERE p.id=?',
    [photoId]
  );
  
  if (!row) throw new Error('Photo not found');
  
  const { date_taken } = body;
  if (date_taken) {
    const d = new Date(date_taken);
    const s = row.start_date ? new Date(row.start_date) : null;
    const e = row.end_date ? new Date(row.end_date) : null;
    if (s && d < s) throw new Error('date_taken before roll start');
    if (e && d > e) throw new Error('date_taken after roll end');
  }
  
  let { latitude, longitude } = body;
  const { location_id } = body;
  
  if (location_id && (latitude === undefined || longitude === undefined)) {
    const loc = await getAsync<LocationRow>('SELECT city_lat, city_lng FROM locations WHERE id=?', [location_id]);
    if (loc) {
      latitude = latitude ?? loc.city_lat ?? undefined;
      longitude = longitude ?? loc.city_lng ?? undefined;
    }
  }
  
  return {
    date_taken,
    time_taken: body.time_taken,
    location_id,
    detail_location: body.detail_location,
    latitude,
    longitude,
  };
}

// CommonJS compatibility export
module.exports = { runAsync, allAsync, getAsync, validatePhotoUpdate };
