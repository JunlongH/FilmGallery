# 终极检查清单 - 曝光数据问题

## ✅ 必须完成的步骤（按顺序）

### Step 0: 确认代码已部署 ⚠️ **最关键**

#### 方法A: 热重载（快速）
1. 在手机上摇动设备
2. 点击 "Reload"
3. 打开相机界面
4. 查看Metro终端

**必须看到：**
```
[ShotModeModal] Version: 2025-12-10-v2
```

❌ **如果没看到这行** → 代码没有更新，继续方法B

#### 方法B: 完全重启（推荐）
```powershell
# 1. 停止Metro (Ctrl+C)

# 2. 清理缓存
cd "d:\Program Files\FilmGalery\mobile"
Remove-Item -Recurse -Force node_modules\.cache -ErrorAction SilentlyContinue
Remove-Item -Recurse -Force .expo -ErrorAction SilentlyContinue

# 3. 重启Metro
npx expo start --dev-client --clear

# 4. 在手机上：
#    - 完全关闭FilmGallery应用（从后台清除）
#    - 重新打开应用
#    - 打开相机界面
```

**再次检查Metro终端，必须看到：**
```
[ShotModeModal] Version: 2025-12-10-v2
```

✅ **看到了** → 继续Step 1
❌ **还是没有** → 方法C（重新编译）

#### 方法C: 重新编译（终极方案）

```powershell
cd "d:\Program Files\FilmGalery\mobile"

# 清理所有构建产物
Remove-Item -Recurse -Force android\.gradle -ErrorAction SilentlyContinue
Remove-Item -Recurse -Force android\app\build -ErrorAction SilentlyContinue
Remove-Item -Recurse -Force node_modules\.cache -ErrorAction SilentlyContinue
Remove-Item -Recurse -Force .expo -ErrorAction SilentlyContinue

# 重新编译（这会需要10-15分钟）
npx expo run:android --variant debug

# 编译完成后，应用会自动安装并启动
# 打开相机界面
```

---

### Step 1: 检查启动日志

**打开相机界面后，Metro终端应该显示：**

```
[ExposureMonitor][Xms] Plugin initialized: SUCCESS
[ExposureMonitor] VisionCameraProxy available: true  
[ExposureMonitor] Plugin object: [object Object]
[useExposureMonitor] Hook called, filmIso: 400, plugin available: true
[ShotModeModal] Version: 2025-12-10-v2 | frameProcessor: true | device: true | format: true
[ShotModeModal] Modal opened - device: true, hasPermission: true
[Camera] Initialized successfully
```

#### 问题排查：

**如果看到：**
```
[ExposureMonitor] Plugin initialized: FAILED (returned null)
```
→ **Native plugin没有正确注册或编译**
→ **解决：必须重新编译（方法C）**

**如果看到：**
```
[ExposureMonitor] VisionCameraProxy.initFrameProcessorPlugin not available
```
→ **VisionCamera安装有问题**
→ **解决：**
```powershell
cd "d:\Program Files\FilmGalery\mobile"
npm ls react-native-vision-camera
# 应该显示版本 ^4.7.3
# 如果没有，运行：
npm install react-native-vision-camera@^4.7.3
# 然后重新编译（方法C）
```

**如果看到：**
```
[ShotModeModal] Version: 2025-12-10-v2 | frameProcessor: false | device: true | format: true
```
→ **useExposureMonitor返回了undefined的frameProcessor**
→ **检查ExposureMonitor.js是否有语法错误**

**如果没有看到：**
```
[Camera] Initialized successfully
```
→ **Camera没有mount或初始化失败**
→ **可能原因：**
- 权限问题
- device为null
- format选择失败

---

### Step 2: 等待Frame Processor日志（关键）

**打开相机后等待15秒，Metro应该显示：**

#### ✅ 理想情况：
```
[FP] Frame #1 | plugin data: {iso: 100, exposureDuration: 0.008, aperture: 1.8} | metadata keys: [...]
[FP] ✓ Frame #1 | ISO:100 Shutter:0.008 Aperture:1.8 EV:12.3
[FP] Frame #30 | plugin data: {...} | metadata keys: [...]
```
→ **完美！曝光数据获取成功**
→ **UI应该显示 `EV 12.3 ✓ Frames: 30`**

#### ⚠️ 有帧但无数据：
```
[FP] Frame #1 | plugin data: null | metadata keys: []
[FP] Frame #15 | NO EXPOSURE DATA | plugin: false | meta keys: []
[FP] Frame #30 | plugin data: null | metadata keys: []
```
→ **Frame Processor在运行，但获取不到数据**
→ **跳到Step 3检查native日志**

#### ❌ 完全没有 `[FP]` 日志：
→ **Frame Processor根本没有被调用！这是最常见的问题**

**原因分析：**

1. **`video={true}` 没有生效**（最可能 90%）
   - 原因：React Native的配置变更需要重新编译native代码
   - 解决：**必须重新编译（方法C）**

2. **frameProcessor创建失败**（可能性 8%）
   - 检查：看Step 1的 `frameProcessor: false`
   - 解决：检查ExposureMonitor.js语法

