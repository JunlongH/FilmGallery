/**
 * FilmGallery API Client
 * 
 * TypeScript definitions and API functions for the desktop client.
 * Uses @filmgallery/types for shared type definitions.
 * 
 * @module api
 */

import type {
  Photo,
  Film,
  FilmItem,
  Roll,
  Location,
  Tag,
  Camera,
  Lens,
  Flash,
  FilmFormat,
  Preset,
  FilmLabParams,
  PhotoFilters,
  RollFilters,
  FilmItemFilters,
  EquipmentFilters,
  ApiResponse,
  UploadResponse,
  FilmItemStatus,
} from '../../packages/@filmgallery/types/src';

// Re-export types for convenience
export type {
  Photo,
  Film,
  FilmItem,
  Roll,
  Location,
  Tag,
  Camera,
  Lens,
  Flash,
  FilmFormat,
  Preset,
  FilmLabParams,
  PhotoFilters,
  FilmItemStatus,
};

// ============================================
// CONFIGURATION
// ============================================

declare global {
  interface Window {
    __electron?: {
      API_BASE?: string;
    };
    __fgCountriesCache?: {
      loaded: boolean;
      promise: Promise<CountryInfo[]> | null;
      data: CountryInfo[];
    };
  }
}

/**
 * API base URL - uses Electron preload value in production, env var or localhost in dev
 */
export const API_BASE: string = 
  (typeof window !== 'undefined' && window.__electron?.API_BASE) 
    ? window.__electron.API_BASE 
    : (process.env.REACT_APP_API_BASE || 'http://127.0.0.1:4000');

// ============================================
// UTILITY TYPES
// ============================================

export interface UploadProgress {
  index: number;
  total: number;
}

export interface RenderResult {
  ok: boolean;
  blob?: Blob;
  contentType?: string;
  error?: string;
}

export interface CountryInfo {
  country: string;
  count?: number;
}

export interface MetadataOptions {
  cameras: string[];
  lenses: string[];
  photographers: string[];
  films: string[];
}

export interface EquipmentConstants {
  cameraTypes: string[];
  lensMounts: string[];
  focusTypes: string[];
  conditions: string[];
  statuses: string[];
  meterTypes: string[];
  shutterTypes: string[];
  magnificationRatios: string[];
}

export interface FilmConstants {
  categories: string[];
  formats: string[];
  processes: string[];
}

export interface TmpFile {
  tmpName: string;
  isNegative?: boolean;
}

export interface CreateRollFields {
  title?: string;
  filmId?: number;
  camera?: string;
  lens?: string;
  photographer?: string;
  start_date?: string;
  end_date?: string;
  notes?: string;
  isNegative?: boolean;
}

// ============================================
// UTILITY FUNCTIONS
// ============================================

/**
 * Build an absolute URL for an uploaded file value stored in the DB.
 * Handles various path formats including absolute paths, relative paths, and URLs.
 */
export function buildUploadUrl(pathOrUrl: string | null | undefined): string | null {
  if (!pathOrUrl) return null;
  
  // already absolute URL
  if (pathOrUrl.startsWith('http://') || pathOrUrl.startsWith('https://')) {
    return pathOrUrl;
  }
  
  // leading slash -> relative to API_BASE
  if (pathOrUrl.startsWith('/')) {
    return `${API_BASE}${pathOrUrl}`;
  }
  
  // contains 'uploads' somewhere (e.g. Windows full path like D:\...\uploads\rolls\...)
  const lower = pathOrUrl.toLowerCase();
  const idx = lower.indexOf('uploads');
  if (idx !== -1) {
    const sub = pathOrUrl.slice(idx).replace(/\\/g, '/').replace(/^\/+/, '');
    return `${API_BASE}/${sub}`;
  }
  
  // Windows path fallback - use basename
  if (pathOrUrl.indexOf('\\') !== -1 || /^([a-zA-Z]:\\)/.test(pathOrUrl)) {
    const parts = pathOrUrl.split(/[/\\]+/);
    const base = parts[parts.length - 1];
    return `${API_BASE}/uploads/${base}`;
  }
  
  // default: assume value is relative inside uploads
  return `${API_BASE}/uploads/${pathOrUrl.replace(/^\/+/, '')}`;
}

