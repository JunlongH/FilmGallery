/**
 * FilmLab 统一渲染核心
 * 
 * @module RenderCore
 * @description 统一的渲染核心，确保 CPU/WebGL/GPU Export 使用相同的处理逻辑
 * 
 * 设计目标：
 * - 单一参数规范化入口
 * - 统一的 Pipeline 描述
 * - 为 WebGL 着色器生成 Uniforms
 * - 为 CPU 路径提供 processPixel
 * 
 * 处理流水线顺序：
 * ① 胶片曲线 (Film Curve - H&D 密度模型)
 * ② 反转 (Inversion)
 * ③ 白平衡 (White Balance)
 * ④ 色调映射 (Tone Mapping via LUT)
 * ⑤ 曲线 (Curves)
 * ⑥ HSL 调整 (色相/饱和度/明度)
 * ⑦ 分离色调 (Split Toning)
 * ⑧ 3D LUT
 */

'use strict';

const { DEFAULT_CURVES, DEFAULT_WB_PARAMS } = require('../filmLabConstants');
const { buildToneLUT } = require('../filmLabToneLUT');
const { buildCurveLUT } = require('../filmLabCurves');
const { computeWBGains } = require('../filmLabWhiteBalance');
const { applyInversion, applyLogBaseCorrectionRGB, applyLinearBaseCorrectionRGB } = require('../filmLabInversion');
const { applyFilmCurve, FILM_CURVE_PROFILES } = require('../filmLabCurve');
const { applyHSL, DEFAULT_HSL_PARAMS, isDefaultHSL } = require('../filmLabHSL');
const { applySplitTone, DEFAULT_SPLIT_TONE_PARAMS, isDefaultSplitTone } = require('../filmLabSplitTone');

// ============================================================================
// 默认值常量
// ============================================================================

const DEFAULT_FILM_CURVE = {
  gamma: 0.6,
  dMin: 0.1,
  dMax: 3.0,
};

const DEFAULT_CROP_RECT = { x: 0, y: 0, w: 1, h: 1 };

// ============================================================================
// RenderCore 类
// ============================================================================

/**
 * 统一渲染核心
 * 
 * 用法示例：
 * ```javascript
 * const core = new RenderCore(params);
 * 
 * // CPU 路径
 * core.prepareLUTs();
 * for (...) {
 *   const [r, g, b] = core.processPixel(r, g, b);
 * }
 * 
 * // WebGL 路径
 * const uniforms = core.getGLSLUniforms();
 * gl.uniform3fv(locations.u_wbGains, uniforms.u_wbGains);
 * ```
 */
class RenderCore {
  /**
   * @param {Object} params - 原始参数对象（来自 UI 或数据库）
   */
  constructor(params = {}) {
    this.rawParams = params;
    this.params = this.normalizeParams(params);
    this.luts = null;
  }

  // ==========================================================================
  // 参数规范化
  // ==========================================================================

