/**
 * File Access Service - 文件访问抽象层
 * 
 * 在混合模式下，需要支持多种文件访问方式：
 * 1. 直接本地路径访问（SMB/NFS 挂载的 NAS）
 * 2. HTTP 远程访问（通过服务器 API）
 * 3. 临时文件下载缓存（带 LRU 淘汰和持久化支持）
 */

import { buildUploadUrl } from '../api';

// ========================================
// Phase 4.1: 增强文件缓存机制
// ========================================

// 缓存配置
const CACHE_CONFIG = {
  maxSize: 100,                    // 最大缓存文件数
  maxMemoryBytes: 500 * 1024 * 1024, // 最大内存占用 500MB
  expireMs: 10 * 60 * 1000,        // 10分钟过期
  persistToDisk: true              // 是否持久化到磁盘（需要 Electron）
};

// 内存缓存
const fileCache = new Map();
let totalCacheBytes = 0;

// 缓存统计
const cacheStats = {
  hits: 0,
  misses: 0,
  evictions: 0,
  totalBytesServed: 0
};

/**
 * LRU 缓存条目
 */
class CacheEntry {
  constructor(key, data) {
    this.key = key;
    this.data = data;
    this.size = data.byteLength || 0;
    this.timestamp = Date.now();
    this.lastAccess = Date.now();
    this.accessCount = 0;
  }
  
  touch() {
    this.lastAccess = Date.now();
    this.accessCount++;
  }
  
  isExpired() {
    return Date.now() - this.timestamp > CACHE_CONFIG.expireMs;
  }
}

/**
 * 获取文件 URL（自动处理各种路径格式）
 */
export function getFileUrl(pathOrUrl) {
  if (!pathOrUrl) return null;
  
  // 已经是完整 URL
  if (pathOrUrl.startsWith('http://') || pathOrUrl.startsWith('https://')) {
    return pathOrUrl;
  }
  
  // 使用现有的 buildUploadUrl
  return buildUploadUrl(pathOrUrl);
}

/**
 * 检查是否有本地文件系统访问能力
 * （Electron 环境 + 配置了 SMB/NFS 挂载路径）
 */
export function hasLocalFileAccess() {
  return !!window.__electron?.readLocalFile;
}

/**
 * 获取文件作为 ArrayBuffer
 * 智能选择本地或远程访问
 */
