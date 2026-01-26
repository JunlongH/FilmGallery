/**
 * Photos API
 * 
 * CRUD operations for photos.
 */

/**
 * Create photos API endpoints
 * @param {Object} http - HTTP helpers from createApiClient
 */
function createPhotosApi(http) {
  return {
    /**
     * Search photos with filters
     */
    search: (filters = {}) => http.get('/api/photos/search', filters),
    
    /**
     * Get single photo by ID
     */
    get: (id) => http.get(`/api/photos/${id}`),
    
    /**
     * Update photo metadata
     */
    update: (id, data) => http.put(`/api/photos/${id}`, data),
    
    /**
     * Delete photo
     */
    delete: (id) => http.delete(`/api/photos/${id}`),
    
    /**
     * Get favorite photos
     */
    getFavorites: () => http.get('/api/photos', { favorite: 1 }),
    
    /**
     * Update positive from negative (save processed image)
     */
    updatePositive: async (photoId, blob) => {
      const formData = new FormData();
      formData.append('positive', blob, 'positive.jpg');
      return http.postForm(`/api/photos/${photoId}/update-positive`, formData);
    },
    
    /**
     * Export processed positive
     */
    exportPositive: (photoId, params, options = {}) => 
      http.post('/api/filmlab/export', { photoId, params, format: options.format || 'jpeg' }),
    
    /**
     * Render positive (in-memory processing)
     */
    renderPositive: (photoId, params, options = {}) => 
      http.post('/api/filmlab/render', { photoId, params, format: options.format || 'jpeg' }),
    
    /**
     * Get FilmLab preview
     */
    getFilmlabPreview: (photoId, params, maxWidth = 1400) => {
      const qs = new URLSearchParams();
      qs.append('photoId', photoId);
      qs.append('maxWidth', maxWidth);
      if (params) qs.append('params', JSON.stringify(params));
      return http.get(`/api/filmlab/preview?${qs.toString()}`);
    }
  };
}

module.exports = { createPhotosApi };
