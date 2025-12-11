# 测光功能重构计划 (Refactoring Plan)

## 1. 核心目标
构建一个**完全依赖相机传感器 (TTL)**、**实时响应**、**逻辑正确**的专业测光系统。彻底移除光线传感器 (Light Sensor) 依赖，修复 EV 计算公式，并实现真正的 Av/Tv 联动模式。

## 2. 问题分析
1.  **EV 计算错误**：当前逻辑中，对着亮处 EV 值反而减小。这是因为公式符号或逻辑反了。正确逻辑：亮处 -> 相机收光圈/加快快门 -> EV 值应增大。
2.  **依赖错误**：混合了光线传感器数据，导致缩放和点测光（改变构图）时，测光结果不随画面改变。
3.  **交互滞后**：UI 锁定逻辑导致数据不实时跳动。

## 3. 重构步骤

### 阶段一：数据源纯化 (Data Source Purification)
- [ ] **移除光线传感器**：在 `ShotModeModal.js` 中彻底删除 `useExposurePolling` 及其相关逻辑。
- [ ] **强化 Frame Processor**：在 `ExposureMonitor.js` 中，确保只输出相机 Metadata (ISO, Shutter, Aperture)。如果 Native Plugin 不可用，仅依赖 Metadata。
- [ ] **移除混合计算**：删除 `getEffectiveExposure` 中的混合逻辑，直接使用相机数据。

### 阶段二：物理引擎修正 (Physics Engine Correction)
- [ ] **修正 EV 公式**：
    $$ EV_{scene} = \log_2(\frac{N^2}{t}) - \log_2(\frac{ISO}{100}) $$
    *验证：场景变亮 -> 相机自动调整为 ISO 100, 1/1000s (t=0.001) -> N^2/t 变大 -> EV 变大。*
- [ ] **实现 `useExposureCalculator` Hook**：封装上述逻辑，输入 ISO/S/A，输出实时 EV。

### 阶段三：模式逻辑重写 (Mode Logic Rewrite)
- [ ] **移除 Manual 模式**：仅保留 Av (光圈优先), Tv (快门优先), P&S (程序自动)。
- [ ] **实现 Av 模式联动**：
    - 用户选定光圈 (Aperture)。
    - 监听实时 EV 变化。
    - 实时计算：$t = \frac{N^2}{2^{EV}}$。
    - 自动更新显示的快门速度。
- [ ] **实现 Tv 模式联动**：
    - 用户选定快门 (Shutter)。
    - 监听实时 EV 变化。
    - 实时计算：$N = \sqrt{t \cdot 2^{EV}}$。
    - 自动更新显示的光圈值。

### 阶段四：点测光与缩放 (Spot & Zoom)
- [ ] **利用原生 AE**：VisionCamera 的 `focus({ x, y })` 会触发手机原本的 AE 测光点变更。
- [ ] **验证联动**：
    - 缩放 -> 画面构图改变 -> 相机自动调整 ISO/S -> Metadata 变化 -> EV 变化。
    - 点击 -> 对焦点改变 -> 相机对该点测光 -> Metadata 变化 -> EV 变化。
    - *无需手动计算像素亮度，直接利用相机硬件的自动测光结果。*

## 4. 执行计划
1.  修改 `ExposureMonitor.js`：简化输出，确保数据流纯净。
2.  创建 `useExposureLogic.js`：包含核心数学公式和模式联动逻辑。
3.  重构 `ShotModeModal.js`：接入新逻辑，移除旧代码。

**app.json 配置：**
```json
{
  "expo": {
    "plugins": [
      [
        "react-native-vision-camera",
        {
          "cameraPermissionText": "$(PRODUCT_NAME) needs access to your Camera for light metering.",
          "enableMicrophonePermission": false
        }
      ]
    ]
  }
}
```

#### 阶段 2：核心功能迁移 (2-3天)

**2.1 基础相机视图**
```jsx
import { Camera, useCameraDevice, useCameraFormat } from 'react-native-vision-camera';

// 替换 CameraView
const device = useCameraDevice('back');
const format = useCameraFormat(device, [
  { fps: 30 },
  { photoAspectRatio: 4/3 }
]);

<Camera
  ref={cameraRef}
  device={device}
  format={format}
  isActive={true}
  photo={true}
  enableZoomGesture={true}
/>
```

**2.2 实时曝光参数读取**
```jsx
import { useFrameProcessor } from 'react-native-vision-camera';
import { useSharedValue } from 'react-native-reanimated';

// 创建实时曝光参数读取插件
const currentISO = useSharedValue(100);
const currentShutter = useSharedValue(1/125);
const currentAperture = useSharedValue(1.8);

const frameProcessor = useFrameProcessor((frame) => {
  'worklet';
  
  // 读取实时曝光参数
  const metadata = frame.metadata;
  if (metadata) {
    currentISO.value = metadata.iso || 100;
    currentShutter.value = metadata.exposureTime || 1/125;
    currentAperture.value = metadata.aperture || 1.8;
  }
}, []);

<Camera
  {...otherProps}
  frameProcessor={frameProcessor}
/>
```

