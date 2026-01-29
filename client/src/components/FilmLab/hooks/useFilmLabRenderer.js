/**
 * useFilmLabRenderer Hook
 * 
 * 封装 FilmLabWebGL 渲染交互
 * 提供渲染控制、缓存管理和性能优化
 * 
 * @module hooks/useFilmLabRenderer
 * @since 2026-01-29
 */

import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import FilmLabWebGL, { isWebGLAvailable } from '../FilmLabWebGL';

// ============================================================================
// Constants
// ============================================================================

const PREVIEW_MAX_WIDTH = 2000;
const RENDER_DEBOUNCE_MS = 16; // ~60fps

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * 深度比较渲染参数是否变化
 */
function paramsEqual(a, b) {
  if (!a || !b) return false;
  
  // 快速检查基本参数
  const basicKeys = [
    'inverted', 'inversionMode', 'exposure', 'contrast',
    'highlights', 'shadows', 'whites', 'blacks',
    'rotate', 'filmCurveEnabled',
  ];
  
  for (const key of basicKeys) {
    if (a[key] !== b[key]) return false;
  }
  
  // 检查数组参数
  if (a.gains && b.gains) {
    for (let i = 0; i < 3; i++) {
      if (a.gains[i] !== b.gains[i]) return false;
    }
  }
  
  // 检查裁剪区域
  if (a.cropRect && b.cropRect) {
    if (a.cropRect.x !== b.cropRect.x || 
        a.cropRect.y !== b.cropRect.y ||
        a.cropRect.w !== b.cropRect.w || 
        a.cropRect.h !== b.cropRect.h) {
      return false;
    }
  }
  
  return true;
}

// ============================================================================
// Hook Implementation
// ============================================================================

/**
 * FilmLab 渲染器 Hook
 * 
 * @param {Object} options - 配置选项
 * @param {HTMLCanvasElement} options.canvas - 目标画布
 * @param {HTMLImageElement} options.image - 源图像
 * @param {boolean} options.useGPU - 是否使用 GPU 渲染
 * @returns {Object} 渲染控制接口
 */
export function useFilmLabRenderer(options = {}) {
  const {
    canvas,
    image,
    useGPU = true,
  } = options;

  const [isRendering, setIsRendering] = useState(false);
  const [lastRenderTime, setLastRenderTime] = useState(0);
  const [renderError, setRenderError] = useState(null);
  const [webglAvailable] = useState(() => isWebGLAvailable());
  
  const renderQueueRef = useRef(null);
  const lastParamsRef = useRef(null);
  const frameRequestRef = useRef(null);
  const processedCanvasRef = useRef(null);

  /**
   * 检查 WebGL 是否可用
   */
  const canUseWebGL = useMemo(() => {
    return webglAvailable && useGPU;
  }, [webglAvailable, useGPU]);

  /**
   * 执行渲染
   */
  const doRender = useCallback((params) => {
    if (!canvas || !image) {
      return null;
    }

    const startTime = performance.now();
    setIsRendering(true);
    setRenderError(null);

    try {
      if (canUseWebGL) {
        // WebGL 渲染路径
        FilmLabWebGL.processImageWebGL(canvas, image, params);
        processedCanvasRef.current = canvas;
      } else {
        // CPU 渲染路径（回退）
        // TODO: 实现 CPU 渲染或使用 RenderCore
        console.warn('[useFilmLabRenderer] CPU rendering not implemented, falling back to direct draw');
        const ctx = canvas.getContext('2d');
        if (ctx) {
          canvas.width = image.width;
          canvas.height = image.height;
          ctx.drawImage(image, 0, 0);
        }
      }

      const elapsed = performance.now() - startTime;
      setLastRenderTime(elapsed);
      lastParamsRef.current = { ...params };
      
      return canvas;
    } catch (e) {
      console.error('[useFilmLabRenderer] Render error:', e);
      setRenderError(e.message || 'Render failed');
      return null;
    } finally {
      setIsRendering(false);
    }
  }, [canvas, image, canUseWebGL]);

  /**
   * 请求渲染（带防抖）
   */
  const requestRender = useCallback((params, options = {}) => {
    const { immediate = false, force = false } = options;

    // 检查参数是否变化
    if (!force && paramsEqual(params, lastParamsRef.current)) {
      return processedCanvasRef.current;
    }

    // 立即渲染
    if (immediate) {
      return doRender(params);
    }

    // 防抖渲染
    if (frameRequestRef.current) {
      cancelAnimationFrame(frameRequestRef.current);
    }

    renderQueueRef.current = params;
    
    frameRequestRef.current = requestAnimationFrame(() => {
      if (renderQueueRef.current) {
        doRender(renderQueueRef.current);
        renderQueueRef.current = null;
      }
    });

    return null;
  }, [doRender]);

  /**
   * 强制立即渲染
   */
  const renderNow = useCallback((params) => {
    return requestRender(params, { immediate: true, force: true });
  }, [requestRender]);

  /**
   * 清除缓存
   */
  const clearCache = useCallback(() => {
    processedCanvasRef.current = null;
    lastParamsRef.current = null;
  }, []);

  /**
   * 获取当前渲染结果
   */
  const getRenderedCanvas = useCallback(() => {
    return processedCanvasRef.current;
  }, []);

  /**
   * 读取渲染结果的像素数据
   */
  const readPixels = useCallback((x, y, width = 1, height = 1) => {
    if (!processedCanvasRef.current) {
      return null;
    }

    try {
      const ctx = processedCanvasRef.current.getContext('2d', { willReadFrequently: true });
      if (!ctx) return null;
      
      return ctx.getImageData(x, y, width, height);
    } catch (e) {
      console.error('[useFilmLabRenderer] readPixels error:', e);
      return null;
    }
  }, []);

  // 清理
  useEffect(() => {
    return () => {
      if (frameRequestRef.current) {
        cancelAnimationFrame(frameRequestRef.current);
      }
    };
  }, []);

  // 当图像变化时清除缓存
  useEffect(() => {
    clearCache();
  }, [image, clearCache]);

  return {
    // 状态
    isRendering,
    lastRenderTime,
    renderError,
    canUseWebGL,
    webglAvailable,
    
    // 渲染控制
    requestRender,
    renderNow,
    clearCache,
    
    // 数据访问
    getRenderedCanvas,
    readPixels,
  };
}

export default useFilmLabRenderer;
