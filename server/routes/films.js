const express = require('express');
const router = express.Router();
const db = require('../db');
const fs = require('fs');
const path = require('path');
const { uploadFilm } = require('../config/multer');
const { uploadsDir } = require('../config/paths');
const { FILM_CATEGORIES, FILM_FORMATS } = require('../utils/film-struct-migration');

// ===== FILM CONSTANTS =====

// Get available film categories
router.get('/categories', (req, res) => {
  res.json(FILM_CATEGORIES);
});

// Get available film formats
router.get('/formats', (req, res) => {
  res.json(FILM_FORMATS);
});

// ===== CRUD OPERATIONS =====

// Create a film
router.post('/', uploadFilm.single('thumb'), (req, res) => {
  try {
    const { name, brand, iso, category, format, process } = req.body || {};
    if (!name || !iso) return res.status(400).json({ error: 'name and iso are required' });
    
    const thumbPath = req.file ? `/uploads/films/${req.file.filename}` : null;
    const filmCategory = category || 'color-negative';
    const filmFormat = format || '135';

    db.run(
      `INSERT INTO films (name, brand, iso, category, format, process, thumbPath, thumbnail_url) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [name, brand || null, Number(iso), filmCategory, filmFormat, process || null, thumbPath, thumbPath],
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
      }
    );
  } catch (err) {
    console.error('POST /api/films error', err);
    res.status(500).json({ error: err.message });
  }
});

// List films (excluding soft-deleted)
router.get('/', (req, res) => {
  const includeDeleted = req.query.includeDeleted === 'true';
  const whereClause = includeDeleted ? '' : 'WHERE deleted_at IS NULL';
  
  db.all(`SELECT * FROM films ${whereClause} ORDER BY brand, name`, (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows || []);
  });
});

// Get single film
router.get('/:id', (req, res) => {
  const id = req.params.id;
  db.get('SELECT * FROM films WHERE id = ?', [id], (err, row) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!row) return res.status(404).json({ error: 'film_not_found' });
    res.json(row);
  });
});

// Update film
router.put('/:id', uploadFilm.single('thumb'), (req, res) => {
  const id = req.params.id;
  db.get('SELECT * FROM films WHERE id = ?', [id], (err, filmRow) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!filmRow) return res.status(404).json({ error: 'film_not_found' });

    const { name, brand, iso, category, format, process } = req.body || {};
    const updates = {};
    
    if (name !== undefined) updates.name = name;
    if (brand !== undefined) updates.brand = brand || null;
    if (iso !== undefined) updates.iso = Number(iso);
    if (category !== undefined) updates.category = category;
    if (format !== undefined) updates.format = format;
    if (process !== undefined) updates.process = process || null;

    // Handle thumb replacement
    if (req.file) {
      const newThumbPath = `/uploads/films/${req.file.filename}`;
      updates.thumbPath = newThumbPath;
      updates.thumbnail_url = newThumbPath;
    }

    const keys = Object.keys(updates);
    if (keys.length === 0) {
      return res.json(filmRow);
    }

    const setClause = keys.map(k => `${k} = ?`).join(', ');
    const values = keys.map(k => updates[k]);
    
    db.run(`UPDATE films SET ${setClause} WHERE id = ?`, [...values, id], function(e3) {
      if (e3) return res.status(500).json({ error: e3.message });
      
      // Delete old thumb if replaced
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

// Soft delete film
router.delete('/:id', (req, res) => {
  const id = req.params.id;
  const hard = req.query.hard === 'true';

  if (hard) {
    // Hard delete - remove from database and delete thumbnail
    db.get('SELECT thumbPath FROM films WHERE id = ?', [id], (err, row) => {
      if (err) return res.status(500).json({ error: err.message });
      if (row && row.thumbPath) {
        const rel = row.thumbPath.replace(/^\/uploads\//, '');
        const filePath = path.join(uploadsDir, rel);
        fs.unlink(filePath, () => { /* ignore error */ });
      }
      db.run('DELETE FROM films WHERE id = ?', [id], function(err2) {
        if (err2) return res.status(500).json({ error: err2.message });
        res.json({ deleted: this.changes, hard: true });
      });
    });
  } else {
    // Soft delete
    db.run('UPDATE films SET deleted_at = ? WHERE id = ?', [new Date().toISOString(), id], function(err) {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ deleted: this.changes, hard: false });
    });
  }
});

// Restore soft-deleted film
router.post('/:id/restore', (req, res) => {
  const id = req.params.id;
  db.run('UPDATE films SET deleted_at = NULL WHERE id = ?', [id], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    db.get('SELECT * FROM films WHERE id = ?', [id], (e, row) => {
      if (e) return res.status(500).json({ error: e.message });
      res.json(row);
    });
  });
});

module.exports = router;
