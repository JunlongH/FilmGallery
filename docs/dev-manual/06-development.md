# 6. 开发指南

## 6.1 开发环境搭建

### 6.1.1 系统要求

- **OS**：Windows 10/11, macOS, Linux
- **Node.js**：v18.x 或更高
- **npm**：v8+
- **Python**：v3.8+ (electron-rebuild 需要)
- **Git**：版本控制

### 6.1.2 检查环境

```bash
# 检查版本
node --version    # v18.x.x 或更高
npm --version     # v8.x.x 或更高
git --version     # 2.x 或更高

# Windows 用户需要构建工具
npm install --global windows-build-tools
```

### 6.1.3 克隆和安装

```bash
# 克隆仓库
git clone <repository-url>
cd FilmGalery

# 安装根目录依赖（包括 Electron）
npm install

# 初始化数据库
cd server && npm run init-db

# 返回根目录
cd ..
```

## 6.2 运行开发服务

### 6.2.1 后端服务器

```bash
cd server
npm start

# 输出应该显示：
# [SERVER MODE] Running in dev mode
# Server listening on http://localhost:4000
```

**可用命令**：
```bash
npm start                    # 生产模式启动
npm run start:server:dev     # 开发模式（自动重启）
npm run init-db             # 初始化数据库
npm run migrate-*           # 运行特定迁移
```

### 6.2.2 前端开发服务器

```bash
cd client
npm start

# 浏览器自动打开 http://localhost:3000
# 修改代码自动热更新
```

### 6.2.3 完整开发环境

从根目录运行：

```bash
# 方式 1：后端 + 前端 (Web)
npm run dev:web

# 方式 2：后端 + 前端 + Electron
npm run dev:full

# 方式 3：仅 Electron（需要后端已启动）
npm run dev
```

## 6.3 添加新功能

### 6.3.1 添加新 API 端点

**步骤**：

1. **创建路由处理程序** (`server/routes/example.js`)

```javascript
const router = require('express').Router();
const { getExample, createExample } = require('../services/example-service');

// GET 端点
router.get('/', async (req, res) => {
  try {
    const data = await getExample(req.query);
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST 端点
router.post('/', async (req, res) => {
  try {
    const data = await createExample(req.body);
    res.json({ success: true, data });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

module.exports = router;
```

2. **在服务器注册路由** (`server/server.js`)

```javascript
// 在路由注册部分添加
app.use('/api/example', require('./routes/example'));
```

3. **创建服务层** (`server/services/example-service.js`)

```javascript
const db = require('../db');

async function getExample(params) {
  return new Promise((resolve, reject) => {
    db.all('SELECT * FROM examples', (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });
}

async function createExample(data) {
  return new Promise((resolve, reject) => {
    db.run(
      'INSERT INTO examples (name, value) VALUES (?, ?)',
      [data.name, data.value],
      function(err) {
        if (err) reject(err);
        else resolve({ id: this.lastID, ...data });
      }
    );
  });
}

module.exports = { getExample, createExample };
```

4. **前端调用** (`client/src/api/api.js`)

```javascript
export async function getExample(params) {
  const query = new URLSearchParams(params);
  const response = await fetch(`${API_BASE}/api/example?${query}`);
  return response.json();
}

export async function createExample(data) {
  const response = await fetch(`${API_BASE}/api/example`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  });
  return response.json();
}
```

5. **前端使用** (`client/src/hooks/useExample.js`)

```javascript
import { useQuery, useMutation } from '@tanstack/react-query';
import { getExample, createExample } from '../api/api';

export function useExample() {
  const query = useQuery({
    queryKey: ['example'],
    queryFn: getExample
  });
  
  const createMutation = useMutation(createExample, {
    onSuccess: () => {
      queryClient.invalidateQueries(['example']);
    }
  });
  
  return { ...query, create: createMutation.mutate };
}
```

### 6.3.2 添加数据库迁移

1. **创建迁移文件** (`server/migrations/2026-01-XX-add-example.js`)

