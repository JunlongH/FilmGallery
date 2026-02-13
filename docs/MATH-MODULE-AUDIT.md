# Math 模块使用状况审计

> **日期**: 2026-02-08  
> **模块路径**: `packages/shared/render/math/`  
> **文件数**: 4 (`index.js`, `color-space.js`, `exposure.js`, `tone-curves.js`)  
> **总函数数**: 11  
> **被生产代码调用**: 1 / 11 (9.1%)

---

## 1. 函数级调用矩阵

| # | 函数 | 文件 | 生产代码调用 | 测试代码调用 | 文档引用 | 状态 |
|---|------|------|------------|------------|---------|------|
| 1 | `highlightRollOff` | tone-curves.js | ✅ `RenderCore.js` ×2 (processPixel + processPixelFloat) | ✅ render-regression-test.js | ✅ | **活跃** |
| 2 | `reinhard` | tone-curves.js | ❌ | ✅ render-regression-test.js | 📄 | 死代码 |
| 3 | `reinhardExtended` | tone-curves.js | ❌ | ❌ | 📄 | 死代码 |
| 4 | `filmicACES` | tone-curves.js | ❌ | ✅ render-regression-test.js | 📄 | 死代码 |
| 5 | `linearToSrgb` | color-space.js | ❌ | ❌ | 📄 | 死代码 |
| 6 | `srgbToLinear` | color-space.js | ❌ | ❌ | 📄 | 死代码 |
| 7 | `applyGamma` | color-space.js | ❌ | ❌ | 📄 | 死代码 |
| 8 | `removeGamma` | color-space.js | ❌ | ❌ | 📄 | 死代码 |
| 9 | `evToGain` | exposure.js | ❌ | ❌ | 📄 | 死代码 |
| 10 | `applyExposure` | exposure.js | ❌ | ❌ | 📄 | 死代码 |
| 11 | `applyWhiteBalance` | exposure.js | ❌ | ❌ | 📄 | 死代码 |

> **📄** = 仅在 `docs/` markdown 文件中被提及

---

## 2. 按文件分析

### 2.1 `tone-curves.js` — 1/4 活跃

| 函数 | 行数 | 分析 | 建议 |
|------|------|------|------|
| `highlightRollOff` | 19 | **唯一活跃函数**。被 `RenderCore.processPixel` (8-bit) 和 `processPixelFloat` 调用。GPU 侧在 `glsl-shared.js` 和 `FilmLabWebGL.js` 有等价 GLSL 实现。tanh C² 连续，Phase 3.5 已验证。 | ✅ **保留** |
| `reinhard` | 3 | 经典 Reinhard $x/(x+1)$。仅在回归测试中验证数学属性。项目不使用 HDR tone mapping。 | ⚠️ 见建议 |
| `reinhardExtended` | 3 | 扩展 Reinhard，带白点参数。零调用。 | ⚠️ 见建议 |
| `filmicACES` | 7 | ACES 近似曲线。仅在回归测试中验证。项目使用自定义 `highlightRollOff` 而非 ACES。 | ⚠️ 见建议 |

### 2.2 `color-space.js` — 0/4 活跃

| 函数 | 行数 | 分析 | 建议 |
|------|------|------|------|
| `linearToSrgb` | 5 | 精确 sRGB EOTF 逆函数 (IEC 61966-2-1)。之前被 `render-service.js` 使用但已移除。Q21 (线性光管线) 将需要。 | ⚠️ 见建议 |
| `srgbToLinear` | 5 | 精确 sRGB EOTF。之前被 `render-service.js` 使用但已移除。Q21 将需要。 | ⚠️ 见建议 |
| `applyGamma` | 1 | 简化 $x^{1/\gamma}$。之前被 `processPixelFloat` 使用但已移除 (P3 修复)。不如 `linearToSrgb` 精确。 | 🔴 可删除 |
| `removeGamma` | 1 | 简化 $x^{\gamma}$。从未被调用。不如 `srgbToLinear` 精确。 | 🔴 可删除 |

### 2.3 `exposure.js` — 0/3 活跃

| 函数 | 行数 | 分析 | 建议 |
|------|------|------|------|
| `evToGain` | 1 | `Math.pow(2, ev)`。RenderCore 内联了等价公式: `Math.pow(2, exposure / 50)` (多了 `/50` 的 slider→EV 映射)。参数语义不匹配 (evToGain 接受 EV, RenderCore 接受 slider 值)。 | 🔴 可删除 |
| `applyExposure` | 1 | `linear * pow(2, ev)`。与 RenderCore 内联公式等价但参数语义不同。 | 🔴 可删除 |
| `applyWhiteBalance` | 4 | 简单 `r*mr, g*mg, b*mb`。RenderCore 直接用 `r *= luts.rBal` 内联，且 WB 增益由 `filmLabWhiteBalance.computeWBGains()` 计算。此函数的 `{r,g,b}` 返回值结构与项目约定不兼容。 | 🔴 可删除 |

---

## 3. 内联重复 vs math 模块对照

以下是生产代码中的内联公式与 math 模块提供的等价函数对照：