export async function getFileAsArrayBuffer(pathOrUrl, options = {}) {
  const { useCache = true, forceRemote = false } = options;
  
  // 检查缓存
  if (useCache) {
    const cached = getCachedFile(pathOrUrl);
    if (cached) {
      return cached;
    }
  }
  
  let arrayBuffer;
  
  // 尝试本地文件系统访问（如果可用且路径是本地路径）
  if (!forceRemote && hasLocalFileAccess() && isLocalPath(pathOrUrl)) {
    try {
      arrayBuffer = await readLocalFile(pathOrUrl);
      if (arrayBuffer) {
        cacheFile(pathOrUrl, arrayBuffer);
        return arrayBuffer;
      }
    } catch (e) {
      console.warn('[FileAccess] Local read failed, falling back to HTTP:', e);
    }
  }
  
  // HTTP 远程访问
  const url = getFileUrl(pathOrUrl);
  if (!url) {
    throw new Error('Invalid file path or URL');
  }
  
  try {
    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}: ${res.statusText}`);
    }
    arrayBuffer = await res.arrayBuffer();
    cacheFile(pathOrUrl, arrayBuffer);
    return arrayBuffer;
  } catch (e) {
    console.error('[FileAccess] Failed to fetch file:', e);
    throw e;
  }
}

/**
 * 获取文件作为 Blob
 */
export async function getFileAsBlob(pathOrUrl, options = {}) {
  const arrayBuffer = await getFileAsArrayBuffer(pathOrUrl, options);
  return new Blob([arrayBuffer]);
}

/**
 * 获取文件作为 Data URL
 */
export async function getFileAsDataUrl(pathOrUrl, options = {}) {
  const blob = await getFileAsBlob(pathOrUrl, options);
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

/**
 * 获取文件作为 Image 对象
 */
export async function getFileAsImage(pathOrUrl, options = {}) {
  // 对于图片，直接使用 URL 更高效
  const url = getFileUrl(pathOrUrl);
  
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    
    img.onload = () => resolve(img);
    img.onerror = (e) => reject(new Error('Failed to load image'));
    
    img.src = url;
  });
}

/**
 * 预取文件到缓存
 */
export async function prefetchFile(pathOrUrl) {
  try {
    await getFileAsArrayBuffer(pathOrUrl, { useCache: true });
    return true;
  } catch (e) {
    console.warn('[FileAccess] Prefetch failed:', e);
    return false;
  }
}

/**
 * 批量预取文件
 */
export async function prefetchFiles(paths, options = { concurrency: 3 }) {
  const { concurrency } = options;
  const results = [];
  
  // 分批处理
  for (let i = 0; i < paths.length; i += concurrency) {
    const batch = paths.slice(i, i + concurrency);
    const batchResults = await Promise.allSettled(
      batch.map(p => prefetchFile(p))
    );
    results.push(...batchResults);
  }
  
  return results;
}

/**
 * 清除文件缓存
 */
export function clearFileCache() {
  totalCacheBytes = 0;
  fileCache.clear();
  cacheStats.evictions = 0;
  console.log('[FileAccess] Cache cleared');
}

/**
 * 移除特定缓存条目
 */
export function invalidateCache(key) {
  const entry = fileCache.get(key);
  if (entry) {
    totalCacheBytes -= entry.size;
    fileCache.delete(key);
    return true;
  }
  return false;
}

/**
 * 获取缓存状态（详细）
 */
export function getCacheStatus() {
  return {
    size: fileCache.size,
    maxSize: CACHE_CONFIG.maxSize,
    totalBytes: totalCacheBytes,
    maxBytes: CACHE_CONFIG.maxMemoryBytes,
    stats: { ...cacheStats },
    hitRate: cacheStats.hits + cacheStats.misses > 0 
      ? (cacheStats.hits / (cacheStats.hits + cacheStats.misses) * 100).toFixed(2) + '%'
      : 'N/A',
    entries: Array.from(fileCache.entries()).map(([key, entry]) => ({
      key,
      size: entry.size,
      age: Date.now() - entry.timestamp,
      accessCount: entry.accessCount,
      isExpired: entry.isExpired()
    }))
  };
}

/**
 * 获取缓存统计摘要
 */
export function getCacheStats() {
  return {
    hits: cacheStats.hits,
    misses: cacheStats.misses,
    hitRate: cacheStats.hits + cacheStats.misses > 0 
      ? cacheStats.hits / (cacheStats.hits + cacheStats.misses)
      : 0,
    evictions: cacheStats.evictions,
    totalBytesServed: cacheStats.totalBytesServed,
    currentSize: fileCache.size,
    currentBytes: totalCacheBytes
  };
}

/**
 * 更新缓存配置
 */
export function setCacheConfig(config) {
  Object.assign(CACHE_CONFIG, config);
  // 如果新配置更严格，立即清理
  evictIfNeeded();
}

/**
 * 缓存预热 - 批量加载常用文件
 */
export async function warmCache(paths, options = { concurrency: 5, priority: 'low' }) {
  const { concurrency, priority } = options;
  const results = { success: 0, failed: 0, skipped: 0 };
  
  console.log(`[FileAccess] Warming cache with ${paths.length} files...`);
  
  for (let i = 0; i < paths.length; i += concurrency) {
    const batch = paths.slice(i, i + concurrency);
    
    // 低优先级：使用 requestIdleCallback 避免阻塞 UI
    if (priority === 'low' && typeof requestIdleCallback !== 'undefined') {
      await new Promise(resolve => requestIdleCallback(resolve, { timeout: 1000 }));
    }
    
    const batchResults = await Promise.allSettled(
      batch.map(async (path) => {
        // 跳过已缓存的文件
        if (fileCache.has(path)) {
          results.skipped++;
          return;
        }
        await getFileAsArrayBuffer(path, { useCache: true });
        results.success++;
      })
    );
    
    batchResults.forEach(r => {
      if (r.status === 'rejected') results.failed++;
    });
  }
  
  console.log(`[FileAccess] Cache warm complete:`, results);
  return results;
}

// ========================================
// 内部辅助函数
// ========================================

/**
 * 判断是否是本地路径（Windows 或 Unix）
 */
function isLocalPath(pathOrUrl) {
  if (!pathOrUrl) return false;
  // Windows 路径
  if (/^[a-zA-Z]:[\\/]/.test(pathOrUrl)) return true;
  // Unix 绝对路径
  if (pathOrUrl.startsWith('/') && !pathOrUrl.startsWith('//')) return true;
  // UNC 路径
  if (pathOrUrl.startsWith('\\\\') || pathOrUrl.startsWith('//')) return true;
  return false;
}

/**
 * 读取本地文件（通过 Electron IPC）
 */
async function readLocalFile(localPath) {
  if (!window.__electron?.readLocalFile) {
    throw new Error('Local file access not available');
  }
  return await window.__electron.readLocalFile(localPath);
}

/**
 * 缓存文件 - 使用 LRU 策略
 */
function cacheFile(key, arrayBuffer) {
  const size = arrayBuffer.byteLength;
  
  // 如果单个文件太大，不缓存
  if (size > CACHE_CONFIG.maxMemoryBytes * 0.5) {
    console.warn(`[FileAccess] File too large to cache: ${(size / 1024 / 1024).toFixed(2)}MB`);
    return;
  }
  
  // 清理过期缓存
  cleanExpiredCache();
  
  // LRU 淘汰：确保有足够空间
  while (
    (fileCache.size >= CACHE_CONFIG.maxSize || 
     totalCacheBytes + size > CACHE_CONFIG.maxMemoryBytes) &&
    fileCache.size > 0
  ) {
    evictLRU();
  }
  
  const entry = new CacheEntry(key, arrayBuffer);
  fileCache.set(key, entry);
  totalCacheBytes += size;
}

/**
 * 获取缓存的文件 - 带 LRU touch
 */
function getCachedFile(key) {
  const entry = fileCache.get(key);
  if (!entry) {
    cacheStats.misses++;
    return null;
  }
  
  // 检查是否过期
  if (entry.isExpired()) {
    totalCacheBytes -= entry.size;
    fileCache.delete(key);
    cacheStats.misses++;
    return null;
  }
  
  // LRU: 更新访问时间
  entry.touch();
  cacheStats.hits++;
  cacheStats.totalBytesServed += entry.size;
  
  return entry.data;
}

/**
 * LRU 淘汰 - 删除最久未访问的条目
 */
function evictLRU() {
  let oldest = null;
  let oldestKey = null;
  
  for (const [key, entry] of fileCache.entries()) {
    if (!oldest || entry.lastAccess < oldest.lastAccess) {
      oldest = entry;
      oldestKey = key;
    }
  }
  
  if (oldestKey) {
    totalCacheBytes -= oldest.size;
    fileCache.delete(oldestKey);
    cacheStats.evictions++;
  }
}

/**
 * 按需淘汰 - 确保满足配置限制
 */
function evictIfNeeded() {
  while (
    fileCache.size > CACHE_CONFIG.maxSize || 
    totalCacheBytes > CACHE_CONFIG.maxMemoryBytes
  ) {
    evictLRU();
  }
}

/**
 * 清理过期缓存
 */
function cleanExpiredCache() {
  for (const [key, entry] of fileCache.entries()) {
    if (entry.isExpired()) {
      totalCacheBytes -= entry.size;
      fileCache.delete(key);
    }
  }
}

// ========================================
// 持久化缓存支持（Electron 环境）
// ========================================

/**
 * 保存缓存索引到磁盘（仅元数据，不含实际数据）
 */
export async function saveCacheIndex() {
  if (!window.__electron?.saveCacheIndex) {
    return false;
  }
  
  const index = {
    timestamp: Date.now(),
    entries: Array.from(fileCache.entries()).map(([key, entry]) => ({
      key,
      size: entry.size,
      timestamp: entry.timestamp
    }))
  };
  
  try {
    await window.__electron.saveCacheIndex(index);
    return true;
  } catch (e) {
    console.error('[FileAccess] Failed to save cache index:', e);
    return false;
  }
}

/**
 * 从磁盘加载缓存索引
 */
export async function loadCacheIndex() {
  if (!window.__electron?.loadCacheIndex) {
    return null;
  }
  
  try {
    return await window.__electron.loadCacheIndex();
  } catch (e) {
    console.error('[FileAccess] Failed to load cache index:', e);
    return null;
  }
}

const FileAccessService = {
  // 核心访问
  getFileUrl,
  hasLocalFileAccess,
  getFileAsArrayBuffer,
  getFileAsBlob,
  getFileAsDataUrl,
  getFileAsImage,
  
  // 预取
  prefetchFile,
  prefetchFiles,
  warmCache,
  
  // 缓存管理
  clearFileCache,
  invalidateCache,
  getCacheStatus,
  getCacheStats,
  setCacheConfig,
  
  // 持久化
  saveCacheIndex,
  loadCacheIndex
};

export default FileAccessService;
