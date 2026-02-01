/**
 * 路由懒加载工具
 * 
 * 提供路由预加载、加载占位符等功能
 * 
 * @version 1.0.0
 * @date 2026-01-31
 */

import React, { Suspense, lazy } from 'react';
import { Spinner } from '@heroui/react';

// ============================================================================
// 路由组件缓存
// ============================================================================

const componentCache = new Map();

/**
 * 预加载路由组件
 * @param {Function} importFn - import() 函数
 */
export function prefetchRoute(importFn) {
  const key = importFn.toString();
  
  if (componentCache.has(key)) return;
  
  componentCache.set(key, true);
  
  importFn().catch(err => {
    console.warn('[Route Prefetch] Failed:', err);
    componentCache.delete(key);
  });
}

/**
 * 预加载常用路由（应用启动后延迟执行）
 */
export function prefetchCommonRoutes() {
  // 延迟 2 秒后预加载，避免阻塞初始渲染
  setTimeout(() => {
    // 这些是用户最可能访问的路由
    prefetchRoute(() => import('../components/RollLibrary'));
    prefetchRoute(() => import('../components/FilmLibrary'));
    prefetchRoute(() => import('../components/Statistics'));
    prefetchRoute(() => import('../components/EquipmentManager'));
  }, 2000);
}

// ============================================================================
// 加载占位组件
// ============================================================================

/**
 * 全屏加载占位符
 */
export function FullPageLoading() {
  return (
    <div className="flex items-center justify-center h-screen w-full bg-gray-50 dark:bg-zinc-950">
      <div className="flex flex-col items-center gap-4">
        <Spinner size="lg" color="primary" />
        <p className="text-zinc-500 dark:text-zinc-400 text-sm">Loading...</p>
      </div>
    </div>
  );
}

/**
 * 内容区域加载占位符
 */
export function ContentLoading() {
  return (
    <div className="flex items-center justify-center min-h-[400px] w-full">
      <Spinner size="md" color="primary" />
    </div>
  );
}

/**
 * 卡片加载占位符
 */
export function CardLoading() {
  return (
    <div className="flex items-center justify-center h-40 w-full bg-zinc-100 dark:bg-zinc-800 rounded-xl">
      <Spinner size="sm" color="primary" />
    </div>
  );
}

// ============================================================================
// 懒加载 HOC
// ============================================================================

/**
 * 创建懒加载组件包装器
 * @param {Function} importFn - import() 函数
 * @param {Object} options - 配置选项
 * @param {React.Component} [options.fallback] - 加载时显示的组件
 * @param {number} [options.delay] - 人为延迟(ms)，用于开发调试
 * @returns {React.Component}
 */
export function createLazyComponent(importFn, options = {}) {
  const { fallback = <ContentLoading />, delay = 0 } = options;
  
  const LazyComponent = lazy(() => {
    if (delay > 0) {
      return Promise.all([
        importFn(),
        new Promise(resolve => setTimeout(resolve, delay))
      ]).then(([module]) => module);
    }
    return importFn();
  });
  
  return function LazyWrapper(props) {
    return (
      <Suspense fallback={fallback}>
        <LazyComponent {...props} />
      </Suspense>
    );
  };
}

/**
 * 带重试的懒加载
 * @param {Function} importFn - import() 函数
 * @param {number} retries - 重试次数
 * @returns {Promise}
 */
export function lazyWithRetry(importFn, retries = 3) {
  return new Promise((resolve, reject) => {
    const tryImport = (remainingRetries) => {
      importFn()
        .then(resolve)
        .catch(error => {
          if (remainingRetries > 0) {
            console.warn(`[Lazy Load] Retrying... (${retries - remainingRetries + 1}/${retries})`);
            setTimeout(() => tryImport(remainingRetries - 1), 1000);
          } else {
            reject(error);
          }
        });
    };
    
    tryImport(retries);
  });
}

// ============================================================================
// 懒加载路由组件定义
// ============================================================================

// Overview (首页，立即加载)
// import Overview from '../components/Overview';

// 其他页面懒加载
export const LazyRollLibrary = lazy(() => import('../components/RollLibrary'));
export const LazyRollDetail = lazy(() => import('../components/RollDetail'));
export const LazyFilmLibrary = lazy(() => import('../components/FilmLibrary'));
export const LazyStatistics = lazy(() => import('../components/Statistics'));
export const LazyEquipmentManager = lazy(() => import('../components/EquipmentManager'));
export const LazyCalendarView = lazy(() => import('../components/CalendarView'));
export const LazyFavorites = lazy(() => import('../components/Favorites'));
export const LazyTagGallery = lazy(() => import('../components/TagGallery'));
export const LazySettings = lazy(() => import('../components/Settings'));
export const LazyMapPage = lazy(() => import('../pages/MapPage'));
export const LazyLutLibrary = lazy(() => import('../components/Settings/LutLibrary'));
export const LazyNewRollForm = lazy(() => import('../components/NewRollForm'));

// ============================================================================
// 带 Suspense 的路由包装
// ============================================================================

/**
 * 路由 Suspense 包装器
 * @param {Object} props
 * @param {React.Component} props.component - 懒加载组件
 * @param {React.Component} [props.fallback] - 加载占位符
 */
export function LazyRoute({ component: Component, fallback = <FullPageLoading />, ...props }) {
  return (
    <Suspense fallback={fallback}>
      <Component {...props} />
    </Suspense>
  );
}

export default {
  prefetchRoute,
  prefetchCommonRoutes,
  createLazyComponent,
  lazyWithRetry,
  FullPageLoading,
  ContentLoading,
  CardLoading,
  LazyRoute,
};
