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

const { DEFAULT_CURVES, DEFAULT_WB_PARAMS, CONTRAST_MID_GRAY } = require('../filmLabConstants');
const { buildToneLUT } = require('../filmLabToneLUT');
const { buildCurveLUT, buildCurveLUTFloat } = require('../filmLabCurves');
const { computeWBGains } = require('../filmLabWhiteBalance');
const { applyInversion, applyLogBaseCorrectionRGB, applyLinearBaseCorrectionRGB } = require('../filmLabInversion');
const { applyFilmCurve, applyFilmCurveFloat, FILM_CURVE_PROFILES } = require('../filmLabCurve');
const { applyHSL, DEFAULT_HSL_PARAMS, isDefaultHSL } = require('../filmLabHSL');
const { applySplitTone, DEFAULT_SPLIT_TONE_PARAMS, isDefaultSplitTone, prepareSplitTone, applySplitToneFast } = require('../filmLabSplitTone');
const MathOps = require('./math');

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
      filmCurveGammaR: input.filmCurveGammaR ?? undefined, // Q13: per-channel, falls back to profile
      filmCurveGammaG: input.filmCurveGammaG ?? undefined,
      filmCurveGammaB: input.filmCurveGammaB ?? undefined,
      filmCurveDMin: input.filmCurveDMin ?? DEFAULT_FILM_CURVE.dMin,
      filmCurveDMax: input.filmCurveDMax ?? DEFAULT_FILM_CURVE.dMax,
      filmCurveToe: input.filmCurveToe ?? undefined,       // Q13: 3-segment toe
      filmCurveShoulder: input.filmCurveShoulder ?? undefined, // Q13: 3-segment shoulder

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

    // 构建曲线 LUT (8-bit for processPixel)
    const curves = p.curves;
    const lutRGB = buildCurveLUT(curves.rgb || DEFAULT_CURVES.rgb);
    const lutR = buildCurveLUT(curves.red || DEFAULT_CURVES.red);
    const lutG = buildCurveLUT(curves.green || DEFAULT_CURVES.green);
    const lutB = buildCurveLUT(curves.blue || DEFAULT_CURVES.blue);

    // 构建 Float32 曲线 LUT (for processPixelFloat - higher precision)
    const lutRGBf = buildCurveLUTFloat(curves.rgb || DEFAULT_CURVES.rgb);
    const lutRf = buildCurveLUTFloat(curves.red || DEFAULT_CURVES.red);
    const lutGf = buildCurveLUTFloat(curves.green || DEFAULT_CURVES.green);
    const lutBf = buildCurveLUTFloat(curves.blue || DEFAULT_CURVES.blue);

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
      lutRGBf,
      lutRf,
      lutGf,
      lutBf,
      rBal,
      gBal,
      bBal,
      lut1: p.lut1,
      lut1Intensity: p.lut1Intensity,
      lut2: p.lut2,
      lut2Intensity: p.lut2Intensity,
      // Q18: Precompute split tone tint colors once per frame
      splitToneCtx: prepareSplitTone(p.splitToning),
    };

    return this.luts;
  }

  // ==========================================================================
  // Float Processing (HDR / High Precision)
  // ==========================================================================

  /**
   * Process a single pixel using floating point math throughout.
   * This method mirrors the full processPixel() pipeline but operates in
   * float precision (0.0 – 1.0+) to preserve dynamic range and avoid
   * 8-bit quantization artifacts.
   *
   * Input: linear-light RGB (0.0 – 1.0+, may exceed 1.0 for HDR/16-bit).
   * Output: sRGB gamma-encoded RGB (0.0 – 1.0).
   *
   * Pipeline order (mirrors processPixel and GPU shader):
   *  ① Film Curve (H&D density model)
   *  ② Base Correction (linear or log)
   *  ②.5 Density Levels
   *  ③ Inversion
   *  ③b 3D LUT
   *  ④ White Balance
   *  ⑤ Tone Mapping (exposure, contrast, blacks/whites, shadows/highlights)
   *  ⑤b Highlight Roll-Off (shoulder compression)
   *  ⑥ Curves (RGB master + per-channel)
   *  ⑦ HSL Adjustment
   *  ⑧ Split Toning
   *
   * @param {number} r - Red   (Linear 0.0 – 1.0+)
   * @param {number} g - Green (Linear 0.0 – 1.0+)
   * @param {number} b - Blue  (Linear 0.0 – 1.0+)
   * @returns {Array<number>} [r, g, b] sRGB 0.0 – 1.0
   */
  processPixelFloat(r, g, b) {
    const p = this.params;
    const luts = this.luts || this.prepareLUTs();

    // ① Film Curve (H&D density model) — Q13: per-channel gamma + toe/shoulder
    // Only when inverting negatives and film curve is enabled
    if (p.inverted && p.filmCurveEnabled && p.filmCurveProfile) {
      const profile = FILM_CURVE_PROFILES[p.filmCurveProfile];
      if (profile) {
        const gammaMain = p.filmCurveGamma ?? profile.gamma;
        const dMin  = p.filmCurveDMin  ?? profile.dMin;
        const dMax  = p.filmCurveDMax  ?? profile.dMax;
        // Q13: prefer explicit params (from client), then profile, then defaults
        const toe   = p.filmCurveToe ?? profile.toe ?? 0;
        const shoulder = p.filmCurveShoulder ?? profile.shoulder ?? 0;

        // Per-channel gamma: prefer explicit params, then profile, then main gamma
        const gammaR = p.filmCurveGammaR ?? profile.gammaR ?? gammaMain;
        const gammaG = p.filmCurveGammaG ?? profile.gammaG ?? gammaMain;
        const gammaB = p.filmCurveGammaB ?? profile.gammaB ?? gammaMain;

        r = applyFilmCurveFloat(r, { gamma: gammaR, dMin, dMax, toe, shoulder });
        g = applyFilmCurveFloat(g, { gamma: gammaG, dMin, dMax, toe, shoulder });
        b = applyFilmCurveFloat(b, { gamma: gammaB, dMin, dMax, toe, shoulder });
      }
    }

    // ② Base Correction (neutralize film base color)
    if (p.baseMode === 'log') {
      // Log domain density subtraction (more accurate)
      if (p.baseDensityR !== 0 || p.baseDensityG !== 0 || p.baseDensityB !== 0) {
        const log10 = Math.log(10);
        const minT = 0.001;
        const Tr = Math.max(r, minT);
        const Tg = Math.max(g, minT);
        const Tb = Math.max(b, minT);
        r = Math.pow(10, -(-Math.log(Tr) / log10 - p.baseDensityR));
        g = Math.pow(10, -(-Math.log(Tg) / log10 - p.baseDensityG));
        b = Math.pow(10, -(-Math.log(Tb) / log10 - p.baseDensityB));
        r = Math.max(0, Math.min(1, r));
        g = Math.max(0, Math.min(1, g));
        b = Math.max(0, Math.min(1, b));
      }
    } else {
      // Linear domain multiplication
      if (p.baseRed !== 1.0 || p.baseGreen !== 1.0 || p.baseBlue !== 1.0) {
        r = Math.max(0, Math.min(1, r * p.baseRed));
        g = Math.max(0, Math.min(1, g * p.baseGreen));
        b = Math.max(0, Math.min(1, b * p.baseBlue));
      }
    }

    // ②.5 Density Levels (log domain auto-levels)
    if (p.densityLevelsEnabled && p.baseMode === 'log') {
      [r, g, b] = this._applyDensityLevelsFloat(r, g, b);
    }

    // ③ Inversion — inline float version
    if (p.inverted) {
      if (p.inversionMode === 'log') {
        // Log inversion: out = 1 - log(in*255 + 1) / log(256)
        // Adapted from invertLog() for 0-1 float range
        const log256 = Math.log(256);
        r = 1.0 - Math.log(r * 255 + 1) / log256;
        g = 1.0 - Math.log(g * 255 + 1) / log256;
        b = 1.0 - Math.log(b * 255 + 1) / log256;
      } else {
        // Linear inversion
        r = 1.0 - r;
        g = 1.0 - g;
        b = 1.0 - b;
      }
    }

    // ③b 3D LUT (after inversion — supports "Inversion LUT" workflows)
    if (luts.lut1) {
      [r, g, b] = this._sampleLUT3DFloat(r, g, b, luts.lut1, luts.lut1Intensity);
    }
    if (luts.lut2) {
      [r, g, b] = this._sampleLUT3DFloat(r, g, b, luts.lut2, luts.lut2Intensity);
    }

    // ④ White Balance — single call with cached gains
    r *= luts.rBal;
    g *= luts.gBal;
    b *= luts.bBal;

    // NaN guard
    if (!Number.isFinite(r)) r = 0;
    if (!Number.isFinite(g)) g = 0;
    if (!Number.isFinite(b)) b = 0;

    // ⑤ Tone Mapping — inline float math (replaces 8-bit toneLUT lookup)
    // This matches the exact same formulas in buildToneLUT() / GPU shader,
    // but without 8-bit quantization.

    // 5a. Exposure (f-stop formula: 2^(exposure/50))
    const expFactor = Math.pow(2, (Number(p.exposure) || 0) / 50);
    r *= expFactor;
    g *= expFactor;
    b *= expFactor;

    // 5b. Contrast (around perceptual mid-grey — Q11: 18% reflectance ≈ sRGB 0.46)
    const ctr = Number(p.contrast) || 0;
    if (ctr !== 0) {
      const contrastFactor = (259 * (ctr + 255)) / (255 * (259 - ctr));
      r = (r - CONTRAST_MID_GRAY) * contrastFactor + CONTRAST_MID_GRAY;
      g = (g - CONTRAST_MID_GRAY) * contrastFactor + CONTRAST_MID_GRAY;
      b = (b - CONTRAST_MID_GRAY) * contrastFactor + CONTRAST_MID_GRAY;
    }

    // 5c. Blacks & Whites (window remap)
    const blackPoint = -(Number(p.blacks) || 0) * 0.002;
    const whitePoint = 1.0 - (Number(p.whites) || 0) * 0.002;
    if (blackPoint !== 0 || whitePoint !== 1) {
      const range = whitePoint - blackPoint;
      if (range > 0.001) {
        r = (r - blackPoint) / range;
        g = (g - blackPoint) / range;
        b = (b - blackPoint) / range;
      }
    }

    // 5d. Shadows (Bernstein basis, peak ~0.33)
    const sFactor = (Number(p.shadows) || 0) * 0.005;
    if (sFactor !== 0) {
      const applyS = (v) => {
        const c = Math.max(0, Math.min(1, v));
        return v + sFactor * (1 - c) * (1 - c) * c * 4;
      };
      r = applyS(r);
      g = applyS(g);
      b = applyS(b);
    }

    // 5e. Highlights (Bernstein basis, peak ~0.67)
    const hFactor = (Number(p.highlights) || 0) * 0.005;
    if (hFactor !== 0) {
      const applyH = (v) => {
        const c = Math.max(0, Math.min(1, v));
        return v + hFactor * c * c * (1 - c) * 4;
      };
      r = applyH(r);
      g = applyH(g);
      b = applyH(b);
    }

    // ⑤b Highlight Roll-Off (Shoulder Compression)
    // Softly compress values > 0.8 into [0.8, 1.0] preserving color ratios
    const maxVal = Math.max(r, Math.max(g, b));
    const threshold = 0.8;
    if (maxVal > threshold) {
      const compressed = MathOps.highlightRollOff(maxVal, threshold);
      const scale = compressed / maxVal;
      r *= scale;
      g *= scale;
      b *= scale;
    }

    // Clamp to [0, 1] before perceptual-domain operations
    r = Math.max(0, Math.min(1, r));
    g = Math.max(0, Math.min(1, g));
    b = Math.max(0, Math.min(1, b));

    // ⑥ Curves — sample Float32 1024-entry LUTs with linear interpolation
    // This gives true float-precision output from the natural cubic spline data
    if (luts.lutRGBf) {
      r = this._sampleCurveLUTFloatHQ(r, luts.lutRGBf);
      g = this._sampleCurveLUTFloatHQ(g, luts.lutRGBf);
      b = this._sampleCurveLUTFloatHQ(b, luts.lutRGBf);
    }
    if (luts.lutRf) r = this._sampleCurveLUTFloatHQ(r, luts.lutRf);
    if (luts.lutGf) g = this._sampleCurveLUTFloatHQ(g, luts.lutGf);
    if (luts.lutBf) b = this._sampleCurveLUTFloatHQ(b, luts.lutBf);

    // ⑦ HSL Adjustment (perceptual domain — scale to 0-255 for existing code)
    if (p.hslParams && !isDefaultHSL(p.hslParams)) {
      const [hr, hg, hb] = applyHSL(r * 255, g * 255, b * 255, p.hslParams);
      r = hr / 255;
      g = hg / 255;
      b = hb / 255;
    }

    // ⑧ Split Toning (perceptual domain — Q18: use precomputed tint colors)
    if (luts.splitToneCtx) {
      const [sr, sg, sb] = applySplitToneFast(r * 255, g * 255, b * 255, luts.splitToneCtx);
      r = sr / 255;
      g = sg / 255;
      b = sb / 255;
    }

    // Final clamp to [0, 1]
    return [
      Math.max(0, Math.min(1, r)),
      Math.max(0, Math.min(1, g)),
      Math.max(0, Math.min(1, b)),
    ];
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

    // ④b Highlight Roll-Off (Shoulder Compression)
    // Matches processPixelFloat step ⑤b — compress overbrights into [0.8, 1.0]
    const maxV = Math.max(r, Math.max(g, b));
    if (maxV > 204) { // 204 ≈ 0.8 * 255
      const nR = r / 255, nG = g / 255, nB = b / 255;
      const nMax = maxV / 255;
      const compressed = MathOps.highlightRollOff(nMax, 0.8);
      const scale = compressed / nMax;
      r = this._clamp255(Math.round(nR * scale * 255));
      g = this._clamp255(Math.round(nG * scale * 255));
      b = this._clamp255(Math.round(nB * scale * 255));
    }

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

    // ⑦ 分离色调 (Q18: use precomputed tint colors)
    if (luts.splitToneCtx) {
      [r, g, b] = applySplitToneFast(r, g, b, luts.splitToneCtx);
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

      // 色调
      // u_exposure: 已预除以 50, 即 pow(2, u_exposure) 即为曝光增益。
      //   注意: electron-gpu/gpu-renderer.js 直接使用 params.exposure 原始值
      //   并在 shader 内部做 pow(2, u_exposure / 50.0)，两种用法等价。
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
const vec2 HSL_MAGENTA = vec2(330.0, 30.0);

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
  float satAdjust = 0.0;
  float lumAdjust = 0.0;
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
      satAdjust += (hslParams[i].y / 100.0) * w;
      lumAdjust += (hslParams[i].z / 100.0) * w;
      totalWeight += w;
    }
  }
  
  if (totalWeight > 1.0) {
    totalHueShift /= totalWeight;
    satAdjust /= totalWeight;
    lumAdjust /= totalWeight;
  }
  
  if (totalWeight > 0.0) {
    h = mod(h + totalHueShift, 360.0);
    
    // Saturation: asymmetric mapping (matching CPU filmLabHSL.js)
    if (satAdjust > 0.0) {
      s = s + (1.0 - s) * satAdjust;
    } else if (satAdjust < 0.0) {
      s = s * (1.0 + satAdjust);
    }
    s = clamp(s, 0.0, 1.0);
    
    // Luminance: asymmetric mapping with 0.5 damping (matching CPU filmLabHSL.js)
    if (lumAdjust > 0.0) {
      l = l + (1.0 - l) * lumAdjust * 0.5;
    } else if (lumAdjust < 0.0) {
      l = l * (1.0 + lumAdjust * 0.5);
    }
    l = clamp(l, 0.0, 1.0);
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
// Calculate luminance (Rec. 709, matching CPU filmLabSplitTone.js)
float calcLuminance(vec3 c) {
  return 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;
}

// Smoothstep helper (matching CPU Hermite smoothstep)
float splitToneSmoothstep(float t) {
  t = clamp(t, 0.0, 1.0);
  return t * t * (3.0 - 2.0 * t);
}

// Apply split toning — lerp-to-tint blend (matching CPU filmLabSplitTone.js)
vec3 applySplitTone(vec3 color, float highlightHue, float highlightSat, 
                     float shadowHue, float shadowSat, float balance) {
  float lum = calcLuminance(color);
  
  // Zone weights (matching CPU calculateZoneWeights)
  float balanceOffset = balance / 2.0;
  float midpoint = 0.5 + balanceOffset;
  float shadowEnd = 0.25;
  float highlightStart = 0.75;
  
  float shadowWeight = 0.0;
  float midtoneWeight = 0.0;
  float highlightWeight = 0.0;
  
  if (lum < shadowEnd) {
    shadowWeight = 1.0;
  } else if (lum < midpoint) {
    float d = max(midpoint - shadowEnd, 0.001);
    float st = splitToneSmoothstep(clamp((lum - shadowEnd) / d, 0.0, 1.0));
    shadowWeight = 1.0 - st;
    midtoneWeight = st;
  }
  if (lum > highlightStart) {
    highlightWeight = 1.0;
  } else if (lum > midpoint) {
    float d = max(highlightStart - midpoint, 0.001);
    float st = splitToneSmoothstep(clamp((lum - midpoint) / d, 0.0, 1.0));
    highlightWeight = st;
    midtoneWeight = max(midtoneWeight, 1.0 - st);
  }
  
  vec3 highlightTint = hsl2rgb(vec3(highlightHue * 360.0, 1.0, 0.5));
  vec3 shadowTint = hsl2rgb(vec3(shadowHue * 360.0, 1.0, 0.5));
  
  // Lerp-to-tint blend (matching CPU: result + (tint - result) * strength * 0.3)
  vec3 result = color;
  if (shadowWeight > 0.0 && shadowSat > 0.0) {
    float strength = shadowSat * shadowWeight;
    result += (shadowTint - result) * strength * 0.3;
  }
  if (highlightWeight > 0.0 && highlightSat > 0.0) {
    float strength = highlightSat * highlightWeight;
    result += (highlightTint - result) * strength * 0.3;
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

  // ==========================================================================
  // Float Pipeline Helper Methods
  // ==========================================================================

  /**
   * Film curve (H&D density model) — float version
   * Operates on 0.0–1.0 transmittance values without 8-bit quantization.
   *
   * @param {number} val - Transmittance (0.0–1.0)
   * @param {number} gamma - Curve gamma
   * @param {number} dMin  - Minimum density
   * @param {number} dMax  - Maximum density
   * @returns {number} Adjusted transmittance (0.0–1.0)
   */
  _applyFilmCurveFloat(val, gamma, dMin, dMax) {
    const normalized = Math.max(0.001, Math.min(1, val));
    const density = -Math.log10(normalized);
    const densityNorm = Math.max(0, Math.min(1, (density - dMin) / (dMax - dMin)));
    const gammaApplied = Math.pow(densityNorm, gamma);
    const adjustedDensity = dMin + gammaApplied * (dMax - dMin);
    return Math.max(0, Math.min(1, Math.pow(10, -adjustedDensity)));
  }

  /**
   * Density levels — float version (0.0–1.0 transmittance)
   * Matches _applyDensityLevels() but without 0-255 scaling.
   *
   * @param {number} r - Red transmittance
   * @param {number} g - Green transmittance
   * @param {number} b - Blue transmittance
   * @returns {[number, number, number]} Corrected transmittance
   */
  _applyDensityLevelsFloat(r, g, b) {
    const levels = this.params.densityLevels;
    if (!levels) return [r, g, b];

    const minT = 0.001;
    const log10 = Math.log(10);

    const rangeR = levels.red.max - levels.red.min;
    const rangeG = levels.green.max - levels.green.min;
    const rangeB = levels.blue.max - levels.blue.min;

    let avgRange = (rangeR + rangeG + rangeB) / 3;
    avgRange = Math.max(0.5, Math.min(2.5, avgRange));

    const processChannel = (val, channelLevels, inputRange) => {
      const T = Math.max(val, minT);
      const D = -Math.log(T) / log10;
      if (inputRange <= 0.001) return val;
      const normalized = Math.max(0, Math.min(1, (D - channelLevels.min) / inputRange));
      const Dnew = normalized * avgRange;
      return Math.max(0, Math.min(1, Math.pow(10, -Dnew)));
    };

    return [
      processChannel(r, levels.red, rangeR),
      processChannel(g, levels.green, rangeG),
      processChannel(b, levels.blue, rangeB),
    ];
  }

  /**
   * 3D LUT sampling — float version (0.0–1.0)
   * Trilinear interpolation on the LUT, operating in normalized range.
   *
   * @param {number} r - Red (0.0–1.0)
   * @param {number} g - Green (0.0–1.0)
   * @param {number} b - Blue (0.0–1.0)
   * @param {Object} lut - LUT object { data, size }
   * @param {number} intensity - LUT blend intensity (0–1)
   * @returns {[number, number, number]} LUT-mapped color
   */
  _sampleLUT3DFloat(r, g, b, lut, intensity = 1) {
    if (!lut || !lut.data || !lut.size) return [r, g, b];

    const { size, data } = lut;
    const maxIndex = size - 1;

    const rNorm = Math.max(0, Math.min(1, r));
    const gNorm = Math.max(0, Math.min(1, g));
    const bNorm = Math.max(0, Math.min(1, b));

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

    // LUT data is already normalized 0–1 (cube file format)
    const rOut = interp(0);
    const gOut = interp(1);
    const bOut = interp(2);

    if (intensity >= 1) return [rOut, gOut, bOut];

    return [
      r + (rOut - r) * intensity,
      g + (gOut - g) * intensity,
      b + (bOut - b) * intensity,
    ];
  }

  /**
   * Sample a 256-entry curve LUT with float linear interpolation.
   * Gives smooth float output from the discrete 8-bit LUT data.
   *
   * @param {number} val - Input value (0.0–1.0)
   * @param {Uint8Array} lut - 256-entry curve LUT (0–255)
   * @returns {number} Interpolated output (0.0–1.0)
   */
  _sampleCurveLUTFloat(val, lut) {
    const pos = Math.max(0, Math.min(1, val)) * 255;
    const lo = Math.floor(pos);
    const hi = Math.min(255, lo + 1);
    const frac = pos - lo;
    return ((1 - frac) * lut[lo] + frac * lut[hi]) / 255;
  }

  /**
   * Sample a Float32 curve LUT with linear interpolation.
   * Higher precision than the 8-bit variant — output is already normalized 0-1.
   *
   * @param {number} val - Input value (0.0–1.0)
   * @param {Float32Array} lut - Float32 curve LUT (values in 0.0–1.0)
   * @returns {number} Interpolated output (0.0–1.0)
   */
  _sampleCurveLUTFloatHQ(val, lut) {
    const maxIdx = lut.length - 1;
    const pos = Math.max(0, Math.min(1, val)) * maxIdx;
    const lo = Math.floor(pos);
    const hi = Math.min(maxIdx, lo + 1);
    const frac = pos - lo;
    return (1 - frac) * lut[lo] + frac * lut[hi];
  }

  // ==========================================================================
  // 8-bit Pipeline Helper Methods (legacy)
  // ==========================================================================

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

    // 计算三个通道的输入范围
    const rangeR = levels.red.max - levels.red.min;
    const rangeG = levels.green.max - levels.green.min;
    const rangeB = levels.blue.max - levels.blue.min;
    
    // 使用平均范围作为输出范围，保持整体对比度
    let avgRange = (rangeR + rangeG + rangeB) / 3;
    avgRange = Math.max(0.5, Math.min(2.5, avgRange)); // 限制在合理范围内

    // 处理每个通道
    // 将每个通道的 [Dmin, Dmax] 归一化到共同的输出范围 [0, avgRange]
    // 这"拉平"了 RGB 通道，补偿：
    // 1. 彩色负片的橙色遮罩
    // 2. 每层染料的不同特性
    // 3. 扫描仪/光源的色彩不平衡
    const processChannel = (value, channelLevels, inputRange) => {
      // 转换到透射率 (0-1)
      const T = Math.max(value / 255, minT);
      
      // 转换到密度域
      const D = -Math.log(T) / log10;
      
      if (inputRange <= 0.001) return value; // 避免除零
      
      // 归一化到 [0, 1]，然后缩放到 avgRange
      const normalized = Math.max(0, Math.min(1, (D - channelLevels.min) / inputRange));
      const Dnew = normalized * avgRange;
      
      // 转回透射率
      const Tnew = Math.pow(10, -Dnew);
      
      // 转回 0-255
      return Math.max(0, Math.min(255, Tnew * 255));
    };

    return [
      processChannel(r, levels.red, rangeR),
      processChannel(g, levels.green, rangeG),
      processChannel(b, levels.blue, rangeB)
    ];
  }

  _hasCurves(curves) {
    if (!curves) return false;
    // 检查是否有非默认曲线
    // 默认曲线控制点为 {x:0,y:0} → {x:255,y:255} (参见 filmLabConstants.DEFAULT_CURVES)
    const isDefault = (pts) => {
      if (!pts || pts.length !== 2) return false;
      return pts[0]?.x === 0 && pts[0]?.y === 0 && pts[1]?.x === 255 && pts[1]?.y === 255;
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
