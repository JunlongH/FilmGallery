/**
 * SidebarItem 组件
 * 
 * 单个侧边栏导航项，支持：
 * - 图标 + 文字
 * - 活跃状态高亮
 * - 悬浮动画
 * - 折叠模式下只显示图标
 * - 子菜单展开
 */

import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Tooltip } from '@heroui/react';
import { motion } from 'framer-motion';
import { useSidebar } from './SidebarContext';

/**
 * SidebarItem 组件
 * 
 * @param {Object} props
 * @param {string} props.to - 路由路径
 * @param {React.ReactNode} props.icon - 图标组件
 * @param {string} props.label - 显示文字
 * @param {boolean} [props.exact=false] - 是否精确匹配路由
 * @param {React.ReactNode} [props.children] - 子菜单内容
 * @param {string} [props.shortcut] - 快捷键提示
 */
export function SidebarItem({ 
  to, 
  icon, 
  label, 
  exact = false, 
  children,
  shortcut,
  badge,
}) {
  const location = useLocation();
  const { isCollapsed } = useSidebar();
  
  // 判断是否活跃
  const isActive = exact 
    ? location.pathname === to 
    : location.pathname.startsWith(to);
  
  // 是否有子菜单展开
  const hasChildren = React.Children.count(children) > 0;
  const showChildren = hasChildren && isActive && !isCollapsed;
  
  const itemContent = (
    <motion.div
      whileHover={{ x: 2 }}
      whileTap={{ scale: 0.98 }}
      transition={{ duration: 0.15, ease: 'easeOut' }}
    >
      <Link
        to={to}
        className={`
          flex items-center gap-3 px-3 py-2.5 rounded-xl
          transition-all duration-200 ease-out
          group relative
          ${isActive 
            ? 'bg-default-200/50 text-foreground font-semibold' 
            : 'text-default-500 hover:text-default-900 hover:bg-default-100/50'
          }
          ${isCollapsed ? 'justify-center px-2' : ''}
        `}
      >
        {/* 活跃指示器 */}
        {isActive && (
          <motion.div
            layoutId="sidebar-active-indicator"
            className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-6 bg-foreground/80 rounded-r-full"
            initial={false}
            transition={{ type: 'spring', stiffness: 500, damping: 30 }}
          />
        )}
        
        {/* 图标 */}
        <span className={`
          flex-shrink-0 w-5 h-5
          ${isActive ? 'text-foreground' : 'text-default-400 group-hover:text-default-600'}
          transition-colors duration-200
        `}>
          {icon}
        </span>
        
        {/* 文字 */}
        {!isCollapsed && (
          <motion.span
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -10 }}
            transition={{ duration: 0.2 }}
            className="flex-1 text-sm"
          >
            {label}
          </motion.span>
        )}
        
        {/* 徽章 */}
        {badge && !isCollapsed && (
          <span className="px-1.5 py-0.5 text-xs font-medium rounded-full bg-primary/20 text-primary">
            {badge}
          </span>
        )}
      </Link>
    </motion.div>
  );
  
  // 折叠模式下使用 Tooltip
  if (isCollapsed) {
    return (
      <Tooltip 
        content={
          <div className="flex items-center gap-2">
            <span>{label}</span>
            {shortcut && (
              <kbd className="px-1.5 py-0.5 text-xs bg-default-200 rounded">
                {shortcut}
              </kbd>
            )}
          </div>
        }
        placement="right"
        delay={300}
      >
        <div>
          {itemContent}
        </div>
      </Tooltip>
    );
  }
  
  return (
    <div>
      {itemContent}
      
      {/* 子菜单 */}
      {showChildren && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
          exit={{ opacity: 0, height: 0 }}
          transition={{ duration: 0.2 }}
          className="ml-3 mt-1"
          style={{ 
            display: 'grid', 
            gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', 
            gap: '1px 2px'
          }}
        >
          {children}
        </motion.div>
      )}
    </div>
  );
}

/**
 * 子菜单项
 */
export function SidebarSubItem({ to, label }) {
  const location = useLocation();
  const isActive = location.pathname === to;
  
  return (
    <Link
      to={to}
      className={`
        block px-2 py-1 rounded-md text-xs truncate
        transition-colors duration-150
        ${isActive 
          ? 'text-primary font-medium' 
          : 'text-default-500 hover:text-foreground'
        }
      `}
    >
      {label}
    </Link>
  );
}

export default SidebarItem;
