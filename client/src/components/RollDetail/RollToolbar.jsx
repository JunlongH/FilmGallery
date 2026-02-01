/**
 * RollToolbar - Action toolbar for roll detail page
 * 
 * Features:
 * - View mode toggle (positive/negative)
 * - Multi-select toggle
 * - Upload button
 * - Batch actions (render, download, contact sheet)
 * - Import options
 */
import React from 'react';
import { 
  Button, 
  ButtonGroup, 
  Dropdown, 
  DropdownTrigger, 
  DropdownMenu, 
  DropdownItem,
  Chip,
  Divider
} from '@heroui/react';
import { motion } from 'framer-motion';
import { 
  Upload, 
  Download, 
  Image, 
  Grid3X3, 
  CheckSquare, 
  Square,
  MoreHorizontal,
  FileImage,
  Palette,
  Import,
  Layers,
  Edit
} from 'lucide-react';

// Dropdown classNames 使用 Tailwind dark: 前缀实现主题响应
const dropdownClassNames = {
  content: "bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 shadow-lg"
};

// DropdownMenu itemClasses 用于样式化每个菜单项
const dropdownItemClasses = {
  base: "text-zinc-900 dark:text-zinc-100 data-[hover=true]:bg-zinc-100 dark:data-[hover=true]:bg-zinc-800",
  description: "text-zinc-500 dark:text-zinc-400"
};

export default function RollToolbar({
  viewMode,
  onViewModeChange,
  multiSelect,
  onMultiSelectChange,
  selectedCount = 0,
  totalCount = 0,
  onUpload,
  onBatchRender,
  onBatchDownload,
  onContactSheet,
  onImportPositive,
  onRawImport,
  onEditSelected,
  onSelectAll,
  onDeselectAll,
  onInvertSelection
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.2, duration: 0.3 }}
      className="flex flex-wrap items-center justify-between gap-4 mb-6 p-4 bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl"
    >
      {/* Left: View Controls */}
      <div className="flex items-center gap-4">
        {/* View Mode Toggle */}
        <ButtonGroup>
          <Button
            size="sm"
            variant={viewMode === 'positive' ? 'solid' : 'flat'}
            color={viewMode === 'positive' ? 'primary' : 'default'}
            onPress={() => onViewModeChange('positive')}
            startContent={<Image size={14} />}
          >
            Positive
          </Button>
          <Button
            size="sm"
            variant={viewMode === 'negative' ? 'solid' : 'flat'}
            color={viewMode === 'negative' ? 'primary' : 'default'}
            onPress={() => onViewModeChange('negative')}
            startContent={<Layers size={14} />}
          >
            Negative
          </Button>
        </ButtonGroup>

        <Divider orientation="vertical" className="h-6" />

        {/* Multi-Select */}
        <Button
          size="sm"
          variant={multiSelect ? 'solid' : 'flat'}
          color={multiSelect ? 'secondary' : 'default'}
          onPress={() => onMultiSelectChange(!multiSelect)}
          startContent={multiSelect ? <CheckSquare size={14} /> : <Square size={14} />}
        >
          {multiSelect ? `Selected ${selectedCount}` : 'Select'}
        </Button>
        
        {multiSelect && selectedCount > 0 && (
          <Button
            size="sm"
            color="primary"
            variant="solid"
            onPress={onEditSelected}
            startContent={<Edit size={14} />}
          >
            Edit Selected
          </Button>
        )}

        {multiSelect && (
          <Dropdown classNames={dropdownClassNames}>
             <DropdownTrigger>
               <Button size="sm" variant="flat" isIconOnly>
                 <MoreHorizontal size={14} />
               </Button>
             </DropdownTrigger>
             <DropdownMenu aria-label="Selection Actions" itemClasses={dropdownItemClasses}>
               <DropdownItem key="all" onPress={onSelectAll}>Select All</DropdownItem>
               <DropdownItem key="invert" onPress={onInvertSelection}>Invert</DropdownItem>
               <DropdownItem key="none" onPress={onDeselectAll} className="text-danger" color="danger">Deselect All</DropdownItem>
             </DropdownMenu>
          </Dropdown>
        )}

        {/* Photo Count */}
        <Chip size="sm" variant="flat">
          {totalCount} Photos
        </Chip>
      </div>

      {/* Right: Actions */}
      <div className="flex items-center gap-2">
        {/* Upload */}
        <Button
          size="sm"
          color="primary"
          variant="flat"
          startContent={<Upload size={14} />}
          onPress={onUpload}
        >
          Upload
        </Button>

        {/* Batch Actions */}
        <Dropdown classNames={dropdownClassNames}>
          <DropdownTrigger>
            <Button
              size="sm"
              variant="flat"
              startContent={<Grid3X3 size={14} />}
            >
              Batch
            </Button>
          </DropdownTrigger>
          <DropdownMenu aria-label="Batch actions" itemClasses={dropdownItemClasses}>
            <DropdownItem
              key="render"
              startContent={<Palette size={14} />}
              description="Render all photos with settings"
              onPress={onBatchRender}
            >
              Batch Render
            </DropdownItem>
            <DropdownItem
              key="download"
              startContent={<Download size={14} />}
              description="Download photos"
              onPress={onBatchDownload}
            >
              Batch Download
            </DropdownItem>
            <DropdownItem
              key="contact"
              startContent={<Grid3X3 size={14} />}
              description="Generate contact sheet"
              onPress={onContactSheet}
            >
              Contact Sheet
            </DropdownItem>
          </DropdownMenu>
        </Dropdown>

        {/* Import Actions */}
        <Dropdown classNames={dropdownClassNames}>
          <DropdownTrigger>
            <Button
              size="sm"
              variant="flat"
              startContent={<Import size={14} />}
            >
              Import
            </Button>
          </DropdownTrigger>
          <DropdownMenu aria-label="Import options" itemClasses={dropdownItemClasses}>
            <DropdownItem
              key="positive"
              startContent={<FileImage size={14} />}
              description="Import processed positive images"
              onPress={onImportPositive}
            >
              Import Positives
            </DropdownItem>
            {/* 注释掉这一块 */}
            {/* <DropdownItem
              key="raw"
              startContent={<Layers size={14} />}
              description="Import RAW files from scanner"
              onPress={onRawImport}
            >
              Import RAW
            </DropdownItem>*/}
          </DropdownMenu>
        </Dropdown>
      </div>
    </motion.div>
  );
}