```javascript
const db = require('../db');

async function migrate() {
  return new Promise((resolve, reject) => {
    db.serialize(() => {
      // 创建新表
      db.run(`
        CREATE TABLE IF NOT EXISTS examples (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL,
          value TEXT,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `, (err) => {
        if (err) {
          reject(err);
        } else {
          resolve();
        }
      });
    });
  });
}

module.exports = migrate;
```

2. **自动执行**

迁移脚本在服务器启动时自动执行。不需要手动操作。

### 6.3.3 添加前端页面

1. **创建页面组件** (`client/src/pages/ExamplePage.jsx`)

```javascript
import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { getExample } from '../api/api';

export function ExamplePage() {
  const { data, isLoading, error } = useQuery({
    queryKey: ['example'],
    queryFn: getExample
  });
  
  if (isLoading) return <div>加载中...</div>;
  if (error) return <div>错误：{error.message}</div>;
  
  return (
    <div className="example-page">
      <h1>示例页面</h1>
      {data && data.map(item => (
        <div key={item.id}>{item.name}</div>
      ))}
    </div>
  );
}
```

2. **添加路由** (`client/src/App.js`)

```javascript
import { ExamplePage } from './pages/ExamplePage';

function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* 其他路由 */}
        <Route path="/example" element={<ExamplePage />} />
      </Routes>
    </BrowserRouter>
  );
}
```

## 6.4 调试技巧

### 6.4.1 后端调试

**查看服务器日志**：
```bash
# 启用详细日志
DEBUG=* npm start

# 特定模块日志
DEBUG=photo-service npm start
```

**使用 Node 调试器**：
```bash
# 启动调试模式
node --inspect server.js

# 在 Chrome DevTools 中打开 chrome://inspect
```

**测试 API**：
```bash
# 使用 curl
curl http://localhost:4000/api/health

# 使用 Postman 或 Rest Client
GET http://localhost:4000/api/photos?limit=5
```

### 6.4.2 前端调试

**React Developer Tools**：
- 安装 Chrome 扩展：React Developer Tools
- F12 打开开发者工具，查看组件树、状态变化

**React Query DevTools**：
```javascript
// 添加到 App.js
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';

export default function App() {
  return (
    <>
      {/* App 内容 */}
      <ReactQueryDevtools initialIsOpen={false} />
    </>
  );
}
```

**网络调试**：
- F12 → Network 标签
- 监控 API 请求和响应
- 检查缓存和性能

### 6.4.3 数据库调试

**查看数据库内容**：
```bash
# 使用 SQLite3 命令行
sqlite3 server/film.db

# 或使用 GUI 工具
# DB Browser for SQLite (免费)
# https://sqlitebrowser.org/
```

**检查迁移**：
```bash
# 查看所有表
.tables

# 查看表结构
.schema photos

# 查询数据
SELECT * FROM photos LIMIT 5;
```

## 6.5 代码风格和约定

### 6.5.1 命名约定

**文件和文件夹**：
- 组件：PascalCase (PhotoGrid.jsx)
- 工具函数：camelCase (photoService.js)
- 常量：UPPER_SNAKE_CASE (DEFAULT_PAGE_SIZE)

**JavaScript**：
```javascript
// 常量
const DEFAULT_PAGE_SIZE = 20;
const API_TIMEOUT = 30000;

// 函数
function getPhotos(rollId) { }
const fetchPhotos = async (rollId) => { };

// 类/组件
class PhotoManager { }
function PhotoGrid({ photos }) { }
```

### 6.5.2 代码组织

**服务器端层次**：
```
routes/        → HTTP 请求处理（验证、路由）
  ↓
services/      → 业务逻辑
  ↓
utils/         → 数据库查询、工具函数
  ↓
db/            → 持久化存储
```

**前端层次**：
```
pages/         → 页面级组件
  ↓
components/    → 可复用组件
  ↓
hooks/         → 业务逻辑和状态管理
  ↓
api/           → API 调用
```

### 6.5.3 错误处理

```javascript
// 后端：统一错误响应
try {
  const data = await service.getData();
  res.json({ success: true, data });
} catch (err) {
  console.error('Error:', err);
  res.status(500).json({
    success: false,
    error: {
      code: 'INTERNAL_ERROR',
      message: err.message
    }
  });
}

// 前端：错误处理
useQuery({
  queryKey: ['data'],
  queryFn: api.getData,
  onError: (error) => {
    console.error('Query failed:', error);
    // 显示用户友好的错误提示
    showNotification({
      type: 'error',
      message: '加载失败，请重试'
    });
  }
});
```

## 6.6 性能优化

### 6.6.1 数据库查询优化

**使用 Prepared Statements**：
```javascript
// ❌ 不好：字符串拼接，容易 SQL 注入
const query = `SELECT * FROM photos WHERE id = ${photoId}`;

// ✅ 好：参数化查询
db.get('SELECT * FROM photos WHERE id = ?', [photoId], callback);
```

**避免 N+1 查询**：
```javascript
// ❌ 不好
const photos = db.all('SELECT * FROM photos');
for (const photo of photos) {
  photo.roll = db.get('SELECT * FROM rolls WHERE id = ?', [photo.roll_id]);
}

// ✅ 好：一次查询获取所有关联数据
const photos = db.all(`
  SELECT p.*, r.name as roll_name
  FROM photos p
  LEFT JOIN rolls r ON p.roll_id = r.id
`);
```

### 6.6.2 前端性能

**虚拟化长列表**：
```javascript
// ❌ 不好：渲染所有 1000 张照片
{photos.map(photo => <PhotoCard key={photo.id} photo={photo} />)}

// ✅ 好：仅渲染可见部分
import { VariableSizeList } from 'react-window';

<VariableSizeList
  height={600}
  itemCount={photos.length}
  itemSize={getItemSize}
  width="100%"
>
  {({ index, style }) => (
    <div style={style}>
      <PhotoCard photo={photos[index]} />
    </div>
  )}
</VariableSizeList>
```

**图片懒加载**：
```javascript
import { LazyLoadImage } from 'react-lazy-load-image-component';

<LazyLoadImage
  src={photo.full_path}
  placeholderSrc={photo.thumbnail_path}
  alt={photo.shot_date}
/>
```

## 6.7 版本控制最佳实践

### 6.7.1 提交信息

遵循 Conventional Commits：

```bash
# 新功能
git commit -m "feat: add FilmLab HSL adjustment"

# 缺陷修复
git commit -m "fix: correct white balance calculation"

# 文档更新
git commit -m "docs: update API documentation"

# 代码重构
git commit -m "refactor: simplify photo import service"

# 性能优化
git commit -m "perf: optimize database queries with prepared statements"
```

### 6.7.2 分支策略

```
main (生产就绪)
  ↑
develop (开发分支)
  ↑
feature/* (功能分支)
  ↑
bugfix/* (缺陷分支)
```

**创建功能分支**：
```bash
git checkout -b feature/add-new-filter
# 开发...
git commit -m "feat: add new filter"
git push origin feature/add-new-filter
# 提交 PR 到 develop
```

---

**相关文档**：
- [02-database.md](./02-database.md) - 数据库设计
- [03-backend-api.md](./03-backend-api.md) - API 接口
- [04-frontend.md](./04-frontend.md) - 前端开发
