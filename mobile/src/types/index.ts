/**
 * Mobile App Type Declarations
 * 
 * Re-exports types from @filmgallery/types for use in the mobile app.
 * Provides additional mobile-specific type definitions.
 */

// Re-export shared types
export * from '../../../packages/@filmgallery/types/src/index';

// Mobile-specific types

/** Photo object interface */
export interface Photo {
  id: number;
  roll_id: number;
  filename?: string;
  thumb_rel_path?: string;
  full_rel_path?: string;
  negative_rel_path?: string;
  frame_number?: number | string;
  rating?: number;
  caption?: string;
  tags?: Array<{ id: number; name: string } | string>;
  film_name?: string;
  film_type?: string;
  [key: string]: unknown;
}

/** Roll object interface */
export interface Roll {
  id: number;
  title?: string;
  start_date?: string;
  end_date?: string;
  film_type?: string;
  film_name_joined?: string;
  film_iso_joined?: string;
  iso?: number;
  cover_photo?: string;
  coverPath?: string;
  notes?: string;
  display_camera?: string;
  display_lens?: string;
  filmId?: number;
  [key: string]: unknown;
}

/** Film item interface */
export interface FilmItem {
  id: number;
  film_id?: number;
  status: string;
  expiry_date?: string;
  purchase_channel?: string;
  purchase_vendor?: string;
  purchase_price?: number;
  purchase_shipping_share?: number;
  batch_number?: string;
  label?: string;
  purchase_note?: string;
  develop_lab?: string;
  develop_process?: string;
  develop_price?: number;
  loaded_date?: string;
  loaded_camera?: string;
  loaded_camera_equip_id?: number;
  camera_equip_id?: number;
  iso?: number;
  shot_logs?: string;
  [key: string]: unknown;
}

/** Film definition interface */
export interface Film {
  id: number;
  name?: string;
  brand?: string;
  model?: string;
  iso?: number;
  format?: string;
  category?: string;
  thumbPath?: string;
  thumbUrl?: string;
  [key: string]: unknown;
}

/** Equipment interfaces */
export interface Camera {
  id: number;
  name?: string;
  brand?: string;
  model?: string;
  type?: string;
  camera_type?: string;
  mount?: string;
  has_fixed_lens?: boolean;
  meter_type?: string;
  production_year_start?: number;
  image_path?: string;
  thumbPath?: string;
  [key: string]: unknown;
}

export interface Lens {
  id: number;
  name?: string;
  brand?: string;
  model?: string;
  mount?: string;
  focal_length_min?: number;
  focal_length_max?: number;
  max_aperture?: number;
  max_aperture_tele?: number;
  filter_size?: number;
  is_macro?: number | boolean;
  image_stabilization?: boolean;
  image_path?: string;
  thumbPath?: string;
  [key: string]: unknown;
}

export interface Flash {
  id: number;
  name?: string;
  brand?: string;
  model?: string;
  guide_number?: number;
  ttl_compatible?: boolean;
  image_path?: string;
  thumbPath?: string;
  [key: string]: unknown;
}

/** Tag interface */
export interface Tag {
  id: number;
  name: string;
  photos_count?: number;
  cover_thumb?: string;
  cover_full?: string;
  [key: string]: unknown;
}

/** Shot log entry */
export interface ShotLogEntry {
  date: string;
  count: number;
  lens?: string;
  aperture?: number | null;
  shutter_speed?: string;
  country?: string;
  city?: string;
  detail_location?: string;
  latitude?: number | null;
  longitude?: number | null;
}

/** Location diagnostic result */
export interface LocationDiagnostics {
  permissionStatus: string;
  backgroundPermission?: string;
  servicesEnabled: boolean;
  providerStatus?: {
    gpsAvailable: boolean;
    networkAvailable: boolean;
    backgroundModeEnabled: boolean;
  };
}

export interface LocationResult {
  success: boolean;
  source?: string;
  coords?: {
    latitude: number;
    longitude: number;
    accuracy?: number;
    altitude?: number | null;
  };
  error?: string;
  errors?: {
    watch?: string;
    current?: string;
  };
}

/** Snackbar state */
export interface SnackState {
  visible: boolean;
  msg: string;
}

/** Navigation route parameter types */
export interface RootStackParamList {
  Home: undefined;
  RollList: undefined;
  Rolls: undefined;
  RollDetail: { rollId: number; rollName?: string };
  PhotoDetail: { photoId: number; rollId?: number };
  PhotoView: { 
    photo: Photo; 
    rollId: number;
    viewMode?: 'positive' | 'negative';
    photos?: Photo[];
    initialIndex?: number;
  };
  Camera: { rollId: number; filmItemId?: number };
  FilmInventory: undefined;
  Inventory: undefined;
  Equipment: undefined;
  EquipmentRolls: { type: 'camera' | 'lens' | 'flash' | 'film'; id: number; name: string };
  Settings: undefined;
  Statistics: undefined;
  Stats: undefined;
  Locations: undefined;
  LocationDiagnostic: undefined;
  Favorites: undefined;
  Negatives: undefined;
  Films: undefined;
  FilmRolls: { filmId: number; filmName?: string };
  FilmItemDetail: { itemId: number; filmName?: string };
  ShotLog: { itemId: number; filmName?: string; autoOpenShotMode?: boolean };
  Themes: undefined;
  TagDetail: { tagId: number; tagName?: string };
}

/** API connection status */
export interface ConnectionStatus {
  isConnected: boolean;
  currentIp: string | null;
  lastError: string | null;
  lastSuccessTime: Date | null;
}

/** Local storage keys */
export type StorageKey = 
  | 'api_base_url'
  | 'server_ips'
  | 'current_ip_index'
  | 'connection_status'
  | 'user_preferences'
  | 'cached_rolls'
  | 'cached_films';

/** User preferences stored locally */
export interface UserPreferences {
  defaultCamera?: number;
  defaultFilm?: number;
  autoSavePhotos?: boolean;
  imageQuality?: 'low' | 'medium' | 'high';
  theme?: 'light' | 'dark' | 'system';
}

/** Server discovery result */
export interface ServerDiscoveryResult {
  ip: string;
  port: number;
  latency: number;
  reachable: boolean;
}
