/**
 * RAW Decoder Service (Native LibRaw with Fallback)
 * 
 * 使用 @filmgallery/libraw-native (LibRaw 0.22) 解码 RAW 文件
 * 如果原生模块不可用，回退到 lightdrift-libraw
 * 
 * @module server/services/raw-decoder
 */

const path = require('path');

// ============================================================================
// 模块加载策略：优先使用新原生模块，回退到旧模块
// ============================================================================

let LibRaw = null;
let libVersion = null;
let initError = null;
let decoderType = 'none';

// 尝试加载 @filmgallery/libraw-native (LibRaw 0.22+)
try {
    const librawNative = require('@filmgallery/libraw-native');
    if (librawNative.isAvailable()) {
        LibRaw = librawNative;
        const versionInfo = librawNative.getVersion();
        libVersion = versionInfo.version;
        decoderType = 'libraw-native';
        console.log('[RawDecoder] @filmgallery/libraw-native loaded successfully, LibRaw version:', libVersion);
    } else {
        throw librawNative.getLoadError() || new Error('Native module not available');
    }
} catch (e1) {
    console.warn('[RawDecoder] @filmgallery/libraw-native not available:', e1.message);
    
    // 回退到 lightdrift-libraw
    try {
        LibRaw = require('lightdrift-libraw');
        libVersion = LibRaw.getVersion ? LibRaw.getVersion() : 'unknown';
        decoderType = 'lightdrift-libraw';
        console.log('[RawDecoder] Fallback to lightdrift-libraw, version:', libVersion);
    } catch (e2) {
        initError = e1;
        console.error('[RawDecoder] Failed to load any RAW decoder:', e1.message);
        console.error('[RawDecoder] RAW file decoding will be unavailable.');
    }
}

// ============================================================================
// 支持的 RAW 格式扩展名
// ============================================================================

const SUPPORTED_EXTENSIONS = [
    '.dng', '.cr2', '.cr3', '.nef', '.arw', 
    '.raf', '.orf', '.rw2', '.pef', '.srw',
    '.x3f', '.erf', '.mef', '.mos', '.mrw',
    '.kdc', '.3fr', '.fff', '.iiq', '.dcr', '.k25', '.qtk'
];

// ============================================================================
// RAW Decoder Class
// ============================================================================

class RawDecoder {
    constructor() {
        this.supportedExtensions = SUPPORTED_EXTENSIONS;
        this.decoderType = decoderType;
    }

    /**
     * 判断是否为支持的 RAW 文件
     * @param {string} filename - 文件名
     * @returns {boolean}
     */
    isRawFile(filename) {
        if (!filename) return false;
        const ext = path.extname(filename).toLowerCase();
        return this.supportedExtensions.includes(ext);
    }

    /**
     * 检查解码器是否可用
     * @returns {Promise<boolean>}
     */
    async isAvailable() {
        return LibRaw !== null;
    }

    /**
     * 获取解码器版本信息
     * @returns {Promise<{decoder: string, version: string, available: boolean, type: string}>}
     */
    async getVersion() {
        return {
            decoder: decoderType,
            version: libVersion || 'unavailable',
            available: LibRaw !== null,
            type: decoderType
        };
    }

    /**
     * 获取支持的格式列表
     * @returns {{extensions: string[], formats: Array<{ext: string, name: string}>}}
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
                { ext: '.3fr', name: 'Hasselblad 3F RAW' },
                { ext: '.fff', name: 'Hasselblad/Imacon FlexFrame' },
                { ext: '.iiq', name: 'Phase One Intelligent Image Quality' },
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
            throw new Error('RAW decoder not available: ' + (initError?.message || 'No decoder installed'));
        }

        const outputFormat = (options.outputFormat || 'jpeg').toLowerCase();

        // 根据解码器类型调用不同的 API
        if (decoderType === 'libraw-native') {
            return this._decodeWithNative(inputPath, outputFormat, options, onProgress);
        } else {
            return this._decodeWithLightdrift(inputPath, outputFormat, options, onProgress);
        }
    }

    /**
     * 使用新原生模块解码
     * @private
     */
    async _decodeWithNative(inputPath, outputFormat, options, onProgress) {
        const { decodeToJPEG, decodeToTIFF } = require('@filmgallery/libraw-native/processor');
        
        try {
            if (onProgress) onProgress(10, '加载 RAW 文件...');
            
            let result;
            if (outputFormat === 'tiff') {
                if (onProgress) onProgress(50, '处理图像...');
                result = await decodeToTIFF(inputPath, {
                    compression: options.compression || 'none',
                    useCameraWB: options.useCameraWB !== false,
                    noAutoBright: true
                });
            } else {
                if (onProgress) onProgress(50, '处理图像...');
                result = await decodeToJPEG(inputPath, {
                    quality: options.quality || 95,
                    progressive: options.progressive || false,
                    useCameraWB: options.useCameraWB !== false,
                    noAutoBright: true
                });
            }
            
            if (onProgress) onProgress(100, '完成');
            
            const dims = result.metadata?.outputDimensions || {};
            console.log(`[RawDecoder] Decoded ${path.basename(inputPath)} to ${outputFormat.toUpperCase()}: ${dims.width || '?'}x${dims.height || '?'}, ${(result.buffer.length / 1024).toFixed(1)}KB`);
            
            return result.buffer;
        } catch (e) {
            console.error('[RawDecoder] Native decode error:', e);
            throw new Error(`RAW decoding failed: ${e.message}`);
        }
    }

