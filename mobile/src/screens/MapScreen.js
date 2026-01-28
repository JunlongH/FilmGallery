/**
 * MapScreen
 * 
 * Interactive map view showing all photo locations.
 * Part of the 3-tab main navigation.
 * 
 * Features:
 * - Photo clusters on map
 * - Location-based photo browsing
 * - OpenStreetMap tiles
 */

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { 
  View, 
  Text, 
  StyleSheet, 
  ActivityIndicator,
  TouchableOpacity,
  Image,
  Dimensions,
} from 'react-native';
import { useTheme } from 'react-native-paper';
import MapView, { Marker, UrlTile, PROVIDER_DEFAULT } from 'react-native-maps';
import { useNavigation } from '@react-navigation/native';
import axios from 'axios';
import { Icon } from '../components/ui';

const { width, height } = Dimensions.get('window');

// OpenStreetMap tile URL template
const OSM_TILE_URL = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';

// Initial region (centered on a default location)
const INITIAL_REGION = {
  latitude: 31.2304,  // Shanghai as default
  longitude: 121.4737,
  latitudeDelta: 5,
  longitudeDelta: 5,
};

export default function MapScreen() {
  const theme = useTheme();
  const navigation = useNavigation();
  
  const [loading, setLoading] = useState(true);
  const [photos, setPhotos] = useState([]);
  const [mapRegion, setMapRegion] = useState(INITIAL_REGION);
  const [selectedPhoto, setSelectedPhoto] = useState(null);

  // Fetch photos with GPS data
  const fetchPhotos = useCallback(async () => {
    try {
      setLoading(true);
      const response = await axios.get('/api/photos/with-gps');
      if (response.data && Array.isArray(response.data)) {
        setPhotos(response.data);
        
        // Auto-fit map to show all photos
        if (response.data.length > 0) {
          const lats = response.data.map(p => p.latitude).filter(Boolean);
          const lngs = response.data.map(p => p.longitude).filter(Boolean);
          
          if (lats.length > 0 && lngs.length > 0) {
            const minLat = Math.min(...lats);
            const maxLat = Math.max(...lats);
            const minLng = Math.min(...lngs);
            const maxLng = Math.max(...lngs);
            
            setMapRegion({
              latitude: (minLat + maxLat) / 2,
              longitude: (minLng + maxLng) / 2,
              latitudeDelta: Math.max(0.01, (maxLat - minLat) * 1.2),
              longitudeDelta: Math.max(0.01, (maxLng - minLng) * 1.2),
            });
          }
        }
      }
    } catch (error) {
      console.log('Failed to fetch photos with GPS:', error.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPhotos();
  }, [fetchPhotos]);

  // Handle marker press
  const handleMarkerPress = useCallback((photo) => {
    setSelectedPhoto(photo);
  }, []);

  // Navigate to photo view
  const handlePhotoPress = useCallback(() => {
    if (selectedPhoto) {
      navigation.navigate('PhotoView', { 
        photoId: selectedPhoto.id,
        rollId: selectedPhoto.roll_id,
      });
    }
  }, [selectedPhoto, navigation]);

  // Cluster nearby photos
  const clusters = useMemo(() => {
    // Simple clustering logic - group photos within ~0.01 degree
    const clusterRadius = 0.01;
    const result = [];
    const used = new Set();

    photos.forEach((photo, i) => {
      if (used.has(i) || !photo.latitude || !photo.longitude) return;

      const cluster = [photo];
      used.add(i);

      photos.forEach((other, j) => {
        if (used.has(j) || !other.latitude || !other.longitude) return;
        
        const dist = Math.sqrt(
          Math.pow(photo.latitude - other.latitude, 2) + 
          Math.pow(photo.longitude - other.longitude, 2)
        );
        
        if (dist < clusterRadius) {
          cluster.push(other);
          used.add(j);
        }
      });

      result.push({
        id: photo.id,
        latitude: cluster.reduce((sum, p) => sum + p.latitude, 0) / cluster.length,
        longitude: cluster.reduce((sum, p) => sum + p.longitude, 0) / cluster.length,
        count: cluster.length,
        photos: cluster,
        representative: cluster[0],
      });
    });

    return result;
  }, [photos]);

  const styles = StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: theme.colors.background,
    },
    map: {
      flex: 1,
    },
    loadingContainer: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      backgroundColor: theme.colors.background,
    },
    loadingText: {
      marginTop: 12,
      color: theme.colors.onSurfaceVariant,
      fontSize: 14,
    },
    clusterMarker: {
      width: 40,
      height: 40,
      borderRadius: 20,
      backgroundColor: theme.colors.primary,
      justifyContent: 'center',
      alignItems: 'center',
      borderWidth: 3,
      borderColor: 'white',
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.25,
      shadowRadius: 4,
      elevation: 5,
    },
    clusterText: {
      color: 'white',
      fontWeight: 'bold',
      fontSize: 14,
    },
    singleMarker: {
      width: 36,
      height: 36,
      borderRadius: 18,
      overflow: 'hidden',
      borderWidth: 3,
      borderColor: 'white',
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.25,
      shadowRadius: 4,
      elevation: 5,
    },
    markerImage: {
      width: '100%',
      height: '100%',
    },
    selectedCard: {
      position: 'absolute',
      bottom: 100,
      left: 16,
      right: 16,
      backgroundColor: theme.colors.surface,
      borderRadius: 16,
      padding: 12,
      flexDirection: 'row',
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.15,
      shadowRadius: 8,
      elevation: 8,
    },
    selectedImage: {
      width: 80,
      height: 80,
      borderRadius: 8,
    },
    selectedInfo: {
      flex: 1,
      marginLeft: 12,
      justifyContent: 'center',
    },
    selectedTitle: {
      fontSize: 16,
      fontWeight: '600',
      color: theme.colors.onSurface,
    },
    selectedSubtitle: {
      fontSize: 14,
      color: theme.colors.onSurfaceVariant,
      marginTop: 4,
    },
    closeButton: {
      position: 'absolute',
      top: 8,
      right: 8,
      width: 24,
      height: 24,
      borderRadius: 12,
      backgroundColor: theme.colors.surfaceVariant,
      justifyContent: 'center',
      alignItems: 'center',
    },
    emptyContainer: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      backgroundColor: theme.colors.background,
      padding: 24,
    },
    emptyText: {
      fontSize: 16,
      color: theme.colors.onSurfaceVariant,
      textAlign: 'center',
      marginTop: 16,
    },
    statsContainer: {
      position: 'absolute',
      top: 16,
      left: 16,
      right: 16,
      backgroundColor: theme.colors.surface + 'E6',
      borderRadius: 12,
      padding: 12,
      flexDirection: 'row',
      justifyContent: 'space-around',
    },
    statItem: {
      alignItems: 'center',
    },
    statValue: {
      fontSize: 18,
      fontWeight: 'bold',
      color: theme.colors.primary,
    },
    statLabel: {
      fontSize: 12,
      color: theme.colors.onSurfaceVariant,
      marginTop: 2,
    },
  });

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={theme.colors.primary} />
        <Text style={styles.loadingText}>Loading map data...</Text>
      </View>
    );
  }

  if (photos.length === 0) {
    return (
      <View style={styles.emptyContainer}>
        <Icon name="map-pin-off" size={64} color={theme.colors.onSurfaceVariant} />
        <Text style={styles.emptyText}>
          No photos with GPS data found.{'\n'}
          Take some photos with location enabled!
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <MapView
        style={styles.map}
        region={mapRegion}
        onRegionChangeComplete={setMapRegion}
        provider={PROVIDER_DEFAULT}
        showsUserLocation
        showsMyLocationButton
        mapType="none" // Use custom tiles
      >
        {/* OpenStreetMap tiles */}
        <UrlTile
          urlTemplate={OSM_TILE_URL}
          maximumZ={19}
          flipY={false}
        />
        
        {/* Photo markers/clusters */}
        {clusters.map((cluster) => (
          <Marker
            key={cluster.id}
            coordinate={{
              latitude: cluster.latitude,
              longitude: cluster.longitude,
            }}
            onPress={() => handleMarkerPress(cluster.representative)}
          >
            {cluster.count > 1 ? (
              <View style={styles.clusterMarker}>
                <Text style={styles.clusterText}>{cluster.count}</Text>
              </View>
            ) : (
              <View style={styles.singleMarker}>
                {cluster.representative.thumbnail_url ? (
                  <Image
                    source={{ uri: cluster.representative.thumbnail_url }}
                    style={styles.markerImage}
                  />
                ) : (
                  <View style={[styles.markerImage, { backgroundColor: theme.colors.surfaceVariant }]}>
                    <Icon name="image" size={16} color={theme.colors.onSurfaceVariant} />
                  </View>
                )}
              </View>
            )}
          </Marker>
        ))}
      </MapView>

      {/* Stats overlay */}
      <View style={styles.statsContainer}>
        <View style={styles.statItem}>
          <Text style={styles.statValue}>{photos.length}</Text>
          <Text style={styles.statLabel}>Photos</Text>
        </View>
        <View style={styles.statItem}>
          <Text style={styles.statValue}>{clusters.length}</Text>
          <Text style={styles.statLabel}>Locations</Text>
        </View>
      </View>

      {/* Selected photo card */}
      {selectedPhoto && (
        <TouchableOpacity 
          style={styles.selectedCard}
          onPress={handlePhotoPress}
          activeOpacity={0.9}
        >
          {selectedPhoto.thumbnail_url && (
            <Image
              source={{ uri: selectedPhoto.thumbnail_url }}
              style={styles.selectedImage}
            />
          )}
          <View style={styles.selectedInfo}>
            <Text style={styles.selectedTitle} numberOfLines={1}>
              {selectedPhoto.filename || 'Photo'}
            </Text>
            <Text style={styles.selectedSubtitle} numberOfLines={1}>
              {selectedPhoto.roll_name || 'Unknown Roll'}
            </Text>
          </View>
          <TouchableOpacity
            style={styles.closeButton}
            onPress={() => setSelectedPhoto(null)}
          >
            <Icon name="x" size={14} color={theme.colors.onSurfaceVariant} />
          </TouchableOpacity>
        </TouchableOpacity>
      )}
    </View>
  );
}
