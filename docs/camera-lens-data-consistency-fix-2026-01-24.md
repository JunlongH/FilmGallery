# 相机与镜头数据一致性修复方案

**日期**: 2026-01-24  
**状态**: ✅ 已实施  
**优先级**: 高

---

## 1. 问题描述

### 1.1 核心问题
在 Statistics 页面的镜头统计中，同一个 PS 机（Point & Shoot 傻瓜相机）的镜头出现了三种不同的展示格式：

| 格式类型 | 示例 | 来源 |
|---------|------|------|
| 最初数据形式 | `Konica big mini 201` | 早期手动输入的 legacy `lens` 文本字段 |
| 期待的形式 | `Konica bigmini 201 35mm f/3.5` | 理想的统一格式：相机名 + 镜头规格 |
| 修改时产生的格式 | `35mm f/3.5` | 更新 roll 时服务端生成的固定镜头文本 |

### 1.2 根本原因分析

#### A. 数据来源多样性
系统中存在**四个**不同的镜头数据来源：

1. **`rolls.lens`** (Legacy 文本字段)
   - 早期版本直接存储用户输入的镜头名称
   - 没有标准化格式，可能是任意文本
   
2. **`rolls.lens_equip_id`** (设备外键)
   - 关联到 `equip_lenses` 表
   - 用于可更换镜头相机
   
3. **固定镜头隐式派生**
   - 从 `equip_cameras.has_fixed_lens = 1` 的相机派生
   - 使用 `fixed_lens_focal_length` 和 `fixed_lens_max_aperture`
   
4. **`roll_gear` 表 (聚合统计)**
   - 存储 roll 下所有 photo 的 camera/lens/photographer 组合
   - 用于 Statistics 页面展示

#### B. PS机固定镜头处理逻辑问题

