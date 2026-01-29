# 边缘检测服务 RAW 格式支持计划

> **状态**: 待实施  
> **创建日期**: 2026-01-29  
> **相关文件**: 
> - `server/services/edge-detection-service.js`
> - `server/services/raw-decoder.js`
> - `server/routes/edge-detection.js`

## 1. 现状分析

### 1.1 当前实现
当前 `server/services/edge-detection-service.js` 使用 `sharp` 库直接读取图像文件进行预处理：

```javascript
// edge-detection-service.js - preprocessImage() 当前实现
async preprocessImage(imagePath, maxWidth = 1200) {
  const metadata = await sharp(imagePath).metadata();  // ❌ RAW 文件在这里失败
  // ...
  const { data, info } = await sharp(imagePath)
    .resize(newWidth, newHeight, { fit: 'inside' })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  // ...
}
```

### 1.2 问题分析
*   **问题**：虽然 `sharp` 支持常见格式（JPG, PNG, TIFF），但对于 RAW 格式（CR2, NEF, ARW 等）的支持依赖于系统环境或构建配置（libvips），且通常不支持相机原生的 RAW 格式。
*   **后果**：目前调用 `detectEdges` 处理 RAW 文件时，`sharp(imagePath)` 会抛出 "Input buffer contains unsupported image format" 或类似错误，导致自动裁剪功能在 RAW 文件上失效。
*   **资源**：项目中已存在 `server/services/raw-decoder.js`，该服务封装了 `@filmgallery/libraw-native`，专门用于稳定高效地解码各类 RAW 文件。

### 1.3 支持的 RAW 格式 (raw-decoder.js)
```javascript
const SUPPORTED_EXTENSIONS = [
  '.dng', '.cr2', '.cr3', '.nef', '.arw', 
  '.raf', '.orf', '.rw2', '.pef', '.srw',
  '.x3f', '.erf', '.mef', '.mos', '.mrw',
  '.kdc', '.3fr', '.fff', '.iiq', '.dcr', '.k25', '.qtk'
];
```

## 2. 目标
1.  **全面支持 RAW**：使 `auto-detect edges` (自动边缘检测) 功能支持所有 `raw-decoder.js` 支持的格式（CR2, NEF, ARW, DNG 等）。
2.  **统一解码路径**：利用现有的 `raw-decoder.js` 作为 RAW 处理的统一入口，避免引入重复依赖。
3.  **保持接口兼容**：不修改现有的 API 接口和返回数据结构。
4.  **性能可控**：在解码过程中采用优化策略（如半尺寸解码），最大限度减少对检测速度的影响。

## 3. 实施方案

### 3.1 核心服务改造 (`server/services/edge-detection-service.js`)

需引入 `raw-decoder` 服务，并修改 `preprocessImage` 方法。

#### 3.1.1 引入依赖
```javascript
const rawDecoder = require('./raw-decoder');
```

#### 3.1.2 修改 `preprocessImage`
逻辑流变更：
1.  接收 `imagePath`。
2.  使用 `rawDecoder.isRawFile(imagePath)` 判断是否为 RAW 文件。
3.  **如果是 RAW 文件**：
    *   调用 `rawDecoder.decode(imagePath, { outputFormat: 'jpeg', halfSize: true })`。
    *   **关键点**：使用 `halfSize: true`。LibRaw 的半尺寸解码速度极快，且生成的图像足以进行边缘检测（边缘检测通常还会进一步缩小图像）。这能将解码耗时控制在合理范围。
    *   获取返回的 Buffer。
    *   将 Buffer 作为输入源传给 `sharp`。
4.  **如果是普通图片**：
    *   保持原逻辑，直接将 `imagePath` 传给 `sharp`。

#### 3.1.3 处理坐标一致性
边缘检测算法返回的是**归一化坐标** (Normalized Coordinates, 0.0-1.0)。
*   **优势**：无论通过 `halfSize` 解码出来的图像是原图的 1/2 还是 1/4，只要长宽比保持不变，归一化的裁剪区域 `rect(x%, y%, w%, h%)` 应用到全尺寸原图上依然是准确的。
*   **注意**：`sharp(buffer).metadata()` 获取的是解码后 Buffer 的尺寸。对于 edge-detection 内部逻辑，这没有问题。

### 3.2 辅助方法改造 (`applyDetectionResult`)

虽然该方法目前主要在服务端内部使用，但为了健壮性，也应支持 RAW。

逻辑：
1.  检查输入是否为 RAW。
2.  如果是，先解码为 Buffer。
3.  再进行旋转和裁剪操作。
4.  **注意**：如果是为了生成“最终成品”，可能不应该使用 `halfSize`，或者应该明确该方法仅用于生成预览。如果用于导出，建议走专门的 Export 流程（使用 `filmlab-service`）。此处的 `applyDetectionResult` 若仅用于调试或生成缩略图，则逻辑同上。

### 3.3 代码实现草案

