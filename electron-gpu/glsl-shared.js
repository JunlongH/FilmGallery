/**
 * Shared GLSL Code — Single Source of Truth (Q15 deduplication)
 *
 * All GLSL helper functions live here. Both WebGL2 (FS_GL2) and WebGL1 (FS_GL1)
 * fragment shaders compose from these building blocks. Any change here
 * automatically propagates to both render paths.
 *
 * @module glsl-shared
 */
'use strict';

// ============================================================================
// Shared Uniform Declarations
// ============================================================================

const GLSL_SHARED_UNIFORMS = `
  uniform sampler2D u_tex;
  uniform sampler2D u_toneCurveTex;

  uniform float u_inverted;
  uniform float u_logMode;
  uniform vec3 u_gains;
  uniform float u_exposure;
  uniform float u_contrast;
  uniform float u_highlights;
  uniform float u_shadows;
  uniform float u_whites;
  uniform float u_blacks;

  // Film Curve parameters (Q13: per-channel gamma + toe/shoulder)
  uniform float u_filmCurveEnabled;
  uniform float u_filmCurveGamma;
  uniform float u_filmCurveGammaR;
  uniform float u_filmCurveGammaG;
  uniform float u_filmCurveGammaB;
  uniform float u_filmCurveDMin;
  uniform float u_filmCurveDMax;
  uniform float u_filmCurveToe;
  uniform float u_filmCurveShoulder;

  // Film Base Correction (Pre-Inversion)
  uniform float u_baseMode;
  uniform vec3 u_baseGains;
  uniform vec3 u_baseDensity;

  // Density Levels (Log domain auto-levels)
  uniform float u_densityLevelsEnabled;
  uniform vec3 u_densityLevelsMin;
  uniform vec3 u_densityLevelsMax;

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
`;

// ============================================================================
// Color Space Conversion (RGB ↔ HSL)
// ============================================================================

const GLSL_COLOR_FUNCTIONS = `
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
`;

// ============================================================================
// HSL Channel Adjustment
// Matches CPU filmLabHSL.js — cosine weight, asymmetric sat/lum, normalization
// ============================================================================