当前服务端在更新 roll 时处理固定镜头的逻辑（[rolls.js#L1147-L1155](server/routes/rolls.js#L1147-L1155)）：

```javascript
if (camRow && camRow.has_fixed_lens === 1) {
  lens_equip_id = null;
  lens = `${camRow.fixed_lens_focal_length}mm f/${camRow.fixed_lens_max_aperture}`;
  // 这里只存储了规格，缺少相机品牌型号前缀！
}
```

**问题**：生成的 `lens` 文本仅包含 `35mm f/3.5`，而非 `Konica bigmini 201 35mm f/3.5`。

#### C. Statistics 统计查询分散

[stats.js#L41-L60](server/routes/stats.js#L41-L60) 中的 `sqlLenses` 查询合并了四个来源：

```sql
-- 来源1: roll_gear 表
SELECT value as name, COUNT(*) as count FROM roll_gear WHERE type='lens'

UNION ALL

-- 来源2: Legacy rolls.lens 字段
SELECT lens as name, COUNT(*) as count FROM rolls 
WHERE lens IS NOT NULL AND lens_equip_id IS NULL 
  AND camera_equip_id IS NULL OR camera_equip_id NOT IN (fixed lens cameras)

UNION ALL

-- 来源3: 显式镜头设备表
SELECT (l.brand || ' ' || l.model) as name FROM rolls r JOIN equip_lenses l

UNION ALL

-- 来源4: 固定镜头相机 (格式问题的来源！)
SELECT (c.brand || ' ' || c.model || ' ' || COALESCE(c.fixed_lens_focal_length, '') || 'mm') as name
FROM rolls r JOIN equip_cameras c WHERE c.has_fixed_lens = 1
```

**问题**：来源4的格式 `Konica bigmini 201 35mm` 缺少光圈信息，且与 `roll_gear` 中可能存储的 `35mm f/3.5` 无法合并去重。

---

## 2. 数据模型分析

### 2.1 当前数据流

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              数据录入阶段                                    │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌──────────────┐     ┌──────────────┐     ┌──────────────────────────────┐│
│  │  新建 Roll   │     │  更新 Roll   │     │  更新 Photo (单张)           ││
│  │              │     │              │     │                              ││
│  │ camera_equip │     │ camera_equip │     │ camera (text)                ││
│  │ lens_equip   │────▶│ lens_equip   │     │ lens (text)                  ││
│  │              │     │              │     │                              ││
│  └──────┬───────┘     └──────┬───────┘     └──────────────┬───────────────┘│
│         │                    │                            │                │
│         ▼                    ▼                            ▼                │
│  ┌──────────────────────────────────────────────────────────────────────┐  │
│  │                    固定镜头检测 (has_fixed_lens=1)                    │  │
│  │  - lens_equip_id = NULL                                              │  │
│  │  - lens = "{focal}mm f/{aperture}" ← 问题：缺少相机名前缀！          │  │
│  └──────────────────────────────────────────────────────────────────────┘  │
│         │                    │                            │                │
│         ▼                    ▼                            ▼                │
│  ┌──────────────────────────────────────────────────────────────────────┐  │
│  │                         roll_gear 表同步                              │  │
│  │  - addOrUpdateGear(rollId, 'lens', lens_text)                        │  │
│  │  - 智能去重：子串吸收                                                 │  │
│  └──────────────────────────────────────────────────────────────────────┘  │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│                              数据查询阶段                                    │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  Statistics 页面 (stats.js)                                                 │
│  ┌──────────────────────────────────────────────────────────────────────┐  │
│  │  UNION ALL 合并四个来源                                               │  │
│  │                                                                       │  │
│  │  ① roll_gear.value (type='lens')                                     │  │
│  │     └─▶ "35mm f/3.5" (已污染的数据)                                  │  │
│  │                                                                       │  │
│  │  ② rolls.lens (legacy, 非固定镜头相机)                               │  │
│  │     └─▶ "Konica big mini 201" (历史遗留)                             │  │
│  │                                                                       │  │
│  │  ③ equip_lenses (显式镜头)                                           │  │
│  │     └─▶ "Nikon AF-S 50mm f/1.8" (正常)                               │  │
│  │                                                                       │  │
│  │  ④ equip_cameras (固定镜头)                                          │  │
│  │     └─▶ "Konica bigmini 201 35mm" (缺少光圈)                         │  │
│  │                                                                       │  │
│  │  merge() 尝试去重但因格式不一致失败                                   │  │
│  └──────────────────────────────────────────────────────────────────────┘  │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 2.2 期望的数据模型

对于 **PS机/固定镜头相机**：

1. **数据库存储**：
   - `rolls.camera_equip_id` → 关联到 `equip_cameras` (has_fixed_lens=1)
   - `rolls.lens_equip_id` = NULL (固定镜头无需单独关联)
   - `rolls.lens` = 完整描述: `{camera_brand} {camera_model} {focal}mm f/{aperture}`

2. **roll_gear 表**：
   - 仅存储规范化的镜头名称
   - 固定镜头相机的 lens 应该与相机名一致或不重复存储

3. **Statistics 查询**：
   - 固定镜头相机的镜头应该以统一格式展示
   - 确保合并逻辑能正确去重

---

## 3. 解决方案

### 3.1 修复策略概览

| 阶段 | 操作 | 影响范围 |
|-----|------|---------|
| Phase 1 | 修复服务端固定镜头文本生成逻辑 | 新数据正确 |
| Phase 2 | 修复 Statistics 查询格式一致性 | 统计展示正确 |
| Phase 3 | 数据库清理脚本 | 历史数据修复 |
| Phase 4 | 发布端自动迁移 | 生产数据修复 |

### 3.2 Phase 1: 修复服务端镜头文本生成

#### 3.2.1 修改 `server/routes/rolls.js` - 创建 Roll

位置: 约 L136-143

**当前代码**:
```javascript
if (camRow.has_fixed_lens === 1) {
  finalLensEquipId = null;
  finalLensText = `${camRow.fixed_lens_focal_length}mm f/${camRow.fixed_lens_max_aperture}`;
}
```

**修改为**:
```javascript
if (camRow.has_fixed_lens === 1) {
  finalLensEquipId = null;
  // 完整格式: 相机品牌型号 + 镜头规格
  const cameraPrefix = [camRow.camera_brand, camRow.camera_model].filter(Boolean).join(' ').trim();
  const lensSpec = `${camRow.fixed_lens_focal_length}mm f/${camRow.fixed_lens_max_aperture}`;
  finalLensText = cameraPrefix ? `${cameraPrefix} ${lensSpec}` : lensSpec;
}
```

**注意**: 需要修改查询语句，确保返回 `camera_brand` 和 `camera_model`：

```sql
SELECT c.has_fixed_lens, c.fixed_lens_focal_length, c.fixed_lens_max_aperture, 
       c.brand as camera_brand, c.model as camera_model,
       f.name as format_name
FROM equip_cameras c
LEFT JOIN ref_film_formats f ON c.format_id = f.id
WHERE c.id = ?
```

#### 3.2.2 修改 `server/routes/rolls.js` - 更新 Roll

位置: 约 L1147-1155

**当前代码**:
```javascript
const camRow = await getAsync('SELECT has_fixed_lens, fixed_lens_focal_length, fixed_lens_max_aperture FROM equip_cameras WHERE id = ?', [camera_equip_id]);
if (camRow && camRow.has_fixed_lens === 1) {
  lens_equip_id = null;
  lens = `${camRow.fixed_lens_focal_length}mm f/${camRow.fixed_lens_max_aperture}`;
}
```

**修改为**:
```javascript
const camRow = await getAsync(`
  SELECT has_fixed_lens, fixed_lens_focal_length, fixed_lens_max_aperture, brand, model 
  FROM equip_cameras WHERE id = ?
`, [camera_equip_id]);
if (camRow && camRow.has_fixed_lens === 1) {
  lens_equip_id = null;
  // 完整格式: 相机品牌型号 + 镜头规格
  const cameraPrefix = [camRow.brand, camRow.model].filter(Boolean).join(' ').trim();
  const lensSpec = `${camRow.fixed_lens_focal_length}mm f/${camRow.fixed_lens_max_aperture}`;
  lens = cameraPrefix ? `${cameraPrefix} ${lensSpec}` : lensSpec;
}
```

### 3.3 Phase 2: 修复 Statistics 查询格式

#### 修改 `server/routes/stats.js`

位置: 约 L41-60

**当前代码（来源4）**:
```sql
SELECT (c.brand || ' ' || c.model || ' ' || COALESCE(c.fixed_lens_focal_length, '') || 'mm') as name
```

**修改为**:
```sql
SELECT (
  COALESCE(c.brand, '') || ' ' || COALESCE(c.model, '') || ' ' || 
  COALESCE(c.fixed_lens_focal_length, '') || 'mm f/' || 
  COALESCE(c.fixed_lens_max_aperture, '')
) as name
```

### 3.4 Phase 3: 历史数据清理脚本

创建 `server/scripts/fix-fixed-lens-data.js`:

```javascript
/**
 * 固定镜头相机数据修复脚本
 * 
 * 功能:
 * 1. 修复 rolls.lens 字段格式
 * 2. 清理 roll_gear 表中的重复/不一致数据
 * 
 * 运行: node server/scripts/fix-fixed-lens-data.js [--dry-run]
 */

const sqlite3 = require('sqlite3');
const path = require('path');
const fs = require('fs');

const isDryRun = process.argv.includes('--dry-run');

// Database setup...

async function main() {
  console.log('='.repeat(60));
  console.log('Fixed Lens Camera Data Repair Script');
  console.log(isDryRun ? '*** DRY RUN MODE ***' : '*** LIVE MODE ***');
  console.log('='.repeat(60));

  // Step 1: 找出所有使用固定镜头相机的 rolls
  const affectedRolls = await allAsync(`
    SELECT 
      r.id as roll_id,
      r.title,
      r.lens as current_lens,
      r.camera_equip_id,
      c.brand,
      c.model,
      c.fixed_lens_focal_length,
      c.fixed_lens_max_aperture
    FROM rolls r
    JOIN equip_cameras c ON r.camera_equip_id = c.id
    WHERE c.has_fixed_lens = 1
  `);

  console.log(`Found ${affectedRolls.length} rolls with fixed-lens cameras`);

  // Step 2: 修复每个 roll
  for (const roll of affectedRolls) {
    const expectedLens = [
      roll.brand, roll.model, 
      `${roll.fixed_lens_focal_length}mm f/${roll.fixed_lens_max_aperture}`
    ].filter(Boolean).join(' ').trim();

    if (roll.current_lens !== expectedLens) {
      console.log(`Roll #${roll.roll_id}: "${roll.current_lens}" → "${expectedLens}"`);
      
      if (!isDryRun) {
        // 更新 rolls.lens
        await runAsync('UPDATE rolls SET lens = ? WHERE id = ?', [expectedLens, roll.roll_id]);
        
        // 清理 roll_gear 中的旧镜头数据
        await runAsync(`
          DELETE FROM roll_gear 
          WHERE roll_id = ? AND type = 'lens' 
            AND value != ?
            AND (
              value LIKE '%mm f/%' OR 
              value LIKE ? OR 
              value LIKE ?
            )
        `, [
          roll.roll_id, 
          expectedLens,
          `${roll.fixed_lens_focal_length}mm%`,  // 匹配 "35mm f/3.5"
          `${roll.brand} ${roll.model}%`         // 匹配 "Konica bigmini 201"
        ]);
        
        // 确保正确的值存在于 roll_gear
        await runAsync(`
          INSERT OR IGNORE INTO roll_gear (roll_id, type, value) VALUES (?, 'lens', ?)
        `, [roll.roll_id, expectedLens]);
      }
    }
  }

  console.log('');
  console.log('Repair complete!');
}

