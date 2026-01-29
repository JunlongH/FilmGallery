/**
 * FilmLab 类型定义
 * 
 * TypeScript 类型定义，提供完整的类型安全和 IDE 支持
 * 
 * @module types
 * @since 2026-01-30
 */

// ============================================================================
// 基础类型
// ============================================================================

/**
 * 裁剪区域（归一化 0-1）
 */
export interface CropRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * 2D 点
 */
export interface Point2D {
  x: number;
  y: number;
}

/**
 * 曲线控制点
 */
export interface CurvePoint {
  x: number;
  y: number;
}

/**
 * RGB 颜色
 */
export interface RGBColor {
  r: number;
  g: number;
  b: number;
}

/**
 * HSL 颜色
 */
export interface HSLColor {
  h: number;  // 0-360
  s: number;  // 0-1
  l: number;  // 0-1
}

// ============================================================================
// 参数类型
// ============================================================================

/**
 * 色调参数
 */
export interface ToneParams {
  exposure: number;
  contrast: number;
  highlights: number;
  shadows: number;
  whites: number;
  blacks: number;
}

/**
 * 白平衡参数
 */
export interface WhiteBalanceParams {
  temp: number;
  tint: number;
  red: number;
  green: number;
  blue: number;
}

/**
 * 片基校正参数
 */
export interface BaseCorrectionParams {
  baseMode: 'off' | 'log' | 'linear' | 'auto';
  baseRed: number;
  baseGreen: number;
  baseBlue: number;
  baseDensityR: number;
  baseDensityG: number;
  baseDensityB: number;
}

/**
 * 反转参数
 */
export interface InversionParams {
  inverted: boolean;
  inversionMode: 'linear' | 'log' | 'filmic';
}

/**
 * 胶片曲线参数
 */
export interface FilmCurveParams {
  filmCurveEnabled: boolean;
  filmCurveProfile: string;
}

/**
 * 几何变换参数
 */
export interface GeometryParams {
  rotation: number;
  orientation: 0 | 90 | 180 | 270;
  cropRect: CropRect;
  committedCrop: CropRect;
  ratioMode: 'free' | '1:1' | '3:2' | '4:3' | '16:9' | '5:4' | '7:5' | '2:3' | '3:4';
  ratioSwap: boolean;
}

/**
 * 密度级别参数
 */
export interface DensityLevels {
  minR: number;
  maxR: number;
  minG: number;
  maxG: number;
  minB: number;
  maxB: number;
}

/**
 * HSL 单通道参数
 */
export interface HSLChannelParams {
  hue: number;
  saturation: number;
  luminance: number;
}

/**
 * 完整 HSL 参数
 */
export interface HSLParams {
  red: HSLChannelParams;
  orange: HSLChannelParams;
  yellow: HSLChannelParams;
  green: HSLChannelParams;
  cyan: HSLChannelParams;
  blue: HSLChannelParams;
  purple: HSLChannelParams;
  magenta: HSLChannelParams;
}

/**
 * 分离色调单区域参数
 */
export interface SplitToneZone {
  hue: number;
  saturation: number;
}

/**
 * 分离色调完整参数
 */
export interface SplitToneParams {
  highlights: SplitToneZone;
  midtones: SplitToneZone;
  shadows: SplitToneZone;
  balance: number;
}

/**
 * 曲线参数
 */
export interface CurvesParams {
  rgb: CurvePoint[];
  red: CurvePoint[];
  green: CurvePoint[];
  blue: CurvePoint[];
}

/**
 * 活动曲线通道
 */
export type CurveChannel = 'rgb' | 'red' | 'green' | 'blue';

// ============================================================================
// 渲染参数
// ============================================================================

/**
 * WebGL 渲染参数
 */
export interface RenderParams {
  // 源图像
  image: HTMLImageElement | ImageBitmap | HTMLCanvasElement;
  
  // 几何
  scale?: number;
  rotate?: number;
  cropRect?: CropRect;
  
  // 反转
  inverted?: boolean;
  inversionMode?: 'linear' | 'log' | 'filmic';
  
  // 色调
  exposure?: number;
  contrast?: number;
  highlights?: number;
  shadows?: number;
  whites?: number;
  blacks?: number;
  
  // 白平衡
  temp?: number;
  tint?: number;
  red?: number;
  green?: number;
  blue?: number;
  
  // 片基校正
  baseMode?: string;
  baseRed?: number;
  baseGreen?: number;
  baseBlue?: number;
  baseDensityR?: number;
  baseDensityG?: number;
  baseDensityB?: number;
  
  // 密度级别
  densityLevelsEnabled?: boolean;
  densityLevels?: DensityLevels;
  
  // 胶片曲线
  filmCurveEnabled?: boolean;
  filmCurveGamma?: number;
  filmCurveDMin?: number;
  filmCurveDMax?: number;
  
  // 曲线
  curves?: CurvesParams;
  
  // HSL
  hslParams?: HSLParams;
  
  // 分离色调
  splitToning?: SplitToneParams;
  
  // LUT
  lut3dData?: Float32Array | Uint8Array;
  lutSize?: number;
  lutIntensity?: number;
}

// ============================================================================
// 直方图类型
// ============================================================================

/**
 * 直方图数据
 */
export interface HistogramData {
  r: number[];
  g: number[];
  b: number[];
  luminance: number[];
}

/**
 * 直方图计算选项
 */
export interface HistogramOptions {
  bins?: number;
  cropRect?: CropRect;
  sampleRate?: number;
}

// ============================================================================
// 事件类型
// ============================================================================

/**
 * Pipeline 事件类型
 */
export type PipelineEventType =
  | 'source_changed'
  | 'geometry_changed'
  | 'crop_changed'
  | 'rotation_changed'
  | 'inversion_changed'
  | 'base_density_changed'
  | 'color_changed'
  | 'exposure_changed'
  | 'white_balance_changed'
  | 'curves_changed'
  | 'hsl_changed'
  | 'split_tone_changed'
  | 'film_curve_changed'
  | 'lut_changed'
  | 'output_changed';

/**
 * Pipeline 事件监听器
 */
export type PipelineListener = (data: any) => void;

// ============================================================================
// Hook 返回类型
// ============================================================================

/**
 * useFilmLabState Hook 返回类型
 */
export interface UseFilmLabStateReturn {
  // Tone
  exposure: number;
  setExposure: (value: number) => void;
  contrast: number;
  setContrast: (value: number) => void;
  highlights: number;
  setHighlights: (value: number) => void;
  shadows: number;
  setShadows: (value: number) => void;
  whites: number;
  setWhites: (value: number) => void;
  blacks: number;
  setBlacks: (value: number) => void;
  
  // White Balance
  temp: number;
  setTemp: (value: number) => void;
  tint: number;
  setTint: (value: number) => void;
  red: number;
  setRed: (value: number) => void;
  green: number;
  setGreen: (value: number) => void;
  blue: number;
  setBlue: (value: number) => void;
  
  // Base Correction
  baseMode: string;
  setBaseMode: (value: string) => void;
  baseRed: number;
  setBaseRed: (value: number) => void;
  baseGreen: number;
  setBaseGreen: (value: number) => void;
  baseBlue: number;
  setBaseBlue: (value: number) => void;
  baseDensityR: number;
  setBaseDensityR: (value: number) => void;
  baseDensityG: number;
  setBaseDensityG: (value: number) => void;
  baseDensityB: number;
  setBaseDensityB: (value: number) => void;
  
  // Inversion
  inverted: boolean;
  setInverted: (value: boolean) => void;
  inversionMode: string;
  setInversionMode: (value: string) => void;
  
  // Film Curve
  filmCurveEnabled: boolean;
  setFilmCurveEnabled: (value: boolean) => void;
  filmCurveProfile: string;
  setFilmCurveProfile: (value: string) => void;
  
  // Geometry
  rotation: number;
  setRotation: (value: number) => void;
  orientation: number;
  setOrientation: (value: number) => void;
  cropRect: CropRect;
  setCropRect: (value: CropRect) => void;
  committedCrop: CropRect;
  setCommittedCrop: (value: CropRect) => void;
  ratioMode: string;
  setRatioMode: (value: string) => void;
  ratioSwap: boolean;
  setRatioSwap: (value: boolean) => void;
  
