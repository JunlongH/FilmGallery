/**
 * RemoteFileBrowser Component
 * 
 * 远程文件系统浏览器，用于在混合模式下选择服务器端的文件或目录
 * 
 * @module client/src/components/common/RemoteFileBrowser
 */

import React, { useState, useEffect, useCallback } from 'react';
import { getApiBase } from '../../api';

// 文件图标
const ICONS = {
  directory: '📁',
  file: '📄',
  image: '🖼️',
  back: '⬆️',
  loading: '⏳',
  error: '❌'
};

// 图片扩展名
const IMAGE_EXTENSIONS = ['jpg', 'jpeg', 'png', 'tif', 'tiff', 'gif', 'bmp', 'webp', 'raw', 'cr2', 'nef', 'arw', 'dng'];

/**
 * 远程文件浏览器组件
 */
export default function RemoteFileBrowser({
  isOpen,
  onClose,
  onSelect,
  mode = 'directory', // 'directory' | 'file' | 'both'
  fileFilter = null,  // 文件扩展名过滤，如 ['jpg', 'jpeg', 'tif']
  title = '选择路径',
  initialPath = null
}) {
  const [roots, setRoots] = useState([]);
  const [currentPath, setCurrentPath] = useState(null);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [selectedItem, setSelectedItem] = useState(null);
  const [canGoUp, setCanGoUp] = useState(false);
  const [parentPath, setParentPath] = useState(null);

  // 获取根目录列表
  const fetchRoots = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const apiBase = getApiBase();
      const res = await fetch(`${apiBase}/api/filesystem/roots`);
      const data = await res.json();
      if (data.ok) {
        setRoots(data.roots || []);
        // 返回根目录列表，让调用方决定是否自动进入
        return data.roots || [];
      } else {
        setError(data.error || 'Failed to load roots');
        return [];
      }
    } catch (err) {
      setError(err.message || 'Network error');
      return [];
    } finally {
      setLoading(false);
    }
  }, []);

  // 浏览指定目录
  const browsePath = useCallback(async (targetPath) => {
    setLoading(true);
    setError(null);
    setSelectedItem(null);
    try {
      const params = new URLSearchParams({ path: targetPath });
      if (mode === 'file' && fileFilter) {
        params.set('filter', fileFilter.join(','));
      }
      
      const apiBase = getApiBase();
      const res = await fetch(`${apiBase}/api/filesystem/browse?${params}`);
      const data = await res.json();
      
      if (data.ok) {
        setCurrentPath(data.path);
        setParentPath(data.parent);
        setCanGoUp(data.canGoUp);
        setItems(data.items || []);
      } else {
        setError(data.error || 'Failed to browse path');
      }
    } catch (err) {
      setError(err.message || 'Network error');
    } finally {
      setLoading(false);
    }
  }, [mode, fileFilter]);

  // 初始化
  useEffect(() => {
    if (isOpen) {
      if (initialPath) {
        browsePath(initialPath);
      } else {
        // 获取根目录，如果只有一个则自动进入
        fetchRoots().then(roots => {
          if (roots?.length === 1) {
            browsePath(roots[0].path);
          }
        });
        setCurrentPath(null);
        setItems([]);
      }
    }
  }, [isOpen, initialPath, fetchRoots, browsePath]);

  // 处理项目点击
  const handleItemClick = (item) => {
    if (item.type === 'directory') {
      browsePath(item.path);
    } else {
      // 文件：选中
      setSelectedItem(item);
    }
  };

  // 处理项目双击
  const handleItemDoubleClick = (item) => {
    if (item.type === 'directory') {
      if (mode === 'directory' || mode === 'both') {
        // 如果是目录模式，双击直接选择该目录
        onSelect(item.path);
        onClose();
      }
    } else {
      // 文件模式，双击选择文件
      if (mode === 'file' || mode === 'both') {
        onSelect(item.path);
        onClose();
      }
    }
  };

  // 返回上级
  const handleGoUp = () => {
    if (canGoUp && parentPath) {
      browsePath(parentPath);
    } else {
      // 返回根目录列表
      setCurrentPath(null);
      setItems([]);
      fetchRoots();
    }
  };

  // 选择当前目录
  const handleSelectCurrent = () => {
    if (mode === 'directory' || mode === 'both') {
      onSelect(currentPath);
      onClose();
    }
  };

  // 选择选中的项目
  const handleConfirm = () => {
    if (selectedItem) {
      onSelect(selectedItem.path);
      onClose();
    } else if (currentPath && (mode === 'directory' || mode === 'both')) {
      onSelect(currentPath);
      onClose();
    }
  };

  // 获取文件图标
  const getIcon = (item) => {
    if (item.type === 'directory') return ICONS.directory;
    if (IMAGE_EXTENSIONS.includes(item.ext?.toLowerCase())) return ICONS.image;
    return ICONS.file;
  };

  // 格式化文件大小
  const formatSize = (bytes) => {
    if (!bytes) return '';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
    return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
  };

  if (!isOpen) return null;

  return (
    <div style={styles.overlay} onClick={onClose}>
      <div style={styles.modal} onClick={e => e.stopPropagation()}>
        {/* 标题栏 */}
        <div style={styles.header}>
          <h3 style={styles.title}>{title}</h3>
          <button style={styles.closeBtn} onClick={onClose}>×</button>
        </div>

        {/* 路径栏 */}
        <div style={styles.pathBar}>
          <button 
            style={styles.upBtn} 
            onClick={handleGoUp}
            disabled={!currentPath}
          >
            {ICONS.back} 上级
          </button>
          <div style={styles.currentPath}>
            {currentPath || '根目录'}
          </div>
        </div>

        {/* 内容区 */}
        <div style={styles.content}>
          {loading ? (
            <div style={styles.loading}>{ICONS.loading} 加载中...</div>
          ) : error ? (
            <div style={styles.error}>{ICONS.error} {error}</div>
          ) : !currentPath ? (
            // 根目录列表
            <div style={styles.itemList}>
              {roots.length === 0 ? (
                <div style={styles.empty}>没有可用的目录</div>
              ) : (
                roots.map((root, i) => (
                  <div
                    key={i}
                    style={styles.item}
                    onClick={() => browsePath(root.path)}
                  >
                    <span style={styles.icon}>{ICONS.directory}</span>
                    <span style={styles.itemName}>{root.name}</span>
                    <span style={styles.itemPath}>{root.path}</span>
                  </div>
                ))
              )}
            </div>
          ) : (
            // 目录内容
            <div style={styles.itemList}>
              {items.length === 0 ? (
                <div style={styles.empty}>空目录</div>
              ) : (
                items.map((item, i) => (
                  <div
                    key={i}
                    style={{
                      ...styles.item,
                      ...(selectedItem?.path === item.path ? styles.itemSelected : {})
                    }}
                    onClick={() => handleItemClick(item)}
                    onDoubleClick={() => handleItemDoubleClick(item)}
                  >
                    <span style={styles.icon}>{getIcon(item)}</span>
                    <span style={styles.itemName}>{item.name}</span>
                    {item.type === 'file' && (
                      <span style={styles.itemSize}>{formatSize(item.size)}</span>
                    )}
                    {item.type === 'directory' && item.hasChildren && (
                      <span style={styles.itemArrow}>›</span>
                    )}
                  </div>
                ))
              )}
            </div>
          )}
        </div>

        {/* 底部操作栏 */}
        <div style={styles.footer}>
          {mode === 'directory' && currentPath && (
            <button style={styles.selectCurrentBtn} onClick={handleSelectCurrent}>
              选择当前目录
            </button>
          )}
          <div style={styles.footerRight}>
            <button style={styles.cancelBtn} onClick={onClose}>
              取消
            </button>
            <button 
              style={{
                ...styles.confirmBtn,
                opacity: (selectedItem || (mode === 'directory' && currentPath)) ? 1 : 0.5
              }}
              onClick={handleConfirm}
              disabled={!selectedItem && !(mode === 'directory' && currentPath)}
            >
              确定
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// 样式
const styles = {
  overlay: {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    background: 'rgba(0, 0, 0, 0.7)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10000
  },
  modal: {
    background: '#1e1e1e',
    borderRadius: 12,
    width: '90%',
    maxWidth: 700,
    maxHeight: '80vh',
    display: 'flex',
    flexDirection: 'column',
    boxShadow: '0 8px 32px rgba(0, 0, 0, 0.5)'
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '16px 20px',
    borderBottom: '1px solid #333'
  },
  title: {
    margin: 0,
    color: '#fff',
    fontSize: 18,
    fontWeight: 600
  },
  closeBtn: {
    background: 'none',
    border: 'none',
    color: '#888',
    fontSize: 24,
    cursor: 'pointer',
    padding: 0,
    lineHeight: 1
  },
  pathBar: {
    display: 'flex',
    alignItems: 'center',
    padding: '12px 20px',
    borderBottom: '1px solid #333',
    gap: 12
  },
  upBtn: {
    background: '#333',
    border: 'none',
    color: '#fff',
    padding: '6px 12px',
    borderRadius: 4,
    cursor: 'pointer',
    fontSize: 13
  },
  currentPath: {
    flex: 1,
    color: '#888',
    fontSize: 13,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap'
  },
  content: {
    flex: 1,
    overflow: 'auto',
    minHeight: 300
  },
  loading: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    height: 200,
    color: '#888',
    fontSize: 16
  },
  error: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    height: 200,
    color: '#f44336',
    fontSize: 14
  },
  empty: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    height: 200,
    color: '#666',
    fontSize: 14
  },
  itemList: {
    padding: '8px 0'
  },
  item: {
    display: 'flex',
    alignItems: 'center',
    padding: '10px 20px',
    cursor: 'pointer',
    gap: 12,
    transition: 'background 0.15s'
  },
  itemSelected: {
    background: '#2196F3',
    color: '#fff'
  },
  icon: {
    fontSize: 20,
    width: 24,
    textAlign: 'center'
  },
  itemName: {
    flex: 1,
    color: '#fff',
    fontSize: 14,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap'
  },
  itemPath: {
    color: '#666',
    fontSize: 12,
    marginLeft: 'auto'
  },
  itemSize: {
    color: '#888',
    fontSize: 12,
    marginLeft: 'auto'
  },
  itemArrow: {
    color: '#666',
    fontSize: 18
  },
  footer: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '16px 20px',
    borderTop: '1px solid #333'
  },
  footerRight: {
    display: 'flex',
    gap: 12,
    marginLeft: 'auto'
  },
  selectCurrentBtn: {
    background: '#333',
    border: 'none',
    color: '#fff',
    padding: '8px 16px',
    borderRadius: 6,
    cursor: 'pointer',
    fontSize: 14
  },
  cancelBtn: {
    background: '#333',
    border: 'none',
    color: '#fff',
    padding: '8px 20px',
    borderRadius: 6,
    cursor: 'pointer',
    fontSize: 14
  },
  confirmBtn: {
    background: '#2196F3',
    border: 'none',
    color: '#fff',
    padding: '8px 20px',
    borderRadius: 6,
    cursor: 'pointer',
    fontSize: 14,
    fontWeight: 500
  }
};