**2.3 点测光实现**
```jsx
// Vision Camera 支持真正的点测光
const [focusPoint, setFocusPoint] = useState(null);

const handleTapToFocus = async (event) => {
  const { locationX, locationY } = event.nativeEvent;
  const point = {
    x: locationX / width,
    y: locationY / cameraHeight
  };
  
  setFocusPoint(point);
  
  // Vision Camera 原生支持点测光
  await cameraRef.current?.focus(point);
  
  // 可选：显示即时反馈
  setSpotInfo({ 
    active: true, 
    message: '点测光已应用'
  });
};
```

**2.4 手动曝光控制（高级功能）**
```jsx
// Vision Camera 支持手动设置 ISO 和快门
const setManualExposure = async (iso, shutterSpeed) => {
  await cameraRef.current?.setExposure({
    iso: iso,
    shutterSpeed: shutterSpeed
  });
};
```

#### 阶段 3：优化与增强 (1-2天)

**3.1 实时 EV 计算**
```jsx
import { runOnJS } from 'react-native-reanimated';

const frameProcessor = useFrameProcessor((frame) => {
  'worklet';
  
  const metadata = frame.metadata;
  if (metadata && metadata.iso && metadata.exposureTime && metadata.aperture) {
    const iso = metadata.iso;
    const shutter = metadata.exposureTime;
    const aperture = metadata.aperture;
    
    // 实时计算 EV
    const ev100 = Math.log2((aperture * aperture) / shutter) - Math.log2(iso / 100);
    const targetEV = ev100 + Math.log2(filmIso / 100);
    
    // 更新 UI
    runOnJS(updateEV)(targetEV);
  }
}, [filmIso]);

const updateEV = (ev) => {
  setCurrentEV(ev);
  // 实时更新配对建议
  const pairs = generateValidPairs(ev);
  setValidPairs(pairs);
};
```

**3.2 点测光验证**
```jsx
const verifySpotMetering = (metadata) => {
  // Vision Camera 提供真实的测光模式信息
  if (metadata.meteringMode === 'spot') {
    return { active: true, verified: true };
  }
  return { active: false, verified: false };
};
```

#### 阶段 4：测试与回退 (1天)

**测试清单：**
- [ ] 基础相机预览
- [ ] 变焦功能
- [ ] 点测光准确性
- [ ] 实时 EV 显示
- [ ] 拍照与 EXIF 读取
- [ ] 性能测试（帧率、内存）
- [ ] 多设备兼容性

**回退方案：**
```jsx
// 使用 feature flag 支持回退
const USE_VISION_CAMERA = false; // 可通过配置切换

{USE_VISION_CAMERA ? (
  <VisionCameraView {...props} />
) : (
  <ExpoCameraView {...props} />
)}
```

---

### 📁 文件结构调整

```
mobile/src/components/
├── ShotModeModal.js (入口，切换不同实现)
├── ShotModeModal.expo.js (保留 expo-camera 实现)
├── ShotModeModal.vision.js (新增 vision-camera 实现)
└── camera/
    ├── VisionCameraView.js
    ├── ExposureMonitor.js (Frame Processor)
    └── SpotMeteringHandler.js
```

---

### ⚠️ 风险与挑战

1. **Expo 兼容性**
   - 需要 Expo Dev Client（不能用 Expo Go）
   - 构建时间增加

2. **原生依赖**
   - iOS 需要配置 Podfile
   - Android 需要配置 Gradle
   - 首次构建复杂

3. **学习成本**
   - Frame Processor 基于 Worklets（类似 Reanimated）
   - 需要理解原生模块调试

4. **性能优化**
   - Frame Processor 每秒调用 30 次
   - 需要优化避免 UI 卡顿

---

### 💰 成本估算

| 阶段 | 时间 | 风险 |
|------|------|------|
| 环境准备 | 1-2天 | 中 |
| 核心迁移 | 2-3天 | 高 |
| 优化增强 | 1-2天 | 中 |
| 测试回退 | 1天 | 低 |
| **总计** | **5-8天** | **中高** |

---

### 🚀 建议实施路径

#### 方案 A：激进迁移（推荐）
1. 直接迁移到 Vision Camera
2. 享受实时曝光参数和真实点测光
3. 适合长期维护

#### 方案 B：渐进式（稳妥）
1. 保留 expo-camera 作为默认
2. Vision Camera 作为"专业模式"
3. 用户可选择切换
4. 降低迁移风险

#### 方案 C：混合方案（当前优化）
1. 继续使用 expo-camera
2. 改进点测光反馈逻辑（假定生效）
3. 添加"实验性功能"标签
4. 延后 Vision Camera 迁移

---

### 📋 立即可做的改进（无需迁移）

```jsx
// 优化当前 expo-camera 实现
const handleMeasure = async () => {
  // ...existing code...
  
  // 改为乐观策略
  let spotActive = true; // 假定现代设备都支持
  if (meteringMode === 'spot' && exposurePoint) {
    // 仅记录日志，不影响用户体验
    console.log('Spot metering applied at:', exposurePoint);
  }
  
  // 显示友好提示
  if (meteringMode === 'spot') {
    setSpotInfo({ 
      active: true, 
      message: '点测光已应用'
    });
    setTimeout(() => setSpotInfo(null), 2000);
  }
};
```

---

### 🎬 下一步行动

**请选择：**
1. **立即优化当前方案**（1小时，低风险）
2. **启动 Vision Camera 迁移**（5-8天，高收益）
3. **混合方案**（2-3天，平衡）

我建议先做**当前方案优化**，然后规划 Vision Camera 迁移作为 v2.0 重要特性。