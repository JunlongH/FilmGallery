/**
 * Tests for image-lut.js
 * 
 * Tests the LUT (Look-Up Table) generation functions for FilmLab.
 */

const {
  buildToneLUT,
  buildCurveLUT,
  applyLUT
} = require('../image-lut');

describe('image-lut', () => {
  describe('buildToneLUT', () => {
    it('should return 256 values', () => {
      const lut = buildToneLUT({ exposure: 0, contrast: 0 });
      
      expect(lut).toHaveLength(256);
    });

    it('should clamp values to 0-255 range', () => {
      const lut = buildToneLUT({ exposure: 100, contrast: 50, highlights: 100 }); // Aggressive adjustments
      
      Array.from(lut).forEach(value => {
        expect(value).toBeGreaterThanOrEqual(0);
        expect(value).toBeLessThanOrEqual(255);
      });
    });

    it('should pass through without adjustments', () => {
      const lut = buildToneLUT({});
      
      // Middle value should map to itself
      expect(lut[128]).toBe(128);
      // Endpoints should be close to themselves
      expect(lut[0]).toBe(0);
      expect(lut[255]).toBe(255);
    });

    it('should increase brightness with positive exposure', () => {
      const lut = buildToneLUT({ exposure: 50 });
      
      // All mid-range values should be higher
      expect(lut[128]).toBeGreaterThan(128);
    });

    it('should increase contrast', () => {
      const lut = buildToneLUT({ contrast: 50 });
      
      // Dark values should be darker, bright values brighter
      expect(lut[64]).toBeLessThan(64);
      expect(lut[192]).toBeGreaterThan(192);
    });
  });

  describe('buildCurveLUT', () => {
    it('should return 256 values', () => {
      const points = [{ x: 0, y: 0 }, { x: 255, y: 255 }];
      const lut = buildCurveLUT(points);
      
      expect(lut).toHaveLength(256);
    });

    it('should interpolate between points', () => {
      const points = [{ x: 0, y: 0 }, { x: 128, y: 200 }, { x: 255, y: 255 }];
      const lut = buildCurveLUT(points);
      
      // At 128, should be close to 200
      expect(lut[128]).toBeCloseTo(200, 0);
    });

    it('should handle linear curve', () => {
      const points = [{ x: 0, y: 0 }, { x: 255, y: 255 }];
      const lut = buildCurveLUT(points);
      
      // Should be roughly linear
      expect(lut[128]).toBeCloseTo(128, 5);
    });
  });

  describe('applyLUT', () => {
    it('should apply LUT to pixel values in-place', () => {
      const lut = new Uint8Array(Array.from({ length: 256 }, (_, i) => 255 - i)); // Invert
      const buffer = Buffer.from([100, 150, 200]); // RGB values
      
      applyLUT(buffer, lut);
      
      expect(buffer[0]).toBe(155); // 255 - 100
      expect(buffer[1]).toBe(105); // 255 - 150
      expect(buffer[2]).toBe(55);  // 255 - 200
    });

    it('should handle identity LUT', () => {
      const lut = new Uint8Array(Array.from({ length: 256 }, (_, i) => i));
      const buffer = Buffer.from([0, 128, 255]);
      
      applyLUT(buffer, lut);
      
      expect(buffer[0]).toBe(0);
      expect(buffer[1]).toBe(128);
      expect(buffer[2]).toBe(255);
    });
  });
});
