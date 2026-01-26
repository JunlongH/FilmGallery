# 3. 后端 API 接口

## 3.1 API 基础

### 3.1.1 基础配置

所有 API 端点的基础 URL：
- **开发环境**：`http://localhost:4000/api`
- **生产环境**：根据部署配置决定

**HTTP 方法**：
- `GET` - 查询数据
- `POST` - 创建数据
- `PUT` - 更新整个资源
- `DELETE` - 删除数据

### 3.1.2 响应格式

所有 API 返回 JSON 格式的统一响应：

```json
{
  "success": true,
  "data": { /* 具体数据 */ },
  "error": null
}
```

错误响应：
```json
{
  "success": false,
  "data": null,
  "error": {
    "code": "PHOTO_NOT_FOUND",
    "message": "照片不存在"
  }
}
```

### 3.1.3 认证和授权

当前版本不实现用户认证。生产部署建议：
- 配置反向代理（nginx）实现认证
- 使用环境变量 `API_KEY` 实现简单鉴权
- 部署到内网或 VPN

## 3.2 照片 API (`/api/photos`)

### 3.2.1 获取照片列表

```
GET /api/photos?roll_id=1&page=1&limit=20&sort=-shot_date
```

**参数**：
- `roll_id` (optional) - 胶卷 ID，为空则返回所有
- `page` (optional, default=1) - 页码
- `limit` (optional, default=20) - 每页数量
- `sort` (optional) - 排序字段，前缀 `-` 为倒序
- `tag` (optional) - 标签 ID，多个用逗号分隔

**响应**：
```json
{
  "success": true,
  "data": {
    "total": 150,
    "page": 1,
    "limit": 20,
    "photos": [
      {
        "id": 1,
        "roll_id": 1,
        "shot_number": 1,
        "file_path": "rolls/1/001.jpg",
        "shot_date": "2026-01-20",
        "iso": 400,
        "aperture": 5.6,
        "shutter_speed": "1/125",
        "latitude": 39.9,
        "longitude": 116.4,
        "location_name": "北京",
        "rating": 4,
        "tags": [1, 5, 8]
      }
    ]
  }
}
```

### 3.2.2 获取单张照片详情

```
GET /api/photos/:id
```

**响应**：详细照片对象，包括所有 EXIF 信息、设备、标签。

### 3.2.3 上传照片

```
POST /api/photos
Content-Type: multipart/form-data

{
  "roll_id": 1,
  "shot_number": 1,
  "shot_date": "2026-01-20",
  "file": <binary>,
  "metadata": {
    "iso": 400,
    "aperture": 5.6,
    "shutter_speed": "1/125",
    "focal_length": 50,
    "notes": "拍摄于公园"
  }
}
```

**返回**：新建照片对象

### 3.2.4 更新照片元数据

```
PUT /api/photos/:id
Content-Type: application/json

{
  "shot_date": "2026-01-21",
  "iso": 800,
  "rating": 5,
  "notes": "修改备注",
  "latitude": 39.95,
  "longitude": 116.45
}
```

### 3.2.5 删除照片

```
DELETE /api/photos/:id
```

返回：`{ "success": true }`

### 3.2.6 批量导出

```
POST /api/photos/batch-export
Content-Type: application/json

{
  "photo_ids": [1, 2, 3],
  "format": "jpg",
  "width": 3000,
  "height": 2000,
  "quality": 95,
  "filmlab_settings": { /* FilmLab 参数 */ }
}
```

返回：导出任务 ID，可查询进度

## 3.3 胶卷 API (`/api/rolls`)

### 3.3.1 获取胶卷列表

```
GET /api/rolls?status=shot&film_id=1&sort=-loaded_date
```

**参数**：
- `film_id` (optional) - 胶片类型 ID
- `status` (optional) - 状态过滤
- `sort` (optional) - 排序

**响应**：
```json
{
  "success": true,
  "data": [
    {
      "id": 1,
      "name": "2026-01-20 Portra 400",
      "film_id": 5,
      "film_name": "Kodak Portra 400",
      "status": "shot",
      "loaded_date": "2025-12-15",
      "shot_date": "2026-01-20",
      "photo_count": 36,
      "equipment_id": 2,
      "notes": ""
    }
  ]
}
```

### 3.3.2 获取胶卷详情和照片

```
GET /api/rolls/:id
GET /api/rolls/:id/photos
```

第二个端点返回该胶卷的所有照片。

### 3.3.3 创建胶卷

```
POST /api/rolls
Content-Type: application/json

{
  "name": "2026-01-26 Portra 400",
  "film_id": 5,
  "loaded_date": "2026-01-20",
  "equipment_id": 2
}
```

### 3.3.4 更新胶卷

```
PUT /api/rolls/:id
Content-Type: application/json

{
  "status": "developed",
  "shot_date": "2026-01-25",
  "lab_name": "北京冲印店"
}
```

### 3.3.5 删除胶卷

```
DELETE /api/rolls/:id
```

## 3.4 胶片库存 API (`/api/films`)

### 3.4.1 获取胶片列表

```
GET /api/films
```

**响应**：
```json
{
  "success": true,
  "data": [
    {
      "id": 1,
      "name": "Kodak Portra 400",
      "iso": 400,
      "format": "135",
      "type": "color_negative",
      "stock": 5,
      "notes": ""
    }
  ]
}
```

### 3.4.2 创建/更新胶片

```
POST /api/films
PUT /api/films/:id
```

## 3.5 FilmLab API (`/api/filmlab`)

### 3.5.1 处理照片

