/**
 * RAW Decoder Service (Native LibRaw via lightdrift-libraw)
 * 
 * 使用 lightdrift-libraw 原生绑定解码 RAW 文件
 */

const path = require('path');

let LibRaw = null;
let initError = null;
let libVersion = null;

// 支持的 RAW 格式扩展名
const SUPPORTED_EXTENSIONS = [
  '.dng', '.cr2', '.cr3', '.nef', '.arw', 
  '.raf', '.orf', '.rw2', '.pef', '.srw',
  '.x3f', '.erf', '.mef', '.mos', '.mrw',
  '.kdc', '.3fr', '.dcr', '.k25', '.qtk'
];

// 尝试加载 lightdrift-libraw
try {
  LibRaw = require('lightdrift-libraw');
  libVersion = LibRaw.getVersion ? LibRaw.getVersion() : 'unknown';
  console.log('[RawDecoder] lightdrift-libraw loaded successfully, version:', libVersion);
} catch (e) {
  initError = e;
  console.error('[RawDecoder] Failed to load lightdrift-libraw:', e.message);
  console.error('[RawDecoder] RAW file decoding will be unavailable.');
}

class RawDecoder {
  constructor() {
    this.supportedExtensions = SUPPORTED_EXTENSIONS;
  }

  /**
   * 判断是否为支持的 RAW 文件
   */
  isRawFile(filename) {
    if (!filename) return false;
    const ext = path.extname(filename).toLowerCase();
    return this.supportedExtensions.includes(ext);
  }

  /**
   * 检查解码器是否可用
   */
  async isAvailable() {
    return LibRaw !== null;
  }

  /**
   * 获取解码器版本信息
   */
  async getVersion() {
    return {
      decoder: 'lightdrift-libraw',
      version: libVersion || 'unavailable',
      available: LibRaw !== null
    };
  }

  /**
   * 获取支持的格式列表
   */
  getSupportedFormats() {
    return {
      extensions: SUPPORTED_EXTENSIONS,
      formats: [
        { ext: '.dng', name: 'Adobe Digital Negative' },
        { ext: '.cr2', name: 'Canon RAW 2' },
        { ext: '.cr3', name: 'Canon RAW 3' },
        { ext: '.nef', name: 'Nikon Electronic Format' },
        { ext: '.arw', name: 'Sony Alpha RAW' },
        { ext: '.raf', name: 'Fujifilm RAW' },
        { ext: '.orf', name: 'Olympus RAW Format' },
        { ext: '.rw2', name: 'Panasonic RAW' },
        { ext: '.pef', name: 'Pentax Electronic Format' },
        { ext: '.srw', name: 'Samsung RAW' },
        { ext: '.x3f', name: 'Sigma RAW' },
        { ext: '.erf', name: 'Epson RAW Format' },
        { ext: '.mef', name: 'Mamiya Electronic Format' },
        { ext: '.mos', name: 'Leaf RAW' },
        { ext: '.mrw', name: 'Minolta RAW' },
        { ext: '.kdc', name: 'Kodak Digital Camera' },
        { ext: '.3fr', name: 'Hasselblad RAW' },
        { ext: '.dcr', name: 'Kodak RAW' },
        { ext: '.k25', name: 'Kodak DC25' },
        { ext: '.qtk', name: 'Apple QuickTake' }
      ]
    };
  }

  /**
   * 解码 RAW 文件到 Buffer（JPEG 或 TIFF）
   * 
   * @param {string} inputPath - 输入文件路径
   * @param {Object} options - 解码选项
   * @param {string} options.outputFormat - 输出格式 ('jpeg' | 'tiff')，默认 'jpeg'
   * @param {number} options.quality - JPEG 质量 (1-100)，默认 95
   * @param {Function} onProgress - 进度回调 (percent, message)
   * @returns {Promise<Buffer>} 图像 Buffer
   */
  async decode(inputPath, options = {}, onProgress = null) {
    if (!LibRaw) {
      throw new Error('RAW decoder not available: ' + (initError?.message || 'lightdrift-libraw not installed'));
    }

    const processor = new LibRaw();
    const outputFormat = (options.outputFormat || 'jpeg').toLowerCase();
    
    try {
      if (onProgress) onProgress(10, '加载 RAW 文件...');
      
      // 加载文件（异步）
      const loadResult = await processor.loadFile(inputPath);
      if (!loadResult) {
        throw new Error('Failed to load RAW file');
      }
      
      if (onProgress) onProgress(50, '处理图像...');
      
      // 处理图像（去马赛克、白平衡等）- 直接调用，不需要先 unpack
      const processResult = await processor.processImage();
      if (!processResult) {
        throw new Error('Failed to process image');
      }
      
      if (onProgress) onProgress(80, `生成 ${outputFormat.toUpperCase()}...`);
      
      let result;
      let formatLabel;
      
      if (outputFormat === 'tiff') {
        // 生成 TIFF Buffer（无损，适合后续处理）
        result = await processor.createTIFFBuffer({
          compression: options.compression || 'none'  // 'none', 'lzw', 'zip'
        });
        formatLabel = 'TIFF';
      } else {
        // 生成 JPEG Buffer（默认）
        const quality = options.quality || 95;
        result = await processor.createJPEGBuffer({ 
          quality,
          progressive: options.progressive || false
        });
        formatLabel = 'JPEG';
      }
      
      if (!result.success || !result.buffer) {
        throw new Error(`Failed to create ${formatLabel} buffer`);
      }
      
      if (onProgress) onProgress(100, '完成');
      
      const dims = result.metadata?.outputDimensions || result.metadata?.dimensions || {};
      console.log(`[RawDecoder] Decoded ${path.basename(inputPath)} to ${formatLabel}: ${dims.width || '?'}x${dims.height || '?'}, ${(result.buffer.length / 1024).toFixed(1)}KB`);
      
      return result.buffer;

    } catch (e) {
      console.error('[RawDecoder] Decode error:', e);
      throw new Error(`RAW decoding failed: ${e.message}`);
    } finally {
      try { await processor.close(); } catch (_) {}
    }
  }

