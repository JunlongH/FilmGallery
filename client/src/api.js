// src/api.js
// Prefer 127.0.0.1 over localhost to avoid potential IPv6 issues in packaged builds
// In Electron production, use the API_BASE exposed by preload, otherwise fallback to localhost for dev
export const API_BASE = (typeof window !== 'undefined' && window.__electron?.API_BASE) 
  ? window.__electron.API_BASE 
  : (process.env.REACT_APP_API_BASE || 'http://127.0.0.1:4000');

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
  // default: assume value is relative inside uploads (e.g. 'rolls/..')
  return `${API_BASE}/uploads/${pathOrUrl.replace(/^\/+/, '')}`;
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

// Unified roll creation pipeline: decides multipart vs tmp-flow based on presence of File objects and useTwoStep flag.
export async function createRollUnified({ fields = {}, files = [], useTwoStep = false, isNegative = false, uploadType = null, onProgress, isOriginal = false } = {}) {
  // Determine effective upload type
  const effectiveUploadType = uploadType || (isNegative ? 'negative' : 'positive');
  const effectiveIsNegative = effectiveUploadType === 'negative';
  
  const augmentedFields = { 
    ...fields, 
    isNegative: effectiveIsNegative, 
    uploadType: effectiveUploadType,
    isOriginal: !!isOriginal
  };
  
  if (useTwoStep) {
    // Upload temp files first
    const uploaded = await uploadTmpFiles(files, p => onProgress && onProgress(p));
    const tmpFiles = (uploaded.files || []).map(f => ({ 
      tmpName: f.tmpName, 
      isNegative: effectiveIsNegative, 
      uploadType: effectiveUploadType,
      isOriginal: !!isOriginal 
    }));
    return createRollWithTmp({ fields: augmentedFields, tmpFiles });
  }
  return createRollMultipart({ fields: augmentedFields, files, onProgress });
}

export async function getRolls(filters = {}) {
  const params = new URLSearchParams();
  Object.entries(filters).forEach(([k, v]) => {
    if (v === undefined || v === null) return;
    if (Array.isArray(v)) {
      v.filter(Boolean).forEach(item => params.append(k, item));
    } else if (v !== '') {
      params.append(k, v);
    }
  });
  const qs = params.toString();
  const url = qs ? `/api/rolls?${qs}` : '/api/rolls';
  const data = await jsonFetch(url);
  if (Array.isArray(data)) return data;
  if (data && Array.isArray(data.rows)) return data.rows;
  if (data && Array.isArray(data.rolls)) return data.rolls;
  return [];
}
export async function getRoll(id) {
  return jsonFetch(`/api/rolls/${id}`);
}
export async function getRollLocations(rollId) {
  return jsonFetch(`/api/rolls/${rollId}/locations`);
}
export async function getLocations({ hasRecords = true, country, query } = {}) {
  const params = new URLSearchParams();
  if (hasRecords) params.append('hasRecords', '1');
  if (country) params.append('country', country);
  if (query) params.append('query', query);
  const qs = params.toString();
  return jsonFetch(`/api/locations${qs ? '?' + qs : ''}`);
}
export async function getMetadataOptions() {
  return jsonFetch('/api/metadata/options');
}
export async function getPhotos(rollId) {
  const data = await jsonFetch(`/api/rolls/${rollId}/photos`);
  // Normalize paths to prefer positive variants
  return (Array.isArray(data) ? data : []).map(p => ({
    ...p,
    full_rel_path: p.positive_rel_path || p.full_rel_path || null,
    thumb_rel_path: p.positive_thumb_rel_path || p.thumb_rel_path || null,
  }));
}
export async function searchPhotos(filters = {}) {
  const params = new URLSearchParams();
  Object.entries(filters).forEach(([k, v]) => {
    if (v === undefined || v === null) return;
    if (Array.isArray(v)) v.filter(Boolean).forEach(item => params.append(k, item));
    else if (v !== '') params.append(k, v);
  });
  const qs = params.toString();
  const data = await jsonFetch(`/api/photos${qs ? '?' + qs : ''}`);
  return (Array.isArray(data) ? data : []).map(p => ({
    ...p,
    full_rel_path: p.positive_rel_path || p.full_rel_path || null,
    thumb_rel_path: p.positive_thumb_rel_path || p.thumb_rel_path || null,
  }));
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
// an object { index, total, percent, message } before each file upload starts.
// uploadType: 'positive' | 'negative' | 'original'
export async function uploadPhotosToRoll({ rollId, files = [], onProgress, isNegative = false, uploadType = null }) {
  const results = [];
  const total = Array.isArray(files) ? files.length : 0;
  
  // Determine upload parameters based on uploadType
  const effectiveUploadType = uploadType || (isNegative ? 'negative' : 'positive');
  const effectiveIsNegative = effectiveUploadType === 'negative';
  
  for (let i = 0; i < total; i++) {
    const f = files[i];
    if (onProgress && typeof onProgress === 'function') {
      onProgress({ 
        index: i + 1, 
        total, 
        percent: Math.round(((i + 1) / total) * 100),
        message: `上传 ${f.name || 'file'}...`
      });
    }
    try {
      // reuse single-file upload helper
      // await ensures sequential uploads which is friendlier to some servers
      // and keeps ordering predictable.
      // eslint-disable-next-line no-await-in-loop
      const res = await uploadPhotoToRoll(rollId, f, { 
        isNegative: effectiveIsNegative,
        uploadType: effectiveUploadType
      });
      results.push(res);
    } catch (err) {
      results.push({ error: (err && err.message) || String(err) });
    }
  }
  return results;
}

// Films API
export async function getFilms(noCache = false) {
  const url = noCache 
    ? `${API_BASE}/api/films?_t=${Date.now()}` 
    : `${API_BASE}/api/films`;
  const res = await fetch(url, noCache ? { cache: 'no-store' } : {});
  const data = await res.json();
  // 防御性处理：确保返回数组
  if (Array.isArray(data)) return data;
  if (data && Array.isArray(data.films)) return data.films;
  return [];
}

export async function getFilmConstants() {
  return jsonFetch('/api/films/constants');
}

// FilmItems API
export async function createFilmItemsBatch(batch) {
  const res = await fetch(`${API_BASE}/api/film-items/purchase-batch`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(batch || {}),
  });
  return res.json();
}

