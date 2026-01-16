/**
 * EXIF 服务 - EXIF 元数据读写
 * 
 * @module exif-service
 * @description 供下载功能使用的 EXIF 读写服务
 */

const fs = require('fs');
const path = require('path');

// 使用 piexifjs 处理 JPEG EXIF (轻量级，纯 JavaScript)
// 如果需要更完整的支持，可以考虑 exif-parser 或 sharp 的 metadata
let piexif;
try {
  piexif = require('piexifjs');
} catch (e) {
  console.warn('[ExifService] piexifjs not installed, EXIF writing will be limited');
  piexif = null;
}

// ============================================================================
// 常量定义
// ============================================================================

/**
 * 支持的 EXIF 标签映射
 * 数据库字段 -> EXIF 标签
 */
const EXIF_TAG_MAPPING = {
  // 相机信息
  camera_make: 'Make',
  camera_model: 'Model',
  lens: 'LensModel',
  
  // 拍摄参数
  aperture: 'FNumber',
  shutter_speed: 'ExposureTime',
  iso: 'ISOSpeedRatings',
  focal_length: 'FocalLength',
  
  // 时间
  date_taken: 'DateTimeOriginal',
  
  // GPS
  latitude: 'GPSLatitude',
  longitude: 'GPSLongitude',
  altitude: 'GPSAltitude',
  
  // 描述
  caption: 'ImageDescription',
  notes: 'UserComment',
  photographer: 'Artist',
};

/**
 * EXIF 写入选项默认值
 */
const DEFAULT_EXIF_OPTIONS = {
  camera: true,       // 相机/镜头信息
  shooting: true,     // 光圈/快门/ISO/焦距
  datetime: true,     // 日期时间
  gps: true,          // GPS 位置
  description: true,  // 描述/备注
};

// ============================================================================
// 辅助函数
// ============================================================================

/**
 * 解析相机品牌和型号
 * @param {string} cameraString - 相机字符串 (如 "Nikon FM2")
 * @returns {{ make: string, model: string }}
 */
function parseCameraString(cameraString) {
  if (!cameraString) return { make: '', model: '' };
  
  // 常见相机品牌
  const brands = [
    'Nikon', 'Canon', 'Sony', 'Fujifilm', 'Fuji', 'Olympus', 'Pentax',
    'Leica', 'Hasselblad', 'Mamiya', 'Contax', 'Minolta', 'Rollei',
    'Yashica', 'Bronica', 'Phase One', 'Ricoh', 'Sigma', 'Panasonic'
  ];
  
  const str = cameraString.trim();
  
  for (const brand of brands) {
    if (str.toLowerCase().startsWith(brand.toLowerCase())) {
      return {
        make: brand,
        model: str.substring(brand.length).trim() || str
      };
    }
  }
  
  // 无法识别品牌，整体作为型号
  return { make: '', model: str };
}

/**
 * 解析光圈值为 EXIF 格式
 * @param {string|number} aperture - 光圈值 (如 "f/2.8" 或 2.8)
 * @returns {number|null}
 */
function parseAperture(aperture) {
  if (!aperture) return null;
  
  if (typeof aperture === 'number') return aperture;
  
  const str = String(aperture);
  const match = str.match(/f?\/?(\d+\.?\d*)/i);
  if (match) {
    return parseFloat(match[1]);
  }
  
  return null;
}

/**
 * 解析快门速度为 EXIF 格式 (分数)
 * @param {string|number} shutter - 快门速度 (如 "1/125" 或 0.008)
 * @returns {{ numerator: number, denominator: number }|null}
 */
