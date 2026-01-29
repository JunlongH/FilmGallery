/**
 * useFilmLabState Hook
 * 
 * 集中管理 FilmLab 的所有状态变量
 * 提供状态初始化、重置、序列化/反序列化功能
 * 
 * @module hooks/useFilmLabState
 * @since 2026-01-29
 */

import { useState, useCallback, useMemo } from 'react';

// ============================================================================
// Default Values
// ============================================================================

export const DEFAULT_HSL_PARAMS = {
  red: { hue: 0, saturation: 0, luminance: 0 },
  orange: { hue: 0, saturation: 0, luminance: 0 },
  yellow: { hue: 0, saturation: 0, luminance: 0 },
  green: { hue: 0, saturation: 0, luminance: 0 },
  cyan: { hue: 0, saturation: 0, luminance: 0 },
  blue: { hue: 0, saturation: 0, luminance: 0 },
  purple: { hue: 0, saturation: 0, luminance: 0 },
  magenta: { hue: 0, saturation: 0, luminance: 0 },
};

export const DEFAULT_SPLIT_TONE_PARAMS = {
  highlights: { hue: 30, saturation: 0 },
  midtones: { hue: 0, saturation: 0 },
  shadows: { hue: 220, saturation: 0 },
  balance: 0,
};

export const DEFAULT_CURVES = {
  rgb: [{ x: 0, y: 0 }, { x: 1, y: 1 }],
  red: [{ x: 0, y: 0 }, { x: 1, y: 1 }],
  green: [{ x: 0, y: 0 }, { x: 1, y: 1 }],
  blue: [{ x: 0, y: 0 }, { x: 1, y: 1 }],
};

export const DEFAULT_DENSITY_LEVELS = {
  minR: 0, maxR: 2.4,
  minG: 0, maxG: 2.4,
  minB: 0, maxB: 2.4,
};

export const DEFAULT_CROP = { x: 0, y: 0, w: 1, h: 1 };

// ============================================================================
// State Categories
// ============================================================================

/**
 * 基础色调参数初始状态
 */
const INITIAL_TONE_STATE = {
  exposure: 0,
  contrast: 0,
  highlights: 0,
  shadows: 0,
  whites: 0,
  blacks: 0,
};

/**
 * 白平衡参数初始状态
 */
const INITIAL_WB_STATE = {
  temp: 0,
  tint: 0,
  red: 1.0,
  green: 1.0,
  blue: 1.0,
};

/**
 * 片基校正参数初始状态
 */
const INITIAL_BASE_STATE = {
  baseMode: 'log',
  baseRed: 1.0,
  baseGreen: 1.0,
  baseBlue: 1.0,
  baseDensityR: 0.0,
  baseDensityG: 0.0,
  baseDensityB: 0.0,
};

/**
 * 反转参数初始状态
 */
const INITIAL_INVERSION_STATE = {
  inverted: false,
  inversionMode: 'linear',
};

/**
 * 胶片曲线参数初始状态
 */
const INITIAL_FILM_CURVE_STATE = {
  filmCurveEnabled: false,
  filmCurveProfile: 'default',
};

/**
 * 几何变换参数初始状态
 */
const INITIAL_GEOMETRY_STATE = {
  rotation: 0,
  orientation: 0,
  cropRect: { ...DEFAULT_CROP },
  committedCrop: { ...DEFAULT_CROP },
  ratioMode: 'free',
  ratioSwap: false,
};

// ============================================================================
// Hook Implementation
// ============================================================================

/**
 * FilmLab 状态管理 Hook
 * 
 * @param {Object} options - 配置选项
 * @param {Object} options.initialParams - 初始参数（从预设或历史加载）
 * @returns {Object} 状态和状态操作函数
 */
