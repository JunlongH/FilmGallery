# FilmGallery 开发手册

**版本：** v1.9.2  
**最后更新：** 2026-01-26  
**项目类型：** Electron + Express + React + React Native (多平台)

---

## 📑 快速导航

### 🚀 快速开始
- [开发环境搭建](#开发环境搭建)
- [项目目录结构](#项目目录结构)
- [启动服务](#启动服务)

### 📚 核心模块
- [服务器架构](#服务器架构)
- [客户端架构](#客户端架构)
- [数据库结构](#数据库结构)
- [API 接口](#api-接口)
- [共享库](#共享库)

### 🔧 开发指南
- [添加新功能](#添加新功能)
- [代码组织](#代码组织)
- [常见任务](#常见任务)

---

## 项目简介

**FilmGallery** 是一个跨平台的专业胶片摄影管理系统，通过 AI 辅助开发 (Vibe Coding) 完成。

### 核心特性
- **多平台支持**：Windows 桌面 (Electron)、Android 移动 (Expo)、Apple Watch (React Native)
- **混合架构**：支持本地模式、NAS 模式、混合模式三种部署
- **GPU 加速**：FilmLab 胶片处理引擎，支持 GPU 加速渲染
- **RAW 解析**：集成 LibRaw 原生模块处理 RAW 格式照片
- **智能识别**：边界检测、自动裁剪、EXIF 解析
- **离线优先**：SQLite 本地存储，云同步可选

---

## 开发环境搭建

### 系统要求

- **Node.js**: v18+ (LTS 推荐)
- **npm**: v8+
- **Python**: v3.8+ (electron-rebuild 需要)
- **Windows 构建工具**（Windows 用户）：`npm install --global windows-build-tools`

### 安装步骤

```bash
# 1. 克隆仓库
git clone <repository-url>
cd FilmGalery

# 2. 安装根目录依赖和工作空间依赖
npm install

# 3. 初始化数据库（自动执行）
cd server && npm run init-db

# 4. 可选：设置环境变量
# 根据需求设置服务器模式（standalone/nas/dev）
# 详见 server/config/db-config.js
```

### 环境配置

编辑 `.env` 文件（如需要）：

```bash
# 服务器模式：standalone（本地）、nas（NAS）、dev（开发）
SERVER_MODE=dev

# 数据存储路径
DATA_ROOT=./data
UPLOADS_ROOT=./uploads
USER_DATA=./user-data

# API 服务器端口
API_PORT=4000

# React 开发服务器端口
REACT_PORT=3000
```

---

## 项目目录结构

```
FilmGalery/
├── client/                  # 桌面端 React 应用
│   ├── src/
│   │   ├── api/            # API 客户端
│   │   ├── components/     # React 组件
│   │   ├── pages/          # 页面组件
│   │   ├── services/       # 业务逻辑
│   │   ├── hooks/          # 自定义 hooks
│   │   └── styles/         # 样式文件
│   ├── public/             # 静态资源
│   └── package.json
│
├── server/                 # Express 后端服务
│   ├── routes/            # API 路由定义
│   ├── services/          # 核心业务逻辑
│   ├── middleware/        # 中间件
│   ├── config/            # 配置文件
│   ├── migrations/        # 数据库迁移
│   ├── utils/             # 工具函数
│   ├── constants/         # 常量定义
│   ├── server.js          # 应用入口
│   └── db.js              # 数据库连接
│
├── mobile/                # Android 移动端 (Expo)
│   ├── src/
│   │   ├── screens/       # 页面
│   │   ├── components/    # 组件
│   │   ├── services/      # 业务逻辑
│   │   └── hooks/         # 自定义 hooks
│   └── package.json
│
├── watch-app/             # Apple Watch 应用 (React Native)
│   ├── src/
│   ├── App.tsx
│   └── package.json
│
├── packages/              # 共享库
│   ├── shared/           # 共享代码、常量、能力定义
│   │   ├── serverCapabilities.js    # 服务器模式定义
│   │   ├── filmlab-core.js          # FilmLab 核心算法
│   │   ├── filmLabExport.js         # FilmLab 导出
│   │   ├── rawUtils.js              # RAW 处理工具
│   │   ├── render/                  # 渲染引擎
│   │   └── edgeDetection/           # 边界检测
│   │
│   └── @filmgallery/
│       ├── api-client/      # API 客户端库
│       ├── libraw-native/   # LibRaw 原生绑定
│       └── types/           # TypeScript 类型定义
│
├── electron-main.js         # Electron 主进程
├── electron-preload.js      # Electron 预加载脚本
├── package.json             # 根项目配置
└── docs/                    # 文档
```

---

## 启动服务

### 开发模式

```bash
# 方式 1: 只启动后端服务器（端口 4000）
cd server && npm start

# 方式 2: 启动后端 + 前端开发服务器（并发）
npm run dev:web

# 方式 3: 启动后端 + 桌面应用（开发模式）
npm run dev

# 方式 4: 启动后端 + 前端 + Electron（完整开发环境）
npm run dev:full
```

### 访问应用

- **Web 前端**：http://localhost:3000
- **API 服务器**：http://localhost:4000
- **API 文档**：http://localhost:4000/api/health

---

## 服务器架构

### Express 应用结构

**主服务器** (`server/server.js`)：
- 启动 Express 应用，设置中间件
- 挂载所有 API 路由
- 配置静态文件服务
- 初始化数据库

### 路由组织 (`server/routes/`)

| 模块 | 功能 | 依赖 |
|------|------|------|
| `photos.js` | 照片管理、上传、导出 | photo-service |
| `rolls.js` | 胶卷管理 | roll-service |
| `films.js` | 胶片库存 | 无 |
| `filmlab.js` | 胶片处理、预设 | filmlab-service |
| `raw.js` | RAW 解析、预览 | raw-decoder, libraw-native |
| `equipment.js` | 设备档案 | equipment-service |
| `tags.js` | 标签管理 | tag-service |
| `metadata.js` | 元数据编辑 | exif-service |
| `export.js` | 批量导出 | export-queue |
| `health.js` | 健康检查、API 发现 | serverCapabilities |
| `import.js` | 照片导入 | import-service |
| `batch-render.js` | 批量渲染 | render-service |
| `edge-detection.js` | 边界检测 | edge-detection-service |
| `locations.js` | 地理位置 | 无 |
| `presets.js` | 编辑预设 | 无 |
| `filesystem.js` | 文件系统操作 | 无 |

### 核心服务 (`server/services/`)

| 服务 | 职责 | 关键方法 |
|------|------|---------|
| `photo-service.js` | 照片 CRUD、缓存、导出 | createPhoto, getPhotos, updatePhoto, deletePhoto |
| `roll-service.js` | 胶卷管理、统计 | createRoll, getRolls, getRollStats |
| `filmlab-service.js` | 胶片处理编队、渲染 | processFilmlab, previewFilmlab |
| `raw-decoder.js` | RAW 文件解析 | decodeRaw, generatePreview |
| `image-processor.js` | 图像处理（缩放、裁剪） | resize, crop, generateThumbnail |
| `equipment-service.js` | 设备档案管理 | createEquipment, getEquipment |
| `tag-service.js` | 标签系统 | createTag, getTags, addPhotoTag |
| `exif-service.js` | EXIF 读写 | readExif, updateExif |
| `export-queue.js` | 导出队列管理 | enqueueExport, getQueueStatus |
| `edge-detection-service.js` | 边界检测、自动裁剪 | detectEdges, autoCrop |
| `import-service.js` | 照片导入流程 | importPhotos, validateImport |
| `download-service.js` | 文件下载 | downloadFile, downloadBatch |

### 数据库 (`server/db.js`)

使用 SQLite3，初始化和迁移流程：

1. **初始化**：`server.js` → `runMigration()` → 执行 SQL schema
2. **迁移**：顺序执行 `migrations/` 目录中的迁移脚本
3. **查询优化**：使用 Prepared Statements（`utils/prepared-statements.js`）

**关键迁移文件**：
- `2025-11-30-db-revamp.js` - 主要数据库重构
- `2025-12-02-add-film-items.js` - 添加胶片类型
- `2026-01-16-add-positive-source.js` - 正片来源支持

---

## 客户端架构

### 桌面端 (`client/`)

**技术栈**：React 18.2 + React Router 7 + Craco + Electron

**主要页面** (`client/src/pages/`):
- 首页概览
- 胶卷库
- 胶片库存
- 地图视图

**核心组件** (`client/src/components/`):
- `PhotoGrid.jsx` - 照片网格、虚拟化列表
- `RollDetail.jsx` - 胶卷详情
- `FilmLab/` - FilmLab 处理 UI
- `RawImport/` - RAW 导入流程
- `ImportPositive/` - 正片扫描导入
- `PhotoDetailsSidebar.jsx` - 照片元数据编辑
- `BatchExport/` - 批量导出

**数据管理**：
- 使用 TanStack React Query (v5.90)，自动缓存和同步
- Custom hooks 处理通用逻辑（`src/hooks/`）
- Services 层封装 API 调用（`src/services/`）

**API 客户端** (`client/src/api/api.js`):
```javascript
// 自动构造 API 基础 URL
const baseURL = process.env.REACT_APP_API_BASE || 'http://localhost:4000';
```

### 移动端 (`mobile/`)

**技术栈**：React Native 0.81 + Expo 54 + React Navigation

**主要屏幕** (`mobile/src/screens/`):
- 首页
- 胶卷列表
- 照片列表
- 相机集成

**关键特性**：
- 使用 Expo 管理原生模块依赖
- mDNS 自动服务发现（连接本地 NAS）
- Geolocation 地理位置采集
- Async Storage 本地缓存

### 手表应用 (`watch-app/`)

**技术栈**：React Native 0.83 + TypeScript

简化的手表界面，主要功能：
- 快速查看统计数据
- 设备连接状态
- 快捷操作

---

## 数据库结构

### 核心表

**films** - 胶片库存
```sql
id, name, iso, format, type, stock, purchased_date, batch_number, notes
```

**rolls** - 胶卷管理
```sql
id, name, film_id, status, loaded_date, shot_date, notes, equipment_id
```

**photos** - 照片记录
```sql
id, roll_id, file_path, shot_date, shot_number, exposure, iso, aperture, 
shutter_speed, focal_length, notes, scan_date, scanner_settings, metadata
```

**film_items** - 胶片类型扩展（新增）
```sql
id, film_id, type (negative/positive/slide), base_correction, inversion_data
```

**equipment** - 设备档案
```sql
id, name, type (camera/lens/filter), notes
```

**photo_equipment** - 照片设备关联
```sql
id, photo_id, equipment_id
```

**tags** - 标签
```sql
id, name, color
```

**photo_tags** - 照片标签关联
```sql
id, photo_id, tag_id
```

**presets** - 编辑预设
```sql
id, name, category, settings_json
```

**export_history** - 导出记录
```sql
id, roll_id, export_date, export_path, format, settings
```

### 数据库迁移

迁移脚本位于 `server/migrations/`，按时间戳命名：

```bash
# 每次启动时自动执行
npm run init-db
```

如需手动运行特定迁移：
```bash
node server/migrations/2025-11-30-db-revamp.js
```

---

## API 接口

### 基础路由前缀

所有 API 均以 `/api` 开头。

### 照片 API

```
GET    /api/photos              # 获取照片列表（分页）
GET    /api/photos/:id          # 获取单张照片详情
POST   /api/photos              # 上传照片
PUT    /api/photos/:id          # 更新照片元数据
DELETE /api/photos/:id          # 删除照片
GET    /api/photos/:id/raw      # 获取原始文件
POST   /api/photos/batch-export # 批量导出
```

### 胶卷 API

```
GET    /api/rolls               # 获取胶卷列表
GET    /api/rolls/:id           # 获取胶卷详情
POST   /api/rolls               # 创建胶卷
PUT    /api/rolls/:id           # 更新胶卷
DELETE /api/rolls/:id           # 删除胶卷
GET    /api/rolls/:id/photos    # 获取胶卷的照片
```

### FilmLab API

```
POST   /api/filmlab/process     # FilmLab 处理
GET    /api/filmlab/preview     # FilmLab 预览
POST   /api/filmlab/presets     # 保存预设
GET    /api/filmlab/presets     # 获取预设列表
```

### RAW 处理 API

```
POST   /api/raw/decode          # 解析 RAW 文件
GET    /api/raw/preview         # 获取 RAW 预览
```

### 设备 API

```
GET    /api/equipment           # 获取设备列表
POST   /api/equipment           # 创建设备
PUT    /api/equipment/:id       # 更新设备
DELETE /api/equipment/:id       # 删除设备
```

### 标签 API

```
GET    /api/tags                # 获取标签列表
POST   /api/tags                # 创建标签
PUT    /api/tags/:id            # 更新标签
DELETE /api/tags/:id            # 删除标签
POST   /api/photos/:id/tags     # 为照片添加标签
```

### 导出 API

```
POST   /api/batch-download      # 批量下载
POST   /api/batch-render        # 批量渲染（FilmLab）
GET    /api/export-history      # 导出历史
```

### 发现 API

```
GET    /api/health              # 健康检查和服务器能力
POST   /api/discover            # 服务发现（mDNS）
```

### 错误处理

所有 API 返回统一格式：

```json
{
  "success": true/false,
  "data": { /* 响应数据 */ },
  "error": { "code": "...", "message": "..." }
}
```

常见错误码：
- `PHOTO_NOT_FOUND` - 照片不存在
- `INVALID_PARAMS` - 参数错误
- `COMPUTE_DISABLED` - NAS 模式下禁用计算

---

## 共享库

### `packages/shared/`

跨平台共享代码，包含：

#### 服务器能力 (`serverCapabilities.js`)

定义三种服务器模式：

| 模式 | 特点 | 适用场景 |
|------|------|---------|
| **standalone** | 完整功能，包括 FilmLab GPU 渲染 | 单机使用 |
| **nas** | 仅数据存储，禁用计算密集操作 | NAS/Docker 部署 |
| **dev** | 开发模式，完整日志 | 本地开发 |

路由保护：
```javascript
// 计算密集操作在 NAS 模式自动返回 403
// 中间件：computeGuard
```

#### FilmLab 核心 (`filmlab-core.js`)

胶片处理算法实现：
- 负片反演（inversion）
- 白平衡调整
- 色彩校正（HSL）
- 分色调（split toning）
- 曲线调整

#### RAW 处理 (`rawUtils.js`)

RAW 文件解析工具：
- 支持格式：Canon CR2、Nikon NEF、Sony ARW 等
- 集成 LibRaw 原生模块
- 可选：Lightdrift LibRaw

#### 渲染引擎 (`render/`)

GPU 加速渲染（WebGL/CUDA）

#### 边界检测 (`edgeDetection/`)

自动边界检测算法

---

## 添加新功能

### 添加新 API 端点

**步骤 1**: 创建路由处理程序

```javascript
// server/routes/example.js
const router = require('express').Router();
const { exampleService } = require('../services/example-service');

router.get('/example', async (req, res) => {
  try {
    const result = await exampleService.getExample();
    res.json({ success: true, data: result });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
```

**步骤 2**: 在服务器注册路由

```javascript
// server/server.js
app.use('/api/example', require('./routes/example'));
```

**步骤 3**: 创建服务层

```javascript
// server/services/example-service.js
const db = require('../db');

async function getExample() {
  // 业务逻辑
}

module.exports = { getExample };
```

**步骤 4**: 在前端调用

```javascript
// client/src/api/api.js
export async function getExample() {
  const response = await fetch(`${baseURL}/api/example`);
  return response.json();
}
```

### 添加数据库迁移

```javascript
// server/migrations/2026-01-XX-add-example.js
const sqlite3 = require('sqlite3');

function migrate(db) {
  return new Promise((resolve, reject) => {
    db.serialize(() => {
      db.run(`
        ALTER TABLE photos ADD COLUMN example_column TEXT
      `, (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  });
}

module.exports = migrate;
```

### 添加前端页面

```javascript
// client/src/pages/ExamplePage.jsx
import { useQuery } from '@tanstack/react-query';
import { getExample } from '../api/api';

export function ExamplePage() {
  const { data, isLoading, error } = useQuery({
    queryKey: ['example'],
    queryFn: getExample
  });

  if (isLoading) return <div>Loading...</div>;
  if (error) return <div>Error: {error.message}</div>;

  return <div>{/* 页面内容 */}</div>;
}
```

---

## 代码组织

### 服务器端

```
server/
├── routes/         # 路由层 - 处理 HTTP 请求
├── services/       # 业务逻辑层
├── middleware/     # 中间件
├── config/         # 配置
├── migrations/     # 数据库迁移
├── utils/          # 通用工具
└── constants/      # 常量
```

**命名约定**：
- 文件：kebab-case (例: `photo-service.js`)
- 函数：camelCase (例: `getPhotos()`)
- 常量：UPPER_CASE (例: `DEFAULT_PAGE_SIZE`)

### 前端端

```
client/src/
├── api/            # API 客户端
├── pages/          # 页面级组件
├── components/     # 可复用组件
├── hooks/          # 自定义 hooks
├── services/       # 业务逻辑
├── styles/         # 全局样式
└── utils/          # 工具函数
```

**命名约定**：
- 组件：PascalCase (例: `PhotoGrid.jsx`)
- 函数：camelCase
- Hooks：useXxx (例: `usePhotos.js`)

---

## 常见任务

### 启用/禁用功能

编辑服务器模式：

```javascript
// server/config/db-config.js
const getServerMode = () => process.env.SERVER_MODE || 'standalone';
```

或通过环境变量：
```bash
SERVER_MODE=nas npm start
```

### 调试 API

使用内置日志：

```javascript
// server 端
console.log('[API]', method, path, params);

// 检查 /api/health 了解服务器能力
curl http://localhost:4000/api/health
```

### 性能优化

**数据库查询**：
- 使用 Prepared Statements (`utils/prepared-statements.js`)
- 避免 N+1 查询
- 添加适当的索引

**前端**：
- 使用 React Query 的缓存策略
- 虚拟化长列表 (VirtualPhotoGrid)
- 懒加载图片

### 处理大文件

使用流式传输：

```javascript
// 处理上传
const multer = require('multer');
const upload = multer({ dest: uploadsDir, limits: { fileSize: 500 * 1024 * 1024 } });

app.post('/api/upload', upload.single('file'), (req, res) => {
  // 处理文件
});
```

### 跨平台兼容性

- **路径**：使用 `path.join()` 而不是字符串拼接
- **行尾**：统一使用 LF（`.gitattributes`）
- **文件锁**：Windows 上禁用 Sharp 缓存（已配置）

---

## 部署

### 桌面端构建

```bash
# 开发模式
npm run dev

# 打包（Windows）
npm run dist

# 仅生成安装程序
npm run pack
```

### Docker 部署（NAS）

```bash
cd docker
bash create-release-package.sh
docker-compose up -d
```

### 移动端构建

```bash
cd mobile

# 本地运行
npm run android

# EAS 构建
npm run build:apk
npm run build:aab
```

---

## 常见问题

### Q: 如何连接到远程 NAS？
**A**: 移动端和桌面端通过 mDNS 自动发现，或手动输入 IP。详见 `mdns-service.js`。

### Q: FilmLab 处理为什么很慢？
**A**: 启用 GPU 加速。确保 CUDA/OpenGL 环境正确配置，检查 `filmlab-service.js`。

### Q: 如何修改数据库结构？
**A**: 创建新的迁移脚本在 `migrations/`，遵循时间戳命名约定。

### Q: 如何本地调试 Electron？
**A**: 运行 `npm run dev` 启动开发模式，F12 打开开发者工具。

### Q: Windows 文件路径问题？
**A**: 项目已处理大小写敏感性。使用 `path` 模块，避免硬编码路径分隔符。

---

## 贡献指南

1. **理解设计**：阅读相关功能的代码和文档
2. **遵循风格**：参考现有代码的风格和组织方式
3. **添加测试**：关键功能需要测试代码
4. **更新文档**：修改功能时更新相关文档
5. **提交 PR**：清晰描述修改内容和原因

---

## 📖 详细文档

完整的分章节文档位于 [dev-manual/](./dev-manual/) 目录：

1. **[01-architecture.md](./dev-manual/01-architecture.md)** - 系统整体架构和技术栈
2. **[02-database.md](./dev-manual/02-database.md)** - 数据库设计和迁移机制
3. **[03-backend-api.md](./dev-manual/03-backend-api.md)** - 完整的 API 接口文档
4. **[04-frontend.md](./dev-manual/04-frontend.md)** - 桌面端、移动端和手表端开发
5. **[05-core-features.md](./dev-manual/05-core-features.md)** - FilmLab、RAW、地理位置等核心功能
6. **[06-development.md](./dev-manual/06-development.md)** - 开发流程、添加功能、调试技巧
7. **[07-deployment.md](./dev-manual/07-deployment.md)** - 部署、构建、升级和运维

## 📚 相关文档

- [API_BASE-QUICK-REFERENCE.md](./API_BASE-QUICK-REFERENCE.md) - API 快速参考
- [DOCKER-BUILD-GUIDE.md](./DOCKER-BUILD-GUIDE.md) - Docker 构建指南
- [database-migration-2025-11-30.md](./database-migration-2025-11-30.md) - 数据库迁移详情
- [onedrive-sync-optimization.md](./onedrive-sync-optimization.md) - OneDrive 同步优化

---

**最后更新**：2026-01-26  
**维护者**：AI 辅助开发 (Vibe Coding)  
**许可证**：MIT
