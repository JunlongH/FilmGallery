# 4. 前端开发

## 4.1 桌面端架构

### 4.1.1 技术栈

| 库 | 版本 | 用途 |
|----|-----|------|
| React | 18.2.0 | UI 框架 |
| React Router | 7.9.6 | 路由管理 |
| React Query | 5.90.10 | 数据获取和缓存 |
| Recharts | 3.5.1 | 图表组件 |
| Leaflet | 1.9.4 | 地图库 |
| Framer Motion | 12.23.24 | 动画库 |
| React Window | 1.8.10 | 虚拟化列表 |
| Craco | 7.1.0 | Create React App 配置 |

### 4.1.2 项目结构

```
client/src/
├── api/                    # API 客户端
│   ├── api.js             # 统一 API 调用
│   └── config.js          # API 配置
├── pages/                 # 页面级组件
│   ├── HomePage.jsx       # 首页
│   ├── RollLibrary.jsx    # 胶卷库
│   ├── FilmLibrary.jsx    # 胶片库
│   └── MapPage.jsx        # 地图视图
├── components/            # 可复用组件
│   ├── PhotoGrid.jsx      # 虚拟化照片网格
│   ├── RollDetail.jsx     # 胶卷详情
│   ├── FilmLab/           # FilmLab 处理组件
│   ├── RawImport/         # RAW 导入
│   ├── ImportPositive/    # 正片导入
│   ├── BatchExport/       # 批量导出
│   └── common/            # 通用组件
├── hooks/                 # 自定义 hooks
│   ├── usePhotos.js       # 照片 hooks
│   ├── useRolls.js        # 胶卷 hooks
│   └── useFilmLab.js      # FilmLab hooks
├── services/              # 业务逻辑
│   ├── photoService.js    # 照片相关逻辑
│   └── rollService.js     # 胶卷相关逻辑
├── styles/                # 全局样式
│   └── index.css
└── App.js                 # 主应用
```

### 4.1.3 页面导航

主要页面通过 React Router 定义：

```javascript
// 路由结构
/                 -> HomePage (首页)
/rolls            -> RollLibrary (胶卷库)
/films            -> FilmLibrary (胶片库)
/map              -> MapPage (地图)
/roll/:id         -> RollDetail (胶卷详情)
/photo/:id        -> PhotoDetailsSidebar (照片详情)
/settings         -> Settings (设置)
```

## 4.2 核心组件

### 4.2.1 PhotoGrid 组件

虚拟化照片网格，支持大量照片高效显示。

```javascript
// client/src/components/PhotoGrid.jsx
import { VariableSizeList } from 'react-window';

export function PhotoGrid({ photos, onPhotoClick }) {
  // 虚拟化列表渲染
  // 动态高度计算
  // 懒加载缩略图
}
```

**功能**：
- 虚拟化滚动（VirtualScroll）
- 响应式网格布局
- 缩略图懒加载
- 悬停预览

### 4.2.2 RollDetail 组件

胶卷详情页面，显示胶卷信息和其中的所有照片。

```javascript
// client/src/components/RollDetail.jsx
export function RollDetail({ rollId }) {
  const { data: roll } = useQuery({
    queryKey: ['rolls', rollId],
    queryFn: () => api.getRoll(rollId)
  });
  
  const { data: photos } = useQuery({
    queryKey: ['rolls', rollId, 'photos'],
    queryFn: () => api.getRollPhotos(rollId)
  });
  
  return (
    // 胶卷信息卡片 + 照片网格
  );
}
```

### 4.2.3 FilmLab 组件

FilmLab 处理 UI，实时预览处理效果。

```javascript
// client/src/components/FilmLab/FilmLabEditor.jsx
export function FilmLabEditor({ photoId, onSave }) {
  const [settings, setSettings] = useState({
    inversion: true,
    white_balance: { temp: 5500 },
    hsl: [],
    split_tone: {},
    exposure: 0
  });
  
  // 实时预览
  useEffect(() => {
    api.previewFilmlab(photoId, settings);
  }, [settings]);
  
  return (
    // 滑块控制器 + 预览区
  );
}
```

**特性**：
- 负片反演
- 白平衡调整
- HSL 色彩校正
- 分色调
- 曲线调整
- 预设保存/加载

### 4.2.4 PhotoDetailsSidebar 组件

