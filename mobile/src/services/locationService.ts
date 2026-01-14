/**
 * Location Service - Unified location management with diagnostics
 * 
 * Features:
 * - Full diagnostic info (permissions, services, providers)
 * - Dual-engine: expo-location + native geolocation fallback
 * - Cache management for instant display
 * - System settings guidance for HyperOS/MIUI/etc.
 * 
 * VERSION: 2026-01-13
 */

import * as Location from 'expo-location';
import { Platform, Linking, Alert } from 'react-native';

// ============================================================================
// Types & Constants
// ============================================================================

/**
 * @typedef {Object} LocationCoords
 * @property {number} latitude
 * @property {number} longitude
 * @property {number|null} altitude
 * @property {number|null} accuracy - meters
 */

/**
 * @typedef {Object} LocationResult
 * @property {LocationCoords|null} coords
 * @property {string} source - 'preload' | 'cache' | 'lastKnown' | 'watch' | 'fallback'
 * @property {number} timestamp
 * @property {string|null} error - error code/message if failed
 * @property {Object} geocode - { country, city, detail }
 */

/**
 * @typedef {Object} DiagnosticInfo
 * @property {string} permissionStatus - 'granted' | 'denied' | 'undetermined'
 * @property {boolean} canAskAgain
 * @property {boolean} servicesEnabled - system location services on/off
 * @property {Object} providerStatus - { gpsAvailable, networkAvailable, passiveAvailable }
 * @property {string|null} lastError
 * @property {string} lastErrorCode
 * @property {number} attemptCount
 * @property {string[]} log - recent log entries
 */

const LOG_MAX_ENTRIES = 20;

// ============================================================================
// Module State
// ============================================================================

let cachedLocation = null;  // { coords, geocode, timestamp, source }
let watchSubscription = null;
let diagnosticLog = [];
let diagnosticInfo = {
  permissionStatus: 'undetermined',
  canAskAgain: true,
  servicesEnabled: null,
  providerStatus: null,
  lastError: null,
  lastErrorCode: null,
  attemptCount: 0,
  log: []
};

// Callbacks for live updates
let locationUpdateCallbacks = [];

// ============================================================================
// Logging
// ============================================================================

const log = (message, level = 'info') => {
  const entry = `[${new Date().toISOString().slice(11, 19)}] ${level.toUpperCase()}: ${message}`;
  diagnosticLog.unshift(entry);
  if (diagnosticLog.length > LOG_MAX_ENTRIES) {
    diagnosticLog.pop();
  }
  diagnosticInfo.log = [...diagnosticLog];
  
  if (__DEV__) {
    if (level === 'error') {
      console.error('[LocationService]', message);
    } else if (level === 'warn') {
      console.warn('[LocationService]', message);
    } else {
      console.log('[LocationService]', message);
    }
  }
};

// ============================================================================
// Diagnostic Functions
// ============================================================================

/**
 * Get full diagnostic info about location services
 */
export const getDiagnostics = async () => {
  log('Running diagnostics...');
  diagnosticInfo.attemptCount++;
  
  try {
    // 1. Check permissions
    const permResult = await Location.getForegroundPermissionsAsync();
    diagnosticInfo.permissionStatus = permResult.status;
    diagnosticInfo.canAskAgain = permResult.canAskAgain !== false;
    log(`Permission: ${permResult.status}, canAskAgain: ${permResult.canAskAgain}`);
    
    // 2. Check if location services are enabled
    try {
      const servicesEnabled = await Location.hasServicesEnabledAsync();
      diagnosticInfo.servicesEnabled = servicesEnabled;
      log(`Services enabled: ${servicesEnabled}`);
    } catch (e) {
      diagnosticInfo.servicesEnabled = null;
      log(`Services check failed: ${e.message}`, 'warn');
    }
    
    // 3. Check provider status (GPS, Network, etc.)
    try {
      const providerStatus = await Location.getProviderStatusAsync();
      diagnosticInfo.providerStatus = providerStatus;
      log(`Providers: GPS=${providerStatus.gpsAvailable}, Network=${providerStatus.networkAvailable}, Background=${providerStatus.backgroundModeEnabled}`);
    } catch (e) {
      diagnosticInfo.providerStatus = null;
      log(`Provider check failed: ${e.message}`, 'warn');
    }
    
  } catch (e) {
    diagnosticInfo.lastError = e.message;
    diagnosticInfo.lastErrorCode = e.code || 'UNKNOWN';
    log(`Diagnostics failed: ${e.code || ''} ${e.message}`, 'error');
  }
  
  return { ...diagnosticInfo };
};

