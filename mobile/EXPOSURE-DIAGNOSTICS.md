# 曝光数据读取诊断指南

## 🔧 已实施的改进

### 1. **增强的日志系统**

#### ExposurePlugin (Native Android)
- ✅ 添加帧计数器跟踪plugin是否被调用
- ✅ 前5帧和每30帧输出详细日志
- ✅ 失败时列出可用的反射方法，帮助调试CameraX版本差异
- ✅ 成功时标记 `✓` 并输出具体参数值

**查看方式：**
```bash
# Windows PowerShell
adb logcat -s ExposurePlugin:D ReactNativeJS:D VisionCamera:D
```

**预期日志：**
```
ExposurePlugin: Processing frame #1, imageInfo class: ...
ExposurePlugin: Frame #1: ✓ iso=100 exposureNs=8333333 aperture=1.8
ExposurePlugin: Frame #30: ✓ iso=200 exposureNs=4166666 aperture=1.8
```

#### ExposureMonitor (JavaScript)
- ✅ Plugin初始化检查，明确报告成功/失败
- ✅ 帧计数器（每30帧=~6秒@5fps输出日志）
- ✅ 区分plugin数据和metadata fallback
- ✅ 首次成功读取和前10帧输出详细日志

**查看方式：**
- React Native Debugger
- Metro bundler 终端
- `npx expo start --dev-client` 输出

**预期日志：**
```
[ExposureMonitor] Plugin initialized: SUCCESS
[FP] Frame #1 | plugin data: {iso:100, ...} | metadata keys: [...]
[FP] ✓ Frame #1 | ISO:100 Shutter:0.008333 Aperture:1.8 EV:12.3
[FP] Frame #30 | plugin data: {...} | metadata keys: [...]
```

**异常日志：**
```
[ExposureMonitor] Plugin initialized: FAILED (returned null)
[FP] Frame #15 | NO EXPOSURE DATA | plugin: false | meta keys: []
```

---

### 2. **UI诊断显示**

在相机取景器右上角显示实时状态：

**正常状态：**
```
EV 12.3
✓ Frames: 45
```

**等待数据状态：**
```
Processing (12 frames)...
Check console for FP logs
```
或
```
Waiting for exposure...
Check console for FP logs
```

---

### 3. **CaptureResult反射增强**

现在尝试三种方式获取CaptureResult：

```kotlin
// 1) getCaptureResult() - 标准CameraX 1.3+
// 2) getCameraCaptureResult() - 某些OEM实现
// 3) cameraCaptureResult字段 - 反射字段访问
```

失败时会列出ImageInfo对象的所有可用方法，帮助我们适配特殊ROM。

---

## 🔍 诊断步骤

### Step 1: 确认Plugin被调用

**在设备上打开相机5-10秒后，检查logcat：**

✅ **成功** - 看到类似日志：
```
ExposurePlugin: Processing frame #1
ExposurePlugin: Processing frame #30
```

❌ **失败** - 没有任何 `ExposurePlugin` 日志
  - **可能原因：**
    - Frame processor未启用
    - VisionCamera配置错误
    - 编译时plugin未注册
  - **解决方案：**
    - 检查 `android/gradle.properties` 中 `VisionCamera_enableFrameProcessors=true`
    - 重新编译：`cd mobile && npx expo run:android --variant debug`

---

### Step 2: 确认CaptureResult访问

**检查logcat中是否有成功标记：**

✅ **成功** - 看到：
```
ExposurePlugin: Frame #1: ✓ iso=100 exposureNs=8333333 aperture=1.8
```

⚠️ **部分成功** - 看到：
```
ExposurePlugin: Frame #1: ✓ iso=100 exposureNs=8333333 aperture=null
```
  - **说明：** ISO和快门读取成功，光圈缺失（某些设备无光圈传感器）
  - **解决方案：** 代码已做fallback处理，使用默认光圈1.8

❌ **完全失败** - 看到：
```
ExposurePlugin: Frame #10: CaptureResult empty; imageInfo=..., available methods: [...]
```
  - **说明：** 反射访问失败，查看available methods列表
  - **解决方案：**
    - 复制完整日志中的 `available methods` 列表
    - 检查是否有 `getCaptureResult`, `getCameraCaptureResult`, `getTagBundle` 等方法
    - 如果有其他获取CaptureResult的方法名，添加到反射尝试列表

---

### Step 3: 确认JavaScript接收数据

**检查Metro日志或RN Debugger：**

