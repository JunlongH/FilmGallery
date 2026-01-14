/**
 * Equipment API for mobile app
 */
import axios from 'axios';

// TypeScript interfaces
interface Camera {
  id: number;
  name: string;
  brand?: string;
  [key: string]: any;
}

interface Lens {
  id: number;
  name: string;
  brand?: string;
  mount?: string;
  [key: string]: any;
}

interface Flash {
  id: number;
  name: string;
  brand?: string;
  gn?: number;
  [key: string]: any;
}

// ===== Cameras =====
export const getCameras = async (): Promise<Camera[]> => {
  const res = await axios.get('/api/equipment/cameras');
  return res.data;
};

export const getCamera = async (id: number): Promise<Camera> => {
  const res = await axios.get(`/api/equipment/cameras/${id}`);
  return res.data;
};

export const createCamera = async (data: Partial<Camera>): Promise<Camera> => {
  const res = await axios.post('/api/equipment/cameras', data);
  return res.data;
};

export const updateCamera = async (id: number, data: Partial<Camera>): Promise<Camera> => {
  const res = await axios.put(`/api/equipment/cameras/${id}`, data);
  return res.data;
};

export const deleteCamera = async (id: number): Promise<void> => {
  const res = await axios.delete(`/api/equipment/cameras/${id}`);
  return res.data;
};

// ===== Lenses =====
export const getLenses = async (): Promise<Lens[]> => {
  const res = await axios.get('/api/equipment/lenses');
  return res.data;
};

export const getLens = async (id: number): Promise<Lens> => {
  const res = await axios.get(`/api/equipment/lenses/${id}`);
  return res.data;
};

export const getCompatibleLenses = async (cameraId: number): Promise<Lens[]> => {
  const res = await axios.get(`/api/equipment/compatible-lenses/${cameraId}`);
  return res.data;
};

export const createLens = async (data: Partial<Lens>): Promise<Lens> => {
  const res = await axios.post('/api/equipment/lenses', data);
  return res.data;
};

export const updateLens = async (id: number, data: Partial<Lens>): Promise<Lens> => {
  const res = await axios.put(`/api/equipment/lenses/${id}`, data);
  return res.data;
};

export const deleteLens = async (id: number): Promise<void> => {
  const res = await axios.delete(`/api/equipment/lenses/${id}`);
  return res.data;
};

// ===== Flashes =====
export const getFlashes = async () => {
  const res = await axios.get('/api/equipment/flashes');
  return res.data;
};

export const getFlash = async (id) => {
  const res = await axios.get(`/api/equipment/flashes/${id}`);
  return res.data;
};

export const createFlash = async (data) => {
  const res = await axios.post('/api/equipment/flashes', data);
  return res.data;
};

export const updateFlash = async (id, data) => {
  const res = await axios.put(`/api/equipment/flashes/${id}`, data);
  return res.data;
};

export const deleteFlash = async (id) => {
  const res = await axios.delete(`/api/equipment/flashes/${id}`);
  return res.data;
};

// ===== Film Formats =====
export const getFilmFormats = async () => {
  const res = await axios.get('/api/equipment/film-formats');
  return res.data;
};

// ===== Suggestions =====
export const getEquipmentSuggestions = async () => {
  const res = await axios.get('/api/equipment/suggestions');
  return res.data;
};

// ===== Rolls by Equipment =====
/**
 * Get rolls that use a specific piece of equipment.
 * For fixed-lens cameras (type='camera'), this also matches rolls with the camera's implicit lens.
 * @param {string} type - 'camera' | 'lens' | 'flash' | 'film'
 * @param {number} id - Equipment ID
 * @returns {Promise<Array>} List of rolls with display_camera and display_lens fields
 */
export const getRollsByEquipment = async (type, id) => {
  // Use the rolls endpoint with appropriate filter
  let param;
  switch (type) {
    case 'camera':
      // For cameras, the server will include rolls where camera_equip_id matches
      // display_camera and display_lens are computed dynamically
      param = `camera_equip_id=${id}`;
      break;
    case 'lens':
      param = `lens_equip_id=${id}`;
      break;
    case 'flash':
      param = `flash_equip_id=${id}`;
      break;
    case 'film':
      param = `film_id=${id}`;
      break;
    default:
      throw new Error(`Unknown equipment type: ${type}`);
  }
  const res = await axios.get(`/api/rolls?${param}`);
  return res.data;
};
