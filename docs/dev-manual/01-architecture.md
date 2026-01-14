# 1. 系统架构

## 1.1 整体架构

FilmGallery 采用 **Client-Server** 架构，支持多端访问：

```
┌─────────────────────────────────────────────────┐
│                   客户端层                        │
├──────────────────┬──────────────────────────────┤
│   桌面端          │        移动端                 │
│   (Electron)     │    (React Native)            │
│   - React 18.2   │    - Expo SDK 54             │
│   - React Query  │    - React Navigation        │
│   - Recharts     │    - React Native Paper      │
└────────┬─────────┴────────────┬─────────────────┘
         │                      │
         └──────────┬───────────┘
                    │ HTTP API
         ┌──────────▼──────────────────┐
         │      后端服务器               │
         │   (Express + Node.js)       │
         │   - RESTful API             │
         │   - Multer (文件上传)        │
         │   - Sharp (图片处理)         │
         └──────────┬──────────────────┘
                    │
         ┌──────────▼──────────────────┐
         │      数据存储层               │
         │   - SQLite3 (主数据库)       │
         │   - 文件系统 (图片存储)       │
         │   - OneDrive (云同步)        │
         └─────────────────────────────┘
```

## 1.2 技术栈

### 1.2.1 桌面端 (Electron)
- **框架：** Electron 26.6.10
- **前端库：** React 18.2.0
- **路由：** React Router DOM 7.9.6
- **数据获取：** @tanstack/react-query 5.90.10
- **图表：** Recharts 3.5.1
- **图片优化：** react-lazy-load-image-component
- **虚拟滚动：** react-window
- **动画：** Framer Motion 12.23.24

### 1.2.2 移动端 (React Native)
- **框架：** React Native 0.81.5
- **运行时：** Expo SDK ~54.0.25
- **导航：** React Navigation 6.x
- **UI 组件：** React Native Paper 5.11.1
- **图表：** React Native Chart Kit 6.12.0
- **图片：** Expo Image 3.0.10
- **状态管理：** React Context + AsyncStorage

### 1.2.3 后端 (Node.js)
- **框架：** Express 4.18.2
- **数据库：** SQLite3 5.1.7
- **文件上传：** Multer 1.4.5
- **图片处理：** Sharp 0.34.5
- **压缩：** Compression 1.8.1
- **跨域：** CORS 2.8.5

## 1.3 目录结构

```
FilmGalery/
├── client/               # 桌面端 React 应用
│   ├── src/
│   │   ├── components/  # React 组件
│   │   ├── data/        # 静态数据
│   │   ├── styles/      # CSS 样式
│   │   ├── api.js       # API 客户端
│   │   ├── App.js       # 主应用
│   │   └── index.js     # 入口文件
│   ├── public/          # 静态资源
│   └── build/           # 构建输出
│
├── mobile/              # 移动端 React Native 应用
│   ├── src/
│   │   ├── api/         # API 客户端
│   │   ├── components/  # RN 组件
│   │   ├── context/     # Context 提供者
│   │   ├── hooks/       # 自定义 Hooks
│   │   ├── screens/     # 页面组件
│   │   ├── utils/       # 工具函数
│   │   └── setupAxios.js # Axios 配置（自动切换 IP）
│   ├── android/         # Android 原生代码
│   └── App.js           # 入口文件
│
├── server/              # 后端服务器
│   ├── routes/          # API 路由
│   ├── services/        # 业务逻辑
│   │   ├── roll-service.js          # Roll 排序服务
│   │   ├── roll-creation-service.js # Roll 创建服务 (原子事务)
│   │   ├── thumbnail-service.js     # 缩略图生成服务
│   │   ├── tag-service.js           # 标签管理服务
│   │   ├── gear-service.js          # 装备管理服务
│   │   └── film/                    # Film 相关服务
│   ├── utils/           # 工具模块
│   │   ├── db-helpers.js    # 数据库异步操作封装
│   │   ├── image-lut.js     # 图像 LUT 处理函数
│   │   ├── file-helpers.js  # 文件操作辅助函数
│   │   └── prepared-statements.js # 预编译语句管理
│   ├── migrations/      # 数据库迁移
│   ├── config/          # 配置文件
│   ├── uploads/         # 上传文件存储
│   ├── db.js            # 数据库连接
│   └── server.js        # 服务器入口
│
├── watch-app/           # Watch 应用 (React Native TypeScript)
│   ├── src/
│   │   ├── screens/     # 页面组件
│   │   ├── services/    # API 服务
│   │   └── types/       # TypeScript 类型定义
│   └── tsconfig.json    # TypeScript 配置
│
├── packages/            # 共享包 (Monorepo)
│   └── @filmgallery/
│       └── types/       # 共享 TypeScript 类型定义
│           ├── src/index.ts
│           └── package.json
│
├── electron-main.js     # Electron 主进程
├── electron-preload.js  # Electron 预加载脚本
├── electron-gpu/        # GPU 加速模块
├── docs/                # 项目文档
└── package.json         # 根项目配置 (含 workspaces)
```

## 1.4 核心设计模式

### 1.4.1 Prepared Statements（性能优化）
所有高频 SQL 查询使用预编译语句，提升性能并防止 SQL 注入：

