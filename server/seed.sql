-- seed.sql (idempotent, FK-safe)
-- Updated: 2026-01-14 to match current schema
-- This file provides sample data for development/testing only.
-- Production databases should NOT run this seed.

-- Sample Film (with all current columns)
INSERT INTO films (name, iso, category, brand, format, process, thumbPath, thumbnail_url)
SELECT 'Portra 400', 400, 'color-negative', 'Kodak', '135', 'C-41', NULL, NULL
WHERE NOT EXISTS (
  SELECT 1 FROM films WHERE name = 'Portra 400' AND brand = 'Kodak'
);

INSERT INTO films (name, iso, category, brand, format, process, thumbPath, thumbnail_url)
SELECT 'Pro 400H', 400, 'color-negative', 'Fujifilm', '135', 'C-41', NULL, NULL
WHERE NOT EXISTS (
  SELECT 1 FROM films WHERE name = 'Pro 400H' AND brand = 'Fujifilm'
);

INSERT INTO films (name, iso, category, brand, format, process, thumbPath, thumbnail_url)
SELECT 'HP5 Plus', 400, 'bw-negative', 'Ilford', '135', 'BW', NULL, NULL
WHERE NOT EXISTS (
  SELECT 1 FROM films WHERE name = 'HP5 Plus' AND brand = 'Ilford'
);

-- Sample Roll (with current columns)
INSERT INTO rolls (title, start_date, end_date, camera, lens, photographer, filmId, film_type, exposures, coverPath, folderName, notes, display_seq)
SELECT 'Sardinia Trip', '2024-09-12', '2024-09-12', 'Nikon FM2', 'Nikkor 50mm f/1.8', 'Junlong', f.id, 'color-negative', 36, NULL, 'sardinia-2024', 'Bright daylight, coastal shots', 1
FROM films f
WHERE f.name = 'Portra 400' AND f.brand = 'Kodak'
  AND NOT EXISTS (SELECT 1 FROM rolls WHERE title = 'Sardinia Trip')
LIMIT 1;

-- Sample Photos (with current columns including display_seq)
INSERT INTO photos (roll_id, frame_number, filename, full_rel_path, thumb_rel_path, caption, date_taken, time_taken, rating, display_seq)
SELECT r.id, '01', 'sardinia-01.jpg', 'rolls/sardinia-2024/full/sardinia-01.jpg', 'rolls/sardinia-2024/thumb/sardinia-01-thumb.jpg', 'Harbor morning', '2024-09-12', '08:10:00', 4, 1
FROM rolls r
WHERE r.title = 'Sardinia Trip'
  AND NOT EXISTS (
    SELECT 1 FROM photos p WHERE p.roll_id = r.id AND p.filename = 'sardinia-01.jpg'
  );

INSERT INTO photos (roll_id, frame_number, filename, full_rel_path, thumb_rel_path, caption, date_taken, time_taken, rating, display_seq)
SELECT r.id, '02', 'sardinia-02.jpg', 'rolls/sardinia-2024/full/sardinia-02.jpg', 'rolls/sardinia-2024/thumb/sardinia-02-thumb.jpg', 'Old wall texture', '2024-09-12', '09:02:00', 5, 2
FROM rolls r
WHERE r.title = 'Sardinia Trip'
  AND NOT EXISTS (
    SELECT 1 FROM photos p WHERE p.roll_id = r.id AND p.filename = 'sardinia-02.jpg'
  );

-- Sample Tags
INSERT INTO tags (name)
SELECT '旅行'
WHERE NOT EXISTS (SELECT 1 FROM tags WHERE name = '旅行');

INSERT INTO tags (name)
SELECT '海边'
WHERE NOT EXISTS (SELECT 1 FROM tags WHERE name = '海边');

-- Link photo to tag
INSERT INTO photo_tags (photo_id, tag_id)
SELECT p.id, t.id
FROM photos p, tags t, rolls r
WHERE p.filename = 'sardinia-01.jpg'
  AND r.id = p.roll_id AND r.title = 'Sardinia Trip'
  AND t.name = '旅行'
  AND NOT EXISTS (
    SELECT 1 FROM photo_tags pt WHERE pt.photo_id = p.id AND pt.tag_id = t.id
  );

