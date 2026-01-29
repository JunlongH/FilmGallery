/**
 * Card 组件封装
 * 
 * 基于 HeroUI Card，添加自定义样式和动画效果
 * 支持玻璃态、悬浮效果等
 */

import React from 'react';
import { Card as HeroUICard, CardHeader, CardBody, CardFooter } from '@heroui/react';
import { motion } from 'framer-motion';

/**
 * 增强的 Card 组件
 * 
 * @param {Object} props
 * @param {boolean} [props.hoverable=false] - 悬浮效果
 * @param {boolean} [props.glass=false] - 玻璃态效果
 * @param {boolean} [props.animated=true] - 入场动画
 * @param {number} [props.animationDelay=0] - 动画延迟(ms)
 * @param {'sm'|'md'|'lg'|'none'} [props.shadow='md'] - 阴影大小
 * @param {React.ReactNode} props.children
 */
export function Card({
  children,
  hoverable = false,
  glass = false,
  animated = true,
  animationDelay = 0,
  shadow = 'md',
  className = '',
  ...props
}) {
  const glassClasses = glass
    ? 'bg-white/70 dark:bg-slate-900/70 backdrop-blur-xl border border-white/20 dark:border-slate-700/30'
    : '';
  
  const hoverClasses = hoverable
    ? 'transition-all duration-200 hover:shadow-lg hover:-translate-y-1'
    : '';
  
  const cardContent = (
    <HeroUICard
      shadow={glass ? 'none' : shadow}
      className={`${glassClasses} ${hoverClasses} ${className}`}
      {...props}
    >
      {children}
    </HeroUICard>
  );
  
  if (!animated) {
    return cardContent;
  }
  
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{
        duration: 0.3,
        delay: animationDelay / 1000,
        ease: [0.4, 0, 0.2, 1],
      }}
    >
      {cardContent}
    </motion.div>
  );
}

/**
 * 照片卡片 - 专门用于展示照片的卡片样式
 */
export function PhotoCard({
  src,
  alt,
  title,
  subtitle,
  aspectRatio = '3/2',
  onClick,
  hoverable = true,
  className = '',
  ...props
}) {
  return (
    <Card
      hoverable={hoverable}
      isPressable={!!onClick}
      onPress={onClick}
      className={`overflow-hidden ${className}`}
      {...props}
    >
      <div
        className="relative w-full overflow-hidden bg-slate-100 dark:bg-slate-800"
        style={{ aspectRatio }}
      >
        <img
          src={src}
          alt={alt || title || 'Photo'}
          className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
          loading="lazy"
        />
      </div>
      {(title || subtitle) && (
        <CardBody className="p-3">
          {title && (
            <p className="font-medium text-sm text-slate-900 dark:text-slate-100 truncate">
              {title}
            </p>
          )}
          {subtitle && (
            <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
              {subtitle}
            </p>
          )}
        </CardBody>
      )}
    </Card>
  );
}

/**
 * 统计卡片 - 用于展示数字统计
 */
export function StatCard({
  icon,
  value,
  label,
  trend,
  trendValue,
  color = 'primary',
  className = '',
  ...props
}) {
  const colorClasses = {
    primary: 'text-blue-600 bg-blue-50 dark:text-blue-400 dark:bg-blue-900/20',
    success: 'text-emerald-600 bg-emerald-50 dark:text-emerald-400 dark:bg-emerald-900/20',
    warning: 'text-amber-600 bg-amber-50 dark:text-amber-400 dark:bg-amber-900/20',
    danger: 'text-red-600 bg-red-50 dark:text-red-400 dark:bg-red-900/20',
  };
  
  const trendColors = {
    up: 'text-emerald-600 dark:text-emerald-400',
    down: 'text-red-600 dark:text-red-400',
  };
  
  return (
    <Card hoverable className={`p-4 ${className}`} {...props}>
      <div className="flex items-start gap-4">
        {icon && (
          <div className={`p-3 rounded-xl ${colorClasses[color]}`}>
            {React.cloneElement(icon, { className: 'w-6 h-6' })}
          </div>
        )}
        <div className="flex-1">
          <p className="text-2xl font-bold text-slate-900 dark:text-slate-100">
            {value}
          </p>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            {label}
          </p>
          {trend && (
            <div className={`flex items-center gap-1 mt-1 text-xs ${trendColors[trend]}`}>
              {trend === 'up' ? '↑' : '↓'}
              <span>{trendValue}</span>
            </div>
          )}
        </div>
      </div>
    </Card>
  );
}

// 重新导出 HeroUI 的子组件
export { CardHeader, CardBody, CardFooter };

export default Card;
