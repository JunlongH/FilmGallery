/**
 * FilmLab 核心处理模块
 * 
 * @module filmlab-core
 * @description 统一的像素处理核心，确保客户端、服务端、GPU 导出路径使用完全相同的算法
 * 
 * 处理流水线顺序 (已调整)：
 * ① 胶片曲线 (Film Curve - H&D 密度模型)
 * ② 反转 (Inversion) - 在几何变换之前执行
 * ③ 白平衡 (White Balance)
 * ④ 色调映射 (Tone Mapping via LUT)
 * ⑤ 曲线 (Curves)
 * ⑥ HSL 调整 (色相/饱和度/明度)
 * ⑦ 分离色调 (Split Toning)
 * ⑧ 3D LUT
 * 
 * 注意：几何变换（旋转、裁剪）在调用此模块之前由各自的渲染路径处理
 */

const { DEFAULT_CURVES, DEFAULT_WB_PARAMS, DEBUG } = require('./filmLabConstants');
const { buildToneLUT } = require('./filmLabToneLUT');
const { buildCurveLUT } = require('./filmLabCurves');
const { computeWBGains } = require('./filmLabWhiteBalance');
const { applyInversion } = require('./filmLabInversion');
const { applyFilmCurve, FILM_CURVE_PROFILES } = require('./filmLabCurve');
const { applyHSL, DEFAULT_HSL_PARAMS, isDefaultHSL } = require('./filmLabHSL');
const { applySplitTone, DEFAULT_SPLIT_TONE_PARAMS, isDefaultSplitTone } = require('./filmLabSplitTone');

// ============================================================================
// 辅助函数
// ============================================================================

/**
 * 数值钳制到 0-255 范围
 */
function clamp255(v) {
  return Math.max(0, Math.min(255, v));
}

// ============================================================================
// 3D LUT 采样
// ============================================================================

/**
 * 三线性插值采样 3D LUT
 * 
 * @param {number} r - 红色值 (0-255)
 * @param {number} g - 绿色值 (0-255)
 * @param {number} b - 蓝色值 (0-255)
 * @param {Object} lut - LUT 对象 {size, data}
 * @param {number} [intensity=1] - LUT 应用强度 (0-1)
 * @returns {[number, number, number]} 采样后的 RGB 值 (0-255)
 */
function sampleLUT3D(r, g, b, lut, intensity = 1) {
  if (!lut || !lut.data || !lut.size) {
    return [r, g, b];
  }
  
  const { size, data } = lut;
  const maxIndex = size - 1;

  // 归一化到 [0, 1]
  const rNorm = clamp255(r) / 255;
  const gNorm = clamp255(g) / 255;
  const bNorm = clamp255(b) / 255;

  // 映射到网格位置
  const rPos = rNorm * maxIndex;
  const gPos = gNorm * maxIndex;
  const bPos = bNorm * maxIndex;

  // 8 个角索引
  const r0 = Math.floor(rPos);
  const r1 = Math.min(maxIndex, r0 + 1);
  const g0 = Math.floor(gPos);
  const g1 = Math.min(maxIndex, g0 + 1);
  const b0 = Math.floor(bPos);
  const b1 = Math.min(maxIndex, b0 + 1);

  // 分数部分
  const fr = rPos - r0;
  const fg = gPos - g0;
  const fb = bPos - b0;

  // 获取索引 (R 最快变化，B 最慢，标准 .cube 格式)
  const getIdx = (ri, gi, bi) => (ri + gi * size + bi * size * size) * 3;

  // 三线性插值
  const interp = (offset) => {
    const v000 = data[getIdx(r0, g0, b0) + offset];
    const v100 = data[getIdx(r1, g0, b0) + offset];
    const v010 = data[getIdx(r0, g1, b0) + offset];
    const v110 = data[getIdx(r1, g1, b0) + offset];
    const v001 = data[getIdx(r0, g0, b1) + offset];
    const v101 = data[getIdx(r1, g0, b1) + offset];
    const v011 = data[getIdx(r0, g1, b1) + offset];
    const v111 = data[getIdx(r1, g1, b1) + offset];

    const c00 = v000 * (1 - fr) + v100 * fr;
    const c10 = v010 * (1 - fr) + v110 * fr;
    const c01 = v001 * (1 - fr) + v101 * fr;
    const c11 = v011 * (1 - fr) + v111 * fr;

    const c0 = c00 * (1 - fg) + c10 * fg;
    const c1 = c01 * (1 - fg) + c11 * fg;

    return c0 * (1 - fb) + c1 * fb;
  };

  // LUT 输出是 0-1 范围，需要转回 0-255
  const rOut = interp(0) * 255;
  const gOut = interp(1) * 255;
  const bOut = interp(2) * 255;

  // 强度混合
  if (intensity >= 1) {
    return [rOut, gOut, bOut];
  }
  
  return [
    r + (rOut - r) * intensity,
    g + (gOut - g) * intensity,
    b + (bOut - b) * intensity,
  ];
}

