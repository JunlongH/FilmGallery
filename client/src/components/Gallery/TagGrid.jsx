/**
 * TagGrid - 标签/主题网格组件
 * 
 * 展示标签卡片的响应式网格
 */

import React from 'react';
import { motion } from 'framer-motion';
import { Skeleton, Card, CardBody } from '@heroui/react';
import { Tags } from 'lucide-react';
import TagCard from './TagCard';

// Animation variants
const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.05 }
  }
};

const itemVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: { 
    opacity: 1, 
    y: 0,
    transition: { duration: 0.3 }
  }
};

// Skeleton card
function SkeletonCard() {
  return (
    <Card className="overflow-hidden">
      <CardBody className="p-0">
        <Skeleton className="aspect-[4/3] w-full" />
      </CardBody>
    </Card>
  );
}

export default function TagGrid({
  tags = [],
  isLoading = false,
  onTagSelect,
  emptyTitle = 'No themes yet',
  emptyMessage = 'Add tags to your photos to see them here.'
}) {
  // Loading state
  if (isLoading) {
    return (
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
        {[...Array(10)].map((_, i) => (
          <SkeletonCard key={i} />
        ))}
      </div>
    );
  }

  // Empty state
  if (tags.length === 0) {
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="flex flex-col items-center justify-center py-16 text-center"
      >
        <div className="w-20 h-20 rounded-full bg-default-100 flex items-center justify-center mb-4">
          <Tags className="w-10 h-10 text-default-400" />
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

  // Tag grid
  return (
    <motion.div
      variants={containerVariants}
      initial="hidden"
      animate="visible"
      className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4"
    >
      {tags.map(tag => (
        <motion.div key={tag.id} variants={itemVariants}>
          <TagCard
            tag={tag}
            onSelect={onTagSelect}
          />
        </motion.div>
      ))}
    </motion.div>
  );
}
