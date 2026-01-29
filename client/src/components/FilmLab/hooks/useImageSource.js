/**
 * useImageSource Hook
 * 
 * 封装图像加载逻辑，处理 RAW/TIFF 服务器解码和普通图像加载
 * 
 * @module hooks/useImageSource
 * @since 2026-01-29
 */

import { useState, useCallback, useEffect, useRef } from 'react';
import { requiresServerDecode } from '@filmgallery/shared';

// ============================================================================
// Constants
// ============================================================================

const PREVIEW_MAX_WIDTH = 2000;

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * 从文件路径获取文件扩展名
 */
function getExtension(path) {
  if (!path) return '';
  const parts = path.split('.');
  return parts.length > 1 ? parts.pop().toLowerCase() : '';
}

/**
 * 判断是否需要服务器解码
 */
function needsServerDecode(filePath) {
  if (!filePath) return false;
  const ext = getExtension(filePath);
  return requiresServerDecode(ext);
}

// ============================================================================
// Hook Implementation
// ============================================================================

/**
 * 图像源加载 Hook
 * 
 * @param {Object} options - 配置选项
 * @param {string} options.filePath - 文件路径
 * @param {string} options.apiBase - API 基础 URL
 * @param {Function} options.onLoad - 加载完成回调
 * @param {Function} options.onError - 加载错误回调
 * @returns {Object} 图像数据和加载状态
 */
export function useImageSource(options = {}) {
  const {
    filePath,
    apiBase = '',
    onLoad,
    onError,
  } = options;

  const [image, setImage] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [sourceType, setSourceType] = useState('unknown'); // 'browser' | 'server' | 'unknown'
  const [metadata, setMetadata] = useState(null);
  
  const abortControllerRef = useRef(null);
  const lastFilePathRef = useRef(null);

  /**
   * 从浏览器直接加载图像（JPEG/PNG/WebP 等）
   */
  const loadFromBrowser = useCallback(async (path) => {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      
      img.onload = () => {
        resolve(img);
      };
      
      img.onerror = (e) => {
        reject(new Error(`Failed to load image: ${path}`));
      };
      
      // 构建 URL
      if (path.startsWith('http://') || path.startsWith('https://')) {
        img.src = path;
      } else {
        // 本地文件通过 API 加载
        img.src = `${apiBase}/api/image?path=${encodeURIComponent(path)}`;
      }
    });
  }, [apiBase]);

  /**
   * 从服务器加载解码后的预览（RAW/TIFF）
   */
  const loadFromServer = useCallback(async (path, signal) => {
    const url = `${apiBase}/api/filmlab/smart-preview`;
    const params = new URLSearchParams({
      path,
      maxWidth: PREVIEW_MAX_WIDTH.toString(),
    });

    const response = await fetch(`${url}?${params}`, { signal });
    
    if (!response.ok) {
      throw new Error(`Server preview failed: ${response.status}`);
    }

    const data = await response.json();
    
    if (!data.success || !data.imageData) {
      throw new Error(data.error || 'Invalid server response');
    }

    // 创建 Image 对象
    return new Promise((resolve, reject) => {
      const img = new Image();
      
      img.onload = () => {
        // 附加元数据
        img._metadata = data.metadata || null;
        img._width = data.width;
        img._height = data.height;
        resolve(img);
      };
      
      img.onerror = () => {
        reject(new Error('Failed to decode server preview'));
      };
      
      img.src = data.imageData;
    });
  }, [apiBase]);

  /**
   * 加载图像
   */
  const loadImage = useCallback(async (path) => {
    if (!path) {
      setImage(null);
      setLoading(false);
      setError(null);
      return;
    }

    // 避免重复加载
    if (path === lastFilePathRef.current && image) {
      return;
    }

    // 取消之前的请求
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    abortControllerRef.current = new AbortController();

    setLoading(true);
    setError(null);
    lastFilePathRef.current = path;

    try {
      let loadedImage;
      
      if (needsServerDecode(path)) {
        // RAW/TIFF 需要服务器解码
        setSourceType('server');
        loadedImage = await loadFromServer(path, abortControllerRef.current.signal);
        setMetadata(loadedImage._metadata || null);
      } else {
        // 浏览器可直接加载
        setSourceType('browser');
        loadedImage = await loadFromBrowser(path);
        setMetadata(null);
      }

      setImage(loadedImage);
      setLoading(false);
      
      if (onLoad) {
        onLoad(loadedImage);
      }
    } catch (e) {
      if (e.name === 'AbortError') {
        // 请求被取消，不处理
        return;
      }
      
      console.error('[useImageSource] Load error:', e);
      setError(e.message || 'Failed to load image');
      setLoading(false);
      
      if (onError) {
        onError(e);
      }
    }
  }, [image, loadFromBrowser, loadFromServer, onLoad, onError]);

  /**
   * 强制重新加载
   */
  const reload = useCallback(() => {
    lastFilePathRef.current = null;
    loadImage(filePath);
  }, [filePath, loadImage]);

  /**
   * 清除当前图像
   */
  const clear = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    setImage(null);
    setLoading(false);
    setError(null);
    setSourceType('unknown');
    setMetadata(null);
    lastFilePathRef.current = null;
  }, []);

  // 当 filePath 变化时自动加载
  useEffect(() => {
    loadImage(filePath);
  }, [filePath, loadImage]);

  // 清理
  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, []);

  return {
    image,
    loading,
    error,
    sourceType,
    metadata,
    reload,
    clear,
    needsServerDecode: needsServerDecode(filePath),
  };
}

export default useImageSource;
