# 混合算力架构 (Hybrid Compute Architecture)

## 版本信息
- **创建日期**: 2026-01-18
- **分支**: feature/hybrid-compute-architecture
- **状态**: 实施中

---

## 1. 背景与目标

### 1.1 当前问题
- FilmGallery Server 同时负责数据库管理和 FilmLab 图像处理
- FilmLab 对 CPU/GPU 要求高，无法在 NAS 等低算力设备上运行
- 用户希望将数据统一存储在 NAS，同时利用 PC 的算力进行图像处理

### 1.2 目标
1. **数据中心化**: NAS 作为单一事实来源 (Source of Truth)
2. **算力本地化**: PC 负责高算力任务 (FilmLab)
3. **终端轻量化**: Mobile/Watch 直接连接 NAS，无需 PC 在线
4. **部署简单化**: Docker 一键部署 NAS Server

---

## 2. 系统架构

### 2.1 整体架构图

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              网络层 (LAN)                                    │
└─────────────────────────────────────────────────────────────────────────────┘
        │                           │                           │
        ▼                           ▼                           ▼
┌───────────────────┐   ┌───────────────────┐   ┌───────────────────────────┐
│   NAS Server      │   │   PC Workstation  │   │   Mobile / Watch         │
│   (Docker)        │   │   (Electron)      │   │   (React Native)         │
│                   │   │                   │   │                           │
│ ┌───────────────┐ │   │ ┌───────────────┐ │   │ ┌───────────────────────┐ │
│ │ Data Server   │◀┼───┼─│ Client UI     │ │   │ │ App UI                │ │
│ │ (Node.js)     │ │   │ │ (React)       │ │   │ │                       │ │
│ └───────┬───────┘ │   │ └───────┬───────┘ │   │ └───────────┬───────────┘ │
│         │         │   │         │         │   │             │             │
│ ┌───────▼───────┐ │   │ ┌───────▼───────┐ │   │             │             │
│ │ SQLite DB     │ │   │ │ Compute       │ │   │             │             │
│ │ (film.db)     │ │   │ │ Worker        │ │   │             │             │
│ └───────────────┘ │   │ │ (FilmLab)     │ │   │             │             │
│                   │   │ └───────────────┘ │   │             │             │
│ ┌───────────────┐ │   │         │         │   │             │             │
│ │ File Storage  │◀┼───┼─────────┘         │   │             │             │
│ │ (uploads/)    │ │   │   结果上传        │   │             │             │
│ └───────────────┘ │   └───────────────────┘   │             │             │
│         ▲         │                           │             │             │
│         │         │                           │             ▼             │
│         └─────────┼───────────────────────────┼─────────────┘             │
│                   │      API 请求              │      API 请求             │
└───────────────────┘                           └───────────────────────────┘
```

### 2.2 组件职责

| 组件 | 位置 | 职责 | 算力要求 |
|------|------|------|----------|
| **Data Server** | NAS (Docker) | 数据库 CRUD、文件存储、API 服务 | 低 |
| **Client UI** | PC (Electron) | 用户界面、调用算力 | 低 |
| **Compute Worker** | PC (Electron Main) | FilmLab 图像处理、RAW 解码 | 高 |
| **Mobile/Watch** | 手机/手表 | 浏览、元数据编辑 | 低 |

---

## 3. 运行模式

### 3.1 模式定义

| 模式 | 描述 | Server 位置 | FilmLab 位置 |
|------|------|-------------|--------------|
| **Standalone** | 传统单机模式 | PC 本地 | PC 本地 |
| **Hybrid** | 混合算力模式 | NAS (Docker) | PC 本地 |
| **Client-Only** | 纯客户端模式 | 远程服务器 | 禁用 |

### 3.2 模式配置

```javascript
// electron 配置示例
{
  "serverMode": "hybrid",        // standalone | hybrid | client-only
  "dataServer": {
    "type": "remote",            // local | remote
    "url": "http://192.168.1.100:4000"
  },
  "computeWorker": {
    "enabled": true,
    "fileAccess": "smb",         // smb | http | local
    "smbMount": "Z:\\FilmGallery"
  }
}
```

---

## 4. API 路由分类

### 4.1 Data API (NAS Server 提供)

所有端都可以调用，在 NAS 上执行：

| 端点 | 方法 | 描述 |
|------|------|------|
| `/api/rolls` | GET/POST | 胶卷管理 |
| `/api/photos` | GET/POST/PUT/DELETE | 照片管理 |
| `/api/films` | GET/POST | 胶片库 |
| `/api/film-items` | GET/POST/PUT | 胶卷库存 |
| `/api/equipment` | GET/POST/PUT/DELETE | 设备管理 |
| `/api/presets` | GET/POST/PUT/DELETE | 预设管理 |
| `/api/uploads` | POST | 文件上传 |
| `/api/discover` | GET | 端口发现 |
| `/api/health` | GET | 健康检查 |
| `/uploads/*` | GET | 静态文件服务 |

### 4.2 Compute API (PC Electron 本地执行)

只有 PC 端可以调用，需要高算力：

| 端点 | 描述 | 替代方案 |
|------|------|----------|
| `/api/filmlab/process` | FilmLab 处理 | PC 本地拦截 |
| `/api/raw/decode` | RAW 解码 | PC 本地拦截 |
| `/api/batch-render` | 批量渲染 | PC 本地拦截 |
| `/api/edge-detection` | 边缘检测 | PC 本地拦截 |

### 4.3 NAS Server 行为

当 NAS Server 收到 Compute API 请求时：

```javascript
// NAS 模式下禁用算力密集型路由
if (process.env.SERVER_MODE === 'nas') {
  app.use('/api/filmlab', (req, res) => {
    res.status(503).json({
      error: 'COMPUTE_REQUIRED',
      message: 'This operation requires PC compute worker',
      code: 'E_NAS_NO_COMPUTE'
    });
  });
}
```

---

## 5. 文件访问策略

### 5.1 策略对比

| 策略 | 延迟 | 带宽 | 复杂度 | 适用场景 |
|------|------|------|--------|----------|
| **SMB/NFS 挂载** | 低 | 高 | 低 | 同一局域网 |
| **HTTP 下载** | 中 | 中 | 中 | 跨网络 |
| **本地缓存** | 最低 | - | 高 | 反复处理 |

### 5.2 SMB 挂载模式 (推荐)

```
NAS 共享: \\192.168.1.100\FilmGallery
PC 映射: Z:\FilmGallery
路径转换: /uploads/rolls/1/photo.arw → Z:\FilmGallery\uploads\rolls\1\photo.arw
```

### 5.3 HTTP 下载模式

```javascript
// 流程
1. PC 请求: GET http://nas:4000/uploads/raw/photo.arw
2. 保存到: %TEMP%/filmgallery-cache/photo.arw
3. 本地处理
4. 上传结果: POST http://nas:4000/api/uploads
```

---

## 6. 实施计划

### Phase 1: Server 模式分离 ✅ 已完成

- [x] 6.1.1 添加 `SERVER_MODE` 环境变量支持 (`packages/shared/serverCapabilities.js`)
- [x] 6.1.2 实现 Compute API 的条件禁用 (`server/middleware/compute-guard.js`)
- [x] 6.1.3 创建 Docker 部署配置 (`docker/Dockerfile`, `docker/docker-compose.yml`)
- [x] 6.1.4 实现 `/api/discover` 返回服务器能力信息

### Phase 2: Client 远程连接 ✅ 已完成

- [x] 6.2.1 设置页面添加服务器模式切换 (`client/src/components/Settings/ServerSettings.jsx`)
- [x] 6.2.2 修改 API 层支持远程 Data Server (`electron-preload.js`, `electron-main.js`)
- [x] 6.2.3 实现本地 Compute Worker 框架 (`client/src/services/ComputeService.js`)

### Phase 3: 算力分离 ✅ 已完成

- [x] 6.3.1 封装 FilmLab 处理器为独立模块 (已有 `filmlabGpuProcess` IPC)
- [x] 6.3.2 实现 Compute API 本地拦截 (`ComputeService.smartFilmlabPreview`)
- [x] 6.3.3 实现文件访问抽象层 (`client/src/services/FileAccessService.js`)
- [ ] 6.3.4 实现处理结果上传 (待后续完善)

### Phase 4: 优化与测试

- [ ] 6.4.1 添加文件缓存机制
- [ ] 6.4.2 实现进度反馈
- [ ] 6.4.3 完善错误处理
- [ ] 6.4.4 编写部署文档

---

## 7. 文件变更清单

### 7.1 新增文件

| 文件 | 描述 |
|------|------|
| `docker/Dockerfile` | NAS Server Docker 镜像 |
| `docker/docker-compose.yml` | Docker Compose 配置 |
| `docker/.env.example` | 环境变量模板 |
| `server/middleware/compute-guard.js` | 算力路由守卫 |
| `packages/shared/serverCapabilities.js` | 服务器能力描述 |
| `client/src/services/ComputeService.js` | 本地算力服务 |
| `client/src/services/FileAccessService.js` | 文件访问抽象层 |

### 7.2 修改文件

| 文件 | 修改内容 |
|------|----------|
| `server/server.js` | 添加 SERVER_MODE 支持 |
| `server/routes/filmlab.js` | 条件禁用 |
| `electron-main.js` | 添加 Compute Worker |
| `electron-preload.js` | 暴露本地计算 API |
| `client/src/api.js` | 支持远程 Data Server |
| `client/src/components/Settings.jsx` | 模式切换 UI |

---

## 8. Docker 部署设计

### 8.1 目录结构

```
docker/
├── Dockerfile              # 多阶段构建
├── docker-compose.yml      # 一键部署
├── .env.example            # 环境变量模板
├── scripts/
│   ├── entrypoint.sh       # 启动脚本
│   └── healthcheck.sh      # 健康检查
└── README.md               # 部署指南
```

### 8.2 docker-compose.yml 设计

```yaml
version: '3.8'

services:
  filmgallery:
    image: filmgallery/server:latest
    container_name: filmgallery-server
    restart: unless-stopped
    ports:
      - "4000:4000"
    environment:
      - SERVER_MODE=nas
      - TZ=Asia/Shanghai
    volumes:
      - ./data:/app/data          # 数据库
      - ./uploads:/app/uploads    # 图片文件
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:4000/api/health"]
      interval: 30s
      timeout: 10s
      retries: 3
```

### 8.3 一键部署命令

```bash
# 创建目录
mkdir -p ~/filmgallery/{data,uploads}

# 下载配置
curl -O https://raw.githubusercontent.com/.../docker-compose.yml

# 启动
docker-compose up -d

# 查看日志
docker-compose logs -f
```

---

## 9. API 增强

### 9.1 服务器能力发现

```javascript
// GET /api/discover
{
  "app": "FilmGallery",
  "version": "1.9.0",
  "port": 4000,
  "mode": "nas",              // standalone | nas
  "capabilities": {
    "data": true,             // 数据 API
    "compute": false,         // 算力 API
    "storage": true           // 文件存储
  },
  "endpoints": {
    "data": ["rolls", "photos", "films", "equipment"],
    "compute": []             // NAS 模式为空
  }
}
```

### 9.2 PC 端能力发现

```javascript
// PC Electron 启动时检测远程服务器
const serverInfo = await fetch(`${API_BASE}/api/discover`).then(r => r.json());

if (serverInfo.mode === 'nas' && !serverInfo.capabilities.compute) {
  // 启用本地 Compute Worker
  enableLocalComputeWorker();
}
```

---

## 10. 兼容性矩阵

| 客户端 | Standalone | Hybrid | Client-Only |
|--------|------------|--------|-------------|
| PC Electron | ✅ 完整功能 | ✅ 完整功能 | ⚠️ 无 FilmLab |
| Mobile | ✅ 完整功能 | ✅ 完整功能 | ✅ 完整功能 |
| Watch | ✅ 完整功能 | ✅ 完整功能 | ✅ 完整功能 |

---

## 11. 测试检查清单

- [ ] NAS Server 正常启动
- [ ] Mobile 可连接 NAS
- [ ] PC 可连接 NAS Data API
- [ ] PC FilmLab 本地处理正常
- [ ] PC 处理结果上传 NAS 正常
- [ ] SMB 挂载模式正常
- [ ] HTTP 下载模式正常
- [ ] Docker 一键部署正常
