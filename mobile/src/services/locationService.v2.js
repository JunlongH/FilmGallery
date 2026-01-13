/**
 * Location Service V2 - Simplified & Robust
 * 
 * Strategy:
 * 1. Always try watchPositionAsync FIRST (most reliable on Android)
 * 2. Fallback to getCurrentPositionAsync only if watch fails
 * 3. Use LOWEST accuracy initially for fastest response
 * 4. Comprehensive diagnostics for HyperOS/MIUI debugging
 * 
 * VERSION: 2026-01-13-v2
 */

import * as Location from 'expo-location';
import { Platform, Linking, Alert } from 'react-native';

// ============================================================================
// Configuration
// ============================================================================

const CONFIG = {
  // Timeouts
  WATCH_TIMEOUT: 15000,          // 15s for watchPosition (should be fast)
  CURRENT_TIMEOUT: 10000,        // 10s for getCurrentPosition
  
  // Cache
  CACHE_MAX_AGE: 5 * 60 * 1000,  // 5 minutes
  
  // Accuracy thresholds
  GOOD_ACCURACY: 100,            // < 100m is good enough
  MAX_ACCURACY: 3000,            // 3km is acceptable for lastKnown
};

// ============================================================================
// State
// ============================================================================

let cachedLocation = null;     // { coords, timestamp, source }
let diagnosticLog = [];
const MAX_LOG_ENTRIES = 30;

// ============================================================================
// Logging
// ============================================================================

const log = (message, level = 'info') => {
  const timestamp = new Date().toISOString().slice(11, 23); // HH:MM:SS.mmm
  const entry = `[${timestamp}] ${level.toUpperCase()}: ${message}`;
  
  diagnosticLog.unshift(entry);
  if (diagnosticLog.length > MAX_LOG_ENTRIES) {
    diagnosticLog.pop();
  }
  
  if (__DEV__) {
    const logFn = level === 'error' ? console.error : level === 'warn' ? console.warn : console.log;
    logFn('[LocationV2]', message);
  }
};

// ============================================================================
// Core Diagnostics
// ============================================================================

/**
 * Get comprehensive diagnostic information
 */
export const getDiagnostics = async () => {
  const diag = {
    timestamp: Date.now(),
    permissionStatus: 'unknown',
    canAskAgain: false,
    servicesEnabled: null,
    providerStatus: null,
    backgroundPermission: 'unknown',
    lastError: null,
    log: [...diagnosticLog]
  };
  
  try {
    // 1. Foreground permission
    const fgPerm = await Location.getForegroundPermissionsAsync();
    diag.permissionStatus = fgPerm.status;
    diag.canAskAgain = fgPerm.canAskAgain !== false;
    log(`FG Permission: ${fgPerm.status}`);
    
    // 2. Background permission (critical for HyperOS/MIUI)
    if (Platform.OS === 'android') {
      try {
        const bgPerm = await Location.getBackgroundPermissionsAsync();
        diag.backgroundPermission = bgPerm.status;
        log(`BG Permission: ${bgPerm.status}`);
      } catch (e) {
        log(`BG Permission check failed: ${e.message}`, 'warn');
      }
    }
    
    // 3. Location services
    try {
      const enabled = await Location.hasServicesEnabledAsync();
      diag.servicesEnabled = enabled;
      log(`Services: ${enabled ? 'ON' : 'OFF'}`);
    } catch (e) {
      log(`Services check failed: ${e.message}`, 'warn');
    }
    
    // 4. Provider status
    try {
      const providers = await Location.getProviderStatusAsync();
      diag.providerStatus = providers;
      log(`Providers: GPS=${providers.gpsAvailable}, Network=${providers.networkAvailable}, BG=${providers.backgroundModeEnabled}`);
    } catch (e) {
      log(`Provider check failed: ${e.message}`, 'warn');
    }
    
  } catch (e) {
    diag.lastError = e.message;
    log(`Diagnostics error: ${e.message}`, 'error');
  }
  
  return diag;
};

/**
 * Request all necessary permissions (including background for HyperOS)
 */
export const requestPermissions = async () => {
  log('Requesting permissions...');
  
  try {
    // 1. Request foreground permission
    const fgResult = await Location.requestForegroundPermissionsAsync();
    log(`FG Permission result: ${fgResult.status}`);
    
    if (fgResult.status !== 'granted') {
      return { granted: false, type: 'foreground', status: fgResult.status };
    }
    
    // 2. Request background permission (CRITICAL for HyperOS/MIUI)
    if (Platform.OS === 'android') {
      try {
        const bgResult = await Location.requestBackgroundPermissionsAsync();
        log(`BG Permission result: ${bgResult.status}`);
        
        if (bgResult.status !== 'granted') {
          log('Background permission denied - location may not work on HyperOS', 'warn');
          // Don't fail - some apps work without BG permission
        }
      } catch (e) {
        log(`BG Permission request failed: ${e.message}`, 'warn');
      }
    }
    
    return { granted: true, type: 'both' };
  } catch (e) {
    log(`Permission request failed: ${e.message}`, 'error');
    return { granted: false, type: 'error', error: e.message };
  }
};

