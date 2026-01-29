/**
 * GLSL Split Toning Functions
 * 
 * 分离色调处理：高光/中间调/阴影着色
 * 支持独立的色相和饱和度控制，以及整体平衡调整
 */

const SPLIT_TONE_GLSL = `
// ============================================================================
// Split Toning
// ============================================================================

vec3 applySplitToning(vec3 color) {
  float lum = calcLuminance(color);
  
  // Calculate zone boundaries with balance adjustment
  // balance [-1, 1] shifts the midpoint, affecting shadow/highlight distribution
  float shadowEnd = 0.25 + u_splitBalance * 0.15;
  float highlightStart = 0.75 + u_splitBalance * 0.15;
  float midpoint = 0.5 + u_splitBalance * 0.15;
  
  // Smooth zone transitions using smoothstep
  float shadowWeight = 1.0 - smoothstep(shadowEnd - 0.15, shadowEnd + 0.15, lum);
  float highlightWeight = smoothstep(highlightStart - 0.15, highlightStart + 0.15, lum);
  
  // Midtone weight: strongest in the middle zone, fading towards shadow/highlight zones
  float midtoneWeight = 1.0 - smoothstep(0.0, shadowEnd + 0.1, abs(lum - midpoint));
  midtoneWeight *= (1.0 - shadowWeight) * (1.0 - highlightWeight);
  midtoneWeight = clamp(midtoneWeight * 2.0, 0.0, 1.0);
  
  // Convert hue (0-1) to RGB tint colors
  // Tint is created at L=0.5, S=1.0 for maximum color saturation
  vec3 highlightTint = hsl2rgb(vec3(u_highlightHue * 360.0, 1.0, 0.5));
  vec3 midtoneTint = hsl2rgb(vec3(u_midtoneHue * 360.0, 1.0, 0.5));
  vec3 shadowTint = hsl2rgb(vec3(u_shadowHue * 360.0, 1.0, 0.5));
  
  vec3 result = color;
  
  // Apply shadow tint
  if (shadowWeight > 0.0 && u_shadowSat > 0.0) {
    // Multiply blend with normalization (*2.0 because tint is at L=0.5)
    vec3 tinted = result * shadowTint * 2.0;
    result = mix(result, tinted, shadowWeight * u_shadowSat);
  }
  
  // Apply midtone tint
  if (midtoneWeight > 0.0 && u_midtoneSat > 0.0) {
    vec3 tinted = result * midtoneTint * 2.0;
    result = mix(result, tinted, midtoneWeight * u_midtoneSat);
  }
  
  // Apply highlight tint
  if (highlightWeight > 0.0 && u_highlightSat > 0.0) {
    vec3 tinted = result * highlightTint * 2.0;
    result = mix(result, tinted, highlightWeight * u_highlightSat);
  }
  
  return clamp(result, 0.0, 1.0);
}
`;

module.exports = {
  SPLIT_TONE_GLSL,
};