  /**
   * 规范化参数，填充默认值
   * 
   * @param {Object} input - 原始参数
   * @returns {Object} 规范化后的参数
   */
  normalizeParams(input) {
    return {
      // 反转
      inverted: input.inverted ?? false,
      inversionMode: input.inversionMode ?? 'linear',

      // Film Curve
      filmCurveEnabled: input.filmCurveEnabled ?? false,
      filmCurveProfile: input.filmCurveProfile ?? 'default',
      filmCurveGamma: input.filmCurveGamma ?? DEFAULT_FILM_CURVE.gamma,
      filmCurveDMin: input.filmCurveDMin ?? DEFAULT_FILM_CURVE.dMin,
      filmCurveDMax: input.filmCurveDMax ?? DEFAULT_FILM_CURVE.dMax,

      // 片基校正 (Pre-Inversion, 独立于场景白平衡)
      // 线性模式参数
      baseRed: input.baseRed ?? 1.0,
      baseGreen: input.baseGreen ?? 1.0,
      baseBlue: input.baseBlue ?? 1.0,
      // 对数域模式参数
      baseMode: input.baseMode ?? 'linear',  // 'linear' | 'log'
      baseDensityR: input.baseDensityR ?? 0.0,
      baseDensityG: input.baseDensityG ?? 0.0,
      baseDensityB: input.baseDensityB ?? 0.0,

      // 密度域色阶 (Density Levels) - Log 域 AutoLevels
      densityLevelsEnabled: input.densityLevelsEnabled ?? false,
      densityLevels: input.densityLevels ?? {
        red: { min: 0.0, max: 3.0 },
        green: { min: 0.0, max: 3.0 },
        blue: { min: 0.0, max: 3.0 }
      },

      // 白平衡
      red: input.red ?? DEFAULT_WB_PARAMS.red,
      green: input.green ?? DEFAULT_WB_PARAMS.green,
      blue: input.blue ?? DEFAULT_WB_PARAMS.blue,
      temp: input.temp ?? DEFAULT_WB_PARAMS.temp,
      tint: input.tint ?? DEFAULT_WB_PARAMS.tint,

      // 色调
      exposure: input.exposure ?? 0,
      contrast: input.contrast ?? 0,
      highlights: input.highlights ?? 0,
      shadows: input.shadows ?? 0,
      whites: input.whites ?? 0,
      blacks: input.blacks ?? 0,

      // 曲线
      curves: input.curves ?? DEFAULT_CURVES,

      // HSL
      hslParams: input.hslParams ?? DEFAULT_HSL_PARAMS,

      // 分离色调
      splitToning: input.splitToning ?? DEFAULT_SPLIT_TONE_PARAMS,

      // 3D LUT
      lut1: input.lut1 ?? null,
      lut1Intensity: input.lut1Intensity ?? 1.0,
      lut2: input.lut2 ?? null,
      lut2Intensity: input.lut2Intensity ?? 1.0,

      // 几何 (由调用者处理，这里仅记录)
      rotation: input.rotation ?? 0,
      orientation: input.orientation ?? 0,
      cropRect: input.cropRect ?? DEFAULT_CROP_RECT,
    };
  }

  // ==========================================================================
  // LUT 预计算 (CPU 路径)
  // ==========================================================================

  /**
   * 预计算所有查找表
   * 
   * @returns {Object} LUT 对象集合
   */
  prepareLUTs() {
    if (this.luts) return this.luts;

    const p = this.params;

    // 构建色调 LUT
    const toneLUT = buildToneLUT({
      exposure: p.exposure,
      contrast: p.contrast,
      highlights: p.highlights,
      shadows: p.shadows,
      whites: p.whites,
      blacks: p.blacks,
    });

    // 构建曲线 LUT
    const curves = p.curves;
    const lutRGB = buildCurveLUT(curves.rgb || DEFAULT_CURVES.rgb);
    const lutR = buildCurveLUT(curves.red || DEFAULT_CURVES.red);
    const lutG = buildCurveLUT(curves.green || DEFAULT_CURVES.green);
    const lutB = buildCurveLUT(curves.blue || DEFAULT_CURVES.blue);

    // 计算白平衡增益
    const [rBal, gBal, bBal] = computeWBGains({
      red: p.red,
      green: p.green,
      blue: p.blue,
      temp: p.temp,
      tint: p.tint,
    }, {
      useKelvinModel: true,
    });

    this.luts = {
      toneLUT,
      lutRGB,
      lutR,
      lutG,
      lutB,
      rBal,
      gBal,
      bBal,
      lut1: p.lut1,
      lut1Intensity: p.lut1Intensity,
      lut2: p.lut2,
      lut2Intensity: p.lut2Intensity,
    };

    return this.luts;
  }

  // ==========================================================================
  // CPU 像素处理
  // ==========================================================================

