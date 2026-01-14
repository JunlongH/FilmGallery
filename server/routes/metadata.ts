/**
 * Metadata Routes
 * 
 * Provides autocomplete options for:
 * - Cameras
 * - Lenses (including from shot logs)
 * - Photographers
 * - Years
 */

import express, { Request, Response, Router } from 'express';
import db from '../db';

const router: Router = express.Router();

// Type definitions
interface ValueRow {
  value: string;
}

interface ShotLogRow {
  shot_logs: string;
}

interface ShotLogEntry {
  lens?: string;
  [key: string]: unknown;
}

/**
 * GET /api/metadata/options
 * Returns distinct cameras, lenses, and photographers from rolls/photos
 * Also includes lenses found in film_items.shot_logs
 */
router.get('/options', async (_req: Request, res: Response) => {
  const queries = {
    cameras: `
      SELECT DISTINCT camera as value FROM rolls WHERE camera IS NOT NULL AND camera != "" AND camera NOT IN ('-','--','—')
      UNION
      SELECT DISTINCT camera as value FROM photos WHERE camera IS NOT NULL AND camera != "" AND camera NOT IN ('-','--','—')
      ORDER BY value
    `,
    lenses: `
      SELECT DISTINCT lens as value FROM rolls WHERE lens IS NOT NULL AND lens != "" AND lens NOT IN ('-','--','—')
      UNION
      SELECT DISTINCT lens as value FROM photos WHERE lens IS NOT NULL AND lens != "" AND lens NOT IN ('-','--','—')
      ORDER BY value
    `,
    photographers: `
      SELECT DISTINCT photographer as value FROM rolls WHERE photographer IS NOT NULL AND photographer != "" AND photographer NOT IN ('-','--','—')
      UNION
      SELECT DISTINCT photographer as value FROM photos WHERE photographer IS NOT NULL AND photographer != "" AND photographer NOT IN ('-','--','—')
      ORDER BY value
    `,
    years: `
      SELECT DISTINCT strftime('%Y', start_date) AS value FROM rolls WHERE start_date IS NOT NULL AND start_date != ""
      UNION
      SELECT DISTINCT strftime('%Y', date_taken) AS value FROM photos WHERE date_taken IS NOT NULL AND date_taken != ""
      ORDER BY value DESC
    `
  };

  const runAll = <T>(sql: string): Promise<T[]> => new Promise((resolve, reject) => {
    db.all(sql, (err: Error | null, rows: T[]) => {
      if (err) return reject(err);
      resolve(rows || []);
    });
  });

  const parseShotLogLenses = (rows: ShotLogRow[]): string[] => {
    const lensSet = new Set<string>();
    for (const row of rows) {
      if (!row || !row.shot_logs) continue;
      try {
        const parsed: ShotLogEntry[] = typeof row.shot_logs === 'string' 
          ? JSON.parse(row.shot_logs) 
          : row.shot_logs;
        if (!Array.isArray(parsed)) continue;
        for (const entry of parsed) {
          const lens = (entry && entry.lens ? String(entry.lens).trim() : '');
          if (lens) lensSet.add(lens);
        }
      } catch (err) {
        console.warn('[metadata] Failed to parse shot_logs lens', (err as Error).message);
      }
    }
    return Array.from(lensSet);
  };

  try {
    const [cameraRows, lensRows, photographerRows, yearRows, shotLogRows] = await Promise.all([
      runAll<ValueRow>(queries.cameras),
      runAll<ValueRow>(queries.lenses),
      runAll<ValueRow>(queries.photographers),
      runAll<ValueRow>(queries.years),
      runAll<ShotLogRow>(`SELECT shot_logs FROM film_items WHERE shot_logs IS NOT NULL AND shot_logs != ''`)
    ]);

    const lensSet = new Set<string>(lensRows.map(r => r.value));
    parseShotLogLenses(shotLogRows).forEach(l => lensSet.add(l));
    const lenses = Array.from(lensSet).sort((a, b) => a.localeCompare(b));

    res.json({
      cameras: cameraRows.map(r => r.value),
      lenses,
      photographers: photographerRows.map(r => r.value),
      years: yearRows.map(r => r.value)
    });
  } catch (err) {
    console.error('[metadata] Error fetching options', err);
    res.status(500).json({ error: 'Failed to load metadata options' });
  }
});

export default router;

// CommonJS compatibility
module.exports = router;