| 内联公式位置 | 内联代码 | math 等价函数 | 为何未调用 |
|-------------|----------|-------------|-----------|
| `RenderCore.js:364` | `Math.pow(2, exposure / 50)` | `evToGain(exposure / 50)` | 参数需要预除 50；内联更清晰 |
| `RenderCore.js:350-352` | `r *= rBal; g *= gBal; b *= bBal` | `applyWhiteBalance(r, g, b, {r, g, b})` | 返回 Object 需要解构，增加 GC 压力；内联三行更快 |
| `glsl-shared.js:462` | `pow(2.0, u_exposure / 50.0)` (GLSL) | — | GPU shader 无法调用 JS |
| `glsl-shared.js:489-497` | tanh rolloff (GLSL) | `highlightRollOff` (JS) | GPU shader 无法调用 JS，但注释标注 "Matches CPU MathOps.highlightRollOff()" |
| `filmLabWhiteBalance.js:102` | XYZ → sRGB 矩阵乘法 | `linearToSrgb` (单通道) | WB 模块在线性空间做矩阵变换后 max-normalize，不涉及 gamma 编码 |

---

## 4. 未来路线图需求评估 (Q21 线性光管线)

如果实施 Q21 (全管线线性光重构)，以下函数将被需要：

| 函数 | Q21 用途 | 当前实现质量 |
|------|----------|------------|
| `srgbToLinear` | 管线入口：sRGB JPEG/PNG → Linear | ✅ 精确 IEC 61966-2-1，可直接用 |
| `linearToSrgb` | 管线出口：Linear → sRGB 输出 | ✅ 精确，可直接用 |
| `applyGamma` / `removeGamma` | 不需要 | ❌ 简化版本，被精确版本替代 |
| `evToGain` | 线性光曝光 | ⚠️ 可用但参数语义需要对齐 slider 值 |
| `applyExposure` | 线性光曝光 | ⚠️ 同上 |
| `reinhard` | 可选 tone mapping 算法 | ✅ 数学正确 |
| `reinhardExtended` | 可选 tone mapping (HDR 场景) | ✅ 数学正确 |
| `filmicACES` | 可选 tone mapping (电影风格) | ✅ 数学正确 |

---

## 5. 建议方案

### 方案 A: 保守清理（推荐）

保留有未来价值的函数，删除明确无用的函数。

| 操作 | 函数 | 理由 |
|------|------|------|
| ✅ 保留 | `highlightRollOff` | 活跃使用 |
| ✅ 保留 | `linearToSrgb`, `srgbToLinear` | Q21 线性光管线必需；实现精确 (IEC 61966) |
| ✅ 保留 | `reinhard`, `reinhardExtended`, `filmicACES` | 未来可选 tone mapping 算法库；代码量极小 (13 行)；回归测试已覆盖 |
| 🔴 删除 | `applyGamma`, `removeGamma` | 被精确版 `linearToSrgb`/`srgbToLinear` 替代；简化 γ=2.2 不符合 sRGB 标准 |
| 🔴 删除 | `evToGain`, `applyExposure` | 参数语义与项目 slider 不兼容；函数体仅 1 行，内联更清晰；Q21 也不太可能使用 |
| 🔴 删除 | `applyWhiteBalance` | 返回 Object 与项目约定不兼容；`filmLabWhiteBalance.computeWBGains()` 是 WB 的真实来源；3 行乘法无需封装 |

**清理结果**: 删除 5 个函数，保留 6 个函数 → 使用率从 9.1% 提升至 16.7% (1/6 活跃 + 5/6 储备)

清理后的文件结构：
```
math/
├── index.js          — 重新导出
├── color-space.js    — linearToSrgb, srgbToLinear (2 函数)
├── tone-curves.js    — highlightRollOff, reinhard, reinhardExtended, filmicACES (4 函数)
└── (删除 exposure.js)
```

### 方案 B: 激进清理

仅保留活跃调用的函数，其余全部删除。

| 操作 | 函数 |
|------|------|
| ✅ 保留 | `highlightRollOff` |
| 🔴 删除 | 其余 10 个函数 |

**清理结果**: 删除 10 个函数，保留 1 个 → 使用率 100%。但丧失 Q21 准备工作和 tone mapping 储备。

### 方案 C: 不清理

维持现状。所有函数已有正确的 JSDoc 注释。死代码不影响运行时 (tree-shaking 对 CommonJS 不生效，但 math/ 模块总代码量仅 ~120 行，约 3KB，对打包体积影响可忽略)。

---

## 6. 总结

| 指标 | 当前值 |
|------|--------|
| math/ 模块总函数 | 11 |
| 生产代码活跃调用 | **1** (`highlightRollOff`) |
| 测试代码调用 | 3 (`highlightRollOff`, `reinhard`, `filmicACES`) |
| 与生产内联重复 | 3 (`evToGain`, `applyExposure`, `applyWhiteBalance`) |
| Q21 未来需要 | 2-5 (`linearToSrgb`, `srgbToLinear`, 可能 `reinhard` 系列) |
| 明确可删除 | **5** (`applyGamma`, `removeGamma`, `evToGain`, `applyExposure`, `applyWhiteBalance`) |
| 建议保留 | **6** (1 活跃 + 2 Q21 储备 + 3 tone mapping 算法库) |

**推荐**: 执行 **方案 A** (保守清理)，删除 `exposure.js` 整个文件和 `color-space.js` 中的 `applyGamma`/`removeGamma`。
