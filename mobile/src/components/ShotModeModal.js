import React, { useState, useEffect, useRef, useMemo } from 'react';
import { View, StyleSheet, Modal, TouchableOpacity, Alert, Platform, FlatList, TouchableWithoutFeedback, useWindowDimensions } from 'react-native';
import { Text, Button, ActivityIndicator, IconButton, useTheme, Surface } from 'react-native-paper';
import Slider from '@react-native-community/slider';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as Location from 'expo-location';
import * as FileSystem from 'expo-file-system/legacy';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

// Standard Aperture stops (1/3 stops)
const APERTURES = [
  1.0, 1.2, 1.4, 1.6, 1.8, 2.0, 2.2, 2.5, 2.8, 3.2, 3.5, 4.0, 4.5, 5.0, 5.6, 6.3, 7.1, 8.0, 9.0, 10, 11, 13, 14, 16, 18, 20, 22, 25, 29, 32
];

// Standard Shutter speeds (1/3 stops)
const SHUTTERS = [
  '1/8000', '1/6400', '1/5000', '1/4000', '1/3200', '1/2500', '1/2000', '1/1600', '1/1250', '1/1000', '1/800', '1/640', '1/500', '1/400', '1/320', '1/250', '1/200', '1/160', '1/125', '1/100', '1/80', '1/60', '1/50', '1/40', '1/30', '1/25', '1/20', '1/15', '1/13', '1/10', '1/8', '1/6', '1/5', '1/4', '1/3', '0.4', '0.5', '0.6', '0.8', '1', '1.3', '1.6', '2', '2.5', '3.2', '4', '5', '6', '8', '10', '13', '15', '20', '25', '30'
];

// Point & Shoot Logic
function calculatePSExposure(ev, flashMode, maxAperture) {
  // Thresholds
  const BRIGHT_THRESHOLD = 12;
  const DARK_THRESHOLD = 8;
  const SYNC_SHUTTER = '1/60';
  
  let s = '1/125';
  let f = 8.0;
  let flash = false;

  if (ev >= BRIGHT_THRESHOLD) {
    // Bright: Small aperture, fast shutter
    // Logic: 1/125 ~ 1/250, f/8 ~ f/16
    // We pick a safe middle ground
    s = '1/250';
    f = 11;
    flash = false;
  } else if (ev >= DARK_THRESHOLD) {
    // Medium: Open aperture, slower shutter
    // Logic: max(MIN_SHUTTER, 1/60), f/2.8 ~ f/4
    s = '1/60';
    f = Math.max(maxAperture, 3.5); // Try to stay around f/3.5 if possible

    if (flashMode === 'on') {
      flash = true;
      s = SYNC_SHUTTER;
      f = 5.6; // f/4 ~ f/8
    }
  } else {
    // Dark
    if (flashMode === 'auto' || flashMode === 'on') {
      flash = true;
      s = SYNC_SHUTTER;
      f = 5.6; // f/4 ~ f/8
    } else {
      // No flash, long exposure
      s = '1/4'; // 1/2 ~ 1s is very long for handheld, 1/4 is risky but better
      f = maxAperture;
      flash = false;
    }
  }

  return { s, f, flash };
}

function parseShutter(s) {
  if (typeof s === 'string' && s.includes('/')) {
    const [n, d] = s.split('/');
    return Number(n) / Number(d);
  }
  return Number(s);
}

