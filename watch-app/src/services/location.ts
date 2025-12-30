import Geolocation from 'react-native-geolocation-service';
import { PermissionsAndroid, Platform } from 'react-native';

export interface LocationResult {
  country?: string;
  city?: string;
  detail_location?: string;
}

export const requestLocationPermission = async (): Promise<boolean> => {
  if (Platform.OS === 'android') {
    try {
      const granted = await PermissionsAndroid.request(
        PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
        {
          title: 'Location Permission',
          message: 'Film Gallery Watch needs access to your location',
          buttonNeutral: 'Ask Me Later',
          buttonNegative: 'Cancel',
          buttonPositive: 'OK',
        }
      );
      return granted === PermissionsAndroid.RESULTS.GRANTED;
    } catch (err) {
      console.warn(err);
      return false;
    }
  }
  return true;
};

export const getCurrentLocation = async (): Promise<{
  latitude: number;
  longitude: number;
} | null> => {
  const hasPermission = await requestLocationPermission();
  if (!hasPermission) {
    throw new Error('Location permission denied');
  }

  return new Promise((resolve, reject) => {
    Geolocation.getCurrentPosition(
      position => {
        resolve({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        });
      },
      error => {
        console.error('Location error:', error);
        reject(error);
      },
      {
        enableHighAccuracy: true,
        timeout: 15000,
        maximumAge: 10000,
      }
    );
  });
};

// Reverse geocoding would require a third-party service (Google Maps API, etc.)
// For now, we'll just return coordinates as the detail_location
export const reverseGeocode = async (
  latitude: number,
  longitude: number
): Promise<LocationResult> => {
  // TODO: Implement reverse geocoding with a service like Google Maps API
  // For now, just return the coordinates
  return {
    detail_location: `${latitude.toFixed(6)}, ${longitude.toFixed(6)}`,
  };
};

export const autoDetectLocation = async (): Promise<LocationResult> => {
  try {
    const coords = await getCurrentLocation();
    if (!coords) {
      throw new Error('Unable to get location');
    }
    return await reverseGeocode(coords.latitude, coords.longitude);
  } catch (error) {
    console.error('Auto-detect location failed:', error);
    throw error;
  }
};
