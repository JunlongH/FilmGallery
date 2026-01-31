/**
 * AutoSizer - 自动获取容器尺寸
 * 
 * 轻量级容器尺寸检测组件
 * 用于配合虚拟滚动组件使用
 * 
 * @version 1.0.0
 * @date 2026-01-31
 */

import React, { useState, useRef, useEffect, useCallback, memo } from 'react';

/**
 * AutoSizer 组件
 * 自动检测父容器尺寸并传递给子组件
 * 
 * @param {Object} props
 * @param {Function} props.children - 渲染函数 ({ width, height }) => ReactNode
 * @param {string} [props.className] - 容器类名
 * @param {Object} [props.style] - 容器样式
 * @param {number} [props.defaultWidth=0] - 默认宽度
 * @param {number} [props.defaultHeight=400] - 默认高度
 * @param {boolean} [props.disableWidth=false] - 禁用宽度检测
 * @param {boolean} [props.disableHeight=false] - 禁用高度检测
 * @param {Function} [props.onResize] - 尺寸变化回调
 */
function AutoSizer({
  children,
  className = '',
  style = {},
  defaultWidth = 0,
  defaultHeight = 400,
  disableWidth = false,
  disableHeight = false,
  onResize,
}) {
  const [dimensions, setDimensions] = useState({
    width: defaultWidth,
    height: defaultHeight,
  });
  
  const containerRef = useRef(null);
  const resizeObserverRef = useRef(null);

  const handleResize = useCallback((entries) => {
    const entry = entries[0];
    if (!entry) return;

    const { width, height } = entry.contentRect;
    
    setDimensions(prev => {
      const newWidth = disableWidth ? prev.width : Math.floor(width);
      const newHeight = disableHeight ? prev.height : Math.floor(height);
      
      if (prev.width === newWidth && prev.height === newHeight) {
        return prev;
      }
      
      const newDimensions = { width: newWidth, height: newHeight };
      onResize?.(newDimensions);
      return newDimensions;
    });
  }, [disableWidth, disableHeight, onResize]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    // 初始尺寸
    const { width, height } = container.getBoundingClientRect();
    setDimensions({
      width: disableWidth ? defaultWidth : Math.floor(width),
      height: disableHeight ? defaultHeight : Math.floor(height),
    });

    // 监听尺寸变化
    resizeObserverRef.current = new ResizeObserver(handleResize);
    resizeObserverRef.current.observe(container);

    return () => {
      if (resizeObserverRef.current) {
        resizeObserverRef.current.disconnect();
      }
    };
  }, [defaultWidth, defaultHeight, disableWidth, disableHeight, handleResize]);

  return (
    <div
      ref={containerRef}
      className={className}
      style={{
        width: '100%',
        height: '100%',
        overflow: 'hidden',
        ...style,
      }}
    >
      {dimensions.width > 0 && dimensions.height > 0 && children(dimensions)}
    </div>
  );
}

export default memo(AutoSizer);
