# 7. 部署和运维

## 7.1 部署模式

### 7.1.1 本地模式 (Standalone)

单机部署，所有数据和处理都在本地 PC 上。

**特点**：
- ✅ 完整功能（FilmLab 处理、RAW 解析）
- ✅ 无网络依赖
- ✅ 最快性能（本地 SSD）
- ❌ 仅限单设备

**部署步骤**：

1. **安装依赖和构建**

```bash
npm install
cd server && npm run init-db
cd ..
```

2. **运行服务器**

```bash
cd server
npm start
```

3. **启动桌面应用**

```bash
npm run dev    # 开发模式

# 或生产构建
npm run dist   # 生成 Windows 安装程序
```

**数据存储**：
```
Windows: %APPDATA%/FilmGallery/ 或 ./data/
macOS:   ~/Library/Application Support/FilmGallery/ 或 ./data/
Linux:   ~/.config/FilmGallery/ 或 ./data/
```

### 7.1.2 NAS 模式 (Docker)

在 NAS 上部署 Docker 容器，提供集中式数据存储。

**特点**：
- ✅ 集中存储，多设备访问
- ✅ 自动备份（NAS 级别）
- ❌ 计算能力有限（禁用 GPU 处理）
- ❌ 需要网络连接

**支持的 NAS**：
- 群晖 (Synology)
- 威联通 (QNAP)
- 其他 Docker 支持的 NAS

**部署步骤**：

1. **在 NAS 上安装 Docker**

根据 NAS 型号安装 Docker。

2. **上传 Docker 镜像**

```bash
cd docker
docker build -t filmgallery:latest .
docker tag filmgallery:latest yournas.com:5000/filmgallery:latest
docker push yournas.com:5000/filmgallery:latest
```

3. **运行 Docker 容器**

```bash
docker-compose up -d
```

**docker-compose.yml** 配置：

```yaml
version: '3'
services:
  filmgallery:
    image: filmgallery:latest
    ports:
      - "4000:4000"
    environment:
      SERVER_MODE: nas
      DATA_ROOT: /data
      UPLOADS_ROOT: /uploads
    volumes:
      - ./data:/data           # 数据库
      - ./uploads:/uploads     # 照片文件
      - ./backups:/backups     # 备份
    restart: unless-stopped
```

**数据目录结构**：
```
/volume1/docker/filmgallery/
├── data/              # SQLite 数据库
│   └── film.db
├── uploads/           # 照片文件
│   └── rolls/
└── backups/           # 自动备份
    └── film-*.db.bak
```

### 7.1.3 混合模式 (推荐)

NAS 存储数据，PC 进行 GPU 处理。

**特点**：
- ✅ 集中存储 + GPU 加速
- ✅ 多设备同步
- ✅ 最灵活

**架构**：
```
NAS (Docker)          PC (Electron)
├─ SQLite DB    ←→   ├─ Express 服务
├─ 文件存储           ├─ GPU 处理
└─ mDNS 发布         └─ 缓存
```

**配置**：

1. **PC 端配置** (client/.env)
```
REACT_APP_API_BASE=http://nas.local:4000
```

2. **NAS 端 Docker**
```
SERVER_MODE=nas
```

3. **PC 端服务器** (server/.env)
```
SERVER_MODE=standalone
```

连接流程：
- PC 通过 mDNS 发现 NAS 服务
- PC 向 NAS 上传照片
- PC 进行 FilmLab 处理，上传结果

## 7.2 生产构建

### 7.2.1 桌面应用打包

```bash
# 清理旧构建
rm -rf build dist

# 构建前端
npm run build-client

# 重建原生模块（如需要）
npm run rebuild:electron

# 打包为 NSIS 安装程序
npm run dist

# 或仅生成便携版本
npm run pack
```

**输出文件**：
```
dist/
├── FilmGallery Setup 1.9.2.exe      # 安装程序
├── FilmGallery 1.9.2.exe            # 便携版
└── win-unpacked/                    # 解包文件
```

**代码签名** (可选)：

```json
// electron-builder.json
{
  "win": {
    "certificateFile": "path/to/cert.pfx",
    "certificatePassword": "password",
    "signingHashAlgorithms": ["sha256"]
  }
}
```

### 7.2.2 移动应用构建

#### Android APK (本地构建)

```bash
cd mobile
npm run build:apk
```

输出：`mobile/android/app/build/outputs/apk/release/app-release.apk`

#### Android AAB (Google Play)

```bash
npm run build:aab
```

输出：`mobile/android/app/build/outputs/bundle/release/app-release.aab`

#### 使用 EAS 云构建

```bash
# 登录 Expo 账户
npm run eas:login

# 构建 APK
npm run build:apk

# 构建 AAB
npm run build:aab
```

### 7.2.3 Docker 镜像构建

```bash
cd docker

# 构建镜像
docker build -t filmgallery:1.9.2 .

# 标记版本
docker tag filmgallery:1.9.2 yourregistry/filmgallery:1.9.2
docker tag filmgallery:1.9.2 yourregistry/filmgallery:latest

# 上传到镜像仓库
docker push yourregistry/filmgallery:1.9.2
```

## 7.3 升级和维护

### 7.3.1 升级流程

**本地模式**：

```bash
# 1. 备份数据
cp -r data data.backup.$(date +%Y%m%d)

# 2. 更新代码
git pull origin main

# 3. 安装新依赖
npm install
cd server && npm install
cd ../client && npm install
cd ..

# 4. 运行迁移
cd server
npm run init-db

# 5. 启动应用
npm start
```

**NAS 模式**：

```bash
# 1. 备份数据库
docker exec filmgallery sqlite3 /data/film.db ".backup /backups/film-backup.db"

# 2. 停止容器
docker-compose down

# 3. 更新镜像
docker pull yourregistry/filmgallery:latest

# 4. 启动新版本
docker-compose up -d

# 5. 检查日志
docker-compose logs -f filmgallery
```

### 7.3.2 数据备份

**自动备份脚本** (Linux/macOS)：

```bash
#!/bin/bash
# backup.sh

BACKUP_DIR="/backups/filmgallery"
DB_PATH="/data/film.db"
KEEP_DAYS=30

mkdir -p "$BACKUP_DIR"

# 完整备份
sqlite3 "$DB_PATH" ".backup $BACKUP_DIR/film-$(date +%Y%m%d-%H%M%S).db"

# 删除旧备份
find "$BACKUP_DIR" -name "film-*.db" -mtime +$KEEP_DAYS -delete
```

**Windows 批处理** (backup.bat)：

```batch
@echo off
set BACKUP_DIR=D:\backups\filmgallery
set DB_PATH=.\server\film.db

if not exist "%BACKUP_DIR%" mkdir "%BACKUP_DIR%"

for /f "tokens=2-4 delims=/ " %%a in ('date /t') do (set mydate=%%c%%a%%b)
for /f "tokens=1-2 delims=/:" %%a in ('time /t') do (set mytime=%%a%%b)

copy "%DB_PATH%" "%BACKUP_DIR%\film-%mydate%-%mytime%.db"
```

**OneDrive 同步**：

```javascript
// server/services/onedrive-sync.js
async function syncToOneDrive() {
  // 增量同步数据库和文件
  // 详见：docs/onedrive-sync-optimization.md
}
```

### 7.3.3 性能监控

**CPU 和内存监控**：

```bash
# 监控 Node 进程
top | grep node

# 或使用专门工具
npm install -g pm2
pm2 start server.js
pm2 monit
```

**数据库性能**：

```javascript
// 检查慢查询
db.all("SELECT * FROM sqlite_stat1 WHERE stat LIKE '%slow%'");

// 分析表大小
db.all("SELECT name, SUM(pgsize) as size FROM dbstat GROUP BY name");
```

**API 性能**：

```javascript
// server/utils/profiler.js 已内置请求性能记录
console.log(getProfilerStats());
```

## 7.4 故障排查

### 7.4.1 常见问题

#### 问题：无法连接到服务器

```
错误：GET http://localhost:4000/api/health 404
```

**解决**：
1. 检查服务器是否运行：`npm start`
2. 检查防火墙设置
3. 检查 API_BASE 环境变量

#### 问题：数据库锁定

```
错误：SQLITE_BUSY: database is locked
```

**解决**：
1. 关闭所有应用实例
2. 删除 `.db-wal` 和 `.db-shm` 文件
3. 重启服务器

#### 问题：文件上传失败

```
错误：413 Payload Too Large
```

**解决**：
1. 增加 multer 限制：`server/server.js`
2. 检查磁盘空间
3. 检查文件权限

#### 问题：FilmLab 处理很慢

**解决**：
1. 启用 GPU 加速：`USE_GPU=1 npm start`
2. 检查图像分辨率（太大则缩小）
3. 使用 NAS 模式在 PC 端处理

### 7.4.2 日志位置

**服务器日志**：
```
Windows: ./server/logs/
macOS/Linux: ./server/logs/
Docker: docker logs <container-id>
```

**应用日志**：
```
Electron: %APPDATA%/FilmGallery/logs/
```

**启用详细日志**：

```bash
# 开发
DEBUG=* npm start

# 生产
NODE_ENV=production DEBUG=filmgallery:* npm start
```

### 7.4.3 日志分析

```javascript
// 查看最近的错误
tail -f server.log | grep "ERROR"

// 分析 API 性能
grep "API" server.log | awk '{print $NF}' | sort -n | tail -10
```

## 7.5 安全性

### 7.5.1 数据库安全

```javascript
// 使用 Prepared Statements（已实现）
db.prepare('SELECT * FROM photos WHERE id = ?').get(photoId);

// 启用 PRAGMA 加强安全
db.run('PRAGMA foreign_keys = ON');
db.run('PRAGMA journal_mode = WAL');
```

### 7.5.2 API 安全

建议配置（在反向代理中）：

```nginx
# HTTPS 强制
server {
  listen 443 ssl;
  ssl_protocols TLSv1.2 TLSv1.3;
  ssl_ciphers HIGH:!aNULL:!MD5;
  
  # 防止 CSRF
  add_header X-CSRF-Token $request_id;
  
  # 防止点击劫持
  add_header X-Frame-Options "SAMEORIGIN";
  
  # 防止内容嗅探
  add_header X-Content-Type-Options "nosniff";
}
```

### 7.5.3 认证和授权

当前版本不包含用户认证。生产部署建议：

1. **使用反向代理** (nginx/Apache)
2. **配置 API 密钥**：
```javascript
// server/middleware/auth.js
app.use((req, res, next) => {
  const apiKey = req.headers['x-api-key'];
  if (apiKey !== process.env.API_KEY) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
});
```

3. **启用 HTTPS**：生产环境必须使用 HTTPS

## 7.6 扩展和优化

### 7.6.1 性能优化建议

1. **数据库**：
   - 添加适当的索引
   - 定期 VACUUM 清理数据库
   - 使用 WAL 模式提升并发

2. **文件存储**：
   - 将文件存储到高速 SSD
   - 分离缩略图和原始文件
   - 使用 CDN 加速（可选）

3. **API**：
   - 启用 gzip 压缩
   - 实现缓存策略
   - 使用 Redis 缓存（可选）

4. **前端**：
   - 代码分割和懒加载
   - 虚拟化长列表
   - 图片优化和懒加载

### 7.6.2 扩展存储

当照片库超过 NAS 容量时：

1. **增加 NAS 磁盘**
2. **配置多路径存储**：
```javascript
// 根据日期分离存储
const uploadPath = path.join(
  uploadsDir,
  new Date().toISOString().slice(0, 7)  // YYYY-MM
);
```

3. **归档旧数据**：
```bash
# 移动 6 个月前的数据到外部存储
rsync -av uploads/2025-07/* /archive/2025-07/
```

---

**相关文档**：
- [DOCKER-BUILD-GUIDE.md](../DOCKER-BUILD-GUIDE.md) - Docker 构建详情
- [onedrive-sync-optimization.md](../onedrive-sync-optimization.md) - OneDrive 同步
- [06-development.md](./06-development.md) - 开发指南
