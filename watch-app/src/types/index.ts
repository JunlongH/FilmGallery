export interface Photo {
  id: number;
  filename: string;
  full_rel_path: string;
  thumb_rel_path?: string;
  positive_thumb_rel_path?: string;
  date_taken?: string;
  camera?: string;
  lens?: string;
  film?: string;
  roll_id?: number;
  roll_title?: string;
}

export interface FilmItem {
  id: number;
  film_id?: number | null;
  title?: string | null;
  status: string;
  loaded_camera?: string | null;
  loaded_date?: string | null;
  shot_logs?: string; // JSON string
  created_at: string;
  updated_at: string;
  // These are populated from the films table by the API
  iso?: string | null;
  film_name?: string | null;
  film_type?: string | null;
}

export interface Film {
  id: number;
  name: string;
  iso?: number | string | null;
  category?: string | null;
  thumbPath?: string | null;
}

export interface Roll {
  id: number;
  title: string;
  filmId?: number | null;
  film_item_id?: number | null;
  film_type?: string | null;
  film_name_joined?: string | null; // name from films table
  status?: string | null;
  camera?: string | null;
  lens?: string | null;
  photographer?: string | null;
  start_date?: string | null;
  end_date?: string | null;
  notes?: string | null;
  created_at?: string;
}

export interface ShotLog {
  date: string;
  count: number;
  lens?: string;
  aperture?: number | null;
  shutter_speed?: string;
  country?: string;
  city?: string;
  detail_location?: string;
}

export interface ServerConfig {
  baseURL: string;
}
