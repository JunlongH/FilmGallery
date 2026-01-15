/**
 * FilmLab 分离色调模块
 * 
 * @module filmLabSplitTone
 * @description 实现高光/阴影分区着色
 * 
 * 功能特性：
 * - 高光着色 (hue/saturation)
 * - 阴影着色 (hue/saturation)
 * - 平衡滑块控制过渡
 * - 3 区分割: 阴影 / 中间调 / 高光
 */

// ============================================================================
// 常量定义
// ============================================================================

/** 默认分离色调参数 */
const DEFAULT_SPLIT_TONE_PARAMS = {
  highlights: {
    hue: 30,          // 高光色相 (0-360)
    saturation: 0,    // 高光饱和度 (0-100)
  },
  midtones: {
    hue: 0,           // 中间调色相 (0-360)
    saturation: 0,    // 中间调饱和度 (0-100)
  },
  shadows: {
    hue: 220,         // 阴影色相 (0-360)
    saturation: 0,    // 阴影饱和度 (0-100)
  },
  balance: 0,         // 平衡 (-100 到 100，正值偏向高光)
};

/** 亮度阈值配置 */
const LUMINANCE_CONFIG = {
  shadowEnd: 0.25,      // 阴影区结束
  highlightStart: 0.75, // 高光区开始
  // 过渡区: 0.25 - 0.75 (中间调)
};

// ============================================================================
// 核心算法
// ============================================================================

/**
 * 计算像素亮度 (Rec. 709)
 * 
 * @param {number} r - 红色 (0-255)
 * @param {number} g - 绿色 (0-255)
 * @param {number} b - 蓝色 (0-255)
 * @returns {number} 亮度 (0-1)
 */
function calculateLuminance(r, g, b) {
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
}

/**
 * HSL 转 RGB (内联版本)
 * 
 * @param {number} h - 色相 (0-360)
 * @param {number} s - 饱和度 (0-1)
 * @param {number} l - 亮度 (0-1)
 * @returns {[number, number, number]} [R, G, B] (0-255)
 */
function hslToRgb(h, s, l) {
  h = ((h % 360) + 360) % 360;
  h /= 360;
  
  if (s === 0) {
    const gray = Math.round(l * 255);
    return [gray, gray, gray];
  }
  
  const hue2rgb = (p, q, t) => {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1/6) return p + (q - p) * 6 * t;
    if (t < 1/2) return q;
    if (t < 2/3) return p + (q - p) * (2/3 - t) * 6;
    return p;
  };
  
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  
  return [
    Math.round(hue2rgb(p, q, h + 1/3) * 255),
    Math.round(hue2rgb(p, q, h) * 255),
    Math.round(hue2rgb(p, q, h - 1/3) * 255),
  ];
}

/**
 * 计算分区权重 (带平衡调整)
 * 
 * @param {number} luminance - 亮度 (0-1)
 * @param {number} balance - 平衡值 (-100 到 100)
 * @returns {{ shadow: number, midtone: number, highlight: number }} 权重
 */
function calculateZoneWeights(luminance, balance = 0) {
  // 根据 balance 调整过渡点
  const balanceOffset = balance / 200; // -0.5 到 0.5
  const midpoint = 0.5 + balanceOffset;
  
  let shadowWeight = 0;
  let midtoneWeight = 0;
  let highlightWeight = 0;
  
  // 阴影区权重
  if (luminance < LUMINANCE_CONFIG.shadowEnd) {
    shadowWeight = 1;
  } else if (luminance < midpoint) {
    // 阴影到中间调过渡
    const t = (luminance - LUMINANCE_CONFIG.shadowEnd) / (midpoint - LUMINANCE_CONFIG.shadowEnd);
    shadowWeight = 1 - smoothstep(t);
    midtoneWeight = smoothstep(t);
  }
  
  // 中间调区权重 (在中点附近最强)
  if (luminance >= LUMINANCE_CONFIG.shadowEnd && luminance <= LUMINANCE_CONFIG.highlightStart) {
    if (luminance >= midpoint - 0.1 && luminance <= midpoint + 0.1) {
      // 中心区域完全是中间调
      midtoneWeight = 1;
    } else if (luminance < midpoint) {
      // 从阴影过渡到中间调
      const t = (luminance - LUMINANCE_CONFIG.shadowEnd) / (midpoint - LUMINANCE_CONFIG.shadowEnd);
      midtoneWeight = Math.max(midtoneWeight, smoothstep(t));
    } else {
      // 从中间调过渡到高光
      const t = (luminance - midpoint) / (LUMINANCE_CONFIG.highlightStart - midpoint);
      midtoneWeight = Math.max(midtoneWeight, 1 - smoothstep(t));
    }
  }
  
  // 高光区权重
  if (luminance > LUMINANCE_CONFIG.highlightStart) {
    highlightWeight = 1;
  } else if (luminance > midpoint) {
    // 中间调到高光过渡
    const t = (luminance - midpoint) / (LUMINANCE_CONFIG.highlightStart - midpoint);
    highlightWeight = smoothstep(t);
    midtoneWeight = Math.max(midtoneWeight, 1 - smoothstep(t));
  }
  
  return { shadow: shadowWeight, midtone: midtoneWeight, highlight: highlightWeight };
}

