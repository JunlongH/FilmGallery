# 自动边缘检测 & RAW 解码 - 详细实施计划

**创建日期**: 2026-01-16  
**最后更新**: 2026-01-17  
**状态**: ✅ 重构完成 (待安装依赖和测试)  
**优先级**: 🔴 高

---

## 目录

1. [项目概述](#1-项目概述)
2. [功能一：自动边缘检测](#2-功能一自动边缘检测)
3. [功能二：RAW 解码](#3-功能二raw-解码)
4. [共享基础设施](#4-共享基础设施)
5. [实施路线图](#5-实施路线图)
6. [风险评估](#6-风险评估)

---

## 1. 项目概述

### 1.1 背景

FilmLab 当前支持手动裁剪和旋转，但缺少：
1. **自动边缘检测** - 自动识别底片边框，一键裁剪
2. **RAW 解码** - 支持数码相机 RAW 格式 (DNG, CR2, ARW, NEF 等)

### 1.2 目标

| 功能 | 目标 | 优先级 |
|------|------|--------|
| 自动边缘检测 | 检测底片边框，自动裁剪 + 水平校正 | 🔴 高 |
| RAW 解码 | 支持主流 RAW 格式导入和处理 | 🔴 高 |

### 1.3 设计原则

1. **模块化** - 每个功能独立模块，可独立测试和维护
2. **渐进增强** - 先实现核心功能，再逐步优化
3. **一致性** - 复用现有 RenderCore 架构
4. **性能优先** - 边缘检测在服务端执行，避免阻塞 UI

---

## 2. 功能一：自动边缘检测

### 2.1 需求分析

#### 2.1.1 使用场景

1. **底片扫描** - 扫描仪输出的底片图像通常包含边框
2. **批量处理** - 对整卷底片应用相同的边缘检测参数
3. **微调支持** - 自动检测后允许手动微调

#### 2.1.2 功能需求

| 需求 | 描述 | 优先级 |
|------|------|--------|
| 边框检测 | 识别底片内容区域与边框的边界 | P0 |
| 倾斜校正 | 检测并自动校正倾斜角度 | P0 |
| 多格式支持 | 支持 35mm、120、4x5 等格式 | P1 |
| 批量应用 | 将检测结果应用到多张照片 | P1 |
| 手动微调 | 检测后可手动调整 | P0 |
| 灵敏度设置 | 调整检测灵敏度 | P2 |

### 2.2 技术方案

#### 2.2.1 算法选择

```
┌─────────────────────────────────────────────────────────────────┐
│                    边缘检测算法流程                               │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  原始图像                                                        │
│      │                                                          │
│      ▼                                                          │
│  ┌─────────────────┐                                            │
│  │ 1. 预处理       │ - 缩放到工作尺寸 (max 1200px)              │
│  │                 │ - 转换为灰度                                │
│  │                 │ - 高斯模糊降噪                              │
│  └────────┬────────┘                                            │
│           │                                                      │
│           ▼                                                      │
│  ┌─────────────────┐                                            │
│  │ 2. 边缘检测     │ - Canny 边缘检测                           │
│  │                 │ - 可调阈值 (低/高)                          │
│  └────────┬────────┘                                            │
│           │                                                      │
│           ▼                                                      │
│  ┌─────────────────┐                                            │
│  │ 3. 直线检测     │ - Hough 变换                               │
│  │                 │ - 检测主要直线                              │
│  │                 │ - 按角度聚类                                │
│  └────────┬────────┘                                            │
│           │                                                      │
│           ▼                                                      │
│  ┌─────────────────┐                                            │
│  │ 4. 四边形拟合   │ - 找到最可能的矩形边框                      │
│  │                 │ - 计算交点                                  │
│  │                 │ - 验证几何合理性                            │
│  └────────┬────────┘                                            │
│           │                                                      │
│           ▼                                                      │
│  ┌─────────────────┐                                            │
│  │ 5. 输出结果     │ - cropRect: {x, y, w, h}                   │
│  │                 │ - rotation: 倾斜角度                        │
│  │                 │ - confidence: 置信度                        │
│  └─────────────────┘                                            │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

#### 2.2.2 技术选型

| 方案 | 优点 | 缺点 | 推荐 |
|------|------|------|------|
| **Sharp + 自研算法** | 无额外依赖，Sharp 已在用 | 需要手写边缘检测逻辑 | ⚠️ 备选 |
| **OpenCV.js (客户端)** | 功能强大，算法成熟 | 包体积大 (~8MB)，阻塞 UI | ❌ |
| **opencv4nodejs (服务端)** | 功能完整，性能好 | 安装复杂，原生依赖 | ⚠️ 可选 |
| **Sharp + Jimp** | Sharp 预处理 + Jimp 像素操作 | 两个库配合 | ✅ 推荐 |

**推荐方案**: Sharp 负责图像 I/O 和预处理，自研简化版 Canny + Hough 算法

#### 2.2.3 简化版算法 (无 OpenCV 依赖)

```javascript
// packages/shared/edgeDetection/index.js

/**
 * 边缘检测核心算法
 * 
 * 不依赖 OpenCV，使用纯 JavaScript 实现简化版 Canny + Hough
 */

// 1. Sobel 梯度计算
function sobelGradient(pixels, width, height) {
  const gx = new Float32Array(width * height);
  const gy = new Float32Array(width * height);
  const magnitude = new Float32Array(width * height);
  const direction = new Float32Array(width * height);
  
  const sobelX = [-1, 0, 1, -2, 0, 2, -1, 0, 1];
  const sobelY = [-1, -2, -1, 0, 0, 0, 1, 2, 1];
  
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      let sumX = 0, sumY = 0;
      for (let ky = -1; ky <= 1; ky++) {
        for (let kx = -1; kx <= 1; kx++) {
          const idx = (y + ky) * width + (x + kx);
          const kidx = (ky + 1) * 3 + (kx + 1);
          sumX += pixels[idx] * sobelX[kidx];
          sumY += pixels[idx] * sobelY[kidx];
        }
      }
      const idx = y * width + x;
      gx[idx] = sumX;
      gy[idx] = sumY;
      magnitude[idx] = Math.sqrt(sumX * sumX + sumY * sumY);
      direction[idx] = Math.atan2(sumY, sumX);
    }
  }
  
  return { gx, gy, magnitude, direction };
}

// 2. 非极大值抑制
function nonMaxSuppression(magnitude, direction, width, height) {
  const output = new Float32Array(width * height);
  
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const idx = y * width + x;
      const angle = direction[idx] * 180 / Math.PI;
      const mag = magnitude[idx];
      
      let neighbor1 = 0, neighbor2 = 0;
      
      // 量化方向为 4 个主要方向
      if ((angle >= -22.5 && angle < 22.5) || (angle >= 157.5 || angle < -157.5)) {
        neighbor1 = magnitude[idx - 1];
        neighbor2 = magnitude[idx + 1];
      } else if ((angle >= 22.5 && angle < 67.5) || (angle >= -157.5 && angle < -112.5)) {
        neighbor1 = magnitude[(y - 1) * width + x + 1];
        neighbor2 = magnitude[(y + 1) * width + x - 1];
      } else if ((angle >= 67.5 && angle < 112.5) || (angle >= -112.5 && angle < -67.5)) {
        neighbor1 = magnitude[(y - 1) * width + x];
        neighbor2 = magnitude[(y + 1) * width + x];
      } else {
        neighbor1 = magnitude[(y - 1) * width + x - 1];
        neighbor2 = magnitude[(y + 1) * width + x + 1];
      }
      
      output[idx] = (mag >= neighbor1 && mag >= neighbor2) ? mag : 0;
    }
  }
  
  return output;
}

// 3. 双阈值和边缘追踪
function hysteresisThreshold(edges, width, height, lowThreshold, highThreshold) {
  const strong = 255;
  const weak = 50;
  const output = new Uint8Array(width * height);
  
  for (let i = 0; i < edges.length; i++) {
    if (edges[i] >= highThreshold) {
      output[i] = strong;
    } else if (edges[i] >= lowThreshold) {
      output[i] = weak;
    }
  }
  
  // 边缘追踪：弱边缘连接到强边缘则保留
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const idx = y * width + x;
      if (output[idx] === weak) {
        // 检查 8 邻域是否有强边缘
        let hasStrong = false;
        for (let dy = -1; dy <= 1 && !hasStrong; dy++) {
          for (let dx = -1; dx <= 1 && !hasStrong; dx++) {
            if (output[(y + dy) * width + (x + dx)] === strong) {
              hasStrong = true;
            }
          }
        }
        output[idx] = hasStrong ? strong : 0;
      }
    }
  }
  
  return output;
}

