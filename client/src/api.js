// src/api.js
// Prefer 127.0.0.1 over localhost to avoid potential IPv6 issues in packaged builds
export const API_BASE = process.env.REACT_APP_API_BASE || 'http://127.0.0.1:4000';

// Build an absolute URL for an uploaded file value stored in the DB.
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
  // default: treat as relative to API_BASE
  return `${API_BASE}/${pathOrUrl.replace(/^\/+/, '')}`;
}

async function jsonFetch(url, opts = {}) {
  const r = await fetch(`${API_BASE}${url}`, opts);
  const text = await r.text();
  try { return JSON.parse(text); } catch { return text; }
}

// Upload multiple files to tmp for preview
export async function uploadTmpFiles(files, onProgress) {
  const fd = new FormData();
  files.forEach(f => fd.append('files', f));
  // use XMLHttpRequest to support progress
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', `${API_BASE}/api/uploads`);
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try { resolve(JSON.parse(xhr.responseText)); } catch(e){ resolve(xhr.responseText); }
      } else reject(new Error(xhr.statusText || 'Upload failed'));
    };
    xhr.onerror = () => reject(new Error('Upload network error'));
    if (xhr.upload && onProgress) {
      xhr.upload.onprogress = (ev) => {
        if (ev.lengthComputable) onProgress(Math.round(ev.loaded / ev.total * 100));
      };
    }
    xhr.send(fd);
  });
}

// Create roll (multipart direct create)
export async function createRollMultipart({ fields = {}, files = [], onProgress } = {}) {
  const fd = new FormData();
  Object.entries(fields).forEach(([k, v]) => { if (v !== undefined && v !== null) fd.append(k, v); });
  (files || []).forEach(f => fd.append('files', f));
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', `${API_BASE}/api/rolls`);
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try { resolve(JSON.parse(xhr.responseText)); } catch(e){ resolve(xhr.responseText); }
      } else reject(new Error(xhr.statusText || 'Create roll failed'));
    };
    xhr.onerror = () => reject(new Error('Network error'));
    if (xhr.upload && onProgress) xhr.upload.onprogress = (ev) => {
      if (ev.lengthComputable) onProgress(Math.round(ev.loaded / ev.total * 100));
    };
    xhr.send(fd);
  });
}

