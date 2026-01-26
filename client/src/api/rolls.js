/**
 * Rolls API - Roll management and related operations
 */

import { jsonFetch, postJson, putJson, deleteRequest, uploadWithProgress, buildQueryString } from './core';

// ========================================
// ROLL CRUD
// ========================================

/**
 * Get all rolls with optional filters
 */
export async function getRolls(filters = {}) {
  const qs = buildQueryString(filters);
  return jsonFetch(`/api/rolls${qs}`);
}

/**
 * Get single roll by ID
 */
export async function getRoll(id) {
  return jsonFetch(`/api/rolls/${id}`);
}

/**
 * Get locations for a roll
 */
export async function getRollLocations(rollId) {
  return jsonFetch(`/api/rolls/${rollId}/locations`);
}

/**
 * Update roll
 */
export async function updateRoll(id, data) {
  return putJson(`/api/rolls/${id}`, data);
}

/**
 * Delete roll
 */
export async function deleteRoll(id) {
  return deleteRequest(`/api/rolls/${id}`);
}

// ========================================
// ROLL CREATION
// ========================================

/**
 * Create roll with multipart form (direct upload)
 */
export async function createRollMultipart({ fields = {}, files = [], onProgress } = {}) {
  const fd = new FormData();
  Object.entries(fields).forEach(([k, v]) => {
    if (v !== undefined && v !== null) fd.append(k, v);
  });
  files.forEach(f => fd.append('files', f));
  return uploadWithProgress('/api/rolls', fd, onProgress);
}

/**
 * Create roll using previously uploaded tmp files
 */
export async function createRollWithTmp({ fields = {}, tmpFiles = [], coverIndex = 0 } = {}) {
  const payload = { ...fields, tmpFiles, coverIndex };
  return postJson('/api/rolls', payload);
}

/**
 * Unified roll creation - decides multipart vs tmp-flow
 */
export async function createRollUnified({
  fields = {},
  files = [],
  useTwoStep = false,
  isNegative = false,
  uploadType = null,
  onProgress,
  isOriginal = false
} = {}) {
  const effectiveUploadType = uploadType || (isNegative ? 'negative' : 'positive');
  const effectiveIsNegative = effectiveUploadType === 'negative';

  const augmentedFields = {
    ...fields,
    isNegative: effectiveIsNegative,
    uploadType: effectiveUploadType,
    isOriginal
  };

  const realFiles = files.filter(f => f instanceof File);
  const tmpFileList = files.filter(f => typeof f === 'string' || (f && f.tmpPath));

  if (tmpFileList.length > 0 || (realFiles.length === 0 && fields.tmpFiles)) {
    return createRollWithTmp({
      fields: augmentedFields,
      tmpFiles: fields.tmpFiles || tmpFileList,
      coverIndex: fields.coverIndex || 0
    });
  }

  return createRollMultipart({
    fields: augmentedFields,
    files: realFiles,
    onProgress
  });
}

// ========================================
// ROLL COVER
// ========================================

/**
 * Set roll cover image
 */
export async function setRollCover(rollId, { photoId, filename } = {}) {
  return postJson(`/api/rolls/${rollId}/cover`, { photoId, filename });
}

// ========================================
// ROLL PRESETS
// ========================================

export async function getRollPreset(rollId) {
  return jsonFetch(`/api/rolls/${rollId}/preset`);
}

export async function setRollPreset(rollId, { name, params }) {
  return postJson(`/api/rolls/${rollId}/preset`, { name, params });
}

export async function clearRollPreset(rollId) {
  return deleteRequest(`/api/rolls/${rollId}/preset`);
}

// ========================================
// CONTACT SHEET
// ========================================

export async function generateContactSheet(rollId, options = {}) {
  return postJson(`/api/rolls/${rollId}/contact-sheet`, options);
}