// ============================================================================
// Core Location Fetching - SIMPLIFIED STRATEGY
// ============================================================================

/**
 * Get location using watchPositionAsync (most reliable method)
 * This is now the PRIMARY method, not fallback
 */
const getLocationViaWatch = async () => {
  log('Strategy: Using watchPositionAsync as PRIMARY method');
  
  return new Promise((resolve, reject) => {
    let subscription = null;
    let resolved = false;
    
    const cleanup = () => {
      if (subscription) {
        subscription.remove();
        subscription = null;
      }
    };
    
    const timeoutId = setTimeout(() => {
      if (!resolved) {
        resolved = true;
        cleanup();
        log('Watch timeout - no position received', 'error');
        reject(new Error('WATCH_TIMEOUT'));
      }
    }, CONFIG.WATCH_TIMEOUT);
    
    // Start watching with LOWEST accuracy for immediate response
    Location.watchPositionAsync(
      {
        accuracy: Location.Accuracy.Lowest,  // Prioritize speed over accuracy
        timeInterval: 500,
        distanceInterval: 0
      },
      (position) => {
        if (!resolved && position?.coords) {
          resolved = true;
          clearTimeout(timeoutId);
          cleanup();
          
          const { latitude, longitude, altitude, accuracy } = position.coords;
          log(`✓ WATCH SUCCESS: (${latitude.toFixed(4)}, ${longitude.toFixed(4)}) ±${accuracy?.toFixed(0)}m`);
          
          resolve({
            latitude,
            longitude,
            altitude,
            accuracy
          });
        }
      }
    ).then(sub => {
      subscription = sub;
      if (resolved) cleanup();
    }).catch(err => {
      if (!resolved) {
        resolved = true;
        clearTimeout(timeoutId);
        log(`Watch setup failed: ${err.message}`, 'error');
        reject(err);
      }
    });
  });
};

/**
 * Get location using getCurrentPositionAsync (fallback)
 */
const getLocationViaCurrent = async () => {
  log('Fallback: Trying getCurrentPositionAsync');
  
  try {
    const position = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.Lowest,  // Speed over accuracy
      maximumAge: 60000,                   // Accept 1-minute-old position
      timeout: CONFIG.CURRENT_TIMEOUT
    });
    
    if (position?.coords) {
      const { latitude, longitude, altitude, accuracy } = position.coords;
      log(`✓ CURRENT SUCCESS: (${latitude.toFixed(4)}, ${longitude.toFixed(4)}) ±${accuracy?.toFixed(0)}m`);
      
      return {
        latitude,
        longitude,
        altitude,
        accuracy
      };
    }
    
    throw new Error('No coords in position');
  } catch (e) {
    log(`getCurrentPosition failed: ${e.code || ''} ${e.message}`, 'error');
    throw e;
  }
};

/**
 * Try to get last known position from system cache (fastest)
 */
const getLastKnownLocation = async () => {
  try {
    log('Quick check: lastKnown position');
    const lastKnown = await Location.getLastKnownPositionAsync({
      maxAge: CONFIG.CACHE_MAX_AGE,
      requiredAccuracy: CONFIG.MAX_ACCURACY
    });
    
    if (lastKnown?.coords) {
      const { latitude, longitude, altitude, accuracy } = lastKnown.coords;
      log(`✓ LAST_KNOWN: (${latitude.toFixed(4)}, ${longitude.toFixed(4)}) ±${accuracy?.toFixed(0)}m`);
      return {
        latitude,
        longitude,
        altitude,
        accuracy
      };
    }
    
    log('No lastKnown position available');
    return null;
  } catch (e) {
    log(`lastKnown failed: ${e.message}`, 'warn');
    return null;
  }
};

/**
 * Main location fetching function - SIMPLIFIED FLOW
 */
