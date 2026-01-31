/**
 * 数据预取管理器
 * 
 * 智能预取策略，提前加载用户可能访问的数据
 * - 队列管理避免请求拥堵
 * - 延迟执行避免阻塞主线程
 * - 支持优先级
 * 
 * @version 1.0.0
 * @date 2026-01-31
 */

import { queryClient, CACHE_STRATEGIES } from './queryClient';
import { getRolls, getFilms, getCameras, getLenses, getLocations, getTags } from '../api';
import { getApiBase } from '../api';

// ============================================================================
// 预取管理器
// ============================================================================

class DataPrefetchManager {
  constructor() {
    this.queue = [];
    this.isProcessing = false;
    this.processDelay = 300; // 任务间隔(ms)
  }
  
  /**
   * 添加预取任务
   * @param {Object} task - 预取任务
   * @param {string[]} task.queryKey - 查询键
   * @param {Function} task.queryFn - 查询函数
   * @param {Object} task.options - 额外选项
   * @param {number} task.priority - 优先级 (0最高)
   */
  add(task) {
    // 检查是否已在队列中
    const exists = this.queue.some(
      t => JSON.stringify(t.queryKey) === JSON.stringify(task.queryKey)
    );
    
    if (exists) return;
    
    // 检查缓存是否已存在且新鲜
    const cached = queryClient.getQueryData(task.queryKey);
    const queryState = queryClient.getQueryState(task.queryKey);
    
    if (cached && queryState && !queryState.isStale) {
      return; // 缓存有效，跳过预取
    }
    
    this.queue.push({
      ...task,
      priority: task.priority ?? 5,
    });
    
    // 按优先级排序
    this.queue.sort((a, b) => a.priority - b.priority);
    
    if (!this.isProcessing) {
      this.process();
    }
  }
  
  /**
   * 处理预取队列
   */
  async process() {
    if (this.queue.length === 0) {
      this.isProcessing = false;
      return;
    }
    
    this.isProcessing = true;
    const task = this.queue.shift();
    
    try {
      await queryClient.prefetchQuery({
        queryKey: task.queryKey,
        queryFn: task.queryFn,
        staleTime: task.options?.staleTime ?? CACHE_STRATEGIES.DYNAMIC.staleTime,
        ...task.options,
      });
      
      if (process.env.NODE_ENV === 'development') {
        console.log('[Prefetch] Loaded:', task.queryKey.join('/'));
      }
    } catch (err) {
      console.warn('[Prefetch] Failed:', task.queryKey, err.message);
    }
    
    // 延迟处理下一个任务，避免阻塞主线程
    setTimeout(() => this.process(), this.processDelay);
  }
  
  /**
   * 清空队列
   */
  clear() {
    this.queue = [];
  }
  
  /**
   * 获取队列状态
   */
  getStatus() {
    return {
      queueLength: this.queue.length,
      isProcessing: this.isProcessing,
      pendingKeys: this.queue.map(t => t.queryKey.join('/')),
    };
  }
}

export const prefetchManager = new DataPrefetchManager();

// ============================================================================
// 预置预取函数
// ============================================================================

/**
 * 预取 Overview 页面数据
 */
export function prefetchOverviewData() {
  const apiBase = getApiBase();
  
  // 统计数据
  prefetchManager.add({
    queryKey: ['quickStats'],
    queryFn: async () => {
      const res = await fetch(`${apiBase}/api/stats/summary`);
      return res.json();
    },
    priority: 1,
    options: { staleTime: CACHE_STRATEGIES.DYNAMIC.staleTime },
  });
  
  // 最近胶卷
  prefetchManager.add({
    queryKey: ['rolls', 'recent'],
    queryFn: () => getRolls({ limit: 20 }),
    priority: 2,
    options: { staleTime: CACHE_STRATEGIES.DYNAMIC.staleTime },
  });
}

/**
 * 预取 RollDetail 相关数据
 * @param {number} rollId - 胶卷ID
 */
export function prefetchRollDetailData(rollId) {
  const apiBase = getApiBase();
  
  // 胶卷照片
  prefetchManager.add({
    queryKey: ['photos', rollId],
    queryFn: async () => {
      const res = await fetch(`${apiBase}/api/rolls/${rollId}/photos`);
      return res.json();
    },
    priority: 1,
  });
  
  // 相机列表（用于编辑）
  prefetchManager.add({
    queryKey: ['equipment', 'cameras'],
    queryFn: getCameras,
    priority: 3,
    options: { staleTime: CACHE_STRATEGIES.STATIC.staleTime },
  });
  
  // 镜头列表
  prefetchManager.add({
    queryKey: ['equipment', 'lenses'],
    queryFn: getLenses,
    priority: 3,
    options: { staleTime: CACHE_STRATEGIES.STATIC.staleTime },
  });
}

/**
 * 预取 FilmLibrary 数据
 */
export function prefetchFilmLibraryData() {
  prefetchManager.add({
    queryKey: ['films'],
    queryFn: getFilms,
    priority: 2,
    options: { staleTime: CACHE_STRATEGIES.STATIC.staleTime },
  });
}

/**
 * 预取 EquipmentManager 数据
 */
export function prefetchEquipmentData() {
  prefetchManager.add({
    queryKey: ['equipment', 'cameras'],
    queryFn: getCameras,
    priority: 2,
    options: { staleTime: CACHE_STRATEGIES.STATIC.staleTime },
  });
  
  prefetchManager.add({
    queryKey: ['equipment', 'lenses'],
    queryFn: getLenses,
    priority: 2,
    options: { staleTime: CACHE_STRATEGIES.STATIC.staleTime },
  });
}

/**
 * 应用启动时预取常用数据
 * 延迟执行避免影响首屏渲染
 */
export function prefetchCommonData() {
  // 延迟 3 秒后开始预取
  setTimeout(() => {
    // 胶片列表（静态数据）
    prefetchManager.add({
      queryKey: ['films'],
      queryFn: getFilms,
      priority: 5,
      options: { staleTime: CACHE_STRATEGIES.STATIC.staleTime },
    });
    
    // 相机列表
    prefetchManager.add({
      queryKey: ['equipment', 'cameras'],
      queryFn: getCameras,
      priority: 5,
      options: { staleTime: CACHE_STRATEGIES.STATIC.staleTime },
    });
    
    // 地点列表
    prefetchManager.add({
      queryKey: ['locations'],
      queryFn: getLocations,
      priority: 6,
      options: { staleTime: CACHE_STRATEGIES.SEMI_STATIC.staleTime },
    });
    
    // 标签列表
    prefetchManager.add({
      queryKey: ['tags'],
      queryFn: getTags,
      priority: 6,
      options: { staleTime: CACHE_STRATEGIES.SEMI_STATIC.staleTime },
    });
  }, 3000);
}

// ============================================================================
// 鼠标悬停预取 HOC
// ============================================================================

/**
 * 创建悬停预取处理器
 * @param {Object} task - 预取任务
 * @returns {Function} onMouseEnter 处理器
 */
export function createHoverPrefetch(task) {
  let prefetched = false;
  
  return () => {
    if (!prefetched) {
      prefetchManager.add(task);
      prefetched = true;
    }
  };
}

export default prefetchManager;
