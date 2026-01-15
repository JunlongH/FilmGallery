/**
 * FilmLab 曲线处理模块
 * 
 * @module filmLabCurves
 * @description 实现 Fritsch-Carlson 单调三次样条插值和曲线 LUT 构建
 */

import { DEFAULT_CURVES } from './filmLabConstants.js';

/**
 * 创建单调三次样条插值函数 (Fritsch-Carlson 算法)
 * 
 * 该算法保证插值结果在控制点之间单调，避免曲线抖动和过冲
 * 
 * @param {number[]} xs - X 坐标数组 (必须单调递增)
 * @param {number[]} ys - Y 坐标数组
 * @returns {Function} 插值函数 (x) => y
 */
export function createSpline(xs, ys) {
  const n = xs.length;
  
  // 边界检查
  if (n < 2) {
    return (x) => (n === 1 ? ys[0] : x);
  }
  
  // 计算差分和斜率
  const dys = [];
  const dxs = [];
  const ms = [];
  
  for (let i = 0; i < n - 1; i++) {
    dxs.push(xs[i + 1] - xs[i]);
    dys.push(ys[i + 1] - ys[i]);
    ms.push(dys[i] / dxs[i]);
  }

  // 计算 Fritsch-Carlson 切线斜率
  const c1s = [ms[0]];
  for (let i = 0; i < n - 2; i++) {
    const m = ms[i];
    const mNext = ms[i + 1];
    
    // 单调性约束：如果斜率符号改变，切线斜率为 0
    if (m * mNext <= 0) {
      c1s.push(0);
    } else {
      // 加权调和平均
      const dx = dxs[i];
      const dxNext = dxs[i + 1];
      const common = dx + dxNext;
      c1s.push((3 * common) / ((common + dxNext) / m + (common + dx) / mNext));
    }
  }
  c1s.push(ms[ms.length - 1]);

  // 计算三次多项式系数
  const c2s = [];
  const c3s = [];
  for (let i = 0; i < n - 1; i++) {
    const c1 = c1s[i];
    const m = ms[i];
    const invDx = 1 / dxs[i];
    const common = c1 + c1s[i + 1] - 2 * m;
    c2s.push((m - c1 - common) * invDx);
    c3s.push(common * invDx * invDx);
  }

  // 返回插值函数
  return (x) => {
    // 二分查找段落索引
    let i = 0;
    while (i < n - 2 && x > xs[i + 1]) i++;
    
    const diff = x - xs[i];
    return ys[i] + c1s[i] * diff + c2s[i] * diff * diff + c3s[i] * diff * diff * diff;
  };
}

/**
 * 从控制点构建 256 级曲线 LUT
 * 
 * @param {Array<{x: number, y: number}>} points - 控制点数组
 * @returns {Uint8Array} 256 级查找表
 */
export function buildCurveLUT(points) {
  const lut = new Uint8Array(256);
  
  // 排序控制点 (按 x 坐标)
  const sorted = Array.isArray(points) && points.length > 0
    ? [...points].sort((a, b) => a.x - b.x)
    : [{ x: 0, y: 0 }, { x: 255, y: 255 }];
  
  // 少于 2 个点时返回恒等映射
  if (sorted.length < 2) {
    for (let i = 0; i < 256; i++) lut[i] = i;
    return lut;
  }

  const xs = sorted.map(p => p.x);
  const ys = sorted.map(p => p.y);
  const spline = createSpline(xs, ys);

  for (let i = 0; i < 256; i++) {
    let val;
    
    // 边界处理
    if (i <= sorted[0].x) {
      val = sorted[0].y;
    } else if (i >= sorted[sorted.length - 1].x) {
      val = sorted[sorted.length - 1].y;
    } else {
      val = spline(i);
    }
    
    lut[i] = Math.min(255, Math.max(0, Math.round(val)));
  }
  
  return lut;
}

/**
 * 构建所有通道的曲线 LUT
 * 
 * @param {Object} curves - 曲线配置
 * @param {Array} curves.rgb - RGB 曲线控制点
 * @param {Array} curves.red - 红色通道控制点
 * @param {Array} curves.green - 绿色通道控制点
 * @param {Array} curves.blue - 蓝色通道控制点
 * @returns {Object} 包含所有通道 LUT 的对象
 */
export function buildAllCurveLUTs(curves = {}) {
  const mergedCurves = { ...DEFAULT_CURVES, ...curves };
  
  return {
    lutRGB: buildCurveLUT(mergedCurves.rgb),
    lutR: buildCurveLUT(mergedCurves.red),
    lutG: buildCurveLUT(mergedCurves.green),
    lutB: buildCurveLUT(mergedCurves.blue),
  };
}

/**
 * 应用曲线到单个值
 * 
 * @param {number} value - 输入值 (0-255)
 * @param {Array<{x: number, y: number}>} points - 控制点
 * @returns {number} 映射后的值
 */
export function applyCurve(value, points) {
  const lut = buildCurveLUT(points);
  return lut[Math.min(255, Math.max(0, Math.round(value)))];
}
