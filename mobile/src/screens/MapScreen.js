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
 * - Map style toggle
 * - Location list bottom sheet
 */

import React, { useState, useEffect, useCallback, useMemo, useRef, useContext } from 'react';
import { 
  View, 
  Text, 
  StyleSheet, 
  ActivityIndicator,
  TouchableOpacity,
  Image,
  Dimensions,
  Animated,
  FlatList,
  Platform,
} from 'react-native';
import { useTheme } from 'react-native-paper';
import MapView, { Marker, UrlTile } from 'react-native-maps';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import axios from 'axios';
import { Icon, Badge } from '../components/ui';
import { ApiContext } from '../context/ApiContext';

const { width, height } = Dimensions.get('window');

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
  const { baseUrl } = useContext(ApiContext);
  const mapRef = useRef(null);
  
  const [loading, setLoading] = useState(true);
  const [photos, setPhotos] = useState([]);
  const [mapRegion, setMapRegion] = useState(INITIAL_REGION);
  const [selectedPhoto, setSelectedPhoto] = useState(null);
  const [showList, setShowList] = useState(false);

  // Animation values
  const listAnim = useRef(new Animated.Value(0)).current;
  const cardAnim = useRef(new Animated.Value(0)).current;

  // Fetch photos with GPS data
  const fetchPhotos = useCallback(async () => {
    if (!baseUrl) {
      console.log('[MapScreen] No baseUrl yet, skipping fetch');
      return;
    }
    try {
      setLoading(true);
      console.log('[MapScreen] Fetching photos from:', `${baseUrl}/api/photos/geo`);
      const response = await axios.get(`${baseUrl}/api/photos/geo`);
      console.log('[MapScreen] Response data:', JSON.stringify(response.data).slice(0, 200));
      
      // Handle response format: { photos: [...], total: N, returned: N }
      let photoData = [];
      if (response.data) {
        if (Array.isArray(response.data)) {
          photoData = response.data;
        } else if (response.data.photos && Array.isArray(response.data.photos)) {
          photoData = response.data.photos;
        }
      }
      
      console.log('[MapScreen] Parsed photos:', photoData.length);
      
      if (photoData.length > 0) {
        // Convert coordinates to numbers and fix thumbnail URLs
        const processedPhotos = photoData.map(p => {
          let thumbPath = p.thumb_rel_path || p.positive_thumb_rel_path || null;
          let thumbnailUrl = null;
          if (thumbPath) {
            if (thumbPath.startsWith('http')) {
              thumbnailUrl = thumbPath;
            } else {
              // Server serves static files from /uploads/rolls/...
              if (!thumbPath.startsWith('/')) {
                thumbPath = '/uploads/' + thumbPath;
              } else if (!thumbPath.startsWith('/uploads')) {
                thumbPath = '/uploads' + thumbPath;
              }
              thumbnailUrl = `${baseUrl}${thumbPath}`;
            }
          }
          return {
            ...p,
            latitude: parseFloat(p.latitude),
            longitude: parseFloat(p.longitude),
            thumbnail_url: thumbnailUrl,
            // Generate location name from available fields
            location_name: p.detail_location || p.city || p.country || null,
          };
        }).filter(p => !isNaN(p.latitude) && !isNaN(p.longitude));
        
        console.log('[MapScreen] Processed photos with valid coords:', processedPhotos.length);
        setPhotos(processedPhotos);
        
        // Auto-fit map to show all photos
        const lats = processedPhotos.map(p => p.latitude).filter(v => v != null && v !== 0);
        const lngs = processedPhotos.map(p => p.longitude).filter(v => v != null && v !== 0);
        
        console.log('[MapScreen] Valid coords:', lats.length, 'lats,', lngs.length, 'lngs');
        
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
      } else {
        setPhotos([]);
      }
    } catch (error) {
      console.log('Failed to fetch photos with GPS:', error.message);
      setPhotos([]);
    } finally {
      setLoading(false);
    }
  }, [baseUrl]);

  useEffect(() => {
    if (baseUrl) {
      fetchPhotos();
    }
  }, [baseUrl, fetchPhotos]);

  // Handle marker press
  const handleMarkerPress = useCallback((photo) => {
    setSelectedPhoto(photo);
    // Animate card in
    Animated.spring(cardAnim, {
      toValue: 1,
      useNativeDriver: true,
      friction: 8,
    }).start();
  }, [cardAnim]);

  // Close selected card
  const closeSelectedCard = useCallback(() => {
    Animated.timing(cardAnim, {
      toValue: 0,
      duration: 200,
      useNativeDriver: true,
    }).start(() => setSelectedPhoto(null));
  }, [cardAnim]);

  // Toggle location list
  const toggleList = useCallback(() => {
    const toValue = showList ? 0 : 1;
    setShowList(!showList);
    Animated.spring(listAnim, {
      toValue,
      useNativeDriver: true,
      friction: 8,
    }).start();
  }, [showList, listAnim]);

  // Navigate to photo view
  const handlePhotoPress = useCallback(() => {
    if (selectedPhoto) {
      navigation.navigate('PhotoView', { 
        photoId: selectedPhoto.id,
        rollId: selectedPhoto.roll_id,
      });
    }
  }, [selectedPhoto, navigation]);

  // Navigate to cluster location
  // Handle cluster press - zoom in to expand cluster, or show photo if single
  const handleClusterPress = useCallback((cluster) => {
    if (cluster.count === 1) {
      // Single photo - show details
      handleMarkerPress(cluster.representative);
    } else {
      // Multiple photos - zoom in to expand the cluster
      // Calculate zoom level needed to show individual markers
      const currentDelta = mapRegion?.latitudeDelta || 1;
      let newDelta;
      
      if (currentDelta > 2) {
        newDelta = 0.5; // Very zoomed out -> zoom to region level
      } else if (currentDelta > 0.5) {
        newDelta = 0.1; // Region level -> zoom to city level
      } else if (currentDelta > 0.1) {
        newDelta = 0.02; // City level -> zoom to neighborhood
      } else if (currentDelta > 0.02) {
        newDelta = 0.005; // Neighborhood -> zoom to street level
      } else {
        // Already very zoomed in, show first photo
        handleMarkerPress(cluster.representative);
        return;
      }
      
      if (mapRef.current) {
        mapRef.current.animateToRegion({
          latitude: cluster.latitude,
          longitude: cluster.longitude,
          latitudeDelta: newDelta,
          longitudeDelta: newDelta,
        }, 400);
      }
    }
  }, [handleMarkerPress, mapRegion?.latitudeDelta]);

  // Dynamic clustering based on zoom level
  const clusters = useMemo(() => {
    // Calculate cluster radius based on current zoom (latitudeDelta)
    // At high zoom (small delta), use smaller radius to show individual photos
    // At low zoom (large delta), use larger radius to group more photos
    const delta = mapRegion?.latitudeDelta || 0.05;
    
    // More aggressive clustering at lower zoom levels
    let clusterRadius;
    if (delta > 5) {
      clusterRadius = 1.0; // World view - cluster by country/region
    } else if (delta > 1) {
      clusterRadius = 0.3; // Continental view
    } else if (delta > 0.3) {
      clusterRadius = 0.08; // Country view
    } else if (delta > 0.1) {
      clusterRadius = 0.02; // City view
    } else if (delta > 0.02) {
      clusterRadius = 0.005; // Neighborhood view
    } else {
      clusterRadius = 0.001; // Street view - minimal clustering
    }
    
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
        photos: cluster.slice(0, 4), // Keep up to 4 photos for mosaic display
        representative: cluster[0],
      });
    });

    return result;
  }, [photos, mapRegion?.latitudeDelta]);

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
      width: 56,
      height: 56,
      borderRadius: 28,
      backgroundColor: theme.colors.primary,
      justifyContent: 'center',
      alignItems: 'center',
      borderWidth: 3,
      borderColor: 'white',
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 3 },
      shadowOpacity: 0.4,
      shadowRadius: 6,
      elevation: 8,
    },
    clusterText: {
      color: 'white',
      fontWeight: 'bold',
      fontSize: 16,
    },
    markerContainer: {
      position: 'relative',
      alignItems: 'center',
      justifyContent: 'center',
    },
    // Single photo marker - large prominent size
    singleMarker: {
      width: 80,
      height: 80,
      borderRadius: 16,
      overflow: 'hidden',
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.4,
      shadowRadius: 8,
      elevation: 10,
      backgroundColor: theme.colors.surface,
      borderWidth: 3,
      borderColor: 'white',
    },
    // Mosaic cluster marker for multiple photos - larger with better spacing
    mosaicMarker: {
      width: 88,
      height: 88,
      borderRadius: 16,
      overflow: 'hidden',
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.4,
      shadowRadius: 8,
      elevation: 10,
      backgroundColor: theme.colors.surfaceVariant,
      borderWidth: 3,
      borderColor: 'white',
      flexDirection: 'row',
      flexWrap: 'wrap',
    },
    mosaicImage: {
      width: '50%',
      height: '50%',
    },
    // Large count badge positioned at bottom right - gradient-like amber color
    clusterBadge: {
      position: 'absolute',
      bottom: -8,
      right: -8,
      minWidth: 36,
      height: 36,
      borderRadius: 18,
      backgroundColor: '#F59E0B', // Amber/orange for visibility
      justifyContent: 'center',
      alignItems: 'center',
      borderWidth: 3,
      borderColor: 'white',
      paddingHorizontal: 8,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 3 },
      shadowOpacity: 0.35,
      shadowRadius: 4,
      elevation: 8,
    },
    clusterBadgeText: {
      color: '#000',
      fontWeight: 'bold',
      fontSize: 14,
    },
    markerImage: {
      width: '100%',
      height: '100%',
      resizeMode: 'cover',
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
    // Control buttons
    controlsContainer: {
      position: 'absolute',
      right: 16,
      top: 80,
      gap: 8,
    },
    controlButton: {
      width: 44,
      height: 44,
      borderRadius: 22,
      backgroundColor: theme.colors.surface,
      justifyContent: 'center',
      alignItems: 'center',
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.15,
      shadowRadius: 4,
      elevation: 4,
      marginBottom: 8,
    },
    controlButtonActive: {
      backgroundColor: theme.colors.primary,
    },
    // Location list panel
    listPanel: {
      position: 'absolute',
      bottom: 0,
      left: 0,
      right: 0,
      height: height * 0.4,
      backgroundColor: theme.colors.surface,
      borderTopLeftRadius: 24,
      borderTopRightRadius: 24,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: -4 },
      shadowOpacity: 0.1,
      shadowRadius: 8,
      elevation: 10,
    },
    listHandle: {
      width: 40,
      height: 4,
      backgroundColor: theme.colors.outline,
      borderRadius: 2,
      alignSelf: 'center',
      marginTop: 12,
      marginBottom: 8,
    },
    listHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingHorizontal: 20,
      paddingBottom: 12,
      borderBottomWidth: 1,
      borderBottomColor: theme.colors.outline + '30',
    },
    listTitle: {
      fontSize: 16,
      fontWeight: '600',
      color: theme.colors.onSurface,
    },
    listItem: {
      flexDirection: 'row',
      alignItems: 'center',
      padding: 12,
      paddingHorizontal: 20,
      borderBottomWidth: 1,
      borderBottomColor: theme.colors.outline + '15',
    },
    listItemImage: {
      width: 56,
      height: 56,
      borderRadius: 8,
      backgroundColor: theme.colors.surfaceVariant,
    },
    listItemInfo: {
      flex: 1,
      marginLeft: 12,
    },
    listItemTitle: {
      fontSize: 14,
      fontWeight: '500',
      color: theme.colors.onSurface,
    },
    listItemSubtitle: {
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
        ref={mapRef}
        style={styles.map}
        region={mapRegion}
        onRegionChangeComplete={setMapRegion}
        mapType={Platform.OS === 'android' ? 'none' : 'standard'}
        showsUserLocation
        showsMyLocationButton={false}
        onPress={() => selectedPhoto && closeSelectedCard()}
        onMapReady={() => console.log('[MapScreen] Map ready')}
        liteMode={false}
      >
        {/* Amap (高德) Tile Layer - works better in China */}
        <UrlTile
          urlTemplate="https://webrd01.is.autonavi.com/appmaptile?lang=zh_cn&size=1&scale=1&style=8&x={x}&y={y}&z={z}"
          maximumZ={19}
          minimumZ={1}
          flipY={false}
          zIndex={-1}
          tileSize={256}
        />
        {/* Photo markers/clusters */}
        {clusters.map((cluster) => (
          <Marker
            key={cluster.id}
            coordinate={{
              latitude: cluster.latitude,
              longitude: cluster.longitude,
            }}
            onPress={() => handleClusterPress(cluster)}
          >
            <View style={styles.markerContainer}>
              {cluster.count === 1 ? (
                // Single photo - large thumbnail
                <View style={styles.singleMarker}>
                  {cluster.representative.thumbnail_url ? (
                    <Image
                      source={{ uri: cluster.representative.thumbnail_url }}
                      style={styles.markerImage}
                      resizeMode="cover"
                    />
                  ) : (
                    <View style={[styles.markerImage, { backgroundColor: theme.colors.surfaceVariant, justifyContent: 'center', alignItems: 'center' }]}>
                      <Icon name="image" size={24} color={theme.colors.onSurfaceVariant} />
                    </View>
                  )}
                </View>
              ) : (
                // Multiple photos - mosaic layout (2x2 grid)
                <View style={styles.mosaicMarker}>
                  {cluster.photos.slice(0, 4).map((photo, idx) => (
                    <Image
                      key={photo.id || idx}
                      source={{ uri: photo.thumbnail_url }}
                      style={styles.mosaicImage}
                      resizeMode="cover"
                    />
                  ))}
                  {/* Fill empty slots if less than 4 photos */}
                  {cluster.photos.length < 4 && Array(4 - cluster.photos.length).fill(null).map((_, idx) => (
                    <View 
                      key={`empty-${idx}`} 
                      style={[styles.mosaicImage, { backgroundColor: theme.colors.surfaceVariant }]} 
                    />
                  ))}
                </View>
              )}
              {cluster.count > 1 && (
                <View style={styles.clusterBadge}>
                  <Text style={styles.clusterBadgeText}>{cluster.count}</Text>
                </View>
              )}
            </View>
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

      {/* Control buttons */}
      <View style={styles.controlsContainer}>
        {/* Location list toggle */}
        <TouchableOpacity 
          style={[styles.controlButton, showList && styles.controlButtonActive]}
          onPress={toggleList}
        >
          <Icon 
            name="list" 
            size={20} 
            color={showList ? 'white' : theme.colors.primary} 
          />
        </TouchableOpacity>
        
        {/* Fit all markers */}
        <TouchableOpacity 
          style={styles.controlButton}
          onPress={fetchPhotos}
        >
          <Icon name="maximize" size={20} color={theme.colors.primary} />
        </TouchableOpacity>
      </View>

      {/* Selected photo card */}
      {selectedPhoto && (
        <Animated.View 
          style={[styles.selectedCard, {
            opacity: cardAnim,
            transform: [{
              translateY: cardAnim.interpolate({
                inputRange: [0, 1],
                outputRange: [50, 0],
              }),
            }],
          }]}
        >
          <TouchableOpacity 
            onPress={handlePhotoPress}
            activeOpacity={0.9}
            style={{ flexDirection: 'row', flex: 1 }}
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
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.closeButton}
            onPress={closeSelectedCard}
          >
            <Icon name="x" size={14} color={theme.colors.onSurfaceVariant} />
          </TouchableOpacity>
        </Animated.View>
      )}

      {/* Location list panel */}
      {showList && (
        <Animated.View 
          style={[styles.listPanel, {
            transform: [{
              translateY: listAnim.interpolate({
                inputRange: [0, 1],
                outputRange: [height * 0.4, 0],
              }),
            }],
          }]}
        >
          <View style={styles.listHandle} />
          <View style={styles.listHeader}>
            <Text style={styles.listTitle}>{clusters.length} Locations</Text>
            <TouchableOpacity onPress={toggleList}>
              <Icon name="x" size={20} color={theme.colors.onSurfaceVariant} />
            </TouchableOpacity>
          </View>
          <FlatList
            data={clusters}
            keyExtractor={(item) => item.id.toString()}
            renderItem={({ item }) => (
              <TouchableOpacity 
                style={styles.listItem}
                onPress={() => {
                  handleClusterPress(item);
                  toggleList();
                }}
              >
                <Image
                  source={{ uri: item.representative.thumbnail_url }}
                  style={styles.listItemImage}
                />
                <View style={styles.listItemInfo}>
                  <Text style={styles.listItemTitle} numberOfLines={1}>
                    {item.representative.location_name || item.representative.detail_location || item.representative.city || item.representative.country || `${item.representative.latitude.toFixed(4)}, ${item.representative.longitude.toFixed(4)}`}
                  </Text>
                  <Text style={styles.listItemSubtitle}>
                    {item.count} {item.count === 1 ? 'photo' : 'photos'}
                  </Text>
                </View>
                <Badge variant="primary">{item.count}</Badge>
              </TouchableOpacity>
            )}
          />
        </Animated.View>
      )}
    </View>
  );
}