// ============================================================================
// 核心处理函数
// ============================================================================

/**
 * 处理单个像素的所有变换
 * 
 * 处理顺序：
 * 1. 胶片曲线 (Film Curve) - H&D 密度模型，应用于负片扫描数据
 * 2. 反转 (Inversion) - 线性/对数反转
 * 3. 白平衡 (White Balance)
 * 4. 色调映射 (Tone LUT)
 * 5. 曲线 (RGB → 分通道)
 * 6. 3D LUT
 * 
 * 注意：Film Curve 必须在 Inversion 之前，因为 H&D 密度模型
 * 描述的是胶片对光的响应特性，应该作用于负片扫描数据（透射率）
 * 
 * @param {number} r - 红色通道 (0-255)
 * @param {number} g - 绿色通道 (0-255)
 * @param {number} b - 蓝色通道 (0-255)
 * @param {Object} luts - 预构建的查找表 (由 prepareLUTs 生成)
 * @param {Object} params - 处理参数
 * @returns {[number, number, number]} 处理后的 RGB 值
 */
function processPixel(r, g, b, luts, params = {}) {
  // ① 胶片曲线 (Film Curve) - 应用于负片扫描数据（透射率）
  // 只有在反转模式下才有意义，因为 H&D 模型描述负片特性
  if (params.inverted && params.filmCurveEnabled && params.filmCurveProfile) {
    // 查找配置文件
    const profileKey = params.filmCurveProfile;
    const profile = FILM_CURVE_PROFILES[profileKey];
    
    if (profile) {
      // 支持自定义参数覆盖
      const curveParams = {
        gamma: params.filmCurveGamma ?? profile.gamma,
        dMin: params.filmCurveDMin ?? profile.dMin,
        dMax: params.filmCurveDMax ?? profile.dMax
      };
      
      r = applyFilmCurve(r, curveParams);
      g = applyFilmCurve(g, curveParams);
      b = applyFilmCurve(b, curveParams);
    }
  }

  // ② 反转 (Inversion) - 线性/对数反转
  if (params.inverted) {
    r = applyInversion(r, params);
    g = applyInversion(g, params);
    b = applyInversion(b, params);
  }

  // ③ 白平衡 (White Balance)
  r *= luts.rBal;
  g *= luts.gBal;
  b *= luts.bBal;

  // 钳制到 0-255
  r = clamp255(r);
  g = clamp255(g);
  b = clamp255(b);

  // 安全检查 NaN/Infinity
  if (!Number.isFinite(r)) r = 0;
  if (!Number.isFinite(g)) g = 0;
  if (!Number.isFinite(b)) b = 0;

  // ③ 色调映射 (Tone LUT)
  r = luts.toneLUT[Math.floor(r)];
  g = luts.toneLUT[Math.floor(g)];
  b = luts.toneLUT[Math.floor(b)];

  // ④ 曲线 (Curves) - 先 RGB 后分通道
  r = luts.lutRGB[r];
  g = luts.lutRGB[g];
  b = luts.lutRGB[b];

  r = luts.lutR[r];
  g = luts.lutG[g];
  b = luts.lutB[b];

  // ⑥ HSL 调整 (如果有非默认参数)
  if (params.hslParams && !isDefaultHSL(params.hslParams)) {
    [r, g, b] = applyHSL(r, g, b, params.hslParams);
  }

  // ⑦ 分离色调 (如果有非默认参数)
  if (params.splitToning && !isDefaultSplitTone(params.splitToning)) {
    [r, g, b] = applySplitTone(r, g, b, params.splitToning);
  }

  // ⑧ 3D LUT 应用 (如果存在)
  if (luts.lut1) {
    [r, g, b] = sampleLUT3D(r, g, b, luts.lut1, luts.lut1Intensity);
  }
  if (luts.lut2) {
    [r, g, b] = sampleLUT3D(r, g, b, luts.lut2, luts.lut2Intensity);
  }

  // 最终钳制
  return [
    clamp255(Math.round(r)),
    clamp255(Math.round(g)),
    clamp255(Math.round(b)),
  ];
}

