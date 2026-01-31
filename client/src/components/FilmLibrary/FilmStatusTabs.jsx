/**
 * FilmStatusTabs - 胶片状态筛选 Tabs 组件
 * 
 * 使用现代化 Chip 按钮样式展示状态筛选器
 * 显示各状态的数量统计和渐变色标识
 */

import React from 'react';
import { Chip, Select, SelectItem, Button, ScrollShadow } from '@heroui/react';
import { motion } from 'framer-motion';
import { 
  Package, 
  Camera, 
  Disc3, 
  FlaskConical, 
  CheckCircle2, 
  Archive,
  List,
  Filter,
  SlidersHorizontal
} from 'lucide-react';

// Status configuration with gradients
const STATUS_OPTIONS = [
  { value: 'all', label: 'All', icon: List, color: 'default', gradient: 'from-slate-500 to-gray-600' },
  { value: 'in_stock', label: 'In Stock', icon: Package, color: 'success', gradient: 'from-emerald-500 to-green-600' },
  { value: 'loaded', label: 'Loaded', icon: Camera, color: 'primary', gradient: 'from-blue-500 to-indigo-600' },
  { value: 'shot', label: 'Shot', icon: Disc3, color: 'warning', gradient: 'from-amber-500 to-orange-600' },
  { value: 'sent_to_lab', label: 'At Lab', icon: FlaskConical, color: 'secondary', gradient: 'from-purple-500 to-violet-600' },
  { value: 'developed', label: 'Developed', icon: CheckCircle2, color: 'success', gradient: 'from-teal-500 to-cyan-600' },
  { value: 'archived', label: 'Archived', icon: Archive, color: 'default', gradient: 'from-slate-400 to-gray-500' }
];

export default function FilmStatusTabs({
  selectedStatus = 'all',
  onStatusChange,
  statusCounts = {},
  totalCount = 0,
  formatFilter = '',
  onFormatChange,
  availableFormats = []
}) {
  // Calculate display counts
  const getCounts = (status) => {
    if (status === 'all') return totalCount;
    return statusCounts[status] || 0;
  };

  return (
    <div className="flex flex-col gap-4 mb-6">
      {/* Status Filter Pills */}
      <ScrollShadow 
        orientation="horizontal" 
        className="w-full pb-2"
        hideScrollBar
      >
        <div className="flex items-center gap-2 min-w-max">
          {STATUS_OPTIONS.map(option => {
            const Icon = option.icon;
            const count = getCounts(option.value);
            const isSelected = selectedStatus === option.value;
            
            return (
              <motion.div
                key={option.value}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
              >
                <Button
                  size="sm"
                  variant={isSelected ? 'shadow' : 'flat'}
                  className={`
                    gap-2 font-medium transition-all duration-200
                    ${isSelected 
                      ? `bg-gradient-to-r ${option.gradient} text-white shadow-lg` 
                      : 'bg-default-100/50 dark:bg-default-100/30 hover:bg-default-200/50'
                    }
                  `}
                  onPress={() => onStatusChange?.(option.value)}
                  startContent={<Icon className="w-4 h-4" />}
                  endContent={
                    <Chip
                      size="sm"
                      variant={isSelected ? 'solid' : 'flat'}
                      className={`
                        h-5 min-w-6 text-xs
                        ${isSelected 
                          ? 'bg-white/20 text-white' 
                          : 'bg-default-200/50 dark:bg-default-300/30'
                        }
                      `}
                    >
                      {count}
                    </Chip>
                  }
                >
                  <span className="hidden sm:inline">{option.label}</span>
                </Button>
              </motion.div>
            );
          })}
          
          {/* Divider */}
          <div className="w-px h-6 bg-divider mx-2" />
          
          {/* Format Filter */}
          <Select
            size="sm"
            variant="flat"
            placeholder="All Formats"
            selectedKeys={formatFilter ? [formatFilter] : []}
            onSelectionChange={(keys) => {
              const value = Array.from(keys)[0] || '';
              onFormatChange?.(value);
            }}
            className="w-36"
            classNames={{
              trigger: 'h-8 min-h-8 bg-default-100/50 dark:bg-default-100/30',
              value: 'text-xs'
            }}
            startContent={<SlidersHorizontal className="w-3.5 h-3.5 text-default-400" />}
          >
            {availableFormats.map(fmt => (
              <SelectItem key={fmt} textValue={fmt}>
                {fmt === '135' ? '35mm (135)' : fmt === '120' ? 'Medium (120)' : fmt}
              </SelectItem>
            ))}
          </Select>
        </div>
      </ScrollShadow>
    </div>
  );
}
