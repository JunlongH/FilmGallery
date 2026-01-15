# FilmLab 代码库优化与重构计划

**文档日期**: 2026-01-15  
**更新日期**: 2026-01-16  
**状态**: ✅ 已完成  
**目标**: 消除代码重复、修复功能缺失、优化性能、提升可维护性

---

## 实施总结 (2026-01-16)

### ✅ 已完成的工作

1. **创建共享模块 (`packages/shared/`)**
   - `filmLabConstants.js` - 统一常量定义
   - `filmLabToneLUT.js` - 色调映射 LUT 构建
   - `filmLabCurves.js` - 曲线样条插值和 LUT
   - `filmLabWhiteBalance.js` - 科学白平衡（Kelvin 色温模型）
   - `filmLabInversion.js` - 胶片密度反转模型
   - `filmlab-core.js` - 核心像素处理函数
   - `index.js` - 统一导出入口

2. **重构客户端 (`FilmLab.jsx`)**
   - 替换 `processImage()` CPU 路径使用共享模块
   - 替换 `handleSave()` 使用共享模块
   - 替换 `downloadClientJPEG()` 使用共享模块
   - 替换 `generateOutputLUT()` 使用共享模块
   - 移除重复的本地函数

3. **重构服务端 (`server/routes/filmlab.js`)**
   - 移除本地 `buildToneLUT`, `createSpline`, `buildCurveLUT`
   - `/preview`, `/render`, `/export` 端点均使用共享模块
   - 现在支持 3D LUT（之前缺失的功能）

4. **修复 WebGL 调试日志**
   - 添加 `DEBUG_WEBGL` 标志
   - 所有 `console.log` 包装在条件检查中

### 代码行数减少

- **之前**: 约 400+ 行重复像素处理代码
- **之后**: 共享核心模块 ~200 行，各调用点 ~10 行

### 新增功能

- **科学白平衡**: 使用 Tanner Helland 算法的开尔文色温模型
- **胶片密度反转**: 14 种预设胶片特性曲线
- **服务端 3D LUT**: 之前缺失，现已支持

---

## 执行摘要

FilmLab 的核心图像处理逻辑在 **5 个不同位置** 存在重复实现（约 400+ 行代码），包括客户端预览、保存、下载、服务端渲染和 GPU 导出路径。处理流水线顺序正确且各路径保持一致，但存在以下问题：

1. **严重的代码冗余**: 像素处理循环在客户端、服务端、GPU 渲染器中重复实现
2. **服务端功能缺失**: 服务端完全缺少 3D LUT 支持，导致导出效果与客户端预览不一致
3. **性能隐患**: WebGL 缓存机制可能失效，导致不必要的重渲染
4. **维护困难**: 常量定义分散，调试日志残留

**算法验证结果**: 大部分图像处理算法数学正确，但白平衡和 Log 反转使用简化模型而非色彩科学标准（可选改进项）。

---

## 当前代码库分析

### 1. 代码重复详情

| 位置 | 文件 | 行数范围 | 用途 |
|------|------|----------|------|
| **客户端 #1** | `client/src/components/FilmLab/FilmLab.jsx` | ~1358-1430 | `downloadClientJPEG()` - 客户端下载 |
| **客户端 #2** | `client/src/components/FilmLab/FilmLab.jsx` | ~1450-1520 | `handleSave()` - 保存到服务器 |
| **客户端 #3** | `client/src/components/FilmLab/FilmLab.jsx` | ~980-1050 | `processImage()` - CPU 预览路径 |
| **服务端** | `server/routes/filmlab.js` | ~142-220, 280-350 | `/preview` 和 `/render` 端点 |
| **GPU 渲染器** | `electron-gpu/gpu-renderer.js` | ~108-180 | Electron GPU 导出 |

**重复的代码块示例** (出现 5 次):

```javascript
// 1. Log Inversion
if (inverted && inversionMode === 'log') {
  r = 255 * (1 - Math.log(r + 1) / Math.log(256));
  g = 255 * (1 - Math.log(g + 1) / Math.log(256));
  b = 255 * (1 - Math.log(b + 1) / Math.log(256));
} else if (inverted) {
  r = 255 - r; g = 255 - g; b = 255 - b;
}

// 2. White Balance
r *= rBal; g *= gBal; b *= bBal;

// 3. Tone Mapping
r = toneLUT[Math.floor(r)];
g = toneLUT[Math.floor(g)];
b = toneLUT[Math.floor(b)];

// 4. Curves
r = lutRGB[r]; g = lutRGB[g]; b = lutRGB[b];
r = lutR[r]; g = lutG[g]; b = lutB[b];

// 5. 3D LUTs (仅客户端和 GPU 有实现)
if (lut1) { /* trilinear interpolation */ }
if (lut2) { /* trilinear interpolation */ }
```