export function useFilmLabState(options = {}) {
  const { initialParams = {} } = options;

  // ============================================================================
  // Tone State
  // ============================================================================
  const [exposure, setExposure] = useState(initialParams.exposure ?? INITIAL_TONE_STATE.exposure);
  const [contrast, setContrast] = useState(initialParams.contrast ?? INITIAL_TONE_STATE.contrast);
  const [highlights, setHighlights] = useState(initialParams.highlights ?? INITIAL_TONE_STATE.highlights);
  const [shadows, setShadows] = useState(initialParams.shadows ?? INITIAL_TONE_STATE.shadows);
  const [whites, setWhites] = useState(initialParams.whites ?? INITIAL_TONE_STATE.whites);
  const [blacks, setBlacks] = useState(initialParams.blacks ?? INITIAL_TONE_STATE.blacks);

  // ============================================================================
  // White Balance State
  // ============================================================================
  const [temp, setTemp] = useState(initialParams.temp ?? INITIAL_WB_STATE.temp);
  const [tint, setTint] = useState(initialParams.tint ?? INITIAL_WB_STATE.tint);
  const [red, setRed] = useState(initialParams.red ?? INITIAL_WB_STATE.red);
  const [green, setGreen] = useState(initialParams.green ?? INITIAL_WB_STATE.green);
  const [blue, setBlue] = useState(initialParams.blue ?? INITIAL_WB_STATE.blue);

  // ============================================================================
  // Base Correction State
  // ============================================================================
  const [baseMode, setBaseMode] = useState(initialParams.baseMode ?? INITIAL_BASE_STATE.baseMode);
  const [baseRed, setBaseRed] = useState(initialParams.baseRed ?? INITIAL_BASE_STATE.baseRed);
  const [baseGreen, setBaseGreen] = useState(initialParams.baseGreen ?? INITIAL_BASE_STATE.baseGreen);
  const [baseBlue, setBaseBlue] = useState(initialParams.baseBlue ?? INITIAL_BASE_STATE.baseBlue);
  const [baseDensityR, setBaseDensityR] = useState(initialParams.baseDensityR ?? INITIAL_BASE_STATE.baseDensityR);
  const [baseDensityG, setBaseDensityG] = useState(initialParams.baseDensityG ?? INITIAL_BASE_STATE.baseDensityG);
  const [baseDensityB, setBaseDensityB] = useState(initialParams.baseDensityB ?? INITIAL_BASE_STATE.baseDensityB);

  // ============================================================================
  // Inversion State
  // ============================================================================
  const [inverted, setInverted] = useState(initialParams.inverted ?? INITIAL_INVERSION_STATE.inverted);
  const [inversionMode, setInversionMode] = useState(initialParams.inversionMode ?? INITIAL_INVERSION_STATE.inversionMode);

  // ============================================================================
  // Film Curve State
  // ============================================================================
  const [filmCurveEnabled, setFilmCurveEnabled] = useState(initialParams.filmCurveEnabled ?? INITIAL_FILM_CURVE_STATE.filmCurveEnabled);
  const [filmCurveProfile, setFilmCurveProfile] = useState(initialParams.filmCurveProfile ?? INITIAL_FILM_CURVE_STATE.filmCurveProfile);

  // ============================================================================
  // Geometry State
  // ============================================================================
  const [rotation, setRotation] = useState(initialParams.rotation ?? INITIAL_GEOMETRY_STATE.rotation);
  const [orientation, setOrientation] = useState(initialParams.orientation ?? INITIAL_GEOMETRY_STATE.orientation);
  const [cropRect, setCropRect] = useState(initialParams.cropRect ?? { ...DEFAULT_CROP });
  const [committedCrop, setCommittedCrop] = useState(initialParams.committedCrop ?? { ...DEFAULT_CROP });
  const [ratioMode, setRatioMode] = useState(initialParams.ratioMode ?? 'free');
  const [ratioSwap, setRatioSwap] = useState(initialParams.ratioSwap ?? false);

  // ============================================================================
  // Complex State (Objects)
  // ============================================================================
  const [curves, setCurves] = useState(initialParams.curves ?? { ...DEFAULT_CURVES });
  const [hslParams, setHslParams] = useState(initialParams.hslParams ?? { ...DEFAULT_HSL_PARAMS });
  const [splitToning, setSplitToning] = useState(initialParams.splitToning ?? { ...DEFAULT_SPLIT_TONE_PARAMS });
  const [densityLevels, setDensityLevels] = useState(initialParams.densityLevels ?? { ...DEFAULT_DENSITY_LEVELS });
  const [densityLevelsEnabled, setDensityLevelsEnabled] = useState(initialParams.densityLevelsEnabled ?? false);

  // ============================================================================
  // Serialization
  // ============================================================================
  
  /**
   * 将当前状态序列化为可保存的对象
   */
  const serializeState = useCallback(() => {
    return {
      // Tone
      exposure, contrast, highlights, shadows, whites, blacks,
      // White Balance
      temp, tint, red, green, blue,
      // Base Correction
      baseMode, baseRed, baseGreen, baseBlue,
      baseDensityR, baseDensityG, baseDensityB,
      // Inversion
      inverted, inversionMode,
      // Film Curve
      filmCurveEnabled, filmCurveProfile,
      // Geometry
      rotation, orientation, committedCrop, ratioMode, ratioSwap,
      // Complex
      curves, hslParams, splitToning, densityLevels, densityLevelsEnabled,
    };
  }, [
    exposure, contrast, highlights, shadows, whites, blacks,
    temp, tint, red, green, blue,
    baseMode, baseRed, baseGreen, baseBlue,
    baseDensityR, baseDensityG, baseDensityB,
    inverted, inversionMode,
    filmCurveEnabled, filmCurveProfile,
    rotation, orientation, committedCrop, ratioMode, ratioSwap,
    curves, hslParams, splitToning, densityLevels, densityLevelsEnabled,
  ]);

  /**
   * 从保存的对象恢复状态
   */
  const deserializeState = useCallback((params) => {
    if (!params) return;
    
    // Tone
    if (params.exposure !== undefined) setExposure(params.exposure);
    if (params.contrast !== undefined) setContrast(params.contrast);
    if (params.highlights !== undefined) setHighlights(params.highlights);
    if (params.shadows !== undefined) setShadows(params.shadows);
    if (params.whites !== undefined) setWhites(params.whites);
    if (params.blacks !== undefined) setBlacks(params.blacks);
    
    // White Balance
    if (params.temp !== undefined) setTemp(params.temp);
    if (params.tint !== undefined) setTint(params.tint);
    if (params.red !== undefined) setRed(params.red);
    if (params.green !== undefined) setGreen(params.green);
    if (params.blue !== undefined) setBlue(params.blue);
    
    // Base Correction
    if (params.baseMode !== undefined) setBaseMode(params.baseMode);
    if (params.baseRed !== undefined) setBaseRed(params.baseRed);
    if (params.baseGreen !== undefined) setBaseGreen(params.baseGreen);
    if (params.baseBlue !== undefined) setBaseBlue(params.baseBlue);
    if (params.baseDensityR !== undefined) setBaseDensityR(params.baseDensityR);
    if (params.baseDensityG !== undefined) setBaseDensityG(params.baseDensityG);
    if (params.baseDensityB !== undefined) setBaseDensityB(params.baseDensityB);
    
    // Inversion
    if (params.inverted !== undefined) setInverted(params.inverted);
    if (params.inversionMode !== undefined) setInversionMode(params.inversionMode);
    
    // Film Curve
    if (params.filmCurveEnabled !== undefined) setFilmCurveEnabled(params.filmCurveEnabled);
    if (params.filmCurveProfile !== undefined) setFilmCurveProfile(params.filmCurveProfile);
    
    // Geometry
    if (params.rotation !== undefined) setRotation(params.rotation);
    if (params.orientation !== undefined) setOrientation(params.orientation);
    if (params.committedCrop) {
      setCommittedCrop(params.committedCrop);
      setCropRect(params.committedCrop);
    }
    if (params.ratioMode !== undefined) setRatioMode(params.ratioMode);
    if (params.ratioSwap !== undefined) setRatioSwap(params.ratioSwap);
    
    // Complex
    if (params.curves) setCurves({ ...DEFAULT_CURVES, ...params.curves });
    if (params.hslParams) setHslParams({ ...DEFAULT_HSL_PARAMS, ...params.hslParams });
    if (params.splitToning) setSplitToning({ ...DEFAULT_SPLIT_TONE_PARAMS, ...params.splitToning });
    if (params.densityLevels) setDensityLevels({ ...DEFAULT_DENSITY_LEVELS, ...params.densityLevels });
    if (params.densityLevelsEnabled !== undefined) setDensityLevelsEnabled(params.densityLevelsEnabled);
  }, []);

  /**
   * 重置所有状态到默认值
   */
  const resetAllState = useCallback(() => {
    // Tone
    setExposure(INITIAL_TONE_STATE.exposure);
    setContrast(INITIAL_TONE_STATE.contrast);
    setHighlights(INITIAL_TONE_STATE.highlights);
    setShadows(INITIAL_TONE_STATE.shadows);
    setWhites(INITIAL_TONE_STATE.whites);
    setBlacks(INITIAL_TONE_STATE.blacks);
    
    // White Balance
    setTemp(INITIAL_WB_STATE.temp);
    setTint(INITIAL_WB_STATE.tint);
    setRed(INITIAL_WB_STATE.red);
    setGreen(INITIAL_WB_STATE.green);
    setBlue(INITIAL_WB_STATE.blue);
    
    // Base Correction
    setBaseMode(INITIAL_BASE_STATE.baseMode);
    setBaseRed(INITIAL_BASE_STATE.baseRed);
    setBaseGreen(INITIAL_BASE_STATE.baseGreen);
    setBaseBlue(INITIAL_BASE_STATE.baseBlue);
    setBaseDensityR(INITIAL_BASE_STATE.baseDensityR);
    setBaseDensityG(INITIAL_BASE_STATE.baseDensityG);
    setBaseDensityB(INITIAL_BASE_STATE.baseDensityB);
    
    // Inversion
    setInverted(INITIAL_INVERSION_STATE.inverted);
    setInversionMode(INITIAL_INVERSION_STATE.inversionMode);
    
    // Film Curve
    setFilmCurveEnabled(INITIAL_FILM_CURVE_STATE.filmCurveEnabled);
    setFilmCurveProfile(INITIAL_FILM_CURVE_STATE.filmCurveProfile);
    
    // Geometry
    setRotation(INITIAL_GEOMETRY_STATE.rotation);
    setOrientation(INITIAL_GEOMETRY_STATE.orientation);
    setCropRect({ ...DEFAULT_CROP });
    setCommittedCrop({ ...DEFAULT_CROP });
    setRatioMode(INITIAL_GEOMETRY_STATE.ratioMode);
    setRatioSwap(INITIAL_GEOMETRY_STATE.ratioSwap);
    
    // Complex
    setCurves({ ...DEFAULT_CURVES });
    setHslParams({ ...DEFAULT_HSL_PARAMS });
    setSplitToning({ ...DEFAULT_SPLIT_TONE_PARAMS });
    setDensityLevels({ ...DEFAULT_DENSITY_LEVELS });
    setDensityLevelsEnabled(false);
  }, []);

  // ============================================================================
  // Computed Values
  // ============================================================================
  
  /**
   * 检查是否有任何参数被修改
   */
  const hasModifications = useMemo(() => {
    return (
      exposure !== 0 || contrast !== 0 || highlights !== 0 || shadows !== 0 ||
      whites !== 0 || blacks !== 0 || temp !== 0 || tint !== 0 ||
      red !== 1.0 || green !== 1.0 || blue !== 1.0 ||
      rotation !== 0 || orientation !== 0 ||
      committedCrop.x !== 0 || committedCrop.y !== 0 ||
      committedCrop.w !== 1 || committedCrop.h !== 1 ||
      inverted || filmCurveEnabled || densityLevelsEnabled
    );
  }, [
    exposure, contrast, highlights, shadows, whites, blacks,
    temp, tint, red, green, blue,
    rotation, orientation, committedCrop,
    inverted, filmCurveEnabled, densityLevelsEnabled,
  ]);

  return {
    // Tone
    exposure, setExposure,
    contrast, setContrast,
    highlights, setHighlights,
    shadows, setShadows,
    whites, setWhites,
    blacks, setBlacks,
    
    // White Balance
    temp, setTemp,
    tint, setTint,
    red, setRed,
    green, setGreen,
    blue, setBlue,
    
    // Base Correction
    baseMode, setBaseMode,
    baseRed, setBaseRed,
    baseGreen, setBaseGreen,
    baseBlue, setBaseBlue,
    baseDensityR, setBaseDensityR,
    baseDensityG, setBaseDensityG,
    baseDensityB, setBaseDensityB,
    
    // Inversion
    inverted, setInverted,
    inversionMode, setInversionMode,
    
    // Film Curve
    filmCurveEnabled, setFilmCurveEnabled,
    filmCurveProfile, setFilmCurveProfile,
    
    // Geometry
    rotation, setRotation,
    orientation, setOrientation,
    cropRect, setCropRect,
    committedCrop, setCommittedCrop,
    ratioMode, setRatioMode,
    ratioSwap, setRatioSwap,
    
    // Complex
    curves, setCurves,
    hslParams, setHslParams,
    splitToning, setSplitToning,
    densityLevels, setDensityLevels,
    densityLevelsEnabled, setDensityLevelsEnabled,
    
    // Utilities
    serializeState,
    deserializeState,
    resetAllState,
    hasModifications,
  };
}

export default useFilmLabState;
