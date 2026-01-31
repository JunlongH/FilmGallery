# FilmGallery 可复用组件库参考手册

> **创建日期**: 2026-01-30  
> **版本**: 2.0.0  
> **目标**: 记录所有可复用组件、导入路径和使用方法
> **注意**: 每次完成可复用组件，请写入这个库中。
> **HeroUI手册**：https://www.heroui.com/docs/guide/introduction
---

## 📦 组件库概览

### 基础 UI 组件 (`components/ui/`)

```jsx
// 统一导入
import { 
  Card, PhotoCard, StatCard, CardHeader, CardBody, CardFooter,
  Button, IconButton,
  Skeleton, PhotoSkeleton, TextSkeleton, StatCardSkeleton,
  AnimatedContainer, ANIMATION_PRESETS,
  GlassModal, GlassModalHeader, GlassCard,  // 玻璃态组件
  // 图标 (Lucide React)
  Camera, Film, Heart, Settings, Search, Plus, Edit, Trash2, ...
} from '../components/ui';
```

---

## 🪟 玻璃态模态框 (GlassModal) ⭐ 新增

**文件**: `components/ui/GlassModal.jsx`

### GlassModal - 玻璃态模态框

现代化玻璃态模态框组件，支持模糊背景、动画效果和深色模式。

```jsx
import { GlassModal, GlassCard } from '../components/ui';
import { ShoppingCart } from 'lucide-react';

// 基础用法
<GlassModal
  isOpen={isOpen}
  onClose={handleClose}
  title="Modal Title"
  subtitle="Optional description"
  icon={<ShoppingCart className="w-5 h-5" />}
  footer={
    <div className="flex gap-2">
      <Button variant="flat" onPress={handleClose}>Cancel</Button>
      <Button color="primary" onPress={handleSubmit}>Save</Button>
    </div>
  }
>
  {/* 内容区域 */}
  <GlassCard className="p-4">
    <p>Modal content here...</p>
  </GlassCard>
</GlassModal>
```

### 完整属性

```jsx
<GlassModal
  isOpen={true}               // 是否显示
  onClose={handleClose}       // 关闭回调
  size="lg"                   // 尺寸: 'sm' | 'md' | 'lg' | 'xl' | '2xl' | '3xl' | 'full'
  title="Modal Title"         // 标题
  subtitle="Description"      // 副标题
  icon={<Icon />}             // 标题图标
  footer={<FooterContent />}  // 底部内容
  hideCloseButton={false}     // 是否隐藏关闭按钮
  isDismissable={true}        // 是否可点击遮罩关闭
  scrollBehavior="inside"     // 滚动行为: 'inside' | 'outside'
  className="custom-class"    // 自定义类名
>
  {children}
</GlassModal>
```

### GlassCard - 玻璃态内容卡片

用于模态框内部的玻璃态卡片容器。

```jsx
import { GlassCard } from '../components/ui';

// 基础用法
<GlassCard className="p-4">
  <p>Card content</p>
</GlassCard>

// 带悬浮效果
<GlassCard className="p-4" hoverable>
  <p>Hoverable card</p>
</GlassCard>
```

### 设计特性

- **玻璃态背景**: `backdrop-blur-xl` + 半透明背景
- **模糊遮罩**: `bg-black/60 backdrop-blur-md`
- **平滑动画**: Framer Motion 缩放+淡入效果
- **深色模式兼容**: 自动适配深色主题
- **图标标题**: 支持带图标的标题区域

---

## 🎴 卡片组件 (Card)

**文件**: `components/ui/Card.jsx`

### Card - 基础卡片

```jsx
import { Card, CardBody, CardHeader, CardFooter } from '../components/ui';

// 基础用法
<Card>
  <CardBody>内容</CardBody>
</Card>

// 完整属性
<Card
  hoverable={true}       // 悬浮效果 (hover:shadow-lg, hover:-translate-y-1)
  glass={true}           // 玻璃态效果 (backdrop-blur-xl)
  animated={true}        // 入场动画 (Framer Motion)
  animationDelay={100}   // 动画延迟 (ms)
  shadow="md"            // 阴影: 'sm' | 'md' | 'lg' | 'none'
  className="custom-class"
>
  <CardHeader>标题区域</CardHeader>
  <CardBody>内容区域</CardBody>
  <CardFooter>操作区域</CardFooter>
</Card>
```