/**
 * Generic JSON fetch wrapper
 */
async function jsonFetch<T = unknown>(url: string, opts: RequestInit = {}): Promise<T> {
  const r = await fetch(`${API_BASE}${url}`, opts);
  const text = await r.text();
  try {
    return JSON.parse(text) as T;
  } catch {
    return text as unknown as T;
  }
}

/**
 * Extract array from various API response formats
 */
function unwrapArray<T>(data: unknown, keys: string[] = ['rows', 'items']): T[] {
  if (Array.isArray(data)) return data as T[];
  if (data && typeof data === 'object') {
    for (const key of keys) {
      const val = (data as Record<string, unknown>)[key];
      if (Array.isArray(val)) return val as T[];
    }
  }
  return [];
}

// ============================================
// UPLOAD API
// ============================================

/**
 * Upload multiple files to tmp for preview
 */
export async function uploadTmpFiles(
  files: File[], 
  onProgress?: (percent: number) => void
): Promise<UploadResponse> {
  const fd = new FormData();
  files.forEach(f => fd.append('files', f));
  
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', `${API_BASE}/api/uploads`);
    
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          resolve(JSON.parse(xhr.responseText));
        } catch {
          resolve({ ok: true, files: [] });
        }
      } else {
        reject(new Error(xhr.statusText || 'Upload failed'));
      }
    };
    
    xhr.onerror = () => reject(new Error('Upload network error'));
    
    if (xhr.upload && onProgress) {
      xhr.upload.onprogress = (ev) => {
        if (ev.lengthComputable) {
          onProgress(Math.round(ev.loaded / ev.total * 100));
        }
      };
    }
    
    xhr.send(fd);
  });
}

// ============================================
// ROLL API
// ============================================

/**
 * Create roll (multipart direct create)
 */
export async function createRollMultipart(options: {
  fields?: CreateRollFields;
  files?: File[];
  onProgress?: (percent: number) => void;
} = {}): Promise<Roll> {
  const { fields = {}, files = [], onProgress } = options;
  const fd = new FormData();
  
  Object.entries(fields).forEach(([k, v]) => {
    if (v !== undefined && v !== null) {
      fd.append(k, String(v));
    }
  });
  
  files.forEach(f => fd.append('files', f));
  
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', `${API_BASE}/api/rolls`);
    
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          resolve(JSON.parse(xhr.responseText));
        } catch {
          reject(new Error('Invalid response'));
        }
      } else {
        reject(new Error(xhr.statusText || 'Create roll failed'));
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
    
    xhr.send(fd);
  });
}

/**
 * Create roll using previously uploaded tmp files
 */