/**
 * 平滑插值函数 (Hermite)
 * 
 * @param {number} t - 输入 (0-1)
 * @returns {number} 平滑输出 (0-1)
 */
function smoothstep(t) {
  t = Math.max(0, Math.min(1, t));
  return t * t * (3 - 2 * t);
}

/**
 * 检查分离色调参数是否为默认值
 * 
 * @param {Object} params - 分离色调参数
 * @returns {boolean} 是否为默认
 */
function isDefaultSplitTone(params) {
  if (!params) return true;
  
  const { highlights, midtones, shadows } = params;
  
  // 只检查饱和度，因为色相在饱和度为0时无意义
  if (highlights?.saturation && highlights.saturation !== 0) return false;
  if (midtones?.saturation && midtones.saturation !== 0) return false;
  if (shadows?.saturation && shadows.saturation !== 0) return false;
  
  return true;
}

/**
 * 应用分离色调到单个像素
 * 
 * @param {number} r - 红色 (0-255)
 * @param {number} g - 绿色 (0-255)
 * @param {number} b - 蓝色 (0-255)
 * @param {Object} params - 分离色调参数
 * @returns {[number, number, number]} 调整后的 [R, G, B] (0-255)
 */
function applySplitTone(r, g, b, params = {}) {
  // 快速检查：如果参数为默认值，直接返回
  if (isDefaultSplitTone(params)) {
    return [r, g, b];
  }
  
  const { highlights = {}, midtones = {}, shadows = {}, balance = 0 } = params;
  const highlightHue = highlights.hue ?? 30;
  const highlightSat = (highlights.saturation ?? 0) / 100;
  const midtoneHue = midtones.hue ?? 0;
  const midtoneSat = (midtones.saturation ?? 0) / 100;
  const shadowHue = shadows.hue ?? 220;
  const shadowSat = (shadows.saturation ?? 0) / 100;
  
  // 计算亮度
  const luminance = calculateLuminance(r, g, b);
  
  // 计算分区权重
  const weights = calculateZoneWeights(luminance, balance);
  
  // 生成着色颜色
  const highlightColor = hslToRgb(highlightHue, 1, 0.5);
  const midtoneColor = hslToRgb(midtoneHue, 1, 0.5);
  const shadowColor = hslToRgb(shadowHue, 1, 0.5);
  
  // 混合
  let outR = r;
  let outG = g;
  let outB = b;
  
  // 高光着色
  if (highlightSat > 0 && weights.highlight > 0) {
    const strength = highlightSat * weights.highlight;
    outR = outR + (highlightColor[0] - outR) * strength * 0.3;
    outG = outG + (highlightColor[1] - outG) * strength * 0.3;
    outB = outB + (highlightColor[2] - outB) * strength * 0.3;
  }
  
  // 中间调着色
  if (midtoneSat > 0 && weights.midtone > 0) {
    const strength = midtoneSat * weights.midtone;
    outR = outR + (midtoneColor[0] - outR) * strength * 0.3;
    outG = outG + (midtoneColor[1] - outG) * strength * 0.3;
    outB = outB + (midtoneColor[2] - outB) * strength * 0.3;
  }
  
  // 阴影着色
  if (shadowSat > 0 && weights.shadow > 0) {
    const strength = shadowSat * weights.shadow;
    outR = outR + (shadowColor[0] - outR) * strength * 0.3;
    outG = outG + (shadowColor[1] - outG) * strength * 0.3;
    outB = outB + (shadowColor[2] - outB) * strength * 0.3;
  }
  
  // 钳制输出
  return [
    Math.max(0, Math.min(255, Math.round(outR))),
    Math.max(0, Math.min(255, Math.round(outG))),
    Math.max(0, Math.min(255, Math.round(outB))),
  ];
}

/**
 * 批量应用分离色调到像素数组
 * 
 * @param {Uint8Array|Uint8ClampedArray} data - 像素数据 (RGB 或 RGBA)
 * @param {Object} params - 分离色调参数
 * @param {Object} [options] - 选项
 * @param {number} [options.channels=4] - 每像素通道数
 * @returns {Uint8Array} 处理后的数据
 */
function applySplitToneToArray(data, params, options = {}) {
  const channels = options.channels || 4;
  
  if (isDefaultSplitTone(params)) {
    return data;
  }
  
  const output = new Uint8Array(data.length);
  
  for (let i = 0; i < data.length; i += channels) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    
    const [rOut, gOut, bOut] = applySplitTone(r, g, b, params);
    
    output[i] = rOut;
    output[i + 1] = gOut;
    output[i + 2] = bOut;
    
    if (channels === 4) {
      output[i + 3] = data[i + 3]; // 保留 alpha
    }
  }
  
  return output;
}