### PhotoCard - 照片卡片

```jsx
import { PhotoCard } from '../components/ui';

<PhotoCard
  src="/path/to/image.jpg"
  alt="Photo description"
  title="照片标题"
  subtitle="副标题信息"
  aspectRatio="3/2"      // 宽高比: '1/1' | '3/2' | '4/3' | '16/9'
  hoverable={true}
  onClick={() => handleClick()}
/>
```

### StatCard - 统计卡片

```jsx
import { StatCard, Camera } from '../components/ui';

<StatCard
  icon={<Camera />}
  value="128"
  label="Total Rolls"
  trend="up"            // 趋势: 'up' | 'down'
  trendValue="+12%"
  color="primary"       // 颜色: 'primary' | 'success' | 'warning' | 'danger'
/>
```

---

## 🎭 动画组件 (AnimatedContainer)

**文件**: `components/ui/AnimatedContainer.jsx`

### 预设动画

```jsx
import { AnimatedContainer, ANIMATION_PRESETS } from '../components/ui';

// 可用预设
const ANIMATIONS = {
  'fadeIn',        // 淡入
  'fadeInUp',      // 从下淡入 (默认)
  'fadeInDown',    // 从上淡入
  'slideInLeft',   // 从左滑入
  'slideInRight',  // 从右滑入
  'scaleIn',       // 缩放淡入
  'popIn',         // 弹性缩放
};

// 基础用法
<AnimatedContainer animation="fadeInUp" delay={0.1}>
  <div>动画内容</div>
</AnimatedContainer>

// 列表 Stagger 动画
<AnimatedList>
  {items.map(item => <ListItem key={item.id} {...item} />)}
</AnimatedList>

// 页面切换动画
<AnimatedPresenceWrapper>
  <Routes>
    <Route path="/" element={<HomePage />} />
  </Routes>
</AnimatedPresenceWrapper>
```

### 自定义动画配置

```jsx
// ANIMATION_PRESETS 结构
{
  initial: { opacity: 0, y: 20 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: 10 },
  transition: { duration: 0.3, ease: [0.4, 0, 0.2, 1] },
}
```

---

## 🦴 骨架屏组件 (Skeleton)

**文件**: `components/ui/Skeleton.jsx`

```jsx
import { Skeleton, PhotoSkeleton, TextSkeleton, StatCardSkeleton } from '../components/ui';

// 基础骨架
<Skeleton className="w-full h-4 rounded-lg" />

// 照片骨架
<PhotoSkeleton aspectRatio="3/2" />

// 文本骨架
<TextSkeleton lines={3} />

// 统计卡片骨架
<StatCardSkeleton />
```

---

## 🔘 按钮组件 (Button)

**文件**: `components/ui/Button.jsx`

```jsx
import { Button, IconButton } from '../components/ui';

// 标准按钮
<Button
  variant="solid"       // 变体: 'solid' | 'bordered' | 'light' | 'flat' | 'faded' | 'shadow' | 'ghost'
  color="primary"       // 颜色: 'default' | 'primary' | 'secondary' | 'success' | 'warning' | 'danger'
  size="md"             // 大小: 'sm' | 'md' | 'lg'
  isLoading={false}
  isDisabled={false}
  startContent={<Plus className="w-4 h-4" />}
  endContent={<ChevronRight className="w-4 h-4" />}
  onPress={() => handleClick()}
>
  按钮文本
</Button>

// 图标按钮
<IconButton
  icon={<Edit />}
  tooltip="编辑"
  variant="light"
  color="default"
  onPress={() => handleEdit()}
/>
```

---

## 🎨 图标系统 (Icons)

**文件**: `components/ui/icons.js`

基于 **Lucide React** 图标库，统一导出常用图标。

