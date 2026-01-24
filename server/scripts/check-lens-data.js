const sqlite3 = require('sqlite3');
const db = new sqlite3.Database('C:/Users/JunlongHuang/OneDrive/FilmGallery/film.db');

console.log('=== Testing FINAL photo-based Statistics query ===\n');

// FINAL: Photo-based lens statistics with proper fixed-lens handling
const sqlLenses = `
  SELECT lens_name as name, COUNT(*) as count FROM (
    SELECT 
      CASE 
        -- Check if roll's camera is a fixed-lens camera
        WHEN EXISTS (
          SELECT 1 FROM equip_cameras c 
          WHERE c.id = COALESCE(p.camera_equip_id, r.camera_equip_id) 
          AND c.has_fixed_lens = 1
        ) THEN (
          -- Fixed lens camera: build full description from camera data
          SELECT 
            c.brand || ' ' || c.model || ' ' || 
            CAST(CAST(c.fixed_lens_focal_length AS INTEGER) AS TEXT) || 'mm f/' || 
            c.fixed_lens_max_aperture
          FROM equip_cameras c 
          WHERE c.id = COALESCE(p.camera_equip_id, r.camera_equip_id)
        )
        ELSE COALESCE(
          -- Photo's own lens
          (SELECT name FROM equip_lenses WHERE id = p.lens_equip_id),
          p.lens,
          -- Roll's lens
          (SELECT name FROM equip_lenses WHERE id = r.lens_equip_id),
          r.lens
        )
      END as lens_name
    FROM photos p
    JOIN rolls r ON p.roll_id = r.id
  )
  WHERE lens_name IS NOT NULL AND lens_name != '' AND lens_name NOT IN ('-', '--', '—')
  GROUP BY lens_name
`;

// Normalize function
const normalizeLensName = (name) => {
  if (!name) return '';
  return name
    .replace(/(\d+)\.0+mm/g, '$1mm')
    .replace(/f\/(\d+)\.0+$/g, 'f/$1')
    .replace(/\s+/g, ' ')
    .trim();
};

db.all(sqlLenses, (e, r) => {
  if (e) { console.log('Error:', e); db.close(); return; }
  
  console.log('=== Raw photo-based lens results ===');
  r.forEach(g => console.log(`  "${g.name}" (${g.count} photos)`));
  
  // Merge with normalization
  const map = {};
  r.forEach(item => {
    if (!item.name) return;
    const key = normalizeLensName(item.name);
    map[key] = (map[key] || 0) + item.count;
  });
  const merged = Object.entries(map)
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count);
  
  console.log('\n=== Final merged results (what Statistics shows) ===');
  merged.forEach(g => console.log(`  "${g.name}" (${g.count} photos)`));
  
  // Also check total photos
  db.get('SELECT COUNT(*) as cnt FROM photos', (e2, row) => {
    console.log(`\nTotal photos in database: ${row?.cnt || 0}`);
    db.close();
  });
});