```javascript
// server/utils/prepared-statements.js
const PreparedStmt = {
  runAsync: (key, params) => { /* 执行预编译语句 */ },
  getAsync: (key, params) => { /* 获取单行 */ },
  allAsync: (key, params) => { /* 获取多行 */ }
};
```

### 1.4.2 Service Layer（业务逻辑层）
业务逻辑与路由分离：

```javascript
// server/services/tag-service.js
async function savePhotoTags(photoId, tags) {
  // 1. 标准化标签名
  // 2. 删除旧关联
  // 3. 确保标签存在
  // 4. 创建新关联
}
```

### 1.4.3 自动 IP 切换（移动端）
Axios 拦截器实现主备 IP 自动切换：

```javascript
// mobile/src/setupAxios.js
axios.interceptors.response.use(null, async (error) => {
  if (isNetworkError(error)) {
    switchToBackupUrl();
    return axios.request(originalRequest);
  }
});
```

### 1.4.4 OneDrive 同步优化
定期 WAL checkpoint 确保数据库文件可被 OneDrive 同步：

```javascript
// server/db.js
setInterval(() => {
  db.run('PRAGMA wal_checkpoint(PASSIVE)');
}, 5 * 60 * 1000); // 每 5 分钟
```

## 1.5 数据流

### 1.5.1 客户端 → 服务器
```
用户操作 → React 组件 
         → API 函数 (api.js) 
         → HTTP 请求 
         → Express 路由 (routes/) 
         → 业务逻辑 (services/) 
         → 数据库操作 (db.js)
```

### 1.5.2 服务器 → 客户端
```
数据库查询 → 业务处理 
          → JSON 响应 
          → React Query 缓存 
          → 组件状态更新 
          → UI 渲染
```

## 1.6 关键特性

### 1.6.1 离线优先
- SQLite 本地数据库，无需网络也可访问
- 图片存储在本地文件系统
- OneDrive 自动同步（可选）

### 1.6.2 共享类型系统 (2026-01-14 新增)

使用 `@filmgallery/types` 包在各端共享 TypeScript 类型定义：

```typescript
// packages/@filmgallery/types/src/index.ts
export interface Photo {
  id: number;
  filename: string;
  full_rel_path: string;
  // ...
}

export interface Roll {
  id: number;
  title: string;
  filmId?: number | null;
  // ...
}
```

**使用方法：**
```typescript
import { Photo, Roll, FilmItem } from '@filmgallery/types';
```

### 1.6.3 工具模块化

服务器端工具函数已模块化：

- `server/utils/db-helpers.js` - 数据库异步操作（带重试机制）
- `server/utils/image-lut.js` - 图像 LUT 生成（用于 FilmLab）
- `server/utils/file-helpers.js` - 文件操作工具
- `server/utils/prepared-statements.js` - 预编译 SQL 语句

### 1.6.2 性能优化
- Prepared Statements 减少 SQL 解析开销
- React Query 智能缓存和后台刷新
- 虚拟滚动处理大量图片
- 懒加载图片组件

### 1.6.3 跨平台
- Electron 打包为 Windows 桌面应用
- React Native 编译为 Android APK

## 1.7 开发工具配置 (2026-01-14 新增)

### 1.7.1 ESLint 配置
根目录 `.eslintrc.js` 提供统一的代码风格检查：

```bash
# 运行 lint 检查
npm run lint

# 自动修复
npm run lint:fix
```

### 1.7.2 TypeScript 配置
- **Client**: `client/tsconfig.json` - 支持 JSX/TSX 渐进式迁移
- **Types Package**: `packages/@filmgallery/types/tsconfig.json` - 共享类型定义

```bash
# 类型检查
npm run typecheck

# 构建类型包
npm run build:types
```

### 1.7.3 已迁移的 TypeScript 文件

**Client 端：**
- `client/src/api.ts` - 完整类型化 API 客户端 (1100+ 行)
- `client/src/components/ModalDialog.tsx` - 模态对话框
- `client/src/components/SquareImage.tsx` - 方形图片组件
- `client/src/components/FilterPanel.tsx` - 过滤器面板
- `client/src/__tests__/api.test.ts` - API 客户端单元测试
- `client/src/setupTests.ts` - Jest 测试配置

**Server 端：**
- `server/utils/image-lut.ts` - 图像 LUT 处理函数
- `server/services/thumbnail-service.ts` - 缩略图生成服务
- `server/services/roll-service.ts` - Roll 序列维护服务
- `server/services/gear-service.d.ts` - Gear 服务类型声明文件
- `server/services/tag-service.d.ts` - Tag 服务类型声明文件
- `server/utils/db-helpers.d.ts` - 数据库工具类型声明文件
- `server/tsconfig.json` - Server TypeScript 配置

**Mobile 端：**
- `mobile/src/types/index.ts` - 移动端类型定义（导出共享类型）
- `mobile/src/services/apiService.ts` - 类型化 API 服务层（Rolls/Films/Photos/Tags/Equipment/Locations）
- `mobile/src/screens/HomeScreen.tsx` - 主屏幕迁移示例（部分实现）
- `mobile/tsconfig.json` - Mobile TypeScript 配置

### 1.6.4 可扩展性
- 模块化路由设计，易于添加新 API
- Service Layer 封装业务逻辑
- 数据库迁移系统支持 Schema 演进
