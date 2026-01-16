/**
 * 外部正片导入服务
 * 
 * @module import-service
 * @description 支持从外部软件导入处理好的正片并与底片匹配
 */

const path = require('path');
const fs = require('fs');
const { pipeline } = require('stream/promises');
const db = require('../db');
const { uploadsDir } = require('../config/paths');

// ============================================================================
// 常量定义
// ============================================================================

/**
 * 匹配策略
 */
const MATCH_STRATEGY = {
  FILENAME: 'filename',   // 文件名匹配
  FRAME: 'frame',         // 帧号顺序匹配
  MANUAL: 'manual'        // 手动匹配
};

/**
 * 匹配状态
 */
const MATCH_STATUS = {
  MATCHED: 'matched',           // 成功匹配
  CONFLICT: 'conflict',         // 冲突（已有正片）
  UNMATCHED: 'unmatched',       // 未匹配
  NO_NEGATIVE: 'no_negative'    // 无对应底片
};

/**
 * 冲突处理方式
 */
const CONFLICT_RESOLUTION = {
  OVERWRITE: 'overwrite',   // 覆盖
  SKIP: 'skip'              // 跳过
};

/**
 * 支持的图片格式
 */
const SUPPORTED_EXTENSIONS = ['.jpg', '.jpeg', '.tif', '.tiff', '.png'];

// ============================================================================
// 数据库操作（Promise 封装）
// ============================================================================

function dbAll(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows || []);
    });
  });
}

function dbRun(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function(err) {
      if (err) reject(err);
      else resolve({ lastID: this.lastID, changes: this.changes });
    });
  });
}

function dbGet(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  });
}

// ============================================================================
// 辅助函数
// ============================================================================

/**
 * 检查文件是否为支持的图片格式
 * @param {string} filePath - 文件路径
 * @returns {boolean}
 */
function isSupportedImage(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  return SUPPORTED_EXTENSIONS.includes(ext);
}

/**
 * 获取文件基本名（去除扩展名）
 * @param {string} filePath - 文件路径
 * @returns {string}
 */
function getBaseName(filePath) {
  const filename = path.basename(filePath);
  const ext = path.extname(filename);
  return filename.slice(0, -ext.length);
}

/**
 * 标准化文件名用于匹配
 * 去除常见后缀如 _edited, _processed, -final 等
 * @param {string} basename - 基本文件名
 * @returns {string}
 */
function normalizeBasename(basename) {
  return basename
    .toLowerCase()
    .replace(/[-_](edited|processed|final|export|positive|pos|output|done)$/i, '')
    .replace(/\s+/g, '');
}

/**
 * 获取卷的照片列表
 * @param {number} rollId - 卷 ID
 * @returns {Promise<Array>}
 */
async function getPhotosForRoll(rollId) {
  const sql = `
    SELECT 
      id, 
      roll_id,
      frame_number,
      filename,
      negative_rel_path,
      full_rel_path,
      positive_rel_path,
      thumb_rel_path
    FROM photos 
    WHERE roll_id = ? 
    ORDER BY frame_number ASC, id ASC
  `;
  return dbAll(sql, [rollId]);
}

/**
 * 扫描目录获取图片文件
 * @param {string} dirPath - 目录路径
 * @returns {Promise<string[]>}
 */
async function scanDirectory(dirPath) {
  const files = [];
  
  try {
    const entries = await fs.promises.readdir(dirPath, { withFileTypes: true });
    
    for (const entry of entries) {
      if (entry.isFile() && isSupportedImage(entry.name)) {
        files.push(path.join(dirPath, entry.name));
      }
    }
  } catch (e) {
    console.error('[ImportService] Failed to scan directory:', e.message);
  }
  
  // 按文件名排序
  files.sort((a, b) => path.basename(a).localeCompare(path.basename(b)));
  
  return files;
}

// ============================================================================
// 匹配策略实现
// ============================================================================

