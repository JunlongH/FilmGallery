# 白平衡蓝色过矫正问题调查报告

**报告日期**: 2026-02-08  
**状态**: ✅ **已修复** (v2.4.0)  
**现象**: Auto WB / Pick WB 执行后，暖色调照片出现明显蓝色过矫正  
**严重程度**: 🔴 严重 (影响所有 WB 自动校正功能)  
**修复方案**: Plan A — Newton-Raphson 迭代求解器匹配 Kelvin 渲染模型

---

## 1. 问题描述

用户照片 P1 为暖黄色调（室内钨丝灯光），执行 Auto WB 后得到 P2，出现明显蓝色色偏——从暖色过矫正到冷色。

**预期行为**: Auto WB 应将色偏照片校正至接近中性灰 (R ≈ G ≈ B)  
**实际行为**: 校正后蓝色通道严重过高，产生冷蓝色调

---

## 2. 根本原因：求解器与渲染器的模型不匹配

### 🔴 BUG #1 — Solver-Renderer Model Mismatch（核心原因）

**求解器** (`solveTempTintFromSample`) 基于 **传统线性模型** 的逆推导求解 temp/tint：

```
传统模型 (Legacy):
  gainR = 1 + t × 0.5 + n × 0.3
  gainG = 1 - n × 0.5
  gainB = 1 - t × 0.5 + n × 0.3
```

**渲染器** (`computeWBGains` with `useKelvinModel: true`) 使用 **CIE D 光源开尔文模型**：

```
开尔文模型 (Kelvin):
  targetKelvin = 6500 + temp × 40
  [rTemp, gTemp, bTemp] = kelvinToRGB(targetKelvin)   // CIE D illuminant → XYZ → sRGB
  [rRef, gRef, bRef] = kelvinToRGB(6500)               // D65 参考白点
  rGain = R × (rRef / rTemp) × tintR
  gGain = G × (gRef / gTemp) × tintG
  bGain = B × (bRef / bTemp) × tintB
  // 然后 Rec.709 亮度补偿
```

**两个模型对相同 temp/tint 值产生完全不同的增益**，尤其在负 temp（冷色校正）时差异极大。

### 数值证明

| temp 值 | 对应色温 | 传统模型 B/R 比 | 开尔文模型 B/R 比 | 蓝色增益偏差 |
|---------|---------|---------------|----------------|------------|
| -100 | 2500K | 3.00 | **14.56** | **+385%** |
| -80 | 3300K | 2.33 | **4.58** | **+96%** |
| -60 | 4100K | 1.86 | **2.62** | **+41%** |
| -40 | 4900K | 1.50 | **1.70** | **+14%** |
| -20 | 5700K | 1.22 | 1.25 | +3% |
| 0 | 6500K | 1.00 | 1.00 | 0% |
| +20 | 7300K | 0.82 | 0.84 | +3% |
| +40 | 8100K | 0.67 | 0.74 | +10% |
| +60 | 8900K | 0.54 | 0.66 | +23% |

**规律**: 偏差在负 temp 方向（冷色校正）呈指数增长，这正是暖色调照片需要的校正方向。

### 具体案例验证

**输入**: 暖色调采样 RGB = [165, 148, 120]（类似 P1 照片）

```
求解器输出:   temp = -32.32, tint = 7.83
传统模型结果: [148.6, 148.6, 148.6]  ← 完美中性 ✅
开尔文模型结果: [146.0, 147.4, 158.8]  ← 蓝色偏高 8.8% ✗

暴力搜索正确值: temp = -26.50, tint = 3.00
正确结果:      [148.9, 148.6, 148.3]  ← 接近中性 ✅
```

**结论**: 求解器给出的 temp 比正确值多偏 ~6 个单位（过度冷化），导致蓝色过矫正。

### 极端案例

**输入**: 强暖色调 RGB = [200, 140, 80]

```
求解器输出:   temp = -92.05, tint = 24.66
开尔文模型结果: R:G:B = 0.70 : 1.00 : 2.31  ← 蓝色为红色的 3.3 倍！
```

---

## 3. 代码路径追踪

### Auto WB (handleAutoColor) 路径

```
FilmLab.jsx L1361-1420:
  ① 从已渲染画布采样全图平均 RGB（跳过 lum < 10 和 lum > 245）
  ② 调用 solveTempTintFromSample([rAvg, gAvg, bAvg], {red:1, green:1, blue:1})
     ↓ 使用传统线性模型的代数逆推导
     ↓ 返回 {temp, tint}
  ③ setTemp(solved.temp); setTint(solved.tint);
  ④ 触发重新渲染 → webglParams = { gains: computeWBGains({...temp, ...tint}) }
     ↓ computeWBGains 默认 useKelvinModel: true
     ↓ 使用开尔文模型计算增益 (与步骤②的模型不同！)
  ⑤ WebGL shader: c *= u_gains;  ← 应用了错误的增益
```