function parseShutterSpeed(shutter) {
  if (!shutter) return null;
  
  if (typeof shutter === 'number') {
    // 秒数转分数
    if (shutter >= 1) {
      return { numerator: Math.round(shutter), denominator: 1 };
    } else {
      const denom = Math.round(1 / shutter);
      return { numerator: 1, denominator: denom };
    }
  }
  
  const str = String(shutter);
  const match = str.match(/(\d+)\/(\d+)/);
  if (match) {
    return { numerator: parseInt(match[1]), denominator: parseInt(match[2]) };
  }
  
  // 尝试解析为秒数
  const seconds = parseFloat(str);
  if (!isNaN(seconds)) {
    if (seconds >= 1) {
      return { numerator: Math.round(seconds), denominator: 1 };
    } else {
      const denom = Math.round(1 / seconds);
      return { numerator: 1, denominator: denom };
    }
  }
  
  return null;
}

/**
 * 解析焦距
 * @param {string|number} focalLength - 焦距 (如 "50mm" 或 50)
 * @returns {number|null}
 */
function parseFocalLength(focalLength) {
  if (!focalLength) return null;
  
  if (typeof focalLength === 'number') return focalLength;
  
  const str = String(focalLength);
  const match = str.match(/(\d+\.?\d*)/);
  if (match) {
    return parseFloat(match[1]);
  }
  
  return null;
}

/**
 * 格式化日期时间为 EXIF 格式
 * @param {string} dateTaken - 日期 (如 "2026-01-15")
 * @param {string} timeTaken - 时间 (如 "14:30:00")
 * @returns {string|null} EXIF 格式 "YYYY:MM:DD HH:MM:SS"
 */
function formatExifDateTime(dateTaken, timeTaken) {
  if (!dateTaken) return null;
  
  // 标准化日期
  const dateMatch = dateTaken.match(/(\d{4})-?(\d{2})-?(\d{2})/);
  if (!dateMatch) return null;
  
  const year = dateMatch[1];
  const month = dateMatch[2];
  const day = dateMatch[3];
  
  // 标准化时间
  let hour = '00', minute = '00', second = '00';
  if (timeTaken) {
    const timeMatch = timeTaken.match(/(\d{2}):?(\d{2}):?(\d{2})?/);
    if (timeMatch) {
      hour = timeMatch[1];
      minute = timeMatch[2];
      second = timeMatch[3] || '00';
    }
  }
  
  return `${year}:${month}:${day} ${hour}:${minute}:${second}`;
}

/**
 * 将十进制度数转换为 EXIF GPS 格式 (度/分/秒)
 * @param {number} decimal - 十进制度数
 * @returns {[[number, number], [number, number], [number, number]]}
 */
function decimalToDMS(decimal) {
  const abs = Math.abs(decimal);
  const degrees = Math.floor(abs);
  const minutesFloat = (abs - degrees) * 60;
  const minutes = Math.floor(minutesFloat);
  const seconds = Math.round((minutesFloat - minutes) * 60 * 100) / 100;
  
  return [
    [degrees, 1],
    [minutes, 1],
    [Math.round(seconds * 100), 100]
  ];
}

// ============================================================================
// 核心功能
// ============================================================================

/**
 * 从数据库记录构建 EXIF 数据
 * @param {Object} photo - 照片记录
 * @param {Object} roll - 卷记录
 * @param {Object} [options] - 选项
 * @returns {Object} EXIF 数据对象
 */
