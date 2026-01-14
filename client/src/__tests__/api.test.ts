/**
 * API Client Tests
 * 
 * Basic type and export tests for the typed API client.
 */

import * as api from '../api';

describe('API Client', () => {
  describe('Exports', () => {
    it('should export Roll API functions', () => {
      expect(typeof api.getRolls).toBe('function');
      expect(typeof api.getRoll).toBe('function');
      expect(typeof api.updateRoll).toBe('function');
      expect(typeof api.deleteRoll).toBe('function');
    });

    it('should export Film API functions', () => {
      expect(typeof api.getFilms).toBe('function');
      expect(typeof api.updateFilm).toBe('function');
      expect(typeof api.deleteFilm).toBe('function');
    });

    it('should export Photo API functions', () => {
      expect(typeof api.getPhotos).toBe('function');
      expect(typeof api.updatePhoto).toBe('function');
      expect(typeof api.deletePhoto).toBe('function');
    });

    it('should export Tag API functions', () => {
      expect(typeof api.getTags).toBe('function');
      expect(typeof api.getTagPhotos).toBe('function');
    });

    it('should export Equipment API functions', () => {
      expect(typeof api.getCameras).toBe('function');
      expect(typeof api.getLenses).toBe('function');
      expect(typeof api.getFlashes).toBe('function');
    });

    it('should export Location API functions', () => {
      expect(typeof api.getLocations).toBe('function');
      expect(typeof api.createLocation).toBe('function');
    });
  });

  describe('API_BASE', () => {
    it('should have a valid API_BASE URL', () => {
      expect(api.API_BASE).toBeDefined();
      expect(typeof api.API_BASE).toBe('string');
      expect(api.API_BASE).toMatch(/^http/);
    });
  });
});
