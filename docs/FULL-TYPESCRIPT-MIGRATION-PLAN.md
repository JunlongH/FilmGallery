# FilmGallery 全栈 TypeScript 迁移计划

> 创建日期: 2026-01-15
> 分支名称: `feature/full-typescript-migration`
> 状态: 进行中 (Phase 4 - Mobile 基础层迁移)
> 最后更新: 2026-01-14

## 一、概述

本计划旨在将 FilmGallery 项目的 **Server**、**Client** 和 **Mobile** 端代码完全迁移至 TypeScript，实现端到端的类型安全。

### 1.1 迁移目标

| 目标 | 描述 |
|------|------|
| **类型安全** | 所有模块实现完整类型覆盖，消除 `any` 类型 |
| **零回归** | 每次迁移后所有测试必须通过 |
| **渐进式** | 按依赖层级迁移，底层先于上层 |
| **可维护** | 统一代码风格，完善文档 |

### 1.2 当前状态

| 模块 | 总文件数 | 已迁移 TS | 待迁移 JS | 覆盖率 |
|------|----------|-----------|-----------|--------|
| **Server** | 33 | 33 | 0 | **100%** ✅ |
| **Client** | ~35 | 14 | 21 | 40% |
| **Mobile** | ~50 | 18 | 32 | 36% |
| **共享包** | 2 | 2 | 0 | 100% |

---

## 二、核心策略

### 2.1 分层迁移顺序

```
Layer 1: 基础设施层 (Infrastructure)
         ├── 数据库工具 (db.js, db-helpers.js)
         ├── 配置文件 (config/*.js)
         └── 工具函数 (utils/*.js)
              ↓
Layer 2: 服务层 (Services)
         ├── Server Services (services/*.js)
         ├── Mobile Context (context/*.js)
         └── API 客户端 (已完成)
              ↓
Layer 3: 业务层 (Business Logic)
         ├── Server Routes (routes/*.js)
         ├── Mobile Screens (screens/*.js)
         └── Client Components (components/*.jsx)
              ↓
Layer 4: 入口层 (Entry Points)
         ├── server.js
         ├── App.js (Mobile)
         └── index.js (Client)
```

### 2.2 迁移原则

1. **依赖优先**: 被依赖的模块先迁移
2. **测试驱动**: 迁移前后运行测试
3. **增量提交**: 每个模块完成后单独提交
4. **双文件清理**: 迁移完成后删除原 `.js` 文件
5. **类型严格**: 目标 `strict: true`，渐进启用

---

## 三、详细文件清单

### 3.1 Server 端文件清单

#### 3.1.1 Layer 1: 基础设施 (Infrastructure) ✅ 完成

| 文件 | 复杂度 | 优先级 | 状态 | 依赖 |
|------|--------|--------|------|------|
| `server/db.ts` | 中 | P0 | ✅ | - |
| `server/utils/db-helpers.ts` | 中 | P0 | ✅ | db.ts |
| `server/utils/file-helpers.ts` | 低 | P1 | ✅ | - |
| `server/utils/profiler.ts` | 低 | P2 | ✅ | - |
| `server/utils/cache.ts` | 低 | P2 | ✅ | - |
| `server/utils/prepared-statements.ts` | 高 | P1 | ✅ | db-helpers |
| `server/utils/schema-migration.ts` | 高 | P2 | ✅ | db |
| `server/utils/equipment-migration.ts` | 中 | P2 | ✅ | db |
| `server/utils/film-struct-migration.ts` | 高 | P2 | ✅ | db |
| `server/utils/migration.ts` | 中 | P2 | ✅ | db |
| `server/utils/filmlab-wb.ts` | 中 | P2 | ✅ | - |
| `server/utils/image-lut.ts` | 中 | P1 | ✅ | - |
| `server/config/multer.ts` | 低 | P1 | ✅ | - |
| `server/config/paths.ts` | 低 | P1 | ✅ | - |
| `server/config/db-config.ts` | 低 | P1 | ✅ | - |
| `server/conflict-resolver.ts` | 中 | P2 | ✅ | db |

**小计**: 16 文件 ✅ 全部完成

