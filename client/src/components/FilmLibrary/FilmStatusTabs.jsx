/**
 * FilmStatusTabs - 胶片状态筛选 Tabs 组件
 * 
 * 使用 HeroUI Tabs 展示状态筛选器
 * 显示各状态的数量统计
 */

import React from 'react';
import { Tabs, Tab, Chip, Select, SelectItem } from '@heroui/react';
import { 
  Package, 
  Camera, 
  Disc3, 
  FlaskConical, 
  CheckCircle2, 
  Archive,
  List,
  Filter
} from 'lucide-react';

// Status configuration
const STATUS_OPTIONS = [
  { value: 'all', label: 'All', icon: List, color: 'default' },
  { value: 'in_stock', label: 'In Stock', icon: Package, color: 'success' },
  { value: 'loaded', label: 'Loaded', icon: Camera, color: 'primary' },
  { value: 'shot', label: 'Shot', icon: Disc3, color: 'warning' },
  { value: 'sent_to_lab', label: 'At Lab', icon: FlaskConical, color: 'secondary' },
  { value: 'developed', label: 'Developed', icon: CheckCircle2, color: 'success' },
  { value: 'archived', label: 'Archived', icon: Archive, color: 'default' }
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
    <div className="flex flex-col sm:flex-row sm:items-center gap-4 mb-6">
      {/* Status Tabs */}
      <Tabs
        aria-label="Film status"
        selectedKey={selectedStatus}
        onSelectionChange={onStatusChange}
        color="primary"
        variant="underlined"
        classNames={{
          base: 'w-full sm:w-auto',
          tabList: 'gap-4 w-full sm:w-auto relative rounded-none p-0 border-b border-divider',
          cursor: 'w-full bg-primary',
          tab: 'max-w-fit px-0 h-10',
          tabContent: 'group-data-[selected=true]:text-primary'
        }}
      >
        {STATUS_OPTIONS.map(option => {
          const Icon = option.icon;
          const count = getCounts(option.value);
          return (
            <Tab
              key={option.value}
              title={
                <div className="flex items-center gap-2">
                  <Icon className="w-4 h-4" />
                  <span className="hidden sm:inline">{option.label}</span>
                  <Chip
                    size="sm"
                    variant="flat"
                    color={selectedStatus === option.value ? 'primary' : 'default'}
                    className="h-5 min-w-6"
                  >
                    {count}
                  </Chip>
                </div>
              }
            />
          );
        })}
      </Tabs>

      {/* Format Filter */}
      <div className="flex items-center gap-2 sm:ml-auto">
        <Select
          size="sm"
          variant="bordered"
          label="Format"
          labelPlacement="outside-left"
          placeholder="All"
          selectedKeys={formatFilter ? [formatFilter] : []}
          onSelectionChange={(keys) => {
            const value = Array.from(keys)[0] || '';
            onFormatChange?.(value);
          }}
          className="w-40"
          classNames={{
            label: 'text-default-500 text-sm',
            trigger: 'min-h-8 h-8'
          }}
          startContent={<Filter className="w-3.5 h-3.5 text-default-400" />}
        >
          {availableFormats.map(fmt => (
            <SelectItem key={fmt} textValue={fmt}>
              {fmt === '135' ? '35mm (135)' : fmt === '120' ? 'Medium (120)' : fmt}
            </SelectItem>
          ))}
        </Select>
      </div>
    </div>
  );
}
