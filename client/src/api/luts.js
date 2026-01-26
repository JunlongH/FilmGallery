/**
 * LUT (Look-Up Table) API
 */

import { API_BASE } from './core';

/**
 * Get LUT list
 */
export async function listLuts() {
  const resp = await fetch(`${API_BASE}/api/luts`);
  
  const contentType = resp.headers.get('content-type');
  if (!resp.ok) {
    if (contentType && contentType.includes('application/json')) {
      const err = await resp.json();
      throw new Error(err.error || 'Failed to get LUT list');
    } else {
      throw new Error(`Failed to get LUT list: HTTP ${resp.status}`);
    }
  }
  
  return resp.json();
}

/**
 * Upload LUT file
 */
export async function uploadLut(file) {
  const fd = new FormData();
  fd.append('lut', file);
  const resp = await fetch(`${API_BASE}/api/luts/upload`, {
    method: 'POST',
    body: fd
  });
  
  const contentType = resp.headers.get('content-type');
  if (!resp.ok) {
    if (contentType && contentType.includes('application/json')) {
      const err = await resp.json();
      throw new Error(err.error || 'Upload failed');
    } else {
      throw new Error(`Upload failed: HTTP ${resp.status}`);
    }
  }
  
  if (!contentType || !contentType.includes('application/json')) {
    throw new Error('Server returned non-JSON response');
  }
  
  return resp.json();
}

/**
 * Delete LUT file
 */
export async function deleteLut(name) {
  const resp = await fetch(`${API_BASE}/api/luts/${encodeURIComponent(name)}`, {
    method: 'DELETE'
  });
  
  const contentType = resp.headers.get('content-type');
  if (!resp.ok) {
    if (contentType && contentType.includes('application/json')) {
      const err = await resp.json();
      throw new Error(err.error || 'Delete LUT failed');
    } else {
      throw new Error(`Delete LUT failed: HTTP ${resp.status}`);
    }
  }
  
  return resp.json();
}

/**
 * Load and parse LUT file from library
 */
export async function loadLutFromLibrary(name) {
  const resp = await fetch(`${API_BASE}/api/luts/${encodeURIComponent(name)}`);
  
  if (!resp.ok) {
    const text = await resp.text();
    if (text.startsWith('<!DOCTYPE') || text.startsWith('<html')) {
      throw new Error(`Load LUT failed: HTTP ${resp.status}`);
    }
    throw new Error(`Load LUT failed: ${text || 'HTTP ' + resp.status}`);
  }
  
  const text = await resp.text();
  
  if (text.startsWith('<!DOCTYPE') || text.startsWith('<html')) {
    throw new Error('Server returned HTML page instead of LUT file');
  }
  
  return parseCubeLUT(text);
}

/**
 * Parse .cube LUT file content
 */
export function parseCubeLUT(text) {
  const lines = text.split('\n');
  let size = 33;
  const data = [];
  
  for (let line of lines) {
    line = line.trim();
    if (!line || line.startsWith('#')) continue;
    
    if (line.startsWith('LUT_3D_SIZE')) {
      size = parseInt(line.split(/\s+/)[1]);
      continue;
    }
    
    const parts = line.split(/\s+/).map(parseFloat);
    if (parts.length >= 3 && !isNaN(parts[0])) {
      data.push(parts[0], parts[1], parts[2]);
    }
  }
  
  return { size, data: new Float32Array(data) };
}
