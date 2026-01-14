/**
 * Mobile App Type Declarations
 * 
 * Re-exports types from @filmgallery/types for use in the mobile app.
 * Provides additional mobile-specific type definitions.
 */

// Re-export shared types
export * from '../../../packages/@filmgallery/types/src/index';

// Mobile-specific types

/** Navigation route parameter types */
export interface RootStackParamList {
  Home: undefined;
  RollList: undefined;
  RollDetail: { rollId: number };
  PhotoDetail: { photoId: number; rollId?: number };
  Camera: { rollId: number; filmItemId?: number };
  FilmInventory: undefined;
  Equipment: undefined;
  Settings: undefined;
  Statistics: undefined;
  Locations: undefined;
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
