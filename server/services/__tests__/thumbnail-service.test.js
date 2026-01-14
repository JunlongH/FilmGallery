/**
 * Tests for thumbnail-service.js
 * 
 * Tests the image processing utility functions.
 * Note: Some tests require actual image files and may be skipped in CI.
 */

const {
  sharpWithTimeout,
  THUMB_TIMEOUT,
  DEFAULT_TIMEOUT
} = require('../thumbnail-service');

describe('thumbnail-service', () => {
  describe('sharpWithTimeout', () => {
    it('should resolve when operation completes in time', async () => {
      const fastOp = Promise.resolve('success');
      
      const result = await sharpWithTimeout(fastOp, 1000);
      
      expect(result).toBe('success');
    });

    it('should reject when operation times out', async () => {
      const slowOp = new Promise((resolve) => {
        setTimeout(() => resolve('too late'), 500);
      });
      
      await expect(sharpWithTimeout(slowOp, 50))
        .rejects
        .toThrow('Sharp operation timed out');
    });

    it('should propagate operation errors', async () => {
      const failingOp = Promise.reject(new Error('Sharp error'));
      
      await expect(sharpWithTimeout(failingOp, 1000))
        .rejects
        .toThrow('Sharp error');
    });

    it('should use default timeout if not specified', async () => {
      // Just verify the function works with default timeout
      const result = await sharpWithTimeout(Promise.resolve('ok'));
      expect(result).toBe('ok');
    });
  });

  describe('constants', () => {
    it('should export correct timeout values', () => {
      expect(DEFAULT_TIMEOUT).toBe(30000); // 30 seconds
      expect(THUMB_TIMEOUT).toBe(10000);   // 10 seconds
    });
  });
});