/**
 * Request location permissions
 */
export const requestPermissions = async () => {
  log('Requesting permissions...');
  
  try {
    const result = await Location.requestForegroundPermissionsAsync();
    diagnosticInfo.permissionStatus = result.status;
    diagnosticInfo.canAskAgain = result.canAskAgain !== false;
    log(`Permission result: ${result.status}`);
    return result.status === 'granted';
  } catch (e) {
    diagnosticInfo.lastError = e.message;
    diagnosticInfo.lastErrorCode = e.code || 'PERMISSION_ERROR';
    log(`Permission request failed: ${e.message}`, 'error');
    return false;
  }
};

/**
 * Open system location settings
 */
export const openLocationSettings = () => {
  log('Opening location settings...');
  
  if (Platform.OS === 'android') {
    Linking.sendIntent('android.settings.LOCATION_SOURCE_SETTINGS').catch(() => {
      // Fallback to general settings
      Linking.openSettings().catch(() => {});
    });
  } else {
    Linking.openURL('app-settings:').catch(() => {
      Linking.openSettings().catch(() => {});
    });
  }
};

/**
 * Show guidance alert for location issues
 */
export const showLocationGuidance = (issue) => {
  const messages = {
    permission_denied: {
      title: '需要位置权限',
      message: '请在设置中允许 FilmGallery 访问位置信息。\n\nHyperOS/MIUI：设置 → 应用 → FilmGallery → 权限 → 位置',
      buttons: [
        { text: '取消', style: 'cancel' },
        { text: '打开设置', onPress: openLocationSettings }
      ]
    },
    services_disabled: {
      title: '位置服务已关闭',
      message: '请开启系统位置服务。\n\n下拉通知栏 → 点击"位置"图标开启',
      buttons: [
        { text: '取消', style: 'cancel' },
        { text: '打开设置', onPress: openLocationSettings }
      ]
    },
    gps_disabled: {
      title: 'GPS 未启用',
      message: '请开启 GPS 定位以获得精确位置。\n\n设置 → 位置 → 定位模式 → 高精度',
      buttons: [
        { text: '仅用网络定位', style: 'cancel' },
        { text: '打开设置', onPress: openLocationSettings }
      ]
    },
    timeout: {
      title: '定位超时',
      message: 'GPS 信号较弱，请尝试：\n1. 移动到室外或窗边\n2. 检查是否开启了省电模式\n3. 重启位置服务',
      buttons: [
        { text: '知道了' }
      ]
    }
  };
  
  const config = messages[issue] || messages.timeout;
  Alert.alert(config.title, config.message, config.buttons);
};

// ============================================================================
// Location Fetching
// ============================================================================

/**
 * Get cached location immediately (synchronous)
 */
export const getCachedLocation = () => {
  return cachedLocation;
};

/**
 * Update cache and notify listeners
 */
const updateCache = (coords, geocode, source) => {
  cachedLocation = {
    coords,
    geocode,
    timestamp: Date.now(),
    source
  };
  
  // Notify all listeners
  locationUpdateCallbacks.forEach(cb => {
    try {
      cb(cachedLocation);
    } catch (e) {
      log(`Callback error: ${e.message}`, 'warn');
    }
  });
  
  return cachedLocation;
};

/**
 * Reverse geocode coordinates to address
 */