export const getLocation = async () => {
  log('═══ getLocation() START ═══');
  
  // Step 1: Check diagnostics
  const diag = await getDiagnostics();
  
  if (diag.permissionStatus !== 'granted') {
    log('Permission not granted - requesting...', 'warn');
    const permResult = await requestPermissions();
    
    if (!permResult.granted) {
      log('Permission denied - cannot get location', 'error');
      return {
        success: false,
        error: 'PERMISSION_DENIED',
        coords: null,
        diagnostics: diag
      };
    }
  }
  
  if (diag.servicesEnabled === false) {
    log('Location services disabled', 'error');
    return {
      success: false,
      error: 'SERVICES_DISABLED',
      coords: null,
      diagnostics: diag
    };
  }
  
  // Step 2: Try cache first
  if (cachedLocation && (Date.now() - cachedLocation.timestamp) < CONFIG.CACHE_MAX_AGE) {
    const age = Math.round((Date.now() - cachedLocation.timestamp) / 1000);
    log(`Using CACHE (age: ${age}s)`);
    return {
      success: true,
      coords: cachedLocation.coords,
      source: 'cache',
      diagnostics: diag
    };
  }
  
  // Step 3: Try lastKnown (system cache, very fast)
  const lastKnown = await getLastKnownLocation();
  if (lastKnown) {
    cachedLocation = { coords: lastKnown, timestamp: Date.now(), source: 'lastKnown' };
    return {
      success: true,
      coords: lastKnown,
      source: 'lastKnown',
      diagnostics: diag
    };
  }
  
  // Step 4: PRIMARY STRATEGY - Use watchPositionAsync
  try {
    const coords = await getLocationViaWatch();
    cachedLocation = { coords, timestamp: Date.now(), source: 'watch' };
    
    log('═══ getLocation() SUCCESS via WATCH ═══');
    return {
      success: true,
      coords,
      source: 'watch',
      diagnostics: diag
    };
  } catch (watchError) {
    log(`Watch failed: ${watchError.message}`, 'error');
    
    // Step 5: FALLBACK - Try getCurrentPositionAsync
    try {
      const coords = await getLocationViaCurrent();
      cachedLocation = { coords, timestamp: Date.now(), source: 'current' };
      
      log('═══ getLocation() SUCCESS via CURRENT ═══');
      return {
        success: true,
        coords,
        source: 'current',
        diagnostics: diag
      };
    } catch (currentError) {
      log(`Current also failed: ${currentError.message}`, 'error');
      
      // All methods failed
      log('═══ getLocation() FAILED - ALL METHODS ═══', 'error');
      return {
        success: false,
        error: 'ALL_METHODS_FAILED',
        coords: null,
        diagnostics: diag,
        errors: {
          watch: watchError.message,
          current: currentError.message
        }
      };
    }
  }
};

/**
 * Preload location in background (for screen initialization)
 */
export const preloadLocation = async () => {
  log('Preloading location...');
  return await getLocation();
};

/**
 * Get cached location synchronously
 */
export const getCachedLocation = () => {
  return cachedLocation;
};

/**
 * Clear cache (for testing)
 */
export const clearCache = () => {
  log('Cache cleared');
  cachedLocation = null;
};

/**
 * Get diagnostic log
 */
export const getLog = () => {
  return [...diagnosticLog];
};

// ============================================================================
// UI Helpers
// ============================================================================

/**
 * Open system location settings
 */
export const openLocationSettings = () => {
  log('Opening system settings...');
  
  if (Platform.OS === 'android') {
    Linking.sendIntent('android.settings.LOCATION_SOURCE_SETTINGS').catch(() => {
      Linking.openSettings();
    });
  } else {
    Linking.openSettings();
  }
};

/**
 * Show helpful guidance alert
 */
export const showGuidance = (issue) => {
  const messages = {
    PERMISSION_DENIED: {
      title: '需要位置权限',
      message: '请在系统设置中允许 FilmGallery 访问位置（包括后台位置）。\n\n小米/HyperOS用户：设置 → 应用 → FilmGallery → 权限 → 位置 → 始终允许',
      buttons: [
        { text: '取消', style: 'cancel' },
        { text: '打开设置', onPress: openLocationSettings }
      ]
    },
    SERVICES_DISABLED: {
      title: '位置服务已关闭',
      message: '请在系统设置中开启位置服务。',
      buttons: [
        { text: '取消', style: 'cancel' },
        { text: '打开设置', onPress: openLocationSettings }
      ]
    },
    ALL_METHODS_FAILED: {
      title: '定位失败',
      message: '无法获取位置。请检查：\n1. 位置服务已开启\n2. GPS信号良好（尝试移到室外）\n3. 权限已正确设置\n4. 未开启省电模式',
      buttons: [{ text: '知道了' }]
    }
  };
  
  const config = messages[issue] || messages.ALL_METHODS_FAILED;
  Alert.alert(config.title, config.message, config.buttons);
};

export default {
  getDiagnostics,
  requestPermissions,
  getLocation,
  preloadLocation,
  getCachedLocation,
  clearCache,
  getLog,
  openLocationSettings,
  showGuidance
};