### 2. 重复的辅助函数

| 函数名 | 重复位置 |
|--------|----------|
| `buildToneLUT()` | `FilmLab.jsx`, `filmlab.js` (server), `filmLabUtils.js` |
| `buildCurveLUT()` | `FilmLab.jsx`, `filmlab.js` (server), `filmLabUtils.js` |
| `computeWBGains()` | `whiteBalanceUtils.js`, `filmlab-wb.js` (server) |
| `sampleLUT()` (3D LUT 插值) | `filmLabUtils.js`, WebGL shader 中有 GLSL 版本 |

### 3. 图像处理流水线顺序

所有路径遵循相同的处理顺序（已验证正确）:

```
┌─────────────────────────────────────────────┐
│  ① 几何变换 (Geometry)                      │
│     - 旋转 (Rotation)                       │
│     - 缩放 (Scaling)                        │
│     - 裁剪 (Crop)                           │
└──────────────────┬──────────────────────────┘
                   ↓
┌─────────────────────────────────────────────┐
│  ② 反转 (Inversion)                         │
│     - 线性: 255 - x                         │
│     - 对数: 255 * (1 - log(x+1)/log(256))  │
└──────────────────┬──────────────────────────┘
                   ↓
┌─────────────────────────────────────────────┐
│  ③ 白平衡 (White Balance)                   │
│     - 基础增益: red, green, blue            │
│     - 色温/色调 → RGB 乘数                  │
└──────────────────┬──────────────────────────┘
                   ↓
┌─────────────────────────────────────────────┐
│  ④ 色调映射 (Tone Mapping via LUT)         │
│     - 曝光 (Exposure)                       │
│     - 对比度 (Contrast)                     │
│     - 黑白场 (Blacks/Whites)                │
│     - 阴影/高光 (Shadows/Highlights)        │
└──────────────────┬──────────────────────────┘
                   ↓
┌─────────────────────────────────────────────┐
│  ⑤ 曲线 (Curves)                            │
│     - RGB 曲线 (所有通道)                   │
│     - 独立通道曲线 (R, G, B)                │
└──────────────────┬──────────────────────────┘
                   ↓
┌─────────────────────────────────────────────┐
│  ⑥ 3D LUT (可选)                            │
│     - LUT1 (强度混合)                       │
│     - LUT2 (强度混合)                       │
│     - 三线性插值                            │
└─────────────────────────────────────────────┘
```

### 4. 算法验证结果

| 算法 | 状态 | 说明 |
|------|------|------|
| **曝光 (Exposure)** | ✅ 正确 | `pow(2, exposure/50)` 标准摄影档位公式 |
| **对比度 (Contrast)** | ✅ 正确 | `(259*(c+255))/(255*(259-c))` 经典图像处理公式 |
| **黑白场/阴影高光** | ✅ 正确 | 标准 Levels + Bernstein 曲线混合 |
| **曲线 (Curves)** | ✅ 正确 | Fritsch-Carlson 单调三次样条插值 |
| **3D LUT** | ✅ 正确 | 标准三线性插值 |
| **裁剪/旋转几何** | ✅ 正确 | 正确的仿射变换与边界验证 |
| **线性反转** | ✅ 正确 | 简单 `255 - x` |
| **白平衡 (Temp/Tint)** | ⚠️ 简化模型 | 使用线性系数而非开尔文色温/CIE 标准 |
| **Log 反转** | ⚠️ 艺术化 | 非真实胶片 H&D 曲线模型 |

### 5. 已识别的问题

#### 🔴 严重问题

1. **服务端缺少 3D LUT 支持**
   - **位置**: `server/routes/filmlab.js` (所有端点)
   - **影响**: 客户端应用的 3D LUT 在服务端预览和导出时会丢失
   - **后果**: 导出图像与客户端预览不一致

2. **代码重复维护风险**
   - 5 处重复实现导致修复 bug 时需要同步更新多处
   - 已有历史案例: WebGL 曲线顺序 bug 需要在多处修复

#### 🟡 中等问题

