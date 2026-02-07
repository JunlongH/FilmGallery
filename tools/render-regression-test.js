#!/usr/bin/env node
/**
 * Render Pipeline Regression Test (Phase 4.6)
 *
 * Validates CPU rendering math against known reference values.
 * Run:  node tools/render-regression-test.js
 *
 * Checks:
 *  1. Highlight roll-off  — C² continuity (value, derivative, curvature)
 *  2. Split tone           — precomputed vs legacy per-pixel match
 *  3. Tone curves          — identity curve passthrough
 *  4. GLSL module          — shader string generation sanity
 *  5. CPU pipeline         — known-input → expected-output RMSE
 */
'use strict';

const path = require('path');

// ── Imports ──────────────────────────────────────────────────────────────────
const { highlightRollOff, reinhard, filmicACES } = require('../packages/shared/render/math/tone-curves');
const { buildFragmentShader, buildShaderMain, GLSL_SHARED_UNIFORMS } = require('../electron-gpu/glsl-shared');
const {
  applySplitTone,
  prepareSplitTone,
  applySplitToneFast,
  isDefaultSplitTone,
  calculateLuminance,
  calculateZoneWeights,
} = require('../packages/shared/filmLabSplitTone');
const { applyHSL, isDefaultHSL } = require('../packages/shared/filmLabHSL');

// ── Helpers ──────────────────────────────────────────────────────────────────

let passCount = 0;
let failCount = 0;

function assert(condition, msg) {
  if (condition) {
    passCount++;
  } else {
    failCount++;
    console.error(`  ✗ FAIL: ${msg}`);
  }
}

function approxEq(a, b, eps = 1e-6) {
  return Math.abs(a - b) < eps;
}

function numericalDerivative(fn, x, h = 1e-7) {
  return (fn(x + h) - fn(x - h)) / (2 * h);
}

function numericalSecondDerivative(fn, x, h = 1e-5) {
  return (fn(x + h) - 2 * fn(x) + fn(x - h)) / (h * h);
}

function rmse(actual, expected) {
  let sum = 0;
  for (let i = 0; i < actual.length; i++) {
    const d = actual[i] - expected[i];
    sum += d * d;
  }
  return Math.sqrt(sum / actual.length);
}

// ══════════════════════════════════════════════════════════════════════════════
// Test 1: Highlight Roll-off C² Continuity
// ══════════════════════════════════════════════════════════════════════════════
function testHighlightRollOff() {
  console.log('\n── Test 1: Highlight Roll-off C² Continuity ──');

  const threshold = 0.8;
  const fn = (x) => highlightRollOff(x, threshold);

  // Value continuity at threshold
  const atThreshold = fn(threshold);
  assert(approxEq(atThreshold, threshold, 1e-10),
    `f(threshold) = ${atThreshold}, expected ${threshold}`);

  // Below threshold → identity
  assert(approxEq(fn(0.5), 0.5, 1e-10),
    `f(0.5) = ${fn(0.5)}, expected 0.5 (identity below threshold)`);
  assert(approxEq(fn(0.0), 0.0, 1e-10),
    `f(0.0) = ${fn(0.0)}, expected 0.0`);

  // First derivative at threshold = 1 (C¹)
  const d1 = numericalDerivative(fn, threshold);
  assert(approxEq(d1, 1.0, 1e-4),
    `f'(threshold) = ${d1.toFixed(6)}, expected 1.0`);

  // Second derivative at threshold = 0 (C²)
  const d2 = numericalSecondDerivative(fn, threshold);
  assert(approxEq(d2, 0.0, 0.1),
    `f''(threshold) = ${d2.toFixed(6)}, expected ~0.0`);

  // Monotonically increasing
  let prev = fn(0);
  let monotonic = true;
  for (let x = 0.01; x <= 2.0; x += 0.01) {
    const val = fn(x);
    if (val < prev - 1e-10) { monotonic = false; break; }
    prev = val;
  }
  assert(monotonic, 'Highlight roll-off should be monotonically increasing');

  // Asymptotically approaches 1.0
  const atLarge = fn(100.0);
  assert(atLarge > 0.999 && atLarge < 1.0,
    `f(100.0) = ${atLarge.toFixed(8)}, expected ~1.0 (asymptotic)`);

  // Never exceeds 1.0
  const atHuge = fn(1e6);
  assert(atHuge < 1.0,
    `f(1e6) = ${atHuge}, must be < 1.0`);

  console.log(`  ✓ Roll-off: value=${atThreshold}, d1=${d1.toFixed(6)}, d2=${d2.toFixed(6)}, asymptote=${atLarge.toFixed(8)}`);
}