export async function getFilmItems(params = {}) {
  const search = new URLSearchParams();
  if (params.status) {
    const v = Array.isArray(params.status) ? params.status : String(params.status).split(',');
    search.set('status', v.join(','));
  }
  if (params.film_id) search.set('film_id', params.film_id);
  if (params.includeDeleted) search.set('includeDeleted', 'true');
  if (params.limit) search.set('limit', String(params.limit));
  if (params.offset) search.set('offset', String(params.offset));
  const qs = search.toString();
  return jsonFetch(`/api/film-items${qs ? `?${qs}` : ''}`);
}

export async function getFilmItem(id) {
  return jsonFetch(`/api/film-items/${id}`);
}

export async function updateFilmItem(id, patch) {
  const res = await fetch(`${API_BASE}/api/film-items/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(patch || {}),
  });
  try {
    const data = await res.json();
    if (typeof data === 'object' && data !== null) {
      if (!Object.prototype.hasOwnProperty.call(data, 'ok')) {
        return { ok: res.ok, status: res.status, ...data };
      }
      return data;
    }
    return { ok: res.ok, status: res.status, data };
  } catch (err) {
    const text = await res.text().catch(() => '');
    return { ok: res.ok, status: res.status, error: text || err.message || 'Failed to parse response' };
  }
}

export async function deleteFilmItem(id, hard = false) {
  const url = hard ? `${API_BASE}/api/film-items/${id}?hard=true` : `${API_BASE}/api/film-items/${id}`;
  const res = await fetch(url, { method: 'DELETE' });
  return res.json();
}

export async function exportShotLogsCsv(id) {
  const res = await fetch(`${API_BASE}/api/film-items/${id}/shot-logs/export`);
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(text || `Export failed (${res.status})`);
  }
  const blob = await res.blob();
  return blob;
}

export async function createFilm({ name, iso, category, brand, format, process, thumbFile }) {
  const fd = new FormData();
  fd.append('name', name);
  fd.append('iso', iso);
  fd.append('category', category);
  if (brand) fd.append('brand', brand);
  if (format) fd.append('format', format);
  if (process) fd.append('process', process);
  if (thumbFile) fd.append('thumb', thumbFile);
  const resp = await fetch(`${API_BASE}/api/films`, { method: 'POST', body: fd });
  return resp.json();
}

export async function updateFilm({ id, name, iso, category, brand, format, process, thumbFile }) {
  const fd = new FormData();
  if (name !== undefined) fd.append('name', name);
  if (iso !== undefined) fd.append('iso', iso);
  if (category !== undefined) fd.append('category', category);
  if (brand !== undefined) fd.append('brand', brand);
  if (format !== undefined) fd.append('format', format);
  if (process !== undefined) fd.append('process', process);
  if (thumbFile) fd.append('thumb', thumbFile);
  const resp = await fetch(`${API_BASE}/api/films/${id}`, { method: 'PUT', body: fd });
  const ct = resp.headers.get('content-type') || '';
  if (ct.includes('application/json')) return resp.json();
  const text = await resp.text();
  return { ok: resp.ok, status: resp.status, text };
}

export async function deleteFilm(id) {
  const resp = await fetch(`${API_BASE}/api/films/${id}`, { method: 'DELETE' });
  const ct = resp.headers.get('content-type') || '';
  if (ct.includes('application/json')) return resp.json();
  const text = await resp.text();
  return { ok: resp.ok, status: resp.status, text };
}

// Upload film thumbnail image
export async function uploadFilmImage(id, file) {
  const fd = new FormData();
  fd.append('thumb', file);
  const resp = await fetch(`${API_BASE}/api/films/${id}`, { method: 'PUT', body: fd });
  if (!resp.ok) {
    throw new Error(`Upload failed: ${resp.status}`);
  }
  return resp.json();
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

// Roll preset management
export async function getRollPreset(rollId) {
  return jsonFetch(`/api/rolls/${rollId}/preset`);
}

export async function setRollPreset(rollId, { name, params }) {
  const resp = await fetch(`${API_BASE}/api/rolls/${rollId}/preset`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, params })
  });
  return resp.json();
}

export async function clearRollPreset(rollId) {
  const resp = await fetch(`${API_BASE}/api/rolls/${rollId}/preset`, { method: 'DELETE' });
  return resp.json();
}

// Global presets (Film Lab)
export async function listPresets(category) {
  const q = category ? `?category=${encodeURIComponent(category)}` : '';
  return jsonFetch(`/api/presets${q}`);
}

export async function createPreset({ name, category, description, params }) {
  const resp = await fetch(`${API_BASE}/api/presets`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, category, description, params })
  });
  return resp.json();
}

export async function updatePreset(id, { name, category, description, params }) {
  const resp = await fetch(`${API_BASE}/api/presets/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, category, description, params })
  });
  return resp.json();
}

export async function deletePreset(id) {
  const resp = await fetch(`${API_BASE}/api/presets/${id}`, { method: 'DELETE' });
  return resp.json();
}

