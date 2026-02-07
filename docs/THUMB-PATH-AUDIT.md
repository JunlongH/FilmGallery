# Thumbnail 路径全面审计报告

> 审计日期: 2025-01  
> 范围: 所有 thumb 的**生成、存储 (DB)、显示 (前端)** 逻辑

---

## 1. 数据库 Schema

`photos` 表中与缩略图相关的字段：

| 字段 | 用途 | 说明 |
|------|------|------|
| `thumb_rel_path` | **旧版通用**缩略图 | 历史遗留字段，新流程应避免主写此字段 |
| `positive_thumb_rel_path` | 正片缩略图 | 正片导出/导入后的专属 thumb |
| `negative_thumb_rel_path` | 底片缩略图 | 底片的专属 thumb |

其他相关路径字段：

| 字段 | 用途 |
|------|------|
| `full_rel_path` | 正片全尺寸（旧版，现被 `positive_rel_path` 替代） |
| `positive_rel_path` | 正片全尺寸 |
| `negative_rel_path` | 底片全尺寸 |
| `original_rel_path` | 原始扫描文件 |

磁盘目录结构 (每个 roll)：
```
uploads/rolls/{rollId}/
├── full/                  # 正片全尺寸 JPEG
├── negative/              # 底片全尺寸
│   └── thumb/             # 底片缩略图
├── thumb/                 # 正片/通用缩略图
└── originals/             # 原始扫描件
```

---

## 2. 服务端 Thumb 生成端点总览

### 2.1 `POST /api/filmlab/render` — FilmLab 渲染（非 HQ）
**文件**: `server/routes/filmlab.js` L112-207

| 操作 | 细节 |
|------|------|
| 生成正片 JPEG | ✅ 保存到 `full/` 目录 |
| 更新 `positive_rel_path` | ✅ |
| 更新 `full_rel_path` | ✅ |
| **生成 thumb** | ❌ **未生成** |
| **更新 `positive_thumb_rel_path`** | ❌ **未更新** |

> ⚠️ **BUG**: `/render` 不生成缩略图。用户使用 FilmLab 的 "Save"（非 HQ Export）后，
> `positive_thumb_rel_path` 不会被更新。如果之前没有正片 thumb，显示会回退到旧的 `thumb_rel_path`
> （可能是底片 thumb），导致缩略图与实际正片不一致。

### 2.2 `POST /api/filmlab/export` — FilmLab HQ 导出
**文件**: `server/routes/filmlab.js` L213-339

| 操作 | 细节 |
|------|------|
| 生成正片 JPEG | ✅ 保存到 `full/` 目录 |
| 生成 thumb | ✅ 240px, quality 40, 保存到 `thumb/` |
| 更新 `positive_rel_path` | ✅ |
| 更新 `full_rel_path` | ✅ |
| 更新 `positive_thumb_rel_path` | ✅ |
| 更新 `thumb_rel_path` | ✅ 不会覆盖（已修复） |

> ✅ 此端点行为正确。

### 2.3 `PUT /api/photos/:id/update-positive` — 更新正片（旧版 FilmLab Save）
**文件**: `server/routes/photos.js` L498-585

| 操作 | 细节 |
|------|------|
| 保存新正片 JPEG | ✅ 保存到 `full/` 目录 |
| 更新 `full_rel_path` | ✅ |
| **更新 `positive_rel_path`** | ❌ **未更新** |
| 重新生成 thumb | ⚠️ 仅在旧 `thumb_rel_path` 存在时重新生成到**旧路径** |
| **更新 `positive_thumb_rel_path`** | ❌ **未更新** |

> ⚠️ **BUG**: 此端点只更新 `full_rel_path`，不更新 `positive_rel_path`。
> Thumb 重新生成逻辑仅覆盖旧的 `thumb_rel_path` 位置，不设置 `positive_thumb_rel_path`。
> 如果照片是通过底片导入的（`thumb_rel_path` 指向底片 thumb），则正片 thumb 会覆盖底片 thumb 文件。

### 2.4 `POST /api/photos/:id/ingest-positive` — 导入正片（GPU 导出入库）
**文件**: `server/routes/photos.js` L588-725

