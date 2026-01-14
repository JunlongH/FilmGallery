// src/components/FilmLibrary.jsx
import '../styles/FilmInventory.css';
import '../styles/FilmButtons.css';
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import FilmItemEditModal from './FilmItemEditModal';
import { LoadFilmModal, DevelopFilmModal, UnloadFilmModal } from './FilmActionModals';
import { getFilms, buildUploadUrl, getFilmItems, createFilmItemsBatch, updateFilmItem, deleteFilmItem } from '../api';
import ModalDialog from './ModalDialog';
import ShotLogModal from './ShotLogModal';

export default function FilmLibrary() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [dialog, setDialog] = useState({ isOpen: false, type: 'alert', title: '', message: '', onConfirm: null });

  // Inventory state
  // 默认展示所有库存记录（All），而不是仅 In Stock
  const [inventoryStatusFilter, setInventoryStatusFilter] = useState('all');
  const [batchForm, setBatchForm] = useState({
    order_date: new Date().toISOString().slice(0, 10),
    channel: '',
    vendor: '',
    shipping_cost: '',
    notes: '',
    items: [
      { film_id: '', quantity: 1, unit_price: '', expiry_date: '', label: '', batch_code: '' }
    ]
  });
  const [isBatchModalOpen, setIsBatchModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  const [expandedItemId, setExpandedItemId] = useState(null);
  
  // Store IDs instead of objects to ensure modals always show fresh data from query cache
  const [loadModalItemId, setLoadModalItemId] = useState(null);
  const [unloadModalItemId, setUnloadModalItemId] = useState(null);
  const [developModalItemId, setDevelopModalItemId] = useState(null);
  const [shotLogModalItemId, setShotLogModalItemId] = useState(null);

  const showAlert = (title, message) => {
    setDialog({ isOpen: true, type: 'alert', title, message, onConfirm: () => setDialog(prev => ({ ...prev, isOpen: false })) });
  };

  const showConfirm = (title, message, onConfirm) => {
    setDialog({ 
      isOpen: true, 
      type: 'confirm', 
      title, 
      message, 
      onConfirm: () => {
        onConfirm();
        setDialog(prev => ({ ...prev, isOpen: false }));
      },
      onCancel: () => setDialog(prev => ({ ...prev, isOpen: false }))
    });
  };

  const { data: filmsData } = useQuery({
    queryKey: ['films'],
    queryFn: getFilms
  });

  const { data: filmItemsData, isLoading: loadingFilmItems } = useQuery({
    queryKey: ['filmItems'],
    queryFn: () => getFilmItems()
  });

  const films = Array.isArray(filmsData) ? filmsData : [];
  const allFilmItems = filmItemsData && Array.isArray(filmItemsData.items) ? filmItemsData.items : [];

  // Calculate counts
  const statusCounts = allFilmItems.reduce((acc, item) => {
    acc[item.status] = (acc[item.status] || 0) + 1;
    return acc;
  }, {});
  const totalCount = allFilmItems.length;

  // Filter for display
  const filmItems = inventoryStatusFilter === 'all' 
    ? allFilmItems 
    : allFilmItems.filter(item => item.status === inventoryStatusFilter);

  const getFilmThumbUrl = (path) => {
    if (!path) return null;
    // If it's already a URL or has uploads path, use standard builder
    if (path.startsWith('http') || path.includes('/') || path.includes('\\')) {
      return buildUploadUrl(path);
    }
    // If it's just a filename, assume it's in uploads/films
    return buildUploadUrl(`/uploads/films/${path}`);
  };

  const createFilmItemsBatchMutation = useMutation({
    mutationFn: createFilmItemsBatch,
    onSuccess: () => {
      queryClient.invalidateQueries(['filmItems']);
      setBatchForm(prev => ({
        order_date: new Date().toISOString().slice(0, 10),
        channel: '',
        vendor: '',
        shipping_cost: '',
        notes: '',
        items: [
          { film_id: '', quantity: 1, unit_price: '', expiry_date: '', label: '', batch_code: '' }
        ]
      }));
    }
  });

  const STATUS_FILTERS = [
    { value: 'all', label: `All: ${totalCount}` },
    { value: 'in_stock', label: `In Stock: ${statusCounts['in_stock'] || 0}` },
    { value: 'loaded', label: `Loaded: ${statusCounts['loaded'] || 0}` },
    { value: 'shot', label: `Shot: ${statusCounts['shot'] || 0}` },
    { value: 'sent_to_lab', label: `Sent to Lab: ${statusCounts['sent_to_lab'] || 0}` },
    { value: 'developed', label: `Developed: ${statusCounts['developed'] || 0}` },
    { value: 'archived', label: `Archived: ${statusCounts['archived'] || 0}` }
  ];

  const STATUS_LABELS = {
    in_stock: 'In Stock',
    loaded: 'Loaded',
    shot: 'Shot',
    sent_to_lab: 'Sent to Lab',
    developed: 'Developed',
    archived: 'Archived'
  };

  const formatMoney = (value) => {
    if (value == null || value === '') return '';
    const num = Number(value);
    if (Number.isNaN(num)) return value;
    return num.toFixed(2);
  };

  function updateBatchItem(index, patch) {
    setBatchForm(prev => ({
      ...prev,
      items: prev.items.map((item, i) => i === index ? { ...item, ...patch } : item)
    }));
  }

  function addBatchRow() {
    setBatchForm(prev => ({
      ...prev,
      items: [...prev.items, { film_id: '', quantity: 1, unit_price: '', expiry_date: '', label: '', batch_code: '' }]
    }));
  }

  function removeBatchRow(index) {
    setBatchForm(prev => ({
      ...prev,
      items: prev.items.filter((_, i) => i !== index)
    }));
  }

  async function onSubmitBatch(e) {
    e.preventDefault();
    try {
      const totalQuantity = batchForm.items.reduce((sum, item) => sum + Number(item.quantity || 0), 0);
      const shipping = Number(batchForm.shipping_cost || 0);
      const perItemShipping = totalQuantity > 0 ? shipping / totalQuantity : 0;

      const confirmMsg = `This batch has ${totalQuantity} rolls. Shipping will be split as ${formatMoney(perItemShipping)} per roll.\n\nDo you want to continue?`;
      showConfirm('Confirm shipping split', confirmMsg, async () => {
        await createFilmItemsBatchMutation.mutateAsync({
          purchase_date: batchForm.order_date || null,
          purchase_channel: batchForm.channel || null,
          purchase_vendor: batchForm.vendor || null,
          purchase_order_id: null,
          total_shipping: shipping,
          purchase_currency: 'CNY',
          note: batchForm.notes || null,
          items: batchForm.items.map(item => ({
            film_id: item.film_id ? Number(item.film_id) : null,
            quantity: Number(item.quantity || 0),
            unit_price: item.unit_price === '' ? null : Number(item.unit_price),
            expiry_date: item.expiry_date || null,
            batch_number: item.batch_code || null,
            label: item.label || null,
            note_purchase: null
          }))
        });
      });
    } catch (err) {
      console.error(err);
      showAlert('Error', 'Create film items failed');
    }
  }

  return (
    <div>
      <ModalDialog 
        isOpen={dialog.isOpen} 
        type={dialog.type} 
        title={dialog.title} 
        message={dialog.message} 
        onConfirm={dialog.onConfirm}
        onCancel={dialog.onCancel}
      />
      <div className="page-header">
        <h3 style={{ margin:0 }}>Film Inventory</h3>
      </div>

      {/* Inventory Tab Content */}
      <>
        <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            {STATUS_FILTERS.map(opt => (
              <button
                key={opt.value}
                type="button"
                className={`fg-tab ${inventoryStatusFilter === opt.value ? 'fg-tab-active' : ''}`}
                onClick={() => setInventoryStatusFilter(opt.value)}
                style={{ fontSize: 12, padding: '4px 10px' }}
              >
                {opt.label}
              </button>
            ))}
          </div>
          <button
            type="button"
            className="fg-btn fg-btn-primary"
            onClick={() => setIsBatchModalOpen(true)}
            title="Record purchase batch"
            style={{ width: 32, height: 32, padding: 0, borderRadius: '50%', fontSize: 20, fontWeight: 'bold', flexShrink: 0 }}
          >
            +
          </button>
        </div>

          <div className="fg-film-items-grid">
            {loadingFilmItems && (
              <div style={{ fontSize: 13, color: '#777' }}>Loading inventory...</div>
            )}
            {!loadingFilmItems && filmItems.length === 0 && (
              <div style={{ fontSize: 13, color: '#777' }}>No inventory records for current filters.</div>
            )}
            {!loadingFilmItems && filmItems.length > 0 && (
              <div className="fg-film-items-grid-inner">
                {filmItems.map(item => {
                  const film = films.find(f => f.id === item.film_id);
                  const thumbUrl = film && film.thumbPath ? getFilmThumbUrl(film.thumbPath) : null;
                  // Status label: for loaded items, show loaded camera when available
                  const statusLabel =
                    item.status === 'loaded' && item.loaded_camera
                      ? `Loaded on ${item.loaded_camera}`
                      : (STATUS_LABELS[item.status] || item.status);
                  const isExpired = item.expiry_date && new Date(item.expiry_date) < new Date();
                  const isExpanded = expandedItemId === item.id;
                  return (
                    <div
                      key={item.id}
                      className={isExpanded ? 'fg-film-item-card fg-film-item-card-expanded' : 'fg-film-item-card'}
                      onClick={() => setExpandedItemId(isExpanded ? null : item.id)}
                    >
                      <div className="fg-film-item-thumb-wrapper">
                        {thumbUrl ? (
                          <img 
                            src={thumbUrl} 
                            alt={film ? film.name : 'Film'} 
                            className="fg-film-item-thumb" 
                            loading="lazy"
                            decoding="async"
                          />
                        ) : (
                          <div className="fg-film-item-thumb fg-film-item-thumb-empty">No cover</div>
                        )}
                        {item.expiry_date && (
                          <div className={isExpired ? 'fg-film-item-expiry fg-film-item-expiry-expired' : 'fg-film-item-expiry'}>
                            Expiry {item.expiry_date}
                          </div>
                        )}
                        <div className="fg-film-item-meta-bottom">
                          <div className="fg-film-item-meta-type">
                            {film ? (
                              <>
                                {film.brand && <span style={{ fontWeight: 600 }}>{film.brand} </span>}
                                {film.name}
                                {film.format && film.format !== '135' && <span style={{ marginLeft: 4, fontSize: 10, opacity: 0.7 }}>({film.format})</span>}
                              </>
                            ) : 'Unspecified'}
                          </div>
                          <div className="fg-film-item-meta-status">{statusLabel}</div>
                        </div>
                      </div>
                      {isExpanded && (
                        <div className="fg-film-item-details">
                          <div className="fg-film-item-details-row">
                            <span>Channel</span>
                            <span>{item.purchase_channel || '—'}</span>
                          </div>
                          <div className="fg-film-item-details-row">
                            <span>Vendor</span>
                            <span>{item.purchase_vendor || '—'}</span>
                          </div>
                          <div className="fg-film-item-details-row">
                            <span>Unit price</span>
                            <span>{formatMoney(item.purchase_price) || '—'}</span>
                          </div>
                          <div className="fg-film-item-details-row">
                            <span>Shipping share</span>
                            <span>{formatMoney(item.purchase_shipping_share) || '—'}</span>
                          </div>
                          <div className="fg-film-item-details-row">
                            <span>Batch</span>
                            <span>{item.batch_number || '—'}</span>
                          </div>
                          {(item.label || item.purchase_note) && (
                            <div className="fg-film-item-details-notes">
                              {item.label || item.purchase_note}
                            </div>
                          )}
                          
                          <div style={{ marginTop: 16, display: 'flex', gap: 8, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                            {/* Status-based Actions */}
                            {item.status === 'in_stock' && (
                              <button 
                                className="fg-btn fg-btn-primary fg-btn-sm"
                                onClick={(e) => { e.stopPropagation(); setLoadModalItemId(item.id); }}
                              >
                                Load
                              </button>
                            )}
                            {item.status === 'loaded' && (
                              <>
                                <button 
                                  className="fg-btn fg-btn-secondary fg-btn-sm"
                                  onClick={(e) => { 
                                    e.stopPropagation(); 
                                    setShotLogModalItemId(item.id);
                                  }}
                                >
                                  Log Shots
                                </button>
                                <button 
                                  className="fg-btn fg-btn-warning fg-btn-sm"
                                  onClick={(e) => { 
                                    e.stopPropagation(); 
                                    setUnloadModalItemId(item.id);
                                  }}
                                >
                                  Unload
                                </button>
                              </>
                            )}
                            {item.status === 'shot' && (
                              <button 
                                className="fg-btn fg-btn-primary fg-btn-sm"
                                onClick={(e) => { e.stopPropagation(); setDevelopModalItemId(item.id); }}
                              >
                                Develop
                              </button>
                            )}
                            {item.status === 'sent_to_lab' && (
                              <button 
                                className="fg-btn fg-btn-success fg-btn-sm"
                                onClick={(e) => { 
                                  e.stopPropagation(); 
                                  // Navigate to create roll, passing film item ID and develop info
                                  navigate('/rolls/new', { 
                                    state: { 
                                      filmItemId: item.id,
                                      developInfo: {
                                        develop_lab: item.develop_lab,
                                        develop_process: item.develop_process,
                                        develop_date: item.develop_date,
                                        develop_cost: item.develop_price,
                                        develop_note: item.develop_note
                                      }
                                    } 
                                  });
                                }}
                              >
                                Create Roll
                              </button>
                            )}
                            {item.status === 'developed' && (
                              <button 
                                className="fg-btn fg-btn-secondary fg-btn-sm"
                                onClick={(e) => { 
                                  e.stopPropagation(); 
                                  showConfirm('Archive Film', 'Archive this film item? This will hide it from active lists.', async () => {
                                    try {
                                      await updateFilmItem(item.id, { 
                                        status: 'archived',
                                        archived_at: new Date().toISOString()
                                      });
                                      queryClient.invalidateQueries(['filmItems']);
                                    } catch (err) {
                                      console.error(err);
                                      alert('Failed to archive: ' + err.message);
                                    }
                                  });
                                }}
                              >
                                Archive
                              </button>
                            )}

                            {/* View Roll Section - Prominent for developed/archived items */}
                            {(item.status === 'developed' || item.status === 'archived') && item.roll_id && (
                              <button 
                                className="fg-btn fg-btn-view-roll"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  navigate(`/rolls/${item.roll_id}`);
                                }}
                                title="View the roll created from this film"
                              >
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 16, height: 16, marginRight: 6 }}>
                                  <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                                  <circle cx="12" cy="12" r="3"/>
                                </svg>
                                <span>View Roll Details</span>
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 14, height: 14, marginLeft: 6 }}>
                                  <path d="M5 12h14M12 5l7 7-7 7"/>
                                </svg>
                              </button>
                            )}

                            {/* Negative Archive Toggle */}
                            {(item.status === 'developed' || item.status === 'archived') && (
                              <button 
                                className={`fg-btn fg-btn-sm ${item.negative_archived ? 'fg-btn-outline-success' : 'fg-btn-outline-secondary'}`}
                                onClick={async (e) => {
                                  e.stopPropagation();
                                  await updateFilmItem(item.id, { negative_archived: item.negative_archived ? 0 : 1 });
                                  queryClient.invalidateQueries(['filmItems']);
                                }}
                                title="Toggle physical negative archive status"
                              >
                                {item.negative_archived ? 'Negatives Archived' : 'Negatives Pending'}
                              </button>
                            )}

                            <button 
                              className="fg-btn fg-btn-secondary fg-btn-sm" 
                              onClick={(e) => { e.stopPropagation(); setEditingItem(item); }}
                            >
                              Edit
                            </button>

                            {!item.roll_id && (
                              <button 
                                className="fg-btn fg-btn-danger fg-btn-sm" 
                                onClick={(e) => { 
                                  e.stopPropagation(); 
                                  showConfirm('Delete Film Item', 'Permanently delete this film item? This cannot be undone.', async () => {
                                    try {
                                      const res = await deleteFilmItem(item.id, true);
                                      if (!res.ok) throw new Error(res.error || 'Delete failed');
                                      queryClient.invalidateQueries(['filmItems']);
                                    } catch (err) {
                                      console.error(err);
                                      showAlert('Error', 'Failed to delete: ' + err.message);
                                    }
                                  });
                                }}
                                title="Delete this film item (only available when not linked to a roll)"
                              >
                                Delete
                              </button>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {loadModalItemId && (
            <LoadFilmModal 
              item={allFilmItems.find(i => i.id === loadModalItemId)}
              isOpen={!!loadModalItemId}
              onClose={() => setLoadModalItemId(null)}
              onLoaded={async (updated) => {
                if (updated && updated.optimistic && updated.item) {
                  // optimistic local update - use correct cache key
                  queryClient.setQueryData(['filmItems'], (old) => {
                    if (!old || !Array.isArray(old.items)) return old;
                    return {
                      ...old,
                      items: old.items.map(it => it.id === updated.item.id ? updated.item : it),
                    };
                  });
                  return;
                }
                // Server response - update cache directly without invalidation
                if (updated && updated.item) {
                  queryClient.setQueryData(['filmItems'], (old) => {
                    if (!old || !Array.isArray(old.items)) return old;
                    return {
                      ...old,
                      items: old.items.map(it => it.id === updated.item.id ? updated.item : it),
                    };
                  });
                }
              }}
            />
          )}

          {unloadModalItemId && (
            <UnloadFilmModal 
              item={allFilmItems.find(i => i.id === unloadModalItemId)}
              isOpen={!!unloadModalItemId}
              onClose={() => setUnloadModalItemId(null)}
              onUnloaded={async (updated) => {
                if (updated && updated.optimistic && updated.item) {
                  queryClient.setQueryData(['filmItems'], (old) => {
                    if (!old || !Array.isArray(old.items)) return old;
                    return {
                      ...old,
                      items: old.items.map(it => it.id === updated.item.id ? updated.item : it),
                    };
                  });
                  return;
                }
                if (updated && updated.item) {
                  queryClient.setQueryData(['filmItems'], (old) => {
                    if (!old || !Array.isArray(old.items)) return old;
                    return {
                      ...old,
                      items: old.items.map(it => it.id === updated.item.id ? updated.item : it),
                    };
                  });
                }
              }}
            />
          )}

          {developModalItemId && (
            <DevelopFilmModal
              item={allFilmItems.find(i => i.id === developModalItemId)}
              isOpen={!!developModalItemId}
              onClose={() => setDevelopModalItemId(null)}
              onDeveloped={async (updated) => {
                if (updated && updated.optimistic && updated.item) {
                  queryClient.setQueryData(['filmItems'], (old) => {
                    if (!old || !Array.isArray(old.items)) return old;
                    return {
                      ...old,
                      items: old.items.map(it => it.id === updated.item.id ? updated.item : it),
                    };
                  });
                  return;
                }
                if (updated && updated.item) {
                  queryClient.setQueryData(['filmItems'], (old) => {
                    if (!old || !Array.isArray(old.items)) return old;
                    return {
                      ...old,
                      items: old.items.map(it => it.id === updated.item.id ? updated.item : it),
                    };
                  });
                }
              }}
            />
          )}

          {shotLogModalItemId && (
            <ShotLogModal
              item={allFilmItems.find(i => i.id === shotLogModalItemId)}
              isOpen={!!shotLogModalItemId}
              onClose={() => setShotLogModalItemId(null)}
              onUpdated={async () => { await queryClient.invalidateQueries(['filmItems']); }}
            />
          )}

          {editingItem && (
            <FilmItemEditModal
              item={editingItem}
              isOpen={!!editingItem}
              onClose={() => setEditingItem(null)}
              onUpdated={async () => {
                await queryClient.invalidateQueries(['filmItems']);
              }}
            />
          )}

          {isBatchModalOpen && (
            <div className="fg-modal-overlay">
              <div className="fg-modal-panel">
                <div className="fg-modal-header">
                  <h4>Record a new purchase batch</h4>
                  <button type="button" className="fg-modal-close" onClick={() => setIsBatchModalOpen(false)}>&times;</button>
                </div>
                <form onSubmit={async (e) => { await onSubmitBatch(e); setIsBatchModalOpen(false); }} style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                  
                  <div className="fg-form-grid-top">
                    <div className="fg-form-group">
                      <label>Purchase date</label>
                      <input
                        type="date"
                        value={batchForm.order_date}
                        onChange={e => setBatchForm(prev => ({ ...prev, order_date: e.target.value }))}
                      />
                    </div>
                    <div className="fg-form-group">
                      <label>Channel</label>
                      <input
                        value={batchForm.channel}
                        onChange={e => setBatchForm(prev => ({ ...prev, channel: e.target.value }))}
                        placeholder="e.g. eBay, Local Store"
                      />
                    </div>
                    <div className="fg-form-group">
                      <label>Vendor</label>
                      <input
                        value={batchForm.vendor}
                        onChange={e => setBatchForm(prev => ({ ...prev, vendor: e.target.value }))}
                        placeholder="Store name"
                      />
                    </div>
                    <div className="fg-form-group">
                      <label>Total shipping</label>
                      <input
                        type="number"
                        step="0.01"
                        value={batchForm.shipping_cost}
                        onChange={e => setBatchForm(prev => ({ ...prev, shipping_cost: e.target.value }))}
                        placeholder="0.00"
                      />
                    </div>
                  </div>

                  <div className="fg-form-group">
                    <label>Notes</label>
                    <input
                      value={batchForm.notes}
                      onChange={e => setBatchForm(prev => ({ ...prev, notes: e.target.value }))}
                      placeholder="Optional notes about this purchase..."
                    />
                  </div>

                  <div style={{ marginTop: 8 }}>
                    <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 12, color: '#334155' }}>Films included in this batch</div>
                    <div className="fg-batch-grid-container">
                      <div className="fg-batch-grid fg-batch-header">
                        <div>Film</div>
                        <div>Qty</div>
                        <div>Unit price</div>
                        <div>Expiry</div>
                        <div>Batch Code</div>
                        <div>Label / notes</div>
                        <div></div>
                      </div>
                      <div className="fg-batch-rows">
                        {batchForm.items.map((item, index) => (
                          <div key={index} className="fg-batch-grid fg-batch-row">
                            <div>
                              <select
                                className="fg-input-select"
                                value={item.film_id}
                                onChange={e => updateBatchItem(index, { film_id: e.target.value })}
                              >
                                <option value="">Select film...</option>
                                {films.map(f => (
                                  <option key={f.id} value={f.id}>
                                    {f.brand ? `${f.brand} ` : ''}{f.name}{f.format && f.format !== '135' ? ` (${f.format})` : ''} - ISO {f.iso}
                                  </option>
                                ))}
                              </select>
                            </div>
                            <div>
                              <input
                                type="number"
                                min="1"
                                className="fg-input-cell"
                                value={item.quantity}
                                onChange={e => updateBatchItem(index, { quantity: e.target.value })}
                              />
                            </div>
                            <div>
                              <input
                                type="number"
                                step="0.01"
                                className="fg-input-cell"
                                value={item.unit_price}
                                onChange={e => updateBatchItem(index, { unit_price: e.target.value })}
                              />
                            </div>
                            <div>
                              <input
                                type="date"
                                className="fg-input-cell"
                                value={item.expiry_date}
                                onChange={e => updateBatchItem(index, { expiry_date: e.target.value })}
                              />
                            </div>
                            <div>
                              <input
                                className="fg-input-cell"
                                value={item.batch_code}
                                onChange={e => updateBatchItem(index, { batch_code: e.target.value })}
                                placeholder="Emulsion #"
                              />
                            </div>
                            <div>
                              <input
                                className="fg-input-cell"
                                value={item.label}
                                onChange={e => updateBatchItem(index, { label: e.target.value })}
                              />
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
                              <button
                                type="button"
                                className="fg-btn-icon-danger"
                                onClick={() => removeBatchRow(index)}
                                disabled={batchForm.items.length === 1}
                                title="Remove row"
                              >
                                &times;
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 12, paddingTop: 16, borderTop: '1px solid #f1f5f9' }}>
                    <button
                      type="button"
                      className="fg-btn fg-btn-secondary"
                      onClick={addBatchRow}
                    >
                      + Add another film
                    </button>
                    <button
                      type="submit"
                      className="fg-btn fg-btn-primary"
                      disabled={createFilmItemsBatchMutation.isLoading}
                    >
                      {createFilmItemsBatchMutation.isLoading ? 'Saving...' : 'Save Purchase Batch'}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}
      </>
    </div>
  );
}