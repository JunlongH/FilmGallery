# Exposure Metering Fix - Light Sensor Fallback

## Issue
The app was stuck on "Waiting for exposure..." because the primary method of extracting exposure data (CameraX `CaptureResult`) was returning empty/null values on the specific device (Xiaomi/Redmi). The reflection-based method also failed.

## Solution
We implemented a hardware Light Sensor (`Sensor.TYPE_LIGHT`) fallback mechanism in `ExposureReaderSimple`.

### Changes
1. **`ExposureReaderSimple.kt`**:
   - Added `SensorEventListener` to listen for ambient light changes.
   - Implemented `startLightSensor()` and `stopLightSensor()`.
   - Updated `getCurrentExposure()` to:
     1. Try CameraX (Primary) - *Failing on device*
     2. Try Reflection (Secondary) - *Failing on device*
     3. **Fallback to Light Sensor** - *Working*
   - The fallback calculates EV from Lux and derives a synthetic Shutter Speed (assuming ISO 100, f/1.8).

2. **`useExposurePolling.js`**:
   - Added calls to `startLightSensor()` on mount and `stopLightSensor()` on unmount.
   - Disabled `startCameraX()` to avoid resource conflicts (since it wasn't working anyway).

3. **`ExposureMonitor.js`**:
   - Simplified logging to prevent Worklet crashes (`global._createSerializableString`).

## Verification
Logs confirm the fallback is active and providing data:
```
D ExposureReader: Method 1 failed: com.mrousavy.camera.core.CameraSessionManager
I ReactNativeJS: [ExposurePolling] #511: ISO=100, Shutter=0.0184s, Aperture=1.8, EV=8.5
```
- "Method 1 failed" confirms the primary method is inactive.
- `[ExposurePolling]` logs confirm data is being received and processed by the JS layer.
- EV values (e.g., 8.5) are changing, indicating the sensor is responding to light.

## Next Steps
- The "Waiting for exposure" message should now disappear.
- The exposure meter will now respond to ambient light levels, ensuring the app is usable even without direct camera exposure data.
