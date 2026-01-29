/**
 * Button 组件封装
 * 
 * 基于 HeroUI Button，添加自定义样式和动画
 */

import React from 'react';
import { Button as HeroUIButton } from '@heroui/react';
import { motion } from 'framer-motion';

/**
 * 增强的 Button 组件
 * 
 * @param {Object} props
 * @param {string} [props.variant='solid'] - 按钮变体：solid, bordered, light, flat, faded, shadow, ghost
 * @param {string} [props.color='primary'] - 按钮颜色：default, primary, secondary, success, warning, danger
 * @param {string} [props.size='md'] - 按钮大小：sm, md, lg
 * @param {boolean} [props.isLoading] - 加载状态
 * @param {boolean} [props.isDisabled] - 禁用状态
 * @param {boolean} [props.animated=true] - 是否启用动画
 * @param {React.ReactNode} [props.startContent] - 左侧图标
 * @param {React.ReactNode} [props.endContent] - 右侧图标
 * @param {React.ReactNode} props.children
 */
export function Button({
  animated = true,
  children,
  className = '',
  ...props
}) {
  const buttonElement = (
    <HeroUIButton
      className={`font-medium ${className}`}
      {...props}
    >
      {children}
    </HeroUIButton>
  );
  
  if (!animated) {
    return buttonElement;
  }
  
  return (
    <motion.div
      whileHover={{ scale: 1.02 }}
      whileTap={{ scale: 0.98 }}
      transition={{ duration: 0.15, ease: 'easeOut' }}
      className="inline-block"
    >
      {buttonElement}
    </motion.div>
  );
}

/**
 * 图标按钮 - 仅包含图标的圆形按钮
 */
export function IconButton({
  icon,
  size = 'md',
  variant = 'light',
  color = 'default',
  className = '',
  animated = true,
  ...props
}) {
  const sizeClasses = {
    sm: 'w-8 h-8',
    md: 'w-10 h-10',
    lg: 'w-12 h-12',
  };
  
  const iconSizeClasses = {
    sm: 'w-4 h-4',
    md: 'w-5 h-5',
    lg: 'w-6 h-6',
  };
  
  return (
    <Button
      isIconOnly
      variant={variant}
      color={color}
      animated={animated}
      className={`${sizeClasses[size]} rounded-full ${className}`}
      {...props}
    >
      {React.cloneElement(icon, { className: iconSizeClasses[size] })}
    </Button>
  );
}

/**
 * 按钮组 - 包裹多个相关按钮
 */
export function ButtonGroup({ children, className = '' }) {
  return (
    <div className={`inline-flex items-center gap-1 ${className}`}>
      {children}
    </div>
  );
}

export default Button;
