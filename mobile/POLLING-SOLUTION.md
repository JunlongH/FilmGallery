# Frame Processor 替代方案 - 轮询实现

## 📌 问题

Frame Processor 在你的环境下无法正常工作，即使完整重新编译安装后仍然无法获取曝光数据。

## ✅ 解决方案

实现了一个**轮询版本的曝光监控**，完全绕过 Frame Processor，使用定时器（每200ms）调用 native module 获取数据。

## 🔧 实现细节

### 1. Native 模块 (Android)

**文件：** `android/app/src/main/java/com/filmgallery/app/ExposureReaderSimple.kt`

- 通过反射访问 VisionCamera 的内部 CameraSession
- 获取 CaptureResult 并提取曝光参数
- 提供 `getCurrentExposure()` 方法供 JS 调用

### 2. JS Hook

**文件：** `src/hooks/useExposurePolling.js`

- 使用 `setInterval` 每 200ms 调用一次 native 方法
- 计算 EV 值和补偿
- 提供与 Frame Processor 版本相同的接口

### 3. 混合策略

**文件：** `src/components/ShotModeModal.js`

```javascript
// 同时启动两个版本
const { frameProcessor } = useExposureMonitor(filmIso, handleExposureUpdate);
const pollingExposure = useExposurePolling(filmIso, 200);

// Frame Processor 优先，如果没数据就用轮询
const effectiveExposure = liveExposure || pollingExposure.exposureData;
```

## 📦 如何测试

### 方式1: 使用 Expo Dev Client（推荐）

```powershell
cd "d:\Program Files\FilmGalery\mobile"

# 重启 Metro（清除缓存）
npx expo start --dev-client --clear

# 在手机上完全关闭应用，重新打开
# 打开相机界面
```

### 方式2: 重新编译（如果 Dev Client 不工作）

```powershell
cd "d:\Program Files\FilmGalery\mobile"

# 清理
Remove-Item -Recurse -Force android\.gradle, android\app\build -ErrorAction SilentlyContinue

# 重新编译
npx expo run:android --variant debug
```

## 🔍 查看日志

打开相机后，Metro 终端应该显示：

```
[ShotModeModal] Version: 2025-12-10-v3-POLLING | FP: true FPframes: 0 Polling frames: 0
[ExposurePolling] Starting with ISO: 400 interval: 200
[ExposurePolling] Native module debug info: {cameraSessionClassFound: true, ...}
[ExposurePolling] Timer started (interval: 200ms)
[ExposurePolling] #1: ISO=100, Shutter=0.0083s, Aperture=1.8, EV=12.3
[ExposurePolling] #11: ISO=200, Shutter=0.0042s, Aperture=1.8, EV=12.3
```

**成功标志：**
- 看到 `[ExposurePolling]` 日志
- UI 显示 `EV 12.3 ✓ Frames: 50` （帧数递增）
- 不再显示 "Waiting for exposure..."

## ⚠️ 已知问题

### 问题1: 反射可能失败

`ExposureReaderSimple.kt` 使用反射访问 VisionCamera 内部 API。如果失败，日志会显示：

```
[ExposurePolling] No exposure data (30 times). Native module may not have access to camera.
```

**解决：** 需要进一步调试反射路径，或使用 USB 查看 logcat：

```powershell
adb logcat -s ExposureReader:D -v time
```

### 问题2: VisionCamera 版本不兼容

如果 VisionCamera 的内部结构在 v4.7.3 中不同，反射会失败。

**解决：** 可以尝试修改反射代码，或降级到更稳定的版本。

## 🎯 优势

1. **不依赖 Frame Processor** - 绕过 Worklets/Reanimated 复杂性
2. **简单可靠** - 使用标准的 setInterval 和 NativeModules
3. **调试友好** - 错误容易定位
4. **兼容性好** - 适用于更多设备/ROM

## 📊 性能对比

| 方案 | 更新频率 | CPU 占用 | 可靠性 |
|------|---------|---------|--------|
| Frame Processor | ~5 FPS | 低 | 取决于 Worklets |
| 轮询 (200ms) | ~5 Hz | 极低 | 高 |

对于测光应用，200ms（5Hz）的更新频率完全足够。

## 🚀 下一步

1. **立即测试** - 运行应用，查看是否有 `[ExposurePolling]` 日志
2. **如果有数据** - 问题解决！
3. **如果没有数据** - 需要调试反射路径（见下一节）

## 🔧 调试反射路径

如果轮询也无法获取数据，运行：

```powershell
# 连接 USB
adb logcat -s ExposureReader:D VisionCamera:D -v time

# 打开相机，查看反射尝试的详细日志
```

你会看到类似：

```
12-10 11:00:00.123 D/ExposureReader: Method 1 failed: ...
12-10 11:00:00.124 D/ExposureReader: Method 2 failed: ...
```

把完整的错误信息发给我，我可以针对性修改反射代码。

## 📋 文件清单

**新增文件：**
- `android/.../ExposureReaderSimple.kt` - Native 模块
- `android/.../ExposureReaderModule.kt` - 备用方案（未使用）
- `src/hooks/useExposurePolling.js` - 轮询 Hook
- `src/hooks/useExposureMonitorPolling.js` - 另一个备用版本
- `src/hooks/useExposureMonitorSimple.js` - 最简化版本

**修改文件：**
- `src/components/ShotModeModal.js` - 使用混合策略
- `android/.../ExposurePackage.kt` - 注册新模块
- `android/.../MainApplication.kt` - 已注册 ExposurePackage

## 💡 关键代码

### Native 反射获取 CaptureResult

```kotlin
// 尝试多种可能的字段名
val possibleFields = listOf(
    "lastCaptureResult",
    "captureResult", 
    "latestResult",
    "currentCaptureResult"
)

for (fieldName in possibleFields) {
    val field = sessionClass.getDeclaredField(fieldName)
    field.isAccessible = true
    val captureResult = field.get(session) as? CaptureResult
    // ...
}
```

### JS 轮询调用

```javascript
timerRef.current = setInterval(() => {
  ExposureReaderSimple.getCurrentExposure()
    .then(data => {
      if (data && data.iso) {
        // 计算 EV 并更新 UI
      }
    });
}, 200);
```

---

**如果这个方案还是不工作，请告诉我：**
1. Metro 日志中是否有 `[ExposurePolling]` 开头的任何日志
2. 如果有 USB，提供 `adb logcat -s ExposureReader` 的输出
3. UI 是否显示 "Frames: X"（X 是否在递增）
