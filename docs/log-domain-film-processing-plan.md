# 对数域胶片处理统一方案

**日期**: 2026-01-24 (更新)  
**状态**: 深度分析 + 实现规划  
**目标**: 整理对数域减法与乘法增益的关系，分析现有功能的物理意义，提出统一优化方案

---

## 0. 新问题：AutoLevels 的顺序依赖问题

### 0.1 问题描述

用户报告：
1. **先 AutoLevels 再反转** 和 **先反转再 AutoLevels** 的结果不一样
2. 理想情况应该是在去色罩时进入对数空间进行 AutoLevels

### 0.2 问题根因分析

#### 当前 AutoLevels 实现

```javascript
// FilmLab.jsx - handleAutoLevels
const handleAutoLevels = () => {
  // 使用当前直方图（处理后的直方图）找 min/max
  const rLevels = findLevels(histograms.red);
  const gLevels = findLevels(histograms.green);
  const bLevels = findLevels(histograms.blue);
  
  // 设置曲线
  setCurves(prev => ({
    ...prev,
    red: [{x: rLevels.min, y: 0}, {x: rLevels.max, y: 255}],
    green: [{x: gLevels.min, y: 0}, {x: gLevels.max, y: 255}],
    blue: [{x: bLevels.min, y: 0}, {x: bLevels.max, y: 255}]
  }));
};
```

#### 当前 Pipeline 顺序

```
① Film Curve (Pre-Inversion)
② Base Correction (Pre-Inversion)
③ Inversion
④ 3D LUT
⑤ White Balance
⑥ Tone Mapping (Exposure, Contrast...)
⑦ Curves ← AutoLevels 在这里生效
⑧ HSL
⑨ Split Toning
```

#### 问题 1：直方图基于处理后图像

直方图是在整个 pipeline 处理后计算的：

```javascript
// processImage() 中
const [rC, gC, bC] = core.processPixel(r, g, b);
// 计算直方图
histR[Math.round(rC)]++;
```

这意味着 AutoLevels 分析的是**已处理的图像**，而非原始图像。

#### 问题 2：Curves 作用于 Pipeline 后期

Curves 在 Tone Mapping 之后应用（步骤 ⑦），所以 AutoLevels 设置的曲线会对已经经过前面所有处理的图像生效。

#### 问题 3：顺序依赖的数学解释

假设原始像素值为 $x$：

**场景 A：先 AutoLevels 再反转**
```
1. 用户看到原始图像的直方图 H_original
2. AutoLevels 计算 min_A, max_A 基于 H_original
3. 设置曲线 C_A
4. 用户启用反转
5. 最终结果: Invert(C_A(x))
```

**场景 B：先反转再 AutoLevels**
```
1. 用户启用反转
2. 用户看到反转后图像的直方图 H_inverted
3. AutoLevels 计算 min_B, max_B 基于 H_inverted
4. 设置曲线 C_B
5. 最终结果: C_B(Invert(x))
```

由于 $H_{original} \neq H_{inverted}$，所以 $C_A \neq C_B$，最终结果自然不同。

**核心问题：AutoLevels 基于当前可见状态计算，而非"期望的最终状态"。**

---

## 0.3 理想的 AutoLevels 行为分析

### 用户期望

用户可能期望以下两种行为之一：

#### 期望 A：基于最终输出的自动色阶

"不管我先做什么操作，AutoLevels 应该让最终输出拉满 0-255"

这正是**当前实现的行为**！因为：
- 直方图基于处理后的图像
- Curves 作用于 Pipeline 后期

**结论**：如果用户先反转再 AutoLevels，结果就是正确的。

#### 期望 B：基于"正片化后"的自动色阶

"我希望 AutoLevels 只作用于正片化后的结果，不受后续调整影响"

这需要**在密度域/反转后立即进行 AutoLevels**，而非使用 Curves。

### 0.4 为什么"先 AutoLevels 再反转"会失败

假设原始负片图像（未反转）直方图是 [50, 200]（暗部在 50，亮部在 200）：

1. **AutoLevels 计算**：min=50, max=200
2. **设置曲线**：`{x:50, y:0}, {x:200, y:255}` → 将 [50, 200] 拉到 [0, 255]
3. **用户启用反转**
4. **问题**：现在原本在 50 的暗部变成了 205 (255-50)，但曲线还是基于未反转的分布

**结论**：AutoLevels 的曲线是为"当时的图像状态"计算的，改变反转状态后曲线就不适用了。

---

## 0.5 解决方案分析

### 方案 1：在反转前（密度域）进行 AutoLevels

**思路**：在 Pipeline 早期阶段（反转之前）进行电平校正

**实现**：
- 新增 `preLevels` 参数（在反转前应用的电平校正）
- 或者在 Base Correction 阶段集成 AutoLevels

**优点**：
- 物理意义更正确（在密度域操作）
- 反转前后结果一致

**缺点**：
- 需要重新设计 Pipeline
- 需要新增参数和 UI
- 对现有预设的兼容性问题

### 方案 2：基于原始图像的 AutoLevels + 反转状态感知

**思路**：AutoLevels 采样原始图像，并考虑用户的反转意图

**实现**：
```javascript
const handleAutoLevels = () => {
  // 采样原始图像
  const originalHistograms = computeHistogramsFromOriginal();
  
  // 如果用户意图反转，预测反转后的直方图
  if (inverted) {
    // 简单反转：255 - x
    invertHistogram(originalHistograms);
  }
  
  const levels = findLevels(invertedOrOriginalHistograms);
  // ...
};
```

**优点**：
- 相对简单
- 无需改变 Pipeline

**缺点**：
- 不考虑其他处理步骤（Base Correction、Film Curve 等）
- 仍然是近似值

### 方案 3：保持现状 + 用户教育

**思路**：当前行为是合理的，只需教育用户"正确的工作流程"

**正确工作流程**：
1. 启用反转（如果需要）
2. 设置 Base Correction
3. **然后**使用 AutoLevels

**实现**：
- 在 UI 中添加提示："AutoLevels 基于当前可见的图像计算"
- 或者在 AutoLevels 按钮旁添加小提示

**优点**：
- 无需代码改动
- 现有行为实际上是正确的

**缺点**：
- 用户可能仍然困惑

### 方案 4：在对数域进行 Pre-Inversion AutoLevels（推荐深入实现）

这是用户提到的"理想情况"，让我们详细分析。

**原理**：

在负片处理中，真正的"图像信息"存在于密度域。对负片进行自动色阶，最合理的方式是：

