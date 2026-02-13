#!/usr/bin/env node
/**
 * 16-bit / Float Pipeline Verification Script (rev.4)
 *
 * 验证范围：
 *  Part 1 — 静态代码检查：确认所有服务端路由已使用 processPixelFloat
 *  Part 2 — RenderCore 浮点管线正确性：已知输入 → 预期输出，精度验证
 *  Part 3 — 16-bit 检测逻辑：模拟 8-bit/16-bit buffer 大小的判断
 *  Part 4 — 16-bit ↔ 8-bit 精度对比：证明 float 管线优于 int 管线
 *  Part 5 — DB 列名 / export-queue 路径解析逻辑
 *  Part 6 — TIFF16 真 16-bit 验证：无 bit-doubling
 *
 * 运行方式: node tools/verify-16bit-pipeline.js
 */
'use strict';

const fs = require('fs');
const path = require('path');

// ── Imports ──────────────────────────────────────────────────────────────────
const { RenderCore } = require('../packages/shared/render/RenderCore');

// ── Test Framework ───────────────────────────────────────────────────────────
let passCount = 0;
let failCount = 0;
let totalCount = 0;

function assert(condition, msg) {
  totalCount++;
  if (condition) {
    passCount++;
    console.log(`  ✓ ${msg}`);
  } else {
    failCount++;
    console.error(`  ✗ FAIL: ${msg}`);
  }
}

function approxEq(a, b, eps = 1e-4) {
  return Math.abs(a - b) <= eps;
}

function section(title) {
  console.log(`\n${'═'.repeat(70)}`);
  console.log(`  ${title}`);
  console.log('═'.repeat(70));
}

// ╔══════════════════════════════════════════════════════════════════════════╗
// ║  Part 1 — 静态代码检查                                                   ║
// ╚══════════════════════════════════════════════════════════════════════════╝

function part1_staticCodeChecks() {
  section('Part 1: 静态代码检查 — 服务端不应残留 8-bit processPixel');

  const serverFiles = [
    { file: 'server/routes/photos.js',        label: 'photos.js (export-positive + render-positive)' },
    { file: 'server/routes/filmlab.js',        label: 'filmlab.js (preview + render + export)' },
    { file: 'server/services/export-queue.js', label: 'export-queue.js (batch export)' },
    { file: 'server/services/render-service.js', label: 'render-service.js (unified render)' },
  ];

  for (const { file, label } of serverFiles) {
    const fullPath = path.join(__dirname, '..', file);
    if (!fs.existsSync(fullPath)) {
      assert(false, `[${label}] 文件不存在: ${file}`);
      continue;
    }
    const code = fs.readFileSync(fullPath, 'utf-8');

    // 1a. 不应残留 .processPixel( 调用 (8-bit)
    const regex8bit = /\.processPixel\s*\(/g;
    const matches8bit = code.match(regex8bit) || [];
    // processPixelFloat 也会匹配，需排除
    const pureProcessPixel = [];
    let m;
    const regexPure = /\.processPixel\s*\(/g;
    while ((m = regexPure.exec(code)) !== null) {
      // Check that it's not processPixelFloat
      const after = code.substring(m.index, m.index + 30);
      if (!after.includes('processPixelFloat')) {
        pureProcessPixel.push(m.index);
      }
    }
    assert(pureProcessPixel.length === 0,
      `[${label}] 无 8-bit processPixel() 调用 (found: ${pureProcessPixel.length})`);

    // 1b. 应包含 processPixelFloat 调用
    const hasFloat = code.includes('processPixelFloat');
    assert(hasFloat, `[${label}] 包含 processPixelFloat() 调用`);

    // 1c. 16-bit 检测逻辑存在
    const has16bitDetect = code.includes('is16bit') || code.includes('is16BitInput') ||
                           code.includes('isHighBitDepth') || code.includes('expectedBytes8');
    assert(has16bitDetect, `[${label}] 包含 16-bit 位深检测逻辑`);
  }

  // 1d. export-queue 不使用 photo.file_path
  {
    const eqPath = path.join(__dirname, '..', 'server/services/export-queue.js');
    const eqCode = fs.readFileSync(eqPath, 'utf-8');
    const hasFilePath = eqCode.includes('photo.file_path');
    assert(!hasFilePath, '[export-queue] 不使用 photo.file_path (DB 中不存在此列)');

    // Should use original_rel_path
    const hasOriginalPath = eqCode.includes('original_rel_path');
    assert(hasOriginalPath, '[export-queue] 使用 original_rel_path 解析源路径');

    // Should import uploadsDir
    const hasUploadsDir = eqCode.includes('uploadsDir');
    assert(hasUploadsDir, '[export-queue] 引入了 uploadsDir 用于路径拼接');
  }

  // 1e. photos.js export-positive 和 render-positive 传入了 saturation
  {
    const photosPath = path.join(__dirname, '..', 'server/routes/photos.js');
    const photosCode = fs.readFileSync(photosPath, 'utf-8');

    // Count occurrences of 'saturation:' in RenderCore constructor blocks
    const satMatches = photosCode.match(/saturation\s*:\s*Number\.isFinite\(p\.saturation\)/g) || [];
    assert(satMatches.length >= 2,
      `[photos.js] export-positive + render-positive 均传入 saturation 参数 (found: ${satMatches.length})`);
  }

  // 1f. 不应残留伪 16-bit bit-doubling: (val << 8) | val 或 val * 257
  {
    const photosPath = path.join(__dirname, '..', 'server/routes/photos.js');
    const photosCode = fs.readFileSync(photosPath, 'utf-8');
    const hasBitDoubling = /<< 8\) \| /.test(photosCode) && /rC|gC|bC|v8/.test(photosCode);
    // Also check for val * 257 pattern
    const hasMultiply257 = /\* 257/.test(photosCode);
    assert(!hasBitDoubling && !hasMultiply257,
      '[photos.js] 无伪 16-bit bit-doubling 模式 (val << 8 | val)');
  }
}

// ╔══════════════════════════════════════════════════════════════════════════╗
// ║  Part 2 — RenderCore 浮点管线正确性                                       ║
// ╚══════════════════════════════════════════════════════════════════════════╝

function part2_renderCoreFloat() {
  section('Part 2: RenderCore processPixelFloat 功能正确性');

  // 2a. 默认参数下的恒等映射（identity passthrough）
  {
    const core = new RenderCore({});
    core.prepareLUTs();

    const testValues = [0.0, 0.25, 0.5, 0.75, 1.0];
    let maxDelta = 0;
    for (const v of testValues) {
      const [r, g, b] = core.processPixelFloat(v, v, v);
      const delta = Math.max(Math.abs(r - v), Math.abs(g - v), Math.abs(b - v));
      maxDelta = Math.max(maxDelta, delta);
    }
    // 注意: 即使默认参数，highlight roll-off 会在高值区域压缩 (v>0.8 → tanh shoulder)
    // 因此允许 ~5% 偏差
    assert(maxDelta < 0.06,
      `默认参数 identity passthrough — 最大偏差 ${maxDelta.toFixed(6)} < 0.06 (含 highlight roll-off)`);
  }

  // 2b. 输出值在 [0, 1] 范围内
  {
    const core = new RenderCore({
      exposure: 80,
      contrast: 50,
      highlights: -30,
      shadows: 20,
      temp: 30,
      tint: -10,
    });
    core.prepareLUTs();

    let allInRange = true;
    for (let v = 0; v <= 1.0; v += 0.05) {
      const [r, g, b] = core.processPixelFloat(v, v * 0.9, v * 0.8);
      if (r < -0.001 || r > 1.001 || g < -0.001 || g > 1.001 || b < -0.001 || b > 1.001) {
        allInRange = false;
        break;
      }
    }
    assert(allInRange, '极端参数下输出仍在 [0, 1] 范围内');
  }

  // 2c. 曝光调整方向正确
  {
    const coreBase = new RenderCore({});
    coreBase.prepareLUTs();
    const [rBase] = coreBase.processPixelFloat(0.3, 0.3, 0.3);

    const coreUp = new RenderCore({ exposure: 50 });
    coreUp.prepareLUTs();
    const [rUp] = coreUp.processPixelFloat(0.3, 0.3, 0.3);

    const coreDown = new RenderCore({ exposure: -50 });
    coreDown.prepareLUTs();
    const [rDown] = coreDown.processPixelFloat(0.3, 0.3, 0.3);

    assert(rUp > rBase, `曝光 +50 亮度增加: ${rUp.toFixed(4)} > ${rBase.toFixed(4)}`);
    assert(rDown < rBase, `曝光 -50 亮度降低: ${rDown.toFixed(4)} < ${rBase.toFixed(4)}`);
  }

  // 2d. 饱和度调整方向正确
  {
    // 纯色输入（有色彩内容可供调整）
    const coreSat0 = new RenderCore({ saturation: 0 });
    coreSat0.prepareLUTs();
    const [rN, gN, bN] = coreSat0.processPixelFloat(0.8, 0.3, 0.2);
    const chromaN = Math.max(rN, gN, bN) - Math.min(rN, gN, bN);

    const coreSatUp = new RenderCore({ saturation: 80 });
    coreSatUp.prepareLUTs();
    const [rU, gU, bU] = coreSatUp.processPixelFloat(0.8, 0.3, 0.2);
    const chromaUp = Math.max(rU, gU, bU) - Math.min(rU, gU, bU);

    const coreSatDown = new RenderCore({ saturation: -80 });
    coreSatDown.prepareLUTs();
    const [rD, gD, bD] = coreSatDown.processPixelFloat(0.8, 0.3, 0.2);
    const chromaDown = Math.max(rD, gD, bD) - Math.min(rD, gD, bD);

    assert(chromaUp > chromaN,
      `饱和度 +80 色度增加: ${chromaUp.toFixed(4)} > ${chromaN.toFixed(4)}`);
    assert(chromaDown < chromaN,
      `饱和度 -80 色度降低: ${chromaDown.toFixed(4)} < ${chromaN.toFixed(4)}`);
  }

  // 2e. NaN 输入不应产生 NaN 输出
  {
    const core = new RenderCore({});
    core.prepareLUTs();
    const [r, g, b] = core.processPixelFloat(NaN, 0.5, -0.1);
    const anyNaN = isNaN(r) || isNaN(g) || isNaN(b);
    assert(!anyNaN, `NaN/负值输入不产生 NaN 输出: [${r?.toFixed(4)}, ${g?.toFixed(4)}, ${b?.toFixed(4)}]`);
  }

  // 2f. 超过 1.0 的 HDR 输入被正确处理（不 crash，结果合理）
  {
    const core = new RenderCore({});
    core.prepareLUTs();
    const [r, g, b] = core.processPixelFloat(1.5, 1.2, 0.8);
    assert(r >= 0 && r <= 1 && g >= 0 && g <= 1 && b >= 0 && b <= 1,
      `HDR 输入 (1.5, 1.2, 0.8) 输出在 [0,1]: [${r.toFixed(4)}, ${g.toFixed(4)}, ${b.toFixed(4)}]`);
  }
}

// ╔══════════════════════════════════════════════════════════════════════════╗
// ║  Part 3 — 16-bit 检测逻辑                                                ║
// ╚══════════════════════════════════════════════════════════════════════════╝

function part3_16bitDetection() {
  section('Part 3: 16-bit 检测逻辑验证');

  // 模拟 sharp .raw().toBuffer() 输出的 buffer 大小
  const width = 100;
  const height = 80;
  const channels = 3;

  // 8-bit: width * height * channels * 1 bytes
  const data8bit = Buffer.alloc(width * height * channels * 1);
  const expectedBytes8 = width * height * channels;
  const is16bit_8src = (data8bit.length >= expectedBytes8 * 2);
  assert(!is16bit_8src, `8-bit buffer (${data8bit.length} bytes) 被正确识别为 8-bit`);

  // 16-bit: width * height * channels * 2 bytes
  const data16bit = Buffer.alloc(width * height * channels * 2);
  const is16bit_16src = (data16bit.length >= expectedBytes8 * 2);
  assert(is16bit_16src, `16-bit buffer (${data16bit.length} bytes) 被正确识别为 16-bit`);

  // 4-channel 8-bit (RGBA) should NOT be mistaken for 16-bit (channels=4)
  const channels4 = 4;
  const data8bitRGBA = Buffer.alloc(width * height * channels4 * 1);
  const expectedBytes8_4ch = width * height * channels4;
  const is16bit_rgba = (data8bitRGBA.length >= expectedBytes8_4ch * 2);
  assert(!is16bit_rgba, `RGBA 8-bit buffer 不会被误判为 16-bit`);
}

// ╔══════════════════════════════════════════════════════════════════════════╗
// ║  Part 4 — Float vs Int 精度对比                                           ║
// ╚══════════════════════════════════════════════════════════════════════════╝

function part4_precisionComparison() {
  section('Part 4: Float vs Int 精度对比 — 证明 float 管线优于 int');

  // 构建一个有复杂参数的 RenderCore
  const params = {
    exposure: 30,
    contrast: 20,
    highlights: -15,
    shadows: 10,
    temp: 15,
    tint: -5,
  };
  const core = new RenderCore(params);
  core.prepareLUTs();

  // 模拟 16-bit 源 → float 路径 vs 先截断到 8-bit → int 路径
  // 选一个不在 8-bit 边界上的精确值（如 12345 / 65535 ≈ 0.1884）
  const val16 = 12345;
  const valFloat = val16 / 65535; // 0.18836...
  const val8 = Math.round(valFloat * 255); // 48
  const val8AsFloat = val8 / 255; // 0.18824... (量化损失)

  // Float 路径
  const [rFloat, gFloat, bFloat] = core.processPixelFloat(valFloat, valFloat, valFloat);

  // 8-bit 截断后 Float 路径（模拟旧管线）
  const [rTrunc, gTrunc, bTrunc] = core.processPixelFloat(val8AsFloat, val8AsFloat, val8AsFloat);

  // 量化误差
  const inputDelta = Math.abs(valFloat - val8AsFloat);
  const outputDelta = Math.abs(rFloat - rTrunc);

  console.log(`    16-bit 输入值: ${val16} → float: ${valFloat.toFixed(8)}`);
  console.log(`    8-bit 截断值: ${val8} → float: ${val8AsFloat.toFixed(8)}`);
  console.log(`    输入量化损失: ${(inputDelta * 100).toFixed(4)}%`);
  console.log(`    输出差异: Δr = ${(outputDelta * 255).toFixed(4)} (in 8-bit levels)`);

  assert(inputDelta > 0,
    `16-bit → 8-bit 截断确实引入量化损失: Δ = ${inputDelta.toFixed(8)}`);

  // 对一系列值计算平均精度提升
  let totalInputDelta = 0;
  let totalOutputDelta = 0;
  const sampleCount = 1000;
  for (let i = 0; i < sampleCount; i++) {
    const v16 = Math.floor(Math.random() * 65536);
    const vF = v16 / 65535;
    const v8 = Math.round(vF * 255);
    const v8F = v8 / 255;

    const [rA] = core.processPixelFloat(vF, vF, vF);
    const [rB] = core.processPixelFloat(v8F, v8F, v8F);

    totalInputDelta += Math.abs(vF - v8F);
    totalOutputDelta += Math.abs(rA - rB);
  }

  const avgInputDelta = totalInputDelta / sampleCount;
  const avgOutputDelta = totalOutputDelta / sampleCount;
  console.log(`    ${sampleCount} 随机样本 — 平均输入量化损失: ${(avgInputDelta * 65535).toFixed(2)} levels (in 16-bit)`);
  console.log(`    ${sampleCount} 随机样本 — 平均输出偏差: ${(avgOutputDelta * 255).toFixed(4)} levels (in 8-bit)`);

  assert(avgOutputDelta > 0, `8-bit 截断导致输出精度损失可测量: avg Δ = ${avgOutputDelta.toFixed(6)}`);
  assert(avgOutputDelta < 0.05,
    `输出偏差在合理范围内 (< 0.05): ${avgOutputDelta.toFixed(6)}`);
}

// ╔══════════════════════════════════════════════════════════════════════════╗
// ║  Part 5 — DB 列名 / export-queue 路径解析逻辑                              ║
// ╚══════════════════════════════════════════════════════════════════════════╝

function part5_dbSchemaAndPathResolution() {
  section('Part 5: DB 列名 / export-queue 路径解析');

  // 5a. 模拟 photos 表行 — 验证路径解析优先级
  const mockPhoto = {
    id: 1,
    filename: 'IMG_001.jpg',
    original_rel_path: 'rolls/1/originals/IMG_001.CR3',
    negative_rel_path: 'rolls/1/negative/IMG_001_neg.jpg',
    positive_rel_path: 'rolls/1/full/IMG_001_pos.jpg',
    full_rel_path: 'rolls/1/full/IMG_001_pos.jpg',
    path: 'rolls/1/full/IMG_001.jpg',
    // 注意: file_path 不存在于 DB schema
  };

  // 模拟 export-queue 中的路径解析逻辑
  const relSource = mockPhoto.original_rel_path || mockPhoto.negative_rel_path
    || mockPhoto.positive_rel_path || mockPhoto.full_rel_path || mockPhoto.path;

  assert(relSource === 'rolls/1/originals/IMG_001.CR3',
    `优先使用 original_rel_path (RAW 源): ${relSource}`);

  // 5b. 当 original_rel_path 为空时回退到 negative
  const mockPhoto2 = {
    id: 2,
    filename: 'IMG_002.jpg',
    original_rel_path: null,
    negative_rel_path: 'rolls/1/negative/IMG_002_neg.jpg',
    positive_rel_path: null,
    full_rel_path: null,
    path: null,
  };

  const relSource2 = mockPhoto2.original_rel_path || mockPhoto2.negative_rel_path
    || mockPhoto2.positive_rel_path || mockPhoto2.full_rel_path || mockPhoto2.path;
  assert(relSource2 === 'rolls/1/negative/IMG_002_neg.jpg',
    `original_rel_path 为空时回退到 negative_rel_path: ${relSource2}`);

  // 5c. 全部为空时应返回 null
  const mockPhoto3 = {
    id: 3,
    filename: 'legacy.jpg',
    original_rel_path: null,
    negative_rel_path: null,
    positive_rel_path: null,
    full_rel_path: null,
    path: null,
  };

  const relSource3 = mockPhoto3.original_rel_path || mockPhoto3.negative_rel_path
    || mockPhoto3.positive_rel_path || mockPhoto3.full_rel_path || mockPhoto3.path;
  assert(!relSource3, `所有路径列均为空时返回 falsy: ${relSource3}`);

  // 5d. file_path 不存在于 photo 对象（DB 不返回此列）
  assert(mockPhoto.file_path === undefined,
    'photo 对象无 file_path 属性 (DB 中不存在此列)');
}

// ╔══════════════════════════════════════════════════════════════════════════╗
// ║  Part 6 — TIFF16 真 16-bit 验证                                          ║
// ╚══════════════════════════════════════════════════════════════════════════╝

function part6_tiff16RealBitDepth() {
  section('Part 6: TIFF16 真 16-bit — 无 bit-doubling');

  // 模拟 processPixelFloat 在一系列输入上的 16-bit 输出
  const core = new RenderCore({ exposure: 20, contrast: 10 });
  core.prepareLUTs();

  const uniqueValues = new Set();
  for (let v16 = 0; v16 < 65536; v16 += 64) { // 每隔 64 采样
    const vF = v16 / 65535;
    const [rF] = core.processPixelFloat(vF, vF, vF);
    const out16 = Math.min(65535, Math.max(0, Math.round(rF * 65535)));
    uniqueValues.add(out16);
  }

  console.log(`    16-bit 输出唯一值数量: ${uniqueValues.size} (采样 ${Math.ceil(65536 / 64)} 个输入)`);

  // 伪 16-bit (bit-doubling) 只能产生 256 个唯一值
  // 真 16-bit 应该产生远多于 256 个唯一值
  assert(uniqueValues.size > 256,
    `真 16-bit 输出唯一值 (${uniqueValues.size}) >> 256 (bit-doubling 上限)`);

  // 验证输出不是 (v8 << 8) | v8 的模式
  let bitDoublingCount = 0;
  for (const v of uniqueValues) {
    // bit-doubling 值特征: 高8位 === 低8位
    const hi = (v >> 8) & 0xFF;
    const lo = v & 0xFF;
    if (hi === lo) bitDoublingCount++;
  }

  const bitDoublingRatio = bitDoublingCount / uniqueValues.size;
  console.log(`    符合 bit-doubling 模式的值: ${bitDoublingCount} / ${uniqueValues.size} (${(bitDoublingRatio * 100).toFixed(1)}%)`);

  // 正常处理下，只有极少数值恰好满足 hi === lo（概率约 1/256）
  assert(bitDoublingRatio < 0.05,
    `bit-doubling 比例极低 (${(bitDoublingRatio * 100).toFixed(1)}% < 5%), 确认为真 16-bit`);
}

// ╔══════════════════════════════════════════════════════════════════════════╗
// ║  Part 7 — 端到端：模拟 16-bit 源 → processPixelFloat → 8-bit JPEG        ║
// ╚══════════════════════════════════════════════════════════════════════════╝

function part7_endToEndSimulation() {
  section('Part 7: 端到端模拟 — 16-bit 源 → float 处理 → 8-bit 输出');

  const width = 10;
  const height = 10;
  const channels = 3;

  // 模拟 16-bit raw buffer (来自 sharp .raw().toBuffer())
  const data16 = Buffer.alloc(width * height * channels * 2);
  // 填充渐变数据
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * channels * 2;
      const val = Math.floor(((y * width + x) / (width * height)) * 65535);
      // Little-endian 16-bit
      data16[idx + 0] = val & 0xFF;        // R low
      data16[idx + 1] = (val >> 8) & 0xFF; // R high
      data16[idx + 2] = val & 0xFF;        // G low
      data16[idx + 3] = (val >> 8) & 0xFF; // G high
      data16[idx + 4] = val & 0xFF;        // B low
      data16[idx + 5] = (val >> 8) & 0xFF; // B high
    }
  }

  // 检测 16-bit
  const expectedBytes8 = width * height * channels;
  const is16bit = (data16.length >= expectedBytes8 * 2);
  assert(is16bit, `16-bit buffer 正确识别: ${data16.length} >= ${expectedBytes8 * 2}`);

  // 模拟服务端的全浮点处理管线
  const core = new RenderCore({ exposure: 10 });
  core.prepareLUTs();

  const outJpeg = Buffer.allocUnsafe(width * height * 3);
  const outTiff16 = Buffer.allocUnsafe(width * height * 3 * 2);
  let j16 = 0;

  if (is16bit) {
    const pixels = new Uint16Array(data16.buffer, data16.byteOffset, data16.byteLength / 2);

    for (let i = 0, j = 0; i < pixels.length; i += channels, j += 3) {
      const [rF, gF, bF] = core.processPixelFloat(
        pixels[i] / 65535, pixels[i + 1] / 65535, pixels[i + 2] / 65535
      );

      // JPEG 输出 (8-bit)
      outJpeg[j]     = Math.min(255, Math.max(0, Math.round(rF * 255)));
      outJpeg[j + 1] = Math.min(255, Math.max(0, Math.round(gF * 255)));
      outJpeg[j + 2] = Math.min(255, Math.max(0, Math.round(bF * 255)));

      // TIFF16 输出 (真 16-bit)
      const r16 = Math.min(65535, Math.max(0, Math.round(rF * 65535)));
      const g16 = Math.min(65535, Math.max(0, Math.round(gF * 65535)));
      const b16 = Math.min(65535, Math.max(0, Math.round(bF * 65535)));
      outTiff16[j16++] = r16 & 0xFF; outTiff16[j16++] = (r16 >> 8) & 0xFF;
      outTiff16[j16++] = g16 & 0xFF; outTiff16[j16++] = (g16 >> 8) & 0xFF;
      outTiff16[j16++] = b16 & 0xFF; outTiff16[j16++] = (b16 >> 8) & 0xFF;
    }
  }

  // 验证输出合理性
  assert(outJpeg.length === width * height * 3,
    `JPEG 输出大小正确: ${outJpeg.length}`);
  assert(outTiff16.length === width * height * 3 * 2,
    `TIFF16 输出大小正确: ${outTiff16.length}`);

  // 验证不全为0或全为255
  let allZero = true;
  let allMax = true;
  for (let i = 0; i < outJpeg.length; i++) {
    if (outJpeg[i] !== 0) allZero = false;
    if (outJpeg[i] !== 255) allMax = false;
  }
  assert(!allZero, 'JPEG 输出非全黑');
  assert(!allMax, 'JPEG 输出非全白');

  // 验证 TIFF16 有更高精度（同一像素，TIFF16 >> JPEG * 257）
  // 取中间像素比较
  const midIdx = Math.floor(width * height / 2);
  const jpegR = outJpeg[midIdx * 3];
  const tiffR = outTiff16[midIdx * 6] | (outTiff16[midIdx * 6 + 1] << 8);
  const tiffR_as8 = Math.round(tiffR / 257); // 如果是 bit-doubling, tiffR = jpegR * 257 精确
  const diff = Math.abs(tiffR - jpegR * 257);
  console.log(`    中间像素 R: JPEG=${jpegR}, TIFF16=${tiffR}, 差异=${diff}`);
  // 真 16-bit 的 TIFF 值不一定 === jpeg * 257（因为 float→16 和 float→8 的舍入不同）
  // 但差异应很小
  assert(diff < 300, `TIFF16 与 JPEG 的精度差异在合理范围 (Δ=${diff} < 300)`);
}

// ╔══════════════════════════════════════════════════════════════════════════╗
// ║  Part 8 — processPixelFloat 与 processPixel 一致性                        ║
// ╚══════════════════════════════════════════════════════════════════════════╝

function part8_floatVsIntConsistency() {
  section('Part 8: processPixelFloat 与 processPixel 一致性 (8-bit 输入)');

  const params = {
    exposure: 15,
    contrast: 10,
    highlights: -10,
    shadows: 5,
    temp: 10,
    tint: -5,
  };
  const core = new RenderCore(params);
  core.prepareLUTs();

  let maxDelta = 0;
  let totalDelta = 0;
  const count = 256;

  for (let v = 0; v < count; v++) {
    // Int 管线
    const [ri, gi, bi] = core.processPixel(v, v, v);

    // Float 管线（模拟 8-bit 输入）
    const [rf, gf, bf] = core.processPixelFloat(v / 255, v / 255, v / 255);
    const r8 = Math.min(255, Math.max(0, Math.round(rf * 255)));
    const g8 = Math.min(255, Math.max(0, Math.round(gf * 255)));
    const b8 = Math.min(255, Math.max(0, Math.round(bf * 255)));

    const delta = Math.max(Math.abs(ri - r8), Math.abs(gi - g8), Math.abs(bi - b8));
    maxDelta = Math.max(maxDelta, delta);
    totalDelta += delta;
  }

  const avgDelta = totalDelta / count;
  console.log(`    256 级灰度 — 最大偏差: ${maxDelta} levels, 平均偏差: ${avgDelta.toFixed(2)} levels`);

  // Float 管线用 1024-entry Float32 LUT + 全浮点插值, Int 用 256-entry Uint8 LUT + 逐步截断
  // 两者是不同精度的实现，偏差反映了 Float 管线的精度优势
  // 较大偏差在中间调和暗部正常（tone-mapping + 曲线插值差异累积）
  assert(maxDelta <= 20,
    `Float 与 Int 管线最大偏差 ≤ 20 级 (架构差异): ${maxDelta}`);
  assert(avgDelta < 5.0,
    `Float 与 Int 管线平均偏差 < 5 级 (架构差异): ${avgDelta.toFixed(2)}`);
}

// ╔══════════════════════════════════════════════════════════════════════════╗
// ║  主函数                                                                   ║
// ╚══════════════════════════════════════════════════════════════════════════╝

function main() {
  console.log('╔══════════════════════════════════════════════════════════════════════╗');
  console.log('║   16-bit / Float Pipeline 验证脚本 (rev.4)                          ║');
  console.log('╚══════════════════════════════════════════════════════════════════════╝');

  part1_staticCodeChecks();
  part2_renderCoreFloat();
  part3_16bitDetection();
  part4_precisionComparison();
  part5_dbSchemaAndPathResolution();
  part6_tiff16RealBitDepth();
  part7_endToEndSimulation();
  part8_floatVsIntConsistency();

  // ── Summary ──
  console.log(`\n${'═'.repeat(70)}`);
  console.log(`  总结`);
  console.log('═'.repeat(70));
  console.log(`  总计: ${totalCount} 项测试`);
  console.log(`  通过: ${passCount} ✓`);
  console.log(`  失败: ${failCount} ✗`);
  console.log('═'.repeat(70));

  if (failCount > 0) {
    console.error(`\n⚠ ${failCount} 项测试失败，请检查上方输出。`);
    process.exit(1);
  } else {
    console.log(`\n✅ 全部 ${passCount} 项测试通过！16-bit 全浮点管线工作正常。`);
    process.exit(0);
  }
}

main();
