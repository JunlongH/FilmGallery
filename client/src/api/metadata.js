/**
 * Locations, Tags, Presets API
 */

import { jsonFetch, postJson, putJson, deleteRequest, buildQueryString } from './core';

// ========================================
// LOCATIONS
// ========================================

/**
 * Get locations
 */
export async function getLocations({ hasRecords = true, country, query } = {}) {
  const qs = buildQueryString({ hasRecords, country, query });
  return jsonFetch(`/api/locations${qs}`);
}

/**
 * Search locations
 */
export async function searchLocations(params = {}) {
  const qs = buildQueryString(params);
  return jsonFetch(`/api/locations/search${qs}`);
}

/**
 * Get single location
 */
export async function getLocation(id) {
  return jsonFetch(`/api/locations/${id}`);
}

/**
 * Get countries list
 */
export async function getCountries() {
  return jsonFetch('/api/locations/countries');
}

/**
 * Create location
 */
export async function createLocation(data) {
  return postJson('/api/locations', data);
}

// ========================================
// TAGS
// ========================================

/**
 * Get all tags
 */
export async function getTags() {
  return jsonFetch('/api/tags');
}

/**
 * Get photos by tag
 */
export async function getTagPhotos(tagId) {
  return jsonFetch(`/api/tags/${tagId}/photos`);
}

// ========================================
// PRESETS
// ========================================

/**
 * List presets by category
 */
export async function listPresets(category) {
  const qs = category ? `?category=${category}` : '';
  return jsonFetch(`/api/presets${qs}`);
}

/**
 * Create preset
 */
export async function createPreset({ name, category, description, params }) {
  return postJson('/api/presets', { name, category, description, params });
}

/**
 * Update preset
 */
export async function updatePreset(id, { name, category, description, params }) {
  return putJson(`/api/presets/${id}`, { name, category, description, params });
}

/**
 * Delete preset
 */
export async function deletePreset(id) {
  return deleteRequest(`/api/presets/${id}`);
}

// ========================================
// METADATA
// ========================================

/**
 * Get metadata options (cameras, lenses from EXIF)
 */
export async function getMetadataOptions() {
  return jsonFetch('/api/metadata/options');
}
