/**
 * Rolls API
 * 
 * CRUD operations for rolls and related resources.
 */

/**
 * Create rolls API endpoints
 * @param {Object} http - HTTP helpers from createApiClient
 */
function createRollsApi(http) {
  return {
    /**
     * List rolls with optional filters
     * @param {Object} filters - Filter parameters
     */
    list: (filters = {}) => http.get('/api/rolls', filters),
    
    /**
     * Get single roll by ID
     */
    get: (id) => http.get(`/api/rolls/${id}`),
    
    /**
     * Create roll with JSON data
     */
    create: (data) => http.post('/api/rolls', data),
    
    /**
     * Create roll with files (multipart)
     */
    createWithFiles: async (fields, files, onProgress) => {
      const formData = new FormData();
      Object.entries(fields).forEach(([k, v]) => {
        if (v !== undefined && v !== null) formData.append(k, v);
      });
      files.forEach(f => formData.append('files', f));
      return http.postForm('/api/rolls', formData, onProgress);
    },
    
    /**
     * Update roll
     */
    update: (id, data) => http.put(`/api/rolls/${id}`, data),
    
    /**
     * Delete roll
     */
    delete: (id) => http.delete(`/api/rolls/${id}`),
    
    /**
     * Get roll locations
     */
    getLocations: (rollId) => http.get(`/api/rolls/${rollId}/locations`),
    
    /**
     * Get roll preset
     */
    getPreset: (rollId) => http.get(`/api/rolls/${rollId}/preset`),
    
    /**
     * Set roll preset
     */
    setPreset: (rollId, name, params) => http.post(`/api/rolls/${rollId}/preset`, { name, params }),
    
    /**
     * Clear roll preset
     */
    clearPreset: (rollId) => http.delete(`/api/rolls/${rollId}/preset`),
    
    /**
     * Set roll cover
     */
    setCover: (rollId, { photoId, filename }) => http.post(`/api/rolls/${rollId}/cover`, { photoId, filename }),
    
    /**
     * Generate contact sheet
     */
    generateContactSheet: (rollId, options = {}) => http.post(`/api/rolls/${rollId}/contact-sheet`, options),
    
    /**
     * Get photos for roll
     */
    getPhotos: (rollId) => http.get(`/api/rolls/${rollId}/photos`),
    
    /**
     * Upload photo to roll
     */
    uploadPhoto: async (rollId, file, fields = {}, onProgress) => {
      const formData = new FormData();
      formData.append('image', file);
      Object.entries(fields).forEach(([k, v]) => {
        if (v !== undefined && v !== null) formData.append(k, v);
      });
      return http.postForm(`/api/rolls/${rollId}/photos`, formData, onProgress);
    }
  };
}

module.exports = { createRollsApi };
