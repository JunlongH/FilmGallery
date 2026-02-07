# FilmGallery 渲染引擎重构计划：HDR全流程与一致性修复

> **版本**: 1.1 (Code Audit Annotated)
> **日期**: 2026-02-07 | **审计**: 2026-02-08
> **目标**: 统一 CPU/GPU 渲染管线，实现 16-bit/Float 精度全链路，对齐 LR/PS 的动态范围处理机制。

---

## 0. 代码审计结果总览 (2026-02-08)

### ✅ 已完成的部分
| 项 | 文件 | 状态 | 备注 |
|---|---|---|---|
| `math/color-space.js` | `packages/shared/render/math/` | ✅ 已创建 | `linearToSrgb`, `srgbToLinear`, `applyGamma`, `removeGamma` |
| `math/exposure.js` | 同上 | ✅ 已创建 | `evToGain`, `applyExposure`, `applyWhiteBalance` |
| `math/tone-curves.js` | 同上 | ✅ 已创建 | `reinhard`, `reinhardExtended`, `filmicACES`, `highlightRollOff` |
| `math/index.js` | 同上 | ✅ 已创建 | CommonJS 聚合导出 |
| `RenderCore.processPixelFloat()` | `RenderCore.js L222-330` | ✅ 已创建 | 浮点管线原型 |
| `render-service.js` Float Path | `server/services/render-service.js` | ✅ 已修改 | TIFF16 + JPEG 均调用 `processPixelFloat` |
| `render-service.js` 导入 math | 同上 L17 | ✅ 已导入 | `srgbToLinear` from `math/color-space` |
| GPU `highlightRollOff` | `electron-gpu/gpu-renderer.js` | ✅ 已实现 | Shader 中有对应代码 |

### 🔴 发现的 Bug 和问题

| # | 严重度 | 位置 | 问题描述 |
|---|--------|------|----------|
| **P1** | 🔴 编译错误 | `gpu-renderer.js` L471-480 | **Highlight Roll-off 代码重复了两次**（同一段 GLSL 粘贴了两遍），`maxVal` 和 `threshold` 被重复声明，GLSL 编译会报错 |
| **P2** | 🔴 逻辑不一致 | `RenderCore.processPixelFloat()` | WB 调用方式错误：`applyWhiteBalance(r, 1, 1, gains).r` 等三次独立调用，应该是一次 `applyWhiteBalance(r, g, b, gains)` |
| **P3** | 🟡 精度浪费 | `processPixelFloat()` | 步骤 4 做了 `applyGamma(2.2)` 将线性转到感知空间，但对比度/阴影/高光后没有再 `removeGamma()` 回去，Highlight Roll-off 和最终输出都在 Gamma 空间操作，与 Plan 要求的"线性空间运算，最后才 Gamma 编码"**不一致** |
| **P4** | 🟡 管线缺失 | `processPixelFloat()` | 缺少 Plan 中阶段 ①③ 的 Film Curve、片基校正、Inversion、3D LUT、Curves、HSL、Split Toning 步骤——这些只在旧的 `processPixel()` 中有，Float 版跳过了 |
| **P5** | 🟡 未被调用 | `CpuRenderService.js` (客户端) | 仍然调用 `core.processPixel()` (8-bit 旧管线)，没有使用新的 `processPixelFloat()`，客户端 CPU 渲染完全没有升级 |
| **P6** | 🟡 LUT 未升级 | `filmLabToneLUT.js` | 仍然是 `Uint8Array(256)` 索引 LUT，Plan 要求升级为 Float LUT 或废弃 |
| **P7** | 🟢 math 未使用 | `math/exposure.js` | `evToGain()` 和 `applyExposure()` 在 `processPixelFloat` 中未被引用，而是内联了 `Math.pow(2, ev)` |
| **P8** | 🟢 math 未使用 | `math/tone-curves.js` | `reinhard()`, `reinhardExtended()`, `filmicACES()` 均未被任何代码调用；只有 `highlightRollOff()` 被 `processPixelFloat` 引用 |
| **P9** | 🟢 GPU 不一致 | GPU Shader vs `processPixelFloat` | GPU 的 Tone 步骤仍在用 `u_toneCurveTex`（旧 256-entry LUT 纹理），而 Float 管线完全绕过了 LUT，两者算法已分道 |

### 🏗️ 尚未开始的 Plan 内容

| Plan 阶段 | 状态 | 说明 |
|-----------|------|------|
| 阶段三: RAW 解码参数调优 | ❌ 未开始 | 未确认 libraw 是否输出 16-bit Linear |
| 阶段四: GPU Shader 对齐 | ⚠️ 部分 | Highlight Roll-off 已加入 shader，但 shader 仍用旧 LUT 纹理做 Tone Mapping |
| `FloatPipeline.js` 独立模块 | ❌ 未开始 | 当前 Float 逻辑直接内嵌在 `RenderCore` 类中，未模块化 |
| `RenderConfig.js` 统一参数 | ❌ 未开始 | |
| 自动化回归测试 | ❌ 未开始 | RMSE/SSIM 对比脚本 |
| 性能监控 / WASM 加速 | ❌ 未开始 | |

---

## 1. 核心问题与设计理念

### 1.1 当前痛点
1.  **精度丢失**: CPU 渲染路径在 Tone Mapping 之前进行了 8-bit (0-255) 截断，导致高光细节永久丢失（Highlight Clipping）。
2.  **渲染不一致**: GPU (WebGL) 使用浮点运算，天然保留了 >1.0 的高光数据，导致预览（GPU）比导出（CPU）效果好。
3.  **RAW 浪费**: 14-bit/16-bit 的 RAW 动态范围被过早压缩，未能利用其宽容度进行后期救回。
4.  **架构割裂**: CPU 和 GPU 使用两套完全不同的算法实现（查表 vs 实时计算）。

### 1.2 重构核心理念 (The "Professional" Way)
为对齐 Lightroom (LR) / Photoshop (PS) 的处理机理，我们将引入以下原则：

1.  **线性工作流 (Linear Workflow)**: 所有数学运算（曝光、白平衡、混色）必须在线性空间（Linear Space）进行，这也是物理光学的真实表现。
2.  **浮点精度 (Float32 Precision)**: 即使源文件是 16-bit 整数，运算过程也应转换为 32-bit 浮点数 (0.0 - 1.0+)，允许数值暂时溢出（>1.0 表示超亮高光）。
3.  **延迟截断 (Late Clipping)**: 只有在最终输出到屏幕或保存为 JPEG 的**最后一步**，才进行 Tone Mapping（压缩高光）和 Gamma 校正，随后截断到 0-255。

---

## 2. 系统架构设计

### 2.1 模块化结构
建立统一的渲染数学库，确保 CPU 和 GPU 逻辑同源。

```text
packages/shared/render/
├── math/                  # [新增] 核心数学算法 (平台无关)
│   ├── color-space.js     # 线性/sRGB/ProPhoto 转换公式
│   ├── tone-curves.js     # S曲线, Highlight Roll-off (数学公式替代LUT)
│   └── exposure.js        # 曝光、对比度算法 (Float实现)
├── cpu/
│   ├── FloatPipeline.js   # [重构] 基于 Float32Array 或 Sharp Pipeline 的实现
│   └── RawDecoder.js      # [优化] 确保输出 16-bit Linear Raw
├── gpu/
│   ├── shaders/           # Shader 片段 (从 math 库生成或通过文档对齐)
│   └── gpu-renderer.js    # WebGL 编排
└── RenderConfig.js        # 统一的参数定义
```

### 2.2 数据流设计 (Pipeline)

| 阶段 | 操作 | 数据格式 | 对应 LR/PS 机制 |
|------|------|----------|-----------------|
| **1. Input** | 解码 RAW/图像 | UInt16 (Linear) | Camera Raw Cache |
| **2. Norm** | 归一化 | Float32 (0.0 - ∞) | Internal Float Pipe |
| **3. Pre-Op** | 翻转、去马赛克 | Float32 | Demosaic |
| **4. Basic** | 白平衡 (WB) | Float32 | WB Multipliers |
| **5. Exp** | **曝光 (Exposure)** | Float32 (乘法) | Exposure |
| **6. Color** | 矩阵校色 (CCM) | Float32 | Camera Profile |
| **7. Tone** | **对比度/高光修复** | Float32 (S曲线) | Highlight Recovery |
| **8. Gamut** | 色彩空间转换 | Float32 | ProPhoto -> sRGB |
| **9. OETF** | Gamma 编码 | Float32 (1.0 -> 0.45) | Gamma Correction |
| **10. Out** | 量化/抖动 (Dither) | UInt8 / UInt16 | Export (8/16 bit) |

