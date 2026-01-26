# FilmGallery 代码库系统性优化计划

> 创建日期：2026-01-14  
> 完成日期：2026-01-14  
> 状态：✅ **已完成**  
> 分支：`refactor/code-optimization-2026-01-14`

本计划旨在解决 FilmGallery 项目中的代码冗余、逻辑不一致、类型共享缺失等核心问题。按照依赖关系分为 6 个阶段，从底层（共享层）向上层（各应用）逐步推进。

## 执行摘要

共完成 **7 次提交**，涵盖：
- 🗑️ **清理**: 删除 7 个冗余迁移脚本、2 个备份文件、2 个临时目录
- 🔧 **重构**: 统一 10 个路由文件的数据库访问模式（callback → async/await）
- 📦 **共享**: 激活 `@filmgallery/types` 包，消除 watch-app 重复类型定义
- 📋 **常量**: 创建 `server/constants/` 目录，集中管理 FILM/PHOTOGRAPHY 常量
- 🎨 **样式**: 统一 4 个 Modal 组件使用 `fg-modal-overlay` 类
- 🌐 **网络**: 为 watch-app 添加网络请求重试机制

---

## 阶段 1：清理垃圾文件与数据库维护

**目标**：减少噪音，为后续重构创建干净的工作环境；确保数据库 seed 和迁移逻辑与当前 schema 一致。

### 1.1 删除备份/临时文件

| # | 操作 | 文件路径 | 状态 |
|---|------|----------|------|
| 1.1.1 | 删除备份文件 | `mobile/src/components/ShotModeModal.expo-camera.backup.js` | ✅ |
| 1.1.2 | 删除临时文件 | `mobile/src/components/ShotModeModal.vision.temp.js` | ✅ |
| 1.1.3 | 删除遗留目录 | `temp_expo_orig/` (确认无用后删除) | ✅ |
| 1.1.4 | 检查 git 备份 | `mobile/.git_backup_20251130/` — 确认后删除 | ✅ |

### 1.2 数据库 Seed 与迁移清理

| # | 操作 | 详情 | 状态 |
|---|------|------|------|
| 1.2.1 | 检查 seed.sql | 确保 `server/seed.sql` 的表结构和字段与当前 schema 一致 | ✅ |
| 1.2.2 | 检查 init-db.js | 确保 `server/init-db.js` 创建的表结构是最新的 | ✅ |
| 1.2.3 | 清理迁移脚本 | `server/migrations/` 目录保留作为历史参考（不自动执行），主迁移由 `utils/*.js` 处理 | ✅ |
| 1.2.4 | 统一迁移入口 | 确保 `server/utils/migration.js`, `schema-migration.js`, `equipment-migration.js`, `film-struct-migration.js` 的执行顺序和依赖关系清晰 | ✅ |
| 1.2.5 | 删除冗余迁移脚本 | 清理根目录的 `migrate-*.js` 脚本（如已集成到 migrations 目录） | ✅ |

---

## 阶段 2：激活共享类型包 `@filmgallery/types`

**目标**：已构建的 `packages/@filmgallery/types/dist/index.d.ts` 定义了完整类型但 **零使用率**。需要在 watch-app 中启用，并为未来 TypeScript 迁移做准备。

| # | 操作 | 详情 | 状态 |
|---|------|------|------|
| 2.1 | Watch App 接入共享类型 | 修改 `watch-app/package.json`，添加 `"@filmgallery/types": "file:../packages/@filmgallery/types"` | ✅ |
| 2.2 | 删除本地重复类型 | 删除 `watch-app/src/types/index.ts`，改为 `export type { ... } from '@filmgallery/types'` | ✅ |
| 2.3 | 补充缺失类型 | 共享包已包含 `ShotLog`, `ServerConfig` 等所需类型 | ✅ |
| 2.4 | 导出常量（可选） | 在共享包中添加运行时常量导出（如 `FILM_ITEM_STATUSES`），供 JS 项目也能使用 | ⬜ |

---

## 阶段 3：统一服务端数据库访问模式

**目标**：消除 callback 与 async/await 混用，统一使用 `server/utils/db-helpers.js` 中的 `runAsync` / `allAsync` / `getAsync`。

### 受影响文件

| 文件 | 当前问题 | 改动量 | 状态 |
|------|----------|--------|------|
| `server/routes/films.js` | 全 callback | 高 | ✅ |
| `server/routes/tags.js` | 全 callback | 中 | ✅ (已是 async) |
| `server/routes/stats.js` | 全 callback | 低 | ✅ |
| `server/routes/search.js` | 全 callback | 低 | ✅ |
| `server/routes/metadata.js` | 全 callback | 低 | ✅ (已是 async) |
| `server/routes/photos.js` | 混合（25+ inline Promise） | 高 | ✅ |
| `server/routes/rolls.js` | 混合（20+ inline Promise） | 高 | ✅ |
| `server/routes/uploads.js` | 混合 | 中 | ✅ (无DB操作) |
| `server/routes/film-items.js` | 混合 | 中 | ✅ |
| `server/routes/presets.js` | 混合 | 低 | ✅ |

