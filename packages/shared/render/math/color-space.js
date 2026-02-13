/**
 * Color Space Transformation Math
 * Pure functions for converting between color spaces and transfer functions.
 * All inputs/outputs are normalized floats (0.0 - 1.0+).
 */

/**
 * Converts Linear float values to sRGB (Gamma Corrected)
 * Implements the precise sRGB transfer function (IEC 61966-2-1).
 * @param {number} linear - Linear value (0.0 - 1.0+)
 * @returns {number} sRGB value (0.0 - 1.0)
 */
function linearToSrgb(linear) {
    if (linear <= 0.0031308) {
        return linear * 12.92;
    } else {
        return 1.055 * Math.pow(Math.max(0, linear), 1.0 / 2.4) - 0.055;
    }
}

/**
 * Converts sRGB float values to Linear
 * @param {number} srgb - sRGB value (0.0 - 1.0)
 * @returns {number} Linear value (0.0 - 1.0+)
 */
function srgbToLinear(srgb) {
    if (srgb <= 0.04045) {
        return srgb / 12.92;
    } else {
        return Math.pow((Math.max(0, srgb) + 0.055) / 1.055, 2.4);
    }
}

/**
 * Simple Gamma correction (e.g., for simple display)
 * @param {number} linear - Linear value
 * @param {number} gamma - Gamma value (e.g., 2.2)
 * @returns {number} Gamma corrected value
 */
function applyGamma(linear, gamma = 2.2) {
    return Math.pow(Math.max(0, linear), 1.0 / gamma);
}

/**
 * Inverse Gamma correction
 * @param {number} val - Gamma corrected value
 * @param {number} gamma - Gamma value
 * @returns {number} Linear value
 */
function removeGamma(val, gamma = 2.2) {
    return Math.pow(Math.max(0, val), gamma);
}

module.exports = {
    linearToSrgb,
    srgbToLinear,
    applyGamma,
    removeGamma
};
