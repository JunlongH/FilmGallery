/**
 * Tone Mapping and Dynamic Range Compression
 * Math for compressing High Dynamic Range (Linear Float) into Standard Dynamic Range (0-1).
 */

/**
 * Simple Reinhard Tone Mapping.
 * x / (x + 1)
 * Preserves average brightness but desaturates highlights if applied per channel.
 * @param {number} x - Input linear value
 * @returns {number} Tone mapped value (0.0 - 1.0)
 */
function reinhard(x) {
    return x / (x + 1.0);
}

/**
 * Extended Reinhard (allows burning out whites).
 * x * (1 + x / (whitePoint^2)) / (1 + x)
 * @param {number} x - Input linear value
 * @param {number} whitePoint - The value that will map to 1.0 (default infinity)
 * @returns {number} Tone mapped value
 */
function reinhardExtended(x, whitePoint = 4.0) {
    return (x * (1.0 + x / (whitePoint * whitePoint))) / (1.0 + x);
}

/**
 * Filmic Curve Approximation (ACES-like)
 * Gives a nice "film look" with toe and shoulder.
 * @param {number} x - Input
 * @returns {number} Output
 */
function filmicACES(x) {
    const a = 2.51;
    const b = 0.03;
    const c = 2.43;
    const d = 0.59;
    const e = 0.14;
    return Math.max(0, Math.min(1, (x * (a * x + b)) / (x * (c * x + d) + e)));
}

/**
 * Applies a highlight compression roll-off "shoulder".
 * For values below threshold, it's linear.
 * For values above, it compresses softly.
 * @param {number} x - Input value
 * @param {number} threshold - Start of shoulder (0.0 - 1.0)
 * @returns {number} output
 */
function highlightRollOff(x, threshold = 0.8) {
    if (x <= threshold) return x;
    
    // Smooth compression function for values > threshold
    // Maps [threshold, infinity] -> [threshold, 1.0]
    const range = x - threshold;
    const max = 1.0 - threshold;
    
    // Soft roll-off asymptotically approaching 1.0 (limit)
    // Formula: threshold + (range / (range + 1)) * max_headroom
    // We normalize range so that +1 EV (range=1.0?) maps to some value?
    // Let's use simple Reinhard-style compression for the overshoot.
    // Normalized overshoot:
    return threshold + (range / (range + max)) * max;
}

module.exports = {
    reinhard,
    reinhardExtended,
    filmicACES,
    highlightRollOff
};
