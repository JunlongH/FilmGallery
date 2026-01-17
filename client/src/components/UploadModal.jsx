import React, { useState, useRef } from 'react';
import { uploadPhotoToRoll } from '../api';
import '../styles/forms.css';

// Styles for the modal
const modalOverlayStyle = {
  position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
  backgroundColor: 'rgba(0,0,0,0.7)',
  zIndex: 99999,
  display: 'flex', alignItems: 'center', justifyContent: 'center'
};

const modalPanelStyle = {
  backgroundColor: '#1e293b',
  borderRadius: '12px',
  width: '600px',
  maxWidth: '90vw',
  maxHeight: '90vh',
  display: 'flex',
  flexDirection: 'column',
  boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)',
  border: '1px solid #334155'
};

const dropZoneStyle = {
  border: '2px dashed #475569',
  borderRadius: '8px',
  padding: '40px',
  textAlign: 'center',
  cursor: 'pointer',
  transition: 'all 0.2s',
  backgroundColor: '#0f172a',
  margin: '0 20px 20px'
};

const fileListStyle = {
  flex: 1,
  overflowY: 'auto',
  padding: '0 20px',
  minHeight: '100px',
  maxHeight: '300px'
};

const fileItemStyle = {
  display: 'flex',
  alignItems: 'center',
  padding: '8px 12px',
  backgroundColor: '#334155',
  borderRadius: '6px',
  marginBottom: '8px',
  gap: '12px',
  fontSize: '13px'
};

const progressBarContainerStyle = {
  flex: 1,
  height: '6px',
  backgroundColor: '#1e293b',
  borderRadius: '3px',
  overflow: 'hidden',
  position: 'relative'
};

const progressBarStyle = (percent, color = '#3b82f6') => ({
  width: `${percent}%`,
  height: '100%',
  backgroundColor: color,
  transition: 'width 0.2s'
});

