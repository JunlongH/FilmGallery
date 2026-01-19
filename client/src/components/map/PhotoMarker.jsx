/**
 * PhotoMarker.jsx
 * 
 * Custom marker component that displays photo thumbnails on the map.
 * Uses Leaflet's divIcon for custom HTML rendering.
 * 
 * @module components/map/PhotoMarker
 */
import React, { useMemo } from 'react';
import { Marker } from 'react-leaflet';
import L from 'leaflet';
import { API_BASE } from '../../api';

/**
 * Get the thumbnail URL for a photo
 */
const getThumbUrl = (photo) => {
  const apiBase = API_BASE;
  const thumbPath = photo.thumb_rel_path || photo.positive_thumb_rel_path || photo.negative_thumb_rel_path;
  
  if (thumbPath) {
    return `${apiBase}/uploads/${thumbPath}`;
  }
  
  // Fallback to full image
  const fullPath = photo.full_rel_path || photo.positive_rel_path || photo.negative_rel_path;
  if (fullPath) {
    return `${apiBase}/uploads/${fullPath}`;
  }
  
  return null;
};

/**
 * Create a custom div icon with photo thumbnail
 */
const createPhotoIcon = (photo, isSelected, isHovered) => {
  const thumbUrl = getThumbUrl(photo);
  const size = isSelected ? 56 : (isHovered ? 52 : 48);
  const borderColor = isSelected ? '#f59e0b' : (isHovered ? '#fbbf24' : '#ffffff');
  const borderWidth = isSelected ? 3 : (isHovered ? 3 : 2);
  const transform = isHovered && !isSelected ? 'scale(1.1)' : 'scale(1)';
  const zIndex = isHovered || isSelected ? 1000 : 'auto';
  
  const html = thumbUrl 
    ? `<div class="photo-marker ${isSelected ? 'selected' : ''} ${isHovered ? 'hovered' : ''}" style="
        width: ${size}px;
        height: ${size}px;
        border: ${borderWidth}px solid ${borderColor};
        box-shadow: 0 ${isHovered ? 4 : 2}px ${isHovered ? 16 : 8}px rgba(0,0,0,${isHovered ? 0.5 : 0.3});
        transform: ${transform};
        z-index: ${zIndex};
        transition: all 0.15s ease-out;
      ">
        <img src="${thumbUrl}" alt="" loading="lazy" />
      </div>`
    : `<div class="photo-marker photo-marker-placeholder ${isSelected ? 'selected' : ''} ${isHovered ? 'hovered' : ''}" style="
        width: ${size}px;
        height: ${size}px;
        border: ${borderWidth}px solid ${borderColor};
        transform: ${transform};
        z-index: ${zIndex};
        transition: all 0.15s ease-out;
      ">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
          <circle cx="8.5" cy="8.5" r="1.5"/>
          <polyline points="21,15 16,10 5,21"/>
        </svg>
      </div>`;

  return L.divIcon({
    html,
    className: `photo-marker-container ${isHovered ? 'hovered' : ''}`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
    popupAnchor: [0, -size / 2],
  });
};

/**
 * PhotoMarker Component
 * 
 * Renders a photo as a custom marker on the map.
 * 
 * @param {Object} props
 * @param {Object} props.photo - Photo data with latitude, longitude, thumb_rel_path
 * @param {Function} props.onClick - Click handler
 * @param {Function} props.onHover - Hover handler (mouseenter/mouseleave)
 * @param {boolean} props.isSelected - Whether this marker is selected
 * @param {boolean} props.isHovered - Whether this marker is hovered
 */
export default function PhotoMarker({ photo, onClick, onHover, isSelected, isHovered }) {
  // Memoize the icon to prevent unnecessary re-renders
  const icon = useMemo(() => {
    return createPhotoIcon(photo, isSelected, isHovered);
  }, [photo, isSelected, isHovered]);

  // Position
  const position = [photo.latitude, photo.longitude];

  /**
   * Handle marker click
   */
  const handleClick = (e) => {
    if (onClick) {
      // Pass the photo and the screen position for popup placement
      const containerPoint = e.containerPoint;
      onClick(photo, { x: containerPoint.x, y: containerPoint.y });
    }
  };

  /**
   * Handle mouse enter
   */
  const handleMouseOver = () => {
    if (onHover) {
      onHover(photo, true);
    }
  };

  /**
   * Handle mouse leave
   */
  const handleMouseOut = () => {
    if (onHover) {
      onHover(photo, false);
    }
  };

  return (
    <Marker
      position={position}
      icon={icon}
      eventHandlers={{
        click: handleClick,
        mouseover: handleMouseOver,
        mouseout: handleMouseOut,
      }}
    />
  );
}