3. **WebGL 缓存可能失效**
   - **位置**: `client/src/components/FilmLab/FilmLabWebGL.jsx` 第 95-105 行
   - **问题**: 使用对象引用比较 `lastWebglParamsRef.current === webglParams`
   - **风险**: 如果 `webglParams` 每次渲染都创建新对象，缓存将失效

4. **常量定义不一致**
   - 客户端预览宽度: `1400` (FilmLab.jsx)
   - 服务端默认宽度: `1600` (filmlab.js)
   - 导出宽度: `4000` (多处)

#### 🟢 低优先级问题

5. **生产环境调试日志**
   - **位置**: `FilmLabWebGL.jsx` 多处 `console.log`
   - **影响**: 性能和用户控制台污染

---

## 优化方案

### 核心原则

1. **单一来源 (Single Source of Truth)**: 创建共享模块，所有处理路径引用同一实现
2. **向后兼容**: 确保重构后的输出与当前版本像素级一致
3. **渐进式重构**: 先统一客户端和服务端，GPU 渲染器因使用 GLSL 需单独维护
4. **测试驱动**: 为共享模块添加单元测试，确保跨平台一致性

---

## 必需优化步骤

### Step 1: 创建共享处理核心模块

**文件**: `packages/shared/filmlab-core.js` (如果不使用 monorepo，则放在 `client/src/utils/filmlab-core.js`)

**内容**:

