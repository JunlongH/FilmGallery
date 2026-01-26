# FilmGallery 项目代码审查与优化报告

> **文档版本**: 2.0  
> **最后更新**: 2026-01-26  
> **状态**: 🔄 进行中

---

## 目录

1. [项目概览](#1-项目概览)
2. [软件架构问题与优化](#2-软件架构问题与优化)
3. [代码质量与规范](#3-代码质量与规范)
4. [数据结构与数据库](#4-数据结构与数据库)
5. [代码重复与冗余](#5-代码重复与冗余)
6. [性能问题](#6-性能问题)
7. [功能与用户体验](#7-功能与用户体验)
8. [安全性考虑](#8-安全性考虑)
9. [详细实施计划](#9-详细实施计划)
10. [快速修复清单](#10-快速修复清单)

---

## 1. 项目概览

FilmGallery 是一个全栈应用程序，旨在管理胶片摄影流程。

### 1.1 架构组成

| 模块 | 技术栈 | 代码位置 | 主要文件数 |
|------|--------|----------|------------|
| **Desktop (Electron)** | Electron 26 + React 18 | `client/`, `electron-*.js` | ~50 |
| **Server** | Express + SQLite | `server/` | ~80 |
| **Mobile** | React Native (Expo 54) | `mobile/` | ~40 |
| **Watch App** | React Native | `watch-app/` | ~20 |
| **Shared Packages** | JavaScript | `packages/` | ~15 |

### 1.2 代码规模统计

```
总代码行数 (估算):
├── server/          ~15,000 行 JavaScript
├── client/src/      ~12,000 行 JavaScript/JSX  
├── mobile/src/      ~8,000 行 JavaScript/JSX
├── packages/shared/ ~2,500 行 JavaScript
└── watch-app/       ~3,000 行 TypeScript
```

### 1.3 技术债务评估

| 类别 | 严重程度 | 影响范围 | 修复难度 |
|------|----------|----------|----------|
| N+1 查询问题 | 🔴 高 | 性能 | ⭐ 低 |
| 代码重复 | 🟡 中 | 维护性 | ⭐⭐ 中 |
| 大文件/上帝对象 | 🟡 中 | 可读性 | ⭐⭐⭐ 高 |
| 迁移系统混乱 | 🟡 中 | 可靠性 | ⭐⭐ 中 |
| 缺乏类型定义 | 🟢 低 | 开发体验 | ⭐⭐⭐ 高 |

---

## 2. 软件架构问题与优化

### 2.1 非标准 Monorepo 结构

**问题描述**:
- 项目包含多个独立的 `package.json` (server, client, mobile, packages/*)
- 没有使用现代 monorepo 工具 (npm workspaces, Turborepo, Nx)

**后果**:
- 依赖管理混乱，`node_modules` 重复占用大量空间
- 难以在 Mobile 和 Client 之间共享逻辑
- 版本不一致风险

**优化方案**:

```json
// 根目录 package.json 添加 workspaces
{
  "workspaces": [
    "client",
    "server", 
    "mobile",
    "watch-app",
    "packages/*",
    "packages/@filmgallery/*"
  ]
}
```

### 2.2 数据库同步机制 (OneDrive Write-Through)

**问题描述**:
- `server/db.js` 包含大量针对 OneDrive 同步优化的 SQLite PRAGMA 设置
- `journal_mode = WAL` vs `TRUNCATE` 的选择取决于环境变量

**风险**:
- 依赖文件系统同步作为 "云同步" 非常脆弱
- 容易产生冲突文件 (Conflict files) 和数据库损坏

**短期方案**:
- 将 DB 连接层抽离为独立模块
- 不在应用逻辑中混杂文件系统同步补丁代码

**长期方案**:
- 考虑 Client-Server 架构
- 或使用专门的本地优先云同步数据库方案 (PouchDB/CouchDB, RxDB)

### 2.3 后端路由耦合

**问题描述**:
- `server.js` 和路由文件承担过多职责
- 迁移脚本在启动时直接调用

**影响文件**:
| 文件 | 行数 | 职责 |
|------|------|------|
| `server/server.js` | 470 | 启动、路由挂载、迁移调用 |
| `server/routes/equipment.js` | 1096 | 路由+Multer+DB操作+业务逻辑 |
| `server/routes/rolls.js` | 1700 | 路由+文件处理+图片处理 |

---

## 3. 代码质量与规范

### 3.1 "上帝对象" 与大文件

**问题文件清单**:

| 文件路径 | 行数 | 问题 | 建议拆分 |
|----------|------|------|----------|
| `client/src/api.js` | 1680 | API 调用全部集中 | 按资源拆分 |
| `server/routes/rolls.js` | 1700 | 路由+业务+文件操作 | Controller-Service |
| `server/routes/equipment.js` | 1096 | 路由+Multer+DB helper | Controller-Service |
| `mobile/src/screens/ShotLogScreen.js` | 900+ | State+UI 混合 | 拆分 Hooks |

### 3.2 db-helpers 重复定义

**问题**: `server/routes/equipment.js` 中重复定义了已存在于 `server/utils/db-helpers.js` 的函数

```javascript
// ❌ equipment.js 第 47-69 行 - 重复定义
const runAsync = (sql, params = []) => {...}
const allAsync = (sql, params = []) => {...}
const getAsync = (sql, params = []) => {...}

// ✅ 应该使用
const { runAsync, allAsync, getAsync } = require('../utils/db-helpers');
```

### 3.3 缺少统一错误处理

**当前模式** (分散在各路由):
```javascript
} catch (err) {
    console.error('[EQUIPMENT] Error fetching cameras:', err);
    res.status(500).json({ error: err.message });
}
```

**建议**: 创建统一错误处理中间件 `server/middleware/error-handler.js`

---

## 4. 数据结构与数据库

### 4.1 迁移系统过于复杂

**当前迁移执行位置**:

| 文件 | 用途 | 是否有版本追踪 |
|------|------|----------------|
| `utils/migration.js` | 基础迁移 | ❌ |
| `utils/schema-migration.js` | Schema 迁移 | ❌ |
| `utils/equipment-migration.js` | 设备迁移 | ❌ |
| `utils/film-struct-migration.js` | 胶片结构迁移 | ❌ |
| `migrations/*.js` | 文件迁移 | ❌ |

**问题**: 缺少迁移版本追踪表，无法知道哪些迁移已执行。

**优化方案**:
```sql
-- 添加迁移追踪表
CREATE TABLE IF NOT EXISTS _migrations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  executed_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

### 4.2 非结构化数据存储

**问题**: `shot_logs` 作为 JSON 字符串存储在单一字段中

**后果**:
- 无法统计 "使用 50mm 镜头拍了多少张照片"
- 无法对拍摄参数建立索引
- 查询效率低下

**长期方案**: 规范化为独立表
```sql
CREATE TABLE shots (
  id INTEGER PRIMARY KEY,
  film_item_id INTEGER,
  shot_number INTEGER,
  date DATE,
  lens TEXT,
  focal_length REAL,
  aperture REAL,
  shutter_speed TEXT,
  latitude REAL,
  longitude REAL,
  FOREIGN KEY(film_item_id) REFERENCES film_items(id)
);
```

---

## 5. 代码重复与冗余

### 5.1 API 客户端代码重复

**问题**: Client 和 Mobile 都手动实现了相同的 API 封装

| 模块 | 文件 | 行数 | 覆盖 API |
|------|------|------|----------|
| Client | `client/src/api.js` | 1680 | 全部 API |
| Mobile | `mobile/src/api/equipment.js` | 130 | Equipment API |
| Mobile | `mobile/src/api/filmItems.js` | ~100 | Film Items API |
| Mobile | `mobile/src/api/stats.js` | ~80 | Stats API |

**优化方案**: 创建共享 API 客户端包

```
packages/@filmgallery/api-client/
├── package.json
├── index.js
├── equipment.js
├── films.js
├── rolls.js
├── photos.js
└── types.d.ts
```

### 5.2 常量重复定义

**问题**: 设备相关常量在多处定义

| 常量 | 定义位置 |
|------|----------|
| `CAMERA_TYPES` | `server/utils/equipment-migration.js` |
| `LENS_MOUNTS` | `server/utils/equipment-migration.js` |
| `FILM_FORMATS` | `server/utils/equipment-migration.js` |

**优化方案**: 移至 `packages/shared/constants/equipment.js`

### 5.3 占位符代码遗留

**问题**: Watch App 中存在开发占位符

```typescript
// watch-app/src/services/api.ts 第 6 行
const DEFAULT_URL = 'http://xxx.xxx.xx.xxx:4000';  // ❌ 应移除
```

---

## 6. 性能问题

### 6.1 N+1 查询问题 (严重)

**位置**: `server/routes/film-items.js` 第 40 行

**问题代码**:
```javascript
items = await Promise.all(items.map(async (item) => {
  if (item.film_id) {
    const filmRow = await getAsync('SELECT name, brand, iso, format, category FROM films WHERE id = ?', [item.film_id]);
    // ... 补充字段
  }
  return item;
}));
```

**修复方案**: 使用 SQL JOIN
```javascript
const sql = `
  SELECT fi.*, 
         f.name as film_name, 
         f.brand as film_brand,
         f.iso,
         f.format as film_format,
         f.category as film_category
  FROM film_items fi
  LEFT JOIN films f ON fi.film_id = f.id
  WHERE 1=1
  ${whereClause}
`;
```

### 6.2 Sharp 并发限制

**位置**: `server/routes/rolls.js` 第 15-17 行

```javascript
sharp.cache(false);
sharp.concurrency(1);  // 单线程处理
```

**影响**: 批量图片处理时成为瓶颈

**优化方案**: 根据可用 CPU 动态设置
```javascript
const os = require('os');
sharp.concurrency(Math.max(1, os.cpus().length - 1));
```

### 6.3 缺少请求去重

**问题**: Client 使用 React Query，但部分 API 调用仍可能重复

**建议**: 确保所有 API 调用都通过 React Query 管理

---

## 7. 功能与用户体验

### 7.1 网络依赖与自动发现

**当前状态**:
- 移动端需手动配置服务器 IP
- 存在 `docs/dynamic-port-discovery-plan.md` 但未完全实现

**优化方案**:
- 实现基于 mDNS (Bonjour/Zeroconf) 的自动发现
- 或使用 UDP 广播扫描

### 7.2 错误处理不友好

**问题**:
```javascript
// server.js
process.on('uncaughtException', (err) => {
  console.error('UNCAUGHT EXCEPTION:', err);  // 仅打印日志
});
```

**优化方案**:
- 引入服务端日志监控
- Electron 层面捕捉并提示用户重启

---

## 8. 安全性考虑

### 8.1 SQL 注入风险

**现状**: 大部分查询使用参数化，但需全面审查

**建议**: 引入 Query Builder (Knex.js) 确保一致性

### 8.2 文件上传安全

**建议检查项**:
- [ ] 文件类型白名单验证
- [ ] 文件大小限制
- [ ] 文件名消毒
- [ ] 存储路径验证

### 8.3 CORS 配置

**当前**: `cors({ origin: true })` - 允许所有来源

**建议**: 生产环境限制允许的来源

---

## 9. 详细实施计划

### Phase 1: 快速修复 (1-2 天) 🔴 高优先级

| # | 任务 | 文件 | 预计时间 | 状态 |
|---|------|------|----------|------|
| 1.1 | 修复 N+1 查询 | `server/routes/film-items.js` | 2h | ⬜ 待开始 |
| 1.2 | 移除 equipment.js 重复 db-helpers | `server/routes/equipment.js` | 30min | ⬜ 待开始 |
| 1.3 | 清理 watch-app 占位符 IP | `watch-app/src/services/api.ts` | 15min | ⬜ 待开始 |
| 1.4 | 添加统一错误处理中间件 | `server/middleware/error-handler.js` | 2h | ⬜ 待开始 |

### Phase 2: 代码重构 (1 周) 🟡 中优先级

| # | 任务 | 描述 | 预计时间 | 状态 |
|---|------|------|----------|------|
| 2.1 | 拆分 equipment.js | Controller-Service 分层 | 1d | ⬜ 待开始 |
| 2.2 | 拆分 rolls.js | Controller-Service 分层 | 1d | ⬜ 待开始 |
| 2.3 | 拆分 api.js | 按资源类型拆分 | 4h | ⬜ 待开始 |
| 2.4 | 创建共享 API 客户端 | `packages/@filmgallery/api-client` | 1d | ⬜ 待开始 |

### Phase 3: 架构优化 (2 周) 🟡 中优先级

| # | 任务 | 描述 | 预计时间 | 状态 |
|---|------|------|----------|------|
| 3.1 | 启用 npm workspaces | 修改根 package.json | 2h | ⬜ 待开始 |
| 3.2 | 统一迁移系统 | 添加版本追踪表 | 1d | ⬜ 待开始 |
| 3.3 | 提取共享常量 | 移至 packages/shared | 4h | ⬜ 待开始 |
| 3.4 | 实现 mDNS 服务发现 | 移动端自动发现 | 2d | ⬜ 待开始 |

### Phase 4: 长期改进 (1 个月+) 🟢 低优先级

| # | 任务 | 描述 | 预计时间 | 状态 |
|---|------|------|----------|------|
| 4.1 | 引入 TypeScript | 渐进式迁移 | 持续 | ⬜ 待开始 |
| 4.2 | 引入 Knex.js | 替换手写 SQL | 1w | ⬜ 待开始 |
| 4.3 | ShotLog 数据规范化 | 设计 shots 表 | 1w | ⬜ 待开始 |
| 4.4 | 引入 OpenAPI | API 文档自动生成 | 3d | ⬜ 待开始 |

---

## 10. 快速修复清单

以下修复可立即执行，风险低，收益高：

### ✅ 修复 1: N+1 查询 (film-items.js)

**文件**: `server/routes/film-items.js`

**当前代码** (第 27-56 行):
```javascript
let items = await listFilmItems(filters);
items = await Promise.all(items.map(async (item) => {
  if (item.film_id) {
    const filmRow = await getAsync('SELECT name, brand, iso, format, category FROM films WHERE id = ?', [item.film_id]);
    // ...
  }
}));
```

**修复方案**: 修改 `listFilmItems` 函数使用 JOIN

---

### ✅ 修复 2: 移除重复 db-helpers (equipment.js)

**文件**: `server/routes/equipment.js`

**删除**: 第 47-69 行的重复函数定义

**添加**: 
```javascript
const { runAsync, allAsync, getAsync } = require('../utils/db-helpers');
```

---

### ✅ 修复 3: 清理占位符 IP (watch-app)

**文件**: `watch-app/src/services/api.ts`

**修改**:
```typescript
// 之前
const DEFAULT_URL = 'http://xxx.xxx.xx.xxx:4000';

// 之后
const DEFAULT_URL = '';  // 用户必须在设置中配置
```

---

### ✅ 修复 4: 添加错误处理中间件

**新建文件**: `server/middleware/error-handler.js`

```javascript
class AppError extends Error {
  constructor(message, statusCode = 500) {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = true;
  }
}

const errorHandler = (err, req, res, next) => {
  console.error(`[ERROR] ${req.method} ${req.path}:`, err.message);
  
  const statusCode = err.statusCode || 500;
  const message = err.isOperational ? err.message : 'Internal server error';
  
  res.status(statusCode).json({
    ok: false,
    error: message,
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
  });
};

module.exports = { AppError, errorHandler };
```

---

## 附录 A: 文件大小统计

| 文件 | 行数 | 建议 |
|------|------|------|
| `server/routes/rolls.js` | 1700 | 拆分为 rollController + rollService |
| `client/src/api.js` | 1680 | 拆分为 equipmentApi, rollApi 等 |
| `server/routes/equipment.js` | 1096 | 拆分为 equipmentController + equipmentService |
| `mobile/src/screens/ShotLogScreen.js` | 900+ | 提取 useShotLogForm hook |

## 附录 B: 依赖分析

**重复依赖** (可通过 workspaces 去重):
- `date-fns`: client, mobile
- `axios`: mobile, watch-app  
- `react`: client, mobile

---

> 📝 **备注**: 此报告基于 2026-01-26 的代码审查。建议在进行任何功能开发前，先完成 Phase 1 的快速修复。

请你完成一部分工作就向我汇报一下“你好Junlong，我是copilot，我完成了部分工作”
