/**
 * Photos API - Photo management and processing
 */

import { API_BASE, jsonFetch, putJson, deleteRequest, uploadWithProgress, buildQueryString } from './core';

// ========================================
// PHOTO CRUD
// ========================================

/**
 * Get photos for a roll
 */
export async function getPhotos(rollId) {
  return jsonFetch(`/api/rolls/${rollId}/photos`);
}

/**
 * Search photos with filters
 */
export async function searchPhotos(filters = {}) {
  const qs = buildQueryString(filters);
  return jsonFetch(`/api/photos/search${qs}`);
}

/**
 * Update photo metadata
 */
export async function updatePhoto(id, data) {
  return putJson(`/api/photos/${id}`, data);
}

/**
 * Delete photo
 */
export async function deletePhoto(id) {
  return deleteRequest(`/api/photos/${id}`);
}

/**
 * Get favorite photos
 */
export async function getFavoritePhotos() {
  return jsonFetch('/api/photos?favorite=1');
}

// ========================================
// PHOTO UPLOAD
// ========================================

/**
 * Upload single photo to roll
 */
export async function uploadPhotoToRoll(rollId, file, fields = {}) {
  const fd = new FormData();
  fd.append('image', file);
  Object.entries(fields).forEach(([k, v]) => {
    if (v !== undefined && v !== null) fd.append(k, v);
  });
  return uploadWithProgress(`/api/rolls/${rollId}/photos`, fd);
}

/**
 * Upload multiple photos to roll with progress
 */
export async function uploadPhotosToRoll({ rollId, files = [], onProgress, isNegative = false, uploadType = null }) {
  const effectiveUploadType = uploadType || (isNegative ? 'negative' : 'positive');

  const results = [];
  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    const res = await uploadPhotoToRoll(rollId, file, { 
      isNegative: effectiveUploadType === 'negative',
      uploadType: effectiveUploadType
    });
    results.push(res);
    if (onProgress) {
      onProgress(Math.round(((i + 1) / files.length) * 100));
    }
  }
  return { ok: true, photos: results };
}

// ========================================
// PHOTO PROCESSING (FilmLab)
// ========================================

/**
 * Update positive from negative (save processed image)
 */
export async function updatePositiveFromNegative(photoId, blob) {
  const fd = new FormData();
  fd.append('positive', blob, 'positive.jpg');
  const res = await fetch(`${API_BASE}/api/photos/${photoId}/update-positive`, {
    method: 'POST',
    body: fd
  });
  return res.json();
}

/**
 * Export processed positive image
 */
export async function exportPositive(photoId, params, { format = 'jpeg' } = {}) {
  const res = await fetch(`${API_BASE}/api/filmlab/export`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ photoId, params, format })
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Export failed');
  }
  return res.json();
}

/**
 * Render positive image (in-memory processing)
 */
export async function renderPositive(photoId, params, { format = 'jpeg' } = {}) {
  const res = await fetch(`${API_BASE}/api/filmlab/render`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ photoId, params, format })
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Render failed');
  }
  return res.json();
}

/**
 * Get FilmLab preview
 */
export async function filmlabPreview({ photoId, params, maxWidth = 1400 }) {
  const qs = new URLSearchParams();
  qs.append('photoId', photoId);
  qs.append('maxWidth', maxWidth);
  if (params) qs.append('params', JSON.stringify(params));
  return jsonFetch(`/api/filmlab/preview?${qs.toString()}`);
}
