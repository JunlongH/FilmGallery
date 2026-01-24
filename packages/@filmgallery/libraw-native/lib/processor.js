/**
 * @filmgallery/libraw-native - Image Processing Utilities
 * 
 * High-level functions for common RAW processing tasks
 * 
 * @module @filmgallery/libraw-native/processor
 */

'use strict';

const { LibRawProcessor, ColorSpace, DemosaicQuality } = require('./index');
const sharp = require('sharp');

/**
 * Default processing options
 */
const DEFAULT_OPTIONS = {
    colorSpace: ColorSpace.SRGB,
    outputBps: 16,
    quality: DemosaicQuality.AHD,
    useCameraWB: true,
    useAutoWB: false,
    noAutoBright: true,
    halfSize: false,
    highlightMode: 0
};

/**
 * Decode a RAW file and return raw pixel data
 * 
 * @param {string|Buffer} input - File path or Buffer containing RAW data
 * @param {Object} options - Processing options
 * @param {number} [options.colorSpace=1] - Output color space (ColorSpace enum)
 * @param {number} [options.outputBps=16] - Bits per sample (8 or 16)
 * @param {number} [options.quality=3] - Demosaic quality (DemosaicQuality enum)
 * @param {boolean} [options.useCameraWB=true] - Use camera white balance
 * @param {boolean} [options.useAutoWB=false] - Use auto white balance
 * @param {boolean} [options.noAutoBright=true] - Disable auto brightness
 * @param {boolean} [options.halfSize=false] - Output half-size image
 * @returns {Promise<{data: Buffer, width: number, height: number, bits: number, colors: number, metadata: Object}>}
 */
async function decodeRaw(input, options = {}) {
    const opts = { ...DEFAULT_OPTIONS, ...options };
    const processor = new LibRawProcessor();
    
    try {
        // Load file or buffer
        if (typeof input === 'string') {
            await processor.loadFile(input);
        } else if (Buffer.isBuffer(input)) {
            await processor.loadBuffer(input);
        } else {
            throw new Error('Input must be a file path or Buffer');
        }
        
        // Get metadata before processing
        const metadata = processor.getMetadata();
        const sizeInfo = processor.getImageSize();
        
        // Configure processing parameters
        processor.setOutputColorSpace(opts.colorSpace);
        processor.setOutputBps(opts.outputBps);
        processor.setQuality(opts.quality);
        processor.setUseCameraWB(opts.useCameraWB);
        processor.setUseAutoWB(opts.useAutoWB);
        processor.setNoAutoBright(opts.noAutoBright);
        processor.setHalfSize(opts.halfSize);
        processor.setHighlightMode(opts.highlightMode);
        
        // Process
        await processor.dcrawProcess();
        
        // Get image data
        const imageResult = await processor.makeMemImage();
        
        return {
            data: imageResult.data,
            width: imageResult.width,
            height: imageResult.height,
            bits: imageResult.bits,
            colors: imageResult.colors,
            metadata: {
                ...metadata,
                ...sizeInfo
            }
        };
    } finally {
        processor.close();
    }
}

/**
 * Decode a RAW file to JPEG buffer
 * 
 * @param {string|Buffer} input - File path or Buffer
 * @param {Object} options - Processing options
 * @param {number} [options.quality=95] - JPEG quality (1-100)
 * @param {boolean} [options.progressive=false] - Progressive JPEG
 * @returns {Promise<{buffer: Buffer, metadata: Object}>}
 */
async function decodeToJPEG(input, options = {}) {
    const rawResult = await decodeRaw(input, options);
    
    // Convert raw RGB data to JPEG using sharp
    const channels = rawResult.colors;
    const depth = rawResult.bits === 16 ? 'ushort' : 'uchar';
    
    const jpegBuffer = await sharp(rawResult.data, {
        raw: {
            width: rawResult.width,
            height: rawResult.height,
            channels: channels,
            depth: depth
        }
    })
    .jpeg({
        quality: options.quality || 95,
        progressive: options.progressive || false
    })
    .toBuffer();
    
    return {
        buffer: jpegBuffer,
        success: true,
        metadata: {
            ...rawResult.metadata,
            outputDimensions: {
                width: rawResult.width,
                height: rawResult.height
            }
        }
    };
}

