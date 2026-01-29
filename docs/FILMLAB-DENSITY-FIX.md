# FilmLab Density Levels Fix Plan

## Problem Analysis

### 物理背景

彩色负片具有特殊的物理特性：

1. **橙色遮罩 (Orange Mask)**：彩色负片内置橙色遮罩层，用于在传统暗房冲洗时校正染料的色彩串扰
2. **每通道不同的 Dmin**：由于橙色遮罩，R、G、B 三个通道的最小密度 (Dmin) 各不相同
3. **每通道不同的动态范围**：三层染料的 gamma 和动态范围也略有不同

### Density Levels 的正确目的

**Density Levels 的主要目的是"拉平三个通道"（per-channel normalization），而不仅仅是除雾。**

由于橙色遮罩和染料特性，R、G、B 三个通道的密度范围各不相同。必须对每个通道独立地将其 `[Dmin, Dmax]` 归一化到一个共同的输出范围，才能消除通道间的不平衡。

### 管道顺序 (FilmLabWebGL.js)
```
① Film Curve (u_filmCurveEnabled)
② Base Correction (u_baseMode: log/linear)
②.5 Density Levels (u_densityLevelsEnabled) <-- 在反转之前！
③ Invert (u_inverted)
④ 曝光/对比度/高光/阴影等
```

## 原始问题

原始实现使用固定的 `targetRange = 2.2`：
```glsl
float normR = (Dr - Dmin_R) / range_R;  // 归一化到 [0, 1]
float DrNew = normR * targetRange;       // 映射到 [0, 2.2]
```

当检测到的范围较窄时（如 0.4），拉伸因子 = 2.2 / 0.4 = 5.5x，导致极端对比度。

## 解决方案

### 核心改进：使用平均范围作为输出范围

不再使用固定的 `targetRange = 2.2`，而是使用三个通道输入范围的**平均值**作为输出范围：

```glsl
// 计算三个通道的平均范围
float avgRange = (rangeR + rangeG + rangeB) / 3.0;
avgRange = clamp(avgRange, 0.5, 2.5);  // 限制在合理范围内

// 每个通道归一化到 [0, avgRange]
float normR = clamp((Dr - Dmin_R) / rangeR, 0.0, 1.0);
float DrNew = normR * avgRange;
```

### 这样做的好处

1. **通道平衡**：三个通道都被归一化到相同的输出范围 `[0, avgRange]`，消除了橙色遮罩导致的通道不平衡
2. **保持对比度**：使用平均范围而不是固定的 2.2，避免了极端的对比度拉伸或压缩
3. **自适应**：根据实际图像的密度范围自动调整，而不是硬编码

### 数学示例

假设检测到的范围：
- R: `[0.2, 1.0]` → range = 0.8
- G: `[0.4, 1.4]` → range = 1.0  
- B: `[0.6, 1.8]` → range = 1.2

平均范围 = (0.8 + 1.0 + 1.2) / 3 = 1.0

输出：
- R: `[0.2, 1.0]` → `[0, 1.0]` (拉伸 1.25x)
- G: `[0.4, 1.4]` → `[0, 1.0]` (不变)
- B: `[0.6, 1.8]` → `[0, 1.0]` (压缩 0.83x)

三个通道现在具有相同的输出范围，但整体对比度保持接近原始值。

## 已完成的修复

### ✅ FilmLabWebGL.js - Density Levels Shader

使用 avgRange 替代固定的 targetRange：
- 计算三个通道输入范围的平均值
- 限制 avgRange 在 [0.5, 2.5] 范围内
- 每个通道独立归一化到 `[0, avgRange]`

### ✅ packages/shared/shaders/baseDensity.js

应用与 FilmLabWebGL.js 相同的修复，确保服务器端渲染一致。

### ✅ packages/shared/render/RenderCore.js

CPU 路径的 `_applyDensityLevels` 也应用相同的逻辑。

### ✅ FilmLab.jsx - handleDensityAutoLevels

简化检测逻辑，移除之前过于保守的最小范围限制（现在由 shader 中的 avgRange 限制处理）。

## 修改的文件清单

| 文件 | 修改内容 |
|------|----------|
| `client/src/components/FilmLab/FilmLab.jsx` | `handleDensityAutoLevels` - 简化检测逻辑 |
| `client/src/components/FilmLab/FilmLabWebGL.js` | 密度等级 shader - 使用 avgRange |
| `packages/shared/shaders/baseDensity.js` | 共享 shader - 使用 avgRange |
| `packages/shared/render/RenderCore.js` | `_applyDensityLevels` CPU 路径 - 使用 avgRange |

## 参考资料

### darktable negadoctor
darktable 的 negadoctor 模块基于 Kodak Cineon 感光测量系统，用于数字化胶片底片：
- Dmin：采样未曝光区域（film base），获取每通道的最小密度
- Dmax：采样高光区域，确定每通道的最大密度
- 工作在对数密度域，将 `[Dmin, Dmax]` 映射处理

### RawTherapee Film Negative
RawTherapee 使用专门的色彩空间（基于胶片染料的光谱灵敏度峰值：650nm, 550nm, 460nm）来进行反转计算。

### 密度域数学
- $D = -\log_{10}(T)$，其中 T 是透射率 (0-1)
- 典型负片密度范围：0.3（雾）到 2.5（最黑）
- 8位输出最大密度范围：约 2.4（对应 255:1 对比度比）