/**
 * 文件名匹配策略
 * @param {string[]} filePaths - 导入文件路径列表
 * @param {Array} photos - 照片记录列表
 * @returns {Array<{file, photo, status}>}
 */
function matchByFilename(filePaths, photos) {
  const results = [];
  const photoMap = new Map();
  
  // 构建照片文件名映射（使用标准化名称）
  for (const photo of photos) {
    const negPath = photo.negative_rel_path || photo.full_rel_path;
    if (negPath) {
      const basename = normalizeBasename(getBaseName(negPath));
      photoMap.set(basename, photo);
    }
  }
  
  // 匹配导入文件
  for (const filePath of filePaths) {
    const basename = normalizeBasename(getBaseName(filePath));
    const matchedPhoto = photoMap.get(basename);
    
    if (matchedPhoto) {
      const status = matchedPhoto.positive_rel_path 
        ? MATCH_STATUS.CONFLICT 
        : MATCH_STATUS.MATCHED;
      
      results.push({
        file: filePath,
        filename: path.basename(filePath),
        photo: matchedPhoto,
        photoId: matchedPhoto.id,
        frameNumber: matchedPhoto.frame_number,
        status
      });
      
      // 从映射中移除已匹配的，防止重复匹配
      photoMap.delete(basename);
    } else {
      results.push({
        file: filePath,
        filename: path.basename(filePath),
        photo: null,
        photoId: null,
        frameNumber: null,
        status: MATCH_STATUS.NO_NEGATIVE
      });
    }
  }
  
  return results;
}

/**
 * 帧号顺序匹配策略
 * @param {string[]} filePaths - 导入文件路径列表
 * @param {Array} photos - 照片记录列表
 * @returns {Array<{file, photo, status}>}
 */
function matchByFrame(filePaths, photos) {
  const results = [];
  
  // 按帧号排序的照片
  const sortedPhotos = [...photos].sort((a, b) => {
    const frameA = a.frame_number || 0;
    const frameB = b.frame_number || 0;
    return frameA - frameB || a.id - b.id;
  });
  
  // 按顺序对应
  for (let i = 0; i < filePaths.length; i++) {
    const filePath = filePaths[i];
    const photo = sortedPhotos[i] || null;
    
    if (photo) {
      const status = photo.positive_rel_path 
        ? MATCH_STATUS.CONFLICT 
        : MATCH_STATUS.MATCHED;
      
      results.push({
        file: filePath,
        filename: path.basename(filePath),
        photo,
        photoId: photo.id,
        frameNumber: photo.frame_number,
        status
      });
    } else {
      results.push({
        file: filePath,
        filename: path.basename(filePath),
        photo: null,
        photoId: null,
        frameNumber: null,
        status: MATCH_STATUS.NO_NEGATIVE
      });
    }
  }
  
  return results;
}

/**
 * 手动匹配（初始化，全部标记为未匹配）
 * @param {string[]} filePaths - 导入文件路径列表
 * @param {Array} photos - 照片记录列表
 * @returns {Array<{file, photo, status}>}
 */
function matchManual(filePaths, photos) {
  return filePaths.map(filePath => ({
    file: filePath,
    filename: path.basename(filePath),
    photo: null,
    photoId: null,
    frameNumber: null,
    status: MATCH_STATUS.UNMATCHED
  }));
}

/**
 * 执行匹配
 * @param {string[]} filePaths - 导入文件路径列表
 * @param {Array} photos - 照片记录列表
 * @param {string} strategy - 匹配策略
 * @returns {Array}
 */
function performMatch(filePaths, photos, strategy) {
  switch (strategy) {
    case MATCH_STRATEGY.FILENAME:
      return matchByFilename(filePaths, photos);
    case MATCH_STRATEGY.FRAME:
      return matchByFrame(filePaths, photos);
    case MATCH_STRATEGY.MANUAL:
      return matchManual(filePaths, photos);
    default:
      return matchByFilename(filePaths, photos);
  }
}