export async function createRollWithTmp(options: {
  fields?: CreateRollFields;
  tmpFiles?: TmpFile[];
  coverIndex?: number;
} = {}): Promise<Roll> {
  const { fields = {}, tmpFiles = [], coverIndex = 0 } = options;
  const payload = { ...fields, tmpFiles, coverIndex };
  
  const res = await fetch(`${API_BASE}/api/rolls`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  
  return res.json();
}

/**
 * Unified roll creation pipeline
 */
export async function createRollUnified(options: {
  fields?: CreateRollFields;
  files?: File[];
  useTwoStep?: boolean;
  isNegative?: boolean;
  onProgress?: (percent: number) => void;
} = {}): Promise<Roll> {
  const { fields = {}, files = [], useTwoStep = false, isNegative = false, onProgress } = options;
  
  if (useTwoStep) {
    const uploaded = await uploadTmpFiles(files, onProgress);
    const tmpFiles: TmpFile[] = (uploaded.files || []).map(f => ({ 
      tmpName: f.tmpName, 
      isNegative 
    }));
    return createRollWithTmp({ 
      fields: { ...fields, isNegative }, 
      tmpFiles 
    });
  }
  
  return createRollMultipart({ 
    fields: { ...fields, isNegative }, 
    files, 
    onProgress 
  });
}

/**
 * Get rolls with optional filters
 */
export async function getRolls(filters: RollFilters = {}): Promise<Roll[]> {
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
  return unwrapArray<Roll>(data, ['rows', 'rolls']);
}

/**
 * Get a single roll by ID
 */
export async function getRoll(id: number): Promise<Roll> {
  return jsonFetch<Roll>(`/api/rolls/${id}`);
}

/**
 * Get locations for a roll
 */
export async function getRollLocations(rollId: number): Promise<Location[]> {
  return jsonFetch<Location[]>(`/api/rolls/${rollId}/locations`);
}

/**
 * Update a roll
 */
export async function updateRoll(id: number, data: Partial<Roll>): Promise<ApiResponse<Roll>> {
  const resp = await fetch(`${API_BASE}/api/rolls/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  });
  
  const ct = resp.headers.get('content-type') || '';
  if (ct.includes('application/json')) {
    return resp.json();
  }
  
  const text = await resp.text();
  return { ok: resp.ok, status: resp.status, message: text };
}

/**
 * Delete a roll
 */
export async function deleteRoll(id: number): Promise<ApiResponse<void>> {
  const resp = await fetch(`${API_BASE}/api/rolls/${id}`, { method: 'DELETE' });
  const ct = resp.headers.get('content-type') || '';
  
  if (ct.includes('application/json')) {
    return resp.json();
  }
  
  const text = await resp.text();
  return { ok: resp.ok, status: resp.status, message: text };
}

/**
 * Set roll cover image
 */
export async function setRollCover(
  rollId: number, 
  options: { photoId?: number; filename?: string } = {}
): Promise<ApiResponse<Roll>> {
  const payload: { photoId?: number; filename?: string } = {};
  if (options.photoId) payload.photoId = options.photoId;
  if (options.filename) payload.filename = options.filename;
  
  const res = await fetch(`${API_BASE}/api/rolls/${rollId}/cover`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  
  const ct = res.headers.get('content-type') || '';
  if (ct.includes('application/json')) {
    return res.json();
  }
  
  const text = await res.text();
  return { ok: res.ok, status: res.status, message: text };
}

// ============================================
// PHOTO API
// ============================================

/**
 * Get photos for a roll
 */
export async function getPhotos(rollId: number): Promise<Photo[]> {
  const data = await jsonFetch<Photo[]>(`/api/rolls/${rollId}/photos`);
  
  // Normalize paths to prefer positive variants
  return (Array.isArray(data) ? data : []).map(p => ({
    ...p,
    full_rel_path: p.positive_rel_path || p.full_rel_path || '',
    thumb_rel_path: p.positive_thumb_rel_path || p.thumb_rel_path || null,
  }));
}

/**
 * Search photos with filters
 */
export async function searchPhotos(filters: PhotoFilters = {}): Promise<Photo[]> {
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
  const data = await jsonFetch<Photo[]>(`/api/photos${qs ? '?' + qs : ''}`);
  
  return (Array.isArray(data) ? data : []).map(p => ({
    ...p,
    full_rel_path: p.positive_rel_path || p.full_rel_path || '',
    thumb_rel_path: p.positive_thumb_rel_path || p.thumb_rel_path || null,
  }));
}

/**
 * Upload a photo to a roll
 */
export async function uploadPhotoToRoll(
  rollId: number, 
  file: File, 
  fields: Record<string, unknown> = {}
): Promise<Photo> {
  const fd = new FormData();
  
  Object.entries(fields).forEach(([k, v]) => {
    if (v !== undefined && v !== null) {
      fd.append(k, String(v));
    }
  });
  
  fd.append('image', file);
  
  const resp = await fetch(`${API_BASE}/api/rolls/${rollId}/photos`, { 
    method: 'POST', 
    body: fd 
  });
  
  return resp.json();
}

/**
 * Upload multiple photos to a roll
 */
export async function uploadPhotosToRoll(options: {
  rollId: number;
  files?: File[];
  onProgress?: (progress: UploadProgress) => void;
  isNegative?: boolean;
}): Promise<Array<Photo | { error: string }>> {
  const { rollId, files = [], onProgress, isNegative = false } = options;
  const results: Array<Photo | { error: string }> = [];
  const total = files.length;
  
  for (let i = 0; i < total; i++) {
    const f = files[i];
    if (onProgress) {
      onProgress({ index: i + 1, total });
    }
    
    try {
      const res = await uploadPhotoToRoll(rollId, f, { isNegative });
      results.push(res);
    } catch (err) {
      results.push({ 
        error: (err instanceof Error ? err.message : String(err)) 
      });
    }
  }
  
  return results;
}

/**
 * Update a photo
 */
export async function updatePhoto(
  id: number, 
  data: Partial<Photo>
): Promise<ApiResponse<Photo>> {
  const resp = await fetch(`${API_BASE}/api/photos/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  });
  
  const ct = resp.headers.get('content-type') || '';
  if (ct.includes('application/json')) {
    return resp.json();
  }
  
  const text = await resp.text();
  return { ok: resp.ok, status: resp.status, message: text };
}

