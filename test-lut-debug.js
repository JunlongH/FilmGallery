/**
 * LUT 调试脚本
 * 用于验证 packLUT3DForWebGL 和着色器 sampleLUT3D 的对应关系
 * 以及 buildCombinedLUT 的数据传递
 */

// 模拟 getLUT3DIndex
function getLUT3DIndex(r, g, b, size) {
  return r + g * size + b * size * size;
}

// 模拟 packLUT3DForWebGL
function packLUT3DForWebGL(data, size) {
  const w = size;
  const h = size * size;
  const buf = new Uint8Array(w * h * 4);
  
  let ptr = 0;
  for (let b = 0; b < size; b++) {
    for (let g = 0; g < size; g++) {
      for (let r = 0; r < size; r++) {
        const srcIdx = getLUT3DIndex(r, g, b, size) * 3;
        buf[ptr++] = Math.round(data[srcIdx] * 255);
        buf[ptr++] = Math.round(data[srcIdx + 1] * 255);
        buf[ptr++] = Math.round(data[srcIdx + 2] * 3);
        buf[ptr++] = 255;
      }
    }
  }
  return buf;
}

// 模拟 buildCombinedLUT (只有 lut1)
function buildCombinedLUT(lut1, lut2) {
  const a = lut1;
  const b = lut2;
  const base = a || b;
  if (!base || !base.data) return null;
  
  const size = base.size;
  const total = size * size * size;
  const out = new Float32Array(total * 3);
  
  const aData = a ? a.data : null;
  const aInt = a ? (a.intensity ?? 1.0) : 0;
  const bData = b ? b.data : null;
  const bInt = b ? (b.intensity ?? 1.0) : 0;
  
  for (let i = 0, j = 0; i < total; i++, j += 3) {
    const rIdx = i % size;
    const gIdx = Math.floor(i / size) % size;
    const bIdx = Math.floor(i / (size * size));
    const r0 = rIdx / (size - 1);
    const g0 = gIdx / (size - 1);
    const b0 = bIdx / (size - 1);
    
    let r = r0, g = g0, bb = b0;
    
    if (aData && aInt > 0) {
      const ar = aData[j];
      const ag = aData[j + 1];
      const ab = aData[j + 2];
      r = r * (1 - aInt) + ar * aInt;
      g = g * (1 - aInt) + ag * aInt;
      bb = bb * (1 - aInt) + ab * aInt;
    }
    
    if (bData && bInt > 0) {
      const br = bData[j];
      const bg = bData[j + 1];
      const bbb = bData[j + 2];
      r = r * (1 - bInt) + br * bInt;
      g = g * (1 - bInt) + bg * bInt;
      bb = bb * (1 - bInt) + bbb * bInt;
    }
    
    out[j] = r;
    out[j + 1] = g;
    out[j + 2] = bb;
  }
  
  return { size, data: out, intensity: 1.0 };
}

// 模拟着色器 sampleLUT3D 的 UV 计算
function shaderUV(r, g, b, size) {
  // 着色器：uv.y = (g + b * size + 0.5) / (size * size)
  // 着色器：uv.x = (r + 0.5) / size
  const uvX = (r + 0.5) / size;
  const uvY = (g + b * size + 0.5) / (size * size);
  return { uvX, uvY };
}

// 从纹理 UV 反算像素位置
function uvToPixel(uvX, uvY, width, height) {
  // 纹理采样：UV (0,0) 是左下角
  // 像素坐标：(0,0) 是左上角（在 buffer 视角）
  // texImage2D 默认会把 buffer 第一行放到纹理底部（如果 FLIP_Y=false）
  
  // 像素 X = uvX * width
  // 像素 Y (从底部算) = uvY * height
  // 但 buffer 的行是从顶部开始的，所以需要翻转
  
  const pixelX = Math.floor(uvX * width);
  const pixelY = Math.floor(uvY * height);  // 这是从纹理底部算的行号
  
  return { pixelX, pixelY };
}

// 测试用的小尺寸 LUT (size=3)
const size = 3;
const total = size * size * size;