const PickerModal = ({ visible, onClose, data, onSelect, title }) => {
  const theme = useTheme();
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
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const cameraRef = useRef(null);
  const [permission, requestPermission] = useCameraPermissions();
  
  // Camera State
  const [zoom, setZoom] = useState(0);
  const [meteringMode, setMeteringMode] = useState('average'); // 'average' | 'spot'
  const [exposurePoint, setExposurePoint] = useState(null);
  const [focalLength, setFocalLength] = useState(26);
  
  // Location State
  const [location, setLocation] = useState(null);
  const [locLoading, setLocLoading] = useState(true);

  // Measurement State
  const [measuring, setMeasuring] = useState(false);
  const [measuredEV, setMeasuredEV] = useState(null);
  const [validPairs, setValidPairs] = useState([]);
  const [pairIndex, setPairIndex] = useState(0);
  const [spotInfo, setSpotInfo] = useState(null); // 点测光反馈
  
  // Point & Shoot State
  const [cameraMode, setCameraMode] = useState('manual'); // 'manual' | 'ps'
  const [psFlashMode, setPsFlashMode] = useState('off'); // 'auto' | 'on' | 'off'
  const [psMaxAperture, setPsMaxAperture] = useState(2.8);
  const [psResult, setPsResult] = useState(null);

  // Picker State
  const [pickerVisible, setPickerVisible] = useState(false);
  const [pickerType, setPickerType] = useState(null); // 'aperture' | 'shutter' | 'max_aperture'

  // Reset state when opening
  useEffect(() => {
    if (visible) {
      setMeasuredEV(null);
      setValidPairs([]);
      setPsResult(null);
      setZoom(0);
      setExposurePoint(null);
      setMeteringMode('average');
      fetchLocation();
    }
  }, [visible]);

  // Calculate equivalent focal length
  useEffect(() => {
    const eq = Math.round(26 + zoom * (130 - 26));
    setFocalLength(eq);
  }, [zoom]);

  const fetchLocation = async () => {
    if (!permission?.granted) {
      await requestPermission();
    }
    try {
      setLocLoading(true);
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        setLocLoading(false);
        return;
      }
      const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
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
  };

  const findClosestShutter = (targetT) => {
    let closest = SHUTTERS[0];
    let minDiff = Infinity;
    SHUTTERS.forEach(s => {
      const val = parseShutter(s);
      const diff = Math.abs(val - targetT);
      if (diff < minDiff) {
        minDiff = diff;
        closest = s;
      }
    });
    return closest;
  };

  const generateValidPairs = (targetEV) => {
    const pairs = [];
    // Iterate through all apertures to find matching shutter speeds
    APERTURES.forEach(f => {
      // t = N^2 / 2^EV
      const t = (f * f) / Math.pow(2, targetEV);
      const sStr = findClosestShutter(t);
      const sVal = parseShutter(sStr);
      
      // Verify if this pair is close enough to target EV (within 0.5 EV)
      const pairEV = Math.log2((f * f) / sVal);
      if (Math.abs(pairEV - targetEV) < 0.5) {
        pairs.push({ f, s: sStr });
      }
    });
    
    // Remove duplicates (same shutter speed for multiple apertures? unlikely with this logic but possible)
    // Actually, we want unique pairs.
    return pairs;
  };

  const handleMeasure = async () => {
    if (!cameraRef.current) return;
    setMeasuring(true);
    try {
      const photo = await cameraRef.current.takePictureAsync({
        exif: true,
        skipProcessing: true,
        shutterSound: false,
      });

      const exif = photo.exif || {};
      let measuredIso = Number(exif.ISOSpeedRatings) || Number(exif.ISO) || 100;
      if (Array.isArray(measuredIso)) measuredIso = measuredIso[0];
      
      let measuredShutter = Number(exif.ExposureTime);
      let measuredAperture = Number(exif.FNumber);
      
      // 检查点测光是否生效（部分设备EXIF无变化）
      let spotActive = false;
      if (meteringMode === 'spot' && exposurePoint) {
        // 简单判断：EXIF有ExposurePointX/Y字段（部分设备支持）
        if (exif.ExposurePointX !== undefined || exif.ExposurePointY !== undefined) {
          spotActive = true;
        }
        // 显示反馈信息
        console.log('Spot metering check:', { 
          mode: meteringMode, 
          hasPoint: !!exposurePoint, 
          exifKeys: Object.keys(exif),
          spotActive 
        });
      }
      
      if (!measuredShutter || !measuredAperture) {
        // Fallback
        measuredShutter = 1/60;
        measuredAperture = 1.8;
        measuredIso = 100;
      }

      // Calculate EV100
      let ev100 = Math.log2((measuredAperture * measuredAperture) / measuredShutter) - Math.log2(measuredIso / 100);
      
      // Adjust for Film ISO
      const targetEV = ev100 + Math.log2(filmIso / 100);
      
      setMeasuredEV(targetEV);
      
      if (cameraMode === 'ps') {
        const res = calculatePSExposure(targetEV, psFlashMode, psMaxAperture);
        setPsResult(res);
      } else {
        const pairs = generateValidPairs(targetEV);
        setValidPairs(pairs);
        
        // Default to a middle aperture like f/5.6 or f/8 if available, else middle of array
        const defaultF = 5.6;
        const defaultIndex = pairs.findIndex(p => p.f >= defaultF);
        setPairIndex(defaultIndex !== -1 ? defaultIndex : Math.floor(pairs.length / 2));
      }

      await FileSystem.deleteAsync(photo.uri, { idempotent: true });

      // 点测光反馈
      if (meteringMode === 'spot') {
        setSpotInfo({ active: spotActive });
        setTimeout(() => setSpotInfo(null), 2500);
      }

    } catch (e) {
      Alert.alert('Error', 'Failed to measure light');
      console.error(e);
    } finally {
      setMeasuring(false);
    }
  };

  const handleTapToFocus = (event) => {
    if (meteringMode !== 'spot') return;
    const { locationX, locationY } = event.nativeEvent;
    setExposurePoint({
      x: locationX / width,
      y: locationY / cameraHeight
    });
  };

  const handleManualSelect = (value) => {
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
        // For shutter, compare numeric values
        const v1 = parseShutter(pair.s);
        const v2 = parseShutter(value);
        diff = Math.abs(v1 - v2);
      }

      if (diff < minDiff) {
        minDiff = diff;
        bestIndex = index;
      }
    });

    setPairIndex(bestIndex);
  };

  const currentPair = validPairs[pairIndex];

  if (!permission) return <View />;
  if (!permission.granted) {
    return (
      <Modal visible={visible} animationType="slide">
        <View style={styles.container}>
          <Text style={{color:'white', textAlign:'center', marginTop: 100}}>Camera permission required</Text>
          <Button onPress={requestPermission}>Grant</Button>
          <Button onPress={onClose}>Close</Button>
        </View>
      </Modal>
    );
  }

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={styles.container}>
        
        {/* --- Viewfinder Section --- */}
        <View style={[styles.cameraContainer, { height: cameraHeight }]}>
          <CameraView
            ref={cameraRef}
            style={StyleSheet.absoluteFill}
            zoom={zoom}
            exposurePoint={meteringMode === 'spot' ? exposurePoint : null}
          />
          
          {/* Touch Layer for Focus */}
          <TouchableOpacity 
            style={StyleSheet.absoluteFill} 
            activeOpacity={1} 
            onPress={handleTapToFocus}
          >
            {meteringMode === 'spot' && exposurePoint && (
              <View style={[styles.focusBox, { 
                left: exposurePoint.x * width - 25, 
                top: exposurePoint.y * cameraHeight - 25,
                borderColor: spotInfo?.active === false ? '#888' : spotInfo?.active === true ? '#FFD700' : '#FFD700',
                borderWidth: spotInfo?.active === false ? 1 : 3,
              }]} />
            )}
            {meteringMode === 'spot' && !exposurePoint && (
               <View style={styles.centerReticle} />
            )}
          </TouchableOpacity>
          {/* 点测光反馈弹窗 */}
          {spotInfo && (
            <View style={styles.spotInfoToast}>
              <MaterialCommunityIcons 
                name={spotInfo.active ? 'check-circle' : 'alert-circle'} 
                size={28} 
                color={spotInfo.active ? '#FFD700' : '#FF6B6B'} 
                style={{ marginBottom: 8 }}
              />
              <Text style={{ 
                color: '#fff', 
                fontWeight: 'bold', 
                fontSize: 16,
                textAlign: 'center'
              }}>
                {spotInfo.active ? '✓ 点测光已生效' : '⚠ 设备不支持点测光'}
              </Text>
              <Text style={{ 
                color: '#ccc', 
                fontSize: 12,
                marginTop: 4,
                textAlign: 'center'
              }}>
                {spotInfo.active ? '测光点已应用于曝光计算' : '将使用平均测光模式'}
              </Text>
            </View>
          )}
          {/* Top Bar */}
          <View style={[styles.topBar, { top: Math.max(20, insets.top + 10) }]}>
            <IconButton icon="close" iconColor="white" size={28} onPress={onClose} style={{backgroundColor: 'rgba(0,0,0,0.3)'}} />
            <View style={styles.locationBadge}>
              {locLoading ? <ActivityIndicator size="small" color="white" /> : (
                <Text style={styles.locationText}>
                  {location ? `${location.city}` : 'Searching...'}
                </Text>
              )}
            </View>
          </View>

          {/* Camera Controls Overlay */}
          <View style={styles.cameraControls}>
            <View style={{flexDirection:'row', gap: 10}}>
              <TouchableOpacity 
                style={styles.modeButton} 
                onPress={() => setMeteringMode(m => m === 'average' ? 'spot' : 'average')}
              >
                <MaterialCommunityIcons 
                  name={meteringMode === 'average' ? 'camera-metering-matrix' : 'camera-metering-spot'} 
                  size={24} 
                  color="white" 
                />
                <Text style={styles.modeText}>{meteringMode === 'average' ? 'AVG' : 'SPOT'}</Text>
              </TouchableOpacity>

              <TouchableOpacity 
                style={styles.modeButton} 
                onPress={() => {
                  setCameraMode(m => m === 'manual' ? 'ps' : 'manual');
                  setMeasuredEV(null); // Reset measurement on mode switch
                }}
              >
                <MaterialCommunityIcons 
                  name={cameraMode === 'manual' ? 'camera-iris' : 'camera-gopro'} 
                  size={24} 
                  color="white" 
                />
                <Text style={styles.modeText}>{cameraMode === 'manual' ? 'MANUAL' : 'P&S'}</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.zoomControl}>
              <Text style={styles.zoomText}>{focalLength}mm</Text>
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

        {/* --- Control Deck Section --- */}
        <Surface style={[styles.controlDeck, { paddingBottom: Math.max(20, insets.bottom + 10) }]} elevation={4}>
          
          {!measuredEV ? (
            /* Idle State */
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
                      name={psFlashMode === 'auto' ? 'flash-auto' : psFlashMode === 'on' ? 'flash' : 'flash-off'} 
                      size={20} 
                      color="white" 
                    />
                    <Text style={styles.psSettingText}>Flash: {psFlashMode.toUpperCase()}</Text>
                  </TouchableOpacity>

                  <TouchableOpacity 
                    style={styles.psSettingBtn}
                    onPress={() => {
                      setPickerType('max_aperture');
                      setPickerVisible(true);
                    }}
                  >
                    <MaterialCommunityIcons name="camera-iris" size={20} color="white" />
                    <Text style={styles.psSettingText}>Max f/{psMaxAperture}</Text>
                  </TouchableOpacity>
                </View>
              )}

              <TouchableOpacity 
                style={styles.measureButtonBig} 
                onPress={handleMeasure}
                disabled={measuring}
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
              
              {/* Info Header */}
              <View style={styles.resultHeader}>
                <View style={styles.evBadge}>
                  <Text style={styles.evValue}>EV {measuredEV.toFixed(1)}</Text>
                </View>
                <IconButton 
                  icon="refresh" 
                  size={24} 
                  onPress={() => {
                    setMeasuredEV(null);
                    handleMeasure();
                  }} 
                />
              </View>

              {/* Main Values Display */}
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
                  <Text style={styles.valueMain}>f/{cameraMode === 'ps' ? psResult?.f : currentPair?.f}</Text>
                  {cameraMode !== 'ps' && <MaterialCommunityIcons name="chevron-down" size={20} color="#666" />}
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
                  <Text style={styles.valueMain}>{cameraMode === 'ps' ? psResult?.s : currentPair?.s}</Text>
                  {cameraMode !== 'ps' && <MaterialCommunityIcons name="chevron-down" size={20} color="#666" />}
                </TouchableOpacity>
              </View>

              {/* Slider Control or Flash Info */}
              {cameraMode === 'ps' ? (
                <View style={styles.psResultInfo}>
                  <MaterialCommunityIcons 
                    name={psResult?.flash ? 'flash' : 'flash-off'} 
                    size={24} 
                    color={psResult?.flash ? '#FFD700' : '#666'} 
                  />
                  <Text style={{color: 'white', marginLeft: 10, fontSize: 16}}>
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
                    minimumTrackTintColor={theme.colors.primary}
                    maximumTrackTintColor="#444"
                    thumbTintColor="white"
                  />
                  <MaterialCommunityIcons name="timer-outline" size={20} color="#888" />
                </View>
              )}

              {/* Action Button */}
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
    width: 45,
    textAlign: 'right',
  },
  
  // Focus UI
  focusBox: {
    position: 'absolute',
    width: 60,
    height: 60,
    borderWidth: 2,
    borderColor: '#FFD700',
    borderRadius: 30,
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
    elevation: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
  },
  centerReticle: {
    position: 'absolute',
    top: '50%',
    left: '50%',
    marginLeft: -10,
    marginTop: -10,
    width: 20,
    height: 20,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.5)',
  },

  // Control Deck
  controlDeck: {
    flex: 1,
    backgroundColor: '#121212',
    padding: 20,
    justifyContent: 'center',
  },
  
  // Idle State
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
    shadowColor: '#fff',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
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
    alignSelf: 'center',
  },

  // Result State
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
  
  // Picker Modal
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