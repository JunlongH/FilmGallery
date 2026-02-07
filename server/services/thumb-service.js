/**
 * Thumbnail Service
 * 
 * Centralized utility for generating, naming, and resolving thumbnail paths.
 * All endpoints that create or update thumbnails should use this service
 * to ensure consistent naming, directory structure, and DB field usage.
 * 
 * Convention:
 *   - Positive thumb  → rolls/{rollId}/thumb/{rollId}_{frame}-thumb.jpg
 *   - Negative thumb  → rolls/{rollId}/negative/thumb/{base}-thumb.jpg
 *   - thumb_rel_path  → set only on initial upload; never overwritten by exports
 *   - positive_thumb_rel_path → always set when a positive image is saved/exported
 *   - negative_thumb_rel_path → always set when a negative image is saved/uploaded
 * 
 * @module services/thumb-service
 */

const path = require('path');
const fs = require('fs');
const sharp = require('sharp');
const { uploadsDir } = require('../config/paths');

// ── Defaults ────────────────────────────────────────────────────────────────

const THUMB_WIDTH = 240;
const THUMB_HEIGHT = 240;
const THUMB_FIT = 'inside';
const THUMB_QUALITY = 40;

// ── Path helpers ────────────────────────────────────────────────────────────

/**
 * Build a canonical positive thumb name for a given roll + frame.
 * Example: "42_03-thumb.jpg"
 */
function positiveThumbName(rollId, frameNumber) {
  const frame = frameNumber || '00';
  return `${rollId}_${frame}-thumb.jpg`;
}

/**
 * Return { absPath, relPath } for a positive thumbnail.
 */
function positiveThumbPaths(rollId, frameNumber) {
  const folderName = String(rollId);
  const thumbDir = path.join(uploadsDir, 'rolls', folderName, 'thumb');
  const name = positiveThumbName(rollId, frameNumber);
  return {
    dir: thumbDir,
    absPath: path.join(thumbDir, name),
    relPath: `rolls/${folderName}/thumb/${name}`,
  };
}

// ── Generation ──────────────────────────────────────────────────────────────

/**
 * Generate (or overwrite) a positive thumbnail from a source JPEG.
 * Reads the source into a Buffer first to avoid Windows file‑lock issues.
 *
 * @param {string} sourceAbsPath  – Absolute path to the full‑resolution JPEG
 * @param {number|string} rollId
 * @param {string} frameNumber     – e.g. "03"
 * @returns {Promise<{ absPath: string, relPath: string }>}  Generated thumb paths
 */
async function generatePositiveThumb(sourceAbsPath, rollId, frameNumber) {
  const { dir, absPath, relPath } = positiveThumbPaths(rollId, frameNumber);

  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  // Remove stale file to avoid Windows locking issues
  if (fs.existsSync(absPath)) {
    try { fs.unlinkSync(absPath); } catch (_) { /* ignore */ }
  }

  // Read into buffer to prevent Sharp from holding an OS file lock
  const buf = fs.readFileSync(sourceAbsPath);
  await sharp(buf)
    .resize({ width: THUMB_WIDTH, height: THUMB_HEIGHT, fit: THUMB_FIT })
    .jpeg({ quality: THUMB_QUALITY })
    .toFile(absPath);

  return { absPath, relPath };
}

/**
 * Clean up an old thumbnail file if the path is different from the current one.
 *
 * @param {string|null} oldRelPath  – Previous positive_thumb_rel_path value
 * @param {string} currentRelPath   – Newly generated relPath (skip if same)
 */
function cleanupOldThumb(oldRelPath, currentRelPath) {
  if (!oldRelPath || oldRelPath === currentRelPath) return;
  try {
    const abs = path.join(uploadsDir, oldRelPath);
    if (fs.existsSync(abs)) fs.unlinkSync(abs);
  } catch (e) {
    console.warn('[thumb-service] Could not delete old thumbnail:', e.message);
  }
}

// ── Exports ─────────────────────────────────────────────────────────────────

module.exports = {
  // Constants
  THUMB_WIDTH,
  THUMB_HEIGHT,
  THUMB_QUALITY,

  // Path helpers
  positiveThumbName,
  positiveThumbPaths,

  // Generation
  generatePositiveThumb,
  cleanupOldThumb,
};
