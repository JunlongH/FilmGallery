/**
 * QueryClient 统一配置
 * 
 * 针对 Electron 桌面环境优化的缓存策略
 * - 更长的缓存时间（桌面环境网络稳定）
 * - 禁用自动重取（避免不必要的请求）
 * - 支持环境适配
 * 
 * @version 1.0.0
 * @date 2026-01-31
 */

import { QueryClient } from '@tanstack/react-query';

// ============================================================================
// 环境检测
// ============================================================================

export const isElectron = typeof window !== 'undefined' && !!window.__electron;
export const isDevelopment = process.env.NODE_ENV === 'development';

// ============================================================================
// 缓存策略配置
// ============================================================================

/**
 * 缓存策略类型
 */
export const CACHE_STRATEGIES = {
  /**
   * 静态数据 - 几乎不变的数据
   * 设备库、胶片库、LUT列表等
   */
  STATIC: {
    staleTime: Infinity,              // 永不过期
    gcTime: 1000 * 60 * 60 * 24,      // 24小时GC
  },
  
  /**
   * 半静态数据 - 较少变化的数据
   * 地点列表、标签列表等
   */
  SEMI_STATIC: {
    staleTime: 1000 * 60 * 30,        // 30分钟新鲜
    gcTime: 1000 * 60 * 60,           // 1小时GC
  },
  
  /**
   * 动态数据 - 经常变化的数据
   * 胶卷列表、照片列表、统计数据等
   */
  DYNAMIC: {
    staleTime: 1000 * 60 * 5,         // 5分钟新鲜
    gcTime: 1000 * 60 * 15,           // 15分钟GC
  },
  
  /**
   * 实时数据 - 需要频繁更新的数据
   * 上传进度、导出任务等
   */
  REALTIME: {
    staleTime: 1000 * 30,             // 30秒新鲜
    gcTime: 1000 * 60 * 2,            // 2分钟GC
  }
};

/**
 * 数据类型到缓存策略的映射
 */
export const DATA_CACHE_MAP = {
  // 静态数据
  equipment: CACHE_STRATEGIES.STATIC,
  cameras: CACHE_STRATEGIES.STATIC,
  lenses: CACHE_STRATEGIES.STATIC,
  films: CACHE_STRATEGIES.STATIC,
  luts: CACHE_STRATEGIES.STATIC,
  
  // 半静态数据
  locations: CACHE_STRATEGIES.SEMI_STATIC,
  tags: CACHE_STRATEGIES.SEMI_STATIC,
  
  // 动态数据
  rolls: CACHE_STRATEGIES.DYNAMIC,
  photos: CACHE_STRATEGIES.DYNAMIC,
  stats: CACHE_STRATEGIES.DYNAMIC,
  favorites: CACHE_STRATEGIES.DYNAMIC,
  
  // 实时数据
  uploadProgress: CACHE_STRATEGIES.REALTIME,
  exportJobs: CACHE_STRATEGIES.REALTIME,
  conflicts: CACHE_STRATEGIES.REALTIME,
};

/**
 * 获取数据类型的缓存策略
 * @param {string} dataType - 数据类型
 * @returns {Object} 缓存策略配置
 */
export function getCacheStrategy(dataType) {
  return DATA_CACHE_MAP[dataType] || CACHE_STRATEGIES.DYNAMIC;
}

// ============================================================================
// 环境特定配置
// ============================================================================

const ELECTRON_CONFIG = {
  staleTime: 1000 * 60 * 15,          // 15分钟（Electron环境更长）
  gcTime: 1000 * 60 * 60,             // 1小时
};

const WEB_CONFIG = {
  staleTime: 1000 * 60 * 5,           // 5分钟
  gcTime: 1000 * 60 * 30,             // 30分钟
};

const envConfig = isElectron ? ELECTRON_CONFIG : WEB_CONFIG;

// ============================================================================
// QueryClient 实例
// ============================================================================

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // 核心缓存配置
      staleTime: envConfig.staleTime,
      gcTime: envConfig.gcTime,
      
      // 减少自动刷新（桌面环境不需要）
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
      refetchOnMount: false,
      
      // 错误处理
      retry: 2,
      retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
      
      // 性能优化
      structuralSharing: true,
      
      // 开发环境日志
      ...(isDevelopment && {
        onError: (error) => console.error('[React Query Error]', error),
      }),
    },
    mutations: {
      retry: 1,
      onError: (error) => console.error('[Mutation Error]', error),
    },
  },
});

// ============================================================================
// 缓存工具函数
// ============================================================================

export const cacheUtils = {
  /**
   * 清除特定模块的缓存
   * @param {string|string[]} moduleKey - 模块键名
   */
  clearModule: (moduleKey) => {
    const keys = Array.isArray(moduleKey) ? moduleKey : [moduleKey];
    keys.forEach(key => {
      queryClient.removeQueries({ queryKey: [key] });
    });
  },
  
  /**
   * 预取数据
   * @param {string[]} queryKey - 查询键
   * @param {Function} queryFn - 查询函数
   * @param {Object} options - 额外选项
   */
  prefetch: async (queryKey, queryFn, options = {}) => {
    await queryClient.prefetchQuery({ 
      queryKey, 
      queryFn,
      staleTime: 1000 * 60 * 5, // 默认5分钟
      ...options 
    });
  },
  
  /**
   * 手动设置缓存数据
   * @param {string[]} queryKey - 查询键
   * @param {any} data - 数据
   */
  setQueryData: (queryKey, data) => {
    queryClient.setQueryData(queryKey, data);
  },
  
  /**
   * 获取缓存数据
   * @param {string[]} queryKey - 查询键
   * @returns {any} 缓存数据
   */
  getQueryData: (queryKey) => {
    return queryClient.getQueryData(queryKey);
  },
  
  /**
   * 使缓存失效（标记为stale但保留数据）
   * @param {string|string[]} queryKey - 查询键
   */
  invalidate: (queryKey) => {
    const keys = Array.isArray(queryKey) ? queryKey : [queryKey];
    queryClient.invalidateQueries({ queryKey: keys });
  },
  
  /**
   * 清除所有缓存
   */
  clearAll: () => {
    queryClient.clear();
  },
  
  /**
   * 获取缓存统计
   * @returns {Object} 缓存统计信息
   */
  getStats: () => {
    const cache = queryClient.getQueryCache();
    const queries = cache.getAll();
    
    return {
      totalQueries: queries.length,
      staleQueries: queries.filter(q => q.isStale()).length,
      fetchingQueries: queries.filter(q => q.state.fetchStatus === 'fetching').length,
      errorQueries: queries.filter(q => q.state.status === 'error').length,
    };
  },
};

// ============================================================================
// 导出
// ============================================================================

export default queryClient;