```
POST /api/filmlab/process
Content-Type: application/json

{
  "photo_id": 1,
  "settings": {
    "inversion": true,
    "white_balance": { "temp": 5500, "tint": 0 },
    "hsl": [
      { "hue": 0, "saturation": 20, "lightness": 10 },
      { "hue": 60, "saturation": 15, "lightness": 5 }
    ],
    "split_tone": { "shadow": "#FF6B35", "highlight": "#004E89" },
    "curve": [/* 曲线点数组 */],
    "exposure": 0.5,
    "contrast": 20
  }
}
```

返回：处理后的预览和保存的预设 ID

### 3.5.2 预览 FilmLab 设置

```
POST /api/filmlab/preview
Content-Type: application/json

{
  "photo_id": 1,
  "settings": { /* 同上 */ }
}
```

返回：生成的预览图像 URL

### 3.5.3 保存预设

```
POST /api/filmlab/presets
Content-Type: application/json

{
  "name": "Portra 风格",
  "category": "color_negative",
  "settings": { /* FilmLab 参数 */ }
}
```

### 3.5.4 获取预设列表

```
GET /api/filmlab/presets?category=color_negative
```

## 3.6 RAW 处理 API (`/api/raw`)

### 3.6.1 解析 RAW 文件

```
POST /api/raw/decode
Content-Type: multipart/form-data

{
  "file": <binary raw file>,
  "output_format": "jpg",
  "white_balance": "auto"
}
```

返回：
```json
{
  "success": true,
  "data": {
    "preview_path": "uploads/preview_xxx.jpg",
    "width": 6000,
    "height": 4000,
    "metadata": {
      "iso": 400,
      "aperture": 5.6,
      "shutter_speed": "1/125"
    }
  }
}
```

### 3.6.2 获取 RAW 预览

```
GET /api/raw/preview?photo_id=1&size=large
```

## 3.7 设备 API (`/api/equipment`)

### 3.7.1 获取设备列表

```
GET /api/equipment?type=camera
```

### 3.7.2 创建设备

```
POST /api/equipment
Content-Type: application/json

{
  "name": "Canon EOS 5D Mark IV",
  "type": "camera",
  "manufacturer": "Canon",
  "model": "5D Mark IV",
  "serial_number": "ABC123"
}
```

### 3.7.3 更新/删除设备

```
PUT /api/equipment/:id
DELETE /api/equipment/:id
```

## 3.8 标签 API (`/api/tags`)

### 3.8.1 获取标签列表

```
GET /api/tags
```

### 3.8.2 创建标签

```
POST /api/tags
Content-Type: application/json

{
  "name": "人物",
  "color": "#FF5733"
}
```

### 3.8.3 为照片添加标签

```
POST /api/photos/:id/tags
Content-Type: application/json

{
  "tag_ids": [1, 5, 8]
}
```

## 3.9 批量操作 API

### 3.9.1 批量下载

```
POST /api/batch-download
Content-Type: application/json

{
  "photo_ids": [1, 2, 3],
  "format": "zip"
}
```

返回：下载链接

### 3.9.2 批量渲染

```
POST /api/batch-render
Content-Type: application/json

{
  "photo_ids": [1, 2, 3],
  "preset_id": 5,
  "output_format": "jpg"
}
```

返回：任务 ID

## 3.10 系统 API

### 3.10.1 健康检查和服务器信息

```
GET /api/health
```

返回：
```json
{
  "success": true,
  "data": {
    "server_mode": "standalone",
    "version": "1.9.2",
    "compute_enabled": true,
    "capabilities": {
      "filmlab": true,
      "raw_decode": true,
      "batch_render": true,
      "edge_detection": true
    },
    "storage": {
      "photos_path": "./uploads",
      "database": "./film.db",
      "free_space": 1099511627776
    }
  }
}
```

### 3.10.2 服务发现

```
POST /api/discover
Content-Type: application/json

{
  "type": "mdns"
}
```

用于在本地网络上自动发现 NAS 实例。

## 3.11 导入 API (`/api/import`)

### 3.11.1 导入照片

```
POST /api/import
Content-Type: multipart/form-data

{
  "roll_id": 1,
  "files": [<file1>, <file2>, ...],
  "auto_scan_exif": true
}
```

支持批量导入多个文件。

## 3.12 导出历史 API (`/api/export-history`)

### 3.12.1 获取导出历史

```
GET /api/export-history?roll_id=1&limit=20
```

### 3.12.2 清空导出历史

```
DELETE /api/export-history?older_than=2026-01-01
```

## 3.13 地理位置 API (`/api/locations`)

### 3.13.1 获取地点列表

```
GET /api/locations
```

返回：所有有地理坐标的照片的聚集地点。

### 3.13.2 更新照片位置

```
PUT /api/locations/:photo_id
Content-Type: application/json

{
  "latitude": 39.9,
  "longitude": 116.4,
  "location_name": "北京"
}
```

## 3.14 错误码大全

| 错误码 | HTTP 状态码 | 含义 |
|--------|-----------|------|
| `PHOTO_NOT_FOUND` | 404 | 照片不存在 |
| `ROLL_NOT_FOUND` | 404 | 胶卷不存在 |
| `INVALID_PARAMS` | 400 | 参数错误 |
| `FILE_TOO_LARGE` | 413 | 文件过大 |
| `UNSUPPORTED_FORMAT` | 415 | 不支持的格式 |
| `COMPUTE_DISABLED` | 403 | NAS 模式禁用计算 |
| `DATABASE_ERROR` | 500 | 数据库错误 |
| `INTERNAL_ERROR` | 500 | 服务器内部错误 |

---

**相关文档**：
- [01-architecture.md](./01-architecture.md) - 系统架构
- [02-database.md](./02-database.md) - 数据库设计
- [04-frontend.md](./04-frontend.md) - 前端开发