照片元数据编辑侧边栏。

```javascript
// client/src/components/PhotoDetailsSidebar.jsx
export function PhotoDetailsSidebar({ photoId, onUpdate }) {
  const { data: photo } = useQuery({
    queryKey: ['photos', photoId],
    queryFn: () => api.getPhoto(photoId)
  });
  
  const handleUpdate = async (metadata) => {
    await api.updatePhoto(photoId, metadata);
    queryClient.invalidateQueries(['photos', photoId]);
  };
  
  return (
    // 元数据编辑表单：EXIF、标签、设备等
  );
}
```

**编辑字段**：
- EXIF 信息 (ISO, 光圈, 快门等)
- 地理位置
- 标签
- 使用的设备
- 自定义备注
- 评分

### 4.2.5 BatchExport 组件

批量导出对话框。

```javascript
// client/src/components/BatchExport/
export function BatchExportModal({ photoIds, onClose }) {
  const [settings, setSettings] = useState({
    format: 'jpg',
    width: 3000,
    height: 2000,
    quality: 95,
    applyFilmlab: false
  });
  
  const exportPhotos = async () => {
    const taskId = await api.batchExport(photoIds, settings);
    // 显示进度
  };
}
```

## 4.3 数据管理

### 4.3.1 React Query 使用

使用 TanStack React Query 管理服务器状态：

```javascript
// 基础查询
const { data, isLoading, error } = useQuery({
  queryKey: ['photos', rollId],
  queryFn: () => api.getPhotos({ roll_id: rollId }),
  staleTime: 5 * 60 * 1000, // 5 分钟
  cacheTime: 10 * 60 * 1000  // 10 分钟
});

// 分页查询
const { data, fetchNextPage, hasNextPage } = useInfiniteQuery({
  queryKey: ['photos', rollId],
  queryFn: ({ pageParam = 1 }) => 
    api.getPhotos({ roll_id: rollId, page: pageParam }),
  getNextPageParam: (lastPage, pages) => pages.length + 1
});

// 变更操作
const { mutate } = useMutation(
  (newPhoto) => api.createPhoto(newPhoto),
  {
    onSuccess: () => {
      queryClient.invalidateQueries(['photos']);
    }
  }
);
```

### 4.3.2 自定义 Hooks

常用逻辑封装为 hooks：

```javascript
// client/src/hooks/usePhotos.js
export function usePhotos(rollId) {
  return useQuery({
    queryKey: ['photos', rollId],
    queryFn: () => api.getPhotos({ roll_id: rollId })
  });
}

// client/src/hooks/useFilmLab.js
export function useFilmLab(photoId) {
  const [settings, setSettings] = useState({});
  
  const preview = useMutation((newSettings) =>
    api.previewFilmlab(photoId, newSettings)
  );
  
  const save = useMutation((newSettings) =>
    api.processFilmlab(photoId, newSettings)
  );
  
  return { settings, setSettings, preview, save };
}
```

### 4.3.3 API 客户端

统一的 API 调用接口：

```javascript
// client/src/api/api.js
const API_BASE = process.env.REACT_APP_API_BASE || 'http://localhost:4000';

export const api = {
  // 照片
  getPhotos: (params) => fetch(`${API_BASE}/api/photos?${new URLSearchParams(params)}`).then(r => r.json()),
  getPhoto: (id) => fetch(`${API_BASE}/api/photos/${id}`).then(r => r.json()),
  createPhoto: (data) => fetch(`${API_BASE}/api/photos`, { method: 'POST', body: JSON.stringify(data) }).then(r => r.json()),
  updatePhoto: (id, data) => fetch(`${API_BASE}/api/photos/${id}`, { method: 'PUT', body: JSON.stringify(data) }).then(r => r.json()),
  
  // 胶卷
  getRolls: () => fetch(`${API_BASE}/api/rolls`).then(r => r.json()),
  getRoll: (id) => fetch(`${API_BASE}/api/rolls/${id}`).then(r => r.json()),
  getRollPhotos: (id) => fetch(`${API_BASE}/api/rolls/${id}/photos`).then(r => r.json()),
  
  // FilmLab
  previewFilmlab: (photoId, settings) => 
    fetch(`${API_BASE}/api/filmlab/preview`, {
      method: 'POST',
      body: JSON.stringify({ photo_id: photoId, settings })
    }).then(r => r.json()),
  processFilmlab: (photoId, settings) =>
    fetch(`${API_BASE}/api/filmlab/process`, {
      method: 'POST',
      body: JSON.stringify({ photo_id: photoId, settings })
    }).then(r => r.json())
};
```

