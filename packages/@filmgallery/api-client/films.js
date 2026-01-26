/**
 * Films API
 * 
 * CRUD operations for film stocks and film items (inventory).
 */

/**
 * Create films API endpoints
 * @param {Object} http - HTTP helpers from createApiClient
 */
function createFilmsApi(http) {
  return {
    // ========================================
    // FILM STOCKS
    // ========================================
    
    /**
     * List all film stocks
     */
    list: (noCache = false) => http.get('/api/films', noCache ? { _t: Date.now() } : {}),
    
    /**
     * Get film constants (categories, processes, etc.)
     */
    getConstants: () => http.get('/api/films/constants'),
    
    /**
     * Get single film stock by ID
     */
    get: (id) => http.get(`/api/films/${id}`),
    
    /**
     * Create film stock
     */
    create: async ({ name, iso, category, brand, format, process, thumbFile }) => {
      const formData = new FormData();
      formData.append('name', name);
      if (iso) formData.append('iso', iso);
      if (category) formData.append('category', category);
      if (brand) formData.append('brand', brand);
      if (format) formData.append('format', format);
      if (process) formData.append('process', process);
      if (thumbFile) formData.append('thumb', thumbFile);
      return http.postForm('/api/films', formData);
    },
    
    /**
     * Update film stock
     */
    update: async (id, { name, iso, category, brand, format, process, thumbFile }) => {
      const formData = new FormData();
      if (name) formData.append('name', name);
      if (iso !== undefined) formData.append('iso', iso);
      if (category !== undefined) formData.append('category', category);
      if (brand !== undefined) formData.append('brand', brand);
      if (format !== undefined) formData.append('format', format);
      if (process !== undefined) formData.append('process', process);
      if (thumbFile) formData.append('thumb', thumbFile);
      return http.postForm(`/api/films/${id}`, formData);
    },
    
    /**
     * Delete film stock
     */
    delete: (id) => http.delete(`/api/films/${id}`),
    
    /**
     * Upload film stock image
     */
    uploadImage: async (id, file) => {
      const formData = new FormData();
      formData.append('thumb', file);
      return http.postForm(`/api/films/${id}/thumb`, formData);
    },
    
    // ========================================
    // FILM ITEMS (Inventory)
    // ========================================
    
    items: {
      /**
       * List film items (inventory)
       */
      list: (params = {}) => http.get('/api/film-items', params),
      
      /**
       * Get single film item
       */
      get: (id) => http.get(`/api/film-items/${id}`),
      
      /**
       * Update film item
       */
      update: (id, data) => http.put(`/api/film-items/${id}`, data),
      
      /**
       * Delete film item
       */
      delete: (id, hard = false) => http.delete(`/api/film-items/${id}${hard ? '?hard=true' : ''}`),
      
      /**
       * Create film items batch (purchase)
       */
      createBatch: (batch) => http.post('/api/film-items/purchase-batch', batch),
      
      /**
       * Export shot logs as CSV
       */
      exportShotLogs: async (id) => {
        const response = await fetch(`${http.baseUrl}/api/film-items/${id}/shot-logs/export`);
        if (!response.ok) throw new Error('Export failed');
        return response.blob();
      }
    },
    
    // ========================================
    // FILM CURVE PROFILES
    // ========================================
    
    curveProfiles: {
      list: () => http.get('/api/filmlab/film-curves'),
      create: (data) => http.post('/api/filmlab/film-curves', data),
      update: (id, data) => http.put(`/api/filmlab/film-curves/${id}`, data),
      delete: (id) => http.delete(`/api/filmlab/film-curves/${id}`)
    }
  };
}

module.exports = { createFilmsApi };