3. **Camera isActive为false**（可能性 2%）
   - 检查：看Step 1的 `[ShotModeModal] Modal opened`
   - 解决：检查权限和device

---

### Step 3: 检查Native日志（需要USB连接）

**如果Step 2有 `[FP]` 日志但显示 NO EXPOSURE DATA：**

```powershell
# 连接USB后运行：
adb logcat -s ExposurePlugin:D VisionCamera:D -v time
```

#### ✅ 成功情况：
```
12-10 10:53:00.123 D/ExposurePlugin: Processing frame #1, imageInfo class: Camera2CameraCaptureResultImageInfo
12-10 10:53:00.156 D/ExposurePlugin: Frame #1: ✓ iso=100 exposureNs=8333333 aperture=1.8
12-10 10:53:01.123 D/ExposurePlugin: Frame #30: ✓ iso=200 exposureNs=4166666 aperture=1.8
```
→ **Native plugin工作正常**
→ **问题在JS层，检查数据传递**

#### ⚠️ 有日志但CaptureResult为空：
```
12-10 10:53:00.123 D/ExposurePlugin: Processing frame #1, imageInfo class: SomeOtherClass
12-10 10:53:00.156 W/ExposurePlugin: Frame #10: CaptureResult empty; imageInfo=..., available methods: [getTimestamp, getRotation, ...]
```
→ **CaptureResult反射失败**
→ **复制完整的 `available methods` 列表**
→ **需要针对这个ROM适配反射方法**

#### ❌ 完全没有ExposurePlugin日志：
→ **Plugin没有被调用**
→ **说明Frame Processor没有工作**
→ **返回Step 2，必须重新编译**

---

## 🎯 根据你的截图诊断

**截图显示：**
- UI: "Waiting for exposure..." + "Check console for FP logs"
- 右上角: 诊断信息提示

**这说明：**
1. ✅ 新UI代码已生效（诊断UI显示出来了）
2. ❌ 但没有获取到曝光数据（没有帧数递增）

**最可能的原因（95%）：**
- Frame Processor没有被调用
- `video={true}` 添加了但没有重新编译native代码

**验证方法：**
1. 查看Metro日志中是否有 **任何** `[FP]` 开头的日志
2. 如果有 → 跳到Step 3
3. 如果没有 → **必须重新编译**

---

## 🚀 推荐操作流程

**如果你暂时不能USB连接：**

### 流程A: 先尝试完全重启（5分钟）

```powershell
# 1. Ctrl+C 停止Metro

# 2. 清理
cd "d:\Program Files\FilmGalery\mobile"
Remove-Item -Recurse -Force node_modules\.cache, .expo -ErrorAction SilentlyContinue

# 3. 重启
npx expo start --dev-client --clear

# 4. 手机上完全关闭应用并重新打开

# 5. 打开相机，立即查看Metro日志
```

**查看Metro，找：**
- `[ShotModeModal] Version: 2025-12-10-v2` ← **必须有**
- `[FP] Frame #1` ← **等15秒看有没有**

**结果判断：**
- ✅ 两个都有 → 问题解决或需要看详细日志
- ❌ 有Version但没有FP → **必须重新编译**
- ❌ 连Version都没有 → 继续流程B

### 流程B: 完全重启还是不行，重新编译（15分钟）

```powershell
cd "d:\Program Files\FilmGalery\mobile"

# 清理
Remove-Item -Recurse -Force android\.gradle, android\app\build, node_modules\.cache, .expo -ErrorAction SilentlyContinue

# 重新编译（会自动安装到设备）
npx expo run:android --variant debug

# 编译成功后，应用会自动启动
# 打开相机界面，查看Metro日志
```

**这次一定要看到：**
```
[ShotModeModal] Version: 2025-12-10-v2
[Camera] Initialized successfully
[FP] Frame #1 | ...
```

**如果还是没有 `[FP]` 日志 → 问题很严重，需要完整日志分析**

---

## 📋 日志收集模板

**如果问题还存在，请收集以下信息：**

### Metro日志（应用启动到打开相机15秒）
```
[在这里粘贴所有包含以下关键字的日志行]
- ExposureMonitor
- useExposureMonitor  
- ShotModeModal
- Camera
- FP
```

### 设备信息
- 手机型号：
- Android版本：
- 是否使用了开发者模式：是/否

### 操作步骤
- [ ] 已尝试 热重载（Reload）
- [ ] 已尝试 完全重启（方法B）
- [ ] 已尝试 重新编译（方法C）
- [ ] 看到 `Version: 2025-12-10-v2`：是/否
- [ ] 看到 `[Camera] Initialized`：是/否
- [ ] 看到任何 `[FP]` 日志：是/否

---

## 💡 终极诊断口诀

**记住这个顺序：**

1. **Version标签** → 确认代码已更新
2. **Plugin initialized** → 确认native plugin OK
3. **Camera Initialized** → 确认相机OK
4. **[FP] Frame #X** → 确认Frame Processor OK
5. **[FP] ✓ Frame #X | ISO:..** → 确认数据OK

**任何一步失败，都要先解决那一步！**

**90%的情况是：看到1和2但没有4 → 需要重新编译**
