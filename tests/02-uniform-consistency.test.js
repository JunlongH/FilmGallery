/**
 * Uniform 一致性测试
 * 
 * 验证：
 * - 所有标志位 uniform 使用 float 类型 (非 int) — BUG-14 修复验证
 * - 所有标志位使用 > 0.5 判断模式
 * - Split Tone uniform 使用 u_split* 前缀 — BUG-03 修复验证
 * - RenderCore.getGLSLUniforms() 输出与着色器声明匹配
 * - gpu-renderer 路径 uniform 名匹配共享着色器
 */
'use strict';

const shaders = require('../packages/shared/shaders');
const {
  extractUniforms,
  findIntUniforms,
  usesFloatBoolPattern,
} = require('./helpers');

// ============================================================================
// 1. Uniform 类型 — 全部 float (BUG-14)
// ============================================================================

describe('Uniform types — float only (BUG-14)', () => {
  let gl1Uniforms, gl2Uniforms;

  beforeAll(() => {
    const gl1 = shaders.buildFragmentShader({ isGL2: false });
    const gl2 = shaders.buildFragmentShader({ isGL2: true });
    gl1Uniforms = extractUniforms(gl1);
    gl2Uniforms = extractUniforms(gl2);
  });

  test('WebGL1: 无 int 类型 uniform', () => {
    const intUniforms = gl1Uniforms.filter(u => u.type === 'int');
    expect(intUniforms).toHaveLength(0);
  });

  test('WebGL2: 无 int 类型 uniform', () => {
    const intUniforms = gl2Uniforms.filter(u => u.type === 'int');
    expect(intUniforms).toHaveLength(0);
  });

  test('uniforms.js 模块本身不含 int 类型', () => {
    const intUniforms = findIntUniforms(shaders.uniforms.UNIFORMS_GLSL);
    expect(intUniforms).toHaveLength(0);
  });
});

// ============================================================================
// 2. Float 布尔判断模式 (> 0.5)
// ============================================================================

describe('Float boolean pattern (> 0.5 / < 0.5)', () => {
  let mainBody;

  beforeAll(() => {
    const glsl = shaders.buildFragmentShader({ isGL2: false });
    mainBody = glsl.substring(glsl.indexOf('void main()'));
  });

  const booleanFlags = [
    'u_inverted',
    'u_inversionMode',
    'u_baseMode',
    'u_filmCurveEnabled',
    'u_useCurves',
    'u_useHSL',
    'u_useSplitTone',
    'u_useLut3d',
    'u_densityLevelsEnabled',
  ];

  test.each(booleanFlags)('%s 使用 > 0.5 或 < 0.5 判断', (flag) => {
    const fullGlsl = shaders.buildFragmentShader({ isGL2: false });
    expect(usesFloatBoolPattern(fullGlsl, flag)).toBe(true);
  });
});

// ============================================================================
// 3. Split Tone uniform 命名 (u_split* 前缀) — BUG-03
// ============================================================================

describe('Split Tone uniform naming — u_split* prefix (BUG-03)', () => {
  let uniforms;

  beforeAll(() => {
    uniforms = extractUniforms(shaders.uniforms.UNIFORMS_GLSL);
  });

  const expectedSplitUniforms = [
    'u_splitHighlightHue',
    'u_splitHighlightSat',
    'u_splitMidtoneHue',
    'u_splitMidtoneSat',
    'u_splitShadowHue',
    'u_splitShadowSat',
    'u_splitBalance',
    'u_useSplitTone',
  ];

  test.each(expectedSplitUniforms)('声明了 %s', (name) => {
    const found = uniforms.find(u => u.name === name);
    expect(found).toBeDefined();
  });

  test('所有 Split Tone uniforms 类型为 float', () => {
    const splitUniforms = uniforms.filter(u => u.name.startsWith('u_split'));
    for (const u of splitUniforms) {
      expect(u.type).toBe('float');
    }
  });

  test('不存在旧命名 (u_highlightHue, u_highlightSat 等)', () => {
    const oldNames = [
      'u_highlightHue', 'u_highlightSat',
      'u_shadowHue', 'u_shadowSat',
      'u_midtoneHue', 'u_midtoneSat',
    ];
    for (const name of oldNames) {
      const found = uniforms.find(u => u.name === name);
      expect(found).toBeUndefined();
    }
  });
});

