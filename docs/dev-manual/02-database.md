# 2. 数据库设计

## 2.1 核心表结构

### 2.1.1 films（胶片类型表）

存储胶片的基本信息（如柯达 Portra 400、富士 Pro 400H）。

```sql
CREATE TABLE films (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,              -- 胶片名称
  iso INTEGER,                     -- 感光度 (100, 400, 800 等)
  format TEXT,                     -- 格式 (135/120/sheet 等)
  type TEXT,                       -- 类型 (color_negative/bw_negative/slide 等)
  stock TEXT,                      -- 库存数量
  purchased_date TEXT,             -- 购买日期
  batch_number TEXT,               -- 批号
  notes TEXT,                      -- 备注
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

### 2.1.2 rolls（胶卷管理表）

每一卷实际使用的胶卷，追踪从装填到冲洗的整个生命周期。

```sql
CREATE TABLE rolls (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,              -- 胶卷名称 (如 "2026-01-26 Portra")
  film_id INTEGER NOT NULL,        -- 关联 films.id
  status TEXT NOT NULL,            -- 状态 (draft/loaded/shot/developed/archived)
  loaded_date TEXT,                -- 装填日期
  shot_date TEXT,                  -- 拍完日期
  developed_date TEXT,             -- 冲洗日期
  lab_name TEXT,                   -- 冲洗店名
  equipment_id INTEGER,            -- 关联相机 equipment.id
  notes TEXT,                      -- 备注
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(film_id) REFERENCES films(id),
  FOREIGN KEY(equipment_id) REFERENCES equipment(id)
);
```

### 2.1.3 photos（照片记录表）

每一张照片的元数据和处理信息。

```sql
CREATE TABLE photos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  roll_id INTEGER NOT NULL,        -- 关联胶卷
  file_path TEXT NOT NULL,         -- 文件相对路径
  original_filename TEXT,          -- 原始文件名
  file_size INTEGER,               -- 文件大小 (字节)
  mime_type TEXT,                  -- MIME 类型 (image/jpeg 等)
  shot_date TEXT,                  -- 拍摄日期
  shot_number INTEGER,             -- 在胶卷中的位置
  -- EXIF 数据
  exposure_compensation REAL,      -- 曝光补偿
  iso INTEGER,                     -- ISO
  aperture REAL,                   -- 光圈 (f/2.8 等)
  shutter_speed TEXT,              -- 快门速度 (1/125 等)
  focal_length REAL,               -- 焦距 (mm)
  lens_model TEXT,                 -- 镜头型号
  camera_model TEXT,               -- 相机型号
  -- 地理位置
  latitude REAL,                   -- 纬度
  longitude REAL,                  -- 经度
  location_name TEXT,              -- 位置名称
  -- 元数据
  notes TEXT,                      -- 用户备注
  rating INTEGER,                  -- 评分 (0-5)
  scan_date TEXT,                  -- 扫描日期
  scanner_model TEXT,              -- 扫描仪型号
  -- FilmLab 处理
  filmlab_data TEXT,               -- FilmLab 处理参数 (JSON)
  filmlab_preview_path TEXT,       -- FilmLab 预览路径
  -- 系统
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  deleted_at DATETIME,             -- 软删除标记
  FOREIGN KEY(roll_id) REFERENCES rolls(id)
);
```

### 2.1.4 equipment（设备档案表）

相机、镜头、滤镜等设备信息。

```sql
CREATE TABLE equipment (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,              -- 设备名称 (如 "Canon EOS 5D Mark IV")
  type TEXT NOT NULL,              -- 类型 (camera/lens/filter/meter 等)
  category TEXT,                   -- 分类 (如镜头焦距)
  manufacturer TEXT,               -- 制造商
  model TEXT,                      -- 型号
  serial_number TEXT,              -- 序列号
  purchase_date TEXT,              -- 购买日期
  purchase_price REAL,             -- 购买价格
  notes TEXT,                      -- 备注
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(type) REFERENCES equipment_types(id)
);
```

### 2.1.5 photo_equipment（照片-设备关联表）

记录每张照片使用的设备。

```sql
CREATE TABLE photo_equipment (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  photo_id INTEGER NOT NULL,
  equipment_id INTEGER NOT NULL,
  role TEXT NOT NULL,              -- 角色 (camera/lens/filter 等)
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(photo_id) REFERENCES photos(id),
  FOREIGN KEY(equipment_id) REFERENCES equipment(id),
  UNIQUE(photo_id, equipment_id, role)
);
```

### 2.1.6 tags（标签表）

灵活的分类标签。

```sql
CREATE TABLE tags (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,       -- 标签名称
  color TEXT,                      -- 显示颜色 (hex 格式)
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

### 2.1.7 photo_tags（照片-标签关联表）

```sql
CREATE TABLE photo_tags (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  photo_id INTEGER NOT NULL,
  tag_id INTEGER NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(photo_id) REFERENCES photos(id),
  FOREIGN KEY(tag_id) REFERENCES tags(id),
  UNIQUE(photo_id, tag_id)
);
```

### 2.1.8 presets（编辑预设表）

保存的 FilmLab 处理参数。

```sql
CREATE TABLE presets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,              -- 预设名称 (如 "Portra 风格")
  category TEXT,                   -- 分类
  description TEXT,                -- 描述
  settings_json TEXT NOT NULL,     -- 设置参数 (JSON)
  thumbnail_path TEXT,             -- 缩略图
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

### 2.1.9 export_history（导出记录表）

追踪所有导出操作。

```sql
CREATE TABLE export_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  roll_id INTEGER,                 -- 关联胶卷
  photo_id INTEGER,                -- 或关联照片
  export_date TEXT NOT NULL,       -- 导出日期
  export_path TEXT NOT NULL,       -- 导出路径
  export_format TEXT,              -- 导出格式 (jpg/png/tif 等)
  file_size INTEGER,               -- 导出文件大小
  export_settings TEXT,            -- 导出参数 (JSON)
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(roll_id) REFERENCES rolls(id),
  FOREIGN KEY(photo_id) REFERENCES photos(id)
);
```

## 2.2 数据库迁移机制

迁移脚本位于 `server/migrations/`，按时间戳命名（YYYY-MM-DD-description.js）：

**执行流程**：
1. 应用启动时，`server.js` 调用 `runMigration()`
2. 扫描 `migrations/` 目录下的所有 JS 文件
3. 按字母顺序（时间戳）执行未执行的迁移
4. 记录执行状态在内存（可选持久化）

**迁移脚本模板**：

```javascript
// server/migrations/2026-01-XX-add-example.js
const db = require('../db');

