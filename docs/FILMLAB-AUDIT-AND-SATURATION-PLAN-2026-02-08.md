# FilmLab 复查与算法对齐计划（2026-02-08, rev.4 — 全浮点管线升级完成）

> **rev.4 更新说明** (2026-02-08)：
> - **所有服务端路由**全面升级为 `processPixelFloat()` 全浮点管线
> - 自动检测 16-bit 源数据（RAW→TIFF 16-bit 保持全程不降精度）
> - 消除伪 TIFF16（bit-doubling），改为真 16-bit 输出
> - 修复 export-queue `photo.file_path` 列名不存在的 bug
> - 补充 export-positive 和 render-positive 缺失的 `saturation` 参数
>
> **rev.3 更新说明** (2026-02-08)：
> - Phase 1~3 全部实施完成，标记 ✅
> - 删除 legacy filmlab-core.js
> - 新增 RAW 色深与动态范围分析（第八节）
> - 新增后续优化建议（第九节）

## 范围
- 处理管线（CPU Float / CPU 8-bit / WebGL / Server Export / Batch Export）一致性
- 模块算法：Film Curve / Base Correction / Density Levels / Inversion / 3D LUT / White Balance / Tone / Highlight Roll-Off / Curves / HSL / **Global Saturation** / Split Toning
- 参数结构与路径一致性（字段命名、序列化、迁移、导出、预设）
- 全局 Saturation 模块（Luma-preserving，独立于 HSL）
- RAW 色深与动态范围利用分析

---

## 一、实际管线顺序（以 RenderCore.processPixelFloat 为准）

```
① Film Curve (H&D density) ─ 仅负片且 filmCurveEnabled
② Base Correction (linear mul / log density sub)
②.5 Density Levels (log 域 AutoLevels)
③ Inversion (linear / log)
③b 3D LUT ← 在 Inversion 后、WB 前
④ White Balance (Kelvin/Tint + RGB Gains)
⑤ Tone Mapping (Exposure → Contrast → Blacks/Whites → Shadows → Highlights)
⑤b Highlight Roll-Off (Shoulder Compression, threshold=0.8)
⑥ Curves (RGB master + per-channel, Float32 1024-entry LUT)
⑦ HSL Adjustment (8 通道, 余弦权重)
⑦b Global Saturation ← ✅ 已实现
⑧ Split Toning (3 区, Rec.709 亮度, lerp-to-tint)
```

### 各路径管线对比（实施后）

| 步骤 | RenderCore Float | RenderCore 8-bit | WebGL/GPU | export-queue |
|------|:---:|:---:|:---:|:---:|
| ① Film Curve | ✅ per-ch gamma+toe/shoulder | ✅ single gamma | ✅ per-ch | ✅ via RenderCore |
| ② Base Correction | ✅ linear+log | ✅ linear+log | ✅ | ✅ via RenderCore |
| ②.5 Density Levels | ✅ | ✅ | ✅ | ✅ via RenderCore |
| ③ Inversion | ✅ | ✅ | ✅ | ✅ via RenderCore |
| ③b 3D LUT | ✅ | ✅ | ✅ | ✅ via RenderCore |
| ④ White Balance | ✅ | ✅ | ✅ | ✅ via RenderCore |
| ⑤ Tone | ✅ float math | ✅ 8-bit LUT | ✅ | ✅ via RenderCore |
| ⑤b Highlight Roll-Off | ✅ | ✅ | ✅ | ✅ via RenderCore |
| ⑥ Curves | ✅ Float32 1024 | ✅ Uint8 256 | ✅ | ✅ via RenderCore |
| ⑦ HSL | ✅ | ✅ | ✅ | ✅ via RenderCore |
| ⑦b Global Saturation | ✅ | ✅ | ✅ | ✅ via RenderCore |
| ⑧ Split Toning | ✅ | ✅ | ✅ | ✅ via RenderCore |

> **Legacy filmlab-core.js 已删除**，所有路径统一使用 RenderCore。

---

## 二、已确认的关键实现与一致性点

- **HSL**：8 通道、余弦平滑权重、非对称饱和度/明度映射，CPU 与 GLSL **一致**。
- **Split Toning**：Rec.709 亮度、Hermite smoothstep 分区、lerp-to-tint 混合，CPU 与 GLSL **一致**。
- **Global Saturation**：Rec.709 亮度 Luma-preserving，CPU 与 GLSL **一致**。
- **HSL 滑块范围**：Hue $[-180, 180]$, Sat $[-100, 100]$, Lum $[-100, 100]$。
- **Saturation 滑块范围**：$[-100, 100]$, $s = 1 + v/100$。

