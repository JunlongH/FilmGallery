const express = require('express');
const router = express.Router();
const { allAsync } = require('../utils/db-helpers');

// simple search endpoint
router.get('/', async (req, res) => {
  try {
    const q = `%${(req.query.q || '').trim()}%`;
    const rows = await allAsync(
      `SELECT * FROM rolls WHERE title LIKE ? OR camera LIKE ? OR photographer LIKE ? OR film_type LIKE ? ORDER BY start_date DESC`,
      [q, q, q, q]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