async function migrate() {
  return new Promise((resolve, reject) => {
    db.serialize(() => {
      db.run(`
        ALTER TABLE photos 
        ADD COLUMN example_field TEXT
      `, (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  });
}

module.exports = migrate;
```

**关键迁移记录**：
- `2025-11-30-db-revamp.js` - 主要数据库重构，整合所有表
- `2025-12-02-add-film-items.js` - 添加胶片项目跟踪
- `2025-12-02-add-load-dates.js` - 添加装填日期跟踪
- `2026-01-16-add-positive-source.js` - 添加正片来源支持

## 2.3 性能优化

### 2.3.1 Prepared Statements

所有查询使用预编译语句防止 SQL 注入和提高性能：

```javascript
// 使用工具函数
const PreparedStmt = require('./utils/prepared-statements');

const stmt = db.prepare(`
  SELECT * FROM photos 
  WHERE roll_id = ? AND rating >= ?
`);

const rows = stmt.all(rollId, minRating);
stmt.free();
```

### 2.3.2 索引设计

```sql
-- 常用查询索引
CREATE INDEX idx_photos_roll_id ON photos(roll_id);
CREATE INDEX idx_photos_shot_date ON photos(shot_date);
CREATE INDEX idx_rolls_film_id ON rolls(film_id);
CREATE INDEX idx_photo_tags_photo_id ON photo_tags(photo_id);
CREATE INDEX idx_photo_equipment_photo_id ON photo_equipment(photo_id);
```

### 2.3.3 查询优化

**避免 N+1 查询**：
```javascript
// ❌ 错误：每张照片都查询一次相机信息
const photos = getPhotos();
for (const photo of photos) {
  photo.camera = getEquipment(photo.equipment_id);
}

// ✅ 正确：一次查询所有
const photos = getPhotos();
const equipmentIds = photos.map(p => p.equipment_id);
const equipmentMap = getEquipmentByIds(equipmentIds);
photos.forEach(p => p.camera = equipmentMap[p.equipment_id]);
```

## 2.4 数据完整性

### 2.4.1 外键约束

所有关联表都定义了 FOREIGN KEY，启用约束：

```javascript
// server/db.js
db.run('PRAGMA foreign_keys = ON');
```

### 2.4.2 软删除

某些表支持软删除（`deleted_at` 字段），查询时默认排除：

```javascript
// 查询活跃照片
db.all(`
  SELECT * FROM photos 
  WHERE deleted_at IS NULL
`, callback);
```

### 2.4.3 时间戳管理

每个表都有 `created_at` 和可选的 `updated_at`：

```javascript
// 自动更新时间戳（触发器或应用层）
db.run(`
  UPDATE photos 
  SET updated_at = CURRENT_TIMESTAMP
  WHERE id = ?
`, [photoId]);
```

## 2.5 数据备份和同步

### 2.5.1 本地备份

定期备份 `film.db` 到：
- `data/backups/film-YYYY-MM-DD-HHmmss.db`
- 保留最近 7 天的备份

### 2.5.2 OneDrive 同步

支持将数据库和文件自动同步到 OneDrive：
- 增量同步（仅同步变化）
- 冲突解决机制
- 详见：[onedrive-sync-optimization.md](../onedrive-sync-optimization.md)

---

**相关文档**：
- [01-architecture.md](./01-architecture.md) - 系统架构
- [03-backend-api.md](./03-backend-api.md) - API 接口
