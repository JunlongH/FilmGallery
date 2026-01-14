/**
 * Axios configuration with automatic failover
 * 
 * Provides:
 * - Primary/secondary URL configuration
 * - Automatic failover on network errors
 * - Connection error alerts
 * - Request timeout handling
 */

import axios, { AxiosError, InternalAxiosRequestConfig } from 'axios';
import { Alert } from 'react-native';

// Extended config type for retry tracking
interface RetryableAxiosRequestConfig extends InternalAxiosRequestConfig {
  _retry?: boolean;
}

let primary: string | null = null;
let secondary: string | null = null;
let activeUrl: string | null = null;

/**
 * Configure axios with primary and optional secondary (backup) URLs
 * @param primaryUrl - Primary API server URL
 * @param secondaryUrl - Optional backup URL for failover
 */
export function configureAxios(
  primaryUrl: string, 
  secondaryUrl?: string | null
): void {
  if (primary === primaryUrl && secondary === secondaryUrl) return;
  
  primary = primaryUrl;
  secondary = secondaryUrl || null;
  activeUrl = primary; // Reset to primary on reconfiguration

  axios.defaults.baseURL = activeUrl;
  axios.defaults.timeout = 5000; // Set 5s timeout to ensure quick failover

  // Clear existing interceptors by resetting handlers array
  // Note: This is a workaround since axios doesn't expose a clean way to clear all interceptors
  (axios.interceptors.response as unknown as { handlers: unknown[] }).handlers = [];

  axios.interceptors.response.use(
    resp => resp,
    async (err: AxiosError) => {
      const originalRequest = err.config as RetryableAxiosRequestConfig | undefined;
      
      // Check for network errors (no response or specific codes)
      const isNetworkError = !err.response && (
        err.code === 'ERR_NETWORK' || 
        err.code === 'ECONNABORTED' || 
        (err.message && (err.message.includes('Network Error') || err.message.includes('timeout')))
      );
      
      if (isNetworkError && originalRequest && !originalRequest._retry) {
        let newUrl: string | null = null;
        
        // Toggle URL if backup is available
        if (activeUrl === primary && secondary) {
          console.log(`Primary ${primary} unreachable, switching to secondary ${secondary}`);
          newUrl = secondary;
        } else if (activeUrl === secondary && primary) {
          console.log(`Secondary ${secondary} unreachable, switching to primary ${primary}`);
          newUrl = primary;
        }
        
        if (newUrl) {
          originalRequest._retry = true;
          activeUrl = newUrl;
          axios.defaults.baseURL = newUrl;
          originalRequest.baseURL = newUrl;
          
          // If the original URL was absolute and matched the old activeUrl, replace it
          if (originalRequest.url && originalRequest.url.startsWith('http')) {
            const oldUrl = newUrl === primary ? secondary : primary;
            if (oldUrl && originalRequest.url.startsWith(oldUrl)) {
              originalRequest.url = originalRequest.url.replace(oldUrl, newUrl);
            }
          }

          // Retry the request
          return axios(originalRequest);
        }
      }

      const info = {
        message: err.message,
        code: err.code,
        url: err.config?.url,
        status: err.response?.status,
      };
      
      // Log for adb logcat debugging
      console.log('AXIOS_ERROR', info);
      
      // Show alert on device
      Alert.alert(
        'Connection Error', 
        `URL: ${info.url}\nError: ${info.message}\nCode: ${info.code}\nStatus: ${info.status || 'N/A'}`
      );

      return Promise.reject(err);
    }
  );

  console.log(`Axios configured. Primary: ${primary}, Secondary: ${secondary}`);
}

/**
 * Get the currently active URL
 */
export function getActiveUrl(): string | null {
  return activeUrl;
}

/**
 * Check if failover is available
 */
export function hasFailover(): boolean {
  return secondary !== null;
}
