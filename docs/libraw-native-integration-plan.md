# LibRaw 原生模块集成计划

## 项目概述

### 目标
将 FilmGallery 的 RAW 文件解析从 `lightdrift-libraw` (基于 LibRaw 0.21.4) 升级到自建原生模块 (基于 LibRaw 0.22+)，以支持 Panasonic DC-S9 等新相机。

### 设计原则
- **系统性**: 完整覆盖所有 RAW 解码场景
- **全面性**: 支持解码、元数据提取、缩略图提取等全部功能
- **可维护性**: 清晰的模块结构，便于后续升级 LibRaw
- **模块化**: 独立 NPM 包，可复用于其他项目

---

## 1. 现有代码分析

### 1.1 依赖关系图

```
server/routes/raw.js
       ↓
server/routes/rolls.js ──────────→ server/services/raw-decoder.js
       ↓                                        ↓
server/services/filmlab-service.js ←─────────────┘
                                                 ↓
                                        lightdrift-libraw (npm)
```

### 1.2 现有 API 接口

`RawDecoder` 类提供以下方法:

| 方法 | 用途 | 调用位置 |
|------|------|----------|
| `isRawFile(filename)` | 判断文件是否为 RAW 格式 | rolls.js, filmlab-service.js |
| `isAvailable()` | 检查解码器是否可用 | raw.js, filmlab-service.js |
| `getVersion()` | 获取版本信息 | raw.js |
| `getSupportedFormats()` | 获取支持格式列表 | raw.js |
| `decode(path, options, onProgress)` | 解码 RAW 文件 | filmlab-service.js, raw.js |
| `extractThumbnail(path)` | 提取缩略图 | raw.js |
| `getMetadata(path)` | 获取元数据 | raw.js |
| `batchDecode(files, options, onProgress)` | 批量解码 | 预留接口 |

### 1.3 当前实现问题

1. **版本限制**: lightdrift-libraw 基于 LibRaw 0.21.4，不支持 2024 年后发布的相机
2. **维护风险**: 第三方包可能停止维护
3. **功能限制**: 无法自定义 LibRaw 编译选项

---

## 2. 模块架构设计

### 2.1 包结构

```
packages/
└── @filmgallery/
    └── libraw-native/           # 新建原生模块
        ├── package.json
        ├── binding.gyp          # node-gyp 构建配置
        ├── README.md
        ├── src/
        │   ├── libraw_binding.cpp    # C++ N-API 绑定
        │   ├── async_workers.cpp     # 异步工作器
        │   └── async_workers.h
        ├── lib/
        │   ├── index.js              # 主入口
        │   ├── processor.js          # LibRaw 处理器封装
        │   ├── decoder.js            # 解码功能
        │   └── metadata.js           # 元数据提取
        ├── types/
        │   └── index.d.ts            # TypeScript 类型定义
        ├── deps/
        │   └── libraw/               # LibRaw 0.22 源码
        │       ├── libraw/
        │       ├── src/
        │       └── internal/
        ├── prebuilds/                # 预编译二进制 (可选)
        │   ├── win32-x64/
        │   ├── darwin-x64/
        │   └── linux-x64/
        └── test/
            ├── test-decode.js
            ├── test-metadata.js
            └── fixtures/
```

### 2.2 模块层次

```
┌─────────────────────────────────────────────────────────┐
│  server/services/raw-decoder.js (高层封装)              │
├─────────────────────────────────────────────────────────┤
│  @filmgallery/libraw-native/lib/processor.js            │
│  (JavaScript Promise API 封装)                          │
├─────────────────────────────────────────────────────────┤
│  @filmgallery/libraw-native/src/libraw_binding.cpp      │
│  (N-API C++ 绑定层)                                     │
├─────────────────────────────────────────────────────────┤
│  LibRaw 0.22.0 C++ 库                                   │
└─────────────────────────────────────────────────────────┘
```

---

## 3. 实施计划

### Phase 1: 基础设施 (Day 1)

**3.1 创建包目录结构**
- 创建 `packages/@filmgallery/libraw-native/`
- 配置 `package.json` (N-API 依赖)
- 配置 `binding.gyp` (跨平台构建)

**3.2 获取 LibRaw 源码**
- 下载 LibRaw 0.22.0 源码
- 放置到 `deps/libraw/` 目录
- 配置构建头文件路径

### Phase 2: C++ 绑定实现 (Day 2-3)

**3.3 核心绑定功能**

```cpp
// 导出的 N-API 函数
Napi::Object Init(Napi::Env env, Napi::Object exports) {
    // 同步方法
    exports.Set("getVersion", Napi::Function::New(env, GetVersion));
    exports.Set("getSupportedCameras", Napi::Function::New(env, GetSupportedCameras));
    
    // LibRaw 处理器类
    LibRawProcessor::Init(env, exports);
    
    return exports;
}
```

**3.4 LibRawProcessor 类实现**

| 方法 | 类型 | 说明 |
|------|------|------|
| `constructor()` | 同步 | 创建 libraw_data 实例 |
| `loadFile(path)` | 异步 | 加载 RAW 文件 |
| `loadBuffer(buffer)` | 异步 | 从 Buffer 加载 |
| `unpack()` | 异步 | 解包像素数据 |
| `dcrawProcess()` | 异步 | 执行去马赛克 |
| `makeDcrawMemImage()` | 异步 | 生成内存图像 |
| `createTIFFBuffer()` | 异步 | 生成 TIFF Buffer |
| `createJPEGBuffer(quality)` | 异步 | 生成 JPEG Buffer |
| `unpackThumbnail()` | 异步 | 解包缩略图 |
| `getMetadata()` | 同步 | 获取元数据 |
| `getImageSize()` | 同步 | 获取尺寸 |
| `close()` | 同步 | 释放资源 |

### Phase 3: JavaScript 封装 (Day 4)

**3.5 Promise API 封装**

```javascript
// lib/processor.js
class LibRawProcessor {
    constructor() {
        this._native = new NativeLibRaw();
    }
    
    async loadFile(filePath) {
        return new Promise((resolve, reject) => {
            this._native.loadFile(filePath, (err, result) => {
                if (err) reject(err);
                else resolve(result);
            });
        });
    }
    
    // ... 其他方法
}
```

**3.6 高级解码 API**

```javascript
// lib/decoder.js
async function decode(filePath, options = {}) {
    const processor = new LibRawProcessor();
    try {
        await processor.loadFile(filePath);
        await processor.dcrawProcess(options.processParams);
        
        if (options.outputFormat === 'tiff') {
            return await processor.createTIFFBuffer(options.tiffOptions);
        } else {
            return await processor.createJPEGBuffer(options.quality || 95);
        }
    } finally {
        processor.close();
    }
}
```

### Phase 4: 集成替换 (Day 5)

**3.7 更新 raw-decoder.js**

```javascript
// 优先使用新模块，兼容回退
let LibRaw = null;
try {
    LibRaw = require('@filmgallery/libraw-native');
} catch (e) {
    try {
        LibRaw = require('lightdrift-libraw');
    } catch (e2) {
        console.error('[RawDecoder] No RAW decoder available');
    }
}
```

**3.8 更新 package.json**

```json
{
  "dependencies": {
    "@filmgallery/libraw-native": "file:packages/@filmgallery/libraw-native"
  }
}
```

### Phase 5: 测试与验证 (Day 6-7)

**3.9 测试矩阵**

| 测试项 | 测试文件格式 | 预期结果 |
|--------|-------------|----------|
| 基础解码 | CR2, NEF, ARW | 正确解码 |
| Panasonic S9 | RW2 | 正确解码 (新支持) |
| 缩略图提取 | 全格式 | 返回 JPEG |
| 元数据读取 | 全格式 | 正确解析 |
| 错误处理 | 损坏文件 | 优雅失败 |

---

## 4. API 兼容性对照表

确保新模块 API 与现有 `lightdrift-libraw` 兼容:

| lightdrift-libraw API | 新模块 API | 状态 |
|----------------------|------------|------|
| `new LibRaw()` | `new LibRawProcessor()` | ✅ 兼容 |
| `processor.loadFile(path)` | 相同 | ✅ 兼容 |
| `processor.unpackThumbnail()` | 相同 | ✅ 兼容 |
| `processor.processImage()` | `processor.dcrawProcess()` | ⚠️ 方法名变化 |
| `processor.createTIFFBuffer()` | 相同 | ✅ 兼容 |
| `processor.createJPEGBuffer()` | 相同 | ✅ 兼容 |
| `processor.getMetadata()` | 相同 | ✅ 兼容 |
| `processor.close()` | 相同 | ✅ 兼容 |
| `LibRaw.getVersion()` | 相同 | ✅ 兼容 |

为保持完全兼容，将在 `processor.js` 中添加方法别名。

---

## 5. 构建配置

### 5.1 binding.gyp (Windows/macOS/Linux)

```python
{
  "targets": [{
    "target_name": "libraw_native",
    "sources": [
      "src/libraw_binding.cpp",
      "src/async_workers.cpp",
      # LibRaw 源文件
      "deps/libraw/src/libraw_cxx.cpp",
      "deps/libraw/src/libraw_c_api.cpp",
      "deps/libraw/src/libraw_datastream.cpp",
      "deps/libraw/src/decoders/*.cpp",
      "deps/libraw/src/demosaic/*.cpp",
      "deps/libraw/src/metadata/*.cpp",
      "deps/libraw/src/preprocessing/*.cpp",
      "deps/libraw/src/postprocessing/*.cpp",
      "deps/libraw/src/utils/*.cpp",
      "deps/libraw/src/write/*.cpp",
      "deps/libraw/src/x3f/*.cpp"
    ],
    "include_dirs": [
      "<!@(node -p \"require('node-addon-api').include\")",
      "deps/libraw",
      "deps/libraw/libraw"
    ],
    "defines": [
      "NAPI_VERSION=8",
      "NAPI_CPP_EXCEPTIONS",
      "NO_JASPER",
      "LIBRAW_NODLL"
    ],
    "conditions": [
      ["OS=='win'", {
        "msvs_settings": {
          "VCCLCompilerTool": {
            "ExceptionHandling": 1,
            "RuntimeLibrary": 2
          }
        },
        "libraries": [
          "-lws2_32"
        ]
      }],
      ["OS=='mac'", {
        "xcode_settings": {
          "GCC_ENABLE_CPP_EXCEPTIONS": "YES",
          "CLANG_CXX_LIBRARY": "libc++",
          "MACOSX_DEPLOYMENT_TARGET": "10.13"
        }
      }],
      ["OS=='linux'", {
        "cflags_cc": ["-fexceptions", "-std=c++17"],
        "libraries": ["-lpthread"]
      }]
    ]
  }]
}
```

### 5.2 预编译支持 (可选)

使用 `prebuildify` 生成预编译二进制:

```bash
npx prebuildify --napi --strip
```

---

## 6. 风险与缓解

| 风险 | 影响 | 缓解措施 |
|------|------|----------|
| 构建失败 | 高 | 提供详细构建文档；使用 prebuilds |
| 内存泄漏 | 中 | 使用 RAII；添加单元测试 |
| 性能下降 | 低 | 基准测试对比 |
| API 不兼容 | 中 | 添加兼容层；保留旧模块作为备用 |

---

## 7. 时间线

| 阶段 | 任务 | 时间 |
|------|------|------|
| Phase 1 | 基础设施搭建 | Day 1 |
| Phase 2 | C++ 绑定实现 | Day 2-3 |
| Phase 3 | JavaScript 封装 | Day 4 |
| Phase 4 | 集成替换 | Day 5 |
| Phase 5 | 测试验证 | Day 6-7 |

**预计总工期: 5-7 天**

---

## 8. 文件清单

实施完成后将创建/修改以下文件:

### 新建文件
- `packages/@filmgallery/libraw-native/package.json`
- `packages/@filmgallery/libraw-native/binding.gyp`
- `packages/@filmgallery/libraw-native/src/libraw_binding.cpp`
- `packages/@filmgallery/libraw-native/src/async_workers.cpp`
- `packages/@filmgallery/libraw-native/src/async_workers.h`
- `packages/@filmgallery/libraw-native/lib/index.js`
- `packages/@filmgallery/libraw-native/lib/processor.js`
- `packages/@filmgallery/libraw-native/types/index.d.ts`
- `packages/@filmgallery/libraw-native/README.md`
- `packages/@filmgallery/libraw-native/test/test-decode.js`

### 修改文件
- `server/package.json` - 添加依赖
- `server/services/raw-decoder.js` - 更新导入

### 外部依赖
- `packages/@filmgallery/libraw-native/deps/libraw/` - LibRaw 0.22 源码 (需手动下载)

---

## 9. 立即开始

接下来将按照此计划开始实施:

1. ✅ 创建模块目录结构
2. ✅ 编写 package.json 和 binding.gyp
3. ✅ 实现 C++ N-API 绑定
4. ✅ 实现 JavaScript 封装
5. ✅ 更新 raw-decoder.js
6. ⬜ 下载 LibRaw 0.22 源码 (手动)
7. ⬜ 编译测试
