/**
 * Film Constants
 * 
 * Centralized definition of film-related constants.
 * These are the single source of truth used across the server.
 */

/**
 * Film categories enum
 */
const FILM_CATEGORIES = [
  'color-negative',   // Color Negative (彩色负片) - C-41
  'color-reversal',   // Color Reversal/Slide (彩色反转片) - E-6
  'bw-negative',      // Black & White Negative (黑白负片)
  'bw-reversal',      // Black & White Reversal (黑白反转片)
  'instant',          // Instant Film (拍立得)
  'cine',             // Cinema Film (电影胶片) - ECN-2
  'other'
];

/**
 * Film formats (画幅)
 */
const FILM_FORMATS = [
  '135',              // 35mm standard
  '120',              // Medium format
  '220',              // Medium format double length
  '110',              // Pocket Instamatic
  '127',              // Vest Pocket
  '4x5',              // Large format 4x5
  '8x10',             // Large format 8x10
  'Instant',          // Polaroid/Instax
  'APS',              // Advanced Photo System
  'Half Frame',       // 35mm half frame
  'Super 8',          // Super 8 cine
  '16mm',             // 16mm cine
  '35mm Cine',        // 35mm cinema
  'Other'
];

/**
 * Common film brands for auto-detection
 */
const KNOWN_BRANDS = [
  'Kodak', 'Fujifilm', 'Fuji', 'Ilford', 'Agfa', 'Lomography', 'Lomo',
  'CineStill', 'Cinestill', 'Foma', 'Rollei', 'Bergger', 'ORWO',
  'Polaroid', 'Instax', 'Impossible', 'Kentmere', 'Adox', 'JCH',
  'Shanghai', 'Lucky', 'Fomapan', 'Svema', 'Tasma', 'Ferrania',
  'Silberra', 'Washi', 'Dubblefilm', 'Kono', 'Yodica', 'Revolog',
  'Harman', 'Japan Camera Hunter'
];

/**
 * Development process types
 */
const PROCESS_TYPES = [
  'C-41',         // Color negative standard
  'E-6',          // Color reversal standard
  'ECN-2',        // Cinema color negative
  'B&W',          // Black & white standard
  'Cross',        // Cross processing
  'Push',         // Push processing
  'Pull',         // Pull processing
  'Other'
];

/**
 * Film item status lifecycle
 */
const FILM_ITEM_STATUSES = [
  'in_stock',      // 库存中
  'loaded',        // 已上机
  'shot',          // 已拍完
  'sent_to_lab',   // 已送洗
  'developed',     // 已冲洗
  'scanned',       // 已扫描
  'archived'       // 已归档
];

module.exports = {
  FILM_CATEGORIES,
  FILM_FORMATS,
  KNOWN_BRANDS,
  PROCESS_TYPES,
  FILM_ITEM_STATUSES
};