```javascript
/**
 * FilmLab 核心像素处理函数
 * 确保客户端、服务端、导出路径使用完全相同的算法
 */

/**
 * 处理单个像素的所有变换
 * @param {number} r - 红色通道 (0-255)
 * @param {number} g - 绿色通道 (0-255)
 * @param {number} b - 蓝色通道 (0-255)
 * @param {Object} luts - 预构建的查找表
 * @param {Object} params - 处理参数
 * @returns {[number, number, number]} 处理后的 RGB 值
 */
export function processPixel(r, g, b, luts, params) {
  // ① 反转 (Inversion)
  if (params.inverted) {
    if (params.inversionMode === 'log') {
      r = 255 * (1 - Math.log(r + 1) / Math.log(256));
      g = 255 * (1 - Math.log(g + 1) / Math.log(256));
      b = 255 * (1 - Math.log(b + 1) / Math.log(256));
    } else {
      r = 255 - r;
      g = 255 - g;
      b = 255 - b;
    }
  }

  // ② 白平衡 (White Balance)
  r *= luts.rBal;
  g *= luts.gBal;
  b *= luts.bBal;

  // 钳制到 0-255
  r = Math.max(0, Math.min(255, r));
  g = Math.max(0, Math.min(255, g));
  b = Math.max(0, Math.min(255, b));

  // ③ 色调映射 (Tone LUT)
  r = luts.toneLUT[Math.floor(r)];
  g = luts.toneLUT[Math.floor(g)];
  b = luts.toneLUT[Math.floor(b)];

  // ④ 曲线 (Curves) - 先 RGB 后分通道
  r = luts.lutRGB[r];
  g = luts.lutRGB[g];
  b = luts.lutRGB[b];
  r = luts.lutR[r];
  g = luts.lutG[g];
  b = luts.lutB[b];

  // ⑤ 3D LUT 应用 (如果存在)
  if (luts.lut1) {
    [r, g, b] = sampleLUT3D(r, g, b, luts.lut1, luts.lut1Intensity);
  }
  if (luts.lut2) {
    [r, g, b] = sampleLUT3D(r, g, b, luts.lut2, luts.lut2Intensity);
  }

  // 最终钳制
  return [
    Math.max(0, Math.min(255, r)),
    Math.max(0, Math.min(255, g)),
    Math.max(0, Math.min(255, b))
  ];
}

/**
 * 三线性插值采样 3D LUT
 */
function sampleLUT3D(r, g, b, lut, intensity = 1.0) {
  const { size, data } = lut;
  const maxIndex = size - 1;

  // 归一化到 [0, 1]
  const rNorm = r / 255;
  const gNorm = g / 255;
  const bNorm = b / 255;

  // 映射到网格位置
  const rPos = rNorm * maxIndex;
  const gPos = gNorm * maxIndex;
  const bPos = bNorm * maxIndex;

  // 8 个角索引
  const r0 = Math.floor(rPos);
  const r1 = Math.min(maxIndex, r0 + 1);
  const g0 = Math.floor(gPos);
  const g1 = Math.min(maxIndex, g0 + 1);
  const b0 = Math.floor(bPos);
  const b1 = Math.min(maxIndex, b0 + 1);

  // 分数部分
  const fr = rPos - r0;
  const fg = gPos - g0;
  const fb = bPos - b0;

  // 获取索引 (R 最快变化，B 最慢)
  const getIdx = (ri, gi, bi) => (ri + gi * size + bi * size * size) * 3;

  // 三线性插值
  const interp = (v000, v100, v010, v110, v001, v101, v011, v111) => {
    const c00 = v000 * (1 - fr) + v100 * fr;
    const c10 = v010 * (1 - fr) + v110 * fr;
    const c01 = v001 * (1 - fr) + v101 * fr;
    const c11 = v011 * (1 - fr) + v111 * fr;
    const c0 = c00 * (1 - fg) + c10 * fg;
    const c1 = c01 * (1 - fg) + c11 * fg;
    return c0 * (1 - fb) + c1 * fb;
  };

  // 对每个通道插值
  const rOut = interp(
    data[getIdx(r0, g0, b0)], data[getIdx(r1, g0, b0)],
    data[getIdx(r0, g1, b0)], data[getIdx(r1, g1, b0)],
    data[getIdx(r0, g0, b1)], data[getIdx(r1, g0, b1)],
    data[getIdx(r0, g1, b1)], data[getIdx(r1, g1, b1)]
  );
  const gOut = interp(
    data[getIdx(r0, g0, b0) + 1], data[getIdx(r1, g0, b0) + 1],
    data[getIdx(r0, g1, b0) + 1], data[getIdx(r1, g1, b0) + 1],
    data[getIdx(r0, g0, b1) + 1], data[getIdx(r1, g0, b1) + 1],
    data[getIdx(r0, g1, b1) + 1], data[getIdx(r1, g1, b1) + 1]
  );
  const bOut = interp(
    data[getIdx(r0, g0, b0) + 2], data[getIdx(r1, g0, b0) + 2],
    data[getIdx(r0, g1, b0) + 2], data[getIdx(r1, g1, b0) + 2],
    data[getIdx(r0, g0, b1) + 2], data[getIdx(r1, g0, b1) + 2],
    data[getIdx(r0, g1, b1) + 2], data[getIdx(r1, g1, b1) + 2]
  );

  // 强度混合
  return [
    r + (rOut - r) * intensity,
    g + (gOut - g) * intensity,
    b + (bOut - b) * intensity
  ];
}

/**
 * 预构建所有查找表
 * @param {Object} params - FilmLab 参数对象
 * @returns {Object} 包含所有 LUT 的对象
 */
export function prepareLUTs(params) {
  // 引入其他工具函数
  const { buildToneLUT } = require('./filmLabToneLUT');
  const { buildCurveLUT } = require('./filmLabCurves');
  const { computeWBGains } = require('./filmLabWhiteBalance');

  // 构建色调 LUT
  const toneLUT = buildToneLUT({
    exposure: params.exposure || 0,
    contrast: params.contrast || 0,
    highlights: params.highlights || 0,
    shadows: params.shadows || 0,
    whites: params.whites || 0,
    blacks: params.blacks || 0,
  });

  // 构建曲线 LUT
  const curves = params.curves || {
    rgb: [{ x: 0, y: 0 }, { x: 255, y: 255 }],
    red: [{ x: 0, y: 0 }, { x: 255, y: 255 }],
    green: [{ x: 0, y: 0 }, { x: 255, y: 255 }],
    blue: [{ x: 0, y: 0 }, { x: 255, y: 255 }]
  };
  const lutRGB = buildCurveLUT(curves.rgb);
  const lutR = buildCurveLUT(curves.red);
  const lutG = buildCurveLUT(curves.green);
  const lutB = buildCurveLUT(curves.blue);

  // 计算白平衡增益
  const [rBal, gBal, bBal] = computeWBGains({
    red: params.red ?? 1.0,
    green: params.green ?? 1.0,
    blue: params.blue ?? 1.0,
    temp: params.temp || 0,
    tint: params.tint || 0
  });

  return {
    toneLUT,
    lutRGB,
    lutR,
    lutG,
    lutB,
    rBal,
    gBal,
    bBal,
    lut1: params.lut1 || null,
    lut1Intensity: params.lut1Intensity ?? 1.0,
    lut2: params.lut2 || null,
    lut2Intensity: params.lut2Intensity ?? 1.0
  };
}
```

