/**
 * 着色器构建完整性测试
 * 
 * 验证 buildFragmentShader() 在各种配置下能正确生成有效 GLSL
 * 
 * 覆盖 BUG-01~16 修复后的着色器构建行为
 */
'use strict';

const shaders = require('../packages/shared/shaders');
const {
  extractUniforms,
  extractFunctionNames,
  findIntUniforms,
} = require('./helpers');

// ============================================================================
// 1. Fragment Shader — WebGL1 构建
// ============================================================================

describe('buildFragmentShader — WebGL1', () => {
  let glsl;

  beforeAll(() => {
    glsl = shaders.buildFragmentShader({ isGL2: false });
  });

  test('生成非空字符串', () => {
    expect(typeof glsl).toBe('string');
    expect(glsl.length).toBeGreaterThan(500);
  });

  test('不包含 #version 300 es (WebGL1)', () => {
    expect(glsl).not.toContain('#version 300 es');
  });

  test('包含 precision mediump float', () => {
    expect(glsl).toMatch(/precision\s+mediump\s+float/);
  });

  test('包含 varying v_uv', () => {
    expect(glsl).toContain('varying vec2 v_uv');
  });

  test('包含 void main()', () => {
    expect(glsl).toContain('void main()');
  });

  test('包含 gl_FragColor (WebGL1 输出)', () => {
    expect(glsl).toContain('gl_FragColor');
  });

  test('不包含 fragColor (WebGL2 输出)', () => {
    // fragColor 仅在 WebGL2 路径使用
    expect(glsl).not.toMatch(/\bout\s+vec4\s+fragColor\b/);
  });

  test('使用 texture2D (WebGL1)', () => {
    expect(glsl).toContain('texture2D');
  });

  test('包含 sampleLUT3D 函数 (WebGL1 packed 2D)', () => {
    expect(glsl).toContain('sampleLUT3D');
  });

  test('不包含 sampler3D (WebGL1 没有原生 3D 纹理)', () => {
    // uniforms 中不应有 sampler3D
    const uniforms = extractUniforms(glsl);
    const sampler3dUniforms = uniforms.filter(u => u.type === 'sampler3D');
    expect(sampler3dUniforms).toHaveLength(0);
  });
});

// ============================================================================
// 2. Fragment Shader — WebGL2 构建
// ============================================================================

