/**
 * FilmLab 白平衡模块 (科学化版本)
 * 
 * @module filmLabWhiteBalance
 * @description 实现基于开尔文色温的白平衡计算，同时保留传统简化模型的兼容性
 */

import {
  DEFAULT_WB_PARAMS,
  WB_GAIN_LIMITS,
  TEMP_SLIDER_CONFIG,
  REFERENCE_WHITE_POINTS,
} from './filmLabConstants.js';

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
// 色温转换算法 (Tanner Helland 算法)
// ============================================================================

/**
 * 将开尔文色温转换为 RGB 乘数
 * 
 * 基于黑体辐射的近似算法 (Tanner Helland)
 * 有效范围: 1000K - 40000K
 * 
 * 参考: https://tannerhelland.com/2012/09/18/convert-temperature-rgb-algorithm-code.html
 * 
 * @param {number} kelvin - 色温 (开尔文)
 * @returns {[number, number, number]} RGB 乘数 (0-1 范围)
 */
export function kelvinToRGB(kelvin) {
  // 确保色温在有效范围内
  kelvin = clamp(kelvin, 1000, 40000);
  const temp = kelvin / 100;
  
  let r, g, b;

  // 红色通道
  if (temp <= 66) {
    r = 255;
  } else {
    r = temp - 60;
    r = 329.698727446 * Math.pow(r, -0.1332047592);
    r = clamp(r, 0, 255);
  }

  // 绿色通道
  if (temp <= 66) {
    g = temp;
    g = 99.4708025861 * Math.log(g) - 161.1195681661;
  } else {
    g = temp - 60;
    g = 288.1221695283 * Math.pow(g, -0.0755148492);
  }
  g = clamp(g, 0, 255);

  // 蓝色通道
  if (temp >= 66) {
    b = 255;
  } else if (temp <= 19) {
    b = 0;
  } else {
    b = temp - 10;
    b = 138.5177312231 * Math.log(b) - 305.0447927307;
    b = clamp(b, 0, 255);
  }

  // 归一化到 0-1
  return [r / 255, g / 255, b / 255];
}

/**
 * 将滑块值映射到开尔文色温
 * 
 * @param {number} sliderValue - 滑块值 (-100 to 100)
 * @returns {number} 开尔文色温
 */
export function sliderToKelvin(sliderValue) {
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
export function computeWBGains(params = {}, options = {}) {
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
export function computeWBGainsLegacy(params = {}, options = {}) {
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
export function solveTempTintFromSample(sampleRgb, baseGains = {}) {
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
