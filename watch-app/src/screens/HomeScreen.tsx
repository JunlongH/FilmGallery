import React, { useEffect, useState } from 'react';
import {
  View,
  Image,
  StyleSheet,
  Dimensions,
  ActivityIndicator,
  Text,
  TouchableOpacity,
} from 'react-native';
import { GestureHandlerRootView, PanGestureHandler, State } from 'react-native-gesture-handler';
import { useNavigation } from '@react-navigation/native';
import { api } from '../services/api';
import { Photo } from '../types';

const { width, height } = Dimensions.get('window');

const HomeScreen: React.FC = () => {
  const navigation = useNavigation<any>();
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchRandomPhotos = async () => {
    try {
      setLoading(true);
      setError(null);
      const result = await api.getRandomPhotos(5);
      if (result.length > 0) {
        setPhotos(result);
        setCurrentIndex(0);
      } else {
        setError('No photos available');
      }
    } catch (err: any) {
      console.error('Failed to fetch photo:', err);
      setError(err.message || 'Failed to load photo');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRandomPhotos();
  }, []);

  const onGestureEvent = (event: any) => {
    const { state, translationY, translationX } = event.nativeEvent;

    if (state === State.END) {
      const isHorizontal = Math.abs(translationX) > Math.abs(translationY);

      // Horizontal swipe: cycle photos left/right
      if (isHorizontal && Math.abs(translationX) > 40 && photos.length > 0) {
        setCurrentIndex((prev) => {
          const next = translationX < 0 ? prev + 1 : prev - 1;
          const total = photos.length;
          return ((next % total) + total) % total; // wrap around
        });
        return;
      }

      // Vertical swipe: refresh or open menu
      if (translationY > 50) {
        fetchRandomPhotos();
      } else if (translationY < -50) {
        navigation.navigate('MainMenu');
      }
    }
  };

  const imageUrl = photos.length > 0
    ? api.getImageURL(photos[currentIndex]?.full_rel_path)
    : null;

  return (
    <GestureHandlerRootView style={styles.container}>
      <PanGestureHandler onHandlerStateChange={onGestureEvent}>
        <View style={styles.content}>
          {loading && (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color="#fff" />
            </View>
          )}
          {error && (
            <View style={styles.errorContainer}>
              <Text style={styles.errorText}>{error}</Text>
              <TouchableOpacity onPress={fetchRandomPhotos} style={styles.retryButton}>
                <Text style={styles.retryText}>Retry</Text>
              </TouchableOpacity>
            </View>
          )}
          {!loading && !error && imageUrl && (
            <Image
              source={{ uri: imageUrl }}
              style={styles.image}
              resizeMode="cover"
            />
          )}
          <View style={styles.hint}>
            <Text style={styles.hintText}>←/→ Photo  ↓ Refresh  ↑ Menu</Text>
          </View>
        </View>
      </PanGestureHandler>
    </GestureHandlerRootView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  image: {
    width: width,
    height: height,
    position: 'absolute',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  errorText: {
    color: '#fff',
    fontSize: 14,
    textAlign: 'center',
    marginBottom: 16,
  },
  retryButton: {
    backgroundColor: '#4CAF50',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 20,
  },
  retryText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  hint: {
    position: 'absolute',
    bottom: 20,
    backgroundColor: 'rgba(0,0,0,0.5)',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
  },
  hintText: {
    color: '#fff',
    fontSize: 12,
  },
});

export default HomeScreen;
