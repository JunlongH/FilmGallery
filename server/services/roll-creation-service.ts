/**
 * Roll Creation Service
 * 
 * Encapsulates the atomic roll creation workflow:
 * 1. Parse and validate inputs
 * 2. Group files (main + thumb pairs)
 * 3. Process images in local temp directory
 * 4. Publish files to final destination (OneDrive)
 * 5. Insert database records atomically
 * 
 * Extracted from routes/rolls.js for maintainability and testability.
 */

import fs from 'fs';
import path from 'path';
import sharp from 'sharp';
import { runAsync, getAsync } from '../utils/db-helpers';
import { moveFileAsync, copyFileAsyncWithRetry } from '../utils/file-helpers';
import { localTmpDir, rollsDir } from '../config/paths';
import { addOrUpdateGear } from './gear-service';
import { recomputeRollSequence } from './roll-service';
import { linkFilmItemToRoll } from './film/film-item-service';
import { sharpWithTimeout, THUMB_TIMEOUT, DEFAULT_TIMEOUT } from './thumbnail-service';

// Disable sharp cache to prevent file locking on Windows
sharp.cache(false);
sharp.concurrency(1);

// Types and Interfaces
export interface RollInputs {
  title: string | null;
  start_date: string | null;
  end_date: string | null;
  camera: string | null;
  lens: string | null;
  photographer: string | null;
  film_type: string | null;
  filmId: number | null;
  film_item_id: number | null;
  camera_equip_id: number | null;
  lens_equip_id: number | null;
  flash_equip_id: number | null;
  notes: string | null;
  coverIndex: number | null;
  isNegativeGlobal: boolean;
  tmpFiles: TmpFile[] | null;
  fileMetadata: Record<string, PhotoMetadataInput>;
}

export interface TmpFile {
  tmpName?: string;
  filename?: string;
  isNegative?: boolean;
}

export interface PhotoMetadataInput {
  date?: string;
  lens?: string;
  country?: string;
  city?: string;
  detail_location?: string;
  aperture?: number | null;
  shutter_speed?: string;
}

export interface IncomingFile {
  tmpPath: string;
  originalName: string;
  tmpName: string;
  isNegative: boolean;
}

export interface FileGroup {
  main: IncomingFile | null;
  thumb: IncomingFile | null;
}

export interface ResolvedMetadata {
  date: string | null;
  lens: string | null;
  country: string | null;
  city: string | null;
  detail_location: string | null;
  aperture: number | null;
  shutter_speed: string | null;
}

export interface StagedOperation {
  type: 'move' | 'copy';
  src: string;
  dest: string;
}

export interface ProcessImageResult {
  finalName: string;
  negativeRelPath: string | null;
  fullRelPath: string | null;
  thumbRelPath: string | null;
  originalRelPath: string | null;
  positiveRelPath: string | null;
  positiveThumbRelPath: string | null;
  negativeThumbRelPath: string | null;
  isNegativeSource: 0 | 1;
}

export interface ProcessImageOutput {
  result: ProcessImageResult;
  stagedOps: StagedOperation[];
  stagedTempArtifacts: string[];
}

interface FilmItemRow {
  film_id: number;
}

interface FilmRow {
  iso: number;
}

interface CameraRow {
  has_fixed_lens: number;
  fixed_lens_focal_length: number;
  fixed_lens_max_aperture: number;
}

interface LocationRow {
  id: number;
}

interface RequestBody {
  title?: string;
  start_date?: string;
  end_date?: string;
  camera?: string;
  lens?: string;
  photographer?: string;
  film_type?: string;
  filmId?: string | number;
  film_item_id?: string | number;
  camera_equip_id?: string | number;
  lens_equip_id?: string | number;
  flash_equip_id?: string | number;
  notes?: string;
  coverIndex?: string | number;
  isNegative?: string | boolean;
  tmpFiles?: string | TmpFile[];
  fileMetadata?: string | Record<string, PhotoMetadataInput>;
}

interface MulterFile {
  path: string;
  originalname: string;
  filename: string;
}

/**
 * Parse and normalize roll creation inputs
 */