export async function updatePhoto(id, data) {
  console.log('[API] updatePhoto called:', { id, data });
  const resp = await fetch(`${API_BASE}/api/photos/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  });
  console.log('[API] updatePhoto response status:', resp.status);
  const ct = resp.headers.get('content-type') || '';
  if (ct.includes('application/json')) {
    const result = await resp.json();
    console.log('[API] updatePhoto response:', result);
    if (!resp.ok) {
      console.error('[API] updatePhoto error response:', result);
    }
    return result;
  }
  const text = await resp.text();
  console.log('[API] updatePhoto response (text):', text);
  return { ok: resp.ok, status: resp.status, text };
}

export async function searchLocations(params = {}) {
  const qs = new URLSearchParams(params).toString();
  return jsonFetch(`/api/locations${qs ? '?' + qs : ''}`);
}

export async function getLocation(id) {
  return jsonFetch(`/api/locations/${id}`);
}

export async function getCountries() {
  // Simple in-memory cache for large, rarely-changing country list
  if (!window.__fgCountriesCache) {
    window.__fgCountriesCache = {
      loaded: false,
      promise: null,
      data: [],
    };
  }
  const cache = window.__fgCountriesCache;
  if (cache.loaded && Array.isArray(cache.data) && cache.data.length) {
    return cache.data;
  }
  if (cache.promise) return cache.promise;

  cache.promise = jsonFetch('/api/locations/countries')
    .then(rows => {
      cache.loaded = true;
      cache.data = Array.isArray(rows) ? rows : [];
      return cache.data;
    })
    .catch(err => {
      cache.promise = null;
      throw err;
    });

  return cache.promise;
}

export async function createLocation(data) {
  const resp = await fetch(`${API_BASE}/api/locations`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  });
  return resp.json();
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

// High-quality server-side export using original scan
// params: object matching FilmLab preset shape subset
export async function exportPositive(photoId, params, { format = 'jpeg' } = {}) {
  const res = await fetch(`${API_BASE}/api/photos/${photoId}/export-positive`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ params, format })
  });
  const ct = res.headers.get('content-type') || '';
  if (ct.includes('application/json')) {
    return res.json();
  }
  if (ct.startsWith('image/')) {
    const blob = await res.blob();
    return { ok: true, blob, contentType: ct };
  }
  const text = await res.text();
  return { ok: res.ok, status: res.status, error: text };
}

// Ad-hoc render (non-destructive) for Save As
// Returns blob for jpeg or tiff16 without updating DB
export async function renderPositive(photoId, params, { format = 'jpeg' } = {}) {
  const resp = await fetch(`${API_BASE}/api/photos/${photoId}/render-positive`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ params, format })
  });
  const ct = resp.headers.get('content-type') || '';
  if (ct.startsWith('image/')) {
    const blob = await resp.blob();
    return { ok: true, blob, contentType: ct };
  }
  const text = await resp.text();
  let err;
  try { err = JSON.parse(text); } catch { err = { error: text }; }
  return { ok: false, error: err.error || err.message || text };
}

// Film Lab preview (server-rendered)
export async function filmlabPreview({ photoId, params, maxWidth = 1400 }) {
  console.log('[API] filmlabPreview request:', { photoId, params, maxWidth });
  const resp = await fetch(`${API_BASE}/api/filmlab/preview`, {
    method: 'POST',
    headers: { 
      'Content-Type': 'application/json',
      'Cache-Control': 'no-cache'
    },
    body: JSON.stringify({ photoId, params, maxWidth }),
    cache: 'no-store'
  });
  const ct = resp.headers.get('content-type') || '';
  if (ct.startsWith('image/')) {
    const blob = await resp.blob();
    console.log('[API] filmlabPreview received image blob:', blob.size, 'bytes');
    return { ok: true, blob };
  }
  const text = await resp.text();
  let err;
  try { err = JSON.parse(text); } catch { err = { error: text }; }
  console.error('[API] filmlabPreview error:', err);
  return { ok: false, error: err && (err.error || err.message) };
}

// ========================================
// EQUIPMENT MANAGEMENT API
// ========================================

// Get equipment constants (camera types, lens mounts, etc.)
export async function getEquipmentConstants() {
  return jsonFetch('/api/equipment/constants');
}

// Get all equipment suggestions (cameras, lenses, flashes, formats)
export async function getEquipmentSuggestions() {
  return jsonFetch('/api/equipment/suggestions');
}

// Film Formats
export async function getFilmFormats() {
  return jsonFetch('/api/equipment/formats');
}

export async function createFilmFormat(data) {
  return jsonFetch('/api/equipment/formats', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  });
}

// Cameras
export async function getCameras(params = {}, noCache = false) {
  const qs = new URLSearchParams(params);
  if (noCache) qs.set('_t', Date.now());
  const qsStr = qs.toString();
  const url = `/api/equipment/cameras${qsStr ? '?' + qsStr : ''}`;
  const opts = noCache ? { cache: 'no-store' } : {};
  const r = await fetch(`${API_BASE}${url}`, opts);
  const text = await r.text();
  try { return JSON.parse(text); } catch { return text; }
}

export async function getCamera(id) {
  return jsonFetch(`/api/equipment/cameras/${id}`);
}

export async function createCamera(data) {
  return jsonFetch('/api/equipment/cameras', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  });
}

export async function updateCamera(id, data) {
  return jsonFetch(`/api/equipment/cameras/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  });
}

export async function deleteCamera(id, hard = false) {
  return jsonFetch(`/api/equipment/cameras/${id}${hard ? '?hard=true' : ''}`, {
    method: 'DELETE'
  });
}

