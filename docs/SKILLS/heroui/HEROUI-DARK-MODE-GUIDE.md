# HeroUI 深色模式配置指南

## 概述

HeroUI 使用 **class-based** 深色模式策略，通过在 HTML 根元素上添加 `.dark` 类来切换主题。这与 Tailwind CSS 的 dark mode 机制配合工作。

---

## 配置方式

### 1. Tailwind CSS 配置

对于 Tailwind CSS v4，需要在 CSS 文件中配置 dark mode 变体：

```css
/* tailwind.css 或全局 CSS */
@import "tailwindcss";

/* 配置 class-based 深色模式 */
@variant dark (&:where(.dark, .dark *));
```

对于 Tailwind CSS v3，在 `tailwind.config.js` 中配置：

```javascript
// tailwind.config.js
module.exports = {
  darkMode: "class", // 使用 class 策略
  // ...其他配置
};
```

### 2. HeroUI Provider 配置

在应用根组件中配置 HeroUIProvider：

```jsx
import { HeroUIProvider } from "@heroui/react";

function App({ children }) {
  return (
    <HeroUIProvider>
      {children}
    </HeroUIProvider>
  );
}
```

### 3. 主题切换

使用 `next-themes` 或类似库管理主题状态：

```jsx
import { ThemeProvider } from "next-themes";

function MyApp({ children }) {
  return (
    <ThemeProvider attribute="class" defaultTheme="system">
      <HeroUIProvider>
        {children}
      </HeroUIProvider>
    </ThemeProvider>
  );
}
```

---

## "Split Brain" 问题及解决

### 问题描述

当系统中存在多套独立的深色模式样式系统时，可能出现：
- HeroUI 组件响应 `.dark` 类
- Tailwind CSS 响应 `data-theme` 属性
- 自定义 CSS 响应媒体查询

这导致组件之间深色模式状态不同步，称为 "Split Brain" 问题。

### 解决方案

**统一使用 class-based 策略：**

1. 确保 HTML 根元素使用 `class="dark"` 而非 `data-theme="dark"`
2. Tailwind 使用 `@variant dark` 配置
3. 自定义 CSS 使用 `.dark` 选择器

```css
/* ✅ 正确：使用 .dark 选择器 */
.dark .my-element {
  background-color: #1f1f1f;
}

/* ❌ 错误：使用 data-theme 属性选择器 */
[data-theme="dark"] .my-element {
  background-color: #1f1f1f;
}
```

---

## HeroUI 暗色模式颜色层次结构

### 官方设计 vs 本项目定制

