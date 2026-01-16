# 批量导出系统实现总结

## 实现日期: 2026-01-16 (更新: 2026-01-16)

## 概述

根据 `batch-export-system-plan.md` v1.1 设计文档，完成了批量导出系统的核心实现。

---

## 已创建文件

### 1. 服务端基础服务 (Phase 1)

#### `server/services/render-service.js`
统一渲染服务，封装 RenderCore 像素处理。

**导出函数:**
- `renderPhoto(photo, params, options)` - 渲染单张照片
- `renderToLibrary(photo, params)` - 渲染并写入库
- `renderToDirectory(photo, params, outputPath, options)` - 渲染到指定目录
- `getPresetParams(presetId)` - 从数据库获取预设参数
- `mergeParams(base, overrides)` - 深度合并参数

#### `server/services/exif-service.js`
EXIF 元数据读写服务，使用 piexifjs。

**导出函数:**
- `buildExifData(photo, options)` - 构建 EXIF 数据对象
- `writeExif(imageBuffer, exifData, format)` - 写入 EXIF 到图像
- `readExif(imagePath)` - 读取图像 EXIF
- `convertToDecimal(gpsStr)` - GPS 转换辅助

**支持的 EXIF 标签:**
- 相机: Make, Model
- 镜头: LensModel
- 拍摄参数: FNumber, ExposureTime, ISO, FocalLength
- GPS: GPSLatitude, GPSLongitude
- 其他: DateTimeOriginal, ImageDescription, Artist, Copyright

#### `server/services/download-service.js`
统一下载服务，支持正片/底片/原始文件。

**导出函数:**
- `prepareDownload(photo, options)` - 准备单张下载
- `batchDownload(photos, options)` - 批量下载
- `cleanupTempFile(filePath)` - 清理临时文件
- `getAvailableCount(photos, downloadType)` - 获取可用数量

---

### 2. 批量渲染 API (Phase 2)

#### `server/routes/batch-render.js`
批量 FilmLab 渲染 API 路由。

**端点:**
- `POST /api/batch-render/library` - 批量渲染到库
- `POST /api/batch-render/download` - 批量渲染后下载
- `GET /api/batch-render/:jobId/progress` - 获取任务进度
- `POST /api/batch-render/:jobId/cancel` - 取消任务
- `POST /api/batch-render/:jobId/pause` - 暂停任务
- `POST /api/batch-render/:jobId/resume` - 恢复任务
- `GET /api/batch-render/jobs` - 列出所有任务

**请求体参数 (library/download):**
```json
{
  "rollId": 1,
  "scope": "all" | "selected" | "no-positive",
  "photoIds": [1, 2, 3],
  "paramsSource": {
    "type": "preset" | "custom" | "lut",
    "presetId": 1,
    "params": {},
    "lutPath": "",
    "overrides": {}
  },
  "outputDir": "D:/Exports",
  "format": "jpeg" | "tiff16",
  "quality": 95
}
```

---

### 3. 批量下载 API (Phase 3)

#### `server/routes/batch-download.js`
批量下载 API 路由（下载现有文件）。

**端点:**
- `POST /api/batch-download` - 创建批量下载任务
- `GET /api/batch-download/:jobId/progress` - 获取下载进度
- `POST /api/batch-download/:jobId/cancel` - 取消下载
- `GET /api/batch-download/availability` - 检查文件可用性
- `GET /api/batch-download/single/:id` - 单张下载 (ImageViewer 共享)

---

### 4. 客户端 API (Phase 4)

#### `client/src/api.js` (修改)
新增批量导出 API 函数：
- `createBatchRenderLibrary(params)`
- `createBatchRenderDownload(params)`
- `getBatchRenderProgress(jobId)`
- `cancelBatchRender(jobId)`
- `pauseBatchRender(jobId)`
- `resumeBatchRender(jobId)`
- `getBatchRenderJobs()`
- `createBatchDownload(params)`
- `getBatchDownloadProgress(jobId)`
- `cancelBatchDownload(jobId)`
- `checkDownloadAvailability(params)`
- `getSingleDownloadUrl(photoId, options)`

