import axios from 'axios';

// TypeScript interfaces
interface FilmItem {
  id: number;
  film_id: number;
  status: string;
  purchase_date?: string;
  expiration_date?: string;
  notes?: string;
  [key: string]: any;
}

interface FilmItemsResponse {
  ok: boolean;
  items: FilmItem[];
}

interface Film {
  id: number;
  name: string;
  brand?: string;
  iso?: number;
  format?: string;
  [key: string]: any;
}

interface MetadataOptions {
  [key: string]: any;
}

interface Country {
  code: string;
  name: string;
}

interface Location {
  id: number;
  name: string;
  country?: string;
  [key: string]: any;
}

interface FilmItemsParams {
  status?: string | string[];
  film_id?: number | string;
  includeDeleted?: boolean;
  limit?: number;
  offset?: number;
}

interface DeleteOptions {
  hard?: boolean;
}

interface SearchParams {
  [key: string]: any;
}

// NOTE: 尽量与桌面端 client/src/api.js 中的 getFilmItems / getFilmItem 语义保持一致，
// 这样后端改动时只需要同时更新两处 API 封装即可。

export async function getFilmItems(params: FilmItemsParams = {}): Promise<FilmItemsResponse> {
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
  const res = await axios.get(`/api/film-items${qs ? `?${qs}` : ''}`);
  return res.data; // { ok, items }
}

export async function getFilmItem(id: number): Promise<FilmItem> {
  const res = await axios.get(`/api/film-items/${id}`);
  if (res.data && res.data.item) return res.data.item;
  return res.data;
}

export async function updateFilmItem(id: number, patch: Partial<FilmItem>): Promise<FilmItem> {
  const res = await axios.put(`/api/film-items/${id}`, patch || {});
  if (res.data && res.data.item) return res.data.item;
  return res.data;
}

export async function deleteFilmItem(id: number, { hard = false }: DeleteOptions = {}): Promise<any> {
  const params: { hard?: string } = {};
  if (hard) params.hard = 'true';
  const res = await axios.delete(`/api/film-items/${id}`, { params });
  return res.data;
}

// Films API (mobile side, aligned with desktop client/src/api.js)
export async function getFilms(): Promise<Film[]> {
  const res = await axios.get('/api/films');
  const data = res.data;
  if (Array.isArray(data)) return data;
  if (data && Array.isArray(data.films)) return data.films;
  return [];
}

export async function getMetadataOptions(): Promise<MetadataOptions> {
  const res = await axios.get('/api/metadata/options');
  return res.data || {};
}

// Locations (shared with desktop API semantics)
export async function getCountries(): Promise<Country[]> {
  const res = await axios.get('/api/locations/countries');
  return res.data || [];
}

export async function searchLocations(params: SearchParams = {}): Promise<Location[]> {
  const res = await axios.get('/api/locations', { params });
  return res.data || [];
}
