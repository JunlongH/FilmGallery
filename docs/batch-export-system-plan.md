# FilmLab 批量导出系统设计文档

> 版本: 1.1  
> 创建日期: 2026-01-15  
> 更新日期: 2026-01-15  
> 状态: 规划中

## 目录

1. [功能概述](#1-功能概述)
2. [系统架构](#2-系统架构)
3. [模块设计](#3-模块设计)
4. [数据流](#4-数据流)
5. [API 设计](#5-api-设计)
6. [UI 设计](#6-ui-设计)
7. [实现计划](#7-实现计划)
8. [现有代码评估](#8-现有代码评估)

---

## 1. 功能概述

本系统包含两个独立但相关的功能模块：

### 1.1 功能 A: 批量渲染 (Batch Render)

对负片进行批量 FilmLab 渲染处理。

| 输出模式 | 描述 | 输出位置 |
|----------|------|----------|
| **写入库** | 渲染正片写入数据库，更新缩略图 | `positive_rel_path`, `positive_thumb_rel_path` |
| **下载渲染结果** | 渲染后下载到本地文件夹 | 用户选择的任意目录 |

**参数来源**：
| 来源 | 描述 | 工作流 |
|------|------|--------|
| **FilmLab 实时调参** | 进入 FilmLab 界面现场调整参数 | 支持选择预览照片，调整满意后应用到批量 |
| **LUT 文件** | 加载外部 .cube LUT 文件 | 仅应用 LUT 变换，其他参数使用默认值或已保存值 |
| **预设库** | 从已保存的预设中选择 | 快速应用常用配置 |

### 1.2 功能 B: 批量下载 (Batch Download)

下载库中已有的文件（无需渲染），支持 EXIF 元数据写入。

| 下载类型 | 描述 | 来源字段 |
|----------|------|----------|
| **Positive** | 下载已渲染的正片 | `positive_rel_path` |
| **Negative** | 下载原始负片扫描 | `negative_rel_path` |
| **Original** | 下载原始上传文件 | `original_rel_path` |

**EXIF 写入功能**：
- 从数据库读取照片元数据
- 写入标准 EXIF 标签（相机、镜头、光圈、快门、ISO、焦距、日期时间、GPS 等）
- 支持自定义 EXIF 模板

**模块化设计**：此功能与 ImageViewer 界面的单张下载功能共享底层模块。

### 1.3 照片选择策略（两个功能共用）

| 策略 | 描述 | 使用场景 |
|------|------|----------|
| **多选处理** | 处理用户手动选择的照片 | 精确控制需要处理的照片 |
| **全部照片** | 处理当前卷的所有照片 | 批量初始化或重新渲染 |
| **仅无正片** | 仅处理 `positive_rel_path` 为空的照片 | 增量处理新上传的负片（仅渲染功能） |

### 1.4 控制功能

- ✅ 进度显示（当前/总数、百分比、当前处理的照片）
- ✅ 取消机制（可随时中断批量任务）
- ✅ 暂停/恢复（可暂停任务稍后继续）
- ✅ 失败重试（单张失败不影响整体，可重试失败项）

---

## 2. 系统架构

```
┌─────────────────────────────────────────────────────────────────────┐
│                          客户端 (React)                              │
├─────────────────────────────────────────────────────────────────────┤
│  ┌────────────┐  ┌────────────┐  ┌─────────────┐  ┌─────────────┐   │
│  │ RollDetail │  │ FilmLab    │  │ BatchRender │  │ BatchDownload│  │
│  │ (照片选择) │  │ (参数调整) │  │ Modal       │  │ Modal        │  │
│  └─────┬──────┘  └─────┬──────┘  └──────┬──────┘  └──────┬───────┘  │
│        │               │                │                 │          │
│        └───────────────┴────────────────┴─────────────────┘          │
│                                │                                     │
│               ┌────────────────▼────────────────┐                    │
│               │     BatchExportService          │                    │
│               │     (客户端状态管理)            │                    │
│               └────────────────┬────────────────┘                    │
│                                │ WebSocket                           │
└────────────────────────────────┼────────────────────────────────────┘
                                 │
┌────────────────────────────────▼────────────────────────────────────┐
│                          服务端 (Node.js)                            │
├─────────────────────────────────────────────────────────────────────┤
│  ┌─────────────────────────────────────────────────────────────────┐│
│  │                      API Layer                                  ││
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐           ││
│  │  │ batch-render │  │batch-download│  │ photos/:id/  │           ││
│  │  │ /library     │  │              │  │ download     │           ││
│  │  │ /download    │  │              │  │ (单张)       │           ││
│  │  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘           ││
│  └─────────┼─────────────────┼─────────────────┼───────────────────┘│
│            │                 │                 │                    │
│  ┌─────────▼─────────────────▼─────────────────▼───────────────────┐│
│  │                   ExportQueueService                            ││
│  │              (任务队列管理, 进度推送)                           ││
│  └─────────┬─────────────────┬─────────────────────────────────────┘│
│            │                 │                                      │
│  ┌─────────▼─────────┐  ┌────▼─────────────┐  ┌───────────────────┐ │
│  │  RenderService    │  │ DownloadService  │  │   ExifService     │ │
│  │  (渲染逻辑)       │  │ (下载逻辑)       │  │   (EXIF读写)      │ │
│  │  ↓                │  │  ↓               │  │                   │ │
│  │  RenderCore       │  │  复制文件        │◄─│   写入EXIF        │ │
│  └─────────┬─────────┘  └────┬─────────────┘  └───────────────────┘ │
│            │                 │                                      │
│  ┌─────────▼─────────────────▼─────────────────────────────────────┐│
│  │                      Storage Layer                              ││
│  │  ┌─────────────┐   ┌─────────────┐   ┌─────────────┐            ││
│  │  │ 库内写入    │   │ 本地下载    │   │  数据库     │            ││
│  │  │ (uploads/)  │   │ (用户目录)  │   │  (SQLite)   │            ││
│  │  └─────────────┘   └─────────────┘   └─────────────┘            ││
│  └─────────────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────────────┘
```

---

## 3. 模块设计

### 3.1 服务端模块

#### 3.1.1 RenderService (新建)

**文件**: `server/services/render-service.js`

**职责**: 统一的照片渲染逻辑，供单张导出和批量导出共用。

```javascript
/**
 * 渲染单张照片
 * @param {Object} options
 * @param {number} options.photoId - 照片 ID
 * @param {Object} options.params - FilmLab 处理参数
 * @param {string} options.format - 'jpeg' | 'tiff16'
 * @param {number} options.quality - JPEG 质量 (1-100)
 * @param {number} options.maxWidth - 最大宽度
 * @returns {Promise<{buffer: Buffer, width: number, height: number}>}
 */
async function renderPhoto(options) { ... }

/**
 * 渲染并保存到库
 * @returns {Promise<{positivePath: string, thumbPath: string}>}
 */
async function renderToLibrary(photoId, params) { ... }

/**
 * 渲染并保存到指定目录
 * @returns {Promise<{outputPath: string}>}
 */
async function renderToDirectory(photoId, params, outputDir, filename) { ... }
```

#### 3.1.2 ExportQueueService (重构)

**文件**: `server/services/export-queue.js`

**重构内容**:
- 修复 `filmlabParams` → `edit_params` 列名错误
- 调用 `RenderService` 而非重复实现渲染逻辑
- 增强任务状态管理（暂停、取消、重试）
- WebSocket 进度推送

```javascript
class ExportQueueService {
  // 任务状态
  static STATUS = {
    PENDING: 'pending',
    PROCESSING: 'processing', 
    COMPLETED: 'completed',
    FAILED: 'failed',
    CANCELLED: 'cancelled',
    PAUSED: 'paused'
  };

  // 创建批量任务
  async createBatchJob(options) { ... }
  
  // 控制方法
  async cancelJob(jobId) { ... }
  async pauseJob(jobId) { ... }
  async resumeJob(jobId) { ... }
  async retryFailed(jobId) { ... }
  
  // 进度查询
  getJobProgress(jobId) { ... }
}
```

#### 3.1.3 DownloadService (新建)

**文件**: `server/services/download-service.js`

**职责**: 统一的文件下载逻辑，供单张下载和批量下载共用。与 ImageViewer 共享。

```javascript
/**
 * 准备下载文件（复制到临时目录，写入 EXIF）
 * @param {Object} options
 * @param {number} options.photoId - 照片 ID
 * @param {string} options.type - 'positive' | 'negative' | 'original'
 * @param {boolean} options.writeExif - 是否写入 EXIF
 * @param {Object} options.exifTemplate - 自定义 EXIF 模板
 * @returns {Promise<{filePath: string, filename: string, mimeType: string}>}
 */
async function prepareDownload(options) { ... }

/**
 * 批量下载到指定目录
 * @param {number[]} photoIds - 照片 ID 列表
 * @param {string} type - 'positive' | 'negative' | 'original'
 * @param {string} outputDir - 输出目录
 * @param {Object} options - 下载选项（EXIF、命名规则等）
 * @returns {Promise<{success: number, failed: number, files: string[]}>}
 */
async function batchDownload(photoIds, type, outputDir, options) { ... }
```

#### 3.1.4 ExifService (新建)

**文件**: `server/services/exif-service.js`

**职责**: EXIF 元数据读写，供下载功能使用。

```javascript
/**
 * 从数据库构建 EXIF 数据
 * @param {Object} photo - 照片记录
 * @param {Object} roll - 卷记录
 * @returns {Object} EXIF 数据对象
 */
function buildExifData(photo, roll) { ... }

/**
 * 写入 EXIF 到图片文件
 * @param {string} filePath - 图片文件路径
 * @param {Object} exifData - EXIF 数据
 * @returns {Promise<void>}
 */
async function writeExif(filePath, exifData) { ... }

/**
 * 读取图片 EXIF
 * @param {string} filePath - 图片文件路径
 * @returns {Promise<Object>} EXIF 数据
 */
async function readExif(filePath) { ... }

// 支持的 EXIF 标签
const SUPPORTED_TAGS = {
  // 相机信息
  Make: 'camera_make',
  Model: 'camera_model',
  LensModel: 'lens',
  
  // 拍摄参数
  FNumber: 'aperture',
  ExposureTime: 'shutter_speed',
  ISOSpeedRatings: 'iso',
  FocalLength: 'focal_length',
  
  // 时间
  DateTimeOriginal: 'date_taken + time_taken',
  
  // GPS
  GPSLatitude: 'latitude',
  GPSLongitude: 'longitude',
  
  // 描述
  ImageDescription: 'caption',
  UserComment: 'notes',
  Artist: 'photographer'
};
```

#### 3.1.5 PresetService (增强)

**文件**: `server/services/preset-service.js` (新建)

**职责**: 预设管理逻辑抽取，支持更丰富的预设操作。

```javascript
/**
 * 获取预设参数（合并默认值）
 */
async function getPresetParams(presetId) { ... }

/**
 * 验证预设参数完整性
 */
function validatePresetParams(params) { ... }

/**
 * 从 LUT 文件创建临时预设
 */
async function createPresetFromLUT(lutPath, intensity = 1.0) { ... }
```

### 3.2 客户端模块

#### 3.2.1 BatchExportModal (新建)

**文件**: `client/src/components/BatchExport/BatchExportModal.jsx`

**职责**: 批量导出配置界面

```jsx
<BatchExportModal
  isOpen={boolean}
  onClose={Function}
  rollId={number}
  selectedPhotos={Photo[]}          // 多选的照片
  allPhotos={Photo[]}               // 卷内所有照片
  onComplete={Function}             // 完成回调
/>
```

**UI 结构**:
```
┌─────────────────────────────────────────────────────┐
│ 批量渲染                                       [✕] │
├─────────────────────────────────────────────────────┤
│                                                     │
│ ▼ 输出模式                                          │
│   ○ 写入库 (更新正片和缩略图)                       │
│   ○ 渲染后下载到本地                                │
│     └─ 输出目录: [________________] [选择...]       │
│                                                     │
│ ▼ 照片范围                                          │
│   ○ 选中的照片 (12 张)                              │
│   ○ 所有照片 (36 张)                                │
│   ○ 仅无正片 (8 张)                                 │
│                                                     │
│ ▼ 处理参数                                          │
│   ○ 使用 FilmLab 调参 [打开 FilmLab...]            │
│   ○ 加载 LUT 文件    [选择文件...]                 │
│   ○ 使用预设                                        │
│     └─ [▼ 选择预设________________]                 │
│                                                     │
│ ▼ 输出设置 (仅下载模式)                             │
│   格式: [▼ JPEG ]  质量: [95]  最大宽度: [4000]    │
│                                                     │
├─────────────────────────────────────────────────────┤
│              [取消]              [开始渲染]         │
└─────────────────────────────────────────────────────┘
```

#### 3.2.2 BatchDownloadModal (新建)

**文件**: `client/src/components/BatchExport/BatchDownloadModal.jsx`

**职责**: 批量下载配置界面（下载已有文件，非渲染）

```jsx
<BatchDownloadModal
  isOpen={boolean}
  onClose={Function}
  rollId={number}
  selectedPhotos={Photo[]}          // 多选的照片
  allPhotos={Photo[]}               // 卷内所有照片
  onComplete={Function}             // 完成回调
/>
```

**UI 结构**:
```
┌─────────────────────────────────────────────────────┐
│ 批量下载                                       [✕] │
├─────────────────────────────────────────────────────┤
│                                                     │
│ ▼ 下载类型                                          │
│   ○ Positive (正片)  - 已有 28/36 张               │
│   ○ Negative (负片)  - 已有 36/36 张               │
│   ○ Original (原始)  - 已有 36/36 张               │
│                                                     │
│ ▼ 照片范围                                          │
│   ○ 选中的照片 (12 张)                              │
│   ○ 所有照片 (36 张)                                │
│                                                     │
│ ▼ 输出目录                                          │
│   [D:/Downloads/Roll_2026-01-15______] [选择...]    │
│                                                     │
│ ▼ EXIF 设置                                         │
│   ☑ 写入 EXIF 元数据                                │
│     ☑ 相机/镜头信息                                 │
│     ☑ 拍摄参数 (光圈/快门/ISO/焦距)                │
│     ☑ 日期时间                                      │
│     ☑ GPS 位置                                      │
│     ☑ 描述/备注                                     │
│                                                     │
│ ▼ 命名规则                                          │
│   [▼ {frame}_{filename}        ]                   │
│   预览: 01_IMG_0001.jpg                             │
│                                                     │
├─────────────────────────────────────────────────────┤
│              [取消]              [开始下载]         │
└─────────────────────────────────────────────────────┘
```

#### 3.2.3 BatchExportProgress (新建)

**文件**: `client/src/components/BatchExport/BatchExportProgress.jsx`

**职责**: 批量导出进度显示和控制

```jsx
<BatchExportProgress
  jobId={string}
  onCancel={Function}
  onPause={Function}
  onResume={Function}
  onComplete={Function}
/>
```

**UI 结构**:
```
┌─────────────────────────────────────────────────────┐
│ 批量导出进度                                        │
├─────────────────────────────────────────────────────┤
│                                                     │
│  正在处理: IMG_0023.tif                             │
│                                                     │
│  ████████████████░░░░░░░░░░░░░░  12 / 36 (33%)     │
│                                                     │
│  ✓ 已完成: 11    ✗ 失败: 1    ○ 待处理: 24         │
│                                                     │
├─────────────────────────────────────────────────────┤
│   [暂停]   [取消]                     [重试失败]   │
└─────────────────────────────────────────────────────┘
```

#### 3.2.3 BatchExportService (新建)

**文件**: `client/src/services/batch-export-service.js`

**职责**: 客户端批量导出状态管理和 API 调用

```javascript
class BatchExportService {
  // 创建任务
  async createJob(options) { ... }
  
  // 控制任务
  async cancel(jobId) { ... }
  async pause(jobId) { ... }
  async resume(jobId) { ... }
  
  // 订阅进度更新 (WebSocket)
  subscribeProgress(jobId, callback) { ... }
  unsubscribeProgress(jobId) { ... }
}
```

#### 3.2.4 FilmLab 增强

**文件**: `client/src/components/FilmLab/FilmLab.jsx`

**新增功能**:
- 「应用到批量」按钮
- 批量模式下的照片切换器（预览不同照片验证效果）

```jsx
// 新增 props
<FilmLab
  mode="single" | "batch"           // 单张 vs 批量模式
  batchPhotos={Photo[]}             // 批量模式下可切换的照片列表
  onApplyToBatch={Function}         // 应用当前参数到批量
/>
```

---

## 4. 数据流

### 4.1 批量渲染 - 写入库

```
用户选择照片 → 配置参数来源 → 开始渲染
                    ↓
         POST /api/batch-render/library
                    ↓
         ExportQueueService.createBatchJob()
                    ↓
         ┌─────────────────────────────────┐
         │  For each photo:                │
         │    1. 获取源文件路径            │
         │    2. 合并参数 (预设 + 覆盖)    │
         │    3. RenderService.render()    │
         │    4. 保存正片到 uploads/       │
         │    5. 生成缩略图                │
         │    6. 更新数据库记录            │
         │    7. 推送进度 via WebSocket    │
         └─────────────────────────────────┘
                    ↓
         更新 UI，刷新照片列表
```

### 4.2 批量渲染 - 下载结果

```
用户选择照片 → 配置参数来源 → 选择输出目录 → 开始渲染
                    ↓
         POST /api/batch-render/download
                    ↓
         ExportQueueService.createBatchJob()
                    ↓
         ┌─────────────────────────────────┐
         │  For each photo:                │
         │    1. 获取源文件路径            │
         │    2. 合并参数                  │
         │    3. RenderService.render()    │
         │    4. 写入到输出目录            │
         │    5. 推送进度                  │
         └─────────────────────────────────┘
                    ↓
         渲染完成，显示输出目录链接
```

### 4.3 批量下载 - 已有文件 (新增)

```
用户选择照片 → 选择下载类型 → 配置 EXIF → 选择输出目录 → 开始下载
                    ↓
         POST /api/batch-download
                    ↓
         DownloadService.batchDownload()
                    ↓
         ┌─────────────────────────────────┐
         │  For each photo:                │
         │    1. 获取源文件路径            │
         │       (positive/negative/orig)  │
         │    2. 如启用 EXIF:              │
         │       a. 从数据库读取元数据     │
         │       b. ExifService.writeExif()│
         │    3. 复制到输出目录            │
         │    4. 推送进度                  │
         └─────────────────────────────────┘
                    ↓
         下载完成，显示输出目录链接
```

### 4.4 单张下载 (ImageViewer 共享模块)

```
用户点击下载按钮 → 选择类型 → 可选 EXIF
                    ↓
         DownloadService.prepareDownload()
                    ↓
         ┌─────────────────────────────────┐
         │  1. 查找源文件                  │
         │  2. 如启用 EXIF:                │
         │     a. 读取元数据               │
         │     b. 复制到临时目录           │
         │     c. 写入 EXIF                │
         │  3. 返回文件流                  │
         └─────────────────────────────────┘
                    ↓
         浏览器下载文件
```

### 4.3 FilmLab 调参流程

```
用户点击「使用 FilmLab 调参」
            ↓
打开 FilmLab (batch mode)
            ↓
显示照片切换器（可选择批量中任意照片预览）
            ↓
用户调整参数，实时预览效果
            ↓
点击「应用到批量」
            ↓
返回 BatchExportModal，携带当前参数
            ↓
继续批量导出流程
```

---

## 5. API 设计

### 5.1 批量导出端点

#### 5.1.1 创建库内渲染任务

```http
POST /api/batch-export/library
Content-Type: application/json

{
  "rollId": 123,
  "scope": "selected" | "all" | "no-positive",
  "photoIds": [1, 2, 3],              // scope=selected 时必填
  "paramsSource": {
    "type": "preset" | "lut" | "custom",
    "presetId": 456,                  // type=preset 时
    "lutPath": "/path/to.cube",       // type=lut 时
    "lutIntensity": 0.8,              // type=lut 时
    "params": { ... }                 // type=custom 时 (FilmLab 参数)
  }
}

Response:
{
  "jobId": "batch-123-456",
  "totalPhotos": 12,
  "status": "pending"
}
```

#### 5.1.2 创建本地下载任务

```http
POST /api/batch-export/download
Content-Type: application/json

{
  "rollId": 123,
  "scope": "selected" | "all" | "no-positive",
  "photoIds": [1, 2, 3],
  "paramsSource": { ... },            // 同上
  "outputDir": "D:/Exports/Roll123",
  "format": "jpeg" | "tiff16",
  "quality": 95,
  "maxWidth": 4000,
  "namingPattern": "{filename}" | "{frame}_{filename}" | "{date}_{frame}"
}

Response:
{
  "jobId": "batch-123-789",
  "totalPhotos": 12,
  "outputDir": "D:/Exports/Roll123",
  "status": "pending"
}
```

#### 5.1.3 查询任务进度

```http
GET /api/batch-export/:jobId/progress

Response:
{
  "jobId": "batch-123-456",
  "status": "processing" | "completed" | "failed" | "cancelled" | "paused",
  "total": 12,
  "completed": 5,
  "failed": 1,
  "current": {
    "photoId": 6,
    "filename": "IMG_0023.tif"
  },
  "failedItems": [
    { "photoId": 3, "error": "Source file not found" }
  ]
}
```

#### 5.1.4 控制任务

```http
POST /api/batch-export/:jobId/cancel
POST /api/batch-export/:jobId/pause
POST /api/batch-export/:jobId/resume
POST /api/batch-export/:jobId/retry   // 重试失败项
```

### 5.2 批量下载端点 (新增)

#### 5.2.1 创建批量下载任务

```http
POST /api/batch-download
Content-Type: application/json

{
  "rollId": 123,
  "scope": "selected" | "all",
  "photoIds": [1, 2, 3],              // scope=selected 时必填
  "type": "positive" | "negative" | "original",
  "outputDir": "D:/Downloads/Roll123",
  "exif": {
    "enabled": true,
    "camera": true,                   // 相机/镜头信息
    "shooting": true,                 // 光圈/快门/ISO/焦距
    "datetime": true,                 // 日期时间
    "gps": true,                      // GPS 位置
    "description": true               // 描述/备注
  },
  "namingPattern": "{frame}_{filename}" | "{filename}" | "{date}_{frame}"
}

Response:
{
  "jobId": "download-123-456",
  "totalPhotos": 12,
  "availablePhotos": 10,              // 有对应类型文件的照片数
  "skippedPhotos": 2,                 // 无文件跳过的照片数
  "outputDir": "D:/Downloads/Roll123",
  "status": "pending"
}
```

#### 5.2.2 单张下载 (与 ImageViewer 共享)

```http
GET /api/photos/:id/download?type=positive|negative|original&exif=true

Response: 
  Content-Type: image/jpeg | image/tiff
  Content-Disposition: attachment; filename="IMG_0001.jpg"
  [Binary image data with EXIF]
```

### 5.3 WebSocket 进度推送

```javascript
// 客户端订阅
ws.send(JSON.stringify({ 
  type: 'subscribe', 
  jobId: 'batch-123-456' 
}));

// 服务端推送
{
  "type": "batch-progress",
  "jobId": "batch-123-456",
  "event": "photo-complete" | "photo-failed" | "job-complete" | "job-cancelled",
  "data": {
    "photoId": 5,
    "completed": 6,
    "total": 12,
    "error": null
  }
}
```

---

## 6. UI 设计

### 6.1 入口点

| 入口位置 | 触发方式 | 功能 | 描述 |
|----------|----------|------|------|
| RollDetail 工具栏 | 「批量渲染」按钮 | 批量渲染 | 渲染当前卷的负片 |
| RollDetail 工具栏 | 「批量下载」按钮 | 批量下载 | 下载已有的 pos/neg/orig |
| RollDetail 多选模式 | 选中照片后「渲染选中」 | 批量渲染 | 渲染选中的照片 |
| RollDetail 多选模式 | 选中照片后「下载选中」 | 批量下载 | 下载选中的照片 |
| FilmLab 界面 | 「应用到整卷」按钮 | 批量渲染 | 用当前参数批量渲染 |
| ImageViewer 界面 | 「下载」按钮 | 单张下载 | 下载当前照片（共享模块） |

### 6.2 模态框状态机

```
                    ┌─────────────┐
                    │   CLOSED    │
                    └──────┬──────┘
                           │ open
                           ▼
                    ┌─────────────┐
           ┌────────│  CONFIGURE  │────────┐
           │        └──────┬──────┘        │
           │               │ start         │ openFilmLab
           │               ▼               ▼
           │        ┌─────────────┐  ┌─────────────┐
           │        │  PROGRESS   │  │  FILMLAB    │
           │        └──────┬──────┘  └──────┬──────┘
           │               │               │ applyParams
           │               │               │
           │    ┌──────────┴──────────┐    │
           │    ▼                     ▼    │
           │ ┌──────┐           ┌────────┐ │
           │ │DONE  │           │CANCELLED│◄┘
           │ └──┬───┘           └────────┘
           │    │ close
           └────┴──────────────────────────►[CLOSED]
```

### 6.3 FilmLab 批量模式

在批量模式下，FilmLab 顶部增加照片切换器：

```
┌─────────────────────────────────────────────────────────────────┐
│ ◄ 返回批量导出                                                  │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  预览照片: [◄] IMG_0001.tif (1/12) [►]   [应用到全部 12 张]    │
│                                                                 │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│                     (正常 FilmLab 界面)                         │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## 7. 实现计划

### Phase 1: 基础设施 (预计 2 天)

| 任务 | 文件 | 描述 |
|------|------|------|
| 1.1 | `server/services/render-service.js` | 创建共享渲染服务 |
| 1.2 | `server/services/download-service.js` | 创建共享下载服务 |
| 1.3 | `server/services/exif-service.js` | 创建 EXIF 读写服务 |
| 1.4 | `server/routes/photos.js` | 重构 export-positive 使用 RenderService |
| 1.5 | `server/services/export-queue.js` | 修复列名错误，使用 RenderService |
| 1.6 | `server/services/preset-service.js` | 创建预设服务 |

### Phase 2: 批量渲染 API (预计 2 天)

| 任务 | 文件 | 描述 |
|------|------|------|
| 2.1 | `server/routes/batch-render.js` | 创建批量渲染路由 |
| 2.2 | `server/services/export-queue.js` | 增强任务控制（暂停/取消/重试） |
| 2.3 | `server/websocket.js` | 添加进度推送 |
| 2.4 | `client/src/api.js` | 添加批量渲染 API 函数 |

### Phase 3: 批量下载 API (预计 1.5 天)

| 任务 | 文件 | 描述 |
|------|------|------|
| 3.1 | `server/routes/batch-download.js` | 创建批量下载路由 |
| 3.2 | `server/routes/photos.js` | 添加单张下载端点 (GET /download) |
| 3.3 | `client/src/api.js` | 添加批量下载 API 函数 |

### Phase 4: 客户端 UI - 批量渲染 (预计 2 天)

| 任务 | 文件 | 描述 |
|------|------|------|
| 4.1 | `client/src/components/BatchExport/BatchRenderModal.jsx` | 渲染配置界面 |
| 4.2 | `client/src/components/BatchExport/BatchExportProgress.jsx` | 进度界面 (共享) |
| 4.3 | `client/src/services/batch-export-service.js` | 客户端服务 |
| 4.4 | `client/src/components/RollDetail.jsx` | 集成渲染入口 |

### Phase 5: 客户端 UI - 批量下载 (预计 1.5 天)

| 任务 | 文件 | 描述 |
|------|------|------|
| 5.1 | `client/src/components/BatchExport/BatchDownloadModal.jsx` | 下载配置界面 |
| 5.2 | `client/src/components/RollDetail.jsx` | 集成下载入口 |
| 5.3 | `client/src/components/ImageViewer/ImageViewer.jsx` | 集成单张下载 (共享模块) |

### Phase 6: FilmLab 集成 (预计 2 天)

| 任务 | 文件 | 描述 |
|------|------|------|
| 6.1 | `client/src/components/FilmLab/FilmLab.jsx` | 添加批量模式支持 |
| 6.2 | `client/src/components/FilmLab/PhotoSwitcher.jsx` | 照片切换器组件 |
| 6.3 | `client/src/components/FilmLab/FilmLabControls.jsx` | 「应用到批量」按钮 |

### Phase 7: 测试与优化 (预计 2 天)

| 任务 | 描述 |
|------|------|
| 7.1 | 单元测试 RenderService, DownloadService, ExifService |
| 7.2 | 集成测试批量渲染和下载流程 |
| 7.3 | 性能优化（并发控制、内存管理） |
| 7.4 | 错误处理和边界情况 |

---

## 8. 现有代码评估

### 8.1 可复用组件

| 组件 | 位置 | 状态 | 说明 |
|------|------|------|------|
| 预设 CRUD API | `server/routes/presets.js` | ✅ 可用 | 完整实现 |
| 预设 UI | `FilmLabControls.jsx` | ✅ 可用 | 需提取为独立组件 |
| 多选状态管理 | `RollDetail.jsx` | ✅ 可用 | 可直接使用 |
| ExportQueuePanel | `ExportQueuePanel.jsx` | ⚠️ 需改造 | 改为使用新服务 |
| RenderCore | `packages/shared/RenderCore.js` | ✅ 可用 | 核心渲染逻辑 |
| buildPipeline | `server/services/filmlab-service.js` | ✅ 可用 | 几何变换处理 |

### 8.2 需要清理的代码

| 文件 | 问题 | 处理方式 |
|------|------|----------|
| `export-queue.js` | `filmlabParams` 列名错误 | 修复为 `edit_params` |
| `export-queue.js` | 重复实现渲染逻辑 | 改用 RenderService |
| `RollDetail.jsx` | `handleBatchExport` 不完整 | 重写调用新 API |
| `batch-export.js` (路由) | 与新设计冲突 | 重构或替换 |

### 8.3 数据库变更

无需变更，现有 schema 已支持：
- `photos.positive_rel_path` - 正片路径
- `photos.positive_thumb_rel_path` - 正片缩略图
- `photos.edit_params` - FilmLab 参数 JSON
- `presets` 表 - 预设存储

---

## 附录 A: 文件结构

```
server/
├── routes/
│   ├── batch-render.js       # 新建: 批量渲染 API
│   ├── batch-download.js     # 新建: 批量下载 API
│   ├── photos.js             # 修改: 使用 RenderService, 添加单张下载
│   └── presets.js            # 保持: 预设 CRUD
├── services/
│   ├── render-service.js     # 新建: 统一渲染服务
│   ├── download-service.js   # 新建: 统一下载服务
│   ├── exif-service.js       # 新建: EXIF 读写服务
│   ├── export-queue.js       # 重构: 任务队列
│   ├── preset-service.js     # 新建: 预设服务
│   └── filmlab-service.js    # 保持: 几何变换
└── websocket.js              # 修改: 添加进度推送

client/src/
├── components/
│   ├── BatchExport/
│   │   ├── index.js
│   │   ├── BatchRenderModal.jsx      # 新建: 批量渲染配置
│   │   ├── BatchDownloadModal.jsx    # 新建: 批量下载配置
│   │   ├── BatchExportProgress.jsx   # 新建: 进度显示 (共享)
│   │   └── PresetSelector.jsx        # 新建: 预设选择器
│   ├── FilmLab/
│   │   ├── FilmLab.jsx               # 修改: 批量模式
│   │   └── PhotoSwitcher.jsx         # 新建: 照片切换器
│   ├── ImageViewer/
│   │   └── ImageViewer.jsx           # 修改: 集成单张下载
│   └── RollDetail.jsx                # 修改: 集成入口
├── services/
│   └── batch-export-service.js       # 新建: 客户端批量服务
└── api.js                            # 修改: 添加 API
```

---

## 附录 B: EXIF 标签映射

| EXIF 标签 | 数据库字段 | 说明 |
|-----------|------------|------|
| `Make` | `rolls.camera` (解析品牌) | 相机制造商 |
| `Model` | `rolls.camera` | 相机型号 |
| `LensModel` | `photos.lens` | 镜头型号 |
| `FNumber` | `photos.aperture` | 光圈值 |
| `ExposureTime` | `photos.shutter_speed` | 快门速度 |
| `ISOSpeedRatings` | `photos.iso` | ISO 感光度 |
| `FocalLength` | `photos.focal_length` | 焦距 |
| `DateTimeOriginal` | `photos.date_taken + time_taken` | 拍摄日期时间 |
| `GPSLatitude` | `photos.latitude` | GPS 纬度 |
| `GPSLongitude` | `photos.longitude` | GPS 经度 |
| `ImageDescription` | `photos.caption` | 图片描述 |
| `UserComment` | `photos.notes` | 用户备注 |
| `Artist` | `photos.photographer` | 摄影师 |
| `Copyright` | `rolls.photographer` (fallback) | 版权信息 |
| `Software` | `'FilmGallery'` | 软件名称 |

---

## 附录 C: 预设参数完整结构

```javascript
{
  // 反转
  inverted: boolean,
  inversionMode: 'linear' | 'log',
  
  // 胶片曲线
  filmCurveEnabled: boolean,
  filmCurveProfile: string,
  
  // 基础调整
  exposure: number,      // -100 to 100
  contrast: number,      // -100 to 100
  highlights: number,    // -100 to 100
  shadows: number,       // -100 to 100
  whites: number,        // -100 to 100
  blacks: number,        // -100 to 100
  
  // 白平衡
  temp: number,          // -100 to 100
  tint: number,          // -100 to 100
  red: number,           // 0.05 to 50
  green: number,         // 0.05 to 50
  blue: number,          // 0.05 to 50
  
  // 曲线
  curves: {
    rgb: [{x, y}, ...],
    red: [{x, y}, ...],
    green: [{x, y}, ...],
    blue: [{x, y}, ...]
  },
  
  // HSL (8 通道)
  hslParams: {
    red: { hue, saturation, luminance },
    orange: { hue, saturation, luminance },
    yellow: { hue, saturation, luminance },
    green: { hue, saturation, luminance },
    cyan: { hue, saturation, luminance },
    blue: { hue, saturation, luminance },
    purple: { hue, saturation, luminance },
    magenta: { hue, saturation, luminance }
  },
  
  // 分离色调
  splitToning: {
    highlights: { hue, saturation },
    midtones: { hue, saturation },
    shadows: { hue, saturation },
    balance: number
  },
  
  // 3D LUT
  lut1: { path, intensity },
  lut2: { path, intensity }
}
```
