/**
 * Presets Routes
 * 
 * Provides CRUD endpoints for film processing presets
 */

import express, { Request, Response, Router } from 'express';
import db from '../db';

const router: Router = express.Router();

// Type definitions
interface PresetRow {
  id: number;
  name: string;
  category: string | null;
  description: string | null;
  params_json: string;
  created_at: string;
  updated_at: string;
}

interface PresetParams {
  [key: string]: unknown;
}

interface Preset {
  id: number;
  name: string;
  category: string | null;
  description: string;
  params: PresetParams;
  created_at: string;
  updated_at: string;
}

/**
 * Safely parse JSON with fallback
 */
function safeParseJSON<T>(text: string | null | undefined, fallback: T): T {
  try {
    return text ? JSON.parse(text) : fallback;
  } catch {
    return fallback;
  }
}

/**
 * GET /api/presets
 * List all presets (optionally filter by category)
 */
router.get('/', (req: Request, res: Response) => {
  const { category } = req.query;
  const params: (string | number)[] = [];
  let sql = 'SELECT id, name, category, description, params_json, created_at, updated_at FROM presets';
  
  if (category) {
    sql += ' WHERE category = ?';
    params.push(category as string);
  }
  sql += ' ORDER BY created_at DESC';

  db.all(sql, params, (err: Error | null, rows: PresetRow[]) => {
    if (err) {
      console.error('Failed to list presets', err.message);
      return res.status(500).json({ error: 'Failed to list presets' });
    }
    const presets: Preset[] = rows.map(r => ({
      id: r.id,
      name: r.name,
      category: r.category || null,
      description: r.description || '',
      params: safeParseJSON<PresetParams>(r.params_json, {}),
      created_at: r.created_at,
      updated_at: r.updated_at,
    }));
    res.json({ presets });
  });
});

/**
 * POST /api/presets
 * Create a new preset
 */
router.post('/', (req: Request, res: Response) => {
  const { name, category, description, params } = req.body || {};
  if (!name || !params) {
    return res.status(400).json({ error: 'name and params are required' });
  }
  const paramsJson = JSON.stringify(params);
  const sql = 'INSERT INTO presets (name, category, description, params_json) VALUES (?, ?, ?, ?)';
  
  db.run(
    sql, 
    [name, category || null, description || null, paramsJson], 
    function(this: { lastID: number }, err: Error | null) {
      if (err) {
        console.error('Failed to create preset', err.message);
        return res.status(500).json({ error: 'Failed to create preset' });
      }
      res.json({
        ok: true,
        id: this.lastID,
        name,
        category: category || null,
        description: description || '',
        params,
      });
    }
  );
});

/**
 * PUT /api/presets/:id
 * Update an existing preset
 */
router.put('/:id', (req: Request, res: Response) => {
  const { id } = req.params;
  const { name, category, description, params } = req.body || {};
  if (!name || !params) {
    return res.status(400).json({ error: 'name and params are required' });
  }
  const paramsJson = JSON.stringify(params);
  const sql = 'UPDATE presets SET name = ?, category = ?, description = ?, params_json = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?';
  
  db.run(sql, [name, category || null, description || null, paramsJson, id], function(err: Error | null) {
    if (err) {
      console.error('Failed to update preset', err.message);
      return res.status(500).json({ error: 'Failed to update preset' });
    }
    res.json({ ok: true });
  });
});

/**
 * DELETE /api/presets/:id
 * Delete a preset
 */
router.delete('/:id', (req: Request, res: Response) => {
  const { id } = req.params;
  const sql = 'DELETE FROM presets WHERE id = ?';
  
  db.run(sql, [id], function(err: Error | null) {
    if (err) {
      console.error('Failed to delete preset', err.message);
      return res.status(500).json({ error: 'Failed to delete preset' });
    }
    res.json({ ok: true });
  });
});

export default router;

// CommonJS compatibility
module.exports = router;
