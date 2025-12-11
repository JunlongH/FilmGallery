# 🔍 曝光问题紧急诊断 v2

## 📱 当前状态
UI显示: "Waiting for exposure..." + "Check console for FP logs"
- ✅ UI已更新（说明代码部分生效）
- ❌ 仍未获取曝光数据

## 🚨 新增的调试日志

### 1. 启动时必看日志

**打开相机界面时，Metro/LogCat应该立即显示：**

```
[ExposureMonitor][Xms] Plugin initialized: SUCCESS/FAILED
[ExposureMonitor] VisionCameraProxy available: true/false
[ExposureMonitor] Plugin object: [object Object]/null
[useExposureMonitor] Hook called, filmIso: 400, plugin available: true/false
[ShotModeModal] Version: 2025-12-10-v2 | frameProcessor: true | device: true | format: true
[ShotModeModal] Modal opened - device: true, hasPermission: true
[Camera] Initialized successfully
```

### 2. 运行时帧日志

**5-10秒后应该看到（如果FP工作）：**

```
[FP] Frame #1 | plugin data: {...} | metadata keys: [...]
[FP] Frame #30 | plugin data: {...} | metadata keys: [...]
```

**或者（如果FP不工作）：**

```
[FP] Frame #15 | NO EXPOSURE DATA | plugin: false | meta keys: []
```

### 3. Native日志

**Android logcat应该显示：**

```
ExposurePlugin: Processing frame #1, imageInfo class: ...
ExposurePlugin: Frame #1: ✓ iso=100 exposureNs=... aperture=...
```

---

## 🎯 诊断流程

### Step 1: 确认代码已更新

**在Metro终端查找：**
- ✅ 必须看到 `[ShotModeModal] Version: 2025-12-10-v2`
- ❌ 如果没有，说明代码没有hot reload，需要完全重启

**操作：**
1. 摇动手机 → Reload
2. 如果还是看不到版本号 → 关闭应用 → 重新启动应用
3. 如果还是不行 → 停止Metro → `npx expo start --dev-client --clear`

---

### Step 2: 确认Plugin初始化

**查看日志中的Plugin状态：**

#### ✅ 成功情况：
```
[ExposureMonitor] Plugin initialized: SUCCESS
[ExposureMonitor] VisionCameraProxy available: true
[ExposureMonitor] Plugin object: [object Object]
```
→ **跳到Step 3**

#### ❌ 失败情况A - Plugin返回null：
```
[ExposureMonitor] Plugin initialized: FAILED (returned null)
[ExposureMonitor] VisionCameraProxy available: true
```
→ **原因：Native代码未编译或Plugin未注册**
→ **解决：需要重新编译**

#### ❌ 失败情况B - VisionCameraProxy不可用：
```
[ExposureMonitor] VisionCameraProxy.initFrameProcessorPlugin not available
```
→ **原因：VisionCamera没有正确安装或版本不兼容**
→ **解决：检查package.json和node_modules**

---

### Step 3: 确认Camera初始化

**必须看到：**
```
[Camera] Initialized successfully
```

#### ❌ 如果看到错误：
```
[Camera] Error: ...
```
→ **记录完整错误信息**

#### ❌ 如果什么都没有：
→ **Camera组件没有mount，检查：**
- `device` 是否为null？
- `hasPermission` 是否为true？
- `visible` 是否为true？

---

### Step 4: 确认Frame Processor运行

**等待10-15秒，应该看到：**

#### ✅ 成功（有帧日志）：
```
[FP] Frame #1 | plugin data: {...}
[FP] Frame #30 | plugin data: {...}
```
→ **Frame Processor在运行，继续Step 5**

#### ❌ 完全没有 `[FP]` 日志：
→ **Frame Processor根本没有被调用**
→ **可能原因：**
1. `video={true}` 没有生效（需要重新编译）
2. `frameProcessor` 为null或undefined
3. `isActive` 为false

**检查命令：**
```powershell
# 在Modal打开时，查看日志中的：
[ShotModeModal] Version: 2025-12-10-v2 | frameProcessor: ? | device: ? | format: ?
```
- 如果 `frameProcessor: false` → Hook返回了undefined
- 如果 `device: false` → 没有检测到摄像头
- 如果 `format: false` → 格式选择失败

---

### Step 5: 诊断数据获取

#### ✅ 如果看到帧日志但有警告：
```
[FP] Frame #15 | NO EXPOSURE DATA | plugin: false | meta keys: []
```
→ **Plugin返回null且metadata也为空**
→ **查看logcat中的ExposurePlugin日志**

**Logcat检查：**
```powershell
adb logcat -s ExposurePlugin:D
```

**预期看到：**
```
ExposurePlugin: Processing frame #1
ExposurePlugin: Frame #1: ✓ iso=100 ...
```

**如果看到：**
```
ExposurePlugin: Frame #10: CaptureResult empty; imageInfo=..., available methods: [...]
```
→ **CaptureResult反射失败，需要查看available methods列表**

---

## 🛠️ 快速修复方案

### 方案 1: 完全重启（最常见）

```powershell
# 1. 停止Metro（Ctrl+C）

# 2. 清理缓存
cd "d:\Program Files\FilmGalery\mobile"
Remove-Item -Recurse -Force node_modules\.cache, .expo -ErrorAction SilentlyContinue

# 3. 重启Metro
npx expo start --dev-client --clear

# 4. 在手机上完全关闭应用
# 5. 重新打开应用
```

### 方案 2: 重新编译Native代码（如果Plugin初始化失败）

```powershell
cd "d:\Program Files\FilmGalery\mobile"

# 清理Android构建
Remove-Item -Recurse -Force android\.gradle, android\app\build -ErrorAction SilentlyContinue

# 重新编译
npx expo run:android --variant debug
```

### 方案 3: 验证video prop（如果FP没有被调用）

**检查ShotModeModal.js第371行是否有：**
```javascript
video={true}
```

**如果有但FP还是不运行 → 需要重新编译（方案2）**

---

## 📊 完整日志模板

**请收集以下信息：**

### Metro日志（应用启动时）
```
[复制启动到打开相机15秒内的所有 [ExposureMonitor]、[useExposureMonitor]、[ShotModeModal]、[Camera]、[FP] 开头的日志]
```

### Logcat日志（如果可以连接USB）
```powershell
adb logcat -s ExposurePlugin:D VisionCamera:D ReactNativeJS:D -d > logs.txt
```

### UI状态
- 右上角显示什么？
  - [ ] "Waiting for exposure..."
  - [ ] "Processing (X frames)..."
  - [ ] "EV X.X ✓ Frames: X"

---

## 🔧 最可能的问题

基于"Waiting for exposure..."状态，最可能的原因（按概率排序）：

1. **80% - Frame Processor没有运行**
   - `video={true}` 需要重新编译才能生效
   - 检查：Metro日志中是否有 `[FP]` 开头的任何日志

2. **15% - Plugin初始化失败**
   - Native代码没有编译或MainApplication没有注册
   - 检查：`[ExposureMonitor] Plugin initialized: FAILED`

3. **4% - Camera没有正确初始化**
   - 权限问题或设备问题
   - 检查：是否有 `[Camera] Initialized successfully`

4. **1% - 其他原因**
   - 设备特殊性、ROM限制等

---

## 🎬 立即行动

1. **重启应用并打开相机**
2. **立即查看Metro终端，找 `Version: 2025-12-10-v2`**
   - 如果没有 → 按方案1完全重启
   - 如果有 → 继续观察其他日志
3. **等待15秒，复制所有日志**
4. **分享日志，特别是包含以下关键字的行：**
   - `[ExposureMonitor]`
   - `[ShotModeModal] Version`
   - `[Camera]`
   - `[FP]`
   - `ExposurePlugin`（如果有USB连接）
