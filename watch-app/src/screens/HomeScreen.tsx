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
  const [photo, setPhoto] = useState<Photo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchRandomPhoto = async () => {
    try {
      setLoading(true);
      setError(null);
      const photos = await api.getRandomPhotos(1);
      if (photos.length > 0) {
        setPhoto(photos[0]);
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
    fetchRandomPhoto();
  }, []);

  const onGestureEvent = (event: any) => {
    const { state, translationY } = event.nativeEvent;
    
    if (state === State.END) {
      // Swipe down to refresh
      if (translationY > 50) {
        fetchRandomPhoto();
      }
      // Swipe up to open menu
      else if (translationY < -50) {
        navigation.navigate('MainMenu');
      }
    }
  };

  const imageUrl = photo
    ? api.getImageURL(photo.full_rel_path)
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
              <TouchableOpacity onPress={fetchRandomPhoto} style={styles.retryButton}>
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
            <Text style={styles.hintText}>↓ Refresh  ↑ Menu</Text>
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