---

### 5. UI 组件 (Phase 4)

#### `client/src/components/BatchExport/BatchExportProgress.jsx`
通用进度显示组件，支持暂停/恢复/取消。

**Props:**
- `jobId` - 任务 ID
- `jobType` - 'render' | 'download'
- `getProgress` - 获取进度的 API 函数
- `cancelJob` - 取消任务的 API 函数
- `pauseJob` - 暂停任务的 API 函数 (可选)
- `resumeJob` - 恢复任务的 API 函数 (可选)
- `onProgress` - 进度回调
- `onComplete` - 完成回调

#### `client/src/components/BatchExport/BatchRenderModal.jsx`
批量渲染配置模态框。

**功能:**
- 输出模式选择（写入库 / 渲染后下载）
- 照片范围选择（选中 / 全部 / 仅无正片）
- 处理参数选择（预设 / FilmLab 调参 / LUT）
- 输出设置（格式、质量、目录）

#### `client/src/components/BatchExport/BatchDownloadModal.jsx`
批量下载配置模态框。

**功能:**
- 下载类型选择（正片 / 底片 / 原始）
- 可用性检查显示
- 照片范围选择
- 输出目录选择
- 命名规则选择
- EXIF 选项

#### `client/src/components/BatchExport/index.js`
组件导出索引。

---

### 6. 集成 (Phase 4)

#### `client/src/components/RollDetail.jsx` (修改)
- 导入 BatchRenderModal 和 BatchDownloadModal
- 添加 `showBatchRenderModal` 和 `showBatchDownloadModal` 状态
- 添加 `handleBatchRender()` 和 `handleBatchDownload()` 函数
- 添加 `handleBatchExportComplete()` 回调
- 在工具栏添加 "Batch Render" 和 "Batch Download" 按钮
- 渲染 BatchRenderModal 和 BatchDownloadModal 组件
- **已删除**: 旧版 Legacy Export 按钮和 `handleBatchExport()` 函数
- **已删除**: `ExportQueuePanel` 导入
- **已删除**: `showExportQueue` 和 `exportBusy` 状态

---

## 已修改文件

| 文件 | 修改内容 |
|------|----------|
| `server/server.js` | 注册 batch-render 和 batch-download 路由 |
| `client/src/api.js` | 添加 ~150 行批量 API 函数 |
| `client/src/components/RollDetail.jsx` | 添加批量导出按钮和模态框, 删除旧版导出 |

---

## 依赖

- `piexifjs` - EXIF 读写库 (已安装)

---

## Bug 修复记录 (2026-01-16)

### 批量下载 "Unexpected token '<'" 错误

**问题**: 点击批量下载按钮时报错 `Unexpected token '<', "<!DOCTYPE "... is not valid JSON`

**原因**: 
1. `checkDownloadAvailability` API 调用参数不匹配
   - 定义: `checkDownloadAvailability(rollId, type, scope, photoIds)`
   - 调用: `checkDownloadAvailability({ photoIds, downloadType })` (错误)
2. `createBatchDownload` 传递的参数名不匹配
   - 服务端期望 `type`, 客户端发送 `downloadType`

**修复**:
- 修正 `BatchDownloadModal.jsx` 中的 API 调用参数

---

## 待完成事项 (Future Phases)

### Phase 5: ImageViewer 集成 ✅
- [x] 在 ImageViewer 中使用 `getSingleDownloadUrl()` 替换现有下载逻辑
- [x] 支持 EXIF 写入选项 (默认启用)

**实现记录 (2026-01-16):**
- 更新 `ImageViewer.js` 导入 `getSingleDownloadUrl`
- 简化 `handleDownload()` 函数，使用统一的下载 API
- 默认下载正片并写入 EXIF 元数据

### Phase 6: FilmLab PhotoSwitcher ✅
- [x] 实现 PhotoSwitcher 组件用于批量参数切换
- [x] "Apply to batch" 功能

