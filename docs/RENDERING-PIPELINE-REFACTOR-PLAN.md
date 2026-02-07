# FilmGallery 渲染引擎重构计划：HDR全流程与一致性修复

> **版本**: 1.0 (Draft)
> **日期**: 2026-02-07
> **目标**: 统一 CPU/GPU 渲染管线，实现 16-bit/Float 精度全链路，对齐 LR/PS 的动态范围处理机制。

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

1.  **算法提取**:
    *   将当前的 Contrast/Exposure 逻辑转换为纯数学函数。
    *   实现影视级的 Tone Mapping 算法 (如 ACES Filmic 或类似 Adobe 的 Shoulder Compression)，平滑压缩 >1.0 的高光到 1.0 以内，而不是直接切断。
2.  **LUT 升级**:
    *   如果必须用 LUT（为了速度），改用 **1D Float LUT** 或 **3D LUT (Cube)**，不再使用 0-255 索引数组。
    *   CPU 端支持插值读取 LUT。

### 阶段二：CPU 渲染引擎重写 (Float Implementation)
**目标**: 让 CPU 导出不仅一致，而且画质最好。

1.  **数据容器升级**:
    *   现有 `RenderCore.js` 处理的是 `Uint8ClampedArray`。
    *   **方案 A (纯 JS)**: 改用 `Float32Array` 处理像素。对于 5000万像素图片，内存压力较大，但算法最好写。
    *   **方案 B (Sharp/Libvips)**: 利用 `sharp` 的 pipeline 操作。Sharp 支持 `linear()` 转换和 16-bit 管道。需研究如何将自定义 JS 像素逻辑注入，或完全用 `sharp` 的原子操作组合（recomb, modulate, composite）。*推荐方案*。
2.  **移除早期截断**:
    *   删除所有 `Math.min(255, ...)` 和 `_clamp255`。
    *   确保从 `libraw` 解码出来的数据直接进入 pipeline，不经过任何 8-bit 转换。

### 阶段三：RAW 解码参数调优
**目标**: 获取原始光线数据。

1.  **Libraw 配置**:
    *   确保 `dcraw` 参数设置为输出 **16-bit 线性 (Linear)** 数据 (`-4 -o 0` 类似参数)。
    *   目前系统可能输出了 Gamma 矫正后的 8-bit 数据，这限制了后期空间。必须改为输出 Linear 16-bit TIFF/Buffer 给渲染引擎。

### 阶段四：GPU Shader 对齐
**目标**: 确保预览即所得。

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
