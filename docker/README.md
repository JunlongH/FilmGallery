# FilmGallery Docker 部署指南

部署 FilmGallery 服务器到 NAS，支持远程模式和混合模式。

---

## ⚠️ 外网访问须知

FilmGallery 默认仅支持**内网访问**（同一 WiFi/局域网）。如需从外网访问（如手机 4G/5G、外出时访问家中 NAS），你需要配置以下方案之一：

### 方案一：公网 IP + 端口转发

如果你的宽带有**公网 IP**（非运营商 NAT）：

1. 登录路由器管理页面
2. 设置端口转发：外部端口 `4000` → NAS 内网 IP:4000
3. 通过 `http://你的公网IP:4000` 访问

⚠️ **安全警告**：直接暴露端口到公网有安全风险，强烈建议：
- 使用反向代理（Nginx）+ HTTPS
- 修改默认端口
- 配置访问认证

### 方案二：内网穿透服务（推荐）

无需公网 IP，通过第三方服务穿透 NAT：

| 服务 | 类型 | 特点 |
|------|------|------|
| [Tailscale](https://tailscale.com) | VPN 组网 | 零配置，推荐新手 |
| [ZeroTier](https://www.zerotier.com) | P2P 组网 | 免费，需简单配置 |
| [frp](https://github.com/fatedier/frp) | 端口转发 | 开源自建，需有服务器 |
| [Cloudflare Tunnel](https://www.cloudflare.com/products/tunnel/) | 隧道 | 免费，支持 HTTPS |
| [花生壳](https://hsk.oray.com) | 国内服务 | 中文界面，有免费额度 |
| [cpolar](https://www.cpolar.com) | 国内服务 | 简单易用 |

### 方案三：NAS 官方远程访问

- **群晖**：QuickConnect（控制面板 → QuickConnect）
- **威联通**：myQNAPcloud（控制台 → myQNAPcloud）

### Tailscale 快速配置示例

1. 在 NAS 上安装 Tailscale 套件
2. 在手机上安装 Tailscale App
3. 两端登录同一账号
4. 使用 Tailscale 分配的 IP 访问：`http://100.x.x.x:4000`

---

## 🎯 模式说明

| 模式 | 服务器位置 | 数据存储 | FilmLab 处理 | 适用场景 |
|------|-----------|---------|-------------|---------|
| **本地模式** | 本机 Electron | 本机 | 本机 GPU | 单机使用 |
| **远程模式** | NAS Docker | NAS | ❌ 不支持 | 仅数据同步，移动端访问 |
| **混合模式** | NAS Docker | NAS | PC 本地 GPU | 多设备 + 需要 FilmLab |

### 架构图

```
┌─────────────────────────────────────────────────────────────────┐
│                        混合模式                                  │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│   ┌──────────┐         ┌──────────────┐         ┌──────────┐   │
│   │  手机/   │ ◄─────► │  NAS Docker  │ ◄─────► │  桌面端  │   │
│   │  手表    │         │  (数据存储)   │         │ (GPU算力)│   │
│   └──────────┘         └──────────────┘         └──────────┘   │
│                               ▲                       │         │
│                               │     FilmLab 渲染      │         │
│                               └───────────────────────┘         │
│                                                                  │
│   特点: NAS 存储数据，PC 提供 GPU 算力进行 FilmLab 处理         │
└─────────────────────────────────────────────────────────────────┘
```

---

## 📥 下载镜像

从 GitHub Releases 下载 Docker 镜像：

**下载地址**: [GitHub Releases](https://github.com/your-repo/filmgallery/releases)

下载文件：`filmgallery-nas-latest.tar`

---

## 📁 存储结构

FilmGallery 会在你指定的目录下创建 `FilmGallery/` 子目录：

```
/volume1/photos/              ← NAS 本地目录
├── FilmGallery/              ← FilmGallery 数据
│   ├── data/                 ← SQLite 数据库 (film.db)
│   └── uploads/              ← 照片存储
├── 2024-vacation/            ← 你的其他照片 (可通过导入访问)
└── scans/                    ← 扫描仪输出 (可通过导入访问)
```

---

## 🔧 群晖 Synology NAS 安装

### 方法一：通过 SSH 命令行

#### 1. 启用 SSH 并连接

1. 群晖控制面板 → 终端机和 SNMP → 启用 SSH
2. 使用 SSH 客户端连接：
   ```bash
   ssh admin@<NAS-IP>
   ```

#### 2. 上传并加载镜像

```bash
# 进入 docker 目录
cd /volume1/docker

# 上传 filmgallery-nas-latest.tar 文件到此目录
# (可使用 File Station 或 SCP)

# 加载镜像
sudo docker load -i filmgallery-nas-latest.tar
```

#### 3. 创建目录结构

```bash
# 创建存储目录
mkdir -p /volume1/photos/FilmGallery/data
mkdir -p /volume1/photos/FilmGallery/uploads

# 设置权限
chmod -R 755 /volume1/photos/FilmGallery
```

#### 4. 创建 docker-compose.yml

```bash
cd /volume1/docker
mkdir filmgallery
cd filmgallery
nano docker-compose.yml
```

粘贴以下内容：

```yaml
version: '3.8'

services:
  filmgallery:
    image: filmgallery-nas:latest
    container_name: filmgallery-server
    restart: unless-stopped
    
    ports:
      - "4000:4000"
    
    environment:
      - NODE_ENV=production
      - SERVER_MODE=nas
      - PORT=4000
      - TZ=Asia/Shanghai
      - DATA_ROOT=/mnt/photos/FilmGallery
      - ALLOW_ALL_MOUNTED_PATHS=true
    
    volumes:
      - /volume1/photos:/mnt/photos
      # 可选：添加其他目录
      # - /volume1/scans:/mnt/scans:ro
    
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:4000/api/health"]
      interval: 30s
      timeout: 10s
      retries: 3
```

#### 5. 启动服务

```bash
sudo docker-compose up -d
```

### 方法二：通过群晖 Docker 套件 (GUI)

#### 1. 上传镜像文件

1. 打开 **File Station**
2. 进入 `/docker` 目录
3. 上传 `filmgallery-nas-latest.tar`

#### 2. 导入镜像

1. 打开 **Docker** 套件
2. 点击 **映像** → **新增** → **从文件添加**
3. 选择上传的 `filmgallery-nas-latest.tar`

#### 3. 创建容器

1. 在映像列表中找到 `filmgallery-nas`
2. 点击 **启动**
3. 设置容器名称：`filmgallery-server`

#### 4. 配置高级设置

**端口设置**：
| 本地端口 | 容器端口 |
|---------|---------|
| 4000 | 4000 |

**卷设置**：
| 文件/文件夹 | 挂载路径 | 权限 |
|------------|---------|------|
| /volume1/photos | /mnt/photos | 读写 |

**环境变量**：
| 变量 | 值 |
|------|-----|
| NODE_ENV | production |
| SERVER_MODE | nas |
| PORT | 4000 |
| TZ | Asia/Shanghai |
| DATA_ROOT | /mnt/photos/FilmGallery |
| ALLOW_ALL_MOUNTED_PATHS | true |

#### 5. 启动容器

点击 **应用** 启动容器。

---

## 🔧 威联通 QNAP NAS 安装

### 1. 安装 Container Station

在 App Center 中安装 **Container Station**。

### 2. 上传镜像

1. 打开 **File Station**
2. 进入共享文件夹（如 `/share/Container`）
3. 上传 `filmgallery-nas-latest.tar`

### 3. 导入镜像

1. 打开 **Container Station**
2. 点击 **映像** → **导入** → **从本地文件导入**
3. 选择上传的 tar 文件

### 4. 创建容器

1. 选择 `filmgallery-nas:latest` 镜像
2. 点击 **创建**
3. 配置以下设置：

**网络**：
- 端口映射：`4000:4000`

**共享文件夹**：
| 主机路径 | 容器路径 |
|---------|---------|
| /share/photos | /mnt/photos |

**环境变量**：
```
NODE_ENV=production
SERVER_MODE=nas
PORT=4000
TZ=Asia/Shanghai
DATA_ROOT=/mnt/photos/FilmGallery
ALLOW_ALL_MOUNTED_PATHS=true
```

### 5. 创建存储目录

```bash
mkdir -p /share/photos/FilmGallery/data
mkdir -p /share/photos/FilmGallery/uploads
```

### 6. 启动容器

---

## 🔧 华硕 ASUS NAS 安装

### 1. 准备工作

确保已安装 Docker 应用。

### 2. 上传镜像

通过 File Manager 上传 `filmgallery-nas-latest.tar` 到 NAS。

### 3. SSH 安装

```bash
# 连接 SSH
ssh admin@<NAS-IP>

# 加载镜像
docker load -i /path/to/filmgallery-nas-latest.tar

# 创建目录
mkdir -p /volume1/photos/FilmGallery/data
mkdir -p /volume1/photos/FilmGallery/uploads

# 运行容器
docker run -d \
  --name filmgallery-server \
  --restart unless-stopped \
  -p 4000:4000 \
  -e NODE_ENV=production \
  -e SERVER_MODE=nas \
  -e TZ=Asia/Shanghai \
  -e DATA_ROOT=/mnt/photos/FilmGallery \
  -e ALLOW_ALL_MOUNTED_PATHS=true \
  -v /volume1/photos:/mnt/photos \
  filmgallery-nas:latest
```

---

## 🔧 通用 Linux 服务器安装

### 1. 加载镜像

```bash
# 加载镜像
docker load -i filmgallery-nas-latest.tar

# 验证
docker images | grep filmgallery
```

### 2. 创建目录

```bash
mkdir -p /data/photos/FilmGallery/data
mkdir -p /data/photos/FilmGallery/uploads
chmod -R 755 /data/photos/FilmGallery
```

### 3. 创建 docker-compose.yml

```yaml
version: '3.8'

services:
  filmgallery:
    image: filmgallery-nas:latest
    container_name: filmgallery-server
    restart: unless-stopped
    
    ports:
      - "4000:4000"
    
    environment:
      - NODE_ENV=production
      - SERVER_MODE=nas
      - PORT=4000
      - TZ=Asia/Shanghai
      - DATA_ROOT=/mnt/photos/FilmGallery
      - ALLOW_ALL_MOUNTED_PATHS=true
    
    volumes:
      - /data/photos:/mnt/photos
    
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:4000/api/health"]
      interval: 30s
      timeout: 10s
      retries: 3
```

### 4. 启动

```bash
docker-compose up -d
```

---

## 🔧 Windows Docker Desktop 安装

### 1. 加载镜像

```powershell
docker load -i filmgallery-nas-latest.tar
```

### 2. 创建目录

```powershell
mkdir D:\Photos\FilmGallery\data
mkdir D:\Photos\FilmGallery\uploads
```

### 3. 创建 docker-compose.yml

在 `D:\Photos\FilmGallery\` 下创建：

```yaml
version: '3.8'

services:
  filmgallery:
    image: filmgallery-nas:latest
    container_name: filmgallery-server
    restart: unless-stopped
    
    ports:
      - "4000:4000"
    
    environment:
      - NODE_ENV=production
      - SERVER_MODE=nas
      - PORT=4000
      - TZ=Asia/Shanghai
      - DATA_ROOT=/mnt/storage/FilmGallery
      - ALLOW_ALL_MOUNTED_PATHS=true
    
    volumes:
      - D:\Photos:/mnt/storage
```

### 4. 启动

```powershell
cd D:\Photos\FilmGallery
docker-compose up -d
```

---

## ✅ 验证安装

```bash
# 检查容器状态
docker ps | grep filmgallery

# 测试 API
curl http://localhost:4000/api/discover
```

预期返回：
```json
{
  "app": "FilmGallery",
  "version": "1.9.1",
  "serverMode": "nas",
  "capabilities": {
    "database": true,
    "files": true,
    "compute": false
  }
}
```

---

## 💻 客户端配置

### 桌面端

1. 打开 FilmGallery
2. 进入 **设置 → 服务器连接**
3. 选择 **混合模式**（推荐）或 **远程模式**
4. 输入：`http://<NAS-IP>:4000`
5. 测试连接并保存

### 移动端 / 手表

1. 打开 App 设置
2. 输入服务器地址：`http://<NAS-IP>:4000`

---

## 📝 环境变量参考

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `PORT` | `4000` | 服务端口 |
| `SERVER_MODE` | `nas` | 服务器模式 |
| `DATA_ROOT` | `/app/data` | 数据根目录 |
| `TZ` | `Asia/Shanghai` | 时区 |
| `ALLOW_ALL_MOUNTED_PATHS` | `false` | 允许访问所有 /mnt 目录 |
| `ALLOWED_BROWSE_PATHS` | - | 白名单目录 (逗号分隔) |

---

## 🔧 常用命令

```bash
# 查看日志
docker logs -f filmgallery-server

# 重启
docker restart filmgallery-server

# 停止
docker stop filmgallery-server

# 删除容器（数据保留）
docker rm filmgallery-server

# 更新：先删除容器，加载新镜像，再启动
docker stop filmgallery-server
docker rm filmgallery-server
docker load -i filmgallery-nas-new.tar
docker-compose up -d
```

---

## 🆘 故障排查

### 容器无法启动

```bash
docker logs filmgallery-server
```

### 权限问题

```bash
chmod -R 755 /volume1/photos/FilmGallery
chown -R 1000:1000 /volume1/photos/FilmGallery
```

### 端口被占用

修改 docker-compose.yml 中的端口映射：
```yaml
ports:
  - "4001:4000"
```

### 防火墙问题

确保 NAS 防火墙开放 4000 端口。
