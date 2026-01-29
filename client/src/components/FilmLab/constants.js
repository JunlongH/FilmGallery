/**
 * FilmLab 常量定义
 * 
 * 集中管理所有 FilmLab 相关的常量，包括：
 * - UI 配置
 * - 渲染参数范围
 * - 预设值
 * - 文件类型
 * - 键盘快捷键
 * 
 * @module constants
 * @since 2026-01-30
 */

// ============================================================================
// 文件类型常量
// ============================================================================

/**
 * 支持的 RAW 文件扩展名
 */
export const RAW_EXTENSIONS = [
  '.nef', '.cr2', '.cr3', '.arw', '.orf', '.rw2', '.raf', '.dng',
  '.pef', '.srw', '.x3f', '.3fr', '.fff', '.iiq', '.rwz', '.erf',
];

/**
 * 支持的 TIFF 文件扩展名
 */
export const TIFF_EXTENSIONS = ['.tif', '.tiff'];

/**
 * 所有需要服务器解码的文件扩展名
 */
export const SERVER_DECODE_EXTENSIONS = [...RAW_EXTENSIONS, ...TIFF_EXTENSIONS];

/**
 * 支持的标准图片格式
 */
export const STANDARD_IMAGE_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.webp', '.gif', '.bmp'];

/**
 * 所有支持的图片格式
 */
export const ALL_IMAGE_EXTENSIONS = [...STANDARD_IMAGE_EXTENSIONS, ...SERVER_DECODE_EXTENSIONS];

// ============================================================================
// 渲染参数范围
// ============================================================================

/**
 * 曝光参数范围
 */
export const EXPOSURE_RANGE = {
  min: -5.0,
  max: 5.0,
  step: 0.01,
  default: 0,
};

/**
 * 对比度参数范围
 */
export const CONTRAST_RANGE = {
  min: -100,
  max: 100,
  step: 1,
  default: 0,
};

/**
 * 高光参数范围
 */
export const HIGHLIGHTS_RANGE = {
  min: -100,
  max: 100,
  step: 1,
  default: 0,
};

/**
 * 阴影参数范围
 */
export const SHADOWS_RANGE = {
  min: -100,
  max: 100,
  step: 1,
  default: 0,
};

/**
 * 白点参数范围
 */
export const WHITES_RANGE = {
  min: -100,
  max: 100,
  step: 1,
  default: 0,
};

/**
 * 黑点参数范围
 */
export const BLACKS_RANGE = {
  min: -100,
  max: 100,
  step: 1,
  default: 0,
};

/**
 * 色温参数范围
 */
export const TEMPERATURE_RANGE = {
  min: -100,
  max: 100,
  step: 1,
  default: 0,
};

/**
 * 色调参数范围
 */
export const TINT_RANGE = {
  min: -100,
  max: 100,
  step: 1,
  default: 0,
};

/**
 * RGB 通道倍率范围
 */
export const CHANNEL_MULTIPLIER_RANGE = {
  min: 0.0,
  max: 3.0,
  step: 0.01,
  default: 1.0,
};

/**
 * 旋转角度范围
 */
export const ROTATION_RANGE = {
  min: -180,
  max: 180,
  step: 0.1,
  default: 0,
};

/**
 * 密度级别范围
 */
export const DENSITY_RANGE = {
  min: 0.0,
  max: 4.0,
  step: 0.01,
  default: 0.0,
};

/**
 * HSL 色相范围
 */
export const HUE_RANGE = {
  min: -180,
  max: 180,
  step: 1,
  default: 0,
};

/**
 * HSL 饱和度范围
 */
export const SATURATION_RANGE = {
  min: -100,
  max: 100,
  step: 1,
  default: 0,
};

/**
 * HSL 明度范围
 */
export const LUMINANCE_RANGE = {
  min: -100,
  max: 100,
  step: 1,
  default: 0,
};

// ============================================================================
// UI 配置常量
// ============================================================================

/**
 * 直方图配置
 */
export const HISTOGRAM_CONFIG = {
  bins: 256,          // 直方图桶数
  height: 100,        // 显示高度
  smoothing: true,    // 平滑显示
  logScale: false,    // 对数刻度
};

/**
 * 缩放配置
 */
export const ZOOM_CONFIG = {
  min: 0.1,
  max: 8.0,
  step: 0.1,
  default: 1.0,
  fitMargin: 0.95,    // fit 模式下的边距
};

/**
 * 裁剪比例预设
 */
export const CROP_RATIOS = {
  free: { label: '自由', value: null },
  '1:1': { label: '1:1', value: 1 },
  '3:2': { label: '3:2', value: 3 / 2 },
  '4:3': { label: '4:3', value: 4 / 3 },
  '16:9': { label: '16:9', value: 16 / 9 },
  '5:4': { label: '5:4', value: 5 / 4 },
  '7:5': { label: '7:5', value: 7 / 5 },
  '2:3': { label: '2:3', value: 2 / 3 },
  '3:4': { label: '3:4', value: 3 / 4 },
};

