/**
 * GeoSearchInput - 可复用的地点搜索组件
 * 
 * 功能：
 * - 输入地址/地名搜索
 * - 显示搜索结果下拉列表
 * - 选择结果后填充经纬度
 * 
 * 使用 OpenStreetMap Nominatim API
 */

import React, { useState, useRef, useEffect } from 'react';
import { searchAddress } from '../utils/geocoding';

/**
 * @param {Object} props
 * @param {string} props.value - 当前输入值
 * @param {function} props.onChange - 输入值变化回调 (value: string) => void
 * @param {function} props.onSelect - 选择搜索结果回调 (result: { latitude, longitude, country, city, displayName, detail }) => void
 * @param {string} props.placeholder - 输入框占位符
 * @param {string} props.className - 额外的 CSS 类名
 * @param {Object} props.style - 额外的内联样式
 * @param {boolean} props.disabled - 是否禁用
 */
export default function GeoSearchInput({
  value,
  onChange,
  onSelect,
  placeholder = 'Search address...',
  className = '',
  style = {},
  disabled = false
}) {
  const [searching, setSearching] = useState(false);
  const [results, setResults] = useState([]);
  const [showResults, setShowResults] = useState(false);
  const containerRef = useRef(null);

  // 点击外部关闭下拉
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setShowResults(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // 搜索地址
  const handleSearch = async () => {
    const query = (value || '').trim();
    if (!query || query.length < 2) return;

    setSearching(true);
    setShowResults(true);
    try {
      const searchResults = await searchAddress(query, { limit: 5 });
      setResults(searchResults);
    } catch (err) {
      console.error('Geo search failed:', err);
      setResults([]);
    } finally {
      setSearching(false);
    }
  };

  // 选择结果
  const handleSelectResult = (result) => {
    // 构建 detail 从 road + houseNumber
    const detailParts = [result.road, result.houseNumber].filter(Boolean);
    const detail = detailParts.length > 0 ? detailParts.join(' ') : '';

    onSelect && onSelect({
      latitude: result.latitude,
      longitude: result.longitude,
      country: result.country,
      city: result.city,
      displayName: result.displayName,
      detail: detail || result.displayName
    });

    setShowResults(false);
    setResults([]);
  };

  // 键盘事件
  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleSearch();
    } else if (e.key === 'Escape') {
      setShowResults(false);
    }
  };

  return (
    <div ref={containerRef} style={{ position: 'relative', ...style }}>
      <div style={{ display: 'flex', gap: 4 }}>
        <input
          type="text"
          className={`fg-input ${className}`}
          value={value}
          onChange={e => onChange && onChange(e.target.value)}
          onKeyDown={handleKeyDown}
          onFocus={() => results.length > 0 && setShowResults(true)}
          placeholder={placeholder}
          disabled={disabled}
          style={{ flex: 1 }}
        />
        <button
          type="button"
          className="fg-btn fg-btn-secondary"
          onClick={handleSearch}
          disabled={disabled || searching || !(value || '').trim()}
          title="Search GPS coordinates"
          style={{ 
            padding: '0 10px', 
            minWidth: 38,
            opacity: disabled || searching || !(value || '').trim() ? 0.5 : 1,
            cursor: disabled || searching || !(value || '').trim() ? 'not-allowed' : 'pointer'
          }}
        >
          {searching ? '⏳' : '🔍'}
        </button>
      </div>

      {/* 搜索结果下拉 */}
      {showResults && results.length > 0 && (
        <div style={{
          position: 'absolute',
          top: '100%',
          left: 0,
          right: 0,
          background: '#fff',
          borderRadius: 8,
          boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
          zIndex: 100,
          maxHeight: 200,
          overflowY: 'auto',
          marginTop: 4
        }}>
          {results.map((r, idx) => (
            <div
              key={idx}
              onClick={() => handleSelectResult(r)}
              style={{
                padding: '10px 12px',
                cursor: 'pointer',
                borderBottom: idx < results.length - 1 ? '1px solid #e5e7eb' : 'none',
                fontSize: 13,
                color: '#1f2937'
              }}
              onMouseEnter={e => e.currentTarget.style.background = '#f3f4f6'}
              onMouseLeave={e => e.currentTarget.style.background = '#fff'}
            >
              <div style={{ fontWeight: 500 }}>
                {r.city || r.state || 'Unknown'}{r.country ? `, ${r.country}` : ''}
              </div>
              <div style={{ fontSize: 11, color: '#6b7280', marginTop: 2, lineHeight: 1.3 }}>
                {r.displayName.length > 80 ? r.displayName.substring(0, 80) + '...' : r.displayName}
              </div>
              <div style={{ fontSize: 10, color: '#9ca3af', marginTop: 2 }}>
                📍 {r.latitude.toFixed(6)}, {r.longitude.toFixed(6)}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* 无结果提示 */}
      {showResults && results.length === 0 && !searching && (
        <div style={{
          position: 'absolute',
          top: '100%',
          left: 0,
          right: 0,
          background: '#fff',
          borderRadius: 8,
          boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
          zIndex: 100,
          marginTop: 4,
          padding: '12px 14px',
          fontSize: 13,
          color: '#6b7280',
          textAlign: 'center'
        }}>
          No results found. Try a different search term.
        </div>
      )}
    </div>
  );
}
