/**
 * 匹配预览表格组件
 * 
 * @component MatchPreviewTable
 * @description 显示导入文件与底片的匹配结果
 */

import React from 'react';

// 匹配状态样式
const STATUS_STYLES = {
  matched: { color: '#4CAF50', icon: '✓', text: '匹配' },
  conflict: { color: '#FF9800', icon: '⚠', text: '冲突' },
  unmatched: { color: '#9E9E9E', icon: '○', text: '未匹配' },
  no_negative: { color: '#f44336', icon: '✗', text: '无底片' }
};

export default function MatchPreviewTable({
  matches = [],
  unmatchedPhotos = [],
  isManualMode = false,
  onManualMatch,
  selectedFileIndex = null,
  onSelectFile
}) {
  return (
    <div style={{ 
      maxHeight: 300, 
      overflow: 'auto',
      border: '1px solid #333',
      borderRadius: 4
    }}>
      <table style={{ 
        width: '100%', 
        borderCollapse: 'collapse',
        fontSize: 13
      }}>
        <thead>
          <tr style={{ 
            background: '#252525', 
            position: 'sticky', 
            top: 0,
            zIndex: 1
          }}>
            <th style={thStyle}>#</th>
            <th style={thStyle}>导入文件</th>
            <th style={thStyle}>对应底片</th>
            <th style={thStyle}>帧号</th>
            <th style={thStyle}>状态</th>
            {isManualMode && <th style={thStyle}>操作</th>}
          </tr>
        </thead>
        <tbody>
          {matches.map((match, index) => {
            const status = STATUS_STYLES[match.status] || STATUS_STYLES.unmatched;
            const isSelected = selectedFileIndex === index;
            
            return (
              <tr 
                key={index}
                style={{ 
                  background: isSelected ? '#2196F330' : 'transparent',
                  cursor: isManualMode ? 'pointer' : 'default'
                }}
                onClick={() => isManualMode && onSelectFile && onSelectFile(index)}
              >
                <td style={tdStyle}>{index + 1}</td>
                <td style={tdStyle} title={match.file}>
                  <span style={{ 
                    display: 'inline-block',
                    maxWidth: 180,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap'
                  }}>
                    {match.filename}
                  </span>
                </td>
                <td style={tdStyle}>
                  {match.photo ? (
                    <span style={{ color: '#ddd' }}>
                      {getPhotoFilename(match.photo)}
                    </span>
                  ) : (
                    <span style={{ color: '#666', fontStyle: 'italic' }}>—</span>
                  )}
                </td>
                <td style={{ ...tdStyle, textAlign: 'center' }}>
                  {match.frameNumber || '—'}
                </td>
                <td style={{ ...tdStyle, color: status.color }}>
                  {status.icon} {status.text}
                </td>
                {isManualMode && (
                  <td style={tdStyle}>
                    {match.photoId && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onManualMatch && onManualMatch(index, null);
                        }}
                        style={{
                          padding: '2px 8px',
                          background: '#f44336',
                          border: 'none',
                          borderRadius: 3,
                          color: '#fff',
                          fontSize: 11,
                          cursor: 'pointer'
                        }}
                      >
                        取消
                      </button>
                    )}
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// 辅助函数
function getPhotoFilename(photo) {
  if (!photo) return null;
  const path = photo.negative_rel_path || photo.full_rel_path || photo.filename;
  if (!path) return null;
  return path.split('/').pop();
}

// 样式
const thStyle = {
  padding: '8px 12px',
  textAlign: 'left',
  color: '#888',
  fontWeight: 600,
  borderBottom: '1px solid #333'
};

const tdStyle = {
  padding: '8px 12px',
  borderBottom: '1px solid #2a2a2a',
  color: '#ddd'
};