  /**
   * 处理单个像素 (CPU 路径)
   * 
   * @param {number} r - 红色 (0-255)
   * @param {number} g - 绿色 (0-255)
   * @param {number} b - 蓝色 (0-255)
   * @returns {[number, number, number]} 处理后的 RGB
   */
  processPixel(r, g, b) {
    const p = this.params;
    const luts = this.luts || this.prepareLUTs();

    // ① 胶片曲线 (Film Curve)
    if (p.inverted && p.filmCurveEnabled && p.filmCurveProfile) {
      const profile = FILM_CURVE_PROFILES[p.filmCurveProfile];
      if (profile) {
        const curveParams = {
          gamma: p.filmCurveGamma ?? profile.gamma,
          dMin: p.filmCurveDMin ?? profile.dMin,
          dMax: p.filmCurveDMax ?? profile.dMax,
        };
        r = applyFilmCurve(r, curveParams);
        g = applyFilmCurve(g, curveParams);
        b = applyFilmCurve(b, curveParams);
      }
    }

    // ② 片基校正 (Base Correction)
    // 将负片片基颜色中和为白色
    // 支持两种模式：线性域乘法 (linear) 或 对数域减法 (log)
    if (p.baseMode === 'log') {
      // 对数域减法：在密度域进行校正，更精确
      if (p.baseDensityR !== 0 || p.baseDensityG !== 0 || p.baseDensityB !== 0) {
        [r, g, b] = applyLogBaseCorrectionRGB(r, g, b, p.baseDensityR, p.baseDensityG, p.baseDensityB);
      }
    } else {
      // 线性域乘法：传统方式，兼容旧预设
      if (p.baseRed !== 1.0 || p.baseGreen !== 1.0 || p.baseBlue !== 1.0) {
        [r, g, b] = applyLinearBaseCorrectionRGB(r, g, b, p.baseRed, p.baseGreen, p.baseBlue);
      }
    }

    // ②.5 密度域色阶 (Density Levels)
    // 在密度域进行自动色阶，独立于后处理 AutoLevels
    if (p.densityLevelsEnabled && p.baseMode === 'log') {
      [r, g, b] = this._applyDensityLevels(r, g, b);
    }

    // ③ 反转 (Inversion)
    if (p.inverted) {
      r = applyInversion(r, p);
      g = applyInversion(g, p);
      b = applyInversion(b, p);
    }

    // ③ 3D LUT (Moved to Step 3 to support Inversion LUTs acting on base image)
    if (luts.lut1) {
      [r, g, b] = this._sampleLUT3D(r, g, b, luts.lut1, luts.lut1Intensity);
    }
    if (luts.lut2) {
      [r, g, b] = this._sampleLUT3D(r, g, b, luts.lut2, luts.lut2Intensity);
    }

    // ④ 白平衡 (White Balance)
    r *= luts.rBal;
    g *= luts.gBal;
    b *= luts.bBal;

    // 钳制
    r = this._clamp255(r);
    g = this._clamp255(g);
    b = this._clamp255(b);

    // NaN 保护
    if (!Number.isFinite(r)) r = 0;
    if (!Number.isFinite(g)) g = 0;
    if (!Number.isFinite(b)) b = 0;

    // ④ 色调映射 (Tone LUT)
    r = luts.toneLUT[Math.floor(r)];
    g = luts.toneLUT[Math.floor(g)];
    b = luts.toneLUT[Math.floor(b)];

    // ⑤ 曲线 (Curves)
    r = luts.lutRGB[r];
    g = luts.lutRGB[g];
    b = luts.lutRGB[b];
    r = luts.lutR[r];
    g = luts.lutG[g];
    b = luts.lutB[b];

    // ⑥ HSL 调整
    if (p.hslParams && !isDefaultHSL(p.hslParams)) {
      [r, g, b] = applyHSL(r, g, b, p.hslParams);
    }

    // ⑦ 分离色调
    if (p.splitToning && !isDefaultSplitTone(p.splitToning)) {
      [r, g, b] = applySplitTone(r, g, b, p.splitToning);
    }

    return [
      this._clamp255(Math.round(r)),
      this._clamp255(Math.round(g)),
      this._clamp255(Math.round(b)),
    ];
  }