// 创建一个诊断 LUT：每个位置的输出 = 归一化位置 (r,g,b)
const diagLUT = new Float32Array(total * 3);
for (let b = 0; b < size; b++) {
  for (let g = 0; g < size; g++) {
    for (let r = 0; r < size; r++) {
      const idx = getLUT3DIndex(r, g, b, size) * 3;
      diagLUT[idx] = r / (size - 1);     // R = 归一化 r
      diagLUT[idx + 1] = g / (size - 1); // G = 归一化 g
      diagLUT[idx + 2] = b / (size - 1); // B = 归一化 b
    }
  }
}

console.log('=== LUT 诊断测试 ===');
console.log('LUT 尺寸:', size);
console.log('纹理尺寸: width=' + size + ', height=' + (size * size));

// 打包
const buf = packLUT3DForWebGL(diagLUT, size);

console.log('\n=== 打包后的 Buffer 布局 ===');
const width = size;
const height = size * size;
for (let row = 0; row < height; row++) {
  let rowStr = `Row ${row}: `;
  for (let col = 0; col < width; col++) {
    const idx = (row * width + col) * 4;
    const r = buf[idx];
    const g = buf[idx + 1];
    const b = buf[idx + 2];
    rowStr += `(${r},${g},${b}) `;
  }
  console.log(rowStr);
}

console.log('\n=== 着色器采样验证 ===');
// 测试几个关键位置
const testCases = [
  { r: 0, g: 0, b: 0 },
  { r: 1, g: 0, b: 0 },
  { r: 0, g: 1, b: 0 },
  { r: 0, g: 0, b: 1 },
  { r: 2, g: 2, b: 2 },
];

for (const tc of testCases) {
  const { uvX, uvY } = shaderUV(tc.r, tc.g, tc.b, size);
  const { pixelX, pixelY } = uvToPixel(uvX, uvY, width, height);
  
  // 从 buffer 读取（注意：buffer 行 0 对应纹理底部）
  // 如果 FLIP_Y=false，纹理 Y=0（底部）= buffer 行 0
  // 如果 FLIP_Y=true，纹理 Y=0（底部）= buffer 最后一行
  
  const bufferRowFlipFalse = pixelY;  // 纹理 Y=pixelY 对应 buffer 行 pixelY
  const bufferRowFlipTrue = height - 1 - pixelY;  // 纹理 Y=pixelY 对应 buffer 行 (height-1-pixelY)
  
  const idxFlipFalse = (bufferRowFlipFalse * width + pixelX) * 4;
  const idxFlipTrue = (bufferRowFlipTrue * width + pixelX) * 4;
  
  const resultFlipFalse = {
    r: buf[idxFlipFalse],
    g: buf[idxFlipFalse + 1],
    b: buf[idxFlipFalse + 2]
  };
  const resultFlipTrue = {
    r: buf[idxFlipTrue],
    g: buf[idxFlipTrue + 1],
    b: buf[idxFlipTrue + 2]
  };
  
  const expected = {
    r: Math.round(tc.r / (size - 1) * 255),
    g: Math.round(tc.g / (size - 1) * 255),
    b: Math.round(tc.b / (size - 1) * 255)
  };
  
  console.log(`\n输入颜色 (${tc.r},${tc.g},${tc.b})/${size-1}:`);
  console.log(`  UV: (${uvX.toFixed(3)}, ${uvY.toFixed(3)})`);
  console.log(`  期望输出: (${expected.r}, ${expected.g}, ${expected.b})`);
  console.log(`  FLIP_Y=false 读取行 ${bufferRowFlipFalse}: (${resultFlipFalse.r}, ${resultFlipFalse.g}, ${resultFlipFalse.b}) ${JSON.stringify(resultFlipFalse) === JSON.stringify(expected) ? '✓' : '✗'}`);
  console.log(`  FLIP_Y=true  读取行 ${bufferRowFlipTrue}: (${resultFlipTrue.r}, ${resultFlipTrue.g}, ${resultFlipTrue.b}) ${JSON.stringify(resultFlipTrue) === JSON.stringify(expected) ? '✓' : '✗'}`);
}
