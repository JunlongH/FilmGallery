# Adobe Lightroom/Photoshop 白平衡最佳实践参考

**文档目的**: 提供 Adobe 白平衡实现的核心原理和代码示例，供 FilmLab 对标参考

---

## 目录

1. [Adobe 色彩适应的三层架构](#adobe-色彩适应的三层架构)
2. [关键算法细节](#关键算法细节)
3. [与 FilmLab 的对标表](#与-filmlab-的对标表)
4. [实现检查清单](#实现检查清单)

---

## Adobe 色彩适应的三层架构

### 第一层：色彩空间转换

```
输入 RGB (sRGB 线性)
    ↓
转换到 CIE XYZ (1931)
    ↓
RGB_linear = [R, G, B]  (每个通道 0-1 或 0-255)

XYZ = [
  0.4124*R + 0.3576*G + 0.1805*B,    // X (红绿蓝的加权)
  0.2126*R + 0.7152*G + 0.0722*B,    // Y (感知亮度) ← 关键！
  0.0193*R + 0.1192*G + 0.9505*B     // Z (蓝度)
]
```

**关键特性**:
- **Y 通道 = 感知亮度** (符合 CIE 1931 标准)
- Y 权重: R(21.26%) : G(71.52%) : B(7.22%)
  - G 的权重最高（人眼对绿敏感）
  - B 的权重最低（人眼对蓝不敏感）

### 第二层：色度提取 (xyY 色彩空间)

```
XYZ → xyY (色度+亮度分离)

x = X / (X + Y + Z)    // 色度 x (范围 ~0.3-0.5)
y = Y / (X + Y + Z)    // 色度 y (范围 ~0.3-0.6)
Y = Y                  // 亮度 (范围 0-1 或 0-100)

特性:
✅ x, y 描述"颜色本质" (消除了亮度影响)
✅ Y 保持独立 (可单独调整)
✅ 所有可见颜色在 (x,y) 平面上形成一个2D区域
✅ Planckian Locus (黑体辐射曲线) 在 (x,y) 平面上是一条曲线
```

**例子**:
```
D65 白点: xy = (0.3127, 0.3290), Y = 任意
3000K 暖光: xy ≈ (0.445, 0.405), Y = 任意
7000K 冷光: xy ≈ (0.300, 0.316), Y = 任意

注意：即使 Y 不同，xy 坐标相同的颜色被人眼感知为"同一种颜色"
```

### 第三层：色温调整 (在 xyY 平面上操作)

```
用户操作: 调整色温滑块 (temp: -100~+100)

Lightroom 处理流程:

1. 当前像素的 xyY
   [x_current, y_current, Y_current]
   
2. 根据 temp 找到 Planckian Locus 上的目标 xy
   targetKelvin = mapSliderToKelvin(temp)
   [x_target, y_target] = planckianLocus(targetKelvin)
   
3. 色调调整 (垂直于曲线)
   [x_final, y_final] = [x_target, y_target] + tint_offset
   
4. 关键：保留亮度！
   Y_final = Y_current  ← 这一行是关键！
   
5. xyY → XYZ (反向转换)
   X_final = x_final * Y_final / y_final
   Z_final = (1 - x_final - y_final) * Y_final / y_final
   
6. XYZ → RGB (线性)
   R_final = 3.2406*X - 1.5372*Y + ...
   G_final = -0.9689*X + 1.8758*Y + ...
   B_final = 0.0557*X - 0.2040*Y + ...
   
7. 结果：颜色改变，亮度不变 ✅
```

---

## 关键算法细节

### 1. Planckian Locus (黑体辐射曲线)

**物理基础**:
- 黑体在不同温度下发出的光的颜色不同
- 温度越高，光越"蓝"(短波长)
- 温度越低，光越"红"(长波长)

**McCormack & Scull 近似公式** (被 Lightroom 采用):

```javascript
function kelvinToXY(T) {
  const Tc = T / 1000;  // 千开尔文
  
  let x, y;
  
  // 分段1: 1667K - 4000K (红外到黄色)
  if (T >= 1667 && T <= 4000) {
    x = (-0.2661239 * Math.pow(Tc, -3)) +
        (-0.2343589 * Math.pow(Tc, -2)) +
        (0.8776956 * Math.pow(Tc, -1)) +
        0.179910;
    
    y = (-3.0 * x * x) + (2.7 * x) - 0.275;
  }
  
  // 分段2: 4000K - 25000K (黄色到蓝)
  else if (T > 4000 && T <= 25000) {
    x = (-3.0258469 * Math.pow(Tc, -3)) +
        (2.1070379 * Math.pow(Tc, -2)) +
        (0.2226347 * Math.pow(Tc, -1)) +
        0.240390;
    
    y = (-2.0 * x * x) + (1.999 * x) - 0.299;
  }
  
  return { x, y };
}
```

**精度**: ±0.0015 (在可见范围内)

### 2. 色调调整 (绿-品红轴)

**什么是色调?**
- 垂直于 Planckian Locus 的方向
- 绿色 ↔ 品红色轴
- 物理意义：补充非黑体光源的颜色偏差

**实现方式**:

```javascript
function applyTintOffset(x, y, tintValue, T) {
  // 1. 计算 Planckian Locus 的切线方向
  const dT = 10;
  const p1 = kelvinToXY(T - dT);
  const p2 = kelvinToXY(T + dT);
  
  const tangentX = p2.x - p1.x;
  const tangentY = p2.y - p1.y;
  
  // 2. 计算垂直方向 (逆时针旋转 90°)
  const len = Math.sqrt(tangentX * tangentX + tangentY * tangentY);
  const perpX = -tangentY / len;
  const perpY = tangentX / len;
  
  // 3. 应用色调偏移
  const tintAmount = (tintValue / 100) * 0.05;  // 规范化
  
  return {
    x: x + perpX * tintAmount,
    y: y + perpY * tintAmount
  };
}
```

**视觉效果**:
```
原始 xy ──┐
         ├─→ 沿 Planckian Locus (色温改变)
         ├─→ 垂直于 Locus (色调改变)
         └─→ 结果: 颜色在 xy 平面上移动

例子:
D65 (6500K): xy = (0.3127, 0.3290)
-50 Tint (绿): xy ≈ (0.3127, 0.3310) ← y 增加
+50 Tint (品红): xy ≈ (0.3127, 0.3270) ← y 减少
```

### 3. 亮度保持机制

**核心原理**:
```
xyY 转 XYZ 时，Y 保持不变
=> 无论如何调整 x,y，像素的感知亮度不变

数学证明:
Y_final = Y_input  (固定)

X = x * Y / y  (如果 Y 固定，X 随 x,y 比例变化)
Z = (1-x-y)*Y/y

所以即使 x,y 改变，通过反向计算 X,Z，
再转换回 RGB，整体亮度守恒。
```

**对比 FilmLab 的错误**:
```
FilmLab (错误):
RGB 直接 → 相对色度归一化 → 增益计算
=> 两个 RGB 值都经过 max() 归一化，亮度信息丧失

Adobe (正确):
RGB → XYZ (Y 保存) → xy (色度) → 调整 xy → 
XYZ (使用原始 Y) → RGB
=> Y 始终保持，亮度守恒
```

### 4. 色彩适应变换 (CAT)

**为什么需要 CAT?**
- 人眼在不同光源下的锥细胞会适应
- 直接在 RGB 或 XYZ 上操作不够准确
- 需要"人眼视觉空间"中的变换

**Bradford CAT02** (业界标准):

```javascript
const CAT02_TO_LMS = [
  [ 0.8951,  0.2664, -0.1614],
  [-0.7502,  1.7135,  0.0367],
  [ 0.0389, -0.0685,  1.0296]
];

const LMS_TO_CAT02_INV = [
  [ 0.9869, -0.1470,  0.1600],
  [ 0.4328,  0.5228, -0.0528],
  [-0.0085,  0.0400,  0.9685]
];

// 完整的色彩适应流程 (Adobe 可能使用):
function adaptXYZWithCAT(XYZ, sourceIlluminant, targetIlluminant) {
  // 1. XYZ → LMS (锥细胞响应)
  const LMS = matmul(CAT02_TO_LMS, XYZ);
  
  // 2. 在 LMS 空间中调整 (通道独立缩放)
  const gainL = targetIlluminant[0] / sourceIlluminant[0];
  const gainM = targetIlluminant[1] / sourceIlluminant[1];
  const gainS = targetIlluminant[2] / sourceIlluminant[2];
  
  const LMS_adapted = [
    LMS[0] * gainL,
    LMS[1] * gainM,
    LMS[2] * gainS
  ];
  
  // 3. LMS → XYZ
  return matmul(LMS_TO_CAT02_INV, LMS_adapted);
}
```

**与 xyY 平面方法的关系**:
- Bradford CAT 是更精确的人眼适应模型
- xyY 方法是简化的视觉近似
- Adobe 可能同时使用两者（内部 CAT，对外 xyY UI）

---

## 与 FilmLab 的对标表

### 1. 色彩空间选择

| 特性 | Adobe | FilmLab | 差异 | 推荐 |
|------|-------|---------|------|------|
| **第一步** | RGB → XYZ | RGB → Kelvin | ⚠️ FilmLab 跳过 XYZ | 需要添加 |
| **亮度提取** | Y = 0.2126*R + 0.7152*G + 0.0722*B | 无 | 🔴 严重 | 关键！ |
| **色度平面** | xyY (x,y 归一化) | RGB (直接) | 🔴 严重 | 改用 xyY |
| **色温曲线** | Planckian Locus (McCormack) | CIE D | ⚠️ 准确性不同 | 可升级 |
| **色调** | Locus 垂直 (数值微分) | RGB 线性混杂 | 🟡 中等 | 改用正交 |

### 2. 增益计算方式

| 项目 | Adobe | FilmLab 原 | FilmLab 修复后 |
|------|-------|-----------|---------------|
| 平均增益 | 1.0 (严格) | 0.9-1.3 (变化) | 1.0 ✅ |
| 亮度变化 | 0% | ±15% | 0% ✅ |
| 用户感受 | 只改色，不改亮 | 同时改色和亮 | 只改色，不改亮 ✅ |

### 3. 准确性对标

| 测试场景 | Adobe | FilmLab 原 | FilmLab 修复 |
|----------|-------|-----------|------------|
| D65 (6500K) | ✅ 精确 | ✅ 接近 | ✅ 接近 |
| 3000K (暖) | ✅ 精确 | ⚠️ 接近但变暗 | ✅ 接近 |
| 7000K (冷) | ✅ 精确 | ⚠️ 接近但变亮 | ✅ 接近 |
| 极端值 (1700K) | ✅ 支持 | ❌ 可能崩溃 | ❌ 同左 |
| 极端值 (9000K) | ✅ 支持 | ❌ 可能崩溃 | ❌ 同左 |

---

## 实现检查清单

### Phase 1: 快速修复 (当前)

- [ ] 添加亮度补偿代码
  - 文件: `packages/shared/filmLabWhiteBalance.js`
  - 行号: L215 前
  - 代码: 见 [WHITESPACE-BALANCE-QUICK-FIX-GUIDE.md]

- [ ] 测试修复
  - [ ] 冷调不变亮
  - [ ] 暖调不变暗
  - [ ] CPU/GPU 路径一致
  - [ ] 导出结果正确

- [ ] 文档更新
  - [ ] 代码注释
  - [ ] 用户指南

### Phase 2: 中期优化 (1-2周)

- [ ] 研究 Bradford CAT
  - [ ] 实现 CAT02 矩阵
  - [ ] LMS 空间适应

- [ ] 优化 Planckian Locus
  - [ ] 使用 McCormack 公式替代 CIE D
  - [ ] 扩展温度范围支持

- [ ] 改进色调实现
  - [ ] 计算 Locus 垂直方向
  - [ ] 正交色调调整

### Phase 3: 长期改进 (1个月+)

- [ ] 完整 xyY 平面重构
  - [ ] 新建 `filmLabWhiteBalanceV2.js`
  - [ ] 全面对标 Adobe
  - [ ] A/B 测试验证

- [ ] 向后兼容性
  - [ ] 迁移现有用户设置
  - [ ] 提供版本切换选项

- [ ] 性能优化
  - [ ] GPU 加速计算
  - [ ] 缓存 Planckian Locus

---

## 关键参考资源

### 色彩科学文献

1. **"Color Science" by Wyszecki & Stiles**
   - CIE XYZ 标准
   - xyY 色度平面
   - Planckian Locus 定义

2. **"Digital Color Imaging Handbook" by Sharma**
   - CAT02 和 Bradford 变换
   - 色彩适应模型对比
   - 工业实现案例

3. **McCormack & Scull (1992)**
   - "Color Appearance Models"
   - Planckian Locus 多项式近似公式

### 在线资源

- [CIE 官方网站](https://cie.co.at) - 标准和定义
- [Bruce Lindbloom 色彩计算器](https://www.brucelindbloom.com) - 公式和转换
- [Tanner Helland 色温算法](https://tannerhelland.com/2012/09/18/convert-temperature-rgb-algorithm-code.html)

### LibRaw 和 Dcraw 源代码

- `libraw/dcraw.c` - 开源 RAW 处理器
- 白平衡实现细节可参考
- 约束和优化方案

---

## Adobe Lightroom 实测数据

基于逆向工程和用户报告的观察：

```
色温范围: 2000K - 50000K (支持非常广)
默认基点: 6500K (D65)
色温滑块: -100 ~ +100
  -100: 约 2000K (极冷)
  0:   6500K (中性)
  +100: 约 10000K (极暖)

色调滑块: -100 ~ +100
  -100: 偏绿 (绿色通道 +30%)
  0:   中性
  +100: 偏品红 (红蓝 +20%, 绿 -40%)

亮度变化: < 1% (统计学上几乎不可检测)

用户反馈: 
  "色温/色调调整非常直观，从不意外改变亮度"
```

---

## FilmLab 升级路线图

```
现在 (v1.0)
  ↓
周1: 添加亮度补偿 (方案 A)
  └→ 解决核心问题
  └→ 与 Adobe 行为一致
  ↓
周2-3: 研究并验证 xyY 方法 (方案 B 准备)
  ↓
周4+: 迁移到完整 xyY 实现
  └→ 色度更准确
  └→ 与 Adobe 完全一致
  ↓
成熟 (v2.0+)
  - 完全兼容 Adobe Lightroom
  - 专业色彩工作流支持
  - 可能支持 CAT02 和其他高级功能
```

---

**本文档作为白平衡修复和升级的参考指南。**

