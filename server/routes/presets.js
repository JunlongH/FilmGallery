const express = require('express');
const { runAsync, allAsync } = require('../utils/db-helpers');

const router = express.Router();

// List all presets (optionally filter by category)
router.get('/', async (req, res) => {
  try {
    const { category } = req.query;
    const params = [];
    let sql = 'SELECT id, name, category, description, params_json, created_at, updated_at FROM presets';
    if (category) {
      sql += ' WHERE category = ?';
      params.push(category);
    }
    sql += ' ORDER BY created_at DESC';

    const rows = await allAsync(sql, params);
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
  } catch (err) {
    console.error('Failed to list presets', err.message);
    res.status(500).json({ error: 'Failed to list presets' });
  }
});

// Create a new preset
router.post('/', async (req, res) => {
  try {
    const { name, category, description, params } = req.body || {};
    if (!name || !params) {
      return res.status(400).json({ error: 'name and params are required' });
    }
    const paramsJson = JSON.stringify(params);
    const sql = 'INSERT INTO presets (name, category, description, params_json) VALUES (?, ?, ?, ?)';
    const result = await runAsync(sql, [name, category || null, description || null, paramsJson]);
    res.json({
      ok: true,
      id: result.lastID,
      name,
      category: category || null,
      description: description || '',
      params,
    });
  } catch (err) {
    console.error('Failed to create preset', err.message);
    res.status(500).json({ error: 'Failed to create preset' });
  }
});

// Update an existing preset
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { name, category, description, params } = req.body || {};
    if (!name || !params) {
      return res.status(400).json({ error: 'name and params are required' });
    }
    const paramsJson = JSON.stringify(params);
    const sql = 'UPDATE presets SET name = ?, category = ?, description = ?, params_json = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?';
    await runAsync(sql, [name, category || null, description || null, paramsJson, id]);
    res.json({ ok: true });
  } catch (err) {
    console.error('Failed to update preset', err.message);
    res.status(500).json({ error: 'Failed to update preset' });
  }
});

// Delete a preset
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const sql = 'DELETE FROM presets WHERE id = ?';
    await runAsync(sql, [id]);
    res.json({ ok: true });
  } catch (err) {
    console.error('Failed to delete preset', err.message);
    res.status(500).json({ error: 'Failed to delete preset' });
  }
});

function safeParseJSON(text, fallback) {
  try {
    return JSON.parse(text);
  } catch {
    return fallback;
  }
}

module.exports = router;
