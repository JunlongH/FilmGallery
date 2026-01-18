/**
 * File Access Service - 文件访问抽象层
 * 
 * 在混合模式下，需要支持多种文件访问方式：
 * 1. 直接本地路径访问（SMB/NFS 挂载的 NAS）
 * 2. HTTP 远程访问（通过服务器 API）
 * 3. 临时文件下载缓存
 */

import { API_BASE, buildUploadUrl } from '../api';

// 文件缓存（用于混合模式下载后的本地处理）
const fileCache = new Map();
const CACHE_MAX_SIZE = 100; // 最大缓存文件数
const CACHE_EXPIRE_MS = 5 * 60 * 1000; // 5分钟过期

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
  fileCache.clear();
}

/**
 * 获取缓存状态
 */
export function getCacheStatus() {
  return {
    size: fileCache.size,
    maxSize: CACHE_MAX_SIZE,
    entries: Array.from(fileCache.keys())
  };
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
 * 缓存文件
 */
function cacheFile(key, arrayBuffer) {
  // 清理过期缓存
  cleanExpiredCache();
  
  // 如果缓存已满，删除最老的条目
  if (fileCache.size >= CACHE_MAX_SIZE) {
    const oldestKey = fileCache.keys().next().value;
    fileCache.delete(oldestKey);
  }
  
  fileCache.set(key, {
    data: arrayBuffer,
    timestamp: Date.now()
  });
}

/**
 * 获取缓存的文件
 */
function getCachedFile(key) {
  const cached = fileCache.get(key);
  if (!cached) return null;
  
  // 检查是否过期
  if (Date.now() - cached.timestamp > CACHE_EXPIRE_MS) {
    fileCache.delete(key);
    return null;
  }
  
  return cached.data;
}

/**
 * 清理过期缓存
 */
function cleanExpiredCache() {
  const now = Date.now();
  for (const [key, value] of fileCache.entries()) {
    if (now - value.timestamp > CACHE_EXPIRE_MS) {
      fileCache.delete(key);
    }
  }
}

export default {
  getFileUrl,
  hasLocalFileAccess,
  getFileAsArrayBuffer,
  getFileAsBlob,
  getFileAsDataUrl,
  getFileAsImage,
  prefetchFile,
  prefetchFiles,
  clearFileCache,
  getCacheStatus
};
