# RAW 文件解码设置指南

本文档说明如何设置 RAW 文件解码功能。

## 依赖项

RAW 解码功能依赖 **dcraw** - 一个开源的 RAW 文件解码器。

## 安装 dcraw

### Windows

1. 下载 dcraw.exe: https://www.dechifro.org/dcraw/
2. 将 `dcraw.exe` 放到以下位置之一:
   - 添加到系统 PATH 环境变量
   - 放到 `C:\Windows\System32\`
   - 放到 FilmGallery 服务器目录

### macOS

使用 Homebrew 安装:

```bash
brew install dcraw
```

### Linux (Ubuntu/Debian)

```bash
sudo apt-get install dcraw
```

### Linux (Fedora/RHEL)

```bash
sudo dnf install dcraw
```

## 验证安装

在终端运行:

```bash
dcraw -v
```

如果安装成功，会显示版本信息。

## 支持的 RAW 格式

| 格式 | 相机品牌 |
|------|----------|
| DNG | Adobe (通用) |
| CR2, CR3 | Canon |
| ARW | Sony |
| NEF | Nikon |
| ORF | Olympus |
| RAF | Fujifilm |
| RW2 | Panasonic |
| PEF | Pentax |
| SRW | Samsung |
| 3FR | Hasselblad |
| DCR, KDC | Kodak |
| MRW | Minolta |
| X3F | Sigma |

## 使用方法

1. 在 Roll 详情页面点击 **Import RAW** 按钮
2. 拖拽或选择 RAW 文件
3. 配置解码选项（色彩空间、白平衡等）
4. 点击开始导入

## 常见问题

### Q: 解码器显示"不可用"

**A:** 确保已正确安装 dcraw 并添加到系统 PATH。

### Q: 解码速度很慢

**A:** RAW 文件通常很大（20-50MB），解码需要时间。可以选择"半尺寸输出"加快速度。

### Q: 某些 RAW 格式不支持

**A:** dcraw 可能不支持最新的相机 RAW 格式。可以尝试使用相机厂商软件转换为 DNG 格式。

## 输出选项

### 色彩空间

- **sRGB** - 标准 Web 色彩空间 (推荐)
- **Adobe RGB** - 广色域，适合打印
- **ProPhoto RGB** - 超广色域，专业后期
- **RAW** - 无色彩空间转换

### 白平衡

- **相机白平衡** - 使用拍摄时的设置
- **自动白平衡** - dcraw 自动计算
- **日光/钨丝灯/荧光灯** - 预设白平衡

### 解码质量

- **预览** - 快速，分辨率较低
- **标准** - 正常质量
- **高质量** - 最佳质量，速度较慢
