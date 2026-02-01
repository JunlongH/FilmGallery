# FilmLab 本地 CPU 渲染回退方案

**版本**: 1.0  
**创建日期**: 2026-01-31  
**最后更新**: 2026-01-31  
**目标**: 确保所有 FilmLab 渲染功能在无 GPU 环境下仍可通过本地 CPU 渲染完成  
**状态**: ✅ 实现完成

---

## 📋 实施进度

| Phase | 任务 | 状态 | 完成日期 |
|-------|------|------|----------|
| 1 | 创建通用 CPU 渲染工具模块 | ✅ 完成 | 2026-01-31 |
| 2 | localGpuPreview 添加 CPU 回退 | ✅ 完成 | 2026-01-31 |
| 3 | localRenderPositive 添加 CPU 回退 | ✅ 完成 | 2026-01-31 |
| 4 | localExportPositive 添加 CPU 回退 | ✅ 完成 | 2026-01-31 |
| 5 | useFilmLabRenderer CPU 路径 | ✅ 完成 | 2026-01-31 |
| 6 | handleGpuExport 添加回退 | ✅ 完成 | 2026-01-31 |

### 新增文件

- `client/src/services/CpuRenderService.js` - 独立的 CPU 渲染服务模块

### 修改文件

- `client/src/services/ComputeService.js` - 添加 CPU 回退逻辑
- `client/src/components/FilmLab/hooks/useFilmLabRenderer.js` - 完善 CPU 路径
- `client/src/components/FilmLab/FilmLab.jsx` - handleGpuExport 添加回退

---

## 📋 目录

1. [背景与问题](#背景与问题)
2. [当前渲染架构分析](#当前渲染架构分析)
3. [关键渲染路径梳理](#关键渲染路径梳理)
4. [需要修改的位置](#需要修改的位置)
5. [实现方案](#实现方案)
6. [测试计划](#测试计划)
7. [性能考量](#性能考量)

---

## 背景与问题

### 当前问题 ✅ 已解决

在混合模式（Hybrid Mode）下：
- **服务器端**（NAS）: 只提供数据存储，无计算能力
- **客户端**：依赖 Electron GPU 渲染

实现后的功能状态：

| 功能 | 状态 | 渲染路径 |
|------|------|---------|
| FilmLab HQ Export | ✅ 正常 | GPU → CPU 回退 |
| FilmLab TIFF16 下载 | ✅ 正常 | GPU → CPU 回退 (PNG) |
| Batch Export (本地模式) | ✅ 正常 | GPU → CPU 回退 |
| FilmLab 实时预览 | ✅ 正常 | WebGL → RenderCore CPU |
| handleSave | ✅ 正常 | RenderCore CPU |
| downloadClientJPEG | ✅ 正常 | WebGL → RenderCore CPU |
| handleGpuExport | ✅ 正常 | GPU → smartExportPositive 回退 |

### 渲染回退流程图

```
smartFilmlabPreview / smartRenderPositive / smartExportPositive
│
├─► 服务器有计算能力 (standalone/remote 模式)
│   └─► 使用服务器 API 渲染 ✅
│
└─► 服务器无计算能力 (hybrid/NAS 模式)
    └─► localGpuPreview / localRenderPositive / localExportPositive
        │
        ├─► Electron GPU 可用
        │   └─► filmlabGpuProcess (WebGL) ✅
        │       │
        │       └─► GPU 失败
        │           └─► CPU 回退 ⬇️
        │
        └─► GPU 不可用或失败
            └─► CpuRenderService (RenderCore)
                ├─► localCpuPreview ✅
                ├─► localCpuRender ✅
                └─► localCpuExport (+ 上传) ✅
```

### 目标 ✅ 已达成

- ✅ 所有渲染功能在无 GPU 时自动回退到本地 CPU 渲染
- ✅ 使用统一的 `RenderCore` 确保渲染一致性
- ✅ 保持现有 GPU 路径的优先级和性能
- ✅ standalone 和 remote 模式不受影响

---

## 当前渲染架构分析

### 渲染引擎层次

```
┌─────────────────────────────────────────────────────────────────┐
│                     渲染入口点 (Entry Points)                     │
├──────────────┬──────────────┬────────────────┬─────────────────┤
│  FilmLab.jsx │ BatchRender  │ useFilmLab     │ ComputeService  │
│  handleSave  │  Modal.jsx   │ Renderer.js    │                 │
│  handleHQ    │              │                │                 │
│  handleGpu   │              │                │                 │
├──────────────┴──────────────┴────────────────┴─────────────────┤
│                     智能路由层 (Smart Router)                     │
│                      ComputeService.js                          │
├──────────────┬──────────────┬────────────────┬─────────────────┤
│ smartFilmlab │ smartRender  │ smartExport    │ batchProcess    │
│ Preview()    │ Positive()   │ Positive()     │                 │
├──────────────┴──────────────┴────────────────┴─────────────────┤
│                        执行层 (Execution)                        │
├──────────────┬──────────────┬────────────────┬─────────────────┤
│  服务器 API   │ 本地 GPU     │ 本地 CPU       │                 │
│  (Express)   │ (Electron)   │ (RenderCore)   │                 │
│              │              │   ⚠️ 部分缺失   │                 │
├──────────────┴──────────────┴────────────────┴─────────────────┤
│                     统一渲染核心 (RenderCore)                     │
│              packages/shared/render/RenderCore.js               │
│                    ✅ CPU processPixel()                         │
│                    ✅ WebGL getGLSLUniforms()                    │
└─────────────────────────────────────────────────────────────────┘
```

### RenderCore 能力

`packages/shared/render/RenderCore.js` 已实现完整的 CPU 渲染流水线：

```javascript
class RenderCore {
  constructor(params) { /* 规范化参数 */ }
  
  prepareLUTs()       // 预计算查找表
  processPixel(r,g,b) // CPU 像素处理 ✅
  getGLSLUniforms()   // WebGL 参数生成
  
  // 完整处理流水线:
  // ① 胶片曲线 (Film Curve)
  // ② 片基校正 (Base Correction)
  // ③ 密度色阶 (Density Levels)
  // ④ 反转 (Inversion)
  // ⑤ 3D LUT
  // ⑥ 白平衡 (White Balance)
  // ⑦ 色调映射 (Tone LUT)
  // ⑧ 曲线 (Curves)
  // ⑨ HSL 调整
  // ⑩ 分离色调 (Split Toning)
}
```

---

## 关键渲染路径梳理

### 1. FilmLab.jsx 中的导出函数

| 函数 | 行号 | 当前实现 | CPU 回退 |
|------|------|---------|---------|
| `handleSave()` | L1517-1600 | ✅ RenderCore CPU | 已实现 |
| `handleHighQualityExport()` | L1603-1652 | smartExportPositive → GPU | ❌ 需添加 |
| `handleGpuExport()` | L1655-1737 | Electron GPU Only | ❌ 需添加 |
| `handleDownload()` | L1740-1777 | smartRenderPositive (TIFF16) | ❌ 需添加 |
| `downloadClientJPEG()` | L1803-2000 | ✅ RenderCore CPU | 已实现 |

### 2. ComputeService.js 本地函数

| 函数 | 行号 | 当前实现 | CPU 回退 |
|------|------|---------|---------|
| `localGpuPreview()` | L152-192 | getLocalGpuProcessor() | ❌ 需添加 |
| `localRenderPositive()` | L272-305 | getLocalGpuProcessor() | ❌ 需添加 |
| `localExportPositive()` | L380-419 | getLocalGpuProcessor() | ❌ 需添加 |
| `batchProcess()` | L687-756 | processAndUpload → GPU | ❌ 需添加 |

### 3. useFilmLabRenderer.js

| 位置 | 行号 | 当前实现 | CPU 回退 |
|------|------|---------|---------|
| `doRender()` CPU 路径 | L117-120 | 仅 drawImage | ❌ 需实现 |

### 4. BatchRenderModal.jsx

| 位置 | 行号 | 当前实现 | 问题 |
|------|------|---------|------|
| 混合模式处理 | L206-266 | batchProcess | 依赖 GPU |

---

## 需要修改的位置

### 优先级 1：ComputeService.js（核心）

这是所有智能路由的入口，需要在这里添加 CPU 回退。

```
文件: client/src/services/ComputeService.js

修改点:
1. ✅ localGpuPreview() → 添加 CPU 回退
2. ✅ localRenderPositive() → 添加 CPU 回退
3. ✅ localExportPositive() → 添加 CPU 回退
4. ✅ 引入 CpuRenderService 模块
```

### 优先级 2：useFilmLabRenderer.js

```
文件: client/src/components/FilmLab/hooks/useFilmLabRenderer.js

修改点:
1. ✅ CPU 路径完整实现 RenderCore 处理
```

### 优先级 3：FilmLab.jsx

```
文件: client/src/components/FilmLab/FilmLab.jsx

修改点:
1. ✅ handleGpuExport() → GPU 失败时回退 CPU
```

### 优先级 4：BatchRenderModal.jsx

```
文件: client/src/components/BatchExport/BatchRenderModal.jsx

修改点:
1. ✅ batchProcess 已自动使用带 CPU 回退的 ComputeService（无需额外修改）
```

---

## 实际实现摘要

### 新增文件: CpuRenderService.js

创建独立的 CPU 渲染服务模块，提供：

- `localCpuPreview()` - 预览渲染（限制宽度 1400px）
- `localCpuRender()` - 高质量渲染（最大 4000px）
- `localCpuExport()` - 导出 + 上传
- `loadImageToCanvas()` - 图片加载工具
- `applyGeometry()` - 几何变换（旋转 + 裁剪）
- `processCanvasWithRenderCore()` - RenderCore 像素处理
- `canvasToBlob()` - Canvas 转 Blob

### 修改: ComputeService.js

渲染回退顺序更新：
1. 服务器渲染（standalone 模式）
2. 本地 GPU 渲染（Electron + WebGL）
3. **本地 CPU 渲染（RenderCore 纯 JavaScript）** ← 新增回退

---

## 实现方案

### Phase 1: 创建通用 CPU 渲染工具

在 `ComputeService.js` 中添加：

```javascript
// ========================================
// LOCAL CPU RENDERING (RenderCore)
// ========================================

import RenderCore from 'render/RenderCore'; // via CRACO alias

/**
 * 使用 Canvas 加载图片
 */
async function loadImageToCanvas(imageUrl, maxWidth = null) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const scale = maxWidth ? Math.min(1, maxWidth / img.width) : 1;
      const w = Math.round(img.width * scale);
      const h = Math.round(img.height * scale);
      
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      ctx.drawImage(img, 0, 0, w, h);
      
      resolve({ canvas, ctx, width: w, height: h, originalWidth: img.width, originalHeight: img.height });
    };
    img.onerror = reject;
    img.src = imageUrl;
  });
}

/**
 * 应用几何变换（旋转 + 裁剪）
 */
function applyGeometry(sourceCanvas, params) {
  const rotation = (params.rotation || 0) + (params.orientation || 0);
  const cropRect = params.cropRect || { x: 0, y: 0, w: 1, h: 1 };
  
  const rad = (rotation * Math.PI) / 180;
  const sin = Math.abs(Math.sin(rad));
  const cos = Math.abs(Math.cos(rad));
  
  const srcW = sourceCanvas.width;
  const srcH = sourceCanvas.height;
  const rotatedW = srcW * cos + srcH * sin;
  const rotatedH = srcW * sin + srcH * cos;
  
  // 裁剪区域
  const cropX = Math.round(cropRect.x * rotatedW);
  const cropY = Math.round(cropRect.y * rotatedH);
  const cropW = Math.max(1, Math.round(cropRect.w * rotatedW));
  const cropH = Math.max(1, Math.round(cropRect.h * rotatedH));
  
  const outCanvas = document.createElement('canvas');
  outCanvas.width = cropW;
  outCanvas.height = cropH;
  const ctx = outCanvas.getContext('2d');
  
  ctx.save();
  ctx.translate(-cropX, -cropY);
  ctx.translate(rotatedW / 2, rotatedH / 2);
  ctx.rotate(rad);
  ctx.drawImage(sourceCanvas, -srcW / 2, -srcH / 2);
  ctx.restore();
  
  return outCanvas;
}

/**
 * 本地 CPU 预览（使用 RenderCore）
 */
async function localCpuPreview({ photoId, params, maxWidth = 1400, sourceType = 'original' }) {
  try {
    const imageUrl = await getPhotoImageUrl(photoId, sourceType);
    if (!imageUrl) {
      return { ok: false, error: 'Cannot get photo image URL' };
    }
    
    const { canvas, ctx, width, height } = await loadImageToCanvas(imageUrl, maxWidth);
    
    // 使用 RenderCore 处理像素
    const core = new RenderCore(params);
    core.prepareLUTs();
    
    const imageData = ctx.getImageData(0, 0, width, height);
    const data = imageData.data;
    
    for (let i = 0; i < data.length; i += 4) {
      if (data[i + 3] === 0) continue;
      const [r, g, b] = core.processPixel(data[i], data[i + 1], data[i + 2]);
      data[i] = r;
      data[i + 1] = g;
      data[i + 2] = b;
    }
    
    ctx.putImageData(imageData, 0, 0);
    
    // 应用几何变换
    const finalCanvas = applyGeometry(canvas, params);
    
    // 转换为 Blob
    return new Promise(resolve => {
      finalCanvas.toBlob(blob => {
        resolve({ ok: true, blob, source: 'local-cpu' });
      }, 'image/jpeg', 0.95);
    });
  } catch (e) {
    console.error('[ComputeService] CPU preview failed:', e);
    return { ok: false, error: e.message || 'CPU preview failed' };
  }
}

/**
 * 本地 CPU 渲染（高质量）
 */
async function localCpuRender({ photoId, params, format = 'jpeg', sourceType = 'original' }) {
  try {
    const imageUrl = await getPhotoImageUrl(photoId, sourceType);
    if (!imageUrl) {
      return { ok: false, error: 'Cannot get photo image URL' };
    }
    
    // 不限制宽度，使用原始分辨率
    const { canvas, ctx, width, height } = await loadImageToCanvas(imageUrl, null);
    
    // 使用 RenderCore 处理
    const core = new RenderCore(params);
    core.prepareLUTs();
    
    const imageData = ctx.getImageData(0, 0, width, height);
    const data = imageData.data;
    
    for (let i = 0; i < data.length; i += 4) {
      if (data[i + 3] === 0) continue;
      const [r, g, b] = core.processPixel(data[i], data[i + 1], data[i + 2]);
      data[i] = r;
      data[i + 1] = g;
      data[i + 2] = b;
    }
    
    ctx.putImageData(imageData, 0, 0);
    
    // 应用几何变换
    const finalCanvas = applyGeometry(canvas, params);
    
    // 转换为 Blob
    const mimeType = format === 'tiff16' ? 'image/tiff' : 'image/jpeg';
    const quality = format === 'jpeg' ? 1.0 : undefined;
    
    // 注意: Canvas 不支持 TIFF，需要特殊处理
    if (format === 'tiff16') {
      // TIFF16 需要服务器支持或特殊库
      // 回退到 PNG 保持无损
      return new Promise(resolve => {
        finalCanvas.toBlob(blob => {
          resolve({ 
            ok: true, 
            blob, 
            contentType: 'image/png',
            source: 'local-cpu',
            warning: 'TIFF16 not supported in CPU mode, using PNG' 
          });
        }, 'image/png');
      });
    }
    
    return new Promise(resolve => {
      finalCanvas.toBlob(blob => {
        resolve({ ok: true, blob, contentType: mimeType, source: 'local-cpu' });
      }, mimeType, quality);
    });
  } catch (e) {
    console.error('[ComputeService] CPU render failed:', e);
    return { ok: false, error: e.message || 'CPU render failed' };
  }
}
```

### Phase 2: 修改 localGpuPreview 添加回退

```javascript
/**
 * 本地 GPU 预览处理（带 CPU 回退）
 */
async function localGpuPreview({ photoId, params, maxWidth, sourceType = 'original' }) {
  const gpuProcessor = getLocalGpuProcessor();
  
  // 尝试 GPU 处理
  if (gpuProcessor) {
    try {
      const imageUrl = await getPhotoImageUrl(photoId, sourceType);
      if (!imageUrl) {
        return { ok: false, error: `Cannot get photo image URL for sourceType: ${sourceType}` };
      }
      
      const result = await gpuProcessor({ 
        params, 
        photoId, 
        imageUrl,
        previewMode: true,
        maxWidth,
        sourceType 
      });
      
      if (result?.ok) {
        return { ok: true, blob: result.blob, source: 'local-gpu' };
      }
      
      console.warn('[ComputeService] GPU preview failed, falling back to CPU:', result?.error);
    } catch (e) {
      console.warn('[ComputeService] GPU preview exception, falling back to CPU:', e.message);
    }
  }
  
  // 回退到 CPU 处理
  console.log('[ComputeService] Using CPU fallback for preview');
  return await localCpuPreview({ photoId, params, maxWidth, sourceType });
}
```

### Phase 3: 修改 localRenderPositive 添加回退

```javascript
/**
 * 本地渲染正片（带 CPU 回退）
 */
async function localRenderPositive(photoId, params, { format = 'jpeg', sourceType = 'original' } = {}) {
  const gpuProcessor = getLocalGpuProcessor();
  
  // 尝试 GPU 处理
  if (gpuProcessor) {
    try {
      const imageUrl = await getPhotoImageUrl(photoId, sourceType);
      if (!imageUrl) {
        return { ok: false, error: `Cannot get photo image URL for sourceType: ${sourceType}` };
      }
      
      const result = await gpuProcessor({ 
        params, 
        photoId, 
        imageUrl,
        previewMode: false,
        outputFormat: format,
        sourceType
      });
      
      if (result?.ok) {
        return { 
          ok: true, 
          blob: result.blob,
          contentType: format === 'tiff16' ? 'image/tiff' : 'image/jpeg',
          source: 'local-gpu' 
        };
      }
      
      console.warn('[ComputeService] GPU render failed, falling back to CPU:', result?.error);
    } catch (e) {
      console.warn('[ComputeService] GPU render exception, falling back to CPU:', e.message);
    }
  }
  
  // 回退到 CPU 处理
  console.log('[ComputeService] Using CPU fallback for render');
  return await localCpuRender({ photoId, params, format, sourceType });
}
```

### Phase 4: 修改 localExportPositive 添加回退

```javascript
/**
 * 本地导出正片（带 CPU 回退 + 上传）
 */
async function localExportPositive(photoId, params, { format = 'jpeg', sourceType = 'original' } = {}) {
  const gpuProcessor = getLocalGpuProcessor();
  
  // 尝试 GPU 处理
  if (gpuProcessor) {
    try {
      const imageUrl = await getPhotoImageUrl(photoId, sourceType);
      if (!imageUrl) {
        return createError(ComputeErrorCodes.PHOTO_NOT_FOUND, 'Cannot get photo image URL');
      }
      
      console.log('[ComputeService] Attempting GPU export, photoId:', photoId);
      
      const result = await gpuProcessor({ 
        params, 
        photoId, 
        imageUrl,
        previewMode: false,
        outputFormat: format,
        sourceType
      });
      
      if (result?.ok) {
        console.log('[ComputeService] GPU export successful');
        return { 
          ok: true, 
          photo: result.photo,
          filePath: result.filePath,
          source: 'local-gpu' 
        };
      }
      
      console.warn('[ComputeService] GPU export failed, falling back to CPU:', result?.error);
    } catch (e) {
      console.warn('[ComputeService] GPU export exception, falling back to CPU:', e.message);
    }
  }
  
  // 回退到 CPU 处理 + 上传
  console.log('[ComputeService] Using CPU fallback for export');
  
  const renderResult = await localCpuRender({ photoId, params, format, sourceType });
  
  if (!renderResult.ok) {
    return renderResult;
  }
  
  // 上传到服务器
  const uploadResult = await uploadProcessedResult(renderResult.blob, {
    photoId,
    filename: `filmlab_${photoId}_${Date.now()}.${format === 'tiff16' ? 'png' : 'jpg'}`,
    type: 'positive'
  });
  
  if (!uploadResult.ok) {
    return { 
      ok: false, 
      error: uploadResult.error || 'Upload failed',
      blob: renderResult.blob, // 返回 blob 以便本地保存
      source: 'local-cpu-no-upload'
    };
  }
  
  return {
    ok: true,
    photo: uploadResult.photo,
    filePath: uploadResult.filePath,
    source: 'local-cpu-uploaded'
  };
}
```

### Phase 5: 修改 useFilmLabRenderer.js

```javascript
// 在 doRender 的 CPU 路径中:
} else {
  // CPU 渲染路径（使用 RenderCore）
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (ctx && image) {
    canvas.width = image.width;
    canvas.height = image.height;
    ctx.drawImage(image, 0, 0);
    
    // 使用 RenderCore 处理
    const core = new RenderCore(params);
    core.prepareLUTs();
    
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const data = imageData.data;
    
    for (let i = 0; i < data.length; i += 4) {
      if (data[i + 3] === 0) continue;
      const [r, g, b] = core.processPixel(data[i], data[i + 1], data[i + 2]);
      data[i] = r;
      data[i + 1] = g;
      data[i + 2] = b;
    }
    
    ctx.putImageData(imageData, 0, 0);
  }
}
```

### Phase 6: FilmLab.jsx handleGpuExport 回退

```javascript
const handleGpuExport = async () => {
  if (gpuBusy) return;
  setGpuBusy(true);
  
  try {
    // 检查 GPU 是否可用
    if (window.__electron?.filmlabGpuProcess) {
      // ... 现有 GPU 代码 ...
      const res = await window.__electron.filmlabGpuProcess({ params, photoId, imageUrl });
      if (res?.ok) {
        // GPU 成功
        if (onPhotoUpdate) onPhotoUpdate();
        if (res.filePath) {
          window.__electron.showInFolder?.(res.filePath);
          alert('GPU Export Saved To:\n' + res.filePath);
        }
        return;
      }
      console.warn('GPU export failed, trying CPU fallback:', res?.error);
    }
    
    // CPU 回退
    console.log('[FilmLab] GPU unavailable or failed, using CPU export');
    const result = await smartExportPositive(photoId, currentParams, { 
      format: 'jpeg', 
      sourceType 
    });
    
    if (result?.ok) {
      if (onPhotoUpdate) onPhotoUpdate();
      alert('Export completed (CPU mode)');
    } else {
      alert('Export failed: ' + (result?.error || 'Unknown error'));
    }
  } catch (e) {
    console.error('Export failed', e);
    alert('Export Failed: ' + (e.message || e));
  } finally {
    setGpuBusy(false);
  }
};
```

---

## 测试计划

### 单元测试

| 测试项 | 验证内容 |
|-------|---------|
| RenderCore.processPixel | 确保处理结果与 WebGL 一致 |
| localCpuPreview | 加载图片、处理、几何变换 |
| localCpuRender | 高质量渲染输出 |
| 回退逻辑 | GPU 失败后正确切换到 CPU |

### 集成测试

| 场景 | 测试步骤 |
|------|---------|
| 混合模式无 GPU | 1. 配置 hybrid 模式<br>2. 禁用 Electron GPU<br>3. 测试所有导出功能 |
| 批量渲染 | 1. 选择多张照片<br>2. 执行批量渲染<br>3. 验证进度和结果 |
| FilmLab HQ Export | 1. 编辑照片参数<br>2. 点击 HQ Export<br>3. 验证输出文件 |

### 性能测试

| 测试项 | 预期 |
|-------|------|
| CPU 预览延迟 | < 500ms (1400px) |
| CPU 高质量渲染 | < 3s (4000px) |
| 批量渲染 10 张 | < 30s |

---

## 性能考量

### CPU 渲染性能优化

1. **Web Workers**: 将像素处理移到 Worker 线程
2. **分块处理**: 大图分块渲染避免阻塞
3. **缓存 LUT**: RenderCore 已实现 `prepareLUTs()` 预计算

### 建议的渐进式实现

1. **v1.0**: 基础 CPU 回退（当前方案）
2. **v1.1**: Web Worker 支持
3. **v2.0**: WASM 加速（可选）

---

## 文件修改清单

| 文件 | 修改类型 | 优先级 |
|------|---------|--------|
| `client/src/services/ComputeService.js` | 重构 | P0 |
| `client/src/components/FilmLab/hooks/useFilmLabRenderer.js` | 完善 | P1 |
| `client/src/components/FilmLab/FilmLab.jsx` | 增强 | P2 |
| `client/src/components/BatchExport/BatchRenderModal.jsx` | 验证 | P3 |

---

## 附录：关键代码位置速查

### ComputeService.js

```
L43-71:   getServerCapabilities()
L77-81:   isComputeAvailable()
L83-91:   isHybridMode()
L96-109:  getLocalGpuProcessor()
L115-150: smartFilmlabPreview()
L152-192: localGpuPreview() → 需添加 CPU 回退
L236-283: smartRenderPositive()
L272-305: localRenderPositive() → 需添加 CPU 回退
L332-419: smartExportPositive()
L380-419: localExportPositive() → 需添加 CPU 回退
L687-756: batchProcess()
```

### FilmLab.jsx

```
L1517-1600: handleSave() ✅ 已使用 RenderCore
L1603-1652: handleHighQualityExport()
L1655-1737: handleGpuExport() → 需添加回退
L1740-1777: handleDownload()
L1803-2000: downloadClientJPEG() ✅ 已使用 RenderCore
```

### RenderCore.js

```
L62:      constructor(params)
L75:      normalizeParams()
L166:     prepareLUTs()
L230:     processPixel(r, g, b) ✅ CPU 渲染核心
L340:     getGLSLUniforms()
```

---

**文档结束**