    /**
     * 使用 lightdrift-libraw 解码（回退）
     * @private
     */
    async _decodeWithLightdrift(inputPath, outputFormat, options, onProgress) {
        const processor = new LibRaw();
        
        try {
            if (onProgress) onProgress(10, '加载 RAW 文件...');
            
            const loadResult = await processor.loadFile(inputPath);
            if (!loadResult) {
                throw new Error('Failed to load RAW file');
            }
            
            if (onProgress) onProgress(50, '处理图像...');
            
            const processResult = await processor.processImage();
            if (!processResult) {
                throw new Error('Failed to process image');
            }
            
            if (onProgress) onProgress(80, `生成 ${outputFormat.toUpperCase()}...`);
            
            let result;
            let formatLabel;
            
            if (outputFormat === 'tiff') {
                result = await processor.createTIFFBuffer({
                    compression: options.compression || 'none'
                });
                formatLabel = 'TIFF';
            } else {
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
            console.error('[RawDecoder] Lightdrift decode error:', e);
            throw new Error(`RAW decoding failed: ${e.message}`);
        } finally {
            try { await processor.close(); } catch (_) {}
        }
    }

    /**
     * 提取缩略图（快速预览）
     * @param {string} inputPath - 输入文件路径
     * @returns {Promise<Buffer>}
     */
    async extractThumbnail(inputPath) {
        if (!LibRaw) {
            throw new Error('RAW decoder not available');
        }
        
        if (decoderType === 'libraw-native') {
            const { extractThumbnail } = require('@filmgallery/libraw-native/processor');
            const result = await extractThumbnail(inputPath);
            
            if (result && result.data) {
                return result.data;
            }
            
            // 如果没有嵌入缩略图，生成一个小尺寸的 JPEG
            console.log('[RawDecoder] No embedded thumbnail, generating from full image...');
            const { decodeToJPEG } = require('@filmgallery/libraw-native/processor');
            const jpegResult = await decodeToJPEG(inputPath, {
                quality: 80,
                halfSize: true
            });
            return jpegResult.buffer;
        } else {
            // lightdrift-libraw 路径
            const processor = new LibRaw();
            try {
                await processor.loadFile(inputPath);
                await processor.unpackThumbnail();
                const thumbData = await processor.createMemoryThumbnail();
                
                if (thumbData && thumbData.data && thumbData.dataSize > 0) {
                    return thumbData.data;
                }
                
                console.log('[RawDecoder] No embedded thumbnail, generating from full image...');
                await processor.processImage();
                const result = await processor.createJPEGBuffer({ 
                    quality: 80,
                    width: 400
                });
                return result.buffer;
            } finally {
                try { await processor.close(); } catch (_) {}
            }
        }
    }

    /**
     * 获取 RAW 文件元数据
     * @param {string} inputPath - 输入文件路径
     * @returns {Promise<Object>}
     */
    async getMetadata(inputPath) {
        if (!LibRaw) {
            return this.extractMetadataExiftool(inputPath);
        }
        
        try {
            if (decoderType === 'libraw-native') {
                const { getMetadata } = require('@filmgallery/libraw-native/processor');
                const meta = await getMetadata(inputPath);
                
                return {
                    camera: meta.camera,
                    make: meta.make,
                    lens: meta.lens,
                    iso: meta.iso,
                    shutter: meta.shutter,
                    aperture: meta.aperture,
                    focalLength: meta.focalLength,
                    width: meta.width,
                    height: meta.height,
                    date: meta.timestamp ? new Date(meta.timestamp * 1000) : null
                };
            } else {
                // lightdrift-libraw 路径
                const processor = new LibRaw();
                try {
                    await processor.loadFile(inputPath);
                    const meta = await processor.getMetadata();
                    const size = await processor.getImageSize();
                    
                    let lens = null;
                    try {
                        lens = await processor.getLensInfo();
                    } catch (e) {}
                    
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
                } finally {
                    try { await processor.close(); } catch (_) {}
                }
            }
        } catch (e) {
            console.warn('[RawDecoder] LibRaw metadata failed, fallback to exiftool:', e.message);
            return this.extractMetadataExiftool(inputPath);
        }
    }

    /**
     * 使用 exiftool 提取元数据（后备）
     * @param {string} inputPath - 输入文件路径
     * @returns {Promise<Object>}
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

    /**
     * Alias for getMetadata
     * @param {string} inputPath - 输入文件路径
     * @returns {Promise<Object>}
     */
    async extractMetadata(inputPath) {
        return this.getMetadata(inputPath);
    }

    /**
     * 批量解码 RAW 文件
     * @param {Array<{id: any, path: string}>} files - 文件列表
     * @param {Object} options - 解码选项
     * @param {Function} onProgress - 进度回调
     * @returns {Promise<Array<{id: any, success: boolean, buffer?: Buffer, error?: string}>>}
     */
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

    /**
     * 检查特定相机型号是否支持
     * @param {string} model - 相机型号
     * @returns {Promise<boolean>}
     */
    async isCameraSupported(model) {
        if (decoderType === 'libraw-native') {
            const { isSupportedCamera } = require('@filmgallery/libraw-native');
            return isSupportedCamera(model);
        }
        // lightdrift-libraw 不提供此功能
        return true;
    }

    /**
     * 获取支持的相机列表
     * @returns {Promise<string[]>}
     */
    async getSupportedCameras() {
        if (decoderType === 'libraw-native') {
            const { getCameraList } = require('@filmgallery/libraw-native');
            return getCameraList();
        }
        return [];
    }
}

// ============================================================================
// 导出实例和常量
// ============================================================================

const rawDecoder = new RawDecoder();

module.exports = rawDecoder;
module.exports.SUPPORTED_EXTENSIONS = SUPPORTED_EXTENSIONS;
module.exports.RawDecoder = RawDecoder;