export function parseRollInputs(body: RequestBody): RollInputs {
  const parsed: RollInputs = {
    title: body.title || null,
    start_date: body.start_date || null,
    end_date: body.end_date || null,
    camera: body.camera || null,
    lens: body.lens || null,
    photographer: body.photographer || null,
    film_type: body.film_type || null,
    filmId: body.filmId ? Number(body.filmId) : null,
    film_item_id: body.film_item_id ? Number(body.film_item_id) : null,
    camera_equip_id: body.camera_equip_id ? Number(body.camera_equip_id) : null,
    lens_equip_id: body.lens_equip_id ? Number(body.lens_equip_id) : null,
    flash_equip_id: body.flash_equip_id ? Number(body.flash_equip_id) : null,
    notes: body.notes || null,
    coverIndex: body.coverIndex ? Number(body.coverIndex) : null,
    isNegativeGlobal: body.isNegative === 'true' || body.isNegative === true,
    tmpFiles: null,
    fileMetadata: {}
  };

  // Parse JSON fields
  if (body.tmpFiles) {
    parsed.tmpFiles = typeof body.tmpFiles === 'string' 
      ? JSON.parse(body.tmpFiles) 
      : body.tmpFiles;
  }

  if (body.fileMetadata) {
    parsed.fileMetadata = typeof body.fileMetadata === 'string' 
      ? JSON.parse(body.fileMetadata) 
      : body.fileMetadata;
  }

  return parsed;
}

/**
 * Validate date range for roll
 */
export function validateDateRange(start_date: string | null, end_date: string | null): void {
  if (start_date && end_date) {
    const sd = new Date(start_date);
    const ed = new Date(end_date);
    if (isNaN(sd.getTime()) || isNaN(ed.getTime())) {
      throw new Error('Invalid start_date or end_date');
    }
    if (sd > ed) {
      throw new Error('start_date cannot be later than end_date');
    }
  }
}

/**
 * Load film_id from film_item if provided
 */
export async function resolveFilmId(
  film_item_id: number | null,
  defaultFilmId: number | null
): Promise<number | null> {
  if (!film_item_id) return defaultFilmId;

  try {
    const row = await getAsync<FilmItemRow>(
      'SELECT film_id FROM film_items WHERE id = ? AND deleted_at IS NULL',
      [film_item_id]
    );
    return row?.film_id || defaultFilmId;
  } catch (e) {
    console.error('[RollCreation] Failed to load film_item for filmId override', (e as Error).message);
    return defaultFilmId;
  }
}

/**
 * Load film ISO for default photo ISO
 */
export async function getFilmIso(filmId: number | null): Promise<number | null> {
  if (!filmId) return null;

  try {
    const row = await getAsync<FilmRow>('SELECT iso FROM films WHERE id = ?', [filmId]);
    return row?.iso || null;
  } catch (e) {
    console.warn('[RollCreation] Failed to load film iso', (e as Error).message);
    return null;
  }
}

/**
 * Handle fixed lens camera - derive lens from camera if needed
 */
export async function resolveFixedLens(
  camera_equip_id: number | null,
  lens_equip_id: number | null,
  lensText: string | null
): Promise<{ lensEquipId: number | null; lensText: string | null }> {
  if (!camera_equip_id) {
    return { lensEquipId: lens_equip_id, lensText };
  }

  try {
    const camRow = await getAsync<CameraRow>(
      'SELECT has_fixed_lens, fixed_lens_focal_length, fixed_lens_max_aperture FROM equip_cameras WHERE id = ?',
      [camera_equip_id]
    );

    if (camRow?.has_fixed_lens === 1) {
      // Fixed lens camera: nullify explicit lens, set text for backward compat
      const derivedLens = `${camRow.fixed_lens_focal_length}mm f/${camRow.fixed_lens_max_aperture}`;
      console.log(`[RollCreation] Fixed lens camera detected. Setting implicit lens: ${derivedLens}`);
      return { lensEquipId: null, lensText: derivedLens };
    }
  } catch (e) {
    console.warn('[RollCreation] Failed to check camera fixed lens status', (e as Error).message);
  }

  return { lensEquipId: lens_equip_id, lensText };
}

/**
 * Collect incoming files from multer upload and tmpFiles array
 */
export function collectIncomingFiles(
  reqFiles: MulterFile[] | undefined,
  tmpFiles: TmpFile[] | null,
  isNegativeGlobal: boolean
): IncomingFile[] {
  const incoming: IncomingFile[] = [];

  if (reqFiles?.length) {
    incoming.push(...reqFiles.map(f => ({
      tmpPath: f.path,
      originalName: f.originalname,
      tmpName: f.filename,
      isNegative: isNegativeGlobal
    })));
  }

  if (tmpFiles && Array.isArray(tmpFiles)) {
    for (const t of tmpFiles) {
      const tmpName = t.tmpName || t.filename;
      if (!tmpName) continue;
      const tmpPath = path.join(localTmpDir, tmpName);
      if (!fs.existsSync(tmpPath)) continue;
      incoming.push({
        tmpPath,
        originalName: tmpName,
        tmpName,
        isNegative: t.isNegative !== undefined ? t.isNegative : isNegativeGlobal
      });
    }
  }

  return incoming;
}

