# @filmgallery/libraw-native

Native LibRaw 0.22 bindings for Node.js with N-API support.

## Features

- **LibRaw 0.22+**: Supports 1284+ camera models including Panasonic DC-S9
- **Async Operations**: Non-blocking file loading and processing
- **Promise API**: Modern async/await interface
- **Cross-platform**: Windows, macOS, and Linux support
- **Prebuilt Binaries**: Optional prebuildify support for faster installation

## Installation

### Prerequisites

**Windows:**
- Visual Studio Build Tools 2022 (with C++ workload)
- Python 3.6+
- Node.js 16+

**macOS:**
- Xcode Command Line Tools
- Node.js 16+

**Linux:**
- GCC 7+ or Clang 8+
- Node.js 16+
- libpthread

### Install

```bash
cd packages/@filmgallery/libraw-native
npm install
npm run build
```

### Download LibRaw Source

Before building, you need to download LibRaw 0.22 source:

```bash
# Create deps directory
mkdir -p deps

# Download and extract LibRaw 0.22
curl -L https://github.com/LibRaw/LibRaw/archive/refs/tags/0.22.0.tar.gz -o libraw.tar.gz
tar -xzf libraw.tar.gz -C deps
mv deps/LibRaw-0.22.0 deps/libraw
rm libraw.tar.gz
```

Or on Windows (PowerShell):

```powershell
# Create deps directory
New-Item -ItemType Directory -Force -Path deps

# Download and extract LibRaw 0.22
Invoke-WebRequest -Uri "https://github.com/LibRaw/LibRaw/archive/refs/tags/0.22.0.zip" -OutFile "libraw.zip"
Expand-Archive -Path "libraw.zip" -DestinationPath "deps"
Rename-Item -Path "deps\LibRaw-0.22.0" -NewName "libraw"
Remove-Item "libraw.zip"
```

## Usage

### Basic Usage

```javascript
const { LibRawProcessor, getVersion } = require('@filmgallery/libraw-native');

// Check version
console.log(getVersion()); // { version: '0.22.0', versionNumber: 576 }

// Create processor
const processor = new LibRawProcessor();

// Load and process a RAW file
await processor.loadFile('/path/to/photo.rw2');
await processor.dcrawProcess();
const image = await processor.makeMemImage();

console.log(`Image: ${image.width}x${image.height}, ${image.bits} bits`);
// image.data is a Buffer containing RGB pixel data

processor.close();
```

### High-level API

```javascript
const { decodeToJPEG, decodeToTIFF, getMetadata } = require('@filmgallery/libraw-native/processor');

// Decode to JPEG
const jpegResult = await decodeToJPEG('/path/to/photo.cr3', {
    quality: 95,
    useCameraWB: true
});
// jpegResult.buffer is a JPEG Buffer

// Decode to TIFF
const tiffResult = await decodeToTIFF('/path/to/photo.nef', {
    compression: 'none'
});

// Get metadata only
const metadata = await getMetadata('/path/to/photo.arw');
console.log(metadata.camera, metadata.iso, metadata.shutter);
```

### Configuration Options

```javascript
const { ColorSpace, DemosaicQuality, HighlightMode } = require('@filmgallery/libraw-native');

processor.setOutputColorSpace(ColorSpace.SRGB);    // Output color space
processor.setOutputBps(16);                         // 8 or 16 bit output
processor.setQuality(DemosaicQuality.AHD);         // Demosaic algorithm
processor.setUseCameraWB(true);                    // Use camera white balance
processor.setNoAutoBright(true);                   // Disable auto brightness
processor.setHalfSize(false);                      // Half-size output (faster)
processor.setHighlightMode(HighlightMode.CLIP);   // Highlight recovery
```

## API Reference

### Module Functions

| Function | Description |
|----------|-------------|
| `getVersion()` | Returns LibRaw version info |
| `getCameraList()` | Returns array of supported camera names |
| `getCameraCount()` | Returns number of supported cameras |
| `isSupportedCamera(model)` | Check if camera model is supported |
| `isAvailable()` | Check if native module loaded successfully |

### LibRawProcessor Class

#### Async Methods

| Method | Description |
|--------|-------------|
| `loadFile(path)` | Load RAW file from disk |
| `loadBuffer(buffer)` | Load RAW from Buffer |
| `unpack()` | Unpack RAW data |
| `dcrawProcess()` | Process image (demosaic, WB, etc.) |
| `processImage()` | Alias for dcrawProcess() |
| `makeMemImage()` | Create in-memory image |
| `unpackThumbnail()` | Unpack embedded thumbnail |
| `makeMemThumbnail()` | Create in-memory thumbnail |

#### Sync Methods

| Method | Description |
|--------|-------------|
| `getMetadata()` | Get camera/image metadata |
| `getImageSize()` | Get image dimensions |
| `getLensInfo()` | Get lens information |
| `getColorInfo()` | Get color/WB information |

#### Configuration Methods

| Method | Description |
|--------|-------------|
| `setOutputColorSpace(cs)` | Set output color space (0-8) |
| `setOutputBps(bits)` | Set output bits (8 or 16) |
| `setGamma(power, slope)` | Set gamma correction |
| `setWhiteBalance(r, g1, b, g2)` | Set custom WB multipliers |
| `setHalfSize(bool)` | Enable half-size output |
| `setNoAutoBright(bool)` | Disable auto brightness |
| `setUseCameraWB(bool)` | Use camera white balance |
| `setUseAutoWB(bool)` | Use auto white balance |
| `setQuality(q)` | Set demosaic quality (0-12) |
| `setHighlightMode(mode)` | Set highlight recovery (0-9) |

### Constants

#### ColorSpace
- `RAW` (0), `SRGB` (1), `ADOBE` (2), `WIDE` (3), `PROPHOTO` (4)
- `XYZ` (5), `ACES` (6), `DCIP3` (7), `REC2020` (8)

#### DemosaicQuality
- `LINEAR` (0), `VNG` (1), `PPG` (2), `AHD` (3), `DCB` (4)
- `DHT` (11), `AAHD` (12)

#### HighlightMode
- `CLIP` (0), `UNCLIP` (1), `BLEND` (2)
- `REBUILD_3` (3), `REBUILD_5` (5), `REBUILD_7` (7), `REBUILD_9` (9)

## Supported Cameras

LibRaw 0.22 supports 1284 camera models including:

- **Canon**: EOS R series, 5D series, 6D series, 90D, etc.
- **Nikon**: Z series, D series
- **Sony**: A7/A9 series, A6xxx series, ZV-E series
- **Fujifilm**: X-T series, X-S series, GFX series
- **Panasonic**: S series (including DC-S9), G series, GH series
- **Olympus/OM**: E-M series, OM-1, etc.
- **Pentax**: K series
- **Leica**: M series, SL series, Q series
- And many more...

## License

MIT
