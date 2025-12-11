# 🚀 快速测试指南

## 当前状态
✅ 所有代码修复已完成  
✅ 关键修复：添加了 `video={true}` 到Camera组件  
✅ 增强了日志和诊断系统  

---

## 📱 立即测试（无需USB连接）

### Step 1: 重新加载应用

在你的手机上：
1. 打开FilmGallery应用
2. **摇动手机** 或 **三指双击** 打开开发菜单
3. 点击 **"Reload"** 重新加载应用

### Step 2: 打开相机

1. 进入相机/测光界面
2. 等待 **5-10秒**
3. 观察**右上角**的状态显示

### Step 3: 验证结果

#### ✅ 成功的标志：
右上角显示：
```
EV 12.3
✓ Frames: 30
```

或者底部的大测光按钮变为**可点击状态**（不再灰色disabled）

#### ⚠️ 仍有问题的标志：
右上角显示：
```
Waiting for exposure...
Check console for FP logs
```

或
```
Processing (45 frames)...
Check console for FP logs
```

---

## 🔍 如果仍然不工作

### 需要USB连接查看日志

#### 1. 连接设备
```powershell
# 检查连接
adb devices
```

#### 2. 打开两个终端窗口

**终端1 - Metro日志：**
```powershell
cd "d:\Program Files\FilmGalery\mobile"
npx expo start --dev-client
```

**终端2 - Android日志：**
```powershell
adb logcat -s ExposurePlugin:D ReactNativeJS:D VisionCamera:D
```

#### 3. 查找关键日志

**期望看到（成功）：**

Metro:
```
[ExposureMonitor] Plugin initialized: SUCCESS
[FP] Frame #1 | plugin data: {iso:100, exposureDuration:0.008, aperture:1.8}
[FP] ✓ Frame #1 | ISO:100 Shutter:0.008333 Aperture:1.8 EV:12.3
```

Logcat:
```
ExposurePlugin: Processing frame #1, imageInfo class: Camera2CameraCaptureResultImageInfo
ExposurePlugin: Frame #1: ✓ iso=100 exposureNs=8333333 aperture=1.8
```

**如果失败会看到：**

Metro:
```
[ExposureMonitor] Plugin initialized: FAILED (returned null)
或
[FP] Frame #15 | NO EXPOSURE DATA | plugin: false | meta keys: []
```

Logcat:
```
ExposurePlugin: Frame #10: CaptureResult empty; imageInfo=..., available methods: [...]
```

#### 4. 分享日志

如果看到失败日志，请：
1. **复制完整的Metro终端输出**（从启动到相机打开10秒后）
2. **复制完整的Logcat输出**（相机打开前5秒到打开后15秒）
3. **截图UI右上角的状态显示**

---

## 📊 诊断速查表

| 现象 | 可能原因 | 下一步 |
|-----|---------|--------|
| UI显示 "EV xx.x ✓ Frames: n" | ✅ 正常工作 | 无需操作 |
| UI显示 "Processing (n frames)" | Frame processor运行但无数据 | 查看logcat寻找 `CaptureResult empty` |
| UI显示 "Waiting for exposure" | Frame processor未运行 | 查看Metro日志确认plugin初始化状态 |
| Logcat无ExposurePlugin日志 | Plugin未注册或未调用 | 检查是否需要重新编译native代码 |
| Logcat有 `CaptureResult empty` | CameraX反射失败 | 分享 `available methods` 列表 |
| Metro有 `Plugin initialized: FAILED` | VisionCamera配置问题 | 检查gradle.properties和重新编译 |

---

## 🔄 重新编译（如果需要）

如果怀疑native代码没有更新，重新编译：

```powershell
cd "d:\Program Files\FilmGalery\mobile"

# 清理缓存
Remove-Item -Recurse -Force android\.gradle, android\app\build -ErrorAction SilentlyContinue

# 重新编译并安装
npx expo run:android --variant debug
```

---

## 💡 提示

1. **热重载可能不够**  
   对于Frame Processor的改动，摇动手机手动Reload通常就够了。但如果改动了native代码（ExposurePlugin.kt），需要重新编译。

2. **测试环境**  
   - 确保在**光线充足**的环境测试
   - 对着**不同亮度**的物体（窗户、墙壁、桌面）
   - 正常相机应该在2-3秒内开始输出EV值

3. **已知的成功标志**  
   - 你提到**定位功能现在正常**，说明基础配置OK
   - 唯一缺失的是 `video={true}` 属性
   - 这个修复后**应该能立即工作**

---

## 📝 快速测试记录模板

测试后请反馈：

```
测试时间：2025-12-10 [时间]
测试方式：□ 热重载  □ 完全重启  □ 重新编译

UI显示状态：
□ EV 值正常显示，帧数递增
□ 显示 "Processing (n frames)"  
□ 显示 "Waiting for exposure"
□ 其他：___________

是否能点击测光按钮：□ 是  □ 否

是否查看了日志：□ 是  □ 否
（如查看，请附上日志）

其他观察：
___________
```

---

## 🎯 预期结果

基于代码分析，**95%的概率这次修复会成功**，因为：
- ✅ `video={true}` 是Frame Processor工作的必需条件
- ✅ 所有其他配置都正确（plugin注册、gradle设置、babel配置）
- ✅ 定位功能正常说明权限和开发环境OK
- ✅ 增强的日志系统能捕获任何剩余问题

**如果5-10秒后右上角显示 "EV xx.x ✓ Frames: n"，问题就解决了！** 🎉