#### 3.1.2 Layer 2: 服务层 (Services) ✅ 完成

| 文件 | 复杂度 | 优先级 | 状态 | 依赖 |
|------|--------|--------|------|------|
| `server/services/roll-creation-service.ts` | 高 | P0 | ✅ | db-helpers, file-helpers |
| `server/services/roll-service.ts` | 高 | P0 | ✅ | db-helpers |
| `server/services/filmlab-service.ts` | 高 | P1 | ✅ | db-helpers, thumbnail |
| `server/services/contactSheetGenerator.ts` | 高 | P1 | ✅ | sharp, file-helpers |
| `server/services/gear-service.ts` | 中 | P1 | ✅ | db-helpers |
| `server/services/tag-service.ts` | 中 | P1 | ✅ | db-helpers |
| `server/services/thumbnail-service.ts` | 中 | P1 | ✅ | sharp |
| `server/services/film/film-item-service.ts` | 中 | P1 | ✅ | db-helpers |

**小计**: 8 文件 ✅ 全部完成

#### 3.1.3 Layer 3: 路由层 (Routes) ✅ 完成

| 文件 | 复杂度 | 优先级 | 状态 | 行数 | 依赖 |
|------|--------|--------|------|------|------|
| `server/routes/rolls.ts` | **极高** | P0 | ✅ | ~1832 | 多个 services |
| `server/routes/photos.ts` | 高 | P0 | ✅ | ~1292 | image-lut, thumbnail |
| `server/routes/uploads.ts` | 中 | P1 | ✅ | ~300 | multer |
| `server/routes/films.ts` | 中 | P1 | ✅ | ~150 | db-helpers |
| `server/routes/equipment.ts` | 中 | P1 | ✅ | ~900 | db-helpers |
| `server/routes/tags.ts` | 低 | P2 | ✅ | ~100 | tag-service |
| `server/routes/locations.ts` | 低 | P2 | ✅ | ~100 | db-helpers |
| `server/routes/stats.ts` | 低 | P2 | ✅ | ~80 | db-helpers |
| `server/routes/search.ts` | 中 | P2 | ✅ | ~150 | db-helpers |
| `server/routes/metadata.ts` | 低 | P2 | ✅ | ~60 | - |
| `server/routes/health.ts` | 低 | P3 | ✅ | ~30 | - |
| `server/routes/conflicts.ts` | 低 | P3 | ✅ | ~50 | conflict-resolver |
| `server/routes/presets.ts` | 低 | P3 | ✅ | ~80 | db-helpers |
| `server/routes/film-items.ts` | 中 | P1 | ✅ | ~282 | film-item-service |
| `server/routes/filmlab.ts` | 高 | P1 | ✅ | ~300 | filmlab-service |

**小计**: 15 文件 ✅ 全部完成

#### 3.1.4 Layer 4: 入口层 ✅ 完成

| 文件 | 复杂度 | 优先级 | 状态 |
|------|--------|--------|------|
| `server/server.ts` | 中 | P0 | ✅ |

**Server 总计**: 33/33 文件已完成 ✅

---

### 3.2 Client 端文件清单

#### 3.2.1 已完成

- ✅ `client/src/api.ts` (1100+ 行)
- ✅ `client/src/components/ModalDialog.tsx`
- ✅ `client/src/components/SquareImage.tsx`
- ✅ `client/src/components/FilterPanel.tsx`
- ✅ `client/src/components/FilmSelector.tsx`
- ✅ `client/src/components/FloatingRefreshButton.tsx`
- ✅ `client/src/components/TitleBar.tsx`
- ✅ `client/src/components/RollLibrary.tsx`
- ✅ `client/src/components/CalendarView.tsx`
- ✅ `client/src/components/VirtualPhotoGrid.tsx`
- ✅ `client/src/components/Overview.tsx`
- ✅ `client/src/components/PhotoGrid.tsx`
- ✅ `client/src/components/FilmInverter.tsx` (1712 行 - 大型组件)
- ✅ `client/src/components/EquipmentManager.tsx` (1154 行 - 大型组件)
- ✅ `client/src/setupTests.ts`
- ✅ `client/src/__tests__/api.test.ts`

#### 3.2.2 待迁移组件

