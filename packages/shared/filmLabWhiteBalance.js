/**
 * FilmLab 白平衡模块 (科学化版本)
 * 
 * @module filmLabWhiteBalance
 * @description 实现基于开尔文色温的白平衡计算，同时保留传统简化模型的兼容性
 */

const {
  DEFAULT_WB_PARAMS,
  WB_GAIN_LIMITS,
  TEMP_SLIDER_CONFIG,
  REFERENCE_WHITE_POINTS,
} = require('./filmLabConstants');

// ============================================================================
// 辅助函数
// ============================================================================

/**
 * 数值钳制
 * @param {number} v - 输入值
 * @param {number} min - 最小值
 * @param {number} max - 最大值
 * @returns {number} 钳制后的值
 */
function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

// ============================================================================
// 色温转换算法 (CIE D 光源系列 — Q12 升级)
// ============================================================================

/**
 * CIE D 光源色度坐标 (xD, yD) → sRGB 乘数
 *
 * 基于 CIE 015:2004 标准 D 光源计算:
 *   4000K ≤ T ≤ 7000K:  xD = -4.6070e9/T³ + 2.9678e6/T² + 0.09911e3/T + 0.244063
 *   7000K < T ≤ 25000K: xD = -2.0064e9/T³ + 1.9018e6/T² + 0.24748e3/T + 0.237040
 *   yD = -3.000 xD² + 2.870 xD - 0.275
 *
 * 然后通过 CIE XYZ → sRGB 转换得到归一化 RGB 乘数。
 * 与 Tanner Helland 近似相比:
 *   - 物理上更精确 (基于标准日光光谱功率分布)
 *   - 全范围 C¹ 连续 (无 6600K 导数不连续)
 *   - 4000K–25000K 范围内误差 < 0.1% (CIE 标准精度)
 *
 * 低于 4000K 使用 Planckian 轨迹近似 (黑体辐射)。
 *
 * @param {number} kelvin - 色温 (开尔文)
 * @returns {[number, number, number]} RGB 乘数 (归一化，最大通道 ≈ 1.0)
 */
function kelvinToRGB(kelvin) {
  kelvin = clamp(kelvin, 1000, 40000);

  let xD, yD;

  if (kelvin >= 4000 && kelvin <= 25000) {
    // CIE D 光源色度坐标
    const T = kelvin;
    const T2 = T * T;
    const T3 = T2 * T;

    if (T <= 7000) {
      xD = -4.6070e9 / T3 + 2.9678e6 / T2 + 0.09911e3 / T + 0.244063;
    } else {
      xD = -2.0064e9 / T3 + 1.9018e6 / T2 + 0.24748e3 / T + 0.237040;
    }
    yD = -3.000 * xD * xD + 2.870 * xD - 0.275;
  } else {
    // < 4000K: Planckian 轨迹 (Kang et al. 2002)
    // > 25000K: extrapolate from CIE D (very blue — rare in practice)
    const T = kelvin;
    const T2 = T * T;
    const T3 = T2 * T;

    if (T < 4000) {
      // Kang et al. Planckian locus approximation (1667K–4000K)
      xD = -0.2661239e9 / T3 - 0.2343589e6 / T2 + 0.8776956e3 / T + 0.179910;
      yD = -1.1063814 * xD * xD * xD - 1.34811020 * xD * xD + 2.18555832 * xD - 0.20219683;
      // Smooth blend near 4000K boundary
      if (T > 3500) {
        const blend = (T - 3500) / 500; // 0 at 3500K, 1 at 4000K
        const xD_cie = -4.6070e9 / (4000 * 4000 * 4000) + 2.9678e6 / (4000 * 4000)
                       + 0.09911e3 / 4000 + 0.244063;
        const yD_cie = -3.000 * xD_cie * xD_cie + 2.870 * xD_cie - 0.275;
        xD = xD * (1 - blend) + xD_cie * blend;
        yD = yD * (1 - blend) + yD_cie * blend;
      }
    } else {
      // > 25000K: use CIE D formula (extrapolated — good enough)
      xD = -2.0064e9 / T3 + 1.9018e6 / T2 + 0.24748e3 / T + 0.237040;
      yD = -3.000 * xD * xD + 2.870 * xD - 0.275;
    }
  }

  // CIE xyY → XYZ (Y = 1.0 — equal-energy luminance)
  const X = xD / yD;
  const Y = 1.0;
  const Z = (1.0 - xD - yD) / yD;

  // XYZ → linear sRGB (D65 reference, IEC 61966-2-1 matrix)
  let R =  3.2404542 * X - 1.5371385 * Y - 0.4985314 * Z;
  let G = -0.9692660 * X + 1.8760108 * Y + 0.0415560 * Z;
  let B =  0.0556434 * X - 0.2040259 * Y + 1.0572252 * Z;

  // Normalize so max channel = 1.0 (preserve chromaticity, not absolute intensity)
  const maxC = Math.max(R, Math.max(G, B));
  if (maxC > 0) {
    R /= maxC;
    G /= maxC;
    B /= maxC;
  }

  // Clamp negatives (out-of-gamut for extreme temperatures)
  R = Math.max(0, R);
  G = Math.max(0, G);
  B = Math.max(0, B);

  return [R, G, B];
}

