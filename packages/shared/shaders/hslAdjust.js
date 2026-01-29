/**
 * GLSL HSL Adjustment Functions
 * 
 * 8通道 HSL 调整：红/橙/黄/绿/青/蓝/紫/洋红
 * 每个通道可独立调整色相偏移、饱和度乘数、明度偏移
 */

const HSL_ADJUST_GLSL = `
// ============================================================================
// HSL Channel Weight Calculation
// ============================================================================

// 计算当前色相到目标通道中心的权重
// 使用余弦平滑过渡以避免硬边界
float hslChannelWeight(float hue, float center, float range) {
  // 处理色相环绕（0°和360°相邻）
  float dist = min(abs(hue - center), min(abs(hue - center + 360.0), abs(hue - center - 360.0)));
  if (dist > range) return 0.0;
  // Cosine smooth transition
  return 0.5 * (1.0 + cos(3.14159265 * dist / range));
}

// ============================================================================
// HSL Adjustment Application
// ============================================================================

vec3 applyHSLAdjustment(vec3 color) {
  vec3 hsl = rgb2hsl(color);
  float h = hsl.x;
  float s = hsl.y;
  float l = hsl.z;
  
  float totalHueShift = 0.0;
  float totalSatMult = 1.0;
  float totalLumShift = 0.0;
  float w;
  
  // Red channel (center: 0°, range: 30°)
  w = hslChannelWeight(h, 0.0, 30.0);
  if (w > 0.0) {
    totalHueShift += u_hslRed.x * w;
    totalSatMult *= 1.0 + (u_hslRed.y / 100.0) * w;
    totalLumShift += (u_hslRed.z / 100.0) * 0.5 * w;
  }
  
  // Orange channel (center: 30°, range: 30°)
  w = hslChannelWeight(h, 30.0, 30.0);
  if (w > 0.0) {
    totalHueShift += u_hslOrange.x * w;
    totalSatMult *= 1.0 + (u_hslOrange.y / 100.0) * w;
    totalLumShift += (u_hslOrange.z / 100.0) * 0.5 * w;
  }
  
  // Yellow channel (center: 60°, range: 30°)
  w = hslChannelWeight(h, 60.0, 30.0);
  if (w > 0.0) {
    totalHueShift += u_hslYellow.x * w;
    totalSatMult *= 1.0 + (u_hslYellow.y / 100.0) * w;
    totalLumShift += (u_hslYellow.z / 100.0) * 0.5 * w;
  }
  
  // Green channel (center: 120°, range: 45°) - wider for green tones
  w = hslChannelWeight(h, 120.0, 45.0);
  if (w > 0.0) {
    totalHueShift += u_hslGreen.x * w;
    totalSatMult *= 1.0 + (u_hslGreen.y / 100.0) * w;
    totalLumShift += (u_hslGreen.z / 100.0) * 0.5 * w;
  }
  
  // Cyan channel (center: 180°, range: 30°)
  w = hslChannelWeight(h, 180.0, 30.0);
  if (w > 0.0) {
    totalHueShift += u_hslCyan.x * w;
    totalSatMult *= 1.0 + (u_hslCyan.y / 100.0) * w;
    totalLumShift += (u_hslCyan.z / 100.0) * 0.5 * w;
  }
  
  // Blue channel (center: 240°, range: 45°) - wider for blue tones
  w = hslChannelWeight(h, 240.0, 45.0);
  if (w > 0.0) {
    totalHueShift += u_hslBlue.x * w;
    totalSatMult *= 1.0 + (u_hslBlue.y / 100.0) * w;
    totalLumShift += (u_hslBlue.z / 100.0) * 0.5 * w;
  }
  
  // Purple channel (center: 280°, range: 30°)
  w = hslChannelWeight(h, 280.0, 30.0);
  if (w > 0.0) {
    totalHueShift += u_hslPurple.x * w;
    totalSatMult *= 1.0 + (u_hslPurple.y / 100.0) * w;
    totalLumShift += (u_hslPurple.z / 100.0) * 0.5 * w;
  }
  
  // Magenta channel (center: 320°, range: 30°)
  w = hslChannelWeight(h, 320.0, 30.0);
  if (w > 0.0) {
    totalHueShift += u_hslMagenta.x * w;
    totalSatMult *= 1.0 + (u_hslMagenta.y / 100.0) * w;
    totalLumShift += (u_hslMagenta.z / 100.0) * 0.5 * w;
  }
  
  // Apply accumulated adjustments
  h = mod(h + totalHueShift, 360.0);
  s = clamp(s * totalSatMult, 0.0, 1.0);
  l = clamp(l + totalLumShift, 0.0, 1.0);
  
  return hsl2rgb(vec3(h, s, l));
}
`;

module.exports = {
  HSL_ADJUST_GLSL,
};
