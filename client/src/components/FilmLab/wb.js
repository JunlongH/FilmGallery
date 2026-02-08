// White Balance utilities — re-exported from shared package for backward compatibility.
// Canonical implementation: packages/shared/filmLabWhiteBalance.js
//
// IMPORTANT: Do NOT add local implementations here.
// All WB computation must go through the shared Kelvin model (CIE D illuminant)
// to ensure solver ↔ renderer consistency.
//
// v2.4.0: Replaced local legacy linear model with shared Kelvin model re-exports.
// This eliminates the solver-renderer model mismatch that caused blue overcorrection.

import shared from '@filmgallery/shared';

export const computeWBGains = shared.computeWBGains;
export const solveTempTintFromSample = shared.solveTempTintFromSample;