  // Complex
  curves: CurvesParams;
  setCurves: (value: CurvesParams) => void;
  hslParams: HSLParams;
  setHslParams: (value: HSLParams) => void;
  splitToning: SplitToneParams;
  setSplitToning: (value: SplitToneParams) => void;
  densityLevels: DensityLevels;
  setDensityLevels: (value: DensityLevels) => void;
  densityLevelsEnabled: boolean;
  setDensityLevelsEnabled: (value: boolean) => void;
  
  // Utilities
  serializeState: () => Record<string, any>;
  deserializeState: (params: Record<string, any>) => void;
  resetAllState: () => void;
  hasModifications: boolean;
}

/**
 * useFilmLabPipeline Hook 返回类型
 */
export interface UseFilmLabPipelineReturn {
  on: (event: PipelineEventType, callback: PipelineListener) => () => void;
  off: (event: PipelineEventType, callback: PipelineListener) => void;
  emit: (event: PipelineEventType, data?: any, options?: { immediate?: boolean; cascade?: boolean }) => void;
  flush: () => void;
  
  emitGeometryChanged: (data?: any) => void;
  emitCropChanged: (cropRect: CropRect) => void;
  emitColorChanged: (data?: any) => void;
  emitInversionChanged: (data?: any) => void;
  emitSourceChanged: (data?: any) => void;
  
  getRenderOrder: string[];
  validateOrder: (operations: string[]) => boolean;
  
  PipelineEvent: Record<string, PipelineEventType>;
  PipelinePriority: Record<string, number>;
}

/**
 * useHistogram Hook 返回类型
 */
export interface UseHistogramReturn {
  histogram: HistogramData;
  updateHistogram: () => void;
  calculateFromCanvas: (canvas: HTMLCanvasElement, options?: HistogramOptions) => HistogramData;
  calculateFromWebGL: (gl: WebGLRenderingContext, options?: HistogramOptions) => HistogramData;
}

/**
 * useFilmLabRenderer Hook 返回类型
 */
export interface UseFilmLabRendererReturn {
  canvasRef: React.RefObject<HTMLCanvasElement>;
  isRendering: boolean;
  lastRenderTime: number;
  requestRender: () => void;
  renderNow: () => void;
  clearCache: () => void;
}

// ============================================================================
// 导出配置类型
// ============================================================================

/**
 * 图像导出选项
 */
export interface ExportOptions {
  format: 'jpeg' | 'png' | 'webp' | 'tiff';
  quality?: number;  // 0-1, 仅 jpeg/webp
  maxSize?: number | null;  // 最大尺寸限制
  filename?: string;
  metadata?: boolean;  // 是否保留元数据
}

/**
 * LUT 导出选项
 */
export interface LUTExportOptions {
  format: 'cube' | '3dl';
  size: 17 | 33 | 65;
  title?: string;
}

// ============================================================================
// 预设类型
// ============================================================================

/**
 * FilmLab 预设
 */
export interface FilmLabPreset {
  id: string;
  name: string;
  description?: string;
  category?: string;
  author?: string;
  version?: number;
  createdAt?: string;
  updatedAt?: string;
  
  // 参数
  params: {
    tone?: Partial<ToneParams>;
    whiteBalance?: Partial<WhiteBalanceParams>;
    baseCorrection?: Partial<BaseCorrectionParams>;
    inversion?: Partial<InversionParams>;
    filmCurve?: Partial<FilmCurveParams>;
    curves?: Partial<CurvesParams>;
    hsl?: Partial<HSLParams>;
    splitTone?: Partial<SplitToneParams>;
  };
}

// ============================================================================
// 工具类型
// ============================================================================

/**
 * 使参数部分可选
 */
export type PartialParams<T> = {
  [P in keyof T]?: T[P];
};

/**
 * 深度部分可选
 */
export type DeepPartial<T> = {
  [P in keyof T]?: T[P] extends object ? DeepPartial<T[P]> : T[P];
};

/**
 * 只读参数
 */
export type ReadonlyParams<T> = {
  readonly [P in keyof T]: T[P];
};
