import axios, { AxiosInstance } from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Photo, FilmItem, ShotLog, Roll, Film } from '../types';

const SERVER_URL_KEY = '@server_url';
const DEFAULT_URL = 'http://xxx.xxx.xx.xxx:4000';

class ApiService {
  private client: AxiosInstance;
  private baseURL: string = DEFAULT_URL;
  private filmsCache: Film[] | null = null;
  private filmsCacheAt: number = 0;

  private unwrapList<T>(data: any): T[] {
    if (Array.isArray(data)) return data as T[];
    if (data && Array.isArray((data as any).items)) return (data as any).items as T[];
    return [];
  }

  private unwrapItem<T>(data: any): T {
    if (data && (data as any).item) return (data as any).item as T;
    return data as T;
  }

  constructor() {
    this.client = axios.create({
      baseURL: this.baseURL,
      timeout: 15000,
      headers: {
        'Content-Type': 'application/json',
      },
    });
  }

  async loadServerURL(): Promise<string> {
    try {
      const url = await AsyncStorage.getItem(SERVER_URL_KEY);
      if (url) {
        this.baseURL = url;
        this.client.defaults.baseURL = url;
        return url;
      }
    } catch (error) {
      console.error('Failed to load server URL:', error);
    }
    return this.baseURL;
  }

  async saveServerURL(url: string): Promise<void> {
    try {
      await AsyncStorage.setItem(SERVER_URL_KEY, url);
      this.baseURL = url;
      this.client.defaults.baseURL = url;
    } catch (error) {
      console.error('Failed to save server URL:', error);
      throw error;
    }
  }

  getServerURL(): string {
    return this.baseURL;
  }

  getImageURL(relativePath: string | undefined): string | null {
    if (!relativePath) return null;
    return `${this.baseURL}/uploads/${relativePath}`;
  }

  async getRandomPhotos(limit: number = 10): Promise<Photo[]> {
    const response = await this.client.get<Photo[]>('/api/photos/random', {
      params: { limit },
    });
    return response.data;
  }

  async getFilms(options?: { force?: boolean }): Promise<Film[]> {
    const force = Boolean(options?.force);
    const now = Date.now();
    // cache for 5 minutes
    if (!force && this.filmsCache && now - this.filmsCacheAt < 5 * 60 * 1000) {
      return this.filmsCache;
    }
    const response = await this.client.get('/api/films');
    const films = this.unwrapList<Film>(response.data);
    this.filmsCache = films;
    this.filmsCacheAt = now;
    return films;
  }

  async getFilmItems(status?: string | string[]): Promise<FilmItem[]> {
    const statusParam = Array.isArray(status) ? status.join(',') : status;
    const response = await this.client.get('/api/film-items', {
      params: statusParam ? { status: statusParam } : {},
    });
    const items = this.unwrapList<FilmItem>(response.data);
    // Ensure title is readable
    return items.map(item => ({
      ...item,
      title: item.title || `Film Item #${item.id}`,
    }));
  }

  async getFilmItem(id: number): Promise<FilmItem> {
    const response = await this.client.get(`/api/film-items/${id}`);
    return response.data.item;
  }

  async updateFilmItemShotLogs(
    id: number,
    shotLogs: ShotLog[]
  ): Promise<FilmItem> {
    const response = await this.client.put(
      `/api/film-items/${id}`,
      {
        shot_logs: JSON.stringify(shotLogs),
      }
    );
    return response.data.item;
  }

  async getPhotosByRoll(rollId: number): Promise<Photo[]> {
    const response = await this.client.get<Photo[]>('/api/photos', {
      params: { roll_id: rollId },
    });
    return response.data;
  }

  async getRolls(): Promise<Roll[]> {
    const response = await this.client.get<Roll[]>('/api/rolls');
    const rolls = this.unwrapList<Roll>(response.data);
    // Map film_name_joined to film_type for display compatibility
    return rolls.map(roll => ({
      ...roll,
      film_type: roll.film_type || roll.film_name_joined || undefined,
    }));
  }
}

export const api = new ApiService();
