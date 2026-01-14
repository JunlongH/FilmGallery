/**
 * Tags Routes
 * 
 * Provides endpoints for:
 * - Listing all tags with photo counts
 * - Getting photos filtered by tag
 */

import express, { Request, Response, Router } from 'express';
import { allAsync } from '../utils/db-helpers';
import { attachTagsToPhotos } from '../services/tag-service';

const router: Router = express.Router();

// Type definitions
interface TagRow {
  id: number;
  name: string;
  photos_count: number;
  cover_thumb: string | null;
  cover_full: string | null;
}

interface PhotoRow {
  id: number;
  roll_id: number;
  thumb_rel_path: string | null;
  full_rel_path: string | null;
  film_name: string | null;
  roll_title: string | null;
  [key: string]: unknown;
}

/**
 * GET /api/tags
 * List all tags with photo counts and cover images
 */
router.get('/', async (_req: Request, res: Response) => {
  try {
    const rows = await allAsync<TagRow>(`
      SELECT t.id, t.name, COUNT(pt.photo_id) AS photos_count,
             (SELECT p.thumb_rel_path FROM photo_tags pt2 JOIN photos p ON p.id = pt2.photo_id WHERE pt2.tag_id = t.id ORDER BY p.id DESC LIMIT 1) as cover_thumb,
             (SELECT p.full_rel_path FROM photo_tags pt2 JOIN photos p ON p.id = pt2.photo_id WHERE pt2.tag_id = t.id ORDER BY p.id DESC LIMIT 1) as cover_full
      FROM tags t
      LEFT JOIN photo_tags pt ON pt.tag_id = t.id
      GROUP BY t.id
      ORDER BY t.name COLLATE NOCASE
    `);
    res.json(rows);
  } catch (err) {
    console.error('[GET] /api/tags error', (err as Error).message);
    res.status(500).json({ error: (err as Error).message });
  }
});

/**
 * GET /api/tags/:tagId/photos
 * Get all photos with a specific tag
 */
router.get('/:tagId/photos', async (req: Request, res: Response) => {
  const tagId = req.params.tagId;
  try {
    const rows = await allAsync<PhotoRow>(`
      SELECT p.*, COALESCE(f.name, r.film_type) AS film_name, r.title AS roll_title
      FROM photo_tags pt
      JOIN photos p ON p.id = pt.photo_id
      JOIN rolls r ON r.id = p.roll_id
      LEFT JOIN films f ON f.id = r.filmId
      WHERE pt.tag_id = ?
      ORDER BY p.id DESC
    `, [tagId]);
    const withTags = await attachTagsToPhotos(rows);
    res.json(withTags);
  } catch (err) {
    console.error('[GET] /api/tags/:tagId/photos error', (err as Error).message);
    res.status(500).json({ error: (err as Error).message });
  }
});

export default router;

// CommonJS compatibility
module.exports = router;
