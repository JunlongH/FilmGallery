/**
 * Compute Service - 混合模式计算抽象层
 * 
 * 当连接到 NAS 服务器时，计算密集型任务需要在本地执行。
 * 此模块检测服务器能力并智能路由请求。
 */

import { API_BASE } from '../api';

// 缓存服务器能力
let serverCapabilities = null;
let lastCapabilityCheck = 0;
const CAPABILITY_CACHE_MS = 60000; // 1分钟缓存

/**
 * 获取服务器能力（带缓存）
 */
export async function getServerCapabilities() {
  const now = Date.now();
  if (serverCapabilities && (now - lastCapabilityCheck) < CAPABILITY_CACHE_MS) {
    return serverCapabilities;
  }
  
  try {
    const res = await fetch(`${API_BASE}/api/discover`);
    if (res.ok) {
      const data = await res.json();
      serverCapabilities = {
        mode: data.mode || 'standalone',
        compute: data.capabilities?.compute ?? true,
        database: data.capabilities?.database ?? true,
        files: data.capabilities?.files ?? true,
        version: data.version
      };
      lastCapabilityCheck = now;
      return serverCapabilities;
    }
  } catch (e) {
    console.warn('[ComputeService] Failed to fetch capabilities:', e);
  }
  
  // 默认假设服务器有完整能力
  return {
    mode: 'standalone',
    compute: true,
    database: true,
    files: true
  };
}

/**
 * 检查服务器是否支持计算功能
 */
export async function isComputeAvailable() {
  const caps = await getServerCapabilities();
  return caps.compute === true;
}

/**
 * 检查是否处于混合模式（NAS + 本地算力）
 */
export function isHybridMode() {
  const isElectron = !!window.__electron;
  if (!isElectron) return false;
  
  // 检查配置的服务器模式
  // 这个值在 preload 阶段同步加载
  return window.__electron?.serverMode === 'hybrid';
}

/**
 * 获取本地 Electron GPU 处理器
 */
export function getLocalGpuProcessor() {
  if (!window.__electron?.filmlabGpuProcess) {
    return null;
  }
  return window.__electron.filmlabGpuProcess;
}

/**
 * 智能 FilmLab 预览
 * 在混合模式下使用本地 GPU，否则使用服务器
 */
export async function smartFilmlabPreview({ photoId, params, maxWidth = 1400 }) {
  const hasCompute = await isComputeAvailable();
  
  // 如果服务器有计算能力，使用服务器
  if (hasCompute) {
    const resp = await fetch(`${API_BASE}/api/filmlab/preview`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache'
      },
      body: JSON.stringify({ photoId, params, maxWidth }),
      cache: 'no-store'
    });
    
    const ct = resp.headers.get('content-type') || '';
    if (ct.startsWith('image/')) {
      const blob = await resp.blob();
      return { ok: true, blob, source: 'server' };
    }
    
    // 检查是否是计算不可用错误
    if (resp.status === 503) {
      const data = await resp.json().catch(() => ({}));
      if (data.code === 'E_NAS_NO_COMPUTE') {
        // 服务器明确表示无计算能力，尝试本地处理
        return await localGpuPreview({ photoId, params, maxWidth });
      }
    }
    
    const text = await resp.text();
    let err;
    try { err = JSON.parse(text); } catch { err = { error: text }; }
    return { ok: false, error: err?.error || err?.message || text };
  }
  
  // 服务器无计算能力，使用本地 GPU
  return await localGpuPreview({ photoId, params, maxWidth });
}

/**
 * 本地 GPU 预览处理
 */