| 文件 | 复杂度 | 优先级 | 状态 |
|------|--------|--------|------|
| `client/src/App.js` | 中 | P1 | ⏳ |
| `client/src/index.js` | 低 | P2 | ⏳ |
| `client/src/components/RollCard.jsx` | 中 | P1 | ⏳ |
| `client/src/components/FilmInverter.jsx` | **极高** | P0 | ✅ 完成 |
| `client/src/components/FilmInventory.jsx` | 高 | P1 | ⏳ |
| `client/src/components/EquipmentManager.jsx` | 中 | P1 | ✅ 完成 |
| `client/src/components/LocationManager.jsx` | 中 | P1 | ⏳ |
| `client/src/components/StatsPanel.jsx` | 中 | P2 | ⏳ |
| `client/src/components/TagManager.jsx` | 中 | P2 | ⏳ |
| `client/src/components/SettingsPanel.jsx` | 低 | P2 | ⏳ |
| 其他小组件 (~15 个) | 低 | P3 | ⏳ |

**Client 总计**: ~21 文件待迁移（已完成 14/35）

---

### 3.3 Mobile 端文件清单

#### 3.3.1 已完成

- ✅ `mobile/src/services/apiService.ts`
- ✅ `mobile/src/types/index.ts`
- ✅ `mobile/src/screens/HomeScreen.tsx`
- ✅ `mobile/src/context/ApiContext.tsx`
- ✅ `mobile/src/setupAxios.ts`

#### 3.3.2 Layer 1: 基础设施 ✅ 完成

| 文件 | 复杂度 | 优先级 | 状态 |
|------|--------|--------|------|
| `mobile/src/context/ApiContext.tsx` | 中 | P0 | ✅ |
| `mobile/src/utils/urls.ts` | 低 | P0 | ✅ |
| `mobile/src/utils/urlHelper.ts` | 低 | P1 | ✅ |
| `mobile/src/utils/fileSystem.ts` | 中 | P1 | ✅ |
| `mobile/src/utils/date.ts` | 低 | P2 | ✅ |
| `mobile/src/setupAxios.ts` | 中 | P0 | ✅ |
| `mobile/src/theme.ts` | 低 | P2 | ✅ |

**小计**: 7 文件 ✅ 全部完成

#### 3.3.3 Layer 2: Hooks ✅ 完成

| 文件 | 复杂度 | 优先级 | 状态 |
|------|--------|--------|------|
| `mobile/src/hooks/useCachedImage.ts` | 中 | P1 | ✅ |
| `mobile/src/hooks/useExposureMonitorSimple.ts` | 高 | P2 | ✅ |
| `mobile/src/hooks/useExposureMonitorPolling.ts` | 高 | P2 | ✅ |
| `mobile/src/hooks/useExposurePolling.ts` | 高 | P2 | ✅ |

**小计**: 4 文件 ✅ 全部完成

#### 3.3.4 Layer 3: 组件

| 文件 | 复杂度 | 优先级 | 状态 |
|------|--------|--------|------|
| `mobile/src/components/ShotModeModal.js` | **极高** | P0 | ✅ 完成 (1457 行) |
| `mobile/src/components/CachedImage.js` | 中 | P0 | ⏳ |
| `mobile/src/components/TouchScale.js` | 低 | P1 | ⏳ |
| `mobile/src/components/CoverOverlay.js` | 低 | P1 | ⏳ |
| `mobile/src/components/FilmCard.js` | 中 | P1 | ⏳ |
| `mobile/src/components/TagEditModal.js` | 中 | P1 | ⏳ |
| `mobile/src/components/EquipmentPicker.js` | 中 | P1 | ⏳ |
| 其他组件 (~10 个) | 低-中 | P2 | ⏳ |

**小计**: ~17 文件 (已完成 8)

#### 3.3.5 Layer 4: Screens

