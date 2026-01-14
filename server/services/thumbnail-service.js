/**
 * Thumbnail Generation Service
 * 
 * Provides utilities for generating thumbnails from images.
 * Extracted from routes/rolls.js for reusability and testability.
 */

const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

// Disable sharp cache to prevent file locking on Windows
sharp.cache(false);
// Limit concurrency to 1 to prevent memory spikes with large TIFFs
sharp.concurrency(1);

// Default timeout for sharp operations (30 seconds)
const DEFAULT_TIMEOUT = 30000;
// Faster timeout for thumbnail operations (10 seconds)
const THUMB_TIMEOUT = 10000;

/**
 * Run a Sharp operation with timeout protection
 * @param {Promise} sharpOperation - Sharp operation promise
 * @param {number} timeoutMs - Timeout in milliseconds
 * @returns {Promise} Result of the sharp operation
 * @throws {Error} If operation times out or fails
 */
async function sharpWithTimeout(sharpOperation, timeoutMs = DEFAULT_TIMEOUT) {
  return Promise.race([
    sharpOperation,
    new Promise((_, reject) => 
      setTimeout(() => reject(new Error('Sharp operation timed out')), timeoutMs)
    )
  ]);
}

/**
 * Generate a JPEG thumbnail from an image
 * @param {string} inputPath - Path to source image
 * @param {string} outputPath - Path for output thumbnail
 * @param {Object} options - Thumbnail options
 * @param {number} [options.width=240] - Max width
 * @param {number} [options.height=240] - Max height
 * @param {number} [options.quality=40] - JPEG quality (1-100)
 * @param {number} [options.timeout] - Operation timeout in ms
 * @returns {Promise<{success: boolean, path: string, size: number}>}
 */
async function generateThumbnail(inputPath, outputPath, options = {}) {
  const {
    width = 240,
    height = 240,
    quality = 40,
    timeout = THUMB_TIMEOUT
  } = options;

  await sharpWithTimeout(
    sharp(inputPath)
      .resize({ width, height, fit: 'inside' })
      .jpeg({ quality })
      .toFile(outputPath),
    timeout
  );

  const stats = await fs.promises.stat(outputPath);
  return {
    success: true,
    path: outputPath,
    size: stats.size
  };
}

/**
 * Process an image to JPEG format with high quality
 * @param {string} inputPath - Path to source image
 * @param {string} outputPath - Path for output JPEG
 * @param {Object} options - Processing options
 * @param {number} [options.quality=95] - JPEG quality (1-100)
 * @param {number} [options.timeout] - Operation timeout in ms
 * @returns {Promise<{success: boolean, path: string, size: number, duration: number}>}
 */
async function processToJpeg(inputPath, outputPath, options = {}) {
  const {
    quality = 95,
    timeout = DEFAULT_TIMEOUT
  } = options;

  const startTime = Date.now();
  
  await sharpWithTimeout(
    sharp(inputPath).jpeg({ quality }).toFile(outputPath),
    timeout
  );

  const duration = Date.now() - startTime;
  const stats = await fs.promises.stat(outputPath);
  
  return {
    success: true,
    path: outputPath,
    size: stats.size,
    duration
  };
}

/**
 * Process image group (main + optional thumb)
 * Generates full-size JPEG and thumbnail from source
 * @param {Object} params - Processing parameters
 * @param {string} params.sourcePath - Path to source image
 * @param {string} params.outputDir - Output directory
 * @param {string} params.baseName - Base name for output files
 * @param {boolean} [params.isNegative=false] - Whether source is negative
 * @param {string} [params.thumbSourcePath] - Optional separate thumb source
 * @returns {Promise<Object>} Processing results with paths
 */
async function processImageGroup({
  sourcePath,
  outputDir,
  baseName,
  isNegative = false,
  thumbSourcePath = null
}) {
  const result = {
    success: false,
    fullPath: null,
    thumbPath: null,
    originalPath: null,
    isNegative,
    duration: 0
  };

  const startTime = Date.now();
  const originalExt = path.extname(sourcePath) || '.jpg';
  
  // Define output paths
  const fullName = `${baseName}.jpg`;
  const thumbName = `${baseName}-thumb.jpg`;
  const originalName = `${baseName}_original${originalExt}`;

  const fullDir = path.join(outputDir, 'full');
  const thumbDir = path.join(outputDir, 'thumb');
  const originalsDir = path.join(outputDir, 'originals');

  // Ensure directories exist
  await fs.promises.mkdir(fullDir, { recursive: true });
  await fs.promises.mkdir(thumbDir, { recursive: true });
  await fs.promises.mkdir(originalsDir, { recursive: true });

  // Copy original
  const originalPath = path.join(originalsDir, originalName);
  await fs.promises.copyFile(sourcePath, originalPath);
  result.originalPath = originalPath;

  // Process to JPEG
  const fullPath = path.join(fullDir, fullName);
  await processToJpeg(sourcePath, fullPath);
  result.fullPath = fullPath;

  // Generate thumbnail
  const thumbPath = path.join(thumbDir, thumbName);
  const thumbSource = thumbSourcePath || fullPath;
  await generateThumbnail(thumbSource, thumbPath);
  result.thumbPath = thumbPath;

  result.success = true;
  result.duration = Date.now() - startTime;

  return result;
}

/**
 * Get image metadata using Sharp
 * @param {string} imagePath - Path to image
 * @returns {Promise<Object>} Image metadata (width, height, format, etc.)
 */
async function getImageMetadata(imagePath) {
  const metadata = await sharp(imagePath).metadata();
  return {
    width: metadata.width,
    height: metadata.height,
    format: metadata.format,
    space: metadata.space,
    channels: metadata.channels,
    depth: metadata.depth,
    density: metadata.density,
    hasAlpha: metadata.hasAlpha,
    orientation: metadata.orientation
  };
}

module.exports = {
  sharpWithTimeout,
  generateThumbnail,
  processToJpeg,
  processImageGroup,
  getImageMetadata,
  DEFAULT_TIMEOUT,
  THUMB_TIMEOUT
};
