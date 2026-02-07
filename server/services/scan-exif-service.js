/**
 * Scan EXIF Service
 * 
 * Extracts scanner/digitization device information from EXIF metadata.
 * Distinguishes between scanner files and camera files.
 * 
 * @module scan-exif-service
 */

const path = require('path');

// Lazy load exiftool to avoid startup overhead
let exiftool = null;
const getExiftool = () => {
  if (!exiftool) {
    try {
      exiftool = require('exiftool-vendored').exiftool;
    } catch (e) {
      console.error('[ScanExifService] Failed to load exiftool:', e.message);
    }
  }
  return exiftool;
};

// Known scanner manufacturers
const SCANNER_MAKES = [
  'EPSON', 'NIKON', 'CANON', 'PLUSTEK', 'PACIFIC IMAGE',
  'REFLECTA', 'BRAUN', 'HASSELBLAD', 'IMACON', 'MICROTEK',
  'UMAX', 'AGFA', 'HEWLETT-PACKARD', 'HP', 'MINOLTA'
];

// Known scanner model keywords
const SCANNER_KEYWORDS = [
  'PERFECTION', 'COOLSCAN', 'FLEXTIGHT', 'PRIMESCAN',
  'OPTICFILM', 'PROSCAN', 'SCANNER', 'IXPRESS',
  'CANOSCAN', 'SCANMAKER', 'DUOSCAN', 'LS-'
];

// Known scanning software
const SCAN_SOFTWARE = [
  'EPSON SCAN', 'SILVERFAST', 'VUESCAN', 'NIKON SCAN',
  'CANON SCANGEAR', 'NEGATIVE LAB PRO', 'FLEXCOLOR', 'PHOCUS',
  'SCANWIZARD', 'LASERSOFT', 'HAMRICK'
];

// DSLR scanning software (indicates camera was used for scanning)
const DSLR_SCAN_SOFTWARE = [
  'NEGATIVE LAB PRO', 'GRAIN2PIXEL', 'FILMLAB'
];

/**
 * Scanner type enumeration
 */
const SCANNER_TYPES = {
  FLATBED: 'flatbed',
  FILM: 'film',
  DRUM: 'drum',
  DSLR_SCAN: 'dslr_scan',
  CAMERA_SCAN: 'camera_scan',
  OTHER: 'other'
};

/**
 * Extract scanner information from file EXIF
 * 
 * @param {string} filePath - Path to image file
 * @returns {Promise<ScannerInfo>}
 */
async function extractScannerInfo(filePath) {
  const tool = getExiftool();
  if (!tool) {
    return createEmptyScannerInfo();
  }

  try {
    const tags = await tool.read(filePath);
    
    return {
      // Device identification
      make: tags.Make || null,
      model: tags.Model || null,
      software: tags.Software || null,
      
      // Resolution
      xResolution: tags.XResolution || null,
      yResolution: tags.YResolution || null,
      resolutionUnit: tags.ResolutionUnit || null, // 1=None, 2=inches, 3=cm
      
      // Timestamps
      dateTime: tags.DateTime || tags.DateTimeOriginal || tags.CreateDate || null,
      
      // Image properties
      bitsPerSample: tags.BitsPerSample || null,
      compression: tags.Compression || null,
      colorSpace: tags.ColorSpace || null,
      
      // Scanner-specific tags (some scanners write these)
      scannerMake: tags.ScannerMake || null,
      scannerModel: tags.ScannerModel || null,
      
      // Lens info (for DSLR scanning)
      lensModel: tags.LensModel || tags.Lens || null,
      
      // Calculate effective DPI
      effectiveDpi: calculateEffectiveDpi(tags),
      
      // Determine if this is a scanner
      isScanner: isScannerDevice({ make: tags.Make, model: tags.Model, software: tags.Software, xResolution: tags.XResolution }),
      
      // Raw data for debugging
      _raw: {
        Make: tags.Make,
        Model: tags.Model,
        Software: tags.Software,
        DateTime: tags.DateTime,
        XResolution: tags.XResolution,
        YResolution: tags.YResolution,
        BitsPerSample: tags.BitsPerSample
      }
    };
  } catch (err) {
    console.error('[ScanExifService] Failed to read EXIF:', err.message);
    return createEmptyScannerInfo();
  }
}

