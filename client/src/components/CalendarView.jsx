import React, { useState } from 'react';
import { Tabs, Tab } from '@heroui/react';
import { Calendar, Clock } from 'lucide-react';
import { LifeLogView } from './LifeLog';
import { TimelineView } from './Timeline';

/**
 * CalendarView - Main view for Timeline and Life Log (Photo Calendar)
 * Uses HeroUI Tabs for modern, accessible tab switching
 */
export default function CalendarView() {
  const [viewMode, setViewMode] = useState('timeline');

  return (
    <div className="h-full flex flex-col">
      {/* Header with Tab Switcher */}
      <div className="px-6 pt-8 pb-4">
        <Tabs 
          selectedKey={viewMode}
          onSelectionChange={setViewMode}
          variant="solid"
          color="primary"
          size="md"
          classNames={{
            base: "w-fit",
            tabList: "gap-2 bg-default-100 p-1 rounded-lg",
            cursor: "bg-primary shadow-sm",
            tab: "px-4 py-2 data-[selected=true]:text-primary-foreground",
            tabContent: "group-data-[selected=true]:text-primary-foreground font-medium"
          }}
        >
          <Tab 
            key="timeline" 
            title={
              <div className="flex items-center gap-2">
                <Clock size={16} />
                <span>Timeline</span>
              </div>
            }
          />
          <Tab 
            key="calendar" 
            title={
              <div className="flex items-center gap-2">
                <Calendar size={16} />
                <span>Life Log</span>
              </div>
            }
          />
        </Tabs>
      </div>
      
      {/* Content Area */}
      <div className="flex-1 overflow-auto">
        {viewMode === 'calendar' ? <LifeLogView /> : <TimelineView />}
      </div>
    </div>
  );
}
