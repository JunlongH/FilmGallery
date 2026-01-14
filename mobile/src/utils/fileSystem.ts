/**
 * File System Utilities - TypeScript Migration
 * 
 * Unified File System helper for Expo SDK 54+.
 * Uses the new class-based API (`File`, `Directory`, `Paths`) instead of deprecated
 * procedural methods like `downloadAsync`. Provides a single download function
 * with optional legacy fallback for environments where the new API may not yet
 * be available (e.g. older cached builds).
 */

import * as MediaLibrary from 'expo-media-library';
import { Platform } from 'react-native';
// Prefer static imports so Metro reliably bundles both entry points.
import * as FS from 'expo-file-system';
import * as FSLegacy from 'expo-file-system/legacy';

// Extended types for Expo FileSystem API
interface ExpoFilePaths {
  document?: {
    uri: string;
  };
}

interface ExpoFileClass {
  createAsync?: (uri: string) => Promise<ExpoFileInstance>;
}

interface ExpoFileInstance {
  downloadFileAsync?: (url: string) => Promise<{ status?: number }>;
}

interface ExtendedFS {
  Paths?: ExpoFilePaths;
  File?: ExpoFileClass;
  documentDirectory?: string;
}

interface DownloadResult {
  status: number;
}

export interface DownloadOptions {
  fileName?: string;
  saveToLibrary?: boolean;
}

/**
 * Ensure MediaLibrary permissions for saving images on native platforms.
 */
export async function ensureMediaPermissionsAsync(): Promise<void> {
  if (Platform.OS === 'android' || Platform.OS === 'ios') {
    const res = await MediaLibrary.getPermissionsAsync();
    if (!res.granted) {
      const req = await MediaLibrary.requestPermissionsAsync();
      if (!req.granted) throw new Error('MediaLibrary permission denied');
    }
  }
}

/**
 * Download a remote URL to app documents and (optionally) save to user library.
 * Returns local file URI.
 * @param url Remote HTTP/HTTPS URL.
 * @param options Additional options.
 * @param options.fileName Desired base filename; defaults to timestamp.
 * @param options.saveToLibrary Whether to persist to user visible library (image only).
 */
export async function downloadImageAsync(
  url: string,
  options: DownloadOptions = {}
): Promise<string> {
  if (!url) throw new Error('downloadImageAsync: url required');
  const { fileName = `download_${Date.now()}.jpg`, saveToLibrary = true } = options;

  // Document directory path.
  let documentDir: string | null = null;
  const fsExt = FS as ExtendedFS;
  
  if (fsExt?.Paths?.document?.uri) documentDir = fsExt.Paths.document.uri;
  if (!documentDir && FSLegacy?.documentDirectory) documentDir = FSLegacy.documentDirectory;
  if (!documentDir && fsExt?.documentDirectory) documentDir = fsExt.documentDirectory;
  if (!documentDir) throw new Error('Unable to resolve document directory');

  const targetUri = documentDir + fileName;

  // Use new API when available; otherwise use legacy which is stable across SDK versions.
  const hasNewApi = !!(fsExt?.File && typeof fsExt.File.createAsync === 'function');
  if (hasNewApi) {
    const file = await fsExt.File!.createAsync!(targetUri);
    if (file && typeof file.downloadFileAsync === 'function') {
      const response = await file.downloadFileAsync(url);
      if (!response || (response.status && response.status !== 200)) {
        throw new Error(`Download failed (status ${response?.status ?? 'unknown'})`);
      }
    } else {
      const dl = await FSLegacy.downloadAsync(url, targetUri) as DownloadResult;
      if (dl.status !== 200) {
        throw new Error(`Download failed (status ${dl.status})`);
      }
    }
  } else {
    const dl = await FSLegacy.downloadAsync(url, targetUri) as DownloadResult;
    if (dl.status !== 200) {
      throw new Error(`Download failed (status ${dl.status})`);
    }
  }

  // Save to media library if requested and supported.
  if (saveToLibrary) {
    try {
      await ensureMediaPermissionsAsync();
      await MediaLibrary.saveToLibraryAsync(targetUri);
    } catch (e) {
      // Non-fatal; keep file in documents.
      console.warn('MediaLibrary save failed:', (e as Error).message);
    }
  }

  return targetUri;
}