| 操作 | 细节 |
|------|------|
| 保存正片 JPEG | ✅ `{rollId}_{frameNum}.jpg` → `full/` |
| 生成 thumb | ✅ `{rollId}_{frameNum}-thumb.jpg` → `thumb/` |
| 更新 `positive_rel_path` | ✅ |
| 更新 `positive_thumb_rel_path` | ✅ |
| 更新 `full_rel_path` | ✅ (COALESCE) |
| 清理旧 positive thumb | ✅ |

> ✅ 此端点行为完全正确。

### 2.5 `POST /api/photos/:id/export-positive` — HQ 导出正片
**文件**: `server/routes/photos.js` L735-980

| 操作 | 细节 |
|------|------|
| 生成正片 JPEG + 可选 TIFF16 | ✅ |
| 生成 thumb | ✅ `{rollId}_{frameNum}-thumb.jpg` → `thumb/` |
| 更新 `positive_rel_path` | ✅ |
| 更新 `positive_thumb_rel_path` | ✅ |
| 更新 `full_rel_path` | ✅ (COALESCE) |
| 清理旧 positive/thumb 文件 | ✅ |

> ✅ 此端点行为完全正确。

### 2.6 `POST /api/rolls` — 创建卷（批量上传）
**文件**: `server/routes/rolls.js` L275+ / `server/services/photo-upload-service.js` `processFileForRoll()`

INSERT 语句包含所有字段: `thumb_rel_path`, `positive_thumb_rel_path`, `negative_thumb_rel_path` ✅

路径计算 (`roll-file-service.js`)：

| 上传模式 | `thumbRelPath` | `positiveThumbRelPath` | `negativeThumbRelPath` |
|----------|----------------|------------------------|------------------------|
| 正片 | `rolls/{id}/thumb/{base}-thumb.jpg` | = thumbRelPath | null |
| 底片 | `rolls/{id}/thumb/{base}-thumb.jpg` (复制) | null | `rolls/{id}/negative/thumb/{base}-thumb.jpg` |

> ✅ 批量创建卷流程正确，所有 thumb 字段均被正确设置。

### 2.7 `POST /api/rolls/:rollId/photos` — 单张上传到已有卷
**文件**: `server/services/photo-upload-service.js` `uploadSinglePhoto()` L430-560

| 操作 | 细节 |
|------|------|
| 生成 thumb 文件 | ✅ |
| 计算 `positiveThumbRelPath` / `negativeThumbRelPath` | ✅ |
| **INSERT SQL** | ❌ **缺少 `positive_rel_path`, `positive_thumb_rel_path`, `negative_thumb_rel_path` 字段** |

INSERT SQL (L547):
```sql
INSERT INTO photos (
  roll_id, frame_number, filename, full_rel_path, thumb_rel_path, negative_rel_path,
  caption, taken_at, rating, camera, lens, photographer,
  source_make, source_model, source_software, source_lens
) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
```

> ⚠️ **BUG**: 代码正确计算了 `positiveThumbRelPath` 和 `negativeThumbRelPath`，但 INSERT 语句
> 没有包含 `positive_rel_path`, `positive_thumb_rel_path`, `negative_thumb_rel_path` 字段。
> 这些值被丢弃，导致单张上传的照片缺少正确的 positive/negative thumb 路径，
> 前端只能依赖旧的 `thumb_rel_path` 回退。

---

## 3. 服务端 Thumb 读取逻辑

### 3.1 `GET /api/photos` — 照片列表
**文件**: `server/routes/photos.js` L282-290

```js
const thumbPath = r.positive_thumb_rel_path || r.thumb_rel_path || null;
return Object.assign({}, r, {
  full_rel_path: fullPath,
  thumb_rel_path: thumbPath,
});
```

> ⚠️ **注意**: 此处做了**路径归一化** — 将 `positive_thumb_rel_path` 的值覆盖到 `thumb_rel_path` 上。
> 这意味着前端从 `GET /api/photos` 获取的 `thumb_rel_path` **实际上已经是 positive thumb 优先的值**。
> 但前端组件如果同时检查 `positive_thumb_rel_path` 字段，由于原始值没有被移除，可能存在冗余逻辑。
> 另外，此归一化**丢失了原始的 `thumb_rel_path`**，如果前端需要同时展示底片 thumb，可能出问题。