function buildExifData(photo, roll, options = {}) {
  const opts = { ...DEFAULT_EXIF_OPTIONS, ...options };
  const exif = {};
  
  // 相机/镜头信息
  if (opts.camera) {
    // 从 roll 或 photo 获取相机信息
    const cameraStr = photo.camera || roll?.camera;
    if (cameraStr) {
      const { make, model } = parseCameraString(cameraStr);
      if (make) exif.Make = make;
      if (model) exif.Model = model;
    }
    
    // 镜头信息
    if (photo.lens) {
      exif.LensModel = photo.lens;
    }
  }
  
  // 拍摄参数
  if (opts.shooting) {
    // 光圈
    const aperture = parseAperture(photo.aperture);
    if (aperture) {
      exif.FNumber = aperture;
    }
    
    // 快门速度
    const shutter = parseShutterSpeed(photo.shutter_speed);
    if (shutter) {
      exif.ExposureTime = shutter;
    }
    
    // ISO
    if (photo.iso) {
      exif.ISOSpeedRatings = parseInt(photo.iso);
    }
    
    // 焦距
    const focal = parseFocalLength(photo.focal_length);
    if (focal) {
      exif.FocalLength = focal;
    }
  }
  
  // 日期时间
  if (opts.datetime) {
    const datetime = formatExifDateTime(photo.date_taken, photo.time_taken);
    if (datetime) {
      exif.DateTimeOriginal = datetime;
      exif.DateTimeDigitized = datetime;
    }
  }
  
  // GPS
  if (opts.gps) {
    if (photo.latitude && photo.longitude) {
      exif.GPSLatitude = decimalToDMS(photo.latitude);
      exif.GPSLatitudeRef = photo.latitude >= 0 ? 'N' : 'S';
      exif.GPSLongitude = decimalToDMS(photo.longitude);
      exif.GPSLongitudeRef = photo.longitude >= 0 ? 'E' : 'W';
    }
    
    if (photo.altitude) {
      exif.GPSAltitude = [Math.abs(Math.round(photo.altitude * 100)), 100];
      exif.GPSAltitudeRef = photo.altitude >= 0 ? 0 : 1;
    }
  }
  
  // 描述
  if (opts.description) {
    if (photo.caption) {
      exif.ImageDescription = photo.caption;
    }
    
    if (photo.notes) {
      exif.UserComment = photo.notes;
    }
    
    const photographer = photo.photographer || roll?.photographer;
    if (photographer) {
      exif.Artist = photographer;
      exif.Copyright = `© ${new Date().getFullYear()} ${photographer}`;
    }
  }
  
  // 软件标识
  exif.Software = 'FilmGallery';
  
  return exif;
}

/**
 * 写入 EXIF 到 JPEG 图片文件
 * @param {string} filePath - 图片文件路径
 * @param {Object} exifData - EXIF 数据
 * @returns {Promise<void>}
 */