/**
 * Group files by base name to handle main + thumb pairs
 */
export function groupFilesByBaseName(incoming: IncomingFile[]): FileGroup[] {
  const groups = new Map<string, FileGroup>();

  for (const f of incoming) {
    const originalName = f.originalName || f.tmpName;
    const parsed = path.parse(originalName);
    let base = parsed.name;
    let type: 'main' | 'thumb' = 'main';

    if (base.toLowerCase().endsWith('_thumb') || base.toLowerCase().endsWith('-thumb')) {
      base = base.replace(/[-_]thumb$/i, '');
      type = 'thumb';
    }

    if (!groups.has(base)) groups.set(base, { main: null, thumb: null });
    groups.get(base)![type] = f;
  }

  // Sort by original filename
  return Array.from(groups.values()).sort((a, b) => {
    const nameA = (a.main || a.thumb)!.originalName;
    const nameB = (b.main || b.thumb)!.originalName;
    return nameA.localeCompare(nameB);
  });
}

/**
 * Resolve metadata for a photo from fileMetadata map
 */
export function resolvePhotoMetadata(
  metaMap: Record<string, PhotoMetadataInput | string>,
  keys: (string | null | undefined)[] = []
): ResolvedMetadata {
  for (const k of keys) {
    if (!k) continue;
    const m = metaMap[k];
    if (!m) continue;
    if (typeof m === 'string') {
      return { 
        date: m, 
        lens: null, 
        country: null, 
        city: null, 
        detail_location: null, 
        aperture: null, 
        shutter_speed: null 
      };
    }
    if (typeof m === 'object') {
      return {
        date: m.date || null,
        lens: m.lens || null,
        country: m.country || null,
        city: m.city || null,
        detail_location: m.detail_location || null,
        aperture: m.aperture ?? null,
        shutter_speed: m.shutter_speed || null
      };
    }
  }
  return { 
    date: null, 
    lens: null, 
    country: null, 
    city: null, 
    detail_location: null, 
    aperture: null, 
    shutter_speed: null 
  };
}

/**
 * Ensure a location exists and return its ID
 */
export async function ensureLocationId(
  country: string | null | undefined,
  city: string | null | undefined,
  cache: Map<string, number>
): Promise<number | null> {
  const normCity = (city || '').trim();
  const normCountry = (country || '').trim();
  if (!normCity) return null;

  const key = `${normCountry.toLowerCase()}||${normCity.toLowerCase()}`;
  if (cache.has(key)) return cache.get(key)!;

  // Try to match existing location
  const existing = await getAsync<LocationRow>(
    `SELECT id FROM locations
     WHERE LOWER(city_name) = LOWER(?)
       AND (
         LOWER(country_name) = LOWER(?) OR country_code = ? OR country_code IS NULL OR country_name IS NULL
       )
     LIMIT 1`,
    [normCity, normCountry, normCountry]
  );

  if (existing?.id) {
    cache.set(key, existing.id);
    return existing.id;
  }

  // Insert new location
  const insertedId = await runAsync(
    'INSERT INTO locations (country_name, city_name) VALUES (?, ?)',
    [normCountry || null, normCity]
  ).then(res => res.lastID ?? null).catch(() => null);

  if (insertedId) cache.set(key, insertedId);
  return insertedId;
}

interface ProcessImageParams {
  file: IncomingFile;
  frameNumber: number;
  rollId: number;
  folderName: string;
  thumbFile: IncomingFile | null;
  isNegative: boolean;
  localTmpDir: string;
  rollsDir: string;
}

/**
 * Process a single image (positive or negative) to JPEG
 */