### 3.2 `GET /api/tags` — 标签列表封面
**文件**: `server/routes/tags.js` L11

```sql
(SELECT p.thumb_rel_path FROM photo_tags pt2 JOIN photos p ON p.id = pt2.photo_id 
 WHERE pt2.tag_id = t.id ORDER BY p.id DESC LIMIT 1) as cover_thumb
```

> ⚠️ **BUG**: 只查询 `thumb_rel_path`，没有使用 `positive_thumb_rel_path` 回退。
> 如果照片只有 `positive_thumb_rel_path` 而没有 `thumb_rel_path`，标签封面会为空。

### 3.3 Roll Cover 选择
**文件**: `server/routes/rolls.js` L816-821

```js
// Positive view
positive_thumb_rel_path || thumb_rel_path || positive_rel_path || full_rel_path
// Negative view
negative_thumb_rel_path || negative_rel_path || thumb_rel_path
```

> ✅ 回退链正确。

### 3.4 Contact Sheet
**文件**: `server/routes/rolls.js` L812+ (getPhotoPath)

| 模式 | 回退链 |
|------|--------|
| positive | `positive_thumb_rel_path → thumb_rel_path → positive_rel_path → full_rel_path` |
| negative | `negative_thumb_rel_path → negative_rel_path → thumb_rel_path` |
| auto | `positive_thumb_rel_path → thumb_rel_path → negative_thumb_rel_path → positive_rel_path → full_rel_path → negative_rel_path` |

> ✅ 回退链合理。

---

## 4. 前端 Thumb 显示逻辑

### 4.1 各组件 Thumb 优先级汇总

| 组件 | 正片 Thumb 优先级 | 问题 |
|------|-------------------|------|
| **PhotoItem.jsx** | `positive_thumb_rel_path` → `thumb_rel_path` | ✅ 正确 |
| **RollPhotoGrid.jsx** | `positive_thumb_rel_path` → `thumb_rel_path` | ✅ 正确 |
| **PhotoCard.jsx** (Gallery) | `positive_thumb_rel_path` → `thumb_rel_path` | ✅ 正确 |
| **PhotoGrid.jsx** | `positive_thumb_rel_path` → `thumb_rel_path` | ✅ 正确 |
| **PhotoCalendar.jsx** | `positive_thumb_rel_path` → `thumb_rel_path` | ✅ 正确 |
| **HoverPhotoCard.jsx** | `positive_thumb_rel_path` → `negative_thumb_rel_path` → `thumb_rel_path` | ✅ 正确 |
| **LifeLogContext.jsx** | `positive_thumb_rel_path` → `thumb_rel_path` | ✅ 正确 |
| **ContactSheetModal.jsx** | `positive_thumb_rel_path` → `thumb_rel_path` (positive mode) | ✅ 正确 |
| **PhotoSwitcher.jsx** (FilmLab) | `positive_thumb_path` → `positive_thumb_rel_path` → `negative_thumb_path` → `thumb_rel_path` | ✅ 正确 |
| **VirtualPhotoGrid.jsx** | ❌ `thumb_rel_path` → `positive_thumb_rel_path` | ⚠️ **优先级反了** |
| **PhotoMarker.jsx** (Map) | ❌ `thumb_rel_path` → `positive_thumb_rel_path` → `negative_thumb_rel_path` | ⚠️ **优先级反了** |
| **PhotoMap.jsx** (Map) | ❌ `thumb_rel_path` → `positive_thumb_rel_path` → `negative_thumb_rel_path` | ⚠️ **优先级反了** |
| **PhotoGlobe.jsx** (Map) | ❌ `thumb_rel_path` → `positive_thumb_rel_path` → `negative_thumb_rel_path` | ⚠️ **优先级反了** |
| **MapPhotoPreview.jsx** | ❌ `thumb_rel_path` → `positive_thumb_rel_path` | ⚠️ **优先级反了** |

