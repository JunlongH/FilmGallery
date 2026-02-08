# FilmLab 黑屏问题诊断报告

**日期**: 2026-02-08  
**症状**: 在 FilmLab 处理 RAW 文件时，调整曲线后点击 Pick WB / Auto WB → **整个窗口（包括侧边栏）全部变黑**  
**日志**: Electron log 和 server-err **无任何报错**

---

## 一、核心结论

**根因：React 组件树未捕获异常 → 整棵 React 树卸载 → 窗口显示 Electron 的 `backgroundColor: #000000`**

这不是图像渲染变暗，而是整个 React UI 崩溃后被移除，露出了 Electron BrowserWindow 的黑色底色。

---

## 二、崩溃链路分析

### 2.1 完整崩溃流程

```
用户调整曲线 (curves)
  → 用户点击 Auto WB 或 Pick WB
    → handleAutoColor() / handleCanvasClick() 采样渲染画布
      → solveTempTintFromSample() 计算 temp/tint（这一步本身安全）
        → setTemp(solved.temp) + setTint(solved.tint) 触发 React 状态更新
          → webglParams useMemo 重新计算（包含新的 gains + 现有曲线）
            → useEffect 触发 requestAnimationFrame → processImage()
              → processImageWebGL() 执行（被 try/catch 包裹 ✅）
                → 但 try/catch 之外的 ctx.getImageData() ❌ 无保护！
                  → 如果 canvas 尺寸异常或 WebGL 上下文丢失后 drawImage 失败
                    → getImageData() 或后续代码抛出异常
                      → 异常在 requestAnimationFrame 回调中传播
                        → ❌ 全局无 React Error Boundary
                          → React 18 卸载整棵组件树
                            → .iv-overlay (覆盖全屏的 div) 被移除
                              → 用户看到 BrowserWindow 的 backgroundColor: #000000
                                → 黑屏（包括侧边栏、所有 UI）
```

### 2.2 关键代码位置

| 步骤 | 文件 | 行号 | 问题 |
|------|------|------|------|
| Auto WB 采样 | `FilmLab.jsx` | L1341-1410 | 从已渲染画布采样，包含曲线效果 |
| Pick WB 采样 | `FilmLab.jsx` | L888-931 | 同上 |
| WebGL try/catch | `FilmLab.jsx` | L1009-1082 | ✅ WebGL 渲染本身有保护 |
| **getImageData 未保护** | `FilmLab.jsx` | **L1109** | ❌ `ctx.getImageData(0, 0, canvas.width, canvas.height)` 在 try/catch **外部** |
| 直方图循环 | `FilmLab.jsx` | L1140-1162 | 如果 data 为异常值也可能抛异常 |
| **无 Error Boundary** | `index.js` | L10 | `createRoot(...).render(<App />)` — 裸渲染，无任何错误边界 |
| **Electron 黑底色** | `electron-main.js` | L430 | `backgroundColor: '#000000'` |
| **仅日志无恢复** | `electron-main.js` | L492-493 | `on('crashed', () => LOG('renderer crashed'))` — 只记录不恢复 |

---

## 三、根因验证：五个关键证据

### 证据 1：全局无 React Error Boundary

搜索整个代码库：
- `ErrorBoundary` — **0 结果**
- `componentDidCatch` — **0 结果**  
- `getDerivedStateFromError` — **0 结果**

这意味着 React 中 **任何** 未捕获的异常都会导致整棵组件树卸载。

### 证据 2：processImage 的 try/catch 存在缝隙

```javascript
// FilmLab.jsx L1009-1082: WebGL 渲染 — 有 try/catch ✅
try {
    processImageWebGL(webglCanvas, image, { ... });
    webglSuccess = true;
} catch(e) {
    webglSuccess = false;
    console.error("WebGL failed", e);
}

// L1109: 直方图读取 — 无 try/catch ❌
if (!webglSuccess || !isRotating) {
    imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);  // 💥 可能抛出
    data = imageData.data;
}
```

当 `canvas.width` 或 `canvas.height` 为 0（WebGL 上下文丢失后 `sourceForDraw.width` 可能为 0），`getImageData` 会抛出 `IndexSizeError`。

### 证据 3：Electron 窗口底色为纯黑

```javascript
// electron-main.js L430
backgroundColor: '#000000',
```

React 树卸载后，`.iv-overlay`（覆盖全屏、`z-index: 10000` 的深黑色背景 div）被移除，露出 BrowserWindow 的 `#000000` 底色。

### 证据 4：iv-overlay 覆盖全屏

```css
/* styles.css L621 */
.iv-overlay {
  position: fixed;
  top: 0; left: 0; right: 0; bottom: 0;
  background: rgba(0, 0, 0, 0.95);
  z-index: 10000;
}
```

FilmLab 的顶层 div 使用 `iv-overlay` 类覆盖整个窗口。当 React 崩溃时，这个 div 和它包含的所有子元素（侧边栏、画布、控件）一起被移除。

### 证据 5：无全局错误处理

- 客户端无 `window.onerror` 或 `window.onunhandledrejection`
- 服务端有 `process.on('unhandledRejection')` 但客户端没有
- Electron `mainWindow.webContents.on('crashed')` 只记日志不恢复
- 无 `render-process-gone` 事件处理

---

## 四、为什么只在 "RAW + 曲线 + WB" 组合下触发？

### 4.1 条件分析

