/**
 * 图片优化工具
 * 
 * 提供图片预加载、缓存和响应式URL生成
 * 
 * @version 1.0.0
 * @date 2026-01-31
 */

// ============================================================================
// 图片预加载缓存
// ============================================================================

const imageCache = new Map();
const loadingPromises = new Map();

/**
 * 预加载单张图片
 * @param {string} url - 图片URL
 * @returns {Promise<boolean>} 是否成功
 */
export function preloadImage(url) {
  if (!url) return Promise.resolve(false);
  
  // 已缓存
  if (imageCache.has(url)) {
    return Promise.resolve(true);
  }
  
  // 正在加载中，返回相同的Promise
  if (loadingPromises.has(url)) {
    return loadingPromises.get(url);
  }
  
  // 开始加载
  const promise = new Promise((resolve) => {
    const img = new Image();
    
    img.onload = () => {
      imageCache.set(url, true);
      loadingPromises.delete(url);
      resolve(true);
    };
    
    img.onerror = () => {
      loadingPromises.delete(url);
      resolve(false);
    };
    
    img.src = url;
  });
  
  loadingPromises.set(url, promise);
  return promise;
}

/**
 * 批量预加载图片
 * @param {string[]} urls - 图片URL数组
 * @param {Object} options - 配置选项
 * @param {number} [options.maxConcurrent=4] - 最大并发数
 * @param {number} [options.timeout=10000] - 单张超时时间(ms)
 * @param {Function} [options.onProgress] - 进度回调 (loaded, total)
 * @returns {Promise<{success: number, failed: number}>}
 */
export async function preloadImages(urls, options = {}) {
  const { maxConcurrent = 4, timeout = 10000, onProgress } = options;
  
  if (!urls || urls.length === 0) {
    return { success: 0, failed: 0 };
  }
  
  // 过滤已缓存的
  const toLoad = urls.filter(url => url && !imageCache.has(url));
  
  if (toLoad.length === 0) {
    return { success: urls.length, failed: 0 };
  }
  
  let success = urls.length - toLoad.length;
  let failed = 0;
  let completed = 0;
  
  // 分批加载
  const chunks = [];
  for (let i = 0; i < toLoad.length; i += maxConcurrent) {
    chunks.push(toLoad.slice(i, i + maxConcurrent));
  }
  
  for (const chunk of chunks) {
    const results = await Promise.allSettled(
      chunk.map(url =>
        Promise.race([
          preloadImage(url),
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error('Timeout')), timeout)
          ),
        ])
      )
    );
    
    results.forEach((result) => {
      if (result.status === 'fulfilled' && result.value) {
        success++;
      } else {
        failed++;
      }
      completed++;
      onProgress?.(completed, toLoad.length);
    });
  }
  
  return { success, failed };
}

/**
 * 检查图片是否已缓存
 * @param {string} url - 图片URL
 * @returns {boolean}
 */
export function isImageCached(url) {
  return imageCache.has(url);
}

/**
 * 清除图片缓存
 */
export function clearImageCache() {
  imageCache.clear();
}

/**
 * 获取缓存统计
 * @returns {Object}
 */
export function getImageCacheStats() {
  return {
    size: imageCache.size,
    loading: loadingPromises.size,
  };
}

// ============================================================================
// 响应式图片
// ============================================================================

/**
 * 获取响应式图片URL
 * 如果服务器支持图片处理，添加尺寸和质量参数
 * 
 * @param {string} baseUrl - 原始URL
 * @param {Object} options - 配置
 * @param {number} [options.width] - 目标宽度
 * @param {number} [options.quality=85] - 图片质量 1-100
 * @param {string} [options.format='webp'] - 输出格式
 * @returns {string}
 */
export function getResponsiveImageUrl(baseUrl, options = {}) {
  if (!baseUrl) return '';
  
  const { width, quality = 85, format = 'webp' } = options;
  
  // 如果没有指定宽度，返回原始URL
  if (!width) return baseUrl;
  
  try {
    const url = new URL(baseUrl, window.location.origin);
    url.searchParams.set('w', String(width));
    url.searchParams.set('q', String(quality));
    url.searchParams.set('f', format);
    return url.toString();
  } catch {
    return baseUrl;
  }
}