```javascript
// server/services/edge-detection-service.js

// ... imports
const rawDecoder = require('./raw-decoder');

class EdgeDetectionService {
  // ... existing methods

  async preprocessImage(imagePath, maxWidth) {
    let input = imagePath;
    let isRaw = false;

    // RAW 格式特殊处理
    if (rawDecoder.isRawFile(imagePath)) {
      try {
        // 使用 halfSize 快速解码
        // outputFormat: 'jpeg' 兼容性最好，sharp 可直接读取
        const buffer = await rawDecoder.decode(imagePath, { 
          outputFormat: 'jpeg',
          halfSize: true 
        });
        input = buffer;
        isRaw = true;
      } catch (error) {
        console.error('[EdgeDetection] RAW decode failed, falling back to sharp native:', error);
        // 如果 rawDecoder 失败，可以选择抛出异常或尝试让 sharp 直接读取（虽然可能会失败）
        throw error;
      }
    }

    // 获取元数据 (input 可能是路径字符串，也可能是 Buffer)
    const metadata = await sharp(input).metadata();
    
    // 计算缩放比例 (基于解码后的尺寸)
    const scale = metadata.width > maxWidth ? maxWidth / metadata.width : 1;
    const newWidth = Math.round(metadata.width * scale);
    const newHeight = Math.round(metadata.height * scale);

    // ... 后续转换逻辑不变
    const { data, info } = await sharp(input)
      .resize(newWidth, newHeight, { fit: 'inside' })
      .removeAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });

    return {
      data: new Uint8Array(data),
      width: info.width,
      height: info.height,
      channels: info.channels,
      // 注意：如果是 halfSize RAW，这里的 originalSize 是半大尺寸
      // 但不影响归一化的 cropRect 计算
      originalSize: { width: metadata.width, height: metadata.height }
    };
  }

  // ...
}
```

## 4. 验证与测试计划

### 4.1 测试环境准备
*   确保 `server/services/raw-decoder.js` 正常工作（依赖各平台 LibRaw 库）。
*   准备一组测试图片：
    *   Canon CR2/CR3
    *   Sony ARW
    *   Nikon NEF
    *   普通 JPG (作为对照)

### 4.2 API 测试
调用 `POST /api/photos/:id/detect-edges` 接口：
1.  **JPG 测试**：确保现有功能未退化。
2.  **RAW 测试**：
    *   发送 RAW 图片 ID。
    *   观察服务器日志，确认 `[RawDecoder]` 被调用。
    *   检查响应中 `success: true`。
    *   检查响应中 `cropRect` 是否合理（非空，非 0,0,1,1）。

### 4.3 性能验证
记录 RAW 文件进行边缘检测的平均耗时。
*   预期：比 JPG 慢（因为含解码步骤），但在 2-3 秒内为可接受。
*   如果过慢，检查是否正确启用了 `halfSize`。

## 5. 维护性说明
*   **解耦**：边缘检测服务不直接包含 RAW 解码逻辑，而是调用 `raw-decoder`，符合单一职责原则。
*   **扩展性**：未来支持更多 RAW 格式只需更新 `raw-decoder`，边缘检测服务自动获益。
*   **回退机制**：如果 `raw-decoder`（native）不可用，它会自动回退到 `lightdrift-libraw` (wasm/js)，保证了功能的可用性。

## 6. 风险与注意事项

### 6.1 潜在风险
| 风险 | 影响 | 缓解措施 |
|------|------|----------|
| LibRaw 解码失败 | 边缘检测无法进行 | 捕获异常并返回明确错误信息 |
| halfSize 导致边缘检测精度下降 | 可能检测不到细微边缘 | 边缘检测本身会进一步缩小到 1200px，halfSize 影响可忽略 |
| 内存占用增加 | RAW 解码需要额外内存 | halfSize 减少内存占用约 75% |

### 6.2 兼容性矩阵
| 文件类型 | 解码路径 | 预期性能 |
|----------|----------|----------|
| JPEG/PNG | sharp 直接读取 | <100ms |
| TIFF | sharp 直接读取 | <200ms |
| CR2/NEF/ARW 等 RAW | raw-decoder → Buffer → sharp | ~1-2s |
| 损坏的 RAW | 返回错误 | N/A |

### 6.3 日志增强
建议在实施时添加以下日志点：
```javascript
console.log(`[EdgeDetection] Processing: ${path.basename(imagePath)}, isRaw: ${isRaw}`);
if (isRaw) {
  console.log(`[EdgeDetection] RAW decode took ${decodeTime}ms`);
}
console.log(`[EdgeDetection] Total detection took ${totalTime}ms`);
```

## 7. 后续优化建议

### 7.1 缓存机制
对于同一张 RAW 图片的多次边缘检测请求，可以考虑缓存解码后的 Buffer：
```javascript
const rawCache = new LRUCache({ max: 10, maxAge: 60000 });
```

### 7.2 并行处理
批量边缘检测时，可以使用 worker_threads 并行处理多张 RAW 文件。

### 7.3 客户端预检
客户端在调用 API 前检查文件类型，对于 RAW 文件显示 "处理中..." 提示。

---

## 附录：相关 API

### 边缘检测 API
```
POST /api/edge-detection/photos/:id/detect-edges
POST /api/edge-detection/photos/batch-detect-edges
POST /api/edge-detection/photos/:id/apply-edge-detection
POST /api/edge-detection/rolls/:id/apply-edge-detection-to-all
```

### RAW 解码 API
```
GET  /api/raw/status
GET  /api/raw/supported-formats
POST /api/raw/decode
```


