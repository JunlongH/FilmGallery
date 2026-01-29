/**
 * Sidebar 主组件
 * 
 * 现代化侧边栏导航，支持：
 * - 折叠/展开动画
 * - 主题切换
 * - 活跃状态追踪
 * - 响应式设计
 */

import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Avatar, Button } from '@heroui/react';
import { 
  Home, 
  Camera, 
  Film, 
  Calendar, 
  Map, 
  Heart, 
  Tag, 
  BarChart2, 
  Aperture, 
  Settings,
  ChevronLeft,
  ChevronRight,
  Sun,
  Moon,
} from 'lucide-react';

import { SidebarItem, SidebarSubItem } from './SidebarItem';
import { SidebarSection } from './SidebarSection';
import { useSidebar } from './SidebarContext';
import { useTheme } from '../../providers';

// 侧边栏宽度配置
const SIDEBAR_WIDTH = 240;
const SIDEBAR_COLLAPSED_WIDTH = 72;

/**
 * Sidebar 组件
 * 
 * @param {Object} props
 * @param {Array} [props.tags] - 主题标签列表
 */
export function Sidebar({ tags = [] }) {
  const { isCollapsed, toggleCollapsed } = useSidebar();
  const { theme, toggleTheme } = useTheme();
  
  return (
    <motion.nav
      className={`
        flex flex-col h-full
        bg-white/80 dark:bg-slate-900/80
        backdrop-blur-xl
        border-r border-slate-200/60 dark:border-slate-700/40
        overflow-hidden
      `}
      initial={false}
      animate={{
        width: isCollapsed ? SIDEBAR_COLLAPSED_WIDTH : SIDEBAR_WIDTH,
      }}
      transition={{
        duration: 0.3,
        ease: [0.4, 0, 0.2, 1],
      }}
    >
      {/* Header */}
      <div className={`
        flex items-center gap-3 p-4 border-b border-slate-200/60 dark:border-slate-700/40
        ${isCollapsed ? 'justify-center' : ''}
      `}>
        {/* Logo/Avatar */}
        <Avatar
          src="/logo192.png"
          size="sm"
          radius="lg"
          className="flex-shrink-0"
          fallback={
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center">
              <Camera className="w-4 h-4 text-white" />
            </div>
          }
        />
        
        {/* Title */}
        <AnimatePresence>
          {!isCollapsed && (
            <motion.div
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -10 }}
              transition={{ duration: 0.2 }}
              className="flex-1 min-w-0"
            >
              <h1 className="text-base font-semibold text-slate-800 dark:text-slate-100 truncate">
                Film Gallery
              </h1>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
      
      {/* Navigation */}
      <div className="flex-1 overflow-y-auto py-4 px-3 space-y-6 scrollbar-hide">
        {/* 主导航 */}
        <SidebarSection>
          <SidebarItem
            to="/"
            icon={<Home className="w-5 h-5" />}
            label="Overview"
            exact
            shortcut="⌘1"
          />
          <SidebarItem
            to="/rolls"
            icon={<Camera className="w-5 h-5" />}
            label="Rolls"
            shortcut="⌘2"
          />
          <SidebarItem
            to="/films"
            icon={<Film className="w-5 h-5" />}
            label="Films"
            shortcut="⌘3"
          />
        </SidebarSection>
        
        {/* 浏览 */}
        <SidebarSection title="Browse" divider>
          <SidebarItem
            to="/calendar"
            icon={<Calendar className="w-5 h-5" />}
            label="Calendar"
            shortcut="⌘4"
          />
          <SidebarItem
            to="/map"
            icon={<Map className="w-5 h-5" />}
            label="Map"
            shortcut="⌘5"
          />
          <SidebarItem
            to="/favorites"
            icon={<Heart className="w-5 h-5" />}
            label="Favorites"
            shortcut="⌘6"
          />
          <SidebarItem
            to="/themes"
            icon={<Tag className="w-5 h-5" />}
            label="Themes"
            shortcut="⌘7"
          >
            {/* 子菜单：主题标签 */}
            {tags.map((tag) => (
              <SidebarSubItem
                key={tag.id}
                to={`/themes/${tag.id}`}
                label={tag.name}
              />
            ))}
          </SidebarItem>
        </SidebarSection>
        
        {/* 工具 */}
        <SidebarSection title="Tools" divider>
          <SidebarItem
            to="/stats"
            icon={<BarChart2 className="w-5 h-5" />}
            label="Statistics"
            shortcut="⌘8"
          />
          <SidebarItem
            to="/equipment"
            icon={<Aperture className="w-5 h-5" />}
            label="Equipment"
            shortcut="⌘9"
          />
          <SidebarItem
            to="/settings"
            icon={<Settings className="w-5 h-5" />}
            label="Settings"
            shortcut="⌘,"
          />
        </SidebarSection>
      </div>
      
      {/* Footer */}
      <div className={`
        p-3 border-t border-slate-200/60 dark:border-slate-700/40
        flex items-center gap-2
        ${isCollapsed ? 'flex-col' : ''}
      `}>
        {/* 主题切换 */}
        <Button
          isIconOnly
          variant="light"
          size="sm"
          radius="lg"
          onPress={toggleTheme}
          className="text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
          aria-label={theme === 'dark' ? '切换到浅色模式' : '切换到深色模式'}
        >
          {theme === 'dark' ? (
            <Sun className="w-4 h-4" />
          ) : (
            <Moon className="w-4 h-4" />
          )}
        </Button>
        
        {/* 折叠按钮 */}
        <Button
          isIconOnly
          variant="light"
          size="sm"
          radius="lg"
          onPress={toggleCollapsed}
          className={`
            text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200
            ${!isCollapsed ? 'ml-auto' : ''}
          `}
          aria-label={isCollapsed ? '展开侧边栏' : '折叠侧边栏'}
        >
          {isCollapsed ? (
            <ChevronRight className="w-4 h-4" />
          ) : (
            <ChevronLeft className="w-4 h-4" />
          )}
        </Button>
      </div>
    </motion.nav>
  );
}

export default Sidebar;
