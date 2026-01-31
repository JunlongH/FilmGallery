/**
 * LazyImage - 懒加载图片组件
 * 
 * 针对 Electron 环境优化的图片懒加载组件
 * - Intersection Observer 懒加载
 * - 渐进式加载（缩略图 → 高清）
 * - CSS 过渡（避免 Framer Motion 在 Electron 中的问题）
 * - 加载失败占位图
 * - 内存优化（离开视口可选卸载）
 * 
 * @version 1.0.0
 * @date 2026-01-31
 */

import React, { useState, useRef, useEffect, memo } from 'react';
import { Skeleton } from '@heroui/react';
import { ImageOff } from 'lucide-react';

/**
 * 懒加载图片组件
 * 
 * @param {Object} props
 * @param {string} props.src - 高清图片URL
 * @param {string} [props.thumb] - 缩略图URL（可选，用于渐进式加载）
 * @param {string} [props.alt] - 图片描述
 * @param {string} [props.aspectRatio] - 宽高比 如 '3/2', '1/1', '16/9'
 * @param {string} [props.className] - 容器类名
 * @param {string} [props.objectFit] - object-fit 样式
 * @param {number} [props.fadeInDuration] - 淡入动画时长(秒)
 * @param {boolean} [props.unloadOnExit] - 离开视口是否卸载图片
 * @param {string} [props.rootMargin] - IntersectionObserver rootMargin
 * @param {Function} [props.onClick] - 点击回调
 * @param {Function} [props.onLoad] - 加载完成回调
 * @param {Function} [props.onError] - 加载失败回调
 */
function LazyImage({
  src,
  thumb,
  alt = '',
  aspectRatio = '1/1',
  className = '',
  objectFit = 'cover',
  fadeInDuration = 0.3,
  unloadOnExit = false,
  rootMargin = '200px',
  onClick,
  onLoad,
  onError,
  ...props
}) {
  const [isInView, setIsInView] = useState(false);
  const [isLoaded, setIsLoaded] = useState(false);
  const [isError, setIsError] = useState(false);
  const [showThumb, setShowThumb] = useState(!!thumb);
  const containerRef = useRef(null);
  const observerRef = useRef(null);

  // Intersection Observer 懒加载
  useEffect(() => {
    const element = containerRef.current;
    if (!element) return;

    observerRef.current = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsInView(true);
          // 进入视口后可以断开观察（除非需要离开时卸载）
          if (!unloadOnExit && observerRef.current) {
            observerRef.current.unobserve(element);
          }
        } else if (unloadOnExit) {
          // 离开视口后卸载图片（节省内存）
          setIsInView(false);
          setIsLoaded(false);
          setShowThumb(!!thumb);
        }
      },
      {
        rootMargin,
        threshold: 0.01,
      }
    );

    observerRef.current.observe(element);

    return () => {
      if (observerRef.current && element) {
        observerRef.current.unobserve(element);
      }
    };
  }, [unloadOnExit, rootMargin, thumb]);

  // 高清图加载完成
  const handleLoad = () => {
    setIsLoaded(true);
    setShowThumb(false);
    onLoad?.();
  };

  // 加载失败
  const handleError = () => {
    setIsError(true);
    onError?.();
  };

  // 重试加载
  const handleRetry = (e) => {
    e.stopPropagation();
    setIsError(false);
    setIsLoaded(false);
  };

  return (
    <div
      ref={containerRef}
      className={`relative overflow-hidden bg-default-100 ${className}`}
      style={{ aspectRatio }}
      onClick={onClick}
      {...props}
    >
      {/* 骨架屏 - 未进入视口时显示 */}
      {!isInView && (
        <Skeleton className="absolute inset-0 w-full h-full" />
      )}

      {/* 图片内容 */}
      {isInView && !isError && (
        <>
          {/* 缩略图层 - 渐进式加载时先显示模糊缩略图 */}
          {thumb && showThumb && (
            <img
              src={thumb}
              alt={alt}
              className="absolute inset-0 w-full h-full"
              style={{
                objectFit,
                filter: 'blur(10px)',
                transform: 'scale(1.1)', // 稍微放大避免模糊边缘
              }}
              loading="eager"
            />
          )}

          {/* 高清图层 */}
          <img
            src={src}
            alt={alt}
            className="absolute inset-0 w-full h-full"
            style={{
              objectFit,
              opacity: isLoaded ? 1 : 0,
              transition: `opacity ${fadeInDuration}s ease-in-out`,
            }}
            onLoad={handleLoad}
            onError={handleError}
            loading="lazy"
            decoding="async"
          />

          {/* 加载中骨架 - 高清图未加载完成时 */}
          {!isLoaded && !thumb && (
            <Skeleton className="absolute inset-0 w-full h-full" />
          )}
        </>
      )}

      {/* 错误占位 */}
      {isError && (
        <div 
          className="absolute inset-0 bg-default-100 flex flex-col items-center justify-center text-default-400 cursor-pointer"
          onClick={handleRetry}
        >
          <ImageOff size={24} className="mb-2" />
          <span className="text-xs">Click to retry</span>
        </div>
      )}
    </div>
  );
}

export default memo(LazyImage);
