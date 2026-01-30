/**
 * FilmInventoryGrid - 胶片库存网格组件
 * 
 * 展示胶片库存卡片的响应式网格
 * 支持加载状态、空状态、筛选
 */

import React from 'react';
import { motion } from 'framer-motion';
import { Skeleton, Card, CardBody } from '@heroui/react';
import { Package } from 'lucide-react';
import FilmInventoryCard from './FilmInventoryCard';

// Stagger animation variants
const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.05
    }
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

// Skeleton loading card
function SkeletonCard() {
  return (
    <Card className="overflow-hidden">
      <CardBody className="p-0 gap-0">
        <Skeleton className="aspect-[4/3] w-full" />
        <div className="p-3 space-y-2">
          <Skeleton className="h-4 w-3/4 rounded-lg" />
          <Skeleton className="h-3 w-1/2 rounded-lg" />
        </div>
      </CardBody>
    </Card>
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
  // Create film lookup map for performance
  const filmMap = React.useMemo(() => {
    const map = new Map();
    films.forEach(f => map.set(f.id, f));
    return map;
  }, [films]);

  // Loading state
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

  // Grid of cards
  return (
    <motion.div
      variants={containerVariants}
      initial="hidden"
      animate="visible"
      className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4"
    >
      {items.map(item => (
        <motion.div key={item.id} variants={itemVariants}>
          <FilmInventoryCard
            item={item}
            film={filmMap.get(item.film_id)}
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
      ))}
    </motion.div>
  );
}
