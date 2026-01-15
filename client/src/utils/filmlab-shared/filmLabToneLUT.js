/**
 * FilmLab 色调映射 LUT 构建器 (ES Module 版本)
 */

import { DEFAULT_TONE_PARAMS } from './filmLabConstants.js';

/**
 * 构建 256 级色调映射 LUT
 */
export function buildToneLUT(params = {}) {
  const {
    exposure = DEFAULT_TONE_PARAMS.exposure,
    contrast = DEFAULT_TONE_PARAMS.contrast,
    highlights = DEFAULT_TONE_PARAMS.highlights,
    shadows = DEFAULT_TONE_PARAMS.shadows,
    whites = DEFAULT_TONE_PARAMS.whites,
    blacks = DEFAULT_TONE_PARAMS.blacks,
  } = params;

  const lut = new Uint8Array(256);
  
  const expFactor = Math.pow(2, (Number(exposure) || 0) / 50);
  const ctr = Number(contrast) || 0;
  const contrastFactor = (259 * (ctr + 255)) / (255 * (259 - ctr));
  const blackPoint = -(Number(blacks) || 0) * 0.002;
  const whitePoint = 1 - (Number(whites) || 0) * 0.002;
  const sFactor = (Number(shadows) || 0) * 0.005;
  const hFactor = (Number(highlights) || 0) * 0.005;

  for (let i = 0; i < 256; i++) {
    let val = i / 255;
    val *= expFactor;
    val = (val - 0.5) * contrastFactor + 0.5;
    if (whitePoint !== blackPoint) {
      val = (val - blackPoint) / (whitePoint - blackPoint);
    }
    if (sFactor !== 0) {
      val += sFactor * Math.pow(1 - val, 2) * val * 4;
    }
    if (hFactor !== 0) {
      val += hFactor * Math.pow(val, 2) * (1 - val) * 4;
    }
    lut[i] = Math.min(255, Math.max(0, Math.round(val * 255)));
  }

  return lut;
}

export function applyToneMapping(value, params = {}) {
  const lut = buildToneLUT(params);
  return lut[Math.min(255, Math.max(0, Math.round(value)))];
}