**配套拆分文件**:

- `packages/shared/filmLabToneLUT.js` - 从现有代码提取 `buildToneLUT()`
- `packages/shared/filmLabCurves.js` - 从现有代码提取 `buildCurveLUT()`
- `packages/shared/filmLabWhiteBalance.js` - 从现有代码提取 `computeWBGains()`

---

### Step 2: 统一常量定义

**文件**: `packages/shared/filmLabConstants.js`

```javascript
/**
 * FilmLab 共享常量
 * 客户端、服务端、Electron 共用
 */

export const FILMLAB_CONSTANTS = {
  // 预览和渲染尺寸
  PREVIEW_MAX_WIDTH: 1400,
  EXPORT_MAX_WIDTH: 4000,
  
  // 默认参数
  DEFAULT_EXPOSURE: 0,
  DEFAULT_CONTRAST: 0,
  DEFAULT_TEMP: 0,
  DEFAULT_TINT: 0,
  DEFAULT_WB_GAINS: { red: 1.0, green: 1.0, blue: 1.0 },
  
  // 导出质量
  JPEG_QUALITY_PREVIEW: 85,
  JPEG_QUALITY_EXPORT: 95,
  
  // WebGL 配置
  WEBGL_DEBOUNCE_MS: 100,
};
```

---

### Step 3: 重构客户端 (FilmLab.jsx)

**修改**: `client/src/components/FilmLab/FilmLab.jsx`

将以下三个函数中的像素循环替换为 `processPixel()`:

1. **`processImage()`** (第 980-1050 行)
2. **`handleSave()`** (第 1450-1520 行)
3. **`downloadClientJPEG()`** (第 1358-1430 行)

**修改示例** (以 `downloadClientJPEG` 为例):

```javascript
// 旧代码 (删除)
for (let i = 0, j = 0; i < rawData.length; i += 4, j += 3) {
  let r = rawData[i];
  let g = rawData[i + 1];
  let b = rawData[i + 2];
  
  // ... 40+ 行处理逻辑 ...
  
  out[j] = r;
  out[j + 1] = g;
  out[j + 2] = b;
}

// 新代码 (替换为)
import { processPixel, prepareLUTs } from '../../utils/filmlab-core';

const luts = prepareLUTs({
  exposure, contrast, highlights, shadows, whites, blacks,
  curves, red, green, blue, temp, tint,
  inverted, inversionMode,
  lut1: selectedLut1, lut1Intensity,
  lut2: selectedLut2, lut2Intensity
});

for (let i = 0, j = 0; i < rawData.length; i += 4, j += 3) {
  let r = rawData[i];
  let g = rawData[i + 1];
  let b = rawData[i + 2];
  
  [r, g, b] = processPixel(r, g, b, luts, { inverted, inversionMode });
  
  out[j] = r;
  out[j + 1] = g;
  out[j + 2] = b;
}
```

---

### Step 4: 重构服务端并修复 3D LUT 缺失

**修改**: `server/routes/filmlab.js`

1. 引入共享模块
2. 替换像素处理循环
3. **添加 3D LUT 支持** (当前缺失)

```javascript
// 在文件头部添加
const { processPixel, prepareLUTs } = require('../../packages/shared/filmlab-core');
const { FILMLAB_CONSTANTS } = require('../../packages/shared/filmLabConstants');

// 在 /preview 和 /render 端点中
router.post('/preview', async (req, res) => {
  // ... 现有代码 ...
  
  // 构建 LUT (替换现有的 buildToneLUT/buildCurveLUT 调用)
  const luts = prepareLUTs({
    exposure: params?.exposure || 0,
    contrast: params?.contrast || 0,
    highlights: params?.highlights || 0,
    shadows: params?.shadows || 0,
    whites: params?.whites || 0,
    blacks: params?.blacks || 0,
    curves: params?.curves,
    red: params?.red ?? 1.0,
    green: params?.green ?? 1.0,
    blue: params?.blue ?? 1.0,
    temp: params?.temp || 0,
    tint: params?.tint || 0,
    inverted: params?.inverted || false,
    inversionMode: params?.inversionMode || 'linear',
    // ⚠️ 关键: 添加 3D LUT 支持 (之前缺失)
    lut1: params?.lut1 || null,
    lut1Intensity: params?.lut1Intensity ?? 1.0,
    lut2: params?.lut2 || null,
    lut2Intensity: params?.lut2Intensity ?? 1.0
  });
  
  // 替换像素循环
  for (let i = 0, j = 0; i < data.length; i += channels, j += 3) {
    let r = data[i];
    let g = data[i + 1];
    let b = data[i + 2];
    
    [r, g, b] = processPixel(r, g, b, luts, {
      inverted: params?.inverted || false,
      inversionMode: params?.inversionMode || 'linear'
    });
    
    out[j] = r;
    out[j + 1] = g;
    out[j + 2] = b;
  }
  
  // ... 现有代码 ...
});
```

