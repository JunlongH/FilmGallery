import express, { Request, Response, Router } from 'express';
const db = require('../db');

const router: Router = express.Router();

// ============= Type Definitions =============

// Summary endpoint
interface SummaryRow {
  total_rolls: number;
  total_photos: number;
  total_cost: number;
}

// Gear endpoint
interface GearCountRow {
  name: string | null;
  count: number;
}

interface GearStatsResponse {
  cameras: GearCountRow[];
  lenses: GearCountRow[];
  films: GearCountRow[];
}

// Activity endpoint
interface ActivityRow {
  month: string;
  count: number;
}

// Costs endpoint
interface CostsSummaryRow {
  total_purchase: number;
  total_develop: number;
  avg_purchase: number;
  avg_develop: number;
  roll_count: number;
}

interface MonthlyDataRow {
  month: string;
  purchase: number;
  develop: number;
}

interface FilmCostRow {
  name: string;
  rolls: number;
  purchase: number;
  develop: number;
}

interface CostsResponse {
  summary: CostsSummaryRow;
  monthly: MonthlyDataRow[];
  byFilm: FilmCostRow[];
}

// Ratings endpoint
interface RatingDistRow {
  rating: number;
  count: number;
}

interface RatingByMonthRow {
  month: string;
  avg_rating: number;
  count: number;
}

interface RatingByCameraRow {
  camera: string;
  avg_rating: number;
  count: number;
}

interface RatingsResponse {
  distribution: RatingDistRow[];
  byMonth: RatingByMonthRow[];
  byCamera: RatingByCameraRow[];
}

// Locations endpoint
interface LocationStatsRow {
  city_name: string;
  country_name: string;
  photo_count: number;
  roll_count: number;
}

// Temporal endpoint
interface DayOfWeekRow {
  day: number;
  count: number;
}

interface HourOfDayRow {
  hour: number;
  count: number;
}

interface TemporalResponse {
  byDay: DayOfWeekRow[];
  byHour: HourOfDayRow[];
}

// Themes endpoint
interface ThemeRow {
  name: string;
  photo_count: number;
}

// Inventory endpoint
interface InventoryValueRow {
  total_value: number;
  total_count: number;
}

interface ExpiringItemRow {
  film_name: string;
  id: number;
  film_id: number;
  status: string;
  expiry_date: string;
  purchase_date: string;
  purchase_price: number;
  purchase_channel: string;
  purchase_shipping_share: number;
  develop_date: string | null;
  develop_price: number;
  develop_lab: string | null;
  notes: string | null;
  created_at: string;
  deleted_at: string | null;
}

interface ChannelRow {
  purchase_channel: string;
  count: number;
  total_spend: number;
}

interface InventoryResponse {
  value: InventoryValueRow;
  expiring: ExpiringItemRow[];
  channels: ChannelRow[];
}

// ============= Helper Functions =============

/**
 * Merge duplicate gear items by name, summing counts.
 * Filters out null/empty names and sorts by count descending.
 */
function mergeGearCounts(arr: GearCountRow[]): GearCountRow[] {
  const map: Record<string, number> = {};
  arr.forEach(item => {
    if (!item.name) return;
    map[item.name] = (map[item.name] || 0) + item.count;
  });
  return Object.entries(map)
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count);
}

// ============= Routes =============

// GET /api/stats/summary
router.get('/summary', (req: Request, res: Response) => {
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
  db.get(sql, (err: Error | null, row: SummaryRow) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(row);
  });
});

