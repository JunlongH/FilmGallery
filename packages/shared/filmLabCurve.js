/**
 * FilmLab 胶片曲线模块
 * 
 * @module filmLabCurve
 * @description 独立的胶片特性曲线处理，基于 H&D 密度模型
 * 
 * 与反转模块分离，可以：
 * 1. 单独应用胶片曲线（用于已反转的正片）
 * 2. 配合反转使用（负片处理流程）
 * 3. 支持自定义 gamma/dMin/dMax 参数
 */

const { FILM_PROFILES } = require('./filmLabConstants');

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
// 胶片曲线算法
// ============================================================================

/**
 * 应用胶片特性曲线
 * 
 * 基于胶片密度模型的透射率调整：
 * 1. 输入归一化 (0-255 → 0-1)
 * 2. 密度计算: D = -log10(T)
 * 3. 密度归一化到 dMin-dMax 范围
 * 4. 应用 gamma 曲线调整密度响应
 * 5. 将调整后的密度转回透射率
 * 
 * 注意：此函数输出的是调整后的透射率值，不做反转
 * 反转由 applyInversion 统一处理
 * 
 * @param {number} value - 输入值 (0-255，代表透射率)
 * @param {Object} profile - 胶片曲线参数
 * @param {number} [profile.gamma=0.6] - 曲线 gamma 值
 * @param {number} [profile.dMin=0.1] - 最小密度
 * @param {number} [profile.dMax=3.0] - 最大密度
 * @returns {number} 处理后的透射率值 (0-255)
 */
function applyFilmCurve(value, profile = {}) {
  const { gamma = 0.6, dMin = 0.1, dMax = 3.0 } = profile;
  
  // 1. 输入归一化 (避免 log(0))
  const normalized = clamp(value / 255, 0.001, 1);
  
  // 2. 计算密度 D = -log10(T)
  // 高透射率(亮) → 低密度，低透射率(暗) → 高密度
  const density = -Math.log10(normalized);
  
  // 3. 密度归一化到 dMin-dMax 范围
  const densityNorm = clamp((density - dMin) / (dMax - dMin), 0, 1);
  
  // 4. 应用 gamma 曲线调整密度响应
  // gamma < 1: 压缩高密度区（阴影），展开低密度区（高光）
  // gamma > 1: 压缩低密度区（高光），展开高密度区（阴影）
  const gammaApplied = Math.pow(densityNorm, gamma);
  
  // 5. 将调整后的归一化密度转回密度值
  const adjustedDensity = dMin + gammaApplied * (dMax - dMin);
  
  // 6. 将密度转回透射率: T = 10^(-D)
  const outputT = Math.pow(10, -adjustedDensity);
  
  return clamp(Math.round(outputT * 255), 0, 255);
}

/**
 * 应用胶片曲线到 RGB 三通道
 * 
 * @param {number} r - 红色值 (0-255)
 * @param {number} g - 绿色值 (0-255)
 * @param {number} b - 蓝色值 (0-255)
 * @param {Object} profile - 胶片曲线参数
 * @returns {[number, number, number]} 处理后的 RGB 值
 */
function applyFilmCurveRGB(r, g, b, profile = {}) {
  return [
    applyFilmCurve(r, profile),
    applyFilmCurve(g, profile),
    applyFilmCurve(b, profile),
  ];
}

/**
 * 构建胶片曲线 LUT
 * 
 * 预计算 256 级查找表，用于批量处理
 * 
 * @param {Object} profile - 胶片曲线参数
 * @returns {Uint8Array} 256 级查找表
 */
function buildFilmCurveLUT(profile = {}) {
  const lut = new Uint8Array(256);
  
  for (let i = 0; i < 256; i++) {
    lut[i] = applyFilmCurve(i, profile);
  }
  
  return lut;
}

/**
 * 获取内置胶片曲线配置
 * 
 * @param {string} profileKey - 配置键名 (如 'portra400')
 * @returns {Object} 胶片曲线参数
 */
function getBuiltinFilmProfile(profileKey) {
  return FILM_PROFILES[profileKey] || FILM_PROFILES.default;
}

/**
 * 合并内置配置和自定义配置
 * 
 * @param {Array} customProfiles - 从数据库加载的自定义配置
 * @returns {Object} 合并后的配置对象 { key: { gamma, dMin, dMax, name, isBuiltin } }
 */
function mergeFilmProfiles(customProfiles = []) {
  // 内置配置
  const merged = {};
  for (const [key, profile] of Object.entries(FILM_PROFILES)) {
    merged[key] = {
      ...profile,
      isBuiltin: true,
    };
  }
  
  // 自定义配置覆盖或添加
  for (const custom of customProfiles) {
    merged[custom.key] = {
      gamma: custom.gamma,
      dMin: custom.dMin,
      dMax: custom.dMax,
      name: custom.name,
      category: custom.category || 'custom',
      isBuiltin: false,
      id: custom.id,
    };
  }
  
  return merged;
}

/**
 * 按类别分组胶片配置
 * 
 * @param {Object} profiles - 合并后的配置对象
 * @returns {Object} 分组后的配置 { color: [...], bw: [...], custom: [...] }
 */
function groupFilmProfilesByCategory(profiles) {
  const groups = {
    color: [],
    bw: [],
    custom: [],
  };
  
  const categoryMap = {
    portra160: 'color', portra400: 'color', portra800: 'color',
    ektar100: 'color', gold200: 'color', colorplus200: 'color',
    pro400h: 'color', superia400: 'color', c200: 'color',
    trix400: 'bw', tmax100: 'bw', tmax400: 'bw',
    hp5: 'bw', delta100: 'bw', delta400: 'bw', acros100: 'bw',
    default: 'color',
  };
  
  for (const [key, profile] of Object.entries(profiles)) {
    if (!profile.isBuiltin) {
      groups.custom.push({ key, ...profile });
    } else {
      const cat = categoryMap[key] || 'color';
      groups[cat].push({ key, ...profile });
    }
  }
  
  return groups;
}

// ============================================================================
// 模块导出 (CommonJS)
// ============================================================================

module.exports = {
  applyFilmCurve,
  applyFilmCurveRGB,
  buildFilmCurveLUT,
  getBuiltinFilmProfile,
  mergeFilmProfiles,
  groupFilmProfilesByCategory,
  FILM_CURVE_PROFILES: FILM_PROFILES,
};