---

## 三、已修复的问题清单

### ✅ Issue 1 — `hsl` vs `hslParams` 命名分裂

**修复内容**：
- `filmLabExport.js` — `DEFAULT_PROCESSING_PARAMS` 字段 `hsl` → `hslParams`，PARAMS_VERSION 2→3
- `filmLabExport.js` — `migrateParams` 增加 v1→v2→v3 迁移链，含 `hsl` → `hslParams` 兼容映射
- `filmLabExport.js` — `validateExportParams` 同时检查 `params.hslParams || params.hsl`
- `filmLabExport.js` — `hasParamsDifference` 比较 `hslParams` 而非 `hsl`
- `RenderCore.js` — `normalizeParams` 增加 `hslParams: input.hslParams ?? input.hsl ?? DEFAULT`
- `types.d.ts` — `FilmLabPreset.params` 增加 `hslParams` 和 `splitToning` 字段（保留旧字段兼容）

### ✅ Issue 2 — 批量导出 HSL 被静默跳过

**修复内容**：
- `export-queue.js` — 替换 `require('filmlab-core')` → `require('RenderCore')`
- `export-queue.js` — `_exportPhoto()` 使用 `new RenderCore(params)` 并传入完整参数
- 新增 16-bit 路径：检测高位深源，使用 `processPixelFloat()` 和 `Uint16Array`

### ✅ Issue 3 — 旧预设 HSL 结构不兼容

**修复内容**：
- `filmLabExport.js` — 新增 `migrateOldHSLFormat()` 和 `migrateOldSplitToningFormat()` 辅助函数
- `schema-migration.js` — 种子预设全部更新为新结构（`cyan` 替代 `aqua`，nested splitToning）

### ✅ Issue 4 — Split Toning 默认值不一致

**修复内容**：
- `filmLabExport.js` — `DEFAULT_SPLIT_TONING` 对齐 `filmLabSplitTone.js`：
  - `highlights.hue` = 30, `shadows.hue` = 220, `balance` = 0, 增加 `midtones`
- `RenderCore.js` — `normalizeParams` 增加 `splitToning: input.splitToning ?? input.splitTone ?? DEFAULT`

### ✅ Issue 5 — 3D LUT 管线位置不一致

**修复内容**：
- 删除 legacy filmlab-core.js（其 LUT 在管线末尾），所有路径统一使用 RenderCore 的 ③b 位置。

### ✅ Issue 6 — TypeScript 类型定义与运行时不一致

**修复内容**：
- `types.d.ts` — `FilmLabPreset.params` 增加 `hslParams`、`splitToning`（保留旧 `hsl`/`splitTone` 兼容）
- `types.d.ts` — `RenderParams` 增加 `saturation?: number`

---

## 四、全局 Saturation 模块实现

### 算法

采用 **Luma-preserving Saturation**（灰度混合法）：

$$Y = 0.2126R + 0.7152G + 0.0722B \quad \text{(Rec.709 亮度)}$$
$$R' = Y + (R - Y) \cdot s, \quad G' = Y + (G - Y) \cdot s, \quad B' = Y + (B - Y) \cdot s$$

$$s = 1 + \frac{v}{100}, \quad v \in [-100, 100]$$

### 已创建文件

| 文件 | 用途 |
|------|------|
| `packages/shared/filmLabSaturation.js` | CPU 模块：`applySaturationFloat()`、`applySaturation()`、`isDefaultSaturation()` |
| `packages/shared/shaders/saturation.js` | GLSL 片段：`getSaturationGLSL()`、`getSaturationMainCall()` |

### 已修改文件

| 文件 | 修改 |
|------|------|
| `RenderCore.js` | import、normalizeParams（+saturation）、processPixelFloat（⑦b）、processPixel（⑥b）、getGLSLUniforms（+u_saturation/u_useSaturation） |
| `shaders/uniforms.js` | +`uniform float u_useSaturation; uniform float u_saturation;` |
| `shaders/index.js` | import saturation、WebGL1/2 shader build 注入 GLSL、buildMainFunction pipeline ⑦b、exports 增加 saturation、SHADER_VERSION bump |
| `FilmLab.jsx` | +`[saturation, setSaturation] = useState(0)`，线入 webglParams/currentParams/savePreset/applyPreset/handleSave/handleHighQualityExport/所有 RenderCore 实例化/FilmLabControls |
| `FilmLabControls.jsx` | +`saturation, setSaturation` prop、+SATURATION SliderControl |
| `FilmLabWebGL.js` | +`u_useSaturation`/`u_saturation` location 获取 + uniform 设置 |
| `filmLabExport.js` | DEFAULT_PROCESSING_PARAMS +saturation:0、validateExportParams +saturation 范围检查、hasParamsDifference +saturation 字段 |
| `types.d.ts` | RenderParams +saturation、FilmLabPreset.params +saturation |

