/**
 * EquipmentList - 设备列表组件
 * 
 * 展示设备卡片的滚动列表
 * 支持加载状态、空状态、添加按钮
 */

import React from 'react';
import { Button, Skeleton, ScrollShadow } from '@heroui/react';
import { Plus, Package } from 'lucide-react';
import { motion } from 'framer-motion';
import EquipmentCard from './EquipmentCard';

// Animation variants
const listVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.05 }
  }
};

const itemVariants = {
  hidden: { opacity: 0, x: -20 },
  visible: { opacity: 1, x: 0 }
};

// Skeleton card
function SkeletonCard() {
  return (
    <div className="flex gap-3 p-2 bg-default-50 rounded-xl h-20">
      <Skeleton className="w-20 h-16 rounded-lg flex-shrink-0" />
      <div className="flex-1 space-y-2 py-1">
        <Skeleton className="h-4 w-3/4 rounded-lg" />
        <Skeleton className="h-3 w-1/2 rounded-lg" />
      </div>
    </div>
  );
}

export default function EquipmentList({
  items = [],
  type = 'cameras',
  selectedId = null,
  onSelect,
  onAdd,
  isLoading = false
}) {
  // Get singular form for messages
  const getSingularType = () => {
    if (type === 'films') return 'film';
    if (type === 'flashes') return 'flash';
    if (type === 'film-backs') return 'film back';
    return type.slice(0, -1); // cameras -> camera, lenses -> lens, scanners -> scanner
  };

  // Loading state
  if (isLoading) {
    return (
      <div className="space-y-3 p-2">
        {[...Array(6)].map((_, i) => (
          <SkeletonCard key={i} />
        ))}
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between p-3 border-b border-zinc-200 dark:border-zinc-700">
        <span className="text-sm text-default-500">
          {items.length} {items.length === 1 ? 'item' : 'items'}
        </span>
        <Button
          size="sm"
          color="primary"
          startContent={<Plus className="w-4 h-4" />}
          onPress={onAdd}
        >
          Add New
        </Button>
      </div>

      {/* List */}
      {items.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center p-8 text-center">
          <div className="w-16 h-16 rounded-full bg-default-100 flex items-center justify-center mb-4">
            <Package className="w-8 h-8 text-default-400" />
          </div>
          <h4 className="text-default-700 font-medium mb-2">
            No {type} yet
          </h4>
          <p className="text-default-500 text-sm mb-4">
            Add your first {getSingularType()} to get started
          </p>
          <Button
            color="primary"
            startContent={<Plus className="w-4 h-4" />}
            onPress={onAdd}
          >
            Add {getSingularType().charAt(0).toUpperCase() + getSingularType().slice(1)}
          </Button>
        </div>
      ) : (
        <ScrollShadow className="flex-1">
          <motion.div
            variants={listVariants}
            initial="hidden"
            animate="visible"
            className="space-y-2 p-2"
          >
            {items.map(item => (
              <motion.div key={item.id} variants={itemVariants}>
                <EquipmentCard
                  item={item}
                  type={type}
                  isSelected={selectedId === item.id}
                  onSelect={() => onSelect?.(item.id)}
                />
              </motion.div>
            ))}
          </motion.div>
        </ScrollShadow>
      )}
    </div>
  );
}
