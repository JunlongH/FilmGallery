# 5. 核心功能

## 5.1 FilmLab 处理引擎

### 5.1.1 概述

FilmLab 是 FilmGallery 的核心处理引擎，用于将拍摄的胶片负片处理为可查看的正像。

**架构分层**：
- **共享核心**：`packages/shared/filmlab-core.js` - 跨平台渲染算法
- **客户端 UI**：`client/src/components/FilmLab/` - React 组件和 WebGL 渲染
- **服务端处理**：`server/services/filmlab-service.js` - 服务端预览和导出

### 5.1.2 客户端文件结构

```
client/src/components/FilmLab/
├── FilmLab.jsx           # 主组件（~2500行）
├── FilmLabCanvas.jsx     # 画布组件（裁剪/旋转交互）
├── FilmLabControls.jsx   # 控制面板
├── FilmLabWebGL.js       # WebGL 渲染器
├── PhotoSwitcher.jsx     # 照片切换器
├── SliderControl.jsx     # 滑块控件
├── utils.js              # 工具函数
├── types.d.ts            # TypeScript 类型定义
└── hooks/
    ├── index.js              # 导出索引
    ├── useFilmLabState.js    # 状态管理
    ├── useFilmLabRenderer.js # 渲染器 Hook
    ├── useFilmLabPipeline.js # 管线控制
    └── useHistogram.js       # 直方图计算
```

### 5.1.3 渲染管线

```
图像加载
    │
    ├─ 几何计算 (geometry useMemo)
    │   └─ totalRotation = rotation + orientation + rotationOffset
    │
    ├─ WebGL 渲染 (FilmLabWebGL.js)
    │   ├─ UV 映射（考虑旋转/裁剪）
    │   ├─ 片基校正 + 反演
    │   ├─ 曝光/对比度/高光/阴影
    │   ├─ HSL 调整
    │   ├─ 曲线 + LUT
    │   └─ 分色调
    │
    ├─ 直方图计算
    │   └─ 从裁剪区域采样像素
    │
    └─ 画布显示
```

### 5.1.4 关键状态变量

| 状态 | 用途 | 说明 |
|------|------|------|
| `rotation` | 用户旋转角度 | -45° ~ +45° |
| `orientation` | EXIF 方向补偿 | 90°增量 |
| `rotationOffset` | 浏览器 EXIF 自动旋转补偿 | RAW 文件为 0 |
| `isRotating` | 是否正在拖动旋转滑块 | 用于跳过直方图计算 |
| `isCropping` | 是否处于裁剪模式 | 影响画布显示 |
| `committedCrop` | 已确认的裁剪区域 | 归一化坐标 (0-1) |

**重要**：所有几何计算必须使用完整公式：
```javascript
const totalRotation = rotation + orientation + rotationOffset;
```

### 5.1.5 处理流程

```
原始图像 (JPG/TIFF/RAW)
    │
    ├─ 片基校正 (Base Correction)
    │
    ├─ 反演 (负片→正片)
    │
    ├─ 密度色阶 (Density Levels)
    │
    ├─ 白平衡调整
    │
    ├─ HSL 色彩校正
    │
    ├─ 分色调 (阴影/高光)
    │
    ├─ 曲线调整 + LUT
    │
    └─ 导出处理后的图像
```

### 5.1.6 主要处理步骤

#### 1. 负片反演 (Inversion)

```javascript
// packages/shared/filmlab-core.js
function invertFilm(imageData, options = {}) {
  const { intensity = 1.0 } = options;
  
  // RGB 值反演
  for (let i = 0; i < imageData.data.length; i += 4) {
    imageData.data[i] = 255 - imageData.data[i];        // R
    imageData.data[i + 1] = 255 - imageData.data[i + 1]; // G
    imageData.data[i + 2] = 255 - imageData.data[i + 2]; // B
  }
  
  return imageData;
}
```

#### 2. 白平衡 (White Balance)

```javascript
function adjustWhiteBalance(imageData, { temp = 5500, tint = 0 }) {
  // 色温调整 (开尔文温度)
  // tint 调整（青-品红）
  
  // 计算 RGB 乘数
  const multipliers = calculateWhiteBalanceMultipliers(temp, tint);
  
  for (let i = 0; i < imageData.data.length; i += 4) {
    imageData.data[i] *= multipliers.r;        // R
    imageData.data[i + 1] *= multipliers.g;    // G
    imageData.data[i + 2] *= multipliers.b;    // B
  }
  
  return imageData;
}
```

#### 3. HSL 色彩校正

```javascript
function adjustHSL(imageData, hslAdjustments) {
  // hslAdjustments: [
  //   { hue: 0, saturation: 20, lightness: 10 },   // 红色
  //   { hue: 60, saturation: 15, lightness: 5 }    // 黄色
  // ]
  
  // 将 RGB 转换为 HSL
  // 应用调整
  // 转换回 RGB
}
```

#### 4. 分色调 (Split Toning)

```javascript
function applySplitTone(imageData, { shadow, highlight }) {
  // shadow: "#FF6B35"  (阴影色彩)
  // highlight: "#004E89" (高光色彩)
  
  // 分离暗部和亮部
  // 分别应用不同的色彩
}
```

### 5.1.4 预设系统

预设保存在数据库的 `presets` 表中：

```javascript
// 保存预设
const preset = {
  name: "Portra 400 Style",
  category: "color_negative",
  settings: {
    inversion: true,
    white_balance: { temp: 5500, tint: 0 },
    hsl: [
      { hue: 0, saturation: 20, lightness: 10 },
      { hue: 60, saturation: 15, lightness: 5 }
    ],
    split_tone: { 
      shadow: "#FF6B35", 
      highlight: "#004E89" 
    },
    curve: [/* 曲线点 */],
    exposure: 0.5,
    contrast: 20
  }
};

// 应用预设
api.processFilmlab(photoId, preset.settings);
```

### 5.1.9 GPU 加速

在支持 GPU 的系统上，可以启用 WebGL/CUDA 加速：

```javascript
// client/src/components/FilmLab/FilmLabWebGL.js
// 使用 WebGL 进行并行计算
// 显著提升实时预览性能
```

**WebGL 渲染器特性**：
- UV 映射支持旋转和裁剪
- `UNPACK_FLIP_Y_WEBGL = true` 需要 Y 坐标翻转补偿
- 着色器版本缓存，避免重复编译

**关键函数**：
```javascript
// FilmLabWebGL.js
export function processImageWebGL(image, options) {
  // options 包含：
  // - rotate: 总旋转角度
  // - cropRect: 裁剪区域 {x, y, w, h}
  // - inverted, gains, exposure, contrast...
  // - curves, lut3, hslParams, splitToning
}

// UV 映射函数（处理旋转和裁剪）
function mapUV(u, v, rotate, cropRect, imgW, imgH) {
  // 1. 从裁剪空间映射到旋转空间
  // 2. 应用逆旋转
  // 3. 返回源图像坐标
  // 注意：需要 Y 翻转补偿 (1.0 - y)
}
```

**启用方式**：
1. 确保系统安装 NVIDIA CUDA 工具包（可选）
2. 启用环境变量：`USE_GPU=1 npm start`
3. 监控 GPU 使用率：`nvidia-smi`

### 5.1.10 直方图系统

直方图在裁剪模式下只采样裁剪区域：

```javascript
// FilmLab.jsx processImage()
// 计算采样区域
if (isCropping && cropRect && webglSuccess) {
  scanStartX = Math.floor(cropRect.x * width);
  scanStartY = Math.floor(cropRect.y * height);
  scanEndX = Math.floor((cropRect.x + cropRect.w) * width);
  scanEndY = Math.floor((cropRect.y + cropRect.h) * height);
}

// 采样像素并计算直方图
for (let y = scanStartY; y < scanEndY; y += stride) {
  for (let x = scanStartX; x < scanEndX; x += stride) {
    // 累计 R/G/B/Lum 直方图
  }
}
```

**性能优化**：
- `isRotating = true` 时跳过直方图计算（保持 60fps）
- 使用 stride 采样（裁剪模式 stride=6，正常模式 stride=2）

### 5.1.11 API 端点

| 端点 | 方法 | 用途 |
|------|------|------|
| `/api/filmlab/preview` | POST | 服务端预览渲染 |
| `/api/filmlab/render` | POST | 服务端完整渲染 |
| `/api/filmlab/export` | POST | 导出处理后图像 |
| `/api/presets/film-curves` | GET/POST | 胶片曲线配置文件 |
| `/api/presets` | GET/POST | 编辑预设管理 |

## 5.2 RAW 文件处理

### 5.2.1 支持的格式

| 制造商 | 格式 | 扩展名 |
|--------|------|--------|
| Canon | Cannon Raw | .cr2, .cr3 |
| Nikon | Nikon Raw | .nef, .nrw |
| Sony | Sony Alpha Raw | .arw |
| Fujifilm | RAW | .raf |
| Panasonic | RAW | .rw2 |
| Olympus | ORF | .orf |

### 5.2.2 解析流程

```javascript
// server/services/raw-decoder.js
const libraw = require('@filmgallery/libraw-native');

async function decodeRaw(filePath) {
  const processor = libraw.createProcessor();
  
  try {
    // 1. 打开 RAW 文件
    processor.open(filePath);
    
    // 2. 提取原始 Bayer 数据
    processor.unpack();
    
    // 3. 白平衡和色彩转换
    processor.processRaw();
    
    // 4. 生成 JPEG 预览
    const preview = processor.exportJpeg();
    
    // 5. 提取 EXIF
    const exif = processor.extractExif();
    
    return { preview, exif, bayerData: processor.getRawData() };
  } finally {
    processor.free();
  }
}
```

### 5.2.3 Bayer 数据提取

RAW 文件包含原始 Bayer 模式数据，可用于高级处理：

```javascript
// 访问原始像素数据
const bayerData = processor.getRawData(); // Uint16Array

// Bayer 模式分布 (CFA - Color Filter Array)
// RGGB (大多数相机)
// 0  1  0  1
// 2  3  2  3
// 其中 0=Red, 1=Green1, 2=Green2, 3=Blue
```

## 5.3 地理位置系统

### 5.3.1 GPS 数据流

```
相机 GPS 模块或手机 GPS
    │
    ├─ 记录坐标 (纬度, 经度)
    │
    ├─ 提取 EXIF GPS IFD
    │
    └─ 存储到数据库 (photos.latitude, photos.longitude)
```

### 5.3.2 位置逆向编码

将坐标转换为可读位置名称：

```javascript
// server/services/location-service.js
async function reverseGeocode(latitude, longitude) {
  // 调用 OpenStreetMap Nominatim API
  const response = await fetch(
    `https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}&lon=${longitude}`
  );
  
  const { address } = await response.json();
  return address.city || address.town || address.village;
}
```

### 5.3.3 地图展示

使用 Leaflet + React Leaflet 在前端展示照片位置：

```javascript
// client/src/components/map/PhotoMap.jsx
import { MapContainer, TileLayer, Marker, Popup, MarkerCluster } from 'react-leaflet';

export function PhotoMap({ photos }) {
  return (
    <MapContainer center={[39.9, 116.4]} zoom={13} style={{ height: '100vh' }}>
      <TileLayer
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        attribution='&copy; OpenStreetMap'
      />
      <MarkerCluster>
        {photos.map(photo => (
          <Marker key={photo.id} position={[photo.latitude, photo.longitude]}>
            <Popup>
              <img src={photo.thumbnail} alt="preview" />
              <p>{photo.shot_date}</p>
            </Popup>
          </Marker>
        ))}
      </MarkerCluster>
    </MapContainer>
  );
}
```

## 5.4 标签和元数据系统

### 5.4.1 标签管理

灵活的多标签系统允许照片有多个标签：

```javascript
// 创建标签
POST /api/tags
{
  "name": "人物",
  "color": "#FF5733"
}

// 为照片添加标签
POST /api/photos/:id/tags
{
  "tag_ids": [1, 5, 8]
}

// 按标签搜索
GET /api/photos?tag=1,5
```

### 5.4.2 自定义 EXIF

编辑照片的 EXIF 信息：

```javascript
// server/services/exif-service.js
const piexifjs = require('piexifjs');

function updateExif(imagePath, exifData) {
  // 读取现有 EXIF
  const exif = piexifjs.load(imagePath);
  
  // 更新字段
  exif['0th'][piexifjs.ImageIFD.Make] = exifData.camera;
  exif['0th'][piexifjs.ImageIFD.Model] = exifData.model;
  exif['Exif'][piexifjs.ExifIFD.FNumber] = exifData.aperture;
  
  // 写回文件
  const exifBytes = piexifjs.dump(exif);
  // 保存
}
```

## 5.5 导出和批处理

### 5.5.1 导出格式支持

| 格式 | 用途 | 特点 |
|------|------|------|
| JPEG | 分享、存档 | 有损压缩、文件小 |
| PNG | 打印、专业用途 | 无损、文件大 |
| TIFF | 专业编辑 | 无损、保留元数据 |
| WebP | 网络分享 | 高效压缩 |

### 5.5.2 批量导出

```javascript
// 后端：export-queue.js
class ExportQueue {
  constructor() {
    this.queue = [];
    this.processing = false;
  }
  
  enqueue(task) {
    this.queue.push(task);
    this.process();
  }
  
  async process() {
    if (this.processing) return;
    this.processing = true;
    
    while (this.queue.length > 0) {
      const task = this.queue.shift();
      
      for (const photoId of task.photo_ids) {
        // 应用 FilmLab 处理
        // 导出为指定格式
        // 更新进度
      }
    }
    
    this.processing = false;
  }
}
```

### 5.5.3 导出历史追踪

每次导出都记录在 `export_history` 表中：

```sql
SELECT * FROM export_history 
WHERE roll_id = 1 
ORDER BY export_date DESC
LIMIT 20;
```

## 5.6 导入工作流

### 5.6.1 照片导入流程

```
选择文件
    │
    ├─ 验证格式 (JPG, RAW, TIFF)
    │
    ├─ 提取 EXIF 信息
    │
    ├─ 生成缩略图
    │
    ├─ 上传到服务器
    │
    ├─ 保存到数据库
    │
    └─ 完成导入
```

### 5.6.2 导入 API

```javascript
// 前端上传
const formData = new FormData();
formData.append('roll_id', rollId);
formData.append('auto_scan_exif', true);
formData.append('files', file1);
formData.append('files', file2);

const response = await fetch(`${API_BASE}/api/import`, {
  method: 'POST',
  body: formData
});

// 后端处理：server/routes/import.js
router.post('/import', upload.array('files'), async (req, res) => {
  const { roll_id, auto_scan_exif } = req.body;
  
  for (const file of req.files) {
    // 提取 EXIF
    const exif = auto_scan_exif ? await exifService.read(file.path) : {};
    
    // 创建数据库记录
    await db.insertPhoto({
      roll_id,
      file_path: file.path,
      ...exif
    });
  }
  
  res.json({ success: true });
});
```

## 5.7 统计和分析

### 5.7.1 统计数据

系统计算的统计指标：

```javascript
// server/services/stats-service.js
async function getStats(userId) {
  return {
    total_photos: await countPhotos(),
    total_rolls: await countRolls(),
    total_films: await countFilms(),
    
    photos_by_month: await getPhotosByMonth(),
    photos_by_camera: await getPhotosByCamera(),
    photos_by_film: await getPhotosByFilm(),
    
    average_iso: await calculateAverageISO(),
    average_aperture: await calculateAverageAperture(),
    
    top_cameras: await getTopCameras(10),
    top_lenses: await getTopLenses(10),
    top_locations: await getTopLocations(10)
  };
}
```

### 5.7.2 统计可视化

使用 Recharts 展示统计数据：

```javascript
// client/src/components/Statistics.jsx
import { BarChart, Bar, LineChart, Line } from 'recharts';

export function Statistics() {
  const { data: stats } = useQuery({
    queryKey: ['stats'],
    queryFn: api.getStats
  });
  
  return (
    <>
      <BarChart data={stats.photos_by_month}>
        <Bar dataKey="count" fill="#8884d8" />
      </BarChart>
      
      <PieChart data={stats.photos_by_camera}>
        <Pie dataKey="value" />
      </PieChart>
    </>
  );
}
```

---

**相关文档**：
- [04-frontend.md](./04-frontend.md) - 前端开发
- [03-backend-api.md](./03-backend-api.md) - API 接口
