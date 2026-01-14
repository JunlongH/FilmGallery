/**
 * @filmgallery/types
 * Shared TypeScript type definitions for FilmGallery
 * 
 * This package contains all core entity types and API response types
 * used across Desktop (Electron), Mobile (React Native), and Watch apps.
 */

// ============================================
// CORE ENTITIES
// ============================================

/**
 * Photo entity - represents a single photo in a roll
 */
export interface Photo {
  id: number;
  filename: string;
  full_rel_path: string;
  thumb_rel_path?: string | null;
  positive_rel_path?: string | null;
  positive_thumb_rel_path?: string | null;
  negative_rel_path?: string | null;
  date_taken?: string | null;
  camera?: string | null;
  lens?: string | null;
  film?: string | null;
  roll_id?: number | null;
  roll_title?: string | null;
  location_id?: number | null;
  location_name?: string | null;
  caption?: string | null;
  notes?: string | null;
  is_favorite?: boolean | number;
  frame_number?: number | null;
  aperture?: string | null;
  shutter_speed?: string | null;
  iso?: number | null;
  // FilmLab edit parameters (JSON string)
  edit_params?: string | null;
  created_at?: string;
  updated_at?: string;
}

/**
 * Film stock entity - represents a type of film (e.g., Kodak Portra 400)
 */
export interface Film {
  id: number;
  name: string;
  brand?: string | null;
  iso?: number | string | null;
  category?: string | null;
  format?: string | null;
  process?: string | null;
  thumbPath?: string | null;
  thumbnail_url?: string | null;
  created_at?: string;
  updated_at?: string;
}

/**
 * FilmItem entity - represents a physical roll of film in inventory
 */
export interface FilmItem {
  id: number;
  film_id?: number | null;
  title?: string | null;
  status: FilmItemStatus;
  loaded_camera?: string | null;
  camera_equip_id?: number | null;
  loaded_date?: string | null;
  expiration_date?: string | null;
  purchase_date?: string | null;
  purchase_price?: number | null;
  /** JSON string containing array of ShotLog */
  shot_logs?: string | null;
  notes?: string | null;
  created_at: string;
  updated_at: string;
  // Joined from films table
  iso?: string | null;
  film_name?: string | null;
  film_brand?: string | null;
  film_format?: string | null;
  film_type?: string | null;
}

export type FilmItemStatus = 
  | 'available'
  | 'loaded'
  | 'shot'
  | 'developed'
  | 'scanned'
  | 'archived'
  | 'deleted';

/**
 * Roll entity - represents a developed/scanned roll with photos
 */
export interface Roll {
  id: number;
  title: string;
  filmId?: number | null;
  film_item_id?: number | null;
  film_type?: string | null;
  film_name?: string | null;
  film_name_joined?: string | null;
  status?: string | null;
  camera?: string | null;
  lens?: string | null;
  photographer?: string | null;
  start_date?: string | null;
  end_date?: string | null;
  notes?: string | null;
  cover_filename?: string | null;
  cover_thumb_path?: string | null;
  photo_count?: number;
  created_at?: string;
  updated_at?: string;
}

/**
 * ShotLog entry - records a shooting session on a film item
 */
export interface ShotLog {
  date: string;
  count: number;
  lens?: string | null;
  aperture?: number | string | null;
  shutter_speed?: string | null;
  country?: string | null;
  city?: string | null;
  detail_location?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  notes?: string | null;
}

/**
 * Location entity
 */
export interface Location {
  id: number;
  name: string;
  country?: string | null;
  city?: string | null;
  address?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  created_at?: string;
  updated_at?: string;
}

/**
 * Tag entity
 */
export interface Tag {
  id: number;
  name: string;
  color?: string | null;
  photo_count?: number;
  created_at?: string;
}

// ============================================
// EQUIPMENT ENTITIES
// ============================================

/**
 * Camera equipment entity
 */
export interface Camera {
  id: number;
  name: string;
  brand?: string | null;
  model?: string | null;
  type?: CameraType | null;
  mount?: string | null;
  format?: string | null;
  serial_number?: string | null;
  purchase_date?: string | null;
  purchase_price?: number | null;
  notes?: string | null;
  image_path?: string | null;
  is_active?: boolean | number;
  // Specs (JSON or individual fields)
  min_shutter?: string | null;
  max_shutter?: string | null;
  metering_modes?: string | null;
  weight_g?: number | null;
  created_at?: string;
  updated_at?: string;
}

export type CameraType = 
  | 'SLR'
  | 'Rangefinder'
  | 'Point & Shoot'
  | 'TLR'
  | 'Medium Format'
  | 'Large Format'
  | 'Instant'
  | 'Other';

/**
 * Lens equipment entity
 */