### Pick WB (isPickingWB) 路径

```
FilmLab.jsx L895-940:
  ① 从已渲染画布采样 3×3 像素区域
  ② 调用 solveTempTintFromSample([rRendered, gRendered, bRendered], {red:1, green:1, blue:1})
     ↓ 同样使用传统线性模型逆推导 → 同样的模型不匹配问题
  ③ setTemp(solved.temp); setTint(solved.tint);
  ④ 同上，渲染时使用开尔文模型 → 蓝色过矫正
```

### 关键文件对照

| 文件 | 函数 | 使用的模型 | 用途 |
|------|------|----------|------|
| `packages/shared/filmLabWhiteBalance.js` L321-395 | `solveTempTintFromSample()` | 传统线性 (Legacy) | 求解 temp/tint |
| `packages/shared/filmLabWhiteBalance.js` L385 | `computeWBGainsLegacy()` | 传统线性 (Legacy) | 求解器验证 |
| `packages/shared/filmLabWhiteBalance.js` L187-270 | `computeWBGains()` | **开尔文 (Kelvin)** | **渲染增益计算** |
| `packages/shared/render/RenderCore.js` L206-213 | `computeWBGains(useKelvinModel:true)` | **开尔文 (Kelvin)** | CPU 渲染 |
| `packages/shared/shaders/index.js` L222 | `c *= u_gains` | 接收 Kelvin 增益 | GPU 渲染 |
| `client/src/components/FilmLab/FilmLab.jsx` L183 | `computeWBGains({...})` | **开尔文 (Kelvin)** | WebGL 预览 |

---

## 4. 次要问题

### ✅ BUG #2 — 重复的 `computeWBGains` 实现 (已修复)

~~存在两个不同的 `computeWBGains` 实现~~：

| 文件 | 修复前 | 修复后 |
|------|--------|--------|
| `packages/shared/filmLabWhiteBalance.js` | CIE D 开尔文模型 + Rec.709 补偿 | ← 不变 (canonical) |
| `client/src/components/FilmLab/wb.js` | ~~传统线性模型，无亮度补偿~~ | ✅ Re-export from shared |
| `client/src/components/FilmInverter.jsx` | ~~import from wb.js (传统模型)~~ | ✅ Import from `@filmgallery/shared` |

### 🟡 BUG #3 — Auto WB 在非线性空间采样

`handleAutoColor()` 从已渲染画布采样平均 RGB。此画布已经过完整渲染管线处理：

```
原始图 → ① Film Curve → ② 片基校正 → ③ 反转 → ③b 3D LUT → ④ 白平衡(当前)
→ ⑤ 曝光 → ⑤b 对比度 → ⑤c B/W → ⑤d S/H → ⑤e 高光压缩 → ⑥ 曲线 → ⑦ HSL
```

Gray World 假设要求在 **线性空间** 操作。但采样点经过了对比度、曲线、高光压缩等 **非线性变换**，会扭曲通道间的比例关系。

**影响**: 在大多数默认参数下（无曲线、无对比度）影响较小，但当用户已调整过曲线/对比度后再执行 Auto WB，结果会不够准确。

### 🟡 BUG #4 — 求解器未考虑亮度补偿

开尔文模型在计算最终增益时有 Rec.709 亮度补偿步骤：
```javascript
const avgGain = 0.299 * rGain + 0.587 * gGain + 0.114 * bGain;
rGain *= (1.0 / avgGain);
gGain *= (1.0 / avgGain);
bGain *= (1.0 / avgGain);
```

即使求解器改用开尔文模型，也需要考虑这个非线性亮度补偿步骤，简单代数逆推导无法处理。

---

## 5. 与行业标准的对比

### Adobe Lightroom/Photoshop 的做法

| 步骤 | Adobe 方法 | FilmLab 当前方法 | 差异 |
|------|-----------|----------------|------|
| **色彩适应** | Bradford CAT02 (LMS 空间) | 直接 RGB 增益 | 🔴 跳过 LMS 变换 |
| **亮度保持** | XYZ Y 通道隔离 | Rec.709 加权补偿 | 🟡 近似但不精确 |
| **WB 求解** | Planckian Locus 迭代求解 | 线性模型代数逆推导 | 🔴 模型不匹配 |
| **采样空间** | RAW 线性空间 | 后处理 sRGB 空间 | 🟡 精度下降 |
| **色调轴** | CIELAB magenta-green | RGB 混合近似 | 🟡 不够精确 |

### 标准 Gray World 算法