  /**
   * 提取缩略图（快速预览）
   */
  async extractThumbnail(inputPath) {
    if (!LibRaw) {
      throw new Error('RAW decoder not available');
    }
    
    const processor = new LibRaw();
    try {
      await processor.loadFile(inputPath);
      await processor.unpackThumbnail();
      const thumbData = await processor.createMemoryThumbnail();
      
      // createMemoryThumbnail 返回 { data: Buffer, ... }
      if (thumbData && thumbData.data && thumbData.dataSize > 0) {
        return thumbData.data;
      }
      
      // 如果没有嵌入缩略图，生成一个小尺寸的 JPEG
      console.log('[RawDecoder] No embedded thumbnail, generating from full image...');
      await processor.processImage();
      const result = await processor.createJPEGBuffer({ 
        quality: 80,
        width: 400  // 限制宽度
      });
      return result.buffer;
    } finally {
      try { await processor.close(); } catch (_) {}
    }
  }

  /**
   * 获取 RAW 文件元数据
   */
  async getMetadata(inputPath) {
    if (!LibRaw) {
      return this.extractMetadataExiftool(inputPath);
    }
    
    const processor = new LibRaw();
    try {
      await processor.loadFile(inputPath);
      const meta = await processor.getMetadata();
      const size = await processor.getImageSize();
      
      let lens = null;
      try {
        lens = await processor.getLensInfo();
      } catch (e) {
        // 某些 RAW 文件可能没有镜头信息
      }
      
      return {
        camera: meta.model,
        make: meta.make,
        lens: lens?.lens || lens?.lensName,
        iso: meta.iso,
        shutter: meta.shutterSpeed,
        aperture: meta.aperture,
        focalLength: meta.focalLength,
        width: size?.width || meta.rawWidth,
        height: size?.height || meta.rawHeight,
        date: meta.timestamp ? new Date(meta.timestamp * 1000) : null
      };
    } catch (e) {
      console.warn('[RawDecoder] LibRaw metadata failed, fallback to exiftool:', e.message);
      return this.extractMetadataExiftool(inputPath);
    } finally {
      try { await processor.close(); } catch (_) {}
    }
  }

  /**
   * 使用 exiftool 提取元数据（后备）
   */
  async extractMetadataExiftool(inputPath) {
    try {
      const exiftool = require('exiftool-vendored').exiftool;
      const tags = await exiftool.read(inputPath);
      return {
        camera: tags.Model,
        make: tags.Make,
        lens: tags.LensID || tags.LensModel,
        iso: tags.ISO,
        shutter: tags.ShutterSpeed,
        aperture: tags.FNumber,
        focalLength: tags.FocalLength,
        width: tags.ImageWidth,
        height: tags.ImageHeight,
        date: tags.DateTimeOriginal
      };
    } catch (e) {
      console.warn('[RawDecoder] Metadata extraction failed:', e.message);
      return {};
    }
  }

  async extractMetadata(inputPath) {
    return this.getMetadata(inputPath);
  }

  async batchDecode(files, options, onProgress = null) {
    const results = [];
    const total = files.length;
    
    for (let i = 0; i < total; i++) {
      const file = files[i];
      try {
        const buffer = await this.decode(file.path, options);
        results.push({ id: file.id, success: true, buffer });
      } catch (e) {
        results.push({ id: file.id, success: false, error: e.message });
      }
      
      if (onProgress) {
        onProgress(Math.round(((i + 1) / total) * 100), `处理 ${i + 1}/${total}`);
      }
    }
    return results;
  }
}

// 导出实例和常量
const rawDecoder = new RawDecoder();

module.exports = rawDecoder;
module.exports.SUPPORTED_EXTENSIONS = SUPPORTED_EXTENSIONS;
