/**
 * FilmInventoryGrid - 胶片库存网格组件
 * 
 * 模仿原来的CSS grid设计:
 * - 默认卡片 1:1 正方形
 * - 展开的卡片占两列 (2:1)
 * - 响应式网格布局
 */

import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { Skeleton } from '@heroui/react';
import { Package } from 'lucide-react';
import FilmInventoryCard from './FilmInventoryCard';

// Stagger animation variants
const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.03
    }
  }
};

const itemVariants = {
  hidden: { opacity: 0, scale: 0.95 },
  visible: { 
    opacity: 1, 
    scale: 1,
    transition: { duration: 0.2 }
  }
};

// Skeleton loading card - 1:1 grid style
function SkeletonCard() {
  return (
    <div className="rounded-xl overflow-hidden bg-white dark:bg-zinc-800">
      <Skeleton className="aspect-square w-full" />
    </div>
  );
}

export default function FilmInventoryGrid({
  items = [],
  films = [],
  isLoading = false,
  onLoad,
  onUnload,
  onLogShots,
  onDevelop,
  onCreateRoll,
  onArchive,
  onEdit,
  onDelete,
  onViewRoll,
  onToggleNegativeArchived
}) {
  // 当前展开的卡片ID
  const [expandedItemId, setExpandedItemId] = useState(null);
  
  // Create film lookup map for performance
  const filmMap = React.useMemo(() => {
    const map = new Map();
    films.forEach(f => map.set(f.id, f));
    return map;
  }, [films]);

  // Loading state - grid style
  if (isLoading) {
    return (
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
        {[...Array(12)].map((_, i) => (
          <SkeletonCard key={i} />
        ))}
      </div>
    );
  }

  // Empty state
  if (items.length === 0) {
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="flex flex-col items-center justify-center py-16 text-center"
      >
        <div className="w-20 h-20 rounded-full bg-default-100 flex items-center justify-center mb-4">
          <Package className="w-10 h-10 text-default-400" />
        </div>
        <h3 className="text-lg font-medium text-default-700 mb-2">
          No inventory records
        </h3>
        <p className="text-default-500 text-sm max-w-md">
          No film items match the current filters. Try adjusting your filters or add new film to your inventory.
        </p>
      </motion.div>
    );
  }

  // Grid of cards - 使用原来的CSS grid样式
  return (
    <motion.div
      variants={containerVariants}
      initial="hidden"
      animate="visible"
      className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4"
      style={{ alignItems: 'start' }}
    >
      {items.map(item => {
        const isExpanded = expandedItemId === item.id;
        return (
          <motion.div 
            key={item.id} 
            variants={itemVariants}
            className={isExpanded ? 'col-span-2' : ''}
            layout
          >
            <FilmInventoryCard
              item={item}
              film={filmMap.get(item.film_id)}
              isExpanded={isExpanded}
              onToggleExpand={() => setExpandedItemId(isExpanded ? null : item.id)}
              onLoad={onLoad}
              onUnload={onUnload}
              onLogShots={onLogShots}
              onDevelop={onDevelop}
              onCreateRoll={onCreateRoll}
              onArchive={onArchive}
              onEdit={onEdit}
              onDelete={onDelete}
              onViewRoll={onViewRoll}
              onToggleNegativeArchived={onToggleNegativeArchived}
            />
          </motion.div>
        );
      })}
    </motion.div>
  );
}
