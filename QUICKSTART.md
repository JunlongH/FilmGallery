# 🚀 FilmGallery 混合算力架构 - 快速启动

5 分钟快速部署指南（使用预构建镜像）

---

## 方式一：使用预构建镜像（最快，推荐）

### 下载部署包

1. 从 [GitHub Releases](https://github.com/YourRepo/FilmGallery/releases) 下载最新的部署包
2. 解压 `filmgallery-deploy-YYYYMMDD.zip`

### 快速部署

```bash
# 进入解压目录
cd filmgallery-deploy-*/

# 复制配置文件
cp .env.example .env

# 启动服务（自动拉取镜像）
docker-compose up -d

# 等待启动完成后访问
# http://localhost:4000/api/discover
```

就这么简单！Docker 会自动从 Docker Hub 拉取预构建的镜像。

---

## 方式二：从源码部署

### Windows 用户

```powershell
# 1. 进入 docker 目录
cd docker\

# 2. 一键启动
.\deploy.ps1 start

# 3. 等待启动完成后，访问测试
# 浏览器打开: http://localhost:4000/api/discover
```

### Linux / macOS 用户

```bash
# 1. 进入 docker 目录
cd docker/

# 2. 给脚本添加执行权限（首次需要）
chmod +x deploy.sh

# 3. 一键启动
./deploy.sh start

# 4. 等待启动完成后，访问测试
# 浏览器打开: http://localhost:4000/api/discover
```

### 期望输出

访问 `http://localhost:4000/api/discover` 应该看到：

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

✅ 如果看到以上输出，NAS 服务器部署成功！

---

## 第二步：配置桌面客户端

### 如果已有客户端安装包

1. **启动 FilmGallery**
2. **打开设置**（右上角齿轮图标）
3. **切换到「服务器设置」**
4. **配置如下：**
   - 服务器模式: `混合模式（Hybrid）`
   - 服务器地址: `http://localhost:4000`（或 NAS 的 IP）
   - 点击「测试连接」
5. **启用本地算力**
   - 勾选「启用本地 FilmLab 处理」

### 如果需要从源码构建

```bash
# 1. 安装依赖
npm install

# 2. 启动开发模式（用于测试）
npm run dev

# 或构建生产版本
npm run build
npm run electron:build
```

---

## 第三步：验证部署

### 测试清单

- [ ] NAS 服务器健康检查通过
- [ ] 桌面客户端连接成功
- [ ] 上传一张测试照片
- [ ] FilmLab 本地处理功能正常
- [ ] 移动端能访问照片（如有）

### 快速测试脚本

在 NAS 服务器主机上运行：

```bash
# 检查服务状态
curl -s http://localhost:4000/api/health | jq .

# 检查服务能力
curl -s http://localhost:4000/api/discover | jq .

# 查看日志
cd docker/
docker-compose logs --tail=20
```

---

## 常见问题

### Q: 端口 4000 已被占用怎么办？

编辑 `docker/.env`：

```env
PORT=8080  # 改为其他端口
```

然后重启：

```bash
./deploy.sh restart
```

### Q: 如何查看服务日志？

```bash
cd docker/
./deploy.sh logs
```

### Q: 如何停止服务？

```bash
cd docker/
./deploy.sh stop
```

### Q: 如何更新到最新版本？

```bash
cd docker/
./deploy.sh update
```

---

## 下一步

- 📖 阅读[完整部署指南](DEPLOYMENT.md)
- 🏗️ 查看[架构文档](docs/hybrid-compute-architecture.md)
- 📱 配置移动端应用
- 🔧 配置 SMB 文件挂载（可选，提升性能）

---

## 获取帮助

- 查看日志: `./deploy.sh logs`
- 检查状态: `./deploy.sh status`
- GitHub Issues: 提交问题和建议

---

**祝使用愉快！** 🎉