**删除**: `server/routes/filmlab.js` 中的 `buildToneLUT()` 和 `buildCurveLUT()` 本地实现

---

### Step 5: 优化 WebGL 缓存与日志

**修改**: `client/src/components/FilmLab/FilmLabWebGL.jsx`

#### 5.1 修复缓存比较逻辑

```javascript
// 旧代码 (第 95-105 行)
if (processedCanvasRef.current && lastWebglParamsRef.current === webglParams) {
  sourceForDraw = processedCanvasRef.current;
  useDirectDraw = true;
  webglSuccess = true;
} else {
  // 重新渲染
}

// 新代码 (替换为字符串比较)
const webglParamsKey = JSON.stringify(webglParams);
if (processedCanvasRef.current && lastWebglParamsRef.current === webglParamsKey) {
  sourceForDraw = processedCanvasRef.current;
  useDirectDraw = true;
  webglSuccess = true;
} else {
  lastWebglParamsRef.current = webglParamsKey;
  // 重新渲染
}
```

#### 5.2 添加 DEBUG 开关

```javascript
// 在文件顶部添加
const DEBUG = false; // 生产环境设为 false

// 替换所有 console.log
if (DEBUG) console.log('[FilmLabWebGL] Setting u_gains:', gains);
if (DEBUG) console.log('[FilmLabWebGL] Center pixel:', debugPixels);
// ... 等等
```

---

### Step 6: GPU 渲染器一致性验证

**文件**: `electron-gpu/gpu-renderer.js`

由于 GPU 渲染器使用 GLSL 着色器，无法直接使用 JS 共享模块。需要**手动验证** GLSL 代码与 `filmlab-core.js` 的算法一致性。

**验证清单**:

- [ ] Exposure: `c * pow(2.0, u_exposure)` ✅
- [ ] Contrast: `(259*(c*255+255))/(255*(259-c*255))` ✅
- [ ] Inversion (Linear): `1.0 - c` ✅
- [ ] Inversion (Log): `1.0 - log(c * 255.0 + 1.0) / log(256.0)` ✅
- [ ] White Balance: `c * u_gains` ✅
- [ ] Curves: `sampleCurve(u_curveRGB, c)` then `sampleCurve(u_curveR, c)` ✅
- [ ] 3D LUT: Trilinear interpolation ✅

**结论**: GPU 渲染器当前实现与共享模块数学一致，无需修改。

---

## 可选算法改进

### Optional Step 7: 白平衡科学化

**文件**: `packages/shared/filmLabWhiteBalance.js`

**当前实现** (简化模型):

```javascript
const t = temp / 100;  // -1 to 1
const n = tint / 100;

let r = R * (1 + t * 0.5 + n * 0.3);
let g = G * (1 - n * 0.5);
let b = B * (1 - t * 0.5 + n * 0.3);
```

**改进方案**: 基于开尔文色温的物理模型 (Tanner Helland 算法)

