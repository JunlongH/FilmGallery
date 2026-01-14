# FilmGallery 代码优化与 TypeScript 迁移计划

> 创建日期: 2026-01-14
> 状态: 进行中

## 概述

本计划旨在通过模块化解耦、统一数据层逻辑和 TypeScript 迁移，解决代码冗余（约 40%）和维护性问题。

### TypeScript 迁移收益

| 收益 | 具体价值 |
|------|----------|
| **类型安全** | 消除 API 响应解析错误、prop 传递错误（当前无 PropTypes） |
| **自动补全** | 712 行的 api.js 有 50+ 函数，IDE 自动补全将极大提升效率 |
| **重构信心** | 无测试情况下，类型系统是唯一的安全网 |
| **代码复用** | 共享类型包消除 Desktop/Mobile 的重复定义 |
| **文档即代码** | 接口定义即 API 文档，减少沟通成本 |

---

## 优先级矩阵

| 优先级 | 任务 | 影响 | 工作量 | 状态 |
|--------|------|------|--------|------|
| 🔴 P0 | 提取共享类型包 | 高 | 3天 | ✅ 完成 |
| 🔴 P0 | Client `api.ts` 完整类型化 | 高 | 3天 | ✅ 完成 |
| 🟠 P1 | 拆分 `routes/rolls.js` POST 处理器 | 很高 | 5天 | ✅ 完成 |
| 🟠 P1 | 消除 `equipment.js` 中重复的 DB helpers | 中 | 2小时 | ✅ 完成 |
| 🟡 P2 | 提取 LUT 函数至 `utils/image-lut.ts` | 中 | 2小时 | ✅ 完成 |
| 🟡 P2 | 清理 ESLint warnings (unused vars) | 中 | 2天 | ✅ 完成 (69→65) |
| 🟢 P3 | Mobile API 层 TS 迁移 | 中 | 3天 | ✅ 完成 |
| 🟢 P3 | Server Services TS 迁移 | 中 | 5天 | 🔄 进行中 |
| 🟢 P3 | 创建 .d.ts 类型声明文件 | 低 | 2天 | ✅ 完成 (gear-service, tag-service) |

---

## 详细步骤

### Phase 1: 基础设施 (Week 1)

#### 1.1 建立 Monorepo 基础与共享类型包
- [x] 配置 npm workspaces
- [x] 创建 `packages/@filmgallery/types`
- [x] 从 `watch-app/src/types/index.ts` 提取核心类型
- [x] 添加 API 响应类型
- [x] 配置 ESLint + TypeScript 检查 (根目录 `.eslintrc.js`)

#### 1.2 消除 Server 端重复代码
- [x] 移除 `routes/equipment.js` 中重复的 `runAsync/allAsync/getAsync`
- [x] 提取 `routes/photos.js` 中的 LUT 函数至 `utils/image-lut.js`

### Phase 2: Client TypeScript 迁移 (Week 2)

#### 2.1 Client 端配置
- [x] 添加 `client/tsconfig.json`
- [x] 安装 TypeScript 依赖

#### 2.2 API 层类型化
- [x] 将 `api.js` 迁移为 `api.ts`
- [x] 定义所有 50+ API 函数的返回类型

#### 2.3 组件迁移
- [x] 迁移核心组件至 `.tsx` (ModalDialog, SquareImage, FilterPanel)
- [x] 为已迁移组件添加 Props 接口

### Phase 3: Server 重构与迁移 (Week 3-4)

#### 3.1 路由重构
- [x] 拆分 `routes/rolls.js` POST 处理器为 Service 函数
- [x] 提取文件处理逻辑至 `services/thumbnail-service.js`
- [x] 创建 `services/roll-creation-service.js` 统一创建逻辑

#### 3.2 Server TypeScript 迁移
- [x] 添加 `server/tsconfig.json`
- [x] 迁移 `utils/image-lut.ts`
- [x] 迁移 `services/thumbnail-service.ts`
- [x] 迁移 `services/roll-service.ts`
- [x] 创建 `services/gear-service.d.ts` (类型声明文件)
- [x] 创建 `services/tag-service.d.ts` (类型声明文件)
- [x] 创建 `utils/db-helpers.d.ts` (数据库工具类型声明)
- [ ] 迁移更多 services/ 目录文件 (filmlab-service, contactSheetGenerator)
- [ ] 迁移 routes/ 目录 (可选，长期目标)

### Phase 4: Mobile 迁移 (Week 5)

- [x] 添加 `mobile/tsconfig.json`
- [x] 创建 `mobile/src/types/index.ts` (导出 @filmgallery/types + 移动端专用类型)
- [x] 创建 `mobile/src/services/apiService.ts` (类型化 API 层)
- [x] 创建 `mobile/src/screens/HomeScreen.tsx` (迁移示例，部分实现)
- [ ] 完成 HomeScreen.tsx (解决 TypeScript children props 问题)
- [ ] 迁移其他 Screen 组件使用 apiService (RollDetailScreen, PhotoViewScreen 等)
- [ ] 迁移其他组件到 TSX

**注意**: Mobile 端 TypeScript 迁移遇到组件 children props 严格类型检查问题，需要逐步调整组件类型定义。

### Phase 5: 测试与文档 (Week 6)

