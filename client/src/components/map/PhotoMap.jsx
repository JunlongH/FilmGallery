/**
 * PhotoMap.jsx
 * 
 * Core map component using Leaflet to display photo markers.
 * Implements clustering, custom markers, and smooth interactions.
 * Supports switching between 3D Globe view and 2D flat map.
 * 
 * @module components/map/PhotoMap
 */
import React, { useMemo, useCallback, useEffect, useState, useRef } from 'react';
import { MapContainer, TileLayer, useMap, useMapEvents } from 'react-leaflet';
import MarkerClusterGroup from 'react-leaflet-cluster';
import L from 'leaflet';
import PhotoMarker from './PhotoMarker';
import MapPhotoPreview from './MapPhotoPreview';
import PhotoGlobe from './PhotoGlobe';
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
  // View mode: 'globe' for 3D Earth, 'flat' for Leaflet map
  const [viewMode, setViewMode] = useState('globe');
  
  // Tile layer state
  const [tileLayer, setTileLayer] = useState('dark');
  
  // Map bounds for lazy loading (future use)
  const [bounds, setBounds] = useState(null);

  // Preview popup state
  const [previewPhoto, setPreviewPhoto] = useState(null);
  const [previewPosition, setPreviewPosition] = useState(null);
  
  // Initial map position when switching from globe
  const [initialMapView, setInitialMapView] = useState({ center: DEFAULT_CENTER, zoom: DEFAULT_ZOOM });
  
  // Container ref for dimensions
  const containerRef = useRef(null);
  const [dimensions, setDimensions] = useState({ width: 800, height: 600 });
  
  // Hovered photo ID
  const [hoveredPhotoId, setHoveredPhotoId] = useState(null);

  // Update dimensions on resize
  useEffect(() => {
    const updateDimensions = () => {
      if (containerRef.current) {
        setDimensions({
          width: containerRef.current.clientWidth,
          height: containerRef.current.clientHeight,
        });
      }
    };
    
    updateDimensions();
    window.addEventListener('resize', updateDimensions);
    return () => window.removeEventListener('resize', updateDimensions);
  }, []);

  // Fetch photos with geo data
  const { photos, isLoading, error, total } = useGeoPhotos({
    rollId: filters?.rollId,
    dateRange: filters?.dateRange,
    bounds: viewMode === 'flat' ? bounds : null, // Only use bounds in flat mode
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
  
  /**
   * Handle marker hover
   */
  const handleMarkerHover = useCallback((photo, isEntering) => {
    setHoveredPhotoId(isEntering ? photo.id : null);
  }, []);
  
  /**
   * Handle zoom from globe to flat map
   */
  const handleZoomToFlat = useCallback(({ lat, lng, zoom }) => {
    setInitialMapView({
      center: [lat, lng],
      zoom: zoom || 6,
    });
    setViewMode('flat');
  }, []);
  
  /**
   * Toggle between globe and flat views
   */
  const handleToggleView = useCallback(() => {
    setViewMode(prev => prev === 'globe' ? 'flat' : 'globe');
  }, []);

  // Current tile layer config
  const currentTileLayer = TILE_LAYERS[tileLayer];

  return (
    <div className="photo-map-wrapper" ref={containerRef}>
      {/* Loading skeleton overlay */}
      {isLoading && (
        <div className="map-loading-overlay">
          <div className="map-loading-skeleton">
            <div className="map-skeleton-globe">
              <div className="map-skeleton-pulse" />
            </div>
            <div className="map-skeleton-text">
              <div className="map-loading-spinner" />
              <span>Loading photo locations...</span>
            </div>
          </div>
        </div>
      )}

      {/* Error message */}
      {error && (
        <div className="map-error-message">
          <span>Failed to load photos: {error.message}</span>
        </div>
      )}
      
      {/* Empty state */}
      {!isLoading && !error && geoPhotos.length === 0 && (
        <div className="map-empty-state">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/>
            <circle cx="12" cy="10" r="3"/>
          </svg>
          <h3>No photos with location data</h3>
          <p>Upload photos with GPS coordinates or add location info manually to see them on the map.</p>
        </div>
      )}

      {/* View mode toggle */}
      <div className="map-view-toggle">
        <button
          className={`map-view-btn ${viewMode === 'globe' ? 'active' : ''}`}
          onClick={() => setViewMode('globe')}
          title="3D Globe View"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="10"/>
            <line x1="2" y1="12" x2="22" y2="12"/>
            <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>
          </svg>
          Globe
        </button>
        <button
          className={`map-view-btn ${viewMode === 'flat' ? 'active' : ''}`}
          onClick={() => setViewMode('flat')}
          title="Flat Map View"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="3" y="3" width="18" height="18" rx="2"/>
            <path d="M3 9h18M9 3v18"/>
          </svg>
          Flat
        </button>
      </div>

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

      {/* 3D Globe View */}
      {viewMode === 'globe' && geoPhotos.length > 0 && (
        <PhotoGlobe
          photos={geoPhotos}
          onPhotoClick={handleMarkerClick}
          onZoomIn={handleZoomToFlat}
          width={dimensions.width}
          height={dimensions.height}
        />
      )}

      {/* Flat Map View */}
      {viewMode === 'flat' && (
        <>
          {/* Tile layer switcher */}
          <TileLayerSwitcher 
            currentLayer={tileLayer} 
            onChange={setTileLayer} 
          />

          {/* Main Map */}
          <MapContainer
            center={initialMapView.center}
            zoom={initialMapView.zoom}
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
            {!isLoading && geoPhotos.length > 0 && initialMapView.zoom === DEFAULT_ZOOM && (
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
                  onHover={handleMarkerHover}
                  isSelected={selectedPhoto?.id === photo.id}
                  isHovered={hoveredPhotoId === photo.id}
                />
              ))}
            </MarkerClusterGroup>
          </MapContainer>
        </>
      )}

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
