/**
 * SidebarSection 组件
 * 
 * 侧边栏分组，支持标题和分隔线
 */

import React from 'react';
import { Divider } from '@heroui/react';
import { useSidebar } from './SidebarContext';

/**
 * SidebarSection 组件
 * 
 * @param {Object} props
 * @param {string} [props.title] - 分组标题
 * @param {boolean} [props.divider=false] - 是否显示分隔线
 * @param {React.ReactNode} props.children
 */
export function SidebarSection({ title, divider = false, children }) {
  const { isCollapsed } = useSidebar();
  
  return (
    <div className="space-y-1">
      {/* 分隔线 */}
      {divider && (
        <div className="py-2">
          <Divider />
        </div>
      )}
      
      {/* 标题 */}
      {title && !isCollapsed && (
        <div className="px-3 py-2">
          <span className="text-xs font-semibold uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
            {title}
          </span>
        </div>
      )}
      
      {/* 内容 */}
      <div className="space-y-0.5">
        {children}
      </div>
    </div>
  );
}

export default SidebarSection;