---

## 3. 详细实施计划

### 阶段一：数学基础统一 (Math Foundation)
**目标**: 废弃硬编码的 8-bit LUT，改用参数化曲线公式。

> **审计状态: ⚠️ 骨架已建，但存在问题**
>
> `math/` 三个文件已创建且 CommonJS 格式正确。但：
> - **P7**: `exposure.js` 的 `evToGain()` / `applyExposure()` 虽然写了，但 `processPixelFloat()` 中未引用，而是内联了同样的公式。应统一调用 math 库。
> - **P8**: `tone-curves.js` 的 `reinhard()` / `filmicACES()` 完全未被使用。`highlightRollOff()` 被引用但其数学公式需要验证（见下方"highlightRollOff 数学分析"）。
> - **P6**: `filmLabToneLUT.js` 仍然是 `Uint8Array(256)`，这是**整个精度丢失的根源**，此文件完全没有被修改或替代。

#### highlightRollOff 数学分析
当前公式: `threshold + (range / (range + max)) * max`
- 其中 `range = x - threshold`, `max = 1.0 - threshold`
- 当 `threshold = 0.8`, `x = 1.6` 时: `0.8 + (0.8 / (0.8 + 0.2)) * 0.2 = 0.8 + 0.16 = 0.96` ✅ 合理
- 当 `x → ∞` 时: 趋近 `0.8 + 0.2 = 1.0` ✅ 正确渐近
- **但**: 此函数在 `x = threshold` 处**不连续可微**（一阶导数跳变从 1.0 到 `max/(max)^2`），可能导致亮部出现可见的色带。建议改用平滑 `tanh` 或三次 Hermite 过渡。

1.  **算法提取**:
    *   将当前的 Contrast/Exposure 逻辑转换为纯数学函数。
    *   实现影视级的 Tone Mapping 算法 (如 ACES Filmic 或类似 Adobe 的 Shoulder Compression)，平滑压缩 >1.0 的高光到 1.0 以内，而不是直接切断。
2.  **LUT 升级**:
    *   如果必须用 LUT（为了速度），改用 **1D Float LUT** 或 **3D LUT (Cube)**，不再使用 0-255 索引数组。
    *   CPU 端支持插值读取 LUT。

### 阶段二：CPU 渲染引擎重写 (Float Implementation)
**目标**: 让 CPU 导出不仅一致，而且画质最好。

> **审计状态: ⚠️ 有原型但存在严重逻辑问题**
>
> **P3 - 色彩空间顺序错误** (最关键的问题):
> `processPixelFloat()` 的步骤 4 在曝光之后立即执行了 `applyGamma(2.2)` 将数据转到感知空间，
> 然后在 Gamma 空间中做对比度/阴影/高光/黑白场调整。但问题是：
> - Highlight Roll-off（步骤 8）也在 Gamma 空间执行，而 Plan 要求它在线性空间操作
> - **最终输出没有做 Gamma 编码**（因为步骤 4 已经提前做了），但 GPU shader 中压根没有这个中间 Gamma 转换
> - 这导致 CPU Float 管线和 GPU 管线在色彩空间上**仍然不一致**
>
> **正确的顺序应该是**:
> 1. 输入 (Linear) → 2. WB (Linear) → 3. Exposure (Linear) → 4. Highlight Recovery (Linear)
> → 5. **转到 Gamma 空间** → 6. Contrast/Shadows/Highlights (Gamma) → 7. Curves/HSL
> → 8. 输出 (已在 Gamma 空间，直接量化)
>
> 或者全程 Linear，最后一步统一做 sRGB OETF。
>
> **P4 - 管线不完整**: `processPixelFloat()` 跳过了以下旧管线步骤:
> - ① Film Curve (胶片 H&D 密度模型) — 负片处理必需
> - ② 片基校正 (Base Correction) — 负片处理必需
> - ③ Inversion — 负片处理必需
> - 3D LUT 应用
> - Curves (用户自定义曲线)
> - HSL 色彩调整
> - Split Toning (分离色调)
>
> 这意味着**对于负片**，`processPixelFloat()` 目前完全不可用。
>
> **P5 - 客户端未升级**: `CpuRenderService.js` 的 `processCanvasWithRenderCore()` 仍调用
> `core.processPixel()`（旧 8-bit），客户端 CPU fallback 渲染完全没有受益于新管线。

