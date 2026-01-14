/**
 * Tests for roll-creation-service.js
 * 
 * Tests the utility functions for roll creation workflow.
 */

const {
  parseRollInputs,
  validateDateRange,
  groupFilesByBaseName,
  resolvePhotoMetadata,
  collectIncomingFiles
} = require('../roll-creation-service');

describe('parseRollInputs', () => {
  it('should parse basic string fields', () => {
    const body = {
      title: 'Test Roll',
      camera: 'Leica M6',
      lens: '50mm f/2',
      photographer: 'John'
    };
    
    const result = parseRollInputs(body);
    
    expect(result.title).toBe('Test Roll');
    expect(result.camera).toBe('Leica M6');
    expect(result.lens).toBe('50mm f/2');
    expect(result.photographer).toBe('John');
  });

  it('should parse numeric IDs', () => {
    const body = {
      filmId: '123',
      film_item_id: '456',
      camera_equip_id: '789'
    };
    
    const result = parseRollInputs(body);
    
    expect(result.filmId).toBe(123);
    expect(result.film_item_id).toBe(456);
    expect(result.camera_equip_id).toBe(789);
  });

  it('should handle null values', () => {
    const body = {};
    
    const result = parseRollInputs(body);
    
    expect(result.title).toBeNull();
    expect(result.filmId).toBeNull();
    expect(result.isNegativeGlobal).toBe(false);
  });

  it('should parse isNegative boolean correctly', () => {
    expect(parseRollInputs({ isNegative: 'true' }).isNegativeGlobal).toBe(true);
    expect(parseRollInputs({ isNegative: true }).isNegativeGlobal).toBe(true);
    expect(parseRollInputs({ isNegative: 'false' }).isNegativeGlobal).toBe(false);
    expect(parseRollInputs({ isNegative: false }).isNegativeGlobal).toBe(false);
  });

  it('should parse JSON string fields', () => {
    const body = {
      tmpFiles: JSON.stringify([{ tmpName: 'test.jpg' }]),
      fileMetadata: JSON.stringify({ 'test.jpg': { date: '2024-01-01' } })
    };
    
    const result = parseRollInputs(body);
    
    expect(result.tmpFiles).toHaveLength(1);
    expect(result.fileMetadata['test.jpg'].date).toBe('2024-01-01');
  });
});

describe('validateDateRange', () => {
  it('should not throw for valid date range', () => {
    expect(() => {
      validateDateRange('2024-01-01', '2024-01-31');
    }).not.toThrow();
  });

  it('should throw for invalid start date', () => {
    expect(() => {
      validateDateRange('invalid', '2024-01-31');
    }).toThrow('Invalid start_date or end_date');
  });

  it('should throw when start is after end', () => {
    expect(() => {
      validateDateRange('2024-12-31', '2024-01-01');
    }).toThrow('start_date cannot be later than end_date');
  });

  it('should allow null dates', () => {
    expect(() => {
      validateDateRange(null, null);
    }).not.toThrow();
    
    expect(() => {
      validateDateRange('2024-01-01', null);
    }).not.toThrow();
  });
});

describe('groupFilesByBaseName', () => {
  it('should group main and thumb files', () => {
    const incoming = [
      { originalName: 'photo1.jpg', tmpPath: '/tmp/a.jpg' },
      { originalName: 'photo1_thumb.jpg', tmpPath: '/tmp/b.jpg' },
      { originalName: 'photo2.jpg', tmpPath: '/tmp/c.jpg' }
    ];
    
    const groups = groupFilesByBaseName(incoming);
    
    expect(groups).toHaveLength(2);
    expect(groups[0].main.originalName).toBe('photo1.jpg');
    expect(groups[0].thumb.originalName).toBe('photo1_thumb.jpg');
    expect(groups[1].main.originalName).toBe('photo2.jpg');
    expect(groups[1].thumb).toBeNull();
  });

  it('should handle -thumb suffix', () => {
    const incoming = [
      { originalName: 'img-thumb.jpg', tmpPath: '/tmp/a.jpg' },
      { originalName: 'img.jpg', tmpPath: '/tmp/b.jpg' }
    ];
    
    const groups = groupFilesByBaseName(incoming);
    
    expect(groups).toHaveLength(1);
    expect(groups[0].main.originalName).toBe('img.jpg');
    expect(groups[0].thumb.originalName).toBe('img-thumb.jpg');
  });

  it('should sort groups alphabetically', () => {
    const incoming = [
      { originalName: 'zebra.jpg', tmpPath: '/tmp/a.jpg' },
      { originalName: 'alpha.jpg', tmpPath: '/tmp/b.jpg' },
      { originalName: 'beta.jpg', tmpPath: '/tmp/c.jpg' }
    ];
    
    const groups = groupFilesByBaseName(incoming);
    
    expect(groups[0].main.originalName).toBe('alpha.jpg');
    expect(groups[1].main.originalName).toBe('beta.jpg');
    expect(groups[2].main.originalName).toBe('zebra.jpg');
  });
});

describe('resolvePhotoMetadata', () => {
  it('should resolve metadata from map', () => {
    const metaMap = {
      'photo.jpg': {
        date: '2024-05-15',
        lens: '35mm',
        city: 'Tokyo'
      }
    };
    
    const result = resolvePhotoMetadata(metaMap, ['photo.jpg']);
    
    expect(result.date).toBe('2024-05-15');
    expect(result.lens).toBe('35mm');
  });

  it('should try multiple keys in order', () => {
    const metaMap = {
      'original.jpg': { date: '2024-01-01' }
    };
    
    const result = resolvePhotoMetadata(metaMap, ['missing.jpg', 'original.jpg']);
    
    expect(result.date).toBe('2024-01-01');
  });

  it('should return null values for missing keys', () => {
    const result = resolvePhotoMetadata({}, ['missing.jpg']);
    
    expect(result.date).toBeNull();
    expect(result.lens).toBeNull();
    expect(result.city).toBeNull();
  });

  it('should handle string metadata (just date)', () => {
    const metaMap = {
      'photo.jpg': '2024-06-20'
    };
    
    const result = resolvePhotoMetadata(metaMap, ['photo.jpg']);
    
    expect(result.date).toBe('2024-06-20');
    expect(result.lens).toBeNull();
  });
});
