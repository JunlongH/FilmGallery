/**
 * GLSL Film Curve Functions
 * 
 * 胶片特性曲线（H&D 密度模型）
 * 用于模拟胶片的密度-曝光响应特性
 */

const FILM_CURVE_GLSL = `
// ============================================================================
// Film Curve: H&D Density Model
// ============================================================================

// Film Curve: Apply H&D density model to transmittance
// 
// This function models the characteristic curve of photographic film:
// - Input: transmittance value (light passing through the negative)
// - Output: adjusted transmittance (NOT inverted), inversion happens separately
//
// The H&D (Hurter-Driffield) curve describes how film responds to exposure:
// - dMin: minimum density (clear film base)
// - dMax: maximum density (fully exposed)
// - gamma: slope of the linear portion (contrast)
//
float applyFilmCurve(float value) {
  if (u_filmCurveEnabled == 0) return value;
  
  float gamma = u_filmCurveGamma;
  float dMin = u_filmCurveDMin;
  float dMax = u_filmCurveDMax;
  
  // 1. Normalize input (avoid log(0))
  float normalized = clamp(value, 0.001, 1.0);
  
  // 2. Calculate density: D = -log10(T)
  // Using change of base: log10(x) = log(x) / log(10)
  float density = -log(normalized) / log(10.0);
  
  // 3. Normalize density to dMin-dMax range
  float densityNorm = clamp((density - dMin) / (dMax - dMin), 0.0, 1.0);
  
  // 4. Apply gamma curve to adjust density response
  // gamma < 1: softer contrast (toe extension)
  // gamma > 1: harder contrast (shoulder compression)
  float gammaApplied = pow(densityNorm, gamma);
  
  // 5. Convert adjusted normalized density back to density value
  float adjustedDensity = dMin + gammaApplied * (dMax - dMin);
  
  // 6. Convert density back to transmittance: T = 10^(-D)
  float outputT = pow(10.0, -adjustedDensity);
  
  return clamp(outputT, 0.0, 1.0);
}
`;

module.exports = {
  FILM_CURVE_GLSL,
};