// ══════════════════════════════════════════════════════════════════════════════
// Test 2: Split Tone — Precomputed vs Legacy Match
// ══════════════════════════════════════════════════════════════════════════════
function testSplitTone() {
  console.log('\n── Test 2: Split Tone Precomputed vs Legacy ──');

  const params = {
    highlights: { hue: 40, saturation: 50 },
    midtones: { hue: 120, saturation: 30 },
    shadows: { hue: 240, saturation: 60 },
    balance: 10,
  };

  const ctx = prepareSplitTone(params);
  assert(ctx !== null, 'prepareSplitTone should return non-null for non-default params');

  // Test a range of pixel values
  const testPixels = [
    [0, 0, 0],       // pure black (shadow)
    [128, 128, 128], // mid gray (midtone)
    [255, 255, 255], // pure white (highlight)
    [200, 100, 50],  // warm highlight
    [30, 80, 150],   // cool shadow
    [100, 200, 100], // green midtone
  ];

  let maxDiff = 0;
  for (const [r, g, b] of testPixels) {
    const legacy = applySplitTone(r, g, b, params);
    const fast = applySplitToneFast(r, g, b, ctx);

    for (let ch = 0; ch < 3; ch++) {
      const diff = Math.abs(legacy[ch] - fast[ch]);
      maxDiff = Math.max(maxDiff, diff);
    }
  }

  assert(maxDiff === 0,
    `Max pixel diff between legacy and fast: ${maxDiff} (expected 0)`);

  // Default params → null context
  const defaultCtx = prepareSplitTone({});
  assert(defaultCtx === null,
    'prepareSplitTone({}) should return null');

  // applySplitToneFast with null ctx → passthrough
  const passthrough = applySplitToneFast(128, 64, 200, null);
  assert(passthrough[0] === 128 && passthrough[1] === 64 && passthrough[2] === 200,
    'applySplitToneFast(null) should be identity');

  console.log(`  ✓ Split tone precomputed matches legacy exactly (max diff: ${maxDiff})`);
}

// ══════════════════════════════════════════════════════════════════════════════
// Test 3: Tone Curve Functions
// ══════════════════════════════════════════════════════════════════════════════
function testToneCurves() {
  console.log('\n── Test 3: Tone Curve Functions ──');

  // Reinhard(0) = 0, Reinhard(1) = 0.5
  assert(approxEq(reinhard(0), 0.0), `reinhard(0) = ${reinhard(0)}`);
  assert(approxEq(reinhard(1), 0.5), `reinhard(1) = ${reinhard(1)}`);
  assert(reinhard(100) > 0.99, `reinhard(100) should approach 1`);

  // ACES(0) = 0, ACES(1) ≈ 0.xx, always in [0,1]
  assert(approxEq(filmicACES(0), 0.0), `filmicACES(0) = ${filmicACES(0)}`);
  assert(filmicACES(1) > 0 && filmicACES(1) < 1, `filmicACES(1) in (0,1)`);
  assert(filmicACES(100) <= 1.0, `filmicACES(100) <= 1.0`);

  // Highlight roll-off identity below threshold
  for (let x = 0; x <= 0.8; x += 0.1) {
    assert(approxEq(highlightRollOff(x), x, 1e-10),
      `highlightRollOff(${x.toFixed(1)}) = ${highlightRollOff(x)} (should be identity)`);
  }

  console.log('  ✓ Tone curve basic properties verified');
}

