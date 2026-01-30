/**
 * EquipmentTabs - 设备类型选择 Tabs
 * 
 * 使用 HeroUI Tabs 展示设备类型选择器
 */

import React from 'react';
import { Tabs, Tab, Chip } from '@heroui/react';
import { Camera, Aperture, Zap, Box, Scan, Film } from 'lucide-react';

// Tab configuration with icons
const EQUIPMENT_TABS = [
  { key: 'cameras', label: 'Cameras', icon: Camera },
  { key: 'lenses', label: 'Lenses', icon: Aperture },
  { key: 'flashes', label: 'Flashes', icon: Zap },
  { key: 'film-backs', label: 'Film Backs', icon: Box },
  { key: 'scanners', label: 'Scanners', icon: Scan },
  { key: 'films', label: 'Films', icon: Film }
];

export default function EquipmentTabs({
  activeTab = 'cameras',
  onTabChange,
  itemCounts = {}
}) {
  return (
    <Tabs
      aria-label="Equipment types"
      selectedKey={activeTab}
      onSelectionChange={onTabChange}
      color="primary"
      variant="solid"
      classNames={{
        base: 'w-full',
        tabList: 'gap-2 w-full relative rounded-xl p-1 bg-default-100',
        cursor: 'bg-primary shadow-md',
        tab: 'max-w-fit px-4 h-10',
        tabContent: 'group-data-[selected=true]:text-white'
      }}
    >
      {EQUIPMENT_TABS.map(tab => {
        const Icon = tab.icon;
        const count = itemCounts[tab.key] || 0;
        return (
          <Tab
            key={tab.key}
            title={
              <div className="flex items-center gap-2">
                <Icon className="w-4 h-4" />
                <span className="hidden sm:inline">{tab.label}</span>
                {count > 0 && (
                  <Chip
                    size="sm"
                    variant="flat"
                    className="h-5 min-w-5 bg-white/20 text-current"
                  >
                    {count}
                  </Chip>
                )}
              </div>
            }
          />
        );
      })}
    </Tabs>
  );
}

export { EQUIPMENT_TABS };