/**
 * Delete a photo
 */
export async function deletePhoto(id: number): Promise<ApiResponse<void>> {
  const resp = await fetch(`${API_BASE}/api/photos/${id}`, { method: 'DELETE' });
  const ct = resp.headers.get('content-type') || '';
  
  if (ct.includes('application/json')) {
    return resp.json();
  }
  
  const text = await resp.text();
  return { ok: resp.ok, status: resp.status, message: text };
}

/**
 * Get favorite photos
 */
export async function getFavoritePhotos(): Promise<Photo[]> {
  return jsonFetch<Photo[]>(`/api/photos/favorites?t=${Date.now()}`);
}

// ============================================
// FILM API
// ============================================

/**
 * Get all films
 */
export async function getFilms(): Promise<Film[]> {
  const res = await fetch(`${API_BASE}/api/films`);
  const data = await res.json();
  return unwrapArray<Film>(data, ['films']);
}

/**
 * Get film constants
 */
export async function getFilmConstants(): Promise<FilmConstants> {
  return jsonFetch<FilmConstants>('/api/films/constants');
}

/**
 * Create a film
 */
export async function createFilm(options: {
  name: string;
  iso: string | number;
  category: string;
  brand?: string;
  format?: string;
  process?: string;
  thumbFile?: File;
}): Promise<Film> {
  const fd = new FormData();
  fd.append('name', options.name);
  fd.append('iso', String(options.iso));
  fd.append('category', options.category);
  
  if (options.brand) fd.append('brand', options.brand);
  if (options.format) fd.append('format', options.format);
  if (options.process) fd.append('process', options.process);
  if (options.thumbFile) fd.append('thumb', options.thumbFile);
  
  const resp = await fetch(`${API_BASE}/api/films`, { method: 'POST', body: fd });
  return resp.json();
}

/**
 * Update a film
 */
export async function updateFilm(options: {
  id: number;
  name?: string;
  iso?: string | number;
  category?: string;
  brand?: string;
  format?: string;
  process?: string;
  thumbFile?: File;
}): Promise<ApiResponse<Film>> {
  const fd = new FormData();
  
  if (options.name !== undefined) fd.append('name', options.name);
  if (options.iso !== undefined) fd.append('iso', String(options.iso));
  if (options.category !== undefined) fd.append('category', options.category);
  if (options.brand !== undefined) fd.append('brand', options.brand);
  if (options.format !== undefined) fd.append('format', options.format);
  if (options.process !== undefined) fd.append('process', options.process);
  if (options.thumbFile) fd.append('thumb', options.thumbFile);
  
  const resp = await fetch(`${API_BASE}/api/films/${options.id}`, { 
    method: 'PUT', 
    body: fd 
  });
  
  const ct = resp.headers.get('content-type') || '';
  if (ct.includes('application/json')) {
    return resp.json();
  }
  
  const text = await resp.text();
  return { ok: resp.ok, status: resp.status, message: text };
}

