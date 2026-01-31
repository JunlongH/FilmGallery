# FilmGallery 前端性能优化计划

> **创建日期**: 2026-01-31  
> **版本**: 1.0.0  
> **目标**: 全面提升前端加载速度、响应性能和用户体验

---

## 🎯 优化目标

### 当前问题分析
1. **加载缓慢** - 各个页面初次加载时间长
2. **缺乏流畅感** - 页面切换、图片加载无渐进式反馈
3. **重复请求** - 缺少有效的数据缓存策略
4. **阻塞渲染** - 大量同步请求阻塞 UI 渲染
5. **未充分利用 React Query** - 现有配置不够激进

### 性能指标目标
- **首屏渲染 (FCP)**: < 1.5s
- **可交互时间 (TTI)**: < 3s
- **页面切换**: < 500ms
- **图片加载**: 懒加载 + 渐进式显示
- **缓存命中率**: > 80%

---

## 📦 优化方案架构

### 模块化设计
```
performance-optimization/
├── cache/                  # 缓存模块
│   ├── QueryCacheManager.js
│   ├── ImageCache.js
│   └── DataPrefetch.js
├── lazy-loading/          # 懒加载模块
│   ├── LazyImage.jsx
│   ├── LazyRoute.jsx
│   └── VirtualizedList.jsx
├── optimization/          # 优化工具
│   ├── useDebounce.js
│   ├── useThrottle.js
│   └── useMemoizedCallback.js
└── monitoring/            # 性能监控
    ├── PerformanceMonitor.js
    └── analytics.js
```

---

## 🚀 Phase 1: React Query 优化 (优先级: 🔴 最高)

### 1.1 激进的缓存策略

**目标**: 最大化缓存利用率，减少网络请求

**实施方案**:

#### 更新 `App.js` QueryClient 配置
```javascript
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // 🎯 核心优化：延长数据新鲜度
      staleTime: 1000 * 60 * 15,        // 15 分钟内数据视为新鲜（desktop 环境）
      cacheTime: 1000 * 60 * 60,         // 1 小时缓存时间
      
      // 🎯 减少自动刷新
      refetchOnWindowFocus: false,       // 窗口聚焦不刷新
      refetchOnReconnect: false,         // 重连不刷新
      refetchOnMount: false,             // 挂载时使用缓存
      
      // 🎯 错误处理优化
      retry: 2,                          // 失败重试 2 次
      retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
      
      // 🎯 性能优化
      structuralSharing: true,           // 优化内存使用
      keepPreviousData: true,            // 保留旧数据避免闪烁
    },
    mutations: {
      retry: 1,
    }
  },
});
```

#### 创建 `client/src/lib/queryClient.js` - 统一 QueryClient 配置
```javascript
import { QueryClient } from '@tanstack/react-query';

// 环境检测
const isElectron = !!window.__electron;
const isDevelopment = process.env.NODE_ENV === 'development';

// 根据环境调整缓存策略
const CACHE_CONFIG = {
  electron: {
    staleTime: 1000 * 60 * 15,    // 15 分钟
    cacheTime: 1000 * 60 * 60,     // 1 小时
  },
  web: {
    staleTime: 1000 * 60 * 5,     // 5 分钟
    cacheTime: 1000 * 60 * 30,     // 30 分钟
  }
};

const config = isElectron ? CACHE_CONFIG.electron : CACHE_CONFIG.web;

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      ...config,
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
      refetchOnMount: false,
      retry: 2,
      retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
      structuralSharing: true,
      keepPreviousData: true,
      
      // 开发环境额外配置
      ...(isDevelopment && {
        onError: (error) => console.error('Query Error:', error),
      })
    }
  }
});

// 全局缓存管理工具
export const cacheUtils = {
  // 清除特定模块缓存
  clearModule: (moduleKey) => {
    queryClient.removeQueries({ queryKey: [moduleKey] });
  },
  
  // 预取数据
  prefetch: async (queryKey, queryFn, options = {}) => {
    await queryClient.prefetchQuery({ queryKey, queryFn, ...options });
  },
  
  // 手动设置缓存
  setQueryData: (queryKey, data) => {
    queryClient.setQueryData(queryKey, data);
  },
  
  // 失效缓存（保持数据但标记为 stale）
  invalidate: (queryKey) => {
    queryClient.invalidateQueries({ queryKey });
  }
};
```