```
① 将扫描值转换到密度域: D = -log10(T)
② 在密度域找 D_min, D_max
③ 进行密度域的色阶拉伸: D' = (D - D_min) / (D_max - D_min) × D_range
④ 转回透射率域
⑤ 进行反转
```

这与 Base Correction 可以合并：

```
Pre-Inversion 阶段（密度域）:
① D = -log10(T)
② D_base_corrected = D - D_base  (去色罩)
③ D_levels_corrected = normalize(D_base_corrected, D_min, D_max)  (自动色阶)
④ T' = 10^(-D_levels_corrected)
```

**实现复杂度**：高

需要新增：
- `preAutoLevels` 或 `densityLevels` 参数
- 在密度域计算直方图的功能
- 密度域的色阶拉伸函数
- WebGL/GPU 着色器更新

---

## 0.6 推荐方案

考虑到成本效益，推荐**分阶段实施**：

### 阶段 1：用户教育 + 小改进（立即）

1. **文档说明**：AutoLevels 基于当前可见图像计算
2. **UI 提示**：在 AutoLevels 按钮添加 tooltip
3. **可选**：添加"Reset Curves"按钮，让用户在改变反转状态后可以快速重置

### 阶段 2：反转状态感知的 AutoLevels（短期）

修改 `handleAutoLevels`：

```javascript
const handleAutoLevels = () => {
  // 如果用户已经启用了反转，正常工作
  // 如果用户没有启用反转但在编辑负片，弹出提示
  if (!inverted && sourceType === 'original') {
    // 可能是负片
    const shouldProceed = window.confirm(
      'AutoLevels 将基于当前（未反转）的图像计算。\n' +
      '如果您打算反转这张负片，建议先启用反转，再使用 AutoLevels。\n\n' +
      '是否继续？'
    );
    if (!shouldProceed) return;
  }
  // 正常执行...
};
```

### 阶段 3：密度域 Pre-AutoLevels（长期）

作为高级功能实现"密度域自动色阶"：

1. 新增 `densityAutoLevels` 参数
2. 在 RenderCore 中实现密度域处理
3. 与 Base Correction 集成

---

## 0.7 Log 域处理模块化设计（重要）

### 0.7.1 当前问题：一键集成 vs 用户自主性

**当前实现**：

点击 `AUTO DETECT`（Auto Base）会一键完成：
```
1. 采样最亮像素（Top 5%）
2. 计算片基颜色
3. 根据 baseMode 设置参数：
   - 线性模式：设置 baseRed/Green/Blue（增益）
   - 对数模式：设置 baseDensityR/G/B（密度值）
4. 自动返回
```

**问题**：
- 用户无法控制中间过程
- 无法看到"进入 Log 域"后的中间状态
- 无法在 Log 域进行更多操作（如 AutoLevel、手动调整）
- 一切都是黑盒

### 0.7.2 新设计目标

**目标**：增加用户对 Log 域处理的自主控制权

**核心思想**：将"一键操作"拆分为可见的、可控的步骤

```
旧流程（一键）:
  [AUTO DETECT] → 自动完成所有 → 回到线性域

新流程（模块化）:
  [ENTER LOG MODE] → 进入对数/密度域工作模式
      ↓
  用户可以看到密度域图像
      ↓
  [AUTO BASE] → 检测并应用片基校正
  [AUTO LEVELS] → 在密度域进行自动色阶
  [手动调整] → 微调密度参数
      ↓
  [EXIT LOG MODE] 或自动 → 回到线性域继续处理
```

### 0.7.3 设计方案：Log 处理模式

#### 概念：引入 "Log Processing Mode"

不改变现有 Pipeline 架构，而是引入一个"Log 处理模式"概念：

```javascript
// 新增状态
const [logProcessingMode, setLogProcessingMode] = useState(false);
const [densityLevelsEnabled, setDensityLevelsEnabled] = useState(false);
const [densityLevels, setDensityLevels] = useState({
  red: { min: 0, max: 3.0 },
  green: { min: 0, max: 3.0 },
  blue: { min: 0, max: 3.0 },
  outputMin: 0,
  outputMax: 3.0
});
```

#### Pipeline 调整

```
当 logProcessingMode = true 时的 Pipeline：

① Film Curve (Pre-Inversion)
② [新增] 进入密度域: D = -log10(T)
③ Base Correction (密度域减法): D' = D - D_base
④ [新增] Density Levels (密度域色阶): D'' = normalize(D', D_min, D_max)
⑤ [新增] 返回透射率域: T' = 10^(-D'')
⑥ Inversion
⑦ 3D LUT
⑧ White Balance
... (后续不变)
```

### 0.7.4 UI 设计

#### 方案 A：扩展现有 FILM BASE 区域

```
┌─────────────────────────────────────────────────────────────┐
│ FILM BASE                                                   │
├─────────────────────────────────────────────────────────────┤
│ Mode: [Linear ▼] [Log ▼]                                    │
│                                                             │
│ ┌─────────────────────────────────────────────────────────┐ │
│ │ STEP 1: Detect Base                                     │ │
│ │ [PICK (MANUAL)]  [AUTO DETECT]                          │ │
│ │                                                          │ │
│ │ Base Colors: R:0.85 G:0.62 B:0.45                       │ │
│ │ (Density:    R:0.07 G:0.21 B:0.35)                      │ │
│ └─────────────────────────────────────────────────────────┘ │
│                                                             │
│ ┌─────────────────────────────────────────────────────────┐ │
│ │ STEP 2: Density Levels (仅 Log 模式)                    │ │
│ │ ☐ Enable                                                 │ │
│ │                                                          │ │
│ │ R: [0.10 ▼] ──────────── [2.85 ▼]                       │ │
│ │ G: [0.08 ▼] ──────────── [2.90 ▼]                       │ │
│ │ B: [0.15 ▼] ──────────── [2.75 ▼]                       │ │
│ │                                                          │ │
│ │ [AUTO LEVELS]  [RESET]                                   │ │
│ └─────────────────────────────────────────────────────────┘ │
│                                                             │
│ ☑ Preview Density Domain (显示密度域图像)                   │
└─────────────────────────────────────────────────────────────┘
```

#### 方案 B：高级面板（折叠式）