main().catch(console.error).finally(() => db.close());
```

### 3.5 Phase 4: 发布端自动迁移

将修复逻辑集成到现有的迁移框架中。

#### 方案 A: 服务端启动时自动修复

在 `server/utils/schema-migration.js` 中添加迁移步骤:

```javascript
// 在 ensureSchema() 函数末尾添加

// ========================================
// 固定镜头数据格式修复 (2026-01-24)
// ========================================
async function repairFixedLensData() {
  console.log('[Migration] Checking fixed-lens camera data consistency...');
  
  const affectedRolls = await allAsync(`
    SELECT r.id, r.lens, c.brand, c.model, c.fixed_lens_focal_length, c.fixed_lens_max_aperture
    FROM rolls r
    JOIN equip_cameras c ON r.camera_equip_id = c.id
    WHERE c.has_fixed_lens = 1
  `);

  let repaired = 0;
  for (const roll of affectedRolls) {
    const expected = [roll.brand, roll.model, `${roll.fixed_lens_focal_length}mm f/${roll.fixed_lens_max_aperture}`]
      .filter(Boolean).join(' ').trim();
    
    if (roll.lens !== expected) {
      await runAsync('UPDATE rolls SET lens = ? WHERE id = ?', [expected, roll.id]);
      
      // 清理 roll_gear 中的碎片数据
      await runAsync(`
        DELETE FROM roll_gear WHERE roll_id = ? AND type = 'lens' AND value != ?
      `, [roll.id, expected]);
      
      await runAsync(`
        INSERT OR IGNORE INTO roll_gear (roll_id, type, value) VALUES (?, 'lens', ?)
      `, [roll.id, expected]);
      
      repaired++;
    }
  }
  
  if (repaired > 0) {
    console.log(`[Migration] Repaired ${repaired} fixed-lens rolls`);
  } else {
    console.log('[Migration] All fixed-lens data is consistent');
  }
}
```

#### 方案 B: Docker/发布脚本触发

在 `docker/deploy.sh` 或构建脚本中添加:

```bash
# 数据库迁移和修复
echo "Running database migrations..."
node server/scripts/fix-fixed-lens-data.js

echo "Migrations complete"
```

---

## 4. roll 与 photo 的 camera/lens 关系规范

### 4.1 设计原则

| 层级 | 数据存储 | 说明 |
|-----|---------|------|
| **Roll** | 默认值 + 聚合统计 | Roll 的 camera/lens 作为该卷默认设置，且 `roll_gear` 表存储该卷所有 photo 使用的设备组合 |
| **Photo** | 单独覆盖（可选） | 每张 photo 可以有自己的 camera/lens，如果为空则继承 roll 的设置 |

### 4.2 数据继承规则

```
Photo 相机优先级:
1. photo.camera_equip_id (设备表关联)
2. photo.camera (legacy 文本字段)
3. roll.camera_equip_id (继承)
4. roll.camera (继承)

Photo 镜头优先级:
1. photo.lens_equip_id (设备表关联)
2. photo.lens (legacy 文本字段)
3. roll.lens_equip_id (继承，非固定镜头相机)
4. roll.lens (继承，含固定镜头相机的完整描述)
5. 从 roll.camera_equip_id 的固定镜头派生 (作为最终 fallback)
```

### 4.3 roll_gear 表职责

- **目的**: 聚合 roll 下所有 photo 使用的 camera/lens/photographer
- **用途**: Statistics 页面展示、筛选器选项
- **更新时机**: 
  - 创建/更新 roll 时
  - 创建/更新 photo 时
- **注意**: 应该存储**规范化**的值，避免同一设备有多个变体

---

## 5. 实施清单

### 5.1 代码修改

- [x] `server/services/gear-service.js` 添加固定镜头工具函数 (formatFixedLensDescription, getFixedLensInfo, cleanupFixedLensGear)
- [x] `server/routes/rolls.js` L125-145 (CREATE ROLL 固定镜头处理)
- [x] `server/routes/rolls.js` L1145-1160 (UPDATE ROLL 固定镜头处理)
- [x] `server/routes/stats.js` L56-60 (Statistics 固定镜头查询格式)
- [x] 创建 `server/scripts/fix-fixed-lens-data.js` (历史数据修复脚本)
- [x] `server/utils/schema-migration.js` (添加自动迁移逻辑 repairFixedLensData)

### 5.2 数据迁移

- [ ] 在开发环境运行 `fix-fixed-lens-data.js --dry-run` 验证
- [ ] 在开发环境运行 `fix-fixed-lens-data.js` 实际修复
- [ ] 验证 Statistics 页面显示正确
- [ ] 集成到发布流程

### 5.3 验证步骤

1. **创建新 Roll**
   - 选择固定镜头相机（如 Konica bigmini 201）
   - 验证 `rolls.lens` 格式为 `Konica bigmini 201 35mm f/3.5`

2. **更新现有 Roll**
   - 更改相机为固定镜头相机
   - 验证 lens 字段和 roll_gear 更新正确

3. **Statistics 页面**
   - 检查镜头分布图表
   - 验证同一相机的固定镜头只显示一个条目

4. **Photo 继承**
   - 创建 photo 未设置 camera/lens
   - 验证导出 EXIF 正确继承 roll 设置

---

## 6. 附录：相关文件位置

| 文件 | 功能 | 关键行号 |
|-----|------|---------|
| [server/routes/rolls.js](server/routes/rolls.js) | Roll CRUD | L117-165, L1130-1200 |
| [server/routes/stats.js](server/routes/stats.js) | Statistics API | L29-90 |
| [server/services/gear-service.js](server/services/gear-service.js) | Gear 聚合服务 | L1-100 |
| [server/scripts/cleanup-fixed-lens-rolls.js](server/scripts/cleanup-fixed-lens-rolls.js) | 现有清理脚本（参考） | 全文 |
| [server/utils/schema-migration.js](server/utils/schema-migration.js) | 数据库迁移 | L300+ |
| [client/src/components/Statistics.jsx](client/src/components/Statistics.jsx) | 前端统计页面 | L45-100 |
