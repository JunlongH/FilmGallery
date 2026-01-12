/**
 * EquipmentSelector - 设备选择器组件
 * 
 * 通用的设备选择组件，支持相机、镜头、闪光灯的选择
 * 特性：
 * - 下拉选择 + 搜索过滤
 * - 显示设备缩略图
 * - 快速添加新设备
 * - 卡口兼容性过滤（镜头）
 * - 固定镜头相机自动处理
 */

import React, { useState, useEffect, useRef, useMemo } from 'react';
import { getCameras, getLenses, getFlashes, getCompatibleLenses, createCamera, createLens, createFlash } from '../api';
import { buildUploadUrl } from '../api';
import '../styles/forms.css';

// 设备类型配置
const EQUIPMENT_CONFIG = {
  camera: {
    fetchAll: getCameras,
    create: createCamera,
    label: 'Camera',
    placeholder: 'Select camera...',
    icon: '📷'
  },
  lens: {
    fetchAll: getLenses,
    create: createLens,
    label: 'Lens',
    placeholder: 'Select lens...',
    icon: '🔭'
  },
  flash: {
    fetchAll: getFlashes,
    create: createFlash,
    label: 'Flash',
    placeholder: 'Select flash...',
    icon: '⚡'
  }
};

export default function EquipmentSelector({
  type = 'camera', // 'camera' | 'lens' | 'flash'
  value = null,     // equipment ID or null
  onChange,         // (id, item) => void
  cameraId = null,  // for lens: filter by camera's mount
  disabled = false,
  showQuickAdd = true,
  className = '',
  style = {}
}) {
  const config = EQUIPMENT_CONFIG[type];
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [showAddForm, setShowAddForm] = useState(false);
  const [newName, setNewName] = useState('');
  const [fixedLensInfo, setFixedLensInfo] = useState(null); // For PS cameras
  const [useAdapter, setUseAdapter] = useState(false); // Show all lenses regardless of mount
  const [cameraMount, setCameraMount] = useState(null); // Camera's mount for display
  const dropdownRef = useRef(null);

  // Load equipment list
  useEffect(() => {
    let mounted = true;
    
    const fetchItems = async () => {
      setLoading(true);
      try {
        let data;
        
        // For lens, check camera compatibility
        if (type === 'lens' && cameraId) {
          const result = await getCompatibleLenses(cameraId);
          if (result.fixed_lens) {
            // Camera has fixed lens - show info instead of lens picker
            setFixedLensInfo({
              focal_length: result.focal_length,
              max_aperture: result.max_aperture
            });
            setCameraMount(null);
            setItems([]);
            if (mounted) setLoading(false);
            return;
          }
          setFixedLensInfo(null);
          setCameraMount(result.camera_mount || null);
          
          if (useAdapter) {
            // Adapter mode: fetch ALL lenses regardless of mount
            data = await config.fetchAll();
          } else {
            // Normal mode: only compatible lenses
            data = result.lenses || [];
          }
          if (mounted) setItems(Array.isArray(data) ? data : []);
        } else {
          data = await config.fetchAll();
          if (mounted) {
            setItems(Array.isArray(data) ? data : []);
            setFixedLensInfo(null);
            setCameraMount(null);
          }
        }
      } catch (err) {
        console.error(`[EquipmentSelector] Failed to load ${type}:`, err);
        if (mounted) setItems([]);
      } finally {
        if (mounted) setLoading(false);
      }
    };
    
    fetchItems();
    return () => { mounted = false; };
  }, [type, cameraId, config, useAdapter]);

  // Close dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setIsOpen(false);
        setShowAddForm(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Find selected item
  const selectedItem = useMemo(() => {
    if (!value) return null;
    return items.find(item => item.id === value) || null;
  }, [value, items]);

  // Filter items by search
  const filteredItems = useMemo(() => {
    if (!search.trim()) return items;
    const q = search.toLowerCase();
    return items.filter(item => 
      item.name?.toLowerCase().includes(q) ||
      item.brand?.toLowerCase().includes(q) ||
      item.model?.toLowerCase().includes(q)
    );
  }, [items, search]);

  // Handle item selection
  const handleSelect = (item) => {
    onChange?.(item.id, item);
    setIsOpen(false);
    setSearch('');
  };

  // Handle clear selection
  const handleClear = (e) => {
    e.stopPropagation();
    onChange?.(null, null);
  };

  // Handle quick add
  const handleQuickAdd = async () => {
    if (!newName.trim()) return;
    try {
      const created = await config.create({ name: newName.trim() });
      setItems(prev => [...prev, created]);
      onChange?.(created.id, created);
      setNewName('');
      setShowAddForm(false);
      setIsOpen(false);
    } catch (err) {
      console.error(`[EquipmentSelector] Failed to create ${type}:`, err);
      alert(`Failed to create ${config.label}`);
    }
  };

  // Render item display
  const renderItemDisplay = (item, isDropdown = false) => {
    const imgUrl = item.image_path ? buildUploadUrl(item.image_path) : null;
    
    return (
      <div className={`equip-item ${isDropdown ? 'equip-item-dropdown' : 'equip-item-selected'}`}>
        {imgUrl ? (
          <img src={imgUrl} alt={item.name} className="equip-thumb" />
        ) : (
          <span className="equip-icon">{config.icon}</span>
        )}
        <div className="equip-info">
          <span className="equip-name">{item.name}</span>
          {item.brand && <span className="equip-brand">{item.brand}</span>}
          {type === 'lens' && item.focal_length_min && (
            <span className="equip-spec">
              {item.focal_length_min === item.focal_length_max 
                ? `${item.focal_length_min}mm` 
                : `${item.focal_length_min}-${item.focal_length_max}mm`}
              {item.max_aperture && ` f/${item.max_aperture}`}
            </span>
          )}
          {type === 'camera' && item.mount && (
            <span className="equip-spec">{item.mount} mount</span>
          )}
        </div>
      </div>
    );
  };

  // For fixed lens cameras, show info instead of picker
  if (type === 'lens' && fixedLensInfo) {
    return (
      <div className={`equip-selector equip-selector-fixed ${className}`} style={style}>
        <div className="equip-fixed-lens">
          <span className="equip-icon">🔒</span>
          <span>Fixed Lens: {fixedLensInfo.focal_length}mm f/{fixedLensInfo.max_aperture}</span>
        </div>
      </div>
    );
  }

  return (
    <div className={`equip-selector ${className}`} style={style} ref={dropdownRef}>
      {/* Main trigger button */}
      <div 
        className={`equip-trigger ${isOpen ? 'open' : ''} ${disabled ? 'disabled' : ''}`}
        onClick={() => !disabled && setIsOpen(!isOpen)}
      >
        {loading ? (
          <span className="equip-loading">Loading...</span>
        ) : selectedItem ? (
          <>
            {renderItemDisplay(selectedItem)}
            <button className="equip-clear" onClick={handleClear} title="Clear">×</button>
          </>
        ) : (
          <span className="equip-placeholder">{config.placeholder}</span>
        )}
        <span className="equip-arrow">{isOpen ? '▲' : '▼'}</span>
      </div>

      {/* Dropdown */}
      {isOpen && !disabled && (
        <div className="equip-dropdown">
          {/* Search input */}
          <input
            type="text"
            className="equip-search"
            placeholder={`Search ${config.label.toLowerCase()}...`}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            autoFocus
          />

          {/* Adapter toggle for lens selection with camera */}
          {type === 'lens' && cameraId && cameraMount && (
            <div className="equip-adapter-toggle">
              <label className="equip-adapter-label">
                <input
                  type="checkbox"
                  checked={useAdapter}
                  onChange={(e) => setUseAdapter(e.target.checked)}
                />
                <span>Use Adapter (show all lenses)</span>
              </label>
              <span className="equip-mount-info">
                Camera mount: {cameraMount}
              </span>
            </div>
          )}

          {/* Items list */}
          <div className="equip-list">
            {filteredItems.length === 0 ? (
              <div className="equip-empty">
                {search ? `No ${config.label.toLowerCase()} found` : `No ${config.label.toLowerCase()} in library`}
              </div>
            ) : (
              filteredItems.map(item => (
                <div 
                  key={item.id} 
                  className={`equip-option ${item.id === value ? 'selected' : ''} ${type === 'lens' && useAdapter && item.mount && item.mount !== cameraMount ? 'adapted' : ''}`}
                  onClick={() => handleSelect(item)}
                >
                  {renderItemDisplay(item, true)}
                  {type === 'lens' && useAdapter && item.mount && item.mount !== cameraMount && (
                    <span className="equip-adapter-badge">Adapter</span>
                  )}
                </div>
              ))
            )}
          </div>

          {/* Quick add */}
          {showQuickAdd && (
            <div className="equip-add-section">
              {showAddForm ? (
                <div className="equip-add-form">
                  <input
                    type="text"
                    className="equip-add-input"
                    placeholder={`New ${config.label.toLowerCase()} name...`}
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleQuickAdd()}
                  />
                  <button className="equip-add-btn" onClick={handleQuickAdd}>Add</button>
                  <button className="equip-add-cancel" onClick={() => setShowAddForm(false)}>×</button>
                </div>
              ) : (
                <button 
                  className="equip-add-trigger"
                  onClick={() => setShowAddForm(true)}
                >
                  + Add New {config.label}
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// CSS styles for equipment selector
export const equipmentSelectorStyles = `
.equip-selector {
  position: relative;
  width: 100%;
}

.equip-trigger {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  border: 1px solid #d1d5db;
  border-radius: 6px;
  background: white;
  cursor: pointer;
  min-height: 42px;
  transition: border-color 0.2s, box-shadow 0.2s;
}

.equip-trigger:hover:not(.disabled) {
  border-color: #2563eb;
}

.equip-trigger.open {
  border-color: #2563eb;
  box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.1);
}

.equip-trigger.disabled {
  background: #f3f4f6;
  cursor: not-allowed;
  opacity: 0.7;
}

.equip-placeholder {
  color: #9ca3af;
  flex: 1;
}

.equip-loading {
  color: #6b7280;
  font-style: italic;
}

.equip-arrow {
  color: #6b7280;
  font-size: 10px;
}

.equip-clear {
  background: none;
  border: none;
  color: #9ca3af;
  font-size: 18px;
  cursor: pointer;
  padding: 0 4px;
  line-height: 1;
}

.equip-clear:hover {
  color: #ef4444;
}

.equip-dropdown {
  position: absolute;
  top: 100%;
  left: 0;
  right: 0;
  background: white;
  border: 1px solid #d1d5db;
  border-radius: 6px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  z-index: 100;
  margin-top: 4px;
  max-height: 350px;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.equip-search {
  padding: 10px 12px;
  border: none;
  border-bottom: 1px solid #e5e7eb;
  font-size: 14px;
  outline: none;
}

.equip-list {
  flex: 1;
  overflow-y: auto;
  max-height: 250px;
}

.equip-option {
  padding: 8px 12px;
  cursor: pointer;
  transition: background 0.15s;
}

.equip-option:hover {
  background: #f3f4f6;
}

.equip-option.selected {
  background: #eff6ff;
}

.equip-empty {
  padding: 20px;
  text-align: center;
  color: #9ca3af;
}

.equip-item {
  display: flex;
  align-items: center;
  gap: 10px;
  flex: 1;
}

.equip-thumb {
  width: 32px;
  height: 32px;
  object-fit: cover;
  border-radius: 4px;
  background: #f3f4f6;
}

.equip-icon {
  font-size: 20px;
  width: 32px;
  text-align: center;
}

.equip-info {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.equip-name {
  font-weight: 500;
  font-size: 14px;
  color: #1f2937;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.equip-brand {
  font-size: 12px;
  color: #6b7280;
}

.equip-spec {
  font-size: 11px;
  color: #9ca3af;
}

.equip-add-section {
  border-top: 1px solid #e5e7eb;
  padding: 8px 12px;
  background: #f9fafb;
}

.equip-add-trigger {
  width: 100%;
  padding: 8px;
  background: none;
  border: 1px dashed #d1d5db;
  border-radius: 4px;
  color: #6b7280;
  cursor: pointer;
  font-size: 13px;
  transition: all 0.15s;
}

.equip-add-trigger:hover {
  border-color: #2563eb;
  color: #2563eb;
}

.equip-add-form {
  display: flex;
  gap: 8px;
}

.equip-add-input {
  flex: 1;
  padding: 6px 10px;
  border: 1px solid #d1d5db;
  border-radius: 4px;
  font-size: 13px;
}

.equip-add-btn {
  padding: 6px 12px;
  background: #2563eb;
  color: white;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-size: 13px;
}

.equip-add-btn:hover {
  background: #1d4ed8;
}

.equip-add-cancel {
  padding: 6px 8px;
  background: none;
  border: none;
  color: #9ca3af;
  cursor: pointer;
  font-size: 16px;
}

.equip-fixed-lens {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  background: #f0fdf4;
  border: 1px solid #86efac;
  border-radius: 6px;
  color: #166534;
  font-size: 14px;
}

.equip-adapter-toggle {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 12px;
  background: #fefce8;
  border-bottom: 1px solid #fde047;
  font-size: 12px;
}

.equip-adapter-label {
  display: flex;
  align-items: center;
  gap: 6px;
  cursor: pointer;
  color: #854d0e;
}

.equip-adapter-label input[type="checkbox"] {
  cursor: pointer;
}

.equip-mount-info {
  color: #a16207;
  font-size: 11px;
}

.equip-option.adapted {
  background: #fffbeb;
}

.equip-adapter-badge {
  font-size: 10px;
  background: #fef3c7;
  color: #92400e;
  padding: 2px 6px;
  border-radius: 4px;
  margin-left: auto;
  font-weight: 500;
}
`;