### 1.2 分模块的缓存策略

**不同数据类型采用不同缓存时长**:

```javascript
// client/src/lib/cacheStrategies.js
export const CACHE_STRATEGIES = {
  // 🟢 静态数据 - 长期缓存
  STATIC: {
    staleTime: Infinity,          // 永不过期
    cacheTime: 1000 * 60 * 60 * 24, // 24 小时
  },
  
  // 🟡 半静态数据 - 中期缓存
  SEMI_STATIC: {
    staleTime: 1000 * 60 * 30,    // 30 分钟
    cacheTime: 1000 * 60 * 60,     // 1 小时
  },
  
  // 🟠 动态数据 - 短期缓存
  DYNAMIC: {
    staleTime: 1000 * 60 * 5,     // 5 分钟
    cacheTime: 1000 * 60 * 15,     // 15 分钟
  },
  
  // 🔴 实时数据 - 最小缓存
  REALTIME: {
    staleTime: 1000 * 30,         // 30 秒
    cacheTime: 1000 * 60 * 2,      // 2 分钟
  }
};

// 数据分类
export const DATA_TYPES = {
  // 静态数据
  EQUIPMENT: CACHE_STRATEGIES.STATIC,          // 设备库
  FILMS: CACHE_STRATEGIES.STATIC,              // 胶片库
  LUTS: CACHE_STRATEGIES.STATIC,               // LUT 列表
  LOCATIONS: CACHE_STRATEGIES.SEMI_STATIC,     // 地点列表
  TAGS: CACHE_STRATEGIES.SEMI_STATIC,          // 标签列表
  
  // 动态数据
  ROLLS: CACHE_STRATEGIES.DYNAMIC,             // 胶卷列表
  PHOTOS: CACHE_STRATEGIES.DYNAMIC,            // 照片列表
  STATS: CACHE_STRATEGIES.DYNAMIC,             // 统计数据
  
  // 实时数据
  UPLOAD_PROGRESS: CACHE_STRATEGIES.REALTIME,  // 上传进度
  EXPORT_JOBS: CACHE_STRATEGIES.REALTIME,      // 导出任务
};
```

### 1.3 应用缓存策略到各个模块

#### EquipmentManager - 设备管理
```javascript
// client/src/components/EquipmentManager.jsx
import { useQuery } from '@tanstack/react-query';
import { DATA_TYPES } from '../lib/cacheStrategies';

const { data: cameras, isLoading } = useQuery({
  queryKey: ['equipment', 'cameras'],
  queryFn: getCameras,
  ...DATA_TYPES.EQUIPMENT,  // 静态数据，长期缓存
});
```

#### RollLibrary - 胶卷库
```javascript
// client/src/components/RollLibrary.jsx
const { data: rolls, isLoading } = useQuery({
  queryKey: ['rolls', filters],
  queryFn: () => getRolls(filters),
  ...DATA_TYPES.ROLLS,  // 动态数据，中期缓存
  keepPreviousData: true,  // 避免筛选时闪烁
});
```

#### Statistics - 统计页面
```javascript
// client/src/components/Statistics.jsx
const { data: stats } = useQuery({
  queryKey: ['stats', 'summary'],
  queryFn: fetchStats,
  ...DATA_TYPES.STATS,
  refetchInterval: 1000 * 60 * 2,  // 2 分钟自动刷新
});
```

---

## 🖼️ Phase 2: 图片加载优化 (优先级: 🔴 高)

### 2.1 创建统一的 LazyImage 组件

**文件**: `client/src/components/common/LazyImage.jsx`

```jsx
import React, { useState, useRef, useEffect } from 'react';
import { Skeleton } from '@heroui/react';

/**
 * LazyImage - 懒加载图片组件
 * 
 * Features:
 * - Intersection Observer 懒加载
 * - 渐进式加载（低质量 → 高质量）
 * - 加载失败占位图
 * - 内存优化（离开视口卸载）
 */
export default function LazyImage({
  src,
  thumb,           // 缩略图 URL
  alt = '',
  aspectRatio = '1/1',
  className = '',
  objectFit = 'cover',
  fadeInDuration = 0.3,
  unloadOnExit = false,  // 离开视口是否卸载
  ...props
}) {
  const [isInView, setIsInView] = useState(false);
  const [isLoaded, setIsLoaded] = useState(false);
  const [isError, setIsError] = useState(false);
  const imgRef = useRef(null);
  const observerRef = useRef(null);

  useEffect(() => {
    const element = imgRef.current;
    if (!element) return;

    observerRef.current = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsInView(true);
        } else if (unloadOnExit) {
          // 离开视口后卸载图片（节省内存）
          setIsInView(false);
          setIsLoaded(false);
        }
      },
      {
        rootMargin: '200px',  // 提前 200px 开始加载
        threshold: 0.01
      }
    );

    observerRef.current.observe(element);

    return () => {
      if (observerRef.current && element) {
        observerRef.current.unobserve(element);
      }
    };
  }, [unloadOnExit]);

  const currentSrc = isInView ? (isLoaded ? src : thumb || src) : null;

  return (
    <div
      ref={imgRef}
      className={`relative overflow-hidden ${className}`}
      style={{ aspectRatio }}
    >
      {!isInView || !currentSrc ? (
        <Skeleton className="absolute inset-0" />
      ) : (
        <>
          {/* 缩略图层 */}
          {thumb && !isLoaded && (
            <img
              src={thumb}
              alt={alt}
              className="absolute inset-0 w-full h-full blur-sm"
              style={{ objectFit }}
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
              transition: `opacity ${fadeInDuration}s ease-in-out`
            }}
            onLoad={() => setIsLoaded(true)}
            onError={() => setIsError(true)}
            loading="lazy"
            {...props}
          />
          
          {/* 错误占位 */}
          {isError && (
            <div className="absolute inset-0 bg-default-100 flex items-center justify-center text-default-400">
              <span className="text-sm">Failed to load</span>
            </div>
          )}
        </>
      )}
    </div>
  );
}
```

### 2.2 图片 CDN 缓存策略

**创建** `client/src/utils/imageOptimization.js`:

```javascript
/**
 * 图片优化工具
 */

// 图片缓存 Map
const imageCache = new Map();

/**
 * 预加载图片
 */
export function preloadImage(url) {
  if (!url || imageCache.has(url)) return Promise.resolve();
  
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      imageCache.set(url, true);
      resolve();
    };
    img.onerror = reject;
    img.src = url;
  });
}

/**
 * 批量预加载图片
 */
export async function preloadImages(urls, options = {}) {
  const { maxConcurrent = 5, timeout = 10000 } = options;
  
  const chunks = [];
  for (let i = 0; i < urls.length; i += maxConcurrent) {
    chunks.push(urls.slice(i, i + maxConcurrent));
  }
  
  for (const chunk of chunks) {
    await Promise.allSettled(
      chunk.map(url => 
        Promise.race([
          preloadImage(url),
          new Promise((_, reject) => 
            setTimeout(() => reject(new Error('Timeout')), timeout)
          )
        ])
      )
    );
  }
}

/**
 * 获取响应式图片 URL
 */
export function getResponsiveImageUrl(baseUrl, options = {}) {
  const { width, quality = 85, format = 'webp' } = options;
  
  // 如果服务器支持图片处理，添加查询参数
  // 例如: /uploads/photo.jpg?w=800&q=85&f=webp
  if (width) {
    const url = new URL(baseUrl, window.location.origin);
    url.searchParams.set('w', width);
    url.searchParams.set('q', quality);
    url.searchParams.set('f', format);
    return url.toString();
  }
  
  return baseUrl;
}

/**
 * 清理图片缓存
 */
export function clearImageCache() {
  imageCache.clear();
}
```

### 2.3 应用 LazyImage 到现有组件

#### PhotoCard
```jsx
// client/src/components/Gallery/PhotoCard.jsx
import LazyImage from '../common/LazyImage';

<LazyImage
  src={buildUploadUrl(photo.full_rel_path)}
  thumb={buildUploadUrl(photo.thumb_rel_path)}
  alt={photo.caption}
  aspectRatio="3/2"
  className="rounded-lg"
/>
```

#### HeroCarousel
```jsx
// client/src/components/Overview/HeroCarousel.jsx
// 预加载下一张图片
useEffect(() => {
  if (photos.length > 1) {
    const nextIndex = (currentIndex + 1) % photos.length;
    const nextUrl = getPhotoUrl(photos[nextIndex]);
    if (nextUrl) preloadImage(nextUrl);
  }
}, [currentIndex, photos]);
```

---

## ⚡ Phase 3: 路由懒加载 (优先级: 🟡 中)

### 3.1 代码分割 - React.lazy + Suspense

**更新** `client/src/App.js`:

```javascript
import React, { lazy, Suspense } from 'react';
import { Spinner } from '@heroui/react';

// 懒加载路由组件
const RollLibrary = lazy(() => import('./components/RollLibrary'));
const RollDetail = lazy(() => import('./components/RollDetail'));
const FilmLibrary = lazy(() => import('./components/FilmLibrary'));
const Statistics = lazy(() => import('./components/Statistics'));
const EquipmentManager = lazy(() => import('./components/EquipmentManager'));
const MapPage = lazy(() => import('./pages/MapPage'));
const CalendarView = lazy(() => import('./components/CalendarView'));
const Favorites = lazy(() => import('./components/Favorites'));
const TagGallery = lazy(() => import('./components/TagGallery'));
const Settings = lazy(() => import('./components/Settings'));

// 加载占位符
function RouteLoading() {
  return (
    <div className="flex items-center justify-center h-screen">
      <Spinner size="lg" color="primary" />
    </div>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <Router>
        <Suspense fallback={<RouteLoading />}>
          <Routes>
            <Route path="/" element={<Overview />} />
            <Route path="/rolls" element={<RollLibrary />} />
            {/* ... */}
          </Routes>
        </Suspense>
      </Router>
    </QueryClientProvider>
  );
}
```

### 3.2 路由预加载

**创建** `client/src/utils/routePrefetch.js`:

```javascript
/**
 * 路由预加载工具
 */

const componentCache = new Map();

// 预加载路由组件
export function prefetchRoute(importFn) {
  if (componentCache.has(importFn)) return;
  
  componentCache.set(importFn, true);
  importFn().catch(err => {
    console.warn('Failed to prefetch route:', err);
    componentCache.delete(importFn);
  });
}

// 预加载常用路由
export function prefetchCommonRoutes() {
  // 延迟 2 秒后预加载（避免阻塞初始渲染）
  setTimeout(() => {
    prefetchRoute(() => import('../components/RollLibrary'));
    prefetchRoute(() => import('../components/FilmLibrary'));
    prefetchRoute(() => import('../components/Statistics'));
  }, 2000);
}
```

---

## 📊 Phase 4: 虚拟滚动 (优先级: 🟡 中)

### 4.1 使用 react-window 优化长列表

**已安装依赖**: `react-window`

**创建** `client/src/components/common/VirtualPhotoGrid.jsx`:

```jsx
import React from 'react';
import { FixedSizeGrid as Grid } from 'react-window';
import AutoSizer from 'react-virtualized-auto-sizer';
import LazyImage from './LazyImage';

/**
 * 虚拟化照片网格
 * 
 * 只渲染可见区域的照片，大幅提升大量照片场景的性能
 */
export default function VirtualPhotoGrid({
  photos = [],
  columnWidth = 200,
  rowHeight = 200,
  gap = 16,
  onPhotoClick
}) {
  const Cell = ({ columnIndex, rowIndex, style }) => {
    const index = rowIndex * Math.floor((window.innerWidth - gap) / (columnWidth + gap)) + columnIndex;
    const photo = photos[index];
    
    if (!photo) return null;
    
    return (
      <div style={{...style, padding: gap / 2}}>
        <LazyImage
          src={buildUploadUrl(photo.full_rel_path)}
          thumb={buildUploadUrl(photo.thumb_rel_path)}
          alt={photo.caption}
          className="rounded-lg cursor-pointer hover:scale-105 transition-transform"
          onClick={() => onPhotoClick?.(photo)}
        />
      </div>
    );
  };
  
  return (
    <AutoSizer>
      {({ height, width }) => {
        const columnCount = Math.floor((width - gap) / (columnWidth + gap));
        const rowCount = Math.ceil(photos.length / columnCount);
        
        return (
          <Grid
            columnCount={columnCount}
            columnWidth={columnWidth + gap}
            height={height}
            rowCount={rowCount}
            rowHeight={rowHeight + gap}
            width={width}
          >
            {Cell}
          </Grid>
        );
      }}
    </AutoSizer>
  );
}
```

### 4.2 应用到 RollDetail 照片网格

```jsx
// client/src/components/RollDetail/RollPhotoGrid.jsx
import VirtualPhotoGrid from '../common/VirtualPhotoGrid';

// 当照片数量 > 100 时使用虚拟滚动
{photos.length > 100 ? (
  <VirtualPhotoGrid
    photos={photos}
    onPhotoClick={handlePhotoClick}
  />
) : (
  // 传统网格渲染
  <div className="grid grid-cols-4 gap-4">
    {photos.map(photo => <PhotoCard key={photo.id} {...photo} />)}
  </div>
)}
```

---

## 🧠 Phase 5: 数据预取 (优先级: 🟢 低)

### 5.1 智能预取策略

**创建** `client/src/lib/dataPrefetch.js`:

```javascript
import { cacheUtils } from './queryClient';
import { getRolls, getPhotos, getFilms, getCameras } from '../api';

/**
 * 数据预取管理器
 */
class DataPrefetchManager {
  constructor() {
    this.prefetchQueue = [];
    this.isProcessing = false;
  }
  
  /**
   * 添加预取任务
   */
  add(task) {
    this.prefetchQueue.push(task);
    if (!this.isProcessing) {
      this.process();
    }
  }
  
  /**
   * 处理预取队列
   */
  async process() {
    if (this.prefetchQueue.length === 0) {
      this.isProcessing = false;
      return;
    }
    
    this.isProcessing = true;
    const task = this.prefetchQueue.shift();
    
    try {
      await cacheUtils.prefetch(task.queryKey, task.queryFn);
    } catch (err) {
      console.warn('Prefetch failed:', task.queryKey, err);
    }
    
    // 延迟 500ms 避免阻塞主线程
    setTimeout(() => this.process(), 500);
  }
  
  /**
   * 清空队列
   */
  clear() {
    this.prefetchQueue = [];
  }
}

export const prefetchManager = new DataPrefetchManager();

/**
 * 预取 Overview 页面数据
 */
export function prefetchOverviewData() {
  prefetchManager.add({
    queryKey: ['rolls', 'recent'],
    queryFn: () => getRolls({ limit: 20, sort: 'recent' })
  });
  
  prefetchManager.add({
    queryKey: ['stats', 'summary'],
    queryFn: fetchStats
  });
}

/**
 * 预取 RollDetail 相关数据
 */
export function prefetchRollDetailData(rollId) {
  // 预取照片
  prefetchManager.add({
    queryKey: ['photos', rollId],
    queryFn: () => getPhotos(rollId)
  });
  
  // 预取设备列表（用于编辑）
  prefetchManager.add({
    queryKey: ['equipment', 'cameras'],
    queryFn: getCameras
  });
}

/**
 * 应用启动时预取常用数据
 */
export function prefetchCommonData() {
  // 延迟 3 秒后开始预取
  setTimeout(() => {
    prefetchManager.add({
      queryKey: ['films'],
      queryFn: getFilms
    });
    
    prefetchManager.add({
      queryKey: ['equipment', 'cameras'],
      queryFn: getCameras
    });
    
    prefetchManager.add({
      queryKey: ['locations'],
      queryFn: getLocations
    });
  }, 3000);
}
```

### 5.2 在路由切换时预取

```jsx
// client/src/App.js
import { prefetchRollDetailData } from './lib/dataPrefetch';

// 在 Sidebar 链接上添加 onMouseEnter 预取
<SidebarItem
  to="/rolls"
  onMouseEnter={() => prefetchManager.add({
    queryKey: ['rolls'],
    queryFn: getRolls
  })}
/>
```

---

## 🔧 Phase 6: 性能优化工具 (优先级: 🟢 低)

### 6.1 创建自定义 Hooks

