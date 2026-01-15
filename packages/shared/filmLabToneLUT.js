/**
 * FilmLab 色调映射 LUT 构建器
 * 
 * @module filmLabToneLUT
 * @description 构建色调映射查找表，包含曝光、对比度、阴影/高光、黑白场调整
 */

const { DEFAULT_TONE_PARAMS } = require('./filmLabConstants');

/**
 * 构建 256 级色调映射 LUT
 * 
 * 处理顺序：
 * 1. 曝光 (Exposure) - pow(2, exposure/50) 乘数
 * 2. 对比度 (Contrast) - 围绕中灰点的 S 曲线
 * 3. 黑白场 (Blacks/Whites) - 窗口重映射
 * 4. 阴影 (Shadows) - 提亮暗部
 * 5. 高光 (Highlights) - 压低亮部
 * 
 * @param {Object} params - 色调参数
 * @param {number} [params.exposure=0] - 曝光 (-100 to 100)
 * @param {number} [params.contrast=0] - 对比度 (-100 to 100)
 * @param {number} [params.highlights=0] - 高光 (-100 to 100)
 * @param {number} [params.shadows=0] - 阴影 (-100 to 100)
 * @param {number} [params.whites=0] - 白场 (-100 to 100)
 * @param {number} [params.blacks=0] - 黑场 (-100 to 100)
 * @returns {Uint8Array} 256 级查找表
 */
function buildToneLUT(params = {}) {
  const {
    exposure = DEFAULT_TONE_PARAMS.exposure,
    contrast = DEFAULT_TONE_PARAMS.contrast,
    highlights = DEFAULT_TONE_PARAMS.highlights,
    shadows = DEFAULT_TONE_PARAMS.shadows,
    whites = DEFAULT_TONE_PARAMS.whites,
    blacks = DEFAULT_TONE_PARAMS.blacks,
  } = params;

  const lut = new Uint8Array(256);
  
  // 预计算因子
  const expFactor = Math.pow(2, (Number(exposure) || 0) / 50);
  const ctr = Number(contrast) || 0;
  const contrastFactor = (259 * (ctr + 255)) / (255 * (259 - ctr));
  const blackPoint = -(Number(blacks) || 0) * 0.002;
  const whitePoint = 1 - (Number(whites) || 0) * 0.002;
  const sFactor = (Number(shadows) || 0) * 0.005;
  const hFactor = (Number(highlights) || 0) * 0.005;

  for (let i = 0; i < 256; i++) {
    let val = i / 255;

    // 1. 曝光 (摄影档位公式)
    val *= expFactor;

    // 2. 对比度 (围绕 0.5 中灰点)
    val = (val - 0.5) * contrastFactor + 0.5;

    // 3. 黑白场窗口重映射
    if (whitePoint !== blackPoint) {
      val = (val - blackPoint) / (whitePoint - blackPoint);
    }

    // 4. 阴影 (Bernstein 基函数，峰值在 ~0.33)
    if (sFactor !== 0) {
      val += sFactor * Math.pow(1 - val, 2) * val * 4;
    }

    // 5. 高光 (Bernstein 基函数，峰值在 ~0.67)
    if (hFactor !== 0) {
      val += hFactor * Math.pow(val, 2) * (1 - val) * 4;
    }

    lut[i] = Math.min(255, Math.max(0, Math.round(val * 255)));
  }

  return lut;
}

/**
 * 获取单个值经过色调映射后的结果 (用于调试或实时预览)
 * 
 * @param {number} value - 输入值 (0-255)
 * @param {Object} params - 色调参数
 * @returns {number} 映射后的值 (0-255)
 */
function applyToneMapping(value, params = {}) {
  const lut = buildToneLUT(params);
  return lut[Math.min(255, Math.max(0, Math.round(value)))];
}

// ============================================================================
// 模块导出 (CommonJS)
// ============================================================================

module.exports = { buildToneLUT, applyToneMapping };
