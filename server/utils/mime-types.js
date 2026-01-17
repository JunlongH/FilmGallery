/**
 * MIME Types Registry
 * 
 * Centralized MIME type definitions for all supported image formats.
 * Used for file type detection, content-type headers, and format validation.
 * 
 * @module mime-types
 */

const path = require('path');

/**
 * MIME type mappings by file extension
 */
const MIME_TYPES = {
  // Standard web images
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.avif': 'image/avif',

  // TIFF (common for scanners)
  '.tif': 'image/tiff',
  '.tiff': 'image/tiff',

  // Bitmap (Fuji scanners)
  '.bmp': 'image/bmp',
  '.dib': 'image/bmp',

  // HEIF/HEIC (Apple)
  '.heic': 'image/heic',
  '.heif': 'image/heif',

  // Adobe formats
  '.psd': 'image/vnd.adobe.photoshop',

  // RAW formats - Adobe
  '.dng': 'image/x-adobe-dng',

  // RAW formats - Canon
  '.cr2': 'image/x-canon-cr2',
  '.cr3': 'image/x-canon-cr3',
  '.crw': 'image/x-canon-crw',

  // RAW formats - Nikon
  '.nef': 'image/x-nikon-nef',
  '.nrw': 'image/x-nikon-nrw',

  // RAW formats - Sony
  '.arw': 'image/x-sony-arw',
  '.srf': 'image/x-sony-srf',
  '.sr2': 'image/x-sony-sr2',

  // RAW formats - Fuji
  '.raf': 'image/x-fuji-raf',

  // RAW formats - Olympus
  '.orf': 'image/x-olympus-orf',

  // RAW formats - Panasonic
  '.rw2': 'image/x-panasonic-rw2',
  '.raw': 'image/x-panasonic-raw',

  // RAW formats - Pentax
  '.pef': 'image/x-pentax-pef',

  // RAW formats - Samsung
  '.srw': 'image/x-samsung-srw',

  // RAW formats - Sigma
  '.x3f': 'image/x-sigma-x3f',

  // RAW formats - Epson
  '.erf': 'image/x-epson-erf',

  // RAW formats - Mamiya
  '.mef': 'image/x-mamiya-mef',

  // RAW formats - Leaf
  '.mos': 'image/x-leaf-mos',

  // RAW formats - Minolta
  '.mrw': 'image/x-minolta-mrw',

  // RAW formats - Kodak
  '.kdc': 'image/x-kodak-kdc',
  '.dcr': 'image/x-kodak-dcr',
  '.k25': 'image/x-kodak-k25',

  // RAW formats - Hasselblad/Imacon
  '.3fr': 'image/x-hasselblad-3fr',
  '.fff': 'image/x-hasselblad-fff',

  // RAW formats - Phase One
  '.iiq': 'image/x-phaseone-iiq',

  // RAW formats - Other
  '.rwl': 'image/x-raw',
  '.qtk': 'image/x-quicktake'
};

/**
 * File categories
 */
const FILE_CATEGORIES = {
  WEB_IMAGE: ['jpg', 'jpeg', 'png', 'gif', 'webp', 'avif'],
  TIFF: ['tif', 'tiff'],
  BMP: ['bmp', 'dib'],
  HEIF: ['heic', 'heif'],
  PSD: ['psd'],
  RAW: [
    'dng', 'cr2', 'cr3', 'crw', 'nef', 'nrw', 'arw', 'srf', 'sr2',
    'raf', 'orf', 'rw2', 'raw', 'pef', 'srw', 'x3f', 'erf', 'mef',
    'mos', 'mrw', 'kdc', 'dcr', 'k25', '3fr', 'fff', 'iiq', 'rwl', 'qtk'
  ]
};

/**
 * Get MIME type for a file
 * 
 * @param {string} filename - Filename or path
 * @returns {string} MIME type or 'application/octet-stream'
 */
function getMimeType(filename) {
  const ext = path.extname(filename).toLowerCase();
  return MIME_TYPES[ext] || 'application/octet-stream';
}