async function localGpuPreview({ photoId, params, maxWidth }) {
  const gpuProcessor = getLocalGpuProcessor();
  
  if (!gpuProcessor) {
    return { 
      ok: false, 
      error: '本地 GPU 处理不可用。请在 Electron 桌面客户端中使用混合模式。' 
    };
  }
  
  try {
    // 需要获取图片 URL
    const imageUrl = await getPhotoImageUrl(photoId);
    if (!imageUrl) {
      return { ok: false, error: 'Cannot get photo image URL' };
    }
    
    const result = await gpuProcessor({ 
      params, 
      photoId, 
      imageUrl,
      previewMode: true,
      maxWidth 
    });
    
    if (result?.ok) {
      return { 
        ok: true, 
        blob: result.blob, 
        source: 'local-gpu' 
      };
    }
    
    return { ok: false, error: result?.error || 'Local GPU processing failed' };
  } catch (e) {
    console.error('[ComputeService] Local GPU preview failed:', e);
    return { ok: false, error: e.message || 'Local GPU processing failed' };
  }
}

/**
 * 获取照片的图片 URL
 */
async function getPhotoImageUrl(photoId) {
  try {
    const res = await fetch(`${API_BASE}/api/photos/${photoId}`);
    if (res.ok) {
      const photo = await res.json();
      // 返回原始文件路径或 URL
      return photo.original_path || photo.processed_path || photo.thumbnail_url;
    }
  } catch (e) {
    console.error('[ComputeService] Failed to get photo info:', e);
  }
  return null;
}

/**
 * 智能渲染正片
 * 在混合模式下使用本地 GPU，否则使用服务器
 */
export async function smartRenderPositive(photoId, params, { format = 'jpeg' } = {}) {
  const hasCompute = await isComputeAvailable();
  
  if (hasCompute) {
    // 使用服务器渲染
    const resp = await fetch(`${API_BASE}/api/photos/${photoId}/render-positive`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ params, format })
    });
    
    const ct = resp.headers.get('content-type') || '';
    if (ct.startsWith('image/')) {
      const blob = await resp.blob();
      return { ok: true, blob, contentType: ct, source: 'server' };
    }
    
    // 检查是否是计算不可用错误
    if (resp.status === 503) {
      const data = await resp.json().catch(() => ({}));
      if (data.code === 'E_NAS_NO_COMPUTE') {
        return await localRenderPositive(photoId, params, { format });
      }
    }
    
    const text = await resp.text();
    let err;
    try { err = JSON.parse(text); } catch { err = { error: text }; }
    return { ok: false, error: err?.error || err?.message || text };
  }
  
  // 使用本地渲染
  return await localRenderPositive(photoId, params, { format });
}

/**
 * 本地渲染正片
 */
async function localRenderPositive(photoId, params, { format = 'jpeg' } = {}) {
  const gpuProcessor = getLocalGpuProcessor();
  
  if (!gpuProcessor) {
    return { 
      ok: false, 
      error: '本地 GPU 处理不可用。请在 Electron 桌面客户端中使用混合模式。' 
    };
  }
  
  try {
    const imageUrl = await getPhotoImageUrl(photoId);
    if (!imageUrl) {
      return { ok: false, error: 'Cannot get photo image URL' };
    }
    
    const result = await gpuProcessor({ 
      params, 
      photoId, 
      imageUrl,
      previewMode: false,
      outputFormat: format
    });
    
    if (result?.ok) {
      return { 
        ok: true, 
        blob: result.blob,
        contentType: format === 'tiff16' ? 'image/tiff' : 'image/jpeg',
        source: 'local-gpu' 
      };
    }
    
    return { ok: false, error: result?.error || 'Local GPU processing failed' };
  } catch (e) {
    console.error('[ComputeService] Local render failed:', e);
    return { ok: false, error: e.message || 'Local GPU processing failed' };
  }
}

/**
 * 清除能力缓存（配置变更后调用）
 */
export function clearCapabilityCache() {
  serverCapabilities = null;
  lastCapabilityCheck = 0;
}

export default {
  getServerCapabilities,
  isComputeAvailable,
  isHybridMode,
  getLocalGpuProcessor,
  smartFilmlabPreview,
  smartRenderPositive,
  clearCapabilityCache
};
