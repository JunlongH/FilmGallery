/**
 * Port Discovery Utility for Mobile App
 * 
 * Automatically discovers FilmGallery server port by scanning common ports
 * when user only provides IP address.
 */

// Common ports to scan (in priority order)
const PORT_SCAN_RANGE = [4000, 4001, 4002, 4003, 4004, 4005, 4010, 4020, 4100];

// Discovery request timeout (ms)
const DISCOVERY_TIMEOUT = 2000;

// App identifier for validation
const APP_IDENTIFIER = 'FilmGallery';

/**
 * Clean IP address input (remove protocol and port if present)
 * @param {string} input - Raw input from user
 * @returns {string} Clean IP address
 */
export function cleanIpAddress(input) {
  if (!input) return '';
  let clean = input.trim();
  // Remove protocol
  clean = clean.replace(/^https?:\/\//, '');
  // Remove port
  clean = clean.replace(/:\d+$/, '');
  // Remove trailing slash
  clean = clean.replace(/\/$/, '');
  return clean;
}

/**
 * Extract port from URL if present
 * @param {string} url - URL string
 * @returns {number|null} Port number or null
 */
export function extractPort(url) {
  if (!url) return null;
  const match = url.match(/:(\d+)(?:\/|$)/);
  return match ? parseInt(match[1], 10) : null;
}

/**
 * Try to discover FilmGallery server on a specific port
 * @param {string} ip - Server IP address
 * @param {number} port - Port to try
 * @returns {Promise<{port: number, version: string}|null>}
 */
async function probePort(ip, port) {
  try {
    const url = `http://${ip}:${port}/api/discover`;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), DISCOVERY_TIMEOUT);
    
    const response = await fetch(url, {
      method: 'GET',
      signal: controller.signal,
      headers: { 'Accept': 'application/json' }
    });
    clearTimeout(timeoutId);
    
    if (response.ok) {
      const data = await response.json();
      if (data.app === APP_IDENTIFIER) {
        return {
          port: data.port || port,
          version: data.version || 'unknown'
        };
      }
    }
  } catch (e) {
    // Port not reachable or not FilmGallery, silently ignore
  }
  return null;
}

/**
 * Discover FilmGallery server port by scanning common ports
 * @param {string} ip - Server IP address (without port)
 * @returns {Promise<{port: number, fullUrl: string, version: string}|null>}
 */
export async function discoverPort(ip) {
  const cleanIp = cleanIpAddress(ip);
  if (!cleanIp) return null;
  
  // Scan all ports in parallel for speed
  const promises = PORT_SCAN_RANGE.map(port => probePort(cleanIp, port));
  const results = await Promise.all(promises);
  
  // Find first successful result
  for (let i = 0; i < results.length; i++) {
    if (results[i]) {
      return {
        port: results[i].port,
        fullUrl: `http://${cleanIp}:${results[i].port}`,
        version: results[i].version
      };
    }
  }
  
  return null;
}

/**
 * Validate if a URL points to a FilmGallery server
 * @param {string} url - Full URL to validate
 * @returns {Promise<{valid: boolean, version?: string}>}
 */
export async function validateServer(url) {
  try {
    const cleanUrl = url.replace(/\/$/, '');
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), DISCOVERY_TIMEOUT);
    
    const response = await fetch(`${cleanUrl}/api/discover`, {
      signal: controller.signal,
      headers: { 'Accept': 'application/json' }
    });
    clearTimeout(timeoutId);
    
    if (response.ok) {
      const data = await response.json();
      if (data.app === APP_IDENTIFIER) {
        return { valid: true, version: data.version };
      }
    }
  } catch (e) {
    // Not reachable or not valid
  }
  return { valid: false };
}

/**
 * Build full URL from IP and port
 * @param {string} ip - IP address
 * @param {number} port - Port number
 * @returns {string} Full URL
 */
export function buildUrl(ip, port) {
  const cleanIp = cleanIpAddress(ip);
  return `http://${cleanIp}:${port}`;
}

export default {
  discoverPort,
  validateServer,
  cleanIpAddress,
  extractPort,
  buildUrl,
  PORT_SCAN_RANGE,
  DISCOVERY_TIMEOUT
};
