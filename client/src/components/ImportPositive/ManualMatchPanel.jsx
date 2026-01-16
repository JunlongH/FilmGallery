/**
 * 手动匹配面板组件
 * 
 * @component ManualMatchPanel
 * @description 显示未匹配的底片列表，供用户手动选择
 */

import React from 'react';

export default function ManualMatchPanel({
  unmatchedPhotos = [],
  selectedFileIndex,
  onSelectPhoto,
  buildUploadUrl
}) {
  if (selectedFileIndex === null) {
    return (
      <div style={{
        padding: 16,
        background: '#252525',
        borderRadius: 4,
        color: '#888',
        textAlign: 'center'
      }}>
        请先在上方表格中选择一个导入文件
      </div>
    );
  }
  
  if (unmatchedPhotos.length === 0) {
    return (
      <div style={{
        padding: 16,
        background: '#252525',
        borderRadius: 4,
        color: '#4CAF50',
        textAlign: 'center'
      }}>
        所有底片已匹配完成
      </div>
    );
  }
  
  return (
    <div style={{
      background: '#252525',
      borderRadius: 4,
      padding: 12
    }}>
      <div style={{ 
        color: '#888', 
        fontSize: 12, 
        marginBottom: 8 
      }}>
        点击选择要匹配的底片 ({unmatchedPhotos.length} 张可用)
      </div>
      
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(80px, 1fr))',
        gap: 8,
        maxHeight: 200,
        overflow: 'auto'
      }}>
        {unmatchedPhotos.map(photo => (
          <div
            key={photo.id}
            onClick={() => onSelectPhoto && onSelectPhoto(photo.id)}
            style={{
              background: '#1e1e1e',
              borderRadius: 4,
              padding: 8,
              cursor: 'pointer',
              border: '1px solid #333',
              transition: 'border-color 0.2s'
            }}
            onMouseEnter={e => e.currentTarget.style.borderColor = '#2196F3'}
            onMouseLeave={e => e.currentTarget.style.borderColor = '#333'}
          >
            <div style={{
              fontSize: 12,
              color: '#ddd',
              textAlign: 'center',
              marginBottom: 4
            }}>
              #{photo.frameNumber || '?'}
            </div>
            <div style={{
              fontSize: 10,
              color: '#888',
              textAlign: 'center',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap'
            }}>
              {photo.filename || `Photo ${photo.id}`}
            </div>
            {photo.hasPositive && (
              <div style={{
                fontSize: 10,
                color: '#FF9800',
                textAlign: 'center',
                marginTop: 4
              }}>
                ⚠ 已有正片
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