const reverseGeocode = async (coords) => {
  try {
    const [resultEN, resultLocal] = await Promise.all([
      Location.reverseGeocodeAsync({
        latitude: coords.latitude,
        longitude: coords.longitude
      }, { locale: 'en-US' }).catch(() => []),
      Location.reverseGeocodeAsync({
        latitude: coords.latitude,
        longitude: coords.longitude
      }).catch(() => [])
    ]);
    
    const addrEN = resultEN?.[0] || {};
    const addrLocal = resultLocal?.[0] || addrEN;
    
    return {
      country: addrEN.country || '',
      city: addrEN.city || addrEN.subregion || addrEN.region || '',
      detail: `${addrLocal.street || ''} ${addrLocal.name || ''}`.trim()
    };
  } catch (e) {
    log(`Reverse geocode failed: ${e.message}`, 'warn');
    return { country: '', city: '', detail: '' };
  }
};

/**
 * Get location with full diagnostics and fallback strategies
 * This is the main entry point for getting location
 * 
 * @param {Object} options
 * @param {Function} options.onUpdate - callback for location updates
 * @param {number} options.timeout - max time in ms (default 15000)
 * @param {boolean} options.skipDiagnostics - skip diagnostic checks for speed
 * @returns {Promise<LocationResult>}
 */
