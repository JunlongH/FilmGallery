# FilmGallery LibRaw 原生模块集成指南

本文档说明如何在 FilmGallery 中启用新的 LibRaw 0.22 原生模块以支持 Panasonic DC-S9 等新相机。

## 快速开始

### 步骤 1: 构建原生模块

```powershell
# 进入模块目录
cd packages/@filmgallery/libraw-native

# 运行构建脚本 (Windows)
.\scripts\build.ps1

# 或手动构建
npm install
npm run download-libraw
npm run build
npm test
```

### 步骤 2: 更新服务器依赖

编辑 `server/package.json`:

```json
{
  "dependencies": {
    "@filmgallery/libraw-native": "file:../packages/@filmgallery/libraw-native",
    "lightdrift-libraw": "^1.0.0-beta.1"
  }
}
```

注意：保留 `lightdrift-libraw` 作为备用。

### 步骤 3: 替换 raw-decoder.js

```powershell
# 备份旧文件
Copy-Item server/services/raw-decoder.js server/services/raw-decoder.js.bak

# 使用新文件
Copy-Item server/services/raw-decoder-new.js server/services/raw-decoder.js
```

### 步骤 4: 重新安装依赖

```powershell
cd server
npm install
```

### 步骤 5: 测试

```powershell
# 启动服务器
npm start

# 在另一个终端测试 API
curl http://localhost:3000/api/raw/status
```

期望输出:
```json
{
  "success": true,
  "available": true,
  "decoder": "libraw-native",
  "version": "0.22.0"
}
```

## 验证 Panasonic DC-S9 支持

```javascript
const { isSupportedCamera } = require('@filmgallery/libraw-native');

console.log(isSupportedCamera('Panasonic DC-S9'));  // 应返回 true
```

## 回滚

如果遇到问题，可以轻松回滚:

```powershell
# 恢复旧文件
Copy-Item server/services/raw-decoder.js.bak server/services/raw-decoder.js

# 从 package.json 移除 @filmgallery/libraw-native
# 重新安装
npm install
```

新的 raw-decoder.js 设计为自动回退到 lightdrift-libraw，所以即使新模块加载失败，原有功能仍可用。

## 故障排除

### 构建失败

1. **缺少 Visual Studio Build Tools**
   ```powershell
   winget install Microsoft.VisualStudio.2022.BuildTools
   # 确保安装 "C++ build tools" 工作负载
   ```

2. **缺少 Python**
   ```powershell
   winget install Python.Python.3.11
   ```

3. **node-gyp 错误**
   ```powershell
   npm install -g node-gyp
   npm config set python C:\Python311\python.exe
   npm config set msvs_version 2022
   ```

### 模块加载失败

检查:
1. 构建是否成功完成
2. `build/Release/libraw_native.node` 是否存在
3. 运行 `npm test` 查看详细错误

### 解码失败

1. 确认文件格式支持
2. 检查文件是否损坏
3. 查看服务器日志中的详细错误信息

## 性能优化

### 使用预编译二进制

为避免用户机器上编译，可以预构建:

```powershell
cd packages/@filmgallery/libraw-native
npm run prebuildify
```

这会在 `prebuilds/` 目录生成预编译二进制。

### Electron 集成

对于 Electron 应用，需要针对 Electron 重新编译:

```powershell
npm install @electron/rebuild
npx electron-rebuild -v 26.6.10
```

## 文件结构

```
packages/@filmgallery/libraw-native/
├── binding.gyp           # node-gyp 构建配置
├── package.json
├── README.md
├── deps/
│   └── libraw/           # LibRaw 0.22 源码 (自动下载)
├── lib/
│   ├── index.js          # 主入口
│   └── processor.js      # 高级 API
├── scripts/
│   ├── build.ps1         # Windows 构建脚本
│   ├── build.sh          # macOS/Linux 构建脚本
│   └── download-libraw.js
├── src/
│   ├── libraw_binding.cpp   # C++ N-API 绑定
│   ├── async_workers.cpp
│   └── async_workers.h
├── test/
│   └── test-decode.js
└── types/
    └── index.d.ts        # TypeScript 类型
```

## 维护

### 更新 LibRaw 版本

1. 修改 `scripts/download-libraw.js` 中的 `LIBRAW_VERSION`
2. 删除 `deps/libraw` 目录
3. 运行 `npm run download-libraw`
4. 重新构建 `npm run build`

### 添加新相机支持

LibRaw 定期更新相机支持列表。检查新版本:
https://github.com/LibRaw/LibRaw/releases

## 参考

- [LibRaw 文档](https://www.libraw.org/docs)
- [N-API 文档](https://nodejs.org/api/n-api.html)
- [node-addon-api](https://github.com/nodejs/node-addon-api)