/**
 * Delete a film
 */
export async function deleteFilm(id: number): Promise<ApiResponse<void>> {
  const resp = await fetch(`${API_BASE}/api/films/${id}`, { method: 'DELETE' });
  const ct = resp.headers.get('content-type') || '';
  
  if (ct.includes('application/json')) {
    return resp.json();
  }
  
  const text = await resp.text();
  return { ok: resp.ok, status: resp.status, message: text };
}

// ============================================
// FILM ITEMS API
// ============================================

/**
 * Create film items batch
 */
export async function createFilmItemsBatch(
  batch: Record<string, unknown>
): Promise<{ items: FilmItem[] }> {
  const res = await fetch(`${API_BASE}/api/film-items/purchase-batch`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(batch || {}),
  });
  return res.json();
}

/**
 * Get film items with filters
 */
export async function getFilmItems(params: FilmItemFilters = {}): Promise<FilmItem[]> {
  const search = new URLSearchParams();
  
  if (params.status) {
    const v = Array.isArray(params.status) ? params.status : [params.status];
    search.set('status', v.join(','));
  }
  if (params.film_id) search.set('film_id', String(params.film_id));
  if (params.includeDeleted) search.set('includeDeleted', 'true');
  if (params.limit) search.set('limit', String(params.limit));
  if (params.offset) search.set('offset', String(params.offset));
  
  const qs = search.toString();
  return jsonFetch<FilmItem[]>(`/api/film-items${qs ? `?${qs}` : ''}`);
}

/**
 * Get a single film item
 */
export async function getFilmItem(id: number): Promise<FilmItem> {
  return jsonFetch<FilmItem>(`/api/film-items/${id}`);
}

/**
 * Update a film item
 */
export async function updateFilmItem(
  id: number, 
  patch: Partial<FilmItem>
): Promise<ApiResponse<FilmItem>> {
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
    return { 
      ok: res.ok, 
      status: res.status, 
      error: text || (err instanceof Error ? err.message : 'Failed to parse response') 
    };
  }
}

/**
 * Delete a film item
 */
export async function deleteFilmItem(
  id: number, 
  hard = false
): Promise<ApiResponse<void>> {
  const url = hard 
    ? `${API_BASE}/api/film-items/${id}?hard=true` 
    : `${API_BASE}/api/film-items/${id}`;
  const res = await fetch(url, { method: 'DELETE' });
  return res.json();
}

/**
 * Export shot logs as CSV
 */
export async function exportShotLogsCsv(id: number): Promise<Blob> {
  const res = await fetch(`${API_BASE}/api/film-items/${id}/shot-logs/export`);
  
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(text || `Export failed (${res.status})`);
  }
  
  return res.blob();
}

// ============================================
// LOCATION API
// ============================================

/**
 * Get locations
 */
export async function getLocations(options: {
  hasRecords?: boolean;
  country?: string;
  query?: string;
} = {}): Promise<Location[]> {
  const { hasRecords = true, country, query } = options;
  const params = new URLSearchParams();
  
  if (hasRecords) params.append('hasRecords', '1');
  if (country) params.append('country', country);
  if (query) params.append('query', query);
  
  const qs = params.toString();
  return jsonFetch<Location[]>(`/api/locations${qs ? '?' + qs : ''}`);
}

/**
 * Search locations
 */
export async function searchLocations(
  params: Record<string, string> = {}
): Promise<Location[]> {
  const qs = new URLSearchParams(params).toString();
  return jsonFetch<Location[]>(`/api/locations${qs ? '?' + qs : ''}`);
}

