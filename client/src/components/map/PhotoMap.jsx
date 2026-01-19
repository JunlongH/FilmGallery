/**
 * PhotoMap.jsx
 * 
 * Core map component using Leaflet to display photo markers.
 * Implements clustering, custom markers, and smooth interactions.
 * 
 * @module components/map/PhotoMap
 */
import React, { useMemo, useCallback, useEffect, useState } from 'react';
import { MapContainer, TileLayer, useMap, useMapEvents } from 'react-leaflet';
import MarkerClusterGroup from 'react-leaflet-cluster';
import L from 'leaflet';
import PhotoMarker from './PhotoMarker';
import MapPhotoPreview from './MapPhotoPreview';
import useGeoPhotos from '../../hooks/useGeoPhotos';

// Import Leaflet CSS
import 'leaflet/dist/leaflet.css';

// Fix Leaflet default marker icon issue
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: require('leaflet/dist/images/marker-icon-2x.png'),
  iconUrl: require('leaflet/dist/images/marker-icon.png'),
  shadowUrl: require('leaflet/dist/images/marker-shadow.png'),
});

/**
 * Tile layer configurations
 */
const TILE_LAYERS = {
  dark: {
    url: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>',
    name: 'Dark',
  },
  light: {
    url: 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png',
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>',
    name: 'Light',
  },
  satellite: {
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    attribution: 'Tiles &copy; Esri',
    name: 'Satellite',
  },
};

/**
 * Default map center (world view)
 */
const DEFAULT_CENTER = [30, 0];
const DEFAULT_ZOOM = 2;

/**
 * Custom cluster icon creator
 */
const createClusterCustomIcon = (cluster) => {
  const count = cluster.getChildCount();
  let size = 'small';
  let dimension = 40;
  
  if (count >= 100) {
    size = 'large';
    dimension = 56;
  } else if (count >= 10) {
    size = 'medium';
    dimension = 48;
  }

  return L.divIcon({
    html: `<div class="photo-cluster photo-cluster-${size}">
      <span class="photo-cluster-count">${count}</span>
    </div>`,
    className: 'photo-cluster-container',
    iconSize: L.point(dimension, dimension, true),
  });
};

/**
 * Map event handler component
 */
function MapEventHandler({ onBoundsChange }) {
  const map = useMapEvents({
    moveend: () => {
      const bounds = map.getBounds();
      onBoundsChange({
        sw_lat: bounds.getSouthWest().lat,
        sw_lng: bounds.getSouthWest().lng,
        ne_lat: bounds.getNorthEast().lat,
        ne_lng: bounds.getNorthEast().lng,
      });
    },
    zoomend: () => {
      const bounds = map.getBounds();
      onBoundsChange({
        sw_lat: bounds.getSouthWest().lat,
        sw_lng: bounds.getSouthWest().lng,
        ne_lat: bounds.getNorthEast().lat,
        ne_lng: bounds.getNorthEast().lng,
      });
    },
  });

  return null;
}

/**
 * Tile layer switcher component
 */
function TileLayerSwitcher({ currentLayer, onChange }) {
  return (
    <div className="map-layer-switcher">
      {Object.entries(TILE_LAYERS).map(([key, layer]) => (
        <button
          key={key}
          className={`map-layer-btn ${currentLayer === key ? 'active' : ''}`}
          onClick={() => onChange(key)}
          title={layer.name}
        >
          {layer.name}
        </button>
      ))}
    </div>
  );
}

/**
 * Auto-fit bounds component
 */
function FitBoundsToPhotos({ photos }) {
  const map = useMap();

  useEffect(() => {
    if (photos && photos.length > 0) {
      const validPhotos = photos.filter(p => p.latitude && p.longitude);
      if (validPhotos.length > 0) {
        const bounds = L.latLngBounds(
          validPhotos.map(p => [p.latitude, p.longitude])
        );
        // Only fit if bounds are valid and not too small
        if (bounds.isValid()) {
          map.fitBounds(bounds, { padding: [50, 50], maxZoom: 12 });
        }
      }
    }
  }, [photos, map]);

  return null;
}

