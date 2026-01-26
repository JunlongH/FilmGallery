# FilmLab 渲染管线统一化重构

**日期**: 2026-01-16  
**状态**: 进行中  
**目标**: 系统化、模块化解决 WebGL 正片模式显示负片问题，统一五条渲染链路

---

## 一、问题概述

### 1.1 核心问题

1. **WebGL 正片模式显示负片**：当 `sourceType='positive'` 时，由于回退逻辑，可能加载了负片文件
2. **LUT 颜色异常**：LUT 应用位置在管线末端，导致"反转 LUT"类型无法正确工作

### 1.2 五条渲染管线

| 管线 | 位置 | 用途 | 状态 |
|------|------|------|------|
| 1. CPU Preview | `client/FilmLabCPU.js` | 客户端 CPU 预览 | ⚠️ 待验证 |
| 2. WebGL Preview | `client/FilmLabWebGL.js` | 客户端 GPU 预览 | ✅ LUT 已修复 |
| 3. Server Preview | `server/routes/filmlab.js` | 服务端预览 | ⚠️ 待修复 |
| 4. Server Export | `server/routes/photos.js` | 服务端导出 | ⚠️ 待修复 |
| 5. GPU Export | `electron-gpu/gpu-renderer.js` | Electron GPU 导出 | ⚠️ 待修复 LUT |

---

## 二、根因分析

### 2.1 文件路径回退问题

**问题代码** (`ImageViewer.js` 第 108-120 行):
```javascript
case 'positive':
  return img.positive_rel_path || img.full_rel_path || img.negative_rel_path || img.original_rel_path;
```

**问题**: 当 `positive_rel_path` 不存在时，回退到 `negative_rel_path`，导致：
- `sourceType = 'positive'` (用户期望看正片)
- 实际加载的是负片文件
- `inverted = false` (正片模式不反转)
- 结果：负片未反转 = 显示负片

### 2.2 LUT 管线位置问题

**修复前**: LUT 在管线第 8 步（最后）
```
Input → Inversion → Exposure → Contrast → HSL → ... → LUT(Step 8)
```

**修复后**: LUT 在管线第 3 步（反转后立即应用）
```
Input → Inversion → LUT(Step 3) → Exposure → Contrast → HSL → ...
```

---

## 三、修复方案

### 3.1 统一源路径管理模块

创建 `packages/shared/sourcePathResolver.js`:

```javascript
/**
 * 源路径解析器 - 统一管理图片文件路径选择
 * 
 * 核心原则:
 * 1. sourceType 必须与实际加载文件匹配
 * 2. 不允许隐式回退到不同类型的文件
 * 3. 如无匹配文件，返回 null 而非错误类型文件
 */

const SOURCE_TYPE = {
  ORIGINAL: 'original',
  NEGATIVE: 'negative', 
  POSITIVE: 'positive'
};

/**
 * 获取严格匹配的源文件路径
 * 
 * @param {Object} photo - 照片记录
 * @param {string} sourceType - 期望的源类型
 * @param {Object} options - 选项
 * @param {boolean} options.allowFallback - 是否允许回退 (默认 false)
 * @returns {{ path: string|null, actualType: string, matched: boolean }}
 */
function getStrictSourcePath(photo, sourceType, options = {}) {
  const { allowFallback = false } = options;
  
  // 严格匹配逻辑
  switch (sourceType) {
    case SOURCE_TYPE.POSITIVE:
      if (photo.positive_rel_path) {
        return { path: photo.positive_rel_path, actualType: 'positive', matched: true };
      }
      // 正片模式必须有正片文件
      if (!allowFallback) {
        return { path: null, actualType: null, matched: false };
      }
      break;
      
    case SOURCE_TYPE.NEGATIVE:
      if (photo.negative_rel_path) {
        return { path: photo.negative_rel_path, actualType: 'negative', matched: true };
      }
      if (photo.original_rel_path) {
        return { path: photo.original_rel_path, actualType: 'original', matched: true };
      }
      break;
      
    case SOURCE_TYPE.ORIGINAL:
      if (photo.original_rel_path) {
        return { path: photo.original_rel_path, actualType: 'original', matched: true };
      }
      if (photo.negative_rel_path) {
        return { path: photo.negative_rel_path, actualType: 'negative', matched: true };
      }
      break;
  }
  
  return { path: null, actualType: null, matched: false };
}

/**
 * 根据源类型判断是否需要反转
 * 
 * @param {string} sourceType - 源类型
 * @param {boolean} userInverted - 用户反转设置
 * @returns {boolean}
 */
function getEffectiveInverted(sourceType, userInverted) {
  // 正片模式永远不反转（文件已经是正片）
  if (sourceType === SOURCE_TYPE.POSITIVE) {
    return false;
  }
  // 其他模式遵循用户设置
  return userInverted;
}

module.exports = {
  SOURCE_TYPE,
  getStrictSourcePath,
  getEffectiveInverted
};
```