## 4.4 样式和主题

### 4.4.1 CSS 组织

```
styles/
├── index.css          # 全局样式
├── variables.css      # CSS 变量（颜色、间距等）
├── components/        # 组件样式（可选）
└── pages/            # 页面样式（可选）
```

### 4.4.2 响应式设计

使用 CSS 媒体查询支持不同屏幕：

```css
/* 桌面端优先 */
.photo-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  gap: 16px;
}

/* 平板 */
@media (max-width: 1200px) {
  .photo-grid {
    grid-template-columns: repeat(auto-fill, minmax(250px, 1fr));
  }
}

/* 手机 */
@media (max-width: 768px) {
  .photo-grid {
    grid-template-columns: repeat(2, 1fr);
  }
}
```

## 4.5 移动端 (React Native)

### 4.5.1 项目结构

```
mobile/src/
├── screens/            # 页面
│   ├── HomeScreen.tsx
│   ├── RollsScreen.tsx
│   ├── PhotosScreen.tsx
│   └── CameraScreen.tsx
├── components/         # 组件
├── services/          # 业务逻辑
├── hooks/             # 自定义 hooks
└── navigation/        # 导航配置
```

### 4.5.2 关键库

| 库 | 版本 | 用途 |
|----|-----|------|
| React Native | 0.81.5 | 移动端框架 |
| Expo | 54.0.25 | 开发工具链 |
| React Navigation | 6.x | 导航 |
| React Native Paper | 5.11.1 | UI 组件库 |
| Async Storage | 2.2.0 | 本地存储 |
| Vision Camera | 4.7.3 | 相机访问 |
| Geolocation | 3.4.0 | GPS |

### 4.5.3 开发流程

```bash
# 启动 Expo 开发服务器
npm start

# 在 Android 设备/模拟器上运行
npm run android

# 生成 APK（本地构建）
cd android && ./gradlew assembleRelease

# 使用 EAS 构建（云构建）
npm run build:apk
npm run build:aab
```

## 4.6 开发最佳实践

### 4.6.1 组件编写

```javascript
// ✅ 好的实践
export function MyComponent({ data, onUpdate }) {
  const { data: results } = useQuery({
    queryKey: ['items', data.id],
    queryFn: () => api.getItems(data.id)
  });
  
  if (!results) return <Loading />;
  
  return <div>{/* 内容 */}</div>;
}

// ❌ 避免
function MyComponent({ data, onUpdate }) {
  const [items, setItems] = useState([]);
  
  useEffect(() => {
    // 手动管理数据获取，容易出 bug
    fetch(`/api/items/${data.id}`)
      .then(r => r.json())
      .then(setItems);
  }, [data.id]);
  
  return <div>{/* 内容 */}</div>;
}
```

### 4.6.2 性能优化

```javascript
// 使用 React.memo 避免不必要重渲染
export const PhotoCard = React.memo(({ photo, onClick }) => (
  <div onClick={() => onClick(photo.id)}>
    {/* 内容 */}
  </div>
));

// 虚拟化长列表
import { VariableSizeList } from 'react-window';

export function PhotoList({ photos }) {
  return (
    <VariableSizeList
      height={600}
      itemCount={photos.length}
      itemSize={(i) => getItemSize(photos[i])}
      width="100%"
    >
      {({ index, style }) => (
        <div style={style}>
          <PhotoCard photo={photos[index]} />
        </div>
      )}
    </VariableSizeList>
  );
}
```

### 4.6.3 错误处理

```javascript
// 统一错误处理
export function useRobustQuery(queryKey, queryFn, options = {}) {
  return useQuery({
    queryKey,
    queryFn,
    retry: 2,
    retryDelay: attemptIndex => Math.min(1000 * 2 ** attemptIndex, 30000),
    onError: (error) => {
      console.error(`Query failed: ${queryKey}`, error);
      // 可选：显示错误提示
    },
    ...options
  });
}
```

---

**相关文档**：
- [03-backend-api.md](./03-backend-api.md) - API 接口
- [05-core-features.md](./05-core-features.md) - 核心功能