export interface Lens {
  id: number;
  name: string;
  brand?: string | null;
  mount?: string | null;
  focal_length?: string | null;
  max_aperture?: string | null;
  min_aperture?: string | null;
  filter_size?: string | null;
  serial_number?: string | null;
  purchase_date?: string | null;
  purchase_price?: number | null;
  notes?: string | null;
  image_path?: string | null;
  is_active?: boolean | number;
  // Specs
  weight_g?: number | null;
  min_focus_distance?: string | null;
  elements?: number | null;
  groups?: number | null;
  created_at?: string;
  updated_at?: string;
}

/**
 * Flash equipment entity
 */
export interface Flash {
  id: number;
  name: string;
  brand?: string | null;
  model?: string | null;
  guide_number?: string | null;
  notes?: string | null;
  image_path?: string | null;
  is_active?: boolean | number;
  created_at?: string;
  updated_at?: string;
}

/**
 * Film format entity
 */
export interface FilmFormat {
  id: number;
  name: string;
  code?: string | null;
  description?: string | null;
}

// ============================================
// FILMLAB / PRESETS
// ============================================

/**
 * FilmLab processing preset
 */
export interface Preset {
  id: number;
  name: string;
  category?: string | null;
  description?: string | null;
  params: FilmLabParams;
  created_at?: string;
  updated_at?: string;
}

/**
 * FilmLab processing parameters
 */
export interface FilmLabParams {
  // Basic adjustments
  exposure?: number;
  contrast?: number;
  highlights?: number;
  shadows?: number;
  whites?: number;
  blacks?: number;
  
  // Color adjustments
  temperature?: number;
  tint?: number;
  saturation?: number;
  vibrance?: number;
  
  // Tone curve
  curve?: CurvePoint[];
  
  // Channel curves
  redCurve?: CurvePoint[];
  greenCurve?: CurvePoint[];
  blueCurve?: CurvePoint[];
  
  // White balance
  whiteBalanceX?: number;
  whiteBalanceY?: number;
  
  // Crop
  cropX?: number;
  cropY?: number;
  cropWidth?: number;
  cropHeight?: number;
  rotation?: number;
  
  // Other
  invert?: boolean;
  autoLevels?: boolean;
}

export interface CurvePoint {
  x: number;
  y: number;
}

// ============================================
// API RESPONSE TYPES
// ============================================

/**
 * Standard API response wrapper
 */
export interface ApiResponse<T> {
  ok: boolean;
  status?: number;
  data?: T;
  error?: string;
  message?: string;
}

/**
 * Paginated list response
 */
export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
}

/**
 * Simple list response (for backwards compatibility)
 */
export type ListResponse<T> = T[] | { rows: T[] } | { items: T[] };

/**
 * Upload response
 */
export interface UploadResponse {
  ok: boolean;
  files?: UploadedFile[];
  error?: string;
}

export interface UploadedFile {
  tmpName: string;
  originalName: string;
  size: number;
  mimetype: string;
}

/**
 * Server config (for mobile/watch apps)
 */
export interface ServerConfig {
  baseURL: string;
  timeout?: number;
}

// ============================================
// STATISTICS TYPES
// ============================================

export interface PhotoStats {
  total_photos: number;
  total_rolls: number;
  photos_by_camera: Record<string, number>;
  photos_by_lens: Record<string, number>;
  photos_by_film: Record<string, number>;
  photos_by_month: { month: string; count: number }[];
  photos_by_year: { year: string; count: number }[];
}

export interface FilmInventoryStats {
  total_items: number;
  by_status: Record<FilmItemStatus, number>;
  by_film: { film_id: number; film_name: string; count: number }[];
  total_value: number;
}

// ============================================
// UTILITY TYPES
// ============================================

/**
 * Make all properties optional recursively
 */
export type DeepPartial<T> = {
  [P in keyof T]?: T[P] extends object ? DeepPartial<T[P]> : T[P];
};

/**
 * Pick only the id field (for references)
 */
export type IdRef<T extends { id: number }> = Pick<T, 'id'>;

/**
 * Create/Update payload type (omit auto-generated fields)
 */
export type CreatePayload<T> = Omit<T, 'id' | 'created_at' | 'updated_at'>;
export type UpdatePayload<T> = Partial<Omit<T, 'id' | 'created_at' | 'updated_at'>>;

// ============================================
// FILTER / QUERY TYPES
// ============================================

export interface PhotoFilters {
  camera?: string | string[];
  lens?: string | string[];
  film?: string | string[];
  photographer?: string | string[];
  location_id?: number | number[];
  year?: string | string[];
  month?: string | string[];
  ym?: string | string[]; // year-month combined
  roll_id?: number;
  is_favorite?: boolean;
  tag_id?: number;
}

export interface RollFilters {
  camera?: string | string[];
  lens?: string | string[];
  film?: string | string[];
  photographer?: string | string[];
  year?: string | string[];
  status?: string;
}

export interface FilmItemFilters {
  status?: FilmItemStatus | FilmItemStatus[];
  film_id?: number;
  includeDeleted?: boolean;
  limit?: number;
  offset?: number;
}

export interface EquipmentFilters {
  type?: string;
  mount?: string;
  brand?: string;
  is_active?: boolean;
  search?: string;
}
