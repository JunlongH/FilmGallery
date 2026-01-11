/**
 * Equipment API for mobile app
 */
import axios from 'axios';

// ===== Cameras =====
export const getCameras = async () => {
  const res = await axios.get('/api/equipment/cameras');
  return res.data;
};

export const getCamera = async (id) => {
  const res = await axios.get(`/api/equipment/cameras/${id}`);
  return res.data;
};

export const createCamera = async (data) => {
  const res = await axios.post('/api/equipment/cameras', data);
  return res.data;
};

export const updateCamera = async (id, data) => {
  const res = await axios.put(`/api/equipment/cameras/${id}`, data);
  return res.data;
};

export const deleteCamera = async (id) => {
  const res = await axios.delete(`/api/equipment/cameras/${id}`);
  return res.data;
};

// ===== Lenses =====
export const getLenses = async () => {
  const res = await axios.get('/api/equipment/lenses');
  return res.data;
};

export const getLens = async (id) => {
  const res = await axios.get(`/api/equipment/lenses/${id}`);
  return res.data;
};

export const getCompatibleLenses = async (cameraId) => {
  const res = await axios.get(`/api/equipment/compatible-lenses/${cameraId}`);
  return res.data;
};

export const createLens = async (data) => {
  const res = await axios.post('/api/equipment/lenses', data);
  return res.data;
};

export const updateLens = async (id, data) => {
  const res = await axios.put(`/api/equipment/lenses/${id}`, data);
  return res.data;
};

export const deleteLens = async (id) => {
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