const GLSL_HSL_ADJUSTMENT = `
  // Cosine smooth transition (CPU: 0.5*(1+cos(t*PI)))
  float hslChannelWeight(float hue, float centerHue, float hueRange) {
    float dist = min(abs(hue - centerHue), 360.0 - abs(hue - centerHue));
    if (dist >= hueRange) return 0.0;
    float t = dist / hueRange;
    return 0.5 * (1.0 + cos(t * 3.14159265));
  }

  vec3 applyHSLAdjustment(vec3 color) {
    vec3 hsl = rgb2hsl(color);
    float h = hsl.x;
    float s = hsl.y;
    float l = hsl.z;

    float hueAdjust = 0.0;
    float satAdjust = 0.0;
    float lumAdjust = 0.0;
    float totalWeight = 0.0;
    float w;

    // 8 channels: hue centers & ranges from HSL_CHANNELS (filmLabHSL.js)
    w = hslChannelWeight(h, 0.0, 30.0);
    if (w > 0.0) { hueAdjust += u_hslRed.x * w; satAdjust += (u_hslRed.y / 100.0) * w; lumAdjust += (u_hslRed.z / 100.0) * w; totalWeight += w; }
    w = hslChannelWeight(h, 30.0, 30.0);
    if (w > 0.0) { hueAdjust += u_hslOrange.x * w; satAdjust += (u_hslOrange.y / 100.0) * w; lumAdjust += (u_hslOrange.z / 100.0) * w; totalWeight += w; }
    w = hslChannelWeight(h, 60.0, 30.0);
    if (w > 0.0) { hueAdjust += u_hslYellow.x * w; satAdjust += (u_hslYellow.y / 100.0) * w; lumAdjust += (u_hslYellow.z / 100.0) * w; totalWeight += w; }
    w = hslChannelWeight(h, 120.0, 45.0);
    if (w > 0.0) { hueAdjust += u_hslGreen.x * w; satAdjust += (u_hslGreen.y / 100.0) * w; lumAdjust += (u_hslGreen.z / 100.0) * w; totalWeight += w; }
    w = hslChannelWeight(h, 180.0, 30.0);
    if (w > 0.0) { hueAdjust += u_hslCyan.x * w; satAdjust += (u_hslCyan.y / 100.0) * w; lumAdjust += (u_hslCyan.z / 100.0) * w; totalWeight += w; }
    w = hslChannelWeight(h, 240.0, 45.0);
    if (w > 0.0) { hueAdjust += u_hslBlue.x * w; satAdjust += (u_hslBlue.y / 100.0) * w; lumAdjust += (u_hslBlue.z / 100.0) * w; totalWeight += w; }
    w = hslChannelWeight(h, 280.0, 30.0);
    if (w > 0.0) { hueAdjust += u_hslPurple.x * w; satAdjust += (u_hslPurple.y / 100.0) * w; lumAdjust += (u_hslPurple.z / 100.0) * w; totalWeight += w; }
    w = hslChannelWeight(h, 330.0, 30.0);
    if (w > 0.0) { hueAdjust += u_hslMagenta.x * w; satAdjust += (u_hslMagenta.y / 100.0) * w; lumAdjust += (u_hslMagenta.z / 100.0) * w; totalWeight += w; }

    // Normalize if overlapping channels sum > 1
    if (totalWeight > 1.0) {
      hueAdjust /= totalWeight;
      satAdjust /= totalWeight;
      lumAdjust /= totalWeight;
    }

    if (totalWeight > 0.0) {
      hsl.x = mod(hsl.x + hueAdjust, 360.0);

      // Asymmetric saturation (matches CPU filmLabHSL.js)
      if (satAdjust > 0.0) {
        hsl.y = s + (1.0 - s) * satAdjust;
      } else if (satAdjust < 0.0) {
        hsl.y = s * (1.0 + satAdjust);
      }
      hsl.y = clamp(hsl.y, 0.0, 1.0);

      // Asymmetric luminance with 0.5 damping (matches CPU filmLabHSL.js)
      if (lumAdjust > 0.0) {
        hsl.z = l + (1.0 - l) * lumAdjust * 0.5;
      } else if (lumAdjust < 0.0) {
        hsl.z = l * (1.0 + lumAdjust * 0.5);
      }
      hsl.z = clamp(hsl.z, 0.0, 1.0);
    }

    return hsl2rgb(hsl);
  }
`;

// ============================================================================
// Split Toning
// Matches CPU filmLabSplitTone.js — Rec.709, Hermite smoothstep zones, lerp blend
// ============================================================================