// GET /api/stats/gear
router.get('/gear', (req: Request, res: Response) => {
  // Aggregate from:
  // 1. Legacy roll_gear table
  // 2. Legacy rolls.camera/lens text columns
  // 3. New equipment IDs (camera_equip_id, lens_equip_id)
  // 4. Fixed-lens cameras (implicit lens from camera's fixed_lens_focal_length)
  
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
    -- Legacy roll_gear text
    SELECT value as name, COUNT(*) as count FROM roll_gear WHERE type='lens' AND value NOT IN ('', '-', '--', '—') GROUP BY value
    UNION ALL
    -- Legacy rolls.lens text (only for rolls without lens_equip_id and without fixed-lens camera)
    SELECT lens as name, COUNT(*) as count FROM rolls 
    WHERE lens IS NOT NULL AND lens != '' AND lens NOT IN ('-','--','—') 
      AND lens_equip_id IS NULL 
      AND (camera_equip_id IS NULL OR camera_equip_id NOT IN (SELECT id FROM equip_cameras WHERE has_fixed_lens = 1))
    GROUP BY lens
    UNION ALL
    -- Equipment lens IDs
    SELECT (l.brand || ' ' || l.model) as name, COUNT(*) as count 
    FROM rolls r 
    JOIN equip_lenses l ON r.lens_equip_id = l.id 
    GROUP BY l.id
    UNION ALL
    -- Fixed-lens cameras (implicit lens from camera data)
    -- Use camera name + focal length as unique identifier for each fixed lens
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

  db.all(sqlCameras, (err: Error | null, cameras: GearCountRow[]) => {
    if (err) return res.status(500).json({ error: err.message });
    
    db.all(sqlLenses, (err2: Error | null, lenses: GearCountRow[]) => {
      if (err2) return res.status(500).json({ error: err2.message });

      db.all(sqlFilms, (err3: Error | null, films: GearCountRow[]) => {
        if (err3) return res.status(500).json({ error: err3.message });

        // Merge duplicates (e.g. "Nikon FM2" from legacy and "Nikon FM2" from gear table)
        const response: GearStatsResponse = {
          cameras: mergeGearCounts(cameras).slice(0, 10),
          lenses: mergeGearCounts(lenses).slice(0, 10),
          films: films.sort((a, b) => b.count - a.count).slice(0, 10)
        };

        res.json(response);
      });
    });
  });
});