/**
 * PhotoMap Component
 * 
 * @param {Object} props
 * @param {Object} props.filters - Filter criteria
 * @param {Function} props.onPhotoClick - Callback when photo is clicked
 * @param {Object} props.selectedPhoto - Currently selected photo
 */
export default function PhotoMap({ filters, onPhotoClick, selectedPhoto }) {
  // Tile layer state
  const [tileLayer, setTileLayer] = useState('dark');
  
  // Map bounds for lazy loading (future use)
  const [bounds, setBounds] = useState(null);

  // Preview popup state
  const [previewPhoto, setPreviewPhoto] = useState(null);
  const [previewPosition, setPreviewPosition] = useState(null);

  // Fetch photos with geo data
  const { photos, isLoading, error, total } = useGeoPhotos({
    rollId: filters?.rollId,
    dateRange: filters?.dateRange,
    bounds: bounds,
  });

  // Filter photos that have valid coordinates
  const geoPhotos = useMemo(() => {
    if (!photos) return [];
    return photos.filter(p => 
      p.latitude !== null && 
      p.longitude !== null && 
      !isNaN(p.latitude) && 
      !isNaN(p.longitude)
    );
  }, [photos]);

  /**
   * Handle bounds change for lazy loading
   */
  const handleBoundsChange = useCallback((newBounds) => {
    setBounds(newBounds);
  }, []);

  /**
   * Handle marker click
   */
  const handleMarkerClick = useCallback((photo, position) => {
    setPreviewPhoto(photo);
    setPreviewPosition(position);
    if (onPhotoClick) {
      onPhotoClick(photo);
    }
  }, [onPhotoClick]);

  /**
   * Close preview popup
   */
  const handleClosePreview = useCallback(() => {
    setPreviewPhoto(null);
    setPreviewPosition(null);
  }, []);

  // Current tile layer config
  const currentTileLayer = TILE_LAYERS[tileLayer];

  return (
    <div className="photo-map-wrapper">
      {/* Loading overlay */}
      {isLoading && (
        <div className="map-loading-overlay">
          <div className="map-loading-spinner" />
          <span>Loading photos...</span>
        </div>
      )}

      {/* Error message */}
      {error && (
        <div className="map-error-message">
          <span>Failed to load photos: {error.message}</span>
        </div>
      )}

      {/* Photo count badge */}
      <div className="map-photo-count">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
          <circle cx="8.5" cy="8.5" r="1.5"/>
          <polyline points="21,15 16,10 5,21"/>
        </svg>
        <span>{geoPhotos.length} photos with location</span>
        {total > geoPhotos.length && (
          <span className="map-photo-count-total"> / {total} total</span>
        )}
      </div>

      {/* Tile layer switcher */}
      <TileLayerSwitcher 
        currentLayer={tileLayer} 
        onChange={setTileLayer} 
      />

      {/* Main Map */}
      <MapContainer
        center={DEFAULT_CENTER}
        zoom={DEFAULT_ZOOM}
        className="photo-map"
        scrollWheelZoom={true}
        zoomControl={true}
      >
        <TileLayer
          url={currentTileLayer.url}
          attribution={currentTileLayer.attribution}
        />

        <MapEventHandler onBoundsChange={handleBoundsChange} />
        
        {/* Auto-fit bounds on first load */}
        {!isLoading && geoPhotos.length > 0 && (
          <FitBoundsToPhotos photos={geoPhotos} />
        )}

        {/* Clustered markers */}
        <MarkerClusterGroup
          chunkedLoading
          iconCreateFunction={createClusterCustomIcon}
          maxClusterRadius={60}
          spiderfyOnMaxZoom={true}
          showCoverageOnHover={false}
          zoomToBoundsOnClick={true}
          animate={true}
          animateAddingMarkers={true}
        >
          {geoPhotos.map((photo) => (
            <PhotoMarker
              key={photo.id}
              photo={photo}
              onClick={handleMarkerClick}
              isSelected={selectedPhoto?.id === photo.id}
            />
          ))}
        </MarkerClusterGroup>
      </MapContainer>

      {/* Photo preview popup */}
      {previewPhoto && (
        <MapPhotoPreview
          photo={previewPhoto}
          position={previewPosition}
          onClose={handleClosePreview}
        />
      )}
    </div>
  );
}
