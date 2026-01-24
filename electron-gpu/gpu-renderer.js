'use strict';
const { ipcRenderer } = require('electron');

let gl, canvas, isWebGL2 = false;

// ============================================================================
// White Balance Calculation (must match server/utils/filmlab-wb.js and client/wb.js)
// ============================================================================
function clampGain(v, min, max) { return Math.max(min, Math.min(max, v)); }

function computeWBGains(params = {}, opts = {}) {
  const red = Number.isFinite(params.red) ? params.red : 1;
  const green = Number.isFinite(params.green) ? params.green : 1;
  const blue = Number.isFinite(params.blue) ? params.blue : 1;
  const temp = Number.isFinite(params.temp) ? params.temp : 0;
  const tint = Number.isFinite(params.tint) ? params.tint : 0;
  const minGain = opts.minGain ?? 0.05;
  const maxGain = opts.maxGain ?? 50.0;
  
  // temp/tint model (matches client wb.js):
  // temp > 0 → warmer (boost red, reduce blue)
  // temp < 0 → cooler (boost blue, reduce red)
  // tint > 0 → more magenta (boost red/blue, reduce green)
  // tint < 0 → more green (boost green, reduce red/blue)
  const t = temp / 100;
  const n = tint / 100;
  
  let r = red * (1 + t * 0.5 + n * 0.3);
  let g = green * (1 - n * 0.5);
  let b = blue * (1 - t * 0.5 + n * 0.3);
  
  r = clampGain(r, minGain, maxGain);
  g = clampGain(g, minGain, maxGain);
  b = clampGain(b, minGain, maxGain);
  return [r, g, b];
}

function initGL() {
  canvas = document.getElementById('glc');
  const attribs = { preserveDrawingBuffer: true, premultipliedAlpha: false, alpha: false, antialias: false };
  gl = canvas.getContext('webgl2', attribs);
  isWebGL2 = !!gl;
  if (!gl) gl = canvas.getContext('webgl', attribs);
  if (!gl) {
    console.error('WebGL not available');
    return false;
  }
  return true;
}

function createShader(gl, type, src) {
  const sh = gl.createShader(type);
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(sh);
    gl.deleteShader(sh);
    throw new Error('Shader compile failed: ' + log);
  }
  return sh;
}

function createProgram(gl, vsSrc, fsSrc) {
  const vs = createShader(gl, gl.VERTEX_SHADER, vsSrc);
  const fs = createShader(gl, gl.FRAGMENT_SHADER, fsSrc);
  const prog = gl.createProgram();
  gl.attachShader(prog, vs);
  gl.attachShader(prog, fs);
  gl.linkProgram(prog);
  // Shaders are no longer needed after linking
  gl.deleteShader(vs);
  gl.deleteShader(fs);
  
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
    const log = gl.getProgramInfoLog(prog);
    gl.deleteProgram(prog);
    throw new Error('Program link failed: ' + log);
  }
  return prog;
}

const VS_GL2 = `#version 300 es
  in vec2 a_pos;
  in vec2 a_uv;
  out vec2 v_uv;
  void main(){
    v_uv = a_uv;
    gl_Position = vec4(a_pos, 0.0, 1.0);
  }
`;

