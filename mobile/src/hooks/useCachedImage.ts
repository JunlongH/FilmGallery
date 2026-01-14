/**
 * useCachedImage Hook - TypeScript Migration
 * 
 * Simple hook for tracking image load state and caching.
 */

import { useState, useEffect, useRef } from 'react';
import type { ImageSourcePropType, NativeSyntheticEvent, ImageErrorEventData } from 'react-native';

// Simple in-memory set to remember which URIs finished at least once.
const loadedCache = new Set<string>();

interface UseCachedImageResult {
  source: ImageSourcePropType | undefined;
  loaded: boolean;
  error: ImageErrorEventData | Error | null;
  onLoadEnd: () => void;
  onError: (e: NativeSyntheticEvent<ImageErrorEventData> | Error) => void;
  loadDuration: number | null;
}

export function useCachedImage(uri: string | null | undefined): UseCachedImageResult {
  const [loaded, setLoaded] = useState(uri ? loadedCache.has(uri) : false);
  const [error, setError] = useState<ImageErrorEventData | Error | null>(null);
  const startTimeRef = useRef(Date.now());

  const onLoadEnd = (): void => {
    if (uri) {
      loadedCache.add(uri);
    }
    setLoaded(true);
  };

  const onError = (e: NativeSyntheticEvent<ImageErrorEventData> | Error): void => {
    if ('nativeEvent' in e) {
      setError(e.nativeEvent);
    } else {
      setError(e);
    }
  };

  // Expose simple metrics: first load duration
  const loadDuration = loaded ? Date.now() - startTimeRef.current : null;

  useEffect(() => {
    if (uri && loadedCache.has(uri) && !loaded) {
      setLoaded(true);
    }
  }, [uri, loaded]);

  return {
    source: uri ? { uri } : undefined,
    loaded,
    error,
    onLoadEnd,
    onError,
    loadDuration,
  };
}

export function isImageCached(uri: string): boolean {
  return loadedCache.has(uri);
}
