/**
 * FilmLab 导出参数模块
 * 
 * @module filmLabExport
 * @description 导出参数构建、验证和标准化
 * 
 * 功能特性：
 * - 从预设构建导出参数
 * - 参数验证和默认值填充
 * - 参数版本迁移
 */

const {
  DEFAULT_TONE_PARAMS,
  DEFAULT_WB_PARAMS,
  DEFAULT_INVERSION_PARAMS,
  DEFAULT_CURVES,
  DEFAULT_CROP_RECT,
  JPEG_QUALITY,
  EXPORT_MAX_WIDTH,
} = require('./filmLabConstants');
const { DEFAULT_HSL_PARAMS: HSL_CANONICAL_DEFAULTS } = require('./filmLabHSL');
const { DEFAULT_SPLIT_TONE_PARAMS: SPLIT_TONE_CANONICAL_DEFAULTS } = require('./filmLabSplitTone');

// ============================================================================
// 常量定义
// ============================================================================

/** 当前参数版本 */
const PARAMS_VERSION = 3;

/** 默认 HSL 参数 */
const DEFAULT_HSL_PARAMS = {
  red: { hue: 0, saturation: 0, luminance: 0 },
  orange: { hue: 0, saturation: 0, luminance: 0 },
  yellow: { hue: 0, saturation: 0, luminance: 0 },
  green: { hue: 0, saturation: 0, luminance: 0 },
  cyan: { hue: 0, saturation: 0, luminance: 0 },
  blue: { hue: 0, saturation: 0, luminance: 0 },
  purple: { hue: 0, saturation: 0, luminance: 0 },
  magenta: { hue: 0, saturation: 0, luminance: 0 },
};

/** 默认分离色调参数 — 与 filmLabSplitTone.DEFAULT_SPLIT_TONE_PARAMS 对齐 */
const DEFAULT_SPLIT_TONING = {
  highlights: { hue: 30, saturation: 0 },
  midtones: { hue: 0, saturation: 0 },
  shadows: { hue: 220, saturation: 0 },
  balance: 0,
};

/** 完整默认参数模板 */
const DEFAULT_PROCESSING_PARAMS = {
  version: PARAMS_VERSION,
  
  // 反转
  inverted: DEFAULT_INVERSION_PARAMS.inverted,
  inversionMode: DEFAULT_INVERSION_PARAMS.inversionMode,
  filmCurveEnabled: false,
  filmCurveProfile: 'default',
  
  // 白平衡
  red: DEFAULT_WB_PARAMS.red,
  green: DEFAULT_WB_PARAMS.green,
  blue: DEFAULT_WB_PARAMS.blue,
  temp: DEFAULT_WB_PARAMS.temp,
  tint: DEFAULT_WB_PARAMS.tint,
  
  // 色调
  exposure: DEFAULT_TONE_PARAMS.exposure,
  contrast: DEFAULT_TONE_PARAMS.contrast,
  highlights: DEFAULT_TONE_PARAMS.highlights,
  shadows: DEFAULT_TONE_PARAMS.shadows,
  whites: DEFAULT_TONE_PARAMS.whites,
  blacks: DEFAULT_TONE_PARAMS.blacks,
  
  // 曲线
  curves: { ...DEFAULT_CURVES },
  
  // HSL (统一使用 hslParams 字段名)
  hslParams: { ...DEFAULT_HSL_PARAMS },
  
  // 全局饱和度 (Luma-preserving)
  saturation: 0,
  
  // 分离色调
  splitToning: { ...DEFAULT_SPLIT_TONING },
  
  // 片基校正
  baseMode: 'linear',
  baseRed: 1.0,
  baseGreen: 1.0,
  baseBlue: 1.0,
  baseDensityR: 0.0,
  baseDensityG: 0.0,
  baseDensityB: 0.0,
  
  // 密度域色阶
  densityLevelsEnabled: false,
  
  // 裁剪/旋转
  cropRect: { ...DEFAULT_CROP_RECT },
  rotation: 0,
  
  // 3D LUT
  lut1: null,
  lut1Intensity: 1.0,
  lut2: null,
  lut2Intensity: 1.0,
};

// ============================================================================
// 参数构建
// ============================================================================