### 4.2 底片 Thumb 优先级

| 组件 | 底片 Thumb 优先级 | 状态 |
|------|-------------------|------|
| **PhotoItem.jsx** | `negative_thumb_rel_path` → `thumb_rel_path` → 从 `negative_rel_path` 推断 | ✅ |
| **RollPhotoGrid.jsx** | `negative_thumb_rel_path` → `thumb_rel_path` | ✅ |
| **HoverPhotoCard.jsx** | (见上表，unified fallback) | ✅ |

---

## 5. 已发现的 Bug 汇总

### 🔴 严重 Bug

| # | 位置 | 描述 | 影响 |
|---|------|------|------|
| **B1** | `filmlab.js /render` | 不生成缩略图，不更新 `positive_thumb_rel_path` | FilmLab Save 后缩略图仍是旧的（可能是底片） |
| **B2** | `photos.js update-positive` | 不更新 `positive_rel_path` 和 `positive_thumb_rel_path`；仅覆盖旧 `thumb_rel_path` 位置 | 正片保存后路径混乱 |
| **B3** | `photo-upload-service.js uploadSinglePhoto` | INSERT 缺少 `positive_rel_path`, `positive_thumb_rel_path`, `negative_thumb_rel_path` 字段 | 单张上传照片丢失新路径字段 |

### 🟡 中等 Bug

| # | 位置 | 描述 | 影响 |
|---|------|------|------|
| **B4** | `tags.js GET /` | 标签封面只查 `thumb_rel_path`，没有 `COALESCE(positive_thumb_rel_path, thumb_rel_path)` | 部分标签封面为空 |
| **B5** | `VirtualPhotoGrid.jsx` | Thumb 优先级为 `thumb_rel_path → positive_thumb_rel_path`（反了） | 虚拟网格可能显示底片 thumb |
| **B6** | `PhotoMarker.jsx` / `PhotoMap.jsx` / `PhotoGlobe.jsx` / `MapPhotoPreview.jsx` | Thumb 优先级为 `thumb_rel_path → positive_thumb_rel_path`（反了） | 地图标记可能显示底片 thumb |

### 🟢 已修复

| # | 位置 | 描述 |
|---|------|------|
| ~~B7~~ | `filmlab.js /export` | HQ Export 原本会用正片 thumb 覆盖 `thumb_rel_path`（底片 thumb）→ 已修复 |

---

## 6. 修复建议

### B1 修复: `filmlab.js /render` 增加 thumb 生成

在 `/render` 的 DB UPDATE 之前，增加 thumb 生成逻辑（与 `/export` 一致）:

```js
// 在保存 JPEG 之后、UPDATE 之前
const rollsRoot = path.resolve(outDir, '..');
const thumbDir = path.join(rollsRoot, 'thumb');
if (!fs.existsSync(thumbDir)) fs.mkdirSync(thumbDir, { recursive: true });
const thumbBase = path.basename(outPath, path.extname(outPath));
const thumbName = `${thumbBase}-thumb.jpg`;
const thumbPath = path.join(thumbDir, thumbName);
await sharp(outPath)
  .resize({ width: 240, height: 240, fit: 'inside' })
  .jpeg({ quality: 40 })
  .toFile(thumbPath);
const relThumb = path.relative(uploadsDir, thumbPath).replace(/\\/g, '/');

// UPDATE 加上 positive_thumb_rel_path
db.run('UPDATE photos SET filename=?, positive_rel_path=?, full_rel_path=?, positive_thumb_rel_path=? WHERE id=?',
  [newName, relOut, relOut, relThumb, photoId]);
```

### B2 修复: `photos.js update-positive` 完整更新

```js
// 1. 更新 positive_rel_path
await runAsync('UPDATE photos SET full_rel_path=?, positive_rel_path=? WHERE id=?', 
  [newFullRelPath, newFullRelPath, id]);

// 2. 生成新 thumb 到独立路径
const thumbName = `${rollId}_${frameNum}-thumb.jpg`;
const newThumbPath = path.join(uploadsDir, 'rolls', folderName, 'thumb', thumbName);
await sharp(fileBuf)
  .resize({ width: 240, height: 240, fit: 'inside' })
  .jpeg({ quality: 40 })
  .toFile(newThumbPath);
const relThumb = `rolls/${folderName}/thumb/${thumbName}`;

// 3. 更新 positive_thumb_rel_path
await runAsync('UPDATE photos SET positive_thumb_rel_path=? WHERE id=?', [relThumb, id]);
```