describe('buildFragmentShader — WebGL2', () => {
  let glsl;

  beforeAll(() => {
    glsl = shaders.buildFragmentShader({ isGL2: true });
  });

  test('生成非空字符串', () => {
    expect(typeof glsl).toBe('string');
    expect(glsl.length).toBeGreaterThan(500);
  });

  test('以 #version 300 es 开头', () => {
    expect(glsl.trimStart()).toMatch(/^#version 300 es/);
  });

  test('包含 precision highp float', () => {
    expect(glsl).toContain('precision highp float');
  });

  test('包含 precision highp sampler3D', () => {
    expect(glsl).toContain('precision highp sampler3D');
  });

  test('包含 in vec2 v_uv (WebGL2 syntax)', () => {
    expect(glsl).toContain('in vec2 v_uv');
  });

  test('包含 out vec4 fragColor (WebGL2 输出)', () => {
    expect(glsl).toContain('out vec4 fragColor');
  });

  test('包含 fragColor = (而非 gl_FragColor)', () => {
    expect(glsl).toContain('fragColor = vec4(c, 1.0)');
  });

  test('包含 sampler3D u_lut3dTex (WebGL2 原生 3D 纹理)', () => {
    expect(glsl).toContain('sampler3D u_lut3dTex');
  });

  test('包含 #define texture2D texture (GL2 compat)', () => {
    expect(glsl).toContain('#define texture2D texture');
  });
});

// ============================================================================
// 3. Fragment Shader — useCompositeCurve 选项
// ============================================================================

describe('buildFragmentShader — useCompositeCurve', () => {
  test('默认 (useCompositeCurve=false) 使用 applyCurvesLUT()', () => {
    const glsl = shaders.buildFragmentShader({ isGL2: false });
    expect(glsl).toContain('applyCurvesLUT');
  });

  test('useCompositeCurve=true 使用 u_toneCurveTex', () => {
    const glsl = shaders.buildFragmentShader({ isGL2: true, useCompositeCurve: true });
    expect(glsl).toContain('u_toneCurveTex');
    // 不应包含 applyCurvesLUT — 使用复合纹理代替
    // (注意：applyCurvesLUT 的定义仍在 tonemap 模块中，但 main() 不调用它)
    const mainBody = glsl.substring(glsl.indexOf('void main()'));
    expect(mainBody).not.toContain('applyCurvesLUT');
  });

  test('useCompositeCurve=false + WebGL2 不包含 u_toneCurveTex', () => {
    const glsl = shaders.buildFragmentShader({ isGL2: true, useCompositeCurve: false });
    expect(glsl).not.toContain('u_toneCurveTex');
  });
});

// ============================================================================
// 4. Vertex Shaders
// ============================================================================

describe('Vertex Shaders', () => {
  test('VERTEX_SHADER (GL1) 包含 attribute/varying', () => {
    expect(shaders.VERTEX_SHADER).toContain('attribute vec2 a_pos');
    expect(shaders.VERTEX_SHADER).toContain('attribute vec2 a_uv');
    expect(shaders.VERTEX_SHADER).toContain('varying vec2 v_uv');
  });

  test('VERTEX_SHADER_GL2 包含 in/out + #version 300 es', () => {
    expect(shaders.VERTEX_SHADER_GL2).toContain('#version 300 es');
    expect(shaders.VERTEX_SHADER_GL2).toContain('in vec2 a_pos');
    expect(shaders.VERTEX_SHADER_GL2).toContain('in vec2 a_uv');
    expect(shaders.VERTEX_SHADER_GL2).toContain('out vec2 v_uv');
  });
});

// ============================================================================
// 5. 所有子模块导出完整性
// ============================================================================

describe('Shader module exports', () => {
  test('所有 9 个子模块均可访问', () => {
    expect(shaders.colorMath).toBeDefined();
    expect(shaders.hslAdjust).toBeDefined();
    expect(shaders.splitTone).toBeDefined();
    expect(shaders.filmCurve).toBeDefined();
    expect(shaders.tonemap).toBeDefined();
    expect(shaders.lut3d).toBeDefined();
    expect(shaders.inversion).toBeDefined();
    expect(shaders.baseDensity).toBeDefined();
    expect(shaders.uniforms).toBeDefined();
  });

  test('所有子模块导出非空 GLSL 字符串', () => {
    const modules = [
      { name: 'COLOR_MATH_GLSL', mod: shaders.colorMath.COLOR_MATH_GLSL },
      { name: 'HSL_ADJUST_GLSL', mod: shaders.hslAdjust.HSL_ADJUST_GLSL },
      { name: 'SPLIT_TONE_GLSL', mod: shaders.splitTone.SPLIT_TONE_GLSL },
      { name: 'FILM_CURVE_GLSL', mod: shaders.filmCurve.FILM_CURVE_GLSL },
      { name: 'TONEMAP_GLSL', mod: shaders.tonemap.TONEMAP_GLSL },
      { name: 'LUT3D_GLSL', mod: shaders.lut3d.LUT3D_GLSL },
      { name: 'INVERSION_GLSL', mod: shaders.inversion.INVERSION_GLSL },
      { name: 'BASE_DENSITY_GLSL', mod: shaders.baseDensity.BASE_DENSITY_GLSL },
      { name: 'UNIFORMS_GLSL', mod: shaders.uniforms.UNIFORMS_GLSL },
    ];

    for (const { name, mod } of modules) {
      expect(typeof mod).toBe('string');
      expect(mod.length).toBeGreaterThan(50);
    }
  });

  test('SHADER_VERSION 存在且格式正确', () => {
    expect(shaders.SHADER_VERSION).toBeDefined();
    expect(typeof shaders.SHADER_VERSION).toBe('string');
    expect(shaders.SHADER_VERSION.length).toBeGreaterThan(5);
  });
});

// ============================================================================
// 6. GLSL 必要函数定义
// ============================================================================

describe('GLSL function definitions', () => {
  let gl1Fns, gl2Fns;

  beforeAll(() => {
    const gl1 = shaders.buildFragmentShader({ isGL2: false });
    const gl2 = shaders.buildFragmentShader({ isGL2: true });
    gl1Fns = extractFunctionNames(gl1);
    gl2Fns = extractFunctionNames(gl2);
  });

  const requiredFunctions = [
    // colorMath
    'rgb2hsl', 'hsl2rgb', 'hue2rgb',
    // HSL
    'hslChannelWeight', 'applyHSLAdjustment',
    // Split Tone
    'calcLuminance', 'splitToneSmoothstep', 'applySplitTone',
    // Film Curve
    'filmHermite', 'threeSegGamma', 'applyFilmCurve', 'applyFilmCurveLegacy',
    // Tonemap
    'applyContrast', 'applyHighlightsShadows', 'applyWhitesBlacks',
    'applyHighlightRollOff', 'sampleCurve', 'applyCurvesLUT',
  ];

  test.each(requiredFunctions)('WebGL1 shader 包含函数: %s', (fnName) => {
    expect(gl1Fns).toContain(fnName);
  });

  test.each(requiredFunctions)('WebGL2 shader 包含函数: %s', (fnName) => {
    expect(gl2Fns).toContain(fnName);
  });

  test('WebGL1 包含 sampleLUT3D (packed 2D)', () => {
    expect(gl1Fns).toContain('sampleLUT3D');
  });

  test('WebGL2 不需要 sampleLUT3D (使用原生 sampler3D)', () => {
    // WebGL2 路径使用 texture(u_lut3dTex, uvw) 直接采样
    // sampleLUT3D 不应在 GL2 shader 中出现
    expect(gl2Fns).not.toContain('sampleLUT3D');
  });
});