export async function processImage(params: ProcessImageParams): Promise<ProcessImageOutput> {
  const { file, frameNumber, rollId, folderName, thumbFile, isNegative } = params;
  
  const rollFolderPath = path.join(rollsDir, folderName);
  const baseName = `${rollId}_${frameNumber}`;
  const originalExt = path.extname(file.originalName || file.tmpName) || '.jpg';
  const finalName = `${baseName}.jpg`;

  const stagedOps: StagedOperation[] = [];
  const stagedTempArtifacts: string[] = [];
  const result: ProcessImageResult = {
    finalName,
    negativeRelPath: null,
    fullRelPath: null,
    thumbRelPath: null,
    originalRelPath: null,
    positiveRelPath: null,
    positiveThumbRelPath: null,
    negativeThumbRelPath: null,
    isNegativeSource: 0
  };

  // Original file destination
  const originalName = `${baseName}_original${originalExt}`;
  const finalOriginalPath = path.join(rollFolderPath, 'originals', originalName);
  result.originalRelPath = path.join('rolls', folderName, 'originals', originalName).replace(/\\/g, '/');

  if (isNegative) {
    // Process negative image
    const negName = `${baseName}_neg.jpg`;
    const negThumbName = `${baseName}-thumb.jpg`;
    const finalNegPath = path.join(rollFolderPath, 'negative', negName);
    const finalNegThumbPath = path.join(rollFolderPath, 'negative', 'thumb', negThumbName);
    const finalMainThumbPath = path.join(rollFolderPath, 'thumb', negThumbName);
    const tempNegPath = path.join(localTmpDir, `proc_${baseName}_neg.jpg`);
    stagedTempArtifacts.push(tempNegPath);

    console.log(`[RollCreation] Processing negative ${frameNumber}: ${path.basename(file.tmpPath)} (${(fs.statSync(file.tmpPath).size / 1024 / 1024).toFixed(2)} MB)`);
    const startTime = Date.now();

    try {
      await sharpWithTimeout(
        sharp(file.tmpPath).jpeg({ quality: 95 }).toFile(tempNegPath)
      );
      console.log(`[RollCreation] Negative ${frameNumber} processed in ${Date.now() - startTime}ms`);
    } catch (err) {
      const error = new Error(`Failed to process negative image ${path.basename(file.tmpPath)}: ${(err as Error).message}`) as Error & {
        originalError?: unknown;
        fileInfo?: { name: string; size: number };
      };
      error.originalError = err;
      error.fileInfo = { name: path.basename(file.tmpPath), size: fs.statSync(file.tmpPath).size };
      throw error;
    }

    // Generate thumbnail if no separate thumb file
    let tempNegThumbPath: string | null = null;
    if (!thumbFile) {
      tempNegThumbPath = path.join(localTmpDir, `proc_${baseName}_neg_thumb.jpg`);
      stagedTempArtifacts.push(tempNegThumbPath);

      try {
        await sharpWithTimeout(
          sharp(tempNegPath)
            .resize({ width: 240, height: 240, fit: 'inside' })
            .jpeg({ quality: 40 })
            .toFile(tempNegThumbPath),
          THUMB_TIMEOUT
        );
      } catch (err) {
        const error = new Error(`Failed to generate thumbnail for ${path.basename(file.tmpPath)}: ${(err as Error).message}`) as Error & {
          originalError?: unknown;
        };
        error.originalError = err;
        throw error;
      }
    }

    // Stage file operations
    stagedOps.push({ type: 'move', src: file.tmpPath, dest: finalOriginalPath });
    stagedOps.push({ type: 'move', src: tempNegPath, dest: finalNegPath });

    const thumbSrc = thumbFile ? thumbFile.tmpPath : tempNegThumbPath!;
    stagedOps.push({ type: 'copy', src: thumbSrc, dest: finalMainThumbPath });
    stagedOps.push({ type: 'move', src: thumbSrc, dest: finalNegThumbPath });

    result.negativeRelPath = path.join('rolls', folderName, 'negative', negName).replace(/\\/g, '/');
    result.thumbRelPath = path.join('rolls', folderName, 'thumb', negThumbName).replace(/\\/g, '/');
    result.negativeThumbRelPath = path.join('rolls', folderName, 'negative', 'thumb', negThumbName).replace(/\\/g, '/');
    result.isNegativeSource = 1;

  } else {
    // Process positive image
    const thumbName = `${baseName}-thumb.jpg`;
    const destPath = path.join(rollFolderPath, 'full', finalName);
    const thumbPath = path.join(rollFolderPath, 'thumb', thumbName);
    const tempFullPath = path.join(localTmpDir, `proc_${baseName}_full.jpg`);
    stagedTempArtifacts.push(tempFullPath);

    console.log(`[RollCreation] Processing positive ${frameNumber}: ${path.basename(file.tmpPath)} (${(fs.statSync(file.tmpPath).size / 1024 / 1024).toFixed(2)} MB)`);
    const startTime = Date.now();

    try {
      await sharpWithTimeout(
        sharp(file.tmpPath).jpeg({ quality: 95 }).toFile(tempFullPath)
      );
      console.log(`[RollCreation] Positive ${frameNumber} processed in ${Date.now() - startTime}ms`);
    } catch (err) {
      const error = new Error(`Failed to process image ${path.basename(file.tmpPath)}: ${(err as Error).message}`) as Error & {
        originalError?: unknown;
        fileInfo?: { name: string; size: number };
      };
      error.originalError = err;
      error.fileInfo = { name: path.basename(file.tmpPath), size: fs.statSync(file.tmpPath).size };
      throw error;
    }

    // Generate thumbnail if no separate thumb file
    let tempThumbPath: string | null = null;
    if (!thumbFile) {
      tempThumbPath = path.join(localTmpDir, `proc_${baseName}_thumb.jpg`);
      stagedTempArtifacts.push(tempThumbPath);

      try {
        await sharpWithTimeout(
          sharp(tempFullPath)
            .resize({ width: 240, height: 240, fit: 'inside' })
            .jpeg({ quality: 40 })
            .toFile(tempThumbPath),
          THUMB_TIMEOUT
        );
      } catch (err) {
        const error = new Error(`Failed to generate thumbnail for ${path.basename(file.tmpPath)}: ${(err as Error).message}`) as Error & {
          originalError?: unknown;
        };
        error.originalError = err;
        throw error;
      }
    }

    // Stage file operations
    stagedOps.push({ type: 'move', src: file.tmpPath, dest: finalOriginalPath });
    stagedOps.push({ type: 'move', src: tempFullPath, dest: destPath });
    stagedOps.push({ type: 'move', src: thumbFile ? thumbFile.tmpPath : tempThumbPath!, dest: thumbPath });

    result.fullRelPath = path.join('rolls', folderName, 'full', finalName).replace(/\\/g, '/');
    result.positiveRelPath = result.fullRelPath;
    result.thumbRelPath = path.join('rolls', folderName, 'thumb', thumbName).replace(/\\/g, '/');
    result.positiveThumbRelPath = result.thumbRelPath;
  }

  return { result, stagedOps, stagedTempArtifacts };
}

