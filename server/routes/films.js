const express = require('express');
const router = express.Router();
const db = require('../db');
const fs = require('fs');
const path = require('path');
const { uploadFilm } = require('../config/multer');
const { uploadsDir } = require('../config/paths');

// create a film
router.post('/', uploadFilm.single('thumb'), (req, res) => {
  try {
    const { name, iso, category } = req.body || {};
    if (!name || !iso || !category) return res.status(400).json({ error: 'name, iso and category are required' });
    const thumbPath = req.file ? `/uploads/films/${req.file.filename}` : null;

    db.run('INSERT INTO films (name, iso, category, thumbPath) VALUES (?,?,?,?)',
      [name, Number(iso), category, thumbPath], function(err) {
        if (err) {
          console.error('Insert film error', err);
          return res.status(500).json({ error: err.message });
        }
        const filmId = this.lastID;
        db.get('SELECT * FROM films WHERE id = ?', [filmId], (e, row) => {
          if (e) return res.status(500).json({ error: e.message });
          res.status(201).json(row);
        });
    });
  } catch (err) {
    console.error('POST /api/films error', err);
    res.status(500).json({ error: err.message });
  }
});

// list films
router.get('/', (req, res) => {
  db.all('SELECT * FROM films ORDER BY name', (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

// delete film
router.delete('/:id', (req, res) => {
  const id = req.params.id;
  db.get('SELECT thumbPath FROM films WHERE id = ?', [id], (err, row) => {
    if (err) return res.status(500).json({ error: err.message });
    if (row && row.thumbPath) {
      const rel = row.thumbPath.replace(/^\/uploads\//, '');
      const filePath = path.join(uploadsDir, rel);
      fs.unlink(filePath, () => { /* ignore error */ });
    }
    db.run('DELETE FROM films WHERE id = ?', [id], function(err) {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ deleted: this.changes });
    });
  });
});

module.exports = router;
