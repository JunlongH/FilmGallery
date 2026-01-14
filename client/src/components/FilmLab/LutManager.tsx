import React from 'react';
import { parseCubeLUT } from './utils';
import SliderControl from './SliderControl';

export default function LutManager({
  lut1, setLut1,
  lut2, setLut2,
  lutExportSize, setLutExportSize,
  onExport,
  pushToHistory
}) {

  const handleLutUpload = (e, index) => {
    const file = e.target.files[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target.result;
      const parsed = parseCubeLUT(text);
      const lutObj = { name: file.name, ...parsed, intensity: 1.0 };
      
      pushToHistory();
      if (index === 1) setLut1(lutObj);
      else setLut2(lutObj);
    };
    reader.readAsText(file);
  };

  return (
    <div style={{ borderTop: '1px solid #333', paddingTop: 20 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <label className="iv-control-label" style={{ fontSize: 12, color: '#eee' }}>LUTs</label>
        <div style={{ display: 'flex', gap: 4 }}>
          <select 
            value={lutExportSize} 
            onChange={(e) => setLutExportSize(Number(e.target.value))}
            style={{ 
              background: '#333', 
              color: '#eee', 
              border: '1px solid #444', 
              fontSize: 10, 
              borderRadius: 3,
              padding: '2px 4px'
            }}
          >
            <option value={33}>33 Point</option>
            <option value={65}>65 Point</option>
          </select>
          <button className="iv-btn" onClick={onExport} style={{ fontSize: 10, padding: '2px 8px' }}>EXPORT</button>
        </div>
      </div>

      {/* LUT 1 */}
      <div style={{ marginBottom: 12, background: '#252525', padding: 8, borderRadius: 4 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <span style={{ fontSize: 11, fontWeight: 600, color: '#aaa' }}>LUT 1</span>
          {!lut1 ? (
            <label className="iv-btn" style={{ fontSize: 10, padding: '2px 8px', cursor: 'pointer' }}>
              LOAD
              <input type="file" accept=".cube" style={{ display: 'none' }} onChange={(e) => handleLutUpload(e, 1)} />
            </label>
          ) : (
            <div style={{ display: 'flex', gap: 4 }}>
              <span style={{ fontSize: 10, color: '#eee', maxWidth: 100, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{lut1.name}</span>
              <button className="iv-btn-icon" onClick={() => { pushToHistory(); setLut1(null); }}>×</button>
            </div>
          )}
        </div>
        {lut1 && (
          <SliderControl 
            label="INTENSITY" 
            value={lut1.intensity} 
            min={0} max={1} step={0.01}
            onChange={(v) => setLut1(prev => ({ ...prev, intensity: v }))}
            onMouseDown={pushToHistory}
          />
        )}
      </div>

      {/* LUT 2 */}
      <div style={{ marginBottom: 12, background: '#252525', padding: 8, borderRadius: 4 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <span style={{ fontSize: 11, fontWeight: 600, color: '#aaa' }}>LUT 2</span>
          {!lut2 ? (
            <label className="iv-btn" style={{ fontSize: 10, padding: '2px 8px', cursor: 'pointer' }}>
              LOAD
              <input type="file" accept=".cube" style={{ display: 'none' }} onChange={(e) => handleLutUpload(e, 2)} />
            </label>
          ) : (
            <div style={{ display: 'flex', gap: 4 }}>
              <span style={{ fontSize: 10, color: '#eee', maxWidth: 100, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{lut2.name}</span>
              <button className="iv-btn-icon" onClick={() => { pushToHistory(); setLut2(null); }}>×</button>
            </div>
          )}
        </div>
        {lut2 && (
          <SliderControl 
            label="INTENSITY" 
            value={lut2.intensity} 
            min={0} max={1} step={0.01}
            onChange={(v) => setLut2(prev => ({ ...prev, intensity: v }))}
            onMouseDown={pushToHistory}
          />
        )}
      </div>
    </div>
  );
}