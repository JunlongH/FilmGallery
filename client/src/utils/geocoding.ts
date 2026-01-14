/**
 * Geocoding Utilities
 * Uses OpenStreetMap Nominatim API for address lookup
 * 
 * Note: Nominatim has a usage policy (1 req/sec, include User-Agent)
 * For higher volume, consider using a dedicated service.
 */

const NOMINATIM_BASE = 'https://nominatim.openstreetmap.org';

// Rate limiting: 1 request per second
let lastRequestTime = 0;
const RATE_LIMIT_MS = 1100;

const waitForRateLimit = async () => {
  const now = Date.now();
  const elapsed = now - lastRequestTime;
  if (elapsed < RATE_LIMIT_MS) {
    await new Promise(r => setTimeout(r, RATE_LIMIT_MS - elapsed));
  }
  lastRequestTime = Date.now();
};

interface SearchOptions {
  country?: string;
  limit?: number;
}

interface GeocodingResult {
  displayName: string;
  latitude: number;
  longitude: number;
  country: string;
  city: string;
}

/**
 * Search for addresses and get coordinates
 */
export const searchAddress = async (query: string, options: SearchOptions = {}): Promise<GeocodingResult[]> => {
  if (!query || query.trim().length < 2) return [];
  
  await waitForRateLimit();
  
  const params = new URLSearchParams({
    q: query.trim(),
    format: 'json',
    addressdetails: '1',
    limit: String(options.limit || 5)
  });
  
  if (options.country) {
    params.append('countrycodes', options.country.toLowerCase());
  }
  
  try {
    const response = await fetch(`${NOMINATIM_BASE}/search?${params.toString()}`, {
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'FilmGallery/1.0'
      }
    });
    
    if (!response.ok) {
      throw new Error(`Geocoding failed: ${response.status}`);
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
  } catch (err) {
    console.error('Geocoding error:', err);
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
 * Reverse geocode: get address from coordinates
 * @param {number} latitude 
 * @param {number} longitude 
 * @returns {Promise<{displayName: string, country: string, city: string} | null>}
 */
export const reverseGeocode = async (latitude, longitude) => {
  if (!latitude || !longitude) return null;
  
  await waitForRateLimit();
  
  const params = new URLSearchParams({
    lat: String(latitude),
    lon: String(longitude),
    format: 'json',
    addressdetails: '1'
  });
  
  try {
    const response = await fetch(`${NOMINATIM_BASE}/reverse?${params.toString()}`, {
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'FilmGallery/1.0'
      }
    });
    
    if (!response.ok) {
      throw new Error(`Reverse geocoding failed: ${response.status}`);
    }
    
    const result = await response.json();
    
    if (result.error) return null;
    
    return {
      displayName: result.display_name,
      country: result.address?.country || '',
      city: result.address?.city || result.address?.town || result.address?.village || ''
    };
  } catch (err) {
    console.error('Reverse geocoding error:', err);
    return null;
  }
};

const geocodingService = {
  searchAddress,
  getCityCoordinates,
  reverseGeocode
};

export default geocodingService;
