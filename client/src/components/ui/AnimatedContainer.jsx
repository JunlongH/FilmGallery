/**
 * 动画容器组件
 * 
 * 基于 Framer Motion 的常用动画封装
 * 提供统一的入场、交互动画
 */

import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';

/**
 * 动画预设配置
 */
export const ANIMATION_PRESETS = {
  fadeIn: {
    initial: { opacity: 0 },
    animate: { opacity: 1 },
    exit: { opacity: 0 },
    transition: { duration: 0.2 },
  },
  fadeInUp: {
    initial: { opacity: 0, y: 20 },
    animate: { opacity: 1, y: 0 },
    exit: { opacity: 0, y: 10 },
    transition: { duration: 0.3, ease: [0.4, 0, 0.2, 1] },
  },
  fadeInDown: {
    initial: { opacity: 0, y: -20 },
    animate: { opacity: 1, y: 0 },
    exit: { opacity: 0, y: -10 },
    transition: { duration: 0.3, ease: [0.4, 0, 0.2, 1] },
  },
  slideInLeft: {
    initial: { opacity: 0, x: -30 },
    animate: { opacity: 1, x: 0 },
    exit: { opacity: 0, x: -20 },
    transition: { duration: 0.3, ease: [0.4, 0, 0.2, 1] },
  },
  slideInRight: {
    initial: { opacity: 0, x: 30 },
    animate: { opacity: 1, x: 0 },
    exit: { opacity: 0, x: 20 },
    transition: { duration: 0.3, ease: [0.4, 0, 0.2, 1] },
  },
  scaleIn: {
    initial: { opacity: 0, scale: 0.95 },
    animate: { opacity: 1, scale: 1 },
    exit: { opacity: 0, scale: 0.95 },
    transition: { duration: 0.2, ease: [0.4, 0, 0.2, 1] },
  },
  popIn: {
    initial: { opacity: 0, scale: 0.8 },
    animate: { opacity: 1, scale: 1 },
    exit: { opacity: 0, scale: 0.8 },
    transition: { 
      type: 'spring', 
      stiffness: 500, 
      damping: 30,
    },
  },
};

/**
 * 基础动画容器
 * 
 * @param {Object} props
 * @param {'fadeIn'|'fadeInUp'|'fadeInDown'|'slideInLeft'|'slideInRight'|'scaleIn'|'popIn'} [props.animation='fadeInUp']
 * @param {number} [props.delay=0] - 动画延迟(秒)
 * @param {string} [props.as='div'] - 渲染元素类型
 * @param {React.ReactNode} props.children
 */
export function AnimatedContainer({
  children,
  animation = 'fadeInUp',
  delay = 0,
  as = 'div',
  className = '',
  ...props
}) {
  const preset = ANIMATION_PRESETS[animation] || ANIMATION_PRESETS.fadeInUp;
  const MotionComponent = motion[as] || motion.div;
  
  return (
    <MotionComponent
      initial={preset.initial}
      animate={preset.animate}
      exit={preset.exit}
      transition={{ ...preset.transition, delay }}
      className={className}
      {...props}
    >
      {children}
    </MotionComponent>
  );
}

/**
 * 动画列表容器 - 子元素依次进入
 */
export function AnimatedList({
  children,
  staggerDelay = 0.05,
  animation = 'fadeInUp',
  className = '',
  ...props
}) {
  const preset = ANIMATION_PRESETS[animation] || ANIMATION_PRESETS.fadeInUp;
  
  const containerVariants = {
    hidden: {},
    visible: {
      transition: {
        staggerChildren: staggerDelay,
      },
    },
  };
  
  const itemVariants = {
    hidden: preset.initial,
    visible: {
      ...preset.animate,
      transition: preset.transition,
    },
  };
  
  return (
    <motion.div
      variants={containerVariants}
      initial="hidden"
      animate="visible"
      className={className}
      {...props}
    >
      {React.Children.map(children, (child, index) => (
        <motion.div key={index} variants={itemVariants}>
          {child}
        </motion.div>
      ))}
    </motion.div>
  );
}

/**
 * 动画存在容器 - 管理元素的进入/退出动画
 */
export function AnimatedPresence({ children, mode = 'wait', ...props }) {
  return (
    <AnimatePresence mode={mode} {...props}>
      {children}
    </AnimatePresence>
  );
}

/**
 * 悬浮动画包装器
 */
export function HoverScale({
  children,
  scale = 1.03,
  className = '',
  ...props
}) {
  return (
    <motion.div
      whileHover={{ scale }}
      transition={{ duration: 0.15, ease: 'easeOut' }}
      className={className}
      {...props}
    >
      {children}
    </motion.div>
  );
}

/**
 * 点击动画包装器
 */
export function TapScale({
  children,
  scale = 0.98,
  className = '',
  ...props
}) {
  return (
    <motion.div
      whileTap={{ scale }}
      transition={{ duration: 0.1, ease: 'easeOut' }}
      className={className}
      {...props}
    >
      {children}
    </motion.div>
  );
}

/**
 * 渐变显示组件 - 用于条件渲染时的平滑过渡
 */
export function Fade({ show, children, ...props }) {
  return (
    <AnimatePresence mode="wait">
      {show && (
        <AnimatedContainer animation="fadeIn" {...props}>
          {children}
        </AnimatedContainer>
      )}
    </AnimatePresence>
  );
}

/**
 * 页面切换动画容器
 */
export function PageTransition({ children, className = '' }) {
  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      transition={{ duration: 0.25, ease: [0.4, 0, 0.2, 1] }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

export default AnimatedContainer;
