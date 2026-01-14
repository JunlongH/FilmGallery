/**
 * Films Routes
 * 
 * Provides CRUD endpoints for film stock management:
 * - List all films
 * - Create/update films with thumbnails
 * - Soft/hard delete films
 * - Get film constants (categories, formats, brands)
 */

import express, { Request, Response, Router } from 'express';
import fs from 'fs';
import path from 'path';
import db from '../db';
import { uploadFilm } from '../config/multer';
import { uploadsDir } from '../config/paths';
import { FILM_CATEGORIES, FILM_FORMATS, KNOWN_BRANDS } from '../utils/film-struct-migration';

const router: Router = express.Router();

// Type definitions
interface FilmRow {
  id: number;
  name: string;
  iso: number;
  category: string;
  thumbPath: string | null;
  thumbnail_url: string | null;
  brand: string | null;
  format: string;
  process: string | null;
  deleted_at: string | null;
}

interface FilmUpdates {
  name?: string;
  iso?: number;
  category?: string;
  brand?: string | null;
  format?: string;
  process?: string | null;
  thumbPath?: string;
  thumbnail_url?: string;
}

/**
 * GET /api/films/constants
 * Get film constants for dropdowns
 */
router.get('/constants', (_req: Request, res: Response) => {
  res.json({
    categories: FILM_CATEGORIES,
    formats: FILM_FORMATS,
    brands: KNOWN_BRANDS
  });
});

/**
 * POST /api/films
 * Create a new film
 */
router.post('/', uploadFilm.single('thumb'), (req: Request, res: Response) => {
  try {
    const { name, iso, category, brand, format, process } = req.body || {};
    if (!name || !iso || !category) {
      return res.status(400).json({ error: 'name, iso and category are required' });
    }
    const thumbPath = req.file ? `/uploads/films/${req.file.filename}` : null;

    db.run(
      'INSERT INTO films (name, iso, category, thumbPath, brand, format, process, thumbnail_url) VALUES (?,?,?,?,?,?,?,?)',
      [name, Number(iso), category, thumbPath, brand || null, format || '135', process || null, thumbPath],
      function(this: { lastID: number }, err: Error | null) {
        if (err) {
          console.error('Insert film error', err);
          return res.status(500).json({ error: err.message });
        }
        const filmId = this.lastID;
        db.get('SELECT * FROM films WHERE id = ?', [filmId], (e: Error | null, row: FilmRow) => {
          if (e) return res.status(500).json({ error: e.message });
          res.status(201).json(row);
        });
      }
    );
  } catch (err) {
    console.error('POST /api/films error', err);
    res.status(500).json({ error: (err as Error).message });
  }
});

/**
 * GET /api/films
 * List all films (optionally include soft-deleted)
 */
router.get('/', (req: Request, res: Response) => {
  const includeDeleted = req.query.includeDeleted === 'true';
  const whereClause = includeDeleted ? '' : 'WHERE deleted_at IS NULL';
  db.all(`SELECT * FROM films ${whereClause} ORDER BY brand, name`, (err: Error | null, rows: FilmRow[]) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

/**
 * DELETE /api/films/:id
 * Soft or hard delete a film
 */
router.delete('/:id', (req: Request, res: Response) => {
  const id = req.params.id;
  const hard = req.query.hard === 'true';

  if (hard) {
    // Hard delete: remove thumbnail file and delete record
    db.get('SELECT thumbPath FROM films WHERE id = ?', [id], (err: Error | null, row: { thumbPath: string | null } | undefined) => {
      if (err) return res.status(500).json({ error: err.message });
      if (row && row.thumbPath) {
        const rel = row.thumbPath.replace(/^\/uploads\//, '');
        const filePath = path.join(uploadsDir, rel);
        fs.unlink(filePath, () => { /* ignore error */ });
      }
      db.run('DELETE FROM films WHERE id = ?', [id], function(this: { changes: number }, err: Error | null) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ deleted: this.changes, hard: true });
      });
    });
  } else {
    // Soft delete: set deleted_at timestamp
    db.run('UPDATE films SET deleted_at = CURRENT_TIMESTAMP WHERE id = ?', [id], function(this: { changes: number }, err: Error | null) {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ deleted: this.changes, soft: true });
    });
  }
});

/**
 * POST /api/films/:id/restore
 * Restore a soft-deleted film
 */
router.post('/:id/restore', (req: Request, res: Response) => {
  const id = req.params.id;
  db.run('UPDATE films SET deleted_at = NULL WHERE id = ?', [id], function(this: { changes: number }, err: Error | null) {
    if (err) return res.status(500).json({ error: err.message });
    if (this.changes === 0) return res.status(404).json({ error: 'film_not_found' });
    db.get('SELECT * FROM films WHERE id = ?', [id], (e: Error | null, row: FilmRow) => {
      if (e) return res.status(500).json({ error: e.message });
      res.json(row);
    });
  });
});

/**
 * PUT /api/films/:id
 * Update a film (name, iso, category, brand, format, process, optional new thumb)
 */
router.put('/:id', uploadFilm.single('thumb'), (req: Request, res: Response) => {
  const id = req.params.id;
  db.get('SELECT * FROM films WHERE id = ?', [id], (err: Error | null, filmRow: FilmRow | undefined) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!filmRow) return res.status(404).json({ error: 'film_not_found' });

    const { name, iso, category, brand, format, process } = req.body || {};
    const updates: FilmUpdates = {};
    if (name !== undefined) updates.name = name;
    if (iso !== undefined) updates.iso = Number(iso);
    if (category !== undefined) updates.category = category;
    if (brand !== undefined) updates.brand = brand || null;
    if (format !== undefined) updates.format = format || '135';
    if (process !== undefined) updates.process = process || null;

    // Handle thumb replacement
    if (req.file) {
      const newThumbPath = `/uploads/films/${req.file.filename}`;
      updates.thumbPath = newThumbPath;
      updates.thumbnail_url = newThumbPath;
    }

    const keys = Object.keys(updates) as (keyof FilmUpdates)[];
    if (keys.length === 0) {
      return db.get('SELECT * FROM films WHERE id = ?', [id], (e2: Error | null, fresh: FilmRow) => {
        if (e2) return res.status(500).json({ error: e2.message });
        return res.json(fresh);
      });
    }

    const setClause = keys.map(k => `${k} = ?`).join(', ');
    const values = keys.map(k => updates[k]);
    db.run(`UPDATE films SET ${setClause} WHERE id = ?`, [...values, id], function(e3: Error | null) {
      if (e3) return res.status(500).json({ error: e3.message });
      // Delete old thumb if replaced
      if (req.file && filmRow.thumbPath && filmRow.thumbPath !== updates.thumbPath) {
        const rel = filmRow.thumbPath.replace(/^\/uploads\//, '');
        const oldPath = path.join(uploadsDir, rel);
        fs.unlink(oldPath, () => { /* ignore error */ });
      }
      db.get('SELECT * FROM films WHERE id = ?', [id], (e4: Error | null, updated: FilmRow) => {
        if (e4) return res.status(500).json({ error: e4.message });
        res.json(updated);
      });
    });
  });
});

export default router;

// CommonJS compatibility
module.exports = router;
