# Bug Fix Plan: Mobile Camera Loading & Focal Length Support

**Date:** 2026-01-25  
**Author:** AI Assistant

---

## Issue 1: Mobile Film Item Loading 未正确关联相机

### 问题描述

用户在手机端将 film item 装入相机（Load）时，选择了 equipment 库中的相机，但实际未关联到对应的相机上。具体表现为：
- 手机端 load 后，Shot Log 测光时没有固定为 PS 机模式
- 固定镜头相机的镜头信息未自动填充
- 但在电脑端 load 时，手机端测光和镜头填充正常

### 根本原因

**字段名不匹配**：Mobile 发送的是 `loaded_camera_equip_id`，但服务器只接受 `camera_equip_id`。

#### Mobile 实现 (FilmItemDetailScreen.js:158-167)
```javascript
const patch = { 
  status: 'loaded', 
  loaded_date: actionDate || todayStr,
  loaded_camera: loadCameraName || null,
  loaded_camera_equip_id: loadCameraId || null  // ❌ 错误字段名
};
```

#### Desktop 实现 (FilmInventory.js)
```javascript
const res = await updateFilmItem(item.id, { 
  status: 'loaded', 
  loaded_camera: camera,
  camera_equip_id: cameraEquipId,  // ✅ 正确字段名
  loaded_at: new Date().toISOString(),
  loaded_date: loadedDate || null
});
```

#### Server API (film-items.js)
```javascript
const allowed = [
  'status', 'label',
  // ... other fields ...
  'loaded_camera', 'camera_equip_id', 'loaded_at',  // ✅ 只接受 camera_equip_id
  'loaded_date', 'finished_date',
  // ...
];
```

### 修复方案

**File:** `mobile/src/screens/FilmItemDetailScreen.js`

修改 Load 按钮的 patch 对象（约第 158-167 行）：

```diff
 const patch = { 
   status: 'loaded', 
   loaded_date: actionDate || todayStr,
   loaded_camera: loadCameraName || null,
-  loaded_camera_equip_id: loadCameraId || null
+  camera_equip_id: loadCameraId || null,
+  loaded_at: new Date().toISOString()
 };
```

### 影响范围

- `mobile/src/screens/FilmItemDetailScreen.js` - Load 按钮处理逻辑
- Shot Log 将能正确识别相机，启用 PS 模式，自动填充固定镜头

---

## Issue 2: Focal Length（焦距）数据链路完善

### 需求描述

1. **变焦镜头**：在 Shot Log 中可以填写实际使用的焦距信息，并记录
2. **定焦镜头/固定镜头相机**：自动填充焦距
3. **数据持久化**：焦距需要保存到 photo 记录
4. **EXIF 写入**：导出时焦距需要写入 EXIF

### 当前状态分析

| 组件 | focal_length 支持 | 状态 |
|------|------------------|------|
| **photos 表结构** | `focal_length REAL` | ✅ 已存在 |
| **EXIF 读取 (raw-decoder)** | 从元数据读取 `FocalLength` | ✅ 已存在 |
| **EXIF 写入 (export)** | 写入 `FocalLength` 到输出 | ✅ 已存在 |
| **shot_logs 条目结构** | 未包含 | ❌ 缺失 |
| **ShotModeModal (mobile)** | 有焦距 snapping UI 但不持久化 | ❌ 缺失 |
| **PhotoMetaEditModal (client)** | 无输入字段 | ❌ 缺失 |
| **PhotoDetailsSidebar (client)** | 不在 `params` 字段组中 | ❌ 缺失 |
| **photos PUT API** | 未在更新处理中 | ❌ 缺失 |
| **Lens equipment** | `focal_length_min`, `focal_length_max` | ✅ 已存在 |
| **Camera fixed lens** | `fixed_lens_focal_length` | ✅ 已存在 |

### 详细修复计划

#### Step 1: Server API 支持 focal_length 更新

**File:** `server/src/routes/photos.js`

在 PUT `/api/photos/:id` 的允许字段列表中添加 `focal_length`：

```diff
 const allowed = [
   'date_taken', 'time_taken',
   'location_id', 'country', 'city', 'detail_location', 
   'latitude', 'longitude',
   'camera', 'lens', 'photographer',
   'camera_equip_id', 'lens_equip_id', 'flash_equip_id',
-  'aperture', 'shutter_speed', 'iso',
+  'aperture', 'shutter_speed', 'iso', 'focal_length',
   'scanner_equip_id', 'scan_resolution', 'scan_software',
   'scan_lab', 'scan_date', 'scan_cost', 'scan_notes'
 ];
```

#### Step 2: Mobile Shot Log 添加 focal_length 字段

**File:** `mobile/src/screens/ShotLogScreen.js`

2.1 在 state 中添加焦距字段：
```javascript
const [newFocalLength, setNewFocalLength] = useState('');
```

2.2 在 `addEntry` 函数中包含 focal_length：
```javascript
const entry = {
  date: newDate,
  count: shotCount,
  lens: newLens || null,
  focal_length: newFocalLength ? parseFloat(newFocalLength) : null,  // 新增
  aperture: newAperture ? parseFloat(newAperture) : null,
  shutter_speed: newShutter || null,
  // ... other fields
};
```

2.3 添加焦距输入 UI：
- 对于变焦镜头：显示可编辑的数字输入框
- 对于定焦镜头/固定镜头相机：显示只读的自动填充值

#### Step 3: Client PhotoDetailsSidebar 添加 focal_length

**File:** `client/src/components/PhotoDetailsSidebar.jsx`

3.1 在 FIELD_GROUPS 中添加：
```diff
 const FIELD_GROUPS = {
   time: ['date_taken', 'time_taken'],
   equipment: ['camera', 'lens', 'camera_equip_id', 'lens_equip_id', 'photographer'],
-  params: ['aperture', 'shutter_speed', 'iso'],
+  params: ['aperture', 'shutter_speed', 'iso', 'focal_length'],
   location: ['location_id', 'country', 'city', 'detail_location', 'latitude', 'longitude'],
   scanning: ['scanner_equip_id', 'scan_resolution', 'scan_software', 'scan_lab', 'scan_date', 'scan_cost', 'scan_notes']
 };
```

3.2 添加 state：
```javascript
const [focalLength, setFocalLength] = useState(base?.focal_length != null ? base.focal_length : '');
```

3.3 添加 getFieldValue case：
```javascript
case 'focal_length': return focalLength !== '' ? parseFloat(focalLength) : null;
```

3.4 在 Shooting Parameters section 添加 UI：
```jsx
<div className="fg-field">
  <label className="fg-label">Focal Length (mm)</label>
  <input 
    className="fg-input" 
    type="number" 
    step="1"
    min="1"
    max="2000"
    placeholder="e.g. 50" 
    value={focalLength} 
    onChange={e=>{ setFocalLength(e.target.value); markDirty('focal_length'); }} 
  />
</div>
```

#### Step 4: Client PhotoMetaEditModal 添加 focal_length

**File:** `client/src/components/PhotoMetaEditModal.jsx`

4.1 添加 state：
```javascript
const [focalLength, setFocalLength] = useState(photo.focal_length != null ? photo.focal_length : '');
```

4.2 在 Shooting Parameters fieldset 中添加 UI（与 aperture/shutter/iso 同行或新增一行）

4.3 在 onSave 中包含：
```javascript
focal_length: focalLength !== '' ? parseFloat(focalLength) : null,
```

#### Step 5: Shot Log CSV Export 添加 focal_length

**File:** `server/src/routes/film-items.js`

在 shot_logs CSV 导出中添加 focal_length 字段：
```diff
- const header = ['date', 'count', 'lens', 'aperture', 'shutter_speed', 'country', 'city', 'detail_location', 'latitude', 'longitude', 'iso'];
+ const header = ['date', 'count', 'lens', 'focal_length', 'aperture', 'shutter_speed', 'country', 'city', 'detail_location', 'latitude', 'longitude', 'iso'];
```

### EXIF 写入说明

**已有支持**：`server/src/services/exif-service.js` 和导出路由已经支持 `focal_length` 的 EXIF 写入。

当 `photo.focal_length` 有值时，会写入：
- `FocalLength`: 实际焦距
- `FocalLengthIn35mmFormat`: 根据胶片画幅计算的等效 35mm 焦距

回退逻辑：
1. 优先使用 `photo.focal_length`
2. 其次使用固定镜头相机的 `fixed_lens_focal_length`
3. 最后使用镜头设备的 `focal_length_min`（适用于定焦镜头）

### 智能填充逻辑（Mobile Shot Log）

```javascript
// 检查镜头类型
if (selectedLens) {
  if (selectedLens.focal_length_min === selectedLens.focal_length_max) {
    // 定焦镜头：自动填充，只读
    setNewFocalLength(String(selectedLens.focal_length_min));
    setFocalLengthEditable(false);
  } else {
    // 变焦镜头：可编辑
    setFocalLengthEditable(true);
    // 可选：预设为最常用焦距或上次使用的焦距
  }
} else if (fixedLensInfo) {
  // 固定镜头相机：自动填充，只读
  setNewFocalLength(String(fixedLensInfo.focal_length));
  setFocalLengthEditable(false);
}
```

---

## 实施优先级

### Phase 1: 紧急修复（Issue 1）
- [x] 计划完成
- [x] 修复 `mobile/src/screens/FilmItemDetailScreen.js` 字段名

### Phase 2: Focal Length 基础支持
- [x] Server API 支持 focal_length 更新
- [x] Client PhotoDetailsSidebar 添加 focal_length
- [x] Client PhotoMetaEditModal 添加 focal_length

### Phase 3: Mobile Shot Log 完善
- [x] ShotLogScreen 添加 focal_length 字段
- [x] 智能填充逻辑（定焦 vs 变焦）
- [x] CSV 导出包含 focal_length

### Phase 4: Desktop Shot Log 完善
- [x] ShotLogModal 添加 focal_length 解析
- [x] ShotLogModal 添加 focal_length 输入和显示
- [x] EntryEditModal 添加 focal_length 编辑

### Phase 5: ShotModeModal 完善
- [x] 在 onUse 回调中包含 focal_length (计算自 zoom)

---

## 修改的文件清单

| 文件路径 | 修改内容 |
|---------|---------|
| `mobile/src/screens/FilmItemDetailScreen.js` | 修复字段名 `loaded_camera_equip_id` → `camera_equip_id`，添加 `loaded_at` |
| `server/routes/photos.js` | PUT handler 添加 `focal_length` 支持 |
| `client/src/components/PhotoDetailsSidebar.jsx` | 添加 focal_length state、FIELD_GROUPS、getFieldValue、UI |
| `client/src/components/PhotoMetaEditModal.jsx` | 添加 focal_length state、UI、onSave |
| `mobile/src/screens/ShotLogScreen.js` | parseShotLog、state、handleShotData、upsertEntry、onSave、UI 添加 focal_length |
| `mobile/src/components/ShotModeModal.js` | onUse 回调添加 focal_length |
| `server/routes/film-items.js` | CSV 导出添加 focal_length 列 |
| `client/src/components/ShotLogModal.jsx` | CSV template、parseCSV、normalize、handleAdd、EntryEditModal、显示 添加 focal_length |

---

## 测试要点

### Issue 1 测试
1. Mobile 端选择相机 Load film item
2. 进入 Shot Log，验证 PS 模式是否正确启用
3. 验证固定镜头相机的镜头是否自动填充
4. 在 Desktop 端检查 film item 的 `camera_equip_id` 是否正确保存

### Issue 2 测试
1. **定焦镜头**：选择后焦距自动填充，不可编辑
2. **变焦镜头**：可输入实际使用的焦距
3. **固定镜头相机**：焦距自动填充
4. **Photo 编辑**：在 Sidebar/Modal 中修改焦距
5. **EXIF 导出**：下载照片检查 EXIF 中的 FocalLength 标签
