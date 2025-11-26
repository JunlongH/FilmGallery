const express = require('express');
const db = require('../db');

const router = express.Router();

// List all presets (optionally filter by category)
router.get('/', (req, res) => {
  const { category } = req.query;
  const params = [];
  let sql = 'SELECT id, name, category, description, params_json, created_at, updated_at FROM presets';
  if (category) {
    sql += ' WHERE category = ?';
    params.push(category);
  }
  sql += ' ORDER BY created_at DESC';

  db.all(sql, params, (err, rows) => {
    if (err) {
      console.error('Failed to list presets', err.message);
      return res.status(500).json({ error: 'Failed to list presets' });
    }
    const presets = rows.map(r => ({
      id: r.id,
      name: r.name,
      category: r.category || null,
      description: r.description || '',
      params: safeParseJSON(r.params_json, {}),
      created_at: r.created_at,
      updated_at: r.updated_at,
    }));
    res.json({ presets });
  });
});

// Create a new preset
router.post('/', (req, res) => {
  const { name, category, description, params } = req.body || {};
  if (!name || !params) {
    return res.status(400).json({ error: 'name and params are required' });
  }
  const paramsJson = JSON.stringify(params);
  const sql = 'INSERT INTO presets (name, category, description, params_json) VALUES (?, ?, ?, ?)';
  db.run(sql, [name, category || null, description || null, paramsJson], function(err) {
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
  });
});

// Update an existing preset
router.put('/:id', (req, res) => {
  const { id } = req.params;
  const { name, category, description, params } = req.body || {};
  if (!name || !params) {
    return res.status(400).json({ error: 'name and params are required' });
  }
  const paramsJson = JSON.stringify(params);
  const sql = 'UPDATE presets SET name = ?, category = ?, description = ?, params_json = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?';
  db.run(sql, [name, category || null, description || null, paramsJson, id], function(err) {
    if (err) {
      console.error('Failed to update preset', err.message);
      return res.status(500).json({ error: 'Failed to update preset' });
    }
    res.json({ ok: true });
  });
});

// Delete a preset
router.delete('/:id', (req, res) => {
  const { id } = req.params;
  const sql = 'DELETE FROM presets WHERE id = ?';
  db.run(sql, [id], function(err) {
    if (err) {
      console.error('Failed to delete preset', err.message);
      return res.status(500).json({ error: 'Failed to delete preset' });
    }
    res.json({ ok: true });
  });
});

function safeParseJSON(text, fallback) {
  try {
    return JSON.parse(text);
  } catch {
    return fallback;
  }
}

module.exports = router;
