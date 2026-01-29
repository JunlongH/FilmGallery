/**
 * useHistogram Hook
 * 
 * 封装直方图计算逻辑
 * 支持 CPU 和 GPU 路径，自动处理裁剪区域
 * 
 * @module hooks/useHistogram
 * @since 2026-01-29
 */

import { useState, useCallback, useRef, useEffect } from 'react';

// ============================================================================
// Constants
// ============================================================================

const HISTOGRAM_BINS = 256;
const DEFAULT_STRIDE = 4; // Sample every 4th pixel for performance

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * 创建空直方图数据
 */
function createEmptyHistogram() {
  return {
    rgb: new Array(HISTOGRAM_BINS).fill(0),
    red: new Array(HISTOGRAM_BINS).fill(0),
    green: new Array(HISTOGRAM_BINS).fill(0),
    blue: new Array(HISTOGRAM_BINS).fill(0),
  };
}

/**
 * 从 Canvas 计算直方图
 * 
 * @param {HTMLCanvasElement} canvas - 渲染后的画布
 * @param {Object} options - 选项
 * @param {Object} options.cropRect - 裁剪区域 (normalized 0-1)
 * @param {boolean} options.isCropping - 是否正在裁剪
 * @param {number} options.stride - 采样步长
 * @returns {Object} 直方图数据
 */
function calculateHistogramFromCanvas(canvas, options = {}) {
  const { cropRect, isCropping, stride = DEFAULT_STRIDE } = options;
  
  if (!canvas || !canvas.width || !canvas.height) {
    return createEmptyHistogram();
  }

  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) {
    return createEmptyHistogram();
  }

  const width = canvas.width;
  const height = canvas.height;
  
  let imageData;
  try {
    imageData = ctx.getImageData(0, 0, width, height);
  } catch (e) {
    console.error('[useHistogram] Failed to get image data:', e);
    return createEmptyHistogram();
  }
  
  const data = imageData.data;

  // Initialize histogram arrays
  const histR = new Array(HISTOGRAM_BINS).fill(0);
  const histG = new Array(HISTOGRAM_BINS).fill(0);
  const histB = new Array(HISTOGRAM_BINS).fill(0);
  const histRGB = new Array(HISTOGRAM_BINS).fill(0);

  // ============================================================================
  // PHASE 1 FIX: Crop-aware histogram calculation
  // ============================================================================
  
  let scanStartX = 0;
  let scanStartY = 0;
  let scanEndX = width;
  let scanEndY = height;
  
  // When cropping, restrict histogram to crop area
  if (isCropping && cropRect && cropRect.w > 0 && cropRect.h > 0) {
    scanStartX = Math.max(0, Math.floor(cropRect.x * width));
    scanStartY = Math.max(0, Math.floor(cropRect.y * height));
    scanEndX = Math.min(width, Math.floor((cropRect.x + cropRect.w) * width));
    scanEndY = Math.min(height, Math.floor((cropRect.y + cropRect.h) * height));
  }

  // Scan the crop area (or full image)
  for (let y = scanStartY; y < scanEndY; y += stride) {
    for (let x = scanStartX; x < scanEndX; x += stride) {
      const idx = (y * width + x) * 4;
      const r = data[idx];
      const g = data[idx + 1];
      const b = data[idx + 2];
      
      histR[r]++;
      histG[g]++;
      histB[b]++;
      
      // Luminance for RGB histogram
      const lum = Math.round(0.299 * r + 0.587 * g + 0.114 * b);
      histRGB[lum]++;
    }
  }

  return {
    rgb: histRGB,
    red: histR,
    green: histG,
    blue: histB,
  };
}

/**
 * 从 WebGL Canvas 读取像素数据计算直方图
 * 
 * @param {WebGLRenderingContext} gl - WebGL context
 * @param {number} width - Canvas width
 * @param {number} height - Canvas height
 * @param {Object} options - 选项
 * @returns {Object} 直方图数据
 */