```jsx
import { 
  // 导航
  Home, Calendar, Image, Film, Camera, FolderOpen, Heart, Star, Settings, Search,
  Menu, X, ChevronLeft, ChevronRight, ChevronUp, ChevronDown, ArrowLeft, ArrowRight,
  
  // 操作
  Plus, Minus, Edit, Trash2, Download, Upload, Share2, Copy, Check, RefreshCw,
  Filter, SortAsc, SortDesc, Grid, List, Layers, ZoomIn, ZoomOut, Maximize, Minimize,
  
  // 媒体
  Play, Pause, Aperture, Sun, Moon,
  
  // 状态
  AlertCircle, AlertTriangle, CheckCircle, Info, HelpCircle, Loader2, Clock, Eye, EyeOff,
  
  // 设备
  Smartphone, Monitor, Laptop, Tablet, Wifi, WifiOff,
  
  // 文件
  File, FileText, FileImage, Folder, FolderOpen, Save, Package, Archive,
  
  // 地图
  Map, MapPin, Navigation, Globe, Compass,
  
  // 社交
  User, Users, UserPlus, MessageCircle, Send, Bell, BellOff
} from '../components/ui';

// 使用示例
<Camera className="w-5 h-5 text-primary" />
<Film className="w-4 h-4 text-default-500" />
```

---

## 🧩 业务组件模块

### Sidebar 模块 (`components/Sidebar/`)

```jsx
import { Sidebar, SidebarItem, SidebarSection, SidebarContext, useSidebar } from '../components/Sidebar';

// 使用示例
<SidebarProvider>
  <Sidebar />
  <main>{children}</main>
</SidebarProvider>

// 自定义菜单项
<SidebarItem
  icon={<Camera />}
  label="Rolls"
  to="/rolls"
  badge={12}
/>

// 分组
<SidebarSection title="Library">
  <SidebarItem ... />
</SidebarSection>
```

### Timeline 模块 (`components/Timeline/`)

```jsx
import { 
  TimelineProvider, useTimeline,
  TimelineView,
  TimelineFilters,
  TimelineMonthGrid,
  TimelineCalendarGrid,
  TimelineRollGrid 
} from '../components/Timeline';

// Context 提供的数据
const { 
  years, months, selectedYear, selectedMonth,
  rolls, selectedRolls,
  isLoading, error,
  selectYear, selectMonth,
  getRollColor
} = useTimeline();
```

### LifeLog 模块 (`components/LifeLog/`)

```jsx
import { 
  LifeLogProvider, useLifeLog,
  LifeLogView,
  LifeLogMonthGrid,
  LifeLogYearGrid,
  LifeLogDayModal 
} from '../components/LifeLog';
```

### Overview 模块 (`components/Overview/`)

```jsx
import { 
  OverviewView,
  HeroCarousel,
  QuickStats,
  BrowseSection,
  FilterDrawer 
} from '../components/Overview';
```

### RollDetail 模块 (`components/RollDetail/`)

```jsx
import { 
  RollHeader,
  RollToolbar,
  RollPhotoGrid,
  RollEditDrawer 
} from '../components/RollDetail';
```

### Statistics 模块 (`components/Statistics/`)

```jsx
import { StatCard, ChartCard, StatsModeToggle } from '../components/Statistics';

// ChartCard - 图表卡片容器
<ChartCard title="Monthly Activity" subtitle="Last 12 months">
  <AreaChart ... />
</ChartCard>
```

### Gallery 模块 (`components/Gallery/`)

```jsx
import { 
  GalleryHeader,
  PhotoCard, PhotoGrid,
  TagCard, TagGrid 
} from '../components/Gallery';
```

### FilmLibrary 模块 (`components/FilmLibrary/`)

```jsx
import { 
  FilmStatusTabs,
  FilmInventoryCard,
  FilmInventoryGrid,
  PurchaseBatchModal 
} from '../components/FilmLibrary';
```

### EquipmentManager 模块 (`components/EquipmentManager/`)

```jsx
import { 
  EquipmentTabs,
  EquipmentCard,
  EquipmentList,
  EquipmentDetailPanel 
} from '../components/EquipmentManager';
```

### Settings 模块 (`components/Settings/`)

