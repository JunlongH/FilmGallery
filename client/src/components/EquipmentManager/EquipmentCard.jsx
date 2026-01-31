/**
 * EquipmentCard - 设备卡片组件
 * 
 * 使用 HeroUI Card 展示单个设备项
 * 支持图片、基本信息、选中状态
 */

import React from 'react';
import { Card, CardBody, Image, Chip } from '@heroui/react';
import { Camera, Aperture, Zap, Box, Scan, Film } from 'lucide-react';
import { buildUploadUrl } from '../../api';
import { addCacheKey } from '../../utils/imageOptimization';

// Icon mapping for equipment types
const TYPE_ICONS = {
  cameras: Camera,
  lenses: Aperture,
  flashes: Zap,
  'film-backs': Box,
  scanners: Scan,
  films: Film
};

export default function EquipmentCard({
  item,
  type = 'cameras',
  isSelected = false,
  onSelect
}) {
  const Icon = TYPE_ICONS[type] || Camera;
  const imagePath = item.image_path || item.thumbPath || item.thumbnail_url;
  const imageUrl = imagePath ? addCacheKey(buildUploadUrl(imagePath), item.updated_at) : null;

  // Generate subtitle based on type
  const getSubtitle = () => {
    if (type === 'films') {
      return `ISO ${item.iso || '?'} • ${item.format || '135'}`;
    }
    if (type === 'cameras') {
      const parts = [];
      if (item.brand) parts.push(item.brand);
      if (item.type) parts.push(item.type);
      return parts.join(' • ') || null;
    }
    if (type === 'lenses') {
      const parts = [];
      if (item.brand) parts.push(item.brand);
      if (item.mount) parts.push(item.mount);
      return parts.join(' • ') || null;
    }
    return item.brand || null;
  };

  // Get status chip for items that have status
  const getStatusChip = () => {
    if (item.status === 'retired') {
      return <Chip size="sm" color="default" variant="flat">Retired</Chip>;
    }
    if (item.status === 'sold') {
      return <Chip size="sm" color="warning" variant="flat">Sold</Chip>;
    }
    return null;
  };

  const subtitle = getSubtitle();
  const statusChip = getStatusChip();

  return (
    <Card
      isPressable
      onPress={() => onSelect?.(item)}
      className={`
        overflow-hidden transition-all duration-200
        ${isSelected 
          ? 'ring-2 ring-primary bg-primary/5 border-primary' 
          : 'hover:bg-default-100 border-transparent'
        }
        border
      `}
    >
      <CardBody className="p-0 flex flex-row gap-0 h-20">
        {/* Thumbnail */}
        <div className="w-20 h-20 flex-shrink-0 bg-default-100 flex items-center justify-center overflow-hidden">
          {imageUrl ? (
            <Image
              src={imageUrl}
              alt={item.name}
              classNames={{
                wrapper: 'w-full h-full',
                img: 'object-cover w-full h-full'
              }}
              loading="lazy"
            />
          ) : (
            <Icon className="w-8 h-8 text-default-300" />
          )}
        </div>

        {/* Info */}
        <div className="flex-1 p-3 flex flex-col justify-center min-w-0">
          <div className="flex items-start gap-2">
            <h4 className="font-medium text-sm text-default-800 truncate flex-1">
              {item.name}
            </h4>
            {statusChip}
          </div>
          {subtitle && (
            <p className="text-xs text-default-500 mt-0.5 truncate">
              {subtitle}
            </p>
          )}
          {type === 'films' && item.brand && (
            <p className="text-xs text-default-400 mt-0.5 truncate">
              {item.brand}
            </p>
          )}
        </div>
      </CardBody>
    </Card>
  );
}
