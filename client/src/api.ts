// src/api.ts
// Prefer 127.0.0.1 over localhost to avoid potential IPv6 issues in packaged builds
// In Electron production, use the API_BASE exposed by preload, otherwise fallback to localhost for dev

// TypeScript type declarations
declare global {
  interface Window {
    __electron?: {
      API_BASE?: string;
    };
    __fgCountriesCache?: {
      loaded: boolean;
      promise: Promise<any[]> | null;
      data: any[];
    };
  }
}

// Common interfaces
export interface Photo {
  id: number;
  filename?: string;
  roll_id?: number;
  thumb_rel_path?: string;
  positive_rel_path?: string;
  negative_rel_path?: string;
  rating?: number;
  caption?: string;
  tags?: Array<{ id: number; name: string }>;
  [key: string]: any;
}

export interface Roll {
  id: number;
  title?: string;
  film_id?: number;
  photos?: Photo[];
  [key: string]: any;
}

export interface Film {
  id: number;
  name: string;
  brand?: string;
  iso?: number;
  format?: string;
  category?: string;
  [key: string]: any;
}

export interface FilmItem {
  id: number;
  film_id: number;
  status: string;
  [key: string]: any;
}

export interface Location {
  id: number;
  name?: string;
  city_name?: string;
  country?: string;
  [key: string]: any;
}

export interface Tag {
  id: number;
  name: string;
  photos_count?: number;
}

export interface Camera {
  id: number;
  name: string;
  brand?: string;
  [key: string]: any;
}

export interface Lens {
  id: number;
  name: string;
  brand?: string;
  [key: string]: any;
}

export interface Flash {
  id: number;
  name: string;
  brand?: string;
  [key: string]: any;
}

export interface CompatibleLensesResponse {
  fixed_lens: boolean;
  camera_name: string;
  focal_length?: number | null;
  max_aperture?: string | null;
  camera_mount?: string | null;
  lenses: Lens[];
  adapted_lenses?: Lens[];
}

type FetchOptions = RequestInit;
type ProgressCallback = (progress: number) => void;

interface CreateRollMultipartParams {
  fields?: Record<string, any>;
  files?: File[];
  onProgress?: ProgressCallback;
}

interface CreateRollUnifiedParams {
  fields?: Record<string, any>;
  files?: File[];
  useTwoStep?: boolean;
  isNegative?: boolean;
  onProgress?: ProgressCallback;
}

interface CreateRollWithTmpParams {
  fields?: Record<string, any>;
  tmpFiles?: Array<{ tmpName: string; isNegative?: boolean }>;
  coverIndex?: number;
}

interface GetLocationsParams {
  hasRecords?: boolean;
  country?: string;
  query?: string;
}

interface GetFilmItemsParams {
  status?: string | string[];
  film_id?: string | number;
  includeDeleted?: boolean;
  limit?: number;
  offset?: number;
}

interface UploadPhotosToRollParams {
  rollId: number | string;
  files?: File[];
  onProgress?: (progress: { index: number; total: number }) => void;
  isNegative?: boolean;
}

interface CreateFilmParams {
  name: string;
  iso: string | number;
  category: string;
  brand?: string;
  format?: string;
  process?: string;
  thumbFile?: File;
}

interface UpdateFilmParams {
  id: number | string;
  name?: string;
  iso?: string | number;
  category?: string;
  brand?: string;
  format?: string;
  process?: string;
  thumbFile?: File;
}

export const API_BASE: string = (typeof window !== 'undefined' && window.__electron?.API_BASE) 
  ? window.__electron.API_BASE 
  : (process.env.REACT_APP_API_BASE || 'http://127.0.0.1:4000');