// ══════════════════════════════════════════════════════════════════════════════
// Test 4: GLSL Module Sanity
// ══════════════════════════════════════════════════════════════════════════════
function testGLSLModule() {
  console.log('\n── Test 4: GLSL Module Sanity ──');

  const gl2 = buildFragmentShader(true);
  const gl1 = buildFragmentShader(false);

  assert(typeof gl2 === 'string' && gl2.length > 5000,
    `GL2 shader should be a long string (got ${gl2.length} chars)`);
  assert(typeof gl1 === 'string' && gl1.length > 5000,
    `GL1 shader should be a long string (got ${gl1.length} chars)`);

  // GL2 specifics
  assert(gl2.trimStart().startsWith('#version 300 es'),
    'GL2 should start with #version 300 es');
  assert(gl2.includes('in vec2 v_uv;'), 'GL2 should use "in" for varying');
  assert(gl2.includes('out vec4 fragColor;'), 'GL2 should have fragColor output');
  assert(gl2.includes('texture(u_tex'), 'GL2 should use texture() not texture2D()');
  assert(gl2.includes('u_lut3d'), 'GL2 should have 3D LUT support');
  assert(gl2.includes('fragColor = vec4(c, 1.0)'), 'GL2 output to fragColor');

  // GL1 specifics
  assert(!gl1.includes('#version'), 'GL1 should NOT have #version header');
  assert(gl1.includes('varying vec2 v_uv;'), 'GL1 should use "varying"');
  assert(gl1.includes('texture2D(u_tex'), 'GL1 should use texture2D()');
  assert(gl1.includes('gl_FragColor = vec4(c, 1.0)'), 'GL1 output to gl_FragColor');
  assert(!gl1.includes('sampler3D'), 'GL1 should NOT reference sampler3D');

  // Shared content present in both
  const sharedFunctions = [
    'rgb2hsl', 'hsl2rgb', 'hue2rgb',
    'hslChannelWeight', 'applyHSLAdjustment',
    'calcLuminance', 'splitToneSmoothstep', 'applySplitTone',
    'applyFilmCurve',
  ];
  for (const fn of sharedFunctions) {
    assert(gl2.includes(fn), `GL2 should contain ${fn}`);
    assert(gl1.includes(fn), `GL1 should contain ${fn}`);
  }

  // Tanh roll-off present in both
  assert(gl2.includes('tanhT') && gl2.includes('exp(2.0'),
    'GL2 should have tanh-based highlight roll-off');
  assert(gl1.includes('tanhT') && gl1.includes('exp(2.0'),
    'GL1 should have tanh-based highlight roll-off');

  // Uniform declarations present
  const uniformNames = [
    'u_tex', 'u_toneCurveTex', 'u_inverted', 'u_exposure', 'u_contrast',
    'u_highlights', 'u_shadows', 'u_whites', 'u_blacks',
    'u_hslRed', 'u_hslOrange', 'u_hslYellow', 'u_hslGreen',
    'u_splitHighlightHue', 'u_splitShadowSat', 'u_splitBalance',
  ];
  for (const u of uniformNames) {
    assert(gl2.includes(u), `GL2 should declare ${u}`);
    assert(gl1.includes(u), `GL1 should declare ${u}`);
  }

  console.log(`  ✓ GLSL module: GL2=${gl2.length} chars, GL1=${gl1.length} chars, all functions present`);
}

