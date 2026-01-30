/**
 * PhotoCard - 照片卡片组件
 * 
 * 使用 HeroUI Card + Image 展示单张照片
 * 支持 hover 效果、喜欢按钮、快捷操作
 */

import React, { useState } from 'react';
import { Card, Image, Button, Tooltip } from '@heroui/react';
import { motion } from 'framer-motion';
import { Heart, Trash2, Tag, Eye, MoreHorizontal, Star } from 'lucide-react';
import { LazyLoadImage } from 'react-lazy-load-image-component';
import { buildUploadUrl } from '../../api';
import 'react-lazy-load-image-component/src/effects/opacity.css';

// Get best available image URL for a photo
const getPhotoUrl = (photo, preferThumb = true) => {
  let candidate = null;
  
  if (preferThumb) {
    if (photo.positive_thumb_rel_path) candidate = `/uploads/${photo.positive_thumb_rel_path}`;
    else if (photo.thumb_rel_path) candidate = `/uploads/${photo.thumb_rel_path}`;
  }
  
  if (!candidate) {
    if (photo.positive_rel_path) candidate = `/uploads/${photo.positive_rel_path}`;
    else if (photo.full_rel_path) candidate = `/uploads/${photo.full_rel_path}`;
    else if (photo.filename) candidate = photo.filename;
  }
  
  if (!candidate) return null;
  return buildUploadUrl(candidate);
};

export default function PhotoCard({
  photo,
  onSelect,
  onToggleFavorite,
  onDelete,
  onEditTags,
  showActions = true,
  aspectRatio = '1', // '1' for square, '4/3', '16/9', etc.
  size = 'md' // 'sm' | 'md' | 'lg'
}) {
  const [isHovered, setIsHovered] = useState(false);
  const [imageError, setImageError] = useState(false);
  
  const isFavorite = (photo.rating | 0) === 1;
  const imageUrl = getPhotoUrl(photo, true);

  const sizeClasses = {
    sm: 'min-w-[120px]',
    md: 'min-w-[160px]',
    lg: 'min-w-[200px]'
  };

  const handleFavoriteClick = (e) => {
    e.stopPropagation();
    onToggleFavorite?.(photo, isFavorite);
  };

  const handleDeleteClick = (e) => {
    e.stopPropagation();
    onDelete?.(photo);
  };

  const handleTagsClick = (e) => {
    e.stopPropagation();
    onEditTags?.(photo);
  };

  return (
    <motion.div
      whileHover={{ scale: 1.02 }}
      transition={{ duration: 0.2 }}
    >
      <Card
        isPressable
        onPress={() => onSelect?.(photo)}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        className={`
          group overflow-hidden border border-divider/50
          hover:border-primary/30 hover:shadow-lg
          transition-all duration-300
          ${sizeClasses[size]}
        `}
      >
        <div className="relative" style={{ aspectRatio }}>
          {/* Image */}
          {imageUrl && !imageError ? (
            <LazyLoadImage
              src={imageUrl}
              alt={photo.title || `Photo ${photo.id}`}
              effect="opacity"
              className="w-full h-full object-cover"
              onError={() => setImageError(true)}
            />
          ) : (
            <div className="w-full h-full bg-default-100 flex items-center justify-center">
              <Eye className="w-8 h-8 text-default-300" />
            </div>
          )}
          
          {/* Gradient overlay */}
          <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
          
          {/* Favorite indicator (always visible if favorited) */}
          {isFavorite && (
            <div className="absolute top-2 right-2">
              <div className="w-7 h-7 rounded-full bg-danger/90 flex items-center justify-center shadow-lg">
                <Heart className="w-4 h-4 text-white fill-white" />
              </div>
            </div>
          )}
          
          {/* Hover actions */}
          {showActions && isHovered && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="absolute bottom-2 left-2 right-2 flex justify-between items-center"
            >
              {/* Left actions */}
              <div className="flex gap-1">
                <Tooltip content={isFavorite ? 'Unlike' : 'Like'}>
                  <Button
                    isIconOnly
                    size="sm"
                    variant="flat"
                    className="bg-white/20 backdrop-blur-sm text-white hover:bg-white/30"
                    onPress={handleFavoriteClick}
                  >
                    <Heart className={`w-4 h-4 ${isFavorite ? 'fill-current text-danger' : ''}`} />
                  </Button>
                </Tooltip>
                
                {onEditTags && (
                  <Tooltip content="Edit Tags">
                    <Button
                      isIconOnly
                      size="sm"
                      variant="flat"
                      className="bg-white/20 backdrop-blur-sm text-white hover:bg-white/30"
                      onPress={handleTagsClick}
                    >
                      <Tag className="w-4 h-4" />
                    </Button>
                  </Tooltip>
                )}
              </div>
              
              {/* Right actions */}
              {onDelete && (
                <Tooltip content="Remove" color="danger">
                  <Button
                    isIconOnly
                    size="sm"
                    variant="flat"
                    className="bg-white/20 backdrop-blur-sm text-white hover:bg-danger/80"
                    onPress={handleDeleteClick}
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </Tooltip>
              )}
            </motion.div>
          )}
        </div>
      </Card>
    </motion.div>
  );
}
