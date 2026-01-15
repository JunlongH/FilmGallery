/**
 * FilmLab 共享模块入口
 * 
 * @module packages/shared
 * @description 统一导出所有 FilmLab 核心处理函数和常量
 */

// 核心处理模块
const core = require('./filmlab-core');
const constants = require('./filmLabConstants');
const toneLUT = require('./filmLabToneLUT');
const curves = require('./filmLabCurves');
const whiteBalance = require('./filmLabWhiteBalance');
const inversion = require('./filmLabInversion');
const filmCurve = require('./filmLabCurve');

// 统一导出
module.exports = {
  // ============================================================================
  // 核心处理函数
  // ============================================================================
  
  /** 处理单个像素 */
  processPixel: core.processPixel,
  
  /** 预构建所有 LUT */
  prepareLUTs: core.prepareLUTs,
  
  /** 批量处理像素数组 */
  processPixelArray: core.processPixelArray,
  
  /** 3D LUT 采样 */
  sampleLUT3D: core.sampleLUT3D,
  
  // ============================================================================
  // 色调映射
  // ============================================================================
  
  /** 构建色调映射 LUT */
  buildToneLUT: toneLUT.buildToneLUT,
  
  /** 应用色调映射到单个值 */
  applyToneMapping: toneLUT.applyToneMapping,
  
  // ============================================================================
  // 曲线
  // ============================================================================
  
  /** 创建样条插值函数 */
  createSpline: curves.createSpline,
  
  /** 构建曲线 LUT */
  buildCurveLUT: curves.buildCurveLUT,
  
  /** 构建所有通道曲线 LUT */
  buildAllCurveLUTs: curves.buildAllCurveLUTs,
  
  /** 应用曲线到单个值 */
  applyCurve: curves.applyCurve,
  
  // ============================================================================
  // 白平衡
  // ============================================================================
  
  /** 计算白平衡增益 (科学化版本) */
  computeWBGains: whiteBalance.computeWBGains,
  
  /** 计算白平衡增益 (传统版本) */
  computeWBGainsLegacy: whiteBalance.computeWBGainsLegacy,
  
  /** 从采样颜色求解 temp/tint */
  solveTempTintFromSample: whiteBalance.solveTempTintFromSample,
  
  /** 开尔文色温转 RGB */
  kelvinToRGB: whiteBalance.kelvinToRGB,
  
  /** 滑块值转开尔文色温 */
  sliderToKelvin: whiteBalance.sliderToKelvin,
  
  // ============================================================================
  // 反转 (纯数学反转：线性/对数)
  // ============================================================================
  
  /** 线性反转 */
  invertLinear: inversion.invertLinear,
  
  /** 对数反转 */
  invertLog: inversion.invertLog,
  
  /** 应用反转 */
  applyInversion: inversion.applyInversion,
  
  /** 应用反转到 RGB */
  applyInversionRGB: inversion.applyInversionRGB,
  
  /** 构建反转 LUT */
  buildInversionLUT: inversion.buildInversionLUT,
  
  // ============================================================================
  // 胶片曲线 (Film Curve - H&D 密度模型)
  // ============================================================================
  
  /** 应用胶片曲线到单通道 */
  applyFilmCurve: filmCurve.applyFilmCurve,
  
  /** 应用胶片曲线到 RGB */
  applyFilmCurveRGB: filmCurve.applyFilmCurveRGB,
  
  /** 构建胶片曲线 LUT */
  buildFilmCurveLUT: filmCurve.buildFilmCurveLUT,
  
  /** 合并胶片配置与自定义参数 */
  mergeFilmProfiles: filmCurve.mergeFilmProfiles,
  
  /** 按分类分组胶片配置 */
  groupFilmProfilesByCategory: filmCurve.groupFilmProfilesByCategory,
  
  /** 胶片曲线配置常量 */
  FILM_CURVE_PROFILES: filmCurve.FILM_CURVE_PROFILES,
  
  // ============================================================================
  // 常量
  // ============================================================================
  
  // 尺寸常量
  PREVIEW_MAX_WIDTH_SERVER: constants.PREVIEW_MAX_WIDTH_SERVER,
  PREVIEW_MAX_WIDTH_CLIENT: constants.PREVIEW_MAX_WIDTH_CLIENT,
  EXPORT_MAX_WIDTH: constants.EXPORT_MAX_WIDTH,
  
  // 默认参数
  DEFAULT_TONE_PARAMS: constants.DEFAULT_TONE_PARAMS,
  DEFAULT_WB_PARAMS: constants.DEFAULT_WB_PARAMS,
  DEFAULT_INVERSION_PARAMS: constants.DEFAULT_INVERSION_PARAMS,
  DEFAULT_CURVES: constants.DEFAULT_CURVES,
  DEFAULT_CROP_RECT: constants.DEFAULT_CROP_RECT,
  WB_GAIN_LIMITS: constants.WB_GAIN_LIMITS,
  
  // 质量设置
  JPEG_QUALITY: constants.JPEG_QUALITY,
  
  // WebGL 配置
  WEBGL_DEBOUNCE_MS: constants.WEBGL_DEBOUNCE_MS,
  DEBUG: constants.DEBUG,
  
  // 胶片配置
  FILM_PROFILES: constants.FILM_PROFILES,
  
  // 色温配置
  REFERENCE_WHITE_POINTS: constants.REFERENCE_WHITE_POINTS,
  TEMP_SLIDER_CONFIG: constants.TEMP_SLIDER_CONFIG,
};
