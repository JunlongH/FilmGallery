/**
 * GLSL Uniforms 声明
 * 
 * 统一的 uniform 变量声明，确保客户端和服务端使用相同的变量名和类型
 */

const UNIFORMS_GLSL = `
// Image texture
uniform sampler2D u_image;

// Inversion
uniform int u_inverted;      // 0 = no inversion, 1 = invert
uniform int u_inversionMode; // 0 = linear, 1 = log

// White Balance
uniform vec3 u_gains;        // r,g,b gains

// Tone adjustments
uniform float u_exposure;    // -100..100
uniform float u_contrast;    // -100..100
uniform float u_highlights;  // -100..100
uniform float u_shadows;     // -100..100
uniform float u_whites;      // -100..100
uniform float u_blacks;      // -100..100

// Film Curve parameters
uniform int u_filmCurveEnabled;
uniform float u_filmCurveGamma;
uniform float u_filmCurveDMin;
uniform float u_filmCurveDMax;

// Film Base Correction (Pre-Inversion)
uniform int u_baseMode;      // 0 = linear (gains), 1 = log (density subtraction)
uniform vec3 u_baseGains;    // Linear mode: r,g,b gains
uniform vec3 u_baseDensity;  // Log mode: r,g,b density values to subtract

// Density Levels (Log domain auto-levels)
uniform int u_densityLevelsEnabled;
uniform vec3 u_densityLevelsMin;
uniform vec3 u_densityLevelsMax;

// Curve LUTs (1D textures)
uniform sampler2D u_curveRGB;
uniform sampler2D u_curveR;
uniform sampler2D u_curveG;
uniform sampler2D u_curveB;
uniform int u_useCurves;

// 3D LUT
uniform sampler2D u_lut3d;
uniform int u_useLut3d;
uniform int u_lutSize;
uniform float u_lutIntensity;

// HSL adjustments (8 channels)
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
`;

module.exports = {
  UNIFORMS_GLSL,
};