const FS_GL2 = `#version 300 es
  precision highp float;
  precision highp sampler3D;
  
  in vec2 v_uv;
  out vec4 fragColor;
  
  uniform sampler2D u_tex;
  uniform sampler2D u_toneCurveTex;
  uniform sampler3D u_lut3d;
  uniform float u_hasLut3d;
  uniform float u_lut3dSize;

  uniform float u_inverted;
  uniform float u_logMode;
  uniform vec3 u_gains;
  uniform float u_exposure;
  uniform float u_contrast;
  uniform float u_highlights;
  uniform float u_shadows;
  uniform float u_whites;
  uniform float u_blacks;

  // Film Curve parameters
  uniform float u_filmCurveEnabled;
  uniform float u_filmCurveGamma;
  uniform float u_filmCurveDMin;
  uniform float u_filmCurveDMax;

  // Film Base Correction (Pre-Inversion)
  uniform float u_baseMode; // 0 = linear (gains), 1 = log (density subtraction)
  uniform vec3 u_baseGains; // Linear mode: r,g,b gains
  uniform vec3 u_baseDensity; // Log mode: r,g,b density values to subtract

  // HSL parameters (8 channels: red, orange, yellow, green, cyan, blue, purple, magenta)
  uniform vec3 u_hslRed;
  uniform vec3 u_hslOrange;
  uniform vec3 u_hslYellow;
  uniform vec3 u_hslGreen;
  uniform vec3 u_hslCyan;
  uniform vec3 u_hslBlue;
  uniform vec3 u_hslPurple;
  uniform vec3 u_hslMagenta;

  // Split Toning parameters
  uniform float u_splitHighlightHue;
  uniform float u_splitHighlightSat;
  uniform float u_splitMidtoneHue;
  uniform float u_splitMidtoneSat;
  uniform float u_splitShadowHue;
  uniform float u_splitShadowSat;
  uniform float u_splitBalance;

  // HSL helper functions
  vec3 rgb2hsl(vec3 color) {
    float maxC = max(max(color.r, color.g), color.b);
    float minC = min(min(color.r, color.g), color.b);
    float delta = maxC - minC;
    float L = (maxC + minC) * 0.5;
    float H = 0.0;
    float S = 0.0;
    if (delta > 0.001) {
      S = (L < 0.5) ? (delta / (maxC + minC)) : (delta / (2.0 - maxC - minC));
      if (maxC == color.r) {
        H = (color.g - color.b) / delta + (color.g < color.b ? 6.0 : 0.0);
      } else if (maxC == color.g) {
        H = (color.b - color.r) / delta + 2.0;
      } else {
        H = (color.r - color.g) / delta + 4.0;
      }
      H *= 60.0;
    }
    return vec3(H, S, L);
  }

  float hue2rgb(float p, float q, float t) {
    if (t < 0.0) t += 1.0;
    if (t > 1.0) t -= 1.0;
    if (t < 1.0/6.0) return p + (q - p) * 6.0 * t;
    if (t < 0.5) return q;
    if (t < 2.0/3.0) return p + (q - p) * (2.0/3.0 - t) * 6.0;
    return p;
  }

  vec3 hsl2rgb(vec3 hsl) {
    float h = hsl.x / 360.0;
    float s = hsl.y;
    float l = hsl.z;
    if (s < 0.001) return vec3(l);
    float q = (l < 0.5) ? (l * (1.0 + s)) : (l + s - l * s);
    float p = 2.0 * l - q;
    return vec3(
      hue2rgb(p, q, h + 1.0/3.0),
      hue2rgb(p, q, h),
      hue2rgb(p, q, h - 1.0/3.0)
    );
  }

  float hslChannelWeight(float hue, float centerHue) {
    float dist = min(abs(hue - centerHue), 360.0 - abs(hue - centerHue));
    return max(0.0, 1.0 - dist / 30.0);
  }

  vec3 applyHSLAdjustment(vec3 color) {
    vec3 hsl = rgb2hsl(color);
    float h = hsl.x;
    float totalHueShift = 0.0;
    float totalSatMult = 1.0;
    float totalLumShift = 0.0;
    float totalWeight = 0.0;
    
    // Red (0°)
    float w = hslChannelWeight(h, 0.0);
    if (w > 0.0) {
      totalHueShift += u_hslRed.x * w;
      totalSatMult *= 1.0 + (u_hslRed.y / 100.0) * w;
      totalLumShift += (u_hslRed.z / 100.0) * 0.5 * w;
      totalWeight += w;
    }
    // Orange (30°)
    w = hslChannelWeight(h, 30.0);
    if (w > 0.0) {
      totalHueShift += u_hslOrange.x * w;
      totalSatMult *= 1.0 + (u_hslOrange.y / 100.0) * w;
      totalLumShift += (u_hslOrange.z / 100.0) * 0.5 * w;
      totalWeight += w;
    }
    // Yellow (60°)
    w = hslChannelWeight(h, 60.0);
    if (w > 0.0) {
      totalHueShift += u_hslYellow.x * w;
      totalSatMult *= 1.0 + (u_hslYellow.y / 100.0) * w;
      totalLumShift += (u_hslYellow.z / 100.0) * 0.5 * w;
      totalWeight += w;
    }
    // Green (120°)
    w = hslChannelWeight(h, 120.0);
    if (w > 0.0) {
      totalHueShift += u_hslGreen.x * w;
      totalSatMult *= 1.0 + (u_hslGreen.y / 100.0) * w;
      totalLumShift += (u_hslGreen.z / 100.0) * 0.5 * w;
      totalWeight += w;
    }
    // Cyan (180°)
    w = hslChannelWeight(h, 180.0);
    if (w > 0.0) {
      totalHueShift += u_hslCyan.x * w;
      totalSatMult *= 1.0 + (u_hslCyan.y / 100.0) * w;
      totalLumShift += (u_hslCyan.z / 100.0) * 0.5 * w;
      totalWeight += w;
    }
    // Blue (240°)
    w = hslChannelWeight(h, 240.0);
    if (w > 0.0) {
      totalHueShift += u_hslBlue.x * w;
      totalSatMult *= 1.0 + (u_hslBlue.y / 100.0) * w;
      totalLumShift += (u_hslBlue.z / 100.0) * 0.5 * w;
      totalWeight += w;
    }
    // Purple (270°)
    w = hslChannelWeight(h, 270.0);
    if (w > 0.0) {
      totalHueShift += u_hslPurple.x * w;
      totalSatMult *= 1.0 + (u_hslPurple.y / 100.0) * w;
      totalLumShift += (u_hslPurple.z / 100.0) * 0.5 * w;
      totalWeight += w;
    }
    // Magenta (300°)
    w = hslChannelWeight(h, 300.0);
    if (w > 0.0) {
      totalHueShift += u_hslMagenta.x * w;
      totalSatMult *= 1.0 + (u_hslMagenta.y / 100.0) * w;
      totalLumShift += (u_hslMagenta.z / 100.0) * 0.5 * w;
      totalWeight += w;
    }

    if (totalWeight > 0.0) {
      hsl.x = mod(hsl.x + totalHueShift, 360.0);
      hsl.y = clamp(hsl.y * totalSatMult, 0.0, 1.0);
      hsl.z = clamp(hsl.z + totalLumShift, 0.0, 1.0);
    }
    return hsl2rgb(hsl);
  }

  float calcLuminance(vec3 c) {
    return 0.299 * c.r + 0.587 * c.g + 0.114 * c.b;
  }

  vec3 applySplitTone(vec3 color) {
    float lum = calcLuminance(color);
    float shadowEnd = 0.25 + u_splitBalance * 0.15;
    float highlightStart = 0.75 + u_splitBalance * 0.15;
    float midpoint = 0.5 + u_splitBalance * 0.15;
    
    float shadowWeight = smoothstep(shadowEnd + 0.1, shadowEnd - 0.1, lum);
    float highlightWeight = smoothstep(highlightStart - 0.1, highlightStart + 0.1, lum);
    
    // Midtone weight: strongest in the middle zone
    float midtoneWeight = 1.0 - smoothstep(0.0, shadowEnd + 0.1, abs(lum - midpoint));
    midtoneWeight *= (1.0 - shadowWeight) * (1.0 - highlightWeight);
    midtoneWeight = clamp(midtoneWeight * 2.0, 0.0, 1.0);
    
    vec3 highlightTint = hsl2rgb(vec3(u_splitHighlightHue * 360.0, 1.0, 0.5));
    vec3 midtoneTint = hsl2rgb(vec3(u_splitMidtoneHue * 360.0, 1.0, 0.5));
    vec3 shadowTint = hsl2rgb(vec3(u_splitShadowHue * 360.0, 1.0, 0.5));
    
    vec3 result = color;
    if (shadowWeight > 0.0 && u_splitShadowSat > 0.0) {
      result = mix(result, result * shadowTint / 0.5, shadowWeight * u_splitShadowSat);
    }
    if (midtoneWeight > 0.0 && u_splitMidtoneSat > 0.0) {
      result = mix(result, result * midtoneTint / 0.5, midtoneWeight * u_splitMidtoneSat);
    }
    if (highlightWeight > 0.0 && u_splitHighlightSat > 0.0) {
      result = mix(result, result * highlightTint / 0.5, highlightWeight * u_splitHighlightSat);
    }
    return clamp(result, 0.0, 1.0);
  }

  // Film Curve: Apply H&D density model to transmittance
  float applyFilmCurve(float value) {
    float gamma = u_filmCurveGamma;
    float dMin = u_filmCurveDMin;
    float dMax = u_filmCurveDMax;
    
    float normalized = clamp(value, 0.001, 1.0);
    float density = -log(normalized) / log(10.0);
    float densityNorm = clamp((density - dMin) / (dMax - dMin), 0.0, 1.0);
    float gammaApplied = pow(densityNorm, gamma);
    float adjustedDensity = dMin + gammaApplied * (dMax - dMin);
    float outputT = pow(10.0, -adjustedDensity);
    return clamp(outputT, 0.0, 1.0);
  }

  void main(){
    vec3 c = texture(u_tex, v_uv).rgb;
    
    // Film Curve (before inversion) - only when inverting negatives
    if (u_inverted > 0.5 && u_filmCurveEnabled > 0.5) {
      c.r = applyFilmCurve(c.r);
      c.g = applyFilmCurve(c.g);
      c.b = applyFilmCurve(c.b);
    }
    
    // Base Correction - neutralize film base color
    // Supports two modes: linear (gains) or log (density subtraction)
    if (u_baseMode > 0.5) {
      // Log mode: density domain subtraction (more accurate)
      float minT = 0.001;
      float log10 = log(10.0);
      
      float Tr = max(c.r, minT);
      float Dr = -log(Tr) / log10;
      c.r = pow(10.0, -(Dr - u_baseDensity.r));
      
      float Tg = max(c.g, minT);
      float Dg = -log(Tg) / log10;
      c.g = pow(10.0, -(Dg - u_baseDensity.g));
      
      float Tb = max(c.b, minT);
      float Db = -log(Tb) / log10;
      c.b = pow(10.0, -(Db - u_baseDensity.b));
      
      c = clamp(c, 0.0, 1.0);
    } else {
      // Linear mode: simple gain multiplication
      c = c * u_baseGains;
      c = clamp(c, 0.0, 1.0);
    }
    
    // Inversion
    if (u_inverted > 0.5) {
      if (u_logMode > 0.5) {
        c = vec3(1.0) - log(c * 255.0 + vec3(1.0)) / log(256.0);
      } else {
        c = vec3(1.0) - c;
      }
    }

    // =========================================================================
    // 【重要】3D LUT - 在反转后立即应用
    // 对于"反转 LUT"类型，LUT 必须在此处应用才能正确工作
    // 之后的曝光/对比度等调整将作用于 LUT 输出
    // =========================================================================
    if (u_hasLut3d > 0.5) {
       float size = u_lut3dSize;
       vec3 uvw = c * (size - 1.0) / size + 0.5 / size;
       c = texture(u_lut3d, uvw).rgb;
    }

    // WB gains
    c *= u_gains;

    // Exposure
    float expFactor = pow(2.0, u_exposure / 50.0);
    c *= expFactor;

    // Contrast around 0.5
    float ctr = u_contrast;
    float factor = (259.0 * (ctr + 255.0)) / (255.0 * (259.0 - ctr));
    c = (c - 0.5) * factor + 0.5;

    // Blacks & Whites window
    float blackPoint = -(u_blacks) * 0.002;
    float whitePoint = 1.0 - (u_whites) * 0.002;
    if (whitePoint != blackPoint) {
      c = (c - vec3(blackPoint)) / (whitePoint - blackPoint);
    }

    // Shadows and Highlights adjustments
    float sFactor = u_shadows * 0.005;
    float hFactor = u_highlights * 0.005;
    if (sFactor != 0.0) {
      c += sFactor * pow(1.0 - c, vec3(2.0)) * c * 4.0;
    }
    if (hFactor != 0.0) {
      c += hFactor * pow(c, vec3(2.0)) * (1.0 - c) * 4.0;
    }

    c = clamp(c, 0.0, 1.0);

    // Tone Curve
    float r = texture(u_toneCurveTex, vec2(c.r, 0.5)).r;
    float g = texture(u_toneCurveTex, vec2(c.g, 0.5)).g;
    float b = texture(u_toneCurveTex, vec2(c.b, 0.5)).b;
    c = vec3(r, g, b);

    // HSL Adjustment
    c = applyHSLAdjustment(c);

    // Split Toning
    c = applySplitTone(c);

    // 【注意】3D LUT 已移动到反转后立即应用（见上方）
    // 保留此注释以便追溯

    fragColor = vec4(c, 1.0);
  }
`;

