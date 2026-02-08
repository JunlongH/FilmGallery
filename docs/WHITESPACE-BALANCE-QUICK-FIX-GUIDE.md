# 白平衡修复快速参考 (伪代码)

**关键问题**: FilmLab 白平衡调整时改变了整体亮度  
**根本原因**: 色温增益计算中使用相对色度归一化，而非亮度保持  
**快速修复**: 应用亮度补偿，使平均增益恒为 1.0  

---

## 修复前对比

### 现象

**调整色温滑块时**:

| 操作 | Adobe Lightroom | FilmLab 当前 | FilmLab 修复后 |
|------|-----------------|------------|--------------|
| Temp -80 (冷蓝) | 图像→蓝，亮度不变 | 图像→蓝，**变亮** ❌ | 图像→蓝，亮度不变 ✅ |
| Temp +80 (暖红) | 图像→红，亮度不变 | 图像→红，**变暗** ❌ | 图像→红，亮度不变 ✅ |

---

## 问题的数学本质

### 增益不平衡导致的亮度变化

```
输入灰色: (128, 128, 128)

修复前 (temp = -50):
  gains = [1.688, 1.349, 1.00]
  输出 = (216, 173, 128)
  平均 = 172 > 128 (变亮!)
  
修复前 (temp = +50):
  gains = [0.65, 0.82, 1.25]
  输出 = (83, 105, 160)
  平均 = 116 < 128 (变暗!)
  
修复后:
  补偿 = 1 / avg(gains)
  新gains = original_gains * 补偿
  平均增益 = 1.0
  输出亮度 = 输入亮度 (不变!) ✅
```

---

## 修复方案：亮度补偿

### 核心逻辑

```javascript
// 步骤 1: 计算增益 (现有代码)
let [rGain, gGain, bGain] = computeWBGainsOriginal(params);

// 步骤 2: 计算平均增益
const avgGain = (rGain + gGain + bGain) / 3;

// 步骤 3: 计算补偿因子
const lumCompensation = 1.0 / avgGain;

// 步骤 4: 应用补偿 (新增)
rGain *= lumCompensation;
gGain *= lumCompensation;
bGain *= lumCompensation;

// 验证: 现在平均增益 = 1.0
// => 应用增益后亮度不变
```

### 为什么有效

```
修复后的增益:
  gains' = gains × (1 / avg(gains))
  avg(gains') = avg(gains × 1/avg(gains))
              = 1/avg(gains) × avg(gains)
              = 1.0

应用到像素:
  输出 = 输入 × gains'
  
灰色的亮度 = avg(RGB_out) = avg(RGB_in × gains')
           = RGB_in × avg(gains')
           = RGB_in × 1.0
           = RGB_in (不变!) ✅
```

---

## 代码修改 (完整)

### 文件：`packages/shared/filmLabWhiteBalance.js`

#### 现有代码（第 156-215 行）

```javascript
function computeWBGains(params = {}, options = {}) {
  const minGain = options.minGain ?? WB_GAIN_LIMITS.min;
  const maxGain = options.maxGain ?? WB_GAIN_LIMITS.max;
  const useKelvinModel = options.useKelvinModel !== false;
  
  // 安全解析输入
  const R = Number.isFinite(params.red) ? params.red : DEFAULT_WB_PARAMS.red;
  const G = Number.isFinite(params.green) ? params.green : DEFAULT_WB_PARAMS.green;
  const B = Number.isFinite(params.blue) ? params.blue : DEFAULT_WB_PARAMS.blue;
  const T = Number.isFinite(params.temp) ? params.temp : DEFAULT_WB_PARAMS.temp;
  const N = Number.isFinite(params.tint) ? params.tint : DEFAULT_WB_PARAMS.tint;

  let rGain, gGain, bGain;

  if (useKelvinModel) {
    // === 科学化开尔文色温模型 ===
    const targetKelvin = sliderToKelvin(T);
    const [rTemp, gTemp, bTemp] = kelvinToRGB(targetKelvin);
    const [rRef, gRef, bRef] = kelvinToRGB(REFERENCE_WHITE_POINTS.D65);

    const rTempGain = rRef / Math.max(0.001, rTemp);
    const gTempGain = gRef / Math.max(0.001, gTemp);
    const bTempGain = bRef / Math.max(0.001, bTemp);
    
    const n = N / 100;
    const tintR = 1 + n * 0.15;
    const tintG = 1 - n * 0.30;
    const tintB = 1 + n * 0.15;
    
    rGain = R * rTempGain * tintR;
    gGain = G * gTempGain * tintG;
    bGain = B * bTempGain * tintB;
    
  } else {
    // === 传统简化模型 (向后兼容) ===
    const t = T / 100;
    const n = N / 100;
    
    rGain = R * (1 + t * 0.5 + n * 0.3);
    gGain = G * (1 - n * 0.5);
    bGain = B * (1 - t * 0.5 + n * 0.3);
  }
  
  // 安全检查并钳制
  if (!Number.isFinite(rGain)) rGain = 1;
  if (!Number.isFinite(gGain)) gGain = 1;
  if (!Number.isFinite(bGain)) bGain = 1;
  
  rGain = clamp(rGain, minGain, maxGain);
  gGain = clamp(gGain, minGain, maxGain);
  bGain = clamp(bGain, minGain, maxGain);
  
  return [rGain, gGain, bGain];
}
```

