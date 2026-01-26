/**
 * API Client - Core utilities and configuration
 * 
 * Provides base URL, fetch helpers, and common upload functions.
 */

// Prefer 127.0.0.1 over localhost to avoid potential IPv6 issues in packaged builds
// In Electron production, use the API_BASE exposed by preload, otherwise fallback to localhost for dev
export const API_BASE = (typeof window !== 'undefined' && window.__electron?.API_BASE) 
  ? window.__electron.API_BASE 
  : (process.env.REACT_APP_API_BASE || 'http://127.0.0.1:4000');

/**
 * Build an absolute URL for an uploaded file value stored in the DB.
 */
export function buildUploadUrl(pathOrUrl) {
  if (!pathOrUrl) return null;
  // already absolute URL
  if (pathOrUrl.startsWith('http://') || pathOrUrl.startsWith('https://')) return pathOrUrl;
  // leading slash -> relative to API_BASE
  if (pathOrUrl.startsWith('/')) return `${API_BASE}${pathOrUrl}`;
  // contains 'uploads' somewhere (e.g. Windows full path like D:\...\uploads\rolls\...)
  const lower = pathOrUrl.toLowerCase();
  const idx = lower.indexOf('uploads');
  if (idx !== -1) {
    // extract from 'uploads' onward and normalize slashes
    const sub = pathOrUrl.slice(idx).replace(/\\/g, '/').replace(/^\/+/, '');
    return `${API_BASE}/${sub}`;
  }
  // Windows path fallback - use basename
  if (pathOrUrl.indexOf('\\') !== -1 || /^([a-zA-Z]:\\)/.test(pathOrUrl)) {
    const parts = pathOrUrl.split(/[/\\]+/);
    const base = parts[parts.length - 1];
    return `${API_BASE}/uploads/${base}`;
  }
  // default: assume value is relative inside uploads (e.g. 'rolls/..')
  return `${API_BASE}/uploads/${pathOrUrl.replace(/^\/+/, '')}`;
}

/**
 * Generic JSON fetch wrapper
 */
export async function jsonFetch(url, opts = {}) {
  const r = await fetch(`${API_BASE}${url}`, opts);
  const text = await r.text();
  try { return JSON.parse(text); } catch { return text; }
}

/**
 * POST JSON data
 */
export async function postJson(url, data) {
  return jsonFetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  });
}

/**
 * PUT JSON data
 */
export async function putJson(url, data) {
  return jsonFetch(url, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  });
}

/**
 * DELETE request
 */
export async function deleteRequest(url) {
  return jsonFetch(url, { method: 'DELETE' });
}

/**
 * Upload file with progress support using XMLHttpRequest
 */
export function uploadWithProgress(url, formData, onProgress) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', `${API_BASE}${url}`);
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try { resolve(JSON.parse(xhr.responseText)); } 
        catch(e) { resolve(xhr.responseText); }
      } else {
        reject(new Error(xhr.statusText || 'Upload failed'));
      }
    };
    xhr.onerror = () => reject(new Error('Network error'));
    if (xhr.upload && onProgress) {
      xhr.upload.onprogress = (ev) => {
        if (ev.lengthComputable) {
          onProgress(Math.round(ev.loaded / ev.total * 100));
        }
      };
    }
    xhr.send(formData);
  });
}

/**
 * Upload files to temporary storage for preview
 */
export async function uploadTmpFiles(files, onProgress) {
  const fd = new FormData();
  files.forEach(f => fd.append('files', f));
  return uploadWithProgress('/api/uploads', fd, onProgress);
}

/**
 * Build query string from params object
 */
export function buildQueryString(params) {
  const qs = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== '') {
      qs.append(key, value);
    }
  }
  const str = qs.toString();
  return str ? `?${str}` : '';
}
