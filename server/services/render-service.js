/**
 * 渲染服务 - 统一的照片渲染逻辑
 * 
 * @module render-service
 * @description 供单张导出和批量导出共用的渲染服务
 */

const path = require('path');
const fs = require('fs');
const sharp = require('sharp');
sharp.cache(false);

const db = require('../db');
const { uploadsDir } = require('../config/paths');
const { buildPipeline } = require('./filmlab-service');
const { RenderCore, EXPORT_MAX_WIDTH, PREVIEW_MAX_WIDTH_SERVER } = require('../../packages/shared');

// ============================================================================
// 照片查询
// ============================================================================

/**
 * 获取照片记录及相关信息
 * @param {number} photoId - 照片 ID
 * @returns {Promise<Object|null>}
 */
async function getPhotoRecord(photoId) {
  return new Promise((resolve, reject) => {
    const sql = `
      SELECT p.*, r.title as roll_title, r.film_type
      FROM photos p
      JOIN rolls r ON p.roll_id = r.id
      WHERE p.id = ?
    `;
    db.get(sql, [photoId], (err, row) => {
      if (err) reject(err);
      else resolve(row || null);
    });
  });
}

/**
 * 获取源文件绝对路径
 * @param {Object} photo - 照片记录
 * @returns {string|null}
 */
function getSourcePath(photo) {
  const relSource = photo.original_rel_path || photo.negative_rel_path || photo.positive_rel_path || photo.full_rel_path;
  if (!relSource) return null;
  const abs = path.join(uploadsDir, relSource);
  return fs.existsSync(abs) ? abs : null;
}

// ============================================================================
// 渲染核心
// ============================================================================

/**
 * 渲染单张照片
 * @param {Object} options
 * @param {number} options.photoId - 照片 ID
 * @param {Object} options.params - FilmLab 处理参数
 * @param {string} [options.format='jpeg'] - 'jpeg' | 'tiff16'
 * @param {number} [options.quality=95] - JPEG 质量 (1-100)
 * @param {number} [options.maxWidth] - 最大宽度 (null = 原尺寸)
 * @returns {Promise<{buffer: Buffer, width: number, height: number, format: string}>}
 */
async function renderPhoto(options) {
  const {
    photoId,
    params = {},
    format = 'jpeg',
    quality = 95,
    maxWidth = null
  } = options;

  // 获取照片记录
  const photo = await getPhotoRecord(photoId);
  if (!photo) {
    throw new Error(`Photo not found: ${photoId}`);
  }

  // 获取源文件
  const sourcePath = getSourcePath(photo);
  if (!sourcePath) {
    throw new Error(`Source file not found for photo: ${photoId}`);
  }

  // 构建几何变换管道 (旋转、裁剪、缩放)
  let img = await buildPipeline(sourcePath, params, {
    maxWidth: maxWidth || EXPORT_MAX_WIDTH,
    cropRect: params.cropRect || null,
    toneAndCurvesInJs: true,
    skipColorOps: true
  });

  // 获取原始像素数据
  const { data, info } = await img.raw().toBuffer({ resolveWithObject: true });
  const width = info.width;
  const height = info.height;
  const channels = info.channels;

  // 使用 RenderCore 处理颜色
  const core = new RenderCore(params);
  core.prepareLUTs();

  // 根据输出格式选择处理方式
  let outputBuffer;

  if (format === 'tiff16') {
    // 16-bit TIFF
    const raw16 = Buffer.allocUnsafe(width * height * 3 * 2);
    let j16 = 0;

    for (let i = 0; i < data.length; i += channels) {
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];

      const [rC, gC, bC] = core.processPixel(r, g, b);

      // 8-bit 扩展到 16-bit
      const r16 = (rC << 8) | rC;
      const g16 = (gC << 8) | gC;
      const b16 = (bC << 8) | bC;

      raw16[j16++] = r16 & 0xFF;
      raw16[j16++] = (r16 >> 8) & 0xFF;
      raw16[j16++] = g16 & 0xFF;
      raw16[j16++] = (g16 >> 8) & 0xFF;
      raw16[j16++] = b16 & 0xFF;
      raw16[j16++] = (b16 >> 8) & 0xFF;
    }

    outputBuffer = await sharp(raw16, { raw: { width, height, channels: 3, depth: 'ushort' } })
      .tiff({ compression: 'lzw', bitdepth: 16 })
      .toBuffer();
  } else {
    // 8-bit JPEG (默认)
    const out = Buffer.allocUnsafe(width * height * 3);

    for (let i = 0, j = 0; i < data.length; i += channels, j += 3) {
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];

      const [rC, gC, bC] = core.processPixel(r, g, b);

      out[j] = rC;
      out[j + 1] = gC;
      out[j + 2] = bC;
    }

    outputBuffer = await sharp(out, { raw: { width, height, channels: 3 } })
      .jpeg({ quality })
      .toBuffer();
  }

  return {
    buffer: outputBuffer,
    width,
    height,
    format
  };
}

/**
 * 渲染并保存到库 (更新 positive_rel_path 和缩略图)
 * @param {number} photoId - 照片 ID
 * @param {Object} params - FilmLab 处理参数
 * @returns {Promise<{positivePath: string, thumbPath: string}>}
 */