HeroUI 官方暗色模式使用纯黑 (`#000000`) 作为背景，但这会导致界面元素与背景对比过于强烈。本项目采用 **zinc-900 (#18181b)** 作为统一基础背景色，创造更协调的视觉效果。

### 颜色层次对照表

| 层级 | 用途 | 暗色模式 | 亮色模式 |
|------|------|----------|----------|
| **background** | 主背景/侧边栏 | `#18181b` (zinc-900) | `#ffffff` (white) |
| **surface** | 卡片/面板容器 | `#27272a` (zinc-800) | `#f4f4f5` (zinc-100) |
| **elevated** | 图标容器/按钮 | `#3f3f46` (zinc-700) | `#e4e4e7` (zinc-200) |
| **divider** | 分隔线（淡化） | `#3f3f46/50` | `#e4e4e7/50` |

### 设计原则

1. **统一背景**: 主背景与侧边栏使用相同颜色
2. **无边框卡片**: 卡片使用与背景一致的颜色，通过微妙的阴影区分层次
3. **层次递进**: 使用 zinc 色阶创造视觉层次，而非边框

### 配置位置

CSS 变量在 `client/src/styles/variables.css` 中定义：

```css
[data-theme="dark"] {
  /* 基础背景使用 zinc-900 而非纯黑 */
  --heroui-background: 24 24 27; /* #18181b */
  --heroui-content1: 39 39 42;   /* #27272a */
  --heroui-content2: 63 63 70;   /* #3f3f46 */
  --heroui-content3: 82 82 91;   /* #52525b */
  --heroui-content4: 113 113 122; /* #71717a */
}
```

全局 CSS 覆盖在 `client/src/styles.css`：

```css
/* 统一使用 zinc-900 作为基础背景 */
html.dark body, 
html.dark #root,
html.dark .app-shell {
  background-color: #18181b; /* Zinc 900 */
}

html.dark .main {
  background-color: #18181b; /* 与 sidebar 一致 */
}
```

### 为什么要定制？

1. **视觉协调**: 纯黑背景与 zinc-900 的侧边栏形成突兀对比
2. **层次感**: 统一基础后，卡片和面板可以使用更深的 content1 色
3. **护眼**: zinc-900 比纯黑更柔和，减少屏幕对比度
4. **一致性**: macOS/Windows 11 的暗色主题也使用深灰而非纯黑

---

## HeroUI 语义颜色类

HeroUI 提供一系列语义化颜色类，它们会自动响应深色模式：

### 背景色

| 类名 | 亮色模式 | 深色模式 |
|------|---------|---------|
| `bg-default` | 灰色背景 | 深灰背景 |
| `bg-default-100` | 浅灰 | 深灰 |
| `bg-default-200` | 中灰 | 中深灰 |
| `bg-content1` | 白色 | 深色 |
| `bg-content2` | 浅灰 | 深灰 |

### 文字色

| 类名 | 亮色模式 | 深色模式 |
|------|---------|---------|
| `text-foreground` | 深色文字 | 浅色文字 |
| `text-default-500` | 中灰文字 | 中灰文字 |
| `text-default-700` | 深灰文字 | 浅灰文字 |

### 问题：语义类可能不响应

如果 `.dark` 类配置不正确，这些语义颜色类可能不会切换。解决方案：

1. 验证 `html` 或 `body` 元素有 `class="dark"`
2. 使用显式的 Tailwind dark 变体作为后备：
   ```jsx
   className="bg-default-100 dark:bg-zinc-800"
   ```

---

## 全局样式覆盖

### data-slot 选择器覆盖

HeroUI 组件使用 `data-slot` 属性标记各个 slot，可以用全局 CSS 统一覆盖：

```css
/* 强制所有 slot 背景透明 */
[data-slot="base"],
[data-slot="mainWrapper"],
[data-slot="inputWrapper"],
[data-slot="innerWrapper"],
[data-slot="trigger"],
[data-slot="input"] {
  background-color: transparent !important;
  background: transparent !important;
  box-shadow: none !important;
}

/* 深色模式下的 slot 覆盖 */
.dark [data-slot="base"],
.dark [data-slot="mainWrapper"],
.dark [data-slot="inputWrapper"],
.dark [data-slot="innerWrapper"],
.dark [data-slot="trigger"],
.dark [data-slot="input"] {
  background-color: transparent !important;
  background: transparent !important;
  box-shadow: none !important;
}
```

---

## 调试深色模式

### 检查清单

1. **HTML 根元素**: 检查 `<html>` 或 `<body>` 是否有 `class="dark"`
2. **Tailwind 配置**: 确认 `@variant dark` 或 `darkMode: "class"` 配置正确
3. **CSS 变量**: 检查 HeroUI CSS 变量是否在 `.dark` 下正确定义
4. **组件 classNames**: 确保使用 `dark:` 变体前缀

### 浏览器检查

```javascript
// 在控制台检查深色模式状态
document.documentElement.classList.contains('dark') // 应返回 true
document.body.classList.contains('dark') // 或者检查 body
```

---

## 最佳实践

1. **统一策略**: 全项目使用 class-based 深色模式
2. **显式变体**: 对关键样式同时使用亮色和 `dark:` 变体
3. **语义 + 显式**: `bg-content1 dark:bg-zinc-800`（双重保险）
4. **全局覆盖**: 使用 `[data-slot]` 选择器统一处理组件默认样式
5. **测试两种模式**: 始终在亮色和深色模式下测试 UI

---

## 相关链接

- [HeroUI Dark Mode 文档](https://www.heroui.com/docs/customization/dark-mode)
- [HeroUI Theme 文档](https://www.heroui.com/docs/customization/theme)
- [next-themes 库](https://github.com/pacocoursey/next-themes)