  // ==========================================================================
  // WebGL Uniforms 生成
  // ==========================================================================

  /**
   * 生成 GLSL 着色器所需的 uniform 值
   * 
   * @returns {Object} uniform 名称到值的映射
   */
  getGLSLUniforms() {
    const p = this.params;
    const luts = this.luts || this.prepareLUTs();

    // 计算白平衡增益 (归一化到 0-1 范围)
    const wbGains = [luts.rBal, luts.gBal, luts.bBal];

    return {
      // 反转
      u_inverted: p.inverted ? 1.0 : 0.0,
      u_inversionMode: p.inversionMode === 'log' ? 1.0 : 0.0,

      // Film Curve
      u_filmCurveEnabled: p.filmCurveEnabled ? 1.0 : 0.0,
      u_filmCurveGamma: p.filmCurveGamma,
      u_filmCurveDMin: p.filmCurveDMin,
      u_filmCurveDMax: p.filmCurveDMax,

      // 片基校正 (Pre-Inversion)
      u_baseMode: p.baseMode === 'log' ? 1.0 : 0.0,
      u_baseGains: [p.baseRed, p.baseGreen, p.baseBlue],  // 线性模式
      u_baseDensity: [p.baseDensityR, p.baseDensityG, p.baseDensityB],  // 对数模式

      // 密度域色阶 (Density Levels)
      u_densityLevelsEnabled: (p.densityLevelsEnabled && p.baseMode === 'log') ? 1.0 : 0.0,
      u_densityLevelsMin: [
        p.densityLevels?.red?.min ?? 0.0,
        p.densityLevels?.green?.min ?? 0.0,
        p.densityLevels?.blue?.min ?? 0.0
      ],
      u_densityLevelsMax: [
        p.densityLevels?.red?.max ?? 3.0,
        p.densityLevels?.green?.max ?? 3.0,
        p.densityLevels?.blue?.max ?? 3.0
      ],

      // 白平衡
      u_wbGains: wbGains,

      // 色调 (注意：WebGL 中 exposure 需要除以 50)
      u_exposure: p.exposure / 50.0,
      u_contrast: p.contrast / 100.0,
      u_highlights: p.highlights,
      u_shadows: p.shadows,
      u_whites: p.whites,
      u_blacks: p.blacks,

      // 曲线 (作为 1D 纹理上传，需要调用者处理)
      u_curvesEnabled: this._hasCurves(p.curves) ? 1.0 : 0.0,
      curveLUTs: {
        rgb: luts.lutRGB,
        red: luts.lutR,
        green: luts.lutG,
        blue: luts.lutB,
      },

      // HSL 参数 (作为数组上传)
      u_hslEnabled: !isDefaultHSL(p.hslParams) ? 1.0 : 0.0,
      u_hslParams: this._packHSLParams(p.hslParams),

      // 分离色调
      u_splitToneEnabled: !isDefaultSplitTone(p.splitToning) ? 1.0 : 0.0,
      u_highlightHue: (p.splitToning?.highlights?.hue ?? 30) / 360.0,
      u_highlightSat: (p.splitToning?.highlights?.saturation ?? 0) / 100.0,
      u_shadowHue: (p.splitToning?.shadows?.hue ?? 220) / 360.0,
      u_shadowSat: (p.splitToning?.shadows?.saturation ?? 0) / 100.0,
      u_splitBalance: (p.splitToning?.balance ?? 0) / 100.0,

      // 3D LUT (需要调用者上传纹理)
      u_hasLut3d: p.lut1 ? 1.0 : 0.0,
      u_lut3dIntensity: p.lut1Intensity,
    };
  }

