/**
 * FilmLab White Balance - TypeScript Migration
 * 
 * Compute per-channel gains from base gains and temp/tint.
 * Must match client-side wb.js exactly for consistent rendering.
 */

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

/**
 * White balance input parameters
 */
export interface WBParams {
  red?: number;
  green?: number;
  blue?: number;
  temp?: number;
  tint?: number;
}

/**
 * White balance options
 */
export interface WBOptions {
  minGain?: number;
  maxGain?: number;
}

/**
 * Compute per-channel gains from base gains and temp/tint.
 * 
 * temp > 0 → warmer (boost red, reduce blue)
 * temp < 0 → cooler (boost blue, reduce red)
 * tint > 0 → more magenta (boost red/blue, reduce green)
 * tint < 0 → more green (boost green, reduce red/blue)
 * 
 * @returns [red, green, blue] gain values
 */
export function computeWBGains(params: WBParams = {}, opts: WBOptions = {}): [number, number, number] {
  const red = Number.isFinite(params.red) ? params.red! : 1;
  const green = Number.isFinite(params.green) ? params.green! : 1;
  const blue = Number.isFinite(params.blue) ? params.blue! : 1;
  const temp = Number.isFinite(params.temp) ? params.temp! : 0;
  const tint = Number.isFinite(params.tint) ? params.tint! : 0;
  const minGain = opts.minGain ?? 0.05;
  const maxGain = opts.maxGain ?? 50.0;
  
  // temp/tint model (matches client wb.js):
  const t = temp / 100;
  const n = tint / 100;
  
  let r = red * (1 + t * 0.5 + n * 0.3);
  let g = green * (1 - n * 0.5);
  let b = blue * (1 - t * 0.5 + n * 0.3);
  
  r = clamp(r, minGain, maxGain);
  g = clamp(g, minGain, maxGain);
  b = clamp(b, minGain, maxGain);
  
  return [r, g, b];
}

// CommonJS compatibility
module.exports = { computeWBGains };
