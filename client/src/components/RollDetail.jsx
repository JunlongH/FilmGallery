// src/components/RollDetail.jsx
import React, { useState, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getRoll, getPhotos, uploadPhotosToRoll, getTags, setRollCover, deletePhoto, updateRoll, updatePhoto, buildUploadUrl, getFilms, getMetadataOptions } from '../api';
import { useParams } from 'react-router-dom';
import ImageViewer from './ImageViewer';
import PhotoItem from './PhotoItem';
import TagEditModal from './TagEditModal';
import ModalDialog from './ModalDialog';

export default function RollDetail() {
  const { id } = useParams();
  const queryClient = useQueryClient();
  const [selectedPhotoIndex, setSelectedPhotoIndex] = useState(null);
  const [isEditing, setIsEditing] = useState(false);
  const [editData, setEditData] = useState({});
  const [editingTagsPhoto, setEditingTagsPhoto] = useState(null);
  const [viewMode, setViewMode] = useState('positive'); // 'positive' | 'negative'
  const [availableFilms, setAvailableFilms] = useState([]);
  const [options, setOptions] = useState({ cameras: [], lenses: [], shooters: [] });
  const [dialog, setDialog] = useState({ isOpen: false, type: 'alert', title: '', message: '', onConfirm: null });
  const [isExpanded, setIsExpanded] = useState(false); // Add state for collapsible card

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

  const { data: roll } = useQuery({
    queryKey: ['roll', id],
    queryFn: () => getRoll(id)
  });

  const { data: photos = [] } = useQuery({
    queryKey: ['rollPhotos', id],
    queryFn: () => getPhotos(id)
  });

  const { data: allTags = [] } = useQuery({
    queryKey: ['tags'],
    queryFn: getTags
  });

  const uploadMutation = useMutation({
    mutationFn: uploadPhotosToRoll,
    onSuccess: () => {
      queryClient.invalidateQueries(['rollPhotos', id]);
      queryClient.invalidateQueries(['roll', id]); // Cover might change
    }
  });

  const deletePhotoMutation = useMutation({
    mutationFn: deletePhoto,
    onSuccess: () => {
      queryClient.invalidateQueries(['rollPhotos', id]);
      queryClient.invalidateQueries(['roll', id]);
    }
  });

  const setCoverMutation = useMutation({
    mutationFn: ({ rollId, photoId }) => setRollCover(rollId, { photoId }),
    onSuccess: () => queryClient.invalidateQueries(['roll', id])
  });

  const updateRollMutation = useMutation({
    mutationFn: ({ rollId, data }) => updateRoll(rollId, data),
    onSuccess: () => queryClient.invalidateQueries(['roll', id])
  });

  const updatePhotoMutation = useMutation({
    mutationFn: ({ photoId, data }) => updatePhoto(photoId, data),
    onSuccess: () => queryClient.invalidateQueries(['rollPhotos', id])
  });

  function resolveFilmName(rollObj) {
    if (!rollObj) return null;
    if (rollObj.film_name_joined) return rollObj.film_name_joined;
    if (rollObj.film && typeof rollObj.film === 'object' && rollObj.film.name) return rollObj.film.name;
    if (rollObj.film_type) return rollObj.film_type;
    return null;
  }

  const filmName = resolveFilmName(roll);

  const fileInputRef = useRef(null);

  async function onUpload(e) {
    const fileList = e.target.files;
    if (!fileList || fileList.length === 0) return;
    const files = Array.from(fileList);
    try {
      await uploadMutation.mutateAsync({
        rollId: id,
        files,
        isNegative: viewMode === 'negative',
        onProgress: ({ index, total }) => console.debug(`Uploading ${index}/${total}`)
      });
    } catch (err) {
      console.error('Upload failed', err);
      showAlert('Error', 'Upload failed: ' + (err.message || err));
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }

  async function onDeletePhoto(photoId) {
    showConfirm('Delete Photo', 'Delete this photo?', async () => {
      try {
        await deletePhotoMutation.mutateAsync(photoId);
      } catch (err) {
        console.error('Delete failed', err);
        showAlert('Error', 'Delete failed: ' + (err.message || err));
      }
    });
  }

  async function onSetCover(photoId) {
    showConfirm('Set Cover', 'Set this photo as roll cover?', async () => {
      try {
        await setCoverMutation.mutateAsync({ rollId: id, photoId });
      } catch (err) {
        console.error('Set cover failed', err);
        showAlert('Error', 'Set cover failed');
      }
    });
  }

  async function onUpdatePhoto(photoId, data) {
    try {
      await updatePhotoMutation.mutateAsync({ photoId, data });
    } catch (err) {
      console.error(err);
    }
  }

  async function handleEditClick() {
    // Always fetch fresh films list when entering edit mode
    try {
      const [f, o] = await Promise.all([getFilms(), getMetadataOptions()]);
      setAvailableFilms(Array.isArray(f) ? f : []);
      setOptions(o || { cameras: [], lenses: [], shooters: [] });
    } catch (err) {
      console.error('Failed to load films/options for edit', err);
      setAvailableFilms([]);
      setOptions({ cameras: [], lenses: [], shooters: [] });
    }

    setEditData({
      title: roll.title || '',
      start_date: roll.start_date || '',
      end_date: roll.end_date || '',
      camera: roll.camera || '',
      lens: roll.lens || '',
      shooter: roll.shooter || '',
      film_type: roll.film_type || '',
      filmId: roll.filmId || roll.film_id || '',
      notes: roll.notes || ''
    });
    setIsEditing(true);
  }

  async function handleSaveEdit() {
    try {
      await updateRollMutation.mutateAsync({ rollId: id, data: editData });
      setIsEditing(false);
    } catch (err) {
      console.error(err);
      alert('Update failed: ' + err.message);
    }
  }

  if (!roll) return <div>Loading...</div>;

  function formatDate(d) {
    if (d === undefined || d === null || d === '') return '';
    let val = d;
    if (typeof val === 'string' && /^\d+$/.test(val)) val = Number(val);
    if (typeof val === 'number') {
      if (val > 0 && val < 1e11) val = val * 1000;
      const dtN = new Date(val);
      if (!isNaN(dtN.getTime())) {
        const yyyy = dtN.getFullYear();
        const mm = String(dtN.getMonth() + 1).padStart(2, '0');
        const dd = String(dtN.getDate()).padStart(2, '0');
        return `${yyyy}-${mm}-${dd}`;
      }
    }
    const dt = new Date(d);
    if (!isNaN(dt.getTime())) {
      const yyyy = dt.getFullYear();
      const mm = String(dt.getMonth() + 1).padStart(2, '0');
      const dd = String(dt.getDate()).padStart(2, '0');
      return `${yyyy}-${mm}-${dd}`;
    }
    return String(d);
  }

  const rawStart = roll.start_date ?? null;
  const rawEnd = roll.end_date ?? null;
  const dateStr = (() => {
    const s = formatDate(rawStart);
    const e = formatDate(rawEnd);
    if (!s && !e) return '';
    if (s && e) return s === e ? s : `${s} — ${e}`;
    return s || e || '';
  })();

  return (
    <div className="roll-detail-page">
      <ModalDialog 
        isOpen={dialog.isOpen} 
        type={dialog.type} 
        title={dialog.title} 
        message={dialog.message} 
        onConfirm={dialog.onConfirm}
        onCancel={dialog.onCancel}
      />
      <div className="page-header" style={{ display: 'block' }}>
        {isEditing ? (
          <div style={{ border:'1px solid #ddd', padding:16, marginBottom:16, background:'#f9f9f9', borderRadius:4 }}>
            <h3 style={{ marginTop:0 }}>Edit Roll</h3>
            <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(200px, 1fr))', gap:12 }}>
              <label style={{ display:'flex', flexDirection:'column' }}>
                <span style={{ fontSize:12, fontWeight:600, marginBottom:4 }}>Title</span>
                <input style={{ padding:6 }} value={editData.title} onChange={e=>setEditData({...editData, title:e.target.value})} />
              </label>
              <label style={{ display:'flex', flexDirection:'column' }}>
                <span style={{ fontSize:12, fontWeight:600, marginBottom:4 }}>Start Date</span>
                <input type="date" style={{ padding:6 }} value={editData.start_date} onChange={e=>setEditData({...editData, start_date:e.target.value})} />
              </label>
              <label style={{ display:'flex', flexDirection:'column' }}>
                <span style={{ fontSize:12, fontWeight:600, marginBottom:4 }}>End Date</span>
                <input type="date" style={{ padding:6 }} value={editData.end_date} onChange={e=>setEditData({...editData, end_date:e.target.value})} />
              </label>
              <label style={{ display:'flex', flexDirection:'column' }}>
                <span style={{ fontSize:12, fontWeight:600, marginBottom:4 }}>Camera</span>
                <input list="camera-options" style={{ padding:6 }} value={editData.camera} onChange={e=>setEditData({...editData, camera:e.target.value})} placeholder="Select or type..." />
                <datalist id="camera-options">
                  {options.cameras.map((c, i) => <option key={i} value={c} />)}
                </datalist>
              </label>
              <label style={{ display:'flex', flexDirection:'column' }}>
                <span style={{ fontSize:12, fontWeight:600, marginBottom:4 }}>Lens</span>
                <input list="lens-options" style={{ padding:6 }} value={editData.lens} onChange={e=>setEditData({...editData, lens:e.target.value})} placeholder="Select or type..." />
                <datalist id="lens-options">
                  {options.lenses.map((l, i) => <option key={i} value={l} />)}
                </datalist>
              </label>
              <label style={{ display:'flex', flexDirection:'column' }}>
                <span style={{ fontSize:12, fontWeight:600, marginBottom:4 }}>Shooter</span>
                <input list="shooter-options" style={{ padding:6 }} value={editData.shooter} onChange={e=>setEditData({...editData, shooter:e.target.value})} placeholder="Select or type..." />
                <datalist id="shooter-options">
                  {options.shooters.map((s, i) => <option key={i} value={s} />)}
                </datalist>
              </label>
              <label style={{ display:'flex', flexDirection:'column' }}>
                <span style={{ fontSize:12, fontWeight:600, marginBottom:4 }}>Film Type</span>
                <select 
                  style={{ padding:6 }} 
                  value={editData.filmId || ''} 
                  onChange={e => {
                    const fid = e.target.value;
                    const found = availableFilms.find(f => String(f.id) === String(fid));
                    setEditData({
                      ...editData, 
                      filmId: fid, 
                      film_type: found ? found.name : '' 
                    });
                  }}
                >
                  <option value="">-- Select Film --</option>
                  {availableFilms.map(f => (
                    <option key={f.id} value={f.id}>{f.name} (ISO {f.iso})</option>
                  ))}
                </select>
              </label>
            </div>
            <div style={{ marginTop:12 }}>
              <label style={{ display:'flex', flexDirection:'column' }}>
                <span style={{ fontSize:12, fontWeight:600, marginBottom:4 }}>Notes</span>
                <textarea style={{ width:'100%', height:80, padding:6, fontFamily:'inherit' }} value={editData.notes} onChange={e=>setEditData({...editData, notes:e.target.value})} />
              </label>
            </div>
            <div style={{ marginTop:16, display:'flex', gap:12 }}>
              <button onClick={handleSaveEdit} style={{ padding:'8px 16px', background:'#333', color:'#fff', border:'none', cursor:'pointer', borderRadius:4 }}>Save Changes</button>
              <button onClick={()=>setIsEditing(false)} style={{ padding:'8px 16px', background:'#fff', border:'1px solid #ccc', cursor:'pointer', borderRadius:4 }}>Cancel</button>
            </div>
          </div>
        ) : (
          <div className="roll-detail-header">
            <div className="roll-info">
              <div className="roll-title-row">
                <h1 className="roll-title">{roll.title || 'Untitled Roll'}</h1>
                <button className="roll-edit-btn" onClick={handleEditClick}>Edit Info</button>
              </div>
              
              <div className="roll-meta-grid">
                <div className="roll-meta-item">
                  <span className="roll-meta-label">Date</span>
                  <span className="roll-meta-value">{dateStr || '—'}</span>
                </div>
                <div className="roll-meta-item">
                  <span className="roll-meta-label">Film</span>
                  <span className="roll-meta-value">{filmName || '—'}</span>
                </div>
                
                {isExpanded && (
                  <>
                    <div className="roll-meta-item">
                      <span className="roll-meta-label">Camera</span>
                      <span className="roll-meta-value">{roll.camera || '—'}</span>
                    </div>
                    <div className="roll-meta-item">
                      <span className="roll-meta-label">Lens</span>
                      <span className="roll-meta-value">{roll.lens || '—'}</span>
                    </div>
                    <div className="roll-meta-item">
                      <span className="roll-meta-label">Photographer</span>
                      <span className="roll-meta-value">{roll.shooter || '—'}</span>
                    </div>
                    {roll.notes && (
                      <div className="roll-meta-item" style={{ gridColumn: '1 / -1' }}>
                        <span className="roll-meta-label">Notes</span>
                        <span className="roll-meta-value" style={{ fontSize: 13, color: '#555' }}>{roll.notes}</span>
                      </div>
                    )}
                  </>
                )}
              </div>

              <button 
                onClick={() => setIsExpanded(!isExpanded)}
                style={{ 
                  background: 'transparent', 
                  border: 'none', 
                  color: '#666', 
                  fontSize: 12, 
                  fontWeight: 600, 
                  cursor: 'pointer', 
                  padding: '4px 0',
                  marginBottom: 16,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 4
                }}
              >
                {isExpanded ? 'Show Less' : 'Show More'}
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" style={{ transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s' }}>
                  <polyline points="6 9 12 15 18 9"></polyline>
                </svg>
              </button>

              <div className="roll-actions-bar">
                <div className="segmented-control">
                  <button 
                    className={`segment-btn ${viewMode === 'positive' ? 'active' : ''}`}
                    onClick={() => setViewMode('positive')}
                  >
                    Positive
                  </button>
                  <button 
                    className={`segment-btn ${viewMode === 'negative' ? 'active' : ''}`}
                    onClick={() => setViewMode('negative')}
                  >
                    Negative
                  </button>
                </div>
                <button className="primary-btn" onClick={() => fileInputRef.current && fileInputRef.current.click()}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
                  Upload Photos
                </button>
              </div>
            </div>

            {(roll.coverPath || roll.cover_photo) && (
              <div className="roll-cover-wrapper">
                <img 
                  src={buildUploadUrl(roll.coverPath || roll.cover_photo)} 
                  alt="Cover" 
                  className="roll-cover-image"
                />
              </div>
            )}
          </div>
        )}
      </div>

        {isEditing && (
          <div style={{ marginTop: 12, marginBottom: 20 }}>
            <button className="primary-btn" onClick={() => fileInputRef.current && fileInputRef.current.click()}>Upload files</button>
          </div>
        )}

        {(() => {
          const positiveCount = photos.filter(p => !!p.full_rel_path || !!p.positive_rel_path).length;
          const negativeCount = photos.filter(p => !!p.negative_rel_path).length;

          // Auto-switch view mode if only negatives exist and we are in positive mode
          // Use a ref or effect to avoid infinite render loop, or just show a helpful message
          
          const filteredPhotos = photos.filter(p => {
            if (viewMode === 'positive') return !!p.full_rel_path || !!p.positive_rel_path;
            if (viewMode === 'negative') return !!p.negative_rel_path;
            return true;
          });

          if (filteredPhotos.length === 0) {
            return (
              <div style={{ 
                padding: '60px 0', 
                textAlign: 'center', 
                color: '#999',
                fontSize: '15px',
                background: '#f9f9f9',
                borderRadius: '12px',
                border: '1px dashed #ddd',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: '12px'
              }}>
                <div>{viewMode === 'positive' ? 'No positive photos available.' : 'No negative photos available.'}</div>
                
                {viewMode === 'positive' && negativeCount > 0 && (
                  <button 
                    className="primary-btn" 
                    onClick={() => setViewMode('negative')}
                    style={{ fontSize: '14px', padding: '8px 16px' }}
                  >
                    Switch to Negative View ({negativeCount} photos)
                  </button>
                )}
                
                {viewMode === 'negative' && positiveCount > 0 && (
                  <button 
                    className="primary-btn" 
                    onClick={() => setViewMode('positive')}
                    style={{ fontSize: '14px', padding: '8px 16px' }}
                  >
                    Switch to Positive View ({positiveCount} photos)
                  </button>
                )}
              </div>
            );
          }

          return (
            <div className="photo-grid">
              {filteredPhotos.map((p, idx) => (
                <PhotoItem 
                  key={p.id} 
                  p={p} 
                  filmName={filmName} 
                  viewMode={viewMode}
                  onSelect={() => setSelectedPhotoIndex(idx)} 
                  onSetCover={onSetCover} 
                  onDeletePhoto={onDeletePhoto} 
                  onUpdatePhoto={onUpdatePhoto}
                  onEditTags={(photo) => setEditingTagsPhoto(photo)}
                />
              ))}
            </div>
          );
        })()}

        {editingTagsPhoto && (
          <TagEditModal 
            photo={editingTagsPhoto} 
            allTags={allTags} 
            onClose={() => setEditingTagsPhoto(null)} 
            onSave={async (photoId, newTags) => {
              try {
                await onUpdatePhoto(photoId, { tags: newTags });
                // Refresh tags query and notify sidebar
                queryClient.invalidateQueries(['tags']);
                // Also dispatch event to refresh sidebar
                window.dispatchEvent(new Event('refresh-tags'));
              } catch (err) {
                console.error('Failed to save tags', err);
              }
              setEditingTagsPhoto(null);
            }}
          />
        )}

        {selectedPhotoIndex !== null && (
          <ImageViewer
            images={photos.filter(p => {
              if (viewMode === 'positive') return !!p.full_rel_path;
              if (viewMode === 'negative') return !!p.negative_rel_path;
              return true;
            })}
            index={selectedPhotoIndex}
            viewMode={viewMode}
            onClose={() => setSelectedPhotoIndex(null)}
            onPhotoUpdate={() => {
               queryClient.invalidateQueries(['rollPhotos', id]);
               queryClient.invalidateQueries(['roll', id]);
            }}
          />
        )}
      
      <input type="file" multiple ref={fileInputRef} style={{ display: 'none' }} onChange={onUpload} />
    </div>
  );
}
