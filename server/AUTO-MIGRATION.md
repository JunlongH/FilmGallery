# 自动数据库迁移说明

## 概述

从当前版本开始，FilmGallery 在启动时会**自动检查并执行必要的数据库迁移**，无需手动干预。

## 启动时的自动迁移流程

当应用启动时，服务器会按以下顺序执行：

1. **基础迁移** (`utils/migration.js`)
   - 检查数据库文件是否存在
   - 执行基本的数据库初始化

2. **Schema迁移** (`utils/schema-migration.js`)
   - 确保所有表存在
   - 添加缺失的表

3. **Photos列迁移** (`migrate-add-photo-columns.js`) ⭐ **新增**
   - 检查 photos 表的18个必需列
   - 自动添加缺失的列
   - 包括：`aperture`, `shutter_speed`, `frame_number`, `camera`, `lens` 等

4. **加载数据库连接**
   - 连接到已迁移的数据库

5. **重新计算Roll序列**
   - 确保数据一致性

## 迁移的列

Photos表会自动添加以下列（如果不存在）：

| 列名 | 类型 | 说明 |
|------|------|------|
| `frame_number` | TEXT | 胶卷帧号 |
| `full_rel_path` | TEXT | 全尺寸图片路径 |
| `thumb_rel_path` | TEXT | 缩略图路径 |
| `negative_rel_path` | TEXT | 负片版本路径 |
| `original_rel_path` | TEXT | 原始上传路径 |
| `positive_rel_path` | TEXT | 正片版本路径 |
| `positive_thumb_rel_path` | TEXT | 正片缩略图路径 |
| `negative_thumb_rel_path` | TEXT | 负片缩略图路径 |
| `is_negative_source` | INTEGER | 是否为负片源 |
| `taken_at` | DATETIME | 拍摄时间戳 |
| `date_taken` | DATE | 拍摄日期 |
| `time_taken` | TIME | 拍摄时间 |
| `location_id` | INTEGER | 位置引用 |
| `detail_location` | TEXT | 详细位置 |
| `camera` | TEXT | 使用的相机 |
| `lens` | TEXT | 使用的镜头 |
| `photographer` | TEXT | 摄影师 |
| `edit_params` | TEXT | 编辑参数JSON |

## 启动日志示例

```
[SERVER] Starting migration check...
[SERVER] Migration check complete.
[SERVER] Starting schema migration...
[SERVER] Schema migration complete.
[SERVER] Checking photos table columns...
[PHOTO-COLS] Checking photos table columns...
[PHOTO-COLS] ✓ Added column 'aperture'
[PHOTO-COLS] ✓ Added column 'shutter_speed'
[PHOTO-COLS] ✓ Added column 'camera'
[PHOTO-COLS] ✓ Migration completed: 18 added, 0 already existed
[SERVER] Photo columns migration complete.
[SERVER] Loading database connection...
Connected to database at C:\Users\...\OneDrive\FilmGallery\film.db
```

## 错误处理

如果迁移失败：

1. **不会阻止应用启动** - 服务器会继续运行
2. **会在控制台显示警告** - 方便调试
3. **可能导致上传功能异常** - 建议查看日志并修复

## 手动运行迁移

虽然现在是自动的，但你仍可以手动运行：

### Windows 批处理（推荐）
```cmd
cd "d:\Program Files\FilmGalery\server"
migrate-photos.bat
```

### 直接运行Node.js脚本
```cmd
cd "d:\Program Files\FilmGalery\server"
set DATA_ROOT=%USERPROFILE%\OneDrive\FilmGallery
node migrate-add-photo-columns.js
```

## 安全性

- ✅ **只添加列，不删除数据**
- ✅ **幂等操作** - 多次运行不会出错
- ✅ **跳过已存在的列** - 不会重复添加
- ✅ **不影响现有数据** - 新列默认为NULL

## 版本兼容性

- **旧版数据库** → 自动升级到新schema
- **新版数据库** → 跳过已有的列，不做任何更改
- **无缝升级** → 用户无需任何操作

## 故障排除

### 如果看到 "SQLITE_ERROR: table photos has no column named aperture"

这表示迁移可能失败了。解决方法：

1. 停止应用
2. 运行 `kill-port-4000.ps1` 清理端口
3. 运行 `migrate-photos.bat` 手动迁移
4. 重启应用

### 查看迁移状态

启动应用后，查看控制台输出中的：
```
[PHOTO-COLS] ✓ Migration completed: X added, Y already existed
```
- X = 新添加的列数
- Y = 已存在的列数

## 开发注意事项

如果需要添加新的列到photos表：

1. 在 `migrate-add-photo-columns.js` 的 `columnsToAdd` 数组中添加
2. 重启应用，会自动添加新列
3. 无需修改其他代码

示例：
```javascript
const columnsToAdd = [
  // ... 现有列 ...
  { name: 'new_column', type: 'TEXT', description: 'New feature column' },
];
```

## 相关文件

- **自动迁移**: `server.js` (启动时调用)
- **迁移逻辑**: `migrate-add-photo-columns.js`
- **手动运行**: `migrate-photos.bat`
- **端口清理**: `kill-port-4000.ps1`

---

**总结**: 现在你完全不需要担心数据库schema的问题，应用会自动处理一切！🎉