---

## 五、已删除文件

| 文件 | 原因 |
|------|------|
| `packages/shared/filmlab-core.js` | Legacy 8-bit 处理核心，所有调用方已迁移至 RenderCore |

### packages/shared/index.js 更新

- 移除 filmlab-core import 和 re-export（`processPixel`、`prepareLUTs`、`processPixelArray`、`sampleLUT3D`）
- 新增 `RenderCore` re-export
- 新增 `applySaturationFloat`、`applySaturation`、`isDefaultSaturation` re-export

---

## 六、实施计划（完成状态）

### Phase 1 — 参数结构与命名统一 ✅

| # | 任务 | 状态 |
|---|------|:---:|
| 1.1 | filmLabExport 字段重命名 + 默认值对齐 | ✅ |
| 1.2 | 导出验证修复 | ✅ |
| 1.3 | 导出迁移修复（v1→v2→v3） | ✅ |
| 1.4 | 导出比较修复 | ✅ |
| 1.5 | RenderCore 兼容映射 | ✅ |
| 1.6 | types.d.ts 修正 | ✅ |
| 1.7 | 旧预设结构迁移函数 | ✅ |
| 1.8 | schema-migration 种子更新 | ✅ |

### Phase 2 — 批量导出切换 RenderCore ✅

| # | 任务 | 状态 |
|---|------|:---:|
| 2.1 | export-queue import 替换 | ✅ |
| 2.2 | _exportPhoto 重写（RenderCore） | ✅ |
| 2.3 | 精度模式选择（8-bit / 16-bit float） | ✅ |
| 2.4 | 3D LUT 位置统一 | ✅ |
| 2.5 | filmlab-core.js 删除 | ✅ |

### Phase 3 — 全局 Saturation 模块 ✅

| # | 任务 | 状态 |
|---|------|:---:|
| 3.1 | CPU 模块 filmLabSaturation.js | ✅ |
| 3.2 | GLSL 片段 shaders/saturation.js | ✅ |
| 3.3 | RenderCore 集成 | ✅ |
| 3.4 | Shader 集成 (uniforms + index) | ✅ |
| 3.5 | 导出参数更新 | ✅ |
| 3.6 | 参数版本升级 (v2→v3) | ✅ |
| 3.7 | UI — state (FilmLab.jsx) | ✅ |
| 3.8 | UI — 滑块 (FilmLabControls.jsx) | ✅ |
| 3.9 | WebGL 传递 (FilmLabWebGL.js) | ✅ |
| 3.10 | 类型定义 (types.d.ts) | ✅ |

### Phase 4 — 验证与回归测试 ⬜

| # | 任务 | 状态 |
|---|------|:---:|
| 4.1 | 单元测试 filmLabSaturation | ⬜ |
| 4.2 | 管线一致性测试 | ⬜ |
| 4.3 | 导出一致性测试 | ⬜ |
| 4.4 | 旧数据兼容测试 | ⬜ |
| 4.5 | 主观对比 | ⬜ |

---

## 七、待确认事项

- [x] Saturation 作为全局调色还是并入 HSL？ → **已确认：全局调色**
- [x] 3D LUT 位置固定为 RenderCore ③b → **已确认**（filmlab-core 已删除）
- [ ] 旧预设数据是否需要一次性批量回填脚本（遍历 DB 中 processing_params JSON 并更新字段名）？
- [x] 全局 Saturation 滑块位置 → **Temperature/Tint 下方，独立区域**

---

## 八、RAW 色深与动态范围分析

### 管线各阶段位深

| 阶段 | 路径 | 位深 | 说明 |
|------|------|------|------|
| RAW 解码 | LibRaw native → TIFF | **16-bit** ✅ | LibRaw 正确输出 16-bit |
| 导入存储 | importPhoto → processToJpeg | **⚠️ 8-bit JPEG** | 工作副本压缩为 8-bit JPEG |
| 客户端预览 | Canvas/WebGL | **8-bit** | HTML Canvas 固有限制 |
| 保存 (handleSave) | Canvas → toBlob | **8-bit** | 客户端 Canvas 路径 |
| HQ 导出 (export-positive) | server → processPixelFloat | **✅ 16-bit float** | **rev.4 修复：** 全浮点管线，自动检测 16-bit 源 |
| render-positive | server → processPixelFloat | **✅ 16-bit float** | **rev.4 修复：** 同上 |
| filmlab /render + /export | server → processPixelFloat | **✅ 16-bit float** | **rev.4 修复：** 同上 |
| filmlab /preview | server → processPixelFloat | **✅ float** | **rev.4 修复：** 预览也升级为全浮点 |
| render-service | server → processPixelFloat | **✅ 16-bit float** | 此前已实现 |
| **批量导出** | **export-queue → RenderCore** | **✅ 16-bit float** | **rev.3+4 修复：** 检测高位深源，使用 `processPixelFloat()` + `Uint16Array`，输入路径 bug 已修复 |

