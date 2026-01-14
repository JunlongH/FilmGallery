/**
 * Thumbnail Generation Service
 * 
 * Provides utilities for generating thumbnails from images.
 * Extracted from routes/rolls.js for reusability and testability.
 */

// eslint-disable-next-line @typescript-eslint/no-var-requires
const sharp = require('sharp');
import * as fs from 'fs';
import * as path from 'path';

// Disable sharp cache to prevent file locking on Windows
sharp.cache(false);
// Limit concurrency to 1 to prevent memory spikes with large TIFFs
sharp.concurrency(1);

/** Default timeout for sharp operations (30 seconds) */
export const DEFAULT_TIMEOUT = 30000;
/** Faster timeout for thumbnail operations (10 seconds) */
export const THUMB_TIMEOUT = 10000;

/** Thumbnail generation options */
export interface ThumbnailOptions {
  width?: number;
  height?: number;
  quality?: number;
  timeout?: number;
}

/** JPEG processing options */
export interface JpegProcessOptions {
  quality?: number;
  timeout?: number;
}

/** Image group processing parameters */
export interface ImageGroupParams {
  sourcePath: string;
  outputDir: string;
  baseName: string;
  isNegative?: boolean;
  thumbSourcePath?: string | null;
}

/** Thumbnail generation result */
export interface ThumbnailResult {
  success: boolean;
  path: string;
  size: number;
}

/** JPEG processing result */
export interface JpegResult {
  success: boolean;
  path: string;
  size: number;
  duration: number;
}

/** Image group processing result */
export interface ImageGroupResult {
  success: boolean;
  fullPath: string | null;
  thumbPath: string | null;
  originalPath: string | null;
  isNegative: boolean;
  duration: number;
}

/** Image metadata */
export interface ImageMetadata {
  width: number | undefined;
  height: number | undefined;
  format: string | undefined;
  space: string | undefined;
  channels: number | undefined;
  depth: string | undefined;
  density: number | undefined;
  hasAlpha: boolean | undefined;
  orientation: number | undefined;
}

/**
 * Run a Sharp operation with timeout protection
 * @param sharpOperation - Sharp operation promise
 * @param timeoutMs - Timeout in milliseconds
 * @returns Result of the sharp operation
 * @throws If operation times out or fails
 */
export async function sharpWithTimeout<T>(
  sharpOperation: Promise<T>, 
  timeoutMs: number = DEFAULT_TIMEOUT
): Promise<T> {
  return Promise.race([
    sharpOperation,
    new Promise<T>((_, reject) => 
      setTimeout(() => reject(new Error('Sharp operation timed out')), timeoutMs)
    )
  ]);
}

/**
 * Generate a JPEG thumbnail from an image
 * @param inputPath - Path to source image
 * @param outputPath - Path for output thumbnail
 * @param options - Thumbnail options
 * @returns Thumbnail generation result
 */
export async function generateThumbnail(
  inputPath: string, 
  outputPath: string, 
  options: ThumbnailOptions = {}
): Promise<ThumbnailResult> {
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
 * @param inputPath - Path to source image
 * @param outputPath - Path for output JPEG
 * @param options - Processing options
 * @returns JPEG processing result
 */
export async function processToJpeg(
  inputPath: string, 
  outputPath: string, 
  options: JpegProcessOptions = {}
): Promise<JpegResult> {
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
 * @param params - Processing parameters
 * @returns Processing results with paths
 */
export async function processImageGroup(params: ImageGroupParams): Promise<ImageGroupResult> {
  const {
    sourcePath,
    outputDir,
    baseName,
    isNegative = false,
    thumbSourcePath = null
  } = params;

  const result: ImageGroupResult = {
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
 * @param imagePath - Path to image
 * @returns Image metadata (width, height, format, etc.)
 */
export async function getImageMetadata(imagePath: string): Promise<ImageMetadata> {
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

// CommonJS compatibility
module.exports = {
  sharpWithTimeout,
  generateThumbnail,
  processToJpeg,
  processImageGroup,
  getImageMetadata,
  DEFAULT_TIMEOUT,
  THUMB_TIMEOUT
};
