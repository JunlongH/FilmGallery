import React, { useCallback, useEffect, useRef } from 'react';

const SliderControl = ({ label, value, onChange, min, max, step=1, onMouseDown, onMouseUp, suffix='', displayFormatter }) => {
  const isDraggingRef = useRef(false);
  
  const handleMinus = () => {
    onMouseDown && onMouseDown();
    onChange(Math.max(min, Number((value - step).toFixed(2))));
    // Important: Call onMouseUp after the change for +/- button clicks
    onMouseUp && onMouseUp();
  };
  const handlePlus = () => {
    onMouseDown && onMouseDown();
    onChange(Math.min(max, Number((value + step).toFixed(2))));
    // Important: Call onMouseUp after the change for +/- button clicks
    onMouseUp && onMouseUp();
  };

  // Handle mouse down - start tracking
  const handleMouseDown = useCallback((e) => {
    isDraggingRef.current = true;
    onMouseDown && onMouseDown();
  }, [onMouseDown]);

  // Global mouseup handler to ensure onMouseUp is called even when mouse is released outside slider
  useEffect(() => {
    const handleGlobalMouseUp = () => {
      if (isDraggingRef.current) {
        isDraggingRef.current = false;
        onMouseUp && onMouseUp();
      }
    };
    
    window.addEventListener('mouseup', handleGlobalMouseUp);
    window.addEventListener('touchend', handleGlobalMouseUp);
    
    return () => {
      window.removeEventListener('mouseup', handleGlobalMouseUp);
      window.removeEventListener('touchend', handleGlobalMouseUp);
    };
  }, [onMouseUp]);

  return (
    <div className="control-group" style={{ marginBottom: 12, display: 'flex', alignItems: 'center', gap: 12 }}>
      <label className="iv-control-label" style={{ width: 90, flexShrink: 0 }}>{label}</label>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1 }}>
        <span style={{ fontSize: 11, color: '#ccc', fontFamily: 'monospace', minWidth: 32, textAlign: 'right' }}>{displayFormatter ? displayFormatter(value) : value}{suffix}</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, flex: 1 }}>
          <button className="iv-btn-icon" onClick={handleMinus}>−</button>
          <input 
            type="range" 
            min={min} 
            max={max} 
            step={step}
            value={value} 
            onMouseDown={handleMouseDown}
            onTouchStart={handleMouseDown}
            onChange={e => onChange(Number(e.target.value))} 
            style={{ flex: 1, margin: '0 4px' }}
          />
          <button className="iv-btn-icon" onClick={handlePlus}>+</button>
        </div>
      </div>
    </div>
  );
};

export default SliderControl;
