/**
 * LUT 调试脚本 v2
 * 验证 buildCombinedLUT 是否正确传递原始 LUT 数据
 */

// 模拟 getLUT3DIndex
function getLUT3DIndex(r, g, b, size) {
  return r + g * size + b * size * size;
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

// 测试
const size = 3;
const total = size * size * size;

// 创建一个测试 LUT：将 R 通道放大 2 倍（模拟暖色 LUT）
const testLUT = new Float32Array(total * 3);
for (let b = 0; b < size; b++) {
  for (let g = 0; g < size; g++) {
    for (let r = 0; r < size; r++) {
      const idx = getLUT3DIndex(r, g, b, size) * 3;
      const rNorm = r / (size - 1);
      const gNorm = g / (size - 1);
      const bNorm = b / (size - 1);
      // 暖色 LUT：增加 R，减少 B
      testLUT[idx] = Math.min(1, rNorm * 1.2);     // R 增加
      testLUT[idx + 1] = gNorm;                    // G 不变
      testLUT[idx + 2] = bNorm * 0.8;              // B 减少
    }
  }
}

const lut1 = { size, data: testLUT, intensity: 1.0 };

console.log('=== buildCombinedLUT 验证 ===');
console.log('原始 LUT 数据 (前 9 个条目):');
for (let i = 0; i < 9; i++) {
  const j = i * 3;
  console.log(`  条目 ${i}: (${testLUT[j].toFixed(3)}, ${testLUT[j+1].toFixed(3)}, ${testLUT[j+2].toFixed(3)})`);
}

const combined = buildCombinedLUT(lut1, null);

console.log('\nbuildCombinedLUT 输出 (前 9 个条目):');
for (let i = 0; i < 9; i++) {
  const j = i * 3;
  const match = (
    Math.abs(combined.data[j] - testLUT[j]) < 0.001 &&
    Math.abs(combined.data[j+1] - testLUT[j+1]) < 0.001 &&
    Math.abs(combined.data[j+2] - testLUT[j+2]) < 0.001
  );
  console.log(`  条目 ${i}: (${combined.data[j].toFixed(3)}, ${combined.data[j+1].toFixed(3)}, ${combined.data[j+2].toFixed(3)}) ${match ? '✓' : '✗ 不匹配!'}`);
}

// 验证索引对应关系
console.log('\n=== 索引验证 ===');
console.log('i → (r, g, b) → j → getLUT3DIndex(r,g,b)*3');
for (let i = 0; i < 9; i++) {
  const rIdx = i % size;
  const gIdx = Math.floor(i / size) % size;
  const bIdx = Math.floor(i / (size * size));
  const j = i * 3;
  const expectedJ = getLUT3DIndex(rIdx, gIdx, bIdx, size) * 3;
  console.log(`  i=${i} → (${rIdx},${gIdx},${bIdx}) → j=${j} → expected=${expectedJ} ${j === expectedJ ? '✓' : '✗'}`);
}