  /**
   * 获取 HSL GLSL 代码片段
   * 
   * @returns {string} HSL 处理的 GLSL 代码
   */
  static getHSLGLSL() {
    return `
// HSL Channel definitions (hueCenter, hueRange)
const vec2 HSL_RED     = vec2(0.0,   30.0);
const vec2 HSL_ORANGE  = vec2(30.0,  30.0);
const vec2 HSL_YELLOW  = vec2(60.0,  30.0);
const vec2 HSL_GREEN   = vec2(120.0, 45.0);
const vec2 HSL_CYAN    = vec2(180.0, 30.0);
const vec2 HSL_BLUE    = vec2(240.0, 45.0);
const vec2 HSL_PURPLE  = vec2(280.0, 30.0);
const vec2 HSL_MAGENTA = vec2(320.0, 30.0);

// RGB to HSL conversion
vec3 rgb2hsl(vec3 c) {
  float maxC = max(max(c.r, c.g), c.b);
  float minC = min(min(c.r, c.g), c.b);
  float l = (maxC + minC) / 2.0;
  
  if (maxC == minC) {
    return vec3(0.0, 0.0, l);
  }
  
  float d = maxC - minC;
  float s = l > 0.5 ? d / (2.0 - maxC - minC) : d / (maxC + minC);
  
  float h;
  if (maxC == c.r) {
    h = (c.g - c.b) / d + (c.g < c.b ? 6.0 : 0.0);
  } else if (maxC == c.g) {
    h = (c.b - c.r) / d + 2.0;
  } else {
    h = (c.r - c.g) / d + 4.0;
  }
  h /= 6.0;
  
  return vec3(h * 360.0, s, l);
}

// HSL to RGB conversion
vec3 hsl2rgb(vec3 hsl) {
  float h = mod(hsl.x, 360.0) / 360.0;
  float s = clamp(hsl.y, 0.0, 1.0);
  float l = clamp(hsl.z, 0.0, 1.0);
  
  if (s == 0.0) {
    return vec3(l);
  }
  
  float q = l < 0.5 ? l * (1.0 + s) : l + s - l * s;
  float p = 2.0 * l - q;
  
  float hk = h;
  vec3 t = vec3(hk + 1.0/3.0, hk, hk - 1.0/3.0);
  t = fract(t + 1.0);
  
  vec3 c;
  for (int i = 0; i < 3; i++) {
    float ti = t[i];
    if (ti < 1.0/6.0) {
      c[i] = p + (q - p) * 6.0 * ti;
    } else if (ti < 0.5) {
      c[i] = q;
    } else if (ti < 2.0/3.0) {
      c[i] = p + (q - p) * (2.0/3.0 - ti) * 6.0;
    } else {
      c[i] = p;
    }
  }
  
  return c;
}

// Calculate HSL weight for a channel
float hslChannelWeight(float hue, vec2 channel) {
  float center = channel.x;
  float range = channel.y;
  
  float dist = min(abs(hue - center), min(abs(hue - center + 360.0), abs(hue - center - 360.0)));
  
  if (dist > range) return 0.0;
  
  // Cosine smooth transition
  return 0.5 * (1.0 + cos(3.14159265 * dist / range));
}

// Apply HSL adjustment
// hslParams: array of 8 vec3 (hueShift, saturation, luminance) for each channel
vec3 applyHSL(vec3 color, vec3 hslParams[8]) {
  vec3 hsl = rgb2hsl(color);
  float h = hsl.x;
  float s = hsl.y;
  float l = hsl.z;
  
  float totalHueShift = 0.0;
  float totalSatMult = 1.0;
  float totalLumShift = 0.0;
  float totalWeight = 0.0;
  
  vec2 channels[8];
  channels[0] = HSL_RED;
  channels[1] = HSL_ORANGE;
  channels[2] = HSL_YELLOW;
  channels[3] = HSL_GREEN;
  channels[4] = HSL_CYAN;
  channels[5] = HSL_BLUE;
  channels[6] = HSL_PURPLE;
  channels[7] = HSL_MAGENTA;
  
  for (int i = 0; i < 8; i++) {
    float w = hslChannelWeight(h, channels[i]);
    if (w > 0.0) {
      totalHueShift += hslParams[i].x * w;
      totalSatMult *= 1.0 + (hslParams[i].y / 100.0) * w;
      totalLumShift += (hslParams[i].z / 100.0) * 0.5 * w;
      totalWeight += w;
    }
  }
  
  if (totalWeight > 0.0) {
    h = mod(h + totalHueShift, 360.0);
    s = clamp(s * totalSatMult, 0.0, 1.0);
    l = clamp(l + totalLumShift, 0.0, 1.0);
  }
  
  return hsl2rgb(vec3(h, s, l));
}
`;
  }

