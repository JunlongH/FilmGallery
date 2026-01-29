/**
 * FilmLab Hooks Index
 * 
 * 统一导出所有 FilmLab 自定义 Hooks
 * 
 * @module hooks
 * @since 2026-01-29
 */

// 状态管理
export { 
  useFilmLabState,
  DEFAULT_HSL_PARAMS,
  DEFAULT_SPLIT_TONE_PARAMS,
  DEFAULT_CURVES,
  DEFAULT_DENSITY_LEVELS,
  DEFAULT_CROP,
} from './useFilmLabState';

// 图像加载
export { useImageSource } from './useImageSource';

// 渲染器
export { useFilmLabRenderer } from './useFilmLabRenderer';

// 直方图
export {
  useHistogram,
  createEmptyHistogram,
  calculateHistogramFromCanvas,
  calculateHistogramFromWebGL,
  HISTOGRAM_BINS,
} from './useHistogram';
