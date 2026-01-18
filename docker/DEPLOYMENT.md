# FilmGallery Docker NAS 部署指南

本指南详细说明如何在 NAS 或服务器上部署 FilmGallery Docker 容器。

## 🎯 核心概念

### 数据持久化
Docker 容器是临时的，容器删除后内部数据会丢失。因此需要将重要数据（数据库、照片）**挂载到 NAS 本地路径**。

### 混合模式
FilmGallery 支持混合模式：
- **NAS 服务器**：只负责数据存储，不进行计算密集型任务
- **PC 客户端**：利用本地 GPU 进行 FilmLab 渲染，结果上传到 NAS

---

## 📁 目录结构

部署前，请在 NAS 上创建以下目录结构：

```
/volume1/docker/filmgallery/          # 推荐的根目录
├── data/                              # 数据库文件
│   └── film.db                        # SQLite 数据库 (自动创建)
├── uploads/                           # 照片存储
│   ├── rolls/                         # 胶卷照片
│   ├── films/                         # 胶片库缩略图
│   └── tmp/                           # 临时文件
└── docker-compose.yml                 # Docker Compose 配置
```

可选：如果需要从其他位置导入照片，可以挂载额外的目录：
```
/volume1/photos/                       # 外部照片源（只读）
/volume1/scans/                        # 扫描仪输出目录（只读）
```

---

## 🚀 快速部署

### 方式一：一键安装脚本（推荐新手）

```bash
# 下载并运行安装向导
curl -sSL https://your-server/install.sh | bash

# 或者使用本地脚本
./install.sh
```

安装向导会交互式引导你配置：
- 数据存储路径
- 照片存储路径
- 外部导入目录
- 端口和时区

### 方式二：快速启动（体验）

```bash
# 一行命令快速启动，数据存储在 ~/filmgallery
curl -sSL https://your-server/quickstart.sh | bash

# 或指定目录
./quickstart.sh /volume1/docker/filmgallery
```

### 方式三：Docker Compose（手动配置）

1. **创建目录**
```bash
mkdir -p /volume1/docker/filmgallery/data
mkdir -p /volume1/docker/filmgallery/uploads
```

2. **创建配置文件**

在 `/volume1/docker/filmgallery/` 创建 `docker-compose.yml`：

```yaml
version: '3.8'

services:
  filmgallery:
    image: filmgallery-nas:latest
    container_name: filmgallery
    restart: unless-stopped
    
    ports:
      - "4000:4000"
    
    environment:
      - NODE_ENV=production
      - SERVER_MODE=nas
      - PORT=4000
      - TZ=Asia/Shanghai
      # 文件系统访问模式 (三选一)
      # 模式1: 挂载目录模式 (推荐) - 自动允许 /mnt 下所有目录
      - ALLOW_ALL_MOUNTED_PATHS=true
      # 模式2: 白名单模式 - 只允许指定目录
      # - ALLOWED_BROWSE_PATHS=/mnt/photos,/mnt/scans
      # 模式3: 开放模式 (危险!)
      # - FILESYSTEM_OPEN_MODE=true
    
    volumes:
      # 核心数据挂载（必须配置）
      - /volume1/docker/filmgallery/data:/app/data
      - /volume1/docker/filmgallery/uploads:/app/uploads
      
      # 外部照片源（可选，挂载到 /mnt 下自动可用）
      - /volume1/photos:/mnt/photos:ro
      - /volume1/scans:/mnt/scans:ro
    
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:4000/api/health"]
      interval: 30s
      timeout: 10s
      retries: 3
```

3. **启动服务**
```bash
cd /volume1/docker/filmgallery
docker-compose up -d
```

4. **验证部署**
```bash
curl http://localhost:4000/api/health
# 应返回: {"status":"ok",...}

curl http://localhost:4000/api/discover
# 应返回: {"mode":"nas","capabilities":{"compute":false,...}}
```

### 方式二：Docker Run

