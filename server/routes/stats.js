const express = require('express');
const router = express.Router();
const { allAsync, getAsync } = require('../utils/db-helpers');

// GET /api/stats/summary
router.get('/summary', async (req, res) => {
  try {
    const sql = `
      SELECT 
        (SELECT COUNT(*) FROM rolls) as total_rolls,
        (SELECT COUNT(*) FROM photos WHERE roll_id IN (SELECT id FROM rolls)) as total_photos,
        (
          -- Inventory Purchase
          (SELECT COALESCE(SUM(purchase_price + COALESCE(purchase_shipping_share, 0)), 0) FROM film_items WHERE deleted_at IS NULL)
          +
          -- Inventory Develop
          (SELECT COALESCE(SUM(develop_price), 0) FROM film_items WHERE deleted_at IS NULL)
          +
          -- Legacy Rolls (not linked to inventory)
          (SELECT COALESCE(SUM(purchase_cost + develop_cost), 0) FROM rolls WHERE film_item_id IS NULL)
        ) as total_cost
    `;
    const row = await getAsync(sql);
    res.json(row);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/stats/gear
router.get('/gear', async (req, res) => {
  try {
    const sqlCameras = `
      SELECT value as name, COUNT(*) as count FROM roll_gear WHERE type='camera' AND value NOT IN ('', '-', '--', '—') GROUP BY value
      UNION ALL
      SELECT camera as name, COUNT(*) as count FROM rolls WHERE camera IS NOT NULL AND camera != '' AND camera NOT IN ('-','--','—') AND camera_equip_id IS NULL GROUP BY camera
      UNION ALL
      SELECT (c.brand || ' ' || c.model) as name, COUNT(*) as count 
      FROM rolls r 
      JOIN equip_cameras c ON r.camera_equip_id = c.id 
      GROUP BY c.id
    `;

    const sqlLenses = `
      SELECT value as name, COUNT(*) as count FROM roll_gear WHERE type='lens' AND value NOT IN ('', '-', '--', '—') GROUP BY value
      UNION ALL
      SELECT lens as name, COUNT(*) as count FROM rolls 
      WHERE lens IS NOT NULL AND lens != '' AND lens NOT IN ('-','--','—') 
        AND lens_equip_id IS NULL 
        AND (camera_equip_id IS NULL OR camera_equip_id NOT IN (SELECT id FROM equip_cameras WHERE has_fixed_lens = 1))
      GROUP BY lens
      UNION ALL
      SELECT (l.brand || ' ' || l.model) as name, COUNT(*) as count 
      FROM rolls r 
      JOIN equip_lenses l ON r.lens_equip_id = l.id 
      GROUP BY l.id
      UNION ALL
      SELECT (c.brand || ' ' || c.model || ' ' || COALESCE(c.fixed_lens_focal_length, '') || 'mm') as name, COUNT(*) as count 
      FROM rolls r 
      JOIN equip_cameras c ON r.camera_equip_id = c.id 
      WHERE c.has_fixed_lens = 1 
      GROUP BY c.id
    `;

    const sqlFilms = `
      SELECT f.name, COUNT(r.id) as count 
      FROM rolls r 
      JOIN films f ON r.filmId = f.id 
      GROUP BY f.name
    `;

    const [cameras, lenses, films] = await Promise.all([
      allAsync(sqlCameras),
      allAsync(sqlLenses),
      allAsync(sqlFilms)
    ]);

    // Merge duplicates
    const merge = (arr) => {
      const map = {};
      arr.forEach(item => {
        if (!item.name) return;
        map[item.name] = (map[item.name] || 0) + item.count;
      });
      return Object.entries(map)
        .map(([name, count]) => ({ name, count }))
        .sort((a, b) => b.count - a.count);
    };

    res.json({
      cameras: merge(cameras).slice(0, 10),
      lenses: merge(lenses).slice(0, 10),
      films: films.sort((a, b) => b.count - a.count).slice(0, 10)
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/stats/activity
router.get('/activity', async (req, res) => {
  try {
    const sql = `
      SELECT strftime('%Y-%m', start_date) as month, COUNT(*) as count 
      FROM rolls 
      WHERE start_date IS NOT NULL 
      GROUP BY month 
      ORDER BY month ASC
    `;
    const rows = await allAsync(sql);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/stats/costs
router.get('/costs', async (req, res) => {
  try {
    const summary = `
      SELECT 
        (
          (SELECT COALESCE(SUM(purchase_price + COALESCE(purchase_shipping_share, 0)), 0) FROM film_items WHERE deleted_at IS NULL)
          +
          (SELECT COALESCE(SUM(purchase_cost), 0) FROM rolls WHERE film_item_id IS NULL)
        ) as total_purchase,
        (
          (SELECT COALESCE(SUM(develop_price), 0) FROM film_items WHERE deleted_at IS NULL)
          +
          (SELECT COALESCE(SUM(develop_cost), 0) FROM rolls WHERE film_item_id IS NULL)
        ) as total_develop,
        0 as avg_purchase,
        0 as avg_develop,
        (SELECT COUNT(*) FROM rolls) as roll_count
    `;
    
    const monthly = `
      WITH monthly_data AS (
        SELECT 
          strftime('%Y-%m', COALESCE(purchase_date, created_at)) as month,
          SUM(purchase_price + COALESCE(purchase_shipping_share, 0)) as purchase,
          0 as develop
        FROM film_items
        WHERE deleted_at IS NULL
        GROUP BY month

        UNION ALL

        SELECT 
          strftime('%Y-%m', develop_date) as month,
          0 as purchase,
          SUM(develop_price) as develop
        FROM film_items
        WHERE deleted_at IS NULL AND develop_date IS NOT NULL
        GROUP BY month

        UNION ALL

        SELECT 
          strftime('%Y-%m', start_date) as month,
          SUM(purchase_cost) as purchase,
          SUM(develop_cost) as develop
        FROM rolls
        WHERE film_item_id IS NULL AND start_date IS NOT NULL
        GROUP BY month
      )
      SELECT 
        month,
        SUM(purchase) as purchase,
        SUM(develop) as develop
      FROM monthly_data
      WHERE month IS NOT NULL
      GROUP BY month
      ORDER BY month ASC
    `;
    
    const byFilm = `
      WITH film_costs AS (
        SELECT 
          f.name,
          COUNT(*) as count,
          SUM(fi.purchase_price + COALESCE(fi.purchase_shipping_share, 0)) as purchase,
          SUM(fi.develop_price) as develop
        FROM film_items fi
        JOIN films f ON fi.film_id = f.id
        WHERE fi.deleted_at IS NULL
        GROUP BY f.name

        UNION ALL

        SELECT 
          f.name,
          COUNT(*) as count,
          SUM(r.purchase_cost) as purchase,
          SUM(r.develop_cost) as develop
        FROM rolls r
        JOIN films f ON r.filmId = f.id
        WHERE r.film_item_id IS NULL
        GROUP BY f.name
      )
      SELECT 
        name,
        SUM(count) as rolls,
        SUM(purchase) as purchase,
        SUM(develop) as develop
      FROM film_costs
      GROUP BY name
      ORDER BY purchase DESC
    `;

    const [summaryRow, monthlyRows, filmRows] = await Promise.all([
      getAsync(summary),
      allAsync(monthly),
      allAsync(byFilm)
    ]);

    res.json({
      summary: summaryRow,
      monthly: monthlyRows,
      byFilm: filmRows
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/stats/ratings
router.get('/ratings', async (req, res) => {
  try {
    const distribution = `
      SELECT rating, COUNT(*) as count
      FROM photos
      WHERE rating IS NOT NULL AND rating > 0
      GROUP BY rating
      ORDER BY rating ASC
    `;
    
    const avgByMonth = `
      SELECT 
        strftime('%Y-%m', taken_at) as month,
        AVG(rating) as avg_rating,
        COUNT(*) as count
      FROM photos
      WHERE taken_at IS NOT NULL AND rating IS NOT NULL AND rating > 0
      GROUP BY month
      ORDER BY month ASC
    `;
    
    const avgByCamera = `
      SELECT 
        camera,
        AVG(rating) as avg_rating,
        COUNT(*) as count
      FROM photos
      WHERE camera IS NOT NULL AND camera != '' AND rating IS NOT NULL AND rating > 0
      GROUP BY camera
      ORDER BY avg_rating DESC
      LIMIT 10
    `;

    const [distRows, monthRows, cameraRows] = await Promise.all([
      allAsync(distribution),
      allAsync(avgByMonth),
      allAsync(avgByCamera)
    ]);

    res.json({
      distribution: distRows,
      byMonth: monthRows,
      byCamera: cameraRows
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/stats/locations
router.get('/locations', async (req, res) => {
  try {
    // Check if locations table exists
    const tableExists = await getAsync("SELECT name FROM sqlite_master WHERE type='table' AND name='locations'");
    if (!tableExists) {
      return res.json([]);
    }
    
    const sql = `
      SELECT 
        l.city_name,
        l.country_name,
        COUNT(DISTINCT p.id) as photo_count,
        COUNT(DISTINCT p.roll_id) as roll_count
      FROM photos p
      JOIN locations l ON p.location_id = l.id
      WHERE p.location_id IS NOT NULL
      GROUP BY l.id
      ORDER BY photo_count DESC
      LIMIT 15
    `;
    
    const rows = await allAsync(sql);
    res.json(rows);
  } catch (err) {
    console.warn('Error fetching locations:', err.message);
    res.json([]);
  }
});

// GET /api/stats/temporal
router.get('/temporal', async (req, res) => {
  try {
    const dayOfWeek = `
      SELECT 
        CAST(strftime('%w', taken_at) AS INTEGER) as day,
        COUNT(*) as count
      FROM photos
      WHERE taken_at IS NOT NULL
      GROUP BY day
      ORDER BY day ASC
    `;
    
    const hourOfDay = `
      SELECT 
        CAST(strftime('%H', taken_at) AS INTEGER) as hour,
        COUNT(*) as count
      FROM photos
      WHERE taken_at IS NOT NULL
      GROUP BY hour
      ORDER BY hour ASC
    `;

    const [dayRows, hourRows] = await Promise.all([
      allAsync(dayOfWeek),
      allAsync(hourOfDay)
    ]);

    res.json({
      byDay: dayRows,
      byHour: hourRows
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/stats/themes
router.get('/themes', async (req, res) => {
  try {
    const sql = `
      SELECT 
        t.name,
        COUNT(pt.photo_id) as photo_count
      FROM tags t
      LEFT JOIN photo_tags pt ON t.id = pt.tag_id
      GROUP BY t.id
      HAVING photo_count > 0
      ORDER BY photo_count DESC
      LIMIT 15
    `;
    
    const rows = await allAsync(sql);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/stats/inventory
router.get('/inventory', async (req, res) => {
  try {
    const sqlValue = `
      SELECT 
        SUM(purchase_price + COALESCE(purchase_shipping_share, 0)) as total_value,
        COUNT(*) as total_count
      FROM film_items 
      WHERE status = 'in_stock' AND deleted_at IS NULL
    `;

    const sqlExpiring = `
      SELECT f.name as film_name, fi.* 
      FROM film_items fi
      LEFT JOIN films f ON fi.film_id = f.id
      WHERE fi.status = 'in_stock' 
        AND fi.deleted_at IS NULL 
        AND fi.expiry_date IS NOT NULL 
        AND fi.expiry_date < date('now', '+180 days')
      ORDER BY fi.expiry_date ASC
    `;

    const sqlChannel = `
      SELECT purchase_channel, COUNT(*) as count, SUM(purchase_price) as total_spend
      FROM film_items
      WHERE deleted_at IS NULL
      GROUP BY purchase_channel
      ORDER BY total_spend DESC
    `;

    const [valueRow, expiringRows, channelRows] = await Promise.all([
      getAsync(sqlValue),
      allAsync(sqlExpiring),
      allAsync(sqlChannel)
    ]);

    res.json({
      value: valueRow,
      expiring: expiringRows,
      channels: channelRows
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