/**
 * 构建导出参数
 * 
 * 从预设和覆盖值构建完整的处理参数
 * 
 * @param {Object|null} preset - 预设对象 (可选)
 * @param {Object} overrides - 覆盖值
 * @returns {Object} 完整的处理参数
 */
function buildExportParams(preset, overrides = {}) {
  // 从默认值开始
  const params = { ...DEFAULT_PROCESSING_PARAMS };
  
  // 应用预设
  if (preset) {
    const presetParams = typeof preset === 'string' 
      ? JSON.parse(preset) 
      : preset;
    
    Object.assign(params, presetParams);
  }
  
  // 应用覆盖值
  Object.assign(params, overrides);
  
  // 确保版本号
  params.version = PARAMS_VERSION;
  
  // 迁移旧版本参数
  return migrateParams(params);
}

/**
 * 从照片记录提取处理参数
 * 
 * @param {Object} photo - 照片数据库记录
 * @returns {Object} 处理参数
 */
function getPhotoProcessingParams(photo) {
  if (!photo) {
    return { ...DEFAULT_PROCESSING_PARAMS };
  }
  
  let params;
  
  if (photo.processing_params) {
    params = typeof photo.processing_params === 'string'
      ? JSON.parse(photo.processing_params)
      : photo.processing_params;
  } else {
    params = {};
  }
  
  // 合并默认值
  return buildExportParams(null, params);
}

// ============================================================================
// 参数验证
// ============================================================================

/**
 * 验证导出参数
 * 
 * @param {Object} params - 处理参数
 * @returns {{ valid: boolean, errors: string[] }} 验证结果
 */
function validateExportParams(params) {
  const errors = [];
  
  // 数值范围验证
  const rangeChecks = [
    { key: 'exposure', min: -100, max: 100 },
    { key: 'contrast', min: -100, max: 100 },
    { key: 'highlights', min: -100, max: 100 },
    { key: 'shadows', min: -100, max: 100 },
    { key: 'whites', min: -100, max: 100 },
    { key: 'blacks', min: -100, max: 100 },
    { key: 'temp', min: -100, max: 100 },
    { key: 'tint', min: -100, max: 100 },
    { key: 'red', min: 0.05, max: 50 },
    { key: 'green', min: 0.05, max: 50 },
    { key: 'blue', min: 0.05, max: 50 },
    { key: 'lut1Intensity', min: 0, max: 1 },
    { key: 'lut2Intensity', min: 0, max: 1 },
    { key: 'rotation', min: -360, max: 360 },
  ];
  
  for (const { key, min, max } of rangeChecks) {
    const value = params[key];
    if (value !== undefined && value !== null) {
      if (typeof value !== 'number' || !Number.isFinite(value)) {
        errors.push(`${key} must be a finite number`);
      } else if (value < min || value > max) {
        errors.push(`${key} must be between ${min} and ${max}`);
      }
    }
  }
  
  // 枚举值验证
  if (params.inversionMode && !['linear', 'log'].includes(params.inversionMode)) {
    errors.push('inversionMode must be "linear" or "log"');
  }
  
  // 裁剪区域验证
  if (params.cropRect) {
    const { x, y, w, h } = params.cropRect;
    if (x < 0 || x > 1 || y < 0 || y > 1 || w <= 0 || w > 1 || h <= 0 || h > 1) {
      errors.push('cropRect values must be normalized (0-1)');
    }
    if (x + w > 1.01 || y + h > 1.01) { // 允许微小浮点误差
      errors.push('cropRect extends beyond image bounds');
    }
  }
  
  // 曲线验证
  if (params.curves) {
    for (const channel of ['rgb', 'red', 'green', 'blue']) {
      const curve = params.curves[channel];
      if (curve && Array.isArray(curve)) {
        for (const point of curve) {
          if (typeof point.x !== 'number' || typeof point.y !== 'number') {
            errors.push(`curves.${channel} contains invalid point`);
            break;
          }
          if (point.x < 0 || point.x > 255 || point.y < 0 || point.y > 255) {
            errors.push(`curves.${channel} point out of range (0-255)`);
            break;
          }
        }
      }
    }
  }
  
  // 全局饱和度验证
  if (params.saturation !== undefined && params.saturation !== null) {
    if (typeof params.saturation !== 'number' || !Number.isFinite(params.saturation)) {
      errors.push('saturation must be a finite number');
    } else if (params.saturation < -100 || params.saturation > 100) {
      errors.push('saturation must be between -100 and 100');
    }
  }
  
  // HSL 验证 (兼容 hslParams 和旧 hsl 字段名)
  const hslData = params.hslParams || params.hsl;
  if (hslData) {
    const hslChannels = ['red', 'orange', 'yellow', 'green', 'cyan', 'blue', 'purple', 'magenta'];
    for (const channel of hslChannels) {
      const hsl = hslData[channel];
      if (hsl) {
        if (hsl.hue !== undefined && (hsl.hue < -180 || hsl.hue > 180)) {
          errors.push(`hslParams.${channel}.hue must be between -180 and 180`);
        }
        if (hsl.saturation !== undefined && (hsl.saturation < -100 || hsl.saturation > 100)) {
          errors.push(`hslParams.${channel}.saturation must be between -100 and 100`);
        }
        if (hsl.luminance !== undefined && (hsl.luminance < -100 || hsl.luminance > 100)) {
          errors.push(`hslParams.${channel}.luminance must be between -100 and 100`);
        }
      }
    }
  }
  
  return {
    valid: errors.length === 0,
    errors,
  };
}