function calculateHistogramFromWebGL(gl, width, height, options = {}) {
  const { cropRect, isCropping, stride = DEFAULT_STRIDE } = options;
  
  if (!gl || width <= 0 || height <= 0) {
    return createEmptyHistogram();
  }

  // Read pixels from WebGL
  const pixels = new Uint8Array(width * height * 4);
  gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);

  // Initialize histogram arrays
  const histR = new Array(HISTOGRAM_BINS).fill(0);
  const histG = new Array(HISTOGRAM_BINS).fill(0);
  const histB = new Array(HISTOGRAM_BINS).fill(0);
  const histRGB = new Array(HISTOGRAM_BINS).fill(0);

  // Calculate scan bounds
  let scanStartX = 0;
  let scanStartY = 0;
  let scanEndX = width;
  let scanEndY = height;
  
  if (isCropping && cropRect && cropRect.w > 0 && cropRect.h > 0) {
    scanStartX = Math.max(0, Math.floor(cropRect.x * width));
    scanStartY = Math.max(0, Math.floor(cropRect.y * height));
    scanEndX = Math.min(width, Math.floor((cropRect.x + cropRect.w) * width));
    scanEndY = Math.min(height, Math.floor((cropRect.y + cropRect.h) * height));
  }

  // Note: WebGL pixels are bottom-up, need to flip Y
  for (let y = scanStartY; y < scanEndY; y += stride) {
    const flippedY = height - 1 - y;
    for (let x = scanStartX; x < scanEndX; x += stride) {
      const idx = (flippedY * width + x) * 4;
      const r = pixels[idx];
      const g = pixels[idx + 1];
      const b = pixels[idx + 2];
      
      histR[r]++;
      histG[g]++;
      histB[b]++;
      
      const lum = Math.round(0.299 * r + 0.587 * g + 0.114 * b);
      histRGB[lum]++;
    }
  }

  return {
    rgb: histRGB,
    red: histR,
    green: histG,
    blue: histB,
  };
}

// ============================================================================
// Hook Implementation
// ============================================================================

/**
 * 直方图计算 Hook
 * 
 * @param {Object} options - 配置选项
 * @param {HTMLCanvasElement} options.canvas - 渲染画布
 * @param {Object} options.cropRect - 当前裁剪区域
 * @param {boolean} options.isCropping - 是否正在裁剪
 * @param {boolean} options.enabled - 是否启用直方图计算
 * @param {number} options.debounceMs - 防抖延迟（毫秒）
 * @returns {Object} 直方图数据和控制函数
 */
export function useHistogram(options = {}) {
  const {
    canvas,
    cropRect,
    isCropping = false,
    enabled = true,
    debounceMs = 50,
  } = options;

  const [histograms, setHistograms] = useState(createEmptyHistogram());
  const [isCalculating, setIsCalculating] = useState(false);
  
  const debounceTimerRef = useRef(null);
  const lastCropRectRef = useRef(null);

  /**
   * 立即计算直方图
   */
  const calculateNow = useCallback(() => {
    if (!enabled || !canvas) {
      return;
    }

    setIsCalculating(true);
    
    try {
      const result = calculateHistogramFromCanvas(canvas, {
        cropRect,
        isCropping,
        stride: DEFAULT_STRIDE,
      });
      
      setHistograms(result);
    } catch (e) {
      console.error('[useHistogram] Calculation error:', e);
    } finally {
      setIsCalculating(false);
    }
  }, [canvas, cropRect, isCropping, enabled]);

  /**
   * 防抖计算直方图
   */
  const calculateDebounced = useCallback(() => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }
    
    debounceTimerRef.current = setTimeout(() => {
      calculateNow();
    }, debounceMs);
  }, [calculateNow, debounceMs]);

  /**
   * 强制刷新直方图
   */
  const refresh = useCallback(() => {
    calculateNow();
  }, [calculateNow]);

  /**
   * 重置直方图
   */
  const reset = useCallback(() => {
    setHistograms(createEmptyHistogram());
  }, []);

  // 当裁剪区域变化时自动更新直方图
  useEffect(() => {
    if (!isCropping) {
      return;
    }
    
    // 检查裁剪区域是否真的变化了
    const lastRect = lastCropRectRef.current;
    if (lastRect && 
        lastRect.x === cropRect?.x && 
        lastRect.y === cropRect?.y &&
        lastRect.w === cropRect?.w && 
        lastRect.h === cropRect?.h) {
      return;
    }
    
    lastCropRectRef.current = cropRect ? { ...cropRect } : null;
    calculateDebounced();
  }, [cropRect, isCropping, calculateDebounced]);

  // 清理定时器
  useEffect(() => {
    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, []);

  return {
    histograms,
    isCalculating,
    refresh,
    reset,
    calculateNow,
    calculateDebounced,
  };
}

// Export helper functions for external use
export {
  createEmptyHistogram,
  calculateHistogramFromCanvas,
  calculateHistogramFromWebGL,
  HISTOGRAM_BINS,
};

export default useHistogram;
