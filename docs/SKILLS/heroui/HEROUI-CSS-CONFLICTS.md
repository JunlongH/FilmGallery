# HeroUI 样式冲突避免指南

## 问题描述

在使用 HeroUI 组件（如 Input, Select, Textarea）时，可能会遇到以下样式问题：
1. **双重边框**：组件显示两层边框，外层可能是系统默认或 Tailwind 重置样式。
2. **背景色异常**：亮色模式下显示深色背景，或透明背景失效。
3. **布局错位**：输入框高度或 padding 不符合预期。

## 根本原因

通常是全局 CSS (如 `styles.css` 或 `forms.css`) 中的通用选择器过于激进，意外命中了 HeroUI 内部的 HTML 元素。

例如，以下 CSS 会破坏 HeroUI 组件：
```css
/* ❌ 错误：这会影响所有 input，包括 HeroUI 内部的 input */
form input {
  border: 1px solid #ccc;
  background: white;
}
```

HeroUI 的 Input 组件结构如下：
```html
<div data-slot="base">
  <div data-slot="input-wrapper"> <!-- HeroUI 边框在这里 -->
    <input data-slot="input" />   <!-- 你的全局 CSS 命中了这里，添加了第二层边框 -->
  </div>
</div>
```

## 解决方案

### 1. 使用 `:not` 排除 HeroUI 组件

修改全局 CSS，排除带有 `data-slot` 属性的元素：

```css
/* ✅ 正确：排除 HeroUI 组件 */
form input:not([data-slot="input"]):not([class*="heroui-"]), 
form select:not([data-slot="select"]):not([class*="heroui-"]), 
form textarea:not([data-slot="input"]):not([class*="heroui-"]) {
  /* 你的全局表单样式 */
  border: 1px solid #ccc;
}
```

### 2. 标准化 classNames 配置

在组件级别，遵循 "Transparent Pattern"（透明模式），依赖 `variant="bordered"` 渲染边框，确保 `classNames` 中**不包含**边框和背景色：

```javascript
/* 标准透明输入框配置 */
const inputClassNames = {
  base: "bg-transparent",
  mainWrapper: "bg-transparent",
  // 仅设置布局和移除阴影，不要设置 border 或 background
  inputWrapper: "h-10 min-h-10 bg-transparent shadow-none",
  innerWrapper: "bg-transparent",
  input: "text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400"
};
```

### 3. Tailwind CSS 强制覆盖

在 `tailwind.css` 中添加高优先级覆盖，确保透明度生效：

```css
@layer utilities {
  [data-slot="input"],
  [data-slot="input-wrapper"],
  [data-slot="trigger"] {
    background-color: transparent !important;
    background: transparent !important;
    box-shadow: none !important;
  }
}
```

## 调试清单

如果不确定样式来源：
1. 使用浏览器开发者工具检查元素。
2. 查看 `Computed` 样式中的 `border` 和 `background-color`。
3. 如果看到 user agent stylesheet 以外的来源（如 `styles.css`），则需要应用上述 `:not` 排除法。