export const getLocation = async (options = {}) => {
  const { onUpdate, timeout = 15000, skipDiagnostics = false } = options;
  
  if (onUpdate) {
    locationUpdateCallbacks.push(onUpdate);
  }
  
  log('getLocation() called');
  
  // Run diagnostics first (unless skipped)
  if (!skipDiagnostics) {
    await getDiagnostics();
  }
  
  // Check permission
  if (diagnosticInfo.permissionStatus !== 'granted') {
    const granted = await requestPermissions();
    if (!granted) {
      log('Permission denied', 'error');
      diagnosticInfo.lastError = 'Permission denied';
      diagnosticInfo.lastErrorCode = 'E_PERMISSION_DENIED';
      return {
        coords: null,
        source: 'none',
        timestamp: Date.now(),
        error: 'E_PERMISSION_DENIED',
        geocode: null
      };
    }
  }
  
  // Check services
  if (diagnosticInfo.servicesEnabled === false) {
    log('Location services disabled', 'error');
    diagnosticInfo.lastError = 'Location services disabled';
    diagnosticInfo.lastErrorCode = 'E_SERVICES_DISABLED';
    return {
      coords: null,
      source: 'none',
      timestamp: Date.now(),
      error: 'E_SERVICES_DISABLED',
      geocode: null
    };
  }
  
  // Strategy: Multiple parallel attempts
  let result = null;
  
  // 1. Try cache first (instant)
  if (cachedLocation && (Date.now() - cachedLocation.timestamp) < 5 * 60 * 1000) {
    log(`Using cached location (age: ${Math.round((Date.now() - cachedLocation.timestamp) / 1000)}s)`);
    if (onUpdate) onUpdate(cachedLocation);
    result = cachedLocation;
    // Continue to try to get fresh location in background
  }
  
  // 2. Try getLastKnownPositionAsync (fast, uses system cache)
  try {
    log('Trying getLastKnownPositionAsync...');
    const lastKnown = await Location.getLastKnownPositionAsync({
      maxAge: 10 * 60 * 1000,  // 10 minutes
      requiredAccuracy: 3000   // 3km - very loose for quick result
    });
    
    if (lastKnown?.coords) {
      log(`✓ Got lastKnown: lat=${lastKnown.coords.latitude.toFixed(4)}, accuracy=${lastKnown.coords.accuracy?.toFixed(0)}m`);
      const geocode = await reverseGeocode(lastKnown.coords);
      result = updateCache(
        {
          latitude: lastKnown.coords.latitude,
          longitude: lastKnown.coords.longitude,
          altitude: lastKnown.coords.altitude,
          accuracy: lastKnown.coords.accuracy
        },
        geocode,
        'lastKnown'
      );
    } else {
      log('getLastKnownPositionAsync returned null (no system cache)');
    }
  } catch (e) {
    log(`getLastKnownPositionAsync failed: ${e.code || ''} ${e.message}`, 'warn');
    diagnosticInfo.lastError = e.message;
    diagnosticInfo.lastErrorCode = e.code || 'E_LAST_KNOWN_FAILED';
  }
  
  // 3. Try getCurrentPositionAsync with loose requirements
  // Use LOW accuracy for fastest response on HyperOS/MIUI devices
  try {
    log('Trying getCurrentPositionAsync (LOW accuracy for fast response)...');
    const position = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.Low,  // Use LOW for fastest first fix
      mayShowUserSettingsDialog: true
    });
    
    if (position?.coords) {
      log(`✓ Got current position: lat=${position.coords.latitude.toFixed(4)}, accuracy=${position.coords.accuracy?.toFixed(0)}m`);
      const geocode = await reverseGeocode(position.coords);
      result = updateCache(
        {
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          altitude: position.coords.altitude,
          accuracy: position.coords.accuracy
        },
        geocode,
        'current'
      );
      log(`✓ getCurrentPositionAsync SUCCESS - stopping further attempts`);
    } else {
      log('getCurrentPositionAsync returned position without coords (unusual)');
    }
  } catch (e) {
    log(`getCurrentPositionAsync failed: ${e.code || ''} ${e.message}`, 'warn');
    diagnosticInfo.lastError = e.message;
    diagnosticInfo.lastErrorCode = e.code || 'E_CURRENT_POSITION_FAILED';
  }
  
  // 4. If still no result, try watchPositionAsync as last resort
  // watchPositionAsync is most reliable - receives first available fix immediately
  if (!result) {
    try {
      log('Trying watchPositionAsync as fallback (30s timeout)...');
      result = await new Promise((resolve, reject) => {
        let resolved = false;
        let subscription = null;
        
        const cleanup = () => {
          if (subscription) {
            subscription.remove();
            subscription = null;
          }
        };
        
        // Reduced timeout - if GPS is available it should return quickly
        const timeoutId = setTimeout(() => {
          if (!resolved) {
            resolved = true;
            cleanup();
            reject(new Error('watchPosition timeout (30s)'));
          }
        }, 30000); // 30 seconds
        
        Location.watchPositionAsync(
          {
            accuracy: Location.Accuracy.Lowest, // LOWEST for immediate first fix
            timeInterval: 1000,
            distanceInterval: 0,
            mayShowUserSettingsDialog: true
          },
          async (position) => {
            if (!resolved && position?.coords) {
              resolved = true;
              clearTimeout(timeoutId);
              cleanup();
              
              log(`Got position from watch: accuracy=${position.coords.accuracy?.toFixed(0)}m`);
              const geocode = await reverseGeocode(position.coords);
              const cached = updateCache(
                {
                  latitude: position.coords.latitude,
                  longitude: position.coords.longitude,
                  altitude: position.coords.altitude,
                  accuracy: position.coords.accuracy
                },
                geocode,
                'watch'
              );
              resolve(cached);
            }
          }
        ).then(sub => {
          subscription = sub;
          if (resolved) cleanup();
        }).catch(err => {
          if (!resolved) {
            resolved = true;
            reject(err);
          }
        });
      });
    } catch (e) {
      log(`watchPositionAsync failed: ${e.code || ''} ${e.message}`, 'warn');
      diagnosticInfo.lastError = e.message;
      diagnosticInfo.lastErrorCode = e.code || 'E_WATCH_FAILED';
    }
  }
  
  // Clean up callback
  if (onUpdate) {
    const idx = locationUpdateCallbacks.indexOf(onUpdate);
    if (idx >= 0) locationUpdateCallbacks.splice(idx, 1);
  }
  
  if (result) {
    return {
      coords: result.coords,
      source: result.source,
      timestamp: result.timestamp,
      error: null,
      geocode: result.geocode
    };
  }
  
  // All failed
  log('All location attempts failed', 'error');
  return {
    coords: null,
    source: 'none',
    timestamp: Date.now(),
    error: diagnosticInfo.lastErrorCode || 'E_LOCATION_UNAVAILABLE',
    geocode: null
  };
};

/**
 * Start watching location for continuous updates
 */
