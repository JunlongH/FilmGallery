/**
 * FilmLab 共享常量 (ES Module 版本)
 */

// 图像尺寸常量
export const PREVIEW_MAX_WIDTH_SERVER = 1400;
export const PREVIEW_MAX_WIDTH_CLIENT = 1200;
export const EXPORT_MAX_WIDTH = 4000;

// 默认参数值
export const DEFAULT_TONE_PARAMS = {
  exposure: 0, contrast: 0, highlights: 0, shadows: 0, whites: 0, blacks: 0,
};

export const DEFAULT_WB_PARAMS = {
  red: 1.0, green: 1.0, blue: 1.0, temp: 0, tint: 0,
};

export const WB_GAIN_LIMITS = { min: 0.05, max: 50.0 };

export const DEFAULT_INVERSION_PARAMS = {
  inverted: false, inversionMode: 'linear',
};

export const DEFAULT_CURVES = {
  rgb: [{ x: 0, y: 0 }, { x: 255, y: 255 }],
  red: [{ x: 0, y: 0 }, { x: 255, y: 255 }],
  green: [{ x: 0, y: 0 }, { x: 255, y: 255 }],
  blue: [{ x: 0, y: 0 }, { x: 255, y: 255 }],
};

export const DEFAULT_CROP_RECT = { x: 0, y: 0, w: 1, h: 1 };

export const JPEG_QUALITY = { preview: 85, export: 95, maximum: 100 };

export const WEBGL_DEBOUNCE_MS = 100;
export const DEBUG = false;

export const FILM_PROFILES = {
  portra160: { gamma: 0.58, dMin: 0.10, dMax: 2.8, name: 'Kodak Portra 160' },
  portra400: { gamma: 0.60, dMin: 0.12, dMax: 3.0, name: 'Kodak Portra 400' },
  portra800: { gamma: 0.62, dMin: 0.15, dMax: 3.2, name: 'Kodak Portra 800' },
  ektar100: { gamma: 0.55, dMin: 0.08, dMax: 3.0, name: 'Kodak Ektar 100' },
  gold200: { gamma: 0.58, dMin: 0.12, dMax: 2.9, name: 'Kodak Gold 200' },
  colorplus200: { gamma: 0.57, dMin: 0.11, dMax: 2.8, name: 'Kodak ColorPlus 200' },
  pro400h: { gamma: 0.60, dMin: 0.12, dMax: 3.0, name: 'Fuji Pro 400H' },
  superia400: { gamma: 0.58, dMin: 0.13, dMax: 2.9, name: 'Fuji Superia 400' },
  c200: { gamma: 0.56, dMin: 0.10, dMax: 2.8, name: 'Fuji C200' },
  trix400: { gamma: 0.65, dMin: 0.15, dMax: 2.8, name: 'Kodak Tri-X 400' },
  tmax100: { gamma: 0.62, dMin: 0.10, dMax: 2.6, name: 'Kodak T-Max 100' },
  tmax400: { gamma: 0.64, dMin: 0.12, dMax: 2.8, name: 'Kodak T-Max 400' },
  hp5: { gamma: 0.63, dMin: 0.14, dMax: 2.7, name: 'Ilford HP5+' },
  delta100: { gamma: 0.60, dMin: 0.08, dMax: 2.5, name: 'Ilford Delta 100' },
  delta400: { gamma: 0.62, dMin: 0.10, dMax: 2.7, name: 'Ilford Delta 400' },
  acros100: { gamma: 0.60, dMin: 0.09, dMax: 2.6, name: 'Fuji Acros 100' },
  default: { gamma: 0.60, dMin: 0.10, dMax: 3.0, name: 'Generic Film' },
};

export const REFERENCE_WHITE_POINTS = {
  D50: 5000, D55: 5500, D65: 6500, D75: 7500, A: 2856, F2: 4230, F11: 4000,
};

export const TEMP_SLIDER_CONFIG = {
  min: -100, max: 100, baseKelvin: 6500, kelvinPerUnit: 40,
};