export default function UploadModal({ isOpen, onClose, rollId, onUploadComplete }) {
  const [files, setFiles] = useState([]);
  const [uploadType, setUploadType] = useState('positive');
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef(null);
  
  // Stats
  const completedCount = files.filter(f => f.status === 'success').length;
  const failedCount = files.filter(f => f.status === 'error').length;
  const totalCount = files.length;
  const overallProgress = totalCount > 0 ? (completedCount / totalCount) * 100 : 0;

  if (!isOpen) return null;

  const handleFileSelect = (e) => {
    if (e.target.files) {
      addFiles(Array.from(e.target.files));
    }
    // reset input
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const addFiles = (newFiles) => {
    const queueItems = newFiles.map(f => ({
      id: Math.random().toString(36).substr(2, 9),
      file: f,
      status: 'pending', // pending, uploading, success, error
      progress: 0,
      error: null
    }));
    setFiles(prev => [...prev, ...queueItems]);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    if (e.dataTransfer.files) {
      addFiles(Array.from(e.dataTransfer.files));
    }
  };

  const removeItem = (id) => {
    if (isUploading) return;
    setFiles(prev => prev.filter(item => item.id !== id));
  };

  const processQueue = async () => {
    setIsUploading(true);
    
    // Process strictly sequentially to avoid overwhelming server with heavyweight Image ops
    // We update state for each item
    
    // We need to work on a copy of the list that mirrors current state, 
    // but the loop needs access to live references or indices.
    // Easier strategy: iterate by index, check status.
    
    for (let i = 0; i < files.length; i++) {
      const item = files[i];
      if (item.status === 'success') continue; // already done

      // Update status to uploading
      setFiles(prev => {
        const next = [...prev];
        next[i] = { ...next[i], status: 'uploading', progress: 0 };
        return next;
      });

      try {
        // We don't have per-byte progress from fetch/api layer easily for single files yet
        // without custom XHR. For now, simulate or just jump to 100 on done.
        
        await uploadPhotoToRoll(rollId, item.file, { uploadType });
        
        setFiles(prev => {
          const next = [...prev];
          next[i] = { ...next[i], status: 'success', progress: 100 };
          return next;
        });
        
      } catch (err) {
        console.error('Upload failed', err);
        setFiles(prev => {
          const next = [...prev];
          const msg = err.message || 'Upload failed';
          next[i] = { ...next[i], status: 'error', error: msg };
          return next;
        });
      }
    }
    
    setIsUploading(false);
    if (files.every(f => f.status === 'success')) {
       // Optional: Auto close or show success message?
       // For now, let user see green checks then close manually
       if (onUploadComplete) onUploadComplete();
    } else {
       // Partial success, refresh anyway
       if (onUploadComplete) onUploadComplete();
    }
  };

  const clearQueue = () => {
    setFiles([]);
  };

  return (
    <div style={modalOverlayStyle} onClick={onClose} onDragOver={e => e.preventDefault()} onDrop={handleDrop}>
      <div style={modalPanelStyle} onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div style={{ padding: '20px', borderBottom: '1px solid #334155', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2 style={{ margin: 0, fontSize: '18px', color: '#f1f5f9' }}>Upload Photos</h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer' }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
          </button>
        </div>

        {/* Type Selector */}
        <div style={{ padding: '20px', display: 'flex', gap: '12px' }}>
          {[
            { id: 'positive', label: 'Positive', desc: 'Processed JPGs' },
            { id: 'negative', label: 'Negative', desc: 'Film Scans' },
            { id: 'original', label: 'Original', desc: 'RAW / Backups' }
          ].map(type => (
            <label 
              key={type.id}
              style={{ 
                flex: 1, 
                padding: '12px', 
                borderRadius: '8px', 
                border: uploadType === type.id ? '2px solid #3b82f6' : '1px solid #334155',
                backgroundColor: uploadType === type.id ? 'rgba(59, 130, 246, 0.1)' : 'transparent',
                cursor: isUploading ? 'not-allowed' : 'pointer',
                opacity: isUploading ? 0.6 : 1
              }}
            >
              <input 
                type="radio" 
                name="uploadType" 
                value={type.id} 
                checked={uploadType === type.id} 
                onChange={e => setUploadType(e.target.value)}
                disabled={isUploading}
                style={{ display: 'none' }}
              />
              <div style={{ fontWeight: 600, color: uploadType === type.id ? '#60a5fa' : '#e2e8f0', marginBottom: 4 }}>{type.label}</div>
              <div style={{ fontSize: '12px', color: '#94a3b8' }}>{type.desc}</div>
            </label>
          ))}
        </div>

        {/* Drop Zone */}
        {!isUploading && (
          <div 
            style={dropZoneStyle}
            onClick={() => fileInputRef.current && fileInputRef.current.click()}
            className="upload-dropzone"
          >
            <input 
              type="file" 
              multiple 
              onChange={handleFileSelect} 
              style={{ display: 'none' }} 
              ref={fileInputRef} 
            />
            <div style={{ color: '#cbd5e1', marginBottom: 8 }}>
              Click to browse or drag files here
            </div>
            <div style={{ fontSize: '12px', color: '#64748b' }}>
              Supports JPG, JPEG, TIFF, DNG, CR2, NEF, ARW...
            </div>
          </div>
        )}

        {/* File List */}
        {files.length > 0 && (
          <div style={fileListStyle}>
            {files.map((item, index) => (
              <div key={item.id} style={fileItemStyle}>
                <div style={{ width: 24, height: 24, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  {item.status === 'pending' && <span style={{color: '#94a3b8'}}>•</span>}
                  {item.status === 'uploading' && <div className="spinner-sm" style={{borderColor: '#fff'}} />}
                  {item.status === 'success' && <span style={{color: '#4ade80'}}>✓</span>}
                  {item.status === 'error' && <span style={{color: '#ef4444'}}>✕</span>}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: '#e2e8f0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.file.name}</span>
                    <span style={{ fontSize: '11px', color: '#94a3b8' }}>{(item.file.size / 1024 / 1024).toFixed(1)} MB</span>
                  </div>
                  {item.error && <div style={{ fontSize: '11px', color: '#ef4444', marginTop: 2 }}>{item.error}</div>}
                  {item.status === 'uploading' && <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: 2 }}>Processing...</div>}
                </div>
                {!isUploading && item.status === 'pending' && (
                  <button onClick={(e) => { e.stopPropagation(); removeItem(item.id); }} style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer' }}>×</button>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Footer */}
        <div style={{ padding: '20px', borderTop: '1px solid #334155', display: 'flex', flexDirection: 'column', gap: 12 }}>
          {/* Progress Bar Area */}
          {isUploading && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
               <div style={progressBarContainerStyle}>
                 <div style={progressBarStyle(overallProgress)} />
               </div>
               <div style={{ fontSize: '12px', color: '#94a3b8', minWidth: 60, textAlign: 'right' }}>
                 {Math.round(overallProgress)}%
               </div>
            </div>
          )}

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
             <div style={{ fontSize: '13px', color: '#94a3b8' }}>
               {files.length} files selected 
               {failedCount > 0 && <span style={{ color: '#ef4444', marginLeft: 8 }}>({failedCount} failed)</span>}
             </div>
             <div style={{ display: 'flex', gap: '12px' }}>
               {!isUploading && (
                 <button className="secondary-btn" onClick={clearQueue} disabled={files.length === 0}>Clear</button>
               )}
               {isUploading ? (
                 <button className="primary-btn" disabled style={{ opacity: 0.7 }}>
                   Uploading {completedCount}/{totalCount}
                 </button>
               ) : (
                 <button 
                  className="primary-btn" 
                  onClick={processQueue} 
                  disabled={files.length === 0 || files.every(f => f.status === 'success')}
                  style={{ backgroundColor: uploadType === 'positive' ? '#2563eb' : (uploadType === 'negative' ? '#ea580c' : '#7c3aed') }}
                >
                   Start Upload
                 </button>
               )}
             </div>
          </div>
        </div>
      </div>
    </div>
  );
}