// ============================================================================
// 参数迁移
// ============================================================================

/**
 * 迁移旧版本参数到当前版本
 * 
 * @param {Object} params - 原始参数
 * @returns {Object} 迁移后的参数
 */
function migrateParams(params) {
  const version = params.version || 1;
  const migrated = { ...params };
  
  // v1 -> v2: 添加 HSL 和 splitToning
  if (version < 2) {
    if (!migrated.hslParams && !migrated.hsl) {
      migrated.hslParams = { ...DEFAULT_HSL_PARAMS };
    }
    if (!migrated.splitToning) {
      migrated.splitToning = { ...DEFAULT_SPLIT_TONING };
    }
    migrated.version = 2;
  }
  
  // v2 -> v3: 统一字段命名 + 添加 saturation
  if (version < 3) {
    migrated.saturation = migrated.saturation ?? 0;
    migrated.version = 3;
  }
  
  // === 兼容性映射：hsl → hslParams ===
  if (migrated.hsl && !migrated.hslParams) {
    migrated.hslParams = migrated.hsl;
    delete migrated.hsl;
  } else if (migrated.hsl) {
    delete migrated.hsl; // 优先 hslParams
  }
  
  // === 旧 HSL 结构迁移 (按属性分组 → 按通道分组) ===
  if (migrated.hslParams && migrated.hslParams.hue && typeof migrated.hslParams.hue === 'object'
      && !migrated.hslParams.red) {
    migrated.hslParams = migrateOldHSLFormat(migrated.hslParams);
  }
  
  // === 旧 splitToning 结构迁移 (flat → nested) ===
  if (migrated.splitToning && ('highlightHue' in migrated.splitToning || 'shadowHue' in migrated.splitToning)) {
    migrated.splitToning = migrateOldSplitToningFormat(migrated.splitToning);
  }
  
  // 确保所有必需字段存在
  migrated.hslParams = migrated.hslParams || { ...DEFAULT_HSL_PARAMS };
  migrated.splitToning = migrated.splitToning || { ...DEFAULT_SPLIT_TONING };
  migrated.curves = migrated.curves || { ...DEFAULT_CURVES };
  migrated.cropRect = migrated.cropRect || { ...DEFAULT_CROP_RECT };
  
  return migrated;
}

/**
 * 迁移旧版 HSL 格式：按属性分组 → 按通道分组
 * 旧: { hue: {red:0,...}, saturation: {red:0,...}, luminance: {red:0,...} }
 * 新: { red: {hue:0, saturation:0, luminance:0}, ... }
 * 同时处理 aqua→cyan 通道名映射
 */
function migrateOldHSLFormat(oldHSL) {
  const CHANNEL_MAP = { aqua: 'cyan' }; // 旧名→新名
  const channels = ['red', 'orange', 'yellow', 'green', 'aqua', 'cyan', 'blue', 'purple', 'magenta'];
  const result = { ...DEFAULT_HSL_PARAMS };
  
  for (const ch of channels) {
    const canonicalCh = CHANNEL_MAP[ch] || ch;
    if (!DEFAULT_HSL_PARAMS[canonicalCh]) continue;
    
    result[canonicalCh] = {
      hue: (oldHSL.hue && oldHSL.hue[ch]) || 0,
      saturation: (oldHSL.saturation && oldHSL.saturation[ch]) || 0,
      luminance: (oldHSL.luminance && oldHSL.luminance[ch]) || 0,
    };
  }
  return result;
}

