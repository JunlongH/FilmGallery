/**
 * Edge Detection Service
 * 
 * 服务端边缘检测服务，使用 Sharp 进行图像预处理
 * 支持 RAW 文件格式（通过 raw-decoder 解码）
 * 
 * @module server/services/edge-detection-service
 */

const sharp = require('sharp');
const path = require('path');
const fs = require('fs').promises;
const edgeDetection = require('../../packages/shared/edgeDetection');
const rawDecoder = require('./raw-decoder');

/**
 * 边缘检测服务类
 */
class EdgeDetectionService {
  constructor() {
    // 默认配置
    this.defaultOptions = {
      maxWidth: 1200,        // 预处理最大宽度
      sensitivity: 50,       // 默认灵敏度
      filmFormat: 'auto',    // 自动检测格式
      expectDarkBorder: true // 期望暗色边框
    };
  }

  /**
   * 检测单张图像的边缘
   * 
   * @param {string} imagePath - 图像路径
   * @param {Object} [options] - 检测选项
   * @returns {Promise<Object>} 检测结果
   */
  async detectEdges(imagePath, options = {}) {
    const opts = { ...this.defaultOptions, ...options };
    const startTime = Date.now();

    try {
      // 1. 读取并预处理图像
      const imageData = await this.preprocessImage(imagePath, opts.maxWidth);
      
      // 2. 执行边缘检测
      const result = edgeDetection.detectEdges(imageData, {
        sensitivity: opts.sensitivity,
        filmFormat: opts.filmFormat,
        expectDarkBorder: opts.expectDarkBorder,
        returnDebugInfo: true
      });

      // 3. 验证结果（降低阈值以允许"无边框"情况通过）
      const isValid = edgeDetection.isResultValid(result, 0.1);

      return {
        success: true,
        result: {
          cropRect: result.cropRect,
          rotation: result.rotation,
          confidence: result.confidence,
          isValid,
          debugInfo: {
            ...result.debugInfo,
            totalTimeMs: Date.now() - startTime,
            originalSize: imageData.originalSize,
            processedSize: { width: imageData.width, height: imageData.height },
            isRaw: imageData.isRaw || false,
            rawDecodeTimeMs: imageData.rawDecodeTime || 0
          }
        }
      };
    } catch (error) {
      console.error('Edge detection error:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * 批量检测边缘
   * 
   * @param {Array<{id: number, path: string}>} images - 图像列表
   * @param {Object} [options] - 检测选项
   * @returns {Promise<Array>} 检测结果数组
   */
  async detectEdgesBatch(images, options = {}) {
    const results = [];

    for (const image of images) {
      try {
        const result = await this.detectEdges(image.path, options);
        results.push({
          id: image.id,
          ...result
        });
      } catch (error) {
        results.push({
          id: image.id,
          success: false,
          error: error.message
        });
      }
    }

    return results;
  }

  /**
   * 预处理图像：读取、缩放、转换为灰度
   * 支持 RAW 文件格式（CR2, NEF, ARW 等）
   * 
   * @param {string} imagePath - 图像路径
   * @param {number} maxWidth - 最大宽度
   * @returns {Promise<Object>} { data, width, height, channels, originalSize, isRaw }
   */
  async preprocessImage(imagePath, maxWidth = 1200) {
    let input = imagePath;
    let isRaw = false;
    let rawDecodeTime = 0;

    // RAW 格式特殊处理：使用 raw-decoder 解码
    if (rawDecoder.isRawFile(imagePath)) {
      isRaw = true;
      const decodeStart = Date.now();
      
      try {
        // 使用 halfSize 快速解码，减少内存和时间
        // outputFormat: 'jpeg' 兼容性最好，sharp 可直接读取
        const buffer = await rawDecoder.decode(imagePath, { 
          outputFormat: 'jpeg',
          halfSize: true 
        });
        input = buffer;
        rawDecodeTime = Date.now() - decodeStart;
        console.log(`[EdgeDetection] RAW decode: ${path.basename(imagePath)} took ${rawDecodeTime}ms`);
      } catch (error) {
        console.error(`[EdgeDetection] RAW decode failed for ${path.basename(imagePath)}:`, error.message);
        throw new Error(`RAW decode failed: ${error.message}`);
      }
    }

    // 读取图像元数据 (input 可能是路径字符串，也可能是 Buffer)
    const metadata = await sharp(input).metadata();
    const originalSize = { width: metadata.width, height: metadata.height };

    // 计算缩放比例 (基于解码后的尺寸)
    const scale = metadata.width > maxWidth ? maxWidth / metadata.width : 1;
    const newWidth = Math.round(metadata.width * scale);
    const newHeight = Math.round(metadata.height * scale);

    // 缩放并转换为 RGB (使用 input，可能是路径或 Buffer)
    const { data, info } = await sharp(input)
      .resize(newWidth, newHeight, { fit: 'inside' })
      .removeAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });

    return {
      data: new Uint8Array(data),
      width: info.width,
      height: info.height,
      channels: info.channels,
      originalSize,
      isRaw,
      rawDecodeTime
    };
  }

  /**
   * 将归一化的裁剪结果转换为实际像素坐标
   * 
   * @param {Object} normalizedRect - 归一化矩形 {x, y, w, h}
   * @param {number} imageWidth - 图像宽度
   * @param {number} imageHeight - 图像高度
   * @returns {Object} 像素坐标矩形
   */
  denormalizeRect(normalizedRect, imageWidth, imageHeight) {
    return {
      x: Math.round(normalizedRect.x * imageWidth),
      y: Math.round(normalizedRect.y * imageHeight),
      w: Math.round(normalizedRect.w * imageWidth),
      h: Math.round(normalizedRect.h * imageHeight)
    };
  }

  /**
   * 应用边缘检测结果到图像 (裁剪和旋转)
   * 支持 RAW 文件格式
   * 
   * @param {string} inputPath - 输入图像路径
   * @param {string} outputPath - 输出图像路径
   * @param {Object} cropRect - 归一化裁剪区域
   * @param {number} rotation - 旋转角度
   * @returns {Promise<Object>} 处理结果
   */
  async applyDetectionResult(inputPath, outputPath, cropRect, rotation = 0) {
    let input = inputPath;
    
    // RAW 文件需要先解码
    if (rawDecoder.isRawFile(inputPath)) {
      try {
        // 对于应用裁剪结果，不使用 halfSize 以保持质量
        const buffer = await rawDecoder.decode(inputPath, { 
          outputFormat: 'jpeg',
          quality: 95,
          halfSize: false  // 保持全分辨率
        });
        input = buffer;
        console.log(`[EdgeDetection] RAW decoded for apply: ${path.basename(inputPath)}`);
      } catch (error) {
        console.error(`[EdgeDetection] RAW decode failed for apply: ${error.message}`);
        throw new Error(`RAW decode failed: ${error.message}`);
      }
    }
    
    const metadata = await sharp(input).metadata();
    const pixelRect = this.denormalizeRect(cropRect, metadata.width, metadata.height);

    let pipeline = sharp(input);

    // 先旋转
    if (Math.abs(rotation) > 0.1) {
      pipeline = pipeline.rotate(rotation, { background: { r: 0, g: 0, b: 0 } });
    }

    // 再裁剪
    pipeline = pipeline.extract({
      left: Math.max(0, pixelRect.x),
      top: Math.max(0, pixelRect.y),
      width: Math.min(pixelRect.w, metadata.width - pixelRect.x),
      height: Math.min(pixelRect.h, metadata.height - pixelRect.y)
    });

    await pipeline.toFile(outputPath);

    return {
      success: true,
      outputPath,
      dimensions: { width: pixelRect.w, height: pixelRect.h }
    };
  }

  /**
   * 验证裁剪区域是否与现有手动裁剪兼容
   * 用于检查自动检测结果是否会覆盖用户的手动调整
   * 
   * @param {Object} autoRect - 自动检测的裁剪区域
   * @param {Object} manualRect - 现有手动裁剪区域
   * @param {number} threshold - IoU 阈值 (默认 0.9)
   * @returns {boolean} 是否相似 (true = 可以安全覆盖)
   */
  isRectSimilar(autoRect, manualRect, threshold = 0.9) {
    // 计算 IoU
    const x1 = Math.max(autoRect.x, manualRect.x);
    const y1 = Math.max(autoRect.y, manualRect.y);
    const x2 = Math.min(autoRect.x + autoRect.w, manualRect.x + manualRect.w);
    const y2 = Math.min(autoRect.y + autoRect.h, manualRect.y + manualRect.h);

    if (x2 <= x1 || y2 <= y1) return false;

    const intersection = (x2 - x1) * (y2 - y1);
    const area1 = autoRect.w * autoRect.h;
    const area2 = manualRect.w * manualRect.h;
    const union = area1 + area2 - intersection;

    const iou = union > 0 ? intersection / union : 0;
    return iou >= threshold;
  }
}

// 导出单例
module.exports = new EdgeDetectionService();