### 色深利用瓶颈 — 修复记录

#### ✅ rev.4 全面修复：所有服务端路由升级为全浮点管线

**修复范围** (rev.4, 2025-02-08):
1. **`server/routes/photos.js` export-positive**: `processPixel()` → `processPixelFloat()`；自动检测 16-bit 源 (`Uint16Array` 读取)；JPEG 输出在最后一步才降到 8-bit；TIFF16 输出为**真 16-bit**（消除了 `(val<<8)|val` 伪 16-bit bit-doubling）
2. **`server/routes/photos.js` render-positive**: 同上，完整全浮点管线
3. **`server/routes/filmlab.js` /render + /export + /preview**: 全部升级为 `processPixelFloat()`，自动检测 16-bit 源
4. **`server/services/export-queue.js`**: 修复 `photo.file_path` → 正确使用 `original_rel_path` 等 DB 列名解析源路径；8-bit 路径也升级为 `processPixelFloat()`
5. **`server/services/render-service.js`**: 添加 16-bit 检测日志
6. **缺失 `saturation` 参数**: export-positive 和 render-positive 的 RenderCore 构造已补充 `saturation` 参数

**技术细节**:
- sharp 在仅应用几何变换 (`rotate`/`resize`/`crop`) 时保留源数据原始位深
- RAW 文件经 `getImageInput()` → `rawDecoder.decode()` → 16-bit TIFF buffer
- `img.raw().toBuffer()` 在 16-bit 源上输出 16-bit 数据（通过 buffer 大小检测）
- `processPixelFloat()` 全程 0.0–1.0 浮点，1024 条 Float32 曲线 LUT，确保最高精度
- 即使源为 8-bit JPEG，float 管线也比旧 int 管线精度更高

#### ✅ rev.3 批量导出 16-bit 路径

`export-queue._exportPhoto()` 已实现：
1. 通过 `sharp.metadata().depth` 检测源图位深（`ushort` / `float`）
2. 高位深源使用 `sharp().raw({ depth: 'ushort' })` 提取 16-bit 像素
3. 归一化到 0.0–1.0 浮点，通过 `RenderCore.processPixelFloat()` 全浮点处理
4. 输出 `sharp().tiff({ bitdepth: 16 })` 真 16-bit TIFF

#### 🟡 固有限制（无需修复）

| 位置 | 限制 | 原因 |
|------|------|------|
| 客户端预览 (Canvas/WebGL) | 8-bit 纹理 | HTML Canvas 固有限制；WebGL `OES_texture_float` 可选但非关键（预览精度足够） |
| 导入存储 | 8-bit JPEG 工作副本 | 原始 RAW 文件保存在 `originals/` 目录，编辑/导出时从原始 RAW 重新解码 |
| handleSave (客户端) | 8-bit | Canvas 路径固有限制；正式导出应走服务端路由 |

### 已有的高精度基础

- **RenderCore.processPixelFloat()**：全程 0.0–1.0 浮点，1024 条 Float32 曲线 LUT
- **Float32 曲线 LUT**：`buildCurveLUTFloat()` 生成 1024 条目 Float32Array
- **RAW 解码**：LibRaw 正确输出 16-bit TIFF
- **全部服务端路由**：rev.4 后统一使用 `processPixelFloat()`，消除了所有 8-bit 瓶颈

---

## 九、后续优化建议

### 中期（P1）
1. **WebGL Float Texture**：使用 `OES_texture_float` 扩展加载 16-bit 源为 float 纹理，preview 精度从 8-bit 提升到 float
2. **HQ Export 路由优化**：将 `smartExportPositive` 的 TIFF/PNG 导出路由到批量队列的 16-bit 路径

### 长期（P2）
5. **16-bit Working Copy**：RAW 导入时可选保留 16-bit TIFF 工作副本，避免 8-bit JPEG 损失
6. **HDR Display 支持**：利用 `canvas.getContext('webgl2')` + `EXT_color_buffer_float` 实现 HDR 预览

---

> 本文档为实施记录文档 (rev.3)。Phase 1–3 已全部实施，Phase 4（测试）待执行。