```
┌─────────────────────────────────────────────────────────────┐
│ FILM BASE                                                   │
│ [Linear ▼] [Log ▼]                                          │
│ [PICK]  [AUTO DETECT]                                       │
├─────────────────────────────────────────────────────────────┤
│ ▶ Advanced: Density Levels                                  │ ← 点击展开
└─────────────────────────────────────────────────────────────┘

展开后：
┌─────────────────────────────────────────────────────────────┐
│ ▼ Advanced: Density Levels                                  │
├─────────────────────────────────────────────────────────────┤
│ ☑ Enable Density Levels                                     │
│                                                             │
│ Input Range (from image):                                   │
│   R: 0.10 ── 2.85   [ANALYZE]                              │
│   G: 0.08 ── 2.90                                          │
│   B: 0.15 ── 2.75                                          │
│                                                             │
│ Output Range:                                               │
│   Min: [0.00]  Max: [3.00]                                 │
│                                                             │
│ [AUTO]  [RESET]                                             │
└─────────────────────────────────────────────────────────────┘
```

### 0.7.5 实现策略

#### 策略：渐进式实现

**Phase 1：UI 骨架 + 参数存储**

1. 在 FilmLabControls.jsx 添加 Density Levels UI 区域
2. 在 FilmLab.jsx 添加新状态：
   - `densityLevelsEnabled: boolean`
   - `densityLevels: { red: {min, max}, green: {min, max}, blue: {min, max} }`
3. 参数持久化到 photos.js API

**Phase 2：密度域直方图计算**

```javascript
// 新增函数：计算密度域直方图
const computeDensityHistogram = (imageData) => {
  const histR = new Array(300).fill(0); // 0.00 - 3.00，精度 0.01
  const histG = new Array(300).fill(0);
  const histB = new Array(300).fill(0);
  
  for (let i = 0; i < imageData.data.length; i += 4) {
    const r = imageData.data[i] / 255;
    const g = imageData.data[i + 1] / 255;
    const b = imageData.data[i + 2] / 255;
    
    // 转换到密度域
    const Dr = -Math.log10(Math.max(r, 0.001));
    const Dg = -Math.log10(Math.max(g, 0.001));
    const Db = -Math.log10(Math.max(b, 0.001));
    
    // 应用片基校正（如果已设置）
    const DrCorrected = Dr - baseDensityR;
    const DgCorrected = Dg - baseDensityG;
    const DbCorrected = Db - baseDensityB;
    
    // 量化到直方图 bin
    const binR = Math.max(0, Math.min(299, Math.round(DrCorrected * 100)));
    const binG = Math.max(0, Math.min(299, Math.round(DgCorrected * 100)));
    const binB = Math.max(0, Math.min(299, Math.round(DbCorrected * 100)));
    
    histR[binR]++;
    histG[binG]++;
    histB[binB]++;
  }
  
  return { red: histR, green: histG, blue: histB };
};
```

**Phase 3：密度域 AutoLevels**

```javascript
// 在密度域找 min/max
const handleDensityAutoLevels = () => {
  const densityHist = computeDensityHistogram(rawImageData);
  
  const findDensityLevels = (hist) => {
    const total = hist.reduce((a, b) => a + b, 0);
    const threshold = 0.005; // 0.5%
    
    let cumulative = 0;
    let min = 0, max = 299;
    
    for (let i = 0; i < 300; i++) {
      cumulative += hist[i];
      if (cumulative / total >= threshold) {
        min = i / 100; // 转回密度值
        break;
      }
    }
    
    cumulative = 0;
    for (let i = 299; i >= 0; i--) {
      cumulative += hist[i];
      if (cumulative / total >= threshold) {
        max = i / 100;
        break;
      }
    }
    
    return { min, max };
  };
  
  setDensityLevels({
    red: findDensityLevels(densityHist.red),
    green: findDensityLevels(densityHist.green),
    blue: findDensityLevels(densityHist.blue)
  });
  setDensityLevelsEnabled(true);
};
```

**Phase 4：RenderCore 集成**

在 RenderCore.processPixel 中添加密度域色阶处理：

```javascript
// 在 applyBaseCorrection 之后，applyInversion 之前
if (this.params.densityLevelsEnabled && this.params.baseMode === 'log') {
  [r, g, b] = this.applyDensityLevels(r, g, b);
}

applyDensityLevels(r, g, b) {
  const levels = this.params.densityLevels;
  const outputMin = 0;
  const outputMax = 3.0;
  
  // 转到密度域（已经在 baseCorrection 之后，所以值已经是校正后的）
  const minT = 0.001;
  let Dr = -Math.log10(Math.max(r / 255, minT));
  let Dg = -Math.log10(Math.max(g / 255, minT));
  let Db = -Math.log10(Math.max(b / 255, minT));
  
  // 线性拉伸
  Dr = outputMin + (Dr - levels.red.min) / (levels.red.max - levels.red.min) * (outputMax - outputMin);
  Dg = outputMin + (Dg - levels.green.min) / (levels.green.max - levels.green.min) * (outputMax - outputMin);
  Db = outputMin + (Db - levels.blue.min) / (levels.blue.max - levels.blue.min) * (outputMax - outputMin);
  
  // 转回透射率
  r = Math.pow(10, -Dr) * 255;
  g = Math.pow(10, -Dg) * 255;
  b = Math.pow(10, -Db) * 255;
  
  return [
    Math.max(0, Math.min(255, r)),
    Math.max(0, Math.min(255, g)),
    Math.max(0, Math.min(255, b))
  ];
}
```

**Phase 5：WebGL 着色器更新**

同步更新 FilmLabWebGL.js 和 gpu-renderer.js。

### 0.7.6 用户工作流程示例

**处理彩色负片的完整流程**：

```
1. 导入扫描的负片图像
2. 在 FILM BASE 区域：
   - 选择 "Log" 模式
   - 点击 [AUTO DETECT] 或手动 [PICK] 片基
   - 系统自动计算 Base Density
3. 展开 "Density Levels" 高级选项：
   - 点击 [AUTO] 自动检测密度范围
   - 或手动调整 R/G/B 的 min/max
   - 观察预览效果
4. 启用 Invert（反转）
5. 进行后续调整（WB、Tone、Curves 等）
6. 导出
```

**与现有工作流的兼容性**：

- 如果用户不展开 Density Levels，行为与之前完全一致
- Density Levels 是可选的高级功能
- 线性模式下 Density Levels 不可用（灰置）

### 0.7.7 数据模型更新

```javascript
// 新增参数（保存到数据库/preset）
{
  // 现有参数
  baseMode: 'linear' | 'log',
  baseRed: 1.0,
  baseGreen: 1.0,
  baseBlue: 1.0,
  baseDensityR: 0.0,
  baseDensityG: 0.0,
  baseDensityB: 0.0,
  
  // 新增参数
  densityLevelsEnabled: false,
  densityLevels: {
    red: { min: 0.0, max: 3.0 },
    green: { min: 0.0, max: 3.0 },
    blue: { min: 0.0, max: 3.0 }
  },
  densityOutputRange: { min: 0.0, max: 3.0 }
}
```

