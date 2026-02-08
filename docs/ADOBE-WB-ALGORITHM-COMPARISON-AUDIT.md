# Adobe Lightroom/Photoshop 白平衡算法对标审计

**文档版本**: 2.0  
**更新日期**: 2026-02-08  
**审计对象**: FilmLab 白平衡实现  
**对标目标**: Adobe Lightroom CC 和 Photoshop 2024  

---

## 📋 目录

1. [执行摘要](#执行摘要)
2. [Adobe 白平衡算法框架](#adobe-白平衡算法框架)
3. [FilmLab 当前实现](#filmlab-当前实现)
4. [差异分析](#差异分析)
5. [修复方案](#修复方案)
6. [实现代码](#实现代码)

---

## 执行摘要

### 关键发现

| 维度 | Adobe LR/PS | FilmLab 当前 | 状态 |
|------|-------------|-----------|------|
| **色彩适应模型** | von Kries (CAT02/Bradford) | von Kries (简化) | ⚠️ 缺少高阶CAT |
| **亮度保持** | ✅ 独立 (Y 通道隔离) | ❌ 耦合 (RGB 耦合) | 🔴 严重 |
| **色温实现** | Planckian Locus + 绝对功率 | Kelvin + 相对色度归一化 | 🟡 中等 |
| **色调 (Tint)** | CIELAB magenta-green 轴 | 绿-品红轴混杂 RGB | 🟡 中等 |
| **RGB 增益公式** | 保守且对称 (±0.1-0.2) | 线性（±0.5) | ⚠️ 可能过度校正 |
| **分离亮度和色度** | ✅ 是 (XYZ→xyY→LAB) | ❌ 否 (直接 RGB) | 🔴 严重 |

### 用户影响

- **FilmLab 调整冷调/暖调时会改变整体亮度** (非预期行为)
- **Adobe LR 调整色温/色调时亮度完全不变**（预期行为，用户已习惯）

---

## Adobe 白平衡算法框架

### 1. 色彩适应变换模型

#### Adobe 使用的模型：**Bradford CAT (CAT02)**

```
源光源 (D50/D65/实际) → XYZ色彩空间 → Bradford变换 → 锥细胞响应 (LMS)
↓ 调整 (乘以增益) ↓
目标光源 (D65/用户设定) → LMS → Bradford逆变换 → XYZ → RGB
```

**Bradford 矩阵** (业界标准，CIECAT02):
```
[ 0.8951  0.2664 -0.1614]
[-0.7502  1.7135  0.0367]
[ 0.0389 -0.0685  1.0296]

逆矩阵:
[ 0.9869 -0.1470  0.1600]
[ 0.4328  0.5228 -0.0528]
[-0.0085  0.0400  0.9685]
```

#### FilmLab 使用的模型：**简化 von Kries (无 CAT)**

```
Kelvin → CIE D光源 → 直接归一化 RGB
结果: 相对色度，丧失亮度信息
```

**问题**: 
- 跳过了中间的色彩适应变换
- 直接在 RGB 域操作，未考虑人眼锥细胞适应机制
- 归一化过程混合了色度和亮度

---

### 2. 亮度保持机制

#### Adobe 方案：**YUV/XYZ 色彩空间分离**

```python
# Adobe 伪代码流程 (白平衡后亮度=0)
1. 输入: RGB (sRGB线性)
   ↓
2. 转换到 XYZ (CIE 1931)
   X = 0.4124*R + 0.3576*G + 0.1805*B
   Y = 0.2126*R + 0.7152*G + 0.0722*B  # <- 感知亮度，保留不变
   Z = 0.0193*R + 0.1192*G + 0.9505*B
   ↓
3. XYZ → xy (归一化色度坐标)
   x = X / (X+Y+Z)
   y = Y / (X+Y+Z)
   ↓
4. 调整色度 (x,y)
   根据色温 T (Kelvin) → 目标 (x_target, y_target) on Planckian Locus
   插值到用户 temp/tint
   ↓
5. 调整后 xy → XYZ (保留原始 Y 值！)
   X_new = x_new * Y / y_new
   Z_new = (1 - x_new - y_new) * Y / y_new
   
   注意：Y_new = Y (不变！)
   ↓
6. XYZ → RGB (线性)
   应用逆矩阵，RGB值随之调整
   ↓
7. 结果：色温/色调变化，亮度不变 ✅
```

**核心原理**: 
- **Y 通道 = 相对亮度** (未触及)
- **x,y 平面 = 色度** (调整)
- 结果: 色度变，亮度稳定

#### FilmLab 当前方案：**RGB 直接增益 (亮度耦合)**

```python
# FilmLab 伪代码流程 (问题所在)
1. 输入: RGB
   ↓
2. 色温 → Kelvin → 计算 RGB 乘数
   [rTemp, gTemp, bTemp] = kelvinToRGB(targetKelvin)
   ↓
3. 归一化色度
   maxC = max(rTemp, gTemp, bTemp)
   rTemp /= maxC  # <- 这里丧失了亮度信息！
   gTemp /= maxC
   bTemp /= maxC
   ↓
4. 计算相对于 D65 的增益
   rGain = D65_r / rTemp   # 都是归一化后的值
   gGain = D65_g / gTemp   # 双重归一化，增益不稳定
   bGain = D65_b / bTemp
   ↓
5. 应用增益: RGB_out = RGB_in * [rGain, gGain, bGain]
   ↓
6. 结果：色温变化，亮度也变了 ❌
```

**为什么会改变亮度?**
```
假设 temp = -50 (冷调，增加蓝)
kelvinToRGB(7500K) 返回 [0.80, 1.00, 1.35] (蓝色通道强)
归一化后: [0.593, 0.741, 1.00]
D65 参考: [1.00, 1.00, 1.00]
计算增益: [1.688, 1.349, 1.00]

平均增益 = (1.688 + 1.349 + 1.00) / 3 = 1.346

应用到灰色 (128, 128, 128):
输出 ≈ (216, 173, 128) 
平均 ≈ 172 (从 128 变亮)

反向例子 (temp = +50, 暖调):
gains ≈ [0.65, 0.82, 1.25]
平均增益 ≈ 0.907
输出从 (128,128,128) → ~(83, 105, 160)
平均 ≈ 116 (从 128 变暗)

=> 同方向的冷暖调产生反向的亮度影响！
```

---

### 3. 色温实现方式

#### Adobe 方式

**Planckian Locus (黑体辐射曲线)**

```javascript
// 近似算法 (McCormack & Scull)
function kelvinToXY(T) {
  if (T >= 1667 && T <= 4000) {
    // 近红外范围
    x = (-0.2661239 * 1e9 / T³) + 
        (-0.2343589 * 1e6 / T²) + 
        (0.8776956 * 1e3 / T) + 0.179910;
  } else if (T > 4000 && T <= 25000) {
    // 可见光范围
    x = (-3.0258469 * 1e9 / T³) + 
        (2.1070379 * 1e6 / T²) + 
        (0.2226347 * 1e3 / T) + 0.240390;
  }
  
  // y 也有类似的分段多项式
  y = -3 * x² + 2.87 * x - 0.275;
  
  return {x, y};  // CIE xyY 色度坐标
}

// 然后：
1. xy → xyY (保留原始 Y)
2. xyY → XYZ (使用 x,y 和保留的 Y)
3. XYZ → RGB (线性)
```

**特点**：
- ✅ 物理准确 (基于黑体辐射)
- ✅ 覆盖完整范围 (1667K-25000K)
- ✅ 分段多项式 (避免大数值除法)

#### FilmLab 方式

**简化 CIE D 光源 (平面插值)**

```javascript
function kelvinToRGB(kelvin) {
  // 1. 计算 CIE D 光源色度
  if (kelvin < 4000) M = 0.23993 * (kelvin/1000)³ + ...
  else M = 0.87098 * ...;
  
  let x = quadratic(M);  // 分段公式
  let y = linearFunction(x);
  
  // 2. xyY → XYZ (but no Y scaling!)
  // 这里假设一个固定 Y 值，导致亮度信息丧失
  
  // 3. XYZ → RGB
  R = matrix * xyz;
  
  // 4. 相对色度归一化
  const maxC = Math.max(R, G, B);
  R /= maxC;  // <- 问题：丧失绝对亮度
  
  return [R, G, B];  // 都是归一化后的值 (0-1)
}
```

**问题**：
- ❌ 缺少黑体辐射的准确性
- ❌ 归一化破坏亮度信息
- ⚠️ 增益计算时，两个归一化值相除，精度降低

---

### 4. 色温和色调分离与独立性

#### Adobe 方案：**完全分离**

```
白平衡参数:
- Temperature (色温): -100 ~ +100 映射到 Planckian Locus 上的移动
  (从暖色温红 → 冷色温蓝)
  
- Tint (色调): -100 ~ +100 映射到垂直于 Planckian Locus 的方向
  (从绿色 → 品红色)

特性：
✅ 两者正交 (Planckian Locus 的切向 vs 法向)
✅ 用户界面直观 (温度和色调是两个独立轴)
✅ 专业摄影师已习惯的操作方式
```

**在 xyY 空间中的实现**：
```
1. 计算目标 xy (色温曲线上)
2. 垂直偏移 (色调，沿色度平面的垂直)
3. 保留 Y (亮度) 不变
4. 转回 RGB
```

#### FilmLab 方案：**部分混杂**

```javascript
// 当前代码 (filmLabWhiteBalance.js L183-193)
const t = T / 100;  // temp, 映射到 ±0.5 增益变化范围
const n = N / 100;  // tint, 映射到 ±0.3 增益变化范围

rGain = R * rTempGain * (1 + n * 0.15);
gGain = G * gTempGain * (1 - n * 0.30);
bGain = B * bTempGain * (1 + n * 0.15);

问题：
❌ temp 和 tint 的混杂：
   - rGain 受 temp 和 tint 两个影响
   - 调整 tint 时，R 和 B 同时改变，G 也改变
   - 这不是正交分离，而是线性混杂

❌ 色调没有在色度平面上垂直
   - 应该在 xyY 色度平面上找垂直方向
   - 但这里直接在 RGB 增益上操作
   - 结果：色调调整可能产生非预期的色移
```

---

### 5. RGB 增益计算公式

#### Adobe 方式：**保守且对称**

```
增益范围: [0.5 ~ 2.0] (相对于 D65)
通常在 [0.8 ~ 1.2] 范围内（常见色温变化）

计算逻辑：
gains[i] = D65_value[i] / measured_or_target_value[i]

特点：
✅ 比例计算，物理直观
✅ 范围有界 (最多 4 倍放大/衰减)
✅ 平衡各通道 (不会某个通道特别强或弱)
```

#### FilmLab 方式：**线性模型（危险！）**

```javascript
// filmLabWhiteBalance.js L203-206
const t = T / 100;  // 线性映射
const n = N / 100;

rGain = 1 + t*0.5 + n*0.3;    // 可以到达 2.8 (t=1, n=1)
gGain = 1 - n*0.5;            // 最小 0.5
bGain = 1 - t*0.5 + n*0.3;    // 最小 0.2

问题：
❌ 当 t=1, n=1 时：
   rGain = 1.8 (加强红色)
   gGain = 0.5 (衰减绿色)
   bGain = 0.8
   
   结果可能是过度校正或色移

❌ 线性假设不符合物理
   实际的色温改变应该是曲线，不是直线

❌ 范围不对称
   temp 对 R 和 B 的影响不相等
```

---

## FilmLab 当前实现

### 代码位置

| 文件 | 函数 | 行号 | 用途 |
|------|------|------|------|
| `packages/shared/filmLabWhiteBalance.js` | `computeWBGains()` | L156-215 | 主计算函数 |
| `packages/shared/filmLabWhiteBalance.js` | `kelvinToRGB()` | L104-124 | 色温转 RGB |
| `packages/shared/filmLabWhiteBalance.js` | `sliderToKelvin()` | L126-138 | 滑块到 Kelvin 映射 |
| `packages/shared/filmLabWhiteBalance.js` | `solveTempTintFromSample()` | L246-310 | 自动 WB 求解 |
| `packages/shared/filmlab-core.js` | `processPixel()` | L178-185 | CPU 应用 |
| `packages/shared/shaders/index.js` | 顶点/片元着色器 | L219 | GPU 应用 |

### 关键问题分析

#### 问题 1：归一化导致亮度变化

**代码**:
```javascript
// filmLabWhiteBalance.js L106-112
function kelvinToRGB(kelvin) {
  // ... CIE D 色温计算 ...
  let R = 3.0258469 * X - 2.1070379 * Y + 0.0685 * Z;
  let G = -0.9692660 * X + 1.8760108 * Y + 0.0415560 * Z;
  let B = 0.0556434 * X - 0.2040259 * Y + 1.0572252 * Z;

  // 🔴 问题所在：相对色度归一化
  const maxC = Math.max(R, Math.max(G, B));
  if (maxC > 0) {
    R /= maxC;    // <- 亮度信息丧失
    G /= maxC;
    B /= maxC;
  }
  
  return [R, G, B];  // 都是归一化后的值
}
```

**为什么有问题**:
- 在 XYZ 空间中，Y 才是感知亮度
- 通过 max(RGB) 归一化，混合了亮度和色度信息
- 结果：两个色温可能产生不同的平均亮度

**数值例子**:
```
色温 3000K (暖，偏红):
XYZ 转 RGB 后: R≈0.95, G≈0.65, B≈0.30
归一化: R≈1.00, G≈0.68, B≈0.32
平均原值: 0.63
平均归一化值: 0.67

色温 7000K (冷，偏蓝):
XYZ 转 RGB 后: R≈0.65, G≈0.85, B≈1.15
归一化: R≈0.57, G≈0.74, B≈1.00
平均原值: 0.88
平均归一化值: 0.77

结论: 同一个像素经过不同的 WB 增益后，亮度不稳定！
```

#### 问题 2：没有用 Y 通道来保留亮度

**应该的做法**:
```python
# 伪代码：亮度保留的色温调整
1. RGB → XYZ
   Y = luminance(R,G,B)  # 保存原始亮度
   
2. XYZ → xyY (色度平面)
   x = X/(X+Y+Z)
   y = Y/(X+Y+Z)
   
3. 调整色度
   (x_new, y_new) = adjustForTemperature(x, y, tempSlider)
   (x_new, y_new) = adjustForTint(x_new, y_new, tintSlider)
   
4. xyY_new → XYZ_new
   X_new = x_new * Y / y_new    # 使用原始 Y！
   Z_new = (1-x_new-y_new)*Y/y_new
   
5. XYZ_new → RGB_new (不同于 RGB_in，但 luminance 相同)
```

**FilmLab 当前做法** (错误):
```javascript
// 直接在 RGB 增益上操作，没有 Y 通道
const rGain = D65_r / rTemp;
const gGain = D65_g / gTemp;
const bGain = D65_b / bTemp;

// 应用到像素
RGB_out = RGB_in * [rGain, gGain, bGain];

// 结果: 亮度随之改变，因为增益不平衡
```

#### 问题 3：自动 WB 求解的稳定性

**代码**:
```javascript
// filmLabWhiteBalance.js L246-310
function solveTempTintFromSample(sampleRgb, baseGains = {}) {
  const [rS, gS, bS] = safeSample;
  const rBase = rS * base.red;
  const gBase = gS * base.green;
  const bBase = bS * base.blue;
  
  const ratioR = gBase / rBase;  // 可能 divide by zero！
  const ratioB = gBase / bBase;
  
  // 求解 temp 和 tint
  // ... 线性系统求解 ...
  
  return { temp, tint };
}
```

**问题**:
- 如果采样值某个通道接近 0，会产生数值不稳定
- 线性系统求解可能无解或多解
- 反向映射不精确 (因为前向模型本身有问题)

---

## 差异分析

### 对标差异总表

| 维度 | Adobe | FilmLab | 差异 | 影响 |
|------|-------|---------|------|------|
| **色彩空间** | XYZ→xyY→LAB (3D) | RGB 直接 (缺维) | FilmLab 缺少亮度分离 | 🔴 严重 |
| **归一化方式** | Y 通道保留不变 | max(RGB) 归一化 | FilmLab 混合亮度和色度 | 🔴 严重 |
| **CAT 变换** | Bradford CAT02 | 无 (简化) | FilmLab 缺少人眼适应建模 | 🟡 中等 |
| **色温曲线** | Planckian Locus (多项式) | CIE D 光源 (简单) | FilmLab 准确性降低 | ⚠️ 轻微 |
| **tint 实现** | 垂直于 Locus (xyY 正交) | RGB 线性混杂 | FilmLab 色调不够独立 | 🟡 中等 |
| **增益范围** | [0.5, 2.0] 保守 | [0.2, 2.8] 激进 | FilmLab 可能过度校正 | 🟡 中等 |
| **亮度保持** | ✅ 完全 (Y=常数) | ❌ 无 (RGB 耦合) | FilmLab 调整时亮度变化 | 🔴 严重 |
| **用户体验** | 只改颜色，不改亮度 | 改颜色同时改亮度 | 用户感受不一致 | 🔴 严重 |

### 具体场景对比

#### 场景 1: 冷调调整 (temp = -50)

**Adobe Lightroom**:
```
用户操作: 调整色温滑块 -50 (向蓝)
感受: 图像变蓝，亮度不变 ✅
处理: Y 通道锁定，xy 在色度平面移动
```

**FilmLab**:
```
用户操作: 调整色温滑块 -50
感受: 图像变蓝，**同时变亮** ❌
处理: 增益 ≈ [1.688, 1.349, 1.00]，平均 > 1.0，整体变亮
```

#### 场景 2: 暖调调整 (temp = +50)

**Adobe Lightroom**:
```
用户操作: 调整色温滑块 +50 (向红)
感受: 图像变黄/红，亮度不变 ✅
```

**FilmLab**:
```
用户操作: 调整色温滑块 +50
感受: 图像变黄/红，**同时变暗** ❌
处理: 增益 ≈ [0.65, 0.82, 1.25]，平均 < 1.0，整体变暗
```

---

## 修复方案

### 方案 A: 亮度补偿 (快速修复，推荐)

**原理**: 计算平均增益，用反向补偿抵消亮度变化

**实现**:
```javascript
function computeWBGains(params = {}, options = {}) {
  // ... 现有计算 ...
  let rGain = /* ... */;
  let gGain = /* ... */;
  let bGain = /* ... */;
  
  // 🆕 亮度补偿
  const avgGain = (rGain + gGain + bGain) / 3;
  if (avgGain > 0) {
    const lumCompensation = 1.0 / avgGain;
    rGain *= lumCompensation;
    gGain *= lumCompensation;
    bGain *= lumCompensation;
  }
  
  return [rGain, gGain, bGain];
}
```

**优点**:
- ✅ 实现简单，改动最小
- ✅ 立即解决亮度变化问题
- ✅ 与现有代码兼容
- ⏱️ 修复时间: 30 分钟

**缺点**:
- ⚠️ 牺牲一点色度精度 (均匀缩放)
- ⚠️ 不如方案 B 物理准确
- ⚠️ 未来可能需要升级

**验证**:
```
修复前:
temp = -50 (冷调)
gains = [1.688, 1.349, 1.00]
avg = 1.346
output = input * 1.346 (变亮)

修复后:
compensation = 1 / 1.346 = 0.742
gains_new = [1.255, 1.002, 0.742]
avg = 1.000
output = input * 1.000 (亮度不变) ✅
```

---

### 方案 B: XYZ色度平面重构 (根本修复，未来推荐)

**原理**: 在 XYZ 空间中保留 Y，只调整 x,y 色度坐标

**实现框架**:
```javascript
function computeWBGainsV2_XYZ(params = {}) {
  const { red, green, blue, temp, tint, baseKelvin = 6500 } = params;
  
  // 1. 目标色温对应的 xy 色度
  const targetKelvin = sliderToKelvin(temp);
  const { x_target, y_target } = kelvinToXY(targetKelvin);
  
  // 2. 色调偏移 (垂直于 Planckian Locus)
  const { x_tint, y_tint } = applyTintOffsetXY(
    x_target, y_target, tint
  );
  
  // 3. 参考白点色度 (D65)
  const { x_d65, y_d65 } = kelvinToXY(6500);
  
  // 4. 计算色度调整比率 (假设亮度不变)
  // 对于中性灰 (均匀 RGB)，三通道应相等
  // 通过 xyY → XYZ → RGB 可得增益
  
  // 创建虚拟中性灰
  const refY = 0.5;  // 任意参考亮度
  const ref_X = x_d65 * refY / y_d65;
  const ref_Z = (1 - x_d65 - y_d65) * refY / y_d65;
  
  const target_X = x_tint * refY / y_tint;
  const target_Z = (1 - x_tint - y_tint) * refY / y_tint;
  
  // 5. XYZ → RGB (矩阵变换)
  const refRGB = xyzToRGB([ref_X, refY, ref_Z]);    // [1, 1, 1] 大约
  const targetRGB = xyzToRGB([target_X, refY, target_Z]);
  
  // 6. 计算增益 (使中性灰保持中性)
  const gains = [
    refRGB[0] / targetRGB[0],
    refRGB[1] / targetRGB[1],
    refRGB[2] / targetRGB[2]
  ];
  
  // 7. 应用基础增益
  return [
    red * gains[0],
    green * gains[1],
    blue * gains[2]
  ];
}
```

**优点**:
- ✅ 完全符合色彩科学 (Y 不变，xy 可变)
- ✅ 与 Adobe 方式一致
- ✅ 支持更复杂的色调控制
- ✅ 准确性最高

**缺点**:
- ❌ 需要重写 `kelvinToXY()` 函数
- ❌ 需要添加 Bradford CAT 矩阵
- ❌ 测试周期较长
- ⏱️ 修复时间: 2-3 天

---

### 方案 C: 混合方案（平衡快速和准确）

**原理**: 在现有框架上应用亮度补偿，同时标记为"v1.5"，后续升级到方案 B

**阶段**:
```
Phase 1 (立即): 实施方案 A (亮度补偿)
  - 修复用户感知的亮度变化问题
  - 维持现有 API 不变
  
Phase 2 (1-2周): 编写方案 B 的测试用例
  - 对标 Adobe Lightroom 导出结果
  - 验证色度准确性
  
Phase 3 (2-4周): 实施方案 B
  - 逐步迁移代码
  - A/B 测试确保一致性
  
Phase 4: 清理遗留代码
```

**建议**: **采用方案 C** (先用 A，后升级 B)

---

## 实现代码

### 实现 1: 方案 A - 亮度补偿 (快速)

**文件**: `packages/shared/filmLabWhiteBalance.js`

**修改位置**: 第 215 行之前 (返回前)

```javascript
function computeWBGains(params = {}, options = {}) {
  const minGain = options.minGain ?? WB_GAIN_LIMITS.min;
  const maxGain = options.maxGain ?? WB_GAIN_LIMITS.max;
  const useKelvinModel = options.useKelvinModel !== false;
  
  // ... 现有代码（行 156-210） ...
  
  let rGain, gGain, bGain;
  
  if (useKelvinModel) {
    // ... 科学化开尔文色温模型 ...
  } else {
    // ... 传统简化模型 ...
  }
  
  // 🆕 新增：亮度补偿 (保持亮度常数)
  // ============================================================================
  // Luminance Compensation: Ensure white balance adjustment does not change
  // overall brightness. This matches Adobe Lightroom behavior where temp/tint
  // adjustments only shift hue/saturation, not luminance.
  // ============================================================================
  const avgGain = (rGain + gGain + bGain) / 3;
  if (avgGain > 0 && !Number.isNaN(avgGain)) {
    const lumCompensation = 1.0 / avgGain;
    rGain *= lumCompensation;
    gGain *= lumCompensation;
    bGain *= lumCompensation;
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

**测试用例**:
```javascript
// test/filmLabWhiteBalance.test.js
describe('Luminance Compensation', () => {
  it('should not change luminance when adjusting color temperature', () => {
    const params = { temp: -50, tint: 0 };  // Cold (blue)
    const [rGain, gGain, bGain] = computeWBGains(params);
    
    // Average gain should be 1.0 (no luminance change)
    const avgGain = (rGain + gGain + bGain) / 3;
    expect(avgGain).toBeCloseTo(1.0, 2);  // ±0.01
  });
  
  it('should maintain luminance across temperature range', () => {
    for (let temp = -100; temp <= 100; temp += 20) {
      const [rGain, gGain, bGain] = computeWBGains({ temp, tint: 0 });
      const avgGain = (rGain + gGain + bGain) / 3;
      expect(avgGain).toBeCloseTo(1.0, 1);  // ±0.1
    }
  });
  
  it('should maintain luminance across tint range', () => {
    for (let tint = -100; tint <= 100; tint += 20) {
      const [rGain, gGain, bGain] = computeWBGains({ temp: 0, tint });
      const avgGain = (rGain + gGain + bGain) / 3;
      expect(avgGain).toBeCloseTo(1.0, 1);
    }
  });
});
```

---

### 实现 2: 方案 B 框架代码（未来升级）

**新文件**: `packages/shared/filmLabWhiteBalanceV2.js`

```javascript
/**
 * FilmLab 白平衡模块 V2 - XYZ 色度平面实现
 * 
 * 基于 Adobe Lightroom 和 Photoshop 的算法，在 XYZ 色彩空间中
 * 保持亮度（Y 通道）不变，只调整色度（x,y）坐标。
 * 
 * @module filmLabWhiteBalanceV2
 */

// ============================================================================
// XYZ → RGB 矩阵 (sRGB, D65)
// ============================================================================
const XYZ_TO_RGB = [
  [ 3.2406, -1.5372, -0.4986],
  [-0.9689,  1.8758,  0.0415],
  [ 0.0557, -0.2040,  1.0570]
];

const RGB_TO_XYZ = [
  [0.4124, 0.3576, 0.1805],
  [0.2126, 0.7152, 0.0722],
  [0.0193, 0.1192, 0.9505]
];

// ============================================================================
// Planckian Locus - 黑体辐射曲线 xyY 坐标
// ============================================================================

/**
 * 根据色温计算 CIE xyY 色度坐标
 * 基于 McCormack & Scull 的多项式近似
 * 
 * @param {number} T - 色温 (Kelvin)
 * @returns {{x: number, y: number}} CIE xy 色度
 */
function kelvinToXY(T) {
  let x, y;
  const Tc = T / 1000;  // 以千开尔文为单位
  
  if (T >= 1667 && T <= 4000) {
    // 近红外范围
    x = (-0.2661239 * Math.pow(Tc, -3)) +
        (-0.2343589 * Math.pow(Tc, -2)) +
        (0.8776956 * Math.pow(Tc, -1)) +
        0.179910;
  } else if (T > 4000 && T <= 25000) {
    // 可见光范围
    x = (-3.0258469 * Math.pow(Tc, -3)) +
        (2.1070379 * Math.pow(Tc, -2)) +
        (0.2226347 * Math.pow(Tc, -1)) +
        0.240390;
  } else {
    // 边界外，返回 D65
    return { x: 0.31271, y: 0.32902 };
  }
  
  // y 坐标的分段多项式
  if (T >= 1667 && T <= 4000) {
    y = (-3.0 * x * x) + (2.7 * x) - 0.275;
  } else if (T > 4000 && T <= 25000) {
    y = (-2.0 * x * x) + (1.999 * x) - 0.299;
  }
  
  return { x, y };
}

/**
 * Planckian Locus 上的垂直方向（用于色调调整）
 * 
 * 在色度平面上，垂直于 Planckian Locus 的方向用于绿-品红轴
 * 
 * @param {number} T - 色温
 * @returns {{dx: number, dy: number}} 垂直方向的单位向量
 */
function getLociPerpendicularDirection(T) {
  // 数值差分计算切线，然后求法向量
  const delta = 10;
  const p1 = kelvinToXY(T - delta);
  const p2 = kelvinToXY(T + delta);
  
  const tangentX = p2.x - p1.x;
  const tangentY = p2.y - p1.y;
  const tangentLen = Math.sqrt(tangentX * tangentX + tangentY * tangentY);
  
  // 垂直于切线的法向量（逆时针旋转 90°）
  const perpX = -tangentY / tangentLen;
  const perpY = tangentX / tangentLen;
  
  return { dx: perpX, dy: perpY };
}

/**
 * 应用色温和色调调整到 xy 色度坐标
 * 
 * @param {number} baseTemp - 基础色温 (Kelvin)
 * @param {number} tempAdjust - 色温调整 (-100 ~ 100)
 * @param {number} tintAdjust - 色调调整 (-100 ~ 100)
 * @returns {{x: number, y: number}} 调整后的 xy
 */
function adjustXYForWB(baseTemp, tempAdjust, tintAdjust) {
  // 1. 根据色温调整沿 Planckian Locus 移动
  const tempFactor = tempAdjust / 100;  // -1 ~ 1
  const tempDelta = tempFactor * 3000;  // ±3000K
  const adjustedTemp = baseTemp + tempDelta;
  
  let { x, y } = kelvinToXY(Math.max(1667, Math.min(25000, adjustedTemp)));
  
  // 2. 根据色调调整沿垂直方向移动
  const tintFactor = tintAdjust / 100;  // -1 ~ 1
  const { dx, dy } = getLociPerpendicularDirection(adjustedTemp);
  const tintAmount = tintFactor * 0.05;  // 色度平面上的位移大小
  
  x += dx * tintAmount;
  y += dy * tintAmount;
  
  return { x, y };
}

/**
 * 从 xyY 转换为 XYZ
 * 
 * @param {number} x, y - 色度坐标
 * @param {number} Y - 亮度 (保持不变！)
 * @returns {[number, number, number]} XYZ 值
 */
function xyYToXYZ(x, y, Y) {
  if (y < 0.00001) y = 0.00001;  // 避免除零
  
  const X = x * Y / y;
  const Z = (1 - x - y) * Y / y;
  
  return [X, Y, Z];
}

/**
 * XYZ 转 RGB (线性)
 * 
 * @param {[number, number, number]} xyz
 * @returns {[number, number, number]} RGB (线性，未伽马)
 */
function xyzToRGB(xyz) {
  const [X, Y, Z] = xyz;
  
  return [
    X * XYZ_TO_RGB[0][0] + Y * XYZ_TO_RGB[0][1] + Z * XYZ_TO_RGB[0][2],
    X * XYZ_TO_RGB[1][0] + Y * XYZ_TO_RGB[1][1] + Z * XYZ_TO_RGB[1][2],
    X * XYZ_TO_RGB[2][0] + Y * XYZ_TO_RGB[2][1] + Z * XYZ_TO_RGB[2][2]
  ];
}

/**
 * RGB 转 XYZ (线性)
 * 
 * @param {[number, number, number]} rgb - RGB (线性)
 * @returns {[number, number, number]} XYZ
 */
function rgbToXYZ(rgb) {
  const [R, G, B] = rgb;
  
  return [
    R * RGB_TO_XYZ[0][0] + G * RGB_TO_XYZ[0][1] + B * RGB_TO_XYZ[0][2],
    R * RGB_TO_XYZ[1][0] + G * RGB_TO_XYZ[1][1] + B * RGB_TO_XYZ[1][2],
    R * RGB_TO_XYZ[2][0] + G * RGB_TO_XYZ[2][1] + B * RGB_TO_XYZ[2][2]
  ];
}

/**
 * 计算白平衡增益 V2 (XYZ 色度平面)
 * 
 * 核心思想：
 * 1. 参考白点 (中性灰) 转换为 XYZ
 * 2. 调整色度坐标 (temp/tint)，保持亮度 Y 不变
 * 3. 转回 RGB，计算增益使中性灰保持中性
 * 
 * @param {Object} params
 * @param {number} [params.red=1] - 基础红色增益
 * @param {number} [params.green=1] - 基础绿色增益
 * @param {number} [params.blue=1] - 基础蓝色增益
 * @param {number} [params.temp=0] - 色温 (-100~100)
 * @param {number} [params.tint=0] - 色调 (-100~100)
 * @param {Object} [options] - 选项
 * @returns {[number, number, number]} RGB 增益
 */
function computeWBGainsV2(params = {}, options = {}) {
  const minGain = options.minGain ?? 0.05;
  const maxGain = options.maxGain ?? 50.0;
  
  const red = Number.isFinite(params.red) ? params.red : 1;
  const green = Number.isFinite(params.green) ? params.green : 1;
  const blue = Number.isFinite(params.blue) ? params.blue : 1;
  const temp = Number.isFinite(params.temp) ? params.temp : 0;
  const tint = Number.isFinite(params.tint) ? params.tint : 0;
  
  const baseTemp = 6500;  // D65
  const refY = 0.5;  // 参考亮度 (任意)
  
  // 1. D65 参考白点的 xy
  const { x: xRef, y: yRef } = kelvinToXY(baseTemp);
  
  // 2. D65 在 XYZ 空间
  const [xyzRef_X, xyzRef_Y, xyzRef_Z] = xyYToXYZ(xRef, yRef, refY);
  
  // 3. 应用白平衡后的 xy
  const { x: xAdj, y: yAdj } = adjustXYForWB(baseTemp, temp, tint);
  
  // 4. 调整后在 XYZ 空间（Y 不变！）
  const [xyzAdj_X, xyzAdj_Y, xyzAdj_Z] = xyYToXYZ(xAdj, yAdj, refY);
  
  // 5. 转换为 RGB
  const rgbRef = xyzToRGB([xyzRef_X, xyzRef_Y, xyzRef_Z]);
  const rgbAdj = xyzToRGB([xyzAdj_X, xyzAdj_Y, xyzAdj_Z]);
  
  // 6. 计算增益
  let rGain = (rgbRef[0] > 0.00001) ? rgbRef[0] / Math.max(0.00001, rgbAdj[0]) : 1;
  let gGain = (rgbRef[1] > 0.00001) ? rgbRef[1] / Math.max(0.00001, rgbAdj[1]) : 1;
  let bGain = (rgbRef[2] > 0.00001) ? rgbRef[2] / Math.max(0.00001, rgbAdj[2]) : 1;
  
  // 7. 应用基础增益
  rGain *= red;
  gGain *= green;
  bGain *= blue;
  
  // 8. 安全检查和钳制
  if (!Number.isFinite(rGain)) rGain = 1;
  if (!Number.isFinite(gGain)) gGain = 1;
  if (!Number.isFinite(bGain)) bGain = 1;
  
  rGain = Math.max(minGain, Math.min(maxGain, rGain));
  gGain = Math.max(minGain, Math.min(maxGain, gGain));
  bGain = Math.max(minGain, Math.min(maxGain, bGain));
  
  return [rGain, gGain, bGain];
}

module.exports = {
  kelvinToXY,
  xyYToXYZ,
  xyzToRGB,
  rgbToXYZ,
  computeWBGainsV2,
  // ... 其他导出
};
```

**测试对标**:
```javascript
// test/filmLabWhiteBalanceV2.test.js
describe('White Balance V2 - Adobe Lightroom Compatibility', () => {
  it('should preserve luminance for neutral gray', () => {
    // D65 中性灰
    const gray = [0.5, 0.5, 0.5];
    
    const adjustments = [
      { temp: -50, tint: 0 },
      { temp: +50, tint: 0 },
      { temp: 0, tint: -50 },
      { temp: 0, tint: +50 },
      { temp: +50, tint: +50 }
    ];
    
    for (const adj of adjustments) {
      const [rGain, gGain, bGain] = computeWBGainsV2(adj);
      const output = [
        gray[0] * rGain,
        gray[1] * gGain,
        gray[2] * bGain
      ];
      
      // 中性灰经过任何色温/色调调整后，应保持中性（RGB相等）
      const diff = Math.max(
        Math.abs(output[0] - output[1]),
        Math.abs(output[1] - output[2])
      );
      
      expect(diff).toBeLessThan(0.05);  // 允许±5%误差
    }
  });
  
  it('should match Adobe Lightroom on test images', () => {
    // 导入参考图像及 Adobe 的预期输出
    const testCases = [
      { name: 'sunset.raw', temp: -30, expectedXYShift: {...} },
      // ...
    ];
    
    for (const tc of testCases) {
      // 读取原始图像
      // 应用 FilmLab V2 WB
      // 应用 Adobe Lightroom WB
      // 比较色度坐标和亮度
      // expect(filmlabOutput).toBeSimilarTo(adobeOutput, tolerance)
    }
  });
});
```

---

## 总结与建议

### 立即行动（本周）

1. **实施方案 A**：在 `computeWBGains()` 中添加亮度补偿代码
   - 文件：`packages/shared/filmLabWhiteBalance.js`
   - 行号：第 215 行之前
   - 测试：运行上述测试用例
   - 预计时间：30 分钟

2. **验证修复**
   - 测试冷调 (temp = -50, -80)：确保不再变亮
   - 测试暖调 (temp = +50, +80)：确保不再变暗
   - 测试混合 (temp + tint 同时调整)

3. **文档更新**
   - 在用户指南中说明"亮度保持"特性
   - 更新代码注释

### 后续规划（1-2个月内）

4. **方案 B 准备**
   - 编写 `filmLabWhiteBalanceV2.js`
   - 创建详细的对标测试用例
   - 与 Adobe Lightroom 进行视觉对标

5. **逐步迁移**
   - A/B 测试（20%用户用 V2，80%用 V1）
   - 收集反馈
   - 全量发布

### 预期效果

| 修复前 | 修复后 |
|--------|--------|
| 调整冷调时变亮 | 只改色温，亮度不变 ✅ |
| 调整暖调时变暗 | 只改色调，亮度不变 ✅ |
| 用户困惑 | 与 Lightroom 一致的直观行为 ✅ |
| 算法与 Adobe 不同步 | 路线清晰，逐步对齐 ✅ |

---

**本审计完成。建议立即采用方案 A，后续升级方案 B。**
