// Minimal WebGL helper for FilmLab
// Provides a basic shader pipeline for inversion (linear/log), white balance (r/g/b gains), exposure and contrast.
// This is intentionally small and dependency-free. We'll extend it later for curves and 3D LUTs.

// Debug flag - set to true during development for detailed logging
const DEBUG_WEBGL = false;

// Helper: Check if HSL params are default (all zeros)
function isDefaultHSLParams(hslParams) {
  if (!hslParams) return true;
  const channels = ['red', 'orange', 'yellow', 'green', 'cyan', 'blue', 'purple', 'magenta'];
  for (const ch of channels) {
    const data = hslParams[ch];
    if (data && (data.hue !== 0 || data.saturation !== 0 || data.luminance !== 0)) {
      return false;
    }
  }
  return true;
}

// Helper: Check if Split Tone params are default
function isDefaultSplitToneParams(splitToning) {
  if (!splitToning) return true;
  const highlightSat = splitToning.highlights?.saturation ?? 0;
  const midtoneSat = splitToning.midtones?.saturation ?? 0;
  const shadowSat = splitToning.shadows?.saturation ?? 0;
  return highlightSat === 0 && midtoneSat === 0 && shadowSat === 0;
}

function createShader(gl, type, source) {
  const s = gl.createShader(type);
  gl.shaderSource(s, source);
  gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
    const msg = gl.getShaderInfoLog(s);
    gl.deleteShader(s);
    throw new Error('Shader compile error: ' + msg);
  }
  return s;
}

function createProgram(gl, vsSource, fsSource) {
  const vs = createShader(gl, gl.VERTEX_SHADER, vsSource);
  const fs = createShader(gl, gl.FRAGMENT_SHADER, fsSource);
  const prog = gl.createProgram();
  gl.attachShader(prog, vs);
  gl.attachShader(prog, fs);
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
    const msg = gl.getProgramInfoLog(prog);
    gl.deleteProgram(prog);
    throw new Error('Program link error: ' + msg);
  }
  return prog;
}

export function isWebGLAvailable() {
  try {
    const canvas = document.createElement('canvas');
    return !!(canvas.getContext('webgl') || canvas.getContext('experimental-webgl'));
  } catch (e) {
    return false;
  }
}