### 0.7.8 与现有 AutoLevels 的关系

| 功能 | 作用域 | 作用时机 | 适用场景 |
|------|--------|---------|---------|
| **AutoLevels** (现有) | 线性域 | Pipeline 后期 (Curves) | 正片、通用调整 |
| **Density AutoLevels** (新) | 密度域 | Base Correction 之后 | 负片去色罩时 |

**两者独立，可以同时使用**：
- Density AutoLevels：用于负片的"科学化"前处理
- AutoLevels：用于最终输出的微调

### 0.7.9 实施优先级

```
┌─────────────────────────────────────────────────────────────┐
│ Phase 1: UI + 参数                                          │
│ - 预计工时：4-6 小时                                         │
│ - 内容：UI 骨架、状态管理、参数持久化                         │
│ - 可交付：用户可见但无功能的 UI                              │
└─────────────────────────────────────────────────────────────┘
          ↓
┌─────────────────────────────────────────────────────────────┐
│ Phase 2: 密度域直方图                                        │
│ - 预计工时：2-3 小时                                         │
│ - 内容：computeDensityHistogram 函数                        │
│ - 可交付：[ANALYZE] 按钮可以检测密度范围                     │
└─────────────────────────────────────────────────────────────┘
          ↓
┌─────────────────────────────────────────────────────────────┐
│ Phase 3: RenderCore CPU 实现                                 │
│ - 预计工时：3-4 小时                                         │
│ - 内容：processPixel 中的密度色阶处理                        │
│ - 可交付：基础预览可用                                       │
└─────────────────────────────────────────────────────────────┘
          ↓
┌─────────────────────────────────────────────────────────────┐
│ Phase 4: WebGL + GPU                                         │
│ - 预计工时：4-6 小时                                         │
│ - 内容：着色器更新                                           │
│ - 可交付：实时预览 + GPU 导出                                │
└─────────────────────────────────────────────────────────────┘
          ↓
┌─────────────────────────────────────────────────────────────┐
│ Phase 5: 服务端 + 测试                                       │
│ - 预计工时：2-3 小时                                         │
│ - 内容：API 更新、集成测试                                   │
│ - 可交付：完整功能                                           │
└─────────────────────────────────────────────────────────────┘

总预计工时：15-22 小时
```

---

## 1. 核心问题：乘法增益 vs 对数域减法

### 1.1 数学等价性分析

**结论：在理想情况下，两种方法数学等价，但实现细节有差异。**

#### 乘法增益法（当前实现）

```
T'_ch = T_ch × G_ch
其中 G_ch = 1 / T_base,ch
```

在线性域（透射率空间）进行乘法运算。

#### 对数域减法

根据 Beer-Lambert 定律，密度 $D = -\log_{10}(T)$：

$$T_{scan} = T_{base} \times T_{image}$$

取对数：

$$D_{scan} = D_{base} + D_{image}$$

去色罩：

$$D'_{image} = D_{scan} - D_{base}$$

转回透射率：

$$T'_{image} = 10^{-D'_{image}} = 10^{-(D_{scan} - D_{base})} = \frac{T_{scan}}{T_{base}} = T_{scan} \times G$$

**数学上完全等价！**

### 1.2 为什么对数域"更好"？

虽然数学等价，但对数域有以下优势：

| 维度 | 线性域乘法 | 对数域减法 |
|------|-----------|-----------|
| **精度** | 低透射率区精度损失 | 全域均匀精度 |
| **物理意义** | 操作透射率 | 操作密度（胶片感光的物理量） |
| **溢出处理** | 乘法可能产生 >1 的值需 clamp | 减法自然限制在有效范围 |
| **噪声特性** | 放大低值区噪声 | 噪声影响更均匀 |
| **与 H&D 曲线配合** | 需要额外转换 | 自然衔接 |

### 1.3 实际差异在哪里？

差异出现在**数值精度**和**边界处理**上：

```javascript
// 线性域乘法
function linearGain(T, G) {
  return Math.min(1.0, T * G);  // clamp 导致信息丢失
}

// 对数域减法
function logSubtraction(T_scan, T_base) {
  // 避免 log(0)
  const D_scan = -Math.log10(Math.max(T_scan, 0.001));
  const D_base = -Math.log10(Math.max(T_base, 0.001));
  const D_image = D_scan - D_base;
  // D_image 可能为负（比片基更亮）
  return Math.pow(10, -D_image);
}
```

当 `T_scan > T_base` 时（像素比片基更亮，理论上不应发生）：
- 线性法：结果 >1，被 clamp 为 1
- 对数法：`D_image < 0`，结果 >1，同样需要处理

**实际使用中，两种方法的结果几乎相同**，因为采样的片基通常是图像中最亮的区域。

---

## 2. 现有功能的物理/数学意义分析

### 2.1 Film Curve（H&D 密度曲线）

**位置**: 反转前（Pre-Inversion）  
**物理意义**: 模拟胶片的特性曲线（H&D 曲线）

胶片的感光过程遵循特性曲线：

$$D_{out} = f(D_{in}) = D_{min} + (D_{max} - D_{min}) \times \left(\frac{D - D_{min}}{D_{max} - D_{min}}\right)^\gamma$$

当前实现：
```javascript
// filmLabCurve.js
function applyFilmCurve(value, profile = {}) {
  const { gamma = 0.6, dMin = 0.1, dMax = 3.0 } = profile;
  const normalized = clamp(value / 255, 0.001, 1);
  const density = -Math.log10(normalized);
  const densityNorm = clamp((density - dMin) / (dMax - dMin), 0, 1);
  const gammaApplied = Math.pow(densityNorm, gamma);
  const adjustedDensity = dMin + gammaApplied * (dMax - dMin);
  const outputT = Math.pow(10, -adjustedDensity);
  return clamp(Math.round(outputT * 255), 0, 255);
}
```

**评价**: ✅ 正确实现了 H&D 模型，在密度域操作

### 2.2 Base Correction（片基校正）

**位置**: 反转前（Pre-Inversion）  
**物理意义**: 去除负片片基的橙色色罩

当前实现（线性域乘法）：
```javascript
// RenderCore.js
if (p.baseRed !== 1.0 || p.baseGreen !== 1.0 || p.baseBlue !== 1.0) {
  r *= p.baseRed;
  g *= p.baseGreen;
  b *= p.baseBlue;
  r = this._clamp255(r);
  g = this._clamp255(g);
  b = this._clamp255(b);
}
```

