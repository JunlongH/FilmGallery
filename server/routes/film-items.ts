/**
 * Film Items Routes
 * 
 * Provides endpoints for film inventory management:
 * - Batch purchase creation
 * - List/get film items with enriched film data
 * - Export shot logs as CSV
 * - Update and delete film items
 */

import express, { Request, Response, Router } from 'express';
import db from '../db';
import {
  createFilmItemsFromPurchase,
  listFilmItems,
  getFilmItemById,
  updateFilmItem,
  softDeleteFilmItem,
  hardDeleteFilmItem,
} from '../services/film/film-item-service';

const router: Router = express.Router();

// Type definitions
interface FilmItemFilters {
  status?: string[];
  film_id?: string | number;
  includeDeleted?: boolean;
  limit?: number;
  offset?: number;
}

interface FilmRow {
  name: string | null;
  brand: string | null;
  iso: number | null;
  format: string | null;
  category: string | null;
}

interface FilmItem {
  id: number;
  film_id: number | null;
  status: string;
  shot_logs?: string | ShotLogEntry[];
  film_name?: string;
  film_brand?: string;
  film_format?: string;
  film_category?: string;
  iso?: number;
  [key: string]: unknown;
}

interface ShotLogEntry {
  date?: string;
  count?: number;
  shots?: number;
  lens?: string;
  aperture?: number | string;
  shutter_speed?: string;
  country?: string;
  city?: string;
  detail_location?: string;
  latitude?: number | string;
  longitude?: number | string;
}

interface PurchaseBatch {
  [key: string]: unknown;
}

/**
 * Helper to fetch film data from database
 */
async function fetchFilmData(filmId: number): Promise<FilmRow | null> {
  return new Promise((resolve, reject) => {
    db.get(
      'SELECT name, brand, iso, format, category FROM films WHERE id = ?',
      [filmId],
      (err: Error | null, r: FilmRow | undefined) => {
        if (err) reject(err);
        else resolve(r || null);
      }
    );
  });
}

/**
 * Enrich film item with film data
 */
async function enrichFilmItem(item: FilmItem): Promise<FilmItem> {
  if (item.film_id) {
    try {
      const filmRow = await fetchFilmData(item.film_id);
      if (filmRow) {
        item.film_name = filmRow.name || undefined;
        item.film_brand = filmRow.brand || undefined;
        item.film_format = filmRow.format || undefined;
        item.film_category = filmRow.category || undefined;
        item.iso = filmRow.iso || undefined;
      }
    } catch (e) {
      console.warn(`[film-items] failed to fetch film data for film_id ${item.film_id}:`, (e as Error).message);
    }
  }
  return item;
}

/**
 * Escape value for CSV output
 */
function escapeCsv(val: unknown): string {
  const v = val === undefined || val === null ? '' : String(val);
  if (v.includes('"') || v.includes(',') || v.includes('\n')) {
    return `"${v.replace(/"/g, '""')}"`;
  }
  return v;
}

/**
 * POST /api/film-items/purchase-batch
 * Batch purchase: create multiple film_items from a single order
 */
router.post('/purchase-batch', async (req: Request, res: Response) => {
  try {
    const batch: PurchaseBatch = req.body || {};
    const created = await createFilmItemsFromPurchase(batch);
    res.json({ ok: true, items: created });
  } catch (err) {
    console.error('[film-items] purchase-batch error', err);
    res.status(400).json({ ok: false, error: (err as Error).message || 'Failed to create film items batch' });
  }
});

/**
 * GET /api/film-items
 * List film items with optional filters
 */
router.get('/', async (req: Request, res: Response) => {
  const startTime = Date.now();
  try {
    const filters: FilmItemFilters = {
      status: req.query.status ? (req.query.status as string).split(',') : undefined,
      film_id: req.query.film_id as string | undefined,
      includeDeleted: req.query.includeDeleted === 'true',
      limit: req.query.limit ? Number(req.query.limit) : undefined,
      offset: req.query.offset ? Number(req.query.offset) : undefined,
    };
    
    let items = await listFilmItems(filters);
    
    // Enrich each item with film data
    items = await Promise.all(items.map(enrichFilmItem));

    const duration = Date.now() - startTime;
    if (duration > 100) {
      console.warn(`[PERF] GET /api/film-items took ${duration}ms - consider optimization`);
    }
    res.json({ ok: true, items });
  } catch (err) {
    console.error('[film-items] list error', err);
    res.status(500).json({ ok: false, error: 'Failed to list film items' });
  }
});