const GLSL_SPLIT_TONE = `
  // Rec. 709 luminance (matching CPU filmLabSplitTone.js)
  float calcLuminance(vec3 c) {
    return 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;
  }

  // Hermite smoothstep for zone weight transitions
  float splitToneSmoothstep(float t) {
    t = clamp(t, 0.0, 1.0);
    return t * t * (3.0 - 2.0 * t);
  }

  vec3 applySplitTone(vec3 color) {
    float lum = calcLuminance(color);

    // Zone weights (matching CPU calculateZoneWeights)
    float balanceOffset = u_splitBalance / 2.0;
    float midpoint = 0.5 + balanceOffset;
    float shadowEnd = 0.25;
    float highlightStart = 0.75;

    float shadowWeight = 0.0;
    float midtoneWeight = 0.0;
    float highlightWeight = 0.0;

    // Shadow zone
    if (lum < shadowEnd) {
      shadowWeight = 1.0;
    } else if (lum < midpoint) {
      float d = max(midpoint - shadowEnd, 0.001);
      float st = splitToneSmoothstep(clamp((lum - shadowEnd) / d, 0.0, 1.0));
      shadowWeight = 1.0 - st;
      midtoneWeight = st;
    }

    // Highlight zone
    if (lum > highlightStart) {
      highlightWeight = 1.0;
    } else if (lum > midpoint) {
      float d = max(highlightStart - midpoint, 0.001);
      float st = splitToneSmoothstep(clamp((lum - midpoint) / d, 0.0, 1.0));
      highlightWeight = st;
      midtoneWeight = max(midtoneWeight, 1.0 - st);
    }

    // Midtone zone (peak at midpoint)
    if (lum >= shadowEnd && lum <= highlightStart) {
      if (abs(lum - midpoint) < 0.1) {
        midtoneWeight = 1.0;
      } else if (lum < midpoint) {
        float d = max(midpoint - shadowEnd, 0.001);
        midtoneWeight = max(midtoneWeight, splitToneSmoothstep(clamp((lum - shadowEnd) / d, 0.0, 1.0)));
      } else {
        float d = max(highlightStart - midpoint, 0.001);
        midtoneWeight = max(midtoneWeight, 1.0 - splitToneSmoothstep(clamp((lum - midpoint) / d, 0.0, 1.0)));
      }
    }

    // Generate tint colors
    vec3 highlightTint = hsl2rgb(vec3(u_splitHighlightHue * 360.0, 1.0, 0.5));
    vec3 midtoneTint = hsl2rgb(vec3(u_splitMidtoneHue * 360.0, 1.0, 0.5));
    vec3 shadowTint = hsl2rgb(vec3(u_splitShadowHue * 360.0, 1.0, 0.5));

    // Lerp-to-tint blend (matching CPU: result + (tint - result) * strength * 0.3)
    vec3 result = color;
    if (shadowWeight > 0.0 && u_splitShadowSat > 0.0) {
      float strength = u_splitShadowSat * shadowWeight;
      result += (shadowTint - result) * strength * 0.3;
    }
    if (midtoneWeight > 0.0 && u_splitMidtoneSat > 0.0) {
      float strength = u_splitMidtoneSat * midtoneWeight;
      result += (midtoneTint - result) * strength * 0.3;
    }
    if (highlightWeight > 0.0 && u_splitHighlightSat > 0.0) {
      float strength = u_splitHighlightSat * highlightWeight;
      result += (highlightTint - result) * strength * 0.3;
    }
    return clamp(result, 0.0, 1.0);
  }
`;

// ============================================================================
// Film Curve (H&D Density Model — Q13: 3-segment S-curve + per-channel gamma)
// ============================================================================

const GLSL_FILM_CURVE = `
  // Hermite smoothstep for toe/shoulder blending
  float filmHermite(float t) {
    float c = clamp(t, 0.0, 1.0);
    return c * c * (3.0 - 2.0 * c);
  }

  // Three-segment gamma mapping (matches CPU _applyThreeSegmentGamma)
  float threeSegGamma(float d, float gamma, float toe, float shoulder) {
    float toeBound = 0.25 * toe;
    float shBound  = 1.0 - 0.25 * shoulder;
    float gammaToe = gamma * 1.5;
    float gammaSh  = gamma * 0.6;
    float tw = 0.08;

    if (d < toeBound) {
      return pow(d, gammaToe);
    } else if (d < toeBound + tw && toeBound > 0.0) {
      float t = (d - toeBound) / tw;
      float blend = filmHermite(t);
      return mix(pow(d, gammaToe), pow(d, gamma), blend);
    } else if (d > shBound) {
      return pow(d, gammaSh);
    } else if (d > shBound - tw && shoulder > 0.0) {
      float t = (d - (shBound - tw)) / tw;
      float blend = filmHermite(t);
      return mix(pow(d, gamma), pow(d, gammaSh), blend);
    } else {
      return pow(d, gamma);
    }
  }

  float applyFilmCurve(float value, float gamma, float dMin, float dMax,
                        float toe, float shoulder) {
    float normalized = clamp(value, 0.001, 1.0);
    float density = -log(normalized) / log(10.0);
    float densityNorm = clamp((density - dMin) / (dMax - dMin), 0.0, 1.0);

    float gammaApplied;
    if (toe <= 0.0 && shoulder <= 0.0) {
      gammaApplied = pow(densityNorm, gamma);
    } else {
      gammaApplied = threeSegGamma(densityNorm, gamma, toe, shoulder);
    }

    float adjustedDensity = dMin + gammaApplied * (dMax - dMin);
    float outputT = pow(10.0, -adjustedDensity);
    return clamp(outputT, 0.0, 1.0);
  }

  // Legacy single-gamma overload (backward compat — used when toe=shoulder=0)
  float applyFilmCurveLegacy(float value) {
    return applyFilmCurve(value, u_filmCurveGamma, u_filmCurveDMin, u_filmCurveDMax, 0.0, 0.0);
  }
`;

