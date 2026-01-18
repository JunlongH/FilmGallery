# Film Gallery
### *A Film management software developed all by AI tools using vibe coding.*

一款专业的胶片摄影管理系统，支持多平台（桌面端、手机端、手表端）和混合算力架构部署。

---

## 🚀 快速开始

### 新用户推荐：混合算力架构

如果你有 NAS 或服务器，推荐使用混合算力架构，享受最佳体验：

```bash
# 1. 快速部署 NAS 服务器（5分钟）
cd docker/
./deploy.sh start    # Linux/macOS
# 或
.\deploy.ps1 start   # Windows

# 2. 桌面客户端连接 NAS
# 设置 → 服务器模式 → 混合模式
# 服务器地址: http://<NAS-IP>:4000
# 启用本地 FilmLab 处理

# 3. 移动端直连 NAS
# 扫描二维码或输入服务器地址
```

📖 详细部署指南：
- **5分钟入门**: [QUICKSTART.md](./QUICKSTART.md)
- **完整部署指南**: [DEPLOYMENT.md](./DEPLOYMENT.md)
- **架构文档**: [docs/hybrid-compute-architecture.md](./docs/hybrid-compute-architecture.md)

---

## 📦 版本说明

### 当前版本
- **桌面端**: v1.8.0
- **移动端**: v1.3.1
- **服务器**: v1.8.0
- **最新更新**: 混合算力架构 + 完整部署自动化

### 部署方式对比

| 方式 | 适用场景 | 数据位置 | FilmLab 处理 | 移动端访问 |
|------|----------|----------|--------------|------------|
| **混合模式（推荐）** | NAS + PC | NAS | PC 本地 | 直连 NAS |
| 单机完整版 | 仅桌面使用 | PC 本地 | PC 本地 | 需 PC 在线 |
| 客户端 + 远程服务器 | 远程连接 | 云服务器 | 禁用 | 直连服务器 |

### 版本类型

#### 1. **桌面端 - Full Version（完整版）**
- **包含**: 内嵌服务器 + 客户端界面
- **适用场景**: 单机使用、不需要远程访问
- **安装包大小**: ~250MB
- **安装包名称**: `FilmGallery Setup 1.8.0.exe`
- **下载位置**: `dist_v9/`

#### 2. **桌面端 - Client-Only Version（轻量版）**
- **包含**: 仅客户端界面
- **适用场景**: 连接远程服务器、多设备共享数据
- **安装包大小**: ~100MB
- **安装包名称**: `FilmGallery-Client Setup 1.8.0.exe`
- **下载位置**: `dist_v9_client/`
- **要求**: 需要单独部署服务器

#### 3. **服务器 - Docker Version（NAS 推荐）**
- **适用场景**: 
  - 🔥 **混合算力架构**（NAS 存储 + PC 算力）
  - 远程服务器部署
  - NAS 设备部署（Synology/QNAP/群晖）
  - 多设备共享数据
  - 7x24 小时运行
- **部署方式**: Docker / Docker Compose
- **快速开始**: [QUICKSTART.md](./QUICKSTART.md)
- **详细文档**: [DEPLOYMENT.md](./DEPLOYMENT.md)

#### 4. **移动端 - Android App**
- **版本**: v1.3.1
- **包名**: `com.filmgallery.app`
- **适用场景**: 外出拍摄、快速查看照片、移动端管理
- **要求**: 需要连接到服务器（Full Version 或 Docker Server）

#### 5. **手表端 - Watch App**
- **平台**: Apple Watch / Android Wear (开发中)
- **适用场景**: 快速查看拍摄参数、拍摄计数
- **要求**: 需要配对手机端 App

---

## 🚀 快速开始

### 桌面端安装

#### Full Version（推荐新手）
```bash
# 1. 下载安装包
# dist_v9/FilmGallery Setup 1.8.0.exe

# 2. 运行安装程序
# 双击安装包，按提示完成安装

# 3. 启动应用
# 桌面双击快捷方式或从开始菜单启动

# 4. 首次使用
# 应用会自动启动内嵌服务器（localhost:4000）
# 无需额外配置即可使用
```

#### Client-Only Version（适合高级用户）
```bash
# 1. 先部署服务器（见下方"服务器部署"）

# 2. 下载并安装客户端
# dist_v9_client/FilmGallery-Client Setup 1.8.0.exe

# 3. 配置服务器连接
# 启动应用 → Settings → Server Configuration
# 输入服务器地址（如 http://192.168.1.100:4000）
# 点击 Test Connection → Save & Restart

# 4. 配置数据路径（可选）
# Settings → Data Location
# 手动输入服务器上的路径或使用 Browse（本地模式）
```

---

## 🐳 服务器部署

### Docker 部署（推荐）

**一键启动**：
```bash
cd server
docker-compose up -d
```

**访问**：
- 服务器地址: `http://localhost:4000`
- 数据存储: `./data/db/` (数据库) + `./data/uploads/` (照片)

**详细说明**：
- 完整 Docker 部署指南: [README-DEPLOY.md](./README-DEPLOY.md)
- 环境变量配置
- 持久化存储设置
- 网络和防火墙配置

### 传统部署（Windows/Linux）

**前置条件**：
- Node.js 18+
- Git

**步骤**：
```bash
# 1. 安装依赖
cd server
npm install

# 2. 启动服务器
node server.js
# 或使用 nodemon (开发模式)
npm run dev

# 3. 验证运行
# 浏览器访问 http://localhost:4000/api/health
```

**生产环境**：
```bash
# 使用 PM2 管理进程
npm install -g pm2
pm2 start server.js --name film-gallery
pm2 save
pm2 startup
```

---

## 📱 移动端安装与使用

### Android App

#### 安装方式

**方法 1: 下载 APK（推荐）**
```bash
# 1. 从 Releases 页面下载最新 APK
# 或使用 EAS 构建：
cd mobile
npx eas build -p android --profile preview

# 2. 传输到手机并安装
# 需要在手机设置中允许"未知来源"安装
```

**方法 2: 开发调试**
```bash
# 1. 安装依赖
cd mobile
npm install

# 2. 启动开发服务器
npm start

# 3. 使用 Expo Go 扫码
# 或在模拟器中运行：npm run android
```

#### 首次配置

1. **连接服务器**
   - 打开 App → Settings
   - 输入服务器地址（如 `http://192.168.1.100:4000`）
   - 测试连接 → 保存

2. **网络要求**
   - 手机和服务器需在**同一局域网**
   - 或服务器开放公网访问（不推荐，需配置 HTTPS）

3. **功能说明**
   - 📸 快速拍摄记录
   - 🎞️ 胶卷管理
   - 📊 查看统计数据
   - 🗺️ 地图定位
   - 🏷️ 标签管理

#### 构建生产版本

**使用 EAS Build（推荐）**：
```bash
cd mobile

# 配置 EAS
npx eas login
npx eas build:configure

# 构建 APK
npx eas build -p android --profile production

# 构建 AAB (Google Play)
npx eas build -p android --profile production --non-interactive
```

**本地构建**：
```bash
cd mobile/android

# Release APK
./gradlew assembleRelease

# 输出位置
# android/app/build/outputs/apk/release/app-release.apk
```

### iOS App (iPhone)

> ⚠️ iOS 构建**必须在 macOS 系统上进行**，需要 Xcode 和 Apple Developer 账号。

#### 开发调试

```bash
cd mobile

# 安装依赖
npm install

# 安装 iOS 原生依赖
cd ios && pod install && cd ..

# 启动开发服务器
npm start

# 在模拟器运行
npm run ios

# 或在真机运行（需要开发者账号）
npm run ios -- --device
```

#### 使用 EAS Build 构建（推荐）

```bash
cd mobile

# 登录 Expo 账号
npx eas login

# 配置 EAS
npx eas build:configure

# 构建 iOS 应用（云端构建，无需 Mac）
npx eas build -p ios --profile production

# 下载 IPA 文件
# 构建完成后会提供下载链接
```

#### 本地构建 IPA

```bash
cd mobile/ios

# 打开 Xcode 项目
open FilmGallery.xcworkspace

# 在 Xcode 中：
# 1. 选择 Product → Scheme → FilmGallery
# 2. 选择目标设备为 "Any iOS Device (arm64)"
# 3. Product → Archive
# 4. 在 Organizer 中导出 IPA

# 或使用命令行：
xcodebuild -workspace FilmGallery.xcworkspace \
  -scheme FilmGallery \
  -configuration Release \
  -archivePath build/FilmGallery.xcarchive \
  archive

xcodebuild -exportArchive \
  -archivePath build/FilmGallery.xcarchive \
  -exportPath build/output \
  -exportOptionsPlist ExportOptions.plist
```

#### 发布到 App Store

```bash
# 使用 EAS Submit
npx eas submit -p ios

# 或在 Xcode Organizer 中上传
# 或使用 Transporter 应用上传 IPA
```

**iOS 构建要求**：
- macOS 系统
- Xcode 14+
- Apple Developer Program 会员（$99/年）
- 有效的开发证书和 Provisioning Profile

---

## ⌚ 手表端安装与使用

### Watch App (Apple Watch)

**当前状态**: Beta 测试中

**安装步骤**：
```bash
# 1. 构建 Watch App
cd watch-app

# 2. 安装依赖
npm install

# 3. iOS 开发（需要 Mac）
cd ios
pod install
open WatchApp.xcworkspace

# 4. 选择 Watch Scheme 并运行到配对的 Apple Watch
```

**功能**：
- 🎯 快速查看当前胶卷信息
- 📊 今日拍摄统计
- ⏱️ 拍摄计数器
- 📍 快速记录拍摄位置

**同步说明**：
- Watch App 通过蓝牙与手机端同步
- 数据最终存储在服务器
- 支持离线记录，联网后自动同步

---

## 🛠️ 开发构建

### 前置条件
- Node.js 18+
- Git
- Python 3.x (Sharp 依赖)
- Visual Studio Build Tools (Windows)

### 桌面端开发

```bash
# 1. 克隆仓库
git clone https://github.com/JunlongH/FilmGalery.git
cd FilmGalery

# 2. 安装依赖
npm install                # 根目录 (Electron)
cd server && npm install   # 服务器
cd ../client && npm install # 客户端 React

# 3. 开发运行
# Terminal 1: 启动服务器
cd server
node server.js

# Terminal 2: 启动 Electron
cd ..
npm run start
# 或双击 run.bat

# 4. 构建安装包
# Full Version (Windows)
npm run dist

# Client-Only Version (Windows)
npm run dist:client-only
```

### macOS 构建

> ⚠️ macOS 安装包**必须在 macOS 系统上构建**，无法在 Windows/Linux 交叉编译。

```bash
# 在 Mac 终端执行

# 1. 克隆仓库并安装依赖
git clone https://github.com/JunlongH/FilmGalery.git
cd FilmGalery
npm install
cd client && npm install && cd ..

# 2. 构建客户端
npm run build

# 3. 构建 DMG 安装包 (Client-Only)
npx electron-builder --mac --config electron-builder-client-only.json

# 4. 输出位置
# dist_v9_client/FilmGallery-Client-x.x.x.dmg
```

**Full Version (含服务器)**：
```bash
# 安装服务器依赖
cd server && npm install && cd ..

# 构建完整版
npx electron-builder --mac
# 输出: dist_v9/FilmGallery-x.x.x.dmg
```

### Ubuntu / Linux 构建

```bash
# 在 Ubuntu/Linux 终端执行

# 1. 安装 Node.js 18+
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

# 2. 克隆仓库并安装依赖
git clone https://github.com/JunlongH/FilmGalery.git
cd FilmGalery
npm install
cd client && npm install && cd ..

# 3. 构建客户端
npm run build

# 4. 构建 AppImage (Client-Only)
npx electron-builder --linux --config electron-builder-client-only.json

# 5. 输出位置
# dist_v9_client/FilmGallery-Client-x.x.x.AppImage
```

**Full Version (含服务器)**：
```bash
cd server && npm install && cd ..
npx electron-builder --linux
# 输出: dist_v9/FilmGallery-x.x.x.AppImage
```

**运行 AppImage**：
```bash
chmod +x FilmGallery-Client-x.x.x.AppImage
./FilmGallery-Client-x.x.x.AppImage
```

### 使用 GitHub Actions 自动构建（推荐）

创建 `.github/workflows/build.yml` 实现多平台自动构建：

```yaml
name: Build Desktop Apps

on:
  push:
    tags:
      - 'v*'

jobs:
  build:
    strategy:
      matrix:
        os: [macos-latest, ubuntu-latest, windows-latest]
    runs-on: ${{ matrix.os }}
    
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
      
      - name: Install dependencies
        run: npm install && cd client && npm install
      
      - name: Build client
        run: npm run build
      
      - name: Package
        run: npx electron-builder --config electron-builder-client-only.json
        env:
          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
      
      - name: Upload artifacts
        uses: actions/upload-artifact@v4
        with:
          name: ${{ matrix.os }}-build
          path: dist_v9_client/*
```

**输出文件汇总**：

| 平台 | 命令 | 输出文件 |
|------|------|----------|
| Windows | `npx electron-builder --win` | `.exe` (NSIS) |
| macOS | `npx electron-builder --mac` | `.dmg` |
| Linux | `npx electron-builder --linux` | `.AppImage` |

### 使用 GitHub Actions 自动构建

项目已配置好 GitHub Actions 工作流，支持自动构建所有平台：

#### 触发构建

**方法 1: 创建版本标签（推荐）**
```bash
# 创建标签并推送，自动触发构建
git tag v1.9.0
git push origin v1.9.0
```

**方法 2: 手动触发**
1. 访问 GitHub 仓库 → Actions 页面
2. 选择 "Build Desktop Apps" 或 "Build Mobile Apps"
3. 点击 "Run workflow"
4. 选择分支并点击 "Run workflow"

#### 下载构建产物

1. 构建完成后，访问 Actions → 选择对应的 workflow run
2. 在 Artifacts 区域下载：
   - `desktop-windows` - Windows .exe 安装包
   - `desktop-macos` - macOS .dmg 安装包
   - `desktop-linux` - Linux .AppImage
   - `android-apk` - Android APK

#### 配置要求

需要在 GitHub 仓库设置以下 Secrets：

| Secret 名称 | 说明 | 获取方式 |
|------------|------|----------|
| `EXPO_TOKEN` | Expo 访问令牌 | https://expo.dev/accounts/[用户名]/settings/access-tokens |
| `GITHUB_TOKEN` | 自动提供 | GitHub 自动注入，无需配置 |

**配置步骤**：
1. GitHub 仓库 → Settings → Secrets and variables → Actions
2. 点击 "New repository secret"
3. 添加 `EXPO_TOKEN`

### 客户端单独开发

```bash
cd client

# 开发服务器
npm start

# 构建生产版本
npm run build
```

### 移动端开发

```bash
cd mobile

# 安装依赖
npm install

# 启动 Expo 开发服务器
npm start

# 在模拟器/设备运行
npm run android  # Android
npm run ios      # iOS (需要 Mac)

# 构建 APK
npx eas build -p android
```

### 手表端开发

```bash
cd watch-app

# 安装依赖
npm install

# iOS (需要 Mac + Xcode)
cd ios
pod install
open WatchApp.xcworkspace

# Android Wear (开发中)
cd android
./gradlew assembleDebug
```

---

## 📂 项目结构

```
FilmGalery/
├── client/              # React 前端应用
│   ├── src/
│   │   ├── components/  # React 组件
│   │   ├── api.js       # API 客户端
│   │   └── styles/      # 样式文件
│   ├── build/           # 构建输出
│   └── package.json
│
├── server/              # Node.js 后端服务
│   ├── routes/          # API 路由
│   ├── services/        # 业务逻辑
│   ├── utils/           # 工具函数
│   ├── db.js            # 数据库连接
│   ├── server.js        # 入口文件
│   ├── Dockerfile       # Docker 镜像
│   └── docker-compose.yml
│
├── mobile/              # React Native 移动端
│   ├── src/
│   │   ├── components/
│   │   ├── screens/
│   │   └── services/
│   ├── android/         # Android 原生代码
│   ├── ios/             # iOS 原生代码
│   └── app.json         # Expo 配置
│
├── watch-app/           # 手表端应用
│   ├── src/
│   ├── ios/             # Apple Watch
│   └── android/         # Android Wear
│
├── electron-main.js     # Electron 主进程
├── electron-preload.js  # Electron 预加载脚本
├── electron-builder-client-only.json  # Client-Only 构建配置
│
├── dist_v9/             # Full Version 安装包输出
├── dist_v9_client/      # Client-Only 安装包输出
│
├── docs/                # 文档
│   ├── README-DEPLOY.md # 部署指南
│   ├── API_BASE-QUICK-REFERENCE.md
│   └── bugfix-*.md      # Bug 修复记录
│
└── README.md            # 本文件
```

---

## 🔧 配置说明

### 桌面端配置

**Full Version**:
- 数据位置: `%APPDATA%/FilmGallery` 或自定义路径
- 服务器端口: `4000` (自动启动)
- 配置文件: `%APPDATA%/FilmGallery/config.json`

**Client-Only Version**:
- 服务器地址: Settings → Server Configuration
- 数据路径: 手动输入远程服务器路径
- 配置文件: `%APPDATA%/FilmGallery-Client/config.json`

### 服务器配置

**环境变量** (`.env` 或 Docker):
```bash
PORT=4000                    # 服务器端口
DATA_ROOT=/data/db           # 数据库目录
UPLOADS_ROOT=/data/uploads   # 上传文件目录
NODE_ENV=production          # 运行环境
```

**Docker Compose**:
```yaml
services:
  film-gallery:
    ports:
      - "4000:4000"
    volumes:
      - ./data/db:/data/db
      - ./data/uploads:/data/uploads
    environment:
      - PORT=4000
```

### 移动端配置

**app.json**:
```json
{
  "expo": {
    "version": "1.3.1",
    "android": {
      "package": "com.filmgallery.app",
      "versionCode": 6
    }
  }
}
```

**服务器连接**:
- App 内 Settings 配置
- 支持 HTTP/HTTPS
- 局域网或公网访问

---

## 📚 文档链接

- 📖 [完整部署指南](./README-DEPLOY.md) - Docker、服务器、客户端部署
- 🔧 [API_BASE 使用规范](./docs/API_BASE-QUICK-REFERENCE.md) - 开发者参考
- 🐛 [Bug 修复记录](./docs/) - 问题追踪和解决方案
- 📱 [移动端开发文档](./mobile/README-filesystem-migration.md) - 文件系统迁移
- ⌚ [手表端开发文档](./docs/WATCH-APP-DEVELOPMENT.md) - Watch App 指南

---

## 🤝 贡献指南

欢迎贡献代码！请遵循以下步骤：

1. Fork 本仓库
2. 创建功能分支 (`git checkout -b feature/amazing-feature`)
3. 提交更改 (`git commit -m 'Add amazing feature'`)
4. 推送到分支 (`git push origin feature/amazing-feature`)
5. 创建 Pull Request

---

## 📝 版本历史

### v1.8.0 (2026-01-08)
- ✨ 新增 Server/Client 分离架构
- 🐳 支持 Docker 部署
- 🔧 Client-Only 轻量版构建
- 🌐 远程服务器连接支持
- 📝 完整部署文档

### v1.3.1 (2025-12-10)
- 📱 移动端曝光调整优化
- 🔧 文件系统迁移支持
- 🐛 修复 OneDrive 同步问题

### v1.3.0 (2025-11)
- 🎨 UI/UX 全面改进
- 📊 统计功能增强
- 🗺️ 地图集成
- ⌚ Watch App Beta 版本

---

## 📄 许可证

本项目采用 MIT 许可证 - 详见 [LICENSE](./LICENSE) 文件

---

## 💬 联系方式

- **Issues**: [GitHub Issues](https://github.com/JunlongH/FilmGalery/issues)
- **Discussions**: [GitHub Discussions](https://github.com/JunlongH/FilmGalery/discussions)

---

## 🌟 特别说明

**仅提交源码与配置**：
- `mobile/.gitignore` 和 `watch-app/.gitignore` 已排除 `node_modules/` 与构建输出
- 请勿提交 APK/AAB、Android/iOS build 文件夹
- 请勿提交 `dist_v9/` 和 `dist_v9_client/` 中的安装包

**AI 辅助开发**：
本项目使用 AI 工具（GitHub Copilot、Claude）进行 vibe coding 开发，展示了 AI 辅助编程的可能性。
