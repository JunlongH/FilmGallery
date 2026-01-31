# 前端性能优化组件文档

> **创建日期**: 2026-01-31  
> **版本**: 1.0.0  
> **模块**: 性能优化基础设施

---

## 📦 已创建的模块

### 1. 缓存管理 (`lib/queryClient.js`)

统一的 React Query 配置，环境自适应的缓存策略。

```javascript
import { queryClient, cacheUtils, CACHE_STRATEGIES, getCacheStrategy } from '../lib';

// 使用预定义的缓存策略
const { data } = useQuery({
  queryKey: ['equipment', 'cameras'],
  queryFn: getCameras,
  ...getCacheStrategy('equipment'),  // 静态数据，长期缓存
});

// 缓存工具方法
cacheUtils.invalidate(['rolls']);           // 失效缓存
cacheUtils.clearModule('equipment');        // 清除模块缓存
cacheUtils.setQueryData(['user'], userData); // 手动设置
```

**缓存策略选择:**
| 策略 | staleTime | cacheTime | 适用场景 |
|------|-----------|-----------|----------|
| STATIC | Infinity | 24小时 | 设备库、胶片库、LUT |
| SEMI_STATIC | 30分钟 | 1小时 | 地点、标签 |
| DYNAMIC | 5分钟 | 15分钟 | 胶卷、照片 |
| REALTIME | 30秒 | 2分钟 | 上传进度、导出任务 |

---

### 2. 懒加载图片 (`components/common/LazyImage.jsx`)

Electron 优化的懒加载图片组件。

```jsx
import LazyImage from '../components/common/LazyImage';

<LazyImage
  src={photo.fullUrl}
  thumb={photo.thumbUrl}     // 缩略图 URL（可选）
  alt="照片描述"
  aspectRatio="4/3"          // 默认 1/1
  objectFit="cover"          // 默认 cover
  fadeInDuration={0.3}       // 淡入时长(s)
  unloadOnExit={false}       // 离开视口是否卸载
  rootMargin="200px"         // 提前加载距离
  maxRetries={2}             // 最大重试次数
  onLoad={() => {}}          // 加载完成回调
  onError={(error) => {}}    // 加载失败回调
/>
```

**特性:**
- ✅ IntersectionObserver 懒加载
- ✅ 渐进式加载（缩略图 → 全图）
- ✅ CSS fade-in 动画（Electron 友好）
- ✅ 错误重试 + 优雅降级
- ✅ 离开视口可卸载（内存优化）

---

### 3. 虚拟滚动 (`components/common/VirtualPhotoGrid.jsx`)

大列表性能优化，支持数千张照片。

```jsx
import { VirtualPhotoGrid, AutoSizer } from '../components/common';

<AutoSizer>
  {({ width, height }) => (
    <VirtualPhotoGrid
      photos={photos}
      width={width}
      height={height}
      columnWidth={200}      // 单张照片宽度
      rowHeight={200}        // 单张照片高度
      gap={8}                // 间距
      onPhotoClick={(photo, index) => {}}
      selectedPhotoIds={selectedIds}
      renderPhoto={({ photo, style, isSelected, onClick }) => (
        <div style={style} onClick={onClick}>
          <LazyImage src={photo.url} />
        </div>
      )}
    />
  )}
</AutoSizer>
```

**特性:**
- ✅ 基于 react-window 的 FixedSizeGrid
- ✅ 自动列数计算
- ✅ 选择状态管理
- ✅ 自定义渲染器

---

### 4. 数据预取 (`lib/dataPrefetch.js`)

智能数据预加载，提升导航体验。

