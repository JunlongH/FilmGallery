# HeroUI 输入组件透明背景模式

## 问题背景

HeroUI 的 Input 和 Select 组件默认使用 `variant="flat"`，该变体会自动应用 `bg-default-100` 背景色。在自定义主题场景下，这个默认背景可能与卡片背景产生视觉冲突，导致"背景框与边框错开"的问题。

---

## 变体对比

HeroUI 提供 4 种输入变体：

| 变体 | 特点 | 默认背景 |
|------|------|---------|
| `flat` | 默认变体 | ✅ 有背景 (`bg-default-100`) |
| `bordered` | 仅边框 | ❌ 无背景 |
| `faded` | 淡化效果 | ✅ 有浅背景 |
| `underlined` | 下划线 | ❌ 无背景 |

**推荐**: 使用 `variant="bordered"` 可以避免背景问题，但仍需处理默认阴影。

---

## 透明背景标准模式

### 核心原则

1. **所有 slots 都设置透明**: 防止层叠背景
2. **使用边框而非背景区分**: 视觉清晰
3. **移除默认阴影**: 避免 shadow-xs 造成的暗边
4. **固定高度**: 保持一致性

### Input 标准 classNames (配合 variant="bordered")

当使用 `variant="bordered"` 时，组件自带边框，**不需要**在 classNames 中重复添加 `border` 类，否则会导致双重边框或样式冲突。

```javascript
const inputClassNames = {
  base: "bg-transparent",
  mainWrapper: "bg-transparent",
  // 关键：移除 border 类，仅处理阴影和尺寸
  inputWrapper: [
    "h-10",
    "min-h-10",
    "bg-transparent",
    "shadow-none",
  ].join(" "),
  innerWrapper: "bg-transparent",
  input: "text-zinc-900 dark:text-zinc-100",
};
```

### Select 标准 classNames (配合 variant="bordered")

```javascript
const selectClassNames = {
  base: "bg-transparent",
  trigger: [
    "h-10",
    "min-h-10", 
    "bg-transparent",
    "shadow-none", // 移除 border 类
  ].join(" "),
  innerWrapper: "bg-transparent",
  value: "text-zinc-900 dark:text-zinc-100",
  popoverContent: "bg-white dark:bg-zinc-800",
  listbox: "bg-transparent",
};
```

---

## 全局 CSS 覆盖方案

当需要统一处理所有 HeroUI 组件时，可在全局 CSS 中添加：

```css
/* ============================================
   HeroUI 组件透明背景覆盖
   ============================================ */

/* 所有 data-slot 元素强制透明 */
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

/* 深色模式同理 */
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

## 常见问题及解决

### 问题 1: 输入框有奇怪的"黑框"

**原因**: `inputWrapper` slot 默认有背景色和阴影

**解决**: 
```jsx
inputWrapper: "bg-transparent shadow-none"
```

### 问题 2: 深色模式下边框和背景分离

**原因**: 只设置了 `inputWrapper` 透明，但 `innerWrapper` 或 `base` 有背景

**解决**: 确保所有相关 slots 都设置透明
```jsx
{
  base: "bg-transparent",
  mainWrapper: "bg-transparent",
  inputWrapper: "bg-transparent ...",
  innerWrapper: "bg-transparent",
}
```

### 问题 3: Select 弹出层背景不正确

**原因**: `popoverContent` slot 需要单独设置

**解决**:
```jsx
popoverContent: "bg-white dark:bg-zinc-800"
```

### 问题 4: 悬浮/聚焦时出现背景

**原因**: HeroUI 的交互状态有默认样式

**解决**: 使用 `!important` 或更具体的选择器覆盖

---

## 组件复用模式

### 创建包装组件

```jsx
// components/ui/FormInput.jsx
import { Input } from "@heroui/react";

const formInputClassNames = {
  base: "bg-transparent",
  mainWrapper: "bg-transparent",
  inputWrapper: "h-10 min-h-10 bg-transparent border border-zinc-300 dark:border-zinc-600 shadow-none",
  innerWrapper: "bg-transparent",
  input: "text-zinc-900 dark:text-zinc-100",
};

export function FormInput({ classNames, ...props }) {
  return (
    <Input
      variant="bordered"
      classNames={{
        ...formInputClassNames,
        ...classNames,
      }}
      {...props}
    />
  );
}
```

### 使用共享配置

```javascript
// config/heroui-classnames.js
export const inputClassNames = {
  base: "bg-transparent",
  mainWrapper: "bg-transparent",
  inputWrapper: "h-10 min-h-10 bg-transparent border border-zinc-300 dark:border-zinc-600 shadow-none",
  innerWrapper: "bg-transparent",
  input: "text-zinc-900 dark:text-zinc-100",
};

export const selectClassNames = {
  base: "bg-transparent",
  trigger: "h-10 min-h-10 bg-transparent border border-zinc-300 dark:border-zinc-600 shadow-none",
  innerWrapper: "bg-transparent",
  value: "text-zinc-900 dark:text-zinc-100",
  popoverContent: "bg-white dark:bg-zinc-800",
};

// 使用
import { inputClassNames, selectClassNames } from "@/config/heroui-classnames";

<Input classNames={inputClassNames} />
<Select classNames={selectClassNames} />
```

---

## 检查清单

在处理 HeroUI 输入组件透明背景时，确认以下项目：

- [ ] `base` slot 设置 `bg-transparent`
- [ ] `mainWrapper` slot 设置 `bg-transparent`
- [ ] `inputWrapper` / `trigger` slot 设置 `bg-transparent shadow-none`
- [ ] `innerWrapper` slot 设置 `bg-transparent`
- [ ] 使用 `border` 类提供视觉边界
- [ ] 深色模式边框使用 `dark:border-zinc-*`
- [ ] 文字颜色设置 `dark:text-zinc-*`
- [ ] Select 的 `popoverContent` 单独设置背景

---

## 相关文档

- [HEROUI-COMPONENT-SLOTS.md](./HEROUI-COMPONENT-SLOTS.md) - Slots 完整参考
- [HEROUI-DARK-MODE-GUIDE.md](./HEROUI-DARK-MODE-GUIDE.md) - 深色模式配置