/**
 * GET /api/film-items/:id
 * Get single film item with enriched film data
 */
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    const item = await getFilmItemById(id);
    if (!item) return res.status(404).json({ ok: false, error: 'Film item not found' });

    await enrichFilmItem(item);
    res.json({ ok: true, item });
  } catch (err) {
    console.error('[film-items] get error', err);
    res.status(500).json({ ok: false, error: 'Failed to get film item' });
  }
});

/**
 * GET /api/film-items/:id/shot-logs/export
 * Export shot logs as CSV
 */
router.get('/:id/shot-logs/export', async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    const item = await getFilmItemById(id);
    if (!item) return res.status(404).json({ ok: false, error: 'Film item not found' });

    // Get film ISO for export
    let filmIso: number | null = null;
    if (item.film_id) {
      try {
        const row = await new Promise<{ iso: number } | undefined>((resolve, reject) => {
          db.get('SELECT iso FROM films WHERE id = ?', [item.film_id], (err: Error | null, r: { iso: number } | undefined) => {
            if (err) reject(err);
            else resolve(r);
          });
        });
        filmIso = row?.iso ?? null;
      } catch (isoErr) {
        console.warn('[film-items] export iso lookup failed', (isoErr as Error).message);
      }
    }

    const raw = item.shot_logs;
    if (!raw) return res.status(204).end();

    let logs: ShotLogEntry[] = [];
    try {
      const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
      if (Array.isArray(parsed)) logs = parsed;
    } catch (e) {
      console.error('[film-items] export parse error', (e as Error).message);
      return res.status(500).json({ ok: false, error: 'Invalid shot_logs format' });
    }

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="shot-logs-${id}.csv"`);
    res.write('date,count,lens,aperture,shutter_speed,country,city,detail_location,latitude,longitude,iso\r\n');
    
    for (const entry of logs) {
      res.write([
        escapeCsv(entry.date || ''),
        escapeCsv(entry.count || entry.shots || 0),
        escapeCsv(entry.lens || ''),
        escapeCsv(entry.aperture ?? ''),
        escapeCsv(entry.shutter_speed || ''),
        escapeCsv(entry.country || ''),
        escapeCsv(entry.city || ''),
        escapeCsv(entry.detail_location || ''),
        escapeCsv(entry.latitude ?? ''),
        escapeCsv(entry.longitude ?? ''),
        escapeCsv(filmIso ?? '')
      ].join(',') + '\r\n');
    }
    res.end();
  } catch (err) {
    console.error('[film-items] export error', err);
    res.status(500).json({ ok: false, error: 'Failed to export shot logs' });
  }
});

/**
 * PUT /api/film-items/:id
 * Update film item
 */
router.put('/:id', async (req: Request, res: Response) => {
  const startTime = Date.now();
  try {
    const id = Number(req.params.id);
    await updateFilmItem(id, req.body || {});
    const item = await getFilmItemById(id);
    const duration = Date.now() - startTime;
    if (duration > 100) {
      console.warn(`[PERF] PUT /api/film-items/${id} took ${duration}ms`);
    }
    res.json({ ok: true, item });
  } catch (err) {
    console.error('[film-items] update error', err);
    res.status(400).json({ ok: false, error: (err as Error).message || 'Failed to update film item' });
  }
});

/**
 * DELETE /api/film-items/:id
 * Delete film item (soft by default, hard if ?hard=true)
 */
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    const hardDelete = req.query.hard === 'true';

    if (hardDelete) {
      await hardDeleteFilmItem(id);
    } else {
      await softDeleteFilmItem(id);
    }
    res.json({ ok: true });
  } catch (err) {
    console.error('[film-items] delete error', err);
    res.status(400).json({ ok: false, error: (err as Error).message || 'Failed to delete film item' });
  }
});

export default router;

// CommonJS compatibility
module.exports = router;
