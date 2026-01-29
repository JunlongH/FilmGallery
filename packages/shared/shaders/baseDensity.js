/**
 * GLSL Base Density Correction Functions
 * 
 * 片基校正处理（密度域减法模式 / 线性增益模式）
 * 以及密度域自动电平（Density Levels）
 */

const BASE_DENSITY_GLSL = `
// ============================================================================
// Base Density Correction
// ============================================================================

// Correct for film base color (orange mask for C-41, etc.)
//
// Two modes:
// - Linear (u_baseMode == 0): Simple RGB gain multiplication
// - Log (u_baseMode == 1): Density domain subtraction (more accurate)
//
vec3 applyBaseDensityCorrection(vec3 col) {
  if (u_baseMode == 1) {
    // Log mode: density domain subtraction
    // D = -log10(T), then subtract base density, then convert back
    float minT = 0.001;
    float log10 = log(10.0);
    
    // Red channel
    float Tr = max(col.r, minT);
    float Dr = -log(Tr) / log10;
    float Dr_corrected = Dr - u_baseDensity.r;
    col.r = pow(10.0, -Dr_corrected);
    
    // Green channel
    float Tg = max(col.g, minT);
    float Dg = -log(Tg) / log10;
    float Dg_corrected = Dg - u_baseDensity.g;
    col.g = pow(10.0, -Dg_corrected);
    
    // Blue channel
    float Tb = max(col.b, minT);
    float Db = -log(Tb) / log10;
    float Db_corrected = Db - u_baseDensity.b;
    col.b = pow(10.0, -Db_corrected);
    
    col = clamp(col, 0.0, 1.0);
  } else {
    // Linear mode: simple gain multiplication (legacy compatible)
    col = col * u_baseGains;
    col = clamp(col, 0.0, 1.0);
  }
  
  return col;
}

// ============================================================================
// Density Levels (Log Domain Auto-Levels)
// ============================================================================

// Map detected [Dmin, Dmax] to standard output range
// targetRange = 2.2 balances 8-bit output capability (~2.4) with typical film range
//
vec3 applyDensityLevels(vec3 col) {
  if (u_densityLevelsEnabled == 0) return col;
  
  float minT = 0.001;
  float log10 = log(10.0);
  float targetRange = 2.2; // Output density range (matches 8-bit dynamic range)
  
  // Red channel
  float Tr = max(col.r, minT);
  float Dr = -log(Tr) / log10;
  float rangeR = u_densityLevelsMax.r - u_densityLevelsMin.r;
  if (rangeR > 0.001) {
    // Map [Dmin, Dmax] -> [0, targetRange]
    float normR = clamp((Dr - u_densityLevelsMin.r) / rangeR, 0.0, 1.0);
    float DrNew = normR * targetRange;
    col.r = pow(10.0, -DrNew);
  }
  
  // Green channel
  float Tg = max(col.g, minT);
  float Dg = -log(Tg) / log10;
  float rangeG = u_densityLevelsMax.g - u_densityLevelsMin.g;
  if (rangeG > 0.001) {
    float normG = clamp((Dg - u_densityLevelsMin.g) / rangeG, 0.0, 1.0);
    float DgNew = normG * targetRange;
    col.g = pow(10.0, -DgNew);
  }
  
  // Blue channel
  float Tb = max(col.b, minT);
  float Db = -log(Tb) / log10;
  float rangeB = u_densityLevelsMax.b - u_densityLevelsMin.b;
  if (rangeB > 0.001) {
    float normB = clamp((Db - u_densityLevelsMin.b) / rangeB, 0.0, 1.0);
    float DbNew = normB * targetRange;
    col.b = pow(10.0, -DbNew);
  }
  
  return clamp(col, 0.0, 1.0);
}
`;

module.exports = {
  BASE_DENSITY_GLSL,
};
