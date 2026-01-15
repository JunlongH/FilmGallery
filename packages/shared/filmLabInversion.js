/**
 * FilmLab 胶片反转模块
 * 
 * @module filmLabInversion
 * @description 实现线性反转和对数反转
 * 
 * 注意：胶片曲线处理已分离到 filmLabCurve.js 模块
 * 反转（负→正）与曲线（色调风格）现在是独立的处理步骤
 */

const { DEFAULT_INVERSION_PARAMS } = require('./filmLabConstants');

// ============================================================================
// 辅助函数
// ============================================================================

/**
 * 数值钳制
 */
function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

// ============================================================================
// 反转算法实现
// ============================================================================

/**
 * 线性反转
 * 
 * 简单的数值反转: out = 255 - in
 * 
 * @param {number} value - 输入值 (0-255)
 * @returns {number} 反转后的值
 */
function invertLinear(value) {
  return 255 - value;
}

/**
 * 对数反转 (传统艺术化算法)
 * 
 * 公式: out = 255 * (1 - log(in + 1) / log(256))
 * 
 * 此算法提供了一种对数压缩的反转效果，保留更多阴影细节
 * 
 * @param {number} value - 输入值 (0-255)
 * @returns {number} 反转后的值
 */
function invertLog(value) {
  // +1 避免 log(0)
  return clamp(Math.round(255 * (1 - Math.log(value + 1) / Math.log(256))), 0, 255);
}

// ============================================================================
// 统一反转接口
// ============================================================================

/**
 * 反转单个像素值
 * 
 * @param {number} value - 输入值 (0-255)
 * @param {Object} params - 反转参数
 * @param {boolean} [params.inverted=false] - 是否启用反转
 * @param {string} [params.inversionMode='linear'] - 反转模式: 'linear' | 'log'
 * @returns {number} 处理后的值
 */
function applyInversion(value, params = {}) {
  const {
    inverted = DEFAULT_INVERSION_PARAMS.inverted,
    inversionMode = DEFAULT_INVERSION_PARAMS.inversionMode,
  } = params;
  
  if (!inverted) {
    return value;
  }
  
  switch (inversionMode) {
    case 'linear':
      return invertLinear(value);
    
    case 'log':
      return invertLog(value);
    
    default:
      return invertLinear(value);
  }
}

/**
 * 反转 RGB 三通道
 * 
 * @param {number} r - 红色值 (0-255)
 * @param {number} g - 绿色值 (0-255)
 * @param {number} b - 蓝色值 (0-255)
 * @param {Object} params - 反转参数
 * @returns {[number, number, number]} 反转后的 RGB 值
 */
function applyInversionRGB(r, g, b, params = {}) {
  return [
    applyInversion(r, params),
    applyInversion(g, params),
    applyInversion(b, params),
  ];
}

/**
 * 构建反转 LUT
 * 
 * 预计算 256 级反转查找表，用于批量处理
 * 
 * @param {Object} params - 反转参数
 * @returns {Uint8Array} 256 级反转查找表
 */
function buildInversionLUT(params = {}) {
  const lut = new Uint8Array(256);
  
  for (let i = 0; i < 256; i++) {
    lut[i] = applyInversion(i, params);
  }
  
  return lut;
}

// ============================================================================
// 模块导出 (CommonJS)
// ============================================================================

module.exports = {
  invertLinear,
  invertLog,
  applyInversion,
  applyInversionRGB,
  buildInversionLUT,
};
