/**
 * API Module - Legacy Entry Point
 * 
 * This file re-exports everything from the new modular API structure
 * for backward compatibility with existing imports.
 * 
 * The API has been refactored into separate modules under ./api/:
 * - core.js      - Base utilities and fetch helpers
 * - rolls.js     - Roll management
 * - photos.js    - Photo management and processing
 * - films.js     - Film stocks and inventory
 * - equipment.js - Cameras, lenses, flashes, scanners, film backs
 * - exports.js   - Batch export and render
 * - metadata.js  - Locations, tags, presets
 * - luts.js      - LUT file management
 * - downloads.js - Batch download and import
 * - processing.js- RAW decoding and edge detection
 * 
 * New code should import from specific modules:
 *   import { getRolls } from './api/rolls';
 * 
 * Legacy imports continue to work:
 *   import { getRolls, getCameras } from './api';
 */

// Re-export everything from the new modular structure
export * from './api/index';