**实现记录 (2026-01-16):**
- 创建 `client/src/components/FilmLab/PhotoSwitcher.jsx` (~360 行)
- 在 FilmLab 中集成 PhotoSwitcher，支持照片切换和批量应用
- 功能特性：
  - 底部缩略图导航栏
  - 键盘快捷键 Ctrl+← / Ctrl+→ 切换照片
  - 批量模式：选择多张照片应用当前参数
  - "全选"、"仅无正片" 快捷选择
  - 使用 createBatchRenderLibrary API 实现批量应用

### Phase 7: 高级功能 ✅ (部分完成)
- [x] 导出历史记录
- [ ] 渲染队列持久化（留待后续）
- [ ] LUT 文件管理（留待后续）

**实现记录 (2026-01-16):**
- 创建 `server/services/export-history-service.js` - 导出历史服务
- 创建 `server/routes/export-history.js` - 历史 API 路由
- 在 `batch-render.js` 和 `batch-download.js` 中集成历史记录
- 客户端 API: `getExportHistory()`, `getExportStats()`, `cleanupExportHistory()`
- 数据库表: `export_history` (自动创建)

**导出历史 API:**
| 端点 | 说明 |
|------|------|
| `GET /api/export-history` | 获取历史列表 |
| `GET /api/export-history/stats` | 获取统计数据 |
| `DELETE /api/export-history/cleanup` | 清理旧记录 |

---

## Phase 8: 外部正片导入 ✅

### 8.1 需求背景

用户可能使用 Lightroom、Capture One、Negative Lab Pro 等外部软件处理底片扫描，生成正片 JPG/TIFF。需要支持将这些外部处理的正片导入系统，并与已有的 negative/original 文件对应。

### 8.2 核心功能

#### 匹配策略（三种策略可选）
| 策略 | 描述 | 适用场景 |
|------|------|----------|
| `filename` | 文件名匹配（去扩展名后比较） | 推荐，大多数情况 |
| `frame` | 按排序顺序匹配帧号 | 批量重命名过的文件 |
| `manual` | 用户手动拖拽对应 | 复杂情况 |

#### 导入流程
1. **选择来源**: 选择文件夹或多个文件
2. **选择策略**: 文件名匹配/帧号匹配/手动匹配
3. **匹配预览**: 显示匹配结果表格，标记成功/失败/冲突
4. **冲突处理**: 已有正片时选择 覆盖/跳过/保留两者
5. **执行导入**: 复制文件到 uploads 目录，更新数据库
6. **结果报告**: 显示导入统计

### 8.3 技术设计

#### 服务端

**`server/services/import-service.js`**
- `matchByFilename(files, photos)` - 文件名匹配
- `matchByFrame(files, photos)` - 帧号匹配
- `previewImport(rollId, filePaths, strategy)` - 预览匹配结果
- `executeImport(rollId, matches, options)` - 执行导入
- `generateThumbnail(filePath)` - 生成缩略图

**`server/routes/import.js`**
```
POST /api/import/preview          - 预览匹配结果
POST /api/import/execute          - 执行导入
POST /api/import/manual-match     - 手动匹配更新
GET  /api/import/:jobId/progress  - 导入进度
```

#### 客户端

**`client/src/components/ImportPositive/`**
- `ImportPositiveModal.jsx` - 主模态框
- `MatchPreviewTable.jsx` - 匹配预览表格
- `ManualMatchPanel.jsx` - 手动匹配拖拽UI

#### 数据库

更新 `photos` 表：
- `positive_rel_path` - 设置为导入文件路径
- `positive_source` - 新增字段: 'filmlab' | 'external' | null

### 8.4 UI 设计