// Build an absolute URL for an uploaded file value stored in the DB.
export function buildUploadUrl(pathOrUrl: string | null | undefined): string | null {
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

async function jsonFetch(url: string, opts: FetchOptions = {}): Promise<any> {
  const r = await fetch(`${API_BASE}${url}`, opts);
  const text = await r.text();
  try { return JSON.parse(text); } catch { return text; }
}

// Upload multiple files to tmp for preview
export async function uploadTmpFiles(files: File[], onProgress?: ProgressCallback): Promise<any> {
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
export async function createRollMultipart({ fields = {}, files = [], onProgress }: CreateRollMultipartParams = {}) {
  const fd = new FormData();
  Object.entries(fields).forEach(([k, v]) => { if (v !== undefined && v !== null) fd.append(k, String(v)); });
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
export async function createRollWithTmp({ fields = {}, tmpFiles = [], coverIndex = 0 }: CreateRollWithTmpParams = {}) {
  const payload = Object.assign({}, fields, { tmpFiles, coverIndex });
  const res = await fetch(`${API_BASE}/api/rolls`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  return res.json();
}

// Unified roll creation pipeline: decides multipart vs tmp-flow based on presence of File objects and useTwoStep flag.
export async function createRollUnified({ fields = {}, files = [], useTwoStep = false, isNegative = false, onProgress }: CreateRollUnifiedParams = {}) {
  if (useTwoStep) {
    // Upload temp files first
    const uploaded = await uploadTmpFiles(files, p => onProgress && onProgress(p));
    const tmpFiles = (uploaded.files || []).map((f: any) => ({ tmpName: f.tmpName, isNegative }));
    return createRollWithTmp({ fields: { ...fields, isNegative }, tmpFiles });
  }
  return createRollMultipart({ fields: { ...fields, isNegative }, files, onProgress });
}

export async function getRolls(filters: Record<string, any> = {}) {
  const params = new URLSearchParams();
  Object.entries(filters).forEach(([k, v]) => {
    if (v === undefined || v === null) return;
    if (Array.isArray(v)) {
      v.filter(Boolean).forEach(item => params.append(k, String(item)));
    } else if (v !== '') {
      params.append(k, String(v));
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
export async function getRoll(id: number | string): Promise<Roll> {
  return jsonFetch(`/api/rolls/${id}`);
}
export async function getRollLocations(rollId: number | string): Promise<Location[]> {
  return jsonFetch(`/api/rolls/${rollId}/locations`);
}
export async function getLocations({ hasRecords = true, country, query }: GetLocationsParams = {}): Promise<Location[]> {
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
export async function getPhotos(rollId: number | string): Promise<Photo[]> {
  const data = await jsonFetch(`/api/rolls/${rollId}/photos`);
  // Normalize paths to prefer positive variants
  return (Array.isArray(data) ? data : []).map(p => ({
    ...p,
    full_rel_path: p.positive_rel_path || p.full_rel_path || null,
    thumb_rel_path: p.positive_thumb_rel_path || p.thumb_rel_path || null,
  }));
}
export async function searchPhotos(filters: Record<string, any> = {}): Promise<Photo[]> {
  const params = new URLSearchParams();
  Object.entries(filters).forEach(([k, v]) => {
    if (v === undefined || v === null) return;
    if (Array.isArray(v)) v.filter(Boolean).forEach(item => params.append(k, String(item)));
    else if (v !== '') params.append(k, String(v));
  });
  const qs = params.toString();
  const data = await jsonFetch(`/api/photos${qs ? '?' + qs : ''}`);
  return (Array.isArray(data) ? data : []).map(p => ({
    ...p,
    full_rel_path: p.positive_rel_path || p.full_rel_path || null,
    thumb_rel_path: p.positive_thumb_rel_path || p.thumb_rel_path || null,
  }));
}
export async function uploadPhotoToRoll(rollId: number | string, file: File, fields: Record<string, any> = {}) {
  const fd = new FormData();
  Object.entries(fields).forEach(([k, v]) => { if (v !== undefined && v !== null) fd.append(k, String(v)); });
  fd.append('image', file);
  const resp = await fetch(`${API_BASE}/api/rolls/${rollId}/photos`, { method: 'POST', body: fd });
  return resp.json();
}

// Upload multiple files to an existing roll. This calls `uploadPhotoToRoll` sequentially
// and returns an array of results. An optional `onProgress` callback receives
// an object { index, total } before each file upload starts.
export async function uploadPhotosToRoll({ rollId, files = [], onProgress, isNegative = false }: UploadPhotosToRollParams) {
  const results: any[] = [];
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
      results.push({ error: (err instanceof Error ? err.message : String(err)) });
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

export async function getFilmConstants() {
  return jsonFetch('/api/films/constants');
}

// FilmItems API
export async function createFilmItemsBatch(batch: any) {
  const res = await fetch(`${API_BASE}/api/film-items/purchase-batch`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(batch || {}),
  });
  return res.json();
}

export interface FilmItemsResponse {
  ok: boolean;
  items: FilmItem[];
  error?: string;
}

export async function getFilmItems(params: GetFilmItemsParams = {}): Promise<FilmItemsResponse> {
  const search = new URLSearchParams();
  if (params.status) {
    const v = Array.isArray(params.status) ? params.status : String(params.status).split(',');
    search.set('status', v.join(','));
  }
  if (params.film_id) search.set('film_id', String(params.film_id));
  if (params.includeDeleted) search.set('includeDeleted', 'true');
  if (params.limit) search.set('limit', String(params.limit));
  if (params.offset) search.set('offset', String(params.offset));
  const qs = search.toString();
  return jsonFetch(`/api/film-items${qs ? `?${qs}` : ''}`);
}

export async function getFilmItem(id: number | string): Promise<FilmItem> {
  return jsonFetch(`/api/film-items/${id}`);
}

export async function updateFilmItem(id: number | string, patch: Partial<FilmItem>) {
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
    return { ok: res.ok, status: res.status, error: text || (err instanceof Error ? err.message : 'Failed to parse response') };
  }
}

export async function deleteFilmItem(id: number | string, hard = false) {
  const url = hard ? `${API_BASE}/api/film-items/${id}?hard=true` : `${API_BASE}/api/film-items/${id}`;
  const res = await fetch(url, { method: 'DELETE' });
  return res.json();
}

export async function exportShotLogsCsv(id: number | string): Promise<Blob> {
  const res = await fetch(`${API_BASE}/api/film-items/${id}/shot-logs/export`);
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(text || `Export failed (${res.status})`);
  }
  const blob = await res.blob();
  return blob;
}

export async function createFilm({ name, iso, category, brand, format, process, thumbFile }: CreateFilmParams) {
  const fd = new FormData();
  fd.append('name', name);
  fd.append('iso', String(iso));
  fd.append('category', category);
  if (brand) fd.append('brand', brand);
  if (format) fd.append('format', format);
  if (process) fd.append('process', process);
  if (thumbFile) fd.append('thumb', thumbFile);
  const resp = await fetch(`${API_BASE}/api/films`, { method: 'POST', body: fd });
  return resp.json();
}

export async function updateFilm({ id, name, iso, category, brand, format, process, thumbFile }: UpdateFilmParams) {
  const fd = new FormData();
  if (name !== undefined) fd.append('name', name);
  if (iso !== undefined) fd.append('iso', String(iso));
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

export async function deleteFilm(id: number | string) {
  const resp = await fetch(`${API_BASE}/api/films/${id}`, { method: 'DELETE' });
  const ct = resp.headers.get('content-type') || '';
  if (ct.includes('application/json')) return resp.json();
  const text = await resp.text();
  return { ok: resp.ok, status: resp.status, text };
}

export async function deleteRoll(id: number | string) {
  const resp = await fetch(`${API_BASE}/api/rolls/${id}`, { method: 'DELETE' });
  const ct = resp.headers.get('content-type') || '';
  if (ct.includes('application/json')) return resp.json();
  const text = await resp.text();
  return { ok: resp.ok, status: resp.status, text };
}

export async function deletePhoto(id: number | string) {
  const resp = await fetch(`${API_BASE}/api/photos/${id}`, { method: 'DELETE' });
  const ct = resp.headers.get('content-type') || '';
  if (ct.includes('application/json')) return resp.json();
  const text = await resp.text();
  return { ok: resp.ok, status: resp.status, text };
}

export async function setRollCover(rollId: number | string, { photoId, filename }: { photoId?: number | string; filename?: string } = {}) {
  const payload: Record<string, any> = {};
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

export async function updateRoll(id: number | string, data: Partial<Roll>) {
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
export async function getRollPreset(rollId: number | string) {
  return jsonFetch(`/api/rolls/${rollId}/preset`);
}

export async function setRollPreset(rollId: number | string, { name, params }: { name: string; params: any }) {
  const resp = await fetch(`${API_BASE}/api/rolls/${rollId}/preset`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, params })
  });
  return resp.json();
}

export async function clearRollPreset(rollId: number | string) {
  const resp = await fetch(`${API_BASE}/api/rolls/${rollId}/preset`, { method: 'DELETE' });
  return resp.json();
}

// Global presets (Film Lab)
export async function listPresets(category?: string) {
  const q = category ? `?category=${encodeURIComponent(category)}` : '';
  return jsonFetch(`/api/presets${q}`);
}

export async function createPreset({ name, category, description, params }: { name: string; category: string; description?: string; params: any }) {
  const resp = await fetch(`${API_BASE}/api/presets`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, category, description, params })
  });
  return resp.json();
}

export async function updatePreset(id: number | string, { name, category, description, params }: { name?: string; category?: string; description?: string; params?: any }) {
  const resp = await fetch(`${API_BASE}/api/presets/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, category, description, params })
  });
  return resp.json();
}

export async function deletePreset(id: number | string) {
  const resp = await fetch(`${API_BASE}/api/presets/${id}`, { method: 'DELETE' });
  return resp.json();
}

export async function updatePhoto(id: number | string, data: Partial<Photo>) {
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

export async function searchLocations(params: Record<string, string> = {}) {
  const qs = new URLSearchParams(params).toString();
  return jsonFetch(`/api/locations${qs ? '?' + qs : ''}`);
}

export async function getLocation(id: number | string): Promise<Location> {
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

export async function createLocation(data: Partial<Location>) {
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

export async function getTagPhotos(tagId: number | string): Promise<Photo[]> {
  if (!tagId) return [];
  return jsonFetch(`/api/tags/${encodeURIComponent(tagId)}/photos`);
}

export async function updatePositiveFromNegative(photoId: number | string, blob: Blob) {
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
export async function exportPositive(photoId: number | string, params: any, { format = 'jpeg' }: { format?: string } = {}) {
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
export async function renderPositive(photoId: number | string, params: any, { format = 'jpeg' }: { format?: string } = {}) {
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
export async function filmlabPreview({ photoId, params, maxWidth = 1400 }: { photoId: number | string; params: any; maxWidth?: number }) {
  console.log('[API] filmlabPreview request:', { photoId, params, maxWidth });
  const resp = await fetch(`${API_BASE}/api/filmlab/preview`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ photoId, params, maxWidth })
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

export async function createFilmFormat(data: any) {
  return jsonFetch('/api/equipment/formats', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  });
}

// Cameras
export async function getCameras(params: Record<string, string> = {}): Promise<Camera[]> {
  const qs = new URLSearchParams(params).toString();
  return jsonFetch(`/api/equipment/cameras${qs ? '?' + qs : ''}`);
}

export async function getCamera(id: number | string): Promise<Camera> {
  return jsonFetch(`/api/equipment/cameras/${id}`);
}

export async function createCamera(data: Partial<Camera>) {
  return jsonFetch('/api/equipment/cameras', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  });
}

export async function updateCamera(id: number | string, data: Partial<Camera>) {
  return jsonFetch(`/api/equipment/cameras/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  });
}

export async function deleteCamera(id: number | string, hard = false) {
  return jsonFetch(`/api/equipment/cameras/${id}${hard ? '?hard=true' : ''}`, {
    method: 'DELETE'
  });
}

export async function uploadCameraImage(id: number | string, file: File) {
  const fd = new FormData();
  fd.append('image', file);
  const res = await fetch(`${API_BASE}/api/equipment/cameras/${id}/image`, {
    method: 'POST',
    body: fd
  });
  return res.json();
}

// Lenses
export async function getLenses(params: Record<string, string> = {}): Promise<Lens[]> {
  const qs = new URLSearchParams(params).toString();
  return jsonFetch(`/api/equipment/lenses${qs ? '?' + qs : ''}`);
}

export async function getLens(id: number | string): Promise<Lens> {
  return jsonFetch(`/api/equipment/lenses/${id}`);
}

export async function createLens(data: Partial<Lens>) {
  return jsonFetch('/api/equipment/lenses', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  });
}

export async function updateLens(id: number | string, data: Partial<Lens>) {
  return jsonFetch(`/api/equipment/lenses/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  });
}

export async function deleteLens(id: number | string, hard = false) {
  return jsonFetch(`/api/equipment/lenses/${id}${hard ? '?hard=true' : ''}`, {
    method: 'DELETE'
  });
}

export async function uploadLensImage(id: number | string, file: File) {
  const fd = new FormData();
  fd.append('image', file);
  const res = await fetch(`${API_BASE}/api/equipment/lenses/${id}/image`, {
    method: 'POST',
    body: fd
  });
  return res.json();
}

// Flashes
export async function getFlashes(params: Record<string, string> = {}): Promise<Flash[]> {
  const qs = new URLSearchParams(params).toString();
  return jsonFetch(`/api/equipment/flashes${qs ? '?' + qs : ''}`);
}

export async function getFlash(id: number | string): Promise<Flash> {
  return jsonFetch(`/api/equipment/flashes/${id}`);
}

export async function createFlash(data: Partial<Flash>) {
  return jsonFetch('/api/equipment/flashes', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  });
}

export async function updateFlash(id: number | string, data: Partial<Flash>) {
  return jsonFetch(`/api/equipment/flashes/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  });
}

export async function deleteFlash(id: number | string, hard = false) {
  return jsonFetch(`/api/equipment/flashes/${id}${hard ? '?hard=true' : ''}`, {
    method: 'DELETE'
  });
}

export async function uploadFlashImage(id: number | string, file: File) {
  const fd = new FormData();
  fd.append('image', file);
  const res = await fetch(`${API_BASE}/api/equipment/flashes/${id}/image`, {
    method: 'POST',
    body: fd
  });
  return res.json();
}

// Get compatible lenses for a camera (based on mount)
export async function getCompatibleLenses(cameraId: number | string): Promise<CompatibleLensesResponse> {
  return jsonFetch(`/api/equipment/compatible-lenses/${cameraId}`);
}

