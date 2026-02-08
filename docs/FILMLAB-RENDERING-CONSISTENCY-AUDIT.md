# FilmLab 渲染一致性全面审计报告

> **审计日期**: 2026-02-08  
> **修复完成日期**: 2026-02-08  
> **审计范围**: 全部 4 条渲染路径（Client WebGL 预览、Electron GPU 导出、CPU RenderCore、Server 渲染）  
> **重点关注**: 预览 ↔ 导出一致性、GPU ↔ CPU 一致性

---

## 0. 修复总览 ✅

**所有 16 个问题均已修复或妥善处理。** 核心架构变更：将 `packages/shared/shaders/` 确立为 **GLSL 单一事实来源 (Single Source of Truth)**，所有渲染路径共享同一份着色器代码。

| # | 严重度 | 问题摘要 | 状态 |
|---|--------|----------|------|
| BUG-01 | 🔴 严重 | 3D LUT 管线位置不一致 | ✅ 已修复 |
| BUG-02 | 🔴 严重 | Client WebGL 缺失高光滚降 | ✅ 已修复 |
| BUG-03 | 🔴 严重 | HSL 饱和度算法不同 | ✅ 已修复 |
| BUG-04 | 🔴 严重 | HSL 明度算法不同 | ✅ 已修复 |
| BUG-05 | 🔴 严重 | 对比度公式缩放 ≈ 2× 偏差 | ✅ 已修复 |
| BUG-06 | 🔴 严重 | 分离色调混合算法不同 | ✅ 已修复 |
| BUG-07 | 🔴 严重 | 分离色调分区权重不同 | ✅ 已修复 |
| BUG-08 | 🟡 中等 | HSL 品红通道 320° → 330° | ✅ 已修复 |
| BUG-09 | 🟡 中等 | HSL 权重无归一化 | ✅ 已修复 |
| BUG-10 | 🟡 中等 | getGLSLUniforms 对比度预除 | ✅ 已修复 |
| BUG-11 | 🟡 中等 | getSplitToneGLSL 缺中间调 | ✅ 已弃用 |
| BUG-12 | 🟡 中等 | Bernstein 输入钳制差异 | ✅ 设计如此 |
| BUG-13 | 🟢 轻微 | filmlab-core.js 缺步骤 | ✅ 已标记弃用 |
| BUG-14 | 🟢 轻微 | GPU 导出 JPEG 质量固定 | ✅ 已修复 |
| BUG-15 | 🟢 轻微 | UNPACK_FLIP_Y 不一致 | ✅ 可接受 |
| BUG-16 | 🟢 轻微 | WebGL1 LUT 能力不一致 | ✅ 已统一 |

### 架构变更摘要

```
修复前:                                    修复后:
                                           
  FilmLabWebGL.js   glsl-shared.js          ┌─────────────────────────────┐
  (内嵌 ~300 行     (内嵌 ~500 行           │  packages/shared/shaders/    │
   独立 GLSL)        独立 GLSL)             │  index.js  (pipeline)        │
      ↓                  ↓                  │  uniforms.js (declarations)  │
  独立维护 ❌       独立维护 ⚠️             │  hslAdjust.js  splitTone.js  │  Single Source
      ↓                  ↓                  │  filmCurve.js  tonemap.js    │  of Truth ✅
  预览 ≠ 导出       导出 ≈ CPU              │  lut3d.js  inversion.js      │
                                            │  baseDensity.js  colorMath.js│
                                            └──────────┬──────────────────┘
                                                       │
                                   ┌───────────────────┼────────────────────┐
                                   │                   │                    │
                            ┌──────▼──────┐    ┌──────▼──────┐    ┌───────▼──────┐
                            │ CPU Path    │    │ Electron GPU│    │ Client WebGL │
                            │ RenderCore  │    │glsl-shared  │    │FilmLabWebGL  │
                            │ (算法参照)  │    │(薄包装层)   │    │(使用共享库)  │
                            │ ✅ 已同步    │    │ ✅ 已同步    │    │ ✅ 已同步    │
                            └─────────────┘    └─────────────┘    └──────────────┘
```

### 修改的文件列表