// Create roll using previously uploaded tmp files
export async function createRollWithTmp({ fields = {}, tmpFiles = [], coverIndex = 0 } = {}) {
  const payload = Object.assign({}, fields, { tmpFiles, coverIndex });
  const res = await fetch(`${API_BASE}/api/rolls`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  return res.json();
}

export async function getRolls() {
  const data = await jsonFetch('/api/rolls');
  if (Array.isArray(data)) return data;
  if (data && Array.isArray(data.rows)) return data.rows;
  if (data && Array.isArray(data.rolls)) return data.rolls;
  return [];
}
export async function getRoll(id) {
  return jsonFetch(`/api/rolls/${id}`);
}
export async function getMetadataOptions() {
  return jsonFetch('/api/metadata/options');
}
export async function getPhotos(rollId) {
  return jsonFetch(`/api/rolls/${rollId}/photos`);
}
export async function uploadPhotoToRoll(rollId, file, fields = {}) {
  const fd = new FormData();
  Object.entries(fields).forEach(([k, v]) => { if (v !== undefined && v !== null) fd.append(k, v); });
  fd.append('image', file);
  const resp = await fetch(`${API_BASE}/api/rolls/${rollId}/photos`, { method: 'POST', body: fd });
  return resp.json();
}

// Upload multiple files to an existing roll. This calls `uploadPhotoToRoll` sequentially
// and returns an array of results. An optional `onProgress` callback receives
// an object { index, total } before each file upload starts.
export async function uploadPhotosToRoll({ rollId, files = [], onProgress, isNegative = false }) {
  const results = [];
  const total = Array.isArray(files) ? files.length : 0;
  for (let i = 0; i < total; i++) {
    const f = files[i];
    if (onProgress && typeof onProgress === 'function') onProgress({ index: i + 1, total });
    try {
      // reuse single-file upload helper
      // await ensures sequential uploads which is friendlier to some servers
      // and keeps ordering predictable.
      // eslint-disable-next-line no-await-in-loop
      const res = await uploadPhotoToRoll(rollId, f, { isNegative });
      results.push(res);
    } catch (err) {
      results.push({ error: (err && err.message) || String(err) });
    }
  }
  return results;
}

// Films API
export async function getFilms() {
  const res = await fetch(`${API_BASE}/api/films`);
  const data = await res.json();
  // 防御性处理：确保返回数组
  if (Array.isArray(data)) return data;
  if (data && Array.isArray(data.films)) return data.films;
  return [];
}

export async function createFilm({ name, iso, category, thumbFile }) {
  const fd = new FormData();
  fd.append('name', name);
  fd.append('iso', iso);
  fd.append('category', category);
  if (thumbFile) fd.append('thumb', thumbFile);
  const resp = await fetch(`${API_BASE}/api/films`, { method: 'POST', body: fd });
  return resp.json();
}

export async function deleteFilm(id) {
  const resp = await fetch(`${API_BASE}/api/films/${id}`, { method: 'DELETE' });
  const ct = resp.headers.get('content-type') || '';
  if (ct.includes('application/json')) return resp.json();
  const text = await resp.text();
  return { ok: resp.ok, status: resp.status, text };
}

export async function deleteRoll(id) {
  const resp = await fetch(`${API_BASE}/api/rolls/${id}`, { method: 'DELETE' });
  const ct = resp.headers.get('content-type') || '';
  if (ct.includes('application/json')) return resp.json();
  const text = await resp.text();
  return { ok: resp.ok, status: resp.status, text };
}

export async function deletePhoto(id) {
  const resp = await fetch(`${API_BASE}/api/photos/${id}`, { method: 'DELETE' });
  const ct = resp.headers.get('content-type') || '';
  if (ct.includes('application/json')) return resp.json();
  const text = await resp.text();
  return { ok: resp.ok, status: resp.status, text };
}

export async function setRollCover(rollId, { photoId, filename } = {}) {
  const payload = {};
  if (photoId) payload.photoId = photoId;
  if (filename) payload.filename = filename;
  const res = await fetch(`${API_BASE}/api/rolls/${rollId}/cover`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  const ct = res.headers.get('content-type') || '';
  if (ct.includes('application/json')) return res.json();
  const text = await res.text();
  return { ok: res.ok, status: res.status, text };
}

export async function updateRoll(id, data) {
  const resp = await fetch(`${API_BASE}/api/rolls/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  });
  const ct = resp.headers.get('content-type') || '';
  if (ct.includes('application/json')) return resp.json();
  const text = await resp.text();
  return { ok: resp.ok, status: resp.status, text };
}

export async function updatePhoto(id, data) {
  const resp = await fetch(`${API_BASE}/api/photos/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  });
  const ct = resp.headers.get('content-type') || '';
  if (ct.includes('application/json')) return resp.json();
  const text = await resp.text();
  return { ok: resp.ok, status: resp.status, text };
}

export async function getFavoritePhotos() {
  return jsonFetch(`/api/photos/favorites?t=${Date.now()}`);
}

export async function getTags() {
  return jsonFetch('/api/tags');
}

export async function getTagPhotos(tagId) {
  if (!tagId) return [];
  return jsonFetch(`/api/tags/${encodeURIComponent(tagId)}/photos`);
}

export async function updatePositiveFromNegative(photoId, blob) {
  const fd = new FormData();
  fd.append('image', blob, 'positive.jpg');
  const res = await fetch(`${API_BASE}/api/photos/${photoId}/update-positive`, {
    method: 'PUT',
    body: fd
  });
  return res.json();
}