```bash
docker run -d \
  --name filmgallery \
  --restart unless-stopped \
  -p 4000:4000 \
  -e NODE_ENV=production \
  -e SERVER_MODE=nas \
  -e TZ=Asia/Shanghai \
  -e ALLOWED_BROWSE_PATHS=/mnt/photos,/mnt/scans \
  -v /volume1/docker/filmgallery/data:/app/data \
  -v /volume1/docker/filmgallery/uploads:/app/uploads \
  -v /volume1/photos:/mnt/photos:ro \
  -v /volume1/scans:/mnt/scans:ro \
  filmgallery-nas:latest
```

---

## ⚙️ 环境变量

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `NODE_ENV` | `production` | 运行环境 |
| `SERVER_MODE` | `nas` | 服务器模式：`nas`（存储）/ `standalone`（完整） |
| `PORT` | `4000` | 服务端口 |
| `TZ` | `UTC` | 时区设置 |
| `ALLOWED_BROWSE_PATHS` | - | 允许通过 API 浏览的目录列表（逗号分隔） |
| `DB_WRITE_THROUGH` | `0` | 数据库写入模式（云同步时设为 1） |

---

## 📂 路径挂载详解

### 核心挂载（必须）

| 容器路径 | 用途 | 建议 NAS 路径 |
|----------|------|---------------|
| `/app/data` | SQLite 数据库 | `/volume1/docker/filmgallery/data` |
| `/app/uploads` | 照片存储 | `/volume1/docker/filmgallery/uploads` |

### 可选挂载（照片导入）

如果需要从 NAS 其他位置导入照片，需要：

1. **挂载源目录**（建议只读）：
```yaml
volumes:
  - /volume1/photos:/mnt/photos:ro
```

2. **配置环境变量**：
```yaml
environment:
  - ALLOWED_BROWSE_PATHS=/mnt/photos
```

这样客户端就可以通过 FilmGallery 界面浏览 `/volume1/photos` 目录并导入照片。

---

## 🖥️ 客户端配置

### 混合模式设置

1. 打开 FilmGallery 桌面客户端
2. 进入 **设置 → 服务器连接**
3. 选择 **混合模式**
4. 输入 NAS 服务器地址：`http://<NAS_IP>:4000`
5. 点击测试连接
6. 保存设置

### 工作流程

在混合模式下：
- **数据存储**：所有照片和数据库存储在 NAS
- **FilmLab 渲染**：使用本地 PC 的 GPU 处理
- **渲染结果**：自动上传回 NAS 服务器

---

## 🔧 常见问题

### Q: 照片上传后找不到？
A: 检查 `/app/uploads` 是否正确挂载到 NAS 本地路径。

### Q: 无法浏览外部目录？
A: 确保：
1. 目录已挂载到容器
2. `ALLOWED_BROWSE_PATHS` 包含该目录
3. 挂载路径与环境变量一致

### Q: 权限问题？
A: 确保 NAS 目录对容器用户可读写：
```bash
chmod -R 755 /volume1/docker/filmgallery
chown -R 1001:1001 /volume1/docker/filmgallery
```

### Q: 如何备份数据？
A: 备份以下目录即可：
- `/volume1/docker/filmgallery/data/film.db` - 数据库
- `/volume1/docker/filmgallery/uploads/` - 所有照片

### Q: 如何升级容器？
```bash
cd /volume1/docker/filmgallery
docker-compose pull
docker-compose up -d
```

---

## 📊 Synology NAS 特别说明

在 Synology DSM 7.x 上部署：

1. **安装 Container Manager**（原 Docker 套件）
2. **创建共享文件夹** `docker` 用于存放容器数据
3. **使用 SSH** 或 **任务计划** 执行 docker-compose
4. **端口映射**：确保防火墙开放 4000 端口

### DSM 文件路径对照
| DSM 界面显示 | 实际路径 |
|-------------|----------|
| `/docker/filmgallery` | `/volume1/docker/filmgallery` |
| `/photos` | `/volume1/photos` |

---

## 🔒 安全建议

1. **使用反向代理**：通过 Nginx/Traefik 添加 HTTPS
2. **限制网络访问**：仅在内网使用，或配置 VPN
3. **定期备份**：设置自动备份任务
4. **更新镜像**：定期拉取最新镜像修复安全漏洞
