# FilmGallery - 一键部署包

这是 FilmGallery NAS Server 的一键部署包，使用预构建的 Docker 镜像，无需编译源码。

## 🚀 快速开始

### 前置条件

- Docker 已安装
- Docker Compose 已安装

### 3 步部署

```bash
# 1. 复制配置文件
cp .env.example .env

# 2. 编辑配置（可选）
nano .env

# 3. 启动服务
docker-compose up -d
```

就这么简单！

## 📁 文件说明

```
release/
├── docker-compose.yml  # Docker Compose 配置
├── .env.example        # 环境变量模板
└── README.md           # 本文件
```

## ⚙️ 配置说明

### 必填配置

编辑 `.env` 文件：

```env
# 数据库存储路径
DATA_PATH=./data

# 图片文件存储路径
UPLOADS_PATH=./uploads
```

### 可选配置

```env
# Docker 镜像版本（推荐生产环境使用固定版本）
IMAGE_VERSION=latest      # 或 1.8.0

# 服务端口
PORT=4000

# 时区
TZ=Asia/Shanghai

# 数据库写入模式（云盘同步时设为 1）
DB_WRITE_THROUGH=0
```

## 📝 常用命令

```bash
# 启动服务
docker-compose up -d

# 停止服务
docker-compose down

# 查看日志
docker-compose logs -f

# 查看状态
docker-compose ps

# 重启服务
docker-compose restart

# 更新到最新版本
docker-compose pull
docker-compose up -d

# 备份数据
cp -r ./data ./data.backup.$(date +%Y%m%d)
```

## ✅ 验证部署

访问以下地址验证服务是否正常：

```
http://localhost:4000/api/discover
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

## 🔧 下一步

1. **配置桌面客户端**
   - 下载 FilmGallery 桌面客户端
   - 设置 → 服务器模式 → 混合模式
   - 服务器地址：`http://<你的IP>:4000`
   - 启用本地 FilmLab 处理

2. **配置移动端**
   - 下载 FilmGallery 移动应用
   - 扫描二维码或手动输入服务器地址

3. **配置 SMB/NFS**（可选，提升性能）
   - 将 NAS 的 `uploads/` 目录共享
   - 在桌面客户端配置 SMB 挂载

## 🐳 Docker Hub

镜像地址：https://hub.docker.com/r/filmgallery/server

拉取镜像：

```bash
# 最新版本
docker pull filmgallery/server:latest

# 指定版本
docker pull filmgallery/server:1.8.0
```

支持平台：
- `linux/amd64` (x86_64)
- `linux/arm64` (ARM64/Apple Silicon)

## 📖 完整文档

- [部署指南](../../DEPLOYMENT.md)
- [快速启动](../../QUICKSTART.md)
- [架构文档](../../docs/hybrid-compute-architecture.md)

## 🆘 故障排查

### 端口已占用

编辑 `.env`，修改 `PORT=8080`，然后重启服务。

### 无法访问

检查防火墙设置，确保端口已开放：

```bash
# Linux
sudo ufw allow 4000

# 检查服务状态
docker-compose ps
docker-compose logs
```

### 数据库锁定

如果使用 OneDrive/Dropbox 同步，设置 `DB_WRITE_THROUGH=1`。

## 📊 监控

查看容器资源使用：

```bash
docker stats filmgallery-server
```

查看健康状态：

```bash
docker inspect --format='{{json .State.Health}}' filmgallery-server | jq .
```

## 🔄 升级

```bash
# 1. 停止服务
docker-compose down

# 2. 备份数据
cp -r ./data ./data.backup.$(date +%Y%m%d)

# 3. 拉取新镜像
docker-compose pull

# 4. 启动新版本
docker-compose up -d

# 5. 查看日志确认
docker-compose logs -f
```

## 💡 提示

- 推荐使用固定版本号（如 `IMAGE_VERSION=1.8.0`）以避免意外更新
- 定期备份 `data/` 目录（包含数据库）
- `uploads/` 目录建议使用 NAS 存储或外部挂载

---

**享受 FilmGallery！** 🎉