// 4. Hough 变换检测直线
function houghLines(edges, width, height, threshold = 100) {
  const diagLen = Math.ceil(Math.sqrt(width * width + height * height));
  const numThetas = 180;
  const accumulator = new Int32Array(diagLen * 2 * numThetas);
  
  // 预计算 sin/cos
  const cosTheta = new Float32Array(numThetas);
  const sinTheta = new Float32Array(numThetas);
  for (let t = 0; t < numThetas; t++) {
    const theta = (t - 90) * Math.PI / 180;
    cosTheta[t] = Math.cos(theta);
    sinTheta[t] = Math.sin(theta);
  }
  
  // 投票
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (edges[y * width + x] > 0) {
        for (let t = 0; t < numThetas; t++) {
          const rho = Math.round(x * cosTheta[t] + y * sinTheta[t]) + diagLen;
          accumulator[rho * numThetas + t]++;
        }
      }
    }
  }
  
  // 提取峰值
  const lines = [];
  for (let rho = 0; rho < diagLen * 2; rho++) {
    for (let t = 0; t < numThetas; t++) {
      if (accumulator[rho * numThetas + t] >= threshold) {
        lines.push({
          rho: rho - diagLen,
          theta: (t - 90) * Math.PI / 180,
          votes: accumulator[rho * numThetas + t]
        });
      }
    }
  }
  
  // 按票数排序
  lines.sort((a, b) => b.votes - a.votes);
  
  return lines;
}

// 5. 从直线集合中找到矩形
function findRectangle(lines, width, height) {
  // 将直线按角度聚类为水平和垂直两组
  const horizontal = [];
  const vertical = [];
  
  for (const line of lines) {
    const angleDeg = line.theta * 180 / Math.PI;
    if (Math.abs(angleDeg) < 20 || Math.abs(angleDeg) > 160) {
      vertical.push(line);
    } else if (Math.abs(angleDeg - 90) < 20 || Math.abs(angleDeg + 90) < 20) {
      horizontal.push(line);
    }
  }
  
  // 需要至少 2 条水平线和 2 条垂直线
  if (horizontal.length < 2 || vertical.length < 2) {
    return null;
  }
  
  // 取票数最高的各两条
  const h1 = horizontal[0], h2 = horizontal[1];
  const v1 = vertical[0], v2 = vertical[1];
  
  // 计算四个交点
  // ... (省略交点计算逻辑)
  
  return {
    cropRect: { x: 0.1, y: 0.1, w: 0.8, h: 0.8 }, // 归一化坐标
    rotation: 0, // 检测到的倾斜角度
    confidence: 0.85
  };
}
```

### 2.3 文件结构

```
packages/
  shared/
    edgeDetection/
      index.js              # 统一入口
      cannyEdge.js          # Canny 边缘检测
      houghTransform.js     # Hough 变换
      rectangleFinder.js    # 矩形查找
      utils.js              # 工具函数 (高斯模糊、卷积等)

server/
  services/
    edge-detection-service.js   # 边缘检测服务
  routes/
    edge-detection.js           # API 端点

client/
  src/
    components/
      FilmLab/
        AutoCropButton.jsx      # 自动裁剪按钮
        EdgeDetectionPreview.jsx # 检测结果预览
```

### 2.4 API 设计

```javascript
// POST /api/photos/:id/detect-edges
// 请求
{
  sensitivity: 50,           // 0-100, 边缘检测灵敏度
  filmFormat: 'auto',        // 'auto' | '35mm' | '120' | '4x5'
  expectDarkBorder: true     // 底片边缘通常较暗
}

// 响应
{
  success: true,
  result: {
    cropRect: { x: 0.05, y: 0.08, w: 0.90, h: 0.84 },
    rotation: -1.2,          // 检测到的倾斜角度 (度)
    confidence: 0.92,        // 置信度 0-1
    debugInfo: {
      edgeCount: 1234,
      linesDetected: 12,
      processingTimeMs: 156
    }
  }
}

// POST /api/photos/batch-detect-edges
// 批量检测
{
  photoIds: [1, 2, 3, ...],
  sensitivity: 50,
  filmFormat: 'auto'
}
```

### 2.5 UI 设计

```
┌─────────────────────────────────────────────────────────────────┐
│  FilmLab 工具栏                                                  │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  [裁剪] [旋转] [🔍 自动检测边缘]  灵敏度: [━━━━●━━━] 50         │
│                    ▲                                            │
│                    │                                            │
│            点击后显示检测结果预览                                 │
│                                                                 │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │                                                           │  │
│  │        ╔═══════════════════════════════════╗              │  │
│  │        ║                                   ║◄─ 检测到的   │  │
│  │        ║       底片内容区域                 ║   边框      │  │
│  │        ║                                   ║              │  │
│  │        ╚═══════════════════════════════════╝              │  │
│  │                        ↻ -1.2°                            │  │
│  │                     (倾斜校正)                             │  │
│  └───────────────────────────────────────────────────────────┘  │
│                                                                 │
│  [取消] [应用检测结果] [应用到整卷]                               │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## 3. 功能二：RAW 解码

### 3.1 需求分析

#### 3.1.1 使用场景

1. **数码扫描** - 用数码相机翻拍底片，输出 RAW 格式
2. **高质量工作流** - 保留最大动态范围和色彩信息
3. **白平衡调整** - RAW 允许后期调整白平衡

#### 3.1.2 功能需求

| 需求 | 描述 | 优先级 |
|------|------|------|
| 格式支持 | DNG, CR2 (Canon), ARW (Sony), NEF (Nikon), ORF (Olympus), RAF (Fuji) | P0 |
| 元数据提取 | 相机型号、镜头、ISO、快门速度等 | P0 |
| 白平衡选项 | 相机预设 / 自动 / 手动调整 | P1 |
| 去马赛克算法 | 高质量 demosaic (AHD/PPG) | P1 |
| 色彩空间 | sRGB / AdobeRGB / ProPhotoRGB 输出 | P2 |
| 批量处理 | 批量导入 RAW 并解码 | P1 |

### 3.2 技术方案

#### 3.2.1 技术选型

| 方案 | 优点 | 缺点 | 推荐 |
|------|------|------|------|
| **dcraw (CLI)** | 开源成熟，支持格式广 | 需要子进程调用，速度一般 | ✅ 推荐 |
| **LibRaw (native)** | 速度快，功能完整 | 需要编译原生模块 | ⚠️ 可选 |
| **Sharp (libvips)** | 已在项目中使用 | RAW 支持有限 | ⚠️ 备选 |
| **Adobe DNG SDK** | 官方实现 | 商业限制，集成复杂 | ❌ |

**推荐方案**: 
1. **首选**: 使用 `dcraw` CLI 工具，通过 Node.js `child_process` 调用
2. **备选**: 如果需要更好性能，后期迁移到 `LibRaw`

#### 3.2.2 Sharp 的 RAW 支持检查

Sharp 通过 libvips 支持部分 RAW 格式，但依赖编译时选项：

```javascript
// 检查 Sharp RAW 支持
const sharp = require('sharp');

async function checkRawSupport() {
  const formats = await sharp.format();
  console.log('Supported formats:', Object.keys(formats));
  // 检查是否有 'raw' 或 'magick' loader
}
```

#### 3.2.3 dcraw 集成方案

```javascript
// server/services/raw-decoder.js

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs').promises;
const os = require('os');

/**
 * RAW 解码器服务
 * 
 * 使用 dcraw 将 RAW 文件转换为 16-bit TIFF
 */
class RawDecoder {
  constructor() {
    this.dcrawPath = this.findDcraw();
    this.tempDir = path.join(os.tmpdir(), 'filmgallery-raw');
  }
  
  /**
   * 查找 dcraw 可执行文件
   */
  findDcraw() {
    // Windows: 使用打包的 dcraw.exe
    // Linux/Mac: 尝试系统 PATH
    if (process.platform === 'win32') {
      return path.join(__dirname, '../../bin/dcraw.exe');
    }
    return 'dcraw'; // 依赖 PATH
  }
  
  /**
   * 检查 dcraw 是否可用
   */
  async isAvailable() {
    try {
      await this.execute(['-i', '-v']);
      return true;
    } catch {
      return false;
    }
  }
  
  /**
   * 解码 RAW 文件
   * 
   * @param {string} inputPath - RAW 文件路径
   * @param {Object} options - 解码选项
   * @returns {Object} - { outputPath, metadata }
   */
  async decode(inputPath, options = {}) {
    const {
      colorSpace = 'srgb',      // 'srgb' | 'adobe' | 'prophoto'
      whiteBalance = 'camera',  // 'camera' | 'auto' | 'daylight' | {r, g, b}
      quality = 3,              // 0=bilinear, 1=VNG, 2=PPG, 3=AHD
      outputBits = 16,          // 8 或 16
      halfSize = false          // 半尺寸输出 (更快)
    } = options;
    
    // 确保临时目录存在
    await fs.mkdir(this.tempDir, { recursive: true });
    
    // 构建 dcraw 参数
    const args = [
      '-v',                           // Verbose
      '-w',                           // 使用相机白平衡 (可覆盖)
      '-o', this.getColorSpaceCode(colorSpace),
      '-q', String(quality),
      '-T',                           // 输出 TIFF
    ];
    
    if (outputBits === 16) {
      args.push('-6');                // 16-bit 输出
    }
    
    if (halfSize) {
      args.push('-h');                // 半尺寸
    }
    
    // 白平衡处理
    if (whiteBalance === 'auto') {
      args.push('-a');                // 自动白平衡
    } else if (whiteBalance === 'daylight') {
      args.push('-r', '1', '1', '1', '1'); // 日光预设
    } else if (typeof whiteBalance === 'object') {
      args.push('-r', 
        String(whiteBalance.r || 1),
        String(whiteBalance.g1 || 1),
        String(whiteBalance.b || 1),
        String(whiteBalance.g2 || 1)
      );
    }
    // 'camera' 是默认 (-w)
    
    args.push(inputPath);
    
    // 执行 dcraw
    const result = await this.execute(args);
    
    // dcraw 输出文件名: 原文件名.tiff
    const baseName = path.basename(inputPath, path.extname(inputPath));
    const outputPath = path.join(path.dirname(inputPath), `${baseName}.tiff`);
    
    // 移动到临时目录 (可选)
    const finalPath = path.join(this.tempDir, `${baseName}_${Date.now()}.tiff`);
    await fs.rename(outputPath, finalPath);
    
    // 提取元数据
    const metadata = await this.extractMetadata(inputPath);
    
    return {
      outputPath: finalPath,
      metadata,
      processingInfo: result.stderr
    };
  }
  
  /**
   * 提取 RAW 元数据
   */
  async extractMetadata(inputPath) {
    try {
      const result = await this.execute(['-i', '-v', inputPath]);
      return this.parseMetadataOutput(result.stdout + result.stderr);
    } catch {
      return {};
    }
  }
  
  /**
   * 解析 dcraw 元数据输出
   */
  parseMetadataOutput(output) {
    const metadata = {};
    const lines = output.split('\n');
    
    for (const line of lines) {
      if (line.includes('Camera:')) {
        metadata.camera = line.split(':')[1]?.trim();
      }
      if (line.includes('ISO speed:')) {
        metadata.iso = parseInt(line.split(':')[1]);
      }
      if (line.includes('Shutter:')) {
        metadata.shutter = line.split(':')[1]?.trim();
      }
      if (line.includes('Aperture:')) {
        metadata.aperture = line.split(':')[1]?.trim();
      }
      if (line.includes('Image size:')) {
        const match = line.match(/(\d+)\s*x\s*(\d+)/);
        if (match) {
          metadata.width = parseInt(match[1]);
          metadata.height = parseInt(match[2]);
        }
      }
    }
    
    return metadata;
  }
  
  /**
   * 获取色彩空间代码
   */
  getColorSpaceCode(colorSpace) {
    const codes = {
      'srgb': '1',
      'adobe': '2',
      'prophoto': '4',
      'xyz': '5'
    };
    return codes[colorSpace] || '1';
  }
  
  /**
   * 执行 dcraw 命令
   */
  execute(args) {
    return new Promise((resolve, reject) => {
      const proc = spawn(this.dcrawPath, args);
      let stdout = '';
      let stderr = '';
      
      proc.stdout.on('data', (data) => { stdout += data; });
      proc.stderr.on('data', (data) => { stderr += data; });
      
      proc.on('close', (code) => {
        if (code === 0) {
          resolve({ stdout, stderr, code });
        } else {
          reject(new Error(`dcraw exited with code ${code}: ${stderr}`));
        }
      });
      
      proc.on('error', reject);
    });
  }
  
  /**
   * 清理临时文件
   */
  async cleanup(olderThanMs = 3600000) { // 默认 1 小时
    try {
      const files = await fs.readdir(this.tempDir);
      const now = Date.now();
      
      for (const file of files) {
        const filePath = path.join(this.tempDir, file);
        const stat = await fs.stat(filePath);
        if (now - stat.mtimeMs > olderThanMs) {
          await fs.unlink(filePath);
        }
      }
    } catch (e) {
      console.warn('RAW temp cleanup error:', e.message);
    }
  }
}

// 单例导出
module.exports = new RawDecoder();
```

### 3.3 文件结构

```
server/
  bin/
    dcraw.exe              # Windows 版 dcraw (需要下载)
    dcraw                  # Linux/Mac 版 (可选，通常使用系统安装)
  services/
    raw-decoder.js         # RAW 解码服务
  routes/
    raw.js                 # RAW 相关 API

packages/
  shared/
    rawFormats.js          # RAW 格式常量和工具

client/
  src/
    components/
      RawImportWizard/
        index.jsx          # RAW 导入向导
        RawPreview.jsx     # RAW 预览
        RawSettings.jsx    # 解码设置
```

### 3.4 API 设计

```javascript
// POST /api/raw/decode
// 请求
{
  filePath: "/path/to/photo.CR2",
  options: {
    colorSpace: 'srgb',        // 'srgb' | 'adobe' | 'prophoto'
    whiteBalance: 'camera',    // 'camera' | 'auto' | 'daylight' | {r, g, b}
    quality: 3,                // demosaic 质量 (0-3)
    outputBits: 16,
    halfSize: false
  }
}

// 响应
{
  success: true,
  result: {
    tempPath: "/tmp/filmgallery-raw/photo_123456.tiff",
    metadata: {
      camera: "Canon EOS R5",
      lens: "RF 100mm F2.8L MACRO IS USM",
      iso: 100,
      shutter: "1/125",
      aperture: "f/8",
      width: 8192,
      height: 5464
    },
    processingTimeMs: 2345
  }
}

// POST /api/raw/import
// 导入 RAW 到相册
{
  rawPath: "/path/to/photo.CR2",
  rollId: 123,
  decodeOptions: { ... },
  saveOriginalRaw: true        // 是否保留原始 RAW 文件
}

// GET /api/raw/supported-formats
// 获取支持的格式列表
{
  formats: [
    { ext: '.dng', name: 'Adobe DNG', supported: true },
    { ext: '.cr2', name: 'Canon RAW 2', supported: true },
    { ext: '.cr3', name: 'Canon RAW 3', supported: false }, // dcraw 不支持
    { ext: '.arw', name: 'Sony Alpha RAW', supported: true },
    { ext: '.nef', name: 'Nikon RAW', supported: true },
    { ext: '.orf', name: 'Olympus RAW', supported: true },
    { ext: '.raf', name: 'Fuji RAW', supported: true },
  ]
}
```

### 3.5 UI 设计

```
┌─────────────────────────────────────────────────────────────────┐
│  RAW 导入向导                                          [×]      │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  步骤 1: 选择 RAW 文件                                           │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │  📁 拖放 RAW 文件到这里，或点击选择                       │    │
│  │                                                         │    │
│  │  支持格式: DNG, CR2, ARW, NEF, ORF, RAF                 │    │
│  └─────────────────────────────────────────────────────────┘    │
│                                                                 │
│  已选择: IMG_0001.CR2 (Canon EOS R5, 45MB)                      │
│                                                                 │
├─────────────────────────────────────────────────────────────────┤
│  步骤 2: 解码设置                                                │
│                                                                 │
│  白平衡:    [相机预设 ▼]                                         │
│  色彩空间:  [sRGB ▼]                                             │
│  输出位深:  [16-bit ▼]                                           │
│  质量:      [高质量 (AHD) ▼]                                     │
│                                                                 │
│  □ 保留原始 RAW 文件                                             │
│                                                                 │
├─────────────────────────────────────────────────────────────────┤
│  预览:                                                           │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │                                                         │    │
│  │              [RAW 预览图]                                │    │
│  │                                                         │    │
│  └─────────────────────────────────────────────────────────┘    │
│                                                                 │
│                                    [取消]  [导入到 Roll #12]    │
└─────────────────────────────────────────────────────────────────┘
```

---

## 4. 共享基础设施

### 4.1 图像处理管道扩展

两个新功能都需要扩展现有的图像处理管道：

```
┌─────────────────────────────────────────────────────────────────┐
│                     扩展后的处理管道                              │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  输入 ───────────────────────────────────────────────────────▶  │
│    │                                                            │
│    ├─ JPEG/TIFF/PNG ──┬──────────────────────────────────────▶  │
│    │                  │                                         │
│    └─ RAW ─────┬──────┘                                         │
│                │                                                │
│                ▼                                                │
│         ┌──────────────┐                                        │
│         │ RAW Decoder  │ ◄─────────────────────────── 新增     │
│         │ (dcraw)      │                                        │
│         └──────┬───────┘                                        │
│                │                                                │
│                ▼                                                │
│         ┌──────────────┐                                        │
│         │ Edge Detect  │ ◄─────────────────────────── 新增     │
│         │ (可选)       │                                        │
│         └──────┬───────┘                                        │
│                │                                                │
│                ▼                                                │
│         ┌──────────────┐                                        │
│         │ RenderCore   │ ◄─────────────────────────── 现有     │
│         │ (处理管线)   │                                        │
│         └──────┬───────┘                                        │
│                │                                                │
│                ▼                                                │
│             输出                                                 │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### 4.2 配置管理

```javascript
// packages/shared/config/features.js

module.exports = {
  edgeDetection: {
    enabled: true,
    defaultSensitivity: 50,
    maxProcessingTimeMs: 5000,
    supportedFormats: ['35mm', '120', '4x5', 'auto']
  },
  rawDecode: {
    enabled: true,
    supportedExtensions: ['.dng', '.cr2', '.arw', '.nef', '.orf', '.raf'],
    defaultQuality: 3,
    defaultColorSpace: 'srgb',
    maxFileSizeMB: 200,
    cleanupIntervalMs: 3600000
  }
};
```

---

## 5. 实施路线图

### 5.1 阶段划分

| 阶段 | 内容 | 工时 | 状态 |
|------|------|------|------|
| **Phase 1** | 边缘检测核心算法 | 2 天 | ✅ 已完成 |
| **Phase 2** | 边缘检测 API + 服务 | 1 天 | ✅ 已完成 |
| **Phase 3** | 边缘检测 UI 集成 | 1 天 | ✅ 已完成 |
| **Phase 4** | RAW 解码器服务 | 2 天 | ✅ 已完成 |
| **Phase 5** | RAW 导入向导 UI | 1 天 | ✅ 已完成 |
| **Phase 6** | 集成测试 + 优化 | 1 天 | 📋 待开始 |

**总计**: 约 8 个工作日

### 5.2 详细任务分解

#### Phase 1: 边缘检测核心算法 (2 天) ✅ 已完成

- [x] 创建 `packages/shared/edgeDetection/` 目录结构
- [x] 实现 Sobel 梯度计算 (`cannyEdge.js`)
- [x] 实现非极大值抑制 (`cannyEdge.js`)
- [x] 实现双阈值和边缘追踪 (Canny) (`cannyEdge.js`)
- [x] 实现 Hough 变换 (`houghTransform.js`)
- [x] 实现矩形查找算法 (`rectangleFinder.js`)
- [x] 工具函数 (`utils.js`)
- [ ] 单元测试

#### Phase 2: 边缘检测 API + 服务 (1 天) ✅ 已完成

- [x] 创建 `server/services/edge-detection-service.js`
- [x] 创建 `server/routes/edge-detection.js`
- [x] Sharp 预处理集成
- [x] 注册路由到 server.js
- [ ] API 测试

#### Phase 3: 边缘检测 UI 集成 (1 天) ✅ 已完成

- [x] 创建 `AutoCropButton.jsx`
- [x] 集成到 FilmLabControls
- [x] 添加 API 函数到 api.js
- [x] 传递 props (photoId, cropRect, setCropRect)
- [ ] 添加"应用到整卷"功能

#### Phase 4: RAW 解码器服务 (2 天) ✅ 已完成

- [x] 创建 `server/services/raw-decoder.js`
- [x] 创建 `server/routes/raw.js`
- [x] 实现元数据提取
- [x] 实现临时文件清理
- [x] 注册路由到 server.js
- [ ] 下载并集成 dcraw.exe (Windows) - 需要用户手动安装
- [ ] 测试各种 RAW 格式

#### Phase 5: RAW 导入向导 UI (1 天) ✅ 已完成

- [x] 创建 `RawImportWizard/` 组件目录
- [x] 实现文件选择 + 拖放
- [x] 实现解码设置面板
- [x] 实现预览功能
- [x] 添加 API 函数到 api.js
- [x] 集成到 RollDetail 页面

#### Phase 6: 集成测试 + 优化 (1 天)

- [ ] 端到端测试
- [ ] 性能优化
- [ ] 错误处理完善
- [ ] 文档更新

---

## 6. 风险评估

### 6.1 技术风险

| 风险 | 影响 | 缓解措施 |
|------|------|----------|
| 边缘检测准确度不足 | 中 | 提供手动微调功能；逐步优化算法 |
| dcraw 不支持新 RAW 格式 (如 CR3) | 中 | 提示用户转换为 DNG；后期考虑 LibRaw |
| 性能问题 (大图处理慢) | 中 | 使用缩略图检测；后台处理 |
| dcraw 安装/分发问题 | 低 | 打包到应用中；提供安装指引 |

### 6.2 依赖风险

| 依赖 | 风险 | 备选方案 |
|------|------|----------|
| dcraw | 项目已停止维护 | 迁移到 LibRaw 或使用 Sharp 的有限 RAW 支持 |
| Sharp | 低风险，活跃维护 | - |

---

## 7. 重构计划 (2026-01-17)

### 7.1 重构背景

基于实际使用反馈，需要进行以下重构libraw` npm 包实现零配置
2. **上传流程统一**: 移除独立的 RAW 导入，将 RAW 支持集成到现有上传流程
3. **上传类型选择**: RollDetail 上传需支持选择 正片/负片/原图 三种类型
4. **边缘检测修复**: 修复 SQL 查询 API 调用错误
5. **进度条支持**: 所有上传和处理操作需要显示进度

### 7.2 详细需求

#### 7.2.1 RAW 解码器重构

| 当前状态 | 目标状态 |
|----------|----------|
| 使用 dcraw CLI (需手动安装) | 使用 libraw npm 包 (自动安装) |
| 仅 RAW 专用导入支持 RAW | 所有原图上传都支持 RAW |
| 无进度反馈 | 有进度反馈 |

**技术方案**:
- 安装 `libraw` npm 包 (https://www.npmjs.com/package/libraw)
- 重写 `server/services/raw-decoder.js` 使用 libraw API
- 保留 dcraw 作为 fallback (可选)

#### 7.2.2 上传类型三选一

**UI 变更** (RollDetail.jsx):
```
┌─────────────────────────────────────────────────────┐
│  上传照片                                           │
│  ┌─────────────────────────────────────────────┐   │
│  │  📁 选择文件或拖拽到此处                     │   │
│  │     支持: JPG, TIFF, PNG, DNG, CR2, ARW...  │   │
│  └─────────────────────────────────────────────┘   │
│                                                     │
│  上传类型:                                          │
│  ○ 正片 (Positive) - 已处理的正像                   │
│  ○ 负片 (Negative) - 未处理的负像                   │
│  ● 原图 (Original) - 原始扫描/RAW，用于 FilmLab 处理 │
│                                                     │
│  [上传]                                             │
└─────────────────────────────────────────────────────┘
```

**数据流**:
- **正片**: 直接存储为 `full/` 和 `thumb/`
- **负片**: 存储为 `negative/` 和 `negative/thumb/`
- **原图**: 存储为 `originals/`，如果是 RAW 则自动解码为 TIFF

#### 7.2.3 RAW 支持范围

需要支持 RAW 的上传入口:

| 入口 | 文件 | 需要修改 |
|------|------|----------|
| 新建 Roll | `NewRollForm.jsx` | 扩展文件过滤器，添加 RAW 处理 |
| 添加到 Roll | `RollDetail.jsx` | 扩展文件过滤器，添加类型选择 |
| 服务端处理 | `rolls.js` | 检测 RAW 并调用解码器 |

#### 7.2.4 边缘检测 SQL 修复

**问题**: `edge-detection.js` 和 `raw.js` 错误地传递 `req.db` 参数

**修复**: 
```javascript
// 错误 ❌
const photo = await getAsync(req.db, 'SELECT * FROM photos WHERE id = ?', [photoId]);

// 正确 ✅
const photo = await getAsync('SELECT * FROM photos WHERE id = ?', [photoId]);
```

### 7.3 实施计划

| 阶段 | 任务 | 优先级 | 状态 |
|------|------|--------|------|
| R1 | 修复边缘检测 SQL 错误 | 🔴 高 | ✅ 完成 |
| R2 | 安装 lightdrift-libraw npm 包 | 🔴 高 | ✅ 完成 |
| R3 | 重写 raw-decoder.js 使用 libraw | 🔴 高 | ✅ 完成 |
| R4 | 修改 RollDetail 上传支持类型选择 | 🔴 高 | ✅ 完成 |
| R5 | 修改 rolls.js 支持 RAW 解码 | 🔴 高 | ✅ 完成 |
| R6 | 添加进度条支持 | 🟡 中 | ✅ 完成 |
| R7 | 移除独立 RAW 导入按钮 | 🟢 低 | ✅ 完成 |
| R8 | 更新 NewRollForm RAW 支持 | 🟡 中 | ✅ 完成 |

### 7.4 详细任务分解

#### R1: 修复边缘检测 SQL 错误 ✅

修改文件:
- `server/routes/edge-detection.js` - 移除所有 `req.db` 参数
- `server/routes/raw.js` - 移除所有 `req.db` 参数

#### R2-R3: LibRaw 集成 ✅

使用 `libraw-wasm` npm 包 (WebAssembly 版本):
- **零配置安装**: 纯 JS/WASM，无需编译，无需 Visual Studio
- **全平台支持**: Windows/Linux/Mac 行为一致
- **功能完整**: 基于 LibRaw C++ 核心，支持 100+ RAW 格式
- **性能优秀**: WASM 性能接近原生，足以满足导入需求

```javascript
// server/services/raw-decoder.js 架构
const fs = require('fs/promises');
const wasmLibrary = require('libraw-wasm'); // 假设包名

class RawDecoder {
  async decode(filePath) {
    // 1. 读取文件 Buffer
    const fileBuffer = await fs.readFile(filePath);
    
    // 2. WASM 解码
    const decoded = await wasmLibrary.decode(fileBuffer);
    
    // 3. 转换为 Sharp 可读格式 (PPM/TIFF)
    return decoded.buffer; 
  }
}
```

#### R4: RollDetail 上传类型选择

```jsx
// 新增状态
const [uploadType, setUploadType] = useState('positive'); // 'positive' | 'negative' | 'original'

// UI: 三个单选按钮
<div className="upload-type-selector">
  <label><input type="radio" value="positive" checked={uploadType === 'positive'} onChange={...} /> 正片</label>
  <label><input type="radio" value="negative" checked={uploadType === 'negative'} onChange={...} /> 负片</label>
  <label><input type="radio" value="original" checked={uploadType === 'original'} onChange={...} /> 原图</label>
</div>
```

#### R5: 服务端 RAW 处理流程

```
上传文件
    │
    ├─ 检测是否为 RAW 格式
    │       │
    │       ├─ 是 RAW ──▶ 调用 RawDecoder.decode()
    │       │                    │
    │       │                    ▼
    │       │              生成 TIFF 保存到 originals/
    │       │                    │
    │       └─────────────────────┤
    │                             │
    ▼                             ▼
根据 uploadType 处理:
    │
    ├─ positive ──▶ 生成 full/ + thumb/
    ├─ negative ──▶ 生成 negative/ + negative/thumb/
    └─ original ──▶ 仅保存 originals/ (用于 FilmLab 处理)
```

#### R6: 进度条支持

需要实现 Server-Sent Events (SSE) 或 WebSocket 进行实时进度推送:

```javascript
// 服务端: 使用 SSE
router.post('/api/rolls/:id/photos', async (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  
  const sendProgress = (percent, message) => {
    res.write(`data: ${JSON.stringify({ percent, message })}\n\n`);
  };
  
  // ... 处理逻辑中调用 sendProgress
});
```

### 7.5 文件变更清单

| 文件 | 操作 | 说明 |
|------|------|------|
| `server/routes/edge-detection.js` | 修改 | 修复 SQL API 调用 |
| `server/routes/raw.js` | 修改 | 修复 SQL API 调用 |
| `server/services/raw-decoder.js` | 重写 | 使用 libraw 替代 dcraw |
| `server/routes/rolls.js` | 修改 | 添加 RAW 检测和解码逻辑 |
| `client/src/components/RollDetail.jsx` | 修改 | 添加上传类型选择 |
| `client/src/components/NewRollForm.jsx` | 修改 | 扩展 RAW 文件支持 |
| `client/src/api.js` | 修改 | 添加进度回调支持 |
| `server/package.json` | 修改 | 添加 libraw 依赖 |
| `client/src/components/RawImport/` | 删除 | 移除独立导入功能 |

---

## 附录

### A. dcraw 下载和打包 (已废弃)

> ⚠️ 此方案已废弃，改用 lightdrift-libraw npm 包

~~Windows 版 dcraw 可从以下地址获取:~~
~~- https://www.cybercom.net/~dcoffin/dcraw/~~

### B. lightdrift-libraw npm 包

**选型原因**:
- ✅ Node.js Native Addon，高性能
- ✅ Windows 已打包 LibRaw DLL，无需额外安装
- ✅ 支持 100+ RAW 格式 (CR2, CR3, NEF, ARW, RAF, DNG 等)
- ✅ 支持 1000+ 相机型号
- ✅ Buffer API - 可直接创建 JPEG/PNG/TIFF 等格式
- ✅ Promise-based API，现代异步支持
- ✅ 完整元数据提取 (EXIF, 镜头信息等)

安装命令:
```bash
npm install lightdrift-libraw
```

使用示例:
```javascript
const LibRaw = require('lightdrift-libraw');

async function processRAW(inputPath) {
  const processor = new LibRaw();
  try {
    await processor.loadFile(inputPath);
    
    // 提取元数据
    const metadata = await processor.getMetadata();
    console.log(`Camera: ${metadata.make} ${metadata.model}`);
    
    // 处理图像
    await processor.processImage();
    
    // 创建 TIFF buffer
    const tiffResult = await processor.createTIFFBuffer({
      compression: 'lzw'
    });
    
    // 或创建 JPEG
    const jpegResult = await processor.createJPEGBuffer({
      quality: 85,
      width: 1920
    });
    
    return { tiffResult, jpegResult, metadata };
  } finally {
    await processor.close();
  }
}
```

文档: https://www.npmjs.com/package/lightdrift-libraw

### C. 参考资料

- [Canny Edge Detection](https://en.wikipedia.org/wiki/Canny_edge_detector)
- [Hough Transform](https://en.wikipedia.org/wiki/Hough_transform)
- [LibRaw 官方](https://www.libraw.org/)
- [lightdrift-libraw npm package](https://www.npmjs.com/package/lightdrift-libraw)

---

**文档维护者**: FilmGallery 开发团队  
**最后更新**: 2026-01-17

