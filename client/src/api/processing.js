/**
 * RAW Decoding & Edge Detection API
 */

import { API_BASE, jsonFetch, postJson, uploadWithProgress } from './core';

// ========================================
// RAW DECODING
// ========================================

/**
 * Get RAW decoder status
 */
export async function getRawDecoderStatus() {
  return jsonFetch('/api/raw/status');
}

/**
 * Get supported RAW formats
 */
export async function getSupportedRawFormats() {
  return jsonFetch('/api/raw/supported-formats');
}

/**
 * Decode RAW file
 */
export async function decodeRawFile(file, options = {}, onProgress) {
  const formData = new FormData();
  formData.append('file', file);
  
  Object.entries(options).forEach(([key, value]) => {
    if (value !== undefined && value !== null) {
      formData.append(key, String(value));
    }
  });

  return uploadWithProgress('/api/raw/decode', formData, onProgress);
}

/**
 * Quick preview RAW file
 */
export async function previewRawFile(file) {
  const formData = new FormData();
  formData.append('file', file);

  const resp = await fetch(`${API_BASE}/api/raw/preview`, {
    method: 'POST',
    body: formData
  });
  return resp.json();
}

/**
 * Extract RAW metadata
 */
export async function extractRawMetadata(file) {
  const formData = new FormData();
  formData.append('file', file);

  const resp = await fetch(`${API_BASE}/api/raw/metadata`, {
    method: 'POST',
    body: formData
  });
  return resp.json();
}

/**
 * Import RAW file to roll
 */
export async function importRawFile(file, rollId, options = {}, onProgress) {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('rollId', String(rollId));
  
  Object.entries(options).forEach(([key, value]) => {
    if (value !== undefined && value !== null) {
      formData.append(key, String(value));
    }
  });

  return uploadWithProgress('/api/raw/import', formData, onProgress);
}

// ========================================
// EDGE DETECTION
// ========================================

/**
 * Detect edges on single photo
 */
export async function detectEdges(photoId, { sensitivity = 50, filmFormat = 'auto', sourceType = 'original' } = {}) {
  return postJson(`/api/edge-detection/photos/${photoId}/detect-edges`, {
    sensitivity, filmFormat, sourceType
  });
}

/**
 * Batch edge detection
 */
export async function detectEdgesBatch(photoIds, { sensitivity = 50, filmFormat = 'auto', sourceType = 'original' } = {}) {
  return postJson('/api/edge-detection/photos/batch-detect-edges', {
    photoIds, sensitivity, filmFormat, sourceType
  });
}

/**
 * Apply edge detection result to photo
 */
export async function applyEdgeDetection(photoId, { cropRect, rotation = 0, preserveManualCrop = true } = {}) {
  return postJson(`/api/edge-detection/photos/${photoId}/apply-edge-detection`, {
    cropRect, rotation, preserveManualCrop
  });
}

/**
 * Apply edge detection to entire roll
 */
export async function applyEdgeDetectionToRoll(rollId, { sensitivity = 50, filmFormat = 'auto', sourceType = 'original', skipExistingCrop = true } = {}) {
  return postJson(`/api/edge-detection/rolls/${rollId}/apply-edge-detection-to-all`, {
    sensitivity, filmFormat, sourceType, skipExistingCrop
  });
}