/**
 * Get a single location
 */
export async function getLocation(id: number): Promise<Location> {
  return jsonFetch<Location>(`/api/locations/${id}`);
}

/**
 * Get countries list
 */
export async function getCountries(): Promise<CountryInfo[]> {
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

  cache.promise = jsonFetch<CountryInfo[]>('/api/locations/countries')
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

/**
 * Create a location
 */
export async function createLocation(
  data: Partial<Location>
): Promise<Location> {
  const resp = await fetch(`${API_BASE}/api/locations`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  });
  return resp.json();
}

// ============================================
// TAG API
// ============================================

/**
 * Get all tags
 */
export async function getTags(): Promise<Tag[]> {
  return jsonFetch<Tag[]>('/api/tags');
}

/**
 * Get photos for a tag
 */
export async function getTagPhotos(tagId: number | string): Promise<Photo[]> {
  if (!tagId) return [];
  return jsonFetch<Photo[]>(`/api/tags/${encodeURIComponent(tagId)}/photos`);
}

// ============================================
// METADATA API
// ============================================

/**
 * Get metadata options (cameras, lenses, photographers, films)
 */
export async function getMetadataOptions(): Promise<MetadataOptions> {
  return jsonFetch<MetadataOptions>('/api/metadata/options');
}

// ============================================
// PRESET API
// ============================================

/**
 * Get roll preset
 */
export async function getRollPreset(rollId: number): Promise<Preset | null> {
  return jsonFetch<Preset | null>(`/api/rolls/${rollId}/preset`);
}

/**
 * Set roll preset
 */
export async function setRollPreset(
  rollId: number, 
  options: { name: string; params: FilmLabParams }
): Promise<ApiResponse<Preset>> {
  const resp = await fetch(`${API_BASE}/api/rolls/${rollId}/preset`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(options)
  });
  return resp.json();
}

/**
 * Clear roll preset
 */
export async function clearRollPreset(rollId: number): Promise<ApiResponse<void>> {
  const resp = await fetch(`${API_BASE}/api/rolls/${rollId}/preset`, { 
    method: 'DELETE' 
  });
  return resp.json();
}

/**
 * List global presets
 */
export async function listPresets(category?: string): Promise<Preset[]> {
  const q = category ? `?category=${encodeURIComponent(category)}` : '';
  return jsonFetch<Preset[]>(`/api/presets${q}`);
}

/**
 * Create a preset
 */
export async function createPreset(options: {
  name: string;
  category?: string;
  description?: string;
  params: FilmLabParams;
}): Promise<Preset> {
  const resp = await fetch(`${API_BASE}/api/presets`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(options)
  });
  return resp.json();
}

/**
 * Update a preset
 */