标准 Gray World 白平衡：
```
1. 在线性空间计算全图平均 R, G, B
2. 目标: 使 R_avg = G_avg = B_avg = K (某常数)
3. 增益: gain_R = K / R_avg, gain_G = K / G_avg, gain_B = K / B_avg
4. 直接应用增益 (无需 temp/tint 中间变量)
```

**FilmLab 的问题**: 引入了 temp/tint 中间变量，需要在两个不一致的模型间转换。如果直接计算增益（像 `FilmInverter.jsx` L680-720 那样），反而不会有此问题。

---

## 6. 影响范围

| 功能 | 受影响 | 原因 |
|------|--------|------|
| Auto WB (Auto Color 按钮) | ✅ 受影响 | `solveTempTintFromSample` 使用错误模型 |
| Pick WB (吸管工具) | ✅ 受影响 | 同上 |
| 手动 temp/tint 滑块 | ❌ 不受影响 | 用户直接设置值，渲染用 Kelvin 模型 |
| 服务端渲染 (photos.js, filmlab.js) | ❌ 不受影响 | 使用保存的 temp/tint，Kelvin 模型渲染 |
| 服务端导出 (export-queue.js) | ❌ 不受影响 | 同上 |
| FilmInverter Auto Color | ❌ 不受影响 | 使用直接 R/G/B 增益法，不经过 temp/tint |

**严重程度**: 所有用户使用 Auto WB 或 Pick WB 校正暖色调照片时都会遇到蓝色过矫正。暖色偏越严重，蓝色过矫正越明显（指数关系）。

---

## 7. 建议修复方案（仅供参考，暂不实施）

### ✅ 方案 A: 求解器改用开尔文模型（已实施 v2.4.0）

将 `solveTempTintFromSample` 改为基于开尔文模型的 2D Newton-Raphson 迭代数值求解器：

```javascript
// 实际实现 (packages/shared/filmLabWhiteBalance.js)
function solveTempTintFromSample(sampleRgb, baseGains = {}) {
  // Phase 1: 传统模型代数解作为初始估计 (快速收敛起点)
  // Phase 2: Newton-Raphson 迭代 (数值 Jacobian) 对 computeWBGains(kelvin=true) 精确求解
  //          残差: F1 = rS×gainR - gS×gainG, F2 = bS×gainB - gS×gainG
  //          收敛条件: |F1| < 0.3 && |F2| < 0.3 (像素值单位)
  //          阻尼因子: 0.75 (防止振荡)
  // Phase 3: 结果验证 (极端增益缩减)
}
```

**验证结果 (8/8 测试通过)**:

| 采样 RGB | 旧求解器 spread | 新求解器 spread | 改善 |
|---------|---------------|---------------|------|
| [165, 148, 120] | 12.8 | 0.2 | **98%** |
| [180, 150, 100] (P1 case) | 61.0 | 0.1 | **100%** |
| [200, 140, 80] | 188.1 | 0.3 | **100%** |
| [220, 120, 50] | 157.2 | 0.1 | **100%** |
| [100, 120, 160] | 15.3 | 0.3 | **98%** |
| [120, 160, 120] | 17.9 | 0.3 | **99%** |
| [140, 110, 130] | 12.1 | 0.2 | **98%** |

**同时完成的附带修复**:
- ✅ `client/src/components/FilmLab/wb.js` → 替换为共享包 re-export wrapper (消除重复实现)
- ✅ `client/src/components/FilmInverter.jsx` → 改为 import from `@filmgallery/shared` (统一 Kelvin 模型)
- ✅ Client build 编译通过

---

## 8. 修复文件清单

| 文件 | 操作 | 状态 | 说明 |
|------|------|------|------|
| `packages/shared/filmLabWhiteBalance.js` | 重写 `solveTempTintFromSample` | ✅ 完成 | Newton-Raphson 迭代匹配 Kelvin 模型 |
| `client/src/components/FilmLab/wb.js` | 替换为 re-export wrapper | ✅ 完成 | 消除重复的传统线性模型实现 |
| `client/src/components/FilmInverter.jsx` | 更新 import | ✅ 完成 | 统一使用 `@filmgallery/shared` Kelvin 模型 |
| Client build | 编译验证 | ✅ 通过 | `npx craco build` 成功 |
| 数值测试 | 8/8 pass | ✅ 通过 | spread 从 12-188 降至 0.1-0.3 |

### 未来改进 (非阻塞)

| 项目 | 优先级 | 说明 |
|------|--------|------|
| 非线性空间采样 | 🟡 中等 | Auto WB 从后处理画布采样，曲线/对比度等非线性处理影响 Gray World 精度 |
| Bradford CAT02 色彩适应 | 🟢 低 | 当前使用简化 von Kries，Adobe 使用 Bradford LMS 变换 |
| CIELAB 色调轴 | 🟢 低 | 当前 tint 在 RGB 空间混合近似，Adobe 在 CIELAB magenta-green 轴操作 |