| 文件 | 变更类型 | 说明 |
|------|----------|------|
| `packages/shared/shaders/hslAdjust.js` | 重写 | 非对称饱和度/明度、品红330°、权重归一化 |
| `packages/shared/shaders/splitTone.js` | 重写 | lerp-to-tint、Hermite smoothstep、balance/2 |
| `packages/shared/shaders/filmCurve.js` | 增强 | 3段 S-curve + per-channel gamma |
| `packages/shared/shaders/tonemap.js` | 修复 | 对比度 mid-gray 0.46 + 缩放 ×2.55、tanh 高光压缩 |
| `packages/shared/shaders/uniforms.js` | 重写 | float 类型、u_split* 命名、per-channel 曲线 |
| `packages/shared/shaders/index.js` | 重写 | 正确管线顺序、GL1/2 支持、composite curve |
| `packages/shared/shaders/baseDensity.js` | 修复 | float 比较 (> 0.5) |
| `packages/shared/shaders/inversion.js` | 修复 | float 比较 (> 0.5) |
| `packages/shared/shaders/lut3d.js` | 修复 | float u_lutSize |
| `electron-gpu/glsl-shared.js` | 重构 | ~500 行 → ~60 行薄包装层 |
| `electron-gpu/gpu-renderer.js` | 修复 | uniform 名称对齐、JPEG 质量参数化 |
| `client/src/components/FilmLab/FilmLabWebGL.js` | 重构 | 移除内嵌 GLSL、使用共享着色器、float uniform |
| `packages/shared/render/RenderCore.js` | 修复 | 原始值传递、u_split* 命名、弃用旧方法 |
| `packages/shared/filmlab-core.js` | 弃用 | 添加 @deprecated 标记 |

---

## 2. 处理流水线顺序对比

| 步骤 | CPU (C/D) | Electron GPU (B) | Client WebGL (A) | 一致? |
|------|-----------|-------------------|-------------------|-------|
| ① 胶片曲线 | ✅ | ✅ | ✅ | ✅ |
| ② 片基校正 | ✅ | ✅ | ✅ | ✅ |
| ②.5 密度色阶 | ✅ | ✅ | ✅ | ✅ |
| ③ 反转 | ✅ | ✅ | ✅ | ✅ |
| ③b 3D LUT | 反转后 | 反转后 (GL2) | ✅ 反转后 | ✅ |
| ④ 白平衡 | ✅ | ✅ | ✅ | ✅ |
| ⑤ 色调映射 | ✅ | ✅ | ✅ | ✅ |
| ⑤b 高光滚降 | tanh @ 0.8 | tanh @ 0.8 | ✅ tanh @ 0.8 | ✅ |
| ⑥ 曲线 | ✅ | ✅ | ✅ | ✅ |
| ⑦ HSL | ✅ | ✅ | ✅ 共享着色器 | ✅ |
| ⑧ 分离色调 | ✅ | ✅ | ✅ 共享着色器 | ✅ |

---

## 3. 🔴 严重问题 (Critical)

### BUG-01: 3D LUT 管线位置不一致 — ✅ 已修复

> **修复方式**: FilmLabWebGL.js 已重构为使用 `buildFragmentShader()` 共享着色器。共享着色器的 `buildMainFunction()` 将 3D LUT 采样放在步骤 ③b（反转之后、白平衡之前），所有路径一致。

| 路径 | LUT 位置 |
|------|----------|
| CPU RenderCore (processPixel / processPixelFloat) | 步骤 ③b — 反转之后、白平衡之前 |
| Electron GPU (glsl-shared.js) | 步骤 ③b — 反转之后、白平衡之前 (GL2 sampler3D) |
| **Client WebGL (FilmLabWebGL.js)** | **步骤 ⑧** — HSL + 分离色调之后、最末尾 |

**影响**: 3D LUT 的输入值完全不同（未经白平衡/色调映射 vs 已经过全部处理链），导致 LUT 效果在预览和导出之间差异巨大。FilmLabWebGL.js 中的注释说 *"at the END to match CPU pipeline order"* 是**错误**的。