  /**
   * 获取分离色调 GLSL 代码片段
   * 
   * @returns {string} Split Toning 处理的 GLSL 代码
   */
  static getSplitToneGLSL() {
    return `
// Calculate luminance (Rec. 709)
float calcLuminance(vec3 c) {
  return 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;
}

// Apply split toning
// highlightHue, highlightSat, shadowHue, shadowSat in [0,1] range
// balance in [-1, 1] range
vec3 applySplitTone(vec3 color, float highlightHue, float highlightSat, 
                     float shadowHue, float shadowSat, float balance) {
  float lum = calcLuminance(color);
  
  // Calculate shadow and highlight weights with balance
  float shadowEnd = 0.25 + balance * 0.15;
  float highlightStart = 0.75 + balance * 0.15;
  
  float shadowWeight = smoothstep(shadowEnd + 0.1, shadowEnd - 0.1, lum);
  float highlightWeight = smoothstep(highlightStart - 0.1, highlightStart + 0.1, lum);
  
  // Convert hue to RGB tint
  vec3 highlightTint = hsl2rgb(vec3(highlightHue * 360.0, 1.0, 0.5));
  vec3 shadowTint = hsl2rgb(vec3(shadowHue * 360.0, 1.0, 0.5));
  
  // Apply tints
  vec3 result = color;
  
  if (shadowWeight > 0.0 && shadowSat > 0.0) {
    result = mix(result, result * shadowTint / 0.5, shadowWeight * shadowSat);
  }
  
  if (highlightWeight > 0.0 && highlightSat > 0.0) {
    result = mix(result, result * highlightTint / 0.5, highlightWeight * highlightSat);
  }
  
  return clamp(result, 0.0, 1.0);
}
`;
  }

  // ==========================================================================
  // Pipeline 描述
  // ==========================================================================

  /**
   * 获取 Pipeline 描述 (用于调试和 UI 显示)
   * 
   * @returns {Object} Pipeline 描述
   */
  getPipelineDescription() {
    const p = this.params;
    const steps = [];

    if (p.inverted && p.filmCurveEnabled) {
      steps.push({ name: 'Film Curve (H&D)', active: true, profile: p.filmCurveProfile });
    }
    if (p.inverted) {
      steps.push({ name: 'Inversion', active: true, mode: p.inversionMode });
    }
    steps.push({ name: 'White Balance', active: true, gains: [p.red, p.green, p.blue] });
    steps.push({ name: 'Tone Mapping', active: true });
    if (this._hasCurves(p.curves)) {
      steps.push({ name: 'Curves', active: true });
    }
    if (!isDefaultHSL(p.hslParams)) {
      steps.push({ name: 'HSL Adjustment', active: true });
    }
    if (!isDefaultSplitTone(p.splitToning)) {
      steps.push({ name: 'Split Toning', active: true });
    }
    if (p.lut1) {
      steps.push({ name: '3D LUT', active: true });
    }

    return {
      steps,
      params: this.params,
      version: '2.0.0',
    };
  }

  // ==========================================================================
  // 私有辅助方法
  // ==========================================================================

  _clamp255(v) {
    return Math.max(0, Math.min(255, v));
  }