/**
 * Create empty scanner info object
 */
function createEmptyScannerInfo() {
  return {
    make: null,
    model: null,
    software: null,
    xResolution: null,
    yResolution: null,
    resolutionUnit: null,
    dateTime: null,
    bitsPerSample: null,
    compression: null,
    colorSpace: null,
    scannerMake: null,
    scannerModel: null,
    lensModel: null,
    effectiveDpi: null,
    isScanner: false,
    _raw: {}
  };
}

/**
 * Detect if EXIF indicates a scanner (vs. camera)
 * 
 * @param {Object} info - Object with make, model, software, xResolution
 * @returns {boolean}
 */
function isScannerDevice(info) {
  const make = (info.make || '').toUpperCase();
  const model = (info.model || '').toUpperCase();
  const software = (info.software || '').toUpperCase();

  // Check for scanner manufacturers with scanner-like models
  for (const scanMake of SCANNER_MAKES) {
    if (make.includes(scanMake)) {
      // Verify it's actually a scanner, not a camera from same brand
      for (const keyword of SCANNER_KEYWORDS) {
        if (model.includes(keyword)) {
          return true;
        }
      }
    }
  }

  // Check for known scanning software
  for (const sw of SCAN_SOFTWARE) {
    if (software.includes(sw)) {
      return true;
    }
  }

  // Check for scanner model keywords directly
  for (const keyword of SCANNER_KEYWORDS) {
    if (model.includes(keyword)) {
      return true;
    }
  }

  // Check resolution - scanners typically write high DPI values (> 300)
  // Cameras typically write 72 or 300 DPI
  const dpi = info.xResolution;
  if (dpi && dpi > 600) {
    // High DPI combined with scanner-like make is likely a scanner
    for (const scanMake of SCANNER_MAKES) {
      if (make.includes(scanMake)) {
        return true;
      }
    }
  }

  // Specific Hasselblad/Imacon detection
  if (make.includes('HASSELBLAD') || make.includes('IMACON')) {
    // Flextight and Ixpress are scanners/scan backs
    if (model.includes('FLEXTIGHT') || model.includes('IXPRESS')) {
      return true;
    }
  }

  return false;
}

/**
 * Detect if this is a DSLR scanning file
 * (Camera used to digitize film)
 * 
 * @param {Object} info - Scanner info object
 * @returns {boolean}
 */
function isDslrScan(info) {
  const software = (info.software || '').toUpperCase();
  
  // Check for DSLR scanning software
  for (const sw of DSLR_SCAN_SOFTWARE) {
    if (software.includes(sw)) {
      return true;
    }
  }

  // If it's a digital camera but has macro lens, might be DSLR scan
  // This requires manual user confirmation
  return false;
}

/**
 * Calculate effective scan resolution in DPI
 * 
 * @param {Object} tags - EXIF tags
 * @returns {number|null}
 */
function calculateEffectiveDpi(tags) {
  const xRes = tags.XResolution;
  if (!xRes) return null;

  // ResolutionUnit: 1=None (assume DPI), 2=inches (DPI), 3=centimeters (DPCM)
  const unit = tags.ResolutionUnit || 2;
  let dpi = xRes;

  if (unit === 3) {
    // Convert from dots per centimeter to DPI
    dpi = Math.round(xRes * 2.54);
  }

  return dpi;
}

/**
 * Detect scanner type from model name
 * 
 * @param {string} model - Scanner model name
 * @returns {string} Scanner type
 */
function detectScannerType(model) {
  if (!model) return SCANNER_TYPES.OTHER;
  
  const upper = model.toUpperCase();

  if (upper.includes('FLEXTIGHT') || upper.includes('COOLSCAN') || 
      upper.includes('OPTICFILM') || upper.includes('PROSCAN')) {
    return SCANNER_TYPES.FILM;
  }

  if (upper.includes('PERFECTION') || upper.includes('CANOSCAN') || 
      upper.includes('SCANMAKER')) {
    return SCANNER_TYPES.FLATBED;
  }

  if (upper.includes('PRIMESCAN') || upper.includes('AZTEK') ||
      upper.includes('SCREEN') || upper.includes('HEIDELBERG')) {
    return SCANNER_TYPES.DRUM;
  }

  return SCANNER_TYPES.OTHER;
}