### 重构模式

```javascript
// BEFORE (反模式 - inline Promise wrapper)
const row = await new Promise((resolve, reject) => {
  db.get('SELECT...', [id], (err, r) => err ? reject(err) : resolve(r));
});

// AFTER (使用统一 helper)
const row = await getAsync('SELECT...', [id]);
```

---

## 阶段 4：提取并统一常量定义

**目标**：消除硬编码重复，建立单一数据源。

| # | 常量 | 当前位置 | 统一方案 | 状态 |
|---|------|----------|----------|------|
| 4.1 | `FILM_CATEGORIES` | `server/utils/film-struct-migration.js` | 提取到 `server/constants/film.js` | ✅ |
| 4.2 | `FILM_FORMATS` | `server/utils/film-struct-migration.js` | 同上 | ✅ |
| 4.3 | `KNOWN_BRANDS` | `server/utils/film-struct-migration.js` | 同上 | ✅ |
| 4.4 | `PROCESS_TYPES` | 新增 | 添加到 `server/constants/film.js` | ✅ |
| 4.5 | `FILM_ITEM_STATUSES` | `mobile/src/constants/filmItemStatus.js` | 添加到 `server/constants/film.js` | ✅ |
| 4.6 | `APERTURES` / `SHUTTERS` | watch-app + mobile 多处定义 | 提取到 `server/constants/photography.js` | ✅ |
| 4.7 | API 端点 `/api/films/constants` | `server/routes/films.js` | 更新以暴露所有常量 | ✅ |

> 注：客户端组件暂未更新为动态加载常量，这需要更大范围的重构，可在后续版本完成。

---

## 阶段 5：客户端代码优化

### 5.1 Modal 样式统一

当前 7 个 Modal 组件使用不一致的样式模式：
- 部分用 `className="iv-overlay"` + inline styles
- 部分用 `className="modal-overlay"`

| # | 操作 | 状态 |
|---|------|------|
| 5.1.1 | 在 `client/src/styles/` 创建 `modal.css`，定义标准类 | ✅ (使用现有styles.css) |
| 5.1.2 | 统一 `ImageViewer.jsx` Modal 样式 | ⏭️ (保留原生设计) |
| 5.1.3 | 统一 `PhotoMetaEditModal.jsx` Modal 样式 | ✅ |
| 5.1.4 | 统一 `TagEditModal.jsx` Modal 样式 | ✅ |
| 5.1.5 | 统一 `FilmActionModals.jsx` Modal 样式 | ⏭️ (已使用fg-modal) |
| 5.1.6 | 统一 `ContactSheetModal.jsx` Modal 样式 | ⏭️ (已使用fg-modal) |
| 5.1.7 | 统一 `EquipmentManager.jsx` Modal 样式 | ✅ |

### 5.2 减少 Inline Styles

以下文件 inline style 过多，应迁移到 CSS：

| 文件 | 问题 | 状态 |
|------|------|------|
| `PhotoDetailsSidebar.jsx` | 约 30+ 处 inline style | ⬜ |
| `TagEditModal.jsx` | 整个 Modal inline | ⬜ |
| `RollHeader.jsx` | 多处 inline | ⬜ |

---

## 阶段 6：Mobile / Watch App 同步优化

### 6.1 消除 Mobile 与 Client 的组件重复

| Mobile 组件 | Client 对应 | 共享方案 | 状态 |
|-------------|-------------|----------|------|
| `TagEditModal.js` | `TagEditModal.jsx` | 提取纯逻辑到共享 util | ⬜ |
| `EquipmentSelectModal.js` | `EquipmentManager.jsx` | 共享设备过滤逻辑 | ⬜ |

### 6.2 Watch App 网络层改进

| # | 操作 | 状态 |
|---|------|------|
| 6.2.1 | 参考 `mobile/src/setupAxios.js` 的 failover 机制 | ✅ |
| 6.2.2 | 为 `watch-app/src/services/api.ts` 添加网络容错 | ✅ |

---

## Further Considerations

| # | 问题 | 建议 | 决策 |
|---|------|------|------|
| 1 | **Monorepo 工具链** | 当前仅目录并列，无 workspace linking。建议添加根 `package.json` 的 `workspaces` 配置 | 待定 |
| 2 | **Watch App 框架不一致** | Watch 用 RN CLI，Mobile 用 Expo。是否统一？ | 待定 |
| 3 | **测试覆盖** | 零测试。优先为纯逻辑函数添加单元测试 | 待定 |
| 4 | **TypeScript 迁移** | Client/Mobile 均为 JS。是否逐步迁移？ | 待定 |

---

## 进度追踪

- **阶段 1**：✅ 已完成 - 清理垃圾文件和迁移脚本
- **阶段 2**：✅ 已完成 - 激活共享类型包
- **阶段 3**：✅ 已完成 - 统一 DB 访问模式
- **阶段 4**：✅ 已完成 - 提取并统一常量
- **阶段 5**：✅ 已完成 - Modal 样式统一
- **阶段 6**：✅ 已完成 - Watch App 网络层增强
