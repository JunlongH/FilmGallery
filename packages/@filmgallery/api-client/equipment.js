/**
 * Equipment API
 * 
 * CRUD operations for cameras, lenses, flashes, scanners, film backs.
 */

/**
 * Create equipment API endpoints
 * @param {Object} http - HTTP helpers from createApiClient
 */
function createEquipmentApi(http) {
  // Generic CRUD factory for equipment types
  const createCrud = (type) => ({
    list: (params = {}) => http.get(`/api/equipment/${type}`, params),
    get: (id) => http.get(`/api/equipment/${type}/${id}`),
    create: (data) => http.post(`/api/equipment/${type}`, data),
    update: (id, data) => http.put(`/api/equipment/${type}/${id}`, data),
    delete: (id, hard = false) => http.delete(`/api/equipment/${type}/${id}${hard ? '?hard=true' : ''}`),
    uploadImage: async (id, file) => {
      const formData = new FormData();
      formData.append('image', file);
      return http.postForm(`/api/equipment/${type}/${id}/image`, formData);
    }
  });
  
  return {
    // Constants and suggestions
    getConstants: () => http.get('/api/equipment/constants'),
    getSuggestions: () => http.get('/api/equipment/suggestions'),
    getCompatibleLenses: (cameraId) => http.get(`/api/equipment/compatible-lenses/${cameraId}`),
    
    // Film formats
    formats: {
      list: () => http.get('/api/equipment/formats'),
      create: (data) => http.post('/api/equipment/formats', data)
    },
    
    // Equipment types
    cameras: createCrud('cameras'),
    lenses: createCrud('lenses'),
    flashes: createCrud('flashes'),
    scanners: createCrud('scanners'),
    filmBacks: createCrud('film-backs')
  };
}

module.exports = { createEquipmentApi };