export async function uploadCameraImage(id, file) {
  const fd = new FormData();
  fd.append('image', file);
  const res = await fetch(`${API_BASE}/api/equipment/cameras/${id}/image`, {
    method: 'POST',
    body: fd
  });
  if (!res.ok) {
    throw new Error(`Upload failed: ${res.status}`);
  }
  return res.json();
}

// Lenses
export async function getLenses(params = {}, noCache = false) {
  const qs = new URLSearchParams(params);
  if (noCache) qs.set('_t', Date.now());
  const qsStr = qs.toString();
  const url = `/api/equipment/lenses${qsStr ? '?' + qsStr : ''}`;
  const opts = noCache ? { cache: 'no-store' } : {};
  const r = await fetch(`${API_BASE}${url}`, opts);
  const text = await r.text();
  try { return JSON.parse(text); } catch { return text; }
}

export async function getLens(id) {
  return jsonFetch(`/api/equipment/lenses/${id}`);
}

export async function createLens(data) {
  return jsonFetch('/api/equipment/lenses', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  });
}

export async function updateLens(id, data) {
  return jsonFetch(`/api/equipment/lenses/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  });
}

export async function deleteLens(id, hard = false) {
  return jsonFetch(`/api/equipment/lenses/${id}${hard ? '?hard=true' : ''}`, {
    method: 'DELETE'
  });
}

export async function uploadLensImage(id, file) {
  const fd = new FormData();
  fd.append('image', file);
  const res = await fetch(`${API_BASE}/api/equipment/lenses/${id}/image`, {
    method: 'POST',
    body: fd
  });
  if (!res.ok) {
    throw new Error(`Upload failed: ${res.status}`);
  }
  return res.json();
}

// Flashes
export async function getFlashes(params = {}, noCache = false) {
  const qs = new URLSearchParams(params);
  if (noCache) qs.set('_t', Date.now());
  const qsStr = qs.toString();
  const url = `/api/equipment/flashes${qsStr ? '?' + qsStr : ''}`;
  const opts = noCache ? { cache: 'no-store' } : {};
  const r = await fetch(`${API_BASE}${url}`, opts);
  const text = await r.text();
  try { return JSON.parse(text); } catch { return text; }
}

export async function getFlash(id) {
  return jsonFetch(`/api/equipment/flashes/${id}`);
}

export async function createFlash(data) {
  return jsonFetch('/api/equipment/flashes', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  });
}

export async function updateFlash(id, data) {
  return jsonFetch(`/api/equipment/flashes/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  });
}

export async function deleteFlash(id, hard = false) {
  return jsonFetch(`/api/equipment/flashes/${id}${hard ? '?hard=true' : ''}`, {
    method: 'DELETE'
  });
}

export async function uploadFlashImage(id, file) {
  const fd = new FormData();
  fd.append('image', file);
  const res = await fetch(`${API_BASE}/api/equipment/flashes/${id}/image`, {
    method: 'POST',
    body: fd
  });
  if (!res.ok) {
    throw new Error(`Upload failed: ${res.status}`);
  }
  return res.json();
}

// Scanners
export async function getScanners(params = {}, noCache = false) {
  const qs = new URLSearchParams(params);
  if (noCache) qs.set('_t', Date.now());
  const qsStr = qs.toString();
  const url = `/api/equipment/scanners${qsStr ? '?' + qsStr : ''}`;
  const opts = noCache ? { cache: 'no-store' } : {};
  const r = await fetch(`${API_BASE}${url}`, opts);
  const text = await r.text();
  try { return JSON.parse(text); } catch { return text; }
}

export async function getScanner(id) {
  return jsonFetch(`/api/equipment/scanners/${id}`);
}

export async function createScanner(data) {
  return jsonFetch('/api/equipment/scanners', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  });
}

export async function updateScanner(id, data) {
  return jsonFetch(`/api/equipment/scanners/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  });
}

export async function deleteScanner(id, hard = false) {
  return jsonFetch(`/api/equipment/scanners/${id}${hard ? '?permanent=true' : ''}`, {
    method: 'DELETE'
  });
}

export async function uploadScannerImage(id, file) {
  const fd = new FormData();
  fd.append('image', file);
  const res = await fetch(`${API_BASE}/api/equipment/scanners/${id}/image`, {
    method: 'POST',
    body: fd
  });
  if (!res.ok) {
    throw new Error(`Upload failed: ${res.status}`);
  }
  return res.json();
}

// ========================================
// FILM BACKS API
// ========================================

export async function getFilmBacks(params = {}, noCache = false) {
  const qs = new URLSearchParams(params);
  if (noCache) qs.set('_t', Date.now());
  const qsStr = qs.toString();
  const url = `/api/equipment/film-backs${qsStr ? '?' + qsStr : ''}`;
  const opts = noCache ? { cache: 'no-store' } : {};
  const r = await fetch(`${API_BASE}${url}`, opts);
  const text = await r.text();
  try { return JSON.parse(text); } catch { return text; }
}

export async function getFilmBack(id) {
  return jsonFetch(`/api/equipment/film-backs/${id}`);
}

export async function createFilmBack(data) {
  return jsonFetch('/api/equipment/film-backs', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  });
}

export async function updateFilmBack(id, data) {
  return jsonFetch(`/api/equipment/film-backs/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  });
}

export async function deleteFilmBack(id, hard = false) {
  return jsonFetch(`/api/equipment/film-backs/${id}${hard ? '?permanent=true' : ''}`, {
    method: 'DELETE'
  });
}