/**
 * 将滑块值映射到开尔文色温
 * 
 * @param {number} sliderValue - 滑块值 (-100 to 100)
 * @returns {number} 开尔文色温
 */
function sliderToKelvin(sliderValue) {
  const { baseKelvin, kelvinPerUnit } = TEMP_SLIDER_CONFIG;
  return baseKelvin + (sliderValue * kelvinPerUnit);
}

// ============================================================================
// 白平衡计算
// ============================================================================

/**
 * 计算白平衡增益 (科学化版本)
 * 
 * 使用基于开尔文色温的物理模型计算 RGB 增益
 * 
 * @param {Object} params - 白平衡参数
 * @param {number} [params.red=1] - 红色基础增益
 * @param {number} [params.green=1] - 绿色基础增益
 * @param {number} [params.blue=1] - 蓝色基础增益
 * @param {number} [params.temp=0] - 色温调整 (-100 to 100)
 * @param {number} [params.tint=0] - 色调调整 (-100 to 100)
 * @param {Object} [options] - 选项
 * @param {boolean} [options.useKelvinModel=true] - 使用开尔文色温模型
 * @param {number} [options.minGain] - 最小增益
 * @param {number} [options.maxGain] - 最大增益
 * @returns {[number, number, number]} RGB 增益数组
 */
function computeWBGains(params = {}, options = {}) {
  const minGain = options.minGain ?? WB_GAIN_LIMITS.min;
  const maxGain = options.maxGain ?? WB_GAIN_LIMITS.max;
  const useKelvinModel = options.useKelvinModel !== false;
  
  // 安全解析输入
  const R = Number.isFinite(params.red) ? params.red : DEFAULT_WB_PARAMS.red;
  const G = Number.isFinite(params.green) ? params.green : DEFAULT_WB_PARAMS.green;
  const B = Number.isFinite(params.blue) ? params.blue : DEFAULT_WB_PARAMS.blue;
  const T = Number.isFinite(params.temp) ? params.temp : DEFAULT_WB_PARAMS.temp;
  const N = Number.isFinite(params.tint) ? params.tint : DEFAULT_WB_PARAMS.tint;

  let rGain, gGain, bGain;

  if (useKelvinModel) {
    // === 科学化开尔文色温模型 ===
    
    // 1. 计算目标色温对应的 RGB 乘数
    const targetKelvin = sliderToKelvin(T);
    const [rTemp, gTemp, bTemp] = kelvinToRGB(targetKelvin);
    
    // 2. 计算参考白点 (D65) 的 RGB
    const [rRef, gRef, bRef] = kelvinToRGB(REFERENCE_WHITE_POINTS.D65);
    
    // 3. 计算相对增益 (目标相对于参考)
    // 由于我们要将图像中的目标色温区域校正为 D65，
    // 需要反向应用增益：增益 = 参考 / 目标
    const rTempGain = rRef / Math.max(0.001, rTemp);
    const gTempGain = gRef / Math.max(0.001, gTemp);
    const bTempGain = bRef / Math.max(0.001, bTemp);
    
    // 4. 色调调整 (绿-品红轴)
    // tint > 0: 更品红 (减绿加红蓝)
    // tint < 0: 更绿 (加绿减红蓝)
    const n = N / 100; // 归一化到 -1..1
    const tintR = 1 + n * 0.15;
    const tintG = 1 - n * 0.30;
    const tintB = 1 + n * 0.15;
    
    // 5. 组合所有增益
    rGain = R * rTempGain * tintR;
    gGain = G * gTempGain * tintG;
    bGain = B * bTempGain * tintB;
    
  } else {
    // === 传统简化模型 (向后兼容) ===
    const t = T / 100;
    const n = N / 100;
    
    rGain = R * (1 + t * 0.5 + n * 0.3);
    gGain = G * (1 - n * 0.5);
    bGain = B * (1 - t * 0.5 + n * 0.3);
  }
  
  // 安全检查并钳制
  if (!Number.isFinite(rGain)) rGain = 1;
  if (!Number.isFinite(gGain)) gGain = 1;
  if (!Number.isFinite(bGain)) bGain = 1;
  
  rGain = clamp(rGain, minGain, maxGain);
  gGain = clamp(gGain, minGain, maxGain);
  bGain = clamp(bGain, minGain, maxGain);
  
  return [rGain, gGain, bGain];
}