/**
 * 迁移旧版 splitToning 格式：flat → nested 3-zone
 * 旧: { highlightHue, highlightSaturation, shadowHue, shadowSaturation, balance }
 * 新: { highlights: {hue, saturation}, midtones: {hue, saturation}, shadows: {hue, saturation}, balance }
 */
function migrateOldSplitToningFormat(old) {
  return {
    highlights: { hue: old.highlightHue || 0, saturation: old.highlightSaturation || 0 },
    midtones: { hue: 0, saturation: 0 },
    shadows: { hue: old.shadowHue || 0, saturation: old.shadowSaturation || 0 },
    balance: old.balance ?? 0,
  };
}

// ============================================================================
// 参数比较
// ============================================================================

/**
 * 比较两组参数是否有实质性差异
 * 
 * @param {Object} params1 - 参数组 1
 * @param {Object} params2 - 参数组 2
 * @returns {boolean} 是否有差异
 */
function hasParamsDifference(params1, params2) {
  const p1 = buildExportParams(null, params1);
  const p2 = buildExportParams(null, params2);
  
  // 简单字段比较
  const simpleFields = [
    'inverted', 'inversionMode', 'filmCurveEnabled', 'filmCurveProfile',
    'red', 'green', 'blue', 'temp', 'tint',
    'exposure', 'contrast', 'highlights', 'shadows', 'whites', 'blacks',
    'saturation',
    'rotation', 'lut1', 'lut1Intensity', 'lut2', 'lut2Intensity',
    'baseMode', 'baseRed', 'baseGreen', 'baseBlue',
    'baseDensityR', 'baseDensityG', 'baseDensityB',
    'densityLevelsEnabled',
  ];
  
  for (const field of simpleFields) {
    if (p1[field] !== p2[field]) {
      return true;
    }
  }
  
  // 裁剪区域比较 (允许微小误差)
  const cropFields = ['x', 'y', 'w', 'h'];
  for (const f of cropFields) {
    if (Math.abs((p1.cropRect?.[f] || 0) - (p2.cropRect?.[f] || 0)) > 0.001) {
      return true;
    }
  }
  
  // 曲线比较 (简化：比较 JSON)
  if (JSON.stringify(p1.curves) !== JSON.stringify(p2.curves)) {
    return true;
  }
  
  // HSL 比较 (统一使用 hslParams)
  if (JSON.stringify(p1.hslParams) !== JSON.stringify(p2.hslParams)) {
    return true;
  }
  
  // 分离色调比较
  if (JSON.stringify(p1.splitToning) !== JSON.stringify(p2.splitToning)) {
    return true;
  }
  
  return false;
}

/**
 * 序列化参数为 JSON 字符串 (用于数据库存储)
 * 
 * @param {Object} params - 处理参数
 * @returns {string} JSON 字符串
 */
function serializeParams(params) {
  const validated = buildExportParams(null, params);
  return JSON.stringify(validated);
}

/**
 * 反序列化参数
 * 
 * @param {string|Object} data - JSON 字符串或对象
 * @returns {Object} 处理参数
 */
function deserializeParams(data) {
  if (!data) {
    return { ...DEFAULT_PROCESSING_PARAMS };
  }
  
  const parsed = typeof data === 'string' ? JSON.parse(data) : data;
  return buildExportParams(null, parsed);
}

// ============================================================================
// 模块导出
// ============================================================================

module.exports = {
  // 参数版本
  PARAMS_VERSION,
  
  // 默认值
  DEFAULT_PROCESSING_PARAMS,
  DEFAULT_HSL_PARAMS,
  DEFAULT_SPLIT_TONING,
  
  // 构建和验证
  buildExportParams,
  validateExportParams,
  getPhotoProcessingParams,
  
  // 迁移
  migrateParams,
  
  // 比较和序列化
  hasParamsDifference,
  serializeParams,
  deserializeParams,
};