1. **RAW 文件**：通过服务端解码 (libraw)，生成的代理图像可能有特殊尺寸或色深特征
2. **调整曲线**：创建陡峭的 per-channel 曲线 LUT，改变渲染后画布的颜色分布
3. **Auto/Pick WB**：从曲线后的画布采样 → `solveTempTintFromSample` 可能返回极端 temp/tint 值
4. **重渲染**：极端 WB gains + 陡峭曲线 → WebGL 渲染异常 → 后续代码可能触发异常

### 4.2 最可能的异常触发点

**场景 A：WebGL 上下文丢失**
- RAW 文件通常尺寸较大，占用更多 GPU 内存
- 频繁修改曲线 + WB 导致 WebGL 纹理反复创建
- GPU 资源耗尽 → WebGL 上下文静默丢失（`gl.isContextLost() === true`）
- 无 `webglcontextlost` 事件监听 → 上下文丢失无法感知
- `processImageWebGL` 的 WebGL 调用返回空结果或 0×0 画布
- 后续 `ctx.drawImage(webglCanvas, 0, 0)` 静默失败或画布尺寸异常
- `ctx.getImageData(0, 0, 0, 0)` → 抛出 `IndexSizeError`

**场景 B：processImageWebGL 内部 throw 未被正确捕获**
- `processImageWebGL` 内部有多处 `throw new Error(...)`:
  - L42: `'Shader compile error: ' + msg`
  - L57: `'Program link error: ' + msg`
  - L108: `'WebGL not available'`
- 这些 `throw` **在** `FilmLab.jsx` 的 `try/catch` 范围内 ✅，正常会被捕获
- **但如果** shader 缓存 (`cache.program`) 被复用，在某些边缘情况下 `program` 无效但不触发 throw → WebGL 静默失败 → 后续 drawImage/getImageData 异常

**场景 C：requestAnimationFrame 回调中的异常**
- `processImage()` 在 `requestAnimationFrame` 回调中执行
- RAF 回调中的异常不会被 React 的常规错误捕获机制拦截
- React 18 对 `useEffect` 清理函数和渲染阶段有错误捕获，但 RAF 回调被视为"外部"
- 这解释了为什么 **日志中没有错误** — 异常被 Chromium 吞掉或只在 DevTools console 中显示

---

## 五、为什么 Electron log 和 server-err 无报错？

| 日志类型 | 原因 |
|----------|------|
| `electron-main.log` | 只记录 `crashed`/`did-fail-load` 事件。React 组件树卸载不会触发这些事件 — 渲染进程并未崩溃，只是 DOM 被清空了 |
| `server-err.log` | 服务端完全不涉及客户端 UI 渲染，WB 计算在客户端完成 |
| DevTools Console | **这里很可能有错误**，但用户可能未检查。错误会显示为红色的 `Uncaught Error` 或 `Uncaught DOMException` |

---

## 六、推荐修复方案（按优先级排序）

### P0 — 添加全局 React Error Boundary（防止全窗口黑屏）

在 `App.js` 或 `index.js` 中添加 Error Boundary，确保即使子组件崩溃也不会导致全窗口黑屏。

**影响范围**: `client/src/App.js` 或新建 `client/src/components/ErrorBoundary.js`

### P1 — 为 processImage 添加顶层 try/catch

将 `processImage()` 函数体包裹在 try/catch 中，特别是 L1109 的 `getImageData` 调用。

**影响范围**: `client/src/components/FilmLab/FilmLab.jsx` L980-1250

```javascript
// 示意 — 在 processImage 最外层包裹
const processImage = () => {
  try {
    // ... 现有全部代码 ...
  } catch (err) {
    console.error('[FilmLab] processImage error:', err);
    // 不让异常传播到 React
  }
};
```

### P2 — 添加 WebGL 上下文丢失处理

在 `FilmLabWebGL.js` 中添加 `webglcontextlost` / `webglcontextrestored` 事件监听。

**影响范围**: `client/src/components/FilmLab/FilmLabWebGL.js`

### P3 — Electron 崩溃恢复

在 `electron-main.js` 中：
- `on('crashed')` → 自动 reload
- 添加 `on('render-process-gone')` 事件处理
- 添加 `on('unresponsive')` 事件处理

**影响范围**: `electron-main.js` L492

### P4 — 客户端全局错误处理

在 `index.js` 中添加 `window.onerror` 和 `window.onunhandledrejection`，至少记录日志。

**影响范围**: `client/src/index.js`

---

## 七、验证方法

如果用户希望确认诊断，可以：

1. **打开 DevTools Console**（开发模式下自动打开，或按 `Ctrl+Shift+I`）
2. 复现操作：RAW 文件 → 调整曲线 → 点击 Auto WB / Pick WB
3. 观察 Console 中是否出现红色 `Uncaught Error` 或 `Uncaught DOMException`
4. 如果看到错误，截图发送即可确认

---

## 八、总结

| 项目 | 状态 |
|------|------|
| 根因 | React 组件树未捕获异常导致整棵树卸载 |
| 异常源 | `processImage()` 中 `getImageData` 在 try/catch 外 + 无 WebGL 上下文丢失处理 |
| 为何只在特定条件下触发 | RAW (大图) + 曲线 (改变色彩分布) + WB (极端增益重渲染) → 边缘情况触发 |
| 为何无日志 | React 树卸载不是渲染进程崩溃，Electron 和服务端无法感知 |
| 最关键修复 | 添加 React Error Boundary（P0）+ processImage try/catch（P1） |