/**
 * Check if file is an image
 * 
 * @param {string} filename - Filename or path
 * @returns {boolean}
 */
function isImageFile(filename) {
  const mime = getMimeType(filename);
  return mime.startsWith('image/');
}

/**
 * Check if file is a RAW format
 * 
 * @param {string} filename - Filename or path
 * @returns {boolean}
 */
function isRawFile(filename) {
  const ext = path.extname(filename).toLowerCase().slice(1); // Remove leading dot
  return FILE_CATEGORIES.RAW.includes(ext);
}

/**
 * Check if file is a TIFF
 * 
 * @param {string} filename - Filename or path
 * @returns {boolean}
 */
function isTiffFile(filename) {
  const ext = path.extname(filename).toLowerCase().slice(1);
  return FILE_CATEGORIES.TIFF.includes(ext);
}

/**
 * Check if file is a BMP
 * 
 * @param {string} filename - Filename or path
 * @returns {boolean}
 */
function isBmpFile(filename) {
  const ext = path.extname(filename).toLowerCase().slice(1);
  return FILE_CATEGORIES.BMP.includes(ext);
}

/**
 * Check if file is browser-displayable (native support)
 * 
 * @param {string} filename - Filename or path
 * @returns {boolean}
 */
function isBrowserDisplayable(filename) {
  const ext = path.extname(filename).toLowerCase().slice(1);
  // Modern browsers support: JPEG, PNG, GIF, WebP, AVIF, BMP
  return FILE_CATEGORIES.WEB_IMAGE.includes(ext) || FILE_CATEGORIES.BMP.includes(ext);
}

/**
 * Check if file needs server-side processing for preview
 * 
 * @param {string} filename - Filename or path
 * @returns {boolean}
 */
function needsServerProcessing(filename) {
  const ext = path.extname(filename).toLowerCase().slice(1);
  // RAW and TIFF files need server processing for thumbnails
  return FILE_CATEGORIES.RAW.includes(ext) || FILE_CATEGORIES.TIFF.includes(ext);
}

/**
 * Get file category
 * 
 * @param {string} filename - Filename or path
 * @returns {string} Category name
 */
function getFileCategory(filename) {
  const ext = path.extname(filename).toLowerCase().slice(1);
  
  for (const [category, extensions] of Object.entries(FILE_CATEGORIES)) {
    if (extensions.includes(ext)) {
      return category;
    }
  }
  
  return 'UNKNOWN';
}

/**
 * Get all supported extensions as array (with dots)
 * 
 * @returns {string[]}
 */
function getAllSupportedExtensions() {
  return Object.keys(MIME_TYPES);
}

/**
 * Get RAW extensions as array (with dots)
 * 
 * @returns {string[]}
 */
function getRawExtensions() {
  return FILE_CATEGORIES.RAW.map(ext => `.${ext}`);
}

/**
 * Build accept attribute for file inputs
 * 
 * @param {Object} options - Options
 * @param {boolean} options.includeRaw - Include RAW formats
 * @param {boolean} options.includeTiff - Include TIFF
 * @param {boolean} options.includeBmp - Include BMP
 * @returns {string} Accept attribute value
 */
function buildAcceptAttribute(options = {}) {
  const { includeRaw = true, includeTiff = true, includeBmp = true } = options;
  
  let accept = 'image/*';
  
  if (includeRaw) {
    accept += ',' + FILE_CATEGORIES.RAW.map(ext => `.${ext}`).join(',');
  }
  
  if (includeTiff) {
    accept += ',' + FILE_CATEGORIES.TIFF.map(ext => `.${ext}`).join(',');
  }
  
  if (includeBmp) {
    accept += ',' + FILE_CATEGORIES.BMP.map(ext => `.${ext}`).join(',');
  }
  
  return accept;
}

module.exports = {
  MIME_TYPES,
  FILE_CATEGORIES,
  getMimeType,
  isImageFile,
  isRawFile,
  isTiffFile,
  isBmpFile,
  isBrowserDisplayable,
  needsServerProcessing,
  getFileCategory,
  getAllSupportedExtensions,
  getRawExtensions,
  buildAcceptAttribute
};