**评价**: ✅ 功能正确，但可以考虑对数域实现以获得更好的精度

### 2.3 Inversion（反转）

**位置**: 片基校正后  
**物理意义**: 将负片转为正片

当前实现有两种模式：

#### Linear 模式
```javascript
function invertLinear(value) {
  return 255 - value;
}
```

**物理意义**: 简单的数值反转，相当于密度域的 $D' = D_{max} - D$

#### Log 模式
```javascript
function invertLog(value) {
  return clamp(Math.round(255 * (1 - Math.log(value + 1) / Math.log(256))), 0, 255);
}
```

**物理意义分析**：

$$out = 255 \times \left(1 - \frac{\ln(in + 1)}{\ln(256)}\right)$$

这个公式是**人造的艺术化处理**，并非物理正确的密度反转。它的作用：

1. 对数压缩：保留更多暗部细节
2. 非线性反转：与线性反转相比，中间调处理不同
3. 结果更"软"：减少高对比度

**问题**：这不是物理意义上的"对数反转"，更像是一种风格化处理。

### 2.4 服务端 Log 反转的 gamma(0.85)

**发现位置**: `bugfix-2025-12-04-gpu-export-wb.md`

```javascript
if (inversionMode === 'log') img = img.negate().gamma(0.85);
```

**物理意义**: 这是服务端使用 Sharp 库时的实现：
- `negate()`: 线性反转
- `gamma(0.85)`: 应用 gamma 校正，压缩高光、展开阴影

**问题**：
1. 这与客户端的 `invertLog` 公式**不一致**！
2. 服务端使用 `negate + gamma`，客户端使用自定义对数公式
3. 导致预览与导出结果可能不同

---

## 3. 当前问题汇总

### 3.1 Log 反转的不一致性

| 路径 | 实现方式 | 公式 |
|------|---------|------|
| CPU 预览 | `invertLog()` | `255 × (1 - ln(x+1)/ln(256))` |
| WebGL 预览 | GLSL 着色器 | `255 × (1 - log(x+1)/log(256))` |
| GPU Export | GLSL 着色器 | 同上 |
| Server Export | Sharp | `negate().gamma(0.85)` ← **不一致！** |

### 3.2 Log 反转的物理意义不明确

当前的"Log 反转"既不是：
- 在对数域进行反转
- 也不是物理意义上的密度反转

它只是一种艺术化的非线性反转，名称容易产生误导。

### 3.3 Film Curve 与 Base Correction 的域混用

- Film Curve: 在密度域操作（正确）
- Base Correction: 在线性域操作（可优化）

如果统一在密度域操作，流水线会更自然。

---

## 4. 推荐方案：对数域统一处理

### 4.1 新的处理流水线

```
┌─────────────────────────────────────────────────────────────────────┐
│                     Pre-Inversion (密度域)                           │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  ① 转换到密度域                                                     │
│     D = -log10(T)         // T = value/255                          │
│                                                                     │
│  ② Film Curve (H&D 模型)                                           │
│     D' = filmCurve(D)     // 已在密度域，直接处理                    │
│                                                                     │
│  ③ Base Correction (密度域减法)  ← 改进！                           │
│     D'' = D' - D_base     // 对数域减法，更精确                      │
│                                                                     │
│  ④ 转回透射率域                                                     │
│     T' = 10^(-D'')                                                  │
│                                                                     │
├─────────────────────────────────────────────────────────────────────┤
│  ⑤ Inversion (反转)                                                 │
│     - Linear: out = 1 - in                                          │
│     - (保留 Log 作为艺术选项，但标注为"Soft"风格)                    │
│                                                                     │
├─────────────────────────────────────────────────────────────────────┤
│                     Post-Inversion (线性域)                          │
├─────────────────────────────────────────────────────────────────────┤
│  ⑥ 3D LUT                                                           │
│  ⑦ White Balance                                                    │
│  ⑧ Tone Mapping (Exposure, Contrast, etc.)                          │
│  ⑨ Curves                                                           │
│  ⑩ HSL                                                              │
│  ⑪ Split Toning                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

### 4.2 是否需要实现？成本效益分析

**当前实现的问题严重性**：

| 问题 | 严重性 | 影响 |
|------|--------|------|
| 乘法 vs 对数域 | 低 | 结果几乎相同，仅边缘情况有差异 |
| Log 反转不一致 | 中 | 服务端导出与预览可能不同 |
| 物理意义不准确 | 低 | 不影响实际使用，只是命名问题 |

**改进的收益**：

| 改进项 | 收益 |
|--------|------|
| 对数域片基校正 | 更精确，但用户难以察觉 |
| 统一 Log 反转实现 | 保证预览与导出一致 |
| 重命名 Log 反转 | 减少用户困惑 |

**建议**：
1. **必须做**：统一服务端和客户端的 Log 反转实现
2. **可选做**：对数域片基校正（作为可选功能或未来版本）
3. **建议做**：将 Log 反转重命名为 "Soft" 或 "Compressed"

---

## 5. 详细实现方案

### 5.1 统一 Log 反转实现（必须）

**目标**：让服务端使用与客户端相同的 Log 反转公式

#### 修改文件：`server/services/filmlab-service.js`

**当前实现**（使用 Sharp）：
```javascript
if (inversionMode === 'log') img = img.negate().gamma(0.85);
```

**问题**：Sharp 没有原生的自定义对数反转，`negate + gamma` 与客户端公式不同。

**方案 A**：在 JS 中实现像素级处理（推荐）

对于需要 Log 反转的情况，跳过 Sharp 的 negate，在后续 JS 循环中处理：

```javascript
// filmlab-service.js
// 当 inversionMode === 'log' 时，不在 Sharp 中反转
// 而是在 toneAndCurvesInJs 的像素循环中处理
const deferInversionToJs = inverted && (inversionMode === 'log' || filmCurveEnabled);

