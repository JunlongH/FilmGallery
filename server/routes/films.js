const express = require('express');
const router = express.Router();
const db = require('../db');
const fs = require('fs');
const path = require('path');
const { uploadFilm } = require('../config/multer');
const { uploadsDir } = require('../config/paths');
const { FILM_CATEGORIES, FILM_FORMATS, KNOWN_BRANDS } = require('../utils/film-struct-migration');

// Get film constants (for dropdowns)
router.get('/constants', (req, res) => {
  res.json({
    categories: FILM_CATEGORIES,
    formats: FILM_FORMATS,
    brands: KNOWN_BRANDS
  });
});

// create a film
router.post('/', uploadFilm.single('thumb'), (req, res) => {
  try {
    const { name, iso, category, brand, format, process } = req.body || {};
    if (!name || !iso || !category) return res.status(400).json({ error: 'name, iso and category are required' });
    const thumbPath = req.file ? `/uploads/films/${req.file.filename}` : null;

    db.run(
      'INSERT INTO films (name, iso, category, thumbPath, brand, format, process, thumbnail_url) VALUES (?,?,?,?,?,?,?,?)',
      [name, Number(iso), category, thumbPath, brand || null, format || '135', process || null, thumbPath],
      function(err) {
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

// list films (exclude soft-deleted)
router.get('/', (req, res) => {
  const includeDeleted = req.query.includeDeleted === 'true';
  const whereClause = includeDeleted ? '' : 'WHERE deleted_at IS NULL';
  db.all(`SELECT * FROM films ${whereClause} ORDER BY brand, name`, (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

// soft delete film (set deleted_at)
router.delete('/:id', (req, res) => {
  const id = req.params.id;
  const hard = req.query.hard === 'true';
  
  if (hard) {
    // Hard delete: remove thumbnail file and delete record
    db.get('SELECT thumbPath FROM films WHERE id = ?', [id], (err, row) => {
      if (err) return res.status(500).json({ error: err.message });
      if (row && row.thumbPath) {
        const rel = row.thumbPath.replace(/^\/uploads\//, '');
        const filePath = path.join(uploadsDir, rel);
        fs.unlink(filePath, () => { /* ignore error */ });
      }
      db.run('DELETE FROM films WHERE id = ?', [id], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ deleted: this.changes, hard: true });
      });
    });
  } else {
    // Soft delete: set deleted_at timestamp
    db.run('UPDATE films SET deleted_at = CURRENT_TIMESTAMP WHERE id = ?', [id], function(err) {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ deleted: this.changes, soft: true });
    });
  }
});

// restore soft-deleted film
router.post('/:id/restore', (req, res) => {
  const id = req.params.id;
  db.run('UPDATE films SET deleted_at = NULL WHERE id = ?', [id], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    if (this.changes === 0) return res.status(404).json({ error: 'film_not_found' });
    db.get('SELECT * FROM films WHERE id = ?', [id], (e, row) => {
      if (e) return res.status(500).json({ error: e.message });
      res.json(row);
    });
  });
});

// update film (name, iso, category, brand, format, process, optional new thumb)
router.put('/:id', uploadFilm.single('thumb'), (req, res) => {
  const id = req.params.id;
  db.get('SELECT * FROM films WHERE id = ?', [id], (err, filmRow) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!filmRow) return res.status(404).json({ error: 'film_not_found' });

    const { name, iso, category, brand, format, process } = req.body || {};
    const updates = {};
    if (name !== undefined) updates.name = name;
    if (iso !== undefined) updates.iso = Number(iso);
    if (category !== undefined) updates.category = category;
    if (brand !== undefined) updates.brand = brand || null;
    if (format !== undefined) updates.format = format || '135';
    if (process !== undefined) updates.process = process || null;

    // handle thumb replacement
    if (req.file) {
      const newThumbPath = `/uploads/films/${req.file.filename}`;
      updates.thumbPath = newThumbPath;
      updates.thumbnail_url = newThumbPath;
    }

    const keys = Object.keys(updates);
    if (keys.length === 0) {
      return db.get('SELECT * FROM films WHERE id = ?', [id], (e2, fresh) => {
        if (e2) return res.status(500).json({ error: e2.message });
        return res.json(fresh);
      });
    }

    const setClause = keys.map(k => `${k} = ?`).join(', ');
    const values = keys.map(k => updates[k]);
    db.run(`UPDATE films SET ${setClause} WHERE id = ?`, [...values, id], function(e3) {
      if (e3) return res.status(500).json({ error: e3.message });
      // delete old thumb if replaced
      if (req.file && filmRow.thumbPath && filmRow.thumbPath !== updates.thumbPath) {
        const rel = filmRow.thumbPath.replace(/^\/uploads\//, '');
        const oldPath = path.join(uploadsDir, rel);
        fs.unlink(oldPath, () => { /* ignore error */ });
      }
      db.get('SELECT * FROM films WHERE id = ?', [id], (e4, updated) => {
        if (e4) return res.status(500).json({ error: e4.message });
        res.json(updated);
      });
    });
  });
});

module.exports = router;