/**
 * 预构建所有查找表
 * 
 * 此函数应在处理循环之前调用一次，以避免重复计算
 * 
 * @param {Object} params - FilmLab 参数对象
 * @returns {Object} 包含所有 LUT 的对象
 */
function prepareLUTs(params = {}) {
  // 构建色调 LUT
  const toneLUT = buildToneLUT({
    exposure: params.exposure || 0,
    contrast: params.contrast || 0,
    highlights: params.highlights || 0,
    shadows: params.shadows || 0,
    whites: params.whites || 0,
    blacks: params.blacks || 0,
  });

  // 构建曲线 LUT
  const curves = params.curves || DEFAULT_CURVES;
  const lutRGB = buildCurveLUT(curves.rgb || DEFAULT_CURVES.rgb);
  const lutR = buildCurveLUT(curves.red || DEFAULT_CURVES.red);
  const lutG = buildCurveLUT(curves.green || DEFAULT_CURVES.green);
  const lutB = buildCurveLUT(curves.blue || DEFAULT_CURVES.blue);

  // 计算白平衡增益
  const [rBal, gBal, bBal] = computeWBGains({
    red: params.red ?? DEFAULT_WB_PARAMS.red,
    green: params.green ?? DEFAULT_WB_PARAMS.green,
    blue: params.blue ?? DEFAULT_WB_PARAMS.blue,
    temp: params.temp ?? DEFAULT_WB_PARAMS.temp,
    tint: params.tint ?? DEFAULT_WB_PARAMS.tint,
  }, {
    useKelvinModel: params.useKelvinModel !== false, // 默认使用科学化模型
  });

  return {
    toneLUT,
    lutRGB,
    lutR,
    lutG,
    lutB,
    rBal,
    gBal,
    bBal,
    lut1: params.lut1 || null,
    lut1Intensity: params.lut1Intensity ?? 1.0,
    lut2: params.lut2 || null,
    lut2Intensity: params.lut2Intensity ?? 1.0,
  };
}

/**
 * 批量处理像素数组
 * 
 * 用于服务端或离线处理场景
 * 
 * @param {Uint8Array|Uint8ClampedArray} data - 像素数据 (RGBA 或 RGB 格式)
 * @param {Object} params - 处理参数
 * @param {Object} [options] - 选项
 * @param {number} [options.channels=4] - 每像素通道数 (3 或 4)
 * @returns {Uint8Array} 处理后的像素数据
 */
function processPixelArray(data, params = {}, options = {}) {
  const channels = options.channels || 4;
  const luts = prepareLUTs(params);
  const inversionParams = {
    inverted: params.inverted || false,
    inversionMode: params.inversionMode || 'linear',
    filmType: params.filmType || 'default',
  };
  
  const output = new Uint8Array(data.length);
  
  for (let i = 0; i < data.length; i += channels) {
    let r = data[i];
    let g = data[i + 1];
    let b = data[i + 2];
    
    // 跳过完全透明的像素 (仅 RGBA)
    if (channels === 4 && data[i + 3] === 0) {
      output[i] = r;
      output[i + 1] = g;
      output[i + 2] = b;
      output[i + 3] = data[i + 3];
      continue;
    }
    
    [r, g, b] = processPixel(r, g, b, luts, inversionParams);
    
    output[i] = r;
    output[i + 1] = g;
    output[i + 2] = b;
    
    if (channels === 4) {
      output[i + 3] = data[i + 3]; // 保留 alpha
    }
  }
  
  return output;
}

/**
 * 调试辅助：打印处理参数
 */
function debugLogParams(params, luts) {
  if (!DEBUG) return;
  
  console.log('[FilmLab Core] Processing with params:', {
    inverted: params.inverted,
    inversionMode: params.inversionMode,
    filmType: params.filmType,
    exposure: params.exposure,
    contrast: params.contrast,
    wbGains: [luts.rBal.toFixed(3), luts.gBal.toFixed(3), luts.bBal.toFixed(3)],
    hasLut1: !!luts.lut1,
    hasLut2: !!luts.lut2,
  });
}

// ============================================================================
// 模块导出 (CommonJS)
// ============================================================================

module.exports = {
  processPixel,
  prepareLUTs,
  processPixelArray,
  sampleLUT3D,
  debugLogParams,
};