export const startWatch = async (onUpdate, options = {}) => {
  const { accuracy = Location.Accuracy.Balanced, timeInterval = 2000 } = options;
  
  log('Starting location watch...');
  
  // Stop any existing watch
  await stopWatch();
  
  // Check permission first
  if (diagnosticInfo.permissionStatus !== 'granted') {
    const granted = await requestPermissions();
    if (!granted) {
      log('Watch failed: permission denied', 'error');
      return false;
    }
  }
  
  try {
    watchSubscription = await Location.watchPositionAsync(
      {
        accuracy,
        timeInterval,
        distanceInterval: 0,
        mayShowUserSettingsDialog: true
      },
      async (position) => {
        if (position?.coords) {
          log(`Watch update: accuracy=${position.coords.accuracy?.toFixed(0)}m`);
          const geocode = await reverseGeocode(position.coords);
          const result = updateCache(
            {
              latitude: position.coords.latitude,
              longitude: position.coords.longitude,
              altitude: position.coords.altitude,
              accuracy: position.coords.accuracy
            },
            geocode,
            'watch'
          );
          if (onUpdate) onUpdate(result);
        }
      }
    );
    
    log('Watch started successfully');
    return true;
  } catch (e) {
    log(`Watch failed: ${e.code || ''} ${e.message}`, 'error');
    diagnosticInfo.lastError = e.message;
    diagnosticInfo.lastErrorCode = e.code || 'E_WATCH_FAILED';
    return false;
  }
};

/**
 * Stop watching location
 */
export const stopWatch = async () => {
  if (watchSubscription) {
    log('Stopping location watch');
    watchSubscription.remove();
    watchSubscription = null;
  }
};

/**
 * Preload location in background (call this early, e.g., on app start)
 * @returns {Promise<{coords: Object|null, source: string, error: string|null, geocode: Object|null}>}
 */
export const preloadLocation = async () => {
  log('Preloading location...');
  
  try {
    // Quick diagnostics
    const diag = await getDiagnostics();
    log(`Preload diagnostics: perm=${diag.permissionStatus}, svc=${diag.servicesEnabled}, gps=${diag.providerStatus?.gpsAvailable}`);
    
    // Try to get any location with reasonable timeout
    const result = await getLocation({ timeout: 30000, skipDiagnostics: true });
    
    const hasCoords = result && result.coords !== null;
    log(`Preload complete: ${hasCoords ? 'success' : 'no location'}`);
    
    // Return consistent format - always return an object with coords
    return {
      coords: result?.coords || null,
      source: result?.source || 'none',
      error: result?.error || null,
      geocode: result?.geocode || null
    };
  } catch (e) {
    log(`Preload failed: ${e.message}`, 'warn');
    // Always return an object, never undefined
    return {
      coords: null,
      source: 'none',
      error: e.message,
      geocode: null
    };
  }
};

/**
 * Get current diagnostic info (synchronous)
 */
export const getDiagnosticInfo = () => {
  return { ...diagnosticInfo };
};

/**
 * Format error for user display
 */
export const formatErrorForDisplay = (errorCode) => {
  const messages = {
    'E_PERMISSION_DENIED': '权限被拒绝',
    'E_SERVICES_DISABLED': '位置服务已关闭',
    'E_LOCATION_UNAVAILABLE': '无法获取位置',
    'E_TIMEOUT': '定位超时',
    'E_LAST_KNOWN_FAILED': '无缓存位置',
    'E_CURRENT_POSITION_FAILED': '定位失败',
    'E_WATCH_FAILED': '位置监听失败',
    'E_LOCATION_SETTINGS_UNSATISFIED': '位置设置不满足',
    'UNKNOWN': '未知错误'
  };
  return messages[errorCode] || errorCode || '未知错误';
};

export default {
  getDiagnostics,
  requestPermissions,
  openLocationSettings,
  showLocationGuidance,
  getCachedLocation,
  getLocation,
  startWatch,
  stopWatch,
  preloadLocation,
  getDiagnosticInfo,
  formatErrorForDisplay
};