if (inverted && !deferInversionToJs) {
  // 只有 linear 模式在这里处理
  img = img.negate();
}
```

**方案 B**：使用 Sharp 的 recomb 或 raw 处理

复杂度较高，不推荐。

### 5.2 对数域片基校正（可选增强）

**目标**：将片基校正从线性域乘法改为对数域减法

#### 新增状态

```javascript
// FilmLab.jsx
const [baseMode, setBaseMode] = useState('linear'); // 'linear' | 'log'
```

#### CPU 实现

```javascript
// RenderCore.js - processPixel
if (p.baseRed !== 1.0 || p.baseGreen !== 1.0 || p.baseBlue !== 1.0) {
  if (p.baseMode === 'log') {
    // 对数域减法
    // baseRed/Green/Blue 现在存储的是密度偏移量（而非增益）
    const Dr = -Math.log10(Math.max(r / 255, 0.001)) - p.baseDensityR;
    const Dg = -Math.log10(Math.max(g / 255, 0.001)) - p.baseDensityG;
    const Db = -Math.log10(Math.max(b / 255, 0.001)) - p.baseDensityB;
    r = Math.pow(10, -Dr) * 255;
    g = Math.pow(10, -Dg) * 255;
    b = Math.pow(10, -Db) * 255;
  } else {
    // 线性域乘法（当前实现）
    r *= p.baseRed;
    g *= p.baseGreen;
    b *= p.baseBlue;
  }
  r = this._clamp255(r);
  g = this._clamp255(g);
  b = this._clamp255(b);
}
```

#### Auto Base 采样时的处理

```javascript
// FilmLab.jsx - handleAutoBase
if (baseMode === 'log') {
  // 存储密度值而非增益
  const Dr = -Math.log10(safeR / 255);
  const Dg = -Math.log10(safeG / 255);
  const Db = -Math.log10(safeB / 255);
  setBaseDensityR(Dr);
  setBaseDensityG(Dg);
  setBaseDensityB(Db);
} else {
  // 存储增益
  setBaseRed(255 / safeR);
  setBaseGreen(255 / safeG);
  setBaseBlue(255 / safeB);
}
```

**注意**：对数域实现需要**新的状态字段**，以兼容现有数据。

### 5.3 重命名 Log 反转（建议）

**UI 变更**：

| 原名称 | 新名称 | 说明 |
|--------|--------|------|
| Linear | Linear | 标准线性反转 |
| Log | Soft | 对数压缩反转，保留更多阴影细节 |

**代码**：保持 `inversionMode` 值不变 (`'linear'` / `'log'`)，只改 UI 显示。

---

## 6. 对现有功能的影响评估

### 6.1 不影响的功能

以下功能不受本次变更影响：

- White Balance (Temp/Tint)
- Tone Mapping (Exposure, Contrast, Highlights, Shadows, Whites, Blacks)
- Curves
- HSL
- Split Toning
- 3D LUT
- 旋转、裁剪

### 6.2 需要同步更新的路径

如果实施 5.1（统一 Log 反转）：

| 路径 | 文件 | 修改内容 |
|------|------|---------|
| Server Export | `server/services/filmlab-service.js` | 延迟 Log 反转到 JS 循环 |
| Server Render | `server/routes/filmlab.js` | 确保使用相同的 invertLog 函数 |

如果实施 5.2（对数域片基校正）：

| 路径 | 文件 | 修改内容 |
|------|------|---------|
| UI 状态 | `FilmLab.jsx` | 新增 baseMode, baseDensityR/G/B 状态 |
| CPU | `RenderCore.js` | 新增对数域处理分支 |
| WebGL | `FilmLabWebGL.js` | 着色器新增对数域处理 |
| GPU Export | `gpu-renderer.js` | 两个着色器都新增对数域处理 |
| Constants | `filmLabConstants.js` | 新增默认值 |
| Preset | 各预设相关代码 | 保存/加载新字段 |
| DB | 数据库 schema | 新增字段（可选，向后兼容用默认值） |

---

## 7. 实施优先级建议

### 阶段 1：修复 Log 反转一致性（高优先级）

1. 确保服务端使用与客户端相同的 `invertLog` 公式
2. 测试预览与导出结果一致性

### 阶段 2：优化命名（中优先级）

1. 将 UI 中的 "Log" 重命名为 "Soft"
2. 保持向后兼容

### 阶段 3：对数域片基校正（低优先级/未来版本）

1. 作为可选模式实现
2. 需要较大改动，建议在主要版本升级时考虑

---

## 8. 测试验证要点

### 8.1 一致性测试

1. **预览 vs Save**：使用相同参数，确保结果一致
2. **预览 vs GPU Export**：确保 WebGL 和 GPU 渲染结果一致
3. **预览 vs Server Export**：确保客户端和服务端结果一致
4. **Linear vs Log**：确保两种反转模式都能正确工作

### 8.2 边界条件测试

1. **极亮片基**：RGB 接近 (255, 255, 255)
2. **极暗片基**：RGB 接近 (10, 10, 10)
3. **强色偏**：RGB = (255, 150, 50) 等极端情况
4. **预设兼容**：旧预设加载后，新字段使用默认值

---

## 9. 结论

### 9.1 关键发现

1. **乘法增益与对数域减法数学等价**，实际差异微乎其微
2. **当前的 Log 反转不是"对数域反转"**，而是艺术化的非线性处理
3. **服务端与客户端的 Log 反转实现不一致**，需要修复
4. **对数域片基校正理论上更精确**，但改动较大

### 9.2 推荐行动

| 优先级 | 行动 | 工作量 | 收益 |
|--------|------|--------|------|
| 高 | 统一 Log 反转实现 | 中 | 高（修复不一致 bug） |
| 中 | 重命名 Log → Soft | 低 | 中（减少困惑） |
| 低 | 对数域片基校正 | 高 | 低（用户难以察觉） |
| 中 | 密度域 AutoLevels | 高 | 中（解决顺序依赖问题） |

---

## 10. 密度域 AutoLevels 详细设计

### 10.1 问题回顾

当前 AutoLevels 的问题：
1. 基于处理后图像的直方图计算
2. 通过 Curves（Pipeline 后期）实现
3. 对反转状态变化敏感

### 10.2 设计目标

实现一个在密度域进行的"Pre-Inversion AutoLevels"：

1. **物理正确**：在密度域操作，符合胶片特性
2. **顺序无关**：无论何时调用，结果一致
3. **与 Base Correction 协同**：可以合并到同一个处理阶段

### 10.3 新的参数设计

```javascript
// 新增参数（filmLabConstants.js）
const DEFAULT_DENSITY_LEVELS = {
  enabled: false,
  mode: 'auto',      // 'auto' | 'manual'
  // 密度范围（auto 模式自动计算，manual 模式手动设置）
  dMinR: null,       // 红色最小密度
  dMaxR: null,       // 红色最大密度
  dMinG: null,
  dMaxG: null,
  dMinB: null,
  dMaxB: null,
  // 输出范围（拉伸目标）
  outputDMin: 0.0,   // 输出密度下限（更亮）
  outputDMax: 2.5,   // 输出密度上限（更暗）
};
```

### 10.4 Pipeline 调整

**当前 Pipeline**：
```
① Film Curve
② Base Correction (线性或对数)
③ Inversion
...
⑦ Curves (AutoLevels 在这里)
```

**新 Pipeline**：
```
① Film Curve
② Base Correction (对数域)
③ Density AutoLevels (新！在对数域进行) ← 与 Base Correction 合并
④ 转回透射率域
⑤ Inversion
...
```

### 10.5 核心算法

#### 10.5.1 采样原始图像密度分布

```javascript
// filmLabDensityLevels.js
function computeDensityHistogram(imageData, params = {}) {
  const { width, height, data } = imageData;
  const stride = params.stride || 4;
  
  // 密度域直方图（0-3.0 的密度范围，100 个 bin）
  const BINS = 100;
  const D_MAX = 3.0;
  const histR = new Float32Array(BINS);
  const histG = new Float32Array(BINS);
  const histB = new Float32Array(BINS);
  
  for (let y = 0; y < height; y += stride) {
    for (let x = 0; x < width; x += stride) {
      const i = (y * width + x) * 4;
      const r = data[i] / 255;
      const g = data[i + 1] / 255;
      const b = data[i + 2] / 255;
      
      // 转换到密度域
      const Dr = -Math.log10(Math.max(r, 0.001));
      const Dg = -Math.log10(Math.max(g, 0.001));
      const Db = -Math.log10(Math.max(b, 0.001));
      
      // 分配到 bin
      const binR = Math.min(BINS - 1, Math.floor(Dr / D_MAX * BINS));
      const binG = Math.min(BINS - 1, Math.floor(Dg / D_MAX * BINS));
      const binB = Math.min(BINS - 1, Math.floor(Db / D_MAX * BINS));
      
      histR[binR]++;
      histG[binG]++;
      histB[binB]++;
    }
  }
  
  return { histR, histG, histB, bins: BINS, dMax: D_MAX };
}
```

#### 10.5.2 计算密度范围

```javascript
function findDensityLevels(hist, bins, dMax, threshold = 0.005) {
  let total = 0;
  for (let i = 0; i < bins; i++) total += hist[i];
  
  let cumulative = 0;
  let dMin = 0;
  let dMaxFound = dMax;
  
  // 找 0.5% 位置作为 dMin
  for (let i = 0; i < bins; i++) {
    cumulative += hist[i];
    if (cumulative / total >= threshold) {
      dMin = (i / bins) * dMax;
      break;
    }
  }
  
  // 找 99.5% 位置作为 dMax
  cumulative = 0;
  for (let i = bins - 1; i >= 0; i--) {
    cumulative += hist[i];
    if (cumulative / total >= threshold) {
      dMaxFound = ((i + 1) / bins) * dMax;
      break;
    }
  }
  
  return { dMin, dMax: dMaxFound };
}
```

#### 10.5.3 应用密度域色阶校正

```javascript
function applyDensityLevels(value, channelLevels, outputRange) {
  const { dMin, dMax } = channelLevels;
  const { outputDMin, outputDMax } = outputRange;
  
  // 转换到密度域
  const T = Math.max(value / 255, 0.001);
  const D = -Math.log10(T);
  
  // 线性拉伸
  const Dnorm = (D - dMin) / (dMax - dMin);
  const Dnew = outputDMin + Dnorm * (outputDMax - outputDMin);
  
  // 转回透射率域
  const Tnew = Math.pow(10, -Dnew);
  
  return Math.max(0, Math.min(255, Math.round(Tnew * 255)));
}
```

### 10.6 UI 设计

在 FILM BASE 区域下方添加新控件：

```
┌─────────────────────────────────────────┐
│ FILM BASE                               │
│ [Linear ▼] [Log ▼]                      │
│ [PICK] [AUTO DETECT]                    │
├─────────────────────────────────────────┤
│ DENSITY LEVELS (新！)                    │
│ ☑ Auto                                  │
│ R: [0.15] - [2.80]  ← 自动计算的密度范围  │
│ G: [0.10] - [2.75]                       │
│ B: [0.20] - [2.90]                       │
│ [ANALYZE] [RESET]                        │
└─────────────────────────────────────────┘
```

### 10.7 与现有 AutoLevels 的关系

| 功能 | 作用域 | 作用时机 | 适用场景 |
|------|--------|---------|---------|
| AutoLevels (现有) | 线性域 | 处理后 | 正片调整、通用 |
| Density Levels (新) | 密度域 | 反转前 | 负片去色罩 + 自动拉伸 |

**两者可以共存**：
- Density Levels：用于负片的"科学化"处理
- AutoLevels：用于最终输出的微调

### 10.8 WebGL 着色器实现

```glsl
// 新增 uniforms
uniform float u_densityLevelsEnabled;
uniform vec3 u_densityMin;  // R, G, B 的 D_min
uniform vec3 u_densityMax;  // R, G, B 的 D_max
uniform vec2 u_densityOutputRange; // outputDMin, outputDMax

