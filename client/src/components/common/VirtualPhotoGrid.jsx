/**
 * VirtualPhotoGrid - 虚拟化照片网格
 * 
 * 使用 react-window 实现虚拟滚动
 * 只渲染可见区域的照片，大幅提升大量照片场景的性能
 * 
 * @version 1.0.0
 * @date 2026-01-31
 */

import React, { useCallback, useMemo, memo } from 'react';
import { FixedSizeGrid as Grid } from 'react-window';
import LazyImage from './LazyImage';
import { buildUploadUrl } from '../../api';

/**
 * 计算网格列数
 * @param {number} containerWidth - 容器宽度
 * @param {number} minColumnWidth - 最小列宽
 * @param {number} gap - 间距
 * @returns {number}
 */
function calculateColumnCount(containerWidth, minColumnWidth, gap) {
  return Math.max(1, Math.floor((containerWidth + gap) / (minColumnWidth + gap)));
}

/**
 * 虚拟化照片网格组件
 * 
 * @param {Object} props
 * @param {Array} props.photos - 照片数组
 * @param {number} [props.width] - 容器宽度（必须提供）
 * @param {number} [props.height] - 容器高度（必须提供）
 * @param {number} [props.columnWidth=200] - 列宽
 * @param {number} [props.rowHeight=200] - 行高
 * @param {number} [props.gap=16] - 间距
 * @param {string} [props.aspectRatio='1/1'] - 图片宽高比
 * @param {Function} [props.onPhotoClick] - 点击照片回调
 * @param {Function} [props.renderOverlay] - 自定义遮罩渲染
 */
function VirtualPhotoGrid({
  photos = [],
  width,
  height,
  columnWidth = 200,
  rowHeight = 200,
  gap = 16,
  aspectRatio = '1/1',
  onPhotoClick,
  renderOverlay,
}) {
  // 计算列数
  const columnCount = useMemo(() => {
    return calculateColumnCount(width, columnWidth, gap);
  }, [width, columnWidth, gap]);

  // 计算行数
  const rowCount = useMemo(() => {
    return Math.ceil(photos.length / columnCount);
  }, [photos.length, columnCount]);

  // 计算实际列宽（均分剩余空间）
  const actualColumnWidth = useMemo(() => {
    return (width - gap * (columnCount - 1)) / columnCount;
  }, [width, gap, columnCount]);

  // 计算实际行高（保持宽高比）
  const actualRowHeight = useMemo(() => {
    if (aspectRatio === '1/1') return actualColumnWidth;
    if (aspectRatio === '3/2') return actualColumnWidth / 1.5;
    if (aspectRatio === '4/3') return actualColumnWidth / 1.333;
    if (aspectRatio === '16/9') return actualColumnWidth / 1.778;
    return rowHeight;
  }, [actualColumnWidth, aspectRatio, rowHeight]);

  // 单元格渲染器
  const Cell = useCallback(({ columnIndex, rowIndex, style }) => {
    const index = rowIndex * columnCount + columnIndex;
    const photo = photos[index];

    if (!photo) return null;

    const photoUrl = buildUploadUrl(photo.positive_rel_path || photo.full_rel_path);
    const thumbUrl = buildUploadUrl(photo.thumb_rel_path || photo.positive_thumb_rel_path);

    // 调整样式以包含间距
    const cellStyle = {
      ...style,
      left: style.left + (columnIndex > 0 ? gap / 2 : 0),
      top: style.top + (rowIndex > 0 ? gap / 2 : 0),
      width: style.width - (columnIndex > 0 ? gap / 2 : 0) - (columnIndex < columnCount - 1 ? gap / 2 : 0),
      height: style.height - (rowIndex > 0 ? gap / 2 : 0) - gap / 2,
    };

    return (
      <div style={cellStyle}>
        <div 
          className="relative w-full h-full rounded-lg overflow-hidden cursor-pointer group"
          onClick={() => onPhotoClick?.(photo, index, photos)}
        >
          <LazyImage
            src={photoUrl}
            thumb={thumbUrl}
            alt={photo.caption || ''}
            aspectRatio="1/1"
            className="w-full h-full"
            objectFit="cover"
          />
          
          {/* 悬浮遮罩 */}
          <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors duration-200" />
          
          {/* 自定义遮罩 */}
          {renderOverlay?.(photo, index)}
          
          {/* 收藏标记 */}
          {photo.is_favorite && (
            <div className="absolute top-2 right-2 w-6 h-6 rounded-full bg-red-500 flex items-center justify-center text-white text-xs">
              ♥
            </div>
          )}
        </div>
      </div>
    );
  }, [photos, columnCount, gap, onPhotoClick, renderOverlay]);

  if (!width || !height || photos.length === 0) {
    return null;
  }

  return (
    <Grid
      columnCount={columnCount}
      columnWidth={actualColumnWidth + gap}
      height={height}
      rowCount={rowCount}
      rowHeight={actualRowHeight + gap}
      width={width}
      overscanRowCount={2}
      overscanColumnCount={1}
    >
      {Cell}
    </Grid>
  );
}

export default memo(VirtualPhotoGrid);
