/**
 * Batch Download & Import API
 */

import { API_BASE, getApiBase, jsonFetch, postJson } from './core';

// ========================================
// BATCH DOWNLOAD
// ========================================

/**
 * Create batch download job
 */
export async function createBatchDownload(options) {
  return postJson('/api/batch-download', options);
}

/**
 * Get batch download progress
 */
export async function getBatchDownloadProgress(jobId) {
  return jsonFetch(`/api/batch-download/${jobId}/progress`);
}

/**
 * Cancel batch download
 */
export async function cancelBatchDownload(jobId) {
  return postJson(`/api/batch-download/${jobId}/cancel`, {});
}

/**
 * Check download availability for a type
 */
export async function checkDownloadAvailability(rollId, type, scope = 'all', photoIds = []) {
  const params = new URLSearchParams();
  params.append('rollId', rollId);
  params.append('type', type);
  params.append('scope', scope);
  if (photoIds.length > 0) {
    params.append('photoIds', JSON.stringify(photoIds));
  }
  return jsonFetch(`/api/batch-download/availability?${params}`);
}

/**
 * Get single download URL with optional EXIF
 */
export function getSingleDownloadUrl(photoId, type = 'positive', exif = false) {
  const apiBase = getApiBase();
  return `${apiBase}/api/batch-download/single/${photoId}?type=${type}&exif=${exif}`;
}

// ========================================
// EXTERNAL IMPORT
// ========================================

/**
 * Get available import strategies
 */
export async function getImportStrategies() {
  return jsonFetch('/api/import/strategies');
}

/**
 * Preview import matches
 */
export async function previewImport(rollId, filePaths, strategy = 'filename') {
  return postJson('/api/import/preview', { rollId, filePaths, strategy });
}

/**
 * Update manual match
 */
export async function updateManualMatch(rollId, matches, fileIndex, photoId) {
  return postJson('/api/import/manual-match', { rollId, matches, fileIndex, photoId });
}

/**
 * Execute import
 */
export async function executeImport(rollId, matches, conflictResolution = 'overwrite') {
  return postJson('/api/import/execute', { rollId, matches, conflictResolution });
}

/**
 * Get import progress
 */
export async function getImportProgress(jobId) {
  return jsonFetch(`/api/import/${jobId}/progress`);
}

/**
 * Cancel import
 */
export async function cancelImport(jobId) {
  return postJson(`/api/import/${jobId}/cancel`, {});
}