async function renderToLibrary(photoId, params) {
  // 获取照片记录
  const photo = await getPhotoRecord(photoId);
  if (!photo) {
    throw new Error(`Photo not found: ${photoId}`);
  }

  // 渲染照片
  const result = await renderPhoto({
    photoId,
    params,
    format: 'jpeg',
    quality: 95
  });

  // 确定输出目录
  const rollDir = path.join(uploadsDir, 'rolls', String(photo.roll_id), 'full');
  if (!fs.existsSync(rollDir)) {
    fs.mkdirSync(rollDir, { recursive: true });
  }

  // 确定文件名
  const ext = '.jpg';
  const base = path.basename(photo.filename || 'image.jpg', path.extname(photo.filename || '.jpg'));
  const newName = base.includes('_pos') ? `${base}${ext}` : `${base}_pos${ext}`;
  const outPath = path.join(rollDir, newName);

  // 保存正片
  fs.writeFileSync(outPath, result.buffer);
  const relOut = path.relative(uploadsDir, outPath).replace(/\\/g, '/');

  // 生成缩略图
  const thumbDir = path.join(uploadsDir, 'rolls', String(photo.roll_id), 'thumb');
  if (!fs.existsSync(thumbDir)) {
    fs.mkdirSync(thumbDir, { recursive: true });
  }
  const thumbName = `${base}_thumb.jpg`;
  const thumbPath = path.join(thumbDir, thumbName);
  
  await sharp(result.buffer)
    .resize({ width: 400, fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: 80 })
    .toFile(thumbPath);
  
  const relThumb = path.relative(uploadsDir, thumbPath).replace(/\\/g, '/');

  // 更新数据库
  await new Promise((resolve, reject) => {
    db.run(
      'UPDATE photos SET positive_rel_path = ?, positive_thumb_rel_path = ?, full_rel_path = ?, filename = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      [relOut, relThumb, relOut, newName, photoId],
      (err) => err ? reject(err) : resolve()
    );
  });

  return {
    positivePath: relOut,
    thumbPath: relThumb
  };
}

/**
 * 渲染并保存到指定目录 (不更新数据库)
 * @param {number} photoId - 照片 ID
 * @param {Object} params - FilmLab 处理参数
 * @param {string} outputDir - 输出目录
 * @param {string} [filename] - 自定义文件名 (可选)
 * @param {Object} [options] - 额外选项
 * @returns {Promise<{outputPath: string}>}
 */
async function renderToDirectory(photoId, params, outputDir, filename = null, options = {}) {
  const {
    format = 'jpeg',
    quality = 95,
    maxWidth = null
  } = options;

  // 获取照片记录
  const photo = await getPhotoRecord(photoId);
  if (!photo) {
    throw new Error(`Photo not found: ${photoId}`);
  }

  // 渲染照片
  const result = await renderPhoto({
    photoId,
    params,
    format,
    quality,
    maxWidth
  });

  // 确保输出目录存在
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  // 确定文件名
  const ext = format === 'tiff16' ? '.tiff' : '.jpg';
  let outName;
  if (filename) {
    outName = filename.endsWith(ext) ? filename : `${filename}${ext}`;
  } else {
    const base = path.basename(photo.filename || 'image.jpg', path.extname(photo.filename || '.jpg'));
    outName = `${base}_exported${ext}`;
  }

  const outPath = path.join(outputDir, outName);

  // 保存文件
  fs.writeFileSync(outPath, result.buffer);

  return {
    outputPath: outPath
  };
}

// ============================================================================
// 预设处理
// ============================================================================

/**
 * 获取预设参数
 * @param {number} presetId - 预设 ID
 * @returns {Promise<Object|null>}
 */
async function getPresetParams(presetId) {
  return new Promise((resolve, reject) => {
    db.get('SELECT * FROM presets WHERE id = ?', [presetId], (err, row) => {
      if (err) reject(err);
      else if (!row) resolve(null);
      else {
        try {
          const params = typeof row.params === 'string' ? JSON.parse(row.params) : row.params;
          resolve(params);
        } catch (e) {
          resolve(null);
        }
      }
    });
  });
}

/**
 * 合并参数 (预设 + 覆盖)
 * @param {Object} baseParams - 基础参数 (预设或默认)
 * @param {Object} overrides - 覆盖参数
 * @returns {Object}
 */
function mergeParams(baseParams = {}, overrides = {}) {
  // 深度合并，overrides 优先
  const result = { ...baseParams };
  
  for (const [key, value] of Object.entries(overrides)) {
    if (value !== undefined && value !== null) {
      if (typeof value === 'object' && !Array.isArray(value)) {
        result[key] = mergeParams(result[key] || {}, value);
      } else {
        result[key] = value;
      }
    }
  }
  
  return result;
}

// ============================================================================
// 模块导出
// ============================================================================

module.exports = {
  // 核心渲染
  renderPhoto,
  renderToLibrary,
  renderToDirectory,
  
  // 辅助函数
  getPhotoRecord,
  getSourcePath,
  getPresetParams,
  mergeParams
};