/**
 * 方向预设
 */
export const ORIENTATIONS = {
  0: { label: '正常', transform: '' },
  90: { label: '顺时针90°', transform: 'rotate(90deg)' },
  180: { label: '180°', transform: 'rotate(180deg)' },
  270: { label: '逆时针90°', transform: 'rotate(270deg)' },
};

// ============================================================================
// 反转模式
// ============================================================================

/**
 * 反转模式选项
 */
export const INVERSION_MODES = {
  linear: {
    label: '线性',
    description: '简单的像素反转',
  },
  log: {
    label: '对数',
    description: '基于密度的对数反转',
  },
  filmic: {
    label: '胶片',
    description: '模拟胶片特性的反转',
  },
};

/**
 * 片基校正模式
 */
export const BASE_CORRECTION_MODES = {
  off: {
    label: '关闭',
    description: '不进行片基校正',
  },
  log: {
    label: '对数',
    description: '基于对数密度的校正',
  },
  linear: {
    label: '线性',
    description: '线性片基校正',
  },
  auto: {
    label: '自动',
    description: '自动检测片基颜色',
  },
};

// ============================================================================
// 胶片曲线预设
// ============================================================================

/**
 * 内置胶片曲线
 */
export const FILM_CURVE_PRESETS = {
  default: {
    label: '默认',
    toe: 0.0,
    shoulder: 1.0,
    gamma: 1.0,
  },
  portra: {
    label: 'Portra 风格',
    toe: 0.15,
    shoulder: 0.9,
    gamma: 0.95,
  },
  ektar: {
    label: 'Ektar 风格',
    toe: 0.1,
    shoulder: 0.95,
    gamma: 1.1,
  },
  velvia: {
    label: 'Velvia 风格',
    toe: 0.05,
    shoulder: 0.85,
    gamma: 1.15,
  },
  trix: {
    label: 'Tri-X 风格',
    toe: 0.2,
    shoulder: 0.88,
    gamma: 1.0,
  },
};

// ============================================================================
// 键盘快捷键
// ============================================================================

/**
 * 默认键盘快捷键映射
 */
export const DEFAULT_KEYBOARD_SHORTCUTS = {
  // 视图
  'z': 'toggleZoom',           // 切换缩放
  'f': 'fitToScreen',          // 适应屏幕
  '1': 'zoom100',              // 100% 缩放
  'Space': 'togglePan',        // 切换拖拽模式
  
  // 编辑
  'r': 'toggleCrop',           // 切换裁剪
  'c': 'confirmCrop',          // 确认裁剪
  'Escape': 'cancelCrop',      // 取消裁剪
  
  // 旋转
  'l': 'rotateLeft',           // 左旋转
  'k': 'rotateRight',          // 右旋转
  
  // 反转
  'i': 'toggleInversion',      // 切换反转
  
  // 比较
  'b': 'toggleCompare',        // 切换对比
  
  // 导航
  'ArrowLeft': 'previousImage', // 上一张
  'ArrowRight': 'nextImage',    // 下一张
  
  // 保存
  'Ctrl+s': 'saveParams',      // 保存参数
  'Ctrl+Shift+s': 'exportImage', // 导出图片
  
  // 重置
  'Ctrl+r': 'resetAll',        // 重置所有参数
};

// ============================================================================
// LUT 配置
// ============================================================================

/**
 * LUT 导出尺寸选项
 */
export const LUT_EXPORT_SIZES = {
  17: { label: '17x17x17', description: '最小尺寸' },
  33: { label: '33x33x33', description: '标准尺寸' },
  65: { label: '65x65x65', description: '高精度' },
};

/**
 * LUT 格式选项
 */
export const LUT_FORMATS = {
  cube: {
    label: '.cube',
    description: 'Adobe/DaVinci 格式',
    extension: '.cube',
  },
  '3dl': {
    label: '.3dl',
    description: 'Lustre 格式',
    extension: '.3dl',
  },
};

// ============================================================================
// 渲染质量
// ============================================================================

/**
 * 渲染质量预设
 */
export const RENDER_QUALITY = {
  preview: {
    label: '预览',
    maxSize: 1920,
    jpegQuality: 0.8,
  },
  standard: {
    label: '标准',
    maxSize: 4096,
    jpegQuality: 0.92,
  },
  high: {
    label: '高质量',
    maxSize: 8192,
    jpegQuality: 0.95,
  },
  full: {
    label: '完整',
    maxSize: null,  // 无限制
    jpegQuality: 1.0,
  },
};

// ============================================================================
// 导出格式
// ============================================================================

/**
 * 支持的导出格式
 */