| 文件 | 复杂度 | 优先级 | 状态 |
|------|--------|--------|------|
| `mobile/src/screens/HomeScreen.js` | 高 | P0 | 🔄 |
| `mobile/src/screens/RollDetailScreen.js` | 高 | P0 | ⏳ |
| `mobile/src/screens/PhotoViewScreen.js` | 高 | P0 | ⏳ |
| `mobile/src/screens/SettingsScreen.js` | 中 | P1 | ⏳ |
| `mobile/src/screens/FilmsScreen.js` | 中 | P1 | ⏳ |
| `mobile/src/screens/FilmRollsScreen.js` | 中 | P1 | ⏳ |
| `mobile/src/screens/ThemesScreen.js` | 中 | P2 | ⏳ |
| `mobile/src/screens/TagDetailScreen.js` | 中 | P2 | ⏳ |
| `mobile/src/screens/FavoritesScreen.js` | 中 | P2 | ⏳ |
| `mobile/src/screens/NegativeScreen.js` | 中 | P2 | ⏳ |
| 其他 screens (~5 个) | 低-中 | P3 | ⏳ |

**小计**: ~15 文件

#### 3.3.6 Layer 5: 入口

| 文件 | 复杂度 | 优先级 | 状态 |
|------|--------|--------|------|
| `mobile/App.js` | 中 | P0 | ⏳ |

**需清理** (删除重复):
- ❌ `mobile/src/screens/HomeScreen.js` (待删除，使用 .tsx 版本)

**Mobile 总计**: ~47 文件待迁移

---

## 四、执行计划

### Phase 1: 清理与核心基础 ✅ 完成

**目标**: 清理重复文件，迁移核心数据库层

#### 1.1 清理重复文件
- [x] 删除 `server/services/thumbnail-service.js`
- [x] 删除 `server/services/roll-service.js`
- [x] 删除 `mobile/src/screens/HomeScreen.js`
- [x] 运行测试确认无回归

#### 1.2 Server 核心迁移
- [x] 迁移 `server/db.js` → `server/db.ts`
- [x] 迁移 `server/utils/db-helpers.js` → `.ts`
- [x] 迁移 `server/config/paths.js` → `.ts`
- [x] 迁移 `server/config/multer.js` → `.ts`

#### 1.3 Mobile 核心迁移
- [ ] 迁移 `mobile/src/context/ApiContext.js` → `.tsx`
- [ ] 迁移 `mobile/src/utils/urls.js` → `.ts`
- [ ] 迁移 `mobile/src/setupAxios.js` → `.ts`

**验收标准**:
- ✅ TypeScript 编译 0 错误
- ✅ 所有测试通过 (31 tests)
- ✅ ESLint 0 错误

---

### Phase 2: Server 服务层 ✅ 完成

**目标**: 完成 Server 端 Services 和 Utils 迁移

#### 2.1 Utils 层
- [x] `server/utils/file-helpers.js` → `.ts`
- [x] `server/utils/prepared-statements.js` → `.ts`
- [x] `server/utils/profiler.js` → `.ts`
- [x] `server/utils/cache.js` → `.ts`
- [x] `server/utils/filmlab-wb.js` → `.ts`
- [x] `server/utils/migration.js` → `.ts`
- [x] `server/utils/schema-migration.js` → `.ts`
- [x] `server/utils/equipment-migration.js` → `.ts`
- [x] `server/utils/film-struct-migration.js` → `.ts`
- [x] `server/config/db-config.js` → `.ts`

#### 2.2 Services 层
- [x] `server/services/roll-creation-service.js` → `.ts`
- [x] `server/services/gear-service.js` → `.ts`
- [x] `server/services/tag-service.js` → `.ts`
- [x] `server/services/filmlab-service.js` → `.ts`
- [x] `server/services/contactSheetGenerator.js` → `.ts`
- [x] `server/services/film/film-item-service.js` → `.ts`

**验收标准**:
- ✅ Services 层 100% TypeScript
- ✅ 所有测试通过
- ✅ 删除对应的 `.d.ts` 声明文件 (已合并到 `.ts`)

---

### Phase 3: Server 路由层 ✅ 完成

**目标**: 完成 Server 端所有 Routes 迁移

#### 3.1 核心路由 (高复杂度)
- [x] `server/routes/rolls.js` → `.ts` (1832 行)
- [x] `server/routes/photos.js` → `.ts` (1292 行)
- [x] `server/routes/uploads.js` → `.ts`