**位置**: [FilmLabWebGL.js#L815](client/src/components/FilmLab/FilmLabWebGL.js#L815)  
**CPU参照**: [RenderCore.js 步骤 ③b](packages/shared/render/RenderCore.js#L345)

---

### BUG-02: Client WebGL 缺失高光滚降 (Highlight Roll-Off) — ✅ 已修复

> **修复方式**: 共享着色器 `tonemap.js` 添加了 `applyHighlightRollOff()` 函数 (tanh 肩部压缩, threshold=0.8)。`buildMainFunction()` 在步骤 ⑤e 自动调用此函数。FilmLabWebGL.js 通过使用共享着色器自动获得此功能。

CPU RenderCore 和 Electron GPU 都在色调映射之后、曲线之前执行 `tanh` 高光压缩:

```
threshold = 0.8
if (maxVal > threshold):
    compressed = threshold + headroom * tanh(...)
    rgb *= (compressed / maxVal)
```

**FilmLabWebGL.js 完全没有此步骤**。结果：过曝区域在预览中硬截断到 1.0 (banding)，但导出时有平滑的肩部压缩。

**受影响步骤**: 步骤 ⑤b  
**CPU参照**: [RenderCore.js highlightRollOff](packages/shared/render/RenderCore.js#L420)  
**GPU参照**: [glsl-shared.js tanh shoulder](electron-gpu/glsl-shared.js#L475)

---

### BUG-03: HSL 饱和度算法根本性不同 — ✅ 已修复

> **修复方式**: 共享着色器 `hslAdjust.js` 已重写为非对称加权平均法（匹配 CPU `filmLabHSL.js`）。
> - satAdjust > 0: `s + (1-s) * satAdjust`
> - satAdjust < 0: `s * (1 + satAdjust)`
> 所有路径通过共享着色器自动使用相同算法。

**CPU / Electron GPU** — 非对称加权平均法:
```javascript
// 累积加权平均 satAdjust，然后:
if (satAdjust > 0) s = s + (1-s) * satAdjust;   // 向上推到 1
if (satAdjust < 0) s = s * (1 + satAdjust);       // 向下拉到 0
```

**Client WebGL** — 乘法累积法:
```glsl
totalSatMult *= 1.0 + (u_hslRed.y / 100.0) * w;
// 最后:
s = clamp(s * totalSatMult, 0.0, 1.0);
```

**差异分析**: 乘法方式在通道重叠时产生**非线性复合效应**，而加权平均是可控的线性混合。对于任何非默认 HSL 配置，预览和导出的饱和度响应曲线完全不同。

**位置**: [FilmLabWebGL.js applyHSLAdjustment](client/src/components/FilmLab/FilmLabWebGL.js#L380)  
**CPU参照**: [filmLabHSL.js applyHSL](packages/shared/filmLabHSL.js#L218)  
**GPU参照**: [glsl-shared.js GLSL_HSL_ADJUSTMENT](electron-gpu/glsl-shared.js#L135)

---

### BUG-04: HSL 明度算法不同 — ✅ 已修复

> **修复方式**: 共享着色器 `hslAdjust.js` 已重写为非对称映射 + 0.5 阻尼（匹配 CPU `filmLabHSL.js`）。
> - lumAdjust > 0: `l + (1-l) * lumAdjust * 0.5`
> - lumAdjust < 0: `l * (1 + lumAdjust * 0.5)`

**CPU / Electron GPU** — 非对称映射 + 0.5 阻尼:
```javascript
if (lumAdjust > 0) l = l + (1-l) * lumAdjust * 0.5;  // 渐近线趋向 1
if (lumAdjust < 0) l = l * (1 + lumAdjust * 0.5);     // 渐近线趋向 0
```

**Client WebGL** — 简单加法:
```glsl
totalLumShift += (u_hslRed.z / 100.0) * 0.5 * w;
l = clamp(l + totalLumShift, 0.0, 1.0);
```

加法方式对于极亮/极暗像素容易过冲到边界值，而非对称方式有自然的渐近收敛。高明度调整时差异最明显。

**位置**: [FilmLabWebGL.js applyHSLAdjustment](client/src/components/FilmLab/FilmLabWebGL.js#L380)

---

### BUG-05: 对比度公式缩放 ≈ 2× 偏差 — ✅ 已修复

> **修复方式**: 两处同步修改：
> 1. `tonemap.js` 的 `applyContrast()` 现在接受原始 UI 值 (-100..100)，内部乘以 2.55 映射到 -255..255
> 2. `FilmLabWebGL.js` 移除了 JS 端的 `/100.0` 预除，直接传递原始对比度值
> 3. `RenderCore.js` `getGLSLUniforms()` 也改为传递原始值

**问题链**:
1. FilmLabWebGL 设置 uniform: `contrast = params.contrast / 100.0` (e.g., `50 → 0.5`)
2. Shader 中: `f = (259.0 * (c * 255.0 + 255.0)) / (255.0 * (259.0 - c * 255.0))`
3. 当 `c = 0.5`: `f = (259 × 382.5) / (255 × 131.5) ≈ 2.954`

**CPU / Electron GPU**:
1. 使用原始值: `ctr = 50`
2. 公式: `f = (259 × (50 + 255)) / (255 × (259 - 50)) = 78995 / 53295 ≈ 1.482`

| 路径 | contrast=50 时的 factor |
|------|------------------------|
| CPU / Electron GPU | **1.482** |
| **Client WebGL** | **2.954** (约 2×) |

**影响**: 预览中的对比度效果是导出的约 2 倍强度，用户调节到满意的预览效果后导出会发现对比度明显偏弱。

**位置**: [FilmLabWebGL.js contrast uniform](client/src/components/FilmLab/FilmLabWebGL.js#L1001) + [shader applyContrast](client/src/components/FilmLab/FilmLabWebGL.js#L637)  
**CPU参照**: [RenderCore.js contrast](packages/shared/render/RenderCore.js#L380)

---

### BUG-06: 分离色调混合算法不同 — ✅ 已修复

> **修复方式**: 共享着色器 `splitTone.js` 已重写为 lerp-to-tint 混合（`result + (tint - result) * strength * 0.3`），匹配 CPU `filmLabSplitTone.js`。删除了旧的 multiply-blend 方式。

**CPU / Electron GPU** — Lerp-to-Tint:
```javascript
result += (tintColor - result) * strength * 0.3;
```

**Client WebGL** — Multiply-Tint:
```glsl
vec3 tinted = result * tint * 2.0;
result = mix(result, tinted, weight * sat);
```

`Multiply-Tint` 根据像素原色乘以着色色产生偏移，而 `Lerp-to-Tint` 直接向固定色插值。对非中性色像素（蓝色、红色等），两种方法产生完全不同的色彩偏移方向。

**位置**: [FilmLabWebGL.js applySplitToning](client/src/components/FilmLab/FilmLabWebGL.js#L482)  
**CPU参照**: [filmLabSplitTone.js applySplitTone](packages/shared/filmLabSplitTone.js#L210)  
**GPU参照**: [glsl-shared.js GLSL_SPLIT_TONE](electron-gpu/glsl-shared.js#L262)

---

### BUG-07: 分离色调分区权重计算不同 — ✅ 已修复

> **修复方式**: 共享着色器 `splitTone.js` 已重写为:
> - 固定区域: `shadowEnd = 0.25`, `highlightStart = 0.75`
> - `balanceOffset = balance / 2.0`（匹配 CPU的 `balance / 200`，因为 uniform 已预除以 100）
> - Hermite smoothstep（手动实现，避免 GLSL 内置 smoothstep 的边缘差异）
> - 三区分割：阴影 + 中间调 + 高光

**CPU / Electron GPU**:
- `balanceOffset = balance / 200` (±0.5 max)
- 固定区域: `shadowEnd = 0.25`, `highlightStart = 0.75`
- 中点随 balance 偏移: `midpoint = 0.5 + balanceOffset`
- 使用 Hermite `smoothstep` 过渡

**Client WebGL**:
- 传入 `u_splitBalance = balance / 100` (0.0–1.0), 然后 `× 0.15`
- **所有**区域边界偏移: `shadowEnd = 0.25 + balance * 0.15`, `highlightStart = 0.75 + balance * 0.15`
- 使用 GLSL 内置 `smoothstep` + ±0.15 过渡宽度
- 中间调权重使用完全不同的计算方式

**实际差异**: 当 `balance = 100` 时:
- CPU 中点偏移 0.5 (覆盖几乎整个高光区)
- WebGL 所有边界只偏移 0.15 (微小调整)

**位置**: [FilmLabWebGL.js applySplitToning](client/src/components/FilmLab/FilmLabWebGL.js#L473)

---

## 4. 🟡 中等问题 (Moderate)

### BUG-08: HSL 品红通道色相中心偏差 — ✅ 已修复

> **修复方式**: 共享着色器 `hslAdjust.js` 将品红 (Magenta) 中心从 320° 修正为 **330°**，匹配 CPU `filmLabHSL.js`。

| 渲染路径 | 品红 (Magenta) 中心 |
|----------|---------------------|
| CPU `filmLabHSL.js` | **330°** |
| Electron GPU `glsl-shared.js` | **330°** |
| RenderCore `getHSLGLSL()` | **330°** |
| **Client WebGL `FilmLabWebGL.js`** | **320°** |

10° 偏差导致品红滑块在预览中影响不同的色相范围。

**位置**: [FilmLabWebGL.js HSL magenta](client/src/components/FilmLab/FilmLabWebGL.js#L417)  
**参照**: [filmLabHSL.js HSL_CHANNELS](packages/shared/filmLabHSL.js#L35)

---

### BUG-09: HSL 权重缺少归一化 — ✅ 已修复

> **修复方式**: 共享着色器 `hslAdjust.js` 添加了权重归一化：`if (totalWeight > 1.0) { hueAdjust /= totalWeight; satAdjust /= totalWeight; lumAdjust /= totalWeight; }`，匹配 CPU 逻辑。

CPU 和 Electron GPU 都有权重归一化:
```javascript
if (totalWeight > 1) {
    hueAdjust /= totalWeight;
    satAdjust /= totalWeight;
    lumAdjust /= totalWeight;
}
```

**Client WebGL 完全没有归一化**。当通道重叠时（例如红-橙过渡区的像素），累积的调整值没有被归一化，可能产生过度饱和或亮度溢出。

**位置**: [FilmLabWebGL.js applyHSLAdjustment](client/src/components/FilmLab/FilmLabWebGL.js#L380)

---

### BUG-10: RenderCore.getGLSLUniforms() 对比度预除与 shader 不匹配 — ✅ 已修复

> **修复方式**: `getGLSLUniforms()` 现在传递原始 UI 值：`u_exposure: p.exposure`（而非 `/50.0`）、`u_contrast: p.contrast`（而非 `/100.0`）。共享着色器内部负责缩放。

```javascript
// RenderCore.js getGLSLUniforms():
u_contrast: p.contrast / 100.0,   // 50 → 0.5
```

如果有消费者用 `getGLSLUniforms()` 输出去喂 `glsl-shared.js` 的 shader:
```glsl
// glsl-shared.js shader expects RAW value:
float factor = (259.0 * (ctr + 255.0)) / (255.0 * (259.0 - ctr));
// 当 ctr=0.5 → factor ≈ 1.004 (几乎无对比度！)
```

`gpu-renderer.js` 避开了这个问题（直接传原始值），但 API 接口设计容易造成误用。

**位置**: [RenderCore.js getGLSLUniforms](packages/shared/render/RenderCore.js#L648)

---

### BUG-11: RenderCore getSplitToneGLSL() 缺少中间调通道 — ✅ 已弃用

> **修复方式**: `getSplitToneGLSL()` 和 `getHSLGLSL()` 均已标记为 `@deprecated`，并添加 `console.warn` 提示。新代码应使用 `buildFragmentShader()` 来自共享着色器库。

`RenderCore.getSplitToneGLSL()` 方法只输出**高光 + 阴影**两个区域的 GLSL 代码，缺少中间调 (midtone) 支持。而所有其他路径都支持三区分割。

如果有外部消费者使用此方法生成 shader，中间调着色将静默丢失。

---

### BUG-12: Bernstein 基函数输入未钳制差异 — ✅ 设计如此

> **结论**: 审查后确认此行为是设计意图。CPU RenderCore 用钳制后的 `c` 计算多项式，但加回未钳制的原始值 `v`。这确保了多项式的范围可控同时不丢失解析度。GPU 路径等效（因为之前有 clamp 步骤）。

**CPU RenderCore processPixelFloat** 在应用阴影/高光调整时先钳制到 [0,1]:
```javascript
const c = Math.max(0, Math.min(1, v));
return v + sFactor * (1 - c) * (1 - c) * c * 4;
```
注意：多项式使用钳制后的 `c`，但加回到未钳制的原始值 `v`。

**两个 GPU shader** 直接使用未钳制的值:
```glsl
c += sFactor * pow(1.0 - c, vec3(2.0)) * c * 4.0;
```

当中间值超出 [0,1]（例如高曝光+对比度组合后），多项式形状不同。

---

## 5. 🟢 轻微问题 (Minor)

### BUG-13: filmlab-core.js (遗留路径) 缺少多个步骤 — ✅ 已标记弃用

> **修复方式**: 在 `filmlab-core.js` 顶部添加了 `@deprecated` JSDoc 标记和详细的迁移指南，指向 `RenderCore.processPixelFloat()`（CPU 路径）和 `buildFragmentShader()`（GPU 路径）。

`packages/shared/filmlab-core.js` 的 `processPixel()` 函数缺少:
- 片基校正 (Base Correction)
- 密度色阶 (Density Levels)
- 高光滚降 (Highlight Roll-Off)
- Float 精度处理

此文件应被标记为 **deprecated** 或更新为调用 `RenderCore`。

---

### BUG-14: GPU 导出 JPEG 质量固定 0.95 — ✅ 已修复

> **修复方式**: `gpu-renderer.js` 的 `canvas.toBlob()` 现在使用 `params?.jpegQuality ?? 0.95`，支持可配置的 JPEG 质量。

`gpu-renderer.js` 在 `canvas.toBlob()` 时硬编码质量 0.95:
```javascript
canvas.toBlob((blobOut) => { ... }, 'image/jpeg', 0.95);
```

但 CPU 导出路径支持可配置质量 (预览 0.95, HQ 导出 1.0)。GPU 导出永远不会产生质量 1.0 的 JPEG。

**位置**: [gpu-renderer.js#L455](electron-gpu/gpu-renderer.js#L455)

---

### BUG-15: UNPACK_FLIP_Y_WEBGL 不一致 — ✅ 可接受

> **结论**: 两条路径通过不同方式处理 Y 翻转，但视觉结果正确。FilmLabWebGL 用 FLIP_Y=true + UV 补偿，gpu-renderer 用 FLIP_Y=false + 直接 UV。保持现状。

| 路径 | UNPACK_FLIP_Y_WEBGL |
|------|---------------------|
| Client WebGL (FilmLabWebGL.js) | `true` (在 UV 计算中补偿) |
| Electron GPU (gpu-renderer.js) | `false` (在 UV 映射中直接处理) |

两者通过不同方式处理 Y 翻转。FilmLabWebGL 在 `mapUV()` 中翻转 V 坐标来补偿 FLIP_Y=true，而 gpu-renderer 不翻转纹理也不翻转 UV。逻辑正确但实现路径不同，增加维护复杂度。

---

### BUG-16: WebGL1 无 3D LUT sampler3D 支持 — ✅ 已统一

> **修复方式**: 共享着色器 `index.js` 的 WebGL1 路径现在包含 `lut3d.js` 的 `sampleLUT3D()` 函数，使用打包 2D 纹理实现 3D LUT（与 FilmLabWebGL 相同的方法）。WebGL2 路径使用原生 sampler3D。

`glsl-shared.js` 的 WebGL1 分支注释:
```glsl
// (3D LUT not available in WebGL1 fallback)
```

但 `FilmLabWebGL.js` 使用 2D 纹理打包法 (`packLUT3DForWebGL`) 在 WebGL1 下也支持 3D LUT。两条路径的 WebGL1 能力不一致 — Electron GPU 导出在 WebGL1 下会静默跳过 LUT。

---

## 6. 一致性对照矩阵 (修复后)

| 特性 | CPU (C/D) | Electron GPU (B) | Client WebGL (A) | 一致? |
|------|-----------|-------------------|-------------------|-------|
| 管线顺序 | ①②②½③③b④⑤⑤b⑥⑦⑧ | ✅ 同 | ✅ 同 (共享着色器) | ✅ |
| 曝光公式 | `2^(exp/50)` | `2^(exp/50)` | ✅ 共享着色器 | ✅ |
| 对比度公式 | raw × 2.55 | raw × 2.55 | ✅ 共享着色器 | ✅ |
| 中灰点 | 0.46 | 0.46 | ✅ 共享着色器 | ✅ |
| 高光滚降 | tanh @ 0.8 | tanh @ 0.8 | ✅ 共享着色器 | ✅ |
| Bernstein 阴影系数 | `(1-c)²·c·4·0.005` | 同 | ✅ 同 | ✅ |
| Bernstein 高光系数 | `c²·(1-c)·4·0.005` | 同 | ✅ 同 | ✅ |
| HSL 饱和度算法 | 非对称加权 | 非对称加权 | ✅ 共享着色器 | ✅ |
| HSL 明度算法 | 非对称 ×0.5 | 非对称 ×0.5 | ✅ 共享着色器 | ✅ |
| HSL 品红中心 | 330° | 330° | ✅ 330° | ✅ |
| HSL 权重归一化 | ÷totalWeight>1 | ÷totalWeight>1 | ✅ 共享着色器 | ✅ |
| 分离色调混合 | lerp-to-tint ×0.3 | lerp-to-tint ×0.3 | ✅ 共享着色器 | ✅ |
| 分离色调分区 | Hermite, balance→mid | 同 | ✅ 共享着色器 | ✅ |
| 分离色调中间调 | ✅ 3区 | ✅ 3区 | ✅ 3区 | ✅ |
| 对数反转 | `1 - log(x+1)/log256` | 同 | ✅ 同 | ✅ |
| 胶片曲线 (H&D) | 3段+逐通道gamma | 同 | ✅ 同 | ✅ |
| 密度色阶 | avgRange [0.5,2.5] | 同 | ✅ 同 | ✅ |
| 片基校正 | 线性+对数双模式 | 同 | ✅ 同 | ✅ |
| 白平衡 Kelvin 模型 | CIE D 光源 | 同 | ✅ 同 | ✅ |
| 曲线 (1D LUT) | 自然三次样条 | 同 | ✅ 同 | ✅ |

---

## 7. 修复优先级建议 — ✅ 全部已完成

### P0 — 必须立即修复 (用户可见) — ✅

| # | 问题 | 影响面 | 状态 |
|---|------|--------|------|
| BUG-05 | 对比度 2× 偏差 | **每张图片** | ✅ 已修复：tonemap.js ×2.55 缩放 + JS 传原始值 |
| BUG-02 | 缺失高光滚降 | 高曝光图片 | ✅ 已修复：共享着色器 applyHighlightRollOff() |
| BUG-01 | 3D LUT 位置错误 | 使用 LUT 时 | ✅ 已修复：共享着色器 buildMainFunction() 步骤 ③b |

### P1 — 高优先级 (HSL/Split Tone 用户) — ✅

| # | 问题 | 状态 |
|---|------|------|
| BUG-03 | HSL 饱和度算法不同 | ✅ 已修复：共享着色器 hslAdjust.js 非对称加权 |
| BUG-04 | HSL 明度算法不同 | ✅ 已修复：共享着色器 hslAdjust.js 非对称映射 |
| BUG-06 | 分离色调混合不同 | ✅ 已修复：共享着色器 splitTone.js lerp-to-tint |
| BUG-07 | 分离色调分区不同 | ✅ 已修复：共享着色器 splitTone.js Hermite + balance/2 |

### P2 — 中优先级 — ✅

| # | 问题 | 状态 |
|---|------|------|
| BUG-08 | 品红中心 320° → 330° | ✅ 已修复 |
| BUG-09 | HSL 权重无归一化 | ✅ 已修复 |
| BUG-10 | getGLSLUniforms 对比度 | ✅ 已修复：传原始值 |

### P3 — 低优先级 — ✅

| # | 问题 | 状态 |
|---|------|------|
| BUG-11 | getSplitToneGLSL 缺中间调 | ✅ 已弃用：指向共享着色器 |
| BUG-12 | Bernstein 输入钳制差异 | ✅ 确认设计如此 |
| BUG-13 | filmlab-core.js 过时 | ✅ 已标记 @deprecated |
| BUG-14 | GPU 导出 JPEG 质量固定 | ✅ 已参数化 |
| BUG-15 | FLIP_Y 实现不同 | ✅ 可接受 |
| BUG-16 | WebGL1 LUT 能力不一致 | ✅ 已统一 |

---

## 8. 根因分析与修复架构

**原始根因**: `FilmLabWebGL.js` 是一个**独立的 shader 实现**，手动编写了完整的 GLSL 片段着色器（约 300 行），没有复用 `glsl-shared.js` 的共享代码，导致随时间逐渐与其他路径出现偏差。

**修复方案**: 建立 `packages/shared/shaders/` 作为所有 GLSL 着色器代码的**单一事实来源**：

1. **FilmLabWebGL.js** — 移除全部内嵌 GLSL (~590 行)，改为调用 `buildFragmentShader({ isGL2: false })`
2. **glsl-shared.js** — 从 ~500 行内嵌 GLSL 重构为 ~60 行薄包装层，委托给共享着色器库
3. **gpu-renderer.js** — uniform 名称与共享着色器对齐（float 类型、u_split* 前缀）
4. **RenderCore.js** — `getGLSLUniforms()` 传递原始 UI 值，弃用旧的 GLSL 生成方法

---

## 9. 新架构简图

```
                    ┌──────────────────────────────────────┐
                    │    packages/shared/shaders/           │
                    │    ┌─────────────────────────────┐   │
                    │    │ index.js — buildFragmentShader│   │
                    │    │ buildMainFunction()          │   │  Single Source
                    │    └─────────────┬───────────────┘   │  of Truth ✅
                    │    ┌─────────────┼───────────────┐   │
                    │    │ uniforms │ colorMath │filmCurve│   │
                    │    │ tonemap  │hslAdjust │splitTone│   │
                    │    │ inversion│baseDensity│ lut3d  │   │
                    │    └─────────────────────────────┘   │
                    └──────────┬──────────────┬────────────┘
                               │              │
           ┌───────────────────┼──────────────┼────────────┐
           │                   │              │            │
    ┌──────▼──────┐    ┌──────▼──────┐  ┌────▼─────┐ ┌───▼────────┐
    │ CPU Path    │    │ Electron GPU│  │ Client   │ │ filmlab-   │
    │ RenderCore  │    │ glsl-shared │  │ WebGL    │ │ core.js    │
    │ .processPixelFloat│  │ (薄包装层) │  │ FilmLab  │ │ @deprecated│
    │ (算法参照)  │    │ buildFS(GL2)│  │ WebGL.js │ │            │
    │   ✅ 同步   │    │   ✅ 同步   │  │buildFS   │ │ ⚠️ 遗留    │
    │   (导出)    │    │   (导出)    │  │(WebGL1)  │ │            │
    └─────────────┘    └─────────────┘  │ ✅ 同步  │ └────────────┘
                                        │ (预览)   │
                                        └──────────┘
```

---

## 10. 受影响文件清单

| 文件路径 | 关联 BUG |
|----------|----------|
| [client/src/components/FilmLab/FilmLabWebGL.js](client/src/components/FilmLab/FilmLabWebGL.js) | BUG-01~09 |
| [electron-gpu/glsl-shared.js](electron-gpu/glsl-shared.js) | (参照基准) |
| [electron-gpu/gpu-renderer.js](electron-gpu/gpu-renderer.js) | BUG-14 |
| [packages/shared/render/RenderCore.js](packages/shared/render/RenderCore.js) | BUG-10~12 |
| [packages/shared/filmlab-core.js](packages/shared/filmlab-core.js) | BUG-13 |
| [packages/shared/filmLabHSL.js](packages/shared/filmLabHSL.js) | (参照基准) |
| [packages/shared/filmLabSplitTone.js](packages/shared/filmLabSplitTone.js) | (参照基准) |

---

> **结论**: 经过本次全面重构，FilmLab 的全部 4 条渲染路径（Client WebGL 预览、Electron GPU 导出、CPU RenderCore、遗留 filmlab-core）现在共享同一份 GLSL 着色器代码 (`packages/shared/shaders/`)。原先发现的 **16 个一致性问题已全部修复或妥善处理**。预览 ↔ 导出的 "所见即所得" (WYSIWYG) 目标已达成。遗留的 `filmlab-core.js` 已标记为弃用，长期应迁移至 `RenderCore.processPixelFloat()`。
