/**
 * CachedImage Component - TypeScript Migration
 * 
 * Unified cached image component with expo-image.
 */

import React from 'react';
import { View, ViewStyle, StyleProp } from 'react-native';
import { Image as ExpoImage, ImageContentFit } from 'expo-image';
import { useCachedImage } from '../hooks/useCachedImage';

interface CachedImageProps {
  uri: string | null | undefined;
  style?: StyleProp<ViewStyle>;
  contentFit?: ImageContentFit;
  transition?: number;
  placeholderColor?: string;
  showLoadedIndicator?: boolean;
}

export default function CachedImage({
  uri,
  style,
  contentFit = 'cover',
  transition = 150,
  placeholderColor = '#eee',
  showLoadedIndicator = false,
  ...rest
}: CachedImageProps): React.JSX.Element {
  const { source, loaded, onLoadEnd, onError } = useCachedImage(uri);
  const effectiveTransition = loaded ? 0 : transition;

  return (
    <View style={style}>
      <ExpoImage
        {...rest}
        source={source}
        style={[{ width: '100%', height: '100%' }, style as object]}
        contentFit={contentFit}
        cachePolicy="disk"
        transition={effectiveTransition}
        onLoadEnd={onLoadEnd}
        onError={onError}
        placeholder={{
          blurhash: undefined,
        }}
        placeholderContentFit="cover"
      />
      {showLoadedIndicator && loaded && (
        <View
          style={{
            position: 'absolute',
            top: 4,
            right: 4,
            width: 8,
            height: 8,
            borderRadius: 4,
            backgroundColor: '#4caf50',
          }}
        />
      )}
    </View>
  );
}

// Simple cache helper to clear react-native-expo-image cache if exposed
export async function clearImageCache(): Promise<void> {
  try {
    const mod = await import('expo-image');
    // expo-image may have these methods but types might not be exposed
    if ('clearMemoryCache' in mod && typeof (mod as any).clearMemoryCache === 'function') {
      (mod as any).clearMemoryCache();
    }
    if ('clearDiskCache' in mod && typeof (mod as any).clearDiskCache === 'function') {
      await (mod as any).clearDiskCache();
    }
  } catch {
    // silent
  }
}