// ============================================================================
// Main Pipeline Body (parameterized for GL2 vs GL1)
// ============================================================================

/**
 * Build the main() function body for the fragment shader.
 * Parameterized to handle GL2 vs GL1 differences:
 *   - texture() vs texture2D()
 *   - 3D LUT support (GL2 only)
 *   - fragColor vs gl_FragColor
 *
 * @param {boolean} isGL2 - Whether targeting WebGL2
 * @returns {string} GLSL main() function body
 */
function buildShaderMain(isGL2) {
  const TEX = isGL2 ? 'texture' : 'texture2D';
  const FRAG_OUT = isGL2 ? 'fragColor' : 'gl_FragColor';

  return `
  void main(){
    vec3 c = ${TEX}(u_tex, v_uv).rgb;
    
    // ① Film Curve (before inversion) - only when inverting negatives
    // Q13: per-channel gamma + toe/shoulder S-curve
    if (u_inverted > 0.5 && u_filmCurveEnabled > 0.5) {
      float toe = u_filmCurveToe;
      float sh  = u_filmCurveShoulder;
      c.r = applyFilmCurve(c.r, u_filmCurveGammaR, u_filmCurveDMin, u_filmCurveDMax, toe, sh);
      c.g = applyFilmCurve(c.g, u_filmCurveGammaG, u_filmCurveDMin, u_filmCurveDMax, toe, sh);
      c.b = applyFilmCurve(c.b, u_filmCurveGammaB, u_filmCurveDMin, u_filmCurveDMax, toe, sh);
    }
    
    // ② Base Correction - neutralize film base color
    if (u_baseMode > 0.5) {
      // Log mode: density domain subtraction
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
    
    // ②.5 Density Levels (Log domain auto-levels)
    if (u_densityLevelsEnabled > 0.5) {
      float minT = 0.001;
      float log10 = log(10.0);
      
      float rangeR = u_densityLevelsMax.r - u_densityLevelsMin.r;
      float rangeG = u_densityLevelsMax.g - u_densityLevelsMin.g;
      float rangeB = u_densityLevelsMax.b - u_densityLevelsMin.b;
      float avgRange = (rangeR + rangeG + rangeB) / 3.0;
      avgRange = max(avgRange, 0.5);
      avgRange = min(avgRange, 2.5);
      
      float Tr = max(c.r, minT);
      float Dr = -log(Tr) / log10;
      if (rangeR > 0.001) {
        float normR = clamp((Dr - u_densityLevelsMin.r) / rangeR, 0.0, 1.0);
        float DrNew = normR * avgRange;
        c.r = pow(10.0, -DrNew);
      }
      
      float Tg = max(c.g, minT);
      float Dg = -log(Tg) / log10;
      if (rangeG > 0.001) {
        float normG = clamp((Dg - u_densityLevelsMin.g) / rangeG, 0.0, 1.0);
        float DgNew = normG * avgRange;
        c.g = pow(10.0, -DgNew);
      }
      
      float Tb = max(c.b, minT);
      float Db = -log(Tb) / log10;
      if (rangeB > 0.001) {
        float normB = clamp((Db - u_densityLevelsMin.b) / rangeB, 0.0, 1.0);
        float DbNew = normB * avgRange;
        c.b = pow(10.0, -DbNew);
      }
      
      c = clamp(c, 0.0, 1.0);
    }
    
    // ③ Inversion
    if (u_inverted > 0.5) {
      if (u_logMode > 0.5) {
        c = vec3(1.0) - log(c * 255.0 + vec3(1.0)) / log(256.0);
      } else {
        c = vec3(1.0) - c;
      }
    }

${isGL2 ? `
    // ③b 3D LUT (WebGL2 only — applied after inversion)
    if (u_hasLut3d > 0.5) {
       float size = u_lut3dSize;
       vec3 uvw = c * (size - 1.0) / size + 0.5 / size;
       c = texture(u_lut3d, uvw).rgb;
    }
` : `
    // (3D LUT not available in WebGL1 fallback)
`}

    // ④ White Balance
    c *= u_gains;

    // ⑤a Exposure (f-stop formula)
    float expFactor = pow(2.0, u_exposure / 50.0);
    c *= expFactor;

    // ⑤b Contrast around perceptual mid-gray (Q11: 18% reflectance ≈ sRGB 0.46)
    float ctr = u_contrast;
    float midGray = 0.46;
    float factor = (259.0 * (ctr + 255.0)) / (255.0 * (259.0 - ctr));
    c = (c - midGray) * factor + midGray;

    // ⑤c Blacks & Whites window
    float blackPoint = -(u_blacks) * 0.002;
    float whitePoint = 1.0 - (u_whites) * 0.002;
    if (whitePoint != blackPoint) {
      c = (c - vec3(blackPoint)) / (whitePoint - blackPoint);
    }

    // ⑤d Shadows and Highlights (Bernstein basis)
    float sFactor = u_shadows * 0.005;
    float hFactor = u_highlights * 0.005;
    if (sFactor != 0.0) {
      c += sFactor * pow(1.0 - c, vec3(2.0)) * c * 4.0;
    }
    if (hFactor != 0.0) {
      c += hFactor * pow(c, vec3(2.0)) * (1.0 - c) * 4.0;
    }

    // ⑤e Highlight Roll-Off (C² continuous tanh shoulder compression)
    // Matches CPU MathOps.highlightRollOff() — tanh for smooth onset
    float maxVal = max(c.r, max(c.g, c.b));
    float threshold = 0.8;
    if (maxVal > threshold) {
      float headroom = 1.0 - threshold;
      float tRO = min((maxVal - threshold) / headroom, 10.0);
      float e2t = exp(2.0 * tRO);
      float tanhT = (e2t - 1.0) / (e2t + 1.0);
      float compressed = threshold + headroom * tanhT;
      c *= (compressed / maxVal);
    }

    c = clamp(c, 0.0, 1.0);

    // ⑥ Curves (via 1D texture lookup)
    float curveR = ${TEX}(u_toneCurveTex, vec2(c.r, 0.5)).r;
    float curveG = ${TEX}(u_toneCurveTex, vec2(c.g, 0.5)).g;
    float curveB = ${TEX}(u_toneCurveTex, vec2(c.b, 0.5)).b;
    c = vec3(curveR, curveG, curveB);

    // ⑦ HSL Adjustment
    c = applyHSLAdjustment(c);

    // ⑧ Split Toning
    c = applySplitTone(c);

    ${FRAG_OUT} = vec4(c, 1.0);
  }
`;
}