```
┌─────────────────────────────────────────────────────────┐
│  导入外部正片                                      [×]  │
├─────────────────────────────────────────────────────────┤
│  ▼ 选择文件                                             │
│  ┌─────────────────────────────────────┐  [选择文件夹]  │
│  │ D:/Lightroom Exports/Roll001/       │  [选择文件]    │
│  └─────────────────────────────────────┘                │
│                                                         │
│  ▼ 匹配策略                                             │
│  ● 文件名匹配 (推荐)                                    │
│  ○ 按顺序匹配帧号                                       │
│  ○ 手动匹配                                             │
│                                                         │
│  ▼ 匹配预览                              匹配: 36/36    │
│  ┌────────┬──────────────┬──────────────┬───────┐      │
│  │ 帧号   │ 导入文件      │ 对应底片      │ 状态  │      │
│  ├────────┼──────────────┼──────────────┼───────┤      │
│  │ 01     │ DSC_0001.jpg │ DSC_0001.tif │ ✓     │      │
│  │ 02     │ DSC_0002.jpg │ DSC_0002.tif │ ⚠冲突 │      │
│  │ 03     │ DSC_0003.jpg │ (无匹配)     │ ✗     │      │
│  └────────┴──────────────┴──────────────┴───────┘      │
│                                                         │
│  ▼ 冲突处理 (3 张已有正片)                              │
│  ● 覆盖现有正片                                         │
│  ○ 跳过已有正片                                         │
│                                                         │
│                          [取消]  [导入 36 张]           │
└─────────────────────────────────────────────────────────┘
```

### 8.5 注意事项

1. **文件格式**: 支持 jpg, jpeg, tiff, tif, png
2. **大文件处理**: 使用流式复制避免内存问题
3. **原子性**: 导入失败时回滚已复制的文件
4. **缩略图**: 导入后自动生成缩略图
5. **OneDrive 兼容**: 确保路径处理兼容

### 8.6 实现记录 (2026-01-16)

#### 已创建文件
| 文件 | 说明 |
|------|------|
| `server/services/import-service.js` | 核心匹配与导入逻辑，约 450 行 |
| `server/routes/import.js` | API 路由，约 250 行 |
| `server/migrations/2026-01-16-add-positive-source.js` | 数据库迁移 |
| `client/src/components/ImportPositive/ImportPositiveModal.jsx` | 主模态框，约 580 行 |
| `client/src/components/ImportPositive/MatchPreviewTable.jsx` | 匹配预览表格 |
| `client/src/components/ImportPositive/ManualMatchPanel.jsx` | 手动匹配 UI |
| `client/src/components/ImportPositive/index.js` | 模块导出 |

#### 已修改文件
| 文件 | 修改内容 |
|------|----------|
| `server/server.js` | 注册 `/api/import` 路由 |
| `client/src/api.js` | 添加导入相关 API 函数 |
| `client/src/components/RollDetail.jsx` | 集成 ImportPositiveModal |

#### 功能说明
- 4 步向导：选择文件 → 预览匹配 → 导入中 → 完成
- 3 种匹配策略：文件名/帧号/手动
- 冲突处理：覆盖/跳过
- 进度轮询机制
- 使用 stream/pipeline 进行大文件复制

---

## LUT 库管理系统 (2026-01-17)

### 概述
将 LUT 管理从分散的本地文件上传模式改为集中式库管理，支持在 Settings 中统一管理，并在 FilmLab 和 Batch Export 中使用。

### 新增文件

#### `client/src/components/Settings/LutLibrary.jsx`
LUT 库管理页面组件。

**功能:**
- 网格显示所有 LUT 文件
- 支持上传新 LUT（.cube, .3dl, .csp, .lut）
- 删除用户上传的 LUT（内置 LUT 不可删除）
- 内置 LUT 标记显示
- 文件大小和创建时间显示

#### `client/src/components/FilmLab/LutSelectorModal.jsx`
FilmLab 中的 LUT 选择器模态框。

**功能:**
- 从 LUT 库中选择 LUT
- 搜索过滤
- 内联上传新 LUT
- 清除 LUT 选项

### 修改文件

