/**
 * Batch Export/Render API
 */

import { jsonFetch, postJson } from './core';

// ========================================
// BATCH EXPORT (Export Queue)
// ========================================

/**
 * Create batch export job
 */
export async function createBatchExport(options) {
  return postJson('/api/export/batch', options);
}

/**
 * Get export jobs
 */
export async function getExportJobs(filters = {}) {
  const qs = new URLSearchParams();
  if (filters.status) qs.append('status', filters.status);
  if (filters.limit) qs.append('limit', filters.limit);
  const qsStr = qs.toString();
  return jsonFetch(`/api/export/jobs${qsStr ? '?' + qsStr : ''}`);
}

/**
 * Get single export job
 */
export async function getExportJob(jobId) {
  return jsonFetch(`/api/export/jobs/${jobId}`);
}

/**
 * Cancel export job
 */
export async function cancelExportJob(jobId) {
  return postJson(`/api/export/jobs/${jobId}/cancel`, {});
}

/**
 * Pause export job
 */
export async function pauseExportJob(jobId) {
  return postJson(`/api/export/jobs/${jobId}/pause`, {});
}

/**
 * Resume export job
 */
export async function resumeExportJob(jobId) {
  return postJson(`/api/export/jobs/${jobId}/resume`, {});
}

// ========================================
// BATCH RENDER (Legacy/Alternative)
// ========================================

/**
 * Create batch render for library
 */
export async function createBatchRenderLibrary(options) {
  return postJson('/api/batch-render/library', options);
}

/**
 * Create batch render for download
 */
export async function createBatchRenderDownload(options) {
  return postJson('/api/batch-render/download', options);
}

/**
 * Get batch render progress
 */
export async function getBatchRenderProgress(jobId) {
  return jsonFetch(`/api/batch-render/progress/${jobId}`);
}

/**
 * Cancel batch render
 */
export async function cancelBatchRender(jobId) {
  return postJson(`/api/batch-render/cancel/${jobId}`, {});
}

/**
 * Pause batch render
 */
export async function pauseBatchRender(jobId) {
  return postJson(`/api/batch-render/pause/${jobId}`, {});
}

/**
 * Resume batch render
 */
export async function resumeBatchRender(jobId) {
  return postJson(`/api/batch-render/resume/${jobId}`, {});
}

/**
 * Get all batch render jobs
 */
export async function getBatchRenderJobs() {
  return jsonFetch('/api/batch-render/jobs');
}

// ========================================
// EXPORT HISTORY
// ========================================

export async function getExportHistory(params = {}) {
  const qs = new URLSearchParams();
  if (params.photoId) qs.append('photoId', params.photoId);
  if (params.rollId) qs.append('rollId', params.rollId);
  if (params.limit) qs.append('limit', params.limit);
  const qsStr = qs.toString();
  return jsonFetch(`/api/export-history${qsStr ? '?' + qsStr : ''}`);
}
