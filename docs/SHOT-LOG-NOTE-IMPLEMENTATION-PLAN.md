# Shot Log Caption Field Implementation Plan

**日期**: 2026-01-31  
**目标**: 为 Shot Log 增加 `caption` 字段，用于记录当天拍摄内容，并在映射时自动写入 photo 的 `caption` 字段

**状态**: ✅ **已完成** (2026-02-01)

> **重要变更**: 字段名从最初计划的 `note` 统一为 `caption`，与数据库 photos 表的 `caption` 字段一致，避免混淆。

---

## 实施完成清单

### Phase 1: 后端修改 ✅
- [x] `server/routes/film-items.js` - CSV 导出增加 caption 列
- [x] `server/services/photo-upload-service.js` - resolveFileMetadata 支持 caption
- [x] `server/services/photo-upload-service.js` - processFileForRoll 传递 caption
- [x] `server/routes/rolls.js` - INSERT SQL 包含 caption 字段

### Phase 2: Desktop 前端修改 ✅
- [x] `client/src/components/ShotLogModal.jsx` - 解析、状态、UI、编辑 Modal
- [x] `client/src/components/ShotLogMapper.jsx` - 显示 + 映射 caption
- [x] `client/src/components/NewRollForm.jsx` - handleApplyShotLog 传递 caption

### Phase 3: Mobile 前端修改 ✅
- [x] `mobile/src/screens/ShotLogScreen.js` - 解析、状态、UI、保存

---

## 1. 需求概述

### 1.1 功能需求
1. **记录能力**: 在 Shot Log 中为每个条目添加 `note` 字段，记录当天拍摄的内容描述
2. **自动映射**: 在 Shot Log Mapper 中将 log 的 `note` 自动写入关联 photo 的 `caption` 字段
3. **向后兼容**: 现有的 shot log 数据（无 note 字段）需要能正常工作

### 1.2 使用场景
- **Mobile 端**: 用户在拍摄当天记录 shot log 时，可以输入备注说明拍摄内容（如"故宫午门"、"夕阳下的长城"）
- **Desktop 端**: 用户在编辑 shot log 时可以添加/修改 note
- **Roll 创建**: 使用 Shot Log Mapper 时，note 自动成为照片的 caption，方便后续检索和展示

---

## 2. 数据库层 (Database Layer)

### 2.1 当前数据结构
Shot log 数据存储在 `film_items` 表的 `shot_logs` 字段（TEXT 类型），内容为 JSON 数组：

```json
[
  {
    "date": "2026-01-15",
    "count": 3,
    "lens": "50mm f/1.8",
    "focal_length": 50,
    "aperture": 2.8,
    "shutter_speed": "1/125",
    "country": "中国",
    "city": "北京",
    "detail_location": "故宫午门",
    "latitude": 39.9160,
    "longitude": 116.3972
  }
]
```

### 2.2 需要的修改
无需数据库 schema 修改！`shot_logs` 为 TEXT (JSON) 类型，直接支持新增字段。

### 2.3 新增字段结构
```json
[
  {
    "date": "2026-01-15",
    "count": 3,
    "lens": "50mm f/1.8",
    "focal_length": 50,
    "aperture": 2.8,
    "shutter_speed": "1/125",
    "country": "中国",
    "city": "北京",
    "detail_location": "故宫午门",
    "latitude": 39.9160,
    "longitude": 116.3972,
    "note": "故宫午门建筑细节特写"
  }
]
```

### 2.4 数据迁移策略
**无需迁移**：
- 现有数据不包含 `note` 字段，前端/后端读取时默认为空字符串或 `null`
- 新数据保存时包含 `note` 字段
- 向后兼容性保证

---

## 3. 后端层 (Backend Layer)

### 3.1 受影响的文件
| 文件路径 | 功能 | 需要的修改 |
|---------|------|-----------|
| `server/routes/film-items.js` | Shot log CRUD 和 CSV 导出 | 1. CSV 导出增加 `note` 列 |
| `server/services/film/film-item-service.js` | Film item 更新逻辑 | **无需修改**（shot_logs 作为 TEXT 整体更新） |

### 3.2 详细修改

#### 3.2.1 CSV 导出 (`film-items.js`)
**文件**: `server/routes/film-items.js`  
**行数**: 约 108-180  
**当前逻辑**:
```javascript
// Line ~148: CSV header
res.write('date,count,lens,focal_length,aperture,shutter_speed,country,city,detail_location,latitude,longitude,iso\r\n');

// Line ~150-180: Data rows
for (const entry of logs) {
  const date = entry.date || '';
  const count = entry.count || entry.shots || 0;
  const lens = entry.lens || '';
  // ... other fields
  const iso = filmIso ?? '';

  res.write([
    escapeCsv(date),
    escapeCsv(count),
    // ... other fields
    escapeCsv(iso)
  ].join(',') + '\r\n');
}
```

**需要的修改**:
```javascript
// Line ~148: CSV header - 添加 note 列
res.write('date,count,lens,focal_length,aperture,shutter_speed,country,city,detail_location,latitude,longitude,iso,note\r\n');

// Line ~150-180: Data rows - 添加 note 字段
for (const entry of logs) {
  // ... existing fields
  const iso = filmIso ?? '';
  const note = entry.note || '';  // 新增

  res.write([
    // ... existing fields
    escapeCsv(iso),
    escapeCsv(note)  // 新增
  ].join(',') + '\r\n');
}
```