const VS_GL1 = `
  attribute vec2 a_pos;
  attribute vec2 a_uv;
  varying vec2 v_uv;
  void main(){
    v_uv = a_uv;
    gl_Position = vec4(a_pos, 0.0, 1.0);
  }
`;

const FS_GL1 = `
  precision highp float;
  varying vec2 v_uv;
  uniform sampler2D u_tex;
  uniform sampler2D u_toneCurveTex;
  
  // No 3D LUT support in fallback
  uniform float u_inverted;
  uniform float u_logMode;
  uniform vec3 u_gains;
  uniform float u_exposure;
  uniform float u_contrast;
  uniform float u_highlights;
  uniform float u_shadows;
  uniform float u_whites;
  uniform float u_blacks;

  // Film Curve parameters
  uniform float u_filmCurveEnabled;
  uniform float u_filmCurveGamma;
  uniform float u_filmCurveDMin;
  uniform float u_filmCurveDMax;

  // Film Base Correction (Pre-Inversion)
  uniform float u_baseMode; // 0 = linear (gains), 1 = log (density subtraction)
  uniform vec3 u_baseGains; // Linear mode: r,g,b gains
  uniform vec3 u_baseDensity; // Log mode: r,g,b density values to subtract

  // HSL parameters (8 channels)
  uniform vec3 u_hslRed;
  uniform vec3 u_hslOrange;
  uniform vec3 u_hslYellow;
  uniform vec3 u_hslGreen;
  uniform vec3 u_hslCyan;
  uniform vec3 u_hslBlue;
  uniform vec3 u_hslPurple;
  uniform vec3 u_hslMagenta;

  // Split Toning parameters
  uniform float u_splitHighlightHue;
  uniform float u_splitHighlightSat;
  uniform float u_splitMidtoneHue;
  uniform float u_splitMidtoneSat;
  uniform float u_splitShadowHue;
  uniform float u_splitShadowSat;
  uniform float u_splitBalance;

  // HSL helper functions
  vec3 rgb2hsl(vec3 color) {
    float maxC = max(max(color.r, color.g), color.b);
    float minC = min(min(color.r, color.g), color.b);
    float delta = maxC - minC;
    float L = (maxC + minC) * 0.5;
    float H = 0.0;
    float S = 0.0;
    if (delta > 0.001) {
      S = (L < 0.5) ? (delta / (maxC + minC)) : (delta / (2.0 - maxC - minC));
      if (maxC == color.r) {
        H = (color.g - color.b) / delta + (color.g < color.b ? 6.0 : 0.0);
      } else if (maxC == color.g) {
        H = (color.b - color.r) / delta + 2.0;
      } else {
        H = (color.r - color.g) / delta + 4.0;
      }
      H *= 60.0;
    }
    return vec3(H, S, L);
  }

  float hue2rgb(float p, float q, float t) {
    if (t < 0.0) t += 1.0;
    if (t > 1.0) t -= 1.0;
    if (t < 1.0/6.0) return p + (q - p) * 6.0 * t;
    if (t < 0.5) return q;
    if (t < 2.0/3.0) return p + (q - p) * (2.0/3.0 - t) * 6.0;
    return p;
  }

  vec3 hsl2rgb(vec3 hsl) {
    float h = hsl.x / 360.0;
    float s = hsl.y;
    float l = hsl.z;
    if (s < 0.001) return vec3(l);
    float q = (l < 0.5) ? (l * (1.0 + s)) : (l + s - l * s);
    float p = 2.0 * l - q;
    return vec3(
      hue2rgb(p, q, h + 1.0/3.0),
      hue2rgb(p, q, h),
      hue2rgb(p, q, h - 1.0/3.0)
    );
  }

  float hslChannelWeight(float hue, float centerHue) {
    float dist = min(abs(hue - centerHue), 360.0 - abs(hue - centerHue));
    return max(0.0, 1.0 - dist / 30.0);
  }

  vec3 applyHSLAdjustment(vec3 color) {
    vec3 hsl = rgb2hsl(color);
    float h = hsl.x;
    float totalHueShift = 0.0;
    float totalSatMult = 1.0;
    float totalLumShift = 0.0;
    float totalWeight = 0.0;
    float w;
    
    w = hslChannelWeight(h, 0.0);
    if (w > 0.0) { totalHueShift += u_hslRed.x * w; totalSatMult *= 1.0 + (u_hslRed.y / 100.0) * w; totalLumShift += (u_hslRed.z / 100.0) * 0.5 * w; totalWeight += w; }
    w = hslChannelWeight(h, 30.0);
    if (w > 0.0) { totalHueShift += u_hslOrange.x * w; totalSatMult *= 1.0 + (u_hslOrange.y / 100.0) * w; totalLumShift += (u_hslOrange.z / 100.0) * 0.5 * w; totalWeight += w; }
    w = hslChannelWeight(h, 60.0);
    if (w > 0.0) { totalHueShift += u_hslYellow.x * w; totalSatMult *= 1.0 + (u_hslYellow.y / 100.0) * w; totalLumShift += (u_hslYellow.z / 100.0) * 0.5 * w; totalWeight += w; }
    w = hslChannelWeight(h, 120.0);
    if (w > 0.0) { totalHueShift += u_hslGreen.x * w; totalSatMult *= 1.0 + (u_hslGreen.y / 100.0) * w; totalLumShift += (u_hslGreen.z / 100.0) * 0.5 * w; totalWeight += w; }
    w = hslChannelWeight(h, 180.0);
    if (w > 0.0) { totalHueShift += u_hslCyan.x * w; totalSatMult *= 1.0 + (u_hslCyan.y / 100.0) * w; totalLumShift += (u_hslCyan.z / 100.0) * 0.5 * w; totalWeight += w; }
    w = hslChannelWeight(h, 240.0);
    if (w > 0.0) { totalHueShift += u_hslBlue.x * w; totalSatMult *= 1.0 + (u_hslBlue.y / 100.0) * w; totalLumShift += (u_hslBlue.z / 100.0) * 0.5 * w; totalWeight += w; }
    w = hslChannelWeight(h, 270.0);
    if (w > 0.0) { totalHueShift += u_hslPurple.x * w; totalSatMult *= 1.0 + (u_hslPurple.y / 100.0) * w; totalLumShift += (u_hslPurple.z / 100.0) * 0.5 * w; totalWeight += w; }
    w = hslChannelWeight(h, 300.0);
    if (w > 0.0) { totalHueShift += u_hslMagenta.x * w; totalSatMult *= 1.0 + (u_hslMagenta.y / 100.0) * w; totalLumShift += (u_hslMagenta.z / 100.0) * 0.5 * w; totalWeight += w; }

    if (totalWeight > 0.0) {
      hsl.x = mod(hsl.x + totalHueShift, 360.0);
      hsl.y = clamp(hsl.y * totalSatMult, 0.0, 1.0);
      hsl.z = clamp(hsl.z + totalLumShift, 0.0, 1.0);
    }
    return hsl2rgb(hsl);
  }

  float calcLuminance(vec3 c) {
    return 0.299 * c.r + 0.587 * c.g + 0.114 * c.b;
  }

  vec3 applySplitTone(vec3 color) {
    float lum = calcLuminance(color);
    float shadowEnd = 0.25 + u_splitBalance * 0.15;
    float highlightStart = 0.75 + u_splitBalance * 0.15;
    float midpoint = 0.5 + u_splitBalance * 0.15;
    
    float shadowWeight = smoothstep(shadowEnd + 0.1, shadowEnd - 0.1, lum);
    float highlightWeight = smoothstep(highlightStart - 0.1, highlightStart + 0.1, lum);
    
    // Midtone weight: strongest in the middle zone
    float midtoneWeight = 1.0 - smoothstep(0.0, shadowEnd + 0.1, abs(lum - midpoint));
    midtoneWeight *= (1.0 - shadowWeight) * (1.0 - highlightWeight);
    midtoneWeight = clamp(midtoneWeight * 2.0, 0.0, 1.0);
    
    vec3 highlightTint = hsl2rgb(vec3(u_splitHighlightHue * 360.0, 1.0, 0.5));
    vec3 midtoneTint = hsl2rgb(vec3(u_splitMidtoneHue * 360.0, 1.0, 0.5));
    vec3 shadowTint = hsl2rgb(vec3(u_splitShadowHue * 360.0, 1.0, 0.5));
    
    vec3 result = color;
    if (shadowWeight > 0.0 && u_splitShadowSat > 0.0) {
      result = mix(result, result * shadowTint / 0.5, shadowWeight * u_splitShadowSat);
    }
    if (midtoneWeight > 0.0 && u_splitMidtoneSat > 0.0) {
      result = mix(result, result * midtoneTint / 0.5, midtoneWeight * u_splitMidtoneSat);
    }
    if (highlightWeight > 0.0 && u_splitHighlightSat > 0.0) {
      result = mix(result, result * highlightTint / 0.5, highlightWeight * u_splitHighlightSat);
    }
    return clamp(result, 0.0, 1.0);
  }

  // Film Curve: Apply H&D density model to transmittance
  float applyFilmCurve(float value) {
    float gamma = u_filmCurveGamma;
    float dMin = u_filmCurveDMin;
    float dMax = u_filmCurveDMax;
    
    float normalized = clamp(value, 0.001, 1.0);
    float density = -log(normalized) / log(10.0);
    float densityNorm = clamp((density - dMin) / (dMax - dMin), 0.0, 1.0);
    float gammaApplied = pow(densityNorm, gamma);
    float adjustedDensity = dMin + gammaApplied * (dMax - dMin);
    float outputT = pow(10.0, -adjustedDensity);
    return clamp(outputT, 0.0, 1.0);
  }

  void main(){
    vec3 c = texture2D(u_tex, v_uv).rgb;
    
    // Film Curve (before inversion) - only when inverting negatives
    if (u_inverted > 0.5 && u_filmCurveEnabled > 0.5) {
      c.r = applyFilmCurve(c.r);
      c.g = applyFilmCurve(c.g);
      c.b = applyFilmCurve(c.b);
    }
    
    // Base Correction - neutralize film base color
    // Supports two modes: linear (gains) or log (density subtraction)
    if (u_baseMode > 0.5) {
      // Log mode: density domain subtraction (more accurate)
      float minT = 0.001;
      float log10 = log(10.0);
      
      float Tr = max(c.r, minT);
      float Dr = -log(Tr) / log10;
      c.r = pow(10.0, -(Dr - u_baseDensity.r));
      
      float Tg = max(c.g, minT);
      float Dg = -log(Tg) / log10;
      c.g = pow(10.0, -(Dg - u_baseDensity.g));
      
      float Tb = max(c.b, minT);
      float Db = -log(Tb) / log10;
      c.b = pow(10.0, -(Db - u_baseDensity.b));
      
      c = clamp(c, 0.0, 1.0);
    } else {
      // Linear mode: simple gain multiplication
      c = c * u_baseGains;
      c = clamp(c, 0.0, 1.0);
    }
    
    if (u_inverted > 0.5) {
      if (u_logMode > 0.5) {
        c = vec3(1.0) - log(c * 255.0 + vec3(1.0)) / log(256.0);
      } else {
        c = vec3(1.0) - c;
      }
    }

    c *= u_gains;

    float expFactor = pow(2.0, u_exposure / 50.0);
    c *= expFactor;

    float ctr = u_contrast;
    float factor = (259.0 * (ctr + 255.0)) / (255.0 * (259.0 - ctr));
    c = (c - 0.5) * factor + 0.5;

    float blackPoint = -(u_blacks) * 0.002;
    float whitePoint = 1.0 - (u_whites) * 0.002;
    if (whitePoint != blackPoint) {
      c = (c - vec3(blackPoint)) / (whitePoint - blackPoint);
    }

    float sFactor = u_shadows * 0.005;
    float hFactor = u_highlights * 0.005;
    if (sFactor != 0.0) {
      c += sFactor * pow(1.0 - c, vec3(2.0)) * c * 4.0;
    }
    if (hFactor != 0.0) {
      c += hFactor * pow(c, vec3(2.0)) * (1.0 - c) * 4.0;
    }

    c = clamp(c, 0.0, 1.0);

    float r = texture2D(u_toneCurveTex, vec2(c.r, 0.5)).r;
    float g = texture2D(u_toneCurveTex, vec2(c.g, 0.5)).g;
    float b = texture2D(u_toneCurveTex, vec2(c.b, 0.5)).b;
    c = vec3(r, g, b);

    // HSL Adjustment
    c = applyHSLAdjustment(c);

    // Split Toning
    c = applySplitTone(c);

    gl_FragColor = vec4(c, 1.0);
  }
`;