// ══════════════════════════════════════════════════════════════════════════════
// Test 5: CPU Pipeline RMSE (RenderCore)
// ══════════════════════════════════════════════════════════════════════════════
function testCPUPipeline() {
  console.log('\n── Test 5: CPU Pipeline Known-value RMSE ──');

  const { RenderCore } = require('../packages/shared/render/RenderCore');

  // Identity parameters (no adjustments) → output ≈ input
  const identityParams = {
    exposure: 0,
    contrast: 0,
    highlights: 0,
    shadows: 0,
    whites: 0,
    blacks: 0,
    red: 1, green: 1, blue: 1,
    temp: 0, tint: 0,
    inverted: false,
    // Curves use 0-255 range control points (matching DEFAULT_CURVES)
    curves: {
      rgb: [{ x: 0, y: 0 }, { x: 255, y: 255 }],
      red: [{ x: 0, y: 0 }, { x: 255, y: 255 }],
      green: [{ x: 0, y: 0 }, { x: 255, y: 255 }],
      blue: [{ x: 0, y: 0 }, { x: 255, y: 255 }],
    },
  };

  const core = new RenderCore(identityParams);
  core.prepareLUTs();

  // Test identity passthrough for several values
  const testValues = [
    [0.0, 0.0, 0.0],
    [0.1, 0.2, 0.3],
    [0.5, 0.5, 0.5],
    [0.7, 0.3, 0.6],
    [0.8, 0.8, 0.8],  // at highlight threshold
  ];

  let maxDeviation = 0;
  const deviations = [];
  for (const [ri, gi, bi] of testValues) {
    const [ro, go, bo] = core.processPixelFloat(ri, gi, bi);
    const dev = Math.max(Math.abs(ro - ri), Math.abs(go - gi), Math.abs(bo - bi));
    maxDeviation = Math.max(maxDeviation, dev);
    deviations.push(dev);
  }

  // Identity pipeline should preserve values within curve quantization tolerance
  // (8-bit curves contribute ±0.002 max, float LUTs ±0.001)
  assert(maxDeviation < 0.005,
    `Identity passthrough max deviation: ${maxDeviation.toFixed(6)} (limit 0.005)`);

  // Test with exposure adjustment
  const exposureParams = { ...identityParams, exposure: 50 };
  const expCore = new RenderCore(exposureParams);
  expCore.prepareLUTs();
  const [expR] = expCore.processPixelFloat(0.25, 0.25, 0.25);
  // exposure=50 → pow(2, 50/50) = 2× → 0.25 * 2 = 0.5
  assert(Math.abs(expR - 0.5) < 0.02,
    `Exposure=50 on 0.25 → ${expR.toFixed(4)}, expected ~0.5`);

  // Test highlight roll-off effect
  const [roHi] = core.processPixelFloat(0.95, 0.95, 0.95);
  assert(roHi < 0.95 && roHi > 0.85,
    `Roll-off on 0.95 → ${roHi.toFixed(4)}, expected compressed < 0.95`);

  console.log(`  ✓ Identity passthrough max deviation: ${maxDeviation.toFixed(6)}`);
  console.log(`  ✓ Exposure test: 0.25 × 2 = ${expR.toFixed(4)}`);
  console.log(`  ✓ Highlight roll-off: 0.95 → ${roHi.toFixed(4)}`);
}

// ══════════════════════════════════════════════════════════════════════════════
// Test 6: HSL Channel Weight Symmetry
// ══════════════════════════════════════════════════════════════════════════════
function testHSLChannelWeights() {
  console.log('\n── Test 6: HSL Adjustment Basics ──');

  // Identity HSL → passthrough
  const [r, g, b] = applyHSL(128, 64, 200, {});
  assert(r === 128 && g === 64 && b === 200,
    `Default HSL params should be identity: got [${r},${g},${b}]`);

  // Saturation boost on a colorful pixel should increase saturation
  const [r2, g2, b2] = applyHSL(200, 100, 50, { red: { hue: 0, saturation: 50, luminance: 0 } });
  // Red pixel with red saturation boost → more saturated (bigger spread)
  const spread1 = Math.max(200, 100, 50) - Math.min(200, 100, 50);
  const spread2 = Math.max(r2, g2, b2) - Math.min(r2, g2, b2);
  assert(spread2 >= spread1,
    `Saturation boost should increase color spread: ${spread1} → ${spread2}`);

  console.log(`  ✓ HSL identity passthrough and saturation boost verified`);
}

// ══════════════════════════════════════════════════════════════════════════════
// Run All Tests
// ══════════════════════════════════════════════════════════════════════════════
console.log('═══════════════════════════════════════════════════════════════');
console.log('  FilmGallery Render Pipeline Regression Test (Phase 4.6)');
console.log('═══════════════════════════════════════════════════════════════');

testHighlightRollOff();
testSplitTone();
testToneCurves();
testGLSLModule();
testCPUPipeline();
testHSLChannelWeights();

console.log('\n═══════════════════════════════════════════════════════════════');
console.log(`  Results: ${passCount} passed, ${failCount} failed`);
console.log('═══════════════════════════════════════════════════════════════');

process.exit(failCount > 0 ? 1 : 0);