export async function updatePreset(
  id: number, 
  options: {
    name?: string;
    category?: string;
    description?: string;
    params?: FilmLabParams;
  }
): Promise<ApiResponse<Preset>> {
  const resp = await fetch(`${API_BASE}/api/presets/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(options)
  });
  return resp.json();
}

/**
 * Delete a preset
 */
export async function deletePreset(id: number): Promise<ApiResponse<void>> {
  const resp = await fetch(`${API_BASE}/api/presets/${id}`, { method: 'DELETE' });
  return resp.json();
}

// ============================================
// FILMLAB API
// ============================================

/**
 * Update positive from negative (save FilmLab edits)
 */
export async function updatePositiveFromNegative(
  photoId: number, 
  blob: Blob
): Promise<ApiResponse<Photo>> {
  const fd = new FormData();
  fd.append('image', blob, 'positive.jpg');
  
  const res = await fetch(`${API_BASE}/api/photos/${photoId}/update-positive`, {
    method: 'PUT',
    body: fd
  });
  
  return res.json();
}

/**
 * Export positive (high-quality server-side export)
 */
export async function exportPositive(
  photoId: number, 
  params: FilmLabParams, 
  options: { format?: 'jpeg' | 'tiff16' } = {}
): Promise<RenderResult> {
  const { format = 'jpeg' } = options;
  
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
  return { ok: res.ok, error: text };
}

/**
 * Render positive (non-destructive, for Save As)
 */
export async function renderPositive(
  photoId: number, 
  params: FilmLabParams, 
  options: { format?: 'jpeg' | 'tiff16' } = {}
): Promise<RenderResult> {
  const { format = 'jpeg' } = options;
  
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
  let err: { error?: string; message?: string };
  try {
    err = JSON.parse(text);
  } catch {
    err = { error: text };
  }
  
  return { ok: false, error: err.error || err.message || text };
}

/**
 * FilmLab preview (server-rendered)
 */
export async function filmlabPreview(options: {
  photoId: number;
  params: FilmLabParams;
  maxWidth?: number;
}): Promise<RenderResult> {
  const { photoId, params, maxWidth = 1400 } = options;
  
  const resp = await fetch(`${API_BASE}/api/filmlab/preview`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ photoId, params, maxWidth })
  });
  
  const ct = resp.headers.get('content-type') || '';
  
  if (ct.startsWith('image/')) {
    const blob = await resp.blob();
    return { ok: true, blob };
  }
  
  const text = await resp.text();
  let err: { error?: string; message?: string };
  try {
    err = JSON.parse(text);
  } catch {
    err = { error: text };
  }
  
  return { ok: false, error: err?.error || err?.message };
}

// ============================================
// EQUIPMENT API
// ============================================

/**
 * Get equipment constants
 */
export async function getEquipmentConstants(): Promise<EquipmentConstants> {
  return jsonFetch<EquipmentConstants>('/api/equipment/constants');
}

/**
 * Get equipment suggestions
 */
export async function getEquipmentSuggestions(): Promise<{
  cameras: Camera[];
  lenses: Lens[];
  flashes: Flash[];
  formats: FilmFormat[];
}> {
  return jsonFetch('/api/equipment/suggestions');
}

/**
 * Get film formats
 */
export async function getFilmFormats(): Promise<FilmFormat[]> {
  return jsonFetch<FilmFormat[]>('/api/equipment/formats');
}

/**
 * Create film format
 */
export async function createFilmFormat(
  data: Partial<FilmFormat>
): Promise<FilmFormat> {
  return jsonFetch<FilmFormat>('/api/equipment/formats', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  });
}

// --- Cameras ---

/**
 * Get cameras
 */
export async function getCameras(
  params: EquipmentFilters = {}
): Promise<Camera[]> {
  const qs = new URLSearchParams(
    Object.entries(params).filter(([_, v]) => v != null).map(([k, v]) => [k, String(v)])
  ).toString();
  return jsonFetch<Camera[]>(`/api/equipment/cameras${qs ? '?' + qs : ''}`);
}

/**
 * Get a single camera
 */
export async function getCamera(id: number): Promise<Camera> {
  return jsonFetch<Camera>(`/api/equipment/cameras/${id}`);
}

/**
 * Create a camera
 */
export async function createCamera(data: Partial<Camera>): Promise<Camera> {
  return jsonFetch<Camera>('/api/equipment/cameras', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  });
}

/**
 * Update a camera
 */
export async function updateCamera(
  id: number, 
  data: Partial<Camera>
): Promise<ApiResponse<Camera>> {
  return jsonFetch<ApiResponse<Camera>>(`/api/equipment/cameras/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  });
}

/**
 * Delete a camera
 */
export async function deleteCamera(
  id: number, 
  hard = false
): Promise<ApiResponse<void>> {
  return jsonFetch<ApiResponse<void>>(
    `/api/equipment/cameras/${id}${hard ? '?hard=true' : ''}`,
    { method: 'DELETE' }
  );
}

/**
 * Upload camera image
 */
export async function uploadCameraImage(
  id: number, 
  file: File
): Promise<ApiResponse<{ image_path: string }>> {
  const fd = new FormData();
  fd.append('image', file);
  
  const res = await fetch(`${API_BASE}/api/equipment/cameras/${id}/image`, {
    method: 'POST',
    body: fd
  });
  
  return res.json();
}

