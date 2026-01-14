/**
 * Search Routes
 * 
 * Provides simple search functionality across rolls
 */

import express, { Request, Response, Router } from 'express';
import db from '../db';

const router: Router = express.Router();

// Type definitions
interface RollRow {
  id: number;
  title: string | null;
  camera: string | null;
  photographer: string | null;
  film_type: string | null;
  start_date: string | null;
  [key: string]: unknown;
}

/**
 * GET /api/search
 * Simple search endpoint across rolls
 */
router.get('/', (req: Request, res: Response) => {
  const query = (req.query.q as string) || '';
  const q = `%${query.trim()}%`;
  
  db.all(
    `SELECT * FROM rolls WHERE title LIKE ? OR camera LIKE ? OR photographer LIKE ? OR film_type LIKE ? ORDER BY start_date DESC`,
    [q, q, q, q],
    (err: Error | null, rows: RollRow[]) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json(rows);
    }
  );
});

export default router;

// CommonJS compatibility
module.exports = router;