// Process an image on the given canvas using WebGL. The canvas will be sized to image dimensions.
export function processImageWebGL(canvas, image, params = {}) {
  if (!canvas) return;
  const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
  if (!gl) throw new Error('WebGL not available');

  // Simple cache per-canvas to reuse programs and textures
  if (!processImageWebGL._cache) processImageWebGL._cache = new WeakMap();
  let cache = processImageWebGL._cache.get(canvas);
  if (!cache) {
    cache = {};
    processImageWebGL._cache.set(canvas, cache);
  }

  // Rotate-then-crop pre-processing via 2D canvas for geometry parity with CPU/export
  // Respect optional `params.scale` so WebGL output matches preview geometry scale
  let srcImage = image;
  const scale = (typeof params.scale === 'number' && params.scale > 0) ? params.scale : 1;
  // If scale != 1, create a temporary scaled source so rotation uses scaled dimensions
  if (scale !== 1 && image && image.width) {
    const s2 = document.createElement('canvas');
    s2.width = Math.max(1, Math.round(image.width * scale));
    s2.height = Math.max(1, Math.round(image.height * scale));
    const g2 = s2.getContext('2d');
    // draw scaled
    g2.drawImage(image, 0, 0, image.width, image.height, 0, 0, s2.width, s2.height);
    srcImage = s2;
  }
  const rotateDeg = typeof params.rotate === 'number' ? params.rotate : 0;
  const rad = rotateDeg * Math.PI / 180;
  const s = Math.abs(Math.sin(rad));
  const c = Math.abs(Math.cos(rad));
  const rotW = Math.round(srcImage.width * c + srcImage.height * s);
  const rotH = Math.round(srcImage.width * s + srcImage.height * c);
  const r2d = document.createElement('canvas');
  r2d.width = rotW;
  r2d.height = rotH;
  const rg = r2d.getContext('2d');
  rg.translate(rotW / 2, rotH / 2);
  rg.rotate(rad);
  rg.drawImage(srcImage, -srcImage.width / 2, -srcImage.height / 2);
  srcImage = r2d;

  // Clamp cropRect and crop in rotated space
  let outW = rotW;
  let outH = rotH;
  const crop = params.cropRect;
  if (crop && typeof crop.x === 'number') {
    let crx = Math.max(0, Math.min(1, crop.x));
    let cry = Math.max(0, Math.min(1, crop.y));
    let crw = Math.max(0, Math.min(1 - crx, crop.w || crop.width / outW));
    let crh = Math.max(0, Math.min(1 - cry, crop.h || crop.height / outH));
    const cx = Math.round(crx * outW);
    const cy = Math.round(cry * outH);
    const cw = Math.max(1, Math.round(crw * outW));
    const ch = Math.max(1, Math.round(crh * outH));
    const c2d = document.createElement('canvas');
    c2d.width = cw;
    c2d.height = ch;
    const g2 = c2d.getContext('2d');
    g2.drawImage(srcImage, cx, cy, cw, ch, 0, 0, cw, ch);
    srcImage = c2d;
    outW = cw;
    outH = ch;
  }

  // Set canvas size to processed image size (rotated-then-cropped)
  canvas.width = outW;
  canvas.height = outH;
  gl.viewport(0, 0, canvas.width, canvas.height);

  // Vertex shader (shared)
  const vsSource = `
    attribute vec2 a_pos;
    attribute vec2 a_uv;
    varying vec2 v_uv;
    void main() {
      v_uv = a_uv;
      gl_Position = vec4(a_pos, 0.0, 1.0);
    }
  `;

  // Fragment shader with optional curve and 3D LUT support
  const fsSource = `
    precision mediump float;
    varying vec2 v_uv;
    uniform sampler2D u_image;
    uniform int u_inverted; // 0 = no inversion, 1 = invert
    uniform int u_inversionMode; // 0 linear, 1 log
    uniform vec3 u_gains; // r,g,b gains
    uniform float u_exposure;
    uniform float u_contrast; // -1..1
    uniform float u_highlights; // -100..100
    uniform float u_shadows; // -100..100
    uniform float u_whites; // -100..100
    uniform float u_blacks; // -100..100

    // Film Curve parameters
    uniform int u_filmCurveEnabled;
    uniform float u_filmCurveGamma;
    uniform float u_filmCurveDMin;
    uniform float u_filmCurveDMax;

    // Curve LUTs (1D textures height=1)
    uniform sampler2D u_curveRGB;
    uniform sampler2D u_curveR;
    uniform sampler2D u_curveG;
    uniform sampler2D u_curveB;
    uniform int u_useCurves; // 0/1

    // 3D LUT packed into 2D: width = size, height = size*size
    uniform sampler2D u_lut3d;
    uniform int u_useLut3d;
    uniform int u_lutSize;

    // HSL adjustments (8 channels x 3 values: hue, saturation, luminance)
    uniform int u_useHSL;
    uniform vec3 u_hslRed;
    uniform vec3 u_hslOrange;
    uniform vec3 u_hslYellow;
    uniform vec3 u_hslGreen;
    uniform vec3 u_hslCyan;
    uniform vec3 u_hslBlue;
    uniform vec3 u_hslPurple;
    uniform vec3 u_hslMagenta;

    // Split Toning
    uniform int u_useSplitTone;
    uniform float u_highlightHue;
    uniform float u_highlightSat;
    uniform float u_midtoneHue;
    uniform float u_midtoneSat;
    uniform float u_shadowHue;
    uniform float u_shadowSat;
    uniform float u_splitBalance;

    float sampleCurve(sampler2D t, float v) {
      return texture2D(t, vec2(v, 0.5)).r;
    }

    // ============================================================================
    // RGB <-> HSL Conversion
    // ============================================================================
    
    vec3 rgb2hsl(vec3 c) {
      float maxC = max(max(c.r, c.g), c.b);
      float minC = min(min(c.r, c.g), c.b);
      float l = (maxC + minC) / 2.0;
      
      if (maxC == minC) {
        return vec3(0.0, 0.0, l);
      }
      
      float d = maxC - minC;
      float s = l > 0.5 ? d / (2.0 - maxC - minC) : d / (maxC + minC);
      
      float h;
      if (maxC == c.r) {
        h = (c.g - c.b) / d + (c.g < c.b ? 6.0 : 0.0);
      } else if (maxC == c.g) {
        h = (c.b - c.r) / d + 2.0;
      } else {
        h = (c.r - c.g) / d + 4.0;
      }
      h /= 6.0;
      
      return vec3(h * 360.0, s, l);
    }

    float hue2rgb(float p, float q, float t) {
      if (t < 0.0) t += 1.0;
      if (t > 1.0) t -= 1.0;
      if (t < 1.0/6.0) return p + (q - p) * 6.0 * t;
      if (t < 1.0/2.0) return q;
      if (t < 2.0/3.0) return p + (q - p) * (2.0/3.0 - t) * 6.0;
      return p;
    }

    vec3 hsl2rgb(vec3 hsl) {
      float h = mod(hsl.x, 360.0) / 360.0;
      float s = clamp(hsl.y, 0.0, 1.0);
      float l = clamp(hsl.z, 0.0, 1.0);
      
      if (s == 0.0) {
        return vec3(l);
      }
      
      float q = l < 0.5 ? l * (1.0 + s) : l + s - l * s;
      float p = 2.0 * l - q;
      
      float r = hue2rgb(p, q, h + 1.0/3.0);
      float g = hue2rgb(p, q, h);
      float b = hue2rgb(p, q, h - 1.0/3.0);
      
      return vec3(r, g, b);
    }

    // ============================================================================
    // HSL Channel Weight Calculation
    // ============================================================================
    
    float hslChannelWeight(float hue, float center, float range) {
      float dist = min(abs(hue - center), min(abs(hue - center + 360.0), abs(hue - center - 360.0)));
      if (dist > range) return 0.0;
      // Cosine smooth transition
      return 0.5 * (1.0 + cos(3.14159265 * dist / range));
    }

    vec3 applyHSLAdjustment(vec3 color) {
      vec3 hsl = rgb2hsl(color);
      float h = hsl.x;
      float s = hsl.y;
      float l = hsl.z;
      
      float totalHueShift = 0.0;
      float totalSatMult = 1.0;
      float totalLumShift = 0.0;
      
      // Red channel (center: 0, range: 30)
      float w = hslChannelWeight(h, 0.0, 30.0);
      if (w > 0.0) {
        totalHueShift += u_hslRed.x * w;
        totalSatMult *= 1.0 + (u_hslRed.y / 100.0) * w;
        totalLumShift += (u_hslRed.z / 100.0) * 0.5 * w;
      }
      
      // Orange channel (center: 30, range: 30)
      w = hslChannelWeight(h, 30.0, 30.0);
      if (w > 0.0) {
        totalHueShift += u_hslOrange.x * w;
        totalSatMult *= 1.0 + (u_hslOrange.y / 100.0) * w;
        totalLumShift += (u_hslOrange.z / 100.0) * 0.5 * w;
      }
      
      // Yellow channel (center: 60, range: 30)
      w = hslChannelWeight(h, 60.0, 30.0);
      if (w > 0.0) {
        totalHueShift += u_hslYellow.x * w;
        totalSatMult *= 1.0 + (u_hslYellow.y / 100.0) * w;
        totalLumShift += (u_hslYellow.z / 100.0) * 0.5 * w;
      }
      
      // Green channel (center: 120, range: 45)
      w = hslChannelWeight(h, 120.0, 45.0);
      if (w > 0.0) {
        totalHueShift += u_hslGreen.x * w;
        totalSatMult *= 1.0 + (u_hslGreen.y / 100.0) * w;
        totalLumShift += (u_hslGreen.z / 100.0) * 0.5 * w;
      }
      
      // Cyan channel (center: 180, range: 30)
      w = hslChannelWeight(h, 180.0, 30.0);
      if (w > 0.0) {
        totalHueShift += u_hslCyan.x * w;
        totalSatMult *= 1.0 + (u_hslCyan.y / 100.0) * w;
        totalLumShift += (u_hslCyan.z / 100.0) * 0.5 * w;
      }
      
      // Blue channel (center: 240, range: 45)
      w = hslChannelWeight(h, 240.0, 45.0);
      if (w > 0.0) {
        totalHueShift += u_hslBlue.x * w;
        totalSatMult *= 1.0 + (u_hslBlue.y / 100.0) * w;
        totalLumShift += (u_hslBlue.z / 100.0) * 0.5 * w;
      }
      
      // Purple channel (center: 280, range: 30)
      w = hslChannelWeight(h, 280.0, 30.0);
      if (w > 0.0) {
        totalHueShift += u_hslPurple.x * w;
        totalSatMult *= 1.0 + (u_hslPurple.y / 100.0) * w;
        totalLumShift += (u_hslPurple.z / 100.0) * 0.5 * w;
      }
      
      // Magenta channel (center: 320, range: 30)
      w = hslChannelWeight(h, 320.0, 30.0);
      if (w > 0.0) {
        totalHueShift += u_hslMagenta.x * w;
        totalSatMult *= 1.0 + (u_hslMagenta.y / 100.0) * w;
        totalLumShift += (u_hslMagenta.z / 100.0) * 0.5 * w;
      }
      
      // Apply adjustments
      h = mod(h + totalHueShift, 360.0);
      s = clamp(s * totalSatMult, 0.0, 1.0);
      l = clamp(l + totalLumShift, 0.0, 1.0);
      
      return hsl2rgb(vec3(h, s, l));
    }

    // ============================================================================
    // Split Toning
    // ============================================================================
    
    float calcLuminance(vec3 c) {
      return 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;
    }

    vec3 applySplitToning(vec3 color) {
      float lum = calcLuminance(color);
      
      // Calculate zone boundaries with balance
      float shadowEnd = 0.25 + u_splitBalance * 0.15;
      float highlightStart = 0.75 + u_splitBalance * 0.15;
      float midpoint = 0.5 + u_splitBalance * 0.15;
      
      // Smooth transitions
      float shadowWeight = 1.0 - smoothstep(shadowEnd - 0.15, shadowEnd + 0.15, lum);
      float highlightWeight = smoothstep(highlightStart - 0.15, highlightStart + 0.15, lum);
      
      // Midtone weight: strongest in the middle zone, fading to shadow/highlight zones
      float midtoneWeight = 1.0 - smoothstep(0.0, shadowEnd + 0.1, abs(lum - midpoint));
      midtoneWeight *= (1.0 - shadowWeight) * (1.0 - highlightWeight);
      midtoneWeight = clamp(midtoneWeight * 2.0, 0.0, 1.0);
      
      // Convert hue to RGB tint (hue is already 0-1)
      vec3 highlightTint = hsl2rgb(vec3(u_highlightHue * 360.0, 1.0, 0.5));
      vec3 midtoneTint = hsl2rgb(vec3(u_midtoneHue * 360.0, 1.0, 0.5));
      vec3 shadowTint = hsl2rgb(vec3(u_shadowHue * 360.0, 1.0, 0.5));
      
      vec3 result = color;
      
      // Apply shadow tint
      if (shadowWeight > 0.0 && u_shadowSat > 0.0) {
        vec3 tinted = result * shadowTint * 2.0; // *2 to normalize since tint is at L=0.5
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

    // Film Curve: Apply H&D density model to transmittance
    // Output is adjusted transmittance (NOT inverted), inversion happens separately
    float applyFilmCurve(float value) {
      if (u_filmCurveEnabled == 0) return value;
      
      float gamma = u_filmCurveGamma;
      float dMin = u_filmCurveDMin;
      float dMax = u_filmCurveDMax;
      
      // 1. Normalize input (avoid log(0))
      float normalized = clamp(value, 0.001, 1.0);
      
      // 2. Calculate density D = -log10(T)
      // Using change of base: log10(x) = log(x) / log(10)
      float density = -log(normalized) / log(10.0);
      
      // 3. Normalize density to dMin-dMax range
      float densityNorm = clamp((density - dMin) / (dMax - dMin), 0.0, 1.0);
      
      // 4. Apply gamma curve to adjust density response
      float gammaApplied = pow(densityNorm, gamma);
      
      // 5. Convert adjusted normalized density back to density value
      float adjustedDensity = dMin + gammaApplied * (dMax - dMin);
      
      // 6. Convert density back to transmittance: T = 10^(-D)
      float outputT = pow(10.0, -adjustedDensity);
      
      return clamp(outputT, 0.0, 1.0);
    }

    vec3 sampleLUT3D(vec3 c) {
      int size = u_lutSize;
      float sz = float(size);
      // Map to [0..size-1]
      float rf = c.r * (sz - 1.0);
      float gf = c.g * (sz - 1.0);
      float bf = c.b * (sz - 1.0);

      float r0 = floor(rf);
      float g0 = floor(gf);
      float b0 = floor(bf);
      float r1 = min(sz - 1.0, r0 + 1.0);
      float g1 = min(sz - 1.0, g0 + 1.0);
      float b1 = min(sz - 1.0, b0 + 1.0);

      vec3 c000;
      vec3 c100;
      vec3 c010;
      vec3 c110;
      vec3 c001;
      vec3 c101;
      vec3 c011;
      vec3 c111;

      // helper to sample packed LUT: x = r / size, y = (g + b*size) / (size*size)
      vec2 uv;
      uv.x = (r0 + 0.5) / sz;
      uv.y = (g0 + b0 * sz + 0.5) / (sz * sz);
      c000 = texture2D(u_lut3d, uv).rgb;

      uv.x = (r1 + 0.5) / sz;
      uv.y = (g0 + b0 * sz + 0.5) / (sz * sz);
      c100 = texture2D(u_lut3d, uv).rgb;

      uv.x = (r0 + 0.5) / sz;
      uv.y = (g1 + b0 * sz + 0.5) / (sz * sz);
      c010 = texture2D(u_lut3d, uv).rgb;

      uv.x = (r1 + 0.5) / sz;
      uv.y = (g1 + b0 * sz + 0.5) / (sz * sz);
      c110 = texture2D(u_lut3d, uv).rgb;

      uv.x = (r0 + 0.5) / sz;
      uv.y = (g0 + b1 * sz + 0.5) / (sz * sz);
      c001 = texture2D(u_lut3d, uv).rgb;

      uv.x = (r1 + 0.5) / sz;
      uv.y = (g0 + b1 * sz + 0.5) / (sz * sz);
      c101 = texture2D(u_lut3d, uv).rgb;

      uv.x = (r0 + 0.5) / sz;
      uv.y = (g1 + b1 * sz + 0.5) / (sz * sz);
      c011 = texture2D(u_lut3d, uv).rgb;

      uv.x = (r1 + 0.5) / sz;
      uv.y = (g1 + b1 * sz + 0.5) / (sz * sz);
      c111 = texture2D(u_lut3d, uv).rgb;

      float fr = rf - r0;
      float fg = gf - g0;
      float fb = bf - b0;

      vec3 c00 = mix(c000, c100, fr);
      vec3 c10 = mix(c010, c110, fr);
      vec3 c01 = mix(c001, c101, fr);
      vec3 c11 = mix(c011, c111, fr);

      vec3 c0 = mix(c00, c10, fg);
      vec3 c1 = mix(c01, c11, fg);

      return mix(c0, c1, fb);
    }

    // Helper: apply contrast (-1..1)
    float applyContrast(float v, float c) {
      float f = (259.0 * (c * 255.0 + 255.0)) / (255.0 * (259.0 - c * 255.0));
      return clamp(f * (v - 0.5) + 0.5, 0.0, 1.0);
    }

    float applyTone(float val, float h, float s, float w, float b) {
      // Blacks & Whites
      float blackPoint = -b * 0.002;
      float whitePoint = 1.0 - w * 0.002;
      if (whitePoint != blackPoint) {
        val = (val - blackPoint) / (whitePoint - blackPoint);
      }

      // Shadows
      if (s != 0.0) {
        float sFactor = s * 0.005;
        val += sFactor * pow(1.0 - val, 2.0) * val * 4.0;
      }

      // Highlights
      if (h != 0.0) {
        float hFactor = h * 0.005;
        val += hFactor * pow(val, 2.0) * (1.0 - val) * 4.0;
      }
      return val;
    }

    void main() {
      vec4 tex = texture2D(u_image, v_uv);
      vec3 col = tex.rgb;

      // ① Film Curve (before inversion) - applies H&D density model to negative scan
      // Only meaningful when inverting negatives
      if (u_inverted == 1 && u_filmCurveEnabled == 1) {
        col.r = applyFilmCurve(col.r);
        col.g = applyFilmCurve(col.g);
        col.b = applyFilmCurve(col.b);
      }

      // ② Invert if enabled
      if (u_inverted == 1) {
        vec3 c255 = col * 255.0;
        if (u_inversionMode == 1) {
          c255.r = 255.0 * (1.0 - log(c255.r + 1.0) / log(256.0));
          c255.g = 255.0 * (1.0 - log(c255.g + 1.0) / log(256.0));
          c255.b = 255.0 * (1.0 - log(c255.b + 1.0) / log(256.0));
        } else {
          c255 = 255.0 - c255;
        }
        col = c255 / 255.0;
      }
      
      vec3 c = col;

      // Apply gains (White Balance)
      c = c * u_gains;

      // Tone Mapping: Exposure
      c = c * pow(2.0, u_exposure);

      // Tone Mapping: Contrast
      c.r = applyContrast(c.r, u_contrast);
      c.g = applyContrast(c.g, u_contrast);
      c.b = applyContrast(c.b, u_contrast);

      // Tone Mapping: H/S/B/W
      c.r = applyTone(c.r, u_highlights, u_shadows, u_whites, u_blacks);
      c.g = applyTone(c.g, u_highlights, u_shadows, u_whites, u_blacks);
      c.b = applyTone(c.b, u_highlights, u_shadows, u_whites, u_blacks);

      // Apply curves if enabled (match CPU order: RGB curve first, then channel curves)
      if (u_useCurves == 1) {
        // First apply RGB combined curve
        c.r = sampleCurve(u_curveRGB, c.r);
        c.g = sampleCurve(u_curveRGB, c.g);
        c.b = sampleCurve(u_curveRGB, c.b);
        // Then apply individual channel curves
        c.r = sampleCurve(u_curveR, c.r);
        c.g = sampleCurve(u_curveG, c.g);
        c.b = sampleCurve(u_curveB, c.b);
      }

      // ⑥ HSL Adjustment
      if (u_useHSL == 1) {
        c = applyHSLAdjustment(c);
      }

      // ⑦ Split Toning
      if (u_useSplitTone == 1) {
        c = applySplitToning(c);
      }

      // ⑧ Apply 3D LUT if enabled
      if (u_useLut3d == 1) {
        c = sampleLUT3D(c);
      }

      gl_FragColor = vec4(clamp(c, 0.0, 1.0), tex.a);
    }
  `;

  // Build or reuse program
  if (!cache.program) {
    cache.program = createProgram(gl, vsSource, fsSource);
  }
  const program = cache.program;
  gl.useProgram(program);

  // Set up a full-screen quad (cache buffer)
  if (!cache.buffer) {
    const verts = new Float32Array([
      -1, -1, 0, 0,
       1, -1, 1, 0,
      -1,  1, 0, 1,
       1,  1, 1, 1
    ]);
    cache.buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, cache.buffer);
    gl.bufferData(gl.ARRAY_BUFFER, verts, gl.STATIC_DRAW);
  } else {
    gl.bindBuffer(gl.ARRAY_BUFFER, cache.buffer);
  }

  const posLoc = gl.getAttribLocation(program, 'a_pos');
  const uvLoc = gl.getAttribLocation(program, 'a_uv');
  gl.enableVertexAttribArray(posLoc);
  gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 16, 0);
  gl.enableVertexAttribArray(uvLoc);
  gl.vertexAttribPointer(uvLoc, 2, gl.FLOAT, false, 16, 8);

  // Create or reuse texture from image
  if (!cache.imageTex) cache.imageTex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, cache.imageTex);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, srcImage);

  // Uniform locations
  const locs = cache.locs || {};
  if (!cache.locs) {
    cache.locs = locs;
    locs.u_image = gl.getUniformLocation(program, 'u_image');
    locs.u_inverted = gl.getUniformLocation(program, 'u_inverted');
    locs.u_inversionMode = gl.getUniformLocation(program, 'u_inversionMode');
    locs.u_gains = gl.getUniformLocation(program, 'u_gains');
    locs.u_exposure = gl.getUniformLocation(program, 'u_exposure');
    locs.u_contrast = gl.getUniformLocation(program, 'u_contrast');
    locs.u_highlights = gl.getUniformLocation(program, 'u_highlights');
    locs.u_shadows = gl.getUniformLocation(program, 'u_shadows');
    locs.u_whites = gl.getUniformLocation(program, 'u_whites');
    locs.u_blacks = gl.getUniformLocation(program, 'u_blacks');
    // Film Curve uniforms
    locs.u_filmCurveEnabled = gl.getUniformLocation(program, 'u_filmCurveEnabled');
    locs.u_filmCurveGamma = gl.getUniformLocation(program, 'u_filmCurveGamma');
    locs.u_filmCurveDMin = gl.getUniformLocation(program, 'u_filmCurveDMin');
    locs.u_filmCurveDMax = gl.getUniformLocation(program, 'u_filmCurveDMax');
    locs.u_curveRGB = gl.getUniformLocation(program, 'u_curveRGB');
    locs.u_curveR = gl.getUniformLocation(program, 'u_curveR');
    locs.u_curveG = gl.getUniformLocation(program, 'u_curveG');
    locs.u_curveB = gl.getUniformLocation(program, 'u_curveB');
    locs.u_useCurves = gl.getUniformLocation(program, 'u_useCurves');
    locs.u_lut3d = gl.getUniformLocation(program, 'u_lut3d');
    locs.u_useLut3d = gl.getUniformLocation(program, 'u_useLut3d');
    locs.u_lutSize = gl.getUniformLocation(program, 'u_lutSize');
    // HSL uniforms
    locs.u_useHSL = gl.getUniformLocation(program, 'u_useHSL');
    locs.u_hslRed = gl.getUniformLocation(program, 'u_hslRed');
    locs.u_hslOrange = gl.getUniformLocation(program, 'u_hslOrange');
    locs.u_hslYellow = gl.getUniformLocation(program, 'u_hslYellow');
    locs.u_hslGreen = gl.getUniformLocation(program, 'u_hslGreen');
    locs.u_hslCyan = gl.getUniformLocation(program, 'u_hslCyan');
    locs.u_hslBlue = gl.getUniformLocation(program, 'u_hslBlue');
    locs.u_hslPurple = gl.getUniformLocation(program, 'u_hslPurple');
    locs.u_hslMagenta = gl.getUniformLocation(program, 'u_hslMagenta');
    // Split Toning uniforms
    locs.u_useSplitTone = gl.getUniformLocation(program, 'u_useSplitTone');
    locs.u_highlightHue = gl.getUniformLocation(program, 'u_highlightHue');
    locs.u_highlightSat = gl.getUniformLocation(program, 'u_highlightSat');
    locs.u_midtoneHue = gl.getUniformLocation(program, 'u_midtoneHue');
    locs.u_midtoneSat = gl.getUniformLocation(program, 'u_midtoneSat');
    locs.u_shadowHue = gl.getUniformLocation(program, 'u_shadowHue');
    locs.u_shadowSat = gl.getUniformLocation(program, 'u_shadowSat');
    locs.u_splitBalance = gl.getUniformLocation(program, 'u_splitBalance');
  }

  // Bind image texture to unit 0
  gl.uniform1i(locs.u_image, 0);

  const inverted = params.inverted ? 1 : 0;
  gl.uniform1i(locs.u_inverted, inverted);
  
  const mode = params.inversionMode === 'log' ? 1 : 0;
  gl.uniform1i(locs.u_inversionMode, mode);

  const gains = params.gains || [1.0, 1.0, 1.0];
  if (DEBUG_WEBGL) console.log('[FilmLabWebGL] Setting u_gains:', gains);
  gl.uniform3fv(locs.u_gains, new Float32Array(gains));

  const exposure = typeof params.exposure === 'number' ? params.exposure / 50.0 : 0.0;
  if (DEBUG_WEBGL) console.log('[FilmLabWebGL] Setting u_exposure:', exposure, 'from', params.exposure);
  gl.uniform1f(locs.u_exposure, exposure);

  const contrast = typeof params.contrast === 'number' ? params.contrast / 100.0 : 0.0;
  gl.uniform1f(locs.u_contrast, contrast);

  gl.uniform1f(locs.u_highlights, params.highlights || 0.0);
  gl.uniform1f(locs.u_shadows, params.shadows || 0.0);
  gl.uniform1f(locs.u_whites, params.whites || 0.0);
  gl.uniform1f(locs.u_blacks, params.blacks || 0.0);

  // Film Curve parameters
  const filmCurveEnabled = params.filmCurveEnabled ? 1 : 0;
  gl.uniform1i(locs.u_filmCurveEnabled, filmCurveEnabled);
  gl.uniform1f(locs.u_filmCurveGamma, params.filmCurveGamma ?? 0.6);
  gl.uniform1f(locs.u_filmCurveDMin, params.filmCurveDMin ?? 0.1);
  gl.uniform1f(locs.u_filmCurveDMax, params.filmCurveDMax ?? 3.0);

  // Curves
  const curves = params.curves;
  if (curves) {
    // helper to upload 1D curve as 256x1 RGBA texture
    const uploadCurve = (key, arr) => {
      if (!arr) return null;
      if (!cache[key]) cache[key] = gl.createTexture();
      const tex = cache[key];
      gl.activeTexture(gl.TEXTURE1 + (key === 'curveRGB' ? 0 : key === 'curveR' ? 1 : key === 'curveG' ? 2 : 3));
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      // build RGBA buffer
      const data = new Uint8Array(256 * 4);
      for (let i = 0; i < 256; i++) {
        const v = Math.max(0, Math.min(255, Math.round(arr[i])));
        data[i*4] = v;
        data[i*4+1] = v;
        data[i*4+2] = v;
        data[i*4+3] = 255;
      }
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 256, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, data);
      return tex;
    };

    const tRGB = uploadCurve('curveRGB', curves.rgb);
    const tR = uploadCurve('curveR', curves.red);
    const tG = uploadCurve('curveG', curves.green);
    const tB = uploadCurve('curveGB', curves.blue) || uploadCurve('curveB', curves.blue);

    // bind uniforms to texture units 1..4
    if (tRGB) { gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, tRGB); gl.uniform1i(locs.u_curveRGB, 1); }
    if (tR)   { gl.activeTexture(gl.TEXTURE2); gl.bindTexture(gl.TEXTURE_2D, tR);   gl.uniform1i(locs.u_curveR, 2); }
    if (tG)   { gl.activeTexture(gl.TEXTURE3); gl.bindTexture(gl.TEXTURE_2D, tG);   gl.uniform1i(locs.u_curveG, 3); }
    if (tB)   { gl.activeTexture(gl.TEXTURE4); gl.bindTexture(gl.TEXTURE_2D, tB);   gl.uniform1i(locs.u_curveB, 4); }
    gl.uniform1i(locs.u_useCurves, 1);
  } else {
    gl.uniform1i(locs.u_useCurves, 0);
  }

  // Handle 3D LUT: expect params.lut3 = { size, data(Float32Array 0..1) }
  if (params.lut3 && params.lut3.size && params.lut3.data) {
    const size = params.lut3.size;
    const dataF = params.lut3.data;
    // pack into width=size, height=size*size RGBA unsigned bytes
    const w = size;
    const h = size * size;
    const buf = new Uint8Array(w * h * 4);
    // iterate b (slice), g, r
    let ptr = 0;
    for (let b = 0; b < size; b++) {
      for (let g = 0; g < size; g++) {
        for (let r = 0; r < size; r++) {
          const idx = (r + g*size + b*size*size) * 3; // input is RGB floats
          const vr = Math.max(0, Math.min(1, dataF[idx]));
          const vg = Math.max(0, Math.min(1, dataF[idx+1]));
          const vb = Math.max(0, Math.min(1, dataF[idx+2]));
          buf[ptr++] = Math.round(vr * 255);
          buf[ptr++] = Math.round(vg * 255);
          buf[ptr++] = Math.round(vb * 255);
          buf[ptr++] = 255;
        }
      }
    }

    if (!cache.lut3Tex) cache.lut3Tex = gl.createTexture();
    gl.activeTexture(gl.TEXTURE5);
    gl.bindTexture(gl.TEXTURE_2D, cache.lut3Tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, buf);
    gl.uniform1i(locs.u_lut3d, 5);
    gl.uniform1i(locs.u_useLut3d, 1);
    gl.uniform1i(locs.u_lutSize, size);
  } else {
    gl.uniform1i(locs.u_useLut3d, 0);
  }

  // HSL Adjustments
  const hslParams = params.hslParams;
  if (hslParams && !isDefaultHSLParams(hslParams)) {
    gl.uniform1i(locs.u_useHSL, 1);
    gl.uniform3fv(locs.u_hslRed, new Float32Array([
      hslParams.red?.hue ?? 0,
      hslParams.red?.saturation ?? 0,
      hslParams.red?.luminance ?? 0
    ]));
    gl.uniform3fv(locs.u_hslOrange, new Float32Array([
      hslParams.orange?.hue ?? 0,
      hslParams.orange?.saturation ?? 0,
      hslParams.orange?.luminance ?? 0
    ]));
    gl.uniform3fv(locs.u_hslYellow, new Float32Array([
      hslParams.yellow?.hue ?? 0,
      hslParams.yellow?.saturation ?? 0,
      hslParams.yellow?.luminance ?? 0
    ]));
    gl.uniform3fv(locs.u_hslGreen, new Float32Array([
      hslParams.green?.hue ?? 0,
      hslParams.green?.saturation ?? 0,
      hslParams.green?.luminance ?? 0
    ]));
    gl.uniform3fv(locs.u_hslCyan, new Float32Array([
      hslParams.cyan?.hue ?? 0,
      hslParams.cyan?.saturation ?? 0,
      hslParams.cyan?.luminance ?? 0
    ]));
    gl.uniform3fv(locs.u_hslBlue, new Float32Array([
      hslParams.blue?.hue ?? 0,
      hslParams.blue?.saturation ?? 0,
      hslParams.blue?.luminance ?? 0
    ]));
    gl.uniform3fv(locs.u_hslPurple, new Float32Array([
      hslParams.purple?.hue ?? 0,
      hslParams.purple?.saturation ?? 0,
      hslParams.purple?.luminance ?? 0
    ]));
    gl.uniform3fv(locs.u_hslMagenta, new Float32Array([
      hslParams.magenta?.hue ?? 0,
      hslParams.magenta?.saturation ?? 0,
      hslParams.magenta?.luminance ?? 0
    ]));
  } else {
    gl.uniform1i(locs.u_useHSL, 0);
  }

  // Split Toning
  const splitToning = params.splitToning;
  if (splitToning && !isDefaultSplitToneParams(splitToning)) {
    gl.uniform1i(locs.u_useSplitTone, 1);
    gl.uniform1f(locs.u_highlightHue, (splitToning.highlights?.hue ?? 30) / 360.0);
    gl.uniform1f(locs.u_highlightSat, (splitToning.highlights?.saturation ?? 0) / 100.0);
    gl.uniform1f(locs.u_midtoneHue, (splitToning.midtones?.hue ?? 0) / 360.0);
    gl.uniform1f(locs.u_midtoneSat, (splitToning.midtones?.saturation ?? 0) / 100.0);
    gl.uniform1f(locs.u_shadowHue, (splitToning.shadows?.hue ?? 220) / 360.0);
    gl.uniform1f(locs.u_shadowSat, (splitToning.shadows?.saturation ?? 0) / 100.0);
    gl.uniform1f(locs.u_splitBalance, (splitToning.balance ?? 0) / 100.0);
  } else {
    gl.uniform1i(locs.u_useSplitTone, 0);
  }

  // Draw
  gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

  // Debug: Sample center pixel to verify rendering output
  const debugPixels = new Uint8Array(4);
  const centerX = Math.floor(canvas.width / 2);
  const centerY = Math.floor(canvas.height / 2);
  gl.readPixels(centerX, centerY, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, debugPixels);
  if (DEBUG_WEBGL) console.log('[FilmLabWebGL] Center pixel after rendering:', debugPixels, `at (${centerX}, ${centerY})`);

  // Cleanup (unbind)
  gl.bindTexture(gl.TEXTURE_2D, null);
  gl.bindBuffer(gl.ARRAY_BUFFER, null);

  return canvas;
}

const FilmLabWebGL = {
  isWebGLAvailable,
  processImageWebGL
};

export default FilmLabWebGL;
