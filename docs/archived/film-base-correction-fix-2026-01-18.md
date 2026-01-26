# 片基去除功能修复方案

**日期**: 2026-01-18  
**问题**: 片基去除 (Film Base Removal) 功能被后续操作覆盖

---

## 1. 问题分析

### 1.1 当前实现缺陷

当前 `handleAutoBase` 函数计算片基校正增益后，直接写入标准白平衡状态 (`red`, `green`, `blue`)：

```javascript
// FilmLab.jsx - handleAutoBase (当前实现)
setRed(255 / safeR);
setGreen(255 / safeG);
setBlue(255 / safeB);
setTemp(0);
setTint(0);
```

**问题 1: 状态覆盖**
- 用户后续调整色温 (Temp) 或色调 (Tint) 时，会通过 `computeWBGains` 重新计算增益
- 这会覆盖或干扰之前设置的片基校正值

**问题 2: 物理模型错误**
- 片基校正应在**反转前**应用（对负片原始扫描数据进行校正）
- 当前白平衡增益在**反转后**应用
- 这导致校正逻辑与胶片密度模型不符

### 1.2 处理流水线对比

| 步骤 | 当前顺序 | 正确顺序 |
|------|----------|----------|
| 1 | Film Curve | Film Curve |
| 2 | Inversion | **Base Correction** ← 新增 |
| 3 | White Balance | Inversion |
| 4 | Tone Mapping | White Balance |
| 5 | Curves | Tone Mapping |
| 6 | HSL | Curves |
| 7 | Split Toning | HSL |
| 8 | 3D LUT | Split Toning |
| 9 | - | 3D LUT |

---

## 2. 解决方案

### 2.1 核心思路

1. **分离状态**: 新增 `baseRed`, `baseGreen`, `baseBlue` 独立于标准白平衡
2. **调整流水线**: 在反转 (Inversion) 之前应用片基校正
3. **统一所有链路**: 确保 CPU/WebGL/GPU Export 使用相同顺序

### 2.2 影响范围

| 文件 | 修改内容 |
|------|----------|
| `FilmLab.jsx` | 添加 baseGains 状态，修改 handleAutoBase，更新所有导出调用 |
| `RenderCore.js` | 添加 baseGains 到参数规范化和 processPixel |
| `FilmLabWebGL.js` | 添加 u_baseGains uniform，更新着色器 |
| `filmLabConstants.js` | 添加 DEFAULT_BASE_GAINS 常量 |
| `server/routes/filmlab.js` | 更新服务端处理逻辑 (如有) |

---

## 3. 详细实现

### 3.1 FilmLab.jsx 修改

#### 3.1.1 新增状态

```javascript
// 片基校正增益 (Pre-Inversion, 独立于场景白平衡)
const [baseRed, setBaseRed] = useState(1.0);
const [baseGreen, setBaseGreen] = useState(1.0);
const [baseBlue, setBaseBlue] = useState(1.0);
```

#### 3.1.2 修改 handleAutoBase

```javascript
const handleAutoBase = () => {
  // ... 采样逻辑保持不变 ...
  
  // 更新片基校正增益（而非标准白平衡）
  setBaseRed(255 / safeR);
  setBaseGreen(255 / safeG);
  setBaseBlue(255 / safeB);
  
  // 不再重置 Temp/Tint，因为片基校正与场景白平衡独立
};
```

#### 3.1.3 更新 webglParams

```javascript
const webglParams = React.useMemo(() => {
  // ...
  return {
    // 新增片基增益
    baseGains: [baseRed, baseGreen, baseBlue],
    // 其他参数保持不变
    inverted: effectiveInvertedValue,
    // ...
  };
}, [baseRed, baseGreen, baseBlue, /* 其他依赖 */]);
```

#### 3.1.4 更新 currentParams (用于预设保存)

```javascript
const currentParams = React.useMemo(() => ({
  // 新增
  baseRed, baseGreen, baseBlue,
  // 其他参数保持不变
  inverted, inversionMode, /* ... */
}), [baseRed, baseGreen, baseBlue, /* 其他依赖 */]);
```

#### 3.1.5 更新 savePreset / applyPreset

保存时包含 `baseRed`, `baseGreen`, `baseBlue`；
加载时恢复这些值（默认 1.0 以兼容旧预设）。

#### 3.1.6 更新导出函数

所有导出路径 (`handleHqExport`, `handleGpuExport`, `handleDownload`) 需传递 `baseRed/Green/Blue`。

### 3.2 RenderCore.js 修改

#### 3.2.1 normalizeParams 添加默认值

```javascript
normalizeParams(input) {
  return {
    // 片基校正 (Pre-Inversion)
    baseRed: input.baseRed ?? 1.0,
    baseGreen: input.baseGreen ?? 1.0,
    baseBlue: input.baseBlue ?? 1.0,
    // 其他参数...
  };
}
```

#### 3.2.2 processPixel 调整流水线

