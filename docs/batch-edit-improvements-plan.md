# 批量修改照片信息流程优化方案 (v2 - 双保险版)

## 1. 核心目标

彻底解决批量修改照片信息时“误伤”非目标字段的问题（如修改地点时覆盖了时间）。
方案采用 **“脏字段追踪 (Dirty Tracking)”** 与 **“模块化独立保存 (Section-based Saving)”** 相结合的**双保险机制**。

## 2. 核心策略

1.  **第一重保险：脏字段追踪 (Dirty Tracking)**
    *   系统记录用户真正修改过的字段。
    *   无论何时进行保存，**只有**被标记为“脏”的字段才会被发送到后端。
    *   **解决痛点**：防止未修改的字段（如保持默认显示的第一张照片时间）覆盖其他照片的原有数据。

2.  **第二重保险：模块化独立保存 (Modular Saving)**
    *   将侧边栏划分为独立的逻辑模块（拍摄、位置、扫描）。
    *   每个模块拥有独立的“保存”按钮。
    *   点击某模块的保存按钮，**仅**处理该模块范围内的脏字段。
    *   **解决痛点**：物理隔离不同类型的数据提交，明确用户的操作意图，防止“无意中修改了A模块未保存，去操作B模块保存时把A的误操作也提交了”。

## 3. 架构设计：模块与字段映射

为实现模块化保存，首先需要在代码中明确定义字段所属的模块分组。

### 3.1 字段分组配置 (Field Groups)

建议在组件外部或单独的配置并在中定义以下映射关系：

| 模块 (Section) | 包含字段 (Fields) |
| :--- | :--- |
| **Capture (拍摄信息)** | `date_taken`, `time_taken`, `camera`, `lens`, `camera_equip_id`, `lens_equip_id`, `photographer`, `aperture`, `shutter_speed`, `iso` |
| **Location (地理位置)** | `location_id`, `country`, `city`, `detail_location`, `latitude`, `longitude` |
| **Scanning (扫描信息)** | `scanner_equip_id`, `scan_resolution`, `scan_software`, `scan_lab`, `scan_date`, `scan_cost`, `scan_notes` |

> *注：复合字段（如 `location` 对象涉及 id, country, city, lat, long）变更时，需同步标记组内所有相关原子字段为脏。*

## 4. 详细实施方案

### 4.1 状态管理改造

在 `PhotoDetailsSidebar.jsx` 中：

1.  **新增 `dirtyFields` 状态**：
    ```javascript
    const [dirtyFields, setDirtyFields] = useState(new Set());
    ```

2.  **封装 `markDirty` 函数**：
    ```javascript
    const markDirty = (fields) => {
      const fieldArray = Array.isArray(fields) ? fields : [fields];
      setDirtyFields(prev => {
        const next = new Set(prev);
        fieldArray.forEach(f => next.add(f));
        return next;
      });
    };
    ```

3.  **计算属性 `isSectionDirty`**：
    用于控制各模块保存按钮的“禁用/高亮”状态。只有当模块内存在脏字段时，按钮才可用。
    ```javascript
    const isSectionDirty = (sectionName) => {
      const sectionFields = FIELD_GROUPS[sectionName];
      return sectionFields.some(f => dirtyFields.has(f));
    };
    ```

### 4.2 输入交互改造

所有表单组件的 `onChange` 必须同时触发状态更新和脏标记。

*   **普通输入框**：
    `onChange={e => { setValue(e.target.value); markDirty('field_name'); }}`
*   **LocationInput (复合组件)**：
    `onChange={data => { setLocation(data); markDirty(['location_id', 'country', 'city', 'latitude', 'longitude']); }}`
*   **EquipmentSelector**：
    `onChange={(id, item) => { setEquipId(id); markDirty(['camera_equip_id', 'camera']); }}`

### 4.3 保存逻辑重构 (`handleSave`)

函数签名支持传入 `targetSection` 参数。

```javascript
/**
 * @param {string} [targetSection] -如果不传则为全局保存，传入则为模块保存
 */
async function handleSave(targetSection = null) {
  const payload = {};
  
  // 1. 确定本次允许提交的字段范围
  // 如果指定了 section，则候选字段限制在该 section 内；否则候选字段为全部
  const candidateFields = targetSection 
    ? FIELD_GROUPS[targetSection] 
    : ALL_FIELDS;

  // 2. 遍历候选字段，只有 dirty 的才加入 payload
  candidateFields.forEach(field => {
    if (dirtyFields.has(field)) {
      // 从 state 中获取当前值并赋值给 payload
      payload[field] = getValueFromState(field); 
    }
  });

  // 3. 空检查
  if (Object.keys(payload).length === 0) {
    // 提示用户“没有检测到修改”
    return;
  }
  
  // 4. 发送请求 (PUT)
  // ... 
  
  // 5. 保存成功后的处理
  // 从 dirtyFields 中移除已保存的字段
  setDirtyFields(prev => {
    const next = new Set(prev);
    Object.keys(payload).forEach(f => next.delete(f));
    return next;
  });
  
  // 如果是全局保存，可能需要关闭侧边栏；如果是模块保存，通常保持侧边栏开启以继续编辑
  if (!targetSection) {
    onClose && onClose();
  } else {
    // 模块保存后给出轻量级提示（如 Toast "Location saved"）
  }
}
```

### 4.4 UI 界面调整

在每个 `<section className="fg-sidepanel-section">` 的 Header 区域增加保存按钮。

**布局示例**：
```jsx
<div className="fg-section-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
  <div className="fg-section-label">Capture Info</div>
  {/* 模块保存按钮：仅当该模块脏时显示或高亮 */}
  <button 
    type="button" 
    className="fg-btn-mini" 
    disabled={!isSectionDirty('capture')}
    onClick={() => handleSave('capture')}
  >
    Save Capture
  </button>
</div>
```

同时，底部的全局保存按钮依然保留，文案可改为 "Save All Changes"，处理逻辑为 `handleSave(null)`。

## 5. 预期用户体验流程

1.  **场景：修正地点**
    *   用户打开批量编辑。
    *   在 **Location** 区域修改了城市。此时 Location 模块的保存按钮变亮。
    *   用户手抖不小心在上方改了一下 ISO。此时 Capture 模块的保存按钮也变亮。
    *   用户点击 **Location** 区域的 "Save Location"。
    *   **结果**：只有城市信息被提交更新。ISO 的误修改**不会**被提交。
    *   用户可以选择随后点击 Capture 的保存，或者直接关闭侧边栏（放弃 ISO 的修改）。

2.  **场景：强制刷新**
    *   如果用户想把第一张照片的时间应用给所有人，即使值没变？
    *   **对策**：用户必须在输入框里“动一下”（例如重新选择一下相同日期），触发 `dirty` 标记，然后点击保存。这符合“显式操作”的安全原则。

## 6. 执行步骤

1.  **定义常量**：在 `FieldGroups.js` 或组件顶部定义 `SECTION_FIELDS` 映射表。
2.  **Hook 接入**：在 `PhotoDetailsSidebar` 中实现 `dirtyFields` 逻辑。
3.  **绑定事件**：逐个检查 `input`, `select`, `EquipmentSelector`, `LocationInput`，绑定 `markDirty`。
4.  **实现 `handleSave`**：支持过滤字段并清理已保存的 dirty state。
5.  **UI 插入**：在三个 Section 的标题旁插入保存按钮。
6.  **测试**：验证单模块保存互不干扰，验证未修改字段不覆盖。