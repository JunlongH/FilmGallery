/**
 * Edge Detection Module - Unified Entry Point
 * 
 * 自动边缘检测模块，用于识别底片边框并自动裁剪
 * 
 * @module packages/shared/edgeDetection
 */

const cannyEdge = require('./cannyEdge');
const houghTransform = require('./houghTransform');
const rectangleFinder = require('./rectangleFinder');
const { gaussianBlur, toGrayscale, toGrayscaleEnhanced, normalizeRect } = require('./utils');

/**
 * 边缘检测配置选项
 * @typedef {Object} EdgeDetectionOptions
 * @property {number} [sensitivity=50] - 检测灵敏度 (0-100)
 * @property {string} [filmFormat='auto'] - 底片格式 ('auto' | '35mm' | '120' | '4x5')
 * @property {boolean} [expectDarkBorder=true] - 是否期望暗色边框
 * @property {number} [maxWidth=1200] - 预处理最大宽度
 * @property {boolean} [returnDebugInfo=false] - 是否返回调试信息
 */

/**
 * 边缘检测结果
 * @typedef {Object} EdgeDetectionResult
 * @property {Object} cropRect - 归一化裁剪区域 {x, y, w, h} (0-1)
 * @property {number} rotation - 检测到的倾斜角度 (度)
 * @property {number} confidence - 置信度 (0-1)
 * @property {Object} [debugInfo] - 调试信息
 */

/**
 * 默认配置
 */
const DEFAULT_OPTIONS = {
  sensitivity: 50,
  filmFormat: 'auto',
  expectDarkBorder: true,
  maxWidth: 1200,
  returnDebugInfo: false
};

/**
 * 根据灵敏度计算 Canny 阈值
 * @param {number} sensitivity - 灵敏度 (0-100)
 * @returns {{low: number, high: number}}
 */
function getThresholdsFromSensitivity(sensitivity) {
  // sensitivity 0 = 高阈值 (少边缘), sensitivity 100 = 低阈值 (多边缘)
  // 典型 Canny 阈值: low=30-100, high=100-200
  const normalizedSens = sensitivity / 100;
  
  // 反向映射: 高灵敏度 = 低阈值
  const low = Math.round(100 - normalizedSens * 70);   // 100 -> 30
  const high = Math.round(200 - normalizedSens * 100); // 200 -> 100
  
  return { low, high };
}

/**
 * 根据底片格式获取期望的宽高比范围
 * @param {string} filmFormat - 底片格式
 * @returns {{minAspect: number, maxAspect: number}}
 */
function getExpectedAspectRatio(filmFormat) {
  const formats = {
    '35mm': { minAspect: 1.4, maxAspect: 1.6 },      // 3:2 = 1.5
    '120_645': { minAspect: 1.2, maxAspect: 1.4 },   // 6x4.5 ≈ 1.33
    '120_66': { minAspect: 0.9, maxAspect: 1.1 },    // 6x6 = 1.0
    '120_67': { minAspect: 1.1, maxAspect: 1.3 },    // 6x7 ≈ 1.17
    '4x5': { minAspect: 1.2, maxAspect: 1.35 },      // 4:5 = 1.25
    'auto': { minAspect: 0.5, maxAspect: 2.5 }       // 宽松范围
  };
  return formats[filmFormat] || formats['auto'];
}

/**
 * 主入口：检测图像边缘并返回裁剪区域
 * 
 * @param {Object} imageData - 图像数据 { data: Uint8Array, width: number, height: number, channels: number }
 * @param {EdgeDetectionOptions} [options] - 检测选项
 * @returns {EdgeDetectionResult} 检测结果
 */
function detectEdges(imageData, options = {}) {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const startTime = Date.now();
  
  const { data, width, height, channels } = imageData;
  
  // 1. 转换为灰度图 - 使用增强版本以更好地检测彩色边框
  // 彩色负片的边框通常是亮青色/蓝色，标准灰度转换可能降低对比度
  const grayscale = toGrayscaleEnhanced(data, width, height, channels);
  
  // 2. 高斯模糊降噪
  const blurred = gaussianBlur(grayscale, width, height, 1.4);
  
  // 3. Canny 边缘检测
  const thresholds = getThresholdsFromSensitivity(opts.sensitivity);
  const edges = cannyEdge.detect(blurred, width, height, thresholds.low, thresholds.high);
  
  // 4. Hough 变换检测直线
  // 降低阈值以检测更多直线（尤其是彩色边框可能产生较弱的边缘）
  // 原来是 0.15，改为 0.10，并根据灵敏度进一步调整
  const sensitivityFactor = 1 - (opts.sensitivity / 100) * 0.5; // 0.5 ~ 1.0
  const houghThreshold = Math.round(Math.min(width, height) * 0.10 * sensitivityFactor);
  const lines = houghTransform.detect(edges, width, height, houghThreshold);
  
  console.log(`🔍 Edge detection: Found ${lines.length} lines (threshold: ${houghThreshold}, sensitivity: ${opts.sensitivity})`);
  
  // 5. 从直线中找到最佳矩形
  const aspectRatioRange = getExpectedAspectRatio(opts.filmFormat);
  const rectangleResult = rectangleFinder.findBestRectangle(
    lines, 
    width, 
    height, 
    aspectRatioRange
  );
  
  console.log('📐 Rectangle result:', rectangleResult ? 
    `Found rectangle with confidence ${rectangleResult.confidence.toFixed(2)}` : 
    'No rectangle found');
  
  // 6. 归一化结果
  let cropRect, rotation, confidence;
  
  if (rectangleResult) {
    // 找到了明确的矩形边框
    cropRect = normalizeRect(rectangleResult.rect, width, height);
    rotation = rectangleResult.rotation;
    confidence = rectangleResult.confidence;
  } else {
    // 没有找到矩形，可能是无边框图片
    // 提供一个保守的默认裁剪，但置信度设为 0.25（介于有效和无效之间）
    cropRect = { x: 0, y: 0, w: 1, h: 1 }; // 不裁剪
    rotation = 0;
    confidence = 0.1; // 很低的置信度，表示"没有检测到边框"
    
    console.log('⚠️ No rectangle detected - image may have no borders. Suggesting no crop.');
  }
  
  console.log('📊 Final normalized cropRect:', cropRect);
  
  const result = {
    cropRect,
    rotation,
    confidence
  };
  
  // 调试信息
  if (opts.returnDebugInfo) {
    result.debugInfo = {
      processingTimeMs: Date.now() - startTime,
      edgePixelCount: edges.filter(v => v > 0).length,
      linesDetected: lines.length,
      thresholds,
      imageSize: { width, height }
    };
  }
  
  return result;
}

/**
 * 批量检测 - 对多张图像使用相同参数
 * 
 * @param {Array<Object>} imageDataArray - 图像数据数组
 * @param {EdgeDetectionOptions} [options] - 检测选项
 * @returns {Array<EdgeDetectionResult>} 检测结果数组
 */
function detectEdgesBatch(imageDataArray, options = {}) {
  return imageDataArray.map(imageData => detectEdges(imageData, options));
}

/**
 * 验证检测结果是否合理
 * 
 * @param {EdgeDetectionResult} result - 检测结果
 * @param {number} minConfidence - 最低置信度阈值
 * @returns {boolean} 是否有效
 */
function isResultValid(result, minConfidence = 0.5) {
  if (!result || !result.cropRect) {
    console.log('❌ Result validation failed: no result or cropRect');
    return false;
  }
  
  const { cropRect, confidence, rotation } = result;
  
  // 置信度检查
  if (confidence < minConfidence) {
    console.log(`❌ Result validation failed: confidence ${confidence.toFixed(2)} < ${minConfidence}`);
    return false;
  }
  
  // 裁剪区域合理性检查
  if (cropRect.w < 0.1 || cropRect.h < 0.1) {
    console.log(`❌ Result validation failed: crop too small (w=${cropRect.w}, h=${cropRect.h})`);
    return false;
  }
  
  // 允许全图裁剪（无边框情况）- 但要求置信度非常低或非常高
  if (cropRect.w > 0.98 && cropRect.h > 0.98 && cropRect.x < 0.02 && cropRect.y < 0.02) {
    // 这是"无边框"的情况
    if (confidence < 0.2) {
      console.log(`⚠️ Result is full-image (no borders detected), confidence=${confidence.toFixed(2)}`);
      // 对于无边框情况，降低验证标准
      return true; // 允许通过，让用户知道没有检测到边框
    }
  }
  
  // 正常情况：不应该是完整图像
  if (cropRect.w > 0.99 || cropRect.h > 0.99) {
    console.log(`⚠️ Result validation warning: crop almost full image (w=${cropRect.w}, h=${cropRect.h})`);
    // 如果几乎是全图，但置信度很低，说明没有检测到边框
    if (confidence < 0.3) {
      return true; // 允许通过，但会提示用户
    }
  }
  
  if (cropRect.x < 0 || cropRect.y < 0) {
    console.log(`❌ Result validation failed: negative position (x=${cropRect.x}, y=${cropRect.y})`);
    return false;
  }
  if (cropRect.x + cropRect.w > 1.01 || cropRect.y + cropRect.h > 1.01) { // 允许小误差
    console.log(`❌ Result validation failed: crop out of bounds`);
    return false;
  }
  
  // 旋转角度合理性检查 (通常底片倾斜不超过 ±15°)
  if (Math.abs(rotation) > 15) {
    console.log(`❌ Result validation failed: rotation ${rotation.toFixed(1)}° too large`);
    return false;
  }
  
  console.log(`✅ Result validation passed: confidence=${confidence.toFixed(2)}, rotation=${rotation.toFixed(1)}°`);
  return true;
}

module.exports = {
  detectEdges,
  detectEdgesBatch,
  isResultValid,
  getThresholdsFromSensitivity,
  getExpectedAspectRatio,
  DEFAULT_OPTIONS
};