  /**
   * 应用密度域色阶校正
   * 在密度域进行线性拉伸，将实际密度范围映射到标准输出范围
   * 
   * @param {number} r - 红色 (0-255)
   * @param {number} g - 绿色 (0-255)
   * @param {number} b - 蓝色 (0-255)
   * @returns {[number, number, number]} 处理后的 RGB
   */
  _applyDensityLevels(r, g, b) {
    const levels = this.params.densityLevels;
    if (!levels) return [r, g, b];

    const minT = 0.001;
    const log10 = Math.log(10);
    const targetRange = 2.2; // 输出密度范围，匹配 8 位动态范围 (~2.4)

    // 处理每个通道
    // 将检测到的 [Dmin, Dmax] 映射到标准输出范围 [0, targetRange]
    const processChannel = (value, channelLevels) => {
      // 转换到透射率 (0-1)
      const T = Math.max(value / 255, minT);
      
      // 转换到密度域
      const D = -Math.log(T) / log10;
      
      // 计算输入范围
      const range = channelLevels.max - channelLevels.min;
      if (range <= 0.001) return value; // 避免除零
      
      // 归一化到 [0, 1]，然后映射到目标范围 [0, targetRange]
      const normalized = Math.max(0, Math.min(1, (D - channelLevels.min) / range));
      const Dnew = normalized * targetRange;
      
      // 转回透射率
      const Tnew = Math.pow(10, -Dnew);
      
      // 转回 0-255
      return Math.max(0, Math.min(255, Tnew * 255));
    };

    return [
      processChannel(r, levels.red),
      processChannel(g, levels.green),
      processChannel(b, levels.blue)
    ];
  }

  _hasCurves(curves) {
    if (!curves) return false;
    // 检查是否有非默认曲线
    const isDefault = (pts) => {
      if (!pts || pts.length !== 2) return false;
      return pts[0]?.x === 0 && pts[0]?.y === 0 && pts[1]?.x === 1 && pts[1]?.y === 1;
    };
    return !isDefault(curves.rgb) || !isDefault(curves.red) || 
           !isDefault(curves.green) || !isDefault(curves.blue);
  }

  _packHSLParams(hslParams) {
    // 打包 HSL 参数为 8x3 数组 (用于 GLSL uniform)
    const channels = ['red', 'orange', 'yellow', 'green', 'cyan', 'blue', 'purple', 'magenta'];
    const result = [];
    
    for (const ch of channels) {
      const data = hslParams?.[ch] || { hue: 0, saturation: 0, luminance: 0 };
      result.push([
        data.hue ?? 0,
        data.saturation ?? 0,
        data.luminance ?? 0,
      ]);
    }
    
    return result;
  }

  _sampleLUT3D(r, g, b, lut, intensity = 1) {
    if (!lut || !lut.data || !lut.size) {
      return [r, g, b];
    }

    const { size, data } = lut;
    const maxIndex = size - 1;

    const rNorm = this._clamp255(r) / 255;
    const gNorm = this._clamp255(g) / 255;
    const bNorm = this._clamp255(b) / 255;

    const rPos = rNorm * maxIndex;
    const gPos = gNorm * maxIndex;
    const bPos = bNorm * maxIndex;

    const r0 = Math.floor(rPos);
    const r1 = Math.min(maxIndex, r0 + 1);
    const g0 = Math.floor(gPos);
    const g1 = Math.min(maxIndex, g0 + 1);
    const b0 = Math.floor(bPos);
    const b1 = Math.min(maxIndex, b0 + 1);

    const fr = rPos - r0;
    const fg = gPos - g0;
    const fb = bPos - b0;

    const getIdx = (ri, gi, bi) => (ri + gi * size + bi * size * size) * 3;

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

    const rOut = interp(0) * 255;
    const gOut = interp(1) * 255;
    const bOut = interp(2) * 255;

    if (intensity >= 1) {
      return [rOut, gOut, bOut];
    }

    return [
      r + (rOut - r) * intensity,
      g + (gOut - g) * intensity,
      b + (bOut - b) * intensity,
    ];
  }
}

// ============================================================================
// 模块导出
// ============================================================================

module.exports = {
  RenderCore,
  DEFAULT_FILM_CURVE,
  DEFAULT_CROP_RECT,
};
