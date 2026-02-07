# 170MP Panasonic Pixel-Shift RW2 导入失败诊断

## 问题描述

使用 Panasonic 相机的 **像素偏移（pixel-shift / 摇摇乐）** 模式拍摄的 RW2 文件约 **1.7 亿像素**（≈15000×11000），导入 FilmGallery 时报错 **"文件无法解析"**（file cannot be parsed）。

典型参数：
- 分辨率：~15000 × 11000（170 Megapixels）
- 文件大小：200–400 MB（取决于压缩方式）
- 16-bit RAW, 3 通道 → 像素缓冲区 ≈ 15000 × 11000 × 3 × 2 = **990 MB**

---

## 导入流水线追踪

```
客户端 UploadModal
  → FormData + XHR (uploadWithProgress, 5min timeout)
    → Multer 磁盘存储 (uploadTmp, 500MB fileSize limit)   ← ✅ 已修复 (200→500MB)
      → rolls.js POST /api/rolls  
        → photo-upload-service.processFileForRoll()
          → image-processor.decodeRawFile(halfSize=true)   ← ✅ 已修复 (>100MB自动halfSize)
            → raw-decoder.decode() (LibRaw halfSize)       ← ✅ 已修复
          → image-processor.processToJpeg()                ← ✅ 已修复 (timeout 120s, limitInputPixels: false)
            → sharp(buffer) with sharpWithTimeout(120s)    ← ✅ 已修复 (30s→120s)
          → image-processor.generateThumbnail()            ← ✅ 已修复 (timeout 30s, limitInputPixels: false)
            → sharp.resize() with sharpWithTimeout(30s)    ← ✅ 已修复 (10s→30s)
```

---

## 根因分析

### ✅ 根因 1：Multer 200MB 文件大小限制（最可能的直接原因）— 已修复