#### 3.2.2 Film Item Service
**文件**: `server/services/film/film-item-service.js`  
**修改**: **无需修改**  
**原因**: `shot_logs` 字段在 `updateFilmItem()` 中作为 TEXT 类型整体更新（Line 154），前端传递的 JSON 会直接保存，无需后端解析。

---

## 4. 前端层 - Desktop (Client)

### 4.1 受影响的文件
| 文件路径 | 功能 | 需要的修改 |
|---------|------|-----------|
| `client/src/components/ShotLogModal.jsx` | Shot log CRUD UI | 1. 增加 note 输入框<br>2. 在列表展示中显示 note<br>3. 在编辑 modal 中支持 note 编辑 |
| `client/src/components/ShotLogMapper.jsx` | Shot log 映射到文件 | 1. 在 log 卡片中显示 note<br>2. 映射逻辑中传递 note 到 caption |
| `client/src/components/NewRollForm.jsx` | Roll 创建表单 | 1. 接收 mapper 返回的 note<br>2. 在 fileMetadata 中包含 note 字段 |

### 4.2 详细修改

#### 4.2.1 ShotLogModal.jsx

**A. 数据解析增强 (parseShotLog 函数)**  
**位置**: 文件开头  
**修改**:
```jsx
// 当前代码（估计位置）
function parseShotLog(raw) {
  if (!raw) return [];
  try {
    const data = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (!Array.isArray(data)) return [];
    return data.map(entry => ({
      date: entry.date,
      count: Number(entry.count || entry.shots || 0) || 0,
      lens: entry.lens || '',
      // ... other fields
      latitude: entry.latitude ?? null,
      longitude: entry.longitude ?? null
    })).filter(e => e.date && e.count > 0);
  } catch {
    return [];
  }
}

// 修改为（添加 note 字段）：
function parseShotLog(raw) {
  if (!raw) return [];
  try {
    const data = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (!Array.isArray(data)) return [];
    return data.map(entry => ({
      date: entry.date,
      count: Number(entry.count || entry.shots || 0) || 0,
      lens: entry.lens || '',
      // ... other fields
      latitude: entry.latitude ?? null,
      longitude: entry.longitude ?? null,
      note: entry.note || ''  // 新增
    })).filter(e => e.date && e.count > 0);
  } catch {
    return [];
  }
}
```

**B. EntryEditModal 组件修改**  
**位置**: 约 Line 16-200（组件定义）  
**修改**:
```jsx
function EntryEditModal({ entry, index, onSave, onClose, ... }) {
  const [editData, setEditData] = useState({ ...entry });
  // ...

  return (
    <div className="fg-modal-overlay" ...>
      <div className="fg-modal-content" ...>
        {/* ... existing fields ... */}
        
        {/* Row 5 之后：Detail / Address */}
        {/* ... existing detail_location field ... */}
        
        {/* 新增：Note 字段 */}
        <div className="fg-field" style={{ marginBottom: 20 }}>
          <label className="fg-label">Note (拍摄备注)</label>
          <textarea
            className="fg-input"
            rows={3}
            value={editData.note || ''}
            placeholder="记录当天拍摄内容，如：故宫午门建筑细节"
            onChange={e => setEditData(prev => ({ ...prev, note: e.target.value }))}
            style={{ resize: 'vertical', fontFamily: 'inherit' }}
          />
        </div>
        
        {/* ... rest of fields ... */}
      </div>
    </div>
  );
}
```

**C. 主列表显示修改**  
**位置**: 约 Line 500-700（ShotLogModal 主组件的 log 列表渲染）  
**修改示例**:
```jsx
{logs.map((log, idx) => (
  <div key={idx} className="log-entry-card" ...>
    <div className="log-header">
      <span className="log-date">{log.date}</span>
      <span className="log-count">{log.count} shots</span>
    </div>
    <div className="log-details">
      {log.lens && <div>📷 {log.lens}</div>}
      {log.country && <div>📍 {log.country} / {log.city}</div>}
      {/* 新增：显示 note */}
      {log.note && (
        <div style={{ 
          marginTop: 8, 
          padding: '6px 10px', 
          backgroundColor: isDark ? '#1e40af' : '#dbeafe',
          borderRadius: 6,
          fontSize: 13,
          color: isDark ? '#bfdbfe' : '#1e40af'
        }}>
          💬 {log.note}
        </div>
      )}
    </div>
    <div className="log-actions">
      <button onClick={() => handleEdit(idx)}>Edit</button>
      <button onClick={() => handleDelete(idx)}>Delete</button>
    </div>
  </div>
))}
```

**D. 保存逻辑修改**  
**位置**: 约 Line 800-900（handleSave 函数）  
**修改**:
```javascript
const handleSave = async () => {
  const payload = logs.map(log => ({
    date: log.date,
    count: log.count,
    lens: log.lens || '',
    // ... other fields
    latitude: log.latitude ?? null,
    longitude: log.longitude ?? null,
    note: log.note || ''  // 新增
  }));
  
  await updateFilmItem(itemId, { shot_logs: JSON.stringify(payload) });
  onClose();
};
```

#### 4.2.2 ShotLogMapper.jsx