function runJob(job) {
  if (!gl) throw new Error('WebGL not initialized');
  const { jobId, params, image } = job;
  if (!image || !image.bytes) throw new Error('No image bytes');

  // Helper to run the GL pipeline once we have a source (bmp or raw pixels)
  const runPipeline = (source, width, height, isRaw = false) => {
    try {
      // Calculate Geometry (Crop & Rotation)
      // We implement a general rotation/crop logic that works for any angle (0, 90, 180, 270 or arbitrary)
      // This fixes the "undefined" error when rotation is not exactly a multiple of 90, and handles aspect ratio correctly.
      
      const crop = params && params.cropRect ? params.cropRect : { x: 0, y: 0, w: 1, h: 1 };
      const rotation = ((params && params.rotation) || 0) + ((params && params.orientation) || 0);
      const rad = (rotation * Math.PI) / 180;
      
      // Precompute trig for backward rotation (Screen -> Source)
      const cos = Math.cos(-rad);
      const sin = Math.sin(-rad);

      // Dimensions of the rotated image (bounding box of rotated source)
      const absCos = Math.abs(Math.cos(rad));
      const absSin = Math.abs(Math.sin(rad));
      const rotW = width * absCos + height * absSin;
      const rotH = width * absSin + height * absCos;

      // Output canvas dimensions (Crop is relative to the Rotated Image)
      canvas.width = Math.max(1, Math.round(rotW * crop.w));
      canvas.height = Math.max(1, Math.round(rotH * crop.h));

      // Setup GL state
      const vsSrc = isWebGL2 ? VS_GL2 : VS_GL1;
      const fsSrc = isWebGL2 ? FS_GL2 : FS_GL1;
      const prog = createProgram(gl, vsSrc, fsSrc);
      gl.useProgram(prog);

      // Helper to map UV from Rotated Space (0..1) to Source Space (0..1)
      const mapUV = (u_rot, v_rot) => {
        // 1. Convert to pixels in Rotated Space
        const x_rot = u_rot * rotW;
        const y_rot = v_rot * rotH;
        
        // 2. Shift to center
        const dx_rot = x_rot - rotW / 2;
        const dy_rot = y_rot - rotH / 2;
        
        // 3. Rotate backwards (-rad) to align with Source Space
        const dx_src = dx_rot * cos - dy_rot * sin;
        const dy_src = dx_rot * sin + dy_rot * cos;
        
        // 4. Shift back from center of Source
        const x_src = dx_src + width / 2;
        const y_src = dy_src + height / 2;
        
        // 5. Normalize to Source UV
        return [x_src / width, y_src / height];
      };

      // Calculate UVs for the 4 corners of the Crop Rectangle
      // Crop Rect in Rotated Space:
      // TL: (crop.x, crop.y)
      // TR: (crop.x + crop.w, crop.y)
      // BL: (crop.x, crop.y + crop.h)
      // BR: (crop.x + crop.w, crop.y + crop.h)
      
      const uvTL = mapUV(crop.x, crop.y);
      const uvTR = mapUV(crop.x + crop.w, crop.y);
      const uvBL = mapUV(crop.x, crop.y + crop.h);
      const uvBR = mapUV(crop.x + crop.w, crop.y + crop.h);

      const quad = new Float32Array([
        //  pos      uv
        -1, -1,   uvBL[0], uvBL[1], // BL
         1, -1,   uvBR[0], uvBR[1], // BR
        -1,  1,   uvTL[0], uvTL[1], // TL
         1,  1,   uvTR[0], uvTR[1], // TR
      ]);

      const vbo = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
      gl.bufferData(gl.ARRAY_BUFFER, quad, gl.STATIC_DRAW);

      const a_pos = gl.getAttribLocation(prog, 'a_pos');
      const a_uv  = gl.getAttribLocation(prog, 'a_uv');
      gl.enableVertexAttribArray(a_pos);
      gl.enableVertexAttribArray(a_uv);
      gl.vertexAttribPointer(a_pos, 2, gl.FLOAT, false, 16, 0);
      gl.vertexAttribPointer(a_uv,  2, gl.FLOAT, false, 16, 8);

      // Texture
      gl.activeTexture(gl.TEXTURE0); // Ensure we are modifying unit 0
      const tex = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      // Flip Y so exported GPU image matches normal top-left origin (preview uses flip=true)
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
      
      if (isRaw) {
        // source is Uint8Array of RGBA pixels
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, source);
      } else {
        // source is ImageBitmap
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
      }

      // Tone Curve Texture (1D LUT)
      const toneCurveTex = gl.createTexture();
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, toneCurveTex);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      
      let toneCurveData;
      if (params && params.toneCurveLut && params.toneCurveLut.length === 256 * 4) {
        toneCurveData = new Uint8Array(params.toneCurveLut);
      } else {
        // Default identity LUT
        toneCurveData = new Uint8Array(256 * 4);
        for(let i=0; i<256; i++) {
          toneCurveData[i*4+0] = i;
          toneCurveData[i*4+1] = i;
          toneCurveData[i*4+2] = i;
          toneCurveData[i*4+3] = 255;
        }
      }
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 256, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, toneCurveData);

      // 3D LUT Texture
      let hasLut3d = false;
      let lut3dSize = 0;
      let lut3dTex = null;
      if (isWebGL2 && params && params.lut3d && params.lut3d.data && params.lut3d.size) {
        lut3dTex = gl.createTexture();
        gl.activeTexture(gl.TEXTURE2);
        gl.bindTexture(gl.TEXTURE_3D, lut3dTex);
        gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_R, gl.CLAMP_TO_EDGE);
        
        const size = params.lut3d.size;
        const data = new Float32Array(params.lut3d.data);
        gl.texImage3D(gl.TEXTURE_3D, 0, gl.RGB, size, size, size, 0, gl.RGB, gl.FLOAT, data);
        hasLut3d = true;
        lut3dSize = size;
      }

      // Uniforms
      gl.useProgram(prog); // Ensure program is active
      const u_tex = gl.getUniformLocation(prog, 'u_tex');
      gl.uniform1i(u_tex, 0); // Texture unit 0
      
      const u_toneCurveTex = gl.getUniformLocation(prog, 'u_toneCurveTex');
      gl.uniform1i(u_toneCurveTex, 1); // Texture unit 1

      const u_lut3d = gl.getUniformLocation(prog, 'u_lut3d');
      gl.uniform1i(u_lut3d, 2); // Texture unit 2

      const u_hasLut3d = gl.getUniformLocation(prog, 'u_hasLut3d');
      gl.uniform1f(u_hasLut3d, hasLut3d ? 1.0 : 0.0);

      const u_lut3dSize = gl.getUniformLocation(prog, 'u_lut3dSize');
      gl.uniform1f(u_lut3dSize, lut3dSize);

      const inverted = params && params.inverted ? 1.0 : 0.0;
      const u_inverted = gl.getUniformLocation(prog, 'u_inverted');
      gl.uniform1f(u_inverted, inverted);
      const u_logMode = gl.getUniformLocation(prog, 'u_logMode');
      gl.uniform1f(u_logMode, (params && params.inversionMode === 'log') ? 1.0 : 0.0);
      
      // Compute WB gains using the correct formula (matches server/client)
      const [rBal, gBal, bBal] = computeWBGains({
        red: params?.red ?? 1.0,
        green: params?.green ?? 1.0,
        blue: params?.blue ?? 1.0,
        temp: params?.temp ?? 0,
        tint: params?.tint ?? 0
      });
      const u_gains = gl.getUniformLocation(prog, 'u_gains');
      gl.uniform3f(u_gains, rBal, gBal, bBal);
      const u_exposure = gl.getUniformLocation(prog, 'u_exposure');
      gl.uniform1f(u_exposure, (params?.exposure ?? 0));
      const u_contrast = gl.getUniformLocation(prog, 'u_contrast');
      gl.uniform1f(u_contrast, (params?.contrast ?? 0));
      const u_highlights = gl.getUniformLocation(prog, 'u_highlights');
      gl.uniform1f(u_highlights, (params?.highlights ?? 0));
      const u_shadows = gl.getUniformLocation(prog, 'u_shadows');
      gl.uniform1f(u_shadows, (params?.shadows ?? 0));
      const u_whites = gl.getUniformLocation(prog, 'u_whites');
      gl.uniform1f(u_whites, (params?.whites ?? 0));
      const u_blacks = gl.getUniformLocation(prog, 'u_blacks');
      gl.uniform1f(u_blacks, (params?.blacks ?? 0));

      // Film Curve uniforms
      const u_filmCurveEnabled = gl.getUniformLocation(prog, 'u_filmCurveEnabled');
      gl.uniform1f(u_filmCurveEnabled, (params?.filmCurveEnabled) ? 1.0 : 0.0);
      const u_filmCurveGamma = gl.getUniformLocation(prog, 'u_filmCurveGamma');
      gl.uniform1f(u_filmCurveGamma, (params?.filmCurveGamma ?? 0.6));
      const u_filmCurveDMin = gl.getUniformLocation(prog, 'u_filmCurveDMin');
      gl.uniform1f(u_filmCurveDMin, (params?.filmCurveDMin ?? 0.1));
      const u_filmCurveDMax = gl.getUniformLocation(prog, 'u_filmCurveDMax');
      gl.uniform1f(u_filmCurveDMax, (params?.filmCurveDMax ?? 3.0));

      // Base Correction (Pre-Inversion)
      // Support both linear (gains) and log (density) modes
      const baseMode = params?.baseMode === 'log' ? 1.0 : 0.0;
      const baseGains = [params?.baseRed ?? 1.0, params?.baseGreen ?? 1.0, params?.baseBlue ?? 1.0];
      const baseDensity = [params?.baseDensityR ?? 0.0, params?.baseDensityG ?? 0.0, params?.baseDensityB ?? 0.0];
      
      const u_baseMode = gl.getUniformLocation(prog, 'u_baseMode');
      gl.uniform1f(u_baseMode, baseMode);
      const u_baseGains = gl.getUniformLocation(prog, 'u_baseGains');
      gl.uniform3fv(u_baseGains, new Float32Array(baseGains));
      const u_baseDensity = gl.getUniformLocation(prog, 'u_baseDensity');
      gl.uniform3fv(u_baseDensity, new Float32Array(baseDensity));

      // HSL Uniforms
      const hslParams = params?.hslParams || {};
      const getHSL = (ch) => {
        const data = hslParams[ch] || {};
        return [data.hue ?? 0, data.saturation ?? 0, data.luminance ?? 0];
      };
      gl.uniform3fv(gl.getUniformLocation(prog, 'u_hslRed'), new Float32Array(getHSL('red')));
      gl.uniform3fv(gl.getUniformLocation(prog, 'u_hslOrange'), new Float32Array(getHSL('orange')));
      gl.uniform3fv(gl.getUniformLocation(prog, 'u_hslYellow'), new Float32Array(getHSL('yellow')));
      gl.uniform3fv(gl.getUniformLocation(prog, 'u_hslGreen'), new Float32Array(getHSL('green')));
      gl.uniform3fv(gl.getUniformLocation(prog, 'u_hslCyan'), new Float32Array(getHSL('cyan')));
      gl.uniform3fv(gl.getUniformLocation(prog, 'u_hslBlue'), new Float32Array(getHSL('blue')));
      gl.uniform3fv(gl.getUniformLocation(prog, 'u_hslPurple'), new Float32Array(getHSL('purple')));
      gl.uniform3fv(gl.getUniformLocation(prog, 'u_hslMagenta'), new Float32Array(getHSL('magenta')));

      // Split Toning Uniforms
      const splitToning = params?.splitToning || {};
      gl.uniform1f(gl.getUniformLocation(prog, 'u_splitHighlightHue'), (splitToning.highlights?.hue ?? 0) / 360.0);
      gl.uniform1f(gl.getUniformLocation(prog, 'u_splitHighlightSat'), (splitToning.highlights?.saturation ?? 0) / 100.0);
      gl.uniform1f(gl.getUniformLocation(prog, 'u_splitMidtoneHue'), (splitToning.midtones?.hue ?? 0) / 360.0);
      gl.uniform1f(gl.getUniformLocation(prog, 'u_splitMidtoneSat'), (splitToning.midtones?.saturation ?? 0) / 100.0);
      gl.uniform1f(gl.getUniformLocation(prog, 'u_splitShadowHue'), (splitToning.shadows?.hue ?? 0) / 360.0);
      gl.uniform1f(gl.getUniformLocation(prog, 'u_splitShadowSat'), (splitToning.shadows?.saturation ?? 0) / 100.0);
      gl.uniform1f(gl.getUniformLocation(prog, 'u_splitBalance'), (splitToning.balance ?? 0) / 100.0);

      // Draw
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.clearColor(0,0,0,1);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

      // Wait for GPU to finish before reading pixels
      gl.finish();

      // Cleanup GL resources to prevent leaks
      gl.deleteTexture(tex);
      gl.deleteTexture(toneCurveTex);
      if (lut3dTex) gl.deleteTexture(lut3dTex);
      gl.deleteBuffer(vbo);
      gl.deleteProgram(prog);

      // Encode canvas to JPEG and return
      canvas.toBlob((blobOut) => {
        if (!blobOut) {
          ipcRenderer.send('filmlab-gpu:result', { jobId, ok:false, error:'toBlob_failed' });
          return;
        }
        const reader = new FileReader();
        reader.onload = () => {
          const arrBuf = reader.result; // ArrayBuffer
          const buf = Buffer.from(arrBuf);
          ipcRenderer.send('filmlab-gpu:result', { jobId, ok:true, width: canvas.width, height: canvas.height, jpegBytes: buf });
        };
        reader.onerror = () => {
          ipcRenderer.send('filmlab-gpu:result', { jobId, ok:false, error:'blob_read_failed' });
        };
        reader.readAsArrayBuffer(blobOut);
      }, 'image/jpeg', 0.95);
    } catch (err) {
      ipcRenderer.send('filmlab-gpu:result', { jobId, ok:false, error: (err && err.message) || String(err) });
    } finally {
      if (!isRaw && source && source.close) source.close();
    }
  };

  // Check if raw pixels
  if (image.format === 'rgba' && image.width && image.height) {
    // Direct raw pixel path
    const pixels = new Uint8Array(image.bytes);
    runPipeline(pixels, image.width, image.height, true);
  } else {
    // Standard blob path
    const blob = new Blob([image.bytes], { type: image.mime || 'image/jpeg' });
    createImageBitmap(blob).then((bmp) => {
      runPipeline(bmp, bmp.width, bmp.height, false);
    }).catch((e) => {
      ipcRenderer.send('filmlab-gpu:result', { jobId, ok:false, error:'decode_failed: ' + (e && e.message) });
    });
  }
}

window.addEventListener('DOMContentLoaded', () => {
  initGL();
  ipcRenderer.on('filmlab-gpu:run', (_e, job) => {
    try { runJob(job); } catch (err) {
      ipcRenderer.send('filmlab-gpu:result', { jobId: job && job.jobId, ok: false, error: (err && err.message) || String(err) });
    }
  });
});