// --- Lenses ---

/**
 * Get lenses
 */
export async function getLenses(params: EquipmentFilters = {}): Promise<Lens[]> {
  const qs = new URLSearchParams(
    Object.entries(params).filter(([_, v]) => v != null).map(([k, v]) => [k, String(v)])
  ).toString();
  return jsonFetch<Lens[]>(`/api/equipment/lenses${qs ? '?' + qs : ''}`);
}

/**
 * Get a single lens
 */
export async function getLens(id: number): Promise<Lens> {
  return jsonFetch<Lens>(`/api/equipment/lenses/${id}`);
}

/**
 * Create a lens
 */
export async function createLens(data: Partial<Lens>): Promise<Lens> {
  return jsonFetch<Lens>('/api/equipment/lenses', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  });
}

/**
 * Update a lens
 */
export async function updateLens(
  id: number, 
  data: Partial<Lens>
): Promise<ApiResponse<Lens>> {
  return jsonFetch<ApiResponse<Lens>>(`/api/equipment/lenses/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  });
}

/**
 * Delete a lens
 */
export async function deleteLens(
  id: number, 
  hard = false
): Promise<ApiResponse<void>> {
  return jsonFetch<ApiResponse<void>>(
    `/api/equipment/lenses/${id}${hard ? '?hard=true' : ''}`,
    { method: 'DELETE' }
  );
}

/**
 * Upload lens image
 */
export async function uploadLensImage(
  id: number, 
  file: File
): Promise<ApiResponse<{ image_path: string }>> {
  const fd = new FormData();
  fd.append('image', file);
  
  const res = await fetch(`${API_BASE}/api/equipment/lenses/${id}/image`, {
    method: 'POST',
    body: fd
  });
  
  return res.json();
}

// --- Flashes ---

/**
 * Get flashes
 */
export async function getFlashes(
  params: EquipmentFilters = {}
): Promise<Flash[]> {
  const qs = new URLSearchParams(
    Object.entries(params).filter(([_, v]) => v != null).map(([k, v]) => [k, String(v)])
  ).toString();
  return jsonFetch<Flash[]>(`/api/equipment/flashes${qs ? '?' + qs : ''}`);
}

/**
 * Get a single flash
 */
export async function getFlash(id: number): Promise<Flash> {
  return jsonFetch<Flash>(`/api/equipment/flashes/${id}`);
}

/**
 * Create a flash
 */
export async function createFlash(data: Partial<Flash>): Promise<Flash> {
  return jsonFetch<Flash>('/api/equipment/flashes', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  });
}

/**
 * Update a flash
 */
export async function updateFlash(
  id: number, 
  data: Partial<Flash>
): Promise<ApiResponse<Flash>> {
  return jsonFetch<ApiResponse<Flash>>(`/api/equipment/flashes/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  });
}

/**
 * Delete a flash
 */
export async function deleteFlash(
  id: number, 
  hard = false
): Promise<ApiResponse<void>> {
  return jsonFetch<ApiResponse<void>>(
    `/api/equipment/flashes/${id}${hard ? '?hard=true' : ''}`,
    { method: 'DELETE' }
  );
}

/**
 * Upload flash image
 */
export async function uploadFlashImage(
  id: number, 
  file: File
): Promise<ApiResponse<{ image_path: string }>> {
  const fd = new FormData();
  fd.append('image', file);
  
  const res = await fetch(`${API_BASE}/api/equipment/flashes/${id}/image`, {
    method: 'POST',
    body: fd
  });
  
  return res.json();
}

/**
 * Get compatible lenses for a camera (based on mount)
 */
export async function getCompatibleLenses(cameraId: number): Promise<Lens[]> {
  return jsonFetch<Lens[]>(`/api/equipment/compatible-lenses/${cameraId}`);
}