```javascript
/**
 * 将开尔文色温转换为 RGB 乘数
 * 基于黑体辐射的近似算法
 * @param {number} kelvin - 色温 (1000-40000K)
 * @returns {[number, number, number]} RGB 乘数
 */
function kelvinToRGB(kelvin) {
  const temp = kelvin / 100;
  let r, g, b;

  // 红色通道
  if (temp <= 66) {
    r = 255;
  } else {
    r = temp - 60;
    r = 329.698727446 * Math.pow(r, -0.1332047592);
    r = Math.max(0, Math.min(255, r));
  }

  // 绿色通道
  if (temp <= 66) {
    g = temp;
    g = 99.4708025861 * Math.log(g) - 161.1195681661;
  } else {
    g = temp - 60;
    g = 288.1221695283 * Math.pow(g, -0.0755148492);
  }
  g = Math.max(0, Math.min(255, g));

  // 蓝色通道
  if (temp >= 66) {
    b = 255;
  } else if (temp <= 19) {
    b = 0;
  } else {
    b = temp - 10;
    b = 138.5177312231 * Math.log(b) - 305.0447927307;
    b = Math.max(0, Math.min(255, b));
  }

  return [r / 255, g / 255, b / 255];
}

/**
 * 改进的白平衡计算
 * @param {Object} params
 * @param {number} params.temp - 色温调整 (-100 到 100, 映射到 2000K-10000K)
 * @param {number} params.tint - 色调调整 (-100 到 100)
 */
export function computeWBGains(params) {
  const { red, green, blue, temp, tint } = params;

  // 映射温度滑块到开尔文范围
  const baseKelvin = 6500; // D65 中性点
  const kelvin = baseKelvin + (temp * 40); // ±4000K 范围
  const [rTemp, gTemp, bTemp] = kelvinToRGB(kelvin);

  // 色调调整 (保持原有的简单模型)
  const tintFactor = tint / 100;
  const rTint = 1 + tintFactor * 0.3;
  const gTint = 1 - tintFactor * 0.5;
  const bTint = 1 + tintFactor * 0.3;

  return [
    red * rTemp * rTint,
    green * gTemp * gTint,
    blue * bTemp * bTint
  ];
}
```

**注意**: 此改进会改变现有用户的调色习惯，需要**版本迁移策略**或**作为新选项**提供。

---

### Optional Step 8: Log 反转胶片化

**文件**: `packages/shared/filmLabInversion.js`

**当前实现**:

```javascript
r = 255 * (1 - Math.log(r + 1) / Math.log(256));
```

**改进方案**: 真实胶片密度模型

```javascript
/**
 * 胶片负片反转 (基于密度-透射率模型)
 * @param {number} val - 扫描值 (0-255)
 * @param {string} filmType - 胶片类型
 * @returns {number} 反转后的值
 */
function filmDensityInvert(val, filmType = 'portra') {
  // 胶片特性参数
  const filmProfiles = {
    portra: { gamma: 0.6, dMin: 0.1, dMax: 3.0 },
    ektar: { gamma: 0.55, dMin: 0.08, dMax: 3.2 },
    trix: { gamma: 0.65, dMin: 0.15, dMax: 2.8 }
  };

  const profile = filmProfiles[filmType] || filmProfiles.portra;
  
  // 1. 扫描值 → 归一化密度
  const density = (val / 255) * (profile.dMax - profile.dMin) + profile.dMin;
  
  // 2. 密度 → 透射率
  const transmittance = Math.pow(10, -density);
  
  // 3. 应用胶片 gamma
  const linearized = Math.pow(transmittance, 1 / profile.gamma);
  
  return Math.max(0, Math.min(255, linearized * 255));
}
```

**UI 改进**: 添加下拉菜单选择胶片类型 (Portra 400, Ektar 100, Tri-X 400...)

---

## 测试与验证策略

### 1. 单元测试

**文件**: `packages/shared/__tests__/filmlab-core.test.js`

```javascript
import { processPixel, prepareLUTs } from '../filmlab-core';

describe('FilmLab Core Processing', () => {
  test('中性参数不改变像素值', () => {
    const luts = prepareLUTs({
      exposure: 0, contrast: 0,
      red: 1, green: 1, blue: 1,
      temp: 0, tint: 0
    });
    const [r, g, b] = processPixel(128, 128, 128, luts, {
      inverted: false, inversionMode: 'linear'
    });
    expect(r).toBeCloseTo(128, 1);
    expect(g).toBeCloseTo(128, 1);
    expect(b).toBeCloseTo(128, 1);
  });

  test('线性反转正确', () => {
    const luts = prepareLUTs({ /* neutral */ });
    const [r, g, b] = processPixel(100, 150, 200, luts, {
      inverted: true, inversionMode: 'linear'
    });
    expect(r).toBeCloseTo(155, 1);
    expect(g).toBeCloseTo(105, 1);
    expect(b).toBeCloseTo(55, 1);
  });

  // ... 更多测试用例
});
```

### 2. 集成测试

创建测试图片，对比重构前后的输出:

```javascript
// 测试脚本: test-filmlab-consistency.js
const testImages = [
  'test-gray-gradient.png',
  'test-color-checker.png',
  'test-film-negative.tif'
];

const testParams = [
  { exposure: 50, contrast: 20 },
  { inverted: true, inversionMode: 'log' },
  { lut1: loadLUT('fuji-400h.cube'), lut1Intensity: 0.8 }
];

// 对比客户端、服务端、GPU 输出的 MD5 哈希
```

