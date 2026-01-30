/**
 * PhotoGrid - 照片网格组件
 * 
 * 响应式照片网格布局
 * 支持加载状态、空状态
 */

import React from 'react';
import { motion } from 'framer-motion';
import { Skeleton, Card } from '@heroui/react';
import { Image } from 'lucide-react';
import PhotoCard from './PhotoCard';

// Animation variants
const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.03 }
  }
};

const itemVariants = {
  hidden: { opacity: 0, scale: 0.9 },
  visible: { 
    opacity: 1, 
    scale: 1,
    transition: { duration: 0.2 }
  }
};

// Skeleton card
function SkeletonCard() {
  return (
    <Card className="overflow-hidden">
      <Skeleton className="aspect-square w-full" />
    </Card>
  );
}

export default function PhotoGrid({
  photos = [],
  isLoading = false,
  emptyTitle = 'No photos',
  emptyMessage = 'No photos to display.',
  emptyIcon: EmptyIcon = Image,
  onPhotoSelect,
  onToggleFavorite,
  onPhotoDelete,
  onEditTags,
  showActions = true,
  columns = 'auto', // 'auto' | 2 | 3 | 4 | 5 | 6
  aspectRatio = '1'
}) {
  // Column class mapping
  const columnClasses = {
    'auto': 'grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6',
    2: 'grid-cols-2',
    3: 'grid-cols-2 sm:grid-cols-3',
    4: 'grid-cols-2 sm:grid-cols-3 md:grid-cols-4',
    5: 'grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5',
    6: 'grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6'
  };

  // Loading state
  if (isLoading) {
    return (
      <div className={`grid gap-3 ${columnClasses[columns]}`}>
        {[...Array(12)].map((_, i) => (
          <SkeletonCard key={i} />
        ))}
      </div>
    );
  }

  // Empty state
  if (photos.length === 0) {
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="flex flex-col items-center justify-center py-16 text-center"
      >
        <div className="w-20 h-20 rounded-full bg-default-100 flex items-center justify-center mb-4">
          <EmptyIcon className="w-10 h-10 text-default-400" />
        </div>
        <h3 className="text-lg font-medium text-default-700 mb-2">
          {emptyTitle}
        </h3>
        <p className="text-default-500 text-sm max-w-md">
          {emptyMessage}
        </p>
      </motion.div>
    );
  }

  // Photo grid
  return (
    <motion.div
      variants={containerVariants}
      initial="hidden"
      animate="visible"
      className={`grid gap-3 ${columnClasses[columns]}`}
    >
      {photos.map((photo, index) => (
        <motion.div key={photo.id} variants={itemVariants}>
          <PhotoCard
            photo={photo}
            onSelect={() => onPhotoSelect?.(photo, index)}
            onToggleFavorite={onToggleFavorite}
            onDelete={onPhotoDelete}
            onEditTags={onEditTags}
            showActions={showActions}
            aspectRatio={aspectRatio}
          />
        </motion.div>
      ))}
    </motion.div>
  );
}
