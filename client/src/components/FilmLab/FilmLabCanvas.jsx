import React from 'react';

export default function FilmLabCanvas({
  canvasRef,
  origCanvasRef,
  zoom, setZoom,
  pan, setPan,
  isPanning,
  handleWheel,
  handlePanStart,
  isCropping,
  rotation, setRotation,
  pushToHistory,
  handleCanvasClick,
  isPicking,
  cropRect,
  startCropDrag,
  compareMode,
  compareSlider,
  setCompareSlider
}) {
  const handleSplitDrag = (e) => {
    if (compareMode !== 'split') return;
    const wrapper = e.currentTarget.parentElement;
    const rect = wrapper.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const ratio = Math.min(1, Math.max(0, x / rect.width));
    setCompareSlider(ratio);
  };

  const handleBarMouseDown = (e) => {
    e.preventDefault();
    const move = (ev) => handleSplitDrag(ev);
    const up = () => {
      window.removeEventListener('mousemove', move);
      window.removeEventListener('mouseup', up);
    };
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
  };

  return (
    <div 
      style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', padding: 20, background: '#000', cursor: isPanning ? 'grabbing' : 'grab', position: 'relative' }}
      onWheel={handleWheel}
      onMouseDown={handlePanStart}
    >
      {/* Zoom Controls */}
      <div style={{ position: 'absolute', bottom: 20, left: 20, display: 'flex', gap: 8, zIndex: 100 }}>
        <button className="iv-btn" onClick={() => { setZoom(1); setPan({x:0,y:0}); }}>Fit</button>
        <button className="iv-btn" onClick={() => setZoom(z => Math.max(0.1, z / 1.2))}>-</button>
        <span style={{ background: '#333', padding: '6px 10px', borderRadius: 4, fontSize: 12, minWidth: 40, textAlign: 'center' }}>{Math.round(zoom * 100)}%</span>
        <button className="iv-btn" onClick={() => setZoom(z => Math.min(10, z * 1.2))}>+</button>
      </div>

      {/* Sensitive Rotation Slider (Only when cropping) */}
      {isCropping && (
        <div style={{ position: 'absolute', bottom: 20, left: '50%', transform: 'translateX(-50%)', width: 300, zIndex: 100, background: 'rgba(0,0,0,0.6)', padding: '8px 16px', borderRadius: 20, display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 10, color: '#aaa', whiteSpace: 'nowrap' }}>-45°</span>
          <input 
            type="range" 
            min={-45} 
            max={45} 
            step={0.1} 
            value={rotation} 
            onChange={e => setRotation(Number(e.target.value))}
            onMouseDown={pushToHistory}
            style={{ width: '100%', cursor: 'ew-resize' }}
          />
          <span style={{ fontSize: 10, color: '#aaa', whiteSpace: 'nowrap' }}>+45°</span>
          <div style={{ position: 'absolute', top: -25, left: '50%', transform: 'translateX(-50%)', background: '#333', padding: '2px 6px', borderRadius: 4, fontSize: 11 }}>
            {rotation.toFixed(1)}°
          </div>
        </div>
      )}

      <div style={{ 
        position: 'relative', 
        display: 'inline-block', 
        boxShadow: '0 0 30px rgba(0,0,0,0.8)',
        transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
        transformOrigin: 'center',
        transition: isPanning ? 'none' : 'transform 0.1s ease-out'
      }}>
        {/* Processed Canvas */}
        <canvas 
          ref={canvasRef} 
          onClick={handleCanvasClick}
          style={{ 
            display: 'block', 
            maxWidth: '100%', 
            maxHeight: 'calc(100vh - 40px)', 
            objectFit: 'contain',
            cursor: isPicking ? 'crosshair' : 'default',
            opacity: compareMode === 'original' ? 0 : 1,
          }} 
        />

        {/* Original Canvas for compare */}
        {(compareMode === 'original' || compareMode === 'split') && (
          <div style={{
            pointerEvents: compareMode === 'split' ? 'none' : 'auto',
            position: 'absolute',
            top: 0,
            left: 0,
            width: compareMode === 'split' ? `${compareSlider * 100}%` : '100%',
            height: '100%',
            overflow: 'hidden'
          }}>
            <canvas
              ref={origCanvasRef}
              style={{
                display: 'block',
                maxWidth: '100%',
                maxHeight: 'calc(100vh - 40px)',
                objectFit: 'contain',
              }}
            />
          </div>
        )}

        {/* Split Bar */}
        {compareMode === 'split' && (
          <div
            onMouseDown={handleBarMouseDown}
            style={{
              position: 'absolute',
              top: 0,
              left: `${compareSlider * 100}%`,
              height: '100%',
              width: 3,
              background: 'rgba(255,255,255,0.6)',
              cursor: 'ew-resize',
              boxShadow: '0 0 4px rgba(0,0,0,0.6)'
            }}
          />
        )}
        {isCropping && (
          <div 
            className="crop-overlay"
            style={{
              position: 'absolute',
              top: 0, left: 0, width: '100%', height: '100%',
              cursor: 'crosshair'
            }}
            onMouseDown={(e) => startCropDrag(e, 'new', null)}
          >
            {/* Darken outside */}
            <div style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: `${cropRect.y * 100}%`, background: 'rgba(0,0,0,0.5)' }} />
            <div style={{ position: 'absolute', bottom: 0, left: 0, width: '100%', height: `${(1 - (cropRect.y + cropRect.h)) * 100}%`, background: 'rgba(0,0,0,0.5)' }} />
            <div style={{ position: 'absolute', top: `${cropRect.y * 100}%`, left: 0, width: `${cropRect.x * 100}%`, height: `${cropRect.h * 100}%`, background: 'rgba(0,0,0,0.5)' }} />
            <div style={{ position: 'absolute', top: `${cropRect.y * 100}%`, right: 0, width: `${(1 - (cropRect.x + cropRect.w)) * 100}%`, height: `${cropRect.h * 100}%`, background: 'rgba(0,0,0,0.5)' }} />

            {/* Crop Box */}
            <div 
              style={{
                position: 'absolute',
                left: `${cropRect.x * 100}%`,
                top: `${cropRect.y * 100}%`,
                width: `${cropRect.w * 100}%`,
                height: `${cropRect.h * 100}%`,
                border: '1px solid rgba(255,255,255,0.8)',
                boxShadow: '0 0 0 1px rgba(0,0,0,0.5)',
                cursor: 'move'
              }}
              onMouseDown={(e) => startCropDrag(e, 'move', null)}
            >
              {/* Handles */}
              {['nw', 'ne', 'sw', 'se'].map(h => (
                <div
                  key={h}
                  onMouseDown={(e) => startCropDrag(e, 'resize', h)}
                  style={{
                    position: 'absolute',
                    width: 10, height: 10,
                    background: '#fff',
                    border: '1px solid #000',
                    top: h.includes('n') ? -5 : undefined,
                    bottom: h.includes('s') ? -5 : undefined,
                    left: h.includes('w') ? -5 : undefined,
                    right: h.includes('e') ? -5 : undefined,
                    cursor: `${h}-resize`
                  }}
                />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}