# 松下 DC-S9 (Panasonic S9) RW2 文件解码问题

**日期**: 2026-01-24  
**状态**: 🔍 已确认  
**优先级**: 中

---

## 1. 问题描述

用户报告无法解析松下 S9 (DC-S9) 相机拍摄的 RW2 RAW 文件。

### 1.1 症状
- RAW 解码器无法处理 DC-S9 的 RW2 文件
- 可能出现 "Unsupported file format" 或解码失败错误

### 1.2 影响范围
- 松下 DC-S9 用户无法直接导入 RAW 文件
- 其他松下相机的 RW2 文件应该正常工作（如 S1、S5、GH6 等）

---

## 2. 根本原因分析

### 2.1 LibRaw 版本不兼容

| 组件 | 当前版本 | 说明 |
|------|----------|------|
| `lightdrift-libraw` | 1.0.0-beta.1 | Node.js 的 LibRaw 绑定 |
| LibRaw 核心 | 0.21.4-Release | 底层 RAW 解码库 |

**问题**: 松下 DC-S9 于 2024年5月发布，是一款较新的相机。LibRaw 在 **0.22** 版本中才添加了对 DC-S9 的支持。

### 2.2 LibRaw 相机支持时间线

根据 [LibRaw 官方支持列表](https://www.libraw.org/supported-cameras)：

| LibRaw 版本 | 支持的松下相机（部分） |
|-------------|------------------------|
| 0.21.x | DC-S1, DC-S1H, DC-S1R, DC-S5, DC-S5 MkII, DC-GH6, DC-GH7, DC-G9 II... |
| **0.22** | 新增: **DC-S9** |

### 2.3 当前项目依赖

```json
// server/package.json
{
  "dependencies": {
    "lightdrift-libraw": "^1.0.0-beta.1"  // 基于 LibRaw 0.21.4
  }
}
```

---

## 3. 解决方案

### 方案 A: 升级 lightdrift-libraw（推荐）

等待 `lightdrift-libraw` 发布基于 LibRaw 0.22 的新版本。

**操作步骤**:
1. 关注 [lightdrift-libraw GitHub](https://github.com/unique01082/lightdrift-libraw) 仓库更新
2. 当新版本可用时，更新依赖：
   ```bash
   cd server
   npm update lightdrift-libraw
   ```
3. 验证 LibRaw 版本：
   ```javascript
   const LibRaw = require('lightdrift-libraw');
   console.log(LibRaw.getVersion()); // 应显示 0.22.x 或更高
   ```

**优点**: 最简单、最干净的解决方案  
**缺点**: 依赖上游更新

### 方案 B: 使用 Adobe DNG Converter 转换

建议用户将 DC-S9 的 RW2 文件转换为 DNG 格式。

**操作步骤**:
1. 下载 [Adobe DNG Converter](https://helpx.adobe.com/camera-raw/using/adobe-dng-converter.html)（免费）
2. 批量转换 RW2 → DNG
3. 导入 DNG 文件到 FilmGallery

**优点**: 立即可用，无需代码修改  
**缺点**: 需要额外步骤，用户体验不佳

### 方案 C: 自行编译 LibRaw 0.22

如果 `lightdrift-libraw` 长时间未更新，可以考虑 fork 并更新底层 LibRaw。

**复杂度**: 高  
**风险**: 需要维护自定义分支

---

## 4. 临时解决方案（用户建议）

在官方支持之前，建议用户采用以下临时方案之一：

### 4.1 转换为 DNG
使用 Adobe DNG Converter 将 RW2 转换为 DNG 格式：
- DNG 是通用 RAW 格式，LibRaw 所有版本都支持
- 转换过程无损，保留所有原始数据

### 4.2 使用相机内置 JPEG
如果只需要快速导入，可以使用相机同时记录的 JPEG 文件。

### 4.3 使用其他软件导出 TIFF
使用 Lightroom、Capture One 或松下官方软件将 RW2 导出为 16-bit TIFF，再导入到 FilmGallery。

---

## 5. 受影响的代码

### 5.1 RAW 解码器

```javascript
// server/services/raw-decoder.js

// 支持的格式扩展名（包括 .rw2）
const SUPPORTED_EXTENSIONS = [
  '.dng', '.cr2', '.cr3', '.nef', '.arw', 
  '.raf', '.orf', '.rw2', '.pef', '.srw',  // .rw2 在列表中
  '.x3f', '.erf', '.mef', '.mos', '.mrw',
  '.kdc', '.3fr', '.fff', '.iiq', '.dcr', '.k25', '.qtk'
];

// LibRaw 加载
try {
  LibRaw = require('lightdrift-libraw');
  libVersion = LibRaw.getVersion ? LibRaw.getVersion() : 'unknown';
  // 当前显示: "0.21.4-Release" - 不支持 DC-S9
} catch (e) {
  // ...
}
```

### 5.2 文件扩展名检测正常
文件扩展名 `.rw2` 已在支持列表中，这不是问题所在。问题是底层 LibRaw 库不识别 DC-S9 的特定 RAW 格式变体。

---

## 6. 验证测试

### 6.1 确认 LibRaw 版本
```bash
cd server
node -e "const L = require('lightdrift-libraw'); console.log('LibRaw:', L.getVersion())"
```

### 6.2 检查相机支持列表
```javascript
const LibRaw = require('lightdrift-libraw');
const cameras = LibRaw.getCameraList();
const panasonicCameras = cameras.filter(c => c.includes('Panasonic') || c.includes('DC-S'));
console.log(panasonicCameras);
// 检查是否包含 "DC-S9"
```

### 6.3 测试解码
```javascript
const rawDecoder = require('./services/raw-decoder');

// 使用 DC-S9 的 RW2 文件测试
try {
  const result = await rawDecoder.decode('/path/to/DC-S9-sample.rw2');
  console.log('成功');
} catch (e) {
  console.log('失败:', e.message);
  // 预期: 解码失败或格式不支持
}
```

---

## 7. 后续跟踪

### 7.1 待办事项
- [ ] 监控 `lightdrift-libraw` 新版本发布
- [ ] 监控 LibRaw 0.22 正式发布状态
- [ ] 升级后回归测试所有 RAW 格式

### 7.2 相关链接
- [LibRaw 官方网站](https://www.libraw.org/)
- [LibRaw 0.22 支持相机列表](https://www.libraw.org/supported-cameras)
- [LibRaw 发布公告](https://www.libraw.org/news)
- [lightdrift-libraw NPM](https://www.npmjs.com/package/lightdrift-libraw)
- [lightdrift-libraw GitHub](https://github.com/unique01082/lightdrift-libraw)

### 7.3 松下 DC-S9 相机信息
- **发布日期**: 2024年5月
- **传感器**: 24.2MP 全画幅 CMOS
- **RAW 格式**: RW2
- **首次 LibRaw 支持**: 0.22

---

## 8. 原生 LibRaw 0.22 升级方案

如果希望直接使用原生 LibRaw 0.22 来支持松下 S9，可以选择以下方案之一：

### 方案概览

| 方案 | 难度 | 时间估计 | 风险 | 推荐度 |
|------|------|----------|------|--------|
| A. Fork lightdrift-libraw | ⭐⭐⭐ | 2-3天 | 中 | ⭐⭐⭐⭐ |
| B. 使用 rawpy (Python) 绑定 | ⭐⭐ | 1天 | 低 | ⭐⭐⭐ |
| C. 命令行工具后备方案 | ⭐ | 0.5天 | 低 | ⭐⭐⭐⭐⭐ |
| D. 自建 Node.js 原生模块 | ⭐⭐⭐⭐⭐ | 5-7天 | 高 | ⭐⭐ |

---

### 方案 A: Fork 并更新 lightdrift-libraw (推荐)

#### A.1 概述
Fork `lightdrift-libraw` 仓库，将底层 LibRaw 从 0.21.4 升级到 0.22.0。

#### A.2 前置要求

**开发环境 (Windows)**:
- Node.js 18+ 
- Python 3.6+
- Visual Studio Build Tools 2019+ 或 Visual Studio Community
- Git

**安装 Build Tools**:
```powershell
# 使用 winget 安装
winget install Microsoft.VisualStudio.2022.BuildTools

# 或下载安装器：https://visualstudio.microsoft.com/visual-cpp-build-tools/
# 选择 "C++ build tools" 工作负载
```

#### A.3 实施步骤

```powershell
# 1. Fork 并克隆仓库
git clone https://github.com/YOUR_USERNAME/lightdrift-libraw.git
cd lightdrift-libraw

# 2. 下载 LibRaw 0.22.0 Windows 预编译包
# 从 https://www.libraw.org/data/LibRaw-0.22.0-Win64.zip 下载
Invoke-WebRequest -Uri "https://www.libraw.org/data/LibRaw-0.22.0-Win64.zip" -OutFile "LibRaw-0.22.0-Win64.zip"
Expand-Archive -Path "LibRaw-0.22.0-Win64.zip" -DestinationPath "."

# 3. 替换旧的 LibRaw 库文件
# 复制 libraw.lib, libraw.dll 和头文件到 deps/ 目录
Copy-Item "LibRaw-0.22.0-Win64\lib\*" -Destination "deps\LibRaw-Win64\lib\" -Force
Copy-Item "LibRaw-0.22.0-Win64\include\*" -Destination "deps\LibRaw-Win64\include\" -Recurse -Force
Copy-Item "LibRaw-0.22.0-Win64\bin\*.dll" -Destination "deps\LibRaw-Win64\bin\" -Force

# 4. 检查并更新 binding.gyp（如果 API 有变化）
# 通常小版本升级不需要修改

# 5. 重新编译
npm run clean
npm run build

# 6. 验证版本
node -e "const L = require('./lib'); console.log('LibRaw:', L.getVersion())"
# 期望输出: LibRaw: 0.22.0-Release

# 7. 运行测试
npm test

# 8. 创建本地包
npm pack
# 生成 lightdrift-libraw-x.x.x.tgz
```

#### A.4 在项目中使用

```powershell
cd "d:\Program Files\FilmGalery\server"

# 安装本地编译的包
npm install /path/to/lightdrift-libraw-x.x.x.tgz

# 或使用 git 依赖
# 在 package.json 中:
# "lightdrift-libraw": "git+https://github.com/YOUR_USERNAME/lightdrift-libraw.git"
```

#### A.5 维护考虑
- 需要持续同步上游更新
- 每次 Node.js 大版本升级可能需要重新编译
- 考虑向上游提交 PR

---

### 方案 B: 使用 rawpy (Python) 作为后备解码器

#### B.1 概述
`rawpy` 是 LibRaw 的 Python 绑定，可以作为 Node.js 无法解码时的后备方案。

#### B.2 安装

```powershell
# 安装 rawpy (会自动包含最新 LibRaw)
pip install rawpy numpy imageio

# 验证版本
python -c "import rawpy; print('LibRaw:', rawpy.libraw_version)"
# 期望: LibRaw: (0, 22, 0)
```

#### B.3 创建 Python 解码脚本

```python
# server/scripts/raw_decode.py
import sys
import json
import rawpy
import imageio
import numpy as np

def decode_raw(input_path, output_path, options=None):
    """解码 RAW 文件到 JPEG/TIFF"""
    options = options or {}
    
    try:
        with rawpy.imread(input_path) as raw:
            # 获取元数据
            metadata = {
                'camera': f"{raw.camera_make} {raw.camera_model}",
                'make': raw.camera_make,
                'model': raw.camera_model,
                'width': raw.sizes.width,
                'height': raw.sizes.height,
                'rawWidth': raw.sizes.raw_width,
                'rawHeight': raw.sizes.raw_height,
            }
            
            # 后处理选项
            params = {
                'use_camera_wb': options.get('whiteBalance', 'camera') == 'camera',
                'use_auto_wb': options.get('whiteBalance') == 'auto',
                'output_bps': options.get('outputBits', 16),
                'no_auto_bright': False,
                'demosaic_algorithm': rawpy.DemosaicAlgorithm.AHD,
            }
            
            # 处理图像
            rgb = raw.postprocess(**params)
            
            # 保存输出
            output_format = options.get('outputFormat', 'jpeg').lower()
            if output_format == 'tiff':
                imageio.imwrite(output_path, rgb)
            else:
                # JPEG
                imageio.imwrite(output_path, rgb, quality=options.get('quality', 95))
            
            return {
                'success': True,
                'outputPath': output_path,
                'metadata': metadata
            }
            
    except Exception as e:
        return {
            'success': False,
            'error': str(e)
        }

if __name__ == '__main__':
    import argparse
    parser = argparse.ArgumentParser()
    parser.add_argument('input', help='Input RAW file')
    parser.add_argument('output', help='Output file path')
    parser.add_argument('--format', default='jpeg', choices=['jpeg', 'tiff'])
    parser.add_argument('--quality', type=int, default=95)
    parser.add_argument('--wb', default='camera', choices=['camera', 'auto', 'daylight'])
    parser.add_argument('--bits', type=int, default=16, choices=[8, 16])
    
    args = parser.parse_args()
    
    result = decode_raw(args.input, args.output, {
        'outputFormat': args.format,
        'quality': args.quality,
        'whiteBalance': args.wb,
        'outputBits': args.bits
    })
    
    print(json.dumps(result))
```

#### B.4 在 Node.js 中调用

```javascript
// server/services/raw-decoder-python.js
const { spawn } = require('child_process');
const path = require('path');

/**
 * 使用 Python rawpy 解码 RAW 文件（后备方案）
 */
async function decodeWithPython(inputPath, outputPath, options = {}) {
  return new Promise((resolve, reject) => {
    const args = [
      path.join(__dirname, '../scripts/raw_decode.py'),
      inputPath,
      outputPath,
      '--format', options.outputFormat || 'jpeg',
      '--quality', String(options.quality || 95),
      '--wb', options.whiteBalance || 'camera',
      '--bits', String(options.outputBits || 16)
    ];
    
    const python = spawn('python', args);
    let stdout = '';
    let stderr = '';
    
    python.stdout.on('data', (data) => { stdout += data; });
    python.stderr.on('data', (data) => { stderr += data; });
    
    python.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`Python decoder failed: ${stderr}`));
        return;
      }
      try {
        resolve(JSON.parse(stdout));
      } catch (e) {
        reject(new Error(`Failed to parse output: ${stdout}`));
      }
    });
  });
}

module.exports = { decodeWithPython };
```

#### B.5 集成到现有解码器

```javascript
// server/services/raw-decoder.js 修改

const { decodeWithPython } = require('./raw-decoder-python');

// 在 decode 方法中添加后备逻辑
async decode(inputPath, options = {}, onProgress = null) {
  // 先尝试 lightdrift-libraw
  try {
    return await this._decodeWithLibRaw(inputPath, options, onProgress);
  } catch (librawError) {
    console.warn('[RawDecoder] LibRaw decode failed, trying Python fallback:', librawError.message);
    
    // 后备到 Python rawpy
    const tempOutput = path.join(os.tmpdir(), `raw-${Date.now()}.${options.outputFormat || 'jpg'}`);
    const result = await decodeWithPython(inputPath, tempOutput, options);
    
    if (!result.success) {
      throw new Error(`Both decoders failed. LibRaw: ${librawError.message}, Python: ${result.error}`);
    }
    
    // 读取输出文件返回 buffer
    const buffer = await fs.promises.readFile(tempOutput);
    await fs.promises.unlink(tempOutput); // 清理临时文件
    
    return buffer;
  }
}
```

---

### 方案 C: 命令行工具后备方案 (最快实现)

#### C.1 概述
使用预编译的 `dcraw_emu`（LibRaw 示例程序）或 `darktable-cli` 作为后备解码器。

#### C.2 下载预编译工具

```powershell
# 下载 LibRaw 0.22.0 Windows 包（包含 dcraw_emu.exe）
Invoke-WebRequest -Uri "https://www.libraw.org/data/LibRaw-0.22.0-Win64.zip" -OutFile "LibRaw-0.22.0-Win64.zip"
Expand-Archive -Path "LibRaw-0.22.0-Win64.zip" -DestinationPath "."

# 复制到项目 bin 目录
New-Item -ItemType Directory -Path "d:\Program Files\FilmGalery\bin" -Force
Copy-Item "LibRaw-0.22.0-Win64\bin\*" -Destination "d:\Program Files\FilmGalery\bin\" -Force
```

#### C.3 创建命令行解码器服务

```javascript
// server/services/raw-decoder-cli.js
const { exec } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');

const DCRAW_EMU_PATH = path.join(__dirname, '../../bin/dcraw_emu.exe');

/**
 * 使用 dcraw_emu 命令行工具解码 RAW
 */
async function decodeWithCLI(inputPath, options = {}) {
  const tempDir = path.join(os.tmpdir(), 'filmgallery-raw');
  await fs.promises.mkdir(tempDir, { recursive: true });
  
  const baseName = path.basename(inputPath, path.extname(inputPath));
  const outputPath = path.join(tempDir, `${baseName}.tiff`);
  
  // 构建 dcraw_emu 命令
  // -T: 输出 TIFF
  // -w: 使用相机白平衡
  // -o 1: sRGB 色彩空间
  // -6: 16位输出
  const args = [
    '-T',                           // TIFF 输出
    '-w',                           // 相机白平衡
    '-o', '1',                      // sRGB
    options.outputBits === 8 ? '-4' : '-6',  // 8位或16位
    '-O', outputPath,               // 输出路径
    inputPath                       // 输入文件
  ];
  
  const command = `"${DCRAW_EMU_PATH}" ${args.join(' ')}`;
  
  return new Promise((resolve, reject) => {
    exec(command, { maxBuffer: 50 * 1024 * 1024 }, async (error, stdout, stderr) => {
      if (error) {
        reject(new Error(`dcraw_emu failed: ${stderr || error.message}`));
        return;
      }
      
      try {
        const buffer = await fs.promises.readFile(outputPath);
        await fs.promises.unlink(outputPath); // 清理
        resolve({
          success: true,
          buffer,
          outputPath
        });
      } catch (e) {
        reject(new Error(`Failed to read output: ${e.message}`));
      }
    });
  });
}

/**
 * 使用 dcraw_emu 提取元数据
 */
async function getMetadataWithCLI(inputPath) {
  const command = `"${DCRAW_EMU_PATH}" -i -v "${inputPath}"`;
  
  return new Promise((resolve, reject) => {
    exec(command, (error, stdout, stderr) => {
      if (error) {
        reject(new Error(`Metadata extraction failed: ${stderr}`));
        return;
      }
      
      const output = stdout + stderr;
      const metadata = {};
      
      // 解析输出
      const cameraMatch = output.match(/Camera:\s*(.+)/);
      if (cameraMatch) metadata.camera = cameraMatch[1].trim();
      
      const isoMatch = output.match(/ISO speed:\s*(\d+)/);
      if (isoMatch) metadata.iso = parseInt(isoMatch[1]);
      
      const shutterMatch = output.match(/Shutter:\s*(.+)/);
      if (shutterMatch) metadata.shutter = shutterMatch[1].trim();
      
      const apertureMatch = output.match(/Aperture:\s*f\/(.+)/);
      if (apertureMatch) metadata.aperture = parseFloat(apertureMatch[1]);
      
      const sizeMatch = output.match(/Image size:\s*(\d+)\s*x\s*(\d+)/);
      if (sizeMatch) {
        metadata.width = parseInt(sizeMatch[1]);
        metadata.height = parseInt(sizeMatch[2]);
      }
      
      resolve(metadata);
    });
  });
}

module.exports = { decodeWithCLI, getMetadataWithCLI };
```

#### C.4 集成到主解码器

在 `raw-decoder.js` 中添加后备逻辑：

```javascript
// 导入 CLI 解码器
const { decodeWithCLI, getMetadataWithCLI } = require('./raw-decoder-cli');

// 检查 CLI 工具是否可用
const CLI_AVAILABLE = fs.existsSync(path.join(__dirname, '../../bin/dcraw_emu.exe'));

// 修改 decode 方法，添加后备
async decode(inputPath, options = {}, onProgress = null) {
  // 先尝试原生 LibRaw
  if (LibRaw) {
    try {
      return await this._decodeNative(inputPath, options, onProgress);
    } catch (e) {
      console.warn('[RawDecoder] Native decode failed:', e.message);
      // 继续尝试 CLI 后备
    }
  }
  
  // CLI 后备
  if (CLI_AVAILABLE) {
    console.log('[RawDecoder] Using CLI fallback (dcraw_emu)');
    const result = await decodeWithCLI(inputPath, options);
    return result.buffer;
  }
  
  throw new Error('No RAW decoder available');
}
```

---

### 方案 D: 自建 Node.js 原生模块 (完整指南)

#### D.1 概述
从零开始创建 LibRaw 0.22 的 Node.js 原生绑定。这是最复杂但最可控的方案。

#### D.2 前置要求

**开发环境 (Windows)**:
```powershell
# 1. Node.js 18+ (LTS)
node --version  # v18.x 或 v20.x

# 2. Python 3.6+ (node-gyp 需要)
python --version

# 3. Visual Studio Build Tools 2022
# 下载: https://visualstudio.microsoft.com/visual-cpp-build-tools/
# 安装时选择 "Desktop development with C++" 工作负载

# 4. 安装 node-gyp 全局
npm install -g node-gyp

# 5. 配置 node-gyp
npm config set msvs_version 2022
npm config set python python3
```

**开发环境 (macOS)**:
```bash
# Xcode Command Line Tools
xcode-select --install

# LibRaw 开发库
brew install libraw
```

**开发环境 (Linux)**:
```bash
# Debian/Ubuntu
sudo apt-get install build-essential libraw-dev

# Alpine
apk add build-base libraw-dev
```

#### D.3 项目结构

```
libraw-node/
├── binding.gyp              # 编译配置 (核心)
├── package.json             # NPM 包配置
├── tsconfig.json            # TypeScript 配置 (可选)
├── src/                     # C++ 源码
│   ├── addon.cpp            # N-API 模块入口
│   ├── libraw_processor.cpp # LibRaw 处理器包装
│   ├── libraw_processor.h   # 头文件
│   ├── async_workers.cpp    # 异步工作线程
│   └── async_workers.h
├── deps/                    # 依赖库
│   ├── LibRaw-0.22.0/       # LibRaw 源码
│   │   ├── lib/             # 预编译库 (.lib/.a/.dylib)
│   │   ├── include/         # 头文件
│   │   └── bin/             # DLL (Windows)
│   └── README.md
├── lib/                     # JavaScript/TypeScript 接口
│   ├── index.js             # 主入口
│   ├── index.d.ts           # TypeScript 类型定义
│   └── utils.js             # 工具函数
├── test/                    # 测试
│   ├── basic.test.js
│   └── samples/             # 测试用 RAW 文件
├── scripts/                 # 构建脚本
│   ├── download-libraw.js   # 下载 LibRaw
│   └── postinstall.js       # 安装后脚本
└── prebuilds/               # 预编译二进制 (可选)
    ├── win32-x64/
    ├── darwin-x64/
    ├── darwin-arm64/
    └── linux-x64/
```

#### D.4 核心文件实现

##### D.4.1 package.json

```json
{
  "name": "libraw-node",
  "version": "1.0.0",
  "description": "Node.js native bindings for LibRaw 0.22",
  "main": "lib/index.js",
  "types": "lib/index.d.ts",
  "scripts": {
    "install": "node-gyp-build",
    "build": "node-gyp rebuild",
    "build:debug": "node-gyp rebuild --debug",
    "clean": "node-gyp clean",
    "test": "node test/basic.test.js",
    "prebuild": "prebuildify --napi --strip",
    "prebuild:all": "prebuildify --napi --strip --platform=win32 --arch=x64 && prebuildify --napi --strip --platform=darwin --arch=x64 && prebuildify --napi --strip --platform=linux --arch=x64"
  },
  "binary": {
    "napi_versions": [8]
  },
  "dependencies": {
    "node-addon-api": "^7.0.0",
    "node-gyp-build": "^4.8.0"
  },
  "devDependencies": {
    "node-gyp": "^10.0.0",
    "prebuildify": "^6.0.0"
  },
  "engines": {
    "node": ">=16.0.0"
  },
  "os": ["win32", "darwin", "linux"],
  "cpu": ["x64", "arm64"],
  "files": [
    "lib/",
    "src/",
    "deps/",
    "binding.gyp",
    "prebuilds/"
  ],
  "keywords": ["libraw", "raw", "image", "photography", "native-addon"],
  "license": "MIT"
}
```

##### D.4.2 binding.gyp (编译配置 - 核心)

```python
{
  "targets": [
    {
      "target_name": "libraw_addon",
      "cflags!": ["-fno-exceptions"],
      "cflags_cc!": ["-fno-exceptions"],
      "sources": [
        "src/addon.cpp",
        "src/libraw_processor.cpp",
        "src/async_workers.cpp"
      ],
      "include_dirs": [
        "<!@(node -p \"require('node-addon-api').include\")",
        "deps/LibRaw-0.22.0/include"
      ],
      "defines": [
        "NAPI_VERSION=8",
        "NAPI_DISABLE_CPP_EXCEPTIONS"
      ],
      "conditions": [
        # ========== Windows ==========
        ["OS=='win'", {
          "libraries": [
            "<(module_root_dir)/deps/LibRaw-0.22.0/lib/libraw.lib"
          ],
          "copies": [{
            "destination": "<(module_root_dir)/build/Release/",
            "files": [
              "<(module_root_dir)/deps/LibRaw-0.22.0/bin/libraw.dll"
            ]
          }],
          "msvs_settings": {
            "VCCLCompilerTool": {
              "ExceptionHandling": 1,
              "RuntimeLibrary": 2
            }
          }
        }],
        # ========== macOS ==========
        ["OS=='mac'", {
          "libraries": [
            "-L/opt/homebrew/lib",
            "-L/usr/local/lib",
            "-lraw"
          ],
          "include_dirs": [
            "/opt/homebrew/include",
            "/usr/local/include"
          ],
          "xcode_settings": {
            "GCC_ENABLE_CPP_EXCEPTIONS": "YES",
            "CLANG_CXX_LIBRARY": "libc++",
            "MACOSX_DEPLOYMENT_TARGET": "11.0"
          }
        }],
        # ========== Linux ==========
        ["OS=='linux'", {
          "libraries": [
            "-lraw"
          ],
          "cflags_cc": [
            "-std=c++17",
            "-fexceptions"
          ]
        }]
      ]
    }
  ]
}
```

##### D.4.3 src/libraw_processor.h (头文件)

```cpp
#ifndef LIBRAW_PROCESSOR_H
#define LIBRAW_PROCESSOR_H

#include <napi.h>
#include <libraw/libraw.h>
#include <string>
#include <memory>

class LibRawProcessor : public Napi::ObjectWrap<LibRawProcessor> {
public:
  static Napi::Object Init(Napi::Env env, Napi::Object exports);
  static Napi::FunctionReference constructor;
  
  LibRawProcessor(const Napi::CallbackInfo& info);
  ~LibRawProcessor();
  
  // 静态方法
  static Napi::Value GetVersion(const Napi::CallbackInfo& info);
  static Napi::Value GetCameraList(const Napi::CallbackInfo& info);
  static Napi::Value GetCameraCount(const Napi::CallbackInfo& info);

private:
  LibRaw* processor_;
  bool imageLoaded_;
  bool imageProcessed_;
  std::string lastError_;
  
  // 实例方法
  Napi::Value LoadFile(const Napi::CallbackInfo& info);
  Napi::Value LoadBuffer(const Napi::CallbackInfo& info);
  Napi::Value Unpack(const Napi::CallbackInfo& info);
  Napi::Value ProcessImage(const Napi::CallbackInfo& info);
  Napi::Value GetMetadata(const Napi::CallbackInfo& info);
  Napi::Value GetImageSize(const Napi::CallbackInfo& info);
  Napi::Value GetColorInfo(const Napi::CallbackInfo& info);
  Napi::Value GetLensInfo(const Napi::CallbackInfo& info);
  Napi::Value SetOutputParams(const Napi::CallbackInfo& info);
  Napi::Value CreateMemoryImage(const Napi::CallbackInfo& info);
  Napi::Value WritePPM(const Napi::CallbackInfo& info);
  Napi::Value WriteTIFF(const Napi::CallbackInfo& info);
  Napi::Value UnpackThumbnail(const Napi::CallbackInfo& info);
  Napi::Value GetThumbnail(const Napi::CallbackInfo& info);
  Napi::Value Close(const Napi::CallbackInfo& info);
  
  // 辅助方法
  void SetError(const std::string& error);
  Napi::Object MetadataToObject(Napi::Env env);
};

#endif // LIBRAW_PROCESSOR_H
```

##### D.4.4 src/libraw_processor.cpp (核心实现)

```cpp
#include "libraw_processor.h"
#include <cstring>
#include <vector>

Napi::FunctionReference LibRawProcessor::constructor;

Napi::Object LibRawProcessor::Init(Napi::Env env, Napi::Object exports) {
  Napi::HandleScope scope(env);
  
  Napi::Function func = DefineClass(env, "LibRaw", {
    // 静态方法
    StaticMethod("getVersion", &LibRawProcessor::GetVersion),
    StaticMethod("getCameraList", &LibRawProcessor::GetCameraList),
    StaticMethod("getCameraCount", &LibRawProcessor::GetCameraCount),
    
    // 实例方法
    InstanceMethod("loadFile", &LibRawProcessor::LoadFile),
    InstanceMethod("loadBuffer", &LibRawProcessor::LoadBuffer),
    InstanceMethod("unpack", &LibRawProcessor::Unpack),
    InstanceMethod("processImage", &LibRawProcessor::ProcessImage),
    InstanceMethod("getMetadata", &LibRawProcessor::GetMetadata),
    InstanceMethod("getImageSize", &LibRawProcessor::GetImageSize),
    InstanceMethod("getColorInfo", &LibRawProcessor::GetColorInfo),
    InstanceMethod("getLensInfo", &LibRawProcessor::GetLensInfo),
    InstanceMethod("setOutputParams", &LibRawProcessor::SetOutputParams),
    InstanceMethod("createMemoryImage", &LibRawProcessor::CreateMemoryImage),
    InstanceMethod("writePPM", &LibRawProcessor::WritePPM),
    InstanceMethod("writeTIFF", &LibRawProcessor::WriteTIFF),
    InstanceMethod("unpackThumbnail", &LibRawProcessor::UnpackThumbnail),
    InstanceMethod("getThumbnail", &LibRawProcessor::GetThumbnail),
    InstanceMethod("close", &LibRawProcessor::Close),
  });
  
  constructor = Napi::Persistent(func);
  constructor.SuppressDestruct();
  
  exports.Set("LibRaw", func);
  return exports;
}

// ==================== 构造函数和析构函数 ====================

LibRawProcessor::LibRawProcessor(const Napi::CallbackInfo& info) 
    : Napi::ObjectWrap<LibRawProcessor>(info),
      processor_(new LibRaw()),
      imageLoaded_(false),
      imageProcessed_(false) {
}

LibRawProcessor::~LibRawProcessor() {
  if (processor_) {
    processor_->recycle();
    delete processor_;
    processor_ = nullptr;
  }
}

// ==================== 静态方法 ====================

Napi::Value LibRawProcessor::GetVersion(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();
  return Napi::String::New(env, LibRaw::version());
}

Napi::Value LibRawProcessor::GetCameraList(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();
  const char** list = LibRaw::cameraList();
  
  std::vector<std::string> cameras;
  for (int i = 0; list[i] != nullptr; i++) {
    cameras.push_back(list[i]);
  }
  
  Napi::Array result = Napi::Array::New(env, cameras.size());
  for (size_t i = 0; i < cameras.size(); i++) {
    result.Set(i, Napi::String::New(env, cameras[i]));
  }
  
  return result;
}

Napi::Value LibRawProcessor::GetCameraCount(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();
  return Napi::Number::New(env, LibRaw::cameraCount());
}

// ==================== 文件加载 ====================

Napi::Value LibRawProcessor::LoadFile(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();
  
  if (info.Length() < 1 || !info[0].IsString()) {
    Napi::TypeError::New(env, "String expected for file path").ThrowAsJavaScriptException();
    return env.Null();
  }
  
  std::string filePath = info[0].As<Napi::String>().Utf8Value();
  
  // 重置状态
  processor_->recycle();
  imageLoaded_ = false;
  imageProcessed_ = false;
  
  int ret = processor_->open_file(filePath.c_str());
  if (ret != LIBRAW_SUCCESS) {
    SetError(std::string("Failed to open file: ") + libraw_strerror(ret));
    return Napi::Boolean::New(env, false);
  }
  
  ret = processor_->unpack();
  if (ret != LIBRAW_SUCCESS) {
    SetError(std::string("Failed to unpack: ") + libraw_strerror(ret));
    return Napi::Boolean::New(env, false);
  }
  
  imageLoaded_ = true;
  return Napi::Boolean::New(env, true);
}

Napi::Value LibRawProcessor::LoadBuffer(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();
  
  if (info.Length() < 1 || !info[0].IsBuffer()) {
    Napi::TypeError::New(env, "Buffer expected").ThrowAsJavaScriptException();
    return env.Null();
  }
  
  Napi::Buffer<uint8_t> buffer = info[0].As<Napi::Buffer<uint8_t>>();
  
  processor_->recycle();
  imageLoaded_ = false;
  imageProcessed_ = false;
  
  int ret = processor_->open_buffer(buffer.Data(), buffer.Length());
  if (ret != LIBRAW_SUCCESS) {
    SetError(std::string("Failed to open buffer: ") + libraw_strerror(ret));
    return Napi::Boolean::New(env, false);
  }
  
  ret = processor_->unpack();
  if (ret != LIBRAW_SUCCESS) {
    SetError(std::string("Failed to unpack: ") + libraw_strerror(ret));
    return Napi::Boolean::New(env, false);
  }
  
  imageLoaded_ = true;
  return Napi::Boolean::New(env, true);
}

// ==================== 图像处理 ====================

Napi::Value LibRawProcessor::Unpack(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();
  
  int ret = processor_->unpack();
  if (ret != LIBRAW_SUCCESS) {
    SetError(std::string("Unpack failed: ") + libraw_strerror(ret));
    return Napi::Boolean::New(env, false);
  }
  
  return Napi::Boolean::New(env, true);
}

Napi::Value LibRawProcessor::ProcessImage(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();
  
  if (!imageLoaded_) {
    Napi::Error::New(env, "No image loaded").ThrowAsJavaScriptException();
    return env.Null();
  }
  
  int ret = processor_->dcraw_process();
  if (ret != LIBRAW_SUCCESS) {
    SetError(std::string("Processing failed: ") + libraw_strerror(ret));
    return Napi::Boolean::New(env, false);
  }
  
  imageProcessed_ = true;
  return Napi::Boolean::New(env, true);
}

// ==================== 元数据获取 ====================

Napi::Value LibRawProcessor::GetMetadata(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();
  
  if (!imageLoaded_) {
    Napi::Error::New(env, "No image loaded").ThrowAsJavaScriptException();
    return env.Null();
  }
  
  libraw_iparams_t& idata = processor_->imgdata.idata;
  libraw_image_sizes_t& sizes = processor_->imgdata.sizes;
  libraw_shootinginfo_t& shootinginfo = processor_->imgdata.shootinginfo;
  libraw_makernotes_t& makernotes = processor_->imgdata.makernotes;
  
  Napi::Object result = Napi::Object::New(env);
  
  // 基本信息
  result.Set("make", Napi::String::New(env, idata.make));
  result.Set("model", Napi::String::New(env, idata.model));
  result.Set("software", Napi::String::New(env, idata.software));
  result.Set("normalizedMake", Napi::String::New(env, idata.normalized_make));
  result.Set("normalizedModel", Napi::String::New(env, idata.normalized_model));
  
  // 尺寸信息
  result.Set("width", Napi::Number::New(env, sizes.width));
  result.Set("height", Napi::Number::New(env, sizes.height));
  result.Set("rawWidth", Napi::Number::New(env, sizes.raw_width));
  result.Set("rawHeight", Napi::Number::New(env, sizes.raw_height));
  result.Set("topMargin", Napi::Number::New(env, sizes.top_margin));
  result.Set("leftMargin", Napi::Number::New(env, sizes.left_margin));
  result.Set("flip", Napi::Number::New(env, sizes.flip));
  
  // 拍摄参数
  libraw_imgother_t& other = processor_->imgdata.other;
  result.Set("iso", Napi::Number::New(env, other.iso_speed));
  result.Set("shutter", Napi::Number::New(env, other.shutter));
  result.Set("aperture", Napi::Number::New(env, other.aperture));
  result.Set("focalLength", Napi::Number::New(env, other.focal_len));
  result.Set("timestamp", Napi::Number::New(env, (double)other.timestamp));
  result.Set("shotOrder", Napi::Number::New(env, other.shot_order));
  
  // 颜色信息
  result.Set("colors", Napi::Number::New(env, idata.colors));
  result.Set("filters", Napi::Number::New(env, idata.filters));
  result.Set("cdesc", Napi::String::New(env, idata.cdesc));
  
  return result;
}

Napi::Value LibRawProcessor::GetImageSize(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();
  
  libraw_image_sizes_t& sizes = processor_->imgdata.sizes;
  
  Napi::Object result = Napi::Object::New(env);
  result.Set("width", Napi::Number::New(env, sizes.width));
  result.Set("height", Napi::Number::New(env, sizes.height));
  result.Set("rawWidth", Napi::Number::New(env, sizes.raw_width));
  result.Set("rawHeight", Napi::Number::New(env, sizes.raw_height));
  result.Set("iWidth", Napi::Number::New(env, sizes.iwidth));
  result.Set("iHeight", Napi::Number::New(env, sizes.iheight));
  result.Set("topMargin", Napi::Number::New(env, sizes.top_margin));
  result.Set("leftMargin", Napi::Number::New(env, sizes.left_margin));
  result.Set("flip", Napi::Number::New(env, sizes.flip));
  result.Set("pixelAspect", Napi::Number::New(env, sizes.pixel_aspect));
  
  return result;
}

Napi::Value LibRawProcessor::GetColorInfo(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();
  
  libraw_colordata_t& color = processor_->imgdata.color;
  
  Napi::Object result = Napi::Object::New(env);
  result.Set("blackLevel", Napi::Number::New(env, color.black));
  result.Set("maximum", Napi::Number::New(env, color.maximum));
  result.Set("fmaximum", Napi::Number::New(env, color.fmaximum));
  
  // 白平衡乘数
  Napi::Array camMul = Napi::Array::New(env, 4);
  for (int i = 0; i < 4; i++) {
    camMul.Set(i, Napi::Number::New(env, color.cam_mul[i]));
  }
  result.Set("camMul", camMul);
  
  // 预设白平衡乘数
  Napi::Array preMul = Napi::Array::New(env, 4);
  for (int i = 0; i < 4; i++) {
    preMul.Set(i, Napi::Number::New(env, color.pre_mul[i]));
  }
  result.Set("preMul", preMul);
  
  return result;
}

Napi::Value LibRawProcessor::GetLensInfo(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();
  
  libraw_lensinfo_t& lens = processor_->imgdata.lens;
  
  Napi::Object result = Napi::Object::New(env);
  result.Set("minFocal", Napi::Number::New(env, lens.MinFocal));
  result.Set("maxFocal", Napi::Number::New(env, lens.MaxFocal));
  result.Set("maxApFocal", Napi::Number::New(env, lens.MaxAp4MaxFocal));
  result.Set("maxApMinFocal", Napi::Number::New(env, lens.MaxAp4MinFocal));
  result.Set("exifMaxAp", Napi::Number::New(env, lens.EXIF_MaxAp));
  result.Set("lensMake", Napi::String::New(env, lens.LensMake));
  result.Set("lens", Napi::String::New(env, lens.Lens));
  result.Set("lensSerial", Napi::String::New(env, lens.LensSerial));
  result.Set("internalLensSerial", Napi::String::New(env, lens.InternalLensSerial));
  result.Set("focalLengthIn35mm", Napi::Number::New(env, lens.FocalLengthIn35mmFormat));
  
  return result;
}

// ==================== 输出参数设置 ====================

Napi::Value LibRawProcessor::SetOutputParams(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();
  
  if (info.Length() < 1 || !info[0].IsObject()) {
    Napi::TypeError::New(env, "Object expected for params").ThrowAsJavaScriptException();
    return env.Null();
  }
  
  Napi::Object params = info[0].As<Napi::Object>();
  libraw_output_params_t& output = processor_->imgdata.params;
  
  // 输出位深
  if (params.Has("outputBps")) {
    output.output_bps = params.Get("outputBps").As<Napi::Number>().Int32Value();
  }
  
  // 输出色彩空间 (0=raw, 1=sRGB, 2=Adobe, 3=Wide, 4=ProPhoto, 5=XYZ)
  if (params.Has("outputColor")) {
    output.output_color = params.Get("outputColor").As<Napi::Number>().Int32Value();
  }
  
  // 白平衡
  if (params.Has("useAutoWb")) {
    output.use_auto_wb = params.Get("useAutoWb").As<Napi::Boolean>().Value() ? 1 : 0;
  }
  if (params.Has("useCameraWb")) {
    output.use_camera_wb = params.Get("useCameraWb").As<Napi::Boolean>().Value() ? 1 : 0;
  }
  
  // 亮度调整
  if (params.Has("bright")) {
    output.bright = params.Get("bright").As<Napi::Number>().FloatValue();
  }
  if (params.Has("noAutoBright")) {
    output.no_auto_bright = params.Get("noAutoBright").As<Napi::Boolean>().Value() ? 1 : 0;
  }
  
  // Gamma
  if (params.Has("gamma")) {
    Napi::Array gamma = params.Get("gamma").As<Napi::Array>();
    if (gamma.Length() >= 2) {
      output.gamm[0] = 1.0 / gamma.Get((uint32_t)0).As<Napi::Number>().DoubleValue();
      output.gamm[1] = gamma.Get((uint32_t)1).As<Napi::Number>().DoubleValue();
    }
  }
  
  // 高光恢复
  if (params.Has("highlight")) {
    output.highlight = params.Get("highlight").As<Napi::Number>().Int32Value();
  }
  
  // Demosaic 质量 (0=linear, 1=VNG, 2=PPG, 3=AHD, 4=DCB, 11=DHT, 12=AAHD)
  if (params.Has("userQual")) {
    output.user_qual = params.Get("userQual").As<Napi::Number>().Int32Value();
  }
  
  // 半尺寸输出
  if (params.Has("halfSize")) {
    output.half_size = params.Get("halfSize").As<Napi::Boolean>().Value() ? 1 : 0;
  }
  
  return Napi::Boolean::New(env, true);
}

// ==================== 图像输出 ====================

Napi::Value LibRawProcessor::CreateMemoryImage(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();
  
  if (!imageProcessed_) {
    Napi::Error::New(env, "Image not processed").ThrowAsJavaScriptException();
    return env.Null();
  }
  
  int errc = 0;
  libraw_processed_image_t* image = processor_->dcraw_make_mem_image(&errc);
  
  if (!image || errc != LIBRAW_SUCCESS) {
    SetError(std::string("Failed to create memory image: ") + libraw_strerror(errc));
    return env.Null();
  }
  
  // 创建返回对象
  Napi::Object result = Napi::Object::New(env);
  result.Set("type", Napi::Number::New(env, image->type));
  result.Set("width", Napi::Number::New(env, image->width));
  result.Set("height", Napi::Number::New(env, image->height));
  result.Set("colors", Napi::Number::New(env, image->colors));
  result.Set("bits", Napi::Number::New(env, image->bits));
  result.Set("dataSize", Napi::Number::New(env, image->data_size));
  
  // 复制数据到 Buffer
  Napi::Buffer<uint8_t> buffer = Napi::Buffer<uint8_t>::Copy(
    env, image->data, image->data_size
  );
  result.Set("data", buffer);
  
  // 释放 LibRaw 分配的内存
  LibRaw::dcraw_clear_mem(image);
  
  return result;
}

Napi::Value LibRawProcessor::WritePPM(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();
  
  if (info.Length() < 1 || !info[0].IsString()) {
    Napi::TypeError::New(env, "String expected for file path").ThrowAsJavaScriptException();
    return env.Null();
  }
  
  std::string filePath = info[0].As<Napi::String>().Utf8Value();
  
  int ret = processor_->dcraw_ppm_tiff_writer(filePath.c_str());
  if (ret != LIBRAW_SUCCESS) {
    SetError(std::string("Failed to write PPM: ") + libraw_strerror(ret));
    return Napi::Boolean::New(env, false);
  }
  
  return Napi::Boolean::New(env, true);
}

Napi::Value LibRawProcessor::WriteTIFF(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();
  
  if (info.Length() < 1 || !info[0].IsString()) {
    Napi::TypeError::New(env, "String expected for file path").ThrowAsJavaScriptException();
    return env.Null();
  }
  
  std::string filePath = info[0].As<Napi::String>().Utf8Value();
  
  // 设置输出为 TIFF
  processor_->imgdata.params.output_tiff = 1;
  
  int ret = processor_->dcraw_ppm_tiff_writer(filePath.c_str());
  if (ret != LIBRAW_SUCCESS) {
    SetError(std::string("Failed to write TIFF: ") + libraw_strerror(ret));
    return Napi::Boolean::New(env, false);
  }
  
  return Napi::Boolean::New(env, true);
}

// ==================== 缩略图 ====================

Napi::Value LibRawProcessor::UnpackThumbnail(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();
  
  int ret = processor_->unpack_thumb();
  if (ret != LIBRAW_SUCCESS) {
    SetError(std::string("Failed to unpack thumbnail: ") + libraw_strerror(ret));
    return Napi::Boolean::New(env, false);
  }
  
  return Napi::Boolean::New(env, true);
}

Napi::Value LibRawProcessor::GetThumbnail(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();
  
  int errc = 0;
  libraw_processed_image_t* thumb = processor_->dcraw_make_mem_thumb(&errc);
  
  if (!thumb || errc != LIBRAW_SUCCESS) {
    SetError(std::string("Failed to get thumbnail: ") + libraw_strerror(errc));
    return env.Null();
  }
  
  Napi::Object result = Napi::Object::New(env);
  result.Set("type", Napi::Number::New(env, thumb->type)); // 1=JPEG, 2=BITMAP
  result.Set("width", Napi::Number::New(env, thumb->width));
  result.Set("height", Napi::Number::New(env, thumb->height));
  result.Set("colors", Napi::Number::New(env, thumb->colors));
  result.Set("bits", Napi::Number::New(env, thumb->bits));
  result.Set("dataSize", Napi::Number::New(env, thumb->data_size));
  
  Napi::Buffer<uint8_t> buffer = Napi::Buffer<uint8_t>::Copy(
    env, thumb->data, thumb->data_size
  );
  result.Set("data", buffer);
  
  LibRaw::dcraw_clear_mem(thumb);
  
  return result;
}

// ==================== 清理 ====================

Napi::Value LibRawProcessor::Close(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();
  
  processor_->recycle();
  imageLoaded_ = false;
  imageProcessed_ = false;
  
  return Napi::Boolean::New(env, true);
}

void LibRawProcessor::SetError(const std::string& error) {
  lastError_ = error;
}
```

##### D.4.5 src/async_workers.h (异步处理)

```cpp
#ifndef ASYNC_WORKERS_H
#define ASYNC_WORKERS_H

#include <napi.h>
#include <libraw/libraw.h>
#include <string>
#include <memory>

// 异步加载文件
class LoadFileWorker : public Napi::AsyncWorker {
public:
  LoadFileWorker(
    const Napi::Function& callback,
    LibRaw* processor,
    const std::string& filePath
  );
  
  void Execute() override;
  void OnOK() override;
  void OnError(const Napi::Error& error) override;

private:
  LibRaw* processor_;
  std::string filePath_;
  int result_;
};

// 异步处理图像
class ProcessImageWorker : public Napi::AsyncWorker {
public:
  ProcessImageWorker(
    const Napi::Function& callback,
    LibRaw* processor
  );
  
  void Execute() override;
  void OnOK() override;

private:
  LibRaw* processor_;
  int result_;
};

// 异步创建 JPEG Buffer
class CreateJPEGBufferWorker : public Napi::AsyncWorker {
public:
  CreateJPEGBufferWorker(
    const Napi::Function& callback,
    LibRaw* processor,
    int quality
  );
  
  void Execute() override;
  void OnOK() override;

private:
  LibRaw* processor_;
  int quality_;
  std::vector<uint8_t> jpegData_;
  int width_, height_;
};

#endif // ASYNC_WORKERS_H
```

##### D.4.6 src/async_workers.cpp

```cpp
#include "async_workers.h"
#include <cstring>

// ==================== LoadFileWorker ====================

LoadFileWorker::LoadFileWorker(
  const Napi::Function& callback,
  LibRaw* processor,
  const std::string& filePath
) : Napi::AsyncWorker(callback),
    processor_(processor),
    filePath_(filePath),
    result_(0) {
}

void LoadFileWorker::Execute() {
  processor_->recycle();
  
  result_ = processor_->open_file(filePath_.c_str());
  if (result_ != LIBRAW_SUCCESS) {
    SetError(std::string("Failed to open: ") + libraw_strerror(result_));
    return;
  }
  
  result_ = processor_->unpack();
  if (result_ != LIBRAW_SUCCESS) {
    SetError(std::string("Failed to unpack: ") + libraw_strerror(result_));
  }
}

void LoadFileWorker::OnOK() {
  Napi::HandleScope scope(Env());
  Callback().Call({
    Env().Null(),
    Napi::Boolean::New(Env(), true)
  });
}

void LoadFileWorker::OnError(const Napi::Error& error) {
  Napi::HandleScope scope(Env());
  Callback().Call({
    error.Value(),
    Env().Null()
  });
}

// ==================== ProcessImageWorker ====================

ProcessImageWorker::ProcessImageWorker(
  const Napi::Function& callback,
  LibRaw* processor
) : Napi::AsyncWorker(callback),
    processor_(processor),
    result_(0) {
}

void ProcessImageWorker::Execute() {
  result_ = processor_->dcraw_process();
  if (result_ != LIBRAW_SUCCESS) {
    SetError(std::string("Processing failed: ") + libraw_strerror(result_));
  }
}

void ProcessImageWorker::OnOK() {
  Napi::HandleScope scope(Env());
  Callback().Call({
    Env().Null(),
    Napi::Boolean::New(Env(), true)
  });
}
```

##### D.4.7 src/addon.cpp (模块入口)

```cpp
#include <napi.h>
#include "libraw_processor.h"

Napi::Object Init(Napi::Env env, Napi::Object exports) {
  LibRawProcessor::Init(env, exports);
  return exports;
}

NODE_API_MODULE(libraw_addon, Init)
```

##### D.4.8 lib/index.js (JavaScript 接口)

```javascript
'use strict';

const path = require('path');
const binding = require('node-gyp-build')(path.join(__dirname, '..'));

const { LibRaw: NativeLibRaw } = binding;

/**
 * LibRaw 处理器类
 * 封装原生模块，提供 Promise API
 */
class LibRaw {
  constructor() {
    this._processor = new NativeLibRaw();
    this._loaded = false;
    this._processed = false;
  }

  /**
   * 获取 LibRaw 版本
   * @returns {string}
   */
  static getVersion() {
    return NativeLibRaw.getVersion();
  }

  /**
   * 获取支持的相机列表
   * @returns {string[]}
   */
  static getCameraList() {
    return NativeLibRaw.getCameraList();
  }

  /**
   * 获取支持的相机数量
   * @returns {number}
   */
  static getCameraCount() {
    return NativeLibRaw.getCameraCount();
  }

  /**
   * 加载 RAW 文件
   * @param {string} filePath - 文件路径
   * @returns {Promise<boolean>}
   */
  async loadFile(filePath) {
    const result = this._processor.loadFile(filePath);
    this._loaded = result;
    this._processed = false;
    return result;
  }

  /**
   * 从 Buffer 加载
   * @param {Buffer} buffer - RAW 数据
   * @returns {Promise<boolean>}
   */
  async loadBuffer(buffer) {
    const result = this._processor.loadBuffer(buffer);
    this._loaded = result;
    this._processed = false;
    return result;
  }

  /**
   * 处理图像
   * @returns {Promise<boolean>}
   */
  async processImage() {
    if (!this._loaded) {
      throw new Error('No image loaded');
    }
    const result = this._processor.processImage();
    this._processed = result;
    return result;
  }

  /**
   * 获取元数据
   * @returns {Promise<Object>}
   */
  async getMetadata() {
    return this._processor.getMetadata();
  }

  /**
   * 获取图像尺寸
   * @returns {Promise<Object>}
   */
  async getImageSize() {
    return this._processor.getImageSize();
  }

  /**
   * 获取颜色信息
   * @returns {Promise<Object>}
   */
  async getColorInfo() {
    return this._processor.getColorInfo();
  }

  /**
   * 获取镜头信息
   * @returns {Promise<Object>}
   */
  async getLensInfo() {
    return this._processor.getLensInfo();
  }

  /**
   * 设置输出参数
   * @param {Object} params - 参数对象
   * @returns {Promise<boolean>}
   */
  async setOutputParams(params) {
    return this._processor.setOutputParams(params);
  }

  /**
   * 创建内存图像
   * @returns {Promise<Object>}
   */
  async createMemoryImage() {
    if (!this._processed) {
      throw new Error('Image not processed');
    }
    return this._processor.createMemoryImage();
  }

  /**
   * 写入 PPM 文件
   * @param {string} filePath - 输出路径
   * @returns {Promise<boolean>}
   */
  async writePPM(filePath) {
    return this._processor.writePPM(filePath);
  }

  /**
   * 写入 TIFF 文件
   * @param {string} filePath - 输出路径
   * @returns {Promise<boolean>}
   */
  async writeTIFF(filePath) {
    return this._processor.writeTIFF(filePath);
  }

  /**
   * 解包缩略图
   * @returns {Promise<boolean>}
   */
  async unpackThumbnail() {
    return this._processor.unpackThumbnail();
  }

  /**
   * 获取缩略图
   * @returns {Promise<Object>}
   */
  async getThumbnail() {
    return this._processor.getThumbnail();
  }

  /**
   * 关闭并清理资源
   * @returns {Promise<boolean>}
   */
  async close() {
    this._loaded = false;
    this._processed = false;
    return this._processor.close();
  }
}

module.exports = LibRaw;
module.exports.LibRaw = LibRaw;
module.exports.getVersion = LibRaw.getVersion;
module.exports.getCameraList = LibRaw.getCameraList;
module.exports.getCameraCount = LibRaw.getCameraCount;
```

##### D.4.9 lib/index.d.ts (TypeScript 类型)

```typescript
export interface ImageMetadata {
  make: string;
  model: string;
  software: string;
  normalizedMake: string;
  normalizedModel: string;
  width: number;
  height: number;
  rawWidth: number;
  rawHeight: number;
  topMargin: number;
  leftMargin: number;
  flip: number;
  iso: number;
  shutter: number;
  aperture: number;
  focalLength: number;
  timestamp: number;
  shotOrder: number;
  colors: number;
  filters: number;
  cdesc: string;
}

export interface ImageSize {
  width: number;
  height: number;
  rawWidth: number;
  rawHeight: number;
  iWidth: number;
  iHeight: number;
  topMargin: number;
  leftMargin: number;
  flip: number;
  pixelAspect: number;
}

export interface ColorInfo {
  blackLevel: number;
  maximum: number;
  fmaximum: number;
  camMul: [number, number, number, number];
  preMul: [number, number, number, number];
}

export interface LensInfo {
  minFocal: number;
  maxFocal: number;
  maxApFocal: number;
  maxApMinFocal: number;
  exifMaxAp: number;
  lensMake: string;
  lens: string;
  lensSerial: string;
  internalLensSerial: string;
  focalLengthIn35mm: number;
}

export interface OutputParams {
  outputBps?: number;       // 8 or 16
  outputColor?: number;     // 0=raw, 1=sRGB, 2=Adobe, 3=Wide, 4=ProPhoto, 5=XYZ
  useAutoWb?: boolean;
  useCameraWb?: boolean;
  bright?: number;
  noAutoBright?: boolean;
  gamma?: [number, number];
  highlight?: number;       // 0-9
  userQual?: number;        // Demosaic quality
  halfSize?: boolean;
}

export interface MemoryImage {
  type: number;
  width: number;
  height: number;
  colors: number;
  bits: number;
  dataSize: number;
  data: Buffer;
}

export class LibRaw {
  constructor();
  
  static getVersion(): string;
  static getCameraList(): string[];
  static getCameraCount(): number;
  
  loadFile(filePath: string): Promise<boolean>;
  loadBuffer(buffer: Buffer): Promise<boolean>;
  processImage(): Promise<boolean>;
  getMetadata(): Promise<ImageMetadata>;
  getImageSize(): Promise<ImageSize>;
  getColorInfo(): Promise<ColorInfo>;
  getLensInfo(): Promise<LensInfo>;
  setOutputParams(params: OutputParams): Promise<boolean>;
  createMemoryImage(): Promise<MemoryImage>;
  writePPM(filePath: string): Promise<boolean>;
  writeTIFF(filePath: string): Promise<boolean>;
  unpackThumbnail(): Promise<boolean>;
  getThumbnail(): Promise<MemoryImage>;
  close(): Promise<boolean>;
}

export function getVersion(): string;
export function getCameraList(): string[];
export function getCameraCount(): number;

export default LibRaw;
```

#### D.5 构建和测试

##### D.5.1 下载 LibRaw 依赖

```javascript
// scripts/download-libraw.js
const https = require('https');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const LIBRAW_VERSION = '0.22.0';
const DEPS_DIR = path.join(__dirname, '..', 'deps');

const URLS = {
  win32: `https://www.libraw.org/data/LibRaw-${LIBRAW_VERSION}-Win64.zip`,
  darwin: `https://www.libraw.org/data/LibRaw-${LIBRAW_VERSION}-macOS.zip`,
  linux: `https://www.libraw.org/data/LibRaw-${LIBRAW_VERSION}.tar.gz`
};

async function download() {
  const platform = process.platform;
  const url = URLS[platform];
  
  if (!url) {
    console.log(`Platform ${platform}: using system libraw`);
    return;
  }
  
  console.log(`Downloading LibRaw ${LIBRAW_VERSION} for ${platform}...`);
  
  // 实际下载逻辑...
  // 使用 curl 或 node-fetch 下载
  // 解压到 deps/LibRaw-0.22.0/
}

download().catch(console.error);
```

##### D.5.2 构建命令

```powershell
# 安装依赖
npm install

# 下载 LibRaw
node scripts/download-libraw.js

# 编译原生模块
npm run build

# 测试
npm test

# 创建预编译包 (可选)
npm run prebuild
```

##### D.5.3 测试文件

```javascript
// test/basic.test.js
const LibRaw = require('../lib');
const path = require('path');
const assert = require('assert');

async function test() {
  console.log('LibRaw Version:', LibRaw.getVersion());
  console.log('Camera Count:', LibRaw.getCameraCount());
  
  // 检查是否支持 Panasonic S9
  const cameras = LibRaw.getCameraList();
  const s9Supported = cameras.some(c => c.includes('DC-S9'));
  console.log('Panasonic DC-S9 supported:', s9Supported);
  
  // 测试加载文件
  const processor = new LibRaw();
  
  try {
    const testFile = path.join(__dirname, 'samples', 'test.RW2');
    
    if (require('fs').existsSync(testFile)) {
      const loaded = await processor.loadFile(testFile);
      console.log('File loaded:', loaded);
      
      const metadata = await processor.getMetadata();
      console.log('Camera:', metadata.make, metadata.model);
      console.log('Size:', metadata.width, 'x', metadata.height);
      console.log('ISO:', metadata.iso);
      
      await processor.setOutputParams({
        useCameraWb: true,
        outputBps: 16,
        outputColor: 1  // sRGB
      });
      
      await processor.processImage();
      
      const image = await processor.createMemoryImage();
      console.log('Image created:', image.width, 'x', image.height);
      console.log('Data size:', image.dataSize, 'bytes');
    }
    
    await processor.close();
    console.log('✓ All tests passed!');
    
  } catch (error) {
    console.error('Test failed:', error);
    process.exit(1);
  }
}

test();
```

#### D.6 在项目中集成

```javascript
// server/services/raw-decoder.js 替换
const LibRaw = require('libraw-node'); // 你的自建模块

class RawDecoder {
  async decode(inputPath, options = {}) {
    const processor = new LibRaw();
    
    try {
      await processor.loadFile(inputPath);
      
      await processor.setOutputParams({
        useCameraWb: options.whiteBalance === 'camera',
        useAutoWb: options.whiteBalance === 'auto',
        outputBps: options.outputBits || 16,
        outputColor: 1,  // sRGB
        userQual: options.quality || 3,  // AHD
      });
      
      await processor.processImage();
      
      const image = await processor.createMemoryImage();
      
      // 使用 sharp 转换为 JPEG/TIFF
      const sharp = require('sharp');
      const buffer = await sharp(image.data, {
        raw: {
          width: image.width,
          height: image.height,
          channels: image.colors,
        }
      })
      .jpeg({ quality: options.quality || 95 })
      .toBuffer();
      
      return buffer;
      
    } finally {
      await processor.close();
    }
  }
  
  async getMetadata(inputPath) {
    const processor = new LibRaw();
    try {
      await processor.loadFile(inputPath);
      return await processor.getMetadata();
    } finally {
      await processor.close();
    }
  }
}
```

#### D.7 复杂度评估

| 方面 | 评估 |
|------|------|
| **开发时间** | 5-7 天 (熟悉 N-API) / 2-3 周 (新手) |
| **C++ 经验要求** | 中等 |
| **跨平台编译** | 需要在各平台分别测试 |
| **维护成本** | 中等 (LibRaw 更新时需同步) |
| **性能** | 最佳 (原生性能) |
| **灵活性** | 最高 (完全可控) |

**优点**:
- 完全可控，可以精确实现所需功能
- 原生性能，无额外开销
- 可以紧跟 LibRaw 最新版本

**缺点**:
- 需要 C++ 和 Node.js N-API 经验
- 需要处理跨平台编译
- 需要持续维护
- 预编译分发需要额外工作 (prebuildify)

**建议**: 如果项目长期依赖 RAW 解码，且需要最新相机支持，此方案值得投入。

---

### 推荐实施顺序

1. **立即实施**: 方案 C (命令行后备) - 0.5天内可完成
2. **短期实施**: 方案 A (Fork lightdrift-libraw) - 2-3天
3. **可选备用**: 方案 B (Python rawpy) - 作为额外后备

### 快速验证步骤

```powershell
# 下载并验证 dcraw_emu 支持 DC-S9
cd "d:\Program Files\FilmGalery"
Invoke-WebRequest -Uri "https://www.libraw.org/data/LibRaw-0.22.0-Win64.zip" -OutFile "temp.zip"
Expand-Archive -Path "temp.zip" -DestinationPath "temp"

# 测试解码 DC-S9 文件
.\temp\LibRaw-0.22.0-Win64\bin\dcraw_emu.exe -i -v "path/to/your/DC-S9-file.RW2"

# 如果输出包含 "Panasonic DC-S9" 说明支持成功
```

---

## 9. 更新日志

| 日期 | 状态 | 备注 |
|------|------|------|
| 2026-01-24 | 🔍 已确认 | 确认为 LibRaw 版本问题，需要 0.22+ |
| 2026-01-24 | 📋 方案整理 | 整理原生 LibRaw 0.22 升级方案 A/B/C/D |
