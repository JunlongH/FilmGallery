import React, { useState, useRef, useEffect } from 'react';
import { createSpline } from './utils';

export default function ToneCurveEditor({
  curves,
  setCurves,
  activeChannel,
  setActiveChannel,
  isPicking,
  setIsPicking,
  pickedColor,
  histograms,
  pushToHistory
}) {
  const curveContainerRef = useRef(null);
  const [draggingPointIndex, setDraggingPointIndex] = useState(null);
  
  const curveWidth = 260;
  const curveHeight = 150;

  // Generate Histogram Path
  const getHistogramPath = () => {
    const currentHist = histograms[activeChannel];
    let histD = `M 0 ${curveHeight}`;
    for (let i = 0; i < 256; i++) {
      const h = currentHist[i] * curveHeight; // Normalized 0-1
      const x = (i / 255) * curveWidth;
      const y = curveHeight - h;
      histD += ` L ${x} ${y}`;
    }
    histD += ` L ${curveWidth} ${curveHeight} Z`;
    return histD;
  };

  const getCurveColor = () => {
    switch(activeChannel) {
      case 'red': return '#ff4444';
      case 'green': return '#44ff44';
      case 'blue': return '#4444ff';
      default: return '#eee';
    }
  };

  const getHistogramColor = () => {
    switch(activeChannel) {
      case 'red': return 'rgba(255, 68, 68, 0.3)';
      case 'green': return 'rgba(68, 255, 68, 0.3)';
      case 'blue': return 'rgba(68, 68, 255, 0.3)';
      default: return 'rgba(200, 200, 200, 0.3)';
    }
  };

  // Generate path string using spline
  const getCurvePath = () => {
    const currentPoints = curves[activeChannel];
    const sortedPoints = [...currentPoints].sort((a, b) => a.x - b.x);
    let d = '';
    if (sortedPoints.length >= 2) {
      const xs = sortedPoints.map(p => p.x);
      const ys = sortedPoints.map(p => p.y);
      const spline = createSpline(xs, ys);
      
      d = `M 0 ${curveHeight - (spline(0) / 255) * curveHeight}`;
      for (let i = 1; i <= curveWidth; i++) {
        const xVal = (i / curveWidth) * 255;
        const yVal = spline(xVal);
        const y = curveHeight - (yVal / 255) * curveHeight;
        d += ` L ${i} ${y}`;
      }
    } else {
      d = `M 0 ${curveHeight} L ${curveWidth} 0`;
    }
    return d;
  };

  const handleAddPoint = (e) => {
    // Only add if clicking on background (not dragging a point)
    if (e.target !== curveContainerRef.current && e.target.tagName !== 'svg') return; 
    
    pushToHistory();

    const rect = curveContainerRef.current.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width * 255;
    const y = 255 - (e.clientY - rect.top) / rect.height * 255;
    
    const newPoint = { x, y };
    const currentPoints = curves[activeChannel];
    const newPoints = [...currentPoints, newPoint].sort((a, b) => a.x - b.x);
    setCurves(prev => ({ ...prev, [activeChannel]: newPoints }));
  };

  const handleRemovePoint = (index, e) => {
    e.preventDefault();
    e.stopPropagation();
    
    const currentPoints = curves[activeChannel];
    // Don't remove endpoints
    if (index === 0 || index === currentPoints.length - 1) return;
    
    pushToHistory();

    const newPoints = currentPoints.filter((_, i) => i !== index);
    setCurves(prev => ({ ...prev, [activeChannel]: newPoints }));
  };

  useEffect(() => {
    if (draggingPointIndex === null) return;

    const handleMouseMove = (e) => {
      if (!curveContainerRef.current) return;
      const rect = curveContainerRef.current.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;

      // Invert Y because canvas 0 is top
      // Use rect.height/width for accurate mapping regardless of display size
      const valY = 255 - (y / rect.height) * 255;
      const valX = (x / rect.width) * 255;

      setCurves(prevCurves => {
        const currentPoints = prevCurves[activeChannel];
        const newPoints = [...currentPoints];
        const index = draggingPointIndex;
        
        // Constrain X to be between neighbors
        let minX = 0, maxX = 255;
        if (index > 0) minX = newPoints[index-1].x + 1;
        if (index < newPoints.length - 1) maxX = newPoints[index+1].x - 1;
        
        newPoints[index] = { 
          x: Math.min(maxX, Math.max(minX, valX)), 
          y: Math.min(255, Math.max(0, valY)) 
        };
        
        return { ...prevCurves, [activeChannel]: newPoints };
      });
    };

    const handleMouseUp = () => {
      setDraggingPointIndex(null);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [draggingPointIndex, activeChannel, setCurves]);

  return (
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
      
      {/* Channel Tabs */}
      <div style={{ display: 'flex', marginBottom: 12, gap: 4, background: '#222', padding: 2, borderRadius: 4 }}>
        {['rgb', 'red', 'green', 'blue'].map(ch => (
          <button
            key={ch}
            onClick={() => setActiveChannel(ch)}
            style={{
              flex: 1,
              padding: '4px 0',
              fontSize: 10,
              fontWeight: 600,
              background: activeChannel === ch ? '#444' : 'transparent',
              color: ch === 'rgb' ? '#fff' : ch === 'red' ? '#ff8888' : ch === 'green' ? '#88ff88' : '#8888ff',
              border: 'none',
              borderRadius: 2,
              cursor: 'pointer',
              transition: 'all 0.2s'
            }}
          >
            {ch.toUpperCase()}
          </button>
        ))}
      </div>

      <div 
        ref={curveContainerRef}
        style={{ position: 'relative', width: '100%', height: 150, border: '1px solid #333', background: '#000', cursor: 'crosshair', borderRadius: 2 }}
        onMouseDown={handleAddPoint}
      >
        {/* Histogram Background */}
        <svg width="100%" height="100%" viewBox={`0 0 ${curveWidth} ${curveHeight}`} preserveAspectRatio="none" style={{ position: 'absolute', top: 0, left: 0, pointerEvents: 'none' }}>
          <path d={getHistogramPath()} fill={getHistogramColor()} stroke="none" />
        </svg>

        {/* Grid lines */}
        <div style={{ position: 'absolute', top: '25%', left: 0, right: 0, height: 1, background: '#222', pointerEvents: 'none' }} />
        <div style={{ position: 'absolute', top: '50%', left: 0, right: 0, height: 1, background: '#222', pointerEvents: 'none' }} />
        <div style={{ position: 'absolute', top: '75%', left: 0, right: 0, height: 1, background: '#222', pointerEvents: 'none' }} />
        <div style={{ position: 'absolute', left: '25%', top: 0, bottom: 0, width: 1, background: '#222', pointerEvents: 'none' }} />
        <div style={{ position: 'absolute', left: '50%', top: 0, bottom: 0, width: 1, background: '#222', pointerEvents: 'none' }} />
        <div style={{ position: 'absolute', left: '75%', top: 0, bottom: 0, width: 1, background: '#222', pointerEvents: 'none' }} />

        {/* Picked Color Indicator */}
        {pickedColor && (
          <svg width="100%" height="100%" viewBox={`0 0 ${curveWidth} ${curveHeight}`} preserveAspectRatio="none" style={{ position: 'absolute', top: 0, left: 0, pointerEvents: 'none' }}>
            {activeChannel === 'rgb' ? (
              <>
                <line x1={pickedColor.r / 255 * curveWidth} y1={0} x2={pickedColor.r / 255 * curveWidth} y2={curveHeight} stroke="#ff4444" strokeWidth="1" strokeDasharray="3,3" opacity="0.7" />
                <line x1={pickedColor.g / 255 * curveWidth} y1={0} x2={pickedColor.g / 255 * curveWidth} y2={curveHeight} stroke="#44ff44" strokeWidth="1" strokeDasharray="3,3" opacity="0.7" />
                <line x1={pickedColor.b / 255 * curveWidth} y1={0} x2={pickedColor.b / 255 * curveWidth} y2={curveHeight} stroke="#4444ff" strokeWidth="1" strokeDasharray="3,3" opacity="0.7" />
              </>
            ) : (
              <line 
                x1={pickedColor[activeChannel === 'red' ? 'r' : activeChannel === 'green' ? 'g' : 'b'] / 255 * curveWidth} 
                y1={0} 
                x2={pickedColor[activeChannel === 'red' ? 'r' : activeChannel === 'green' ? 'g' : 'b'] / 255 * curveWidth} 
                y2={curveHeight} 
                stroke={activeChannel === 'red' ? '#ff4444' : activeChannel === 'green' ? '#44ff44' : '#4444ff'} 
                strokeWidth="1" 
                strokeDasharray="3,3" 
              />
            )}
          </svg>
        )}

        <svg width="100%" height="100%" viewBox={`0 0 ${curveWidth} ${curveHeight}`} preserveAspectRatio="none" style={{ position: 'absolute', top: 0, left: 0, pointerEvents: 'none' }}>
          <path d={getCurvePath()} stroke={getCurveColor()} strokeWidth="2" fill="none" />
        </svg>
        
        {/* Control Points */}
        {curves[activeChannel].map((p, i) => (
          <div
            key={i}
            onMouseDown={(e) => {
              e.stopPropagation();
              e.preventDefault(); // Prevent text selection
              pushToHistory(); // Save state before dragging
              setDraggingPointIndex(i);
            }}
            onContextMenu={(e) => handleRemovePoint(i, e)}
            title={i === 0 || i === curves[activeChannel].length - 1 ? "Endpoint" : "Right-click to remove"}
            style={{
              position: 'absolute',
              left: (p.x / 255) * 100 + '%',
              top: (1 - p.y / 255) * 100 + '%',
              width: 8,
              height: 8,
              marginLeft: -4,
              marginTop: -4,
              borderRadius: '50%',
              background: '#fff',
              border: `2px solid ${getCurveColor()}`,
              cursor: 'move',
              zIndex: 10,
              boxShadow: '0 0 4px rgba(0,0,0,0.5)'
            }}
          />
        ))}
      </div>
      <div style={{ fontSize: 10, color: '#555', marginTop: 6, textAlign: 'center' }}>
        Left-click to add/move • Right-click to remove
      </div>
    </div>
  );
}