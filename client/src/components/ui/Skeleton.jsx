/**
 * Skeleton 骨架屏组件
 * 
 * 基于 HeroUI Skeleton，添加常用的预设模式
 */

import React from 'react';
import { Skeleton as HeroUISkeleton } from '@heroui/react';

/**
 * 基础骨架屏组件
 */
export function Skeleton({ className = '', ...props }) {
  return (
    <HeroUISkeleton
      className={`rounded-lg ${className}`}
      {...props}
    />
  );
}

/**
 * 照片骨架屏 - 用于照片加载占位
 */
export function PhotoSkeleton({ aspectRatio = '3/2', className = '' }) {
  return (
    <div
      className={`relative overflow-hidden rounded-lg ${className}`}
      style={{ aspectRatio }}
    >
      <Skeleton className="absolute inset-0" />
    </div>
  );
}

/**
 * 卡片骨架屏 - 用于卡片内容加载占位
 */
export function CardSkeleton({ hasImage = true, lines = 2, className = '' }) {
  return (
    <div className={`rounded-xl overflow-hidden bg-white dark:bg-slate-800 ${className}`}>
      {hasImage && <PhotoSkeleton aspectRatio="3/2" />}
      <div className="p-4 space-y-3">
        <Skeleton className="h-4 w-3/4" />
        {Array.from({ length: lines - 1 }).map((_, i) => (
          <Skeleton key={i} className="h-3 w-1/2" />
        ))}
      </div>
    </div>
  );
}

/**
 * 列表项骨架屏
 */
export function ListItemSkeleton({ hasAvatar = true, lines = 2 }) {
  return (
    <div className="flex items-start gap-4 p-4">
      {hasAvatar && <Skeleton className="w-12 h-12 rounded-full flex-shrink-0" />}
      <div className="flex-1 space-y-2">
        <Skeleton className="h-4 w-1/3" />
        {lines > 1 && <Skeleton className="h-3 w-2/3" />}
        {lines > 2 && <Skeleton className="h-3 w-1/2" />}
      </div>
    </div>
  );
}

/**
 * 网格骨架屏 - 用于照片网格加载
 */
export function GridSkeleton({ count = 6, columns = 3, aspectRatio = '1/1' }) {
  const gridCols = {
    2: 'grid-cols-2',
    3: 'grid-cols-3',
    4: 'grid-cols-4',
    5: 'grid-cols-5',
    6: 'grid-cols-6',
  };
  
  return (
    <div className={`grid ${gridCols[columns]} gap-3`}>
      {Array.from({ length: count }).map((_, i) => (
        <PhotoSkeleton key={i} aspectRatio={aspectRatio} />
      ))}
    </div>
  );
}

/**
 * 时间线骨架屏
 */
export function TimelineSkeleton({ items = 3 }) {
  return (
    <div className="space-y-6">
      {Array.from({ length: items }).map((_, i) => (
        <div key={i} className="space-y-3">
          {/* 日期标题 */}
          <Skeleton className="h-6 w-32" />
          {/* 照片网格 */}
          <GridSkeleton count={4} columns={4} />
        </div>
      ))}
    </div>
  );
}

/**
 * 日历骨架屏
 */
export function CalendarSkeleton() {
  return (
    <div className="space-y-4 p-4">
      {/* 月份导航 */}
      <div className="flex items-center justify-between">
        <Skeleton className="h-8 w-24" />
        <div className="flex gap-2">
          <Skeleton className="h-8 w-8 rounded-full" />
          <Skeleton className="h-8 w-8 rounded-full" />
        </div>
      </div>
      
      {/* 星期标题 */}
      <div className="grid grid-cols-7 gap-1">
        {Array.from({ length: 7 }).map((_, i) => (
          <Skeleton key={i} className="h-6 mx-auto w-8" />
        ))}
      </div>
      
      {/* 日期格子 */}
      <div className="grid grid-cols-7 gap-1">
        {Array.from({ length: 35 }).map((_, i) => (
          <Skeleton key={i} className="h-12 rounded-lg" />
        ))}
      </div>
    </div>
  );
}

export default Skeleton;
