/**
 * Films API - Film stock and film item management
 */

import { API_BASE, jsonFetch, postJson, putJson, deleteRequest, buildQueryString } from './core';

// ========================================
// FILM STOCKS
// ========================================

/**
 * Get all film stocks
 */
export async function getFilms(noCache = false) {
  const url = noCache ? `/api/films?_t=${Date.now()}` : '/api/films';
  return jsonFetch(url);
}

/**
 * Get film constants (categories, processes, etc.)
 */
export async function getFilmConstants() {
  return jsonFetch('/api/films/constants');
}

/**
 * Create new film stock
 */
export async function createFilm({ name, iso, category, brand, format, process, thumbFile }) {
  const fd = new FormData();
  fd.append('name', name);
  if (iso) fd.append('iso', iso);
  if (category) fd.append('category', category);
  if (brand) fd.append('brand', brand);
  if (format) fd.append('format', format);
  if (process) fd.append('process', process);
  if (thumbFile) fd.append('thumb', thumbFile);
  
  const res = await fetch(`${API_BASE}/api/films`, { method: 'POST', body: fd });
  return res.json();
}

/**
 * Update film stock
 */
export async function updateFilm({ id, name, iso, category, brand, format, process, thumbFile }) {
  const fd = new FormData();
  if (name) fd.append('name', name);
  if (iso !== undefined) fd.append('iso', iso);
  if (category !== undefined) fd.append('category', category);
  if (brand !== undefined) fd.append('brand', brand);
  if (format !== undefined) fd.append('format', format);
  if (process !== undefined) fd.append('process', process);
  if (thumbFile) fd.append('thumb', thumbFile);
  
  const res = await fetch(`${API_BASE}/api/films/${id}`, { method: 'PUT', body: fd });
  return res.json();
}

/**
 * Delete film stock
 */
export async function deleteFilm(id) {
  return deleteRequest(`/api/films/${id}`);
}

/**
 * Upload film stock image
 */
export async function uploadFilmImage(id, file) {
  const fd = new FormData();
  fd.append('thumb', file);
  const res = await fetch(`${API_BASE}/api/films/${id}/thumb`, { method: 'POST', body: fd });
  return res.json();
}

// ========================================
// FILM ITEMS (Inventory)
// ========================================

/**
 * Get film items (inventory)
 */
export async function getFilmItems(params = {}) {
  const qs = buildQueryString(params);
  return jsonFetch(`/api/film-items${qs}`);
}

/**
 * Get single film item
 */
export async function getFilmItem(id) {
  return jsonFetch(`/api/film-items/${id}`);
}

/**
 * Update film item
 */
export async function updateFilmItem(id, patch) {
  return putJson(`/api/film-items/${id}`, patch);
}

/**
 * Delete film item
 */
export async function deleteFilmItem(id, hard = false) {
  const qs = hard ? '?hard=true' : '';
  return deleteRequest(`/api/film-items/${id}${qs}`);
}

/**
 * Create film items batch (purchase)
 */
export async function createFilmItemsBatch(batch) {
  return postJson('/api/film-items/purchase-batch', batch);
}

/**
 * Export shot logs as CSV
 */
export async function exportShotLogsCsv(id) {
  const res = await fetch(`${API_BASE}/api/film-items/${id}/shot-logs/export`);
  if (!res.ok) throw new Error('Export failed');
  return res.blob();
}

// ========================================
// FILM CURVE PROFILES
// ========================================

export async function getFilmCurveProfiles() {
  return jsonFetch('/api/filmlab/film-curves');
}

export async function createFilmCurveProfile({ name, gamma, dMin, dMax, category = 'custom' }) {
  return postJson('/api/filmlab/film-curves', { name, gamma, dMin, dMax, category });
}

export async function updateFilmCurveProfile(id, { name, gamma, dMin, dMax, category }) {
  return putJson(`/api/filmlab/film-curves/${id}`, { name, gamma, dMin, dMax, category });
}

export async function deleteFilmCurveProfile(id) {
  return deleteRequest(`/api/filmlab/film-curves/${id}`);
}