#### 3.2 业务路由
- [x] `server/routes/films.js` → `.ts`
- [x] `server/routes/equipment.js` → `.ts`
- [x] `server/routes/film-items.js` → `.ts`
- [x] `server/routes/filmlab.js` → `.ts`

#### 3.3 辅助路由
- [x] `server/routes/tags.js` → `.ts`
- [x] `server/routes/locations.js` → `.ts`
- [x] `server/routes/stats.js` → `.ts`
- [x] `server/routes/search.js` → `.ts`
- [x] `server/routes/metadata.js` → `.ts`
- [x] `server/routes/health.js` → `.ts`
- [x] `server/routes/conflicts.js` → `.ts`
- [x] `server/routes/presets.js` → `.ts`

#### 3.4 入口文件
- [x] `server/server.js` → `.ts`
- [x] `server/conflict-resolver.js` → `.ts`

**验收标准**:
- ✅ Server 端 100% TypeScript
- ✅ 所有测试通过 (31 tests)
- ✅ API 功能正常

---

### Phase 4: Mobile 基础层 (进行中)

**目标**: 完成 Mobile 端核心基础设施迁移

#### 4.1 Utils & Context ✅ 完成
- [x] 完成 `mobile/src/context/ApiContext.tsx`
- [x] `mobile/src/utils/urlHelper.js` → `.ts`
- [x] `mobile/src/utils/fileSystem.js` → `.ts`
- [x] `mobile/src/utils/date.js` → `.ts`
- [x] `mobile/src/theme.js` → `.ts`
- [x] `mobile/src/utils/urls.ts` (已存在)
- [x] `mobile/src/setupAxios.ts` (已存在)

#### 4.2 Hooks ✅ 完成
- [x] `mobile/src/hooks/useCachedImage.js` → `.ts`
- [x] `mobile/src/hooks/useExposureMonitorSimple.js` → `.ts`
- [x] `mobile/src/hooks/useExposureMonitorPolling.js` → `.ts`
- [x] `mobile/src/hooks/useExposurePolling.js` → `.ts`

#### 4.3 核心组件 ⏳ 待完成
- [ ] `mobile/src/components/CachedImage.js` → `.tsx`
- [ ] `mobile/src/components/TouchScale.js` → `.tsx`
- [ ] `mobile/src/components/CoverOverlay.js` → `.tsx`
- [ ] 其他组件 (~13个)

**验收标准**:
- ✅ 核心 Utils/Hooks 完成
- ⏳ 组件迁移中
- ⏳ 开发服务器测试

---

### Phase 5: Mobile Screens (Day 14-18)

**目标**: 完成 Mobile 端所有 Screens 迁移

#### 5.1 核心 Screens
- [ ] 完成 `HomeScreen.tsx` (解决类型问题)
- [ ] `mobile/src/screens/RollDetailScreen.js` → `.tsx`
- [ ] `mobile/src/screens/PhotoViewScreen.js` → `.tsx`

#### 5.2 业务 Screens
- [ ] `mobile/src/screens/SettingsScreen.js` → `.tsx`
- [ ] `mobile/src/screens/FilmsScreen.js` → `.tsx`
- [ ] `mobile/src/screens/FilmRollsScreen.js` → `.tsx`
- [ ] 其他 Screens 迁移

#### 5.3 剩余组件
- [ ] 迁移所有 `components/*.js` → `.tsx`
- [ ] 迁移 `App.js` → `App.tsx`

**验收标准**:
- ✅ Mobile 端 100% TypeScript
- ✅ 开发环境正常
- ✅ 编译构建成功

---

### Phase 6: Client 组件 (Day 19-22)

**目标**: 完成 Client 端所有组件迁移

#### 6.1 核心组件
- [ ] `client/src/components/FilmInverter.jsx` → `.tsx`
- [ ] `client/src/components/FilmInventory.jsx` → `.tsx`
- [ ] `client/src/components/PhotoGrid.jsx` → `.tsx`

#### 6.2 业务组件
- [ ] `client/src/components/RollCard.jsx` → `.tsx`
- [ ] `client/src/components/EquipmentManager.jsx` → `.tsx`
- [ ] `client/src/components/LocationManager.jsx` → `.tsx`
- [ ] 其他组件迁移