// ============================================================================
// Fragment Shader Builders
// ============================================================================

/**
 * Build the complete fragment shader for either WebGL2 or WebGL1.
 * @param {boolean} isGL2
 * @returns {string} Complete GLSL fragment shader source
 */
function buildFragmentShader(isGL2) {
  if (isGL2) {
    return `#version 300 es
  precision highp float;
  precision highp sampler3D;
  
  in vec2 v_uv;
  out vec4 fragColor;
  
  uniform sampler3D u_lut3d;
  uniform float u_hasLut3d;
  uniform float u_lut3dSize;
${GLSL_SHARED_UNIFORMS}
${GLSL_COLOR_FUNCTIONS}
${GLSL_HSL_ADJUSTMENT}
${GLSL_SPLIT_TONE}
${GLSL_FILM_CURVE}
${buildShaderMain(true)}
`;
  } else {
    return `
  precision highp float;
  varying vec2 v_uv;
${GLSL_SHARED_UNIFORMS}
${GLSL_COLOR_FUNCTIONS}
${GLSL_HSL_ADJUSTMENT}
${GLSL_SPLIT_TONE}
${GLSL_FILM_CURVE}
${buildShaderMain(false)}
`;
  }
}

module.exports = {
  buildFragmentShader,
  // Exported for testing / inspection
  GLSL_SHARED_UNIFORMS,
  GLSL_COLOR_FUNCTIONS,
  GLSL_HSL_ADJUSTMENT,
  GLSL_SPLIT_TONE,
  GLSL_FILM_CURVE,
  buildShaderMain,
};
