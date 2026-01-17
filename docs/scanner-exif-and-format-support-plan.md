# Scanner/Digitization Equipment EXIF & Format Support Plan

**Date**: 2026-01-17  
**Status**: ✅ Implemented  
**Priority**: High

---

## Overview

本计划解决两个相关问题：

1. **Scanner/Digitization Equipment EXIF**: 上传 TIFF/JPEG/RAW 时读取扫描仪/数字化设备信息，存储到独立字段，并在导出时写回 EXIF
2. **BMP/Scanner Format Support**: 支持富士扫描仪等设备输出的 BMP 格式及其他扫描仪格式

## Implementation Status

| Component | Status | Notes |
|-----------|--------|-------|
| Database Schema | ✅ Done | equip_scanners table, scanner columns on photos/rolls |
| scan-exif-service.js | ✅ Done | Scanner detection, EXIF extraction |
| MIME types registry | ✅ Done | server/utils/mime-types.js |
| FFF/IIQ format support | ✅ Done | Added to raw-decoder, shared rawUtils |
| Client file type support | ✅ Done | Updated accept attributes |
| Scanner equipment API | ✅ Done | CRUD endpoints in equipment.js |
| Upload handlers | ✅ Done | Scanner extraction in rolls.js |
| Export EXIF writing | ✅ Done | XMP custom tags for scanner info |
| ScannerManager UI | ✅ Done | Integrated into EquipmentManager |

---

## Part A: Scanner/Digitization Equipment System

### A1. 需求分析

#### 核心问题
- **胶片拍摄设备** (camera, lens) ≠ **数字化设备** (scanner, DSLR scanning rig)
- 当前系统将 EXIF 中的 Make/Model 作为拍摄相机存储，这对于扫描文件是错误的
- 需要区分：
  - **胶片拍摄**: 胶片相机 + 镜头 (手动输入或从 shot log 导入)
  - **数字化**: 扫描仪/翻拍相机 + 扫描软件 (从 EXIF 读取)

#### 数据流
```
┌─────────────────────────────────────────────────────────────────────────┐
│                         UPLOAD FLOW                                      │
├─────────────────────────────────────────────────────────────────────────┤
│  ┌──────────┐     ┌──────────────┐     ┌───────────────────────────┐    │
│  │ TIFF/JPEG │───▶│ Read EXIF    │───▶│ Extract Scanner Info:      │    │
│  │ from      │    │ (exiftool/   │    │ - Make (e.g., EPSON)       │    │
│  │ Scanner   │    │  sharp)      │    │ - Model (e.g., V850)       │    │
│  └──────────┘     └──────────────┘    │ - Software (Epson Scan 2)  │    │
│                                        │ - Resolution (DPI)         │    │
│  ┌──────────┐     ┌──────────────┐    │ - DateTime (scan date)     │    │
│  │ RAW from │───▶│ libraw/      │    └───────────────────────────┘    │
│  │ DSLR     │    │ exiftool     │                 │                     │
│  │ Scanning │    └──────────────┘                 ▼                     │
│  └──────────┘            │            ┌───────────────────────────┐    │
│                          │            │ Store in photos table:     │    │
│                          └──────────▶│ - scanner_equip_id         │    │
│                                       │ - scan_resolution          │    │
│                                       │ - scan_software            │    │
│                                       │ - scan_date                │    │
│                                       └───────────────────────────┘    │
└─────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────┐
│                         EXPORT FLOW                                      │
├─────────────────────────────────────────────────────────────────────────┤
│  ┌───────────────────────────────┐     ┌───────────────────────────┐   │
│  │ Read from DB:                  │───▶│ Write EXIF using XMP:      │   │
│  │ - Film camera (camera_equip_id)│    │ - Make/Model = Film Camera │   │
│  │ - Film lens (lens_equip_id)    │    │ - LensModel = Film Lens    │   │
│  │ - Shooting params              │    │ - ExposureTime, FNumber... │   │
│  │ - Scanner info                 │    │                             │   │
│  │   - scanner_equip_id           │    │ XMP Custom Namespace:       │   │
│  │   - scan_resolution            │    │ - FG:ScannerMake            │   │
│  │   - scan_software              │    │ - FG:ScannerModel           │   │
│  │   - scan_date                  │    │ - FG:ScanResolution         │   │
│  │                                │    │ - FG:ScanSoftware           │   │
│  │                                │    │ - FG:ScanDate               │   │
│  └───────────────────────────────┘    └───────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────┘
```

### A2. Database Schema Extension

#### New Table: `equip_scanners`

```sql
CREATE TABLE IF NOT EXISTS equip_scanners (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  
  -- Basic Info
  name TEXT NOT NULL,              -- Display name: "Epson V850"
  brand TEXT,                      -- Manufacturer: "EPSON"
  model TEXT,                      -- Model: "Perfection V850 Pro"
  
  -- Scanner Type
  type TEXT,                       -- 'flatbed' | 'film' | 'drum' | 'dslr_scan' | 'camera_scan' | 'other'
  
  -- Technical Specs
  max_resolution INTEGER,          -- Max optical DPI: 6400
  sensor_type TEXT,                -- 'CCD' | 'CIS' | 'PMT' | 'CMOS'
  supported_formats TEXT,          -- JSON array: ["135", "120", "4x5"]
  has_infrared_cleaning INTEGER DEFAULT 0,  -- ICE/iSRD support
  bit_depth INTEGER,               -- 48-bit, 64-bit, etc.
  
  -- Software
  default_software TEXT,           -- "Epson Scan 2", "SilverFast", "VueScan"
  
  -- For DSLR Scanning Rigs
  camera_equip_id INTEGER REFERENCES equip_cameras(id),  -- Link to camera used for scanning
  lens_equip_id INTEGER REFERENCES equip_lenses(id),     -- Link to macro lens
  
  -- Ownership Info (same as other equipment)
  serial_number TEXT,
  purchase_date TEXT,
  purchase_price REAL,
  condition TEXT,
  notes TEXT,
  image_path TEXT,
  status TEXT DEFAULT 'owned',     -- 'owned' | 'sold' | 'wishlist'
  
  -- Timestamps
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME,
  deleted_at DATETIME              -- Soft delete
);
```

#### Extend `photos` Table

```sql
-- Digitization/Scanning info
ALTER TABLE photos ADD COLUMN scanner_equip_id INTEGER REFERENCES equip_scanners(id);
ALTER TABLE photos ADD COLUMN scan_resolution INTEGER;       -- Actual scan DPI
ALTER TABLE photos ADD COLUMN scan_software TEXT;            -- "Epson Scan 2 v6.4.9"
ALTER TABLE photos ADD COLUMN scan_date DATETIME;            -- When scanned/digitized
ALTER TABLE photos ADD COLUMN scan_bit_depth INTEGER;        -- 16-bit, 48-bit, etc.
ALTER TABLE photos ADD COLUMN scan_notes TEXT;               -- Any scan-specific notes

-- Source metadata (store original EXIF before processing)
ALTER TABLE photos ADD COLUMN source_make TEXT;              -- Original EXIF Make
ALTER TABLE photos ADD COLUMN source_model TEXT;             -- Original EXIF Model
ALTER TABLE photos ADD COLUMN source_software TEXT;          -- Original EXIF Software
```

#### Extend `rolls` Table (Default Scanner per Roll)

```sql
ALTER TABLE rolls ADD COLUMN scanner_equip_id INTEGER REFERENCES equip_scanners(id);
ALTER TABLE rolls ADD COLUMN scan_resolution INTEGER;        -- Default scan DPI for roll
ALTER TABLE rolls ADD COLUMN scan_software TEXT;             -- Default scan software
ALTER TABLE rolls ADD COLUMN scan_lab TEXT;                  -- Scan lab name
ALTER TABLE rolls ADD COLUMN scan_date DATE;                 -- When roll was scanned
ALTER TABLE rolls ADD COLUMN scan_cost REAL;                 -- Scanning cost
ALTER TABLE rolls ADD COLUMN scan_notes TEXT;                -- Notes about scanning
```

### A3. EXIF Reading Service

#### New Service: `server/services/scan-exif-service.js`

```javascript
/**
 * scan-exif-service.js
 * 
 * Extracts scanner/digitization device information from EXIF
 * Works with TIFF, JPEG, and RAW files
 */

const { exiftool } = require('exiftool-vendored');

/**
 * Extract scanner information from file EXIF
 * @param {string} filePath - Path to image file
 * @returns {Promise<ScannerInfo>}
 */
async function extractScannerInfo(filePath) {
  const tags = await exiftool.read(filePath);
  
  return {
    // Device identification
    make: tags.Make || null,
    model: tags.Model || null,
    software: tags.Software || null,
    
    // Resolution
    xResolution: tags.XResolution || null,
    yResolution: tags.YResolution || null,
    resolutionUnit: tags.ResolutionUnit || null,  // 2=inches, 3=cm
    
    // Timestamps
    dateTime: tags.DateTime || tags.DateTimeOriginal || null,
    
    // Image properties
    bitsPerSample: tags.BitsPerSample || null,
    compression: tags.Compression || null,
    
    // Scanner-specific tags (some scanners write these)
    scannerMake: tags.ScannerMake || null,
    scannerModel: tags.ScannerModel || null,
    
    // Raw metadata for inspection
    _raw: {
      Make: tags.Make,
      Model: tags.Model,
      Software: tags.Software,
      DateTime: tags.DateTime,
      XResolution: tags.XResolution,
      YResolution: tags.YResolution
    }
  };
}

/**
 * Detect if EXIF indicates a scanner (vs. camera)
 * @param {ScannerInfo} info 
 * @returns {boolean}
 */
function isScannerDevice(info) {
  const make = (info.make || '').toUpperCase();
  const model = (info.model || '').toUpperCase();
  const software = (info.software || '').toUpperCase();
  
  // Known scanner manufacturers
  const scannerMakes = ['EPSON', 'NIKON', 'CANON', 'PLUSTEK', 'PACIFIC IMAGE', 
                        'REFLECTA', 'BRAUN', 'HASSELBLAD', 'IMACON', 'FLEXTIGHT'];
  
  // Known scanning software
  const scanSoftware = ['EPSON SCAN', 'SILVERFAST', 'VUESCAN', 'NIKON SCAN', 
                        'CANON SCANGEAR', 'NEGATIVE LAB PRO'];
  
  // Known scanner model keywords
  const scannerKeywords = ['PERFECTION', 'COOLSCAN', 'FLEXTIGHT', 'PRIMESCAN',
                           'OPTICFILM', 'PROSCAN', 'SCANNER'];
  
  if (scannerMakes.some(s => make.includes(s) && model.includes('SCAN'))) return true;
  if (scanSoftware.some(s => software.includes(s))) return true;
  if (scannerKeywords.some(k => model.includes(k))) return true;
  
  // Check resolution - scanners typically write DPI > 100
  if (info.xResolution && info.xResolution > 100) return true;
  
  return false;
}

/**
 * Get effective scan resolution in DPI
 */
function getScanDpi(info) {
  if (!info.xResolution) return null;
  
  // ResolutionUnit: 1=None, 2=inches, 3=centimeters
  const unit = info.resolutionUnit || 2;
  let dpi = info.xResolution;
  
  if (unit === 3) {
    dpi = Math.round(dpi * 2.54); // Convert from PPC to DPI
  }
  
  return dpi;
}

module.exports = {
  extractScannerInfo,
  isScannerDevice,
  getScanDpi
};
```

### A4. Upload Flow Modifications

#### `server/routes/rolls.js` - Photo Upload Handler

```javascript
// In POST /:id/photos handler

const { extractScannerInfo, isScannerDevice, getScanDpi } = require('../services/scan-exif-service');

// After file upload, before inserting to DB:
const scanInfo = await extractScannerInfo(uploadedFilePath);

let scannerData = {};
if (isScannerDevice(scanInfo)) {
  // This is a scanned file - don't use EXIF as camera info
  scannerData = {
    source_make: scanInfo.make,
    source_model: scanInfo.model,
    source_software: scanInfo.software,
    scan_resolution: getScanDpi(scanInfo),
    scan_date: scanInfo.dateTime,
    // Don't set camera/lens from EXIF - they're wrong for scans
  };
} else {
  // This is a camera file (DSLR scan) - use for scanning rig info
  scannerData = {
    source_make: scanInfo.make,
    source_model: scanInfo.model,
    source_software: scanInfo.software,
    // Camera/lens from EXIF goes to scanning device, not shooting device
  };
}
```

### A5. Export EXIF Writing

#### XMP Namespace Definition

```javascript
// Custom XMP namespace for FilmGallery metadata
const FG_XMP_NAMESPACE = 'http://filmgallery.app/xmp/1.0/';

// Tags to write
const scannerExifTags = {
  // Standard tags for film camera (displayed as "camera" in viewers)
  'Make': filmCameraBrand,
  'Model': filmCameraModel,
  'LensMake': filmLensBrand,
  'LensModel': filmLensModel,
  
  // XMP custom tags for scanner
  'XMP-FG:ScannerMake': scannerMake,
  'XMP-FG:ScannerModel': scannerModel,
  'XMP-FG:ScanResolution': scanResolution,
  'XMP-FG:ScanSoftware': scanSoftware,
  'XMP-FG:ScanDate': scanDate,
  
  // Alternative: Use standard XMP-tiff tags
  'XMP-tiff:Make': scannerMake,  // Some viewers show this as "Digitized by"
  'XMP-tiff:Model': scannerModel,
};
```

### A6. Equipment Manager UI

#### New Component: `ScannerManager.jsx`

Pattern follows existing `CameraManager.jsx`:
- List view with scanner thumbnails
- Form fields for scanner specs
- Support for DSLR scanning rig (link to camera + lens)
- Type selector: Flatbed / Film Scanner / Drum / DSLR Scan Rig

#### Integration Points
- Equipment Manager sidebar: Add "Scanners" tab
- NewRollForm: Add scanner selector in develop section
- PhotoDetailsSidebar: Show scan info (read-only or editable)
- Upload flow: Auto-detect and suggest scanner match

---

## Part B: BMP & Scanner Format Support

### B1. Current State Analysis

#### Supported Formats

| Format | Client Upload | Server Process | FilmLab | Preview |
|--------|---------------|----------------|---------|---------|
| JPEG   | ✅ | ✅ | ✅ | ✅ |
| PNG    | ✅ | ✅ | ✅ | ✅ |
| TIFF   | ✅ | ✅ | ✅ | ✅ (via exifr) |
| WebP   | ✅ | ✅ | ✅ | ✅ |
| RAW*   | ✅ | ✅ (libraw) | ✅ | ✅ (libraw) |
| **BMP**| ❌ | ✅ (Sharp reads) | ❓ | ❌ |
| GIF    | ❌ | ✅ | ❌ | ❌ |
| HEIC   | ❌ | Partial | ❌ | ❌ |
| PSD    | ❌ | ❌ | ❌ | ❌ |

*RAW includes: DNG, CR2, CR3, NEF, ARW, RAF, ORF, RW2, PEF, SRW, X3F, 3FR, etc.

#### Key Libraries

- **Sharp** (v0.33.5): Handles JPEG, PNG, TIFF, WebP, GIF, **BMP (read)**, AVIF
- **lightdrift-libraw**: Handles RAW files
- **exifr**: Client-side TIFF/RAW thumbnail extraction
- **exiftool-vendored**: Server-side EXIF read/write

### B2. BMP Support Implementation

#### B2.1 Client-Side Changes

**File: `client/src/components/NewRollForm.jsx`**

```jsx
// Update file input accept attribute
const acceptedFormats = isOriginalUpload 
  ? 'image/*,.dng,.cr2,.cr3,.arw,.nef,.nrw,.orf,.raf,.rw2,.pef,.srw,.x3f,.3fr,.iiq,.raw,.rwl,.dcr,.kdc,.mrw,.erf,.mef,.mos,.srf,.sr2,.bmp,.dib'
  : 'image/*,.bmp,.dib';

<input 
  type="file" 
  multiple 
  accept={acceptedFormats}
  onChange={onFileChange} 
/>
```

**File: `client/src/hooks/useFilePreviews.js`**

```javascript
// BMP is browser-loadable, same as JPEG
// No special handling needed, but add explicit detection
const isBmp = (filename) => {
  const ext = filename.toLowerCase();
  return ext.endsWith('.bmp') || ext.endsWith('.dib');
};

// In preview generation:
if (isTiff(file.name)) {
  // Use exifr for TIFF thumbnails
} else if (isRaw(file.name)) {
  // Use libraw via server for RAW thumbnails
} else {
  // BMP, JPEG, PNG, WebP - use native browser URL.createObjectURL
  return URL.createObjectURL(file);
}
```

**File: `client/src/utils/fileTypes.js`**

```javascript
// Add BMP to image type detection
export const detectFileType = (filename) => {
  const ext = filename.toLowerCase().split('.').pop();
  
  if (['bmp', 'dib'].includes(ext)) return 'bmp';
  if (['tif', 'tiff'].includes(ext)) return 'tiff';
  // ... other types
};

// Add to allowed image extensions
export const IMAGE_EXTENSIONS = [
  'jpg', 'jpeg', 'png', 'tif', 'tiff', 'webp', 'gif',
  'bmp', 'dib',  // Added BMP
  // RAW extensions...
];
```

#### B2.2 Server-Side Changes

**No changes required** - Sharp already reads BMP files natively.

When a BMP is uploaded:
1. Sharp reads BMP → processes → outputs as JPEG (for thumbnails/full)
2. Original BMP is preserved in `original_rel_path`

**File: `server/lib/raw-decoder.js`** (Optional enhancement)

```javascript
// Add BMP to isImageFile check for completeness
const IMAGE_EXTENSIONS = [
  '.jpg', '.jpeg', '.png', '.tif', '.tiff', '.webp',
  '.bmp', '.dib'  // Added
];

isImageFile(filename) {
  const ext = path.extname(filename).toLowerCase();
  return IMAGE_EXTENSIONS.includes(ext);
}
```

**File: `electron-gpu/main.js`** (MIME type detection)

```javascript
// Already has BMP detection, but verify:
else if (ext === '.bmp' || ext === '.dib') mime = 'image/bmp';
```

#### B2.3 FilmLab Pipeline

**File: `client/src/components/FilmLab/FilmLabPanel.jsx`**

Check image loading - uses standard `<img>` tag or WebGL texture loading.
BMP should work natively in most browsers for `<img>`.

For WebGL texture loading, verify:
```javascript
// Most browsers support BMP in texImage2D via Image object
const img = new Image();
img.onload = () => {
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
};
img.src = bmpUrl;  // Works if browser supports BMP
```

**Browser BMP Support:**
- Chrome: ✅
- Firefox: ✅
- Edge: ✅
- Safari: ✅ (macOS 10.13+)

### B3. Additional Scanner Formats

#### Priority Formats to Add

| Format | Extension | Difficulty | Notes |
|--------|-----------|------------|-------|
| **BMP** | `.bmp`, `.dib` | Easy | Sharp reads, browser displays |
| **FFF** | `.fff`, `.3fr` | Easy | LibRaw supports, Hasselblad/Imacon scanners |
| **HEIC** | `.heic`, `.heif` | Medium | Needs libheif for Sharp, client conversion |
| **PSD** | `.psd` | Hard | Needs psd.js library |

---

### B4. Hasselblad/Imacon FFF Format Support

#### B4.1 FFF Format Overview

**FFF (Flexible File Format)** 是 Hasselblad/Imacon 扫描仪和数码后背使用的专有 RAW 格式。

| 设备类型 | 常见型号 | 输出格式 |
|---------|---------|---------|
| **Imacon Flextight 扫描仪** | Flextight 343, 646, 848, 949, X1, X5 | `.fff` |
| **Hasselblad 数码后背** | H2D, H3D, H4D, H5D, CFV 系列 | `.3fr`, `.fff` |
| **Hasselblad 数码相机** | X1D, X2D, 907X | `.3fr` |

#### B4.2 LibRaw 支持状态

根据 LibRaw 0.22 官方支持列表，以下 Hasselblad/Imacon 设备已完全支持：

**Hasselblad:**
- H2D-22, H2D-39
- H3D-22, H3D-31, H3D-39
- H3DII-22, H3DII-31, H3DII-39, H3DII-50
- H4D-31, H4D-40, H4D-50, H4D-60
- H5D-40, H5D-50, H5D-50c, H5D-60
- H6D-100c, A6D-100c
- CFV, CFV-50, CFV-50c, CFV II 50C, CFV-100c
- X1D, X1D II 50C, X2D 100C

**Imacon:**
- Ixpress 96, 96C
- Ixpress 384, 384C (single shot only)
- Ixpress 132C
- Ixpress 528C (single shot only)

#### B4.3 当前代码状态

**已支持 `.3fr`：**
```javascript
// server/services/raw-decoder.js
const SUPPORTED_EXTENSIONS = [
  '.dng', '.cr2', '.cr3', '.nef', '.arw', 
  '.raf', '.orf', '.rw2', '.pef', '.srw',
  '.x3f', '.erf', '.mef', '.mos', '.mrw',
  '.kdc', '.3fr', '.dcr', '.k25', '.qtk'  // ✅ .3fr 已包含
];
```

**缺失 `.fff`：** 需要添加

#### B4.4 FFF 支持实现

##### 服务端更改

**File: `server/services/raw-decoder.js`**

```javascript
// 添加 .fff 到支持的扩展名列表
const SUPPORTED_EXTENSIONS = [
  '.dng', '.cr2', '.cr3', '.nef', '.arw', 
  '.raf', '.orf', '.rw2', '.pef', '.srw',
  '.x3f', '.erf', '.mef', '.mos', '.mrw',
  '.kdc', '.3fr', '.dcr', '.k25', '.qtk',
  '.fff'  // 添加 Hasselblad/Imacon FFF
];

// 更新格式列表
getSupportedFormats() {
  return {
    extensions: SUPPORTED_EXTENSIONS,
    formats: [
      // ... existing formats ...
      { ext: '.3fr', name: 'Hasselblad RAW' },
      { ext: '.fff', name: 'Hasselblad/Imacon Flexible File Format' },  // 添加
    ]
  };
}
```

##### 客户端更改

**File: `client/src/components/NewRollForm.jsx`**

```jsx
// 更新 accept 属性，添加 .fff
const acceptedFormats = isOriginalUpload 
  ? 'image/*,.dng,.cr2,.cr3,.arw,.nef,.nrw,.orf,.raf,.rw2,.pef,.srw,.x3f,.3fr,.fff,.iiq,.raw,.rwl,.dcr,.kdc,.mrw,.erf,.mef,.mos,.srf,.sr2,.bmp,.dib'
  : 'image/*,.bmp,.dib';
```

**File: `client/src/components/RawImport/RawImportWizard.jsx`**

```jsx
// 更新 RAW 文件过滤
const RAW_EXTENSIONS = [
  '.dng', '.cr2', '.cr3', '.nef', '.arw', '.raf', 
  '.orf', '.rw2', '.pef', '.srw', '.x3f', '.3fr',
  '.fff',  // 添加
  '.dcr', '.kdc', '.mrw', '.erf', '.mef', '.mos'
];
```

**File: `client/src/utils/previewUtils.js`**

```javascript
// 确保 FFF 被识别为 RAW 文件
export const isRawFile = (filename) => {
  const ext = filename.toLowerCase().split('.').pop();
  const rawExts = [
    'dng', 'cr2', 'cr3', 'nef', 'arw', 'raf', 
    'orf', 'rw2', 'pef', 'srw', 'x3f', '3fr',
    'fff',  // 添加
    'dcr', 'kdc', 'mrw', 'erf', 'mef', 'mos'
  ];
  return rawExts.includes(ext);
};
```

##### MIME 类型注册

**File: `server/utils/mime-types.js`**

```javascript
const MIME_TYPES = {
  // ... existing types ...
  
  // Hasselblad/Imacon RAW
  '.3fr': 'image/x-hasselblad-3fr',
  '.fff': 'image/x-hasselblad-fff',
};
```

##### Electron MIME 检测

**File: `electron-gpu/main.js`**

```javascript
// 添加 FFF MIME 类型检测
else if (ext === '.fff') mime = 'image/x-hasselblad-fff';
else if (ext === '.3fr') mime = 'image/x-hasselblad-3fr';
```

#### B4.5 FFF 文件 EXIF 特点

Hasselblad/Imacon 扫描仪输出的 FFF 文件包含丰富的元数据：

```
Make: Hasselblad / Imacon
Model: Flextight X5 / H5D-50c
Software: FlexColor / Phocus
XResolution: 8000 (Flextight X5 最高分辨率)
ColorProfile: Embedded ICC profile
BitsPerSample: 16 (通常为 16-bit)
```

**扫描仪检测逻辑更新：**

```javascript
// server/services/scan-exif-service.js
const scannerMakes = [
  'EPSON', 'NIKON', 'CANON', 'PLUSTEK', 'PACIFIC IMAGE', 
  'REFLECTA', 'BRAUN', 'HASSELBLAD', 'IMACON', 'FLEXTIGHT'
];

const scannerKeywords = [
  'PERFECTION', 'COOLSCAN', 'FLEXTIGHT', 'PRIMESCAN',
  'OPTICFILM', 'PROSCAN', 'SCANNER', 'IXPRESS'
];

// Imacon Flextight 系列检测
if (model.includes('FLEXTIGHT') || model.includes('IXPRESS')) {
  return true;  // 这是扫描仪文件
}
```

#### B4.6 FlexColor / Phocus 软件检测

Imacon 扫描仪通常使用 FlexColor 软件，Hasselblad 使用 Phocus：

```javascript
const scanSoftware = [
  'EPSON SCAN', 'SILVERFAST', 'VUESCAN', 'NIKON SCAN', 
  'CANON SCANGEAR', 'NEGATIVE LAB PRO',
  'FLEXCOLOR', 'PHOCUS'  // 添加 Hasselblad/Imacon 软件
];
```

---

#### HEIC Support (Future)

Requires:
1. Sharp with libheif support (recompile or use prebuilt)
2. Client-side: heic2any library for preview

```javascript
// Client-side HEIC to JPEG conversion for preview
import heic2any from 'heic2any';

if (isHeic(file.name)) {
  const jpegBlob = await heic2any({ blob: file, toType: 'image/jpeg' });
  return URL.createObjectURL(jpegBlob);
}
```

### B4. MIME Type Registry

Create centralized MIME type registry:

**File: `server/utils/mime-types.js`**

```javascript
const MIME_TYPES = {
  // Standard images
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.tif': 'image/tiff',
  '.tiff': 'image/tiff',
  
  // Scanner formats
  '.bmp': 'image/bmp',
  '.dib': 'image/bmp',
  
  // Future formats
  '.heic': 'image/heic',
  '.heif': 'image/heif',
  '.psd': 'image/vnd.adobe.photoshop',
  
  // RAW formats
  '.dng': 'image/x-adobe-dng',
  '.cr2': 'image/x-canon-cr2',
  '.cr3': 'image/x-canon-cr3',
  '.nef': 'image/x-nikon-nef',
  '.arw': 'image/x-sony-arw',
  '.raf': 'image/x-fuji-raf',
  '.orf': 'image/x-olympus-orf',
  '.rw2': 'image/x-panasonic-rw2',
  '.pef': 'image/x-pentax-pef',
  // ... etc
};

const getMimeType = (filename) => {
  const ext = path.extname(filename).toLowerCase();
  return MIME_TYPES[ext] || 'application/octet-stream';
};

const isImageFile = (filename) => {
  const mime = getMimeType(filename);
  return mime.startsWith('image/');
};

module.exports = { MIME_TYPES, getMimeType, isImageFile };
```

---

## Part C: Implementation Plan

### Phase 1: Database & Foundation (Day 1-2)

1. **Create migration for database schema**
   - Add `equip_scanners` table
   - Add scanner columns to `photos` table
   - Add scanner columns to `rolls` table

2. **Create `scan-exif-service.js`**
   - EXIF extraction for scanner info
   - Scanner device detection (including Hasselblad/Imacon)
   - DPI calculation

3. **Add BMP and FFF format support to file inputs**
   - Update accept attributes (add `.bmp`, `.dib`, `.fff`)
   - Update file type detection utilities
   - Add `.fff` to RAW extensions list

### Phase 2: Server Integration (Day 3-4)

4. **Create scanner equipment API**
   - CRUD endpoints in `equipment.js`
   - Prepared statements for scanner queries

5. **Modify upload handlers**
   - Extract scanner info on upload
   - Store in database
   - Don't overwrite camera/lens fields

6. **Modify export handlers**
   - Include scanner info in EXIF
   - Use XMP namespace for scanner metadata

7. **Update RAW decoder for FFF support**
   - Add `.fff` to `SUPPORTED_EXTENSIONS`
   - Add FFF format description
   - Verify LibRaw handles FFF correctly

### Phase 3: Client UI (Day 5-6)

8. **Create `ScannerManager.jsx`**
   - List/create/edit scanner equipment
   - Support DSLR scanning rig type
   - Include Hasselblad/Imacon scanner presets

9. **Update `EquipmentManager.jsx`**
   - Add Scanners tab

10. **Update roll/photo forms**
    - Scanner selector in NewRollForm
    - Scanner info display in PhotoDetailsSidebar

### Phase 4: Testing & Polish (Day 7)

11. **Test BMP workflow**
    - Upload BMP from Fuji scanner
    - Verify preview, processing, export

12. **Test FFF workflow**
    - Upload FFF from Hasselblad/Imacon scanner
    - Verify RAW decode via LibRaw
    - Check EXIF extraction (FlexColor/Phocus metadata)

13. **Test scanner EXIF flow**
    - Upload scanned TIFF
    - Verify scanner info extracted
    - Export and verify EXIF content

14. **Documentation**
    - Update DEVELOPER-MANUAL.md
    - Add scanner equipment guide

---

## Files to Modify

### New Files
- `server/services/scan-exif-service.js`
- `server/utils/mime-types.js`
- `client/src/components/Equipment/ScannerManager.jsx`
- `docs/scanner-equipment-guide.md`

### Modified Files
- `server/init-db.js` - Schema additions
- `server/routes/equipment.js` - Scanner CRUD
- `server/routes/rolls.js` - Upload handler
- `server/routes/photos.js` - Export with scanner EXIF
- `server/services/exif-service.js` - Add scanner export
- `server/services/raw-decoder.js` - Add `.fff` extension support
- `server/utils/prepared-statements.js` - Scanner queries
- `client/src/services/api.js` - Scanner API functions
- `client/src/components/NewRollForm.jsx` - Accept BMP/FFF, scanner selector
- `client/src/components/RawImport/RawImportWizard.jsx` - Add `.fff` to RAW extensions
- `client/src/components/Equipment/EquipmentManager.jsx` - Scanner tab
- `client/src/components/PhotoDetailsSidebar.jsx` - Scanner info
- `client/src/hooks/useFilePreviews.js` - BMP handling
- `client/src/utils/previewUtils.js` - Add `.fff` to RAW detection
- `client/src/utils/fileTypes.js` - BMP/FFF detection
- `electron-gpu/main.js` - Add FFF MIME type

---

## Open Questions

1. **DSLR Scanning Rig**: Should scanner type "dslr_scan" link to existing camera + lens equipment, or store separately?
   - **Recommendation**: Link to existing equipment to avoid duplication

2. **Auto-match Scanner**: When uploading, should we auto-match scanner by EXIF Make/Model to equipment library?
   - **Recommendation**: Yes, with user confirmation option

3. **Batch Scanner Assignment**: Should rolls have a default scanner that applies to all photos?
   - **Recommendation**: Yes, like camera/lens defaults

4. **XMP vs Standard EXIF**: Use custom XMP namespace or try to fit into standard EXIF tags?
   - **Recommendation**: Use XMP custom namespace for scanner info, standard tags for film camera

5. **FFF vs 3FR 区分**: Hasselblad 数码后背使用 `.3fr`，Imacon 扫描仪使用 `.fff`，是否需要区分处理？
   - **Recommendation**: 都作为 RAW 处理，但在扫描仪检测时根据 Model 名称（Flextight/Ixpress）判断是否为扫描仪文件

---

## Appendix: Scanner EXIF Tag Examples

### Epson V850 Scan (TIFF)
```
Make: EPSON
Model: Perfection V850 Pro
Software: Epson Scan 2 version 6.4.9
XResolution: 4800
YResolution: 4800
ResolutionUnit: 2 (inches)
BitsPerSample: 16 16 16
DateTime: 2025:12:15 14:30:22
```

### Nikon Coolscan 5000 ED (TIFF)
```
Make: NIKON CORPORATION
Model: LS-5000 ED
Software: Nikon Scan 4.0.3
XResolution: 4000
YResolution: 4000
```

### VueScan Output (TIFF)
```
Make: (Scanner make from hardware)
Software: VueScan 9.7.89 (64 bit)
XResolution: 6400
```

### DSLR Scan (RAW/TIFF)
```
Make: SONY
Model: ILCE-7RM4
LensModel: Sony FE 90mm F2.8 Macro G OSS
Software: Adobe Lightroom Classic 11.0
```

### Imacon Flextight X5 Scan (FFF)
```
Make: Imacon
Model: Flextight X5
Software: FlexColor 4.8.5
XResolution: 8000
YResolution: 8000
ResolutionUnit: 2 (inches)
BitsPerSample: 16
ColorSpace: 65535 (Uncalibrated)
ICCProfile: (Embedded Hasselblad RGB profile)
```

### Hasselblad Flextight X1 Scan (FFF)
```
Make: Hasselblad
Model: Flextight X1
Software: FlexColor 4.8
XResolution: 6300
YResolution: 6300
BitsPerSample: 16
```

### Hasselblad H5D-50c (3FR) - 数码后背，非扫描仪
```
Make: Hasselblad
Model: H5D-50c
Software: Phocus 3.4
LensModel: HC 80mm f/2.8
ISO: 100
ExposureTime: 1/125
FNumber: 8
```

---

## Appendix: Supported Scanner Models Reference

### Hasselblad/Imacon Flextight 系列 (胶片扫描仪)

| 型号 | 最大分辨率 | 支持格式 | 输出文件 |
|-----|----------|---------|---------|
| Flextight 343 | 3200 DPI | 35mm, 120 | FFF, TIFF |
| Flextight 646 | 3200 DPI | 35mm, 120, 4x5 | FFF, TIFF |
| Flextight 848 | 5760 DPI | 35mm, 120, 4x5 | FFF, TIFF |
| Flextight 949 | 6300 DPI | 35mm, 120, 4x5, 8x10 | FFF, TIFF |
| Flextight X1 | 6300 DPI | 35mm, 120, 4x5 | FFF, TIFF |
| Flextight X5 | 8000 DPI | 35mm, 120, 4x5, 8x10 | FFF, TIFF |

### Imacon Ixpress 数码后背

| 型号 | 分辨率 | 输出文件 |
|-----|-------|---------|
| Ixpress 96 | 16MP | FFF |
| Ixpress 132C | 22MP | FFF |
| Ixpress 384 | 22MP | FFF |
| Ixpress 528C | 22MP | FFF |

### 富士扫描仪 (BMP 输出)

| 型号 | 输出格式 | 备注 |
|-----|---------|-----|
| Frontier SP-500 | BMP, JPEG | 冲洗店常用 |
| Frontier SP-3000 | BMP, JPEG | 专业扫描 |
| Frontier SP-4000 | BMP, JPEG | 高端型号 |

---

## Appendix: File Format Technical Details

### FFF (Flexible File Format)

- **Magic Bytes**: `0x49 0x49 0x55 0x00` (Little-endian) 或 `0x4D 0x4D 0x00 0x55` (Big-endian)
- **Structure**: TIFF-like container with proprietary extensions
- **Color Depth**: 通常 16-bit per channel
- **Color Space**: Hasselblad RGB 或 Adobe RGB (embedded ICC)
- **Compression**: 无压缩或 proprietary lossless
- **LibRaw Support**: ✅ Full support via dcraw core

### 3FR (Hasselblad RAW)

- **Magic Bytes**: Similar to FFF
- **Structure**: FFF variant for digital backs
- **Color Depth**: 16-bit
- **LibRaw Support**: ✅ Full support

### BMP (Windows Bitmap)

- **Magic Bytes**: `0x42 0x4D` ("BM")
- **Structure**: Uncompressed raster
- **Color Depth**: 1/4/8/16/24/32-bit
- **Sharp Support**: ✅ Read only (converts to JPEG/PNG on output)
- **Browser Support**: ✅ All major browsers