/**
 * Match scanner info to equipment library
 * 
 * @param {Object} scannerInfo - Extracted scanner info
 * @param {Array} scanners - List of scanners from equipment library
 * @returns {Object|null} Matching scanner or null
 */
function matchScannerToEquipment(scannerInfo, scanners) {
  if (!scannerInfo.make && !scannerInfo.model) return null;
  if (!Array.isArray(scanners) || scanners.length === 0) return null;

  const make = (scannerInfo.make || '').toUpperCase();
  const model = (scannerInfo.model || '').toUpperCase();

  for (const scanner of scanners) {
    const sMake = (scanner.brand || '').toUpperCase();
    const sModel = (scanner.model || '').toUpperCase();

    // Exact match
    if (sMake && sModel && make.includes(sMake) && model.includes(sModel)) {
      return scanner;
    }

    // Partial match on model
    if (sModel && model.includes(sModel)) {
      return scanner;
    }
  }

  return null;
}

/**
 * Format scanner info for database storage
 * 
 * @param {Object} scannerInfo - Extracted scanner info
 * @returns {Object} Database-ready object
 */
function formatForDatabase(scannerInfo) {
  let scanDate = null;
  if (scannerInfo.dateTime) {
    try {
      const d = new Date(scannerInfo.dateTime);
      if (!isNaN(d.getTime())) {
        scanDate = d.toISOString();
      }
    } catch (_) { /* ignore unparseable dates */ }
  }

  return {
    source_make: scannerInfo.make || null,
    source_model: scannerInfo.model || null,
    source_software: scannerInfo.software || null,
    scan_resolution: scannerInfo.effectiveDpi || null,
    scan_date: scanDate,
    scan_bit_depth: Array.isArray(scannerInfo.bitsPerSample) 
      ? scannerInfo.bitsPerSample[0] 
      : scannerInfo.bitsPerSample || null
  };
}

/**
 * Format scanner info for XMP export
 * Uses custom FilmGallery namespace
 * 
 * @param {Object} photo - Photo record from database
 * @param {Object} scanner - Scanner equipment record (optional)
 * @returns {Object} XMP tags object
 */
function formatForXmpExport(photo, scanner = null) {
  const xmpTags = {};

  // Scanner make/model
  if (scanner) {
    xmpTags['XMP-FilmGallery:ScannerMake'] = scanner.brand || null;
    xmpTags['XMP-FilmGallery:ScannerModel'] = scanner.model || null;
  } else if (photo.source_make || photo.source_model) {
    xmpTags['XMP-FilmGallery:ScannerMake'] = photo.source_make || null;
    xmpTags['XMP-FilmGallery:ScannerModel'] = photo.source_model || null;
  }

  // Scan parameters
  if (photo.scan_resolution) {
    xmpTags['XMP-FilmGallery:ScanResolution'] = photo.scan_resolution;
  }
  if (photo.scan_software || photo.source_software) {
    xmpTags['XMP-FilmGallery:ScanSoftware'] = photo.scan_software || photo.source_software;
  }
  if (photo.scan_date) {
    xmpTags['XMP-FilmGallery:ScanDate'] = photo.scan_date;
  }
  if (photo.scan_bit_depth) {
    xmpTags['XMP-FilmGallery:ScanBitDepth'] = photo.scan_bit_depth;
  }

  return xmpTags;
}

module.exports = {
  extractScannerInfo,
  isScannerDevice,
  isDslrScan,
  calculateEffectiveDpi,
  detectScannerType,
  matchScannerToEquipment,
  formatForDatabase,
  formatForXmpExport,
  createEmptyScannerInfo,
  SCANNER_TYPES,
  SCANNER_MAKES,
  SCANNER_KEYWORDS,
  SCAN_SOFTWARE
};