```jsx
import { 
  SettingsTabs,
  SettingsSection,
  SettingsRow,
  GeneralSettings,
  ServerSettings,
  LutLibrary 
} from '../components/Settings';
```

---

## 🎯 Provider 组件

### HeroUIProvider

**文件**: `providers/HeroUIProvider.jsx`

```jsx
import { HeroUIProvider, useTheme, ThemeToggle } from '../providers/HeroUIProvider';

// App 根组件
<HeroUIProvider>
  <App />
</HeroUIProvider>

// 在任何组件中使用主题
const { theme, setTheme, toggleTheme } = useTheme();

// 主题: 'light' | 'dark'
setTheme('dark');
toggleTheme();

// 主题切换按钮组件
<ThemeToggle />
```

---

## 📝 API 端点参考

### 统一导入

```jsx
import { 
  API_BASE, getApiBase,
  
  // Rolls
  getRolls, getRoll, createRoll, updateRoll, deleteRoll,
  
  // Photos
  getPhotos, getPhoto, updatePhoto, deletePhoto, uploadPhotos,
  getFavoritePhotos, getRollPhotosByDate, buildUploadUrl,
  
  // Films
  getFilms, createFilm, updateFilm, deleteFilm,
  getFilmItems, createFilmItemsBatch, updateFilmItem, deleteFilmItem,
  
  // Equipment
  getCameras, createCamera, updateCamera, deleteCamera,
  getLenses, createLens, updateLens, deleteLens,
  getFlashes, getScanners, getFilmBacks,
  getEquipmentConstants, getEquipmentRelatedRolls,
  
  // Tags
  getTags, getTagPhotos,
  
  // Stats
  getStats, getGearStats, getActivityStats, getCostStats
} from '../api';
```

### 核心 API 端点

| 端点 | 方法 | 描述 |
|-----|------|-----|
| `/api/rolls` | GET | 获取所有胶卷 |
| `/api/rolls/:id` | GET | 获取单个胶卷详情 |
| `/api/rolls/:id/photos` | GET | 获取胶卷照片 |
| `/api/photos/:id` | PATCH | 更新照片信息 |
| `/api/films` | GET | 获取胶片型号 |
| `/api/film-items` | GET | 获取胶片库存 |
| `/api/cameras` | GET | 获取相机列表 |
| `/api/lenses` | GET | 获取镜头列表 |
| `/api/tags` | GET | 获取标签列表 |
| `/api/stats/summary` | GET | 获取统计摘要 |

---

## ⚠️ 重要注意事项

### Tailwind CSS 动态类名问题

详见 [SKILL-TAILWIND-DYNAMIC-CLASSES.md](./SKILL-TAILWIND-DYNAMIC-CLASSES.md)

**核心要点**:
1. ❌ 不要动态拼接类名: `bg-${color}-500`
2. ✅ 使用内联样式处理动态颜色
3. ✅ 使用完整类名映射 (switch/case)

### 组件样式规范

1. **优先使用 HeroUI 组件** 而非原生 HTML
2. **使用 Tailwind 类名** 而非自定义 CSS
3. **动态颜色使用内联样式** 避免 JIT 问题
4. **保持数据接口不变**，仅改造 UI 层

### 深色模式兼容

```jsx
// 所有颜色应同时定义 light/dark
<div className="bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100">

// 使用 CSS 变量
<div className="bg-background text-foreground">

// 使用 HeroUI 语义色
<div className="bg-content1 text-default-900">
```

---

## 📚 相关文档

- [DESKTOP-UI-MODERNIZATION-PLAN.md](./DESKTOP-UI-MODERNIZATION-PLAN.md) - UI 现代化计划
- [UI-IMPROVEMENT-RECOMMENDATIONS.md](./UI-IMPROVEMENT-RECOMMENDATIONS.md) - UI 改进建议
- [SKILL-TAILWIND-DYNAMIC-CLASSES.md](./SKILL-TAILWIND-DYNAMIC-CLASSES.md) - Tailwind 动态类名问题

---

**维护说明**: 当添加新的可复用组件时，请更新此文档。