// ============================================================================
// 核心功能
// ============================================================================

/**
 * 预览导入匹配结果
 * @param {number} rollId - 卷 ID
 * @param {string[]} filePaths - 导入文件路径列表（文件或目录）
 * @param {string} strategy - 匹配策略
 * @returns {Promise<Object>}
 */
async function previewImport(rollId, filePaths, strategy = MATCH_STRATEGY.FILENAME) {
  // 获取卷的照片
  const photos = await getPhotosForRoll(rollId);
  
  if (photos.length === 0) {
    return {
      success: false,
      error: 'Roll has no photos',
      matches: [],
      stats: { total: 0, matched: 0, conflict: 0, unmatched: 0 }
    };
  }
  
  // 展开目录为文件列表
  let allFiles = [];
  for (const filePath of filePaths) {
    try {
      const stat = await fs.promises.stat(filePath);
      if (stat.isDirectory()) {
        const dirFiles = await scanDirectory(filePath);
        allFiles.push(...dirFiles);
      } else if (stat.isFile() && isSupportedImage(filePath)) {
        allFiles.push(filePath);
      }
    } catch (e) {
      console.error('[ImportService] Invalid path:', filePath, e.message);
    }
  }
  
  if (allFiles.length === 0) {
    return {
      success: false,
      error: 'No valid image files found',
      matches: [],
      stats: { total: 0, matched: 0, conflict: 0, unmatched: 0 }
    };
  }
  
  // 执行匹配
  const matches = performMatch(allFiles, photos, strategy);
  
  // 统计
  const stats = {
    total: matches.length,
    matched: matches.filter(m => m.status === MATCH_STATUS.MATCHED).length,
    conflict: matches.filter(m => m.status === MATCH_STATUS.CONFLICT).length,
    unmatched: matches.filter(m => 
      m.status === MATCH_STATUS.UNMATCHED || 
      m.status === MATCH_STATUS.NO_NEGATIVE
    ).length
  };
  
  return {
    success: true,
    rollId,
    strategy,
    matches,
    stats,
    // 返回未匹配的底片（用于手动匹配）
    unmatchedPhotos: photos.filter(p => 
      !matches.some(m => m.photoId === p.id)
    ).map(p => ({
      id: p.id,
      frameNumber: p.frame_number,
      filename: p.negative_rel_path ? path.basename(p.negative_rel_path) : 
                p.full_rel_path ? path.basename(p.full_rel_path) : null,
      hasPositive: !!p.positive_rel_path
    }))
  };
}

/**
 * 更新手动匹配
 * @param {Array} matches - 当前匹配结果
 * @param {number} fileIndex - 文件索引
 * @param {number|null} photoId - 照片 ID（null 表示取消匹配）
 * @param {Array} photos - 所有照片
 * @returns {Array}
 */
function updateManualMatch(matches, fileIndex, photoId, photos) {
  const result = [...matches];
  
  if (fileIndex < 0 || fileIndex >= result.length) {
    return result;
  }
  
  // 清除之前匹配到同一 photoId 的项
  if (photoId !== null) {
    for (let i = 0; i < result.length; i++) {
      if (result[i].photoId === photoId) {
        result[i] = {
          ...result[i],
          photo: null,
          photoId: null,
          frameNumber: null,
          status: MATCH_STATUS.UNMATCHED
        };
      }
    }
  }
  
  // 设置新匹配
  if (photoId === null) {
    result[fileIndex] = {
      ...result[fileIndex],
      photo: null,
      photoId: null,
      frameNumber: null,
      status: MATCH_STATUS.UNMATCHED
    };
  } else {
    const photo = photos.find(p => p.id === photoId);
    if (photo) {
      result[fileIndex] = {
        ...result[fileIndex],
        photo,
        photoId: photo.id,
        frameNumber: photo.frame_number,
        status: photo.positive_rel_path ? MATCH_STATUS.CONFLICT : MATCH_STATUS.MATCHED
      };
    }
  }
  
  return result;
}

