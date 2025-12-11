const fs = require('fs');
const path = require('path');

const content = `/**
 * ShotModeModal - Professional Light Meter
 * Powered by react-native-vision-camera
 * Real-time exposure monitoring with spot metering support
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { 
  View, StyleSheet, Modal, TouchableOpacity, Alert, Platform, 
  FlatList, TouchableWithoutFeedback, useWindowDimensions 
} from 'react-native';
import { Text, Button, ActivityIndicator, IconButton, Surface } from 'react-native-paper';
import Slider from '@react-native-community/slider';
import { 
  Camera, useCameraDevice, useCameraFormat, useCameraPermission 
} from 'react-native-vision-camera';
import * as Location from 'expo-location';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

// Import our custom utilities
import { 
  APERTURES, SHUTTERS, 
  generateValidPairs, 
  calculatePSExposure,
  getBestFormat 
} from './camera/cameraUtils';
import { useExposureMonitor } from './camera/ExposureMonitor';
import { focusAndMeter, getTapCoordinates } from './camera/SpotMeteringHandler';

// Picker Modal Component
const PickerModal = ({ visible, onClose, data, onSelect, title }) => {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <TouchableWithoutFeedback onPress={onClose}>
        <View style={styles.modalOverlay}>
          <TouchableWithoutFeedback>
            <Surface style={styles.pickerContainer} elevation={5}>
              <Text style={styles.pickerTitle}>{title}</Text>
              <FlatList
                data={data}
                keyExtractor={(item) => String(item)}
                renderItem={({ item }) => (
                  <TouchableOpacity 
                    style={styles.pickerItem} 
                    onPress={() => {
                      onSelect(item);
                      onClose();
                    }}
                  >
                    <Text style={styles.pickerItemText}>{item}</Text>
                  </TouchableOpacity>
                )}
                style={{ maxHeight: 300 }}
              />
            </Surface>
          </TouchableWithoutFeedback>
        </View>
      </TouchableWithoutFeedback>
    </Modal>
  );
};

export default function ShotModeModal({ visible, onClose, onUse, filmIso = 400 }) {
  const { width, height } = useWindowDimensions();
  const cameraHeight = height * 0.55;
  const insets = useSafeAreaInsets();
  
  // Camera setup
  const cameraRef = useRef(null);
  const { hasPermission, requestPermission } = useCameraPermission();
  const device = useCameraDevice('back');
  const formats = device?.formats || [];
  const format = getBestFormat(formats);
  
  // Camera state
  const [isActive, setIsActive] = useState(false);
  const [zoom, setZoom] = useState(0);
  const [meteringMode, setMeteringMode] = useState('average');
  const [focusPoint, setFocusPoint] = useState(null);
  
  // Location state
  const [location, setLocation] = useState(null);
  const [locLoading, setLocLoading] = useState(true);

  // Measurement state
  const [measuring, setMeasuring] = useState(false);
  const [measuredEV, setMeasuredEV] = useState(null);
  const [validPairs, setValidPairs] = useState([]);
  const [pairIndex, setPairIndex] = useState(0);
  const [spotInfo, setSpotInfo] = useState(null);
  
  // Real-time exposure monitoring
  const [liveExposure, setLiveExposure] = useState(null);
  
  // Camera mode state
  const [cameraMode, setCameraMode] = useState('manual');
  const [psFlashMode, setPsFlashMode] = useState('off');
  const [psMaxAperture, setPsMaxAperture] = useState(2.8);
  const [psResult, setPsResult] = useState(null);

  // Picker state
  const [pickerVisible, setPickerVisible] = useState(false);
  const [pickerType, setPickerType] = useState(null);

  // Exposure monitoring callback
  const handleExposureUpdate = useCallback((exposureData) => {
    setLiveExposure(exposureData);
  }, []);

  // Setup exposure monitor
  const { frameProcessor } = useExposureMonitor(filmIso, handleExposureUpdate);

  // Reset state when modal opens
  useEffect(() => {
    if (visible) {
      setIsActive(true);
      setMeasuredEV(null);
      setValidPairs([]);
      setPsResult(null);
      setZoom(0);
      setFocusPoint(null);
      setMeteringMode('average');
      setLiveExposure(null);
      fetchLocation();
    } else {
      setIsActive(false);
    }
  }, [visible]);

  // Fetch location
  const fetchLocation = async () => {
    try {
      setLocLoading(true);
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        setLocLoading(false);
        return;
      }
      
      const loc = await Location.getCurrentPositionAsync({ 
        accuracy: Location.Accuracy.Balanced 
      });
      
      const reverse = await Location.reverseGeocodeAsync({
        latitude: loc.coords.latitude,
        longitude: loc.coords.longitude
      });
      
      if (reverse && reverse.length > 0) {
        const addr = reverse[0];
        setLocation({
          country: addr.country,
          city: addr.city || addr.subregion,
          detail: \`\${addr.street || ''} \${addr.name || ''}\`.trim()
        });
      }
    } catch (e) {
      console.log('Location error:', e);
    } finally {
      setLocLoading(false);
    }
  };

  // Handle measurement (capture current exposure)
  const handleMeasure = useCallback(() => {
    if (!liveExposure || !liveExposure.ev) {
      Alert.alert('Error', 'No exposure data available. Please wait a moment.');
      return;
    }

    setMeasuring(true);
    
    try {
      const targetEV = liveExposure.ev;
      setMeasuredEV(targetEV);
      
      if (cameraMode === 'ps') {
        // Point & Shoot mode
        const res = calculatePSExposure(targetEV, psFlashMode, psMaxAperture);
        setPsResult(res);
      } else {
        // Manual mode
        const pairs = generateValidPairs(targetEV);
        setValidPairs(pairs);
        
        // Default to middle aperture
        const defaultF = 5.6;
        const defaultIndex = pairs.findIndex(p => p.f >= defaultF);
        setPairIndex(defaultIndex !== -1 ? defaultIndex : Math.floor(pairs.length / 2));
      }

      // Show spot metering feedback
      if (meteringMode === 'spot' && focusPoint) {
        setSpotInfo({ 
          active: true, 
          message: '✓ Spot metering applied' 
        });
        setTimeout(() => setSpotInfo(null), 2500);
      }
    } catch (error) {
      Alert.alert('Error', 'Failed to measure exposure');
      console.error('Measurement error:', error);
    } finally {
      setMeasuring(false);
    }
  }, [liveExposure, cameraMode, psFlashMode, psMaxAperture, meteringMode, focusPoint, filmIso]);

  // Handle tap to focus/meter
  const handleTapToFocus = useCallback(async (event) => {
    if (meteringMode !== 'spot' || !cameraRef.current) return;
    
    const point = getTapCoordinates(event, width, cameraHeight);
    setFocusPoint(point);
    
    // Apply focus and metering
    const success = await focusAndMeter(cameraRef, point);
    
    if (success) {
      // Visual feedback
      setSpotInfo({ 
        active: true, 
        message: 'Metering point set' 
      });
      setTimeout(() => setSpotInfo(null), 1500);
    }
  }, [meteringMode, width, cameraHeight]);

  // Handle manual value selection
  const handleManualSelect = useCallback((value) => {
    if (pickerType === 'max_aperture') {
      setPsMaxAperture(value);
      return;
    }

    if (!validPairs.length) return;
    
    let bestIndex = pairIndex;
    let minDiff = Infinity;

    validPairs.forEach((pair, index) => {
      let diff;
      if (pickerType === 'aperture') {
        diff = Math.abs(pair.f - value);
      } else {
        const v1 = parseFloat(pair.s.includes('/') 
          ? pair.s.split('/')[0] / pair.s.split('/')[1] 
          : pair.s);
        const v2 = parseFloat(value.includes('/') 
          ? value.split('/')[0] / value.split('/')[1] 
          : value);
        diff = Math.abs(v1 - v2);
      }

      if (diff < minDiff) {
        minDiff = diff;
        bestIndex = index;
      }
    });

    setPairIndex(bestIndex);
  }, [pickerType, validPairs, pairIndex]);

  const currentPair = validPairs[pairIndex];

  // Permission handling
  if (!hasPermission) {
    return (
      <Modal visible={visible} animationType="slide">
        <View style={styles.container}>
          <Text style={{ color: 'white', textAlign: 'center', marginTop: 100 }}>
            Camera permission required
          </Text>
          <Button onPress={requestPermission}>Grant Permission</Button>
          <Button onPress={onClose}>Close</Button>
        </View>
      </Modal>
    );
  }

  if (!device) {
    return (
      <Modal visible={visible} animationType="slide">
        <View style={styles.container}>
          <Text style={{ color: 'white', textAlign: 'center', marginTop: 100 }}>
            No camera device found
          </Text>
          <Button onPress={onClose}>Close</Button>
        </View>
      </Modal>
    );
  }

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={styles.container}>
        
        {/* Viewfinder Section */}
        <View style={[styles.cameraContainer, { height: cameraHeight }]}>
          <Camera
            ref={cameraRef}
            style={StyleSheet.absoluteFill}
            device={device}
            isActive={isActive && visible}
            photo={true}
            format={format}
            zoom={zoom}
            frameProcessor={frameProcessor}
          />
          
          {/* Touch layer for spot metering */}
          <TouchableOpacity 
            style={StyleSheet.absoluteFill} 
            activeOpacity={1} 
            onPress={handleTapToFocus}
          >
            {/* Focus indicator */}
            {meteringMode === 'spot' && focusPoint && (
              <View style={[styles.focusBox, { 
                left: focusPoint.x * width - 30, 
                top: focusPoint.y * cameraHeight - 30,
              }]} />
            )}
            
            {/* Center reticle when no focus point */}
            {meteringMode === 'spot' && !focusPoint && (
              <View style={styles.centerReticle} />
            )}
          </TouchableOpacity>

          {/* Spot metering feedback */}
          {spotInfo && (
            <View style={styles.spotInfoToast}>
              <MaterialCommunityIcons 
                name="check-circle" 
                size={28} 
                color="#FFD700" 
              />
              <Text style={styles.spotInfoText}>
                {spotInfo.message}
              </Text>
            </View>
          )}

          {/* Live exposure indicator */}
          {liveExposure && !measuredEV && (
            <View style={styles.liveExposureIndicator}>
              <Text style={styles.liveEvText}>
                EV {liveExposure.ev?.toFixed(1) || 'N/A'}
              </Text>
            </View>
          )}

          {/* Top bar */}
          <View style={[styles.topBar, { top: Math.max(20, insets.top + 10) }]}>
            <IconButton 
              icon="close" 
              iconColor="white" 
              size={28} 
              onPress={onClose} 
              style={{ backgroundColor: 'rgba(0,0,0,0.3)' }} 
            />
            <View style={styles.locationBadge}>
              {locLoading ? (
                <ActivityIndicator size="small" color="white" />
              ) : (
                <Text style={styles.locationText}>
                  {location ? location.city : 'Unknown'}
                </Text>
              )}
            </View>
          </View>

          {/* Camera controls */}
          <View style={styles.cameraControls}>
            <View style={{ flexDirection: 'row', gap: 10 }}>
              {/* Metering mode toggle */}
              <TouchableOpacity 
                style={styles.modeButton} 
                onPress={() => {
                  setMeteringMode(m => m === 'average' ? 'spot' : 'average');
                  setFocusPoint(null);
                }}
              >
                <MaterialCommunityIcons 
                  name={meteringMode === 'average' ? 'camera-metering-matrix' : 'camera-metering-spot'} 
                  size={24} 
                  color="white" 
                />
                <Text style={styles.modeText}>
                  {meteringMode === 'average' ? 'AVG' : 'SPOT'}
                </Text>
              </TouchableOpacity>

              {/* Camera mode toggle */}
              <TouchableOpacity 
                style={styles.modeButton} 
                onPress={() => {
                  setCameraMode(m => m === 'manual' ? 'ps' : 'manual');
                  setMeasuredEV(null);
                }}
              >
                <MaterialCommunityIcons 
                  name={cameraMode === 'manual' ? 'camera-iris' : 'camera-gopro'} 
                  size={24} 
                  color="white" 
                />
                <Text style={styles.modeText}>
                  {cameraMode === 'manual' ? 'MANUAL' : 'P&S'}
                </Text>
              </TouchableOpacity>
            </View>

            {/* Zoom control */}
            <View style={styles.zoomControl}>
              <Text style={styles.zoomText}>
                {(zoom * 10).toFixed(1)}x
              </Text>
              <Slider
                style={{ width: 120, height: 40 }}
                minimumValue={0}
                maximumValue={1}
                minimumTrackTintColor="#fff"
                maximumTrackTintColor="rgba(255,255,255,0.3)"
                thumbTintColor="#fff"
                value={zoom}
                onValueChange={setZoom}
              />
            </View>
          </View>
        </View>

        {/* Control Deck Section */}
        <Surface style={[styles.controlDeck, { paddingBottom: Math.max(20, insets.bottom + 10) }]} elevation={4}>
          
          {!measuredEV ? (
            /* Idle State - Show live reading and measure button */
            <View style={styles.idleContainer}>
              <Text style={styles.instructionText}>
                {cameraMode === 'ps' ? 'Point & Shoot Mode' : 'Point camera at subject'}
              </Text>
              
              {cameraMode === 'ps' && (
                <View style={styles.psSettingsRow}>
                  <TouchableOpacity 
                    style={styles.psSettingBtn}
                    onPress={() => {
                      const modes = ['auto', 'on', 'off'];
                      const next = modes[(modes.indexOf(psFlashMode) + 1) % 3];
                      setPsFlashMode(next);
                    }}
                  >
                    <MaterialCommunityIcons 
                      name={
                        psFlashMode === 'auto' ? 'flash-auto' : 
                        psFlashMode === 'on' ? 'flash' : 'flash-off'
                      } 
                      size={20} 
                      color="white" 
                    />
                    <Text style={styles.psSettingText}>
                      Flash: {psFlashMode.toUpperCase()}
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity 
                    style={styles.psSettingBtn}
                    onPress={() => {
                      setPickerType('max_aperture');
                      setPickerVisible(true);
                    }}
                  >
                    <MaterialCommunityIcons name="camera-iris" size={20} color="white" />
                    <Text style={styles.psSettingText}>
                      Max f/{psMaxAperture}
                    </Text>
                  </TouchableOpacity>
                </View>
              )}

              <TouchableOpacity 
                style={styles.measureButtonBig} 
                onPress={handleMeasure}
                disabled={measuring || !liveExposure}
              >
                {measuring ? (
                  <ActivityIndicator size="large" color="black" />
                ) : (
                  <MaterialCommunityIcons name="camera-iris" size={48} color="black" />
                )}
              </TouchableOpacity>
              
              <Text style={styles.isoLabel}>Film ISO {filmIso}</Text>
            </View>
          ) : (
            /* Result State */
            <View style={styles.resultContainer}>
              
              {/* Info header */}
              <View style={styles.resultHeader}>
                <View style={styles.evBadge}>
                  <Text style={styles.evValue}>EV {measuredEV.toFixed(1)}</Text>
                </View>
                <IconButton 
                  icon="refresh" 
                  size={24} 
                  onPress={() => {
                    setMeasuredEV(null);
                    setPsResult(null);
                  }} 
                />
              </View>

              {/* Main values display */}
              <View style={styles.valuesDisplay}>
                <TouchableOpacity 
                  style={styles.valueBox}
                  disabled={cameraMode === 'ps'}
                  onPress={() => {
                    setPickerType('aperture');
                    setPickerVisible(true);
                  }}
                >
                  <Text style={styles.valueLabel}>Aperture</Text>
                  <Text style={styles.valueMain}>
                    f/{cameraMode === 'ps' ? psResult?.f : currentPair?.f}
                  </Text>
                  {cameraMode !== 'ps' && (
                    <MaterialCommunityIcons name="chevron-down" size={20} color="#666" />
                  )}
                </TouchableOpacity>
                
                <View style={styles.divider} />
                
                <TouchableOpacity 
                  style={styles.valueBox}
                  disabled={cameraMode === 'ps'}
                  onPress={() => {
                    setPickerType('shutter');
                    setPickerVisible(true);
                  }}
                >
                  <Text style={styles.valueLabel}>Shutter</Text>
                  <Text style={styles.valueMain}>
                    {cameraMode === 'ps' ? psResult?.s : currentPair?.s}
                  </Text>
                  {cameraMode !== 'ps' && (
                    <MaterialCommunityIcons name="chevron-down" size={20} color="#666" />
                  )}
                </TouchableOpacity>
              </View>

              {/* Slider or flash info */}
              {cameraMode === 'ps' ? (
                <View style={styles.psResultInfo}>
                  <MaterialCommunityIcons 
                    name={psResult?.flash ? 'flash' : 'flash-off'} 
                    size={24} 
                    color={psResult?.flash ? '#FFD700' : '#666'} 
                  />
                  <Text style={{ color: 'white', marginLeft: 10, fontSize: 16 }}>
                    Flash {psResult?.flash ? 'Required' : 'Off'}
                  </Text>
                </View>
              ) : (
                <View style={styles.sliderContainer}>
                  <MaterialCommunityIcons name="camera-iris" size={20} color="#888" />
                  <Slider
                    style={{ flex: 1, marginHorizontal: 10, height: 40 }}
                    minimumValue={0}
                    maximumValue={validPairs.length - 1}
                    step={1}
                    value={pairIndex}
                    onValueChange={setPairIndex}
                    minimumTrackTintColor="#FFD700"
                    maximumTrackTintColor="#444"
                    thumbTintColor="white"
                  />
                  <MaterialCommunityIcons name="timer-outline" size={20} color="#888" />
                </View>
              )}

              {/* Use button */}
              <Button 
                mode="contained" 
                style={styles.useButton}
                contentStyle={{ height: 50 }}
                labelStyle={{ fontSize: 18, fontWeight: 'bold' }}
                textColor="#000"
                onPress={() => onUse({ 
                  f: cameraMode === 'ps' ? psResult.f : currentPair.f, 
                  s: cameraMode === 'ps' ? psResult.s : currentPair.s, 
                  location 
                })}
              >
                Use Settings
              </Button>

            </View>
          )}
        </Surface>

        {/* Picker Modal */}
        <PickerModal
          visible={pickerVisible}
          onClose={() => setPickerVisible(false)}
          title={
            pickerType === 'aperture' ? 'Select Aperture' : 
            pickerType === 'shutter' ? 'Select Shutter Speed' : 
            'Select Max Aperture'
          }
          data={pickerType === 'shutter' ? SHUTTERS : APERTURES}
          onSelect={handleManualSelect}
        />
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  cameraContainer: {
    width: '100%',
    position: 'relative',
    overflow: 'hidden',
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
  },
  topBar: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 50 : 30,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 15,
    zIndex: 10,
  },
  locationBadge: {
    backgroundColor: 'rgba(0,0,0,0.5)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
  },
  locationText: {
    color: 'white',
    fontWeight: '600',
    fontSize: 13,
  },
  cameraControls: {
    position: 'absolute',
    bottom: 20,
    left: 20,
    right: 20,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  modeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.5)',
    padding: 8,
    borderRadius: 20,
    gap: 6,
  },
  modeText: {
    color: 'white',
    fontWeight: 'bold',
    fontSize: 12,
  },
  zoomControl: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.5)',
    paddingHorizontal: 10,
    borderRadius: 20,
  },
  zoomText: {
    color: 'white',
    fontSize: 12,
    marginRight: 5,
    width: 35,
    textAlign: 'right',
  },
  focusBox: {
    position: 'absolute',
    width: 60,
    height: 60,
    borderWidth: 3,
    borderColor: '#FFD700',
    borderRadius: 30,
  },
  centerReticle: {
    position: 'absolute',
    top: '50%',
    left: '50%',
    marginLeft: -10,
    marginTop: -10,
    width: 20,
    height: 20,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.7)',
  },
  spotInfoToast: {
    position: 'absolute',
    top: '50%',
    left: '10%',
    right: '10%',
    marginTop: -30,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.85)',
    paddingVertical: 15,
    paddingHorizontal: 20,
    borderRadius: 16,
    zIndex: 999,
  },
  spotInfoText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 16,
    marginTop: 8,
  },
  liveExposureIndicator: {
    position: 'absolute',
    top: 80,
    right: 20,
    backgroundColor: 'rgba(0,0,0,0.7)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
  },
  liveEvText: {
    color: '#FFD700',
    fontWeight: 'bold',
    fontSize: 14,
  },
  controlDeck: {
    flex: 1,
    backgroundColor: '#121212',
    padding: 20,
    justifyContent: 'center',
  },
  idleContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 20,
  },
  measureButtonBig: {
    width: 90,
    height: 90,
    borderRadius: 45,
    backgroundColor: '#fff',
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 5,
  },
  instructionText: {
    color: '#888',
    fontSize: 16,
  },
  isoLabel: {
    color: '#666',
    fontSize: 14,
    marginTop: 10,
  },
  psSettingsRow: {
    flexDirection: 'row',
    gap: 15,
    marginTop: 10,
  },
  psSettingBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#333',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    gap: 6,
  },
  psSettingText: {
    color: 'white',
    fontSize: 12,
    fontWeight: '600',
  },
  psResultInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
    backgroundColor: '#222',
    padding: 10,
    borderRadius: 10,
  },
  resultContainer: {
    flex: 1,
    justifyContent: 'space-between',
  },
  resultHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  evBadge: {
    backgroundColor: '#333',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 8,
  },
  evValue: {
    color: '#FFD700',
    fontWeight: 'bold',
    fontSize: 14,
  },
  valuesDisplay: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    backgroundColor: '#1E1E1E',
    borderRadius: 16,
    padding: 20,
    marginBottom: 20,
  },
  valueBox: {
    alignItems: 'center',
    flex: 1,
  },
  divider: {
    width: 1,
    height: 40,
    backgroundColor: '#333',
  },
  valueLabel: {
    color: '#888',
    fontSize: 12,
    marginBottom: 4,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  valueMain: {
    color: '#fff',
    fontSize: 32,
    fontWeight: '300',
    fontVariant: ['tabular-nums'],
  },
  sliderContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
    paddingHorizontal: 10,
  },
  useButton: {
    backgroundColor: '#fff',
    borderRadius: 12,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  pickerContainer: {
    width: '80%',
    backgroundColor: '#222',
    borderRadius: 16,
    padding: 20,
    maxHeight: '60%',
  },
  pickerTitle: {
    color: 'white',
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 15,
    textAlign: 'center',
  },
  pickerItem: {
    paddingVertical: 15,
    borderBottomWidth: 1,
    borderBottomColor: '#333',
    alignItems: 'center',
  },
  pickerItemText: {
    color: 'white',
    fontSize: 18,
  },
});
`;

const filePath = path.join(__dirname, 'src', 'components', 'ShotModeModal.js');
fs.writeFileSync(filePath, content, 'utf8');
console.log('✓ ShotModeModal.js created successfully');