1.  **数据容器升级**:
    *   现有 `RenderCore.js` 处理的是 `Uint8ClampedArray`。
    *   **方案 A (纯 JS)**: 改用 `Float32Array` 处理像素。对于 5000万像素图片，内存压力较大，但算法最好写。
    *   **方案 B (Sharp/Libvips)**: 利用 `sharp` 的 pipeline 操作。Sharp 支持 `linear()` 转换和 16-bit 管道。需研究如何将自定义 JS 像素逻辑注入，或完全用 `sharp` 的原子操作组合（recomb, modulate, composite）。*推荐方案*。
2.  **移除早期截断**:
    *   删除所有 `Math.min(255, ...)` 和 `_clamp255`。
    *   确保从 `libraw` 解码出来的数据直接进入 pipeline，不经过任何 8-bit 转换。

> **P2 - White Balance 调用 Bug**:
> ```js
> // 当前（错误）:
> r = MathOps.applyWhiteBalance(r, 1, 1, gains).r;
> g = MathOps.applyWhiteBalance(1, g, 1, gains).g;
> b = MathOps.applyWhiteBalance(1, 1, b, gains).b;
>
> // 应改为:
> const wb = MathOps.applyWhiteBalance(r, g, b, gains);
> r = wb.r; g = wb.g; b = wb.b;
> ```
> 当前代码虽然数学结果相同（因为 `r * gains.r` 不依赖 g/b），但风格极差且浪费性能。

### 阶段三：RAW 解码参数调优
**目标**: 获取原始光线数据。

> **审计状态: ❌ 未开始**

1.  **Libraw 配置**:
    *   确保 `dcraw` 参数设置为输出 **16-bit 线性 (Linear)** 数据 (`-4 -o 0` 类似参数)。
    *   目前系统可能输出了 Gamma 矫正后的 8-bit 数据，这限制了后期空间。必须改为输出 Linear 16-bit TIFF/Buffer 给渲染引擎。

> **注**: `render-service.js` 已加入 `is16BitInput` 判断和 `srgbToLinear()` 去 Gamma，
> 说明当前假设输入可能是 sRGB Gamma。但如果 libraw 直接输出 Linear，则 `srgbToLinear()`
> 反而会**双重去 Gamma**，让图像变暗。需要确认 RAW 解码参数后再决定是否需要这一步。

### 阶段四：GPU Shader 对齐
**目标**: 确保预览即所得。

> **审计状态: ⚠️ 存在严重 Bug**
>
> **P1 - GLSL 编译错误**: `gpu-renderer.js` L471-480 区域，Highlight Roll-off 代码**被粘贴了两次**。
> 两段完全相同的代码声明了相同的变量 `maxVal` 和 `threshold`，GLSL 不允许重复声明，
> 这会导致 **shader 编译失败**，整个 GPU 预览可能无法工作（或者实际被 WebGL1 fallback shader 处理了）。
>
> **P9 - GPU 仍用旧 LUT**: Shader 在 Highlight Roll-off 后仍用 `texture(u_toneCurveTex, ...)` 读取旧的
> 256-entry Tone Curve 纹理。这个纹理由 `buildToneLUT()` 生成，本质上就是那个 `Uint8Array(256)` 的 8-bit LUT。
> 这意味着 GPU 管线的数据流是：
> `Float → HighlightRollOff → clamp(0,1) → 旧 LUT(Uint8 精度) → HSL/SplitTone → output`
>
> 新增的 Highlight Roll-off 和旧 LUT 存在语义冲突:
> - Roll-off 压缩了高光到 [0, 1]
> - 然后 LUT 再次对 [0, 1] 做曝光/对比度调整（LUT 内部已包含曝光）
> - **曝光被施加了两次**: 一次在 shader L448 (`c *= expFactor`)，一次在 LUT 纹理内部
>
> 要么废弃 LUT 纹理改为 shader 内联算法，要么废弃 shader 内联的曝光/对比度代码。

