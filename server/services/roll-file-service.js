/**
 * Roll File Service
 * 
 * Handles file staging, publishing, and cleanup operations for roll creation.
 * Implements atomic workflow: all files are processed in temp before moving to final location.
 * 
 * This service is designed for OneDrive-safe operations:
 *   - Stage all file operations first (in local temp)
 *   - Publish to final location only after all processing succeeds
 *   - Cleanup on failure with retry logic
 * 
 * @module server/services/roll-file-service
 */

const fs = require('fs');
const path = require('path');
const { rollsDir } = require('../config/paths');
const { moveFileAsync, copyFileAsyncWithRetry } = require('../utils/file-helpers');

/**
 * Maximum retries for file operations (OneDrive can be slow/flaky)
 */
const MAX_RETRIES = 3;

/**
 * Delay between retries in milliseconds
 */
const RETRY_DELAY_BASE = 300;

/**
 * Remove a file or directory with retry logic.
 * Useful for OneDrive where operations may temporarily fail.
 * 
 * @param {string} absPath - Absolute path to remove
 * @param {number} [retries=MAX_RETRIES] - Number of retry attempts
 * @returns {Promise<void>}
 */
async function rmWithRetry(absPath, retries = MAX_RETRIES) {
  for (let i = 0; i < retries; i++) {
    try {
      await fs.promises.rm(absPath, { recursive: true, force: true });
      return;
    } catch (e) {
      if (i === retries - 1) {
        console.warn(`[RollFileService] Failed to remove ${absPath} after ${retries} attempts:`, e.message);
        return; // Don't throw, cleanup is best-effort
      }
      await new Promise(r => setTimeout(r, RETRY_DELAY_BASE * (i + 1)));
    }
  }
}

/**
 * Ensure all standard directories for a roll exist.
 * Creates: full, thumb, originals, negative, negative/thumb
 * 
 * @param {string} rollFolderPath - Absolute path to roll folder
 * @returns {Promise<void>}
 */