#### `client/src/api.js`
新增 LUT 库 API 函数：
- `listLuts()` - 获取 LUT 列表
- `uploadLut(file)` - 上传 LUT 文件
- `deleteLut(name)` - 删除 LUT 文件
- `getLutUrl(name)` - 获取 LUT 文件 URL
- `loadLutFromLibrary(name)` - 从库加载并解析 LUT
- `parseCubeLUT(text)` - 解析 .cube LUT 文件

#### `client/src/components/Settings.jsx`
新增选项卡式布局：
- "通用设置" 选项卡 - 原有设置内容
- "LUT 库管理" 选项卡 - 集成 LutLibrary 组件

#### `client/src/components/FilmLab/FilmLabControls.jsx`
- 移除本地文件上传
- 改用 LutSelectorModal 从库中选择 LUT
- 新增 LUT 选择器状态管理

### 内置默认 LUT

创建 4 个默认 LUT 文件位于 `server/data/luts/`:
- `FilmGallery_Warm.cube` - 暖色调 LUT
- `FilmGallery_Cool.cube` - 冷色调 LUT  
- `FilmGallery_Vintage.cube` - 复古风格 LUT
- `FilmGallery_Contrast.cube` - 增强对比度 LUT

---

## FilmLab 源图像选择 (2026-01-17)

### 概述
新增在 FilmLab 中选择编辑源的功能，支持从原始文件、负片扫描或已渲染正片中选择进行编辑。

### 功能说明
点击 Film Lab 按钮时，如果有多种源可用，会显示源选择器弹窗：

1. **原始 (Original)** - 使用原始上传的 TIFF/Raw 文件，保留最高质量
2. **负片 (Negative)** - 使用负片扫描，进行反相处理
3. **正片 (Positive)** - 微调已渲染的正片，适合二次调整

### 修改文件

#### `client/src/components/ImageViewer.js`
- 新增 `showSourceSelector` 和 `filmLabSourceType` 状态
- 新增源类型选择器弹窗 UI
- 修改 `handleFilmLabClick` 逻辑，多源时显示选择器
- 新增 `getSourcePathForFilmLab()` 函数根据选择类型返回路径
- 新增 `availableSources` 对象检测各源类型可用性
- 传递 `sourceType` prop 给 FilmLab

#### `client/src/components/FilmLab/FilmLab.jsx`
- 新增 `sourceType` prop
- 传递给 FilmLabControls

#### `client/src/components/FilmLab/FilmLabControls.jsx`
- 新增 `sourceType` prop
- 在标题栏显示源类型指示器（彩色标签）

### 使用方式
1. 在 ImageViewer 中点击 "Film Lab" 按钮
2. 如果有多种源可用，选择要编辑的源类型
3. FilmLab 会显示当前源类型标签（🎞️ 原始 / 📷 负片 / ✨ 正片）
4. 进行编辑后保存

---

## 使用方式

### 批量渲染
1. 打开卷详情页 (RollDetail)
2. 点击 "Batch Render" 按钮打开批量渲染模态框
3. 配置输出模式、照片范围、处理参数
4. 点击 "开始渲染" 按钮
5. 查看进度条和结果

### 批量下载
1. 点击 "Batch Download" 按钮打开批量下载模态框
2. 选择下载类型（正片/底片/原始）
3. 配置输出目录和命名规则
4. 点击 "开始下载" 按钮

### 导入外部正片
1. 点击 "Import Positive" 按钮（紫色）
2. 选择要导入的文件（支持 jpg/tiff/png）
3. 选择匹配策略：文件名匹配（推荐）、帧号匹配 或 手动匹配
4. 预览匹配结果，处理冲突（已有正片时选择覆盖或跳过）
5. 点击 "执行导入"
6. 完成后刷新页面查看导入的正片

### LUT 库管理
1. 打开 Settings 页面
2. 点击 "LUT 库管理" 选项卡
3. 上传新 LUT 或查看现有 LUT
4. 在 FilmLab 中点击 LOAD 按钮从库中选择 LUT

### FilmLab 源选择
1. 在 ImageViewer 中点击 Film Lab 按钮
2. 选择编辑源类型（原始/负片/正片）
3. 进行编辑并保存
