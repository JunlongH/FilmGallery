/**
 * FilmLab 共享模块入口 (客户端 ES Module 版本)
 * 
 * @module utils/filmlab-shared
 * @description 统一导出所有 FilmLab 核心处理函数和常量
 */

// 常量 (先导入，避免循环依赖)
export {
  PREVIEW_MAX_WIDTH_SERVER,
  PREVIEW_MAX_WIDTH_CLIENT,
  EXPORT_MAX_WIDTH,
  DEFAULT_TONE_PARAMS,
  DEFAULT_WB_PARAMS,
  DEFAULT_INVERSION_PARAMS,
  DEFAULT_CURVES,
  DEFAULT_CROP_RECT,
  WB_GAIN_LIMITS,
  JPEG_QUALITY,
  WEBGL_DEBOUNCE_MS,
  DEBUG,
  FILM_PROFILES,
  REFERENCE_WHITE_POINTS,
  TEMP_SLIDER_CONFIG,
} from './filmLabConstants.js';

// 色调映射
export { buildToneLUT, applyToneMapping } from './filmLabToneLUT.js';

// 曲线
export { createSpline, buildCurveLUT, buildAllCurveLUTs, applyCurve } from './filmLabCurves.js';

// 白平衡
export { computeWBGains, computeWBGainsLegacy, solveTempTintFromSample, kelvinToRGB, sliderToKelvin } from './filmLabWhiteBalance.js';

// 反转 (纯数学反转：线性/对数)
export { invertLinear, invertLog, applyInversion, applyInversionRGB, buildInversionLUT } from './filmLabInversion.js';

// 胶片曲线 (Film Curve - H&D 密度模型)
export { 
  applyFilmCurve, 
  applyFilmCurveRGB, 
  buildFilmCurveLUT, 
  getBuiltinFilmProfile, 
  mergeFilmProfiles, 
  groupFilmProfilesByCategory,
  FILM_CURVE_PROFILES 
} from './filmLabCurve.js';

// HSL 调整
export {
  HSL_CHANNELS,
  HSL_CHANNEL_ORDER,
  DEFAULT_HSL_PARAMS,
  rgbToHsl,
  hslToRgb,
  applyHSL,
  applyHSLToArray,
  isDefaultHSL,
  mergeHSLParams,
  validateHSLParams,
  calculateChannelWeight,
  hueDistance,
} from './filmLabHSL.js';

// 分离色调
export {
  DEFAULT_SPLIT_TONE_PARAMS,
  LUMINANCE_CONFIG,
  SPLIT_TONE_PRESETS,
  applySplitTone,
  applySplitToneToArray,
  isDefaultSplitTone,
  calculateLuminance,
  calculateZoneWeights,
  smoothstep,
  mergeSplitToneParams,
  validateSplitToneParams,
} from './filmLabSplitTone.js';

// 核心处理模块 (放最后，因为它依赖上面的模块)
export { processPixel, prepareLUTs, processPixelArray, sampleLUT3D, debugLogParams } from './filmlab-core.js';