// 在 Base Correction 之后、Inversion 之前
if (u_densityLevelsEnabled > 0.5) {
  float log10 = log(10.0);
  
  // 转换到密度域
  float Dr = -log(max(col.r, 0.001)) / log10;
  float Dg = -log(max(col.g, 0.001)) / log10;
  float Db = -log(max(col.b, 0.001)) / log10;
  
  // 线性拉伸
  float DrNorm = (Dr - u_densityMin.r) / (u_densityMax.r - u_densityMin.r);
  float DgNorm = (Dg - u_densityMin.g) / (u_densityMax.g - u_densityMin.g);
  float DbNorm = (Db - u_densityMin.b) / (u_densityMax.b - u_densityMin.b);
  
  float DrNew = u_densityOutputRange.x + DrNorm * (u_densityOutputRange.y - u_densityOutputRange.x);
  float DgNew = u_densityOutputRange.x + DgNorm * (u_densityOutputRange.y - u_densityOutputRange.x);
  float DbNew = u_densityOutputRange.x + DbNorm * (u_densityOutputRange.y - u_densityOutputRange.x);
  
  // 转回透射率域
  col.r = pow(10.0, -DrNew);
  col.g = pow(10.0, -DgNew);
  col.b = pow(10.0, -DbNew);
  col = clamp(col, 0.0, 1.0);
}
```

### 10.9 实现步骤

1. **Phase 1**：添加 `filmLabDensityLevels.js` 模块
   - 密度直方图计算
   - 密度范围检测
   - 密度域拉伸函数

2. **Phase 2**：RenderCore 集成
   - 新增 `densityLevels` 参数
   - 在 `processPixel` 中实现

3. **Phase 3**：WebGL 着色器更新
   - FilmLabWebGL.js
   - gpu-renderer.js

4. **Phase 4**：UI 集成
   - FilmLabControls.jsx 添加控件
   - FilmLab.jsx 添加状态管理

5. **Phase 5**：服务端同步
   - photos.js 传递参数
   - filmlab-service.js 处理

---

## 附录 A：数学证明

### 乘法增益 = 对数域减法

设扫描读数 $T_s$，片基透射率 $T_b$，图像透射率 $T_i$。

由 Beer-Lambert 定律：
$$T_s = T_b \times T_i$$

**方法 1：乘法增益**
$$T_i = T_s \times G = T_s \times \frac{1}{T_b} = \frac{T_s}{T_b}$$

**方法 2：对数域减法**
$$D_s = -\log(T_s), \quad D_b = -\log(T_b)$$
$$D_i = D_s - D_b = -\log(T_s) - (-\log(T_b)) = \log\left(\frac{T_b}{T_s}\right)$$
$$T_i = 10^{-D_i} = 10^{\log(T_s/T_b)} = \frac{T_s}{T_b}$$

两种方法得到相同的结果 ✓

---

## 附录 B：代码位置参考

| 功能 | 文件 | 位置 |
|------|------|------|
| Film Curve 定义 | `packages/shared/filmLabCurve.js` | 全文件 |
| Film Curve 配置 | `packages/shared/filmLabConstants.js` | `FILM_PROFILES` |
| 反转实现 | `packages/shared/filmLabInversion.js` | `invertLinear`, `invertLog` |
| CPU 渲染 | `packages/shared/render/RenderCore.js` | `processPixel` |
| WebGL 渲染 | `client/src/components/FilmLab/FilmLabWebGL.js` | 着色器 `main()` |
| GPU 导出 | `electron-gpu/gpu-renderer.js` | `FS_GL2`, `FS_GL1` 着色器 |
| 服务端渲染 | `server/services/filmlab-service.js` | `buildPipeline` |
| 服务端路由 | `server/routes/filmlab.js` | 各端点 |
| 片基校正 UI | `client/src/components/FilmLab/FilmLab.jsx` | `handleAutoBase` |

| AutoLevels | `client/src/components/FilmLab/FilmLab.jsx` | `handleAutoLevels` |
| 直方图计算 | `client/src/components/FilmLab/FilmLab.jsx` | `processImage` 内 |

---

## 附录 C：AutoLevels 问题的技术总结

### C.1 当前行为

```
用户操作序列 A: AutoLevels  启用反转
  1. histograms 基于未反转图像
  2. curves 设置为 [{min_unreversed, 0}, {max_unreversed, 255}]
  3. 启用反转
  4. 结果: Curves 作用于反转后的错误位置