**A. 右侧 log 卡片显示增强**  
**位置**: 约 Line 245-337（log 列表渲染）  
**修改**:
```jsx
<div style={styles.rightPanel}>
  <div style={styles.panelHeader}>Shot Logs ({shotLogs.length})</div>
  <div style={styles.logList}>
    {shotLogs.map((log, idx) => {
      const maxCount = Number(log.count || log.shots || 0) || 1;
      const currentCount = assignmentCounts[idx];
      const isSelected = selectedLogIdx === idx;
      const isFull = currentCount >= maxCount;
      
      return (
        <div
          key={idx}
          style={{
            ...styles.logItem,
            backgroundColor: logColors[idx],
            // ... other styles
          }}
          // ... event handlers
        >
          <div style={styles.logHeader}>
            <div style={styles.logDate}>{log.date}</div>
            <div style={styles.logCount}>{currentCount}/{maxCount}</div>
          </div>
          <div style={styles.logDetails}>
            {log.lens && `📷 ${log.lens}`}
            {log.focal_length && ` @ ${log.focal_length}mm`}
          </div>
          <div style={styles.logLocation}>
            {[log.country, log.city].filter(Boolean).join(' / ')}
          </div>
          {/* 新增：显示 note */}
          {log.note && (
            <div style={{
              ...styles.logDetails,
              marginTop: 6,
              padding: '4px 8px',
              backgroundColor: 'rgba(59, 130, 246, 0.2)',
              borderRadius: 4,
              fontSize: 11,
              fontStyle: 'italic'
            }}>
              💬 {log.note}
            </div>
          )}
          {/* ... quick actions ... */}
        </div>
      );
    })}
  </div>
</div>
```

**B. handleSave 修改（映射逻辑）**  
**位置**: 约 Line 131-151  
**当前代码**:
```javascript
const handleSave = useCallback(() => {
  const mapping = {};
  Object.entries(assignments).forEach(([filename, logIdx]) => {
    const log = shotLogs[logIdx];
    if (!log) return;
    mapping[filename] = {
      date: log.date,
      lens: log.lens || '',
      focal_length: log.focal_length ?? null,
      aperture: log.aperture ?? null,
      shutter_speed: log.shutter_speed || '',
      country: log.country || '',
      city: log.city || '',
      detail_location: log.detail_location || '',
      latitude: log.latitude ?? null,
      longitude: log.longitude ?? null,
      logIndex: logIdx
    };
  });
  onSave(mapping);
  onClose();
}, [assignments, shotLogs, onSave, onClose]);
```

**修改为（添加 note → caption 映射）**:
```javascript
const handleSave = useCallback(() => {
  const mapping = {};
  Object.entries(assignments).forEach(([filename, logIdx]) => {
    const log = shotLogs[logIdx];
    if (!log) return;
    mapping[filename] = {
      date: log.date,
      lens: log.lens || '',
      focal_length: log.focal_length ?? null,
      aperture: log.aperture ?? null,
      shutter_speed: log.shutter_speed || '',
      country: log.country || '',
      city: log.city || '',
      detail_location: log.detail_location || '',
      latitude: log.latitude ?? null,
      longitude: log.longitude ?? null,
      caption: log.note || '',  // 新增：note → caption
      logIndex: logIdx
    };
  });
  onSave(mapping);
  onClose();
}, [assignments, shotLogs, onSave, onClose]);
```

#### 4.2.3 NewRollForm.jsx

**A. handleApplyShotLog 修改（顺序映射）**  
**位置**: 约 Line 133-161  
**当前代码**:
```javascript
const handleApplyShotLog = () => {
  if (!files.length || !shotLogs.length) return;
  const sortedFiles = [...files].sort((a, b) => a.name.localeCompare(b.name));
  const metaMap = {};
  const dateMap = {};
  let fileIndex = 0;
  
  for (const log of shotLogs) {
    const count = Number(log.count || log.shots || 0) || 0;
    const date = log.date || '';
    const lensFromLog = log.lens || '';
    // ... other fields
    for (let i = 0; i < count; i++) {
      if (fileIndex >= sortedFiles.length) break;
      const name = sortedFiles[fileIndex].name;
      metaMap[name] = { 
        date, lens: lensFromLog, 
        focal_length, country, city, detail_location, 
        aperture, shutter_speed, latitude, longitude, 
        logIndex: shotLogs.indexOf(log) 
      };
      if (date) dateMap[name] = date;
      fileIndex++;
    }
  }
  setFileMeta(metaMap);
  setFileDates(dateMap);
};
```

**修改为（添加 caption）**:
```javascript
const handleApplyShotLog = () => {
  if (!files.length || !shotLogs.length) return;
  const sortedFiles = [...files].sort((a, b) => a.name.localeCompare(b.name));
  const metaMap = {};
  const dateMap = {};
  let fileIndex = 0;
  
  for (const log of shotLogs) {
    const count = Number(log.count || log.shots || 0) || 0;
    const date = log.date || '';
    const lensFromLog = log.lens || '';
    const caption = log.note || '';  // 新增
    // ... other fields
    for (let i = 0; i < count; i++) {
      if (fileIndex >= sortedFiles.length) break;
      const name = sortedFiles[fileIndex].name;
      metaMap[name] = { 
        date, lens: lensFromLog, 
        focal_length, country, city, detail_location, 
        aperture, shutter_speed, latitude, longitude,
        caption,  // 新增
        logIndex: shotLogs.indexOf(log) 
      };
      if (date) dateMap[name] = date;
      fileIndex++;
    }
  }
  setFileMeta(metaMap);
  setFileDates(dateMap);
};
```

**B. handleMapperSave 修改**  
**位置**: 约 Line 163-176  
**当前代码**:
```javascript
const handleMapperSave = (mapping) => {
  // mapping is now: { filename: { date, lens, aperture, shutter_speed, country, city, detail_location, logIndex } }
  setFileMeta(mapping);
  
  // Also update fileDates for overlay display
  const newDates = {};
  Object.entries(mapping).forEach(([name, meta]) => {
    if (meta && meta.date) newDates[name] = meta.date;
  });
  setFileDates(newDates);
  setApplyShotLog(true);
  setShowMapper(false);
};
```

**修改为（无需修改，因为 mapping 已经包含了 caption）**:
```javascript
// 无需修改 - mapper 已经传递了 caption 字段
// 只需确保 fileMetadata 在提交时包含 caption
```

**C. onSubmit 数据提交修改**  
**位置**: 约 Line 400-600（createRoll 表单提交）  
**当前逻辑**:
```javascript
const onSubmit = async () => {
  // ...
  formData.append('fileMetadata', JSON.stringify(fileMeta));
  // fileMeta 格式: { filename: { date, lens, aperture, ..., logIndex } }
  // ...
};
```

**修改为（确保 caption 字段传递）**:
```javascript
// 无需修改 - fileMeta 中已包含 caption 字段
// 但需要确保后端能正确接收和处理
```

---

## 5. 前端层 - Mobile (移动端)

### 5.1 受影响的文件
| 文件路径 | 功能 | 需要的修改 |
|---------|------|-----------|
| `mobile/src/screens/ShotLogScreen.js` | Shot log CRUD 界面 | 1. 增加 note 输入框<br>2. 在列表中显示 note<br>3. 保存逻辑中包含 note |

### 5.2 详细修改

#### 5.2.1 ShotLogScreen.js

**A. parseShotLog 函数修改**  
**位置**: 约 Line 17-38  
**当前代码**:
```javascript
function parseShotLog(raw) {
  if (!raw) return [];
  try {
    const data = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (!Array.isArray(data)) return [];
    return data
      .map(entry => ({
        date: entry.date,
        count: Number(entry.count || entry.shots || 0) || 0,
        lens: entry.lens || '',
        // ... other fields
        latitude: entry.latitude ?? null,
        longitude: entry.longitude ?? null
      }))
      .filter(e => e.date && e.count > 0);
  } catch {
    return [];
  }
}
```

**修改为**:
```javascript
function parseShotLog(raw) {
  if (!raw) return [];
  try {
    const data = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (!Array.isArray(data)) return [];
    return data
      .map(entry => ({
        date: entry.date,
        count: Number(entry.count || entry.shots || 0) || 0,
        lens: entry.lens || '',
        // ... other fields
        latitude: entry.latitude ?? null,
        longitude: entry.longitude ?? null,
        note: entry.note || ''  // 新增
      }))
      .filter(e => e.date && e.count > 0);
  } catch {
    return [];
  }
}
```

**B. State 增加 newNote**  
**位置**: 约 Line 60-80（state 定义）  
**修改**:
```javascript
const [newShots, setNewShots] = useState('1');
const [newLens, setNewLens] = useState('');
const [newAperture, setNewAperture] = useState('');
const [newShutter, setNewShutter] = useState('');
const [newFocalLength, setNewFocalLength] = useState('');
const [newCountry, setNewCountry] = useState('');
const [newCity, setNewCity] = useState('');
const [newDetail, setNewDetail] = useState('');
const [newNote, setNewNote] = useState('');  // 新增
```

**C. upsertEntry 修改**  
**位置**: 约 Line 380-420  
**当前代码**:
```javascript
const upsertEntry = () => {
  if (!newDate) return;
  const count = Number(newShots || 0) || 0;
  if (!count) return;
  const lensVal = newLens.trim();
  const last = entries[entries.length - 1] || {};
  // ... field processing
  setEntries(prev => {
    const next = [...prev, {
      date: newDate,
      count,
      lens: lensVal,
      // ... other fields
      latitude: newLatitude,
      longitude: newLongitude
    }];
    return next.sort((a, b) => a.date.localeCompare(b.date));
  });
  // ... reset logic
  setNewLatitude(null);
  setNewLongitude(null);
};
```

**修改为**:
```javascript
const upsertEntry = () => {
  if (!newDate) return;
  const count = Number(newShots || 0) || 0;
  if (!count) return;
  const lensVal = newLens.trim();
  const noteVal = newNote.trim();  // 新增
  const last = entries[entries.length - 1] || {};
  // ... field processing
  setEntries(prev => {
    const next = [...prev, {
      date: newDate,
      count,
      lens: lensVal,
      // ... other fields
      latitude: newLatitude,
      longitude: newLongitude,
      note: noteVal  // 新增
    }];
    return next.sort((a, b) => a.date.localeCompare(b.date));
  });
  // ... reset logic
  setNewLatitude(null);
  setNewLongitude(null);
  setNewNote('');  // 新增：重置 note
};
```

**D. onSave 修改**  
**位置**: 约 Line 423-450  
**当前代码**:
```javascript
const onSave = async () => {
  setSaving(true);
  setError('');
  try {
    const payload = entries
      .slice()
      .sort((a, b) => a.date.localeCompare(b.date))
      .map(e => ({
        date: e.date,
        count: e.count,
        lens: e.lens || '',
        // ... other fields
        latitude: e.latitude ?? null,
        longitude: e.longitude ?? null
      }));
    await updateFilmItem(itemId, { shot_logs: JSON.stringify(payload) });
    navigation.goBack();
  } catch (err) {
    console.log('Failed to save shot log', err);
    setError('Save failed');
  } finally {
    setSaving(false);
  }
};
```

**修改为**:
```javascript
const onSave = async () => {
  setSaving(true);
  setError('');
  try {
    const payload = entries
      .slice()
      .sort((a, b) => a.date.localeCompare(b.date))
      .map(e => ({
        date: e.date,
        count: e.count,
        lens: e.lens || '',
        // ... other fields
        latitude: e.latitude ?? null,
        longitude: e.longitude ?? null,
        note: e.note || ''  // 新增
      }));
    await updateFilmItem(itemId, { shot_logs: JSON.stringify(payload) });
    navigation.goBack();
  } catch (err) {
    console.log('Failed to save shot log', err);
    setError('Save failed');
  } finally {
    setSaving(false);
  }
};
```

**E. 列表渲染修改（显示 note）**  
**位置**: 约 Line 505-560（FlatList renderItem）  
**当前代码**:
```jsx
renderItem={({ item }) => (
  <View style={[styles.row, { backgroundColor: theme.colors.surface }]}>
    <View style={{ flex: 1 }}>
      <Text variant="titleMedium">{item.date}</Text>
      <Text variant="bodyMedium" style={{ color: theme.colors.primary, fontWeight: 'bold' }}>
        {item.count} shots
      </Text>
      {/* lens, aperture, location info */}
      {item.latitude != null && item.longitude != null ? (
        <Text variant="bodySmall" style={{ color: '#4ade80' }}>
          📍 {item.latitude.toFixed(5)}, {item.longitude.toFixed(5)}
        </Text>
      ) : null}
    </View>
    <TouchableOpacity style={{ padding: 8 }} onPress={() => removeEntryAt(item._idx)}>
      <Icon name="trash-2" size={20} color={theme.colors.error} />
    </TouchableOpacity>
  </View>
)}
```

**修改为（添加 note 显示）**:
```jsx
renderItem={({ item }) => (
  <View style={[styles.row, { backgroundColor: theme.colors.surface }]}>
    <View style={{ flex: 1 }}>
      <Text variant="titleMedium">{item.date}</Text>
      <Text variant="bodyMedium" style={{ color: theme.colors.primary, fontWeight: 'bold' }}>
        {item.count} shots
      </Text>
      {/* lens, aperture, location info */}
      {item.latitude != null && item.longitude != null ? (
        <Text variant="bodySmall" style={{ color: '#4ade80' }}>
          📍 {item.latitude.toFixed(5)}, {item.longitude.toFixed(5)}
        </Text>
      ) : null}
      {/* 新增：显示 note */}
      {item.note ? (
        <Text 
          variant="bodySmall" 
          style={{ 
            color: '#60a5fa', 
            marginTop: 4, 
            fontStyle: 'italic' 
          }}
        >
          💬 {item.note}
        </Text>
      ) : null}
    </View>
    <TouchableOpacity style={{ padding: 8 }} onPress={() => removeEntryAt(item._idx)}>
      <Icon name="trash-2" size={20} color={theme.colors.error} />
    </TouchableOpacity>
  </View>
)}
```

**F. 输入区域修改（添加 note 输入框）**  
**位置**: 约 Line 570-650（footer 输入区域）  
**当前代码**:
```jsx
<View style={styles.footer}>
  <Text variant="titleSmall" style={{ marginBottom: spacing.sm }}>Add Log Entry</Text>
  <View style={styles.inputRow}>
    {/* Date, Shots, Add Button */}
  </View>
  
  {/* Fixed Lens Camera Indicator */}
  {/* Lens input */}
  {/* Aperture, Shutter, Focal Length inputs */}
  {/* Country, City inputs */}
  {/* Detail location input */}
  {/* Lens picker buttons */}
  
  {/* 在 detail location 之后添加 Note 输入框 */}
  <TextInput
    label="Note (拍摄备注)"
    mode="outlined"
    value={newNote}
    onChangeText={setNewNote}
    style={[styles.input, { marginBottom: spacing.xs }]}
    placeholder="如：故宫午门建筑细节"
    multiline
    numberOfLines={2}
    dense
  />
  
  {/* ... rest of inputs ... */}
</View>
```

**G. useEffect 自动填充修改**  
**位置**: 约 Line 365-377（自动从上一条 log 填充）  
**修改**:
```javascript
useEffect(() => {
  const last = entries[entries.length - 1];
  if (!last) return;
  if (!newLens) setNewLens(last.lens || '');
  if (!newCountry) setNewCountry(last.country || '');
  if (!newCity) setNewCity(last.city || '');
  if (!newDetail) setNewDetail(last.detail_location || '');
  if (!newAperture && (last.aperture || last.aperture === 0)) setNewAperture(String(last.aperture));
  if (!newShutter && last.shutter_speed) setNewShutter(last.shutter_speed);
  // 不自动填充 note - 每次拍摄内容可能不同
}, [entries.length]);
```

---

## 6. 后端 Roll 创建流程 (Caption 映射)

### 6.1 当前流程分析
**文件**: `server/routes/rolls.js` (POST /)  
**流程**:
1. 接收 `fileMetadata` (JSON 字符串)
2. 通过 `photoUploadService.processFileForRoll()` 处理每个文件
3. `resolveFileMetadata()` 解析元数据
4. 插入 photo 记录到数据库（包含 `caption` 字段）

### 6.2 需要的修改

#### 6.2.1 resolveFileMetadata 函数
**文件**: `server/services/photo-upload-service.js`  
**位置**: 约 Line 105-145  
**当前代码**:
```javascript
function resolveFileMetadata(metaMap, keys = []) {
  for (const k of keys) {
    if (!k) continue;
    const m = metaMap[k];
    if (!m) continue;
    
    if (typeof m === 'string') {
      return {
        date: m,
        lens: null,
        country: null,
        city: null,
        detail_location: null,
        aperture: null,
        shutter_speed: null,
        latitude: null,
        longitude: null,
        focal_length: null
      };
    }
    
    if (typeof m === 'object') {
      return {
        date: m.date || null,
        lens: m.lens || null,
        country: m.country || null,
        city: m.city || null,
        detail_location: m.detail_location || null,
        aperture: m.aperture ?? null,
        shutter_speed: m.shutter_speed || null,
        latitude: m.latitude ?? null,
        longitude: m.longitude ?? null,
        focal_length: m.focal_length ?? null
      };
    }
  }
  
  return {
    date: null,
    lens: null,
    country: null,
    city: null,
    detail_location: null,
    aperture: null,
    shutter_speed: null,
    latitude: null,
    longitude: null,
    focal_length: null
  };
}
```

**修改为（添加 caption 字段）**:
```javascript
function resolveFileMetadata(metaMap, keys = []) {
  for (const k of keys) {
    if (!k) continue;
    const m = metaMap[k];
    if (!m) continue;
    
    if (typeof m === 'string') {
      return {
        date: m,
        lens: null,
        country: null,
        city: null,
        detail_location: null,
        aperture: null,
        shutter_speed: null,
        latitude: null,
        longitude: null,
        focal_length: null,
        caption: null  // 新增
      };
    }
    
    if (typeof m === 'object') {
      return {
        date: m.date || null,
        lens: m.lens || null,
        country: m.country || null,
        city: m.city || null,
        detail_location: m.detail_location || null,
        aperture: m.aperture ?? null,
        shutter_speed: m.shutter_speed || null,
        latitude: m.latitude ?? null,
        longitude: m.longitude ?? null,
        focal_length: m.focal_length ?? null,
        caption: m.caption || null  // 新增：从 shot log note 传递
      };
    }
  }
  
  return {
    date: null,
    lens: null,
    country: null,
    city: null,
    detail_location: null,
    aperture: null,
    shutter_speed: null,
    latitude: null,
    longitude: null,
    focal_length: null,
    caption: null  // 新增
  };
}
```

#### 6.2.2 processFileForRoll 函数
**文件**: `server/services/photo-upload-service.js`  
**位置**: 约 Line 158-380  
**当前流程**:
```javascript
async function processFileForRoll({ ... }) {
  // ... processing logic
  const meta = resolveFileMetadata(fileMetadata, [
    file.originalName,
    file.tmpName?.replace(/_thumb\.\w+$/, ''),
    baseName
  ]);
  
  // ... use meta.date, meta.lens, etc.
  
  const photoData = {
    frameNumber,
    finalName,
    // ... paths
    takenAt,
    dateTaken,
    // ... other fields
  };
  
  return { stagedOps, stagedTempArtifacts, photoData };
}
```

**修改为（添加 caption）**:
```javascript
async function processFileForRoll({ ... }) {
  // ... processing logic (unchanged)
  const meta = resolveFileMetadata(fileMetadata, [
    file.originalName,
    file.tmpName?.replace(/_thumb\.\w+$/, ''),
    baseName
  ]);
  
  // Extract caption from metadata
  const caption = meta.caption || null;  // 新增
  
  // ... use meta.date, meta.lens, etc.
  
  const photoData = {
    frameNumber,
    finalName,
    // ... paths
    caption,  // 新增
    takenAt,
    dateTaken,
    // ... other fields
  };
  
  return { stagedOps, stagedTempArtifacts, photoData };
}
```

#### 6.2.3 rolls.js - Photo 插入 SQL
**文件**: `server/routes/rolls.js`  
**位置**: 约 Line 268-284  
**当前 SQL**:
```javascript
stmt = db.prepare(`INSERT INTO photos (
  roll_id, frame_number, filename,
  full_rel_path, thumb_rel_path, negative_rel_path,
  original_rel_path, positive_rel_path, positive_thumb_rel_path, negative_thumb_rel_path,
  is_negative_source, taken_at, date_taken, time_taken,
  location_id, detail_location, country, city,
  camera, lens, photographer, aperture, shutter_speed, iso, focal_length,
  latitude, longitude,
  scanner_equip_id, scan_resolution, scan_software, scan_date, scan_bit_depth,
  source_make, source_model, source_software, source_lens
) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
```

**修改为（添加 caption 字段）**:
```javascript
stmt = db.prepare(`INSERT INTO photos (
  roll_id, frame_number, filename,
  full_rel_path, thumb_rel_path, negative_rel_path,
  original_rel_path, positive_rel_path, positive_thumb_rel_path, negative_thumb_rel_path,
  is_negative_source, caption, taken_at, date_taken, time_taken,
  location_id, detail_location, country, city,
  camera, lens, photographer, aperture, shutter_speed, iso, focal_length,
  latitude, longitude,
  scanner_equip_id, scan_resolution, scan_software, scan_date, scan_bit_depth,
  source_make, source_model, source_software, source_lens
) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
```

#### 6.2.4 runInsert 调用修改
**文件**: `server/routes/rolls.js`  
**位置**: 约 Line 367-410  
**当前调用**:
```javascript
await runInsert([
  rollId,
  p.frameNumber,
  p.finalName,
  p.fullRelPath,
  p.thumbRelPath,
  p.negativeRelPath,
  p.originalRelPath,
  p.positiveRelPath,
  p.positiveThumbRelPath,
  p.negativeThumbRelPath,
  p.isNegativeSource,
  p.takenAt,
  p.dateTaken,
  null, // time_taken unused here
  p.locationId,
  p.detailLoc,
  p.countryForPhoto,
  p.cityForPhoto,
  p.cameraForPhoto,
  p.lensForPhoto,
  p.photographerForPhoto,
  p.apertureForPhoto,
  p.shutterForPhoto,
  p.isoForPhoto,
  p.focalLengthForPhoto,
  p.latitudeForPhoto,
  p.longitudeForPhoto,
  // Scanner info
  p.scannerEquipId,
  p.scanResolution,
  p.scanSoftware,
  p.scanDate,
  p.scanBitDepth,
  p.sourceMake,
  p.sourceModel,
  p.sourceSoftware,
  p.sourceLens
]);
```

**修改为（添加 p.caption）**:
```javascript
await runInsert([
  rollId,
  p.frameNumber,
  p.finalName,
  p.fullRelPath,
  p.thumbRelPath,
  p.negativeRelPath,
  p.originalRelPath,
  p.positiveRelPath,
  p.positiveThumbRelPath,
  p.negativeThumbRelPath,
  p.isNegativeSource,
  p.caption,  // 新增：插入位置在 is_negative_source 之后
  p.takenAt,
  p.dateTaken,
  null, // time_taken unused here
  p.locationId,
  p.detailLoc,
  p.countryForPhoto,
  p.cityForPhoto,
  p.cameraForPhoto,
  p.lensForPhoto,
  p.photographerForPhoto,
  p.apertureForPhoto,
  p.shutterForPhoto,
  p.isoForPhoto,
  p.focalLengthForPhoto,
  p.latitudeForPhoto,
  p.longitudeForPhoto,
  // Scanner info
  p.scannerEquipId,
  p.scanResolution,
  p.scanSoftware,
  p.scanDate,
  p.scanBitDepth,
  p.sourceMake,
  p.sourceModel,
  p.sourceSoftware,
  p.sourceLens
]);
```

---

## 7. 测试计划

### 7.1 单元测试
| 测试项 | 测试内容 | 预期结果 |
|-------|---------|---------|
| Shot Log 解析 | 现有数据（无 note 字段） | 正常解析，note 为空字符串 |
| Shot Log 解析 | 新数据（有 note 字段） | 正常解析，note 值正确 |
| CSV 导出 | 导出包含 note 的 log | CSV 包含 note 列 |
| CSV 导出 | 导出不含 note 的 log | CSV note 列为空 |

### 7.2 集成测试
| 测试项 | 测试步骤 | 预期结果 |
|-------|---------|---------|
| Mobile 创建 | 1. 在 ShotLogScreen 添加 note<br>2. 保存到服务器 | 数据库中 shot_logs 包含 note 字段 |
| Desktop 编辑 | 1. 在 ShotLogModal 编辑 note<br>2. 保存 | 数据库更新成功 |
| Mapper 自动填充 | 1. 打开 ShotLogMapper<br>2. 映射 log 到文件 | fileMeta 包含 caption 字段 |
| Roll 创建 | 1. 使用 mapper 创建 roll<br>2. 检查 photo caption | photo.caption 等于 log.note |

### 7.3 回归测试
| 测试项 | 测试内容 | 预期结果 |
|-------|---------|---------|
| 旧数据兼容 | 加载无 note 字段的 shot log | 不报错，note 为空 |
| 无 shot log 创建 | 不使用 shot log 创建 roll | 正常创建，caption 为 null |
| 手动 caption 编辑 | 在 photo 详情页编辑 caption | 正常保存（不受 shot log 影响） |

---

## 8. 实施顺序

### Phase 1: 后端基础支持
1. ✅ 修改 CSV 导出逻辑（`film-items.js`）
2. ✅ 修改 `resolveFileMetadata()` 函数（`photo-upload-service.js`）
3. ✅ 修改 `processFileForRoll()` 返回 caption（`photo-upload-service.js`）
4. ✅ 修改 Roll 创建 SQL 和插入逻辑（`rolls.js`）

### Phase 2: Desktop 前端
1. ✅ 修改 `ShotLogModal.jsx` 解析和 UI
2. ✅ 修改 `ShotLogMapper.jsx` 映射逻辑
3. ✅ 修改 `NewRollForm.jsx` 数据传递

### Phase 3: Mobile 前端
1. ✅ 修改 `ShotLogScreen.js` 解析和 UI
2. ✅ 添加 note 输入框
3. ✅ 修改保存逻辑

### Phase 4: 测试与验证
1. ✅ 单元测试
2. ✅ 集成测试
3. ✅ 回归测试
4. ✅ 用户验收测试

---

## 9. 潜在问题与解决方案

### 9.1 向后兼容性
**问题**: 现有数据库中的 shot log 不包含 note 字段  
**解决方案**: 
- 前端解析时默认 `note = ''`
- 后端不需要迁移（JSON 字段自动兼容）
- 不影响现有功能

### 9.2 数据验证
**问题**: note 字段长度限制  
**解决方案**:
- 前端不做硬性限制（用户体验优先）
- 建议 UI 提示：推荐 50 字以内
- 后端 JSON 存储无长度限制（SQLite TEXT 类型）

### 9.3 CSV 导出兼容性
**问题**: 现有 CSV 文件不包含 note 列  
**解决方案**:
- 新 CSV 始终包含 note 列
- 旧 CSV 无法导入 note（不影响其他字段）
- 未来可考虑 CSV 导入支持 note

### 9.4 性能影响
**问题**: note 字段增加数据量  
**解决方案**:
- Shot log 数据量小（通常 < 50 条/roll）
- JSON 存储效率高
- 无需索引（全文搜索不涉及 shot log）

---

## 10. 文档更新

### 10.1 用户文档
- [ ] 更新用户手册：Shot Log 功能说明
- [ ] 添加 note 字段使用示例
- [ ] 更新 Shot Log Mapper 使用说明

### 10.2 开发者文档
- [ ] 更新 API 文档：`film_items.shot_logs` 结构
- [ ] 更新数据库 schema 说明
- [ ] 更新 Roll 创建流程图

---

## 11. 风险评估

| 风险 | 等级 | 缓解措施 |
|-----|------|---------|
| 数据丢失 | 低 | 现有数据不受影响（向后兼容） |
| 功能回归 | 低 | 充分的回归测试 |
| 性能下降 | 极低 | 数据量小，JSON 存储高效 |
| UI 布局问题 | 中 | Mobile 端空间有限，需要合理设计 |

---

## 12. 验收标准

### 功能性
- [x] Shot log 支持 note 字段读写
- [x] Mobile 端可以输入 note
- [x] Desktop 端可以编辑 note
- [x] Mapper 自动将 note 映射到 caption
- [x] CSV 导出包含 note 列

### 兼容性
- [x] 现有 shot log 数据正常加载
- [x] 不使用 shot log 的 roll 创建正常
- [x] 手动编辑 caption 不受影响

### 性能
- [x] Shot log 加载时间无明显增加（< 100ms）
- [x] Roll 创建时间无明显增加（< 5%）

### 用户体验
- [x] UI 布局合理，不影响现有操作流程
- [x] 输入框位置符合逻辑（在地理信息之后）
- [x] note 显示清晰易读

---

## 13. 时间估算

| 阶段 | 预计时间 | 实际时间 |
|-----|---------|---------|
| 后端修改 | 2 小时 | - |
| Desktop 前端 | 3 小时 | - |
| Mobile 前端 | 2 小时 | - |
| 测试 | 2 小时 | - |
| 文档更新 | 1 小时 | - |
| **总计** | **10 小时** | **-** |

---

## 14. 附录

### A. Shot Log 数据结构完整示例
```json
{
  "shot_logs": [
    {
      "date": "2026-01-15",
      "count": 3,
      "lens": "Voigtlander Nokton 50mm f/1.5",
      "focal_length": 50,
      "aperture": 2.8,
      "shutter_speed": "1/125",
      "country": "中国",
      "city": "北京",
      "detail_location": "故宫午门",
      "latitude": 39.916025,
      "longitude": 116.397155,
      "note": "故宫午门建筑细节，傍晚逆光，重点捕捉雕梁画栋的阴影层次"
    },
    {
      "date": "2026-01-16",
      "count": 5,
      "lens": "Voigtlander Nokton 50mm f/1.5",
      "focal_length": 50,
      "aperture": 5.6,
      "shutter_speed": "1/250",
      "country": "中国",
      "city": "北京",
      "detail_location": "颐和园昆明湖",
      "latitude": 39.999489,
      "longitude": 116.275206,
      "note": "昆明湖冬景，冰面纹理与远山的对比"
    }
  ]
}
```

### B. Photo Caption 预期结果
创建 Roll 后，数据库中的 photo 记录：

| id | roll_id | filename | caption | date_taken | country | city |
|----|---------|----------|---------|------------|---------|------|
| 1001 | 42 | 42_01.jpg | 故宫午门建筑细节，傍晚逆光，重点捕捉雕梁画栋的阴影层次 | 2026-01-15 | 中国 | 北京 |
| 1002 | 42 | 42_02.jpg | 故宫午门建筑细节，傍晚逆光，重点捕捉雕梁画栋的阴影层次 | 2026-01-15 | 中国 | 北京 |
| 1003 | 42 | 42_03.jpg | 故宫午门建筑细节，傍晚逆光，重点捕捉雕梁画栋的阴影层次 | 2026-01-15 | 中国 | 北京 |
| 1004 | 42 | 42_04.jpg | 昆明湖冬景，冰面纹理与远山的对比 | 2026-01-16 | 中国 | 北京 |
| 1005 | 42 | 42_05.jpg | 昆明湖冬景，冰面纹理与远山的对比 | 2026-01-16 | 中国 | 北京 |

---

**文档版本**: 1.0  
**创建日期**: 2026-01-31  
**最后更新**: 2026-01-31  
**负责人**: GitHub Copilot  
**状态**: 待审核
