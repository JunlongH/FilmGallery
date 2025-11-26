const { runAsync, allAsync } = require('../utils/db-helpers');

const normalizeTagNames = (input) => {
  if (!Array.isArray(input)) return [];
  const trimmed = input
    .map(t => (t === null || t === undefined) ? '' : String(t).trim())
    .filter(Boolean);
  const map = new Map();
  for (const name of trimmed) {
    const key = name.toLowerCase();
    if (!map.has(key)) map.set(key, name);
  }
  return Array.from(map.values());
};

async function ensureTagsExist(names) {
  if (!names.length) return [];
  await Promise.all(names.map(name => runAsync('INSERT OR IGNORE INTO tags (name) VALUES (?)', [name])));
  const placeholders = names.map(() => '?').join(',');
  const rows = await allAsync(`SELECT id, name FROM tags WHERE name IN (${placeholders})`, names);
  return rows;
}

async function savePhotoTags(photoId, rawNames) {
  const names = normalizeTagNames(rawNames);
  
  // 1. Remove existing links for this photo
  await runAsync('DELETE FROM photo_tags WHERE photo_id = ?', [photoId]);
  
  if (!names.length) {
    // If no tags left for this photo, we might need to cleanup tags that are now orphaned
    // (We do this cleanup at the end regardless)
  } else {
    // 2. Ensure tags exist and get their IDs
    const tags = await ensureTagsExist(names);
    const tagMap = new Map();
    tags.forEach(tag => tagMap.set(tag.name.toLowerCase(), tag));
    
    // 3. Link tags to photo
    await Promise.all(
      names
        .map(name => tagMap.get(name.toLowerCase()))
        .filter(Boolean)
        .map(tag => runAsync('INSERT OR IGNORE INTO photo_tags (photo_id, tag_id) VALUES (?, ?)', [photoId, tag.id]))
    );
  }

  // 4. Cleanup: Delete tags that have no associated photos
  await runAsync('DELETE FROM tags WHERE id NOT IN (SELECT DISTINCT tag_id FROM photo_tags)');

  if (!names.length) return [];
  const tags = await ensureTagsExist(names); 
  return tags;
}

async function attachTagsToPhotos(rows = []) {
  if (!Array.isArray(rows) || rows.length === 0) return rows;
  const ids = rows.map(r => r && r.id).filter(id => id !== undefined && id !== null);
  if (!ids.length) return rows;
  const placeholders = ids.map(() => '?').join(',');
  const tagRows = await allAsync(
    `SELECT pt.photo_id, t.id AS tag_id, t.name
     FROM photo_tags pt
     JOIN tags t ON t.id = pt.tag_id
     WHERE pt.photo_id IN (${placeholders})
     ORDER BY t.name COLLATE NOCASE`,
    ids
  );
  const map = new Map();
  tagRows.forEach(row => {
    if (!map.has(row.photo_id)) map.set(row.photo_id, []);
    map.get(row.photo_id).push({ id: row.tag_id, name: row.name });
  });
  return rows.map(r => Object.assign({}, r, { tags: map.get(r.id) || [] }));
}

module.exports = { savePhotoTags, attachTagsToPhotos };
