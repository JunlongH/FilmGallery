/**
 * Film Constants
 * 
 * Centralized definition of film-related constants.
 * These are the single source of truth used across the server.
 */

/**
 * Film categories with display labels
 */
const FILM_CATEGORIES = [
  { value: 'color-negative', label: 'Color Negative (C-41)' },
  { value: 'color-reversal', label: 'Color Reversal (E-6)' },
  { value: 'bw-negative', label: 'B&W Negative' },
  { value: 'bw-reversal', label: 'B&W Reversal' },
  { value: 'instant', label: 'Instant' },
  { value: 'cine', label: 'Cinema (ECN-2)' },
  { value: 'other', label: 'Other' }
];

/**
 * Film formats with display labels (画幅)
 */
const FILM_FORMATS = [
  { value: '135', label: '35mm (135)' },
  { value: '120', label: 'Medium Format (120)' },
  { value: '220', label: 'Medium Format (220)' },
  { value: '110', label: '110' },
  { value: '127', label: '127' },
  { value: '4x5', label: '4x5 Large Format' },
  { value: '8x10', label: '8x10 Large Format' },
  { value: 'Instant', label: 'Instant' },
  { value: 'APS', label: 'APS' },
  { value: 'Half Frame', label: 'Half Frame' },
  { value: 'Super 8', label: 'Super 8' },
  { value: '16mm', label: '16mm Cine' },
  { value: '35mm Cine', label: '35mm Cinema' },
  { value: 'Other', label: 'Other' }
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
 * Development process types with display labels
 */
const PROCESS_TYPES = [
  { value: 'C-41', label: 'C-41' },
  { value: 'E-6', label: 'E-6' },
  { value: 'ECN-2', label: 'ECN-2 (Cinema)' },
  { value: 'B&W', label: 'Black & White' },
  { value: 'Cross', label: 'Cross Processing' },
  { value: 'Push', label: 'Push Processing' },
  { value: 'Pull', label: 'Pull Processing' },
  { value: 'Other', label: 'Other' }
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