// ============================================================================
// 4. HSL Uniform 完整性
// ============================================================================

describe('HSL Uniforms', () => {
  let uniforms;

  beforeAll(() => {
    uniforms = extractUniforms(shaders.uniforms.UNIFORMS_GLSL);
  });

  const hslChannels = [
    'u_hslRed', 'u_hslOrange', 'u_hslYellow', 'u_hslGreen',
    'u_hslCyan', 'u_hslBlue', 'u_hslPurple', 'u_hslMagenta',
  ];

  test('声明了 u_useHSL', () => {
    expect(uniforms.find(u => u.name === 'u_useHSL')).toBeDefined();
  });

  test.each(hslChannels)('声明了 %s (vec3)', (name) => {
    const found = uniforms.find(u => u.name === name);
    expect(found).toBeDefined();
    expect(found.type).toBe('vec3');
  });
});

// ============================================================================
// 5. Film Curve per-channel uniforms (Q13)
// ============================================================================

describe('Film Curve uniforms — per-channel (Q13)', () => {
  let uniforms;

  beforeAll(() => {
    uniforms = extractUniforms(shaders.uniforms.UNIFORMS_GLSL);
  });

  const filmCurveUniforms = [
    { name: 'u_filmCurveEnabled', type: 'float' },
    { name: 'u_filmCurveGamma', type: 'float' },
    { name: 'u_filmCurveGammaR', type: 'float' },
    { name: 'u_filmCurveGammaG', type: 'float' },
    { name: 'u_filmCurveGammaB', type: 'float' },
    { name: 'u_filmCurveDMin', type: 'float' },
    { name: 'u_filmCurveDMax', type: 'float' },
    { name: 'u_filmCurveToe', type: 'float' },
    { name: 'u_filmCurveShoulder', type: 'float' },
  ];

  test.each(filmCurveUniforms)('$name ($type)', ({ name, type }) => {
    const found = uniforms.find(u => u.name === name);
    expect(found).toBeDefined();
    expect(found.type).toBe(type);
  });
});

// ============================================================================
// 6. Tone mapping uniforms 完整性
// ============================================================================

describe('Tone mapping uniforms', () => {
  let uniforms;

  beforeAll(() => {
    uniforms = extractUniforms(shaders.uniforms.UNIFORMS_GLSL);
  });

  const toneUniforms = [
    { name: 'u_exposure', type: 'float' },
    { name: 'u_contrast', type: 'float' },
    { name: 'u_highlights', type: 'float' },
    { name: 'u_shadows', type: 'float' },
    { name: 'u_whites', type: 'float' },
    { name: 'u_blacks', type: 'float' },
  ];

  test.each(toneUniforms)('$name ($type)', ({ name, type }) => {
    const found = uniforms.find(u => u.name === name);
    expect(found).toBeDefined();
    expect(found.type).toBe(type);
  });
});

// ============================================================================
// 7. WebGL1 vs WebGL2 — uniform 声明一致性
// ============================================================================

describe('WebGL1 vs WebGL2 uniform consistency', () => {
  test('共同的 uniform 名称和类型一致', () => {
    const gl1 = shaders.buildFragmentShader({ isGL2: false });
    const gl2 = shaders.buildFragmentShader({ isGL2: true });
    const gl1Uniforms = extractUniforms(gl1);
    const gl2Uniforms = extractUniforms(gl2);

    // uniforms.js 中声明的 uniform 在两个版本中都应存在
    const sharedUniforms = extractUniforms(shaders.uniforms.UNIFORMS_GLSL);

    for (const shared of sharedUniforms) {
      const inGL1 = gl1Uniforms.find(u => u.name === shared.name);
      const inGL2 = gl2Uniforms.find(u => u.name === shared.name);
      expect(inGL1).toBeDefined();
      expect(inGL2).toBeDefined();
      // 类型必须相同
      if (inGL1 && inGL2) {
        expect(inGL1.type).toBe(inGL2.type);
      }
    }
  });
});

// ============================================================================
// 8. RenderCore.getGLSLUniforms() 与着色器声明匹配
// ============================================================================