### 3.2 修复 ImageViewer.js

**修改 `getSourcePathForFilmLab` 函数**:

```javascript
// 严格源路径选择，不允许类型不匹配的回退
const getSourcePathForFilmLab = useCallback((img, sourceType) => {
  if (!img) return null;
  
  switch (sourceType) {
    case 'positive':
      // 正片模式必须有正片文件
      if (img.positive_rel_path) {
        return img.positive_rel_path;
      }
      // 无正片文件时返回 null，不回退到负片
      console.warn('[ImageViewer] Positive mode but no positive file available');
      return null;
      
    case 'negative':
      return img.negative_rel_path || img.original_rel_path;
      
    case 'original':
    default:
      return img.original_rel_path || img.negative_rel_path || img.full_rel_path;
  }
}, []);
```

### 3.3 修复 GPU 渲染器 LUT 顺序

**文件**: `electron-gpu/gpu-renderer.js`

将 LUT 采样移动到反转后立即应用（与 WebGL shader 保持一致）

### 3.4 服务端路由严格化

**文件**: `server/routes/filmlab.js`, `server/routes/photos.js`

添加 sourceType 验证，拒绝类型不匹配的请求

---

## 四、修改清单

### 已完成 ✅

| 文件 | 修改内容 | 日期 |
|------|----------|------|
| `packages/shared/render/RenderCore.js` | LUT 从 Step 8 移动到 Step 3 | 2026-01-16 |
| `client/src/components/FilmLab/FilmLabWebGL.js` | GLSL shader LUT 位置调整 | 2026-01-16 |
| `packages/shared/sourcePathResolver.js` | 创建统一源路径解析模块 | 2026-01-16 |
| `packages/shared/index.js` | 导出 sourcePathResolver 模块 | 2026-01-16 |
| `client/src/components/ImageViewer.js` | 严格源路径选择，阻止跨类型回退 | 2026-01-16 |
| `electron-gpu/gpu-renderer.js` | LUT 从管线末端移动到反转后 | 2026-01-16 |
| `server/routes/filmlab.js` | 使用 getStrictSourcePath 严格验证 | 2026-01-16 |
| `server/routes/photos.js` | export-positive/render-positive 严格验证 | 2026-01-16 |

### 进行中 🔄

无

### 待验证 ⏳

| 项目 | 测试场景 | 状态 |
|------|----------|------|
| WebGL 正片模式 | sourceType=positive, 加载正片文件 | 待测试 |
| LUT 颜色 | 反转 LUT 在反转后立即应用 | 待测试 |
| 服务端渲染 | 正片模式无正片文件时返回错误 | 待测试 |

---

## 五、验证测试

### 5.1 测试用例

| 场景 | 输入 | 预期结果 |
|------|------|----------|
| 正片模式有正片文件 | sourceType=positive, positive_rel_path exists | 加载正片，不反转 |
| 正片模式无正片文件 | sourceType=positive, positive_rel_path=null | 显示错误/禁用 |
| 负片模式 | sourceType=negative | 加载负片，根据 inverted 反转 |
| LUT 应用 | 任意模式 + LUT | LUT 在反转后立即应用 |

### 5.2 管线一致性检查

- [ ] CPU Preview 和 WebGL Preview 输出一致
- [ ] Server Preview 和 Client Preview 输出一致
- [ ] GPU Export 和 Server Export 输出一致
- [ ] 所有管线 LUT 效果一致

---

## 六、回滚方案

如遇问题，可回滚到 commit: `ae1ee1b` (feat: 批量导出系统实现)

```bash
git revert HEAD
```

---

## 七、后续优化

1. 添加源类型不匹配的 UI 提示
2. 自动检测并修正历史数据中的类型标记
3. 添加管线输出一致性自动化测试