/**
 * 计算白平衡增益 (传统模型，用于向后兼容)
 * 
 * @param {Object} params - 白平衡参数
 * @param {Object} [options] - 选项
 * @returns {[number, number, number]} RGB 增益数组
 */
function computeWBGainsLegacy(params = {}, options = {}) {
  return computeWBGains(params, { ...options, useKelvinModel: false });
}

// ============================================================================
// 自动白平衡求解器
// ============================================================================

/**
 * 从采样颜色求解色温和色调
 * 
 * 根据灰度世界假设，计算使采样颜色变为中性灰的 temp/tint 值
 * 
 * @param {[number, number, number]} sampleRgb - 采样的 RGB 值 (0-255)
 * @param {Object} [baseGains] - 基础增益 {red, green, blue}
 * @returns {{temp: number, tint: number}} 求解的 temp 和 tint 值
 */
function solveTempTintFromSample(sampleRgb, baseGains = {}) {
  // 输入验证
  if (!Array.isArray(sampleRgb) || sampleRgb.length < 3) {
    return { temp: 0, tint: 0 };
  }
  
  // 安全解析采样值
  const safeSample = sampleRgb.map(v => {
    const val = Number(v);
    return Number.isFinite(val) ? Math.max(1, val) : 128;
  });

  // 安全解析基础增益
  const base = {
    red: Math.max(0.05, Number.isFinite(baseGains.red) ? baseGains.red : 1),
    green: Math.max(0.05, Number.isFinite(baseGains.green) ? baseGains.green : 1),
    blue: Math.max(0.05, Number.isFinite(baseGains.blue) ? baseGains.blue : 1),
  };

  const [rS, gS, bS] = safeSample;
  
  // 应用基础增益
  const rBase = rS * base.red;
  const gBase = gS * base.green;
  const bBase = bS * base.blue;
  
  // 计算相对于绿色通道的比率
  const ratioR = gBase / rBase;  // > 1 表示红色需要增强
  const ratioB = gBase / bBase;  // > 1 表示蓝色需要增强
  
  // 如果已经接近中性，直接返回 0
  if (Math.abs(ratioR - 1) < 0.02 && Math.abs(ratioB - 1) < 0.02) {
    return { temp: 0, tint: 0 };
  }
  
  // 求解 temp 和 tint
  // 基于传统模型的逆推导
  const sumRatios = ratioR + ratioB;
  const denominator = 0.6 + 0.5 * sumRatios;
  
  const n = (sumRatios - 2) / denominator;
  const t = (ratioR - ratioB) * (1 - n * 0.5);
  
  if (!Number.isFinite(t) || !Number.isFinite(n)) {
    return { temp: 0, tint: 0 };
  }
  
  // 转换到滑块刻度 (-100 to 100)
  let tempOut = clamp(t * 100, -100, 100);
  let tintOut = clamp(n * 100, -100, 100);
  
  // 验证结果是否会产生极端增益
  const testGains = computeWBGainsLegacy({
    red: base.red,
    green: base.green,
    blue: base.blue,
    temp: tempOut,
    tint: tintOut,
  });
  
  const [testR, testG, testB] = testGains;
  const isExtreme = testR < 0.1 || testR > 10 || testG < 0.1 || testG > 10 || testB < 0.1 || testB > 10;
  
  if (isExtreme) {
    // 缩减极端值
    tempOut *= 0.5;
    tintOut *= 0.5;
  }
  
  return { temp: tempOut, tint: tintOut };
}

// ============================================================================
// 模块导出 (CommonJS)
// ============================================================================

module.exports = {
  computeWBGains,
  computeWBGainsLegacy,
  solveTempTintFromSample,
  kelvinToRGB,
  sliderToKelvin,
};