```javascript
import { 
  prefetchManager,
  prefetchOverviewData, 
  prefetchRollDetailData,
  createHoverPrefetch 
} from '../lib';

// 页面级预取
useEffect(() => {
  prefetchOverviewData();  // 预取 Overview 所需数据
}, []);

// 导航预取
const handleRollClick = (rollId) => {
  prefetchRollDetailData(rollId);  // 预取胶卷详情
  navigate(`/rolls/${rollId}`);
};

// 悬停预取（鼠标悬停时触发）
const hoverPrefetch = createHoverPrefetch(
  () => prefetchRollDetailData(rollId)
);
<div onMouseEnter={hoverPrefetch}>...</div>
```

---

### 5. 路由懒加载 (`utils/lazyRoutes.js`)

代码分割 + 加载占位符。

```jsx
import { 
  LazyOverview, 
  LazyRollLibrary,
  LazySettings,
  SkeletonPage,
  SkeletonModal 
} from '../utils/lazyRoutes';

// 路由配置
<Routes>
  <Route path="/" element={<LazyOverview />} />
  <Route path="/rolls" element={<LazyRollLibrary />} />
  <Route path="/settings" element={<LazySettings />} />
</Routes>

// 预取常用路由
import { prefetchCommonRoutes } from '../utils/lazyRoutes';
useEffect(() => {
  prefetchCommonRoutes();
}, []);
```

---

### 6. 性能工具 Hooks (`hooks/`)

| Hook | 用途 | 示例 |
|------|------|------|
| `useDebounce(value, delay)` | 防抖值 | 搜索输入 |
| `useThrottle(callback, delay)` | 节流函数 | 滚动事件 |
| `useMemoizedCallback(fn, deps)` | 深度比较记忆化 | 复杂依赖 |
| `useIntersectionObserver(options)` | 交叉观察器 | 无限滚动 |
| `useLocalStorage(key, initial)` | 本地存储 | 持久化设置 |

```javascript
import { 
  useDebounce, 
  useThrottle, 
  useIntersectionObserver,
  useLocalStorage 
} from '../hooks';

// 搜索防抖
const [search, setSearch] = useState('');
const debouncedSearch = useDebounce(search, 300);

// 滚动节流
const handleScroll = useThrottle((e) => {
  console.log(e.target.scrollTop);
}, 100);

// 交叉观察
const { ref, isVisible } = useIntersectionObserver({
  rootMargin: '100px',
  triggerOnce: true,
});

// 本地存储
const [viewMode, setViewMode] = useLocalStorage('viewMode', 'grid');
```

---

## 🚀 集成指南

### App.js 集成

```jsx
// 替换旧的 QueryClient
import { queryClient } from './lib';
import { QueryClientProvider } from '@tanstack/react-query';

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      {/* ... */}
    </QueryClientProvider>
  );
}
```

### 新组件开发 Checklist

- [ ] 使用 `LazyImage` 替代 `<img>`
- [ ] API 调用使用 `useQuery` + `getCacheStrategy()`
- [ ] 长列表使用 `VirtualPhotoGrid`
- [ ] 搜索/筛选使用 `useDebounce`
- [ ] 路由组件使用 `createLazyComponent()`

---

## 📁 文件结构

```
client/src/
├── lib/
│   ├── index.js              # 统一导出
│   ├── queryClient.js        # QueryClient + 缓存策略
│   └── dataPrefetch.js       # 数据预取管理器
├── components/common/
│   ├── LazyImage.jsx         # 懒加载图片
│   ├── VirtualPhotoGrid.jsx  # 虚拟滚动照片网格
│   └── AutoSizer.jsx         # 容器尺寸检测
├── utils/
│   ├── imageOptimization.js  # 图片加载工具
│   └── lazyRoutes.js         # 路由懒加载
└── hooks/
    ├── index.js              # 统一导出
    ├── useDebounce.js        # 防抖
    ├── useThrottle.js        # 节流
    ├── useMemoizedCallback.js # 记忆化回调
    ├── useIntersectionObserver.js # 交叉观察器
    └── useLocalStorage.js    # 本地存储
```

---

**维护者**: FilmGallery Development Team  
**最后更新**: 2026-01-31
