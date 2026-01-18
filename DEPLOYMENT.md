# FilmGallery 混合算力架构 - 部署完整指南

本指南详细说明如何部署 FilmGallery 混合算力架构，包括 NAS 服务器和桌面客户端的配置。

## 📋 目录

- [架构概述](#架构概述)
- [NAS 服务器部署](#nas-服务器部署)
- [桌面客户端配置](#桌面客户端配置)
- [移动端配置](#移动端配置)
- [验证与测试](#验证与测试)
- [故障排查](#故障排查)

---

## 🏗️ 架构概述

FilmGallery 混合算力架构分为三层：

```
┌─────────────────────────────────────────────────────┐
│  Layer 1: NAS Data Server (Docker)                 │
│  - 数据库管理                                       │
│  - 文件存储                                         │
│  - API 服务                                         │
└─────────────────────────────────────────────────────┘
                          ↕
┌─────────────────────────────────────────────────────┐
│  Layer 2: Desktop Client (Electron)                │
│  - 用户界面                                         │
│  - 本地算力处理 (FilmLab)                          │
│  - 结果上传                                         │
└─────────────────────────────────────────────────────┘
                          ↕
┌─────────────────────────────────────────────────────┐
│  Layer 3: Mobile/Watch Apps                        │
│  - 浏览照片                                         │
│  - 元数据编辑                                       │
│  - 直连 NAS                                         │
└─────────────────────────────────────────────────────┘
```

---

## 🖥️ NAS 服务器部署

### 方式一：使用自动化脚本（推荐）

#### Linux / macOS

```bash
cd docker/

# 给脚本添加执行权限
chmod +x deploy.sh

# 一键启动
./deploy.sh start

# 查看状态
./deploy.sh status

# 查看日志
./deploy.sh logs
```

#### Windows (PowerShell)

```powershell
cd docker\

# 一键启动
.\deploy.ps1 start

# 查看状态
.\deploy.ps1 status

# 查看日志
.\deploy.ps1 logs
```

### 方式二：手动部署

```bash
cd docker/

# 1. 复制配置文件
cp .env.example .env

# 2. 编辑配置
nano .env

# 3. 创建数据目录
mkdir -p ./data ./uploads

# 4. 启动服务
docker-compose up -d

# 5. 查看日志
docker-compose logs -f
```

### 配置说明

编辑 `.env` 文件：

```env
# 数据存储路径（必填）
DATA_PATH=./data
UPLOADS_PATH=./uploads

# 服务端口（可选，默认 4000）
PORT=4000

# 时区（可选）
TZ=Asia/Shanghai

# 数据库写入模式（云盘同步时设为 1）
DB_WRITE_THROUGH=0
```

### 验证部署

访问以下地址验证服务是否正常：

```
http://<NAS-IP>:4000/api/discover
```

期望返回：

```json
{
  "name": "filmgallery",
  "version": "1.x.x",
  "mode": "nas",
  "capabilities": {
    "database": true,
    "files": true,
    "compute": false
  }
}
```

---

## 💻 桌面客户端配置

### 1. 构建客户端（开发者）

如果是从源码构建：

```bash
# 安装依赖
cd client/
npm install

# 构建客户端
npm run build

# 打包 Electron
cd ..
npm run electron:build
```

### 2. 配置远程服务器

启动客户端后：

1. **打开设置页面**
   - 点击右上角齿轮图标

2. **切换到「服务器设置」标签**
   
3. **配置远程服务器**
   - 服务器模式: 选择「混合模式（Hybrid）」
   - 服务器地址: 输入 `http://<NAS-IP>:4000`
   - 点击「测试连接」验证

4. **启用本地算力**
   - 勾选「启用本地 FilmLab 处理」
   - 配置文件访问方式：
     - **SMB 挂载**（推荐）: 将 NAS 映射为本地磁盘
     - **HTTP 下载**: 自动下载文件到临时目录

### 3. SMB 挂载配置（推荐）

#### Windows

```powershell
# 映射网络驱动器
net use Z: \\<NAS-IP>\FilmGallery /persistent:yes
```

在客户端设置中：
- SMB 挂载点: `Z:\`
- NAS 路径前缀: `/app/uploads`

#### macOS / Linux

```bash
# macOS
mkdir /Volumes/FilmGallery
mount -t smbfs //<NAS-IP>/FilmGallery /Volumes/FilmGallery

# Linux
mkdir /mnt/filmgallery
mount -t cifs //<NAS-IP>/FilmGallery /mnt/filmgallery
```

### 4. 验证客户端连接

在客户端界面：
- 查看设置页面，连接状态应显示「已连接 ✓」
- 尝试上传一张照片
- 使用 FilmLab 处理照片，确认本地处理功能正常

---

## 📱 移动端配置

### iOS / Android App

1. **安装应用**
   - 从 App Store / Google Play 下载 FilmGallery

2. **配置服务器**
   - 打开设置 → 服务器设置
   - 扫描桌面端生成的二维码
   - 或手动输入: `http://<NAS-IP>:4000`

3. **验证连接**
   - 返回主页，应能看到相册列表
   - 尝试浏览照片

### Watch App

1. **配对手机**
   - 确保 Watch 已与 iPhone 配对
   - Watch 会自动同步服务器配置

2. **验证**
   - 打开 Watch 上的 FilmGallery
   - 应能浏览相册和照片

---

## ✅ 验证与测试

### 完整流程测试

1. **上传照片**（桌面客户端）
   - 拖拽照片到相册
   - 确认上传成功

2. **FilmLab 处理**（桌面客户端）
   - 打开照片 → FilmLab
   - 调整参数
   - 点击「处理」
   - 确认本地 GPU 处理成功
   - 结果自动上传到 NAS

3. **移动端同步**（手机/手表）
   - 打开移动端应用
   - 刷新相册
   - 确认新照片和处理结果已同步

4. **多设备协同**
   - 桌面端上传 → 移动端查看
   - 移动端编辑元数据 → 桌面端刷新
   - 手表浏览 → 确认实时性

---

## 🔧 故障排查

### NAS 服务器问题

#### 无法访问服务

```bash
# 检查容器状态
docker ps

# 查看日志
docker-compose logs --tail=50

# 检查端口
netstat -tlnp | grep 4000
```

#### 数据库锁定

如果使用 OneDrive/Dropbox 同步：

```env
# 修改 .env
DB_WRITE_THROUGH=1
```

然后重启服务：

```bash
docker-compose restart
```

### 桌面客户端问题

#### 无法连接服务器

1. **检查网络连通性**
   ```bash
   ping <NAS-IP>
   curl http://<NAS-IP>:4000/api/discover
   ```

2. **检查防火墙**
   - 确保 4000 端口未被阻止

3. **查看客户端日志**
   - Windows: `%APPDATA%\FilmGallery\logs\`
   - macOS: `~/Library/Logs/FilmGallery/`
   - Linux: `~/.config/FilmGallery/logs/`

#### FilmLab 处理失败

1. **检查本地算力是否启用**
   - 设置 → 服务器设置 → 本地 FilmLab 处理

2. **验证 GPU 驱动**
   - NVIDIA: 确保 CUDA 已安装
   - 查看控制台输出

3. **文件访问失败**
   - 检查 SMB 挂载是否正常
   - 尝试切换到 HTTP 下载模式

### 移动端问题

#### 无法发现服务器

1. **确认在同一网络**
   - 手机和 NAS 需在同一局域网

2. **手动输入地址**
   - 使用 NAS 的 IP 地址而非域名

3. **检查服务器端口**
   - 确认 4000 端口开放

---

## 📊 监控与维护

### 日常检查

```bash
# 查看服务状态
./deploy.sh status

# 查看最近日志
./deploy.sh logs

# 检查磁盘空间
df -h ./data ./uploads
```

### 定期备份

```bash
# 使用自动化脚本
./deploy.sh backup

# 或手动备份
cp ./data/film.db ./data/film.db.backup.$(date +%Y%m%d)
```

### 更新服务

```bash
# 拉取最新镜像
./deploy.sh update

# 或手动更新
docker-compose pull
docker-compose up -d
```

---

## 🔐 安全建议

### 内网部署（推荐）

- 仅在受信任的局域网内使用
- 无需额外安全配置

### 外网访问（可选）

如需通过互联网访问：

1. **使用反向代理**
   - Nginx / Traefik / Caddy
   
2. **启用 HTTPS**
   ```nginx
   server {
       listen 443 ssl;
       server_name filmgallery.yourdomain.com;
       
       ssl_certificate /path/to/cert.pem;
       ssl_certificate_key /path/to/key.pem;
       
       location / {
           proxy_pass http://localhost:4000;
       }
   }
   ```

3. **添加认证**
   - 使用 OAuth / Basic Auth
   - 考虑集成现有认证系统

---

## 📝 快速参考

### 常用命令

```bash
# NAS 服务器
./deploy.sh start       # 启动
./deploy.sh stop        # 停止
./deploy.sh restart     # 重启
./deploy.sh status      # 状态
./deploy.sh logs        # 日志
./deploy.sh backup      # 备份

# Docker 原生命令
docker-compose ps       # 查看容器
docker-compose logs -f  # 实时日志
docker-compose down     # 停止并删除容器
```

### 默认端口

- NAS Server: `4000`
- Electron Dev: `3000`

### 配置文件位置

- NAS: `docker/.env`
- Desktop: 设置页面 UI 配置
- Mobile: 应用内设置

---

## 🆘 获取帮助

- **完整架构文档**: [docs/hybrid-compute-architecture.md](docs/hybrid-compute-architecture.md)
- **Docker 部署**: [docker/README.md](docker/README.md)
- **问题反馈**: GitHub Issues

---

**部署完成！开始享受 FilmGallery 吧！** 🎉
