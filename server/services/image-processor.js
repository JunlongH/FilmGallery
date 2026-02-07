/**
 * Image Processor Service
 * 
 * Centralized image processing logic for Sharp operations.
 * Handles JPEG conversion, thumbnail generation, RAW decoding, and negative processing.
 * 
 * This service is designed to be shared between:
 *   - POST /api/rolls (batch photo upload)
 *   - POST /api/rolls/:rollId/photos (single photo upload)
 * 
 * Key features:
 *   - Timeout protection for large files (especially OneDrive TIFFs)
 *   - Sharp cache disabled to prevent Windows file locking
 *   - Concurrency limited to prevent memory spikes with large TIFFs
 *   - RAW file decoding via raw-decoder service
 * 
 * @module server/services/image-processor
 */

const sharp = require('sharp');
const path = require('path');
const fs = require('fs');

// Configure Sharp for stability (especially important for large TIFFs)
sharp.cache(false);
sharp.concurrency(1);

// Default timeout for Sharp operations (120 seconds — raised for pixel-shift RAW ~170MP)
const SHARP_TIMEOUT = 120000;
// Timeout for thumbnails (30 seconds — raised for pixel-shift RAW ~170MP)
const THUMB_TIMEOUT = 30000;

/**
 * Execute a Sharp operation with timeout protection.
 * Prevents hanging on large/slow files (e.g., OneDrive TIFFs).
 * 
 * @param {Promise} sharpOp - The Sharp operation promise
 * @param {number} [timeoutMs=SHARP_TIMEOUT] - Timeout in milliseconds
 * @returns {Promise} - Resolves with Sharp result or rejects on timeout
 */
function sharpWithTimeout(sharpOp, timeoutMs = SHARP_TIMEOUT) {
  return Promise.race([
    sharpOp,
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error('Sharp operation timed out')), timeoutMs)
    )
  ]);
}

/**
 * Process an image to high-quality JPEG.
 * Used for both positive and negative workflows.
 * 
 * @param {Buffer|string} input - Image buffer or file path
 * @param {string} outputPath - Destination path for JPEG
 * @param {Object} [options={}] - Processing options
 * @param {number} [options.quality=95] - JPEG quality (1-100)
 * @param {boolean} [options.autoRotate=true] - Auto-rotate based on EXIF
 * @param {number} [options.timeout=SHARP_TIMEOUT] - Timeout in ms
 * @returns {Promise<void>}
 */
async function processToJpeg(input, outputPath, options = {}) {
  const { quality = 95, autoRotate = true, timeout = SHARP_TIMEOUT } = options;

  let pipeline = sharp(input, { failOn: 'none', limitInputPixels: false });
  
  if (autoRotate) {
    pipeline = pipeline.rotate();
  }

  pipeline = pipeline.jpeg({ quality });

  await sharpWithTimeout(pipeline.toFile(outputPath), timeout);
}

/**
 * Generate a thumbnail from an image.
 * 
 * @param {Buffer|string} input - Image buffer or file path
 * @param {string} outputPath - Destination path for thumbnail
 * @param {Object} [options={}] - Thumbnail options
 * @param {number} [options.width=240] - Max width
 * @param {number} [options.height=240] - Max height
 * @param {string} [options.fit='inside'] - Sharp resize fit mode
 * @param {number} [options.quality=40] - JPEG quality (1-100)
 * @param {number} [options.timeout=THUMB_TIMEOUT] - Timeout in ms
 * @returns {Promise<void>}
 */
async function generateThumbnail(input, outputPath, options = {}) {
  const { 
    width = 240, 
    height = 240, 
    fit = 'inside', 
    quality = 40, 
    timeout = THUMB_TIMEOUT 
  } = options;

  const pipeline = sharp(input, { limitInputPixels: false })
    .resize({ width, height, fit })
    .jpeg({ quality });

  await sharpWithTimeout(pipeline.toFile(outputPath), timeout);
}

/**
 * Decode a RAW file to a processable format.
 * Uses the raw-decoder service which wraps libraw.
 * 
 * @param {string} filePath - Path to RAW file
 * @param {Object} [options={}] - Decoding options
 * @param {string} [options.outputFormat='tiff'] - Output format for decoded data
 * @returns {Promise<{buffer: Buffer, metadata: Object|null}>}
 */
async function decodeRawFile(filePath, options = {}) {
  const { outputFormat = 'tiff', halfSize = false } = options;

  // Lazy-load raw-decoder to avoid startup cost if not used
  const rawDecoder = require('./raw-decoder');

  try {
    const decodeOpts = { outputFormat };
    if (halfSize) {
      decodeOpts.halfSize = true;
      console.log('[ImageProcessor] Using halfSize decode for large RAW file');
    }
    const buffer = await rawDecoder.decode(filePath, decodeOpts);
    
    let metadata = null;
    try {
      metadata = await rawDecoder.extractMetadata(filePath);
    } catch (metaErr) {
      console.warn('[ImageProcessor] RAW metadata extraction failed:', metaErr.message);
    }

    return { buffer, metadata };
  } catch (err) {
    console.error('[ImageProcessor] RAW decode failed:', err.message);
    throw new Error(`Failed to decode RAW file: ${err.message}`);
  }
}

/**
 * Check if a file is a RAW format.
 * 
 * @param {string} filename - Filename or path to check
 * @returns {boolean}
 */
function isRawFile(filename) {
  const rawDecoder = require('./raw-decoder');
  return rawDecoder.isRawFile(filename);
}