async function writeExif(filePath, exifData) {
  if (!piexif) {
    console.warn('[ExifService] piexifjs not available, skipping EXIF write');
    return;
  }
  
  // 读取原始图片
  const imageData = fs.readFileSync(filePath);
  const base64 = imageData.toString('binary');
  
  // 构建 piexif 格式的 EXIF 对象
  const zeroth = {};
  const exifIfd = {};
  const gpsIfd = {};
  
  // 0th IFD (基本信息)
  if (exifData.Make) zeroth[piexif.ImageIFD.Make] = exifData.Make;
  if (exifData.Model) zeroth[piexif.ImageIFD.Model] = exifData.Model;
  if (exifData.Software) zeroth[piexif.ImageIFD.Software] = exifData.Software;
  if (exifData.Artist) zeroth[piexif.ImageIFD.Artist] = exifData.Artist;
  if (exifData.Copyright) zeroth[piexif.ImageIFD.Copyright] = exifData.Copyright;
  if (exifData.ImageDescription) zeroth[piexif.ImageIFD.ImageDescription] = exifData.ImageDescription;
  
  // Exif IFD (拍摄信息)
  if (exifData.FNumber) {
    exifIfd[piexif.ExifIFD.FNumber] = [Math.round(exifData.FNumber * 10), 10];
  }
  if (exifData.ExposureTime) {
    exifIfd[piexif.ExifIFD.ExposureTime] = [exifData.ExposureTime.numerator, exifData.ExposureTime.denominator];
  }
  if (exifData.ISOSpeedRatings) {
    exifIfd[piexif.ExifIFD.ISOSpeedRatings] = exifData.ISOSpeedRatings;
  }
  if (exifData.FocalLength) {
    exifIfd[piexif.ExifIFD.FocalLength] = [Math.round(exifData.FocalLength * 10), 10];
  }
  if (exifData.DateTimeOriginal) {
    exifIfd[piexif.ExifIFD.DateTimeOriginal] = exifData.DateTimeOriginal;
  }
  if (exifData.DateTimeDigitized) {
    exifIfd[piexif.ExifIFD.DateTimeDigitized] = exifData.DateTimeDigitized;
  }
  if (exifData.LensModel) {
    exifIfd[piexif.ExifIFD.LensModel] = exifData.LensModel;
  }
  if (exifData.UserComment) {
    // UserComment 需要特殊编码
    exifIfd[piexif.ExifIFD.UserComment] = 'ASCII\0\0\0' + exifData.UserComment;
  }
  
  // GPS IFD
  if (exifData.GPSLatitude) {
    gpsIfd[piexif.GPSIFD.GPSLatitude] = exifData.GPSLatitude;
    gpsIfd[piexif.GPSIFD.GPSLatitudeRef] = exifData.GPSLatitudeRef;
  }
  if (exifData.GPSLongitude) {
    gpsIfd[piexif.GPSIFD.GPSLongitude] = exifData.GPSLongitude;
    gpsIfd[piexif.GPSIFD.GPSLongitudeRef] = exifData.GPSLongitudeRef;
  }
  if (exifData.GPSAltitude) {
    gpsIfd[piexif.GPSIFD.GPSAltitude] = exifData.GPSAltitude;
    gpsIfd[piexif.GPSIFD.GPSAltitudeRef] = exifData.GPSAltitudeRef;
  }
  
  // 组合 EXIF 对象
  const exifObj = {
    '0th': zeroth,
    'Exif': exifIfd,
    'GPS': gpsIfd,
    '1st': {},
    'Interop': {},
    'thumbnail': null
  };
  
  // 生成 EXIF 字节
  const exifBytes = piexif.dump(exifObj);
  
  // 插入 EXIF 到图片
  const newImageData = piexif.insert(exifBytes, base64);
  
  // 写入文件
  fs.writeFileSync(filePath, Buffer.from(newImageData, 'binary'));
}

/**
 * 读取图片 EXIF
 * @param {string} filePath - 图片文件路径
 * @returns {Promise<Object>} EXIF 数据
 */
async function readExif(filePath) {
  if (!piexif) {
    console.warn('[ExifService] piexifjs not available, returning empty EXIF');
    return {};
  }
  
  try {
    const imageData = fs.readFileSync(filePath);
    const base64 = imageData.toString('binary');
    const exifObj = piexif.load(base64);
    
    // 转换为简单对象
    const result = {};
    
    // 0th IFD
    for (const [tag, value] of Object.entries(exifObj['0th'] || {})) {
      const tagName = piexif.TAGS['0th'][tag]?.name;
      if (tagName) result[tagName] = value;
    }
    
    // Exif IFD
    for (const [tag, value] of Object.entries(exifObj['Exif'] || {})) {
      const tagName = piexif.TAGS['Exif'][tag]?.name;
      if (tagName) result[tagName] = value;
    }
    
    // GPS IFD
    for (const [tag, value] of Object.entries(exifObj['GPS'] || {})) {
      const tagName = piexif.TAGS['GPS'][tag]?.name;
      if (tagName) result[tagName] = value;
    }
    
    return result;
  } catch (e) {
    console.error('[ExifService] Failed to read EXIF:', e.message);
    return {};
  }
}

// ============================================================================
// 模块导出
// ============================================================================

module.exports = {
  // 常量
  EXIF_TAG_MAPPING,
  DEFAULT_EXIF_OPTIONS,
  
  // 核心功能
  buildExifData,
  writeExif,
  readExif,
  
  // 辅助函数
  parseCameraString,
  parseAperture,
  parseShutterSpeed,
  parseFocalLength,
  formatExifDateTime,
  decimalToDMS,
};
