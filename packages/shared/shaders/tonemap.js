/**
 * GLSL Tone Mapping Functions
 * 
 * 色调映射：对比度、曝光、高光/阴影、白/黑电平、曲线LUT
 */

const TONEMAP_GLSL = `
// ============================================================================
// Contrast
// ============================================================================

// Apply contrast adjustment using standard formula
// contrast range: -100 to +100, mapped to factor
vec3 applyContrast(vec3 c, float contrast) {
  // Convert from -100..100 to a factor
  float factor = (259.0 * (contrast + 255.0)) / (255.0 * (259.0 - contrast));
  return (c - vec3(0.5)) * factor + vec3(0.5);
}

// ============================================================================
// Highlights & Shadows
// ============================================================================

// Highlights/Shadows recovery using quadratic falloff
// shadows: affects dark regions (luminance < 0.5)
// highlights: affects bright regions (luminance > 0.5)
vec3 applyHighlightsShadows(vec3 c) {
  float sFactor = u_shadows * 0.005;    // Scale to reasonable range
  float hFactor = u_highlights * 0.005;
  
  // Shadow lift: stronger effect on darker values
  if (sFactor != 0.0) {
    c += sFactor * pow(1.0 - c, vec3(2.0)) * c * 4.0;
  }
  
  // Highlight pull: stronger effect on brighter values
  if (hFactor != 0.0) {
    c += hFactor * pow(c, vec3(2.0)) * (1.0 - c) * 4.0;
  }
  
  return c;
}

// ============================================================================
// Whites & Blacks (Level Adjustment)
// ============================================================================

// Adjust black and white points
// whites: compresses highlights (positive = more headroom)
// blacks: lifts shadows (positive = crushed blacks)
vec3 applyWhitesBlacks(vec3 c) {
  float blackPoint = -(u_blacks) * 0.002;
  float whitePoint = 1.0 - (u_whites) * 0.002;
  
  if (whitePoint != blackPoint) {
    c = (c - vec3(blackPoint)) / (whitePoint - blackPoint);
  }
  
  return c;
}

// ============================================================================
// 1D Curve LUT Sampling
// ============================================================================

// Sample a single 1D curve LUT
float sampleCurve(sampler2D t, float v) {
  return texture2D(t, vec2(v, 0.5)).r;
}

// Apply RGB and per-channel curves
vec3 applyCurvesLUT(vec3 c) {
  // First apply master RGB curve
  float r = sampleCurve(u_curveRGB, c.r);
  float g = sampleCurve(u_curveRGB, c.g);
  float b = sampleCurve(u_curveRGB, c.b);
  
  // Then apply individual channel curves
  r = sampleCurve(u_curveR, r);
  g = sampleCurve(u_curveG, g);
  b = sampleCurve(u_curveB, b);
  
  return vec3(r, g, b);
}
`;

module.exports = {
  TONEMAP_GLSL,
};