/**
 * 根据容器宽度计算最佳图片尺寸
 * @param {number} containerWidth - 容器宽度
 * @param {number} [dpr=1] - 设备像素比
 * @returns {number} 推荐的图片宽度
 */
export function calculateOptimalImageWidth(containerWidth, dpr = window.devicePixelRatio || 1) {
  // 预定义断点
  const breakpoints = [320, 480, 640, 800, 1024, 1280, 1600, 1920, 2560];
  
  const targetWidth = containerWidth * dpr;
  
  // 找到第一个大于目标宽度的断点
  const optimalWidth = breakpoints.find(bp => bp >= targetWidth) || breakpoints[breakpoints.length - 1];
  
  return optimalWidth;
}

// ============================================================================
// 图片加载优先级
// ============================================================================

/**
 * 创建图片加载优先级队列
 */
class ImageLoadPriorityQueue {
  constructor() {
    this.queue = [];
    this.isProcessing = false;
    this.concurrent = 3;
    this.loading = 0;
  }
  
  /**
   * 添加图片到队列
   * @param {string} url - 图片URL
   * @param {number} priority - 优先级 (0最高)
   */
  add(url, priority = 5) {
    if (!url || imageCache.has(url)) return;
    
    const exists = this.queue.some(item => item.url === url);
    if (exists) return;
    
    this.queue.push({ url, priority });
    this.queue.sort((a, b) => a.priority - b.priority);
    
    this.process();
  }
  
  /**
   * 处理队列
   */
  async process() {
    if (this.isProcessing || this.loading >= this.concurrent) return;
    
    const item = this.queue.shift();
    if (!item) {
      this.isProcessing = false;
      return;
    }
    
    this.isProcessing = true;
    this.loading++;
    
    try {
      await preloadImage(item.url);
    } catch (e) {
      // ignore
    }
    
    this.loading--;
    this.isProcessing = false;
    
    if (this.queue.length > 0) {
      this.process();
    }
  }
  
  /**
   * 清空队列
   */
  clear() {
    this.queue = [];
  }
}

export const imageLoadQueue = new ImageLoadPriorityQueue();

// ============================================================================
// URL 缓存键生成 - 基于文件更新时间而非随机时间戳
// ============================================================================

/**
 * 为图片 URL 添加基于更新时间的缓存键
 * 这样可以确保：
 * - 相同文件在未修改时使用浏览器缓存
 * - 文件更新后自动获取新版本
 * 
 * @param {string} url - 原始图片URL
 * @param {string|Date|number} updatedAt - 文件更新时间
 * @returns {string} 带缓存键的URL
 */
export function addCacheKey(url, updatedAt) {
  if (!url) return '';
  if (!updatedAt) return url;
  
  const timestamp = updatedAt instanceof Date 
    ? updatedAt.getTime()
    : typeof updatedAt === 'string'
      ? new Date(updatedAt).getTime()
      : updatedAt;
  
  // 如果时间戳无效，返回原URL
  if (!timestamp || isNaN(timestamp)) return url;
  
  const separator = url.includes('?') ? '&' : '?';
  return `${url}${separator}v=${timestamp}`;
}

/**
 * 从照片对象生成带缓存键的URL
 * @param {string} url - 原始图片URL
 * @param {Object} photo - 照片对象 (需要有 updated_at 字段)
 * @returns {string} 带缓存键的URL
 */
export function getPhotoUrlWithCache(url, photo) {
  return addCacheKey(url, photo?.updated_at);
}

export default {
  preloadImage,
  preloadImages,
  isImageCached,
  clearImageCache,
  getImageCacheStats,
  getResponsiveImageUrl,
  calculateOptimalImageWidth,
  imageLoadQueue,
  addCacheKey,
  getPhotoUrlWithCache,
};