**文件**: `client/src/hooks/useDebounce.js`
```javascript
import { useState, useEffect } from 'react';

export function useDebounce(value, delay = 500) {
  const [debouncedValue, setDebouncedValue] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedValue(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);

  return debouncedValue;
}
```

**文件**: `client/src/hooks/useThrottle.js`
```javascript
import { useRef, useCallback } from 'react';

export function useThrottle(callback, delay = 500) {
  const lastRun = useRef(Date.now());

  return useCallback((...args) => {
    const now = Date.now();
    if (now - lastRun.current >= delay) {
      callback(...args);
      lastRun.current = now;
    }
  }, [callback, delay]);
}
```

### 6.2 应用到搜索和筛选

```jsx
// client/src/components/RollLibrary.jsx
import { useDebounce } from '../hooks/useDebounce';

const [searchTerm, setSearchTerm] = useState('');
const debouncedSearch = useDebounce(searchTerm, 300);

const { data: rolls } = useQuery({
  queryKey: ['rolls', debouncedSearch, filters],
  queryFn: () => getRolls({ search: debouncedSearch, ...filters })
});
```

---

## 📈 Phase 7: 性能监控 (优先级: 🟢 低)

### 7.1 创建性能监控工具

**文件**: `client/src/utils/performanceMonitor.js`:

```javascript
/**
 * 性能监控工具
 */

class PerformanceMonitor {
  constructor() {
    this.metrics = {
      pageLoadTime: 0,
      apiCalls: [],
      cacheHits: 0,
      cacheMisses: 0,
      imageLoadTime: []
    };
  }
  
  /**
   * 记录页面加载时间
   */
  recordPageLoad() {
    if (window.performance && window.performance.timing) {
      const timing = window.performance.timing;
      this.metrics.pageLoadTime = timing.loadEventEnd - timing.navigationStart;
    }
  }
  
  /**
   * 记录 API 调用
   */
  recordApiCall(endpoint, duration, cached = false) {
    this.metrics.apiCalls.push({ endpoint, duration, cached, timestamp: Date.now() });
    if (cached) {
      this.metrics.cacheHits++;
    } else {
      this.metrics.cacheMisses++;
    }
  }
  
  /**
   * 获取统计报告
   */
  getReport() {
    const avgApiTime = this.metrics.apiCalls.length > 0
      ? this.metrics.apiCalls.reduce((sum, call) => sum + call.duration, 0) / this.metrics.apiCalls.length
      : 0;
    
    const cacheHitRate = this.metrics.cacheHits + this.metrics.cacheMisses > 0
      ? (this.metrics.cacheHits / (this.metrics.cacheHits + this.metrics.cacheMisses) * 100).toFixed(2)
      : 0;
    
    return {
      pageLoadTime: this.metrics.pageLoadTime + 'ms',
      avgApiTime: avgApiTime.toFixed(2) + 'ms',
      cacheHitRate: cacheHitRate + '%',
      totalApiCalls: this.metrics.apiCalls.length,
      cacheHits: this.metrics.cacheHits,
      cacheMisses: this.metrics.cacheMisses
    };
  }
  
  /**
   * 在控制台打印报告
   */
  printReport() {
    console.table(this.getReport());
  }
}

export const performanceMonitor = new PerformanceMonitor();

// 自动记录页面加载时间
if (typeof window !== 'undefined') {
  window.addEventListener('load', () => {
    performanceMonitor.recordPageLoad();
  });
}
```

### 7.2 集成到 API 调用

```javascript
// client/src/api.js
import { performanceMonitor } from './utils/performanceMonitor';

async function fetchWithMonitoring(url, options = {}) {
  const startTime = performance.now();
  const response = await fetch(url, options);
  const duration = performance.now() - startTime;
  
  const cached = response.headers.get('x-cache') === 'HIT';
  performanceMonitor.recordApiCall(url, duration, cached);
  
  return response;
}
```

---

## 📋 实施计划 & 优先级

### Week 1: 核心缓存优化 (🔴 最高优先级) ✅ 完成
- [x] 更新 QueryClient 配置 → `client/src/lib/queryClient.js`
- [x] 创建 `queryClient.js` 和 `cacheStrategies.js` → 统一到 `queryClient.js`
- [ ] 应用到 Overview, RollLibrary, Statistics
- [ ] 测试缓存命中率

### Week 2: 图片加载优化 (🔴 高优先级) ✅ 完成
- [x] 创建 LazyImage 组件 → `client/src/components/common/LazyImage.jsx`
- [x] 创建 imageOptimization 工具 → `client/src/utils/imageOptimization.js`
- [x] 应用到 PhotoCard, RollGrid, RollPhotoGrid, TagCard, PhotoItem
- [ ] 测试加载性能

### Week 3: 路由优化 (🟡 中优先级) ✅ 完成
- [x] 实施路由懒加载 → `client/src/utils/lazyRoutes.js`
- [x] 创建 routePrefetch 工具 → `prefetchRoute()`, `prefetchCommonRoutes()`
- [x] 添加加载占位符 → `SkeletonPage`, `SkeletonModal`, `SkeletonPhotoGrid`

### Week 4: 虚拟滚动 & 预取 (🟢 低优先级) ✅ 完成
- [x] 创建 VirtualPhotoGrid → `client/src/components/common/VirtualPhotoGrid.jsx`
- [x] 创建 dataPrefetch 管理器 → `client/src/lib/dataPrefetch.js`
- [ ] 性能监控集成

### Week 5: 性能工具 Hooks ✅ 完成
- [x] 创建 useDebounce → `client/src/hooks/useDebounce.js`
- [x] 创建 useThrottle → `client/src/hooks/useThrottle.js`
- [x] 创建 useMemoizedCallback → `client/src/hooks/useMemoizedCallback.js`
- [x] 创建 useIntersectionObserver → `client/src/hooks/useIntersectionObserver.js`
- [x] 创建 useLocalStorage → `client/src/hooks/useLocalStorage.js`
- [x] 统一 hooks 导出 → `client/src/hooks/index.js`

### Week 6: 组件集成 ✅ 完成
- [x] App.js 集成统一 queryClient
- [x] App.js 添加 prefetchCommonData 调用
- [x] RollLibrary 应用缓存策略
- [x] FilmLibrary 应用缓存策略
- [x] Favorites 应用缓存策略
- [x] RollDetail 应用缓存策略
- [x] Statistics 应用缓存策略
- [x] TagGallery 应用缓存策略
- [x] QuickStats 应用缓存策略
- [x] BrowseSection 应用 useDebounce + 缓存策略
- [x] PhotoCard 使用 LazyImage + memo
- [x] RollGrid 使用 LazyImage
- [x] RollPhotoGrid 使用 LazyImage
- [x] PhotoItem 使用 LazyImage
- [x] TagCard 使用 LazyImage + memo

---

## 🎯 预期效果

### 性能提升
- **首屏加载**: 3s → 1.5s (-50%)
- **页面切换**: 1.5s → 500ms (-67%)
- **图片加载**: 顺畅渐进式显示
- **缓存命中率**: 从 20% 提升到 80%+

### 用户体验
- ✅ 即时响应 - 数据从缓存加载
- ✅ 流畅动画 - 无闪烁、无白屏
- ✅ 渐进式加载 - 先模糊后清晰
- ✅ 智能预取 - 提前加载用户可能访问的数据

---

## 🔍 测试验证

### 性能测试清单
```javascript
// 在浏览器控制台运行
performanceMonitor.printReport();

// 检查 React Query 缓存状态
window.__REACT_QUERY_DEVTOOLS_GLOBAL_HOOK__.queryClient.getQueryCache().getAll();

// 检查图片缓存
console.log('Image cache size:', imageCache.size);
```

### 自动化测试
- Lighthouse CI 集成
- Web Vitals 监控
- Bundle size 监控

---

## 📝 维护指南

### 新组件开发checklist
- [ ] 使用 LazyImage 替代 `<img>`
- [ ] API 调用使用 useQuery + 合适的缓存策略
- [ ] 长列表使用虚拟滚动
- [ ] 搜索/筛选使用 debounce
- [ ] 路由组件使用 lazy()

### 缓存策略选择
```
静态不变数据 → STATIC
较少变化数据 → SEMI_STATIC
经常变化数据 → DYNAMIC
实时更新数据 → REALTIME
```

---

**最后更新**: 2026-01-31  
**维护者**: FilmGallery Development Team
