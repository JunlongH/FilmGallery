#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const db = require('./db');

const uploadsDir = path.join(__dirname, 'uploads');
const rollsDir = path.join(uploadsDir, 'rolls');

const normalizeRelPath = (rel) => {
  if (!rel) return null;
  return rel.replace(/^\/+/, '')
    .replace(/^uploads\//i, '')
    .replace(/^uploads\\/, '')
    .replace(/^\/uploads\//, '')
    .replace(/\\/g, '/');
};

const ensureDir = (dir) => {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
};

const runAsync = (sql, params = []) => new Promise((resolve, reject) => {
  db.run(sql, params, function(err) {
    if (err) return reject(err);
    resolve(this);
  });
});

const allAsync = (sql, params = []) => new Promise((resolve, reject) => {
  db.all(sql, params, (err, rows) => {
    if (err) return reject(err);
    resolve(rows);
  });
});

const moveIfExists = (src, dest) => {
  if (!src || !fs.existsSync(src)) return false;
  if (path.resolve(src) === path.resolve(dest)) return true;
  ensureDir(path.dirname(dest));
  if (fs.existsSync(dest)) fs.unlinkSync(dest);
  fs.renameSync(src, dest);
  return true;
};

const generateThumb = async (source, dest) => {
  if (!fs.existsSync(source)) return false;
  try {
    await sharp(source)
      .resize({ width: 240, height: 240, fit: 'inside' })
      .jpeg({ quality: 40 })
      .toFile(dest);
    return true;
  } catch (err) {
    console.error('Thumbnail generation failed', source, err.message);
    return false;
  }
};

(async () => {
  console.log('Starting roll folder migration...');
  try {
    // ensure new column exists
    const columns = await allAsync("PRAGMA table_info('photos')");
    if (!columns.some(col => col.name === 'full_rel_path')) {
      console.log('Adding full_rel_path column to photos');
      await runAsync('ALTER TABLE photos ADD COLUMN full_rel_path TEXT');
    }

    const photos = await allAsync(
      `SELECT photos.id, photos.roll_id, photos.filename,
              photos.rel_path, photos.full_rel_path, photos.thumb_rel_path,
              rolls.folderName
       FROM photos
       LEFT JOIN rolls ON rolls.id = photos.roll_id`
    );

    if (!photos.length) {
      console.log('No photos found to migrate.');
    }

    for (const photo of photos) {
      const folderName = photo.folderName || String(photo.roll_id || photo.id || '');
      if (!folderName) continue;
      const fullDir = path.join(rollsDir, folderName, 'full');
      const thumbDir = path.join(rollsDir, folderName, 'thumb');
      ensureDir(fullDir);
      ensureDir(thumbDir);

      const normalizedFull = normalizeRelPath(photo.full_rel_path || photo.rel_path);
      const normalizedThumb = normalizeRelPath(photo.thumb_rel_path);
      const baseName = photo.filename || (normalizedFull ? path.basename(normalizedFull) : `photo-${photo.id || Date.now()}.jpg`);
      const destFull = path.join(fullDir, baseName);
      const fallbackSource = path.join(rollsDir, folderName, baseName);
      let movedMain = false;

      if (normalizedFull) {
        const source = path.join(uploadsDir, normalizedFull);
        movedMain = moveIfExists(source, destFull);
      }
      if (!movedMain && fs.existsSync(fallbackSource)) {
        movedMain = moveIfExists(fallbackSource, destFull);
      }

      if (!movedMain && normalizedFull) {
        console.warn(`Could not move main file for photo ${photo.id} from ${normalizedFull}`);
      }

      const thumbName = `${path.parse(baseName).name}-thumb.jpg`;
      const destThumb = path.join(thumbDir, thumbName);
      let movedThumb = false;
      if (normalizedThumb) {
        const thumbSource = path.join(uploadsDir, normalizedThumb);
        movedThumb = moveIfExists(thumbSource, destThumb);
      }
      if (!movedThumb) {
        const legacyThumb = path.join(rollsDir, folderName, thumbName);
        movedThumb = moveIfExists(legacyThumb, destThumb);
      }
      if (!movedThumb && fs.existsSync(destFull)) {
        movedThumb = await generateThumb(destFull, destThumb);
      }

      const normalizedFullRel = path.posix.join('rolls', folderName, 'full', baseName);
      const normalizedThumbRel = path.posix.join('rolls', folderName, 'thumb', thumbName);
      await runAsync(
        'UPDATE photos SET rel_path = ?, full_rel_path = ?, thumb_rel_path = ? WHERE id = ?',
        [normalizedFullRel, normalizedFullRel, normalizedThumbRel, photo.id]
      );

      if (!fs.existsSync(destThumb)) {
        console.warn(`Thumbnail missing for photo ${photo.id} after migration.`);
      }
    }

    console.log('Roll folder migration finished.');
  } catch (err) {
    console.error('Migration failed:', err);
  } finally {
    db.close();
  }
})();