#### 6.3 入口文件
- [ ] `client/src/App.js` → `.tsx`
- [ ] `client/src/index.js` → `.tsx`

**验收标准**:
- ✅ Client 端 100% TypeScript
- ✅ 开发环境正常
- ✅ Electron 构建成功

---

### Phase 7: 质量加固 (Day 23-25)

**目标**: 启用严格模式，完善测试

#### 7.1 TypeScript 严格化
- [ ] 启用 `strict: true` (所有 tsconfig)
- [ ] 修复所有 `any` 类型
- [ ] 启用 `noImplicitAny: true`

#### 7.2 测试完善
- [ ] 补充 Server Services 测试
- [ ] 补充 Client 组件测试
- [ ] 补充 Mobile 组件测试

#### 7.3 文档更新
- [ ] 更新 README
- [ ] 更新 DEVELOPER-MANUAL
- [ ] 归档迁移文档

**验收标准**:
- ✅ 所有测试通过
- ✅ ESLint 0 errors, 0 warnings
- ✅ TypeScript strict 模式通过

---

## 五、风险与缓解

| 风险 | 影响 | 缓解措施 |
|------|------|---------|
| React Native Paper 类型严格 | 组件编译失败 | 创建类型垫片或使用 `@ts-ignore` |
| 大文件迁移 (rolls.js ~1500 行) | 回归风险高 | 拆分为多个模块，增量迁移 |
| 测试覆盖不足 | 回归难发现 | 迁移前补充测试 |
| 第三方库缺少类型 | 编译警告 | 创建 `declarations.d.ts` |

---

## 六、验收标准

### 最终验收清单

- [x] **Server**: 100% TypeScript (0 .js 核心文件)
- [ ] **Client**: 100% TypeScript (0 .jsx 文件)
- [ ] **Mobile**: 100% TypeScript (0 .js 文件)
- [x] **测试**: 所有测试通过 (31 Server tests)
- [ ] **ESLint**: 0 errors, <10 warnings
- [ ] **TypeScript**: `strict: true` 编译通过
- [ ] **构建**: Electron 打包成功
- [ ] **文档**: 开发者文档更新完成

---

## 七、变更日志

| 日期 | 任务 | 状态 | 备注 |
|------|------|------|------|
| 2026-01-15 | 创建迁移计划文档 | ✅ 完成 | |
| 2026-01-15 | 创建 feature 分支 | ✅ 完成 | `feature/full-typescript-migration` |
| 2026-01-15 | Phase 1 核心基础 | ✅ 完成 | db.ts, db-helpers.ts, config/*.ts |
| 2026-01-16 | Phase 2 Server 服务层 | ✅ 完成 | 10 utils + 6 services |
| 2026-01-16 | Phase 3 Server 路由层 | ✅ 完成 | 15 routes + server.ts |
| 2026-01-14 | 修复 TypeScript 编译错误 | ✅ 完成 | 修复 19 个类型错误 |
| 2026-01-14 | Phase 4 Mobile Utils/Hooks | ✅ 完成 | 7 utils + 4 hooks |
| 2026-01-14 | Client 简单组件迁移 | ✅ 完成 | 8 个简单组件 |
| 2026-01-14 | FilmInverter 大型组件 | ✅ 完成 | 1712 行，完整类型定义 |
| 2026-01-14 | ShotModeModal 大型组件 | ✅ 完成 | 1457 行 (Mobile) |
| 2026-01-14 | EquipmentManager 大型组件 | ✅ 完成 | 1154 行 (Client) |
| - | Phase 4 Mobile 组件 | ⏳ 下一步 | ~16 个组件待迁移 |

---

## 八、参考文档

- [OPTIMIZATION-PLAN-2026-01-14.md](./OPTIMIZATION-PLAN-2026-01-14.md) - 前期优化计划
- [mobile-api-migration.md](./mobile-api-migration.md) - Mobile API 迁移指南
- [dev-manual/01-architecture.md](./dev-manual/01-architecture.md) - 系统架构文档

---

*文档版本: 1.0 | 最后更新: 2026-01-15*
