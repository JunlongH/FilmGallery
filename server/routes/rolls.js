const express = require('express');
const router = express.Router();
const db = require('../db');
const { recomputeRollSequence } = require('../services/roll-service');
const { addOrUpdateGear } = require('../services/gear-service');
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
// Disable sharp cache to prevent file locking on Windows
sharp.cache(false);
// Limit concurrency to 1 to prevent memory spikes/crashes with large TIFFs
sharp.concurrency(1);
// Increase timeout for large TIF files (30 seconds)
// This is especially important for TIF files in OneDrive which may be slow to read
const SHARP_TIMEOUT = 30000;

// Helper: Run sharp operation with timeout protection
const sharpWithTimeout = (sharpOp, timeoutMs = SHARP_TIMEOUT) => {
  return Promise.race([
    sharpOp,
    new Promise((_, reject) => 
      setTimeout(() => reject(new Error('Sharp operation timed out')), timeoutMs)
    )
  ]);
};

const { uploadTmp, uploadDefault } = require('../config/multer');
const { uploadsDir, tmpUploadDir, localTmpDir, rollsDir } = require('../config/paths');
const { moveFileSync, moveFileAsync, copyFileAsyncWithRetry } = require('../utils/file-helpers');
const { runAsync, allAsync, getAsync } = require('../utils/db-helpers');
const { attachTagsToPhotos } = require('../services/tag-service');
const { linkFilmItemToRoll } = require('../services/film/film-item-service');
const PreparedStmt = require('../utils/prepared-statements');
const { generateContactSheet, STYLES } = require('../services/contactSheetGenerator');

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
      const photographer = body.photographer || null;
      const film_type = body.film_type || null;
      const filmIdRaw = body.filmId ? Number(body.filmId) : null;
      const film_item_id = body.film_item_id ? Number(body.film_item_id) : null;
      let filmId = filmIdRaw;
      let filmIso = null;
      const notes = body.notes || null;
      const tmpFiles = body.tmpFiles ? (typeof body.tmpFiles === 'string' ? JSON.parse(body.tmpFiles) : body.tmpFiles) : null;
      const coverIndex = body.coverIndex ? Number(body.coverIndex) : null;
      const isNegativeGlobal = body.isNegative === 'true' || body.isNegative === true;
      const fileMetadata = body.fileMetadata ? (typeof body.fileMetadata === 'string' ? JSON.parse(body.fileMetadata) : body.fileMetadata) : {};
      console.log('[CREATE ROLL] isNegativeGlobal:', isNegativeGlobal);

      if (start_date && end_date) {
        const sd = new Date(start_date);
        const ed = new Date(end_date);
        if (isNaN(sd.getTime()) || isNaN(ed.getTime())) return res.status(400).json({ error: 'Invalid start_date or end_date' });
        if (sd > ed) return res.status(400).json({ error: 'start_date cannot be later than end_date' });
      }

      // Insert Roll
      // If a film_item_id is provided, prefer its film_id for this roll
      if (film_item_id) {
        try {
          const itemRow = await new Promise((resolve, reject) => {
            db.get('SELECT film_id FROM film_items WHERE id = ? AND deleted_at IS NULL', [film_item_id], (err, row) => {
              if (err) return reject(err);
              resolve(row);
            });
          });
          if (itemRow && itemRow.film_id) filmId = itemRow.film_id;
        } catch (e) {
          console.error('[CREATE ROLL] Failed to load film_item for filmId override', e.message);
        }
      }

      // Load film ISO (used as default ISO for photos)
      if (filmId) {
        try {
          const isoRow = await new Promise((resolve, reject) => {
            db.get('SELECT iso FROM films WHERE id = ?', [filmId], (err, row) => err ? reject(err) : resolve(row));
          });
          filmIso = isoRow && isoRow.iso ? isoRow.iso : null;
        } catch (isoErr) {
          console.warn('[CREATE ROLL] Failed to load film iso', isoErr.message || isoErr);
        }
      }

      const sql = `INSERT INTO rolls (title, start_date, end_date, camera, lens, photographer, filmId, film_type, notes, film_item_id) VALUES (?,?,?,?,?,?,?,?,?,?)`;

      // ==============================
      // ATOMIC CREATE (DB + FILES)
      // ==============================
      let rollId = null;
      let folderName = null;
      let rollFolderPath = null;
      const createdPaths = []; // absolute paths created under uploads/rolls

      const rmWithRetry = async (absPath, retries = 3) => {
        for (let i = 0; i < retries; i++) {
          try {
            await fs.promises.rm(absPath, { recursive: true, force: true });
            return;
          } catch (e) {
            if (i === retries - 1) return;
            await new Promise(r => setTimeout(r, 300 * (i + 1)));
          }
        }
      };

      let stmtToFinalize = null;
      try {
        // Collect incoming files from Multer and any tmpFiles provided
        const incoming = [];
        const reqFilesCount = (req.files && req.files.length) ? req.files.length : 0;
        const tmpFilesCount = (tmpFiles && Array.isArray(tmpFiles)) ? tmpFiles.length : 0;
        console.log(`[CREATE ROLL] Received files: req.files=${reqFilesCount}, tmpFiles=${tmpFilesCount}`);

        if (req.files && req.files.length) {
          incoming.push(...req.files.map(f => ({ tmpPath: f.path, originalName: f.originalname, tmpName: f.filename, isNegative: isNegativeGlobal })));
        }

        // IMPORTANT: tmpFiles are also stored in localTmpDir now (NOT uploads/tmp)
        if (tmpFiles && Array.isArray(tmpFiles)) {
          for (const t of tmpFiles) {
            const tmpName = t.tmpName || t.filename;
            const tmpPath = path.join(localTmpDir, tmpName);
            if (!tmpName || !fs.existsSync(tmpPath)) continue;
            incoming.push({ tmpPath, originalName: tmpName, tmpName, isNegative: t.isNegative !== undefined ? t.isNegative : isNegativeGlobal });
          }
        }

        if (!incoming.length) {
          console.error('[CREATE ROLL] No files in request. Aborting create roll.');
          return res.status(400).json({ ok: false, error: 'No files uploaded. Please select at least one image.' });
        }

        // Group files by base name to handle pairs (main + thumb)
        const groups = new Map();
        for (const f of incoming) {
          const originalName = f.originalName || f.tmpName;
          const parsed = path.parse(originalName);
          let base = parsed.name;
          let type = 'main';

          if (base.toLowerCase().endsWith('_thumb') || base.toLowerCase().endsWith('-thumb')) {
            base = base.replace(/[-_]thumb$/i, '');
            type = 'thumb';
          }

          if (!groups.has(base)) groups.set(base, { main: null, thumb: null });
          groups.get(base)[type] = f;
        }

        const sortedGroups = Array.from(groups.values()).sort((a, b) => {
          const nameA = (a.main || a.thumb).originalName;
          const nameB = (b.main || b.thumb).originalName;
          return nameA.localeCompare(nameB);
        });

        // Begin transaction AFTER validation so we can fully rollback.
        await runAsync('BEGIN');
        const rollInsertRes = await runAsync(sql, [title, start_date, end_date, camera, lens, photographer, filmId, film_type, notes, film_item_id]);
        rollId = rollInsertRes?.lastID;
        if (!rollId) throw new Error('Failed to create roll');

        // If a film_item_id is provided, link it to this roll.
        if (film_item_id) {
          // Determine target status based on current film item state
          // If already sent_to_lab, move to developed (scans uploaded)
          // Otherwise move to shot (just finished shooting)
          let targetStatus = 'shot';
          try {
            const filmItem = await getAsync('SELECT status FROM film_items WHERE id = ?', [film_item_id]);
            if (filmItem && filmItem.status === 'sent_to_lab') {
              targetStatus = 'developed';
            }
          } catch (e) {
            console.warn('[CREATE ROLL] Failed to check film item status, defaulting to shot:', e.message);
          }
          
          await linkFilmItemToRoll({
            filmItemId: film_item_id,
            rollId,
            loadedCamera: camera,
            targetStatus,
          });
        }

        folderName = String(rollId);
        rollFolderPath = path.join(rollsDir, folderName);
        await runAsync('UPDATE rolls SET folderName = ? WHERE id = ?', [folderName, rollId]);

        const fullDir = path.join(rollFolderPath, 'full');
        const thumbDir = path.join(rollFolderPath, 'thumb');
        const originalsDir = path.join(rollFolderPath, 'originals');

        const inserted = [];
        let frameCounter = 0;

        const resolveMeta = (metaMap, keys = []) => {
          for (const k of keys) {
            if (!k) continue;
            const m = metaMap[k];
            if (!m) continue;
            if (typeof m === 'string') return { date: m, lens: null, country: null, city: null, detail_location: null, aperture: null, shutter_speed: null };
            if (typeof m === 'object') return {
              date: m.date || null,
              lens: m.lens || null,
              country: m.country || null,
              city: m.city || null,
              detail_location: m.detail_location || null,
              aperture: m.aperture ?? null,
              shutter_speed: m.shutter_speed || null
            };
          }
          return { date: null, lens: null, country: null, city: null, detail_location: null, aperture: null, shutter_speed: null };
        };

        const locationCache = new Map(); // key: country||city -> id
        const rollLocationIds = new Set();

        const ensureLocationId = async (country, city) => {
          const normCity = (city || '').trim();
          const normCountry = (country || '').trim();
          if (!normCity) return null;
          const key = `${normCountry.toLowerCase()}||${normCity.toLowerCase()}`;
          if (locationCache.has(key)) return locationCache.get(key);

          // Try to match existing rows by city + (country_code or country_name) case-insensitive
          const existing = await getAsync(
            `SELECT id FROM locations
             WHERE LOWER(city_name) = LOWER(?)
               AND (
                 LOWER(country_name) = LOWER(?) OR country_code = ? OR country_code IS NULL OR country_name IS NULL
               )
             LIMIT 1`,
            [normCity, normCountry, normCountry]
          );
          if (existing && existing.id) {
            locationCache.set(key, existing.id);
            return existing.id;
          }

          // Insert new row with the provided country name (country_code unknown here)
          const insertedId = await runAsync(
            'INSERT INTO locations (country_name, city_name) VALUES (?, ?)',
            [normCountry || null, normCity]
          ).then(res => res.lastID).catch(() => null);
          if (insertedId) locationCache.set(key, insertedId);
          return insertedId;
        };

        // Prepare statement for insertion (includes date_taken/time_taken + camera/lens/photographer + location)
        // NOTE: must be finalized even if we rollback.
        let stmt = null;
        stmt = db.prepare(`INSERT INTO photos (
          roll_id, frame_number, filename,
          full_rel_path, thumb_rel_path, negative_rel_path,
          original_rel_path, positive_rel_path, positive_thumb_rel_path, negative_thumb_rel_path,
          is_negative_source, taken_at, date_taken, time_taken,
          location_id, detail_location,
          camera, lens, photographer, aperture, shutter_speed, iso
        ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
        stmtToFinalize = stmt;
        
        const runInsert = (params) => new Promise((resolve, reject) => {
            stmt.run(params, function(err) {
                if (err) reject(err);
                else resolve(this.lastID);
            });
        });

        // ============================================================
        // ATOMIC WORKFLOW:
        // 1) Process ALL images in localTmpDir (OS temp)
        // 2) If (and only if) all succeed, move/copy to final uploads/rolls
        // 3) Insert DB rows
        // Any error -> ROLLBACK + cleanup roll folder
        // ============================================================

        // Stage operations first (no writes to OneDrive/rolls until all processing succeeded)
        const stagedOps = []; // { type: 'move'|'copy', src, dest }
        const stagedTempArtifacts = []; // temp files to delete after successful publish
        const stagedPhotos = []; // metadata for DB insert

        for (const group of sortedGroups) {
          const f = group.main || group.thumb;
          if (!f) continue;

          // If the group only has a thumb file (no main), treat it as the main.
          // Only use a separate thumb file when it is actually distinct.
          const thumbFile = group.thumb && group.thumb !== f ? group.thumb : null;

          frameCounter += 1;
          const frameNumber = String(frameCounter).padStart(2, '0');
          const originalExt = path.extname(f.originalName || f.tmpName) || '.jpg';
          const baseName = `${rollId}_${frameNumber}`;
          
          // Generated display files are always JPG
          let finalName = `${baseName}.jpg`;
          let negativeRelPath = null;
          let fullRelPath = null;
          let thumbRelPath = null;
          let originalRelPath = null;
          let positiveRelPath = null;
          let positiveThumbRelPath = null;
          let negativeThumbRelPath = null;
          let isNegativeSource = 0;

          const isNegative = f.isNegative;

          // Prepare final destination paths
          const originalName = `${baseName}_original${originalExt}`;
          const finalOriginalPath = path.join(originalsDir, originalName);
          originalRelPath = path.join('rolls', folderName, 'originals', originalName).replace(/\\/g, '/');

          // Process into LOCAL temp dir
          if (isNegative) {
            const negName = `${baseName}_neg.jpg`;
            const negThumbName = `${baseName}-thumb.jpg`;

            const finalNegPath = path.join(rollFolderPath, 'negative', negName);
            const finalNegThumbPath = path.join(rollFolderPath, 'negative', 'thumb', negThumbName);
            const finalMainThumbPath = path.join(thumbDir, negThumbName);

            const tempNegPath = path.join(localTmpDir, `proc_${baseName}_neg.jpg`);
            stagedTempArtifacts.push(tempNegPath);
            
            try {
              console.log(`[CREATE ROLL] Processing negative ${frameNumber}: ${path.basename(f.tmpPath)} (${(fs.statSync(f.tmpPath).size / 1024 / 1024).toFixed(2)} MB)`);
              const startTime = Date.now();
              await sharpWithTimeout(
                sharp(f.tmpPath).jpeg({ quality: 95 }).toFile(tempNegPath)
              );
              const duration = Date.now() - startTime;
              console.log(`[CREATE ROLL] Negative ${frameNumber} processed in ${duration}ms`);
            } catch (sharpErr) {
              console.error(`[CREATE ROLL] Sharp processing failed for negative ${frameNumber}:`, sharpErr);
              const err = new Error(`Failed to process negative image ${path.basename(f.tmpPath)}: ${sharpErr.message}`);
              err.originalError = sharpErr;
              err.fileInfo = { name: path.basename(f.tmpPath), size: fs.statSync(f.tmpPath).size };
              throw err;
            }

            let tempNegThumbPath = null;
            if (!thumbFile) {
              tempNegThumbPath = path.join(localTmpDir, `proc_${baseName}_neg_thumb.jpg`);
              stagedTempArtifacts.push(tempNegThumbPath);
              try {
                await sharpWithTimeout(
                  sharp(tempNegPath)
                    .resize({ width: 240, height: 240, fit: 'inside' })
                    .jpeg({ quality: 40 })
                    .toFile(tempNegThumbPath),
                  10000 // Thumbnail should be fast, 10s timeout
                );
              } catch (thumbErr) {
                console.error(`[CREATE ROLL] Thumbnail generation failed for negative ${frameNumber}:`, thumbErr);
                const err = new Error(`Failed to generate thumbnail for ${path.basename(f.tmpPath)}: ${thumbErr.message}`);
                err.originalError = thumbErr;
                throw err;
              }
            }

            // Stage publish ops (do not touch rollsDir yet)
            stagedOps.push({ type: 'move', src: f.tmpPath, dest: finalOriginalPath });
            stagedOps.push({ type: 'move', src: tempNegPath, dest: finalNegPath });

            const thumbSrc = thumbFile ? thumbFile.tmpPath : tempNegThumbPath;
            stagedOps.push({ type: 'copy', src: thumbSrc, dest: finalMainThumbPath });
            stagedOps.push({ type: 'move', src: thumbSrc, dest: finalNegThumbPath });

            negativeRelPath = path.join('rolls', folderName, 'negative', negName).replace(/\\/g, '/');
            thumbRelPath = path.join('rolls', folderName, 'thumb', negThumbName).replace(/\\/g, '/');
            negativeThumbRelPath = path.join('rolls', folderName, 'negative', 'thumb', negThumbName).replace(/\\/g, '/');
            isNegativeSource = 1;
            fullRelPath = null;
            positiveRelPath = null;
            positiveThumbRelPath = null;
          } else {
            const destPath = path.join(fullDir, finalName);
            const thumbName = `${baseName}-thumb.jpg`;
            const thumbPath = path.join(thumbDir, thumbName);

            const tempFullPath = path.join(localTmpDir, `proc_${baseName}_full.jpg`);
            stagedTempArtifacts.push(tempFullPath);
            
            try {
              console.log(`[CREATE ROLL] Processing positive ${frameNumber}: ${path.basename(f.tmpPath)} (${(fs.statSync(f.tmpPath).size / 1024 / 1024).toFixed(2)} MB)`);
              const startTime = Date.now();
              await sharpWithTimeout(
                sharp(f.tmpPath).jpeg({ quality: 95 }).toFile(tempFullPath)
              );
              const duration = Date.now() - startTime;
              console.log(`[CREATE ROLL] Positive ${frameNumber} processed in ${duration}ms`);
            } catch (sharpErr) {
              console.error(`[CREATE ROLL] Sharp processing failed for positive ${frameNumber}:`, sharpErr);
              const err = new Error(`Failed to process image ${path.basename(f.tmpPath)}: ${sharpErr.message}`);
              err.originalError = sharpErr;
              err.fileInfo = { name: path.basename(f.tmpPath), size: fs.statSync(f.tmpPath).size };
              throw err;
            }

            let tempThumbPath = null;
            if (!thumbFile) {
              tempThumbPath = path.join(localTmpDir, `proc_${baseName}_thumb.jpg`);
              stagedTempArtifacts.push(tempThumbPath);
              try {
                await sharpWithTimeout(
                  sharp(tempFullPath)
                    .resize({ width: 240, height: 240, fit: 'inside' })
                    .jpeg({ quality: 40 })
                    .toFile(tempThumbPath),
                  10000 // Thumbnail should be fast, 10s timeout
                );
              } catch (thumbErr) {
                console.error(`[CREATE ROLL] Thumbnail generation failed for positive ${frameNumber}:`, thumbErr);
                const err = new Error(`Failed to generate thumbnail for ${path.basename(f.tmpPath)}: ${thumbErr.message}`);
                err.originalError = thumbErr;
                throw err;
              }
            }

            stagedOps.push({ type: 'move', src: f.tmpPath, dest: finalOriginalPath });
            stagedOps.push({ type: 'move', src: tempFullPath, dest: destPath });
            stagedOps.push({ type: 'move', src: (thumbFile ? thumbFile.tmpPath : tempThumbPath), dest: thumbPath });

            fullRelPath = path.join('rolls', folderName, 'full', finalName).replace(/\\/g, '/');
            positiveRelPath = fullRelPath;
            thumbRelPath = path.join('rolls', folderName, 'thumb', thumbName).replace(/\\/g, '/');
            positiveThumbRelPath = thumbRelPath;
          }

          // Stage DB insert params
          const meta = resolveMeta(fileMetadata, [f.originalName, f.tmpName, finalName]);
          const dateTaken = meta.date || null;
          const takenAt = dateTaken ? `${dateTaken}T12:00:00` : null;
          const lensForPhoto = meta.lens || lens || null;
          const cameraForPhoto = camera || null;
          const photographerForPhoto = photographer || null;
          const apertureForPhoto = meta.aperture !== undefined && meta.aperture !== null && meta.aperture !== '' ? Number(meta.aperture) : null;
          const shutterForPhoto = meta.shutter_speed || null;
          const isoForPhoto = filmIso !== null && filmIso !== undefined ? filmIso : null;
          const locationId = await ensureLocationId(meta.country, meta.city);
          const detailLoc = meta.detail_location || null;
          if (locationId) rollLocationIds.add(locationId);

          stagedPhotos.push({
            frameNumber,
            finalName,
            fullRelPath,
            thumbRelPath,
            negativeRelPath,
            originalRelPath,
            positiveRelPath,
            positiveThumbRelPath,
            negativeThumbRelPath,
            isNegativeSource,
            takenAt,
            dateTaken,
            locationId,
            detailLoc,
            cameraForPhoto,
            lensForPhoto,
            photographerForPhoto,
            apertureForPhoto,
            shutterForPhoto,
            isoForPhoto,
          });

        }


        // Ensure roll directories exist only after ALL processing succeeded
        await fs.promises.mkdir(rollFolderPath, { recursive: true });
        await fs.promises.mkdir(fullDir, { recursive: true });
        await fs.promises.mkdir(thumbDir, { recursive: true });
        await fs.promises.mkdir(originalsDir, { recursive: true });
        await fs.promises.mkdir(path.join(rollFolderPath, 'negative'), { recursive: true });
        await fs.promises.mkdir(path.join(rollFolderPath, 'negative', 'thumb'), { recursive: true });

        // Publish filesystem changes (moves/copies into uploads/rolls)
        console.log(`[CREATE ROLL] Publishing ${stagedOps.length} file operations to OneDrive...`);
        for (let i = 0; i < stagedOps.length; i++) {
          const op = stagedOps[i];
          try {
            const srcSize = fs.existsSync(op.src) ? (fs.statSync(op.src).size / 1024 / 1024).toFixed(2) : 'N/A';
            console.log(`[CREATE ROLL] [${i+1}/${stagedOps.length}] ${op.type} ${path.basename(op.src)} (${srcSize} MB) -> ${path.basename(op.dest)}`);
            
            if (op.type === 'copy') {
              await copyFileAsyncWithRetry(op.src, op.dest);
            } else {
              await moveFileAsync(op.src, op.dest);
            }
            createdPaths.push(op.dest);
          } catch (fileOpErr) {
            console.error(`[CREATE ROLL] File operation failed [${op.type}] ${path.basename(op.src)} -> ${path.basename(op.dest)}:`, fileOpErr);
            const err = new Error(`Failed to ${op.type} file ${path.basename(op.src)} to OneDrive folder: ${fileOpErr.message}`);
            err.originalError = fileOpErr;
            err.operation = { type: op.type, src: op.src, dest: op.dest };
            throw err;
          }
        }
        console.log(`[CREATE ROLL] All files published successfully.`);

        // Cleanup staged temp artifacts after publish
        for (const t of stagedTempArtifacts) {
          try { if (fs.existsSync(t)) await fs.promises.unlink(t); } catch (_) {}
        }
        // Insert DB records (atomic: any failure -> rollback)
        for (const p of stagedPhotos) {
          await runInsert([
            rollId,
            p.frameNumber,
            p.finalName,
            p.fullRelPath,
            p.thumbRelPath,
            p.negativeRelPath,
            p.originalRelPath,
            p.positiveRelPath,
            p.positiveThumbRelPath,
            p.negativeThumbRelPath,
            p.isNegativeSource,
            p.takenAt,
            p.dateTaken,
            null, // time_taken unused here
            p.locationId,
            p.detailLoc,
            p.cameraForPhoto,
            p.lensForPhoto,
            p.photographerForPhoto,
            p.apertureForPhoto,
            p.shutterForPhoto,
            p.isoForPhoto
          ]);
          inserted.push({
            filename: p.finalName,
            fullRelPath: p.fullRelPath,
            thumbRelPath: p.thumbRelPath,
            negativeRelPath: p.negativeRelPath,
            positiveRelPath: p.positiveRelPath,
          });
        }

        // Seed roll_gear with initial values using intelligent deduplication
        try {
          if (camera) await addOrUpdateGear(rollId, 'camera', camera).catch(e => console.error('Add camera failed', e));
          if (lens) await addOrUpdateGear(rollId, 'lens', lens).catch(e => console.error('Add lens failed', e));
          if (photographer) await addOrUpdateGear(rollId, 'photographer', photographer).catch(e => console.error('Add photographer failed', e));
        } catch(e){ console.error('Seed roll_gear failed', e.message); }

        // Set cover (within transaction)
        let coverToSet = null;
        if (filmId) {
          const frow = await getAsync('SELECT thumbPath FROM films WHERE id = ?', [filmId]).catch(() => null);
          if (frow && frow.thumbPath) coverToSet = frow.thumbPath;
        }

        if (!coverToSet && inserted.length) {
          const idx = (Number.isFinite(coverIndex) && coverIndex >= 0 && coverIndex < inserted.length) ? coverIndex : 0;
          const p = inserted[idx];
          const pathForCover = p.positiveRelPath || p.fullRelPath || p.thumbRelPath || p.negativeRelPath;
          if (p && pathForCover) coverToSet = `/uploads/${pathForCover}`.replace(/\\/g, '/');
        }

        if (coverToSet) {
          await runAsync('UPDATE rolls SET coverPath = ? WHERE id = ?', [coverToSet, rollId]);
        }

        const filesForClient = inserted.map(p => ({
          filename: p.filename,
          url: p.fullRelPath ? `/uploads/${p.fullRelPath}` : null,
          fullRelPath: p.fullRelPath,
          thumbRelPath: p.thumbRelPath
        }));

        // Attach roll_locations after photo insert completes
        try {
          for (const locId of rollLocationIds) {
            await runAsync('INSERT OR IGNORE INTO roll_locations (roll_id, location_id) VALUES (?, ?)', [rollId, locId]);
          }
        } catch (locErr) {
          console.error('[CREATE ROLL] Failed to upsert roll_locations', locErr.message || locErr);
        }

        console.log(`[CREATE ROLL] Complete. Roll ${rollId} created with ${inserted.length}/${sortedGroups.length} photos`);

        await runAsync('COMMIT');

        const row = await getAsync('SELECT * FROM rolls WHERE id = ?', [rollId]);
        res.status(201).json({ ok: true, roll: row, files: filesForClient });

        // Recompute display sequence after creation (best-effort)
        try { await recomputeRollSequence(); } catch (e) { console.error('recompute sequence failed', e); }

      } catch (err) {
        console.error('[CREATE ROLL] Atomic create failed:');
        console.error('Error message:', err.message);
        console.error('Error stack:', err.stack);
        if (err.originalError) {
          console.error('Original error:', err.originalError);
        }
        if (err.fileInfo) {
          console.error('File info:', err.fileInfo);
        }
        if (err.operation) {
          console.error('Failed operation:', err.operation);
        }
        
        try { await runAsync('ROLLBACK'); } catch (_) {}

        // Cleanup created roll folder/files (best-effort)
        if (rollFolderPath) {
          await rmWithRetry(rollFolderPath);
        } else {
          // Fallback: delete any created paths we tracked
          for (const p of createdPaths) {
            try { await rmWithRetry(p); } catch (_) {}
          }
        }

        return res.status(500).json({ ok: false, error: err.message || 'Create roll failed', details: err.fileInfo || err.operation });
      } finally {
        // Always finalize the prepared statement to avoid lingering locks.
        if (stmtToFinalize) {
          try {
            stmtToFinalize.finalize();
          } catch (finalizeErr) {
            console.error('[CREATE ROLL] Failed to finalize statement', finalizeErr.message || finalizeErr);
          }
        }
      }

    } catch (err) {
      console.error('POST /api/rolls (multipart) handler error:');
      console.error('Error:', err);
      console.error('Stack:', err.stack);
      res.status(500).json({ ok: false, error: err.message || 'Internal server error' });
    }
  });
});

// GET /api/rolls
router.get('/', (req, res) => {
  const { camera, lens, photographer, location_id, year, month, ym, film } = req.query;

  const toArray = (v) => {
    if (v === undefined || v === null) return [];
    if (Array.isArray(v)) return v.filter(Boolean);
    if (typeof v === 'string' && v.includes(',')) return v.split(',').map(s=>s.trim()).filter(Boolean);
    return v === '' ? [] : [v];
  };
  const cameras = toArray(camera);
  const lenses = toArray(lens);
  const photographers = toArray(photographer);
  const locations = toArray(location_id).map(v => String(v).split('::')[0]); // support "id::label"
  const years = toArray(year);
  const months = toArray(month);
  const yms = toArray(ym);
  const films = toArray(film);
  
  let sql = `
    SELECT DISTINCT rolls.*, films.name AS film_name_joined 
    FROM rolls 
    LEFT JOIN films ON rolls.filmId = films.id 
  `;
  
  const params = [];
  const conditions = [];

  if (cameras.length) {
    const cameraConds = cameras.map(() => `(
      rolls.camera = ? OR 
      EXISTS (SELECT 1 FROM roll_gear WHERE roll_id = rolls.id AND type='camera' AND value = ?)
    )`).join(' OR ');
    conditions.push(`(${cameraConds})`);
    cameras.forEach(c => { params.push(c, c); });
  }

  if (lenses.length) {
    const lensConds = lenses.map(() => `(
      rolls.lens = ? OR 
      EXISTS (SELECT 1 FROM roll_gear WHERE roll_id = rolls.id AND type='lens' AND value = ?)
    )`).join(' OR ');
    conditions.push(`(${lensConds})`);
    lenses.forEach(l => { params.push(l, l); });
  }

  if (photographers.length) {
    const pgConds = photographers.map(() => `(
      rolls.photographer = ? OR 
      EXISTS (SELECT 1 FROM roll_gear WHERE roll_id = rolls.id AND type='photographer' AND value = ?) OR
      EXISTS (SELECT 1 FROM photos WHERE roll_id = rolls.id AND photographer = ?)
    )`).join(' OR ');
    conditions.push(`(${pgConds})`);
    photographers.forEach(p => { params.push(p, p, p); });
  }

  if (locations.length) {
    const placeholders = locations.map(()=>'?').join(',');
    conditions.push(`(
      EXISTS (SELECT 1 FROM roll_locations WHERE roll_id = rolls.id AND location_id IN (${placeholders}))
      OR EXISTS (SELECT 1 FROM photos WHERE roll_id = rolls.id AND location_id IN (${placeholders}))
    )`);
    params.push(...locations, ...locations);
  }

  if (years.length || months.length || yms.length) {
    const parts = [];
    if (yms.length) {
      parts.push(`strftime('%Y-%m', rolls.start_date) IN (${yms.map(()=>'?').join(',')})`);
      params.push(...yms);
    } else {
      if (years.length) { parts.push(`strftime('%Y', rolls.start_date) IN (${years.map(()=>'?').join(',')})`); params.push(...years); }
      if (months.length) { parts.push(`strftime('%m', rolls.start_date) IN (${months.map(()=>'?').join(',')})`); params.push(...months); }
    }
    if (parts.length) conditions.push(`(${parts.join(' OR ')})`);
  }

  if (films.length) {
    const filmConds = films.map(() => `(
      rolls.filmId = ? OR films.name = ? OR rolls.film_type = ?
    )`).join(' OR ');
    conditions.push(`(${filmConds})`);
    films.forEach(fv => { params.push(fv, fv, fv); });
  }

  if (conditions.length > 0) {
    sql += ' WHERE ' + conditions.join(' AND ');
  }

  sql += ' ORDER BY rolls.start_date DESC, rolls.id DESC';

  db.all(sql, params, (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

// GET /api/rolls/:id
router.get('/:id', async (req, res) => {
  const id = req.params.id;
  try {
    const sql = `
      SELECT rolls.*, films.name AS film_name_joined, films.iso AS film_iso_joined
      FROM rolls
      LEFT JOIN films ON rolls.filmId = films.id
      WHERE rolls.id = ?
    `;
    const row = await new Promise((resolve, reject) => {
      db.get(sql, [id], (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });
    
    if (!row) return res.status(404).json({ error: 'Not found' });
    
    // Check if locations table exists before querying
    db.get("SELECT name FROM sqlite_master WHERE type='table' AND name='locations'", [], async (checkErr, tableExists) => {
      const locationsQuery = tableExists ? 
        `SELECT l.id AS location_id, l.country_code, l.country_name, l.city_name, l.city_lat, l.city_lng
         FROM roll_locations rl JOIN locations l ON rl.location_id = l.id
         WHERE rl.roll_id = ? ORDER BY l.country_name, l.city_name` : null;
      
      if (!locationsQuery) {
        row.locations = [];
        // attach gear arrays
        db.all('SELECT type, value FROM roll_gear WHERE roll_id = ?', [id], (e3, gearRows) => {
          if (e3) return res.status(500).json({ error: e3.message });
          const gear = { cameras: [], lenses: [], photographers: [] };
          (gearRows || []).forEach(g => {
            if (g.type === 'camera') gear.cameras.push(g.value);
            else if (g.type === 'lens') gear.lenses.push(g.value);
            else if (g.type === 'photographer') gear.photographers.push(g.value);
          });
          row.gear = gear;
          res.json(row);
        });
      } else {
        db.all(locationsQuery, [id], (e2, locs) => {
          if (e2) {
            console.warn('Error fetching locations:', e2.message);
            row.locations = [];
          } else {
            row.locations = locs || [];
          }
          // attach gear arrays
          db.all('SELECT type, value FROM roll_gear WHERE roll_id = ?', [id], (e3, gearRows) => {
            if (e3) return res.status(500).json({ error: e3.message });
            const gear = { cameras: [], lenses: [], photographers: [] };
            (gearRows || []).forEach(g => {
              if (g.type === 'camera') gear.cameras.push(g.value);
              else if (g.type === 'lens') gear.lenses.push(g.value);
              else if (g.type === 'photographer') gear.photographers.push(g.value);
            });
            row.gear = gear;
            res.json(row);
          });
        });
      }
    });
  } catch (err) {
    console.error('[GET] roll error', err.message);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/rolls/:id/locations
router.get('/:id/locations', async (req, res) => {
  const id = req.params.id;
  const sql = `
    SELECT l.id AS location_id, l.country_code, l.country_name, l.city_name, l.city_lat, l.city_lng
    FROM roll_locations rl
    JOIN locations l ON rl.location_id = l.id
    WHERE rl.roll_id = ?
    ORDER BY l.country_name, l.city_name
  `;
  try {
    const rows = await new Promise((resolve, reject) => {
      db.all(sql, [id], (err, rows) => err ? reject(err) : resolve(rows));
    });
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/rolls/:id/preset - return stored preset JSON (parsed)
router.get('/:id/preset', (req, res) => {
  const id = req.params.id;
  db.get('SELECT preset_json FROM rolls WHERE id = ?', [id], (err, row) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!row) return res.status(404).json({ error: 'Not found' });
    let parsed = null;
    try { parsed = row.preset_json ? JSON.parse(row.preset_json) : null; } catch { parsed = null; }
    res.json({ rollId: id, preset: parsed });
  });
});

// POST /api/rolls/:id/preset - set/overwrite preset_json
// Body: { name: string, params: { inverted, inversionMode, exposure, ... curves } }
router.post('/:id/preset', (req, res) => {
  const id = req.params.id;
  const body = req.body || {};
  if (!body || !body.params) return res.status(400).json({ error: 'params required' });
  const payload = { name: body.name || 'Unnamed', params: body.params };
  let json;
  try { json = JSON.stringify(payload); } catch(e) { return res.status(400).json({ error: 'Invalid params JSON' }); }
  db.run('UPDATE rolls SET preset_json = ? WHERE id = ?', [json, id], function(err){
    if (err) return res.status(500).json({ error: err.message });
    res.json({ ok: true, updated: this.changes });
  });
});

// DELETE /api/rolls/:id/preset - clear preset_json
router.delete('/:id/preset', (req, res) => {
  const id = req.params.id;
  db.run('UPDATE rolls SET preset_json = NULL WHERE id = ?', [id], function(err){
    if (err) return res.status(500).json({ error: err.message });
    res.json({ ok: true, cleared: this.changes });
  });
});

// PUT /api/rolls/:id
router.put('/:id', async (req, res) => {
  const id = req.params.id;
  const { title, start_date, end_date, camera, lens, photographer, film_type, filmId, notes, locations, develop_lab, develop_process, develop_date, purchase_cost, develop_cost, purchase_channel, batch_number, develop_note } = req.body;
  if (start_date !== undefined && end_date !== undefined) {
    const sd = new Date(start_date);
    const ed = new Date(end_date);
    if (isNaN(sd.getTime()) || isNaN(ed.getTime())) return res.status(400).json({ error: 'Invalid start_date or end_date' });
    if (sd > ed) return res.status(400).json({ error: 'start_date cannot be later than end_date' });
  }
  
  // Build dynamic UPDATE query to only update provided fields
  const updates = [];
  const values = [];
  const fieldMap = { title, start_date, end_date, camera, lens, photographer, film_type, filmId, notes, develop_lab, develop_process, develop_date, purchase_cost, develop_cost, purchase_channel, batch_number, develop_note };
  
  for (const [key, val] of Object.entries(fieldMap)) {
    if (val !== undefined) {
      updates.push(`${key}=?`);
      values.push(val);
    }
  }
  
  if (updates.length === 0 && !Array.isArray(locations)) {
    return res.json({ ok: true, message: 'No fields to update' });
  }
  
  try {
    if (updates.length > 0) {
      const sql = `UPDATE rolls SET ${updates.join(', ')} WHERE id=?`;
      values.push(id);
      await new Promise((resolve, reject) => {
        db.run(sql, values, function(err){
          if (err) reject(err); else resolve(this.changes);
        });
      });
      
      // Update gear with intelligent deduplication
      if (camera !== undefined) await addOrUpdateGear(id, 'camera', camera).catch(e => console.error('Update camera failed', e));
      if (lens !== undefined) await addOrUpdateGear(id, 'lens', lens).catch(e => console.error('Update lens failed', e));
      if (photographer !== undefined) await addOrUpdateGear(id, 'photographer', photographer).catch(e => console.error('Update photographer failed', e));
    }
    if (Array.isArray(locations)) {
      for (const locId of locations) {
        await new Promise((resolve, reject) => db.run('INSERT OR IGNORE INTO roll_locations (roll_id, location_id) VALUES (?, ?)', [id, locId], (e)=> e?reject(e):resolve()));
      }
    }
    try { await recomputeRollSequence(); } catch(e){ console.error('recompute sequence failed', e); }
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// DELETE /api/rolls/:id
router.delete('/:id', async (req, res) => {
  const id = Number(req.params.id);
  console.log(`[DELETE] Request to delete roll id: ${id}`);

  const toUploadAbs = (relPath) => {
    if (!relPath) return null;
    const trimmed = relPath.replace(/^\/+/, '').replace(/^uploads\//, '');
    return path.join(uploadsDir, trimmed);
  };

  const deleteFilesSafe = (paths = []) => {
    const unique = Array.from(new Set(paths.filter(Boolean)));
    for (const p of unique) {
      try {
        const abs = path.resolve(p);
        if (!abs.startsWith(path.resolve(uploadsDir))) continue; // safety guard
        if (fs.existsSync(abs)) fs.rmSync(abs, { recursive: true, force: true });
      } catch (err) {
        console.warn('[DELETE] Failed to remove path', p, err.message);
      }
    }
  };

  const deduceFolderName = (row, photos) => {
    if (row && row.folderName) return row.folderName;
    for (const p of photos || []) {
      const rel = p.full_rel_path || p.positive_rel_path || p.negative_rel_path || p.thumb_rel_path;
      if (!rel) continue;
      const parts = rel.replace(/^\/+/, '').split('/');
      const idx = parts.indexOf('rolls');
      if (idx >= 0 && parts[idx + 1]) return parts[idx + 1];
      if (parts[0]) return parts[0];
    }
    return String(id);
  };

  const deleteRollRecords = async (rollId) => {
    await runAsync('BEGIN');
    try {
      await runAsync('DELETE FROM photo_tags WHERE photo_id IN (SELECT id FROM photos WHERE roll_id = ?)', [rollId]);
      await runAsync('DELETE FROM roll_locations WHERE roll_id = ?', [rollId]);
      await runAsync('DELETE FROM roll_gear WHERE roll_id = ?', [rollId]);
      await runAsync('UPDATE film_items SET roll_id = NULL, updated_at = CURRENT_TIMESTAMP WHERE roll_id = ?', [rollId]);
      await runAsync('DELETE FROM photos WHERE roll_id = ?', [rollId]);
      const result = await runAsync('DELETE FROM rolls WHERE id = ?', [rollId]);
      await runAsync('COMMIT');
      return result?.changes || 0;
    } catch (err) {
      try { await runAsync('ROLLBACK'); } catch (_) {}
      throw err;
    }
  };

  try {
    const row = await getAsync('SELECT id, cover_photo, coverPath, folderName FROM rolls WHERE id = ?', [id]);
    const photos = await allAsync(`
      SELECT id, full_rel_path, positive_rel_path, negative_rel_path, thumb_rel_path, positive_thumb_rel_path, negative_thumb_rel_path
      FROM photos WHERE roll_id = ?
    `, [id]);

    const folderName = deduceFolderName(row, photos);
    const folderPath = path.join(rollsDir, folderName);

    // Collect paths to clean up after DB delete succeeds
    const photoPaths = [];
    for (const p of photos || []) {
      photoPaths.push(toUploadAbs(p.full_rel_path));
      photoPaths.push(toUploadAbs(p.positive_rel_path));
      photoPaths.push(toUploadAbs(p.negative_rel_path));
      photoPaths.push(toUploadAbs(p.thumb_rel_path));
      photoPaths.push(toUploadAbs(p.positive_thumb_rel_path));
      photoPaths.push(toUploadAbs(p.negative_thumb_rel_path));
    }

    const cover = row && (row.cover_photo || row.coverPath);
    if (cover) {
      const coverAbs = toUploadAbs(cover);
      // Only delete cover separately if it is outside the roll folder we remove later
      if (coverAbs && (!folderPath || !path.resolve(coverAbs).startsWith(path.resolve(folderPath)))) {
        photoPaths.push(coverAbs);
      }
    }

    const deleted = await deleteRollRecords(id);
    try { await recomputeRollSequence(); } catch(err){ console.error('recompute sequence failed', err); }

    // Remove roll folder and leftover files (best-effort; DB already committed)
    deleteFilesSafe([folderPath, ...photoPaths]);

    res.json({ deleted });
  } catch (err) {
    console.error('[DELETE] Failed to delete roll', err.message || err);
    res.status(500).json({ error: err.message || 'Delete failed' });
  }
});

// Photos endpoints (now rely on full_rel_path in uploads/rolls)
router.get('/:rollId/photos', async (req, res) => {
  const rollId = req.params.rollId;
  try {
    const rows = await PreparedStmt.allAsync('photos.listByRoll', [rollId]);
    
    // DEBUG: Log first row to check paths
    if (rows && rows.length > 0) {
       const r = rows[0];
       console.log(`[DEBUG] Roll ${rollId} photo[0]: id=${r.id}, full=${r.full_rel_path}, pos=${r.positive_rel_path}, neg=${r.negative_rel_path}`);
    }

    const normalized = (rows || []).map(r => {
      const fullPath = r.positive_rel_path || r.full_rel_path || null;
      const thumbPath = r.positive_thumb_rel_path || r.thumb_rel_path || null;
      return Object.assign({}, r, {
        full_rel_path: fullPath,
        thumb_rel_path: thumbPath,
      });
    });
    const withTags = await attachTagsToPhotos(normalized);
    res.json(withTags);
  } catch (err) {
    console.error('[GET] roll photos error', err.message);
    res.status(500).json({ error: err.message });
  }
});

router.post('/:rollId/photos', uploadDefault.single('image'), async (req, res) => {
  const rollId = req.params.rollId;
  const { caption, taken_at, rating, isNegative, camera: photoCamera, lens: photoLens, photographer: photoPhotographer } = req.body;
  if (!req.file) return res.status(400).json({ error: 'image file required' });
  
  // Use original extension for the original file
  const originalExt = path.extname(req.file.originalname || req.file.filename) || '.jpg';
  
  const rollFolder = path.join(rollsDir, String(rollId));
  fs.mkdirSync(rollFolder, { recursive: true });
  
  try {
    const cntRow = await PreparedStmt.getAsync('rolls.countPhotos', [rollId]);

    const nextIndex = (cntRow && cntRow.cnt ? cntRow.cnt : 0) + 1;
    const frameNumber = String(nextIndex).padStart(2, '0');
    const baseName = `${rollId}_${frameNumber}`;
    
    // Display files are always JPG
    const finalName = `${baseName}.jpg`;
    
    const fullDir = path.join(rollFolder, 'full');
    const thumbDir = path.join(rollFolder, 'thumb');
    const originalsDir = path.join(rollFolder, 'originals');
    
    if (!fs.existsSync(fullDir)) fs.mkdirSync(fullDir, { recursive: true });
    if (!fs.existsSync(thumbDir)) fs.mkdirSync(thumbDir, { recursive: true });
    if (!fs.existsSync(originalsDir)) fs.mkdirSync(originalsDir, { recursive: true });

    let negativeRelPath = null;
    let fullRelPath = null;
    let thumbRelPath = null;
    let originalRelPath = null;
    let positiveRelPath = null;
    let positiveThumbRelPath = null;
    let negativeThumbRelPath = null;
    let isNegativeSource = 0;

    const isNeg = isNegative === 'true' || isNegative === true;

    // Save original
    const originalName = `${baseName}_original${originalExt}`;
    const originalPath = path.join(originalsDir, originalName);
    moveFileSync(req.file.path, originalPath);
    originalRelPath = path.join('rolls', String(rollId), 'originals', originalName).replace(/\\/g, '/');

    if (isNeg) {
      const negName = `${baseName}_neg.jpg`;
      const negDir = path.join(rollFolder, 'negative');
      const negThumbDir = path.join(rollFolder, 'negative', 'thumb');
      if (!fs.existsSync(negDir)) fs.mkdirSync(negDir, { recursive: true });
      if (!fs.existsSync(negThumbDir)) fs.mkdirSync(negThumbDir, { recursive: true });
      
      const negPath = path.join(negDir, negName);
      
      // Generate negative JPG from original
      await sharp(originalPath)
        .jpeg({ quality: 95 })
        .toFile(negPath);
        
      negativeRelPath = path.join('rolls', String(rollId), 'negative', negName).replace(/\\/g, '/');
      isNegativeSource = 1;
      
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
        negativeThumbRelPath = path.join('rolls', String(rollId), 'negative', 'thumb', negThumbName).replace(/\\/g, '/');
      }
      
      // Do NOT generate positive
      fullRelPath = null;
      positiveRelPath = null;

    } else {
      // Positive Logic
      const destPath = path.join(fullDir, finalName);
      
      // Generate positive JPG from original
      await sharp(originalPath)
        .jpeg({ quality: 95 })
        .toFile(destPath);
        
      fullRelPath = path.join('rolls', String(rollId), 'full', finalName).replace(/\\/g, '/');
      positiveRelPath = fullRelPath;

      // Generate thumbnail
      const thumbName = `${baseName}-thumb.jpg`;
      const thumbPath = path.join(thumbDir, thumbName);
      
      try {
        await sharp(destPath)
          .resize({ width: 240, height: 240, fit: 'inside' })
          .jpeg({ quality: 40 })
          .toFile(thumbPath);
        thumbRelPath = path.join('rolls', String(rollId), 'thumb', thumbName).replace(/\\/g, '/');
        positiveThumbRelPath = thumbRelPath;
      } catch (thErr) {
        console.error('Thumbnail generation failed', thErr.message);
      }
    }

    // Fetch roll defaults for metadata if not provided explicitly
    const rollMeta = await new Promise((resolve) => {
      db.get('SELECT camera, lens, photographer FROM rolls WHERE id = ?', [rollId], (e, row) => {
        if (e || !row) return resolve({ camera: null, lens: null, photographer: null });
        resolve(row);
      });
    });
    const finalCamera = photoCamera || rollMeta.camera || null;
    const finalLens = photoLens || rollMeta.lens || null;
    const finalPhotographer = photoPhotographer || rollMeta.photographer || null;

    const sql = `INSERT INTO photos (roll_id, frame_number, filename, full_rel_path, thumb_rel_path, negative_rel_path, caption, taken_at, rating, camera, lens, photographer) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`;
    db.run(sql, [rollId, frameNumber, finalName, fullRelPath, thumbRelPath, negativeRelPath, caption, taken_at, rating, finalCamera, finalLens, finalPhotographer], function(err) {
      if (err) return res.status(500).json({ error: err.message });
      res.status(201).json({ ok: true, id: this.lastID, filename: finalName, fullRelPath, thumbRelPath, negativeRelPath, camera: finalCamera, lens: finalLens, photographer: finalPhotographer });
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
    db.get('SELECT filename, full_rel_path, positive_rel_path, negative_rel_path FROM photos WHERE id = ? AND roll_id = ?', [photoId, rollId], (err, row) => {
      if (err) return res.status(500).json({ error: err.message });
      if (!row) return res.status(404).json({ error: 'photo not found' });
      
      const photoPath = row.positive_rel_path || row.full_rel_path || row.negative_rel_path;
      
      if (photoPath) {
        const coverPath = `/uploads/${photoPath}`.replace(/\\/g, '/');
        setCover(coverPath);
      } else {
        setCover(row.filename);
      }
    });
  } else {
    setCover(filename);
  }
});

// Contact Sheet Export
router.post('/:id/contact-sheet', async (req, res) => {
  const rollId = req.params.id;
  const { 
    style = 'kodak',
    imageSource = 'auto',
    columns = 6,
    maxTotalWidth = 4800,
    maxPhotoWidth = 400,
    quality = 95
  } = req.body;

  try {
    // Validate style
    if (!STYLES[style]) {
      return res.status(400).json({ error: `Invalid style: ${style}. Available styles: ${Object.keys(STYLES).join(', ')}` });
    }

    // Fetch roll metadata
    const roll = await getAsync(
      `SELECT r.*, f.name as film_name_joined, f.iso as film_iso_joined
       FROM rolls r
       LEFT JOIN films f ON r.filmId = f.id
       WHERE r.id = ?`,
      [rollId]
    );

    if (!roll) {
      return res.status(404).json({ error: 'Roll not found' });
    }

    // Fetch photos with all path variants
    const photos = await allAsync(
      `SELECT id, frame_number, thumb_rel_path, full_rel_path, 
              positive_rel_path, negative_rel_path, 
              positive_thumb_rel_path, negative_thumb_rel_path
       FROM photos
       WHERE roll_id = ?
       ORDER BY frame_number ASC, id ASC`,
      [rollId]
    );

    if (photos.length === 0) {
      return res.status(400).json({ error: 'No photos found in this roll' });
    }

    // Apply imageSource preference to determine which path to use
    const getPhotoPath = (p) => {
      switch (imageSource) {
        case 'positive':
          return p.positive_thumb_rel_path || p.thumb_rel_path || p.positive_rel_path || p.full_rel_path;
        case 'negative':
          return p.negative_thumb_rel_path || p.negative_rel_path || p.thumb_rel_path;
        case 'auto':
        default:
          return p.positive_thumb_rel_path || p.thumb_rel_path || p.negative_thumb_rel_path || p.positive_rel_path || p.full_rel_path || p.negative_rel_path;
      }
    };

    // Add resolved path and filter out photos without paths
    const validPhotos = photos.map(p => ({
      ...p,
      resolved_path: getPhotoPath(p)
    })).filter(p => p.resolved_path);

    if (validPhotos.length === 0) {
      return res.status(400).json({ error: 'No valid photos with paths found' });
    }

    // Set response headers for streaming
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Transfer-Encoding', 'chunked');

    let progressSent = false;

    // Progress callback
    const onProgress = (current, total, message) => {
      const progressData = {
        type: 'progress',
        current,
        total,
        percentage: Math.round((current / total) * 100),
        message
      };
      
      // Send progress as newline-delimited JSON
      res.write(JSON.stringify(progressData) + '\n');
      progressSent = true;
    };

    // Generate contact sheet
    const imageBuffer = await generateContactSheet({
      photos: validPhotos,
      rollMetadata: roll,
      uploadsDir,
      columns: Number(columns),
      maxTotalWidth: Number(maxTotalWidth),
      maxPhotoWidth: Number(maxPhotoWidth),
      styleName: style,
      quality: Number(quality),
      onProgress
    });

    // Send final result
    const finalData = {
      type: 'complete',
      image: imageBuffer.toString('base64'),
      filename: `${roll.title || 'Roll-' + rollId}_contact-sheet_${style}.jpg`,
      size: imageBuffer.length,
      photoCount: validPhotos.length
    };

    res.write(JSON.stringify(finalData) + '\n');
    res.end();

  } catch (error) {
    console.error('[Contact Sheet] Error:', error);
    
    // Send error as JSON if possible
    if (!res.headersSent) {
      res.status(500).json({ error: error.message });
    } else {
      res.write(JSON.stringify({ type: 'error', message: error.message }) + '\n');
      res.end();
    }
  }
});

module.exports = router;