// GET /api/stats/activity
router.get('/activity', (req: Request, res: Response) => {
  const sql = `
    SELECT strftime('%Y-%m', start_date) as month, COUNT(*) as count 
    FROM rolls 
    WHERE start_date IS NOT NULL 
    GROUP BY month 
    ORDER BY month ASC
  `;
  db.all(sql, (err: Error | null, rows: ActivityRow[]) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

// GET /api/stats/costs
router.get('/costs', (req: Request, res: Response) => {
  // Costs are now aggregated from film_items (for inventory/spending accuracy)
  // plus legacy rolls that are not linked to film_items.
  
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
      0 as avg_purchase, -- Deprecated or needs complex calc
      0 as avg_develop,  -- Deprecated
      (SELECT COUNT(*) FROM rolls) as roll_count
  `;
  
  const monthly = `
    WITH monthly_data AS (
      -- 1. Inventory Purchases
      SELECT 
        strftime('%Y-%m', COALESCE(purchase_date, created_at)) as month,
        SUM(purchase_price + COALESCE(purchase_shipping_share, 0)) as purchase,
        0 as develop
      FROM film_items
      WHERE deleted_at IS NULL
      GROUP BY month

      UNION ALL

      -- 2. Inventory Development
      SELECT 
        strftime('%Y-%m', develop_date) as month,
        0 as purchase,
        SUM(develop_price) as develop
      FROM film_items
      WHERE deleted_at IS NULL AND develop_date IS NOT NULL
      GROUP BY month

      UNION ALL

      -- 3. Legacy Rolls (Purchase & Develop)
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
      -- Inventory Items
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

      -- Legacy Rolls
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

  db.get(summary, (err: Error | null, summaryRow: CostsSummaryRow) => {
    if (err) return res.status(500).json({ error: err.message });
    
    db.all(monthly, (err2: Error | null, monthlyRows: MonthlyDataRow[]) => {
      if (err2) return res.status(500).json({ error: err2.message });
      
      db.all(byFilm, (err3: Error | null, filmRows: FilmCostRow[]) => {
        if (err3) return res.status(500).json({ error: err3.message });
        
        const response: CostsResponse = {
          summary: summaryRow,
          monthly: monthlyRows,
          byFilm: filmRows
        };
        res.json(response);
      });
    });
  });
});

// GET /api/stats/ratings
router.get('/ratings', (req: Request, res: Response) => {
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

  db.all(distribution, (err: Error | null, distRows: RatingDistRow[]) => {
    if (err) return res.status(500).json({ error: err.message });
    
    db.all(avgByMonth, (err2: Error | null, monthRows: RatingByMonthRow[]) => {
      if (err2) return res.status(500).json({ error: err2.message });
      
      db.all(avgByCamera, (err3: Error | null, cameraRows: RatingByCameraRow[]) => {
        if (err3) return res.status(500).json({ error: err3.message });
        
        const response: RatingsResponse = {
          distribution: distRows,
          byMonth: monthRows,
          byCamera: cameraRows
        };
        res.json(response);
      });
    });
  });
});

// GET /api/stats/locations
router.get('/locations', (req: Request, res: Response) => {
  interface TableExistsRow {
    name: string;
  }
  
  // Check if locations table exists
  db.get("SELECT name FROM sqlite_master WHERE type='table' AND name='locations'", [], (checkErr: Error | null, tableExists: TableExistsRow | undefined) => {
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
    
    db.all(sql, (err: Error | null, rows: LocationStatsRow[]) => {
      if (err) {
        console.warn('Error fetching locations:', err.message);
        return res.json([]);
      }
      res.json(rows);
    });
  });
});

// GET /api/stats/temporal
router.get('/temporal', (req: Request, res: Response) => {
  // Day of week pattern (0=Sunday, 6=Saturday)
  const dayOfWeek = `
    SELECT 
      CAST(strftime('%w', taken_at) AS INTEGER) as day,
      COUNT(*) as count
    FROM photos
    WHERE taken_at IS NOT NULL
    GROUP BY day
    ORDER BY day ASC
  `;
  
  // Hour of day pattern
  const hourOfDay = `
    SELECT 
      CAST(strftime('%H', taken_at) AS INTEGER) as hour,
      COUNT(*) as count
    FROM photos
    WHERE taken_at IS NOT NULL
    GROUP BY hour
    ORDER BY hour ASC
  `;

  db.all(dayOfWeek, (err: Error | null, dayRows: DayOfWeekRow[]) => {
    if (err) return res.status(500).json({ error: err.message });
    
    db.all(hourOfDay, (err2: Error | null, hourRows: HourOfDayRow[]) => {
      if (err2) return res.status(500).json({ error: err2.message });
      
      const response: TemporalResponse = {
        byDay: dayRows,
        byHour: hourRows
      };
      res.json(response);
    });
  });
});

// GET /api/stats/themes
router.get('/themes', (req: Request, res: Response) => {
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
  
  db.all(sql, (err: Error | null, rows: ThemeRow[]) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

// GET /api/stats/inventory
router.get('/inventory', (req: Request, res: Response) => {
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

  db.get(sqlValue, (err: Error | null, valueRow: InventoryValueRow) => {
    if (err) return res.status(500).json({ error: err.message });
    
    db.all(sqlExpiring, (err2: Error | null, expiringRows: ExpiringItemRow[]) => {
      if (err2) return res.status(500).json({ error: err2.message });

      db.all(sqlChannel, (err3: Error | null, channelRows: ChannelRow[]) => {
        if (err3) return res.status(500).json({ error: err3.message });

        const response: InventoryResponse = {
          value: valueRow,
          expiring: expiringRows,
          channels: channelRows
        };
        res.json(response);
      });
    });
  });
});

// CommonJS export for compatibility
module.exports = router;
export default router;
