/**
 * ShotModeModal - Professional Light Meter
 * Powered by react-native-vision-camera
 * Real-time exposure monitoring with Frame Processor support
 * 
 * VERSION: 2025-12-11-v7-FP-FIXED
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
  calculateEV,
  getBestFormat 
} from './camera/cameraUtils';
import { useExposureMonitor } from './camera/ExposureMonitor';
import { calculateExposure, formatExposureForDisplay } from './camera/ExposureCalculations';
import { getTapCoordinates } from './camera/SpotMeteringHandler';

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
  const minZoom = device?.minZoom ?? 1;
  const maxZoom = device?.maxZoom ?? Math.max(4, minZoom + 3);
  
  // Camera state
  const [isActive, setIsActive] = useState(false);
  const [zoom, setZoom] = useState(minZoom);
  const [meteringMode, setMeteringMode] = useState('average');
  const [iso, setIso] = useState(filmIso || 400);

  useEffect(() => {
    setIso(filmIso || 400);
  }, [filmIso]);
  
  // Common focal lengths for snap-to feature (in mm)
  const SNAP_FOCAL_LENGTHS = [24, 28, 35, 50, 70, 85, 105, 135, 200];
  const SNAP_THRESHOLD = 0.08; // Snap when within 8% of slider range

  const ISO_STEPS = [25, 50, 64, 100, 125, 160, 200, 250, 320, 400, 500, 640, 800, 1000, 1250, 1600, 2000, 2500, 3200, 4000, 5000, 6400, 8000, 12800];
  const bumpIso = (direction) => {
    if (!iso) return;
    const list = ISO_STEPS;
    const idx = list.findIndex(v => v >= iso);
    const currentIdx = idx === -1 ? list.length - 1 : (list[idx] === iso ? idx : Math.max(0, idx - 1));
    const nextIdx = Math.min(Math.max(0, currentIdx + direction), list.length - 1);
    setIso(list[nextIdx]);
  };
  
  // Convert focal length to zoom (base focal length is 24mm)
  const focalToZoom = (focal) => focal / 24;
  
  // Handle zoom with snap-to common focal lengths
  const handleZoomChange = (value) => {
    const focalLength = 24 * value;
    const range = maxZoom - minZoom;
    
    // Check if close to any common focal length
    for (const snapFocal of SNAP_FOCAL_LENGTHS) {
      const snapZoom = focalToZoom(snapFocal);
      // Only snap to values within our zoom range
      if (snapZoom >= minZoom && snapZoom <= maxZoom) {
        const distance = Math.abs(value - snapZoom);
        if (distance < range * SNAP_THRESHOLD) {
          setZoom(snapZoom);
          return;
        }
      }
    }
    setZoom(value);
  };
  const [focusPoint, setFocusPoint] = useState(null);

  // Exposure modes
  const [selectedAperture, setSelectedAperture] = useState(5.6);
  const [selectedShutter, setSelectedShutter] = useState('1/125');
  
  // Location state
  const [location, setLocation] = useState(null);
  const [locLoading, setLocLoading] = useState(true);

  // Measurement state
  const [measuring, setMeasuring] = useState(false);
  const [measuredEV, setMeasuredEV] = useState(null);
  const [spotInfo, setSpotInfo] = useState(null);
  
  // Real-time exposure monitoring
  const [liveExposure, setLiveExposure] = useState(null);
  const [diagnosticInfo, setDiagnosticInfo] = useState({ frames: 0, fpRunning: false, brightness: 0, ev: 0 });
  
  // Camera mode state
  const [cameraMode, setCameraMode] = useState('av'); // av | tv | ps
  const [psFlashMode, setPsFlashMode] = useState('off');
  const [psMaxAperture, setPsMaxAperture] = useState(2.8);

  // Picker state
  const [pickerVisible, setPickerVisible] = useState(false);
  const [pickerType, setPickerType] = useState(null);

  // Frame Processor callback - receives brightness/EV data
  const handleExposureUpdate = useCallback((data) => {
    if (data?.fpActive) {
      setDiagnosticInfo(prev => ({
        ...prev,
        frames: data.frameNumber || prev.frames + 1,
        fpRunning: true,
        brightness: data.brightness || 0,
        ev: data.ev || 0
      }));
      setLiveExposure(data);
    }
  }, []);

  // Use Frame Processor + EXIF sampling for exposure monitoring
  // Pass cameraRef and filmIso for accurate EXIF-based EV calculation
  const { frameProcessor, exposureData, triggerMeasurement, setSpotPoint } = useExposureMonitor(
    handleExposureUpdate,
    cameraRef,
    iso
  );
  
  // Calculate exposure settings based on measured EV
  // Use the EV from liveExposure OR exposureData (which comes from EXIF or brightness analysis)
  // Priority: liveExposure (from callback) > exposureData (from hook state) > diagnosticInfo
  const measuredSceneEV = liveExposure?.ev ?? exposureData?.ev ?? diagnosticInfo.ev ?? null;
  
  // Debug: Log EV sources only when source changes (reduce log spam)
  const sourceRef = React.useRef(null);
  if (exposureData?.source !== sourceRef.current) {
    sourceRef.current = exposureData?.source;
    __DEV__ && console.log('[ShotModeModal] EV source changed to:', exposureData?.source, 'EV:', measuredSceneEV);
  }
  
  const calculatedExposure = React.useMemo(() => {
    if (measuredSceneEV === null || measuredSceneEV === undefined || measuredSceneEV === 0) {
      return { isValid: false };
    }
    
    const result = calculateExposure(
      measuredSceneEV,
      iso,
      cameraMode,
      cameraMode === 'av' ? selectedAperture : selectedShutter,
      cameraMode === 'ps' ? { maxAperture: psMaxAperture, flashMode: psFlashMode } : undefined
    );
    
    __DEV__ && console.log('[Exposure] Calculated:', result);
    return result;
  }, [measuredSceneEV, iso, cameraMode, selectedAperture, selectedShutter, psMaxAperture, psFlashMode]);

  // Auto-update UI based on calculator result (Av/Tv linkage)
  // Only update when no fixed measurement exists
  useEffect(() => {
    if (!calculatedExposure.isValid || measuredEV !== null) return;

    if (cameraMode === 'av') {
      setSelectedShutter(calculatedExposure.targetShutter);
    } else if (cameraMode === 'tv') {
      setSelectedAperture(calculatedExposure.targetAperture);
    }
  }, [calculatedExposure, cameraMode, measuredEV]);

  const activeEV = measuredEV ?? calculatedExposure.ev;

  // Diagnostic logging (reduced frequency - only log once on mount)
  const hasLoggedRef = React.useRef(false);
  if (!hasLoggedRef.current && visible) {
    hasLoggedRef.current = true;
    __DEV__ && console.log('[ShotModeModal] Version: 2025-12-11-v9-FAST-SPOT');
    __DEV__ && console.log('[ShotModeModal] Device:', device ? `${device.name} (${device.position})` : 'null');
  }

  // Reset state when modal opens
  useEffect(() => {
    if (visible) {
      __DEV__ && console.log('[ShotModeModal] Modal opened - device:', !!device, 'hasPermission:', hasPermission);
      setIsActive(true);
      setMeasuredEV(null);
      setZoom(minZoom);
      setFocusPoint(null);
      setMeteringMode('average');
      setLiveExposure(null);
      setSelectedAperture(5.6);
      setSelectedShutter('1/125');
      setCameraMode('av');
      setDiagnosticInfo({ frames: 0, fpRunning: false });
      fetchLocation();
    } else {
      setIsActive(false);
    }
  }, [visible, minZoom, device, hasPermission]);

  // Fetch location with timeout and graceful fallback
  const fetchLocation = async () => {
    setLocLoading(true);
    let timeoutId;
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        setLocation(null);
        return;
      }

      // Position with timeout protection
      const locPromise = Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      const timeoutPromise = new Promise((_, reject) => {
        timeoutId = setTimeout(() => reject(new Error('定位超时')), 12000);
      });
      const loc = await Promise.race([locPromise, timeoutPromise]);
      clearTimeout(timeoutId);

      // Reverse geocode: English for DB, local for detail
      const reverseEN = await Location.reverseGeocodeAsync({
        latitude: loc.coords.latitude,
        longitude: loc.coords.longitude
      }, { locale: 'en-US' });
      const reverseLocal = await Location.reverseGeocodeAsync({
        latitude: loc.coords.latitude,
        longitude: loc.coords.longitude
      });

      if (reverseEN && reverseEN.length > 0) {
        const addrEN = reverseEN[0];
        const addrLocal = (reverseLocal && reverseLocal.length > 0) ? reverseLocal[0] : addrEN;
        setLocation({
          country: addrEN.country || '',
          city: addrEN.city || addrEN.subregion || '',
          detail: `${addrLocal.street || ''} ${addrLocal.name || ''}`.trim()
        });
      } else {
        setLocation(null);
      }
    } catch (e) {
      console.warn('Location error:', e?.message || e);
      setLocation(null);
    } finally {
      clearTimeout(timeoutId);
      setLocLoading(false);
    }
  };

  // When switching modes, unlock live flow
  useEffect(() => {
    setMeasuredEV(null);
  }, [cameraMode]);

  // Handle single-shot measurement (triggered by meter button)
  // This replaces the old lock/unlock toggle
  const handleMeasure = useCallback(async () => {
    if (!cameraRef.current) {
      Alert.alert('错误', '相机未就绪');
      return;
    }

    setMeasuring(true);
    
    try {
      // Use triggerMeasurement from ExposureMonitor for EXIF-based EV
      // Always measure with flash OFF, algorithm will calculate flash exposure
      const measuredEV = await triggerMeasurement();
      
      if (measuredEV !== null && measuredEV !== undefined) {
        setMeasuredEV(measuredEV);
        __DEV__ && console.log('[ShotModeModal] Measured EV:', measuredEV);
      } else {
        Alert.alert('测光失败', '无法获取曝光数据，请重试');
      }
    } catch (e) {
      __DEV__ && console.warn('Measure failed:', e);
      Alert.alert('测光失败', e.message || '未知错误');
    } finally {
      setMeasuring(false);
    }
  }, [triggerMeasurement]);

  // Handle tap to focus/meter (for spot metering mode)
  // Strategy: Set spot point for Frame Processor to calculate brightness at that location,
  // then use brightness ratio to adjust the EXIF-based EV
  const handleTapToFocus = useCallback(async (event) => {
    if (!cameraRef.current) return;
    
    // In average mode, just trigger standard measurement
    if (meteringMode !== 'spot') {
      handleMeasure();
      return;
    }
    
    const point = getTapCoordinates(event, width, cameraHeight);
    setFocusPoint(point);
    
    console.log('[ShotModeModal] Spot metering at:', point);
    
    // Visual feedback immediately
    setSpotInfo({ 
      active: true, 
      message: '点测光中...' 
    });
    setMeasuring(true);
    
    try {
      // Step 1: Set spot point for Frame Processor to calculate spot brightness
      if (setSpotPoint) {
        setSpotPoint({ x: point.x, y: point.y });
        console.log('[ShotModeModal] Spot point set for brightness calculation');
      }
      
      // Step 2: Try to apply focus at the point (for better camera response)
      try {
        await cameraRef.current.focus({ x: point.x, y: point.y });
      } catch (focusErr) {
        // Focus not supported - that's ok
      }
      
      // Step 3: Wait for Frame Processor to calculate brightness at spot point
      // Need ~200-300ms for a few frames to be processed
      await new Promise(resolve => setTimeout(resolve, 300));
      
      // Step 4: Take measurement with spot point - triggerMeasurement will use stored brightness
      // Always measure with flash OFF, algorithm will calculate flash exposure
      const spotEV = await triggerMeasurement({ spotPoint: { x: point.x, y: point.y } });
      
      if (spotEV !== null && spotEV !== undefined) {
        setMeasuredEV(spotEV);
        setSpotInfo({ 
          active: true, 
          message: `点测光完成 EV ${spotEV.toFixed(1)}` 
        });
        console.log('[ShotModeModal] Spot meter result:', spotEV.toFixed(1));
      } else {
        setSpotInfo({ 
          active: true, 
          message: '点测光失败' 
        });
      }
    } catch (e) {
      console.warn('Spot metering failed:', e);
      setSpotInfo({ 
        active: true, 
        message: '点测光失败' 
      });
    } finally {
      setMeasuring(false);
      // Clear spot point after measurement (return to average mode visualization)
      if (setSpotPoint) {
        setSpotPoint(null);
      }
      // Clear feedback after 1.5s
      setTimeout(() => setSpotInfo(null), 1500);
    }
  }, [meteringMode, width, cameraHeight, triggerMeasurement, handleMeasure, setSpotPoint]);

  // Handle manual value selection
  const handleManualSelect = useCallback((value) => {
    if (pickerType === 'max_aperture') {
      setPsMaxAperture(value);
      return;
    }

    if (pickerType === 'aperture') {
      setSelectedAperture(value);
    } else if (pickerType === 'shutter') {
      setSelectedShutter(value);
    }
  }, [pickerType]);

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
            onInitialized={() => {
              __DEV__ && console.log('[Camera] ✅ Initialized successfully');
            }}
            onStarted={() => {
              __DEV__ && console.log('[Camera] ✅ Camera started (preview active)');
            }}
            onStopped={() => {
              __DEV__ && console.log('[Camera] Camera stopped');
            }}
            onError={(error) => {
              console.error('[Camera] ❌ Error:', error.code, error.message);
            }}
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

          {/* Live exposure indicator with diagnostics */}
          {!measuredEV && (
            <View style={styles.liveExposureIndicator}>
              <Text style={styles.waitingText}>
                FP Status: {frameProcessor ? 'Assigned' : 'NULL'}
              </Text>
              <Text style={styles.diagnosticText}>
                Check Metro console for [FP] logs
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
                  // Clear any existing measurement when switching modes
                  setMeasuredEV(null);
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

              {/* Camera mode cycle: Av -> Tv -> P&S */}
              <TouchableOpacity 
                style={styles.modeButton} 
                onPress={() => {
                  const order = ['av', 'tv', 'ps'];
                  const next = order[(order.indexOf(cameraMode) + 1) % order.length];
                  setCameraMode(next);
                }}
              >
                <MaterialCommunityIcons 
                  name={
                    cameraMode === 'av' ? 'alpha-a-circle' :
                    cameraMode === 'tv' ? 'alpha-t-circle' : 'camera-gopro'
                  } 
                  size={24} 
                  color="white" 
                />
                <Text style={styles.modeText}>
                  {cameraMode === 'av' ? 'Av' : cameraMode === 'tv' ? 'Tv' : 'P&S'}
                </Text>
              </TouchableOpacity>
            </View>

            {/* Zoom control with snap-to common focal lengths */}
            <View style={styles.zoomControl}>
              <Text style={[styles.zoomText, SNAP_FOCAL_LENGTHS.includes(Math.round(24 * zoom)) && styles.zoomTextSnapped]}>
                {Math.round(24 * zoom)}mm
              </Text>
              <Slider
                style={{ width: 140, height: 40 }}
                minimumValue={minZoom}
                maximumValue={maxZoom}
                minimumTrackTintColor="#fff"
                maximumTrackTintColor="rgba(255,255,255,0.3)"
                thumbTintColor="#fff"
                value={zoom}
                onValueChange={handleZoomChange}
              />
            </View>
          </View>
        </View>

        {/* Control Deck Section */}
        <Surface style={[styles.controlDeck, { paddingBottom: Math.max(20, insets.bottom + 10) }]} elevation={4}>
          
          {measuredEV === null ? (
            /* Live State - show real-time EV and lock */
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

              {/* ISO control */}
              <View style={styles.psSettingsRow}>
                <TouchableOpacity 
                  style={styles.psSettingBtn}
                  onPress={() => bumpIso(-1)}
                >
                  <MaterialCommunityIcons name="minus" size={20} color="white" />
                  <Text style={styles.psSettingText}>ISO -</Text>
                </TouchableOpacity>

                <View style={[styles.psSettingBtn, { justifyContent: 'center' }]}> 
                  <Text style={[styles.psSettingText, { fontWeight: 'bold' }]}>ISO {iso}</Text>
                </View>

                <TouchableOpacity 
                  style={styles.psSettingBtn}
                  onPress={() => bumpIso(1)}
                >
                  <MaterialCommunityIcons name="plus" size={20} color="white" />
                  <Text style={styles.psSettingText}>ISO +</Text>
                </TouchableOpacity>
              </View>

              <TouchableOpacity 
                style={styles.measureButtonBig} 
                onPress={handleMeasure}
                disabled={measuring}
              >
                {measuring ? (
                  <ActivityIndicator size="large" color="black" />
                ) : (
                  <MaterialCommunityIcons name="camera-metering-spot" size={48} color="black" />
                )}
              </TouchableOpacity>
              
              <Text style={styles.isoLabel}>
                {diagnosticInfo.brightness > 0
                  ? `亮度: ${diagnosticInfo.brightness.toFixed(0)} · ISO ${iso}`
                  : diagnosticInfo.frames > 0
                    ? `准备中... (${diagnosticInfo.frames})`
                    : '启动相机...'}
              </Text>
              <Text style={styles.instructionSubText}>
                {meteringMode === 'spot' ? '点击画面进行点测光' : '点击测光按钮进行测光'}
              </Text>
            </View>
          ) : (
            /* Result State */
            <View style={styles.resultContainer}>
              
              {/* Info header */}
              <View style={styles.resultHeader}>
                <View style={styles.evBadge}>
                  <Text style={styles.evValue}>EV {measuredEV?.toFixed(1)}</Text>
                </View>
                <TouchableOpacity 
                  style={styles.remeasureButton}
                  onPress={handleMeasure}
                  disabled={measuring}
                >
                  {measuring ? (
                    <ActivityIndicator size="small" color="white" />
                  ) : (
                    <MaterialCommunityIcons name="camera-metering-spot" size={24} color="white" />
                  )}
                  <Text style={styles.remeasureText}>重新测光</Text>
                </TouchableOpacity>
                {/* 闪光灯设置按钮，仅在PS模式显示 */}
                {cameraMode === 'ps' && (
                  <TouchableOpacity 
                    style={[styles.remeasureButton, { marginLeft: 8 }]}
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
                      size={22}
                      color={psFlashMode === 'off' ? '#888' : '#FFD700'}
                    />
                    <Text style={styles.remeasureText}>闪光灯: {psFlashMode.toUpperCase()}</Text>
                  </TouchableOpacity>
                )}
              </View>

              {/* Main values display */}
              <View style={styles.valuesDisplay}>
                <TouchableOpacity 
                  style={styles.valueBox}
                  disabled={cameraMode === 'ps' || cameraMode === 'tv'}
                  onPress={() => {
                    setPickerType('aperture');
                    setPickerVisible(true);
                  }}
                >
                  <Text style={styles.valueLabel}>Aperture</Text>
                  <Text style={styles.valueMain}>
                    f/{calculatedExposure.targetAperture}
                  </Text>
                  {cameraMode === 'av' && (
                    <MaterialCommunityIcons name="chevron-down" size={20} color="#666" />
                  )}
                </TouchableOpacity>
                
                <View style={styles.divider} />
                
                <TouchableOpacity 
                  style={styles.valueBox}
                  disabled={cameraMode === 'ps' || cameraMode === 'av'}
                  onPress={() => {
                    setPickerType('shutter');
                    setPickerVisible(true);
                  }}
                >
                  <Text style={styles.valueLabel}>Shutter</Text>
                  <Text style={styles.valueMain}>
                    {calculatedExposure.targetShutter}
                  </Text>
                  {cameraMode === 'tv' && (
                    <MaterialCommunityIcons name="chevron-down" size={20} color="#666" />
                  )}
                </TouchableOpacity>
              </View>

              {/* Info Text */}
              <View style={styles.psResultInfo}>
                <MaterialCommunityIcons 
                  name={cameraMode === 'av' ? 'alpha-a-circle-outline' : cameraMode === 'tv' ? 'alpha-t-circle-outline' : 'camera-gopro'} 
                  size={24} 
                  color="#FFD700" 
                />
                <View style={{ marginLeft: 10 }}>
                  <Text style={{ color: 'white', fontSize: 16 }}>
                    {cameraMode === 'av'
                      ? `Av: f/${selectedAperture} → ${calculatedExposure.targetShutter}`
                      : cameraMode === 'tv'
                        ? `Tv: ${selectedShutter} → f/${calculatedExposure.targetAperture}`
                        : `P&S: f/${calculatedExposure.targetAperture} - ${calculatedExposure.targetShutter}`}
                  </Text>
                  {cameraMode === 'ps' && calculatedExposure.useFlash && (
                    <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 4 }}>
                      <MaterialCommunityIcons 
                        name="flash" 
                        size={16} 
                        color="#FFD700" 
                      />
                      <Text style={{ color: '#FFD700', fontSize: 13, marginLeft: 4 }}>
                        建议使用闪光灯
                      </Text>
                    </View>
                  )}
                </View>
              </View>

              {/* Use button */}
              <Button 
                mode="contained" 
                style={styles.useButton}
                contentStyle={{ height: 50 }}
                labelStyle={{ fontSize: 18, fontWeight: 'bold' }}
                textColor="#000"
                  onPress={() => onUse({ 
                    f: calculatedExposure.targetAperture,
                    s: calculatedExposure.targetShutter,
                    iso,
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
    width: 45,
    textAlign: 'right',
  },
  zoomTextSnapped: {
    color: '#FFD700',
    fontWeight: 'bold',
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
    paddingVertical: 8,
    borderRadius: 12,
    minWidth: 120,
  },
  liveEvText: {
    color: '#FFD700',
    fontWeight: 'bold',
    fontSize: 16,
    textAlign: 'center',
  },
  waitingText: {
    color: '#FFA500',
    fontSize: 12,
    textAlign: 'center',
  },
  diagnosticText: {
    color: '#888',
    fontSize: 10,
    marginTop: 4,
    textAlign: 'center',
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
  instructionSubText: {
    color: '#555',
    fontSize: 12,
    marginTop: 5,
    textAlign: 'center',
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
  remeasureButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#444',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    gap: 6,
  },
  remeasureText: {
    color: 'white',
    fontSize: 12,
    fontWeight: '600',
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
