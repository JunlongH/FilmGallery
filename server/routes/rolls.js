const express = require('express');
const router = express.Router();
const db = require('../db');
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
// Disable sharp cache to prevent file locking on Windows
sharp.cache(false);

const { uploadTmp, uploadDefault } = require('../config/multer');
const { uploadsDir, tmpUploadDir, rollsDir } = require('../config/paths');
const { moveFileSync } = require('../utils/file-helpers');
const { runAsync, allAsync } = require('../utils/db-helpers');
const { attachTagsToPhotos } = require('../services/tag-service');

// Create roll
const cpUpload = uploadTmp.array('files', 200);
router.post('/', (req, res) => {
  cpUpload(req, res, async (err) => {
    if (err) {
      console.error('Upload error', err);
      return res.status(500).json({ error: err.message });
    }
    try {
      const body = req.body || {};
      const title = body.title || null;
      const start_date = body.start_date || null;
      const end_date = body.end_date || null;
      const camera = body.camera || null;
      const lens = body.lens || null;
      const shooter = body.shooter || null;
      const film_type = body.film_type || null;
      const filmId = body.filmId ? Number(body.filmId) : null;
      const notes = body.notes || null;
      const tmpFiles = body.tmpFiles ? (typeof body.tmpFiles === 'string' ? JSON.parse(body.tmpFiles) : body.tmpFiles) : null;
      const coverIndex = body.coverIndex ? Number(body.coverIndex) : null;
      const isNegativeGlobal = body.isNegative === 'true' || body.isNegative === true;
      console.log('[CREATE ROLL] isNegativeGlobal:', isNegativeGlobal);

      if (start_date && end_date) {
        const sd = new Date(start_date);
        const ed = new Date(end_date);
        if (isNaN(sd.getTime()) || isNaN(ed.getTime())) return res.status(400).json({ error: 'Invalid start_date or end_date' });
        if (sd > ed) return res.status(400).json({ error: 'start_date cannot be later than end_date' });
      }

      // Insert Roll
      const sql = `INSERT INTO rolls (title, start_date, end_date, camera, lens, shooter, filmId, film_type, notes) VALUES (?,?,?,?,?,?,?,?,?)`;
      await new Promise((resolve, reject) => {
        db.run(sql, [title, start_date, end_date, camera, lens, shooter, filmId, film_type, notes], function(err) {
          if (err) reject(err);
          else {
            this.lastID; // access this context
            resolve(this.lastID);
          }
        });
      }).then(async (rollId) => {
        const folderName = String(rollId); // numeric folder naming scheme
        const rollFolderPath = path.join(rollsDir, folderName);
        fs.mkdirSync(rollFolderPath, { recursive: true });
        db.run('UPDATE rolls SET folderName = ? WHERE id = ?', [folderName, rollId]);

        const fullDir = path.join(rollFolderPath, 'full');
        const thumbDir = path.join(rollFolderPath, 'thumb');
        // Ensure subdirectories exist before writing files / thumbnails
        try {
          if (!fs.existsSync(fullDir)) fs.mkdirSync(fullDir, { recursive: true });
          if (!fs.existsSync(thumbDir)) fs.mkdirSync(thumbDir, { recursive: true });
        } catch (mkErr) {
          console.error('Failed to create roll subdirectories', mkErr);
        }

        const incoming = [];
        if (req.files && req.files.length) incoming.push(...req.files.map(f => ({ tmpPath: f.path, originalName: f.originalname, tmpName: f.filename, isNegative: isNegativeGlobal })));
        if (tmpFiles && Array.isArray(tmpFiles)) {
          for (const t of tmpFiles) {
            const tmpName = t.tmpName || t.filename;
            const tmpPath = path.join(tmpUploadDir, tmpName);
            if (!tmpName || !fs.existsSync(tmpPath)) continue;
            incoming.push({ tmpPath, originalName: tmpName, tmpName, isNegative: t.isNegative !== undefined ? t.isNegative : isNegativeGlobal });
          }
        }

        // Group files by base name to handle pairs (negative + thumb)
        const groups = new Map();
        for (const f of incoming) {
          const originalName = f.originalName || f.tmpName;
          const parsed = path.parse(originalName);
          let base = parsed.name;
          let type = 'main';
          
          // Check for thumb suffix
          if (base.toLowerCase().endsWith('_thumb') || base.toLowerCase().endsWith('-thumb')) {
            base = base.replace(/[-_]thumb$/i, '');
            type = 'thumb';
          }
          
          if (!groups.has(base)) groups.set(base, { main: null, thumb: null, order: incoming.indexOf(f) });
          const g = groups.get(base);
          if (type === 'main') {
             g.main = f;
             g.order = incoming.indexOf(f); 
          } else {
             g.thumb = f;
             if (!g.main) g.order = incoming.indexOf(f); 
          }
        }

        const sortedGroups = Array.from(groups.values()).sort((a, b) => a.order - b.order);

        let frameCounter = 0;
        const inserted = [];
        
        for (const group of sortedGroups) {
          const f = group.main || group.thumb;
          if (!f) continue;

          frameCounter += 1;
          const frameNumber = String(frameCounter).padStart(2, '0');
          const ext = path.extname(f.originalName || f.tmpName) || '.jpg';
          const baseName = `${rollId}_${frameNumber}`;
          
          let finalName = `${baseName}${ext}`;
          let negativeRelPath = null;
          let fullRelPath = null;
          let thumbRelPath = null;

          const isNegative = f.isNegative;

          if (isNegative) {
            console.log(`[CREATE ROLL] Processing negative for ${f.originalName}`);
            const negName = `${baseName}_neg${ext}`;
            const negDir = path.join(rollFolderPath, 'negative');
            const negThumbDir = path.join(rollFolderPath, 'negative', 'thumb');
            if (!fs.existsSync(negDir)) fs.mkdirSync(negDir, { recursive: true });
            if (!fs.existsSync(negThumbDir)) fs.mkdirSync(negThumbDir, { recursive: true });

            const negPath = path.join(negDir, negName);
            
            try {
              // Move main file to negative path
              moveFileSync(f.tmpPath, negPath);
              negativeRelPath = path.join('rolls', folderName, 'negative', negName).replace(/\\/g, '/');

              // Handle Negative Thumbnail
              const negThumbName = `${baseName}-thumb.jpg`;
              const negThumbPath = path.join(negThumbDir, negThumbName);
              
              if (group.thumb) {
                 // Use uploaded thumb
                 moveFileSync(group.thumb.tmpPath, negThumbPath);
              } else {
                 // Generate thumb
                 await sharp(negPath)
                  .resize({ width: 240, height: 240, fit: 'inside' })
                  .jpeg({ quality: 40 })
                  .toFile(negThumbPath)
                  .catch(thErr => console.error('Negative Thumbnail generation failed', thErr.message));
              }

              // Copy negative thumb to main thumb dir (for grid view)
              const mainThumbName = `${baseName}-thumb.jpg`;
              const mainThumbPath = path.join(thumbDir, mainThumbName);
              if (fs.existsSync(negThumbPath)) {
                fs.copyFileSync(negThumbPath, mainThumbPath);
                thumbRelPath = path.join('rolls', folderName, 'thumb', mainThumbName).replace(/\\/g, '/');
              }

              // Do NOT generate positive
              fullRelPath = null;

            } catch (mvErr) {
              console.error('Failed processing negative file', mvErr);
              continue;
            }
          } else {
            // Positive Logic
            const destPath = path.join(fullDir, finalName);
            try {
              moveFileSync(f.tmpPath, destPath);
              fullRelPath = path.join('rolls', folderName, 'full', finalName).replace(/\\/g, '/');
            } catch (mvErr) {
              console.error('Failed moving temp file to dest', mvErr);
              continue; 
            }

            // Generate thumbnail
            const thumbName = `${baseName}-thumb.jpg`;
            const thumbPath = path.join(thumbDir, thumbName);
            
            if (group.thumb) {
               // Use uploaded thumb
               moveFileSync(group.thumb.tmpPath, thumbPath);
            } else {
               // Generate thumb
               if (fs.existsSync(destPath)) {
                  await sharp(destPath)
                  .resize({ width: 240, height: 240, fit: 'inside' })
                  .jpeg({ quality: 40 })
                  .toFile(thumbPath)
                  .catch(thErr => console.error('Thumbnail generation failed', thErr.message));
               }
            }
            
            if (fs.existsSync(thumbPath)) {
               thumbRelPath = path.join('rolls', folderName, 'thumb', thumbName).replace(/\\/g, '/');
            }
          }

          inserted.push({ frameNumber, filename: finalName, fullRelPath, thumbRelPath, negativeRelPath });
        }

        const stmt = db.prepare(`INSERT INTO photos (roll_id, frame_number, filename, full_rel_path, thumb_rel_path, negative_rel_path) VALUES (?,?,?,?,?,?)`);
        for (const p of inserted) stmt.run(rollId, p.frameNumber, p.filename, p.fullRelPath, p.thumbRelPath, p.negativeRelPath);
        stmt.finalize();

        // Set cover
        try {
            let coverToSet = null;
            if (filmId) {
              // Try to get film thumb
              const frow = await new Promise((res, rej) => db.get('SELECT thumbPath FROM films WHERE id = ?', [filmId], (e, r) => e ? rej(e) : res(r)));
              if (frow && frow.thumbPath) coverToSet = frow.thumbPath;
            }
            
            if (!coverToSet && inserted.length) {
               const idx = (Number.isFinite(coverIndex) && coverIndex >= 0 && coverIndex < inserted.length) ? coverIndex : 0;
               // Prefer thumbRelPath if fullRelPath is null (negative case)
               const p = inserted[idx];
               const pathForCover = p.fullRelPath || p.thumbRelPath || p.negativeRelPath;
               if (pathForCover) {
                  coverToSet = `/uploads/${pathForCover}`.replace(/\\/g, '/');
               }
            }
            
            if (coverToSet) {
               db.run('UPDATE rolls SET coverPath = ? WHERE id = ?', [coverToSet, rollId]);
            }
        } catch (covErr) {
            console.error('Error setting default cover for roll', covErr);
        }

        const filesForClient = inserted.map(p => ({
          filename: p.filename,
          url: p.fullRelPath ? `/uploads/${p.fullRelPath}` : null,
          fullRelPath: p.fullRelPath,
          thumbRelPath: p.thumbRelPath
        }));

        db.get('SELECT * FROM rolls WHERE id = ?', [rollId], (e2, row) => {
          if (e2) return res.status(500).json({ error: e2.message });
          res.status(201).json({ ok: true, roll: row, files: filesForClient });
        });

      }).catch(err => {
         console.error('Transaction error', err);
         res.status(500).json({ error: err.message });
      });

    } catch (err) {
      console.error('POST /api/rolls (multipart) handler error', err);
      res.status(500).json({ ok: false, error: err.message });
    }
  });
});

// GET /api/rolls
router.get('/', (req, res) => {
  const sql = `
    SELECT rolls.*, films.name AS film_name_joined 
    FROM rolls 
    LEFT JOIN films ON rolls.filmId = films.id 
    ORDER BY rolls.start_date DESC, rolls.id DESC
  `;
  db.all(sql, (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

// GET /api/rolls/:id
router.get('/:id', (req, res) => {
  const id = req.params.id;
  const sql = `
    SELECT rolls.*, films.name AS film_name_joined, films.iso AS film_iso_joined
    FROM rolls
    LEFT JOIN films ON rolls.filmId = films.id
    WHERE rolls.id = ?
  `;
  db.get(sql, [id], (err, row) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!row) return res.status(404).json({ error: 'Not found' });
    res.json(row);
  });
});

// PUT /api/rolls/:id
router.put('/:id', (req, res) => {
  const id = req.params.id;
  const { title, start_date, end_date, camera, lens, shooter, film_type, filmId, notes } = req.body;
  if (start_date && end_date) {
    const sd = new Date(start_date);
    const ed = new Date(end_date);
    if (isNaN(sd.getTime()) || isNaN(ed.getTime())) return res.status(400).json({ error: 'Invalid start_date or end_date' });
    if (sd > ed) return res.status(400).json({ error: 'start_date cannot be later than end_date' });
  }
  const sql = `UPDATE rolls SET title=?, start_date=?, end_date=?, camera=?, lens=?, shooter=?, film_type=?, filmId=?, notes=? WHERE id=?`;
  db.run(sql, [title, start_date, end_date, camera, lens, shooter, film_type, filmId, notes, id], function(err){
    if (err) return res.status(500).json({ error: err.message });
    res.json({ updated: this.changes });
  });
});

// DELETE /api/rolls/:id
router.delete('/:id', (req, res) => {
  const id = req.params.id;
  console.log(`[DELETE] Request to delete roll id: ${id}`);
  db.get('SELECT cover_photo, coverPath, folderName FROM rolls WHERE id = ?', [id], (err, row) => {
    if (err) return res.status(500).json({ error: err.message });
    
    console.log(`[DELETE] DB Row for ${id}:`, row);

    const performDelete = (folderName) => {
      console.log(`[DELETE] performDelete called with folderName: ${folderName}`);
      const cover = row && (row.cover_photo || row.coverPath);
      // delete cover if it exists and is NOT inside the folder we are about to delete
      if (cover) {
        const coverAbs = path.join(uploadsDir, '../', cover.replace(/^\//, '')); // Assuming cover path is relative to server root or uploads?
        // In server.js: path.join(__dirname, cover.replace(/^\//, ''))
        // __dirname was server root.
        // So path.join(uploadsDir, '../', ...) is roughly correct if uploadsDir is server/uploads.
        // Let's use path.resolve(uploadsDir, '..', cover...)
        
        // Wait, if cover starts with /uploads/, we should strip it and use uploadsDir.
        let coverPath;
        if (cover.startsWith('/uploads/')) {
            coverPath = path.join(uploadsDir, cover.replace(/^\/uploads\//, ''));
        } else {
            // Legacy path relative to server root?
            // Let's assume it's relative to server root.
            coverPath = path.join(uploadsDir, '../', cover.replace(/^\//, ''));
        }

        const targetFolder = folderName ? path.join(rollsDir, folderName) : null;
        if (!targetFolder || !coverPath.startsWith(targetFolder)) {
           fs.unlink(coverPath, () => {});
        }
      }

      const deleteDb = () => {
        console.log(`[DELETE] Deleting from DB for id: ${id}`);
        db.run('DELETE FROM rolls WHERE id = ?', [id], function(e){
          if (e) return res.status(500).json({ error: e.message });
          res.json({ deleted: this.changes });
        });
      };

      if (folderName) {
        const folderPath = path.join(rollsDir, folderName);
        console.log(`[DELETE] Attempting to delete folder: ${folderPath}`);
        if (fs.existsSync(folderPath)) {
          console.log(`[DELETE] Folder exists. Calling fs.rm...`);
          fs.rm(folderPath, { recursive: true, force: true }, (rmErr) => {
            if (rmErr) console.error('[DELETE] Error deleting folder', folderPath, rmErr);
            else console.log(`[DELETE] Folder deleted successfully: ${folderPath}`);
            deleteDb();
          });
        } else {
          console.log(`[DELETE] Folder does not exist on disk: ${folderPath}`);
          deleteDb();
        }
      } else {
        console.log(`[DELETE] No folderName provided to performDelete.`);
        deleteDb();
      }
    };

    if (row && row.folderName) {
      performDelete(row.folderName);
    } else {
      // Try to deduce folder from photos if folderName missing
      db.get('SELECT full_rel_path FROM photos WHERE roll_id = ? AND full_rel_path IS NOT NULL LIMIT 1', [id], (e2, pRow) => {
        console.log(`[DELETE] Deduced photo row:`, pRow);
        let deduced = null;
        const candidatePath = pRow && pRow.full_rel_path;
        if (candidatePath) {
          const parts = candidatePath.split('/');
          // expect rolls/<folder>/...
          if (parts.length >= 2 && (parts[0] === 'rolls' || parts[0] === 'uploads')) {
             deduced = parts[1] === 'rolls' ? parts[2] : parts[1]; // handle potential variations
             if (parts[0] === 'rolls') deduced = parts[1];
          }
        }
        // If still null, try ID as fallback for new system
        if (!deduced) deduced = String(id);
        console.log(`[DELETE] Deduced folder name: ${deduced}`);
        performDelete(deduced);
      });
    }
  });
});

// Photos endpoints (now rely on full_rel_path in uploads/rolls)
router.get('/:rollId/photos', async (req, res) => {
  const rollId = req.params.rollId;
  try {
    const rows = await allAsync('SELECT * FROM photos WHERE roll_id = ? ORDER BY frame_number', [rollId]);
    const withTags = await attachTagsToPhotos(rows);
    res.json(withTags);
  } catch (err) {
    console.error('[GET] roll photos error', err.message);
    res.status(500).json({ error: err.message });
  }
});

router.post('/:rollId/photos', uploadDefault.single('image'), async (req, res) => {
  const rollId = req.params.rollId;
  const { caption, taken_at, rating, isNegative } = req.body;
  if (!req.file) return res.status(400).json({ error: 'image file required' });
  const ext = path.extname(req.file.originalname || req.file.filename) || '.jpg';
  const rollFolder = path.join(rollsDir, String(rollId));
  fs.mkdirSync(rollFolder, { recursive: true });
  
  try {
    const cntRow = await new Promise((resolve, reject) => {
        db.get('SELECT COUNT(*) AS cnt FROM photos WHERE roll_id = ?', [rollId], (err, row) => {
            if (err) reject(err);
            else resolve(row);
        });
    });

    const nextIndex = (cntRow && cntRow.cnt ? cntRow.cnt : 0) + 1;
    const frameNumber = String(nextIndex).padStart(2, '0');
    const baseName = `${rollId}_${frameNumber}`;
    const finalName = `${baseName}${ext}`;
    const fullDir = path.join(rollFolder, 'full');
    const thumbDir = path.join(rollFolder, 'thumb');
    
    if (!fs.existsSync(fullDir)) fs.mkdirSync(fullDir, { recursive: true });
    if (!fs.existsSync(thumbDir)) fs.mkdirSync(thumbDir, { recursive: true });

    let negativeRelPath = null;
    let fullRelPath = null;
    let thumbRelPath = null;
    const isNeg = isNegative === 'true' || isNegative === true;

    if (isNeg) {
      const negName = `${baseName}_neg${ext}`;
      const negDir = path.join(rollFolder, 'negative');
      const negThumbDir = path.join(rollFolder, 'negative', 'thumb');
      if (!fs.existsSync(negDir)) fs.mkdirSync(negDir, { recursive: true });
      if (!fs.existsSync(negThumbDir)) fs.mkdirSync(negThumbDir, { recursive: true });
      
      const negPath = path.join(negDir, negName);
      
      moveFileSync(req.file.path, negPath);
      negativeRelPath = path.join('rolls', String(rollId), 'negative', negName).replace(/\\/g, '/');
      
      // Generate negative thumb
      const negThumbName = `${baseName}-thumb.jpg`;
      const negThumbPath = path.join(negThumbDir, negThumbName);
      
      await sharp(negPath)
        .resize({ width: 240, height: 240, fit: 'inside' })
        .jpeg({ quality: 40 })
        .toFile(negThumbPath)
        .catch(thErr => console.error('Negative Thumbnail generation failed', thErr.message));

      // Copy negative thumb to main thumb dir
      const mainThumbName = `${baseName}-thumb.jpg`;
      const mainThumbPath = path.join(thumbDir, mainThumbName);
      if (fs.existsSync(negThumbPath)) {
        fs.copyFileSync(negThumbPath, mainThumbPath);
        thumbRelPath = path.join('rolls', String(rollId), 'thumb', mainThumbName).replace(/\\/g, '/');
      }
      
      // Do NOT generate positive
      fullRelPath = null;

    } else {
      // Positive Logic
      const destPath = path.join(fullDir, finalName);
      moveFileSync(req.file.path, destPath);
      fullRelPath = path.join('rolls', String(rollId), 'full', finalName).replace(/\\/g, '/');

      // Generate thumbnail
      const thumbName = `${baseName}-thumb.jpg`;
      const thumbPath = path.join(thumbDir, thumbName);
      
      try {
        await sharp(destPath)
          .resize({ width: 240, height: 240, fit: 'inside' })
          .jpeg({ quality: 40 })
          .toFile(thumbPath);
        thumbRelPath = path.join('rolls', String(rollId), 'thumb', thumbName).replace(/\\/g, '/');
      } catch (thErr) {
        console.error('Thumbnail generation failed', thErr.message);
      }
    }

    const sql = `INSERT INTO photos (roll_id, frame_number, filename, full_rel_path, thumb_rel_path, negative_rel_path, caption, taken_at, rating) VALUES (?,?,?,?,?,?,?,?,?)`;
    db.run(sql, [rollId, frameNumber, finalName, fullRelPath, thumbRelPath, negativeRelPath, caption, taken_at, rating], function(err) {
      if (err) return res.status(500).json({ error: err.message });
      res.status(201).json({ ok: true, id: this.lastID, filename: finalName, fullRelPath, thumbRelPath, negativeRelPath });
    });

  } catch (err) {
      console.error('Upload photo error', err);
      return res.status(500).json({ error: err.message });
  }
});

// set roll cover
router.post('/:id/cover', (req, res) => {
  const rollId = req.params.id;
  const { photoId, filename } = req.body;
  if (!photoId && !filename) return res.status(400).json({ error: 'photoId or filename required' });

  const setCover = (file) => {
    // Normalize the incoming file value into both coverPath and cover_photo.
    let coverPath = null;
    let coverPhoto = null;
    if (!file) {
      coverPath = null;
      coverPhoto = null;
    } else if (typeof file === 'string') {
      // If already an absolute uploads path, use it directly
      if (file.startsWith('/uploads') || file.startsWith('http://') || file.startsWith('https://')) {
        coverPath = file;
        // If it starts with '/uploads/', also set legacy cover_photo as the path without leading '/uploads/' prefix
        if (file.startsWith('/uploads/')) coverPhoto = file.replace(/^\/uploads\//, '');
        else coverPhoto = file;
      } else if (file.startsWith('/')) {
        // leading slash but not /uploads — keep as-is for coverPath, and store cover_photo without leading '/'
        coverPath = file;
        coverPhoto = file.replace(/^\//, '');
      } else {
        // likely a legacy relative path like 'rolls/...', produce '/uploads/<file>' as coverPath
        coverPhoto = file;
        coverPath = `/uploads/${file}`.replace(/\\/g, '/');
      }
    }

    const sql = `UPDATE rolls SET coverPath = ?, cover_photo = ? WHERE id = ?`;
    db.run(sql, [coverPath, coverPhoto, rollId], function(err){
      if (err) return res.status(500).json({ error: err.message });
      db.get('SELECT * FROM rolls WHERE id = ?', [rollId], (e, row) => {
        if (e) return res.status(500).json({ error: e.message });
        res.json(row);
      });
    });
  };

  if (photoId) {
    db.get('SELECT filename, full_rel_path FROM photos WHERE id = ? AND roll_id = ?', [photoId, rollId], (err, row) => {
      if (err) return res.status(500).json({ error: err.message });
      if (!row) return res.status(404).json({ error: 'photo not found' });
      const photoPath = row.full_rel_path;
      if (photoPath) {
        const coverPath = `/uploads/${photoPath}`.replace(/\\/g, '/');
        const sql = `UPDATE rolls SET coverPath = ? WHERE id = ?`;
        db.run(sql, [coverPath, rollId], function(err2) {
          if (err2) return res.status(500).json({ error: err2.message });
          db.get('SELECT * FROM rolls WHERE id = ?', [rollId], (e, rrow) => {
            if (e) return res.status(500).json({ error: e.message });
            res.json(rrow);
          });
        });
      } else {
        setCover(row.filename);
      }
    });
  } else {
    setCover(filename);
  }
});

module.exports = router;