async function ensureRollDirectories(rollFolderPath) {
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

/**
 * Staged file operation descriptor
 * @typedef {Object} StagedOperation
 * @property {'move'|'copy'} type - Operation type
 * @property {string} src - Source path
 * @property {string} dest - Destination path
 */

/**
 * Publish all staged file operations to final location.
 * This is the commit phase of the atomic workflow.
 * 
 * @param {StagedOperation[]} stagedOps - Array of staged operations
 * @param {Object} [options={}] - Options
 * @param {boolean} [options.verbose=true] - Log progress
 * @returns {Promise<string[]>} - Array of created paths (for rollback tracking)
 * @throws {Error} - If any operation fails (triggers rollback)
 */
async function publishStagedOperations(stagedOps, options = {}) {
  const { verbose = true } = options;
  const createdPaths = [];

  for (let i = 0; i < stagedOps.length; i++) {
    const op = stagedOps[i];
    try {
      if (verbose) {
        const srcSize = fs.existsSync(op.src) 
          ? (fs.statSync(op.src).size / 1024 / 1024).toFixed(2) 
          : 'N/A';
        console.log(`[RollFileService] [${i + 1}/${stagedOps.length}] ${op.type} ${path.basename(op.src)} (${srcSize} MB) -> ${path.basename(op.dest)}`);
      }

      if (op.type === 'copy') {
        await copyFileAsyncWithRetry(op.src, op.dest);
      } else {
        await moveFileAsync(op.src, op.dest);
      }
      createdPaths.push(op.dest);
    } catch (fileOpErr) {
      console.error(`[RollFileService] File operation failed [${op.type}] ${path.basename(op.src)} -> ${path.basename(op.dest)}:`, fileOpErr);
      
      const err = new Error(`Failed to ${op.type} file ${path.basename(op.src)} to destination: ${fileOpErr.message}`);
      err.originalError = fileOpErr;
      err.operation = { type: op.type, src: op.src, dest: op.dest };
      err.createdPaths = createdPaths; // For partial rollback
      throw err;
    }
  }

  if (verbose) {
    console.log(`[RollFileService] All ${stagedOps.length} files published successfully.`);
  }

  return createdPaths;
}

/**
 * Cleanup temporary artifacts after successful publish.
 * 
 * @param {string[]} tempPaths - Array of temp file paths to delete
 * @returns {Promise<void>}
 */
async function cleanupTempArtifacts(tempPaths) {
  for (const t of tempPaths) {
    try {
      if (fs.existsSync(t)) {
        await fs.promises.unlink(t);
      }
    } catch (_) {
      // Best-effort cleanup, ignore errors
    }
  }
}

/**
 * Rollback created files on failure.
 * Cleans up the entire roll folder if provided, or individual files.
 * 
 * @param {Object} params - Rollback parameters
 * @param {string|null} params.rollFolderPath - Roll folder to remove (if exists)
 * @param {string[]} params.createdPaths - Individual paths to remove
 * @returns {Promise<void>}
 */
async function rollbackCreatedFiles({ rollFolderPath, createdPaths }) {
  if (rollFolderPath && fs.existsSync(rollFolderPath)) {
    await rmWithRetry(rollFolderPath);
    return;
  }

  // Fallback: delete individual paths
  for (const p of createdPaths) {
    try {
      await rmWithRetry(p);
    } catch (_) {
      // Best-effort cleanup
    }
  }
}

/**
 * Create a staged operation object.
 * Helper for building the staged operations array.
 * 
 * @param {'move'|'copy'} type - Operation type
 * @param {string} src - Source path
 * @param {string} dest - Destination path
 * @returns {StagedOperation}
 */
function createStagedOp(type, src, dest) {
  return { type, src, dest };
}

/**
 * Build staged operations for a positive image.
 * 
 * @param {Object} params - Parameters
 * @param {string} params.originalPath - Path to original file
 * @param {string} params.tempFullPath - Path to processed full image in temp
 * @param {string} params.tempThumbPath - Path to thumbnail in temp (or null if using separate thumb file)
 * @param {string} params.thumbFilePath - Path to separate thumb file (if provided)
 * @param {string} params.rollFolderPath - Destination roll folder
 * @param {string} params.baseName - Base filename
 * @param {string} params.originalExt - Original file extension
 * @returns {StagedOperation[]}
 */
function buildPositiveStageOps({ originalPath, tempFullPath, tempThumbPath, thumbFilePath, rollFolderPath, baseName, originalExt }) {
  const ops = [];
  
  // Original file
  const originalsDir = path.join(rollFolderPath, 'originals');
  const originalName = `${baseName}_original${originalExt}`;
  ops.push(createStagedOp('move', originalPath, path.join(originalsDir, originalName)));
  
  // Full size
  const fullDir = path.join(rollFolderPath, 'full');
  ops.push(createStagedOp('move', tempFullPath, path.join(fullDir, `${baseName}.jpg`)));
  
  // Thumbnail
  const thumbDir = path.join(rollFolderPath, 'thumb');
  const thumbSrc = thumbFilePath || tempThumbPath;
  ops.push(createStagedOp('move', thumbSrc, path.join(thumbDir, `${baseName}-thumb.jpg`)));
  
  return ops;
}

/**
 * Build staged operations for a negative image.
 * 
 * @param {Object} params - Parameters
 * @param {string} params.originalPath - Path to original file
 * @param {string} params.tempNegPath - Path to processed negative image in temp
 * @param {string} params.tempNegThumbPath - Path to negative thumbnail in temp (or null)
 * @param {string} params.thumbFilePath - Path to separate thumb file (if provided)
 * @param {string} params.rollFolderPath - Destination roll folder
 * @param {string} params.baseName - Base filename
 * @param {string} params.originalExt - Original file extension
 * @returns {StagedOperation[]}
 */
function buildNegativeStageOps({ originalPath, tempNegPath, tempNegThumbPath, thumbFilePath, rollFolderPath, baseName, originalExt }) {
  const ops = [];
  
  // Original file
  const originalsDir = path.join(rollFolderPath, 'originals');
  const originalName = `${baseName}_original${originalExt}`;
  ops.push(createStagedOp('move', originalPath, path.join(originalsDir, originalName)));
  
  // Negative image
  const negDir = path.join(rollFolderPath, 'negative');
  ops.push(createStagedOp('move', tempNegPath, path.join(negDir, `${baseName}_neg.jpg`)));
  
  // Thumbnails
  const thumbDir = path.join(rollFolderPath, 'thumb');
  const negThumbDir = path.join(rollFolderPath, 'negative', 'thumb');
  const thumbName = `${baseName}-thumb.jpg`;
  
  const thumbSrc = thumbFilePath || tempNegThumbPath;
  
  // Copy to main thumb dir (for gallery view)
  ops.push(createStagedOp('copy', thumbSrc, path.join(thumbDir, thumbName)));
  // Move to negative thumb dir
  ops.push(createStagedOp('move', thumbSrc, path.join(negThumbDir, thumbName)));
  
  return ops;
}

/**
 * Compute relative paths for a positive image.
 * 
 * @param {string} folderName - Roll folder name
 * @param {string} baseName - Base filename
 * @returns {Object} - Object with fullRelPath, thumbRelPath, originalRelPath, etc.
 */
function computePositiveRelPaths(folderName, baseName, originalExt) {
  return {
    fullRelPath: `rolls/${folderName}/full/${baseName}.jpg`,
    thumbRelPath: `rolls/${folderName}/thumb/${baseName}-thumb.jpg`,
    originalRelPath: `rolls/${folderName}/originals/${baseName}_original${originalExt}`,
    positiveRelPath: `rolls/${folderName}/full/${baseName}.jpg`,
    positiveThumbRelPath: `rolls/${folderName}/thumb/${baseName}-thumb.jpg`,
    negativeRelPath: null,
    negativeThumbRelPath: null,
    isNegativeSource: 0
  };
}

/**
 * Compute relative paths for a negative image.
 * 
 * @param {string} folderName - Roll folder name
 * @param {string} baseName - Base filename
 * @param {string} originalExt - Original file extension
 * @returns {Object} - Object with negativeRelPath, thumbRelPath, originalRelPath, etc.
 */
function computeNegativeRelPaths(folderName, baseName, originalExt) {
  return {
    fullRelPath: null,
    thumbRelPath: `rolls/${folderName}/thumb/${baseName}-thumb.jpg`,
    originalRelPath: `rolls/${folderName}/originals/${baseName}_original${originalExt}`,
    positiveRelPath: null,
    positiveThumbRelPath: null,
    negativeRelPath: `rolls/${folderName}/negative/${baseName}_neg.jpg`,
    negativeThumbRelPath: `rolls/${folderName}/negative/thumb/${baseName}-thumb.jpg`,
    isNegativeSource: 1
  };
}

// ============================================================================
// DELETE ROLL HELPERS
// ============================================================================

const { uploadsDir } = require('../config/paths');

/**
 * Convert a relative path to absolute uploads path.
 * 
 * @param {string|null} relPath - Relative path (e.g., "rolls/1/full/photo.jpg")
 * @returns {string|null} - Absolute path or null
 */
function toUploadAbsPath(relPath) {
  if (!relPath) return null;
  const trimmed = relPath.replace(/^\/+/, '').replace(/^uploads\//, '');
  return path.join(uploadsDir, trimmed);
}

/**
 * Safely delete files/folders with guard against deleting outside uploads.
 * 
 * @param {string[]} paths - Array of absolute paths to delete
 */
function deleteFilesSafe(paths = []) {
  const unique = Array.from(new Set(paths.filter(Boolean)));
  for (const p of unique) {
    try {
      const abs = path.resolve(p);
      if (!abs.startsWith(path.resolve(uploadsDir))) continue; // safety guard
      if (fs.existsSync(abs)) fs.rmSync(abs, { recursive: true, force: true });
    } catch (err) {
      console.warn('[RollFileService] Failed to remove path', p, err.message);
    }
  }
}

/**
 * Deduce folder name from roll or photo paths.
 * 
 * @param {Object|null} roll - Roll record
 * @param {Object[]} photos - Array of photo records
 * @param {number} rollId - Roll ID as fallback
 * @returns {string} - Folder name
 */
function deduceFolderName(roll, photos, rollId) {
  if (roll?.folderName) return roll.folderName;
  for (const p of photos || []) {
    const rel = p.full_rel_path || p.positive_rel_path || p.negative_rel_path || p.thumb_rel_path;
    if (!rel) continue;
    const parts = rel.replace(/^\/+/, '').split('/');
    const idx = parts.indexOf('rolls');
    if (idx >= 0 && parts[idx + 1]) return parts[idx + 1];
    if (parts[0]) return parts[0];
  }
  return String(rollId);
}

/**
 * Collect all file paths for a roll's photos.
 * 
 * @param {Object[]} photos - Array of photo records
 * @returns {string[]} - Array of absolute paths
 */
function collectPhotoFilePaths(photos) {
  const paths = [];
  for (const p of photos || []) {
    paths.push(toUploadAbsPath(p.full_rel_path));
    paths.push(toUploadAbsPath(p.positive_rel_path));
    paths.push(toUploadAbsPath(p.negative_rel_path));
    paths.push(toUploadAbsPath(p.thumb_rel_path));
    paths.push(toUploadAbsPath(p.positive_thumb_rel_path));
    paths.push(toUploadAbsPath(p.negative_thumb_rel_path));
    paths.push(toUploadAbsPath(p.original_rel_path));
  }
  return paths.filter(Boolean);
}

/**
 * Delete all files associated with a roll.
 * 
 * @param {Object} params - Delete parameters
 * @param {Object|null} params.roll - Roll record
 * @param {Object[]} params.photos - Array of photo records
 * @param {number} params.rollId - Roll ID
 */
function deleteRollFiles({ roll, photos, rollId }) {
  const folderName = deduceFolderName(roll, photos, rollId);
  const folderPath = path.join(rollsDir, folderName);
  const photoPaths = collectPhotoFilePaths(photos);

  // Handle cover image if outside roll folder
  const cover = roll && (roll.cover_photo || roll.coverPath);
  if (cover) {
    const coverAbs = toUploadAbsPath(cover);
    if (coverAbs && (!folderPath || !path.resolve(coverAbs).startsWith(path.resolve(folderPath)))) {
      photoPaths.push(coverAbs);
    }
  }

  // Remove roll folder and files (best-effort)
  deleteFilesSafe([folderPath, ...photoPaths]);
}

module.exports = {
  // Core operations
  rmWithRetry,
  ensureRollDirectories,
  publishStagedOperations,
  cleanupTempArtifacts,
  rollbackCreatedFiles,
  
  // Staging helpers
  createStagedOp,
  buildPositiveStageOps,
  buildNegativeStageOps,
  
  // Path computation
  computePositiveRelPaths,
  computeNegativeRelPaths,
  
  // Delete helpers
  toUploadAbsPath,
  deleteFilesSafe,
  deduceFolderName,
  collectPhotoFilePaths,
  deleteRollFiles,
  
  // Constants
  MAX_RETRIES,
  RETRY_DELAY_BASE
};
