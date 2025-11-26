const express = require('express');
const router = express.Router();
const db = require('../db');

// GET /api/metadata/options
router.get('/options', (req, res) => {
  const queries = {
    cameras: 'SELECT DISTINCT camera FROM rolls WHERE camera IS NOT NULL AND camera != "" ORDER BY camera',
    lenses: 'SELECT DISTINCT lens FROM rolls WHERE lens IS NOT NULL AND lens != "" ORDER BY lens',
    shooters: 'SELECT DISTINCT shooter FROM rolls WHERE shooter IS NOT NULL AND shooter != "" ORDER BY shooter'
  };

  const results = {};
  let completed = 0;
  const keys = Object.keys(queries);

  if (keys.length === 0) return res.json({});

  keys.forEach(key => {
    db.all(queries[key], (err, rows) => {
      if (err) {
        console.error(`Error fetching ${key}`, err);
        results[key] = [];
      } else {
        results[key] = rows.map(r => Object.values(r)[0]);
      }
      completed++;
      if (completed === keys.length) {
        res.json(results);
      }
    });
  });
});

module.exports = router;
