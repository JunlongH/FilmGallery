import React from 'react';
import SliderControl from './SliderControl';
import ToneCurveEditor from './ToneCurveEditor';

export default function FilmLabControls({
  inverted, setInverted,
  useGPU, setUseGPU,
  inversionMode, setInversionMode,
  isPickingBase, setIsPickingBase,
  handleAutoBase,
  isPickingWB, setIsPickingWB,
  handleAutoColor,
  handleUndo, handleRedo, handleReset,
  history, future,
  handleAutoLevels,
  isCropping, setIsCropping,
  keepRatio, setKeepRatio,
  rotation, setRotation,
  setOrientation,
  exposure, setExposure,
  contrast, setContrast,
  highlights, setHighlights,
  shadows, setShadows,
  whites, setWhites,
  blacks, setBlacks,
  temp, setTemp,
  tint, setTint,
  curves, setCurves,
  activeChannel, setActiveChannel,
  isPicking, setIsPicking,
  pickedColor,
  histograms,
  pushToHistory,
  lut1, setLut1,
  lut2, setLut2,
  lutExportSize, setLutExportSize,
  generateOutputLUT,
  handleLutUpload,
  compareCpuGpu,
  handleDownload, handleSave, onClose
}) {
  return (
    <div className="iv-sidebar iv-scroll" style={{ width: 320, background: '#1e1e1e', padding: 24, color: '#eee', display: 'flex', flexDirection: 'column', gap: 20, overflowY: 'auto', borderLeft: '1px solid #333', boxShadow: '-5px 0 15px rgba(0,0,0,0.5)' }}>
      {/* Debug: Compare CPU/GPU */}
      <button className="iv-btn" style={{ marginBottom: 10, background: '#444', color: '#fff' }} onClick={compareCpuGpu}>Compare CPU vs GPU</button>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h3 style={{ margin: 0, color: '#fff', fontSize: 18, fontWeight: 600, letterSpacing: 0.5 }}>Film Lab</h3>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="iv-btn" onClick={handleDownload} style={{ padding: '4px 12px' }}>SAVE AS</button>
          <button className="iv-btn iv-btn-primary" onClick={handleSave} style={{ padding: '4px 12px' }}>SAVE</button>
          <button className="iv-btn-icon" onClick={onClose} style={{ fontSize: 20 }}>×</button>
        </div>
      </div>
      
      <div style={{ background: '#252525', padding: 10, borderRadius: 6, display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <input 
              type="checkbox" 
              checked={inverted} 
              onChange={e => { pushToHistory(); setInverted(e.target.checked); }} 
              id="chk-invert"
            />
            <label htmlFor="chk-invert" style={{ fontWeight: 500, fontSize: 13, cursor: 'pointer' }}>Invert Negative</label>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <input
              type="checkbox"
              id="chk-gpu"
              checked={useGPU}
              onChange={e => setUseGPU(e.target.checked)}
            />
            <label htmlFor="chk-gpu" style={{ fontSize: 12, color: '#ccc', cursor: 'pointer' }}>Use GPU (WebGL)</label>
          </div>
          {inverted && (
            <div style={{ display: 'flex', gap: 4, background: '#111', padding: 2, borderRadius: 4 }}>
              <button 
                onClick={() => { pushToHistory(); setInversionMode('linear'); }}
                style={{ 
                  fontSize: 10, padding: '2px 6px', border: 'none', borderRadius: 2, cursor: 'pointer',
                  background: inversionMode === 'linear' ? '#444' : 'transparent', color: inversionMode === 'linear' ? '#fff' : '#666'
                }}
              >LIN</button>
              <button 
                onClick={() => { pushToHistory(); setInversionMode('log'); }}
                style={{ 
                  fontSize: 10, padding: '2px 6px', border: 'none', borderRadius: 2, cursor: 'pointer',
                  background: inversionMode === 'log' ? '#444' : 'transparent', color: inversionMode === 'log' ? '#fff' : '#666'
                }}
              >LOG</button>
            </div>
          )}
        </div>
        
        {/* Base Correction Tools */}
        <div style={{ marginBottom: 8 }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: '#aaa', marginBottom: 4 }}>FILM BASE</div>
          <div style={{ display: 'flex', gap: 4 }}>
            <button 
              className="iv-btn"
              onClick={() => setIsPickingBase(!isPickingBase)}
              style={{ 
                flex: 1,
                background: isPickingBase ? '#e65100' : '#333', 
                borderColor: isPickingBase ? '#ef6c00' : '#444',
                color: isPickingBase ? '#fff' : '#eee',
                fontSize: 11
              }}
            >
              {isPickingBase ? 'PICKING...' : 'PICK (MANUAL)'}
            </button>
            <button 
              className="iv-btn"
              onClick={handleAutoBase}
              style={{ flex: 1, fontSize: 11 }}
            >
              AUTO DETECT
            </button>
          </div>
        </div>

        {/* WB Tools */}
        <div style={{ marginBottom: 8 }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: '#aaa', marginBottom: 4 }}>WHITE BALANCE</div>
          <div style={{ display: 'flex', gap: 4 }}>
            <button 
              className="iv-btn"
              onClick={() => setIsPickingWB(!isPickingWB)}
              style={{ 
                flex: 1,
                background: isPickingWB ? '#e65100' : '#333', 
                borderColor: isPickingWB ? '#ef6c00' : '#444',
                color: isPickingWB ? '#fff' : '#eee',
                fontSize: 11
              }}
            >
              {isPickingWB ? 'PICKING...' : 'PICK (MANUAL)'}
            </button>
            <button 
              className="iv-btn"
              onClick={handleAutoColor}
              style={{ flex: 1, fontSize: 11 }}
            >
              AUTO WB
            </button>
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
        <button className="iv-btn" onClick={handleUndo} disabled={history.length === 0} style={{ flex: 1 }}>Undo</button>
        <button className="iv-btn" onClick={handleRedo} disabled={future.length === 0} style={{ flex: 1 }}>Redo</button>
        <button className="iv-btn iv-btn-danger" onClick={handleReset} style={{ flex: 1 }}>Reset</button>
      </div>

      <div style={{ display: 'flex', gap: 8 }}>
        <button className="iv-btn iv-btn-primary" onClick={handleAutoLevels} style={{ flex: 1, padding: '8px 0', fontWeight: 600, fontSize: 11 }}>AUTO LEVELS</button>
      </div>

      <div style={{ borderTop: '1px solid #333', paddingTop: 20 }}>
         <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
           <label className="iv-control-label" style={{ fontSize: 12, color: '#eee' }}>CROP & ROTATE</label>
           <button 
             className={`iv-btn ${isCropping ? 'iv-btn-primary' : ''}`}
             onClick={() => setIsCropping(!isCropping)}
             style={{ padding: '4px 12px', fontSize: 11 }}
           >
             {isCropping ? 'DONE' : 'CROP'}
           </button>
         </div>
         
         {isCropping && (
           <div style={{ marginBottom: 12, background: '#252525', padding: 8, borderRadius: 4 }}>
             <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, cursor: 'pointer', marginBottom: 8 }}>
               <input type="checkbox" checked={keepRatio} onChange={e => setKeepRatio(e.target.checked)} />
               Keep Original Ratio
             </label>
             <SliderControl 
               label="ROTATION" 
               value={rotation} 
               min={-45} max={45} 
               step={0.1}
               onChange={setRotation} 
               onMouseDown={pushToHistory}
               suffix="°"
             />
           </div>
         )}
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
        <button className="iv-btn" onClick={() => { pushToHistory(); setOrientation(r => r - 90); }} style={{ flex: 1, fontSize: 11 }}>↺ Rotate Left</button>
        <button className="iv-btn" onClick={() => { pushToHistory(); setOrientation(r => r + 90); }} style={{ flex: 1, fontSize: 11 }}>↻ Rotate Right</button>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <SliderControl label="EXPOSURE" value={exposure} onChange={setExposure} onMouseDown={pushToHistory} min={-100} max={100} step={1} />
        <SliderControl label="CONTRAST" value={contrast} onChange={setContrast} onMouseDown={pushToHistory} min={-100} max={100} step={1} />
      </div>
      
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <SliderControl label="HIGHLIGHTS" value={highlights} onChange={setHighlights} onMouseDown={pushToHistory} min={-100} max={100} step={1} />
        <SliderControl label="SHADOWS" value={shadows} onChange={setShadows} onMouseDown={pushToHistory} min={-100} max={100} step={1} />
        <SliderControl label="WHITES" value={whites} onChange={setWhites} onMouseDown={pushToHistory} min={-100} max={100} step={1} />
        <SliderControl label="BLACKS" value={blacks} onChange={setBlacks} onMouseDown={pushToHistory} min={-100} max={100} step={1} />
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <SliderControl label="TEMPERATURE" value={temp} onChange={setTemp} onMouseDown={pushToHistory} min={-100} max={100} step={1} />
        <SliderControl label="TINT" value={tint} onChange={setTint} onMouseDown={pushToHistory} min={-100} max={100} step={1} />
      </div>

      {/* Curve Editor UI */}
      <div style={{ background: '#111', padding: 12, borderRadius: 6, border: '1px solid #333' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <label className="iv-control-label">TONE CURVE</label>
          <button 
             className="iv-btn"
             onClick={() => setIsPicking(!isPicking)}
             style={{ 
               background: isPicking ? '#2e7d32' : 'transparent', 
               border: isPicking ? '1px solid #1b5e20' : '1px solid #444',
               color: isPicking ? '#fff' : '#888', 
               fontSize: 10, 
               padding: '2px 8px', 
               borderRadius: 3,
             }}
           >
             {isPicking ? 'PICKING...' : 'PICK POINT'}
           </button>
        </div>
        
        <ToneCurveEditor
          curves={curves}
          setCurves={setCurves}
          activeChannel={activeChannel}
          setActiveChannel={setActiveChannel}
          isPicking={isPicking}
          setIsPicking={setIsPicking}
          pickedColor={pickedColor}
          histograms={histograms}
          pushToHistory={pushToHistory}
        />
      </div>

      {/* LUTs Section */}
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
            <button className="iv-btn" onClick={generateOutputLUT} style={{ fontSize: 10, padding: '2px 8px' }}>EXPORT</button>
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
              <button className="iv-btn iv-btn-danger" onClick={() => { pushToHistory(); setLut1(null); }} style={{ fontSize: 10, padding: '2px 8px' }}>REMOVE</button>
            )}
          </div>
          {lut1 && (
            <>
              <div style={{ fontSize: 10, color: '#888', marginBottom: 4, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{lut1.name}</div>
              <SliderControl 
                label="OPACITY" 
                value={lut1.intensity} 
                min={0} max={1} step={0.05} 
                onChange={(v) => setLut1(prev => ({ ...prev, intensity: v }))} 
                onMouseDown={pushToHistory}
              />
            </>
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
              <button className="iv-btn iv-btn-danger" onClick={() => { pushToHistory(); setLut2(null); }} style={{ fontSize: 10, padding: '2px 8px' }}>REMOVE</button>
            )}
          </div>
          {lut2 && (
            <>
              <div style={{ fontSize: 10, color: '#888', marginBottom: 4, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{lut2.name}</div>
              <SliderControl 
                label="OPACITY" 
                value={lut2.intensity} 
                min={0} max={1} step={0.05} 
                onChange={(v) => setLut2(prev => ({ ...prev, intensity: v }))} 
                onMouseDown={pushToHistory}
              />
            </>
          )}
        </div>
      </div>
    </div>
  );
}