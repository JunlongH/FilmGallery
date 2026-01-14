/**
 * Mobile App API Service
 * 类型化的 API 调用层，使用 @filmgallery/types 中的共享类型
 */

import axios, { AxiosResponse } from 'axios';
import type {
  Roll,
  Film,
  Photo,
  Tag,
  Camera,
  Lens,
  Flash,
  Location
} from '@filmgallery/types';

/**
 * 获取 Base URL (从 axios 实例)
 */
export function getBaseUrl(): string {
  return axios.defaults.baseURL || '';
}

/**
 * Roll API
 */
export async function getRolls(): Promise<Roll[]> {
  const response: AxiosResponse<Roll[]> = await axios.get('/api/rolls');
  return response.data;
}

export async function getRoll(id: number): Promise<Roll> {
  const response: AxiosResponse<Roll> = await axios.get(`/api/rolls/${id}`);
  return response.data;
}

export async function getRollPhotos(rollId: number): Promise<Photo[]> {
  const response: AxiosResponse<Photo[]> = await axios.get(`/api/rolls/${rollId}/photos`);
  return response.data;
}

/**
 * Film API
 */
export async function getFilms(): Promise<Film[]> {
  const response: AxiosResponse<Film[]> = await axios.get('/api/films');
  return response.data;
}

/**
 * Photo API
 */
export async function updatePhoto(
  photoId: number,
  updates: Partial<Pick<Photo, 'caption' | 'notes' | 'is_favorite'>>
): Promise<Photo> {
  const response: AxiosResponse<Photo> = await axios.put(`/api/photos/${photoId}`, updates);
  return response.data;
}

export async function getFavoritePhotos(): Promise<Photo[]> {
  const response: AxiosResponse<Photo[]> = await axios.get('/api/photos/favorites');
  return response.data;
}

export async function getNegativePhotos(): Promise<Photo[]> {
  const response: AxiosResponse<Photo[]> = await axios.get('/api/photos/negatives');
  return response.data;
}

/**
 * 下载带 EXIF 的照片
 * 返回 Blob URL 用于分享
 */
export async function downloadPhotoWithExif(photoId: number): Promise<string> {
  const baseUrl = getBaseUrl();
  const response = await fetch(`${baseUrl}/api/photos/${photoId}/download-with-exif`, {
    method: 'GET',
    headers: {
      'Accept': 'image/jpeg'
    }
  });

  if (!response.ok) {
    throw new Error(`Failed to download photo: ${response.statusText}`);
  }

  const blob = await response.blob();
  return URL.createObjectURL(blob);
}

/**
 * Tag API
 */
export async function getTags(): Promise<Tag[]> {
  const response: AxiosResponse<Tag[]> = await axios.get('/api/tags');
  return response.data;
}

export async function getTagPhotos(tagId: number): Promise<Photo[]> {
  const response: AxiosResponse<Photo[]> = await axios.get(`/api/tags/${tagId}/photos`);
  return response.data;
}

/**
 * Equipment API
 */
export async function getCameras(): Promise<Camera[]> {
  const response: AxiosResponse<Camera[]> = await axios.get('/api/cameras');
  return response.data;
}

export async function getLenses(): Promise<Lens[]> {
  const response: AxiosResponse<Lens[]> = await axios.get('/api/lenses');
  return response.data;
}

export async function getFlashes(): Promise<Flash[]> {
  const response: AxiosResponse<Flash[]> = await axios.get('/api/flashes');
  return response.data;
}

/**
 * Location API
 */
export async function getLocations(): Promise<Location[]> {
  const response: AxiosResponse<Location[]> = await axios.get('/api/locations');
  return response.data;
}

/**
 * Health Check API
 * 用于 SettingsScreen 的连接测试
 */
export async function healthCheck(): Promise<boolean> {
  try {
    const baseUrl = getBaseUrl();
    const response = await fetch(`${baseUrl}/api/rolls`);
    return response.ok;
  } catch {
    return false;
  }
}
