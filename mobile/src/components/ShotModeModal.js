import React, { useState, useEffect, useRef } from 'react';
import { View, StyleSheet, Modal, TouchableOpacity, Dimensions, Alert, ScrollView } from 'react-native';
import { Text, Button, ActivityIndicator, IconButton, useTheme, Slider } from 'react-native-paper';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as Location from 'expo-location';
import * as FileSystem from 'expo-file-system';
import { MaterialCommunityIcons } from '@expo/vector-icons';

const { width, height } = Dimensions.get('window');

// Standard Aperture stops
const APERTURES = [1.4, 1.8, 2, 2.8, 4, 5.6, 8, 11, 16, 22];
// Standard Shutter speeds
const SHUTTERS = [
  '1/8000', '1/4000', '1/2000', '1/1000', '1/500', '1/250', '1/125', '1/60', '1/30', '1/15', '1/8', '1/4', '1/2', '1', '2', '4', '8', '15', '30'
];

function parseShutter(s) {
  if (s.includes('/')) {
    const [n, d] = s.split('/');
    return Number(n) / Number(d);
  }
  return Number(s);
}

export default function ShotModeModal({ visible, onClose, onUse, filmIso = 400 }) {
  const theme = useTheme();
  const cameraRef = useRef(null);
  const [permission, requestPermission] = useCameraPermissions();
  const [location, setLocation] = useState(null);
  const [locLoading, setLocLoading] = useState(true);
  const [zoom, setZoom] = useState(0);
  const [measuring, setMeasuring] = useState(false);
  const [measuredEV, setMeasuredEV] = useState(null);
  const [suggestions, setSuggestions] = useState([]);
  const [exposurePoint, setExposurePoint] = useState(null);

  useEffect(() => {
    if (visible) {
      (async () => {
        // Request permissions
        if (!permission?.granted) {
          await requestPermission();
        }
        
        // Get Location
        try {
          setLocLoading(true);
          const { status } = await Location.requestForegroundPermissionsAsync();
          if (status !== 'granted') {
            Alert.alert('Permission to access location was denied');
            setLocLoading(false);
            return;
          }

          const loc = await Location.getCurrentPositionAsync({});
          const reverse = await Location.reverseGeocodeAsync({
            latitude: loc.coords.latitude,
            longitude: loc.coords.longitude
          });

          if (reverse && reverse.length > 0) {
            const addr = reverse[0];
            setLocation({
              country: addr.country,
              city: addr.city || addr.subregion,
              detail: `${addr.street || ''} ${addr.name || ''}`.trim()
            });
          }
        } catch (e) {
          console.log('Location error', e);
        } finally {
          setLocLoading(false);
        }
      })();
    } else {
      // Reset state on close
      setMeasuredEV(null);
      setSuggestions([]);
      setZoom(0);
      setExposurePoint(null);
    }
  }, [visible]);

  const handleMeasure = async () => {
    if (!cameraRef.current) return;
    setMeasuring(true);
    try {
      // Take picture to read EXIF
      const photo = await cameraRef.current.takePictureAsync({
        exif: true,
        skipProcessing: true,
        shutterSound: false, // Try to silence if possible
      });

      // Extract EXIF
      const exif = photo.exif || {};
      // Note: Android/iOS keys might differ slightly, usually 'ExposureTime' and 'ISOSpeedRatings'
      // iOS: { ExposureTime: 0.01, ISOSpeedRatings: [ 50 ], FNumber: 1.8 }
      // Android: { ExposureTime: "0.01", ISOSpeedRatings: "50", FNumber: "1.8" }

      let measuredIso = Number(exif.ISOSpeedRatings) || Number(exif.ISO) || 100;
      if (Array.isArray(measuredIso)) measuredIso = measuredIso[0];
      
      let measuredShutter = Number(exif.ExposureTime);
      let measuredAperture = Number(exif.FNumber);

      // Fallback if EXIF missing (simulated for now if testing on simulator)
      if (!measuredShutter || !measuredAperture) {
        console.warn('EXIF missing, using defaults');
        measuredShutter = 1/60;
        measuredAperture = 1.8;
        measuredIso = 100;
      }

      // Calculate EV (Exposure Value) at ISO 100
      // EV = log2(N^2 / t) - log2(ISO/100)
      // N = Aperture, t = Shutter time
      const ev100 = Math.log2((measuredAperture * measuredAperture) / measuredShutter) - Math.log2(measuredIso / 100);
      
      // Calculate Target EV for Film ISO
      // Target EV = EV100 + log2(FilmISO / 100)
      const targetEV = ev100 + Math.log2(filmIso / 100);
      
      setMeasuredEV(targetEV);
      generateSuggestions(targetEV);

      // Delete temp file
      await FileSystem.deleteAsync(photo.uri, { idempotent: true });

    } catch (e) {
      console.error('Measurement failed', e);
      Alert.alert('Measurement failed', e.message);
    } finally {
      setMeasuring(false);
    }
  };

  const generateSuggestions = (ev) => {
    // EV = log2(N^2 / t)
    // t = N^2 / 2^EV
    const pairs = [];
    
    APERTURES.forEach(f => {
      const t = (f * f) / Math.pow(2, ev);
      // Find closest standard shutter speed
      let closest = SHUTTERS[0];
      let minDiff = Infinity;
      
      SHUTTERS.forEach(s => {
        const val = parseShutter(s);
        const diff = Math.abs(val - t);
        if (diff < minDiff) {
          minDiff = diff;
          closest = s;
        }
      });
      
      pairs.push({ f, s: closest });
    });
    
    setSuggestions(pairs);
  };

  const handleTapToFocus = (event) => {
    const { locationX, locationY } = event.nativeEvent;
    // Normalize to 0-1
    setExposurePoint({
      x: locationX / width,
      y: locationY / (height * 0.7) // Approx camera height
    });
  };

  if (!permission) return <View />;
  if (!permission.granted) {
    return (
      <Modal visible={visible} animationType="slide">
        <View style={styles.container}>
          <Text>No access to camera</Text>
          <Button onPress={requestPermission}>Grant Permission</Button>
          <Button onPress={onClose}>Close</Button>
        </View>
      </Modal>
    );
  }

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={styles.container}>
        {/* Camera View */}
        <CameraView
          ref={cameraRef}
          style={styles.camera}
          zoom={zoom}
          onCameraReady={() => console.log('Camera ready')}
          exposurePoint={exposurePoint} // For spot metering
        >
          <TouchableOpacity 
            style={styles.touchLayer} 
            activeOpacity={1} 
            onPress={handleTapToFocus}
          >
            {exposurePoint && (
              <View 
                style={[
                  styles.focusBox, 
                  { 
                    left: exposurePoint.x * width - 25, 
                    top: exposurePoint.y * (height * 0.7) - 25 
                  }
                ]} 
              />
            )}
          </TouchableOpacity>
        </CameraView>

        {/* Overlays */}
        <View style={styles.topOverlay}>
          <IconButton icon="close" iconColor="white" onPress={onClose} />
          <View style={styles.locationBadge}>
            {locLoading ? (
              <ActivityIndicator size="small" color="white" />
            ) : (
              <Text style={{ color: 'white', fontSize: 12 }}>
                {location ? `${location.city}, ${location.country}` : 'No Location'}
              </Text>
            )}
          </View>
        </View>

        {/* Controls */}
        <View style={styles.controls}>
          {/* Zoom Slider (Average vs Spot simulation) */}
          <View style={styles.sliderContainer}>
            <Text style={{ color: 'white', fontSize: 10 }}>Wide (Avg)</Text>
            <Slider
              style={{ width: 150, height: 40 }}
              minimumValue={0}
              maximumValue={0.5} // Limit zoom to avoid digital noise affecting metering too much?
              minimumTrackTintColor="#FFFFFF"
              maximumTrackTintColor="#000000"
              value={zoom}
              onValueChange={setZoom}
            />
            <Text style={{ color: 'white', fontSize: 10 }}>Tele (Spot)</Text>
          </View>

          <Button 
            mode="contained" 
            icon="camera-metering-spot" 
            onPress={handleMeasure}
            loading={measuring}
            disabled={measuring}
            style={styles.measureBtn}
          >
            Measure Light
          </Button>
        </View>

        {/* Results Sheet */}
        {measuredEV !== null && (
          <View style={styles.resultsSheet}>
            <Text style={styles.evText}>EV: {measuredEV.toFixed(1)} @ ISO {filmIso}</Text>
            <Text style={styles.subText}>Select a pair to use:</Text>
            <ScrollView horizontal contentContainerStyle={styles.pairsList}>
              {suggestions.map((pair, idx) => (
                <TouchableOpacity 
                  key={idx} 
                  style={styles.pairCard}
                  onPress={() => onUse({ ...pair, location })}
                >
                  <Text style={styles.fText}>f/{pair.f}</Text>
                  <Text style={styles.sText}>{pair.s}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: 'black',
  },
  camera: {
    flex: 1,
  },
  touchLayer: {
    flex: 1,
  },
  focusBox: {
    position: 'absolute',
    width: 50,
    height: 50,
    borderWidth: 2,
    borderColor: '#ffeb3b',
    borderRadius: 25,
  },
  topOverlay: {
    position: 'absolute',
    top: 40,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 10,
  },
  locationBadge: {
    backgroundColor: 'rgba(0,0,0,0.5)',
    padding: 6,
    borderRadius: 12,
  },
  controls: {
    position: 'absolute',
    bottom: 160, // Above results sheet
    left: 0,
    right: 0,
    alignItems: 'center',
    gap: 10,
  },
  sliderContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.3)',
    padding: 5,
    borderRadius: 20,
  },
  measureBtn: {
    backgroundColor: '#f44336',
  },
  resultsSheet: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 150,
    backgroundColor: 'white',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 15,
  },
  evText: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 5,
  },
  subText: {
    fontSize: 12,
    color: '#666',
    marginBottom: 10,
  },
  pairsList: {
    gap: 10,
    paddingRight: 20,
  },
  pairCard: {
    backgroundColor: '#f0f0f0',
    padding: 10,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 70,
  },
  fText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#333',
  },
  sText: {
    fontSize: 14,
    color: '#666',
  },
});