### B3 修复: `uploadSinglePhoto` INSERT 增加字段

```sql
INSERT INTO photos (
  roll_id, frame_number, filename, 
  full_rel_path, thumb_rel_path, negative_rel_path,
  positive_rel_path, positive_thumb_rel_path, negative_thumb_rel_path,  -- 新增
  caption, taken_at, rating, camera, lens, photographer,
  source_make, source_model, source_software, source_lens
) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
```

同时增加对应参数:
```js
[rollId, frameNumber, finalName, 
 fullRelPath, thumbRelPath, negativeRelPath,
 positiveRelPath, positiveThumbRelPath, negativeThumbRelPath,  // 新增
 caption, taken_at, rating, ...]
```

### B4 修复: `tags.js` 标签封面查询

```sql
(SELECT COALESCE(p.positive_thumb_rel_path, p.thumb_rel_path) 
 FROM photo_tags pt2 JOIN photos p ON p.id = pt2.photo_id 
 WHERE pt2.tag_id = t.id ORDER BY p.id DESC LIMIT 1) as cover_thumb
```

### B5 + B6 修复: 前端 Thumb 优先级统一

将以下组件的 thumb 选择改为 `positive_thumb_rel_path` 优先：

- **VirtualPhotoGrid.jsx** L84:
  ```js
  // 修改前
  const thumbUrl = buildUploadUrl(photo.thumb_rel_path || photo.positive_thumb_rel_path);
  // 修改后
  const thumbUrl = buildUploadUrl(photo.positive_thumb_rel_path || photo.thumb_rel_path);
  ```

- **PhotoMarker.jsx** L19:
  ```js
  // 修改前
  const thumbPath = photo.thumb_rel_path || photo.positive_thumb_rel_path || photo.negative_thumb_rel_path;
  // 修改后
  const thumbPath = photo.positive_thumb_rel_path || photo.thumb_rel_path || photo.negative_thumb_rel_path;
  ```

- **PhotoMap.jsx** L36: 同上
- **PhotoGlobe.jsx** L18: 同上
- **MapPhotoPreview.jsx** L18: 同上

---

## 7. 统一的 Thumb 优先级规范

为了确保所有组件行为一致，建议遵循以下优先级：

### 正片模式（默认）
```
positive_thumb_rel_path → thumb_rel_path → (fullback to positive_rel_path → full_rel_path)
```

### 底片模式
```
negative_thumb_rel_path → thumb_rel_path → (fallback to negative_rel_path)
```

### 所有导出/保存端点
- **必须**同时生成 thumb 并更新 `positive_thumb_rel_path`
- **不得**覆盖 `thumb_rel_path`（该字段仅在初始上传时设置）
- 使用一致的命名: `{rollId}_{frameNum}-thumb.jpg` 放在 `rolls/{rollId}/thumb/` 目录

---

## 8. 影响分析

| 场景 | 当前行为 | 修复后 |
|------|---------|--------|
| 底片上传 → FilmLab Save | 无正片 thumb，显示底片 thumb ← **混淆** | 自动生成正片 thumb |
| 底片上传 → FilmLab HQ Export | ✅ 正确生成正片 thumb | 不变 |
| 底片上传 → update-positive | 用正片覆盖底片 thumb 文件 ← **数据损坏** | 生成独立正片 thumb |
| 单张上传（正片） | DB 缺少 `positive_thumb_rel_path` | 正确写入所有字段 |
| 单张上传（底片） | DB 缺少 `negative_thumb_rel_path` | 正确写入所有字段 |
| 标签封面 | 可能为空 | 正确显示正片 thumb |
| 地图标记/虚拟网格 | 可能显示底片 thumb | 优先显示正片 thumb |
