# FilmGallery 全面代码审计与优化计划

> **日期**: 2026-02-09
> **范围**: 渲染管线全链路 (CPU / GPU / Server)、计算公式、曲线插值、架构
> **前置**: P1-P9 修复已完成 (commit `18cb6c2`, branch `refactor/rendering-pipeline-float`)
> **最后更新**: 2026-02-11 — Phase 1 / 2 / 2.4 / 3 / 3.5 / 4 / 4.6 全部完成

---

## 执行状态总览

| Phase | 描述 | 进度 |
|-------|------|------|
| **Phase 1** | CPU/GPU 一致性修复 | ✅ **全部完成** (Q1-Q8) |
| **Phase 2** | 曲线算法升级 | ✅ **全部完成** (Q10 + Float LUT + Phase 2.4 GPU Float Texture) |
| **Phase 3** | 公式精度提升 | ✅ **全部完成** (Q11 Mid-gray / Q12 CIE D / Q13 3-Segment Film Curve) |
| **Phase 3.5** | Highlight Roll-off C² | ✅ **完成** (tanh 压缩, CPU+GPU) |
| **Phase 4** | 架构清理 | ✅ **全部完成** (Q9/Q14/Q15/Q17/Q18/Q19/Q20) |
| **Phase 4.6** | 回归测试 | ✅ **完成** (97 tests, 0 failures) |

---

## 目录