### 3. 视觉回归测试

使用 Playwright 或 Cypress 截图对比:

```javascript
describe('FilmLab Visual Regression', () => {
  it('预览与导出一致', async () => {
    await page.goto('/filmlab?photoId=123');
    await page.setSlider('exposure', 50);
    const previewScreenshot = await page.screenshot();
    
    await page.click('[data-testid="export-button"]');
    const exportedImage = await downloadExport();
    
    expect(compareImages(previewScreenshot, exportedImage)).toBeLessThan(0.01);
  });
});
```

---

## 实施计划

### 阶段 1: 基础重构 (1-2 天)

- [ ] 创建 `packages/shared/filmlab-core.js`
- [ ] 创建 `packages/shared/filmLabConstants.js`
- [ ] 拆分辅助函数到独立文件
- [ ] 添加单元测试

### 阶段 2: 客户端迁移 (1 天)

- [ ] 重构 `FilmLab.jsx` 的 `processImage()`
- [ ] 重构 `handleSave()`
- [ ] 重构 `downloadClientJPEG()`
- [ ] 运行回归测试

### 阶段 3: 服务端迁移与 LUT 修复 (1 天)

- [ ] 重构 `server/routes/filmlab.js` 的 `/preview`
- [ ] 重构 `/render` 端点
- [ ] **修复 3D LUT 支持缺失**
- [ ] 运行服务端集成测试

### 阶段 4: 性能优化 (0.5 天)

- [ ] 修复 WebGL 缓存逻辑
- [ ] 清理调试日志
- [ ] 统一常量引用

### 阶段 5: 验证与发布 (0.5 天)

- [ ] 对比重构前后输出一致性
- [ ] 视觉回归测试
- [ ] 更新文档

**总计**: 约 4-5 工作日

---

## 风险与缓解策略

| 风险 | 影响 | 缓解措施 |
|------|------|----------|
| **输出不一致** | 高 - 用户作品受影响 | 逐函数替换并对比 MD5，回归测试 |
| **性能下降** | 中 - 导出速度变慢 | 基准测试，必要时优化 `processPixel` |
| **3D LUT 格式兼容** | 中 - 服务端可能解析失败 | 支持客户端上传二进制 LUT 数据 |
| **GPU 渲染器维护** | 低 - GLSL 代码单独维护 | 文档化算法一致性检查清单 |

---

## 成功指标

1. **代码行数减少**: 删除 ~400 行重复代码
2. **测试覆盖率**: 核心模块达到 >90% 覆盖
3. **功能完整性**: 服务端支持 3D LUT，预览与导出一致
4. **性能**: 客户端预览 FPS 不降低，服务端导出时间不增加 >10%
5. **可维护性**: 修改算法只需改一处代码

---

## 附录

### A. 相关文档

- [FilmLab Pipeline Analysis](./filmlab-pipeline-analysis.md)
- [GPU Export White Balance Fix](./bugfix-2025-12-04-gpu-export-wb.md)
- [WebGL Crop Overlay Fix](./bugfix-2025-12-04-webgl-crop-overlay.md)

### B. 工具函数索引

| 函数 | 位置 | 用途 |
|------|------|------|
| `processPixel()` | `filmlab-core.js` | 单像素处理核心 |
| `prepareLUTs()` | `filmlab-core.js` | LUT 预构建 |
| `buildToneLUT()` | `filmLabToneLUT.js` | 色调映射 LUT |
| `buildCurveLUT()` | `filmLabCurves.js` | 曲线 LUT |
| `computeWBGains()` | `filmLabWhiteBalance.js` | 白平衡增益 |
| `createSpline()` | `filmLabUtils.js` | Fritsch-Carlson 样条 |
| `sampleLUT()` | `filmlab-core.js` | 3D LUT 插值 |

### C. 测试用例清单

- [ ] 中性参数 (所有参数为 0/1)
- [ ] 极端曝光 (±100)
- [ ] 线性/Log 反转
- [ ] 3D LUT 应用
- [ ] 多重调整组合
- [ ] 边界值 (0, 255)
- [ ] 不同图片格式 (JPEG, TIFF, PNG)

---

**文档版本**: 1.0  
**最后更新**: 2026-01-15  
**维护者**: FilmGallery 开发团队