export async function uploadFilmBackImage(id, file) {
  const fd = new FormData();
  fd.append('image', file);
  const res = await fetch(`${API_BASE}/api/equipment/film-backs/${id}/image`, {
    method: 'POST',
    body: fd
  });
  if (!res.ok) {
    throw new Error(`Upload failed: ${res.status}`);
  }
  return res.json();
}

// Get compatible lenses for a camera (based on mount)
export async function getCompatibleLenses(cameraId) {
  return jsonFetch(`/api/equipment/compatible-lenses/${cameraId}`);
}

// ========================================
// FILM CURVE PROFILES API
// ========================================

/**
 * Get all film curve profiles (built-in + custom)
 * @returns {Promise<Array>} Array of film curve profiles
 */
export async function getFilmCurveProfiles() {
  return jsonFetch('/api/presets/film-curves');
}

/**
 * Create a custom film curve profile
 * @param {Object} profile - Profile data
 * @param {string} profile.name - Profile display name
 * @param {number} profile.gamma - Gamma value (0.5-3.0)
 * @param {number} profile.dMin - Minimum density (0.0-0.5)
 * @param {number} profile.dMax - Maximum density (1.5-4.0)
 * @param {string} [profile.category] - Category (e.g., 'custom', 'color_negative')
 * @returns {Promise<Object>} Created profile
 */
export async function createFilmCurveProfile({ name, gamma, dMin, dMax, category = 'custom' }) {
  const resp = await fetch(`${API_BASE}/api/presets/film-curves`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, gamma, dMin, dMax, category })
  });
  return resp.json();
}

/**
 * Update an existing custom film curve profile
 * @param {number} id - Profile ID
 * @param {Object} data - Updated profile data
 * @returns {Promise<Object>} Updated profile
 */
