const express = require('express');
const router = express.Router();
const { allAsync } = require('../utils/db-helpers');
const { attachTagsToPhotos } = require('../services/tag-service');

// tags listing
router.get('/', async (req, res) => {
  try {
    const rows = await allAsync(`
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
    console.error('[GET] /api/tags error', err.message);
    res.status(500).json({ error: err.message });
  }
});

// photos filtered by tag
router.get('/:tagId/photos', async (req, res) => {
  const tagId = req.params.tagId;
  try {
    const rows = await allAsync(`
      SELECT p.*, TRIM(COALESCE(f.brand || ' ', '') || COALESCE(f.name, r.film_type)) AS film_name, r.title AS roll_title
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
    console.error('[GET] /api/tags/:tagId/photos error', err.message);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