用户操作序列 B: 启用反转  AutoLevels
  1. 启用反转
  2. histograms 基于反转后图像
  3. curves 设置为 [{min_reversed, 0}, {max_reversed, 255}]
  4. 结果: 正确！Curves 作用于正确的位置
```

### C.2 根因

1. **histograms 是实时的**：反映当前渲染后的图像
2. **curves 是持久的**：不会随反转状态自动调整
3. **pipeline 位置**：curves 在 inversion 之后应用

### C.3 正确工作流程

对于负片处理，正确顺序是：

```
1. 启用 Invert
2. 设置 Film Base (去色罩)
3. 调整 Film Curve (如需要)
4. 然后使用 AutoLevels
5. 微调其他参数
```

### C.4 理想化方案对比

| 方案 | 复杂度 | 物理正确性 | 用户体验 |
|------|--------|-----------|---------|
| 用户教育 | 低 | - | 需学习 |
| 反转提醒 | 低 | - | 被动提示 |
| 密度域 AutoLevels | 高 | ✓ | 最佳 |
| Curves 自动反转 | 中 | ✗ | 复杂 |

---

## 附录 D：未来 Pipeline 设计展望

### D.1 理想的负片处理 Pipeline

```

                     密度域处理 (Pre-Inversion)                       

                                                                     
   线性  密度转换                                                  
     D = -log10(T),  T = value/255                                   
                                                                     
   Film Curve (H&D 密度特性曲线)                                    
     D' = H&D_curve(D)                                               
                                                                     
   Film Base Correction (密度域减法)                                
     D'' = D' - D_base                                               
                                                                     
   Density AutoLevels (密度域色阶)  新功能                         
     D''' = normalize(D'', D_min, D_max)                             
                                                                     
   密度  线性转换                                                  
     T' = 10^(-D''')                                                 
                                                                     

                     负正转换                                        

                                                                     
   Inversion (反转)                                                 
     - Linear: P = 1 - T'                                            
     - Soft: P = 1 - log_compress(T')                                
                                                                     

                     线性域后处理 (Post-Inversion)                    

                                                                     
   3D LUT (创意调色)                                                
   White Balance (场景白平衡)                                       
   Tone Mapping (曝光、对比度、高光、阴影)                          
   Curves (精细调整)  现有 AutoLevels 在这里                       
  ⑪ HSL (色相/饱和度/明度)                                           
  ⑫ Split Toning (分离色调)                                         
                                                                     

```

### D.2 用户工作流程对比

**当前工作流程**（需要正确顺序）：
```
用户: 打开负片  启用反转  Auto Base  AutoLevels  调整
```

**未来工作流程**（顺序无关）：
```
用户: 打开负片  [任意顺序操作]  系统在密度域自动处理
```

### D.3 实施路线图

```
v1.9.x (当前)
 ✅ 对数域 Base Correction (已实现)
 ⬜ 用户教育 + 提示
 ⬜ AutoLevels 反转状态提醒

v2.0.x (短期)
 ⬜ 密度域 AutoLevels (Density Levels)
 ⬜ 统一 Pre-Inversion 处理模块
 ⬜ UI 整合

v2.1.x (长期)
 ⬜ 完全密度域 Pipeline
 ⬜ 自动检测负片类型
 ⬜ 智能参数推荐
```

---

## 结语

本文档分析了 FilmLab 中与密度域处理相关的多个问题：

1. **乘法增益 vs 对数域减法**：数学等价，实现已完成
2. **Log 反转的一致性**：需统一服务端实现
3. **AutoLevels 顺序依赖**：根因是 histograms 和 curves 的作用时机

**推荐优先级**：
1. 🔴 高：用户教育 + AutoLevels 提示
2. 🟡 中：密度域 AutoLevels 功能设计
3. 🟢 低：完全密度域 Pipeline 重构

负片数字化是一个复杂的领域，平衡"物理正确性"与"用户体验"是关键挑战。
