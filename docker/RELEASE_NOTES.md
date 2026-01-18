# FilmGallery Docker NAS Server v1.0.0

> ⚠️ **外网访问提示**
> 
> FilmGallery 默认仅支持**内网访问**。如需从外网（如手机4G/5G网络）访问 NAS，你需要：
> 
> **方案一：公网 IP + 端口转发**
> - 确保你的宽带有公网 IP（非 NAT）
> - 在路由器设置端口转发：外部端口 → NAS:4000
> - 强烈建议配置 HTTPS 和反向代理
> 
> **方案二：内网穿透服务**
> - [frp](https://github.com/fatedier/frp) - 开源自建方案
> - [Tailscale](https://tailscale.com) - 零配置 VPN（推荐）
> - [ZeroTier](https://www.zerotier.com) - P2P 组网
> - [花生壳](https://hsk.oray.com) / [cpolar](https://www.cpolar.com) - 国内服务
> - 群晖 QuickConnect / 威联通 myQNAPcloud
> 
> **安全建议**：外网访问时务必启用 HTTPS，避免明文传输。

---

## 📦 下载

- **Docker 镜像**: `filmgallery-nas-latest.tar` (113 MB)

## 🚀 快速安装

### 1. 加载镜像
```bash
docker load -i filmgallery-nas-latest.tar
```

### 2. 运行容器
```bash
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

### 3. 验证
```bash
curl http://localhost:4000/api/discover
```

## ✨ 功能特性

- ✅ 远程数据存储与同步
- ✅ 混合模式支持（NAS 存储 + PC GPU 处理）
- ✅ 移动端/手表连接支持
- ✅ 文件系统浏览 API
- ✅ 多平台支持 (amd64)

## 📖 详细文档

请参阅 [README.md](https://github.com/your-repo/filmgallery/blob/main/docker/README.md) 获取：
- 群晖 Synology NAS 安装指南
- 威联通 QNAP NAS 安装指南
- Windows Docker Desktop 安装指南
- 通用 Linux 服务器安装指南

## ⚙️ 环境变量

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `SERVER_MODE` | `nas` | 服务器模式 |
| `DATA_ROOT` | `/app/data` | 数据存储目录 |
| `ALLOW_ALL_MOUNTED_PATHS` | `false` | 允许浏览 /mnt 下所有目录 |
| `TZ` | `Asia/Shanghai` | 时区 |

## 🔄 从旧版本升级

```bash
# 停止并删除旧容器
docker stop filmgallery-server
docker rm filmgallery-server

# 加载新镜像
docker load -i filmgallery-nas-latest.tar

# 重新启动（数据保留）
docker-compose up -d
```