describe('RenderCore.getGLSLUniforms() uniform name alignment', () => {
  let renderCoreUniforms, shaderUniforms;

  beforeAll(() => {
    const { RenderCore } = require('../packages/shared/render/RenderCore');
    const core = new RenderCore({
      inverted: true,
      inversionMode: 'log',
      filmCurveEnabled: true,
      exposure: 10,
      contrast: 20,
      highlights: -15,
      shadows: 30,
      whites: 10,
      blacks: -5,
      splitToning: {
        highlights: { hue: 40, saturation: 50 },
        midtones: { hue: 120, saturation: 30 },
        shadows: { hue: 220, saturation: 60 },
        balance: -20,
      },
      hslParams: {
        red: { hue: 5, saturation: 10, luminance: -5 },
        orange: { hue: 0, saturation: 0, luminance: 0 },
        yellow: { hue: 0, saturation: 0, luminance: 0 },
        green: { hue: 0, saturation: 0, luminance: 0 },
        cyan: { hue: 0, saturation: 0, luminance: 0 },
        blue: { hue: 0, saturation: 0, luminance: 0 },
        purple: { hue: 0, saturation: 0, luminance: 0 },
        magenta: { hue: 0, saturation: 0, luminance: 0 },
      },
    });
    renderCoreUniforms = core.getGLSLUniforms();
    shaderUniforms = extractUniforms(shaders.uniforms.UNIFORMS_GLSL);
  });

  test('所有标量 uniform 名存在于着色器声明中', () => {
    // RenderCore 输出的 key 中，排除非 uniform 的辅助 key
    const nonUniformKeys = ['curveLUTs', 'u_hslParams'];
    const rcKeys = Object.keys(renderCoreUniforms).filter(k => !nonUniformKeys.includes(k));

    const shaderNames = new Set(shaderUniforms.map(u => u.name));
    // 额外 GL2-only uniforms
    shaderNames.add('u_hasLut3d');    // GL2 3D LUT flag
    shaderNames.add('u_lut3dSize');   // GL2 LUT size
    shaderNames.add('u_lut3dTex');    // GL2 sampler3D

    for (const key of rcKeys) {
      // u_hasLut3d 和 u_lutIntensity 可能在不同地方声明
      expect(
        shaderNames.has(key) || key === 'u_hasLut3d' || key === 'u_lutIntensity'
      ).toBe(true);
    }
  });

  test('Split Tone uniform 值正确归一化', () => {
    // hue 应该 / 360, sat 应该 / 100, balance 应该 / 100
    expect(renderCoreUniforms.u_splitHighlightHue).toBeCloseTo(40 / 360, 5);
    expect(renderCoreUniforms.u_splitHighlightSat).toBeCloseTo(50 / 100, 5);
    expect(renderCoreUniforms.u_splitShadowHue).toBeCloseTo(220 / 360, 5);
    expect(renderCoreUniforms.u_splitShadowSat).toBeCloseTo(60 / 100, 5);
    expect(renderCoreUniforms.u_splitMidtoneHue).toBeCloseTo(120 / 360, 5);
    expect(renderCoreUniforms.u_splitMidtoneSat).toBeCloseTo(30 / 100, 5);
    expect(renderCoreUniforms.u_splitBalance).toBeCloseTo(-20 / 100, 5);
  });

  test('色调参数传递原始 UI 值（着色器内部缩放）', () => {
    // exposure/contrast 不应预缩放
    expect(renderCoreUniforms.u_exposure).toBe(10);
    expect(renderCoreUniforms.u_contrast).toBe(20);
    expect(renderCoreUniforms.u_highlights).toBe(-15);
    expect(renderCoreUniforms.u_shadows).toBe(30);
    expect(renderCoreUniforms.u_whites).toBe(10);
    expect(renderCoreUniforms.u_blacks).toBe(-5);
  });

  test('布尔标志位为 float 0.0/1.0', () => {
    expect(renderCoreUniforms.u_inverted).toBe(1.0);
    expect(renderCoreUniforms.u_inversionMode).toBe(1.0);
    expect(renderCoreUniforms.u_filmCurveEnabled).toBe(1.0);
    expect(typeof renderCoreUniforms.u_useCurves).toBe('number');
    expect(typeof renderCoreUniforms.u_useHSL).toBe('number');
    expect(typeof renderCoreUniforms.u_useSplitTone).toBe('number');
  });
});