✅ **成功** - 看到：
```
[ExposureMonitor] Plugin initialized: SUCCESS
[FP] Frame #1 | plugin data: {iso:100, exposureDuration:0.008, aperture:1.8}
[FP] ✓ Frame #1 | ISO:100 Shutter:0.008333 Aperture:1.8 EV:12.3
```

⚠️ **Fallback成功** - 看到：
```
[FP] Frame #1 | plugin data: null | metadata keys: [iso, exposureTime, ...]
[FP] ✓ Frame #1 | ISO:100 Shutter:0.008333 Aperture:1.8 EV:12.3
```
  - **说明：** Plugin失败但frame.metadata有数据，可以工作但可能不够实时

❌ **完全失败** - 看到：
```
[FP] Frame #15 | NO EXPOSURE DATA | plugin: false | meta keys: []
```
  - **说明：** Plugin和metadata都没有数据
  - **解决方案：**
    - 确认相机权限已授予
    - 某些设备可能需要手动设置ISO/快门才提供metadata
    - 尝试切换到手动模式（如果Camera支持）

---

### Step 4: 确认UI更新

**在相机界面查看右上角状态：**

✅ **成功** - 显示：
```
EV 12.3
✓ Frames: 45
```

⚠️ **有帧但无数据** - 显示：
```
Processing (45 frames)...
```
  - **说明：** Frame processor在运行但未解析出曝光参数
  - **返回Step 2/3检查日志**

❌ **完全卡住** - 显示：
```
Waiting for exposure...
Check console for FP logs
```
  - **说明：** Frame processor可能未运行
  - **返回Step 1检查plugin是否被调用**

---

## 🛠️ 快速排查命令

### 完整日志收集（保存10分钟）
```powershell
# Windows PowerShell
adb logcat -s ExposurePlugin:D VisionCamera:D ReactNativeJS:D CameraX:D *:E > camera-logs.txt
# 等待10秒
# Ctrl+C 停止
# 发送 camera-logs.txt 文件
```

### 实时观察关键日志
```powershell
adb logcat | Select-String -Pattern "ExposurePlugin|FP]|VisionCamera"
```

### 检查设备相机能力
```powershell
adb shell dumpsys media.camera | Select-String -Pattern "Camera|Capture"
```

---

## 📱 已知设备特性

### 典型设备
- **Pixel/Samsung旗舰:** 完整支持iso/shutter/aperture
- **小米/OPPO:** 可能需要 `getCameraCaptureResult()` 方法
- **低端设备:** 可能只有iso/shutter，无光圈传感器
- **模拟器:** 通常只提供模拟metadata，无真实CaptureResult

---

## 🔄 当前等待确认的问题

基于用户反馈 "还是waiting for exposure"，我们需要确认：

1. ✅ **定位功能正常** → 说明基础权限OK
2. ❓ **Plugin是否被调用** → 需要查看logcat中 `ExposurePlugin: Processing frame #1` 日志
3. ❓ **CaptureResult是否可访问** → 需要查看 `✓ iso=...` 或 `CaptureResult empty` 日志
4. ❓ **JavaScript是否收到数据** → 需要查看Metro日志中的 `[FP]` 前缀日志
5. ❓ **UI是否更新** → 需要确认右上角显示的是哪种状态

---

## 📝 下一步操作

**当你可以物理连接设备时：**

```powershell
# 1. 确保设备USB调试已开启
adb devices

# 2. 重新编译安装（确保最新代码生效）
cd "d:\Program Files\FilmGalery\mobile"
npx expo run:android --variant debug

# 3. 启动Metro（新终端窗口）
npx expo start --dev-client

# 4. 打开logcat监控（新终端窗口）
adb logcat -s ExposurePlugin:D ReactNativeJS:D VisionCamera:D

# 5. 在设备上打开相机，等待10-15秒

# 6. 复制所有日志输出（包括Metro和logcat）
```

**期望看到的完整日志流程：**
```
# Metro日志
[ExposureMonitor] Plugin initialized: SUCCESS

# Logcat日志
ExposurePlugin: Processing frame #1, imageInfo class: Camera2CameraCaptureResultImageInfo
ExposurePlugin: Frame #1: ✓ iso=100 exposureNs=8333333 aperture=1.8

# Metro日志
[FP] Frame #1 | plugin data: {iso:100, exposureDuration:0.008333, aperture:1.8}
[FP] ✓ Frame #1 | ISO:100 Shutter:0.008333 Aperture:1.8 EV:12.3

# UI应显示
EV 12.3
✓ Frames: 1
```

如果任何一步的日志不符合预期，请立即停止并分享那一步的完整日志输出。