/**
 * 执行导入
 * @param {number} rollId - 卷 ID
 * @param {Array} matches - 匹配结果
 * @param {Object} options - 选项
 * @param {string} options.conflictResolution - 冲突处理方式
 * @param {Function} options.onProgress - 进度回调
 * @returns {Promise<Object>}
 */
async function executeImport(rollId, matches, options = {}) {
  const {
    conflictResolution = CONFLICT_RESOLUTION.OVERWRITE,
    onProgress
  } = options;
  
  const results = {
    success: 0,
    skipped: 0,
    failed: 0,
    files: [],
    errors: []
  };
  
  // 获取卷信息
  const roll = await dbGet('SELECT id, title FROM rolls WHERE id = ?', [rollId]);
  if (!roll) {
    return { success: false, error: 'Roll not found', ...results };
  }
  
  // 计算目标目录
  const rollDir = path.join(uploadsDir, `roll_${rollId}`);
  const positiveDir = path.join(rollDir, 'positive');
  
  // 确保目录存在
  await fs.promises.mkdir(positiveDir, { recursive: true });
  
  // 过滤可导入的匹配项
  const importable = matches.filter(m => {
    if (!m.photoId) return false;
    if (m.status === MATCH_STATUS.CONFLICT) {
      return conflictResolution === CONFLICT_RESOLUTION.OVERWRITE;
    }
    return m.status === MATCH_STATUS.MATCHED;
  });
  
  // 执行导入
  for (let i = 0; i < importable.length; i++) {
    const match = importable[i];
    
    try {
      // 源文件
      const srcPath = match.file;
      const ext = path.extname(srcPath);
      const destFilename = `photo_${match.photoId}_positive${ext}`;
      const destPath = path.join(positiveDir, destFilename);
      const relPath = path.relative(uploadsDir, destPath).replace(/\\/g, '/');
      
      // 如果覆盖，先删除旧文件
      if (match.status === MATCH_STATUS.CONFLICT && match.photo?.positive_rel_path) {
        const oldPath = path.join(uploadsDir, match.photo.positive_rel_path);
        try {
          await fs.promises.unlink(oldPath);
        } catch (e) {
          // 忽略删除错误
        }
      }
      
      // 流式复制文件
      await pipeline(
        fs.createReadStream(srcPath),
        fs.createWriteStream(destPath)
      );
      
      // 更新数据库
      await dbRun(
        `UPDATE photos SET 
          positive_rel_path = ?, 
          positive_source = 'external',
          updated_at = CURRENT_TIMESTAMP
        WHERE id = ?`,
        [relPath, match.photoId]
      );
      
      // 生成缩略图（如果需要）
      // TODO: 调用缩略图生成服务
      
      results.success++;
      results.files.push({
        photoId: match.photoId,
        sourceFile: srcPath,
        destPath: relPath
      });
      
      if (onProgress) {
        onProgress(i + 1, importable.length, match);
      }
    } catch (e) {
      console.error('[ImportService] Failed to import file:', match.file, e.message);
      results.failed++;
      results.errors.push({
        file: match.file,
        photoId: match.photoId,
        error: e.message
      });
    }
  }
  
  // 统计跳过的
  results.skipped = matches.filter(m => 
    m.status === MATCH_STATUS.CONFLICT && 
    conflictResolution === CONFLICT_RESOLUTION.SKIP
  ).length;
  
  return {
    success: true,
    rollId,
    ...results
  };
}

// ============================================================================
// 模块导出
// ============================================================================

module.exports = {
  // 常量
  MATCH_STRATEGY,
  MATCH_STATUS,
  CONFLICT_RESOLUTION,
  SUPPORTED_EXTENSIONS,
  
  // 核心功能
  previewImport,
  executeImport,
  updateManualMatch,
  
  // 辅助函数
  getPhotosForRoll,
  scanDirectory,
  isSupportedImage,
  getBaseName,
  normalizeBasename
};
