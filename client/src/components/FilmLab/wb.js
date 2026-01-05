// White Balance utility: compute per-channel gains from base gains and temp/tint.
// Keeps behavior consistent across CPU, WebGL, and server, with safety clamps.

export function computeWBGains({ red = 1, green = 1, blue = 1, temp = 0, tint = 0 }, options = {}) {
  const minGain = options.minGain ?? 0.05;
  const maxGain = options.maxGain ?? 50.0;
  
  // Safety: Ensure inputs are numbers
  const R = Number.isFinite(red) ? red : 1;
  const G = Number.isFinite(green) ? green : 1;
  const B = Number.isFinite(blue) ? blue : 1;
  const T = Number.isFinite(temp) ? temp : 0;
  const N = Number.isFinite(tint) ? tint : 0;

  // temp/tint model:
  // temp > 0 → warmer (boost red/green, reduce blue)
  // temp < 0 → cooler (boost blue, reduce red/green)
  // tint > 0 → more magenta (boost red/blue, reduce green)
  // tint < 0 → more green (boost green, reduce red/blue)
  const t = T / 100;  // normalize to -1..1
  const n = N / 100;
  
  // Simplified model: temp affects R-B axis, tint affects G vs R+B
  let r = R * (1 + t * 0.5 + n * 0.3);
  let g = G * (1 - n * 0.5);
  let b = B * (1 - t * 0.5 + n * 0.3);
  
  // Safety: Check for NaN before clamping
  if (!Number.isFinite(r)) r = 1;
  if (!Number.isFinite(g)) g = 1;
  if (!Number.isFinite(b)) b = 1;

  r = Math.max(minGain, Math.min(maxGain, r));
  g = Math.max(minGain, Math.min(maxGain, g));
  b = Math.max(minGain, Math.min(maxGain, b));
  
  return [r, g, b];
}

const clamp = (v, min, max) => Math.max(min, Math.min(max, v));

// Auto WB: Calculate temp/tint to neutralize average color based on gray world assumption.
// Given the sampled average RGB, find temp/tint that makes all channels output equal.
// This uses the inverse of the computeWBGains formula.
export function solveTempTintFromSample(sampleRgb, baseGains = {}) {
  // Safety: Ensure inputs are valid
  if (!Array.isArray(sampleRgb) || sampleRgb.length < 3) return { temp: 0, tint: 0 };
  
  const safeSample = sampleRgb.map(v => {
    const val = Number(v);
    return Number.isFinite(val) ? Math.max(1, val) : 128;
  });

  const base = {
    red: Math.max(0.05, Number.isFinite(baseGains.red) ? baseGains.red : 1),
    green: Math.max(0.05, Number.isFinite(baseGains.green) ? baseGains.green : 1),
    blue: Math.max(0.05, Number.isFinite(baseGains.blue) ? baseGains.blue : 1)
  };

  const [rS, gS, bS] = safeSample;
  
  // Apply base gains to get the effective values
  const rBase = rS * base.red;
  const gBase = gS * base.green;
  const bBase = bS * base.blue;
  
  // Goal: Find temp and tint such that after applying WB gains,
  // all three channels become equal (neutral gray).
  //
  // The gain formulas (from computeWBGains, with t=temp/100, n=tint/100):
  //   gainR = 1 + t*0.5 + n*0.3
  //   gainG = 1 - n*0.5
  //   gainB = 1 - t*0.5 + n*0.3
  //
  // We want: rBase * gainR = gBase * gainG = bBase * gainB
  //
  // Let ratioR = gBase / rBase, ratioB = gBase / bBase
  // These represent how much we need to adjust R and B relative to G
  
  const ratioR = gBase / rBase;  // > 1 means R needs to be boosted
  const ratioB = gBase / bBase;  // > 1 means B needs to be boosted
  
  console.log('[WB Solver] Input:', { rBase: rBase.toFixed(2), gBase: gBase.toFixed(2), bBase: bBase.toFixed(2) });
  console.log('[WB Solver] Ratios:', { ratioR: ratioR.toFixed(4), ratioB: ratioB.toFixed(4) });
  
  // If all channels are already close to equal, no adjustment needed
  if (Math.abs(ratioR - 1) < 0.02 && Math.abs(ratioB - 1) < 0.02) {
    console.log('[WB Solver] Already neutral, returning 0/0');
    return { temp: 0, tint: 0 };
  }
  
  // Solve the system of equations:
  // From gainR/gainG = ratioR and gainB/gainG = ratioB
  //
  // After algebraic manipulation:
  // n = (ratioR + ratioB - 2) / (0.6 + 0.5*(ratioR + ratioB))
  // t = (ratioR - ratioB) * (1 - n*0.5)
  
  const sumRatios = ratioR + ratioB;
  const denominator = 0.6 + 0.5 * sumRatios;
  
  const n = (sumRatios - 2) / denominator;
  const t = (ratioR - ratioB) * (1 - n * 0.5);
  
  console.log('[WB Solver] Raw t/n:', { t: t.toFixed(4), n: n.toFixed(4) });
  
  if (!Number.isFinite(t) || !Number.isFinite(n)) {
    return { temp: 0, tint: 0 };
  }
  
  // Convert to slider scale (-100 to 100)
  let tempOut = clamp(t * 100, -100, 100);
  let tintOut = clamp(n * 100, -100, 100);
  
  console.log('[WB Solver] Output temp/tint:', { tempOut: tempOut.toFixed(2), tintOut: tintOut.toFixed(2) });
  
  // Verify the computed gains are reasonable
  const testGains = computeWBGains({ red: base.red, green: base.green, blue: base.blue, temp: tempOut, tint: tintOut });
  const [testR, testG, testB] = testGains;
  
  // Verify the result: all outputs should be approximately equal
  const outR = rS * testR;
  const outG = gS * testG;
  const outB = bS * testB;
  console.log('[WB Solver] Verification - outputs should be equal:', { 
    outR: outR.toFixed(2), 
    outG: outG.toFixed(2), 
    outB: outB.toFixed(2),
    maxDiff: Math.max(Math.abs(outR-outG), Math.abs(outG-outB), Math.abs(outR-outB)).toFixed(2)
  });
  
  const isExtreme = testR < 0.1 || testR > 10 || testG < 0.1 || testG > 10 || testB < 0.1 || testB > 10;
  
  if (isExtreme) {
    console.warn('[WB Solver] Extreme gains detected, scaling back:', { testGains, tempOut, tintOut });
    tempOut *= 0.5;
    tintOut *= 0.5;
  }
  
  return {
    temp: tempOut,
    tint: tintOut
  };
}
