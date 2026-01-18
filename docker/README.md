# FilmGallery NAS Server - Docker 部署指南

一键部署 FilmGallery 数据服务器到 NAS 或任何 Docker 主机。

## 🎯 功能说明

NAS 模式的服务器提供：
- ✅ 数据库管理（相册、胶片、设备信息）
- ✅ 文件存储与访问
- ✅ 移动端/手表应用同步
- ❌ FilmLab 图像处理（需要本地 PC 算力）

## 📦 快速开始

### 1. 准备配置文件

```bash
# 复制示例配置
cp .env.example .env

# 编辑配置
nano .env
```

主要配置项：
```env
DATA_PATH=./data          # 数据库存储路径
UPLOADS_PATH=./uploads    # 图片文件存储路径
PORT=4000                 # 服务端口
```

### 2. 启动服务

```bash
# 启动服务（后台运行）
docker-compose up -d

# 查看日志
docker-compose logs -f

# 停止服务
docker-compose down
```

### 3. 验证部署

访问 `http://<NAS-IP>:4000/api/discover` 应返回：

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

## 🔧 客户端配置

### 桌面客户端

1. 打开设置 → 服务器模式
2. 选择「远程服务器」
3. 输入 NAS 地址：`http://<NAS-IP>:4000`
4. 点击「测试连接」
5. 启用「本地算力处理」以使用 PC 进行 FilmLab 处理

### 移动端 / 手表

1. 打开设置 → 服务器设置
2. 扫描二维码或手动输入服务器地址
3. 应用会自动发现 NAS 服务器

## 📂 数据持久化

### 推荐目录结构

```
/volume1/docker/filmgallery/
├── docker-compose.yml
├── .env
├── data/
│   └── film.db           # SQLite 数据库
└── uploads/
    ├── thumbnails/       # 缩略图
    ├── processed/        # 处理后的图片
    └── raw/              # 原始文件
```

### 数据备份

```bash
# 备份数据库
docker-compose exec filmgallery-server cp /app/data/film.db /app/data/film.db.backup

# 或直接复制宿主机文件
cp ./data/film.db ./data/film.db.backup.$(date +%Y%m%d)
```

## 🔐 安全建议

### 内网访问

默认配置仅适用于内网环境。如需外网访问，请：

1. 使用反向代理（如 Nginx）
2. 配置 HTTPS
3. 添加认证层

### Nginx 反向代理示例

```nginx
server {
    listen 443 ssl;
    server_name filmgallery.yourdomain.com;
    
    ssl_certificate /path/to/cert.pem;
    ssl_certificate_key /path/to/key.pem;
    
    location / {
        proxy_pass http://localhost:4000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```

## 🐳 Docker Compose 选项

### 自定义端口

```yaml
ports:
  - "8080:4000"  # 改为 8080 端口
```

### 限制资源使用

```yaml
services:
  filmgallery-server:
    # ... 其他配置
    deploy:
      resources:
        limits:
          cpus: '2'
          memory: 1G
```

### 使用外部网络

```yaml
networks:
  default:
    external:
      name: your-network
```

## 🔍 故障排查

### 服务无法启动

```bash
# 查看详细日志
docker-compose logs --tail=100

# 检查端口占用
netstat -tlnp | grep 4000
```

### 数据库锁定

如果使用云同步（OneDrive/Dropbox），设置：

```env
DB_WRITE_THROUGH=1
```

### 权限问题

```bash
# 确保目录权限正确
chmod -R 755 ./data ./uploads
chown -R 1000:1000 ./data ./uploads
```

## 📊 监控

### 健康检查

Docker 内置健康检查，可通过以下命令查看：

```bash
docker inspect --format='{{json .State.Health}}' filmgallery-server
```

### 日志聚合

日志自动限制大小，可集成到日志系统：

```yaml
logging:
  driver: "syslog"
  options:
    syslog-address: "udp://192.168.1.1:514"
    tag: "filmgallery"
```

## 🔄 更新升级

```bash
# 拉取最新镜像
docker-compose pull

# 重新创建容器
docker-compose up -d

# 清理旧镜像
docker image prune -f
```

## 📝 环境变量参考

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `PORT` | `4000` | 服务端口 |
| `DATA_PATH` | `./data` | 数据库路径 |
| `UPLOADS_PATH` | `./uploads` | 上传文件路径 |
| `TZ` | `Asia/Shanghai` | 时区 |
| `DB_WRITE_THROUGH` | `0` | 数据库写入模式 |
| `NODE_ENV` | `production` | Node 环境 |
| `SERVER_MODE` | `nas` | 服务器模式 |

## 🆘 获取帮助

- 查看完整文档：[docs/hybrid-compute-architecture.md](../docs/hybrid-compute-architecture.md)
- 提交问题：GitHub Issues