// ============================================================================
// 工具函数
// ============================================================================

/**
 * 合并分离色调参数
 * 
 * @param {Object} base - 基础参数
 * @param {Object} overlay - 覆盖参数
 * @returns {Object} 合并后的参数
 */
function mergeSplitToneParams(base, overlay) {
  return {
    highlights: {
      hue: overlay?.highlights?.hue ?? base?.highlights?.hue ?? DEFAULT_SPLIT_TONE_PARAMS.highlights.hue,
      saturation: overlay?.highlights?.saturation ?? base?.highlights?.saturation ?? DEFAULT_SPLIT_TONE_PARAMS.highlights.saturation,
    },
    shadows: {
      hue: overlay?.shadows?.hue ?? base?.shadows?.hue ?? DEFAULT_SPLIT_TONE_PARAMS.shadows.hue,
      saturation: overlay?.shadows?.saturation ?? base?.shadows?.saturation ?? DEFAULT_SPLIT_TONE_PARAMS.shadows.saturation,
    },
    balance: overlay?.balance ?? base?.balance ?? DEFAULT_SPLIT_TONE_PARAMS.balance,
  };
}

/**
 * 验证分离色调参数
 * 
 * @param {Object} params - 分离色调参数
 * @returns {{ valid: boolean, errors: string[] }}
 */
function validateSplitToneParams(params) {
  const errors = [];
  
  if (!params || typeof params !== 'object') {
    return { valid: true, errors: [] };
  }
  
  // 验证高光
  if (params.highlights) {
    if (params.highlights.hue !== undefined) {
      if (typeof params.highlights.hue !== 'number' || params.highlights.hue < 0 || params.highlights.hue > 360) {
        errors.push('highlights.hue must be between 0 and 360');
      }
    }
    if (params.highlights.saturation !== undefined) {
      if (typeof params.highlights.saturation !== 'number' || params.highlights.saturation < 0 || params.highlights.saturation > 100) {
        errors.push('highlights.saturation must be between 0 and 100');
      }
    }
  }
  
  // 验证阴影
  if (params.shadows) {
    if (params.shadows.hue !== undefined) {
      if (typeof params.shadows.hue !== 'number' || params.shadows.hue < 0 || params.shadows.hue > 360) {
        errors.push('shadows.hue must be between 0 and 360');
      }
    }
    if (params.shadows.saturation !== undefined) {
      if (typeof params.shadows.saturation !== 'number' || params.shadows.saturation < 0 || params.shadows.saturation > 100) {
        errors.push('shadows.saturation must be between 0 and 100');
      }
    }
  }
  
  // 验证平衡
  if (params.balance !== undefined) {
    if (typeof params.balance !== 'number' || params.balance < -100 || params.balance > 100) {
      errors.push('balance must be between -100 and 100');
    }
  }
  
  return {
    valid: errors.length === 0,
    errors,
  };
}

// ============================================================================
// 预设
// ============================================================================

/** 分离色调预设 */
const SPLIT_TONE_PRESETS = {
  // 经典胶片风格
  warmCoolFilm: {
    name: '暖高光冷阴影',
    highlights: { hue: 40, saturation: 20 },
    shadows: { hue: 230, saturation: 25 },
    balance: 0,
  },
  
  // 青橙电影
  tealOrange: {
    name: '青橙电影',
    highlights: { hue: 30, saturation: 30 },
    shadows: { hue: 190, saturation: 35 },
    balance: -10,
  },
  
  // 复古褪色
  vintageFade: {
    name: '复古褪色',
    highlights: { hue: 50, saturation: 15 },
    shadows: { hue: 200, saturation: 20 },
    balance: 20,
  },
  
  // 冷调
  coolMood: {
    name: '冷调',
    highlights: { hue: 200, saturation: 10 },
    shadows: { hue: 240, saturation: 25 },
    balance: 0,
  },
  
  // 暖调
  warmMood: {
    name: '暖调',
    highlights: { hue: 35, saturation: 20 },
    shadows: { hue: 25, saturation: 15 },
    balance: 0,
  },
};

// ============================================================================
// 模块导出
// ============================================================================

module.exports = {
  // 常量
  DEFAULT_SPLIT_TONE_PARAMS,
  LUMINANCE_CONFIG,
  SPLIT_TONE_PRESETS,
  
  // 核心函数
  applySplitTone,
  applySplitToneToArray,
  isDefaultSplitTone,
  
  // 工具函数
  calculateLuminance,
  calculateZoneWeights,
  smoothstep,
  mergeSplitToneParams,
  validateSplitToneParams,
};
