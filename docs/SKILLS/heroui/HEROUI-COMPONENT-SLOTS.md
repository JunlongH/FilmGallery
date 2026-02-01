# HeroUI 组件 Slots 参考手册

## 概述

HeroUI 组件使用 `slots` 机制来实现精细化样式控制。每个 slot 代表组件的一个可独立样式化的部分，可通过 `classNames` prop 传递 Tailwind CSS 类名来自定义样式。

---

## Input 组件 Slots

Input 组件是表单中最常用的组件之一，具有以下 slots：

### Slot 结构

```
base                    # 输入框最外层包装器
├── label              # 标签文字
├── mainWrapper        # 包装 inputWrapper（仅 outside/outside-left 位置时）
│   ├── inputWrapper   # 包装 label（inside时）和 innerWrapper
│   │   └── innerWrapper    # 包装 input、startContent、endContent
│   │       └── input       # 实际的 input 元素
│   └── clearButton    # 清除按钮
└── helperWrapper      # 包装 description 和 errorMessage
    ├── description    # 描述文字
    └── errorMessage   # 错误信息
```

### 完整 Slots 列表

| Slot | 描述 | 常用自定义场景 |
|------|------|---------------|
| `base` | 输入框最外层包装器 | 对齐、间距、宽度控制 |
| `label` | 标签文字 | 字体、颜色、位置 |
| `mainWrapper` | 包装 inputWrapper | 外部标签时的布局控制 |
| `inputWrapper` | 包装内部内容和标签 | **背景色、边框、圆角** |
| `innerWrapper` | 包装输入和装饰内容 | 内部间距 |
| `input` | 实际的 input 元素 | **文字颜色、字体大小** |
| `clearButton` | 清除按钮 | 按钮样式 |
| `helperWrapper` | 帮助文字包装器 | 间距控制 |
| `description` | 描述文字 | 字体颜色、大小 |
| `errorMessage` | 错误信息 | 错误样式 |

### classNames 使用示例

```jsx
<Input
  label="Email"
  classNames={{
    base: "bg-transparent",
    mainWrapper: "bg-transparent", 
    inputWrapper: "h-10 min-h-10 bg-transparent border border-zinc-300 dark:border-zinc-600 shadow-none",
    innerWrapper: "bg-transparent",
    input: "text-zinc-900 dark:text-zinc-100",
    label: "text-zinc-700 dark:text-zinc-300",
  }}
/>
```

---

## Select 组件 Slots

Select 组件用于下拉选择，具有以下 slots：

### Slot 结构

```
base                      # 最外层包装器
├── label                # 标签
├── mainWrapper          # 主包装器
│   ├── trigger          # 触发器（点击区域）
│   │   ├── innerWrapper # 内容包装器
│   │   │   └── value    # 显示的选中值
│   │   └── selectorIcon # 下拉箭头图标
│   └── endWrapper       # 尾部包装器
│       ├── endContent   # 尾部内容
│       └── clearButton  # 清除按钮
├── helperWrapper        # 帮助文字包装器
│   ├── description      # 描述
│   └── errorMessage     # 错误信息
├── popoverContent       # 弹出层容器
└── listboxWrapper       # 列表包装器
    └── listbox          # 列表组件
```

### 完整 Slots 列表

| Slot | 描述 | 常用自定义场景 |
|------|------|---------------|
| `base` | 最外层包装器 | 宽度、对齐 |
| `label` | 标签 | 字体、颜色 |
| `mainWrapper` | 主包装器 | 布局控制 |
| `trigger` | 触发器 | **背景、边框、高度** |
| `innerWrapper` | 内容包装器 | 内部间距 |
| `value` | 选中值显示 | **文字颜色** |
| `selectorIcon` | 下拉箭头 | 图标颜色 |
| `popoverContent` | 弹出层 | **弹出层背景** |
| `listboxWrapper` | 列表包装器 | 滚动区域 |
| `listbox` | 列表 | 列表样式 |
| `endWrapper` | 尾部包装器 | 布局 |
| `clearButton` | 清除按钮 | 按钮样式 |

### classNames 使用示例

```jsx
<Select
  label="选择类型"
  classNames={{
    base: "bg-transparent",
    trigger: "h-10 min-h-10 bg-transparent border border-zinc-300 dark:border-zinc-600 shadow-none",
    innerWrapper: "bg-transparent",
    value: "text-zinc-900 dark:text-zinc-100",
    popoverContent: "bg-white dark:bg-zinc-800",
    listbox: "bg-transparent",
  }}
>
  <SelectItem key="option1">选项 1</SelectItem>
  <SelectItem key="option2">选项 2</SelectItem>
</Select>
```

---

## 通用样式模式

### 标准表单输入样式（推荐模式）

```javascript
// 通用的 Input classNames
const inputClassNames = {
  base: "bg-transparent",
  mainWrapper: "bg-transparent",
  inputWrapper: "h-10 min-h-10 bg-transparent border border-zinc-300 dark:border-zinc-600 shadow-none",
  innerWrapper: "bg-transparent",
  input: "text-zinc-900 dark:text-zinc-100",
};

// 通用的 Select classNames
const selectClassNames = {
  base: "bg-transparent",
  trigger: "h-10 min-h-10 bg-transparent border border-zinc-300 dark:border-zinc-600 shadow-none",
  innerWrapper: "bg-transparent",
  value: "text-zinc-900 dark:text-zinc-100",
  popoverContent: "bg-white dark:bg-zinc-800",
};
```

### 深色模式考虑

- 背景：使用 `dark:bg-zinc-*` 类
- 边框：使用 `dark:border-zinc-*` 类
- 文字：使用 `dark:text-zinc-*` 类
- 弹出层：必须单独设置 `popoverContent` 的深色背景

---

## 注意事项

1. **完整性**: 必须为所有相关 slots 设置背景透明，否则会出现层叠背景问题
2. **shadow-none**: HeroUI 默认带有 `shadow-xs`，需要显式添加 `shadow-none` 移除
3. **高度控制**: 使用 `h-10 min-h-10` 同时设置固定高度
4. **边框优先**: 使用 `border` 类而不是背景色来区分输入区域

---

## 相关链接

- [HeroUI Input 文档](https://www.heroui.com/docs/components/input)
- [HeroUI Select 文档](https://www.heroui.com/docs/components/select)
- [HeroUI Override Styles](https://www.heroui.com/docs/customization/override-styles)
