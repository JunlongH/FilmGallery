/**
 * Shared GLSL Code — Thin wrapper around @filmgallery/shared/shaders
 *
 * This module was previously the "Single Source of Truth" with inline GLSL.
 * It is now a thin adapter that re-exports from the canonical shared shader
 * library at packages/shared/shaders/. This ensures both the Electron GPU
 * export path AND the client WebGL preview path use identical shader code.
 *
 * Changes from previous version:
 * - All GLSL building blocks (HSL, Split Tone, Film Curve, etc.) now come
 *   from packages/shared/shaders/*.js
 * - buildFragmentShader() delegates to the shared builder
 * - gpu-renderer.js uniform names are mapped to shared shader names
 *
 * @module glsl-shared
 * @version 3.0.0 — Deduplicated: delegates to packages/shared/shaders
 */
'use strict';

const shaders = require('../packages/shared/shaders');

// ============================================================================
// Re-export individual GLSL modules for backward compatibility & testing
// ============================================================================

const GLSL_SHARED_UNIFORMS = shaders.uniforms.UNIFORMS_GLSL;
const GLSL_COLOR_FUNCTIONS = shaders.colorMath.COLOR_MATH_GLSL;
const GLSL_HSL_ADJUSTMENT = shaders.hslAdjust.HSL_ADJUST_GLSL;
const GLSL_SPLIT_TONE = shaders.splitTone.SPLIT_TONE_GLSL;
const GLSL_FILM_CURVE = shaders.filmCurve.FILM_CURVE_GLSL;

// ============================================================================
// Fragment Shader Builder
// ============================================================================

/**
 * Build the complete fragment shader for either WebGL2 or WebGL1.
 * Delegates to the shared shader library.
 *
 * @param {boolean} isGL2 - Whether targeting WebGL2
 * @returns {string} Complete GLSL fragment shader source
 */
function buildFragmentShader(isGL2) {
  return shaders.buildFragmentShader({ isGL2, useCompositeCurve: true });
}

/**
 * Build just the main() function body (for testing/inspection).
 * @param {boolean} isGL2
 * @returns {string} GLSL main() function body
 */
function buildShaderMain(isGL2) {
  return shaders.buildMainFunction({ isGL2 });
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
