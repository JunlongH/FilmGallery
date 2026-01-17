/**
 * 完整的 LUT 流程测试
 * 
 * 模拟从 parseCubeLUT 到 WebGL 采样的整个过程
 */

// 模拟 getLUT3DIndex
function getLUT3DIndex(r, g, b, size) {
  return r + g * size + b * size * size;
}

// 模拟 parseCubeLUT - 标准 .cube 格式解析
function parseCubeLUT(text) {
  const lines = text.split('\n');
  let size = 33;
  const data = [];
  
  for (let line of lines) {
    line = line.trim();
    if (!line || line.startsWith('#')) continue;
    
    if (line.startsWith('LUT_3D_SIZE')) {
      size = parseInt(line.split(/\s+/)[1]);
      continue;
    }
    
    const parts = line.split(/\s+/).map(parseFloat);
    if (parts.length >= 3 && !isNaN(parts[0])) {
      data.push(parts[0], parts[1], parts[2]);
    }
  }
  
  return { size, data: new Float32Array(data) };
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
        const vr = Math.max(0, Math.min(1, data[srcIdx]));
        const vg = Math.max(0, Math.min(1, data[srcIdx + 1]));
        const vb = Math.max(0, Math.min(1, data[srcIdx + 2]));
        
        buf[ptr++] = Math.round(vr * 255);
        buf[ptr++] = Math.round(vg * 255);
        buf[ptr++] = Math.round(vb * 255);
        buf[ptr++] = 255;
      }
    }
  }
  
  return buf;
}

// 模拟 WebGL 着色器采样 (简化版，不插值)
function sampleLUT3D_WebGL(buf, size, inputR, inputG, inputB) {
  // 输入是 0-1 范围
  const sz = size;
  const rf = inputR * (sz - 1);
  const gf = inputG * (sz - 1);
  const bf = inputB * (sz - 1);
  
  const r0 = Math.floor(rf);
  const g0 = Math.floor(gf);
  const b0 = Math.floor(bf);
  
  // UV 计算
  const texCol = r0;
  const texRow = g0 + b0 * sz;
  const bufIdx = (texRow * sz + texCol) * 4;
  
  return {
    r: buf[bufIdx] / 255,
    g: buf[bufIdx + 1] / 255,
    b: buf[bufIdx + 2] / 255
  };
}

// 模拟 CPU 采样 (简化版，不插值)
function sampleLUT3D_CPU(data, size, inputR, inputG, inputB) {
  // 输入是 0-255 范围
  const r255 = inputR * 255;
  const g255 = inputG * 255;
  const b255 = inputB * 255;
  
  const maxIndex = size - 1;
  const rPos = (r255 / 255) * maxIndex;
  const gPos = (g255 / 255) * maxIndex;
  const bPos = (b255 / 255) * maxIndex;
  
  const r0 = Math.floor(rPos);
  const g0 = Math.floor(gPos);
  const b0 = Math.floor(bPos);
  
  const idx = (r0 + g0 * size + b0 * size * size) * 3;
  
  return {
    r: data[idx],
    g: data[idx + 1],
    b: data[idx + 2]
  };
}

// 生成一个简单的暖色 LUT
function generateWarmLUT(size) {
  let content = `LUT_3D_SIZE ${size}\n`;
  
  for (let b = 0; b < size; b++) {
    for (let g = 0; g < size; g++) {
      for (let r = 0; r < size; r++) {
        const rNorm = r / (size - 1);
        const gNorm = g / (size - 1);
        const bNorm = b / (size - 1);
        
        // 暖色效果：增加红色，减少蓝色
        const rOut = Math.min(1, rNorm * 1.1);
        const gOut = gNorm;
        const bOut = bNorm * 0.9;
        
        content += `${rOut.toFixed(6)} ${gOut.toFixed(6)} ${bOut.toFixed(6)}\n`;
      }
    }
  }
  
  return content;
}

// 运行测试
console.log('=== LUT 流程测试 ===\n');

const size = 5; // 使用小尺寸便于调试
const lutText = generateWarmLUT(size);

// 1. 解析 LUT
const parsed = parseCubeLUT(lutText);
console.log('1. 解析 LUT:');
console.log('   size:', parsed.size);
console.log('   data length:', parsed.data.length);

// 2. 模拟 lut1 对象
const lut1 = { ...parsed, name: 'test.cube', intensity: 1.0 };
console.log('\n2. lut1 对象:');
console.log('   name:', lut1.name);
console.log('   intensity:', lut1.intensity);

// 3. buildCombinedLUT
const combined = buildCombinedLUT(lut1, null);
console.log('\n3. buildCombinedLUT 输出:');
console.log('   size:', combined.size);
console.log('   intensity:', combined.intensity);

// 验证数据是否相同
let combinedMatch = true;
for (let i = 0; i < parsed.data.length; i++) {
  if (Math.abs(parsed.data[i] - combined.data[i]) > 0.0001) {
    combinedMatch = false;
    console.log(`   不匹配在索引 ${i}: 原始=${parsed.data[i]}, 合并=${combined.data[i]}`);
  }
}
console.log('   数据匹配:', combinedMatch);

// 4. packLUT3DForWebGL
const buf = packLUT3DForWebGL(combined.data, combined.size);
console.log('\n4. packLUT3DForWebGL 输出:');
console.log('   buffer length:', buf.length);

// 5. 测试采样
console.log('\n5. 采样测试:');

const testColors = [
  { r: 0, g: 0, b: 0, name: '黑色' },
  { r: 1, g: 1, b: 1, name: '白色' },
  { r: 1, g: 0, b: 0, name: '红色' },
  { r: 0, g: 1, b: 0, name: '绿色' },
  { r: 0, g: 0, b: 1, name: '蓝色' },
  { r: 0.5, g: 0.5, b: 0.5, name: '灰色' }
];

for (const tc of testColors) {
  const cpu = sampleLUT3D_CPU(combined.data, combined.size, tc.r, tc.g, tc.b);
  const webgl = sampleLUT3D_WebGL(buf, combined.size, tc.r, tc.g, tc.b);
  
  const match = Math.abs(cpu.r - webgl.r) < 0.01 && 
                Math.abs(cpu.g - webgl.g) < 0.01 && 
                Math.abs(cpu.b - webgl.b) < 0.01;
  
  console.log(`   ${tc.name}:`);
  console.log(`     输入: (${tc.r}, ${tc.g}, ${tc.b})`);
  console.log(`     CPU:   (${cpu.r.toFixed(3)}, ${cpu.g.toFixed(3)}, ${cpu.b.toFixed(3)})`);
  console.log(`     WebGL: (${webgl.r.toFixed(3)}, ${webgl.g.toFixed(3)}, ${webgl.b.toFixed(3)})`);
  console.log(`     匹配: ${match ? '✓' : '✗'}`);
}

console.log('\n=== 测试完成 ===');
