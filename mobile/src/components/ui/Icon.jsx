/**
 * Icon Component
 * 
 * Unified icon wrapper supporting both Lucide and MaterialCommunityIcons.
 * Provides consistent interface for icon usage throughout the app.
 * 
 * @example
 * // Lucide icon (default)
 * <Icon name="Camera" size={24} color="#5A4632" />
 * 
 * // MaterialCommunity icon
 * <Icon name="filmstrip" size={24} color="#5A4632" variant="material" />
 */
import React from 'react';
import { View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as LucideIcons from 'lucide-react-native';

/**
 * Icon name mapping from simplified names to Lucide component names
 */
const LUCIDE_ICON_MAP = {
  // Navigation
  'home': 'Home',
  'map': 'Map',
  'map-pin': 'MapPin',
  'globe': 'Globe',
  'grid': 'LayoutGrid',
  'menu': 'Menu',
  'settings': 'Settings',
  'search': 'Search',
  'filter': 'Filter',
  'x': 'X',
  'chevron-left': 'ChevronLeft',
  'chevron-right': 'ChevronRight',
  'chevron-down': 'ChevronDown',
  'chevron-up': 'ChevronUp',
  
  // Photography
  'camera': 'Camera',
  'camera-off': 'CameraOff',
  'aperture': 'Aperture',
  'image': 'Image',
  'images': 'Images',
  'film': 'Film',
  'focus': 'Focus',
  'flash': 'Zap',
  'flash-off': 'ZapOff',
  
  // Actions
  'heart': 'Heart',
  'heart-filled': 'Heart',
  'star': 'Star',
  'bookmark': 'Bookmark',
  'share': 'Share2',
  'download': 'Download',
  'upload': 'Upload',
  'edit': 'Edit3',
  'trash': 'Trash2',
  'plus': 'Plus',
  'minus': 'Minus',
  'check': 'Check',
  'refresh': 'RefreshCw',
  
  // Objects
  'package': 'Package',
  'box': 'Box',
  'tag': 'Tag',
  'tags': 'Tags',
  'calendar': 'Calendar',
  'clock': 'Clock',
  'folder': 'Folder',
  'file': 'File',
  
  // Charts & Data
  'chart': 'BarChart3',
  'pie-chart': 'PieChart',
  'trending-up': 'TrendingUp',
  'activity': 'Activity',
  
  // Status
  'info': 'Info',
  'alert': 'AlertCircle',
  'warning': 'AlertTriangle',
  'error': 'XCircle',
  'success': 'CheckCircle',
  
  // Misc
  'sun': 'Sun',
  'moon': 'Moon',
  'eye': 'Eye',
  'eye-off': 'EyeOff',
  'lock': 'Lock',
  'unlock': 'Unlock',
  'link': 'Link',
  'external': 'ExternalLink',
  'copy': 'Copy',
  'layers': 'Layers',
};

/**
 * Icon component props
 * @typedef {Object} IconProps
 * @property {string} name - Icon name
 * @property {number} [size=24] - Icon size in pixels
 * @property {string} [color='#5A4632'] - Icon color
 * @property {'lucide'|'material'} [variant='lucide'] - Icon library to use
 * @property {object} [style] - Additional styles
 */

/**
 * Unified Icon component
 */
export default function Icon({ 
  name, 
  size = 24, 
  color = '#5A4632', 
  variant = 'lucide',
  style,
  ...props 
}) {
  // Use MaterialCommunityIcons if variant is 'material'
  if (variant === 'material') {
    return (
      <MaterialCommunityIcons 
        name={name} 
        size={size} 
        color={color} 
        style={style}
        {...props}
      />
    );
  }

  // Try to get Lucide icon
  const lucideIconName = LUCIDE_ICON_MAP[name.toLowerCase()] || name;
  const LucideIcon = LucideIcons[lucideIconName];

  if (LucideIcon) {
    return (
      <LucideIcon 
        size={size} 
        color={color} 
        style={style}
        strokeWidth={2}
        {...props}
      />
    );
  }

  // Fallback to MaterialCommunityIcons
  console.warn(`[Icon] "${name}" not found in Lucide, falling back to Material`);
  return (
    <MaterialCommunityIcons 
      name={name} 
      size={size} 
      color={color} 
      style={style}
      {...props}
    />
  );
}

/**
 * Get icon component for use in navigation or other contexts
 */
export function getIconComponent(name, variant = 'lucide') {
  return ({ size, color }) => (
    <Icon name={name} size={size} color={color} variant={variant} />
  );
}