```javascript
processPixel(r, g, b) {
  const p = this.params;
  const luts = this.luts || this.prepareLUTs();

  // ① 胶片曲线 (Film Curve)
  if (p.inverted && p.filmCurveEnabled && p.filmCurveProfile) {
    // ...existing code...
  }

  // ② 片基校正 (Base Correction) - 新增！
  if (p.inverted) {
    r *= p.baseRed;
    g *= p.baseGreen;
    b *= p.baseBlue;
    r = this._clamp255(r);
    g = this._clamp255(g);
    b = this._clamp255(b);
  }

  // ③ 反转 (Inversion)
  if (p.inverted) {
    r = applyInversion(r, p);
    g = applyInversion(g, p);
    b = applyInversion(b, p);
  }

  // ④ 3D LUT (已移至此处)
  // ⑤ 白平衡 (White Balance) - 原 ③
  // ...后续步骤保持不变...
}
```

#### 3.2.3 getGLSLUniforms 添加输出

```javascript
getGLSLUniforms() {
  return {
    // 片基校正
    u_baseGains: [p.baseRed, p.baseGreen, p.baseBlue],
    // 其他 uniforms...
  };
}
```

### 3.3 FilmLabWebGL.js 修改

#### 3.3.1 添加 Uniform 声明

```glsl
uniform vec3 u_baseGains; // 片基校正增益 (Pre-Inversion)
```

#### 3.3.2 更新 main() 函数

```glsl
void main() {
  vec4 tex = texture2D(u_image, v_uv);
  vec3 col = tex.rgb;

  // ① Film Curve (before inversion)
  if (u_inverted == 1 && u_filmCurveEnabled == 1) {
    col.r = applyFilmCurve(col.r);
    col.g = applyFilmCurve(col.g);
    col.b = applyFilmCurve(col.b);
  }

  // ② Base Correction (NEW! - before inversion)
  if (u_inverted == 1) {
    col = col * u_baseGains;
    col = clamp(col, 0.0, 1.0);
  }

  // ③ Invert if enabled
  if (u_inverted == 1) {
    // ...existing inversion code...
  }
  
  // ④ Apply gains (White Balance) - 原来的步骤
  // ...后续步骤保持不变...
}
```

#### 3.3.3 添加 Uniform Location 获取和设置

```javascript
locs.u_baseGains = gl.getUniformLocation(program, 'u_baseGains');
// ...
const baseGains = params.baseGains || [1.0, 1.0, 1.0];
gl.uniform3fv(locs.u_baseGains, new Float32Array(baseGains));
```

### 3.4 常量定义

在 `filmLabConstants.js` 中添加：

```javascript
const DEFAULT_BASE_GAINS = {
  baseRed: 1.0,
  baseGreen: 1.0,
  baseBlue: 1.0,
};
```

---

## 4. 各链路一致性检查

| 链路 | 入口函数 | 片基校正位置 | 状态 |
|------|----------|--------------|------|
| CPU 预览 | `RenderCore.processPixel` | ② Film Curve 之后, Inversion 之前 | ✅ |
| WebGL 预览 | `FilmLabWebGL.processImageWebGL` | Shader main() 中 | ✅ |
| CPU 导出 (Save As) | `downloadClientJPEG` → `RenderCore` | 同 CPU 预览 | ✅ |
| GPU 导出 | `handleGpuExport` → Electron GPU | 需传递 baseGains | ✅ |
| HQ 导出 (服务端) | `handleHqExport` → API | 需传递 baseGains | ✅ |
| 预设保存/加载 | `savePreset` / `applyPreset` | 包含 baseGains | ✅ |

---

## 5. 向后兼容性

- **旧预设**: 不包含 `baseRed/Green/Blue`，默认值 `1.0` 保持原有行为
- **数据库记录**: 旧记录缺少字段，使用默认值
- **API**: 服务端需处理可选参数

---

## 6. 测试要点

1. **Auto Base 功能**: 使用典型橙色片基负片测试，验证色偏消除
2. **手动调整不冲突**: 调整 Temp/Tint 后，片基校正应保持有效
3. **预设保存/加载**: 验证 baseGains 正确持久化
4. **导出一致性**: CPU/WebGL/GPU 三条路径输出应一致
5. **正片模式**: 确保正片模式下片基校正不生效（因为不反转）

---

## 7. 文件修改清单

1. ✅ `client/src/components/FilmLab/FilmLab.jsx`
   - 新增 `baseRed`, `baseGreen`, `baseBlue` 状态
   - 修改 `handleAutoBase` 使用独立的片基增益
   - 更新 `webglParams`、`currentParams` 包含 baseGains
   - 更新 `savePreset`/`applyPreset` 持久化 baseGains
   - 更新所有导出函数传递 baseGains

2. ✅ `packages/shared/render/RenderCore.js`
   - `normalizeParams` 添加 `baseRed/Green/Blue` 默认值
   - `processPixel` 在反转前应用片基校正
   - `getGLSLUniforms` 输出 `u_baseGains`

3. ✅ `client/src/components/FilmLab/FilmLabWebGL.js`
   - 着色器添加 `u_baseGains` uniform
   - `main()` 在反转前应用片基校正
   - 添加 uniform location 获取和设置

4. ✅ `packages/shared/filmLabConstants.js`
   - 新增 `DEFAULT_BASE_GAINS` 常量

5. ✅ `packages/shared/index.js`
   - 导出 `DEFAULT_BASE_GAINS`

6. ✅ `electron-gpu/gpu-renderer.js`
   - WebGL2 和 WebGL1 着色器都添加 `u_baseGains`
   - 两个着色器的 main() 都添加片基校正步骤
   - 添加 uniform 设置代码

7. ✅ `server/routes/filmlab.js`
   - 已使用 `RenderCore`，自动获得片基校正支持