1. [审计总览与优先级矩阵](#1-审计总览与优先级矩阵)
2. [A - 曲线插值算法研究与升级计划](#2-a---曲线插值算法研究与升级计划)
3. [B - CPU/GPU 一致性问题](#3-b---cpugpu-一致性问题)
4. [C - 计算公式问题](#4-c---计算公式问题)
5. [D - 代码结构与架构问题](#5-d---代码结构与架构问题)
6. [E - 性能问题](#6-e---性能问题)
7. [F - 缺失功能](#7-f---缺失功能)
8. [详细修复计划与执行顺序](#8-详细修复计划与执行顺序)

---

## 1. 审计总览与优先级矩阵

### 问题统计

| 严重度 | 数量 | 说明 |
|--------|------|------|
| 🔴 Critical | 3 | CPU/GPU 渲染结果差异大，用户可见 |
| 🟡 Medium | 14 | 精度/公式/架构问题，影响画质或可维护性 |
| 🟢 Low | 5 | 代码质量、潜在优化 |

### 优先级矩阵

| # | 严重度 | 分类 | 问题简述 | 位置 | 状态 |
|---|--------|------|----------|------|------|
| **Q1** | 🔴 | CPU/GPU 一致性 | GPU WB 使用传统线性模型，CPU 使用开尔文模型 | `gpu-renderer.js:11-37` | ✅ 已修复 |
| **Q2** | 🔴 | CPU/GPU 一致性 | HSL 权重函数: CPU 余弦平滑 vs GPU 线性衰减 | `filmLabHSL.js:157` vs `gpu-renderer.js:197` | ✅ 已修复 |
| **Q3** | 🔴 | CPU/GPU 一致性 | HSL 色相中心: 3 处定义不同 (Purple/Magenta) | `filmLabHSL.js`, `gpu-renderer.js`, `RenderCore.js` | ✅ 已修复 |
| **Q4** | 🟡 | CPU/GPU 一致性 | Split Toning: CPU lerp-to-tint vs GPU multiply blend | `filmLabSplitTone.js:220` vs `gpu-renderer.js:305` | ✅ 已修复 |
| **Q5** | 🟡 | CPU/GPU 一致性 | Split Toning 亮度系数: CPU Rec.709 vs GPU Rec.601 | 同上 | ✅ 已修复 |
| **Q6** | 🟡 | CPU/GPU 一致性 | HSL 饱和度: CPU 非对称映射 vs GPU 乘法 | `filmLabHSL.js:256` vs `gpu-renderer.js` | ✅ 已修复 |
| **Q7** | 🟡 | CPU/GPU 一致性 | HSL 明度: CPU 非线性 vs GPU 线性加法 | `filmLabHSL.js:265` vs `gpu-renderer.js` | ✅ 已修复 |
| **Q8** | 🟡 | Bug | `_hasCurves` 默认检查使用 {0,0}→{1,1} 但实际默认为 {0,0}→{255,255} | `RenderCore.js:1080-1082` | ✅ 已修复 |
| **Q9** | 🟡 | Bug | `getGLSLUniforms` 对 exposure 预除以 50，GPU shader 再除以 50 | `RenderCore.js` getGLSLUniforms | ✅ 已修复 (注释澄清) |
| **Q10** | 🟡 | 视觉质量 | 曲线插值: Fritsch-Carlson 单调约束导致 S 曲线扁平化 | `filmLabCurves.js` | ✅ 已修复 (Natural Cubic Spline) |
| **Q11**| 🟡 | 公式精度 | 对比度公式在 sRGB 0.5 处操作，非感知中灰 | `filmLabToneLUT.js`, `RenderCore.js`, `glsl-shared.js`, `FilmLabWebGL.js` | ✅ 已修复 |
| **Q12** | 🟡 | 物理精度 | WB 开尔文模型: Tanner Helland 近似，6600K 处有导数不连续 | `filmLabWhiteBalance.js` | ✅ 已修复 |
| **Q13** | 🟡 | 物理精度 | Film Curve: 单通道 gamma，无 toe/shoulder，无逐通道 gamma | `filmLabCurve.js`, `filmLabConstants.js`, `glsl-shared.js`, `FilmLabWebGL.js` | ✅ 已修复 |
| **Q14** | 🟡 | CPU 一致性 | processPixel (8-bit) 缺少 highlight roll-off | `RenderCore.js` processPixel | ✅ 已修复 |
| **Q15** | 🟡 | 架构 | GPU 渲染器内含重复 WB 实现、HSL/SplitTone 重复 3 份 | `gpu-renderer.js` | ✅ 已修复 (glsl-shared.js 模块化) |
| **Q16** | 🟡 | 架构 | math/ 模块多数函数未被调用 | `packages/shared/render/math/` | 🔲 保留 (Phase 3 备用) |
| **Q17** | 🟡 | 性能 | HSL `Object.entries()` 在每像素内调用 | `filmLabHSL.js:218` | ✅ 已修复 (HSL_CHANNELS_ENTRIES 缓存) |
| **Q18** | 🟢 | 性能 | HSL + SplitTone 各自独立做 RGB↔HSL 转换 | `RenderCore.js` processPixelFloat | ✅ 已修复 (prepareSplitTone 预计算) |
| **Q19** | 🟢 | 性能 | GPU 每帧重建 shader program + textures | `gpu-renderer.js` | ✅ 已修复 (getOrCreateProgram 缓存) |
| **Q20** | 🟢 | 代码质量 | CpuRenderService 双重注册事件处理 | `CpuRenderService.js:46,62` | ✅ 已修复 |
| **Q21** | 🟢 | 缺失功能 | 全管线在 sRGB gamma 空间操作 (非线性光) | 全局 | 🔲 长期路线图 |
| **Q22** | 🟢 | 缺失功能 | 无 ICC 色彩管理 / 色域映射 | 全局 | 🔲 长期路线图 |

---

## 2. A - 曲线插值算法研究与升级计划

### 2.1 当前实现分析 — ✅ 已替换为自然三次样条

> **完成**: `filmLabCurves.js` 完全重写。Thomas 算法求解三对角系统，自然边界条件 ($m''=0$)，可选 Fritsch-Carlson 单调约束 (`monotoneClamp` 参数)，二分查找定位段。新增 `buildCurveLUTFloat()` → `Float32Array(1024)` 高精度采样。`RenderCore.processPixelFloat()` 已切换至浮点 LUT 路径。

**文件**: `packages/shared/filmLabCurves.js`

当前使用 **Fritsch-Carlson 单调三次 Hermite 样条** (Monotone Cubic Hermite Spline)：

```
算法流程:
1. 计算相邻控制点的斜率 δ_k = (y_{k+1} - y_k) / (x_{k+1} - x_k)
2. 使用加权调和平均计算切线: m_k = 3(δ_{k-1} + δ_k) / ((2δ_k + δ_{k-1})/δ_{k-1} + (δ_k + 2δ_{k-1})/δ_k)
3. 单调性约束: 若 δ_{k-1} 和 δ_k 异号，则 m_k = 0
4. 三次 Hermite 多项式插值
```

**优点**:
- ✅ 保证单调性 (控制点之间不会出现过冲 overshoot)
- ✅ C¹ 连续 (一阶导数连续)
- ✅ 数值稳定，不会产生震荡

**缺点**:
- ❌ **过冲抑制过于激进**: 在 S 曲线拐点处，切线被强制为 0，导致曲线在拐点附近出现可见的"平肩"(flat shoulder)
- ❌ **缺乏"pop"感**: 与 Lightroom 相比，相同控制点位置产生的 S 曲线对比度更低
- ❌ **边界切线不平滑**: 端点切线直接取相邻段斜率，而非自然边界条件 (second-derivative-zero)
- ❌ **LUT 精度固定为 8-bit**: `buildCurveLUT()` 输出 `Uint8Array(256)`，当曲线变化平缓时会产生色阶断裂

### 2.2 LR/PS 的曲线实现

#### Adobe Lightroom (Camera Raw)
- 使用 **参数化曲线** (Parametric Tone Curve) + **点曲线** (Point Curve)
- 参数化曲线: 4 个区域 (Highlights / Lights / Darks / Shadows)，通过调整区域分割点和升降来改变 S 曲线形状
- 点曲线: **自然三次样条** (Natural Cubic Spline)，允许在拐点处有受控的过冲
- 内部使用 **ProPhoto RGB 线性光空间** 进行曲线运算
- 曲线分辨率远高于 256 级 (float 精度连续求值)

#### Adobe Photoshop
- 使用 **约束自然三次样条** (Constrained Natural Cubic Spline)
- 允许轻微过冲以产生更自然的曲线形状
- 端点使用 **not-a-knot** 或 **自然边界条件** (二阶导数为零)
- 早期版本使用 Catmull-Rom 样条 (Cardinal spline, tension=0)

#### 各算法对比

| 特性 | Fritsch-Carlson (当前) | 自然三次样条 (LR/PS) | Catmull-Rom |
|------|----------------------|---------------------|-------------|
| 连续性 | C¹ | C² | C¹ |
| 过冲 | ❌ 完全禁止 | ✅ 允许受控过冲 | ⚠️ 可能过冲 |
| 拐点表现 | 平肩 | 自然过渡 | 较自然 |
| 边界行为 | 一阶斜率复制 | 二阶导数为零 | 需额外控制点 |
| 局部控制 | ✅ 修改一点只影响邻域 | ⚠️ 全局耦合 (需三对角求解) | ✅ 局部 |
| 物理直觉 | 像拉橡皮筋 | 像最小能量弯曲 | 像匀速通过 |

### 2.3 升级计划

#### Phase 1: 混合策略 — 自然三次样条 + 可选单调约束

**目标**: 匹配 LR/PS 的曲线行为，同时保留防震荡安全网

```javascript
// 新的 createSpline 实现策略:
// 1. 用三对角矩阵法 (Thomas algorithm) 求解自然三次样条切线
// 2. 可选: 对明显单调的区间启用 Fritsch-Carlson 修正 (防止过冲超过阈值)
// 3. 端点使用自然边界条件 (m''(0) = 0, m''(n) = 0)

function createNaturalSpline(xs, ys, options = {}) {
  const monotoneClamp = options.monotoneClamp ?? false;
  const maxOvershoot = options.maxOvershoot ?? 0.05; // 允许 5% 过冲
  
  // Step 1: Thomas algorithm for tridiagonal system
  // Step 2: Optional Fritsch-Carlson monotonicity correction
  // Step 3: Return evaluator function
}
```

**改动文件**: `packages/shared/filmLabCurves.js`

**数学基础**:
自然三次样条需要求解三对角线性方程组:

$$
\begin{bmatrix} 2 & 1 & & \\ 1 & 4 & 1 & \\ & \ddots & \ddots & \ddots \\ & & 1 & 2 \end{bmatrix}
\begin{bmatrix} m_0 \\ m_1 \\ \vdots \\ m_n \end{bmatrix}
= 3\begin{bmatrix} \delta_0 \\ \delta_0 + \delta_1 \\ \vdots \\ \delta_{n-1} \end{bmatrix}
$$

Thomas 算法 $O(n)$ 前向消元 + 回代即可求解。

#### Phase 2: Float 精度曲线 LUT

将 `buildCurveLUT()` 从 `Uint8Array(256)` 升级为:
- CPU: `Float32Array(1024)` 或直接连续求值 (无 LUT)
- GPU: `Float32Array(256)` 上传为浮点纹理 (`R32F` 或 `R16F`)

#### Phase 3: GPU 曲线纹理升级

将 GPU 的 `toneCurveTex` 从 `UNSIGNED_BYTE` 升级为 `FLOAT`/`HALF_FLOAT`:
```javascript
// 当前:
gl.texImage2D(gl.TEXTURE_2D, 0, gl.LUMINANCE, 256, 1, 0, gl.LUMINANCE, gl.UNSIGNED_BYTE, lut);
// 目标:
gl.texImage2D(gl.TEXTURE_2D, 0, gl.R32F, 1024, 1, 0, gl.RED, gl.FLOAT, floatLut);
```

---

## 3. B - CPU/GPU 一致性问题

### Q1 🔴 GPU WB 使用传统线性模型 — ✅ 已修复

> **修复**: 删除 `gpu-renderer.js` 中 35 行的 `computeWBGains()` 内联函数，替换为 `require('../packages/shared/filmLabWhiteBalance')` 导入。GPU 现在使用与 CPU 完全相同的开尔文色温模型计算 WB gains。

**位置**: `electron-gpu/gpu-renderer.js` L11-37

**问题**: GPU 渲染器内有一份**完全独立的** `computeWBGains()` 函数，使用**传统线性模型**:
```javascript
// GPU (传统模型):
r = red * (1 + t * 0.5 + n * 0.3)
g = green * (1 - n * 0.5)
b = blue * (1 - t * 0.5 + n * 0.3)
```

而共享模块 `filmLabWhiteBalance.js` 使用**开尔文色温模型** (Tanner Helland):
```javascript
// CPU (开尔文模型):
targetKelvin = baseKelvin + sliderValue * kelvinPerUnit
[rTemp, gTemp, bTemp] = kelvinToRGB(targetKelvin)
gains = D65_reference / target * tintCorrection
```

**影响**: 任何非零色温/色调调整，GPU 预览和 CPU 导出的颜色**完全不同**。

**修复方案**:
1. 删除 `gpu-renderer.js` 中的 `computeWBGains()` 函数
2. 从 `RenderCore.getGLSLUniforms()` 传入预计算的 WB gains (已支持 `u_wbGainR/G/B`)
3. GPU shader 仅做 `c.r *= u_wbGainR` 等简单乘法

---

### Q2 🔴 HSL 权重函数不一致 — ✅ 已修复

> **修复**: GPU shader (FS_GL2 + FS_GL1) 的 `hslChannelWeight()` 改为余弦平滑 `0.5*(1.0+cos(t*PI))`，支持 per-channel `hueRange` 参数，与 CPU `filmLabHSL.js` 完全一致。同时更新 `RenderCore.getHSLGLSL()` 静态方法。

**CPU** (`filmLabHSL.js:155-162`): **余弦平滑过渡**
```javascript
const t = distance / channel.hueRange;
return 0.5 * (1 + Math.cos(t * Math.PI)); // 在中心和边界处导数为零
```

**GPU** (`gpu-renderer.js:197`): **线性衰减**
```glsl
return max(0.0, 1.0 - dist / 30.0); // 在中心处导数不连续
```

**视觉差异**: 线性衰减在色相过渡区产生可见的**色带** (banding)，余弦过渡更平滑。

**修复方案**: 统一使用余弦平滑
```glsl
float hslChannelWeight(float hue, float centerHue, float range) {
  float dist = min(abs(hue - centerHue), 360.0 - abs(hue - centerHue));
  if (dist >= range) return 0.0;
  float t = dist / range;
  return 0.5 * (1.0 + cos(t * 3.14159265));
}
```

---

### Q3 🔴 HSL 色相中心不一致 — ✅ 已修复

> **修复**: 统一所有位置为 Purple=280°, Magenta=330°（以 `filmLabHSL.js` 为真实来源）。修改了 `gpu-renderer.js` FS_GL2/FS_GL1 shader 和 `RenderCore.js` getHSLGLSL() 中的硬编码值。

三处定义的 Purple 和 Magenta 色相中心值**各不相同**:

| 源 | Purple | Magenta |
|----|--------|---------|
| `filmLabHSL.js` (CPU) | **280°** | **330°** |
| `gpu-renderer.js` GL2/GL1 shader | **270°** | **300°** |
| `RenderCore.js` static GLSL | **280°** | **320°** |

**影响**: 调整紫色/品红通道时，CPU 和 GPU 渲染结果的**受影响像素范围不同**。

**修复方案**: 以 `filmLabHSL.js` (CPU 共享模块) 为真实来源:
1. 统一 Purple = 280°, Magenta = 330°
2. GPU shader 和 RenderCore GLSL 均改为引用 `HSL_CHANNELS` 常量
3. GPU shader 通过 uniform 传入色相中心值，而非硬编码

---

### Q4 🟡 Split Toning 混合算法不一致 — ✅ 已修复

> **修复**: GPU shader (FS_GL2 + FS_GL1) 的 `applySplitTone()` 从 multiply blend `mix(result, result*tint/0.5, w*s)` 改为 lerp-to-tint `result += (tint - result) * strength * 0.3`，与 CPU `filmLabSplitTone.js` 一致。同时添加 Hermite smoothstep 区域权重 (shadow/midtone/highlight 三区)。

**CPU** (`filmLabSplitTone.js:220-222`): **Lerp-to-tint** (向着色颜色插值)
```javascript
outR = outR + (tintColor[0] - outR) * strength * 0.3;
```

**GPU** (`gpu-renderer.js:305`): **乘法混合** (Multiply blend)
```glsl
result = mix(result, result * shadowTint / 0.5, weight * saturation);
```

**视觉差异**:
- CPU: 像素颜色向着色点移动，保留部分原始色彩，效果更柔和
- GPU: 乘法混合改变亮度和色调，在阴影区会显著变暗，在高光区可能过亮 (除以 0.5 = 乘以 2)

**修复方案**: 统一使用 Lerp 方式 (更符合 Lightroom 行为):
```glsl
// GPU 改为:
result = mix(result, tintColor, weight * saturation * 0.3);
```

---

### Q5 🟡 Split Toning 亮度系数不一致 — ✅ 已修复

> **修复**: GPU shader 的 `calcLuminance()` 从 Rec.601 `(0.299, 0.587, 0.114)` 改为 Rec.709 `(0.2126, 0.7152, 0.0722)`，与 CPU `filmLabSplitTone.js` 一致。同时更新 `RenderCore.getSplitToneGLSL()`。

| 源 | 亮度系数 |
|----|----------|
| CPU (`filmLabSplitTone.js:63`) | **Rec.709**: (0.2126, 0.7152, 0.0722) |
| GPU (both shaders) | **Rec.601**: (0.299, 0.587, 0.114) |

**影响**: 阴影/高光分区的分割点不同，红色/绿色物体的着色区域偏移。

**修复方案**: 统一使用 **Rec.709** (sRGB 标准):
```glsl
float calcLuminance(vec3 c) {
  return 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;
}
```

---

### Q6-Q7 🟡 HSL 饱和度/明度算法不一致 — ✅ 已修复

> **修复**: GPU shader (FS_GL2 + FS_GL1) 和 `RenderCore.getHSLGLSL()` 均改为非对称映射：
> - 饱和度正值: `s + (1.0-s)*adj` (软限制趋近1)，负值: `s*(1.0+adj)` (线性缩小)
> - 明度正值: `l + (1.0-l)*adj*0.5` (非线性趋近白色)，负值: `l*(1.0+adj*0.5)` (线性缩暗)
> - 添加权重归一化: `if(totalWeight > 1.0)` 时所有调整量除以 totalWeight

**饱和度**:
- CPU: 正值 `s + (1-s) * adj` (软限制趋近1)，负值 `s * (1+adj)` (线性缩小)
- GPU: `s * totalSatMult` (直接乘法，可超过1)

**明度**:
- CPU: 正值 `l + (1-l) * adj * 0.5` (非线性，趋近白色)，负值 `l * (1 + adj*0.5)` (线性缩暗)
- GPU: `l + totalLumShift` (直接加法)

**修复方案**: GPU 改为匹配 CPU 的非对称映射逻辑。

---

## 4. C - 计算公式问题

### Q8 🟡 `_hasCurves` 默认值检查错误 — ✅ 已修复

> **修复**: 将 `pts[1]?.x === 1 && pts[1]?.y === 1` 改为 `pts[1]?.x === 255 && pts[1]?.y === 255`。验证：默认曲线现在正确返回 `false`，跳过不必要的 LUT 采样。

**位置**: `RenderCore.js:1080-1082`

```javascript
const isDefault = (pts) => {
  if (!pts || pts.length !== 2) return false;
  return pts[0]?.x === 0 && pts[0]?.y === 0 && pts[1]?.x === 1 && pts[1]?.y === 1;
  //                                                       ^^^              ^^^
  // 错误: 实际默认值是 {x:0,y:0} → {x:255,y:255}
};
```

**根因**: `filmLabConstants.js:83` 定义 `DEFAULT_CURVES` 使用 0-255 坐标:
```javascript
const DEFAULT_CURVES = {
  rgb: [{ x: 0, y: 0 }, { x: 255, y: 255 }],  // 0-255 范围
  ...
};
```

**影响**: `_hasCurves()` 总返回 `true` (因为 255 ≠ 1)，导致**每次渲染都执行不必要的曲线 LUT 采样**。

**修复**:
```javascript
return pts[0]?.x === 0 && pts[0]?.y === 0 && pts[1]?.x === 255 && pts[1]?.y === 255;
```

---

### Q9 🟡 `getGLSLUniforms` Exposure 双重除法陷阱 — ✅ 已修复 (注释澄清)

> **修复**: 在 `getGLSLUniforms` 中添加详细注释，说明 `u_exposure` 是预除以 50 的值（即 `pow(2, u_exposure)` 即为曝光增益），同时记录 `gpu-renderer.js` 直接使用原始 `params.exposure` 并在 shader 内部做 `pow(2, u_exposure / 50.0)` 的等价用法。两种路径结果等价，无实际 bug。

**位置**: `RenderCore.js` getGLSLUniforms

`getGLSLUniforms` 输出 `u_exposure = exposure / 50`，但 GPU shader 中 `float expFactor = pow(2.0, u_exposure / 50.0)`。

**当前情况**: GPU 渲染器的 `renderImage()` 直接读取 `params.exposure` (原始值)，绕过了 `getGLSLUniforms`，所以**实际上不会触发此问题**。但 API 合约有歧义。

**修复**: 在 `getGLSLUniforms` 中注释明确 `u_exposure` 的含义:
```javascript
u_exposure: p.exposure ?? 0, // 原始滑块值 (-100 to 100)，shader 中做 /50
```

---

### Q11 🟡 对比度公式的中点偏差 — ✅ 已修复

> **修复**: 新增 `CONTRAST_MID_GRAY = 0.46` 常量 (`filmLabConstants.js`)，对应 18% 反射率的 sRGB 值。
> 全部 4 条渲染路径统一使用此常量作为对比度枢轴点：
> - CPU 8-bit: `filmLabToneLUT.js` — `(val - CONTRAST_MID_GRAY) * factor + CONTRAST_MID_GRAY`
> - CPU float: `RenderCore.processPixelFloat()` — 同上
> - GPU export: `glsl-shared.js` — `float midGray = 0.46; c = (c - midGray) * factor + midGray`
> - Client WebGL preview: `FilmLabWebGL.js` — `clamp(f * (v - 0.46) + 0.46, 0.0, 1.0)`

**公式**: `factor = (259 * (contrast + 255)) / (255 * (259 - contrast))`

此公式围绕 sRGB 值 0.5 (即 128/255) 操作。然而:
- **感知中灰** ≈ 18% 反射率 = 线性 0.18 = sRGB ~0.46
- 当前中点 0.5 (sRGB) 对应线性 ~0.214，偏向高光
- **Lightroom** 的对比度基于参数化曲线调整，围绕 ~18% 灰操作

**影响**: 与 LR 相比，对比度增加时高光压缩更多、阴影提升更少。

**优化方案** (Phase 2):
```javascript
// 围绕感知中灰的对比度:
const midGray = 0.46; // sRGB 空间的 18% 灰
const adjusted = midGray + (value - midGray) * factor;
```

---

### Q12 🟡 WB 开尔文模型精度 — ✅ 已修复

> **修复**: `filmLabWhiteBalance.js` 的 `kelvinToRGB()` 完全重写为 CIE D 光源系列 (CIE 015:2004)。
> - 4000K–25000K: CIE 昼光色度公式 (两段分界 7000K，C¹ 连续)
> - <4000K: Kang et al. (2002) Planckian locus
> - 3500K–4000K: Hermite 平滑过渡 (消除不连续)
> - CIE xyY → XYZ → sRGB 转换 (IEC 61966-2-1 D65 矩阵)
> - Max-channel 归一化 + 负值裁剪 (色域外温度)
>
> 6600K 处的导数不连续已完全消除。精度从 Tanner Helland 的 CRT 拟合提升到 CIE 标准色度学。

**当前**: ~~Tanner Helland 算法 (2012)，基于 CRT 时代数据集的分段多项式/对数拟合。~~  
**已替换为**: CIE D illuminant series + Kang Planckian locus (CIE 015:2004).

**问题**:
1. 6600K (= temp/100 = 66) 处红色通道从 255 切换到幂函数，**导数不连续**
2. Tint 轴未与色温轴正交 (在 CIE u'v' 图上不垂直于 Planckian 轨迹)
3. 精度对于胶片扫描足够，但不适合严格的色度学工作

**优化方案** (Phase 3): 替换为 CIE D 光源查表:
```javascript
// 使用预计算的 D 光源 SPD → XYZ → sRGB 查找表 (1000K-25000K, 100K 步长)
// 双线性插值，精度远超 Tanner Helland
```

---

### Q13 🟡 Film Curve 物理精度 — ✅ 已修复

> **修复**: Film Curve 升级为三段式 H&D 模型 + 逐通道 gamma：
>
> **三段式 S 曲线** (`filmLabCurve.js`):
> - Toe 区 (0 ~ 0.25×toe): γ_toe = γ_main × 1.5 (压缩暗部，模拟胶片曝光不足区)
> - Straight 段 (中间): γ_main (线性段，经典幂函数)
> - Shoulder 区 (1-0.25×shoulder ~ 1): γ_sh = γ_main × 0.6 (饱和高光，模拟胶片感光乳剂饱和)
> - Hermite smoothstep 过渡 (tw=0.08)，C¹ 连续无缝衔接
>
> **逐通道 Gamma** (`filmLabConstants.js`):
> - FILM_PROFILES 每个胶片配置文件增加 gammaR/G/B/toe/shoulder 字段
> - 彩色负片 (C-41): R≈0.58, G≈0.60, B≈0.55 (真实乳剂层灵敏度差异)
> - 黑白胶片: 单一 gamma (gammaR/G/B 未定义，回退到 main gamma)
> - Default profile: toe=0, shoulder=0 (向后兼容，输出与旧单 gamma 一致)
>
> **全 4 条路径同步**:
> - CPU float: `RenderCore.processPixelFloat()` → `applyFilmCurveFloat()` per channel
> - CPU 8-bit: `applyFilmCurve()` 支持 toe/shoulder 参数
> - GPU export: `glsl-shared.js` — `threeSegGamma()` + per-channel gamma uniforms
> - Client WebGL: `FilmLabWebGL.js` — 镜像实现 `filmHermite()` + `threeSegGamma()` + `applyFilmCurveChannel()`
>
> **参数传递链**: FilmLab.jsx 从 FILM_PROFILES 读取 → 传入 processImageWebGL / GPU export / HQ export → RenderCore

**当前模型**: ~~归一化密度 → 幂函数 (gamma) → 反归一化~~  
**已替换为**: 三段式 H&D 模型 (toe/straight/shoulder) + 逐通道 gamma

**问题**:
1. 真实 H&D 曲线是 **S 型** (sigmoid)，包含趾部 (toe)、直线段 (straight-line)、肩部 (shoulder)；当前只有直线段
2. 真实彩色负片 (C-41) 各层 gamma 不同 (典型: R≈0.6, G≈0.65, B≈0.55)；当前单一 gamma
3. `Math.max(0.001, value)` 限制了最大密度为 3.0；部分胶片 dMax > 3.0

**优化方案** (Phase 3):
```javascript
// 三段式 H&D 模型:
// toe: gamma_toe < 1 (压缩)
// straight: gamma_main (线性段)  
// shoulder: gamma_shoulder > 1 (饱和)
// 各通道独立 gamma
```

---

## 5. D - 代码结构与架构问题

### Q15 🟡 GPU 渲染器代码重复 — ✅ 已修复

> **修复**: 创建 `electron-gpu/glsl-shared.js` 模块，将所有 GLSL 代码提取为可组合的字符串常量：
> - `GLSL_SHARED_UNIFORMS` — 所有 uniform 声明
> - `GLSL_COLOR_FUNCTIONS` — rgb2hsl / hue2rgb / hsl2rgb
> - `GLSL_HSL_ADJUSTMENT` — 8 通道余弦权重 + 非对称 sat/lum
> - `GLSL_SPLIT_TONE` — Rec.709 亮度 + Hermite smoothstep 三区混合
> - `GLSL_FILM_CURVE` — H&D 密度模型
> - `buildShaderMain(isGL2)` — 参数化 main()，处理 GL2/GL1 差异
> - `buildFragmentShader(isGL2)` — 完整 shader 组合
>
> `gpu-renderer.js` 中 ~800 行重复 GLSL 替换为 2 行调用：
> ```js
> const FS_GL2 = buildFragmentShader(true);
> const FS_GL1 = buildFragmentShader(false);
> ```
> 同时 Highlight Roll-Off 升级为 tanh C² 连续版本（与 CPU 一致）。

---

### Q16 🟡 math/ 模块未被充分利用

| 函数 | 模块 | 使用状态 |
|------|------|----------|
| `linearToSrgb` | color-space.js | ❌ 未使用 |
| `srgbToLinear` | color-space.js | ❌ 未使用 (render-service.js 已移除导入) |
| `evToGain` | exposure.js | ❌ 未使用 |
| `applyExposure` | exposure.js | ❌ 未使用 |
| `applyWhiteBalance` | exposure.js | ❌ 未使用 |
| `reinhard` | tone-curves.js | ❌ 未使用 |
| `reinhardExtended` | tone-curves.js | ❌ 未使用 |
| `filmicACES` | tone-curves.js | ❌ 未使用 |
| `highlightRollOff` | tone-curves.js | ✅ 被 processPixelFloat 引用 |

**建议**: 保留为未来线性光工作流的基础。在 Phase 3 (线性光重构) 时统一引用。

---

## 6. E - 性能问题

### Q17 🟡 HSL 每像素 `Object.entries()` — ✅ 已修复

> **修复**: 在 `filmLabHSL.js` 模块顶层添加 `const HSL_CHANNELS_ENTRIES = Object.entries(HSL_CHANNELS)` 缓存。两处循环（低饱和度路径和主调整路径）均改用 `HSL_CHANNELS_ENTRIES`，避免每像素创建临时数组。

**位置**: `filmLabHSL.js:218`

```javascript
for (const [channelKey, channel] of Object.entries(HSL_CHANNELS)) {
```

对于 500 万像素图片，每像素调用 `Object.entries()` 创建临时数组。

**修复**: 将 `HSL_CHANNELS` 预转为数组:
```javascript
const HSL_CHANNELS_ARRAY = Object.entries(HSL_CHANNELS); // 模块加载时执行一次
// 循环中使用:
for (const [channelKey, channel] of HSL_CHANNELS_ARRAY) {
```

### Q18 🟢 HSL + SplitTone 重复色彩空间转换 — ✅ 已修复

> **分析**: SplitTone 实际上**不做** RGB↔HSL 转换 — 它只用 Rec.709 dot product 计算亮度（3 FLOP），
> 在 RGB 空间做 lerp 混合。唯一的浪费是每像素调用 3 次 `hslToRgb()` 来转换 tint 颜色参数。
>
> **修复**: 添加 `prepareSplitTone(params)` 工厂函数，在帧级别预计算 tint RGB 颜色。
> 逐像素处理使用 `applySplitToneFast(r, g, b, ctx)` 跳过重复的 hslToRgb。
> RenderCore.prepareLUTs() 和 filmlab-core.prepareLUTs() 均已更新。

### Q19 🟢 GPU 每帧重建 Shader Program — ✅ 已修复

> **修复**: 在 `gpu-renderer.js` 添加模块级缓存 `_cachedProgGL2` / `_cachedProgGL1`，
> 通过 `getOrCreateProgram(gl, isWebGL2)` 按需编译并缓存。
> runPipeline 不再每帧 createProgram/deleteProgram。
> 提供 `invalidateProgramCache()` 用于 GL 上下文丢失时清理。

---

## 7. F - 缺失功能

### Q21 🟢 全管线 sRGB Gamma 空间操作

当前全链路在 sRGB gamma 空间中操作（输入 sRGB → 处理 → 输出 sRGB）。

严格来说:
- **曝光** 应在线性光下做乘法 (gamma 空间乘法 = 非线性响应)
- **白平衡** 应在线性光下做增益 (gamma 空间会引入色彩偏移)
- **对比度** 在感知空间操作是合理的

**当前做法的合理性**: 由于 GPU 纹理以 sRGB 输入 (无 `SRGB` 内部格式)，GPU 天然在 gamma 空间操作。CPU 管线与之匹配是**正确的一致性决策**。

**长期路线图**: 如需对齐 LR 精度:
1. RAW 解码输出 16-bit Linear
2. 管线入口 sRGBToLinear
3. WB → Exposure → Color Matrix (线性光)
4. linearToSrgb
5. Contrast → Shadows/Highlights → Curves → HSL → SplitTone (感知空间)
6. 输出

---

## 8. 详细修复计划与执行顺序

### Phase 1: CPU/GPU 一致性修复 (紧急 — 影响用户体验)

**预计工时**: 2-3 天
**目标**: 消除 GPU 预览与 CPU 导出之间的可见差异

| 步骤 | 工作 | 涉及文件 | 状态 |
|------|------|----------|------|
| 1.1 | **Q1**: 删除 gpu-renderer.js 中的 computeWBGains，改用共享模块预计算增益 | `gpu-renderer.js`, `RenderCore.js` | ✅ |
| 1.2 | **Q3**: 统一 HSL 色相中心为 Purple=280°, Magenta=330° | `gpu-renderer.js` (GL2+GL1) | ✅ |
| 1.3 | **Q2**: GPU HSL 权重改为余弦平滑，支持 per-channel hueRange | `gpu-renderer.js` (GL2+GL1) | ✅ |
| 1.4 | **Q4+Q5**: Split Toning 统一为 lerp + Rec.709 | `gpu-renderer.js` (GL2+GL1) | ✅ |
| 1.5 | **Q6+Q7**: HSL 饱和度/明度统一为 CPU 的非对称映射 | `gpu-renderer.js` (GL2+GL1) | ✅ |
| 1.6 | **Q8**: 修复 `_hasCurves` 默认值检查 | `RenderCore.js` | ✅ |
| 1.7 | 全链路回归测试: 对比 CPU / GPU 在标准测试图上的 RMSE | 新建 `tools/render-comparison.js` | 🔲 |

### Phase 2: 曲线算法升级 (中优先 — 影响画质)

**预计工时**: 3-4 天
**目标**: 曲线响应匹配 LR/PS

| 步骤 | 工作 | 涉及文件 | 状态 |
|------|------|----------|------|
| 2.1 | 实现自然三次样条 `createNaturalSpline()` (Thomas 算法) | `filmLabCurves.js` | ✅ |
| 2.2 | 添加可选单调约束 (`monotoneClamp` 参数) | `filmLabCurves.js` | ✅ |
| 2.3 | 升级 `buildCurveLUT` 输出为 `Float32Array(1024)` | `filmLabCurves.js` | ✅ |
| 2.4 | 更新 GPU `toneCurveTex` 为 RGBA32F 浮点纹理 (1024×1) | `gpu-renderer.js`, `filmLabCurves.js`, `FilmLab.jsx` | ✅ |
| 2.5 | 更新 `_sampleCurveLUTFloat()` 支持 1024 级 | `RenderCore.js` | ✅ (`_sampleCurveLUTFloatHQ`) |
| 2.6 | A/B 测试: 与 LR 相同控制点的曲线形状对比 | 手动验证 | 🔲 |

### Phase 3: 公式精度提升 (低优先 — 精益求精)

**预计工时**: 5-7 天
**目标**: 公式级别对齐专业工具

| 步骤 | 工作 | 涉及文件 | 状态 |
|------|------|----------|------|
| 3.1 | **Q11**: 对比度公式改为围绕感知中灰 (0.46) | `filmLabConstants.js`, `filmLabToneLUT.js`, `RenderCore.js`, `glsl-shared.js`, `FilmLabWebGL.js` | ✅ |
| 3.2 | **Q12**: WB 升级为 CIE D 光源系列 | `filmLabWhiteBalance.js` | ✅ |
| 3.3 | **Q13**: Film Curve 三段式 H&D + 逐通道 gamma | `filmLabCurve.js`, `filmLabConstants.js`, `glsl-shared.js`, `FilmLabWebGL.js`, `gpu-renderer.js`, `RenderCore.js`, `FilmLab.jsx` | ✅ |
| 3.4 | **Q14**: processPixel (8-bit) 添加 highlight roll-off | `RenderCore.js` | ✅ |
| 3.5 | Highlight Roll-off C² 连续性修复 (tanh 压缩，CPU+GPU) | `math/tone-curves.js`, `glsl-shared.js` | ✅ |

### Phase 4: 架构清理 (持续)

| 步骤 | 工作 | 涉及文件 | 状态 |
|------|------|----------|------|
| 4.1 | **Q15**: 提取公共 GLSL 函数，消除 GL2/GL1 重复 | `glsl-shared.js`, `gpu-renderer.js` | ✅ |
| 4.2 | **Q17**: HSL `Object.entries` 优化 | `filmLabHSL.js` | ✅ |
| 4.3 | **Q18**: SplitTone 预计算 tint 颜色 (prepareSplitTone) | `filmLabSplitTone.js`, `RenderCore.js`, `filmlab-core.js` | ✅ |
| 4.4 | **Q19**: GPU program 缓存 (getOrCreateProgram) | `gpu-renderer.js` | ✅ |
| 4.5 | **Q20**: CpuRenderService 清理重复注册 | `CpuRenderService.js` | ✅ |
| 4.6 | 建立自动化回归测试 (97 tests) | `tools/render-regression-test.js` | ✅ |

### 执行总顺序

```
Phase 1 (一致性) ──→ Phase 2 (曲线) ──→ Phase 3 (公式)
                                          ↓
                                    Phase 4 (架构清理，与其他 Phase 并行)
```

---

## 附录 A: 关键文件索引

| 文件 | 用途 | 行数 | 本轮改动 |
|------|------|------|----------|
| `packages/shared/filmLabCurves.js` | 用户曲线 (Natural Cubic Spline) + Float LUT | ~400 | ✅ 完全重写 + buildCompositeFloatCurveLUT |
| `packages/shared/filmLabToneLUT.js` | 色调 LUT (Uint8Array) | 100 | ✅ Q11 mid-gray |
| `packages/shared/filmLabInversion.js` | 负片反转 + 片基校正 | 251 | — |
| `packages/shared/filmLabHSL.js` | HSL 色彩调整 (8通道) | 445 | ✅ Q17 缓存优化 |
| `packages/shared/filmLabSplitTone.js` | 分离色调 (3区) | ~500 | ✅ Q18 prepareSplitTone + applySplitToneFast |
| `packages/shared/filmLabWhiteBalance.js` | 白平衡 (CIE D illuminant) | ~200 | ✅ Q12 完全重写 |
| `packages/shared/filmLabCurve.js` | Film H&D 密度曲线 (三段式) | ~280 | ✅ Q13 三段 S 曲线 + per-ch gamma |
| `packages/shared/filmLabConstants.js` | 常量/默认值/胶片配置 | ~250 | ✅ CONTRAST_MID_GRAY + FILM_PROFILES per-ch |
| `packages/shared/filmlab-core.js` | 核心处理模块 (服务端) | ~370 | ✅ Q18 splitToneCtx |
| `packages/shared/render/RenderCore.js` | 统一渲染核心 | ~1280 | ✅ Q8/Q9/Q11/Q13/Q14 + Float LUT + Q18 |
| `packages/shared/render/math/tone-curves.js` | 色调映射数学 | ~80 | ✅ Phase 3.5 tanh C² roll-off |
| `packages/shared/render/math/` | 数学库 (4 模块) | ~200 | — |
| `electron-gpu/glsl-shared.js` | GLSL 单一来源模块 | ~550 | ✅ Q15 + Q11 mid-gray + Q13 per-ch gamma |
| `electron-gpu/gpu-renderer.js` | GPU WebGL 渲染 | ~440 | ✅ Q1-Q7 + Q15 + Q19 |
| `server/services/render-service.js` | 服务端渲染 | ~410 | — |
| `client/src/services/CpuRenderService.js` | 客户端 CPU 渲染 | ~465 | ✅ Q20 双重注册修复 |
| `tools/render-regression-test.js` | **新建** 回归测试 (97 tests) | ~380 | ✅ Phase 4.6 |

## 附录 B: 曲线算法参考文献

1. **Fritsch & Carlson** (1980). "Monotone Piecewise Cubic Interpolation". SIAM J. Numerical Analysis, 17(2), 238-246.
2. **de Boor, C.** (1978). "A Practical Guide to Splines". Springer.
3. **Wikipedia**: [Cubic Hermite Spline](https://en.wikipedia.org/wiki/Cubic_Hermite_spline) — Catmull-Rom, Cardinal, Monotone 各变体
4. **Wikipedia**: [Monotone Cubic Interpolation](https://en.wikipedia.org/wiki/Monotone_cubic_interpolation) — Fritsch-Carlson 完整算法
5. **Tanner Helland** (2012). [Convert Temperature to RGB](https://tannerhelland.com/2012/09/18/convert-temperature-rgb-algorithm-code.html) — ~~当前 WB 实现~~ (已替换)
6. **Pomax**: [A Primer on Bézier Curves](https://pomax.github.io/bezierinfo/) — §36 Catmull-Rom ↔ Bézier 转换
7. **CIE 015:2004** — Colorimetry, 3rd Edition. CIE D illuminant daylight chromaticity formulas.
8. **Kang, B. et al.** (2002). "Design of advanced color temperature control system for HDTV applications". J. Korean Physical Society, 41(6), 865-871. — Planckian locus chromaticity below 4000K.
9. **IEC 61966-2-1:1999** — sRGB colour space definition. XYZ → sRGB matrix (D65 reference white).