/**
 * Decode a RAW file to TIFF buffer
 * 
 * @param {string|Buffer} input - File path or Buffer
 * @param {Object} options - Processing options
 * @param {string} [options.compression='none'] - TIFF compression ('none', 'lzw', 'deflate')
 * @returns {Promise<{buffer: Buffer, metadata: Object}>}
 */
async function decodeToTIFF(input, options = {}) {
    const rawResult = await decodeRaw(input, {
        ...options,
        outputBps: 16  // Always use 16-bit for TIFF
    });
    
    const channels = rawResult.colors;
    const depth = rawResult.bits === 16 ? 'ushort' : 'uchar';
    
    let sharpInstance = sharp(rawResult.data, {
        raw: {
            width: rawResult.width,
            height: rawResult.height,
            channels: channels,
            depth: depth
        }
    });
    
    // Configure TIFF options
    const tiffOptions = {
        compression: options.compression || 'none',
        bitdepth: 16
    };
    
    const tiffBuffer = await sharpInstance.tiff(tiffOptions).toBuffer();
    
    return {
        buffer: tiffBuffer,
        success: true,
        metadata: {
            ...rawResult.metadata,
            outputDimensions: {
                width: rawResult.width,
                height: rawResult.height
            }
        }
    };
}

/**
 * Extract embedded thumbnail from RAW file
 * 
 * @param {string|Buffer} input - File path or Buffer
 * @returns {Promise<{data: Buffer, width: number, height: number}|null>}
 */
async function extractThumbnail(input) {
    const processor = new LibRawProcessor();
    
    try {
        if (typeof input === 'string') {
            await processor.loadFile(input);
        } else if (Buffer.isBuffer(input)) {
            await processor.loadBuffer(input);
        } else {
            throw new Error('Input must be a file path or Buffer');
        }
        
        try {
            await processor.unpackThumbnail();
            const thumb = await processor.makeMemThumbnail();
            return {
                data: thumb.data,
                width: thumb.width,
                height: thumb.height,
                success: true
            };
        } catch (e) {
            // No embedded thumbnail, return null
            return null;
        }
    } finally {
        processor.close();
    }
}

/**
 * Get metadata from RAW file without full processing
 * 
 * @param {string|Buffer} input - File path or Buffer
 * @returns {Promise<Object>} Metadata object
 */
async function getMetadata(input) {
    const processor = new LibRawProcessor();
    
    try {
        if (typeof input === 'string') {
            await processor.loadFile(input);
        } else if (Buffer.isBuffer(input)) {
            await processor.loadBuffer(input);
        } else {
            throw new Error('Input must be a file path or Buffer');
        }
        
        const metadata = processor.getMetadata();
        const size = processor.getImageSize();
        const lens = processor.getLensInfo();
        const color = processor.getColorInfo();
        
        return {
            camera: metadata.model,
            make: metadata.make,
            normalizedMake: metadata.normalizedMake,
            normalizedModel: metadata.normalizedModel,
            software: metadata.software,
            iso: metadata.iso,
            shutter: metadata.shutter,
            aperture: metadata.aperture,
            focalLength: metadata.focalLength,
            timestamp: metadata.timestamp,
            artist: metadata.artist,
            desc: metadata.desc,
            width: size.width,
            height: size.height,
            rawWidth: size.rawWidth,
            rawHeight: size.rawHeight,
            flip: size.flip,
            lens: lens.lens || lens.lensMake,
            lensInfo: lens,
            colorInfo: color
        };
    } finally {
        processor.close();
    }
}

module.exports = {
    decodeRaw,
    decodeToJPEG,
    decodeToTIFF,
    extractThumbnail,
    getMetadata,
    DEFAULT_OPTIONS
};
