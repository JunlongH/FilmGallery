/**
 * LUT 库管理页面
 * 
 * @component LutLibrary
 * @description 管理 LUT 文件的上传、删除和预览
 */

import React, { useState, useEffect, useRef } from 'react';
import { listLuts, uploadLut, deleteLut } from '../../api';

// ============================================================================
// 样式
// ============================================================================

const styles = {
  container: {
    padding: 24,
    maxWidth: 1200,
    margin: '0 auto'
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 24
  },
  title: {
    fontSize: 24,
    fontWeight: 600,
    color: '#fff',
    margin: 0
  },
  uploadBtn: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    padding: '10px 20px',
    background: '#4a9eff',
    color: '#fff',
    border: 'none',
    borderRadius: 6,
    cursor: 'pointer',
    fontSize: 14,
    fontWeight: 500
  },
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
    gap: 16
  },
  card: {
    background: '#252525',
    borderRadius: 8,
    padding: 16,
    border: '1px solid #333'
  },
  cardHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12
  },
  lutName: {
    fontSize: 14,
    fontWeight: 600,
    color: '#fff',
    wordBreak: 'break-all',
    flex: 1,
    marginRight: 8
  },
  deleteBtn: {
    background: 'transparent',
    border: 'none',
    color: '#ff6b6b',
    cursor: 'pointer',
    padding: 4,
    fontSize: 18,
    lineHeight: 1
  },
  lutInfo: {
    fontSize: 12,
    color: '#888',
    marginBottom: 8
  },
  lutType: {
    display: 'inline-block',
    padding: '2px 8px',
    background: '#333',
    borderRadius: 4,
    fontSize: 11,
    color: '#aaa'
  },
  preview: {
    width: '100%',
    height: 60,
    borderRadius: 4,
    marginTop: 8
  },
  emptyState: {
    textAlign: 'center',
    padding: 60,
    color: '#888'
  },
  loading: {
    textAlign: 'center',
    padding: 40,
    color: '#888'
  },
  builtInBadge: {
    display: 'inline-block',
    padding: '2px 6px',
    background: '#2d5a1d',
    color: '#8bc34a',
    borderRadius: 4,
    fontSize: 10,
    marginLeft: 8
  }
};

// ============================================================================
// 辅助函数
// ============================================================================

function formatFileSize(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

function formatDate(dateStr) {
  const d = new Date(dateStr);
  return d.toLocaleDateString() + ' ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

// 生成 LUT 预览渐变
function generatePreviewGradient(lutName) {
  // 根据名称生成不同的渐变色
  const hash = lutName.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
  const hue1 = hash % 360;
  const hue2 = (hash * 2) % 360;
  
  return `linear-gradient(135deg, 
    hsl(${hue1}, 40%, 20%) 0%, 
    hsl(${(hue1 + hue2) / 2}, 50%, 40%) 50%, 
    hsl(${hue2}, 40%, 60%) 100%)`;
}

// ============================================================================
// LUT 卡片组件
// ============================================================================

function LutCard({ lut, onDelete }) {
  const [deleting, setDeleting] = useState(false);
  const isBuiltIn = lut.name.startsWith('FilmGallery_');
  
  const handleDelete = async () => {
    if (isBuiltIn) {
      if (!window.confirm(`"${lut.name}" 是内置 LUT，确定要删除吗？`)) return;
    } else {
      if (!window.confirm(`确定要删除 "${lut.name}" 吗？`)) return;
    }
    
    setDeleting(true);
    try {
      await deleteLut(lut.name);
      onDelete(lut.name);
    } catch (e) {
      console.error('Failed to delete LUT:', e);
      alert('删除失败: ' + e.message);
    } finally {
      setDeleting(false);
    }
  };
  
  return (
    <div style={styles.card}>
      <div style={styles.cardHeader}>
        <div style={styles.lutName}>
          {lut.name}
          {isBuiltIn && <span style={styles.builtInBadge}>内置</span>}
        </div>
        <button 
          style={{ ...styles.deleteBtn, opacity: deleting ? 0.5 : 1 }}
          onClick={handleDelete}
          disabled={deleting}
          title="删除"
        >
          ×
        </button>
      </div>
      
      <div style={styles.lutInfo}>
        <span style={styles.lutType}>{lut.type}</span>
        <span style={{ marginLeft: 8 }}>{formatFileSize(lut.size)}</span>
      </div>
      
      <div style={styles.lutInfo}>
        修改于: {formatDate(lut.modifiedAt)}
      </div>
      
      <div 
        style={{ 
          ...styles.preview, 
          background: generatePreviewGradient(lut.name)
        }} 
      />
    </div>
  );
}

// ============================================================================
// 主组件
// ============================================================================

export default function LutLibrary() {
  const [luts, setLuts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef(null);
  
  // 加载 LUT 列表
  useEffect(() => {
    loadLuts();
  }, []);
  
  const loadLuts = async () => {
    setLoading(true);
    try {
      const data = await listLuts();
      setLuts(data.luts || []);
    } catch (e) {
      console.error('Failed to load LUTs:', e);
    } finally {
      setLoading(false);
    }
  };
  
  // 上传 LUT
  const handleUpload = async (e) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    
    setUploading(true);
    let successCount = 0;
    let errorCount = 0;
    
    for (const file of files) {
      const ext = file.name.toLowerCase().split('.').pop();
      if (!['cube', '3dl', 'csp', 'lut'].includes(ext)) {
        errorCount++;
        continue;
      }
      
      try {
        await uploadLut(file);
        successCount++;
      } catch (e) {
        console.error('Failed to upload LUT:', file.name, e);
        errorCount++;
      }
    }
    
    if (errorCount > 0) {
      alert(`上传完成: 成功 ${successCount} 个, 失败 ${errorCount} 个`);
    }
    
    await loadLuts();
    setUploading(false);
    e.target.value = '';
  };
  
  // 删除回调
  const handleDelete = (name) => {
    setLuts(prev => prev.filter(l => l.name !== name));
  };
  
  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <h1 style={styles.title}>LUT 库</h1>
        
        <label style={{ ...styles.uploadBtn, opacity: uploading ? 0.7 : 1 }}>
          {uploading ? '上传中...' : '➕ 上传 LUT'}
          <input
            ref={fileInputRef}
            type="file"
            accept=".cube,.3dl,.csp,.lut"
            multiple
            onChange={handleUpload}
            style={{ display: 'none' }}
            disabled={uploading}
          />
        </label>
      </div>
      
      {loading ? (
        <div style={styles.loading}>加载中...</div>
      ) : luts.length === 0 ? (
        <div style={styles.emptyState}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>📁</div>
          <div style={{ fontSize: 16, marginBottom: 8 }}>暂无 LUT 文件</div>
          <div style={{ fontSize: 14 }}>点击上方按钮上传 .cube, .3dl, .csp 或 .lut 文件</div>
        </div>
      ) : (
        <div style={styles.grid}>
          {luts.map(lut => (
            <LutCard 
              key={lut.name} 
              lut={lut} 
              onDelete={handleDelete}
            />
          ))}
        </div>
      )}
    </div>
  );
}
