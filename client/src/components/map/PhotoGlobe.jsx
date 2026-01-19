/**
 * PhotoGlobe.jsx
 * 
 * 3D Globe component for displaying photos at world-level zoom.
 * Uses react-globe.gl for spherical Earth visualization.
 * Provides a cinematic view when zoomed out to see the entire world.
 * 
 * @module components/map/PhotoGlobe
 */
import React, { useRef, useMemo, useCallback, useEffect, useState } from 'react';
import Globe from 'react-globe.gl';
import { API_BASE } from '../../api';

/**
 * Get thumbnail URL for a photo
 */
const getThumbUrl = (photo) => {
  const thumbPath = photo.thumb_rel_path || photo.positive_thumb_rel_path || photo.negative_thumb_rel_path;
  if (thumbPath) {
    return `${API_BASE}/uploads/${thumbPath}`;
  }
  return null;
};

/**
 * Group nearby photos into clusters for globe display
 */
const clusterPhotos = (photos, gridSize = 10) => {
  const clusters = new Map();
  
  photos.forEach(photo => {
    // Create grid cell key
    const latCell = Math.floor(photo.latitude / gridSize) * gridSize;
    const lngCell = Math.floor(photo.longitude / gridSize) * gridSize;
    const key = `${latCell},${lngCell}`;
    
    if (!clusters.has(key)) {
      clusters.set(key, {
        lat: latCell + gridSize / 2,
        lng: lngCell + gridSize / 2,
        photos: [],
        count: 0,
      });
    }
    
    const cluster = clusters.get(key);
    cluster.photos.push(photo);
    cluster.count++;
  });
  
  return Array.from(clusters.values());
};

/**
 * PhotoGlobe Component
 * 
 * Renders a 3D globe with photo markers.
 * 
 * @param {Object} props
 * @param {Array} props.photos - Array of photos with lat/lng
 * @param {Function} props.onPhotoClick - Click handler for photo/cluster
 * @param {Function} props.onZoomIn - Called when user wants to zoom into flat map
 * @param {number} props.width - Container width
 * @param {number} props.height - Container height
 */
export default function PhotoGlobe({ 
  photos = [], 
  onPhotoClick, 
  onZoomIn,
  width,
  height 
}) {
  const globeRef = useRef();
  const [hoveredCluster, setHoveredCluster] = useState(null);

  // Cluster photos for globe display
  const clusters = useMemo(() => {
    if (!photos || photos.length === 0) return [];
    return clusterPhotos(photos, 15); // 15-degree grid
  }, [photos]);

  // Configure globe on mount
  useEffect(() => {
    if (globeRef.current) {
      // Set initial view
      globeRef.current.pointOfView({ lat: 30, lng: 0, altitude: 2.5 }, 0);
      
      // Enable auto-rotation for visual appeal
      globeRef.current.controls().autoRotate = true;
      globeRef.current.controls().autoRotateSpeed = 0.3;
      
      // Enable smooth controls
      globeRef.current.controls().enableDamping = true;
      globeRef.current.controls().dampingFactor = 0.1;
    }
  }, []);

  // Stop auto-rotation on user interaction
  const handleInteraction = useCallback(() => {
    if (globeRef.current) {
      globeRef.current.controls().autoRotate = false;
    }
  }, []);

  /**
   * Handle click on a cluster point
   */
  const handlePointClick = useCallback((point) => {
    if (point && point.photos && point.photos.length > 0) {
      if (point.count === 1) {
        // Single photo - show preview
        if (onPhotoClick) {
          onPhotoClick(point.photos[0], { x: width / 2, y: height / 2 });
        }
      } else {
        // Multiple photos - zoom into flat map at this location
        if (onZoomIn) {
          onZoomIn({ lat: point.lat, lng: point.lng, zoom: 8 });
        }
      }
    }
  }, [onPhotoClick, onZoomIn, width, height]);

  /**
   * Handle hover on a cluster point
   */
  const handlePointHover = useCallback((point) => {
    setHoveredCluster(point);
    // Change cursor
    document.body.style.cursor = point ? 'pointer' : 'grab';
  }, []);

  /**
   * Render custom HTML element for each point
   */
  const pointLabel = useCallback((point) => {
    if (!point) return '';
    
    const thumbUrl = point.photos[0] ? getThumbUrl(point.photos[0]) : null;
    const countBadge = point.count > 1 
      ? `<div class="globe-point-count">${point.count}</div>` 
      : '';
    
    return `
      <div class="globe-point-tooltip">
        ${thumbUrl ? `<img src="${thumbUrl}" alt="" />` : ''}
        ${countBadge}
        <div class="globe-point-location">
          ${point.photos[0]?.city || point.photos[0]?.country || 'Unknown location'}
        </div>
      </div>
    `;
  }, []);

  /**
   * Custom point color based on cluster size
   */
  const pointColor = useCallback((point) => {
    if (point.count > 50) return '#ef4444'; // red for large clusters
    if (point.count > 10) return '#f59e0b'; // amber for medium
    return '#22c55e'; // green for small
  }, []);

  /**
   * Point altitude (height above globe surface)
   */
  const pointAltitude = useCallback((point) => {
    return 0.01 + Math.min(point.count / 100, 0.1);
  }, []);

  /**
   * Point radius based on cluster size
   */
  const pointRadius = useCallback((point) => {
    return 0.3 + Math.min(point.count / 20, 0.8);
  }, []);

  return (
    <div 
      className="photo-globe-wrapper"
      onMouseDown={handleInteraction}
      onTouchStart={handleInteraction}
    >
      <Globe
        ref={globeRef}
        width={width}
        height={height}
        globeImageUrl="//unpkg.com/three-globe/example/img/earth-blue-marble.jpg"
        bumpImageUrl="//unpkg.com/three-globe/example/img/earth-topology.png"
        backgroundImageUrl="//unpkg.com/three-globe/example/img/night-sky.png"
        
        // Points (photo clusters)
        pointsData={clusters}
        pointLat="lat"
        pointLng="lng"
        pointColor={pointColor}
        pointAltitude={pointAltitude}
        pointRadius={pointRadius}
        pointLabel={pointLabel}
        onPointClick={handlePointClick}
        onPointHover={handlePointHover}
        
        // Atmosphere
        atmosphereColor="#3a82f7"
        atmosphereAltitude={0.15}
        
        // Animation
        animateIn={true}
      />
      
      {/* Zoom to flat map button */}
      <button 
        className="globe-zoom-flat-btn"
        onClick={() => onZoomIn && onZoomIn({ lat: 0, lng: 0, zoom: 3 })}
        title="Switch to flat map"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <rect x="3" y="3" width="18" height="18" rx="2" />
          <path d="M3 9h18M9 3v18" />
        </svg>
        Flat Map
      </button>

      {/* Photo count indicator */}
      <div className="globe-photo-count">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="12" cy="12" r="10"/>
          <line x1="2" y1="12" x2="22" y2="12"/>
          <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>
        </svg>
        <span>{photos.length} photos across {clusters.length} locations</span>
      </div>

      {/* Hovered cluster info */}
      {hoveredCluster && (
        <div className="globe-hover-info">
          <strong>{hoveredCluster.count} photo{hoveredCluster.count > 1 ? 's' : ''}</strong>
          <span>Click to {hoveredCluster.count > 1 ? 'explore' : 'view'}</span>
        </div>
      )}
    </div>
  );
}