/**
 * Execute staged file operations (moves/copies)
 */
export async function publishFileOperations(
  stagedOps: StagedOperation[],
  createdPaths: string[]
): Promise<void> {
  console.log(`[RollCreation] Publishing ${stagedOps.length} file operations...`);

  for (let i = 0; i < stagedOps.length; i++) {
    const op = stagedOps[i];
    try {
      const srcSize = fs.existsSync(op.src) ? (fs.statSync(op.src).size / 1024 / 1024).toFixed(2) : 'N/A';
      console.log(`[RollCreation] [${i + 1}/${stagedOps.length}] ${op.type} ${path.basename(op.src)} (${srcSize} MB) -> ${path.basename(op.dest)}`);

      if (op.type === 'copy') {
        await copyFileAsyncWithRetry(op.src, op.dest);
      } else {
        await moveFileAsync(op.src, op.dest);
      }
      createdPaths.push(op.dest);
    } catch (err) {
      const error = new Error(`Failed to ${op.type} file ${path.basename(op.src)}: ${(err as Error).message}`) as Error & {
        originalError?: unknown;
        operation?: { type: string; src: string; dest: string };
      };
      error.originalError = err;
      error.operation = { type: op.type, src: op.src, dest: op.dest };
      throw error;
    }
  }

  console.log(`[RollCreation] All files published successfully.`);
}

/**
 * Cleanup temporary artifacts
 */
export async function cleanupTempArtifacts(artifacts: string[]): Promise<void> {
  for (const t of artifacts) {
    try {
      if (fs.existsSync(t)) await fs.promises.unlink(t);
    } catch {
      /* ignore cleanup error */
    }
  }
}

/**
 * Remove directory with retry logic
 */
export async function rmWithRetry(absPath: string, retries: number = 3): Promise<void> {
  for (let i = 0; i < retries; i++) {
    try {
      await fs.promises.rm(absPath, { recursive: true, force: true });
      return;
    } catch {
      if (i === retries - 1) return;
      await new Promise(r => setTimeout(r, 300 * (i + 1)));
    }
  }
}

/**
 * Create roll directories
 */
export async function createRollDirectories(rollFolderPath: string): Promise<void> {
  const dirs = [
    rollFolderPath,
    path.join(rollFolderPath, 'full'),
    path.join(rollFolderPath, 'thumb'),
    path.join(rollFolderPath, 'originals'),
    path.join(rollFolderPath, 'negative'),
    path.join(rollFolderPath, 'negative', 'thumb')
  ];

  for (const dir of dirs) {
    await fs.promises.mkdir(dir, { recursive: true });
  }
}

// CommonJS compatibility
module.exports = {
  parseRollInputs,
  validateDateRange,
  resolveFilmId,
  getFilmIso,
  resolveFixedLens,
  collectIncomingFiles,
  groupFilesByBaseName,
  resolvePhotoMetadata,
  ensureLocationId,
  processImage,
  publishFileOperations,
  cleanupTempArtifacts,
  rmWithRetry,
  createRollDirectories
};