export async function updateFilmCurveProfile(id, { name, gamma, dMin, dMax, category }) {
  const resp = await fetch(`${API_BASE}/api/presets/film-curves/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, gamma, dMin, dMax, category })
  });
  return resp.json();
}

/**
 * Delete a custom film curve profile
 * @param {number} id - Profile ID
 * @returns {Promise<Object>} Result
 */
export async function deleteFilmCurveProfile(id) {
  const resp = await fetch(`${API_BASE}/api/presets/film-curves/${id}`, { method: 'DELETE' });
  return resp.json();
}

// ============================================================================
// 批量导出 API
// ============================================================================

/**
 * 创建批量导出任务
 * @param {Object} options - 导出选项
 * @param {number} options.rollId - 卷宗 ID
 * @param {number[]} [options.photoIds] - 照片 ID 列表（不传则导出整卷）
 * @param {string} [options.format='JPEG'] - 输出格式
 * @param {number} [options.quality=95] - JPEG 质量
 * @param {number} [options.maxWidth=4000] - 最大宽度
 * @param {string} [options.outputDir] - 输出目录
 * @param {Object} [options.processingParams] - 处理参数
 * @returns {Promise<Object>} 创建的任务信息
 */
export async function createBatchExport(options) {
  const resp = await fetch(`${API_BASE}/api/export/batch`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(options)
  });
  return resp.json();
}

/**
 * 获取所有导出任务
 * @param {Object} [filters] - 过滤条件
 * @param {string} [filters.status] - 按状态过滤
 * @returns {Promise<Object>} 任务列表
 */
export async function getExportJobs(filters = {}) {
  const params = new URLSearchParams();
  if (filters.status) params.append('status', filters.status);
  return jsonFetch(`/api/export/jobs?${params}`);
}

/**
 * 获取单个导出任务详情
 * @param {string} jobId - 任务 ID
 * @returns {Promise<Object>} 任务详情
 */
export async function getExportJob(jobId) {
  return jsonFetch(`/api/export/jobs/${jobId}`);
}

/**
 * 取消导出任务
 * @param {string} jobId - 任务 ID
 * @returns {Promise<Object>} 结果
 */
export async function cancelExportJob(jobId) {
  const resp = await fetch(`${API_BASE}/api/export/jobs/${jobId}`, { method: 'DELETE' });
  return resp.json();
}

/**
 * 暂停导出任务
 * @param {string} jobId - 任务 ID
 * @returns {Promise<Object>} 结果
 */
export async function pauseExportJob(jobId) {
  const resp = await fetch(`${API_BASE}/api/export/jobs/${jobId}/pause`, { method: 'POST' });
  return resp.json();
}

/**
 * 恢复导出任务
 * @param {string} jobId - 任务 ID
 * @returns {Promise<Object>} 结果
 */
export async function resumeExportJob(jobId) {
  const resp = await fetch(`${API_BASE}/api/export/jobs/${jobId}/resume`, { method: 'POST' });
  return resp.json();
}

// ============================================================================
// 批量渲染 API
// ============================================================================

/**
 * 创建批量渲染任务（写入库）
 * @param {Object} options - 配置选项
 * @param {number} options.rollId - 卷 ID
 * @param {string} options.scope - 'selected' | 'all' | 'no-positive'
 * @param {number[]} [options.photoIds] - 照片 ID 列表（scope='selected' 时必填）
 * @param {Object} options.paramsSource - 参数来源
 * @returns {Promise<Object>} { jobId, totalPhotos, status }
 */
export async function createBatchRenderLibrary(options) {
  const resp = await fetch(`${API_BASE}/api/batch-render/library`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(options)
  });
  return resp.json();
}

/**
 * 创建批量渲染任务（下载到目录）
 * @param {Object} options - 配置选项
 * @param {number} options.rollId - 卷 ID
 * @param {string} options.scope - 'selected' | 'all' | 'no-positive'
 * @param {number[]} [options.photoIds] - 照片 ID 列表
 * @param {Object} options.paramsSource - 参数来源
 * @param {string} options.outputDir - 输出目录
 * @param {string} [options.format='jpeg'] - 格式
 * @param {number} [options.quality=95] - 质量
 * @returns {Promise<Object>} { jobId, totalPhotos, outputDir, status }
 */
export async function createBatchRenderDownload(options) {
  const resp = await fetch(`${API_BASE}/api/batch-render/download`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(options)
  });
  return resp.json();
}

/**
 * 获取批量渲染任务进度
 * @param {string} jobId - 任务 ID
 * @returns {Promise<Object>} 进度信息
 */
export async function getBatchRenderProgress(jobId) {
  return jsonFetch(`/api/batch-render/${jobId}/progress`);
}

/**
 * 取消批量渲染任务
 * @param {string} jobId - 任务 ID
 * @returns {Promise<Object>} 结果
 */
export async function cancelBatchRender(jobId) {
  const resp = await fetch(`${API_BASE}/api/batch-render/${jobId}/cancel`, { method: 'POST' });
  return resp.json();
}

/**
 * 暂停批量渲染任务
 * @param {string} jobId - 任务 ID
 * @returns {Promise<Object>} 结果
 */
export async function pauseBatchRender(jobId) {
  const resp = await fetch(`${API_BASE}/api/batch-render/${jobId}/pause`, { method: 'POST' });
  return resp.json();
}

/**
 * 恢复批量渲染任务
 * @param {string} jobId - 任务 ID
 * @returns {Promise<Object>} 结果
 */
export async function resumeBatchRender(jobId) {
  const resp = await fetch(`${API_BASE}/api/batch-render/${jobId}/resume`, { method: 'POST' });
  return resp.json();
}

/**
 * 获取所有批量渲染任务
 * @returns {Promise<Object>} 任务列表
 */
export async function getBatchRenderJobs() {
  return jsonFetch('/api/batch-render/jobs');
}

// ============================================================================
// 批量下载 API
// ============================================================================

/**
 * 创建批量下载任务
 * @param {Object} options - 配置选项
 * @param {number} options.rollId - 卷 ID
 * @param {string} options.scope - 'selected' | 'all'
 * @param {number[]} [options.photoIds] - 照片 ID 列表
 * @param {string} options.type - 'positive' | 'negative' | 'original'
 * @param {string} options.outputDir - 输出目录
 * @param {Object} [options.exif] - EXIF 选项
 * @param {string} [options.namingPattern] - 命名规则
 * @returns {Promise<Object>} { jobId, totalPhotos, availablePhotos, outputDir, status }
 */
export async function createBatchDownload(options) {
  const resp = await fetch(`${API_BASE}/api/batch-download`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(options)
  });
  return resp.json();
}

/**
 * 获取批量下载任务进度
 * @param {string} jobId - 任务 ID
 * @returns {Promise<Object>} 进度信息
 */
export async function getBatchDownloadProgress(jobId) {
  return jsonFetch(`/api/batch-download/${jobId}/progress`);
}

/**
 * 取消批量下载任务
 * @param {string} jobId - 任务 ID
 * @returns {Promise<Object>} 结果
 */
export async function cancelBatchDownload(jobId) {
  const resp = await fetch(`${API_BASE}/api/batch-download/${jobId}/cancel`, { method: 'POST' });
  return resp.json();
}

/**
 * 检查某类型文件的可用性
 * @param {number} rollId - 卷 ID
 * @param {string} type - 'positive' | 'negative' | 'original'
 * @param {string} [scope='all'] - 'selected' | 'all'
 * @param {number[]} [photoIds] - 照片 ID 列表
 * @returns {Promise<Object>} { type, total, available, missing }
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
 * 单张照片下载（带 EXIF）
 * @param {number} photoId - 照片 ID
 * @param {string} [type='positive'] - 'positive' | 'negative' | 'original'
 * @param {boolean} [exif=false] - 是否写入 EXIF
 * @returns {string} 下载 URL
 */
export function getSingleDownloadUrl(photoId, type = 'positive', exif = false) {
  return `${API_BASE}/api/batch-download/single/${photoId}?type=${type}&exif=${exif}`;
}

// ============================================================================
// 外部正片导入 API
// ============================================================================

/**
 * 获取可用的匹配策略
 * @returns {Promise<Object>} { strategies: [...] }
 */
export async function getImportStrategies() {
  return jsonFetch('/api/import/strategies');
}

/**
 * 预览导入匹配结果
 * @param {number} rollId - 卷 ID
 * @param {string[]} filePaths - 导入文件路径列表
 * @param {string} strategy - 匹配策略 'filename' | 'frame' | 'manual'
 * @returns {Promise<Object>} { success, matches, stats, unmatchedPhotos }
 */
export async function previewImport(rollId, filePaths, strategy = 'filename') {
  const resp = await fetch(`${API_BASE}/api/import/preview`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ rollId, filePaths, strategy })
  });
  return resp.json();
}

/**
 * 更新手动匹配
 * @param {number} rollId - 卷 ID
 * @param {Array} matches - 当前匹配结果
 * @param {number} fileIndex - 文件索引
 * @param {number|null} photoId - 照片 ID
 * @returns {Promise<Object>} { success, matches, stats, unmatchedPhotos }
 */
export async function updateManualMatch(rollId, matches, fileIndex, photoId) {
  const resp = await fetch(`${API_BASE}/api/import/manual-match`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ rollId, matches, fileIndex, photoId })
  });
  return resp.json();
}

/**
 * 执行导入
 * @param {number} rollId - 卷 ID
 * @param {Array} matches - 匹配结果
 * @param {string} conflictResolution - 冲突处理 'overwrite' | 'skip'
 * @returns {Promise<Object>} { jobId, status, total }
 */
export async function executeImport(rollId, matches, conflictResolution = 'overwrite') {
  const resp = await fetch(`${API_BASE}/api/import/execute`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ rollId, matches, conflictResolution })
  });
  return resp.json();
}

/**
 * 获取导入任务进度
 * @param {string} jobId - 任务 ID
 * @returns {Promise<Object>} 进度信息
 */
export async function getImportProgress(jobId) {
  return jsonFetch(`/api/import/${jobId}/progress`);
}

/**
 * 取消导入任务
 * @param {string} jobId - 任务 ID
 * @returns {Promise<Object>}
 */
export async function cancelImport(jobId) {
  const resp = await fetch(`${API_BASE}/api/import/${jobId}/cancel`, { method: 'POST' });
  return resp.json();
}

// ============================================================================
// 导出历史 API
// ============================================================================

/**
 * 获取导出历史
 * @param {Object} options
 * @param {number} options.limit - 限制数量
 * @param {number} options.offset - 偏移量
 * @param {number} options.rollId - 按卷筛选
 * @param {string} options.jobType - 按类型筛选 ('render' | 'download' | 'import')
 * @returns {Promise<Object>} { history: [...] }
 */
export async function getExportHistory({ limit, offset, rollId, jobType } = {}) {
  const params = new URLSearchParams();
  if (limit) params.append('limit', limit);
  if (offset) params.append('offset', offset);
  if (rollId) params.append('rollId', rollId);
  if (jobType) params.append('jobType', jobType);
  
  const resp = await fetch(`${API_BASE}/api/export-history?${params}`);
  return resp.json();
}

/**
 * 获取导出统计
 * @returns {Promise<Object>} { stats: [...] }
 */
export async function getExportStats() {
  const resp = await fetch(`${API_BASE}/api/export-history/stats`);
  return resp.json();
}

/**
 * 清理旧历史记录
 * @param {number} keepCount - 保留数量
 * @returns {Promise<Object>} { deleted: number }
 */
export async function cleanupExportHistory(keepCount = 100) {
  const resp = await fetch(`${API_BASE}/api/export-history/cleanup?keepCount=${keepCount}`, {
    method: 'DELETE'
  });
  return resp.json();
}

// ============================================================================
// LUT 库 API
// ============================================================================

/**
 * 获取 LUT 列表
 * @returns {Promise<Object>} { luts: [...] }
 */
export async function listLuts() {
  const resp = await fetch(`${API_BASE}/api/luts`);
  
  // 检查响应内容类型
  const contentType = resp.headers.get('content-type');
  if (!resp.ok) {
    if (contentType && contentType.includes('application/json')) {
      const err = await resp.json();
      throw new Error(err.error || '获取 LUT 列表失败');
    } else {
      throw new Error(`获取 LUT 列表失败: HTTP ${resp.status}`);
    }
  }
  
  return resp.json();
}

/**
 * 上传 LUT 文件
 * @param {File} file - LUT 文件
 * @returns {Promise<Object>} 上传结果
 */
export async function uploadLut(file) {
  const fd = new FormData();
  fd.append('lut', file);  // 字段名必须是 'lut'，与服务端 multer 配置一致
  const resp = await fetch(`${API_BASE}/api/luts/upload`, {
    method: 'POST',
    body: fd
  });
  
  // 检查响应内容类型，避免解析 HTML 错误页面
  const contentType = resp.headers.get('content-type');
  if (!resp.ok) {
    if (contentType && contentType.includes('application/json')) {
      const err = await resp.json();
      throw new Error(err.error || '上传失败');
    } else {
      throw new Error(`上传失败: HTTP ${resp.status}`);
    }
  }
  
  if (!contentType || !contentType.includes('application/json')) {
    throw new Error('服务器返回了非 JSON 响应');
  }
  
  return resp.json();
}

/**
 * 删除 LUT 文件
 * @param {string} name - LUT 文件名
 * @returns {Promise<Object>} 删除结果
 */
export async function deleteLut(name) {
  const resp = await fetch(`${API_BASE}/api/luts/${encodeURIComponent(name)}`, {
    method: 'DELETE'
  });
  
  // 检查响应内容类型
  const contentType = resp.headers.get('content-type');
  if (!resp.ok) {
    if (contentType && contentType.includes('application/json')) {
      const err = await resp.json();
      throw new Error(err.error || '删除 LUT 失败');
    } else {
      throw new Error(`删除 LUT 失败: HTTP ${resp.status}`);
    }
  }
  
  return resp.json();
}

/**
 * 加载并解析 LUT 文件
 * @param {string} name - LUT 文件名
 * @returns {Promise<Object>} { size: number, data: Float32Array }
 */
export async function loadLutFromLibrary(name) {
  const resp = await fetch(`${API_BASE}/api/luts/${encodeURIComponent(name)}`);
  
  if (!resp.ok) {
    // 尝试获取错误信息
    const text = await resp.text();
    if (text.startsWith('<!DOCTYPE') || text.startsWith('<html')) {
      throw new Error(`加载 LUT 失败: HTTP ${resp.status}`);
    }
    throw new Error(`加载 LUT 失败: ${text || 'HTTP ' + resp.status}`);
  }
  
  const text = await resp.text();
  
  // 检查是否是 HTML 错误页面
  if (text.startsWith('<!DOCTYPE') || text.startsWith('<html')) {
    throw new Error('服务器返回了 HTML 页面而非 LUT 文件');
  }
  
  return parseCubeLUT(text);
}

/**
 * 解析 .cube LUT 文件内容
 * @param {string} text - LUT 文件文本内容
 * @returns {Object} { size: number, data: Float32Array }
 */
export function parseCubeLUT(text) {
  const lines = text.split('\n');
  let size = 33; // Default
  const data = [];
  
  for (let line of lines) {
    line = line.trim();
    if (!line || line.startsWith('#')) continue;
    
    if (line.startsWith('LUT_3D_SIZE')) {
      size = parseInt(line.split(/\s+/)[1]);
      continue;
    }
    
    // Data lines
    const parts = line.split(/\s+/).map(parseFloat);
    if (parts.length >= 3 && !isNaN(parts[0])) {
      data.push(parts[0], parts[1], parts[2]);
    }
  }
  
  return { size, data: new Float32Array(data) };
}

// ============================================================================
// Edge Detection API
// ============================================================================

/**
 * 检测单张照片的边缘
 * @param {number} photoId - 照片 ID
 * @param {Object} options - 检测选项
 * @param {number} [options.sensitivity=50] - 灵敏度 (0-100)
 * @param {string} [options.filmFormat='auto'] - 底片格式
 * @param {string} [options.sourceType='original'] - 源类型
 * @returns {Promise<Object>} 检测结果
 */
export async function detectEdges(photoId, { sensitivity = 50, filmFormat = 'auto', sourceType = 'original' } = {}) {
  const resp = await fetch(`${API_BASE}/api/edge-detection/photos/${photoId}/detect-edges`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sensitivity, filmFormat, sourceType })
  });
  return resp.json();
}

/**
 * 批量检测边缘
 * @param {number[]} photoIds - 照片 ID 数组
 * @param {Object} options - 检测选项
 * @returns {Promise<Object>} 检测结果
 */
export async function detectEdgesBatch(photoIds, { sensitivity = 50, filmFormat = 'auto', sourceType = 'original' } = {}) {
  const resp = await fetch(`${API_BASE}/api/edge-detection/photos/batch-detect-edges`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ photoIds, sensitivity, filmFormat, sourceType })
  });
  return resp.json();
}

/**
 * 应用边缘检测结果到照片
 * @param {number} photoId - 照片 ID
 * @param {Object} cropRect - 裁剪区域 {x, y, w, h}
 * @param {number} rotation - 旋转角度
 * @param {boolean} preserveManualCrop - 是否保留现有手动裁剪
 * @returns {Promise<Object>} 应用结果
 */
export async function applyEdgeDetection(photoId, { cropRect, rotation = 0, preserveManualCrop = true } = {}) {
  const resp = await fetch(`${API_BASE}/api/edge-detection/photos/${photoId}/apply-edge-detection`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ cropRect, rotation, preserveManualCrop })
  });
  return resp.json();
}

/**
 * 将边缘检测应用到整卷
 * @param {number} rollId - 卷 ID
 * @param {Object} options - 检测选项
 * @returns {Promise<Object>} 应用结果
 */
export async function applyEdgeDetectionToRoll(rollId, { sensitivity = 50, filmFormat = 'auto', sourceType = 'original', skipExistingCrop = true } = {}) {
  const resp = await fetch(`${API_BASE}/api/edge-detection/rolls/${rollId}/apply-edge-detection-to-all`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sensitivity, filmFormat, sourceType, skipExistingCrop })
  });
  return resp.json();
}

// ============================================================================
// RAW Decoding API
// ============================================================================

/**
 * 获取 RAW 解码器状态
 * @returns {Promise<Object>} 解码器状态
 */
export async function getRawDecoderStatus() {
  const resp = await fetch(`${API_BASE}/api/raw/status`);
  return resp.json();
}

/**
 * 获取支持的 RAW 格式列表
 * @returns {Promise<Object>} 支持的格式
 */
export async function getSupportedRawFormats() {
  const resp = await fetch(`${API_BASE}/api/raw/supported-formats`);
  return resp.json();
}

/**
 * 解码 RAW 文件
 * @param {File} file - RAW 文件
 * @param {Object} options - 解码选项
 * @param {Function} onProgress - 进度回调
 * @returns {Promise<Object>} 解码结果
 */
export async function decodeRawFile(file, options = {}, onProgress) {
  const formData = new FormData();
  formData.append('file', file);
  
  Object.entries(options).forEach(([key, value]) => {
    if (value !== undefined && value !== null) {
      formData.append(key, String(value));
    }
  });

  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', `${API_BASE}/api/raw/decode`);
    
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          resolve(JSON.parse(xhr.responseText));
        } catch (e) {
          resolve(xhr.responseText);
        }
      } else {
        try {
          const err = JSON.parse(xhr.responseText);
          reject(new Error(err.error || 'Decode failed'));
        } catch {
          reject(new Error(xhr.statusText || 'Decode failed'));
        }
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
 * 快速预览 RAW 文件
 * @param {File} file - RAW 文件
 * @returns {Promise<Object>} 预览结果
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
 * 提取 RAW 文件元数据
 * @param {File} file - RAW 文件
 * @returns {Promise<Object>} 元数据
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
 * 导入 RAW 文件到相册
 * @param {File} file - RAW 文件
 * @param {number} rollId - 目标 Roll ID
 * @param {Object} options - 导入选项
 * @param {Function} onProgress - 进度回调
 * @returns {Promise<Object>} 导入结果
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

  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', `${API_BASE}/api/raw/import`);
    
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          resolve(JSON.parse(xhr.responseText));
        } catch (e) {
          resolve(xhr.responseText);
        }
      } else {
        try {
          const err = JSON.parse(xhr.responseText);
          reject(new Error(err.error || 'Import failed'));
        } catch {
          reject(new Error(xhr.statusText || 'Import failed'));
        }
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