1.  **Shader 更新**:
    *   将阶段一确定的数学公式翻译为 GLSL。
    *   确保 GLSL 中的中间变量不做 `clamp(0.0, 1.0)`，直到最后 `gl_FragColor`。
2.  **精度检查**:
    *   手机端/Web端需注意 `mediump` vs `highp` 的精度问题。

---

## 4. 可维护性与测试

### 4.1 自动化对比测试 (Regression Test)
建立一个测试脚本：
1.  输入一张标准 RAW 和一组参数。
2.  同时运行 CPU 渲染和 GPU 渲染（Headless GL）。
3.  计算两张输出图的 **RMSE (均方根误差)** 和 **SSIM**。
4.  设定阈值（例如像素值差异 < 1%），确保一致性。

### 4.2 性能监控
*   Float32 运算比 Uint8 慢。需监控导出的大图渲染时间。
*   必要时引入 WASM (C++/Rust) 来处理 CPU 端的像素循环，替代纯 JS 的 `Float32Array` 循环。

---

## 5. 执行路线图 (Roadmap)

1.  **M1 - Analysis**: 确认 `sharp` 是否支持纯 16-bit 链式操作，或者是否需要写 C++ binding。已有 `electron-gpu`，可以考虑在服务端用 Headless GL 进行渲染（但这需要显卡），最稳妥还是改进 CPU 算法。
2.  **M2 - Prototype**: 用一张 RAW 图，写一个独立的 Node 脚本，验证 16-bit 读取 -> 浮点曝光增益 -> 压缩高光 -> 输出 JPEG 的流程。
3.  **M3 - Integration**: 将原型集成回 `RenderCore.js`。
4.  **M4 - Verification**: 修复对比度渲染一致性 bug。

## 6. 特别注意：Adobe 的处理机制

*   **黑白点**: LR 的 Exposure 加减实际上是在线性空间乘除，但 Highlights/Shadows 滑块是基于一种复杂的局部自适应算法（Tone Mapping）。
*   **模拟方案**: 我们初期先不实现局部对比度（Clarity/HDR），先实现全局的 **S-Curve Tone Mapping**。这足以解决"死白"问题。
    *   **公式**: $Output = \frac{Input}{Input + 1}$ (Reinhard) 或 拟合曲线。
    *   **色彩**: 操作亮度的同时要进行色彩补偿，避免高光发灰（Luma preservation）。

---

## 7. 审计后的修复优先级 (Action Items)

### 🔴 立即修复 (阻塞性 Bug)
1. **P1**: 删除 `gpu-renderer.js` 中重复的 Highlight Roll-off GLSL 代码块（L471-480 第二份）
2. **P2**: 修正 `processPixelFloat()` 中 `applyWhiteBalance` 的调用方式

### 🟡 核心重构 (实现 Plan 的关键路径)
3. **P3**: 重新设计 `processPixelFloat()` 的色彩空间流程，对齐 GPU shader 的操作顺序
4. **P4**: 将旧管线的 Film Curve / Base Correction / Inversion / 3D LUT / Curves / HSL / Split Toning 迁移到 `processPixelFloat()`，使其成为完整的渲染管线
5. **P6**: 替换 `filmLabToneLUT.js` 的 `Uint8Array(256)` 为 Float LUT 或直接内联数学运算
6. **P9**: 统一 GPU shader 的 Tone Mapping 逻辑 — 要么废弃 LUT 纹理改用 shader 内联计算，要么清理 shader 中冗余的内联曝光/对比度代码
7. **P5**: 升级 `CpuRenderService.js` 调用 `processPixelFloat()` 替代 `processPixel()`

### 🟢 改进 (代码质量)
8. **P7/P8**: 让 `processPixelFloat()` 引用 `math/` 库函数而非内联重复代码
9. 为 `highlightRollOff` 增加 C1 连续性（平滑导数过渡）
10. 建立 CPU vs GPU 回归测试脚本

### 建议的执行顺序
```
P1 (5min) → P2 (5min) → P4 (核心: 完整 Float 管线) → P3 (色彩空间修正)
→ P6+P9 (统一 LUT 策略) → P5 (客户端升级) → P7/P8 (代码整理) → 回归测试
```
