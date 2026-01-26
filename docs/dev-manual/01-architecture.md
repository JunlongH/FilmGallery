# 1. 系统架构

## 1.1 整体架构

FilmGallery 采用 **Client-Server** 架构，支持多端访问。系统支持三种部署模式：本地模式、NAS 模式和混合模式。

```
┌────────────────────────────────────────────────────────────────┐
│                      多端客户端层                                 │
├──────────────┬─────────────────┬───────────────┬──────────────┤
│  Windows     │   Android       │   Apple       │   Web 浏览器  │
│  桌面端      │   移动端        │   Watch       │   (可选)     │
│  Electron    │   React Native  │  React Native │   React      │
│  + React 18  │   + Expo        │   + TS        │              │
└──────┬───────┴────────┬────────┴─────┬─────────┴──────┬───────┘
       │                │              │                │
       └────────────────┼──────────────┼────────────────┘
                        │ HTTP(S) API
            ┌───────────▼──────────────────┐
            │     Express 后端服务器        │
            │  (Node.js + SQLite3)         │
            │  - RESTful API               │
            │  - 文件处理 (Sharp, LibRaw) │
            │  - FilmLab GPU 处理         │
            │  - mDNS 服务发现            │
            └───────────┬──────────────────┘
                        │
        ┌───────────────┼───────────────┐
        │               │               │
   ┌────▼─────┐  ┌─────▼─────┐  ┌────▼──────┐
   │ SQLite3  │  │  文件系统  │  │ OneDrive  │
   │ 数据库   │  │  (本地)   │  │  (云同步) │
   │          │  │           │  │           │
   └──────────┘  └─────────────┘  └───────────┘
```

## 1.2 技术栈

### 1.2.1 桌面端 (Windows/Electron)
- **框架**：Electron 26.6.10 (Chromium 基础)
- **前端**：React 18.2.0 + TypeScript
- **路由**：React Router 7.9.6
- **状态管理**：TanStack React Query 5.90.10
- **图表**：Recharts 3.5.1
- **地图**：Leaflet 1.9.4 + react-leaflet
- **动画**：Framer Motion 12.23.24
- **构建**：Craco (Create React App 配置覆盖)

### 1.2.2 移动端 (Android/Expo)
- **框架**：React Native 0.81.5
- **运行时**：Expo SDK ~54.0.25
- **导航**：React Navigation 6.x
- **UI**：React Native Paper 5.11.1
- **位置**：expo-location 19.0.8
- **文件系统**：expo-file-system 19.0.19
- **相机**：react-native-vision-camera 4.7.3
- **本地存储**：@react-native-async-storage 2.2.0

### 1.2.3 手表应用 (Apple Watch)
- **框架**：React Native 0.83.1
- **语言**：TypeScript
- **导航**：React Navigation 7.x
- **UI**：React Native Paper 5.12.5

### 1.2.4 后端 (Express)
- **框架**：Express 4.18.2
- **数据库**：SQLite3 5.1.7
- **图像处理**：Sharp 0.34.5 + LibRaw (原生模块)
- **文件上传**：Multer 1.4.5-lts.1
- **EXIF**：exiftool-vendored 35.0.0, piexifjs 1.0.6
- **mDNS**：bonjour-service 1.3.0
- **CORS**：cors 2.8.5
- **压缩**：compression 1.8.1

### 1.2.5 共享库
- **TypeScript 类型**：packages/@filmgallery/types
- **API 客户端**：packages/@filmgallery/api-client
- **LibRaw 原生绑定**：packages/@filmgallery/libraw-native
- **共享常量**：packages/shared (serverCapabilities, filmlab-core 等)

## 1.3 核心模块

### 1.3.1 服务器模式

系统支持三种运行模式，由共享库定义：

| 模式 | 计算能力 | 数据存储 | 适用场景 |
|------|----------|----------|---------|
| **standalone** | 完整 (GPU/CPU) | 本地 SQLite | 单机使用、开发 |
| **nas** | 仅列表API | NAS Docker | 数据存储、群晖/威联通 |
| **dev** | 完整 | 本地 SQLite | 开发调试 |

计算密集操作在 NAS 模式自动禁用：
- FilmLab 处理
- RAW 解析预览
- 批量渲染
- 边界检测
- 自动裁剪

### 1.3.2 数据流

```
┌─────────────────────────────────────┐
│      前端用户操作 (点击、上传)        │
└──────────────┬──────────────────────┘
               │
        ┌──────▼──────┐
        │  API 客户端  │ (fetch/axios)
        └──────┬───────┘
               │ HTTP POST/GET/PUT/DELETE
        ┌──────▼──────────────────────┐
        │    Express 路由层 (routes/)  │ ← 验证、权限检查
        └──────┬─────────────────────┘
               │
        ┌──────▼──────────────────────┐
        │    服务层 (services/)        │ ← 业务逻辑
        └──────┬─────────────────────┘
               │
        ┌──────▼──────────────────────┐
        │    数据层 (SQLite + 文件)    │ ← 持久化
        └──────────────────────────────┘
```

### 1.3.3 关键特性

#### 🎞️ FilmLab 处理引擎
- 负片反演 (inversion)
- 白平衡调整
- 色彩校正 (HSL, 分色调)
- 曲线调整
- GPU 加速 (WebGL/CUDA 可选)
- 批量处理队列

#### 📸 RAW 文件支持
- Canon CR2, Nikon NEF, Sony ARW 等格式
- LibRaw 原生模块集成
- 预览生成 (JPEG)
- 原始 Bayer 数据提取

#### 🗺️ 地理位置系统
- GPS 坐标记录
- 照片地图展示 (Leaflet)
- 聚类分析

#### 🏷️ 标签和元数据
- 灵活标签系统
- EXIF 读写
- 自定义元数据字段
- 批量编辑

#### 📁 文件管理
- 智能文件夹组织
- 缩略图缓存
- 流式下载/上传
- OneDrive 同步支持

## 1.4 部署架构

### 1.4.1 本地模式 (Standalone)
```
┌─────────────────────┐
│     用户桌面端      │
│  (Electron App)    │
│                     │
│ ┌───────────────┐   │
│ │ Express 服务  │   │
│ │ SQLite 数据库 │   │
│ │ 文件存储      │   │
│ └───────────────┘   │
└─────────────────────┘
```

### 1.4.2 NAS 模式
```
┌────────────────────────────────────┐
│   NAS (群晖/威联通)                 │
│  Docker Container                  │
│  ┌─────────────────────────────┐   │
│  │ Express 服务 (仅数据API)    │   │
│  │ SQLite 数据库               │   │
│  │ 文件存储 (NAS 磁盘)         │   │
│  └─────────────────────────────┘   │
└─────────┬──────────────────────────┘
          │ 网络连接
   ┌──────┴──────┐
   │             │
┌──▼──┐     ┌───▼──┐
│手机 │     │电脑  │
└─────┘     └──────┘
```

### 1.4.3 混合模式 (推荐)
```
┌─────────────────────────────────────────┐
│ NAS (数据存储)                           │
│  └─ SQLite + 文件                       │
└──────────────┬──────────────────────────┘
               │ 数据同步
         ┌─────┴──────┐
         │            │
    ┌────▼────┐  ┌───▼──────┐
    │ Android │  │ Windows   │
    │ 手机    │  │ 桌面端    │
    │ (仅数据)│  │ (GPU渲染) │
    └─────────┘  └───────────┘
```

## 1.5 扩展性设计

### 1.5.1 插件架构
虽然当前版本不支持，但代码设计允许：
- 新路由模块无缝添加到 `server/routes/`
- 新服务无缝添加到 `server/services/`
- 新前端页面添加到 `client/src/pages/`

### 1.5.2 数据库扩展
- 迁移脚本机制 (`server/migrations/`)
- Prepared Statements 预优化
- 版本化表结构

### 1.5.3 共享库发展
- packages/shared 维护跨平台共享代码
- @filmgallery/* 包实现特定功能库
- 版本解耦（各包独立版本管理）

---

**相关文档**：
- [02-database.md](./02-database.md) - 数据库设计
- [03-backend-api.md](./03-backend-api.md) - API 接口
- [04-frontend.md](./04-frontend.md) - 前端开发
