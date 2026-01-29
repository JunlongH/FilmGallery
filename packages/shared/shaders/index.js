/**
 * @filmgallery/shared/shaders
 * 
 * 统一的 GLSL 着色器库，确保客户端预览和服务端导出渲染一致性
 * 
 * @module packages/shared/shaders
 * @description
 * 此模块提供共享的 GLSL 着色器代码片段，供 FilmLabWebGL.js（客户端）
 * 和 gpu-renderer.js（服务端）使用，保证色彩科学处理的一致性。
 * 
 * 架构说明：
 * - colorMath.glsl: RGB/HSL 转换、亮度计算等基础数学函数
 * - hslAdjust.glsl: HSL 通道调整（8通道色相/饱和度/明度）
 * - splitTone.glsl: 分离色调（高光/中间调/阴影着色）
 * - filmCurve.glsl: 胶片特性曲线（H&D 密度模型）
 * - tonemap.glsl: 色调映射（曲线、对比度、曝光、高光/阴影）
 * - lut3d.glsl: 3D LUT 采样（打包2D纹理方式）
 * - inversion.glsl: 负片反转（线性/对数模式）
 * - baseDensity.glsl: 片基校正（密度域减法）
 * - main.glsl: 完整的片元着色器主函数
 * 
 * @version 1.0.0
 * @since 2026-01-29
 */

const colorMath = require('./colorMath');
const hslAdjust = require('./hslAdjust');
const splitTone = require('./splitTone');
const filmCurve = require('./filmCurve');
const tonemap = require('./tonemap');
const lut3d = require('./lut3d');
const inversion = require('./inversion');
const baseDensity = require('./baseDensity');
const uniforms = require('./uniforms');

/**
 * 构建完整的片元着色器源码
 * @param {Object} options - 构建选项
 * @param {boolean} options.useHSL - 是否包含 HSL 调整
 * @param {boolean} options.useSplitTone - 是否包含分离色调
 * @param {boolean} options.useLUT3D - 是否包含 3D LUT
 * @param {boolean} options.useCurves - 是否包含曲线
 * @param {string} options.precision - 精度 ('lowp', 'mediump', 'highp')
 * @returns {string} 完整的 GLSL 片元着色器代码
 */
function buildFragmentShader(options = {}) {
  const {
    precision = 'mediump',
    useHSL = true,
    useSplitTone = true,
    useLUT3D = true,
    useCurves = true,
  } = options;

  return `
precision ${precision} float;
varying vec2 v_uv;

// ============================================================================
// Uniforms
// ============================================================================
${uniforms.UNIFORMS_GLSL}

// ============================================================================
// Color Math Functions
// ============================================================================
${colorMath.COLOR_MATH_GLSL}

// ============================================================================
// HSL Adjustment
// ============================================================================
${hslAdjust.HSL_ADJUST_GLSL}

// ============================================================================
// Split Toning
// ============================================================================
${splitTone.SPLIT_TONE_GLSL}

// ============================================================================
// Film Curve (H&D Density Model)
// ============================================================================
${filmCurve.FILM_CURVE_GLSL}

// ============================================================================
// Base Density Correction
// ============================================================================
${baseDensity.BASE_DENSITY_GLSL}

// ============================================================================
// Inversion
// ============================================================================
${inversion.INVERSION_GLSL}

// ============================================================================
// Tone Mapping
// ============================================================================
${tonemap.TONEMAP_GLSL}

// ============================================================================
// 3D LUT Sampling
// ============================================================================
${lut3d.LUT3D_GLSL}

// ============================================================================
// Main
// ============================================================================
${buildMainFunction(options)}
`;
}

/**
 * 构建主函数
 */
function buildMainFunction(options) {
  return `
void main() {
  vec4 tex = texture2D(u_image, v_uv);
  vec3 col = tex.rgb;

  // ① Film Curve (before inversion) - applies H&D density model to negative scan
  if (u_inverted == 1 && u_filmCurveEnabled == 1) {
    col.r = applyFilmCurve(col.r);
    col.g = applyFilmCurve(col.g);
    col.b = applyFilmCurve(col.b);
  }

  // ② Base Correction - neutralize film base color
  col = applyBaseDensityCorrection(col);

  // ②.5 Density Levels (Log domain auto-levels)
  col = applyDensityLevels(col);

  // ③ Invert if enabled
  col = applyInversion(col);

  // ④ White Balance (RGB Gains)
  col *= u_gains;

  // ⑤ Exposure
  float expFactor = pow(2.0, u_exposure / 50.0);
  col *= expFactor;

  // ⑥ Contrast
  col = applyContrast(col, u_contrast);

  // ⑦ Highlights & Shadows
  col = applyHighlightsShadows(col);

  // ⑧ Whites & Blacks
  col = applyWhitesBlacks(col);

  col = clamp(col, 0.0, 1.0);

  // ⑨ Tone Curves (1D LUT)
  if (u_useCurves == 1) {
    col = applyCurvesLUT(col);
  }

  // ⑩ HSL Adjustment
  if (u_useHSL == 1) {
    col = applyHSLAdjustment(col);
  }

  // ⑪ Split Toning
  if (u_useSplitTone == 1) {
    col = applySplitToning(col);
  }

  // ⑫ 3D LUT (applied last for creative looks)
  if (u_useLut3d == 1) {
    vec3 lutColor = sampleLUT3D(col);
    col = mix(col, lutColor, u_lutIntensity);
  }

  gl_FragColor = vec4(col, 1.0);
}
`;
}

/**
 * 顶点着色器
 */
const VERTEX_SHADER = `
attribute vec2 a_pos;
attribute vec2 a_uv;
varying vec2 v_uv;

void main() {
  v_uv = a_uv;
  gl_Position = vec4(a_pos, 0.0, 1.0);
}
`;

module.exports = {
  // 构建函数
  buildFragmentShader,
  
  // 顶点着色器
  VERTEX_SHADER,
  
  // 独立模块（用于自定义组合）
  colorMath,
  hslAdjust,
  splitTone,
  filmCurve,
  tonemap,
  lut3d,
  inversion,
  baseDensity,
  uniforms,
  
  // 着色器版本标识（用于缓存失效）
  SHADER_VERSION: '2026-01-29-v1',
};
