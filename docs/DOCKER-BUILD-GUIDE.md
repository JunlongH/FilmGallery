# FilmGallery Docker 镜像构建和发布指南

本指南面向项目维护者，说明如何构建 Docker 镜像并发布到 Docker Hub。

---

## 🎯 目标

将 FilmGallery 打包成 Docker 镜像并发布到 Docker Hub，用户无需源码和编译，可直接拉取镜像部署。

---

## 📋 前置准备

### 1. Docker Hub 账号

- 注册账号：https://hub.docker.com/
- 创建仓库：`filmgallery/server`（公开或私有）

### 2. 本地环境

```bash
# 检查 Docker 版本
docker --version

# 检查 Docker buildx（多平台构建）
docker buildx version

# 如果没有 buildx，安装：
docker buildx create --use
```

---

## 🏗️ 步骤 1：构建并发布镜像

### Linux / macOS

```bash
cd docker/

# 赋予执行权限
chmod +x build-image.sh

# 构建并推送镜像（自动检测版本）
./build-image.sh

# 或指定版本号
./build-image.sh 1.8.0
```

### Windows

```powershell
cd docker\

# 构建并推送镜像（自动检测版本）
.\build-image.ps1

# 或指定版本号
.\build-image.ps1 -Version 1.8.0
```

### 脚本做了什么？

1. ✅ 从 `server/package.json` 读取版本号
2. ✅ 登录 Docker Hub
3. ✅ 使用 buildx 构建多平台镜像：
   - `linux/amd64` (x86_64)
   - `linux/arm64` (ARM64/Apple Silicon)
4. ✅ 推送到 Docker Hub：
   - `filmgallery/server:1.8.0`
   - `filmgallery/server:latest`

---

## 📦 步骤 2：创建发布包

### Linux / macOS

```bash
cd docker/

# 赋予执行权限
chmod +x create-release-package.sh

# 创建发布包
./create-release-package.sh
```

### Windows

```powershell
cd docker\

# 创建发布包
.\create-release-package.ps1
```

### 生成的文件

```
filmgallery-deploy-20260118.zip (或 .tar.gz)
├── docker-compose.yml          # 使用 Docker Hub 镜像
├── .env.example                # 配置模板
├── README.md                   # 部署说明
├── deploy.sh / deploy.ps1      # 可选的部署脚本
└── docs/
    ├── QUICKSTART.md           # 快速启动
    └── DEPLOYMENT.md           # 完整部署指南
```

---

## 🚀 步骤 3：发布到 GitHub Releases

### 方式一：通过 GitHub 网页

1. 访问 GitHub 仓库
2. 点击「Releases」→「Draft a new release」
3. 填写信息：
   - Tag: `v1.8.0`
   - Title: `FilmGallery v1.8.0`
   - Description: 发布说明
4. 上传文件：
   - `filmgallery-deploy-20260118.zip`
5. 点击「Publish release」

### 方式二：使用 GitHub CLI

```bash
# 安装 gh（如果没有）
# macOS: brew install gh
# Windows: choco install gh

# 登录
gh auth login

# 创建 Release 并上传
gh release create v1.8.0 \
  docker/filmgallery-deploy-*.zip \
  --title "FilmGallery v1.8.0" \
  --notes "发布说明..."
```

---

## 📝 发布说明模板

```markdown
# FilmGallery v1.8.0

## 新功能

- ✨ 混合算力架构支持
- 🚀 一键 Docker 部署
- 📱 移动端直连 NAS

## 改进

- ⚡ 性能优化
- 🐛 Bug 修复

## 快速部署

### 使用 Docker（推荐）

1. 下载 `filmgallery-deploy-20260118.zip`
2. 解压并进入目录
3. 复制配置：`cp .env.example .env`
4. 启动服务：`docker-compose up -d`

Docker 会自动从 Docker Hub 拉取镜像，无需编译！

### Docker Hub

```bash
docker pull filmgallery/server:1.8.0
```

支持平台：
- linux/amd64 (x86_64)
- linux/arm64 (ARM64/Apple Silicon)

## 文档

- [快速启动](docs/QUICKSTART.md)
- [完整部署指南](docs/DEPLOYMENT.md)
- [架构文档](docs/hybrid-compute-architecture.md)

## 系统要求

- Docker 20.10+
- Docker Compose 1.29+
- 2GB+ RAM
- 10GB+ 存储空间
```

---

## ✅ 验证发布

### 1. 测试镜像拉取

```bash
# 拉取镜像
docker pull filmgallery/server:1.8.0

# 查看镜像信息
docker images filmgallery/server

# 测试运行
docker run -d \
  -p 4000:4000 \
  -e SERVER_MODE=nas \
  filmgallery/server:1.8.0

# 验证
curl http://localhost:4000/api/discover
```

### 2. 测试部署包

```bash
# 解压
unzip filmgallery-deploy-20260118.zip
cd filmgallery-deploy-20260118/

# 部署
cp .env.example .env
docker-compose up -d

# 验证
curl http://localhost:4000/api/discover
```

---

## 🔄 更新流程

当需要发布新版本时：

```bash
# 1. 更新版本号
# 编辑 server/package.json，修改 version

# 2. 提交代码
git add .
git commit -m "chore: Bump version to 1.9.0"
git push

# 3. 构建并推送镜像
cd docker/
./build-image.sh 1.9.0

# 4. 创建发布包
./create-release-package.sh

# 5. 发布到 GitHub
gh release create v1.9.0 \
  filmgallery-deploy-*.zip \
  --title "FilmGallery v1.9.0" \
  --notes "..."
```

---

## 📊 Docker Hub 统计

登录 https://hub.docker.com/r/filmgallery/server 查看：
- 下载次数
- 镜像大小
- 支持的平台
- 最新版本

---

## 🆘 故障排查

### 构建失败

```bash
# 清理缓存
docker buildx prune

# 重新创建 builder
docker buildx create --name filmgallery-builder --use

# 重新构建
./build-image.sh 1.8.0
```

### 推送失败

```bash
# 重新登录
docker logout
docker login

# 检查仓库权限
# 确保你有推送权限
```

### 多平台构建问题

```bash
# 检查 QEMU（用于 ARM 模拟）
docker run --rm --privileged multiarch/qemu-user-static --reset -p yes

# 检查 buildx 支持的平台
docker buildx ls
```

---

## 💡 最佳实践

1. **语义化版本**
   - 主版本：不兼容的 API 修改
   - 次版本：向后兼容的功能新增
   - 修订号：向后兼容的问题修正

2. **标签策略**
   - 始终推送版本号标签：`1.8.0`
   - 同时更新 `latest` 标签
   - 考虑推送主版本标签：`1`、`1.8`

3. **发布检查清单**
   - [ ] 更新 CHANGELOG
   - [ ] 更新文档
   - [ ] 运行测试
   - [ ] 构建镜像
   - [ ] 测试部署
   - [ ] 发布 Release

---

## 🎉 完成！

现在用户可以：

1. 从 Docker Hub 直接拉取镜像
2. 从 GitHub Releases 下载部署包
3. 无需源码，一键部署！

---

**祝发布顺利！** 🚀