- [x] 配置 Jest 测试框架 (server/package.json)
- [x] 为 roll-creation-service 添加单元测试
- [x] 为 thumbnail-service 添加单元测试
- [x] 为 image-lut 添加单元测试
- [x] 为 Client API 层添加 Mock 测试 (client/src/__tests__/api.test.ts)
- [x] 配置 Client Jest 测试环境 (setupTests.ts)
- [x] 更新开发者文档 (01-architecture.md)

---

## 变更日志

| 日期 | 任务 | 状态 | 备注 |
|------|------|------|------|
| 2026-01-14 | 创建优化计划文档 | ✅ 完成 | |
| 2026-01-14 | 创建 @filmgallery/types 包 | ✅ 完成 | packages/@filmgallery/types |
| 2026-01-14 | 配置 npm workspaces | ✅ 完成 | 根目录 package.json |
| 2026-01-14 | 消除 equipment.js 重复代码 | ✅ 完成 | 使用 db-helpers.js |
| 2026-01-14 | 提取 LUT 函数 | ✅ 完成 | server/utils/image-lut.js |
| 2026-01-14 | 更新开发者文档 | ✅ 完成 | DEVELOPER-MANUAL.md, 01-architecture.md |
| 2026-01-14 | 添加 Client TypeScript 配置 | ✅ 完成 | client/tsconfig.json |
| 2026-01-14 | 创建类型化 API 客户端 | ✅ 完成 | client/src/api.ts (1100+ 行) |
| 2026-01-14 | 提取缩略图服务 | ✅ 完成 | server/services/thumbnail-service.js |
| 2026-01-14 | 创建 roll-creation-service | ✅ 完成 | server/services/roll-creation-service.js |
| 2026-01-14 | 配置 ESLint + TypeScript | ✅ 完成 | 根目录 .eslintrc.js, npm scripts |
| 2026-01-14 | 迁移核心组件到 TSX | ✅ 完成 | ModalDialog.tsx, SquareImage.tsx, FilterPanel.tsx |
| 2026-01-14 | 配置 Jest 测试框架 | ✅ 完成 | server/package.json, npm run test |
| 2026-01-14 | 添加服务层单元测试 | ✅ 完成 | 3个测试文件: roll-creation, thumbnail, image-lut |
| 2026-01-15 | 修复 ESLint 配置问题 | ✅ 完成 | 添加 Jest globals, migration 文件规则 |
| 2026-01-15 | 修复 no-empty 空块错误 | ✅ 完成 | electron-main.js, electron-preload.js, server 文件 |
| 2026-01-15 | 修复 no-async-promise-executor | ✅ 完成 | equipment-migration.js, film-struct-migration.js, schema-migration.js |
| 2026-01-15 | ESLint 零错误达成 | ✅ 完成 | 0 errors, 69 warnings (unused vars, prefer-const) |
| 2026-01-15 | 所有单元测试通过 | ✅ 完成 | 31 tests passed (server) |
| 2026-01-15 | Server tsconfig.json 配置 | ✅ 完成 | server/tsconfig.json |
| 2026-01-15 | 迁移 image-lut 到 TypeScript | ✅ 完成 | server/utils/image-lut.ts |
| 2026-01-15 | 迁移 thumbnail-service 到 TypeScript | ✅ 完成 | server/services/thumbnail-service.ts |
| 2026-01-15 | Mobile tsconfig.json 配置 | ✅ 完成 | mobile/tsconfig.json |
| 2026-01-15 | Mobile 类型声明文件 | ✅ 完成 | mobile/src/types/index.ts (导出共享类型 + 移动端专用类型) |
| 2026-01-15 | Mobile API 服务层迁移 | ✅ 完成 | mobile/src/services/apiService.ts (类型化 API 层) |
| 2026-01-15 | Client Jest 测试配置 | ✅ 完成 | client/package.json, setupTests.ts, 安装测试依赖 |
| 2026-01-15 | Client API 单元测试 | ✅ 完成 | client/src/__tests__/api.test.ts, 7 tests passed |
| 2026-01-15 | 更新开发者文档 | ✅ 完成 | docs/dev-manual/01-architecture.md (TypeScript 迁移进展) |
| 2026-01-15 | Mobile 迁移文档 | ✅ 完成 | docs/mobile-api-migration.md (迁移指南和示例) |
| 2026-01-15 | ESLint warnings 清理 | ✅ 完成 | 69 warnings → 65 warnings (移除未使用导入) |
| 2026-01-15 | 创建服务层类型声明文件 | ✅ 完成 | gear-service.d.ts, tag-service.d.ts |
| 2026-01-15 | 迁移 roll-service 到 TypeScript | ✅ 完成 | server/services/roll-service.ts |
| 2026-01-15 | 创建 db-helpers 类型声明 | ✅ 完成 | server/utils/db-helpers.d.ts |
| 2026-01-15 | Mobile HomeScreen 迁移示例 | 🔄 进行中 | mobile/src/screens/HomeScreen.tsx (部分实现) |
| 2026-01-15 | 创建完整优化报告 | ✅ 完成 | docs/optimization-completion-2026-01-15.md |

---

## 相关文档

- [DEVELOPER-MANUAL.md](./DEVELOPER-MANUAL.md) - 开发者手册
- [API_BASE-QUICK-REFERENCE.md](./API_BASE-QUICK-REFERENCE.md) - API 基础参考