/**
 * Process a positive image file.
 * Converts to JPEG and generates thumbnail.
 * 
 * @param {Object} params - Processing parameters
 * @param {Buffer|string} params.input - Source image (buffer or path)
 * @param {string} params.outputDir - Directory for full-size output
 * @param {string} params.thumbDir - Directory for thumbnail
 * @param {string} params.baseName - Base filename (without extension)
 * @param {Object} [params.options={}] - Processing options
 * @returns {Promise<{fullPath: string, thumbPath: string, fullRelPath: string, thumbRelPath: string}>}
 */
async function processPositiveImage({ input, outputDir, thumbDir, baseName, rollId, folderName, options = {} }) {
  const { quality = 95, thumbQuality = 40 } = options;

  const fullName = `${baseName}.jpg`;
  const thumbName = `${baseName}-thumb.jpg`;

  const fullPath = path.join(outputDir, fullName);
  const thumbPath = path.join(thumbDir, thumbName);

  // Generate full-size JPEG
  await processToJpeg(input, fullPath, { quality });

  // Generate thumbnail
  await generateThumbnail(fullPath, thumbPath, { quality: thumbQuality });

  // Compute relative paths
  const fullRelPath = path.join('rolls', folderName, 'full', fullName).replace(/\\/g, '/');
  const thumbRelPath = path.join('rolls', folderName, 'thumb', thumbName).replace(/\\/g, '/');

  return {
    fullPath,
    thumbPath,
    fullRelPath,
    thumbRelPath
  };
}

/**
 * Process a negative image file.
 * Stores as "negative" preview (not inverted) and generates thumbnail.
 * 
 * @param {Object} params - Processing parameters
 * @param {Buffer|string} params.input - Source image (buffer or path)
 * @param {string} params.rollFolderPath - Root folder for the roll
 * @param {string} params.thumbDir - Main thumbnail directory (for gallery view)
 * @param {string} params.baseName - Base filename (without extension)
 * @param {string} params.folderName - Roll folder name (usually roll ID)
 * @param {Object} [params.options={}] - Processing options
 * @returns {Promise<{negPath: string, thumbPath: string, negThumbPath: string, negativeRelPath: string, thumbRelPath: string, negativeThumbRelPath: string}>}
 */
async function processNegativeImage({ input, rollFolderPath, thumbDir, baseName, folderName, options = {} }) {
  const { quality = 95, thumbQuality = 40 } = options;

  const negName = `${baseName}_neg.jpg`;
  const negThumbName = `${baseName}-thumb.jpg`;

  const negDir = path.join(rollFolderPath, 'negative');
  const negThumbDir = path.join(rollFolderPath, 'negative', 'thumb');

  const negPath = path.join(negDir, negName);
  const negThumbPath = path.join(negThumbDir, negThumbName);
  const mainThumbPath = path.join(thumbDir, negThumbName);

  // Generate negative preview (high quality JPEG)
  await processToJpeg(input, negPath, { quality });

  // Generate thumbnail for negative
  await generateThumbnail(negPath, negThumbPath, { quality: thumbQuality });

  // Compute relative paths
  const negativeRelPath = path.join('rolls', folderName, 'negative', negName).replace(/\\/g, '/');
  const negativeThumbRelPath = path.join('rolls', folderName, 'negative', 'thumb', negThumbName).replace(/\\/g, '/');
  const thumbRelPath = path.join('rolls', folderName, 'thumb', negThumbName).replace(/\\/g, '/');

  return {
    negPath,
    negThumbPath,
    mainThumbPath,
    negativeRelPath,
    negativeThumbRelPath,
    thumbRelPath
  };
}

/**
 * Process an image with staging support.
 * Returns operations to be staged rather than writing directly to final location.
 * Used for atomic roll creation workflow.
 * 
 * @param {Object} params - Processing parameters
 * @param {Buffer|string} params.input - Source image (buffer or path)
 * @param {string} params.localTmpDir - Local temp directory for staging
 * @param {string} params.baseName - Base filename (without extension)
 * @param {boolean} params.isNegative - Whether to process as negative
 * @param {Object} [params.options={}] - Processing options
 * @returns {Promise<{tempPath: string, tempThumbPath: string|null}>}
 */
async function processStagedImage({ input, localTmpDir, baseName, isNegative, options = {} }) {
  const { quality = 95, thumbQuality = 40 } = options;

  if (isNegative) {
    // Process as negative
    const tempPath = path.join(localTmpDir, `proc_${baseName}_neg.jpg`);
    const tempThumbPath = path.join(localTmpDir, `proc_${baseName}_neg_thumb.jpg`);

    await processToJpeg(input, tempPath, { quality });
    await generateThumbnail(tempPath, tempThumbPath, { quality: thumbQuality });

    return { tempPath, tempThumbPath };
  } else {
    // Process as positive
    const tempPath = path.join(localTmpDir, `proc_${baseName}_full.jpg`);
    const tempThumbPath = path.join(localTmpDir, `proc_${baseName}_thumb.jpg`);

    await processToJpeg(input, tempPath, { quality });
    await generateThumbnail(tempPath, tempThumbPath, { quality: thumbQuality });

    return { tempPath, tempThumbPath };
  }
}

module.exports = {
  // Core operations
  sharpWithTimeout,
  processToJpeg,
  generateThumbnail,
  
  // RAW handling
  decodeRawFile,
  isRawFile,
  
  // High-level processing
  processPositiveImage,
  processNegativeImage,
  processStagedImage,
  
  // Constants
  SHARP_TIMEOUT,
  THUMB_TIMEOUT
};
