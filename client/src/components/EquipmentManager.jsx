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
import {
  getCameras, createCamera, updateCamera, deleteCamera, uploadCameraImage,
  getLenses, createLens, updateLens, deleteLens, uploadLensImage,
  getFlashes, createFlash, updateFlash, deleteFlash, uploadFlashImage,
  getFilms, createFilm, updateFilm, deleteFilm, 
  getFilmCategories, getFilmFormats,
  getEquipmentConstants, buildUploadUrl
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
  const [filmConstants, setFilmConstants] = useState({ categories: [], formats: [] });
  const [selectedId, setSelectedId] = useState(null);
  const [editItem, setEditItem] = useState(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(null);

  // Load constants
  useEffect(() => {
    getEquipmentConstants().then(setConstants).catch(console.error);
    // Load film-specific constants
    Promise.all([getFilmCategories(), getFilmFormats()])
      .then(([cats, fmts]) => setFilmConstants({ categories: cats || [], formats: fmts || [] }))
      .catch(console.error);
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

  // Handle image upload (films use FormData with 'thumb' field)
  const handleImageUpload = async (id, file) => {
    try {
      if (activeTab === 'films') {
        // For films, use updateFilm with thumbFile
        await updateFilm({ id, thumbFile: file });
      } else {
        switch (activeTab) {
          case 'cameras': await uploadCameraImage(id, file); break;
          case 'lenses': await uploadLensImage(id, file); break;
          case 'flashes': await uploadFlashImage(id, file); break;
          default: return;
        }
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
        <p>Manage your cameras, lenses, flashes, and films</p>
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
                Add Your First {activeTab.slice(0, -1)}
              </button>
            </div>
          ) : (
            <div className="equip-list">
              {items.map(item => {
                // For films, use thumbPath or thumbnail_url instead of image_path
                const imagePath = activeTab === 'films' 
                  ? (item.thumbPath || item.thumbnail_url) 
                  : item.image_path;
                return (
                  <div
                    key={item.id}
                    className={`equip-list-item ${selectedId === item.id ? 'selected' : ''}`}
                    onClick={() => setSelectedId(item.id)}
                  >
                    {imagePath ? (
                      <img src={buildUploadUrl(imagePath)} alt={item.name} className="equip-list-thumb" />
                    ) : (
                      <div className="equip-list-thumb-placeholder">
                        {TABS.find(t => t.key === activeTab)?.icon}
                      </div>
                    )}
                    <div className="equip-list-info">
                      <div className="equip-list-name">
                        {activeTab === 'films' && item.brand ? `${item.brand} ` : ''}{item.name}
                      </div>
                      {activeTab === 'films' ? (
                        <div className="equip-list-brand">ISO {item.iso} · {item.format || '135'}</div>
                      ) : (
                        item.brand && <div className="equip-list-brand">{item.brand}</div>
                      )}
                    </div>
                  </div>
                );
              })}
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
                filmConstants={filmConstants}
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
          filmConstants={filmConstants}
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
  const handleFileChange = (e) => {
    if (e.target.files?.[0]) {
      onImageUpload(e.target.files[0]);
    }
  };

  // For films, use thumbPath instead of image_path
  const imagePath = type === 'films' 
    ? (item.thumbPath || item.thumbnail_url) 
    : item.image_path;

  return (
    <div className="equip-detail">
      {/* Image section */}
      <div className="equip-detail-image-section">
        {imagePath ? (
          <img src={buildUploadUrl(imagePath)} alt={item.name} className="equip-detail-image" />
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
        <h2>{type === 'films' && item.brand ? `${item.brand} ` : ''}{item.name}</h2>
        
        <div className="equip-detail-grid">
          {/* Film-specific fields */}
          {type === 'films' && (
            <>
              {item.brand && <DetailRow label="Brand" value={item.brand} />}
              <DetailRow label="ISO" value={item.iso} />
              {item.category && <DetailRow label="Category" value={item.category} />}
              {item.format && <DetailRow label="Format" value={item.format} />}
              {item.process && <DetailRow label="Process" value={item.process} />}
            </>
          )}
          
          {/* Non-film equipment fields */}
          {type !== 'films' && item.brand && <DetailRow label="Brand" value={item.brand} />}
          {item.model && <DetailRow label="Model" value={item.model} />}
          {item.type && <DetailRow label="Type" value={item.type} />}
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
          
          {/* Lens-specific */}
          {item.focal_length_min && (
            <DetailRow 
              label="Focal Length" 
              value={item.focal_length_min === item.focal_length_max 
                ? `${item.focal_length_min}mm` 
                : `${item.focal_length_min}-${item.focal_length_max}mm`
              } 
            />
          )}
          {item.max_aperture && <DetailRow label="Max Aperture" value={`f/${item.max_aperture}`} />}
          {item.min_aperture && <DetailRow label="Min Aperture" value={`f/${item.min_aperture}`} />}
          {item.focus_type && <DetailRow label="Focus" value={item.focus_type} />}
          
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
function EditForm({ type, item, constants, filmConstants, onSave, onCancel }) {
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
      
      <FormFields type={type} form={form} onChange={handleChange} constants={constants} filmConstants={filmConstants} />

      <div className="equip-form-actions">
        <button type="submit" className="btn btn-primary">Save</button>
        <button type="button" className="btn btn-secondary" onClick={onCancel}>Cancel</button>
      </div>
    </form>
  );
}

// Add Modal Component
function AddModal({ type, constants, filmConstants, onSave, onClose }) {
  const [form, setForm] = useState(
    type === 'films' 
      ? { name: '', brand: '', iso: 400, category: 'color-negative', format: '135', process: 'C-41' }
      : { name: '', brand: '', model: '' }
  );

  const handleChange = (field, value) => {
    setForm(prev => ({ ...prev, [field]: value }));
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!form.name.trim()) {
      alert('Name is required');
      return;
    }
    if (type === 'films' && !form.iso) {
      alert('ISO is required');
      return;
    }
    onSave(form);
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content equip-add-modal" onClick={e => e.stopPropagation()}>
        <h3>Add New {type.slice(0, -1)}</h3>
        
        <form onSubmit={handleSubmit}>
          <FormFields type={type} form={form} onChange={handleChange} constants={constants} filmConstants={filmConstants} />
          
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
function FormFields({ type, form, onChange, constants, filmConstants }) {
  const cameraTypes = constants?.cameraTypes || [];
  const lensMounts = constants?.lensMounts || [];
  const focusTypes = constants?.focusTypes || [];
  const conditions = constants?.conditions || [];
  const statuses = constants?.statuses || [];
  const filmCategories = filmConstants?.categories || [];
  const filmFormats = filmConstants?.formats || [];

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
              />
            </div>
            <div className="form-row">
              <label>Min Aperture (f/)</label>
              <input
                type="number"
                step="0.1"
                value={form.min_aperture || ''}
                onChange={e => onChange('min_aperture', parseFloat(e.target.value) || null)}
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

      {/* Film-specific fields */}
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
            <label>Category</label>
            <select value={form.category || 'color-negative'} onChange={e => onChange('category', e.target.value)}>
              {filmCategories.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          
          <div className="form-row">
            <label>Format</label>
            <select value={form.format || '135'} onChange={e => onChange('format', e.target.value)}>
              {filmFormats.map(f => <option key={f} value={f}>{f}</option>)}
            </select>
          </div>
          
          <div className="form-row">
            <label>Process</label>
            <select value={form.process || ''} onChange={e => onChange('process', e.target.value)}>
              <option value="">Select process...</option>
              <option value="C-41">C-41 (Color Negative)</option>
              <option value="E-6">E-6 (Slide)</option>
              <option value="BW">B&W</option>
              <option value="ECN-2">ECN-2 (Cinema)</option>
            </select>
          </div>
        </>
      )}

      {/* Common ownership fields (not for films) */}
      {type !== 'films' && (
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
