/**
 * Photography Constants
 * 
 * Standard photography values for aperture, shutter speed, and ISO.
 * These are shared across mobile, watch-app, and server.
 */

/**
 * Standard Aperture stops (1/3 stops)
 * From f/1.0 to f/32
 */
const APERTURES = [
  1.0, 1.2, 1.4, 1.6, 1.8, 2.0, 2.2, 2.5, 2.8, 3.2, 3.5, 4.0, 4.5, 5.0, 5.6, 
  6.3, 7.1, 8.0, 9.0, 10, 11, 13, 14, 16, 18, 20, 22, 25, 29, 32
];

/**
 * Standard Shutter speeds (1/3 stops)
 * From 1/8000 to 30 seconds
 */
const SHUTTER_SPEEDS = [
  '1/8000', '1/6400', '1/5000', '1/4000', '1/3200', '1/2500', '1/2000', '1/1600', 
  '1/1250', '1/1000', '1/800', '1/640', '1/500', '1/400', '1/320', '1/250', '1/200', 
  '1/160', '1/125', '1/100', '1/80', '1/60', '1/50', '1/40', '1/30', '1/25', '1/20', 
  '1/15', '1/13', '1/10', '1/8', '1/6', '1/5', '1/4', '1/3', '0.4', '0.5', '0.6', 
  '0.8', '1', '1.3', '1.6', '2', '2.5', '3.2', '4', '5', '6', '8', '10', '13', '15', 
  '20', '25', '30'
];

// Alias for backward compatibility
const SHUTTERS = SHUTTER_SPEEDS;

/**
 * Common ISO values
 */
const ISO_VALUES = [
  25, 50, 64, 80, 100, 125, 160, 200, 250, 320, 400, 500, 640, 800, 
  1000, 1250, 1600, 2000, 2500, 3200, 4000, 5000, 6400
];

/**
 * Parse shutter speed string to numeric value
 * @param {string|number} s - Shutter speed (e.g., "1/125" or 2)
 * @returns {number} - Numeric shutter speed value
 */
function parseShutter(s) {
  if (typeof s === 'string' && s.includes('/')) {
    const [n, d] = s.split('/');
    return Number(n) / Number(d);
  }
  return Number(s);
}

/**
 * Find closest shutter speed from standard values
 * @param {number} targetT - Target shutter speed (numeric)
 * @returns {string} - Closest standard shutter speed
 */
function findClosestShutter(targetT) {
  let closest = SHUTTER_SPEEDS[0];
  let minDiff = Infinity;
  
  for (const s of SHUTTER_SPEEDS) {
    const val = parseShutter(s);
    const diff = Math.abs(val - targetT);
    if (diff < minDiff) {
      minDiff = diff;
      closest = s;
    }
  }
  
  return closest;
}

/**
 * Find closest aperture from standard values
 * @param {number} targetAperture - Target aperture value
 * @returns {number} - Closest standard aperture
 */
function findClosestAperture(targetAperture) {
  let closest = APERTURES[0];
  let minDiff = Infinity;
  
  for (const f of APERTURES) {
    const diff = Math.abs(f - targetAperture);
    if (diff < minDiff) {
      minDiff = diff;
      closest = f;
    }
  }
  
  return closest;
}

module.exports = {
  APERTURES,
  SHUTTER_SPEEDS,
  SHUTTERS,
  ISO_VALUES,
  parseShutter,
  findClosestShutter,
  findClosestAperture
};
