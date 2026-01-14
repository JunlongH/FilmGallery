/**
 * EquipmentManager - 设备管理页面
 * 
 * 管理相机、镜头、闪光灯和胶片格式
 * 特性：
 * - Tab切换不同设备类型
 * - 设备列表 + 详情编辑
 * - 图片上传
 * - PS机固定镜头/闪光灯设置
 */

import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  getCameras, createCamera, updateCamera, deleteCamera, uploadCameraImage,
  getLenses, createLens, updateLens, deleteLens, uploadLensImage,
  getFlashes, createFlash, updateFlash, deleteFlash, uploadFlashImage,

  getFilms, createFilm, updateFilm, deleteFilm, getFilmConstants,
  getEquipmentConstants, buildUploadUrl, getRolls
} from '../api';
import ModalDialog from './ModalDialog';
import '../styles/forms.css';
import './EquipmentManager.css';

// Tab configuration
const TABS = [
  { key: 'cameras', label: '📷 Cameras', icon: '📷' },
  { key: 'lenses', label: '🔭 Lenses', icon: '🔭' },
  { key: 'flashes', label: '⚡ Flashes', icon: '⚡' },
  { key: 'films', label: '🎞️ Films', icon: '🎞️' }
];

export default function EquipmentManager() {
  const [activeTab, setActiveTab] = useState('cameras');
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [constants, setConstants] = useState(null);
  const [selectedId, setSelectedId] = useState(null);
  const [editItem, setEditItem] = useState(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(null);

  // Load constants
  useEffect(() => {
    getEquipmentConstants().then(setConstants).catch(console.error);
    getFilmConstants().catch(console.error);
  }, []);

  // Load items based on active tab
  const loadItems = useCallback(async () => {
    setLoading(true);
    try {
      let data;
      switch (activeTab) {
        case 'cameras': data = await getCameras(); break;
        case 'lenses': data = await getLenses(); break;
        case 'flashes': data = await getFlashes(); break;
        case 'films': data = await getFilms(); break;
        default: data = [];
      }
      setItems(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error(`Failed to load ${activeTab}:`, err);
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [activeTab]);

  useEffect(() => {
    loadItems();
    setSelectedId(null);
    setEditItem(null);
  }, [loadItems]);

  // Get selected item details
  const selectedItem = items.find(i => i.id === selectedId);

  // Handle create
  const handleCreate = async (data) => {
    try {
      let created;
      switch (activeTab) {
        case 'cameras': created = await createCamera(data); break;
        case 'lenses': created = await createLens(data); break;
        case 'flashes': created = await createFlash(data); break;
        case 'films': created = await createFilm(data); break;
        default: return;
      }
      setItems(prev => [...prev, created]);
      setShowAddModal(false);
      setSelectedId(created.id);
    } catch (err) {
      console.error('Create failed:', err);
      alert('Failed to create item');
    }
  };

  // Handle update
  const handleUpdate = async (id, data) => {
    try {
      let updated;
      switch (activeTab) {
        case 'cameras': updated = await updateCamera(id, data); break;
        case 'lenses': updated = await updateLens(id, data); break;
        case 'flashes': updated = await updateFlash(id, data); break;
        case 'films': updated = await updateFilm({ id, ...data }); break;
        default: return;
      }
      setItems(prev => prev.map(i => i.id === id ? updated : i));
      setEditItem(null);
    } catch (err) {
      console.error('Update failed:', err);
      alert('Failed to update item');
    }
  };

  // Handle delete
  const handleDelete = async (id) => {
    try {
      switch (activeTab) {
        case 'cameras': await deleteCamera(id); break;
        case 'lenses': await deleteLens(id); break;
        case 'flashes': await deleteFlash(id); break;
        case 'films': await deleteFilm(id); break;
        default: return;
      }
      setItems(prev => prev.filter(i => i.id !== id));
      if (selectedId === id) setSelectedId(null);
      setConfirmDelete(null);
    } catch (err) {
      console.error('Delete failed:', err);
      alert('Failed to delete item');
    }
  };

  // Handle image upload
  const handleImageUpload = async (id, file) => {
    try {
      switch (activeTab) {
        case 'cameras': await uploadCameraImage(id, file); break;
        case 'lenses': await uploadLensImage(id, file); break;
        case 'flashes': await uploadFlashImage(id, file); break;
        default: return;
      }
      // Reload items to get updated image path
      loadItems();
    } catch (err) {
      console.error('Image upload failed:', err);
      alert('Failed to upload image');
    }
  };

  return (
    <div className="equipment-manager">
      {/* Header */}
      <div className="equip-header">
        <h1>Equipment Library</h1>
        <p>Manage your cameras, lenses, flashes, and film formats</p>
      </div>

      {/* Tabs */}
      <div className="equip-tabs">
        {TABS.map(tab => (
          <button
            key={tab.key}
            className={`equip-tab ${activeTab === tab.key ? 'active' : ''}`}
            onClick={() => setActiveTab(tab.key)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="equip-content">
        {/* List panel */}
        <div className="equip-list-panel">
          <div className="equip-list-header">
            <span>{items.length} items</span>
            <button className="btn btn-primary btn-sm" onClick={() => setShowAddModal(true)}>
              + Add New
            </button>
          </div>

          {loading ? (
            <div className="equip-loading">Loading...</div>
          ) : items.length === 0 ? (
            <div className="equip-empty-list">
              <p>No {activeTab} in your library yet.</p>
              <button className="btn btn-primary" onClick={() => setShowAddModal(true)}>
                Add Your First {activeTab === 'films' ? 'film' : activeTab.slice(0, -1)}
              </button>
            </div>
          ) : (
            <div className="equip-list">
              {items.map(item => (
                <div
                  key={item.id}
                  className={`equip-list-item ${selectedId === item.id ? 'selected' : ''}`}
                  onClick={() => setSelectedId(item.id)}
                >
                  {(item.image_path || item.thumbPath) ? (
                    <img src={buildUploadUrl(item.image_path || item.thumbPath)} alt={item.name} className="equip-list-thumb" />
                  ) : (
                    <div className="equip-list-thumb-placeholder">
                      {TABS.find(t => t.key === activeTab)?.icon}
                    </div>
                  )}
                  <div className="equip-list-info">
                    <div className="equip-list-name">
                      {item.name}
                    </div>
                    {activeTab === 'films' ? (
                      <div className="equip-list-brand">ISO {item.iso} • {item.format || '135'}</div>
                    ) : (
                      item.brand && <div className="equip-list-brand">{item.brand}</div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Detail panel */}
        <div className="equip-detail-panel">
          {selectedItem ? (
            editItem ? (
              <EditForm
                type={activeTab}
                item={editItem}
                constants={constants}
                onSave={(data) => handleUpdate(editItem.id, data)}
                onCancel={() => setEditItem(null)}
              />
            ) : (
              <DetailView
                type={activeTab}
                item={selectedItem}
                onEdit={() => setEditItem(selectedItem)}
                onDelete={() => setConfirmDelete(selectedItem)}
                onImageUpload={(file) => handleImageUpload(selectedItem.id, file)}
              />
            )
          ) : (
            <div className="equip-detail-empty">
              <p>Select an item to view details</p>
            </div>
          )}
        </div>
      </div>

      {/* Add Modal */}
      {showAddModal && (
        <AddModal
          type={activeTab}
          constants={constants}
          onSave={handleCreate}
          onClose={() => setShowAddModal(false)}
        />
      )}

      {/* Delete Confirmation */}
      {confirmDelete && (
        <ModalDialog
          isOpen={true}
          title="Delete Equipment"
          message={`Are you sure you want to delete "${confirmDelete.name}"?`}
          type="confirm"
          onConfirm={() => handleDelete(confirmDelete.id)}
          onCancel={() => setConfirmDelete(null)}
        />
      )}
    </div>
  );
}

// Detail View Component
function DetailView({ type, item, onEdit, onDelete, onImageUpload }) {
  const navigate = useNavigate();
  const [relatedRolls, setRelatedRolls] = useState([]);
  const [loadingRolls, setLoadingRolls] = useState(false);

  // Fetch related rolls based on equipment type
  useEffect(() => {
    if (!item?.id) return;
    
    const fetchRolls = async () => {
      setLoadingRolls(true);
      try {
        let filter = {};
        if (type === 'cameras') {
          filter = { camera_equip_id: item.id };
        } else if (type === 'lenses') {
          filter = { lens_equip_id: item.id };
        } else if (type === 'flashes') {
          filter = { flash_equip_id: item.id };
        } else if (type === 'films') {
          filter = { film_id: item.id };
        }
        const rolls = await getRolls(filter);
        setRelatedRolls(rolls || []);
      } catch (err) {
        console.error('Failed to load related rolls:', err);
        setRelatedRolls([]);
      } finally {
        setLoadingRolls(false);
      }
    };
    
    fetchRolls();
  }, [type, item?.id]);

  const handleFileChange = (e) => {
    if (e.target.files?.[0]) {
      onImageUpload(e.target.files[0]);
    }
  };

  // Category display label
  const getCategoryLabel = (cat) => {
    const labels = {
      'color-negative': 'Color Negative (C-41)',
      'color-reversal': 'Color Reversal (E-6)',
      'bw-negative': 'B&W Negative',
      'bw-reversal': 'B&W Reversal',
      'instant': 'Instant',
      'cine': 'Cinema (ECN-2)',
      'other': 'Other'
    };
    return labels[cat] || cat;
  };

  return (
    <div className="equip-detail">
      {/* Image section */}
      <div className="equip-detail-image-section">
        {(item.image_path || item.thumbPath) ? (
          <img src={buildUploadUrl(item.image_path || item.thumbPath)} alt={item.name} className="equip-detail-image" />
        ) : (
          <div className="equip-detail-image-placeholder">No Image</div>
        )}
        <label className="equip-upload-btn">
          Upload Image
          <input type="file" accept="image/*" onChange={handleFileChange} hidden />
        </label>
      </div>

      {/* Info section */}
      <div className="equip-detail-info">
        <h2>{item.model ? `${item.brand || ''} ${item.model}`.trim() : item.name}</h2>
        
        <div className="equip-detail-grid">
          {/* Film-specific fields */}
          {type === 'films' && (
            <>
              {item.iso && <DetailRow label="ISO" value={item.iso} />}
              {item.category && <DetailRow label="Category" value={getCategoryLabel(item.category)} />}
              {item.format && <DetailRow label="Format" value={item.format} />}
              {item.process && <DetailRow label="Process" value={item.process} />}
            </>
          )}
          
          {/* Non-film fields */}
          {type !== 'films' && item.brand && <DetailRow label="Brand" value={item.brand} />}
          {item.model && <DetailRow label="Model" value={item.model} />}
          {type !== 'films' && item.type && <DetailRow label="Type" value={item.type} />}
          {item.mount && <DetailRow label="Mount" value={item.mount} />}
          {item.format_name && <DetailRow label="Format" value={item.format_name} />}
          
          {/* Camera-specific */}
          {item.has_fixed_lens === 1 && (
            <>
              <DetailRow label="Fixed Lens" value="Yes" />
              {item.fixed_lens_focal_length && (
                <DetailRow label="Focal Length" value={`${item.fixed_lens_focal_length}mm`} />
              )}
              {item.fixed_lens_max_aperture && (
                <DetailRow label="Max Aperture" value={`f/${item.fixed_lens_max_aperture}`} />
              )}
            </>
          )}
          {item.has_built_in_flash === 1 && (
            <>
              <DetailRow label="Built-in Flash" value="Yes" />
              {item.flash_gn && <DetailRow label="Flash GN" value={item.flash_gn} />}
            </>
          )}
          {/* Camera technical specs */}
          {type === 'cameras' && (
            <>
              {item.meter_type && <DetailRow label="Meter" value={item.meter_type} />}
              {item.shutter_type && <DetailRow label="Shutter" value={item.shutter_type} />}
              {(item.shutter_speed_min || item.shutter_speed_max) && (
                <DetailRow 
                  label="Shutter Range" 
                  value={`${item.shutter_speed_min || '?'} - ${item.shutter_speed_max || '?'}`} 
                />
              )}
              {item.weight_g && <DetailRow label="Weight" value={`${item.weight_g}g`} />}
              {item.battery_type && <DetailRow label="Battery" value={item.battery_type} />}
              {(item.production_year_start || item.production_year_end) && (
                <DetailRow 
                  label="Production" 
                  value={item.production_year_end 
                    ? `${item.production_year_start || '?'} - ${item.production_year_end}` 
                    : `${item.production_year_start} - present`
                  } 
                />
              )}
            </>
          )}
          
          {/* Lens-specific */}
          {type === 'lenses' && (
            <>
              {item.focal_length_min && (
                <DetailRow 
                  label="Focal Length" 
                  value={item.focal_length_min === item.focal_length_max || !item.focal_length_max
                    ? `${item.focal_length_min}mm (Prime)` 
                    : `${item.focal_length_min}-${item.focal_length_max}mm (Zoom)`
                  } 
                />
              )}
              {item.max_aperture && (
                <DetailRow 
                  label="Max Aperture" 
                  value={item.max_aperture_tele && item.max_aperture !== item.max_aperture_tele
                    ? `f/${item.max_aperture}-${item.max_aperture_tele} (Variable)`
                    : `f/${item.max_aperture} (Constant)`
                  } 
                />
              )}
              {item.min_aperture && <DetailRow label="Min Aperture" value={`f/${item.min_aperture}`} />}
              {item.blade_count && <DetailRow label="Aperture Blades" value={item.blade_count} />}
              {item.focus_type && <DetailRow label="Focus" value={item.focus_type} />}
              {item.min_focus_distance && <DetailRow label="Min Focus" value={`${item.min_focus_distance}m`} />}
              {item.filter_size && <DetailRow label="Filter Size" value={`⌀${item.filter_size}mm`} />}
              {(item.elements || item.groups) && (
                <DetailRow label="Optical Formula" value={`${item.elements || '?'} elements in ${item.groups || '?'} groups`} />
              )}
              {item.weight_g && <DetailRow label="Weight" value={`${item.weight_g}g`} />}
              {item.is_macro === 1 && (
                <DetailRow label="Macro" value={item.magnification_ratio || 'Yes'} />
              )}
              {item.image_stabilization === 1 && <DetailRow label="Stabilization" value="IS/VR/OS" />}
              {(item.production_year_start || item.production_year_end) && (
                <DetailRow 
                  label="Production" 
                  value={item.production_year_end 
                    ? `${item.production_year_start || '?'} - ${item.production_year_end}` 
                    : `${item.production_year_start} - present`
                  } 
                />
              )}
            </>
          )}
          
          {/* Flash-specific */}
          {item.guide_number && <DetailRow label="Guide Number" value={item.guide_number} />}
          
          {/* Common fields */}
          {item.serial_number && <DetailRow label="Serial #" value={item.serial_number} />}
          {item.purchase_date && <DetailRow label="Purchase Date" value={item.purchase_date} />}
          {item.purchase_price && <DetailRow label="Price" value={`$${item.purchase_price}`} />}
          {item.condition && <DetailRow label="Condition" value={item.condition} />}
          {item.status && <DetailRow label="Status" value={item.status} />}
        </div>

        {item.notes && (
          <div className="equip-detail-notes">
            <label>Notes:</label>
            <p>{item.notes}</p>
          </div>
        )}

        {/* Related Rolls Section */}
        <div className="equip-related-rolls">
          <h3>Related Rolls ({relatedRolls.length})</h3>
          {loadingRolls ? (
            <div className="equip-rolls-loading">Loading...</div>
          ) : relatedRolls.length > 0 ? (
            <div className="equip-rolls-grid">
              {relatedRolls.map(roll => (
                <div 
                  key={roll.id} 
                  className="equip-roll-thumb"
                  onClick={() => navigate(`/rolls/${roll.id}`)}
                  title={roll.title || `Roll #${roll.id}`}
                >
                  {(roll.coverPath || roll.cover_photo) ? (
                    <img 
                      src={buildUploadUrl(roll.coverPath || roll.cover_photo)} 
                      alt={roll.title || `Roll #${roll.id}`} 
                    />
                  ) : (
                    <div className="equip-roll-placeholder">🎞️</div>
                  )}
                  <span className="equip-roll-title">{roll.title || `Roll #${roll.id}`}</span>
                </div>
              ))}
            </div>
          ) : (
            <div className="equip-rolls-empty">No rolls found</div>
          )}
        </div>

        <div className="equip-detail-actions">
          <button className="btn btn-primary" onClick={onEdit}>Edit</button>
          <button className="btn btn-danger" onClick={onDelete}>Delete</button>
        </div>
      </div>
    </div>
  );
}

function DetailRow({ label, value }) {
  return (
    <div className="equip-detail-row">
      <span className="equip-detail-label">{label}:</span>
      <span className="equip-detail-value">{value}</span>
    </div>
  );
}

// Edit Form Component
function EditForm({ type, item, constants, onSave, onCancel }) {
  const [form, setForm] = useState({ ...item });

  const handleChange = (field, value) => {
    setForm(prev => ({ ...prev, [field]: value }));
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    onSave(form);
  };

  return (
    <form className="equip-edit-form" onSubmit={handleSubmit}>
      <h3>Edit {type.slice(0, -1)}</h3>
      
      <FormFields type={type} form={form} onChange={handleChange} constants={constants} />

      <div className="equip-form-actions">
        <button type="submit" className="btn btn-primary">Save</button>
        <button type="button" className="btn btn-secondary" onClick={onCancel}>Cancel</button>
      </div>
    </form>
  );
}

// Add Modal Component
function AddModal({ type, constants, onSave, onClose }) {
  const [form, setForm] = useState({
    name: '',
    brand: '',
    model: ''
  });

  const handleChange = (field, value) => {
    setForm(prev => ({ ...prev, [field]: value }));
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!form.name.trim()) {
      alert('Name is required');
      return;
    }
    onSave(form);
  };

  return (
    <div className="fg-modal-overlay" onClick={onClose}>
      <div className="fg-modal-panel equip-add-modal" onClick={e => e.stopPropagation()}>
        <h3>Add New {type.slice(0, -1)}</h3>
        
        <form onSubmit={handleSubmit}>
          <FormFields type={type} form={form} onChange={handleChange} constants={constants} />
          
          <div className="equip-form-actions">
            <button type="submit" className="btn btn-primary">Create</button>
            <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
          </div>
        </form>
      </div>
    </div>
  );
}

// Form Fields Component (shared between edit and add)
function FormFields({ type, form, onChange, constants }) {
  const cameraTypes = constants?.cameraTypes || [];
  const lensMounts = constants?.lensMounts || [];
  const focusTypes = constants?.focusTypes || [];
  const conditions = constants?.conditions || [];
  const statuses = constants?.statuses || [];

  return (
    <div className="equip-form-fields">
      {/* Common fields */}
      <div className="form-row">
        <label>Name *</label>
        <input
          type="text"
          value={form.name || ''}
          onChange={e => onChange('name', e.target.value)}
          required
        />
      </div>

      <div className="form-row">
        <label>Brand</label>
        <input
          type="text"
          value={form.brand || ''}
          onChange={e => onChange('brand', e.target.value)}
        />
      </div>

      <div className="form-row">
        <label>Model</label>
        <input
          type="text"
          value={form.model || ''}
          onChange={e => onChange('model', e.target.value)}
        />
      </div>

      {/* Camera-specific fields */}
      {type === 'cameras' && (
        <>
          <div className="form-row">
            <label>Type</label>
            <select value={form.type || ''} onChange={e => onChange('type', e.target.value)}>
              <option value="">Select type...</option>
              {cameraTypes.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>

          <div className="form-row">
            <label>Mount</label>
            <select value={form.mount || ''} onChange={e => onChange('mount', e.target.value)}>
              <option value="">Select mount...</option>
              {lensMounts.map(m => <option key={m} value={m}>{m}</option>)}
            </select>
          </div>

          <div className="form-row checkbox-row">
            <label>
              <input
                type="checkbox"
                checked={form.has_fixed_lens === 1 || form.has_fixed_lens === true}
                onChange={e => onChange('has_fixed_lens', e.target.checked ? 1 : 0)}
              />
              Fixed Lens (Point & Shoot)
            </label>
          </div>

          {(form.has_fixed_lens === 1 || form.has_fixed_lens === true) && (
            <>
              <div className="form-row">
                <label>Fixed Lens Focal Length (mm)</label>
                <input
                  type="number"
                  value={form.fixed_lens_focal_length || ''}
                  onChange={e => onChange('fixed_lens_focal_length', parseFloat(e.target.value) || null)}
                />
              </div>
              <div className="form-row">
                <label>Fixed Lens Max Aperture (f/)</label>
                <input
                  type="number"
                  step="0.1"
                  value={form.fixed_lens_max_aperture || ''}
                  onChange={e => onChange('fixed_lens_max_aperture', parseFloat(e.target.value) || null)}
                />
              </div>
            </>
          )}

          <div className="form-row checkbox-row">
            <label>
              <input
                type="checkbox"
                checked={form.has_built_in_flash === 1 || form.has_built_in_flash === true}
                onChange={e => onChange('has_built_in_flash', e.target.checked ? 1 : 0)}
              />
              Built-in Flash
            </label>
          </div>

          {(form.has_built_in_flash === 1 || form.has_built_in_flash === true) && (
            <div className="form-row">
              <label>Flash Guide Number</label>
              <input
                type="number"
                value={form.flash_gn || ''}
                onChange={e => onChange('flash_gn', parseFloat(e.target.value) || null)}
              />
            </div>
          )}

          {/* Camera Technical Specs Section */}
          <div className="form-section-header">Technical Specifications</div>

          <div className="form-row-inline">
            <div className="form-row">
              <label>Meter Type</label>
              <select value={form.meter_type || ''} onChange={e => onChange('meter_type', e.target.value)}>
                <option value="">Select meter type...</option>
                <option value="none">None (Unmetered)</option>
                <option value="match-needle">Match Needle</option>
                <option value="center-weighted">Center-Weighted</option>
                <option value="matrix">Matrix/Evaluative</option>
                <option value="spot">Spot</option>
              </select>
            </div>
            <div className="form-row">
              <label>Shutter Type</label>
              <select value={form.shutter_type || ''} onChange={e => onChange('shutter_type', e.target.value)}>
                <option value="">Select shutter type...</option>
                <option value="focal-plane">Focal Plane</option>
                <option value="leaf">Leaf</option>
                <option value="electronic">Electronic</option>
              </select>
            </div>
          </div>

          <div className="form-row-inline">
            <div className="form-row">
              <label>Slowest Shutter</label>
              <input
                type="text"
                value={form.shutter_speed_min || ''}
                onChange={e => onChange('shutter_speed_min', e.target.value)}
                placeholder="e.g., B, 30, 1"
              />
            </div>
            <div className="form-row">
              <label>Fastest Shutter</label>
              <input
                type="text"
                value={form.shutter_speed_max || ''}
                onChange={e => onChange('shutter_speed_max', e.target.value)}
                placeholder="e.g., 1/1000, 1/4000"
              />
            </div>
          </div>

          <div className="form-row-inline">
            <div className="form-row">
              <label>Weight (g)</label>
              <input
                type="number"
                value={form.weight_g || ''}
                onChange={e => onChange('weight_g', parseFloat(e.target.value) || null)}
                placeholder="Body only"
              />
            </div>
            <div className="form-row">
              <label>Battery Type</label>
              <input
                type="text"
                value={form.battery_type || ''}
                onChange={e => onChange('battery_type', e.target.value)}
                placeholder="e.g., LR44, SR44, AA x 4"
              />
            </div>
          </div>

          <div className="form-row-inline">
            <div className="form-row">
              <label>Production Start Year</label>
              <input
                type="number"
                value={form.production_year_start || ''}
                onChange={e => onChange('production_year_start', parseInt(e.target.value) || null)}
                placeholder="e.g., 1985"
              />
            </div>
            <div className="form-row">
              <label>Production End Year</label>
              <input
                type="number"
                value={form.production_year_end || ''}
                onChange={e => onChange('production_year_end', parseInt(e.target.value) || null)}
                placeholder="Leave empty if current"
              />
            </div>
          </div>
        </>
      )}

      {/* Lens-specific fields */}
      {type === 'lenses' && (
        <>
          <div className="form-row-inline">
            <div className="form-row">
              <label>Focal Length Min (mm)</label>
              <input
                type="number"
                value={form.focal_length_min || ''}
                onChange={e => onChange('focal_length_min', parseFloat(e.target.value) || null)}
              />
            </div>
            <div className="form-row">
              <label>Focal Length Max (mm)</label>
              <input
                type="number"
                value={form.focal_length_max || ''}
                onChange={e => onChange('focal_length_max', parseFloat(e.target.value) || null)}
                placeholder="Same as min for prime"
              />
            </div>
          </div>

          <div className="form-row-inline">
            <div className="form-row">
              <label>Max Aperture (f/)</label>
              <input
                type="number"
                step="0.1"
                value={form.max_aperture || ''}
                onChange={e => onChange('max_aperture', parseFloat(e.target.value) || null)}
                placeholder="e.g., 2.8"
              />
            </div>
            <div className="form-row">
              <label>Max Aperture @ Tele (f/)</label>
              <input
                type="number"
                step="0.1"
                value={form.max_aperture_tele || ''}
                onChange={e => onChange('max_aperture_tele', parseFloat(e.target.value) || null)}
                placeholder="For variable zooms"
              />
            </div>
          </div>

          <div className="form-row-inline">
            <div className="form-row">
              <label>Min Aperture (f/)</label>
              <input
                type="number"
                step="0.1"
                value={form.min_aperture || ''}
                onChange={e => onChange('min_aperture', parseFloat(e.target.value) || null)}
                placeholder="e.g., 22"
              />
            </div>
            <div className="form-row">
              <label>Aperture Blades</label>
              <input
                type="number"
                value={form.blade_count || ''}
                onChange={e => onChange('blade_count', parseInt(e.target.value) || null)}
                placeholder="e.g., 8"
              />
            </div>
          </div>

          <div className="form-row">
            <label>Mount</label>
            <select value={form.mount || ''} onChange={e => onChange('mount', e.target.value)}>
              <option value="">Select mount...</option>
              {lensMounts.map(m => <option key={m} value={m}>{m}</option>)}
            </select>
          </div>

          <div className="form-row">
            <label>Focus Type</label>
            <select value={form.focus_type || ''} onChange={e => onChange('focus_type', e.target.value)}>
              {focusTypes.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>

          <div className="form-row-inline">
            <div className="form-row">
              <label>Min Focus Distance (m)</label>
              <input
                type="number"
                step="0.01"
                value={form.min_focus_distance || ''}
                onChange={e => onChange('min_focus_distance', parseFloat(e.target.value) || null)}
                placeholder="e.g., 0.45"
              />
            </div>
            <div className="form-row">
              <label>Filter Size (mm)</label>
              <input
                type="number"
                value={form.filter_size || ''}
                onChange={e => onChange('filter_size', parseFloat(e.target.value) || null)}
                placeholder="e.g., 52"
              />
            </div>
          </div>

          <div className="form-row-inline">
            <div className="form-row">
              <label>Elements</label>
              <input
                type="number"
                value={form.elements || ''}
                onChange={e => onChange('elements', parseInt(e.target.value) || null)}
              />
            </div>
            <div className="form-row">
              <label>Groups</label>
              <input
                type="number"
                value={form.groups || ''}
                onChange={e => onChange('groups', parseInt(e.target.value) || null)}
              />
            </div>
            <div className="form-row">
              <label>Weight (g)</label>
              <input
                type="number"
                value={form.weight_g || ''}
                onChange={e => onChange('weight_g', parseFloat(e.target.value) || null)}
              />
            </div>
          </div>

          <div className="form-row-inline">
            <div className="form-row">
              <label>Production Start Year</label>
              <input
                type="number"
                value={form.production_year_start || ''}
                onChange={e => onChange('production_year_start', parseInt(e.target.value) || null)}
                placeholder="e.g., 1985"
              />
            </div>
            <div className="form-row">
              <label>Production End Year</label>
              <input
                type="number"
                value={form.production_year_end || ''}
                onChange={e => onChange('production_year_end', parseInt(e.target.value) || null)}
                placeholder="Leave empty if current"
              />
            </div>
          </div>

          <div className="form-row checkbox-row">
            <label>
              <input
                type="checkbox"
                checked={form.is_macro === 1 || form.is_macro === true}
                onChange={e => onChange('is_macro', e.target.checked ? 1 : 0)}
              />
              Macro Lens
            </label>
          </div>

          {(form.is_macro === 1 || form.is_macro === true) && (
            <div className="form-row">
              <label>Magnification Ratio</label>
              <select value={form.magnification_ratio || ''} onChange={e => onChange('magnification_ratio', e.target.value)}>
                <option value="">Select ratio...</option>
                <option value="1:1">1:1 (Life-size)</option>
                <option value="1:2">1:2 (Half life-size)</option>
                <option value="1:3">1:3</option>
                <option value="1:4">1:4</option>
                <option value="1:5">1:5</option>
                <option value="1:10">1:10</option>
              </select>
            </div>
          )}

          <div className="form-row checkbox-row">
            <label>
              <input
                type="checkbox"
                checked={form.image_stabilization === 1 || form.image_stabilization === true}
                onChange={e => onChange('image_stabilization', e.target.checked ? 1 : 0)}
              />
              Image Stabilization (IS/VR/OS)
            </label>
          </div>
        </>
      )}

      {/* Flash-specific fields */}
      {type === 'flashes' && (
        <>
          <div className="form-row">
            <label>Guide Number</label>
            <input
              type="number"
              value={form.guide_number || ''}
              onChange={e => onChange('guide_number', parseFloat(e.target.value) || null)}
            />
          </div>
          
          <div className="form-row checkbox-row">
            <label>
              <input
                type="checkbox"
                checked={form.ttl_compatible === 1 || form.ttl_compatible === true}
                onChange={e => onChange('ttl_compatible', e.target.checked ? 1 : 0)}
              />
              TTL Compatible
            </label>
          </div>
        </>
      )}

      {/* Film format fields */}
      {type === 'formats' && (
        <>
          <div className="form-row">
            <label>Description</label>
            <input
              type="text"
              value={form.description || ''}
              onChange={e => onChange('description', e.target.value)}
            />
          </div>
          <div className="form-row">
            <label>Frame Size</label>
            <input
              type="text"
              value={form.frame_size || ''}
              onChange={e => onChange('frame_size', e.target.value)}
              placeholder="e.g., 24x36mm"
            />
          </div>
        </>
      )}

      {/* Film (stock) fields */}
      {type === 'films' && (
        <>
          <div className="form-row">
            <label>ISO *</label>
            <input
              type="number"
              value={form.iso || ''}
              onChange={e => onChange('iso', parseInt(e.target.value) || null)}
              required
            />
          </div>
          <div className="form-row">
            <label>Category *</label>
            <select value={form.category || ''} onChange={e => onChange('category', e.target.value)} required>
              <option value="">Select category...</option>
              <option value="color-negative">Color Negative (C-41)</option>
              <option value="color-reversal">Color Reversal (E-6)</option>
              <option value="bw-negative">B&W Negative</option>
              <option value="bw-reversal">B&W Reversal</option>
              <option value="instant">Instant</option>
              <option value="cine">Cinema (ECN-2)</option>
              <option value="other">Other</option>
            </select>
          </div>
          <div className="form-row">
            <label>Format</label>
            <select value={form.format || '135'} onChange={e => onChange('format', e.target.value)}>
              <option value="135">35mm (135)</option>
              <option value="120">Medium Format (120)</option>
              <option value="220">Medium Format (220)</option>
              <option value="110">110</option>
              <option value="127">127</option>
              <option value="4x5">4x5 Large Format</option>
              <option value="8x10">8x10 Large Format</option>
              <option value="Instant">Instant</option>
              <option value="APS">APS</option>
              <option value="Half Frame">Half Frame</option>
              <option value="Super 8">Super 8</option>
              <option value="16mm">16mm Cine</option>
              <option value="35mm Cine">35mm Cinema</option>
              <option value="Other">Other</option>
            </select>
          </div>
          <div className="form-row">
            <label>Process</label>
            <select value={form.process || ''} onChange={e => onChange('process', e.target.value)}>
              <option value="">Auto-detect from category</option>
              <option value="C-41">C-41</option>
              <option value="E-6">E-6</option>
              <option value="BW">Black & White</option>
              <option value="ECN-2">ECN-2 (Cinema)</option>
            </select>
          </div>
        </>
      )}

      {/* Common ownership fields (not for formats or films) */}
      {type !== 'formats' && type !== 'films' && (
        <>
          <div className="form-row">
            <label>Serial Number</label>
            <input
              type="text"
              value={form.serial_number || ''}
              onChange={e => onChange('serial_number', e.target.value)}
            />
          </div>

          <div className="form-row">
            <label>Purchase Date</label>
            <input
              type="date"
              value={form.purchase_date || ''}
              onChange={e => onChange('purchase_date', e.target.value)}
            />
          </div>

          <div className="form-row">
            <label>Purchase Price</label>
            <input
              type="number"
              step="0.01"
              value={form.purchase_price || ''}
              onChange={e => onChange('purchase_price', parseFloat(e.target.value) || null)}
            />
          </div>

          <div className="form-row">
            <label>Condition</label>
            <select value={form.condition || ''} onChange={e => onChange('condition', e.target.value)}>
              <option value="">Select condition...</option>
              {conditions.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>

          <div className="form-row">
            <label>Status</label>
            <select value={form.status || 'owned'} onChange={e => onChange('status', e.target.value)}>
              {statuses.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>

          <div className="form-row">
            <label>Notes</label>
            <textarea
              value={form.notes || ''}
              onChange={e => onChange('notes', e.target.value)}
              rows={3}
            />
          </div>
        </>
      )}
    </div>
  );
}