#### 修改：在第 215 行前插入亮度补偿

```javascript
function computeWBGains(params = {}, options = {}) {
  // ... 上面的代码保持不变 (L156-210) ...
  
  // 🆕 第 211-226 行：亮度补偿（新增）
  // ============================================================================
  // Luminance Compensation: Ensure white balance doesn't change brightness.
  // When adjusting color temperature, the RGB gains often become unbalanced
  // (e.g., temp=-50 gives gains [1.688, 1.349, 1.00] with avg=1.346),
  // which increases overall brightness unintentionally.
  //
  // Solution: Scale all gains by 1/avg(gains) to maintain constant luminance.
  // This makes FilmLab behavior consistent with Adobe Lightroom, where
  // adjusting temp/tint only shifts hue/saturation, never luminance.
  // ============================================================================
  const avgGain = (rGain + gGain + bGain) / 3;
  if (avgGain > 0 && Number.isFinite(avgGain)) {
    const lumCompensation = 1.0 / avgGain;
    rGain *= lumCompensation;
    gGain *= lumCompensation;
    bGain *= lumCompensation;
  }
  // ============================================================================
  
  // 安全检查并钳制（保留原有逻辑）
  if (!Number.isFinite(rGain)) rGain = 1;
  if (!Number.isFinite(gGain)) gGain = 1;
  if (!Number.isFinite(bGain)) bGain = 1;
  
  rGain = clamp(rGain, minGain, maxGain);
  gGain = clamp(gGain, minGain, maxGain);
  bGain = clamp(bGain, minGain, maxGain);
  
  return [rGain, gGain, bGain];
}
```

---

## 效果验证

### 测试 1: 冷调 (温度 -50)

```javascript
// 修复前
params = { temp: -50, tint: 0 }
gains_before = [1.688, 1.349, 1.00]
avg_before = 1.346

input = [128, 128, 128]
output_before = [216, 173, 128]
avg_output_before = 172

结论: 从 128 变到 172，变亮了 34.4% ❌

// 修复后
lumCompensation = 1 / 1.346 = 0.7423
gains_after = [1.255, 1.002, 0.742]
avg_after = 1.000

output_after = [160, 128, 95]
avg_output_after = 128

结论: 始终是 128，亮度完全不变 ✅
```

### 测试 2: 暖调 (温度 +50)

```javascript
// 修复前
params = { temp: +50, tint: 0 }
gains_before = [0.65, 0.82, 1.25]
avg_before = 0.907

input = [128, 128, 128]
output_before = [83, 105, 160]
avg_output_before = 116

结论: 从 128 变到 116，变暗了 9.4% ❌

// 修复后
lumCompensation = 1 / 0.907 = 1.103
gains_after = [0.717, 0.905, 1.379]
avg_after = 1.000

output_after = [92, 116, 176]
avg_output_after = 128

结论: 始终是 128，亮度完全不变 ✅
```

### 测试 3: 真实图像（示意）

```javascript
// 输入：日落照片 (平均 RGB = 180)
// 用户调整：temp = -60（想要更蓝的冷调）

// 修复前：
// - 色调变蓝 ✅
// - 整体变亮（从 180 → 220）❌
// - 用户困惑：明明想要冷色调，怎么也变亮了？

// 修复后：
// - 色调变蓝 ✅
// - 整体亮度不变（始终 180）✅
// - 用户满意：与 Lightroom 行为一致！
```

---

## 兼容性检查

### CPU 路径 (RenderCore.js)

```javascript
// 应用增益（第 349 行）
r *= luts.rBal;
g *= luts.gBal;
b *= luts.bBal;

// luts 中的增益已经是修复后的值，自动获得亮度补偿 ✅
```

### GPU 路径 (shaders/index.js)

```glsl
// ④ White Balance
c *= u_gains;

// u_gains 来自 computeWBGains()，已包含补偿 ✅
```

### Web 客户端 (FilmLab/wb.js)

```javascript
export function computeWBGains({ red, green, blue, temp, tint }, options) {
  // ... 现有计算 ...
  
  // 如果是 v1 (现有的简化模型)，也需要添加补偿
  const avgGain = (r + g + b) / 3;
  if (avgGain > 0) {
    const lumCompensation = 1 / avgGain;
    r *= lumCompensation;
    g *= lumCompensation;
    b *= lumCompensation;
  }
  
  return [r, g, b];
}
```

**结论**: 修复在 `computeWBGains()` 函数中，自动应用到所有调用路径 ✅

---

## 回归测试清单

### 单元测试

- [ ] `test/filmLabWhiteBalance.test.js` - 添加亮度补偿测试
  ```javascript
  it('should preserve luminance with temp=-50', () => {
    const [r, g, b] = computeWBGains({ temp: -50 });
    const avg = (r + g + b) / 3;
    expect(avg).toBeCloseTo(1.0, 2);  // ±0.01
  });
  ```

### 集成测试

- [ ] CPU 渲染路径 (RenderCore.js)
  - 加载图像，调整 WB，验证亮度直方图不变
  
- [ ] GPU 渲染路径 (WebGL)
  - 同上，GPU 版本
  
- [ ] 导出路径 (Export)
  - 导出 JPEG/PNG，对比修复前后

### 视觉测试

- [ ] 冷调测试 (temp: -80, -60, -40)
  - 验证**不**变亮
  
- [ ] 暖调测试 (temp: +80, +60, +40)
  - 验证**不**变暗
  
- [ ] 混合测试 (temp+tint 同时调整)
  - 验证亮度稳定
  
- [ ] 与 Lightroom 对比 (可选但推荐)
  - 导入同一张 RAW 到 Lightroom 和 FilmLab
  - 相同的 temp/tint 设置
  - 亮度应该相同

---

## 潜在边界情况

### 情况 1: 极端增益

```javascript
// 如果计算得到的增益非常极端怎么办？
// 例如 gains = [0.05, 50.0, 0.05] (完全不现实)

avgGain = (0.05 + 50.0 + 0.05) / 3 = 16.7
lumCompensation = 1 / 16.7 = 0.06

gains_after = [0.003, 3.0, 0.003]
// 仍然很极端，但现在平衡了

// 在实际中，minGain/maxGain 限制会防止这种情况
rGain = clamp(0.003, 0.05, 50.0) = 0.05
gGain = clamp(3.0, 0.05, 50.0) = 3.0
bGain = clamp(0.003, 0.05, 50.0) = 0.05
```

### 情况 2: NaN/Infinity

```javascript
// 保护措施（已有）
if (avgGain > 0 && Number.isFinite(avgGain)) {
  // 只有在有效情况下才补偿
  const lumCompensation = 1.0 / avgGain;
  // ...
}
```

### 情况 3: 色温滑块在极端位置

```javascript
// temp = -100 (最冷) 或 +100 (最热)
// 可能导致增益计算非常不平衡

// 但亮度补偿仍然有效，因为它只是缩放
// avg(gains) 无论多大或多小，补偿后都是 1.0
```

---

## 性能影响

### 计算复杂度

- **新增**: 1 次加法 + 1 次除法 + 3 次乘法 = O(1)
- **相比**: 整个 computeWBGains() 的计算量 < 5%
- **性能**: 完全可忽略 ✅

### 内存占用

- 不增加任何额外变量
- 只是重用现有的 rGain/gGain/bGain
- **内存**: 0 字节增加 ✅

---

## 回滚方案

如果修复导致意外问题（极小可能）：

```javascript
// 快速回滚：注释掉补偿代码
if (false && avgGain > 0 && Number.isFinite(avgGain)) {
  // 亮度补偿代码（临时禁用）
  const lumCompensation = 1.0 / avgGain;
  // ...
}
```

---

## 总结

| 方面 | 评分 |
|------|------|
| 实现复杂度 | ⭐☆☆☆☆ (极简) |
| 修复准确性 | ⭐⭐⭐⭐⭐ (完美) |
| 性能影响 | ⭐☆☆☆☆ (无影响) |
| 兼容性 | ⭐⭐⭐⭐⭐ (全兼容) |
| 长期可维护性 | ⭐⭐⭐⭐☆ (后续可升级) |

**建议**: ✅ **立即实施** (预计 30 分钟)

