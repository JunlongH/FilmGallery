/**
 * Locations Routes
 * 
 * Provides endpoints for:
 * - Listing countries
 * - Getting locations by ID or query
 * - Creating new locations
 */

import express, { Request, Response, Router } from 'express';
import db from '../db';
import { allAsync, getAsync } from '../utils/db-helpers';
import PreparedStmt from '../utils/prepared-statements';

const router: Router = express.Router();

// Type definitions
interface CountryRow {
  country_code: string | null;
  country_name: string | null;
}

interface LocationRow {
  id: number;
  country_code: string | null;
  country_name: string | null;
  city_name: string | null;
  city_lat: number | null;
  city_lng: number | null;
  photo_count?: number;
  roll_count?: number;
}

interface LocationIdRow {
  id: number;
}

/**
 * GET /api/locations/countries
 * List all distinct countries
 */
router.get('/countries', async (_req: Request, res: Response) => {
  try {
    const sql = `SELECT DISTINCT country_code, country_name FROM locations WHERE country_code IS NOT NULL ORDER BY country_name`;
    const rows = await allAsync<CountryRow>(sql);
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

/**
 * GET /api/locations/:id
 * Get a specific location by ID
 */
router.get('/:id', async (req: Request, res: Response) => {
  const { id } = req.params;
  if (!id || isNaN(Number(id))) return res.status(400).json({ error: 'Invalid ID' });
  try {
    const row = await PreparedStmt.getAsync('locations.getById', [id]);
    if (!row) return res.status(404).json({ error: 'Not found' });
    res.json(row);
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

/**
 * GET /api/locations?country=CN&query=shang
 * List locations with optional filtering
 */
router.get('/', async (req: Request, res: Response) => {
  const { country, query, hasRecords, withCounts } = req.query;
  const params: (string | number)[] = [];
  const where: string[] = [];
  
  if (country) { 
    where.push('l.country_code = ?'); 
    params.push(country as string); 
  }
  if (query) { 
    where.push('(l.city_name LIKE ? OR l.country_name LIKE ?)'); 
    params.push(`%${query}%`, `%${query}%`); 
  }

  // If hasRecords is truthy, only include locations that appear in photos or roll_locations
  if (hasRecords) {
    where.push(`(
      EXISTS (SELECT 1 FROM photos p WHERE p.location_id = l.id)
      OR EXISTS (SELECT 1 FROM roll_locations rl WHERE rl.location_id = l.id)
    )`);
  }

  // Base select
  let select = `SELECT l.id, l.country_code, l.country_name, l.city_name, l.city_lat, l.city_lng`;

  // Optional counts for maintainability / future UI
  if (withCounts) {
    select += `,
      (SELECT COUNT(1) FROM photos p WHERE p.location_id = l.id) AS photo_count,
      (
        SELECT COUNT(DISTINCT rl.roll_id)
        FROM roll_locations rl
        WHERE rl.location_id = l.id
      ) AS roll_count`;
  }

  const sql = `
    ${select}
    FROM locations l
    ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
    ORDER BY l.country_name, l.city_name
  `;
  try {
    const rows = await allAsync<LocationRow>(sql, params);
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

/**
 * POST /api/locations
 * Create a new location
 */
router.post('/', async (req: Request, res: Response) => {
  const { country_code, country_name, city_name, city_lat, city_lng } = req.body || {};
  if (!city_name) return res.status(400).json({ error: 'city_name required' });
  
  try {
    const exists = await getAsync<LocationIdRow>(
      'SELECT id FROM locations WHERE country_code=? AND city_name=?', 
      [country_code || null, city_name]
    );
    if (exists) return res.json({ id: exists.id, ok: true, existed: true });
    
    const result = await new Promise<number>((resolve, reject) => {
      db.run(
        'INSERT INTO locations (country_code, country_name, city_name, city_lat, city_lng) VALUES (?,?,?,?,?)', 
        [country_code || null, country_name || null, city_name, city_lat || null, city_lng || null], 
        function(this: { lastID: number }, err: Error | null) {
          if (err) reject(err); 
          else resolve(this.lastID);
        }
      );
    });
    res.status(201).json({ id: result, ok: true });
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

export default router;

// CommonJS compatibility
module.exports = router;
