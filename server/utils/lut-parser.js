/**
 * LUT 解析器
 * 
 * @module utils/lut-parser
 * @description 解析各种 3D LUT 格式 (.cube, .3dl 等)
 */

const fs = require('fs').promises;
const path = require('path');

// ============================================================================
// .CUBE 格式解析
// ============================================================================

/**
 * 解析 .cube 格式的 LUT 文件
 * 
 * Adobe/Iridas CUBE LUT 格式标准:
 * - 以 TITLE, LUT_3D_SIZE 等关键字开头
 * - 数据为 RGB 浮点数 (0.0-1.0)
 * 
 * @param {string} content - 文件内容
 * @returns {{ size: number, data: Float32Array }}
 */
function parseCube(content) {
  const lines = content.split('\n');
  let size = 0;
  const values = [];
  
  for (const line of lines) {
    const trimmed = line.trim();
    
    // 跳过空行和注释
    if (!trimmed || trimmed.startsWith('#')) continue;
    
    // 解析 LUT 大小
    if (trimmed.startsWith('LUT_3D_SIZE')) {
      size = parseInt(trimmed.split(/\s+/)[1], 10);
      continue;
    }
    
    // 跳过其他关键字
    if (trimmed.match(/^[A-Z_]+/)) continue;
    
    // 解析 RGB 数据
    const parts = trimmed.split(/\s+/).map(Number);
    if (parts.length >= 3 && !isNaN(parts[0])) {
      values.push(parts[0], parts[1], parts[2]);
    }
  }
  
  if (size === 0) {
    // 尝试推断大小
    const totalEntries = values.length / 3;
    size = Math.round(Math.cbrt(totalEntries));
    if (size * size * size !== totalEntries) {
      throw new Error('无法确定 LUT 大小');
    }
  }
  
  // 验证数据量
  const expected = size * size * size * 3;
  if (values.length !== expected) {
    throw new Error(`LUT 数据量错误: 期望 ${expected}, 实际 ${values.length}`);
  }
  
  return {
    size,
    data: new Float32Array(values)
  };
}

// ============================================================================
// .3DL 格式解析
// ============================================================================

/**
 * 解析 .3dl 格式的 LUT 文件
 * 
 * Autodesk 3DL 格式:
 * - 第一行为 Mesh 网格大小
 * - 数据为 RGB 整数值 (0-4095 或 0-1023)
 * 
 * @param {string} content - 文件内容
 * @returns {{ size: number, data: Float32Array }}
 */
function parse3dl(content) {
  const lines = content.split('\n');
  let size = 0;
  let maxValue = 1023; // 默认 10-bit
  const values = [];
  
  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    
    // 跳过空行和注释
    if (!trimmed || trimmed.startsWith('#')) continue;
    
    // 第一行通常是 Mesh 定义
    if (i === 0 && trimmed.match(/^\d+\s+\d+$/)) {
      const parts = trimmed.split(/\s+/);
      // 格式: "0 1023" 或 "0 4095"
      maxValue = parseInt(parts[1], 10);
      continue;
    }
    
    // 解析 RGB 数据
    const parts = trimmed.split(/\s+/).map(Number);
    if (parts.length >= 3 && !isNaN(parts[0])) {
      // 归一化到 0-1
      values.push(
        parts[0] / maxValue,
        parts[1] / maxValue,
        parts[2] / maxValue
      );
    }
  }
  
  // 推断大小
  const totalEntries = values.length / 3;
  size = Math.round(Math.cbrt(totalEntries));
  if (size * size * size !== totalEntries) {
    throw new Error('无法确定 LUT 大小');
  }
  
  return {
    size,
    data: new Float32Array(values)
  };
}

// ============================================================================
// 主解析函数
// ============================================================================

/**
 * 解析 LUT 文件
 * 
 * @param {string} filepath - 文件路径
 * @returns {Promise<{ size: number, data: Float32Array }>}
 */
async function parseLUT(filepath) {
  const content = await fs.readFile(filepath, 'utf-8');
  const ext = path.extname(filepath).toLowerCase();
  
  switch (ext) {
    case '.cube':
      return parseCube(content);
    case '.3dl':
      return parse3dl(content);
    case '.csp':
    case '.lut':
      // 尝试 CUBE 格式，因为很多 .lut 文件实际是 CUBE 格式
      try {
        return parseCube(content);
      } catch (e) {
        return parse3dl(content);
      }
    default:
      throw new Error(`不支持的 LUT 格式: ${ext}`);
  }
}

/**
 * 同步解析 LUT 内容
 * 
 * @param {string} content - 文件内容
 * @param {string} format - 格式 ('cube' | '3dl')
 * @returns {{ size: number, data: Float32Array }}
 */
function parseLUTSync(content, format = 'cube') {
  switch (format) {
    case 'cube':
      return parseCube(content);
    case '3dl':
      return parse3dl(content);
    default:
      // 尝试 CUBE
      try {
        return parseCube(content);
      } catch (e) {
        return parse3dl(content);
      }
  }
}

module.exports = {
  parseLUT,
  parseLUTSync,
  parseCube,
  parse3dl
};
