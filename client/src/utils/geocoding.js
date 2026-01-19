/**
 * Geocoding Utilities
 * Uses Photon (Komoot) as primary API, Nominatim as fallback
 * 
 * Photon advantages:
 * - Faster response times
 * - Better autocomplete/search quality
 * - Better international support (including Chinese)
 * - No strict rate limiting
 */

const PHOTON_BASE = 'https://photon.komoot.io';
const NOMINATIM_BASE = 'https://nominatim.openstreetmap.org';

// Rate limiting for Nominatim fallback: 1 request per second
let lastNominatimTime = 0;
const RATE_LIMIT_MS = 1100;

const waitForNominatimRateLimit = async () => {
  const now = Date.now();
  const elapsed = now - lastNominatimTime;
  if (elapsed < RATE_LIMIT_MS) {
    await new Promise(r => setTimeout(r, RATE_LIMIT_MS - elapsed));
  }
  lastNominatimTime = Date.now();
};

/**
 * Search for addresses using Photon API (primary)
 * Falls back to Nominatim if Photon fails
 */
const searchWithPhoton = async (query, limit = 5) => {
  const params = new URLSearchParams({
    q: query.trim(),
    limit: String(limit)
  });
  
  const response = await fetch(`${PHOTON_BASE}/api?${params.toString()}`, {
    headers: { 'Accept': 'application/json' }
  });
  
  if (!response.ok) {
    throw new Error(`Photon geocoding failed: ${response.status}`);
  }
  
  const data = await response.json();
  
  // Photon returns GeoJSON format
  return (data.features || []).map(f => {
    const props = f.properties || {};
    const coords = f.geometry?.coordinates || [0, 0];
    return {
      displayName: props.name + (props.city ? `, ${props.city}` : '') + (props.country ? `, ${props.country}` : ''),
      latitude: coords[1],
      longitude: coords[0],
      country: props.country || '',
      city: props.city || props.locality || props.district || '',
      state: props.state || '',
      road: props.street || '',
      houseNumber: props.housenumber || ''
    };
  });
};

/**
 * Search for addresses using Nominatim API (fallback)
 */
const searchWithNominatim = async (query, limit = 5, countryCode = null) => {
  await waitForNominatimRateLimit();
  
  const params = new URLSearchParams({
    q: query.trim(),
    format: 'json',
    addressdetails: '1',
    limit: String(limit)
  });
  
  if (countryCode) {
    params.append('countrycodes', countryCode.toLowerCase());
  }
  
  const response = await fetch(`${NOMINATIM_BASE}/search?${params.toString()}`, {
    headers: {
      'Accept': 'application/json',
      'User-Agent': 'FilmGallery/1.0'
    }
  });
  
  if (!response.ok) {
    throw new Error(`Nominatim geocoding failed: ${response.status}`);
  }
  
  const results = await response.json();
  
  return results.map(r => ({
    displayName: r.display_name,
    latitude: parseFloat(r.lat),
    longitude: parseFloat(r.lon),
    country: r.address?.country || '',
    city: r.address?.city || r.address?.town || r.address?.village || r.address?.municipality || '',
    state: r.address?.state || '',
    road: r.address?.road || '',
    houseNumber: r.address?.house_number || ''
  }));
};

/**
 * Search for addresses and get coordinates
 * @param {string} query - Address or place name to search
 * @param {Object} options - Optional parameters
 * @param {string} options.country - ISO country code to limit search
 * @param {number} options.limit - Max results (default 5)
 * @returns {Promise<Array<{displayName: string, latitude: number, longitude: number, country: string, city: string}>>}
 */
export const searchAddress = async (query, options = {}) => {
  if (!query || query.trim().length < 2) return [];
  
  const limit = options.limit || 5;
  
  try {
    // Try Photon first (faster, better quality)
    const results = await searchWithPhoton(query, limit);
    if (results.length > 0) return results;
  } catch (err) {
    console.warn('Photon geocoding failed, falling back to Nominatim:', err.message);
  }
  
  try {
    // Fallback to Nominatim
    return await searchWithNominatim(query, limit, options.country);
  } catch (err) {
    console.error('All geocoding services failed:', err);
    return [];
  }
};

/**
 * Get coordinates for a country + city combination
 * @param {string} country - Country name
 * @param {string} city - City name
 * @returns {Promise<{latitude: number, longitude: number} | null>}
 */
export const getCityCoordinates = async (country, city) => {
  if (!country && !city) return null;
  
  const query = city ? `${city}, ${country}` : country;
  const results = await searchAddress(query, { limit: 1 });
  
  if (results.length > 0) {
    return {
      latitude: results[0].latitude,
      longitude: results[0].longitude
    };
  }
  
  return null;
};

/**
 * Reverse geocode using Photon API
 */
const reverseWithPhoton = async (latitude, longitude) => {
  const params = new URLSearchParams({
    lat: String(latitude),
    lon: String(longitude)
  });
  
  const response = await fetch(`${PHOTON_BASE}/reverse?${params.toString()}`, {
    headers: { 'Accept': 'application/json' }
  });
  
  if (!response.ok) {
    throw new Error(`Photon reverse geocoding failed: ${response.status}`);
  }
  
  const data = await response.json();
  const feature = data.features?.[0];
  
  if (!feature) return null;
  
  const props = feature.properties || {};
  return {
    displayName: props.name + (props.city ? `, ${props.city}` : '') + (props.country ? `, ${props.country}` : ''),
    country: props.country || '',
    city: props.city || props.locality || props.district || ''
  };
};

/**
 * Reverse geocode using Nominatim API
 */
const reverseWithNominatim = async (latitude, longitude) => {
  await waitForNominatimRateLimit();
  
  const params = new URLSearchParams({
    lat: String(latitude),
    lon: String(longitude),
    format: 'json',
    addressdetails: '1'
  });
  
  const response = await fetch(`${NOMINATIM_BASE}/reverse?${params.toString()}`, {
    headers: {
      'Accept': 'application/json',
      'User-Agent': 'FilmGallery/1.0'
    }
  });
  
  if (!response.ok) {
    throw new Error(`Nominatim reverse geocoding failed: ${response.status}`);
  }
  
  const result = await response.json();
  
  if (result.error) return null;
  
  return {
    displayName: result.display_name,
    country: result.address?.country || '',
    city: result.address?.city || result.address?.town || result.address?.village || ''
  };
};

/**
 * Reverse geocode: get address from coordinates
 * @param {number} latitude 
 * @param {number} longitude 
 * @returns {Promise<{displayName: string, country: string, city: string} | null>}
 */
export const reverseGeocode = async (latitude, longitude) => {
  if (!latitude || !longitude) return null;
  
  try {
    // Try Photon first
    const result = await reverseWithPhoton(latitude, longitude);
    if (result) return result;
  } catch (err) {
    console.warn('Photon reverse geocoding failed, falling back to Nominatim:', err.message);
  }
  
  try {
    // Fallback to Nominatim
    return await reverseWithNominatim(latitude, longitude);
  } catch (err) {
    console.error('All reverse geocoding services failed:', err);
    return null;
  }
};

const geocodingService = {
  searchAddress,
  getCityCoordinates,
  reverseGeocode
};

export default geocodingService;
