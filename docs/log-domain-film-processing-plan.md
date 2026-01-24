# 对数域胶片处理统一方案

**日期**: 2026-01-24  
**状态**: 深度分析 + 实现规划  
**目标**: 整理对数域减法与乘法增益的关系，分析现有功能的物理意义，提出统一优化方案

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