export const EXPORT_FORMATS = {
  jpeg: {
    label: 'JPEG',
    extension: '.jpg',
    mimeType: 'image/jpeg',
    supportsAlpha: false,
    supportsQuality: true,
  },
  png: {
    label: 'PNG',
    extension: '.png',
    mimeType: 'image/png',
    supportsAlpha: true,
    supportsQuality: false,
  },
  webp: {
    label: 'WebP',
    extension: '.webp',
    mimeType: 'image/webp',
    supportsAlpha: true,
    supportsQuality: true,
  },
  tiff: {
    label: 'TIFF (16-bit)',
    extension: '.tiff',
    mimeType: 'image/tiff',
    supportsAlpha: true,
    supportsQuality: false,
    serverOnly: true,  // 需要服务器处理
  },
};

// ============================================================================
// HSL 颜色通道
// ============================================================================

/**
 * HSL 颜色通道定义
 */
export const HSL_CHANNELS = {
  red: {
    label: '红',
    hueCenter: 0,
    color: '#ff4444',
  },
  orange: {
    label: '橙',
    hueCenter: 30,
    color: '#ff8844',
  },
  yellow: {
    label: '黄',
    hueCenter: 60,
    color: '#ffff44',
  },
  green: {
    label: '绿',
    hueCenter: 120,
    color: '#44ff44',
  },
  cyan: {
    label: '青',
    hueCenter: 180,
    color: '#44ffff',
  },
  blue: {
    label: '蓝',
    hueCenter: 240,
    color: '#4444ff',
  },
  purple: {
    label: '紫',
    hueCenter: 270,
    color: '#8844ff',
  },
  magenta: {
    label: '洋红',
    hueCenter: 300,
    color: '#ff44ff',
  },
};

// ============================================================================
// 曲线通道
// ============================================================================

/**
 * 曲线编辑通道
 */
export const CURVE_CHANNELS = {
  rgb: {
    label: 'RGB',
    color: '#ffffff',
  },
  red: {
    label: '红',
    color: '#ff4444',
  },
  green: {
    label: '绿',
    color: '#44ff44',
  },
  blue: {
    label: '蓝',
    color: '#4444ff',
  },
};

// ============================================================================
// 默认曲线控制点
// ============================================================================

/**
 * 默认曲线（线性）
 */
export const DEFAULT_CURVE_POINTS = [
  { x: 0, y: 0 },
  { x: 1, y: 1 },
];

// ============================================================================
// API 端点
// ============================================================================

/**
 * FilmLab 相关 API 端点
 */
export const API_ENDPOINTS = {
  decodeRaw: '/api/filmlab/decode',
  exportImage: '/api/filmlab/export',
  generateLut: '/api/filmlab/lut',
  saveParams: '/api/filmlab/params',
  loadParams: '/api/filmlab/params',
  presets: '/api/filmlab/presets',
};

// ============================================================================
// 错误代码
// ============================================================================

/**
 * FilmLab 错误代码
 */
export const ERROR_CODES = {
  DECODE_FAILED: 'FILMLAB_DECODE_FAILED',
  RENDER_FAILED: 'FILMLAB_RENDER_FAILED',
  EXPORT_FAILED: 'FILMLAB_EXPORT_FAILED',
  INVALID_FILE: 'FILMLAB_INVALID_FILE',
  GPU_NOT_AVAILABLE: 'FILMLAB_GPU_NOT_AVAILABLE',
  WEBGL_ERROR: 'FILMLAB_WEBGL_ERROR',
  NETWORK_ERROR: 'FILMLAB_NETWORK_ERROR',
};

// ============================================================================
// 默认导出
// ============================================================================

export default {
  // 文件类型
  RAW_EXTENSIONS,
  TIFF_EXTENSIONS,
  SERVER_DECODE_EXTENSIONS,
  STANDARD_IMAGE_EXTENSIONS,
  ALL_IMAGE_EXTENSIONS,
  
  // 参数范围
  EXPOSURE_RANGE,
  CONTRAST_RANGE,
  HIGHLIGHTS_RANGE,
  SHADOWS_RANGE,
  WHITES_RANGE,
  BLACKS_RANGE,
  TEMPERATURE_RANGE,
  TINT_RANGE,
  CHANNEL_MULTIPLIER_RANGE,
  ROTATION_RANGE,
  DENSITY_RANGE,
  HUE_RANGE,
  SATURATION_RANGE,
  LUMINANCE_RANGE,
  
  // UI 配置
  HISTOGRAM_CONFIG,
  ZOOM_CONFIG,
  CROP_RATIOS,
  ORIENTATIONS,
  
  // 模式和预设
  INVERSION_MODES,
  BASE_CORRECTION_MODES,
  FILM_CURVE_PRESETS,
  
  // 快捷键
  DEFAULT_KEYBOARD_SHORTCUTS,
  
  // LUT
  LUT_EXPORT_SIZES,
  LUT_FORMATS,
  
  // 渲染和导出
  RENDER_QUALITY,
  EXPORT_FORMATS,
  
  // 颜色通道
  HSL_CHANNELS,
  CURVE_CHANNELS,
  DEFAULT_CURVE_POINTS,
  
  // API
  API_ENDPOINTS,
  ERROR_CODES,
};