**文件位置：**
- [server/config/multer.js](../server/config/multer.js#L24) — `uploadTmp` 配置
- [server/routes/raw.js](../server/routes/raw.js#L36) — `rawUpload` 配置

**代码：**
```js
// server/config/multer.js line 24
limits: { fileSize: 200 * 1024 * 1024 }  // 200MB

// server/routes/raw.js line 36
limits: { fileSize: 200 * 1024 * 1024 }  // 200MB
```

**影响：** Panasonic pixel-shift RW2 文件通常 200–400 MB，超出 200MB 限制后，Multer 会抛出 `LIMIT_FILE_SIZE` 错误，经 `error-handler.js` 转换为 "File too large" 响应，客户端显示为 "文件无法解析"。

**✅ 已修复：** 两处均已提升至 500MB
```js
limits: { fileSize: 500 * 1024 * 1024 }  // 500MB - support pixel-shift RAW files
```

---

### ✅ 根因 2：Sharp 处理超时（30 秒）— 已修复

**文件位置：** [server/services/image-processor.js](../server/services/image-processor.js#L29)

**✅ 已修复：** 超时从 30s 提升至 120s
```js
const SHARP_TIMEOUT = 120000;  // 120 seconds — raised for pixel-shift RAW ~170MP
```

配合根因 4 的 halfSize 修复（170MP → 42MP），120 秒绑定宽裕。

---

### ✅ 根因 3：缩略图生成超时（10 秒）— 已修复

**文件位置：** [server/services/image-processor.js](../server/services/image-processor.js#L30)

**✅ 已修复：** 超时从 10s 提升至 30s
```js
const THUMB_TIMEOUT = 30000;  // 30 seconds — raised for pixel-shift RAW ~170MP
```

缩略图是从已处理的 JPEG 生成（而非从 170MP 原始数据），30s 足够。

---

### ✅ 根因 4：LibRaw 全分辨率解码（无 halfSize）— 已修复

**文件位置：** [server/services/raw-decoder.js](../server/services/raw-decoder.js) — `decode()` 函数

**代码：**
```js
// 导入阶段调用
rawDecoder.decode(filePath, { outputFormat })  // 没有 halfSize 选项！
```

对比：`extractThumbnail` 函数使用了 `halfSize(true)` 来加速，但 **正常导入路径的 `decode()` 使用全分辨率解码**。

170MP 全分辨率 demosaic：
- 内存：~990 MB 仅像素缓冲区，加上 LibRaw 内部缓冲 → 总计 **>2 GB**
- 时间：全分辨率 demosaic 170MP 可能需要 30–60 秒

**✅ 已修复：** 导入阶段对 >100MB 的 RAW 文件自动使用 `halfSize: true`

修改点：
- `image-processor.js` 的 `decodeRawFile()` 新增 `halfSize` 选项，透传至 `raw-decoder.decode()`
- `photo-upload-service.js` 的 `processFileForRoll()` 检测文件大小，>100MB 时传 `halfSize: true`

```js
// photo-upload-service.js
const fileStats = fs.statSync(file.tmpPath);
const useHalfSize = fileStats.size > 100 * 1024 * 1024; // >100MB
const decoded = await imageProcessor.decodeRawFile(file.tmpPath, { halfSize: useHalfSize });
```

效果：170MP → 42MP，内存降 75%，处理时间降 75%+。
全分辨率 decode 仅在 FilmLab 渲染/导出时按需进行。

---

### ✅ 根因 5：进程内存不足（OOM 风险）— 已缓解（通过根因 4 修复）

**影响链路：**
1. LibRaw 加载 RW2 → ~400 MB 文件缓冲
2. 全 demosaic → ~990 MB 像素缓冲区
3. Sharp 接收像素缓冲区 → 内部再分配 ~990 MB
4. JPEG 编码 → 额外缓冲

**总内存峰值可达 3–4 GB**，Node.js 默认堆大小（~1.7 GB for V8 old space）可能 OOM。Electron 主进程或 server 子进程会直接崩溃，无有意义的错误信息。

**✅ 已缓解：** 通过根因 4 的 halfSize 修复，导入阶段内存峰值从 ~3-4GB 降至 ~800MB：
- LibRaw halfSize decode: ~250 MB 像素缓冲区
- Sharp 转换: ~250 MB
- 峰值 < 1 GB，在 Node.js 默认堆限制内

如确需全分辨率（FilmLab 导出），可通过 `--max-old-space-size=8192` 增加 Node.js 堆。

---

### ✅ 根因 6：Sharp `limitInputPixels` 未设置 — 已修复

**文件位置：** [server/services/image-processor.js](../server/services/image-processor.js#L55-L80) — `processToJpeg`

**代码：**
```js
const pipeline = sharp(input, { failOn: 'none' });  // 没有 limitInputPixels
```

Sharp 默认 `limitInputPixels = 268,402,689`（≈268 MP）。170MP 在此限制内不会被拒绝，但如果未来有更大文件（如 400MP multi-shot），会被 Sharp 直接拒绝。

**✅ 已修复：** `processToJpeg` 和 `generateThumbnail` 均已添加 `limitInputPixels: false`
```js
sharp(input, { failOn: 'none', limitInputPixels: false })  // processToJpeg
sharp(input, { limitInputPixels: false })                   // generateThumbnail
```

---

### 🟡 根因 7：LibRaw 版本对 Pixel-Shift 模式的支持

**文件位置：** [server/services/raw-decoder.js](../server/services/raw-decoder.js)

**当前版本：**
- 主解码器：`@filmgallery/libraw-native`（LibRaw 0.22）
- 备选：`lightdrift-libraw`（LibRaw 0.21.4）

Panasonic 的 pixel-shift 模式（如 LUMIX S5 II / S1R 的高分辨率模式）在 LibRaw 0.21+ 已有基础支持，但**某些机型的 pixel-shift composite 格式**可能需要更新的 LibRaw（0.21.3+）才能正确解析。

如果 LibRaw 无法识别该格式，会在 `loadFile` 或 `processImage` 阶段直接抛错，导致 "file cannot be parsed"。

**排查方法：**
```bash
# 用 LibRaw 自带工具测试
dcraw_emu -v -T pixel_shift_file.rw2
# 或检查 libraw 版本
node -e "const lr = require('@filmgallery/libraw-native'); console.log(lr.version)"
```

---

## 优先级排序（推荐修复顺序）

| 优先级 | 根因 | 状态 | 影响 |
|--------|------|------|------|
| **P0** | 根因 1: Multer 200→500MB | ✅ 已修复 | 直接阻塞大文件上传 |
| **P0** | 根因 4: halfSize 导入 | ✅ 已修复 | 降低内存/时间消耗 75%+ |
| **P1** | 根因 2: 30s→120s Sharp 超时 | ✅ 已修复 | 防止处理大图超时 |
| **P1** | 根因 5: OOM 风险 | ✅ 已缓解 | 依赖根因 4 修复 |
| **P2** | 根因 3: 10s→30s 缩略图超时 | ✅ 已修复 | 次要 |
| **P2** | 根因 6: limitInputPixels: false | ✅ 已修复 | 前瞻性 |
| **P2** | 根因 7: LibRaw 版本 | ⚠️ 需测试 | 可能是根本原因 |

---

## 快速验证步骤

1. **确认文件大小是否超过 200MB：**
   - 如果超过 → 根因 1 是直接原因
   - 如果不超过 → 继续排查

2. **查看服务器日志：**
   - `"File too large"` → 根因 1
   - `"timeout"` / `"Promise timed out"` → 根因 2 或 3
   - `"Cannot allocate memory"` / 进程崩溃 → 根因 5
   - `"Unsupported file format"` / LibRaw 错误 → 根因 7

3. **单独测试 LibRaw 解码：**
   ```js
   const decoder = require('@filmgallery/libraw-native');
   // 或 require('lightdrift-libraw')
   decoder.decode('path/to/pixel_shift.rw2', { outputFormat: 'tiff' });
   ```

---

## 修复方案实施状态

### ✅ 第一阶段（快速修复，解决导入阻塞）— 已完成

1. ✅ 提升 Multer 限制至 **500MB** — `server/config/multer.js`, `server/routes/raw.js`
2. ✅ 提升 `SHARP_TIMEOUT` 至 **120s**，`THUMB_TIMEOUT` 至 **30s** — `server/services/image-processor.js`
3. ✅ 对 `processToJpeg` 和 `generateThumbnail` 添加 `limitInputPixels: false` — `server/services/image-processor.js`

### ✅ 第二阶段（性能优化）— 已完成

4. ✅ 导入阶段 >100MB RAW 自动使用 `halfSize: true`（170MP → 42MP，内存降 75%）
   - `server/services/image-processor.js` — `decodeRawFile()` 新增 halfSize 选项
   - `server/services/photo-upload-service.js` — `processFileForRoll()` 检测文件大小
5. ⏭️ 提取 RW2 嵌入式 JPEG 预览 — 暂不需要（halfSize 已足够）
6. ✅ 全分辨率 decode 仅在 FilmLab 渲染/导出时按需进行（未改动已有行为）

### ⚠️ 第三阶段（健壮性）— 待实施

7. ⬚ 添加客户端文件大小预检（`UploadModal.jsx`），对超大文件给出提示
8. ⬚ 验证 LibRaw 版本对目标机型 pixel-shift 的支持
9. ⬚ 增加 Node.js `--max-old-space-size` 配置（Electron main 和 server fork）

---

*文档创建时间：2025-01*
*最后更新：2026-02-06（标注修复状态）*
*相关文档：[FILMLAB-EXPORT-QUALITY-FIX.md](./FILMLAB-EXPORT-QUALITY-FIX.md)*
