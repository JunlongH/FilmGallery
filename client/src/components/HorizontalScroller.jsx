import React, { useRef, useEffect, useCallback, useLayoutEffect, useMemo } from 'react';

function HorizontalScroller({ children, height = 260, padding = 12, gap = 16, background = 'transparent', style, loop = true, showEdges = true }) {
  const containerRef = useRef(null);
  const contentRef = useRef(null);
  
  // Physics state stored in ref to avoid re-renders during animation
  const physics = useRef({
    pos: 0,       // Current scroll position
    target: 0,    // Target position (for smooth wheel/keys)
    vel: 0,       // Current velocity
    isDragging: false,
    startX: 0,
    lastX: 0,
    lastTime: 0,
    segmentWidth: 0,
    amplitude: 0, // For inertial scrolling
    timestamp: 0
  });

  const rafRef = useRef(null);
  const uid = useMemo(() => `hs-${Math.random().toString(36).slice(2)}`, []);
  const childCount = useMemo(() => React.Children.count(children), [children]);
  const shouldLoop = loop && childCount >= 4;

  // --- Physics Engine ---
  const update = useCallback(() => {
    const state = physics.current;
    const el = containerRef.current;
    const content = contentRef.current;
    
    if (!el || !content) return;

    // 1. Apply Velocity or Inertia
    if (state.isDragging) {
      // Velocity is calculated in pointerMove
      // Position is updated in pointerMove directly for 1:1 feel
    } else {
      // Apply friction to velocity
      state.vel *= 0.92; // Friction coefficient (0.92 = smooth, 0.85 = tight)
      
      // Snap to 0 if very low
      if (Math.abs(state.vel) < 0.05) state.vel = 0;
      
      state.pos += state.vel;
    }

    // 2. Infinite Loop Normalization
    if (shouldLoop && state.segmentWidth > 0) {
      const seg = state.segmentWidth;
      // If we scrolled too far left (into the first clone set), jump forward
      if (state.pos < seg * 0.5) {
        state.pos += seg;
      } 
      // If we scrolled too far right (into the third clone set), jump back
      else if (state.pos > seg * 1.5) {
        state.pos -= seg;
      }
    } else {
      // Bounds checking for non-looping
      const maxScroll = el.scrollWidth - el.clientWidth;
      if (state.pos < 0) { state.pos = 0; state.vel = 0; }
      if (state.pos > maxScroll) { state.pos = maxScroll; state.vel = 0; }
    }

    // 3. Apply to DOM
    // We use transform for the inner content if we wanted GPU accel, 
    // but scrollLeft is better for native behavior (context menus etc).
    // However, mixing scrollLeft with rAF can be jittery if not careful.
    // Let's stick to scrollLeft for compatibility, but ensure we don't fight the browser.
    if (Math.abs(el.scrollLeft - state.pos) > 0.5) {
      el.scrollLeft = state.pos;
    }

    // 4. Dynamic Effects (Skew/Scale based on velocity)
    // Add a subtle skew effect based on speed for "dynamic" feel
    if (Math.abs(state.vel) > 0.5) {
      const skew = Math.max(-2, Math.min(2, state.vel * 0.1)); // Cap at 2 degrees
      content.style.transform = `skewX(${-skew}deg)`;
      content.style.transition = 'none';
    } else {
      content.style.transform = 'skewX(0deg)';
      content.style.transition = 'transform 0.3s ease-out';
    }

    rafRef.current = requestAnimationFrame(update);
  }, [shouldLoop]);

  useEffect(() => {
    rafRef.current = requestAnimationFrame(update);
    return () => cancelAnimationFrame(rafRef.current);
  }, [update]);

  // --- Event Handlers ---

  const onPointerDown = useCallback((e) => {
    if (!shouldLoop && childCount < 4) return; // Allow native behavior if not looping
    // Only left (0) or middle (1) mouse
    if (e.button !== 0 && e.button !== 1) return;
    
    const state = physics.current;
    state.isDragging = true;
    state.startX = e.clientX;
    state.lastX = e.clientX;
    state.lastTime = performance.now();
    state.vel = 0;
    
    const el = containerRef.current;
    if (el) {
      el.style.cursor = 'grabbing';
      // Disable pointer events on children while dragging to prevent accidental clicks
      // contentRef.current.style.pointerEvents = 'none'; 
    }
  }, [shouldLoop, childCount]);

  const onPointerMove = useCallback((e) => {
    const state = physics.current;
    if (!state.isDragging) return;
    
    const now = performance.now();
    const dx = e.clientX - state.lastX;
    const dt = now - state.lastTime;

    // Update position immediately for responsiveness
    state.pos -= dx;
    
    // Calculate velocity for inertia later
    // Simple moving average or just instantaneous? Instantaneous is usually fine for 60fps
    if (dt > 0) {
      const newVel = -dx; // pixels per frame roughly
      // Smooth out velocity to avoid spikes
      state.vel = state.vel * 0.5 + newVel * 0.5;
    }

    state.lastX = e.clientX;
    state.lastTime = now;
  }, []);

  const onPointerUp = useCallback((e) => {
    const state = physics.current;
    if (!state.isDragging) return;
    
    state.isDragging = false;
    const el = containerRef.current;
    if (el) {
      el.style.cursor = shouldLoop ? 'grab' : 'default';
      // contentRef.current.style.pointerEvents = 'auto';
    }

    // If user held still for a bit before releasing, kill velocity
    const now = performance.now();
    if (now - state.lastTime > 100) {
      state.vel = 0;
    } else {
      // Boost velocity slightly for better "throw" feel
      state.vel *= 1.2;
    }
  }, [shouldLoop]);

  // Wheel Handler - Inject momentum instead of direct scroll
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const onWheel = (e) => {
      // Only capture if mostly horizontal or if we are forcing horizontal
      // But for this component, we usually want to map vertical wheel to horizontal scroll
      e.preventDefault();
      
      const delta = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
      // Add to velocity (momentum scrolling)
      // Adjust multiplier for feel
      physics.current.vel += delta * 0.08; 
    };

    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  // --- Layout & Measurements ---
  useLayoutEffect(() => {
    const el = containerRef.current;
    const inner = contentRef.current;
    if (!el || !inner) return;

    // Calculate segment width
    // If looping, we have 3 sets. Real width is scrollWidth / 3
    // But we need to be careful about gaps.
    // Best way: measure the first child * count + gaps?
    // Or just trust scrollWidth / 3 if we rendered 3 sets.
    
    const measure = () => {
      if (shouldLoop) {
        const totalWidth = inner.scrollWidth;
        const seg = totalWidth / 3;
        physics.current.segmentWidth = seg;
        
        // Initialize position to middle segment if not already set
        if (physics.current.pos === 0) {
          physics.current.pos = seg;
          el.scrollLeft = seg;
        }
      } else {
        physics.current.segmentWidth = 0;
      }
    };

    measure();
    // Resize observer to handle window resizes
    const ro = new ResizeObserver(measure);
    ro.observe(inner);
    return () => ro.disconnect();
  }, [children, shouldLoop, gap]);

  const items = useMemo(() => {
    const arr = React.Children.toArray(children);
    if (!shouldLoop) return arr;
    // Clone 3 times for infinite loop (A B C)
    // We scroll inside B. If we hit A, jump to B. If we hit C, jump to B.
    return [
      ...arr.map((c, i) => React.cloneElement(c, { key: `pre-${i}` })),
      ...arr.map((c, i) => React.cloneElement(c, { key: `cur-${i}` })),
      ...arr.map((c, i) => React.cloneElement(c, { key: `post-${i}` })),
    ];
  }, [children, shouldLoop]);

  return (
    <div style={{ position: 'relative', ...style }}>
      {/* Hide scrollbars */}
      <style>{`
        .${uid}::-webkit-scrollbar{ display:none; height:0; width:0 }
      `}</style>
      <div
        className={uid}
        ref={containerRef}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerLeave={onPointerUp}
        style={{
          overflowX: 'hidden', // We handle scroll manually
          overflowY: 'hidden',
          whiteSpace: 'nowrap',
          padding: padding,
          background,
          height,
          boxSizing: 'border-box',
          userSelect: 'none',
          touchAction: 'none', // Disable browser handling of gestures
          cursor: shouldLoop ? 'grab' : 'default',
        }}
      >
        <div 
          ref={contentRef} 
          style={{ 
            display: 'inline-flex', 
            gap, 
            alignItems: 'stretch', 
            height: '100%',
            willChange: 'transform' // Hint for optimization
          }}
        >
          {items}
        </div>
      </div>
      {(showEdges && shouldLoop) && (
        <>
          <div className="absolute left-0 top-0 bottom-0 w-12 pointer-events-none z-10 bg-gradient-to-r from-background to-transparent" />
          <div className="absolute right-0 top-0 bottom-0 w-12 pointer-events-none z-10 bg-gradient-to-l from-background to-transparent" />
        </>
      )}
    </div>
  );
}

export default React.memo(HorizontalScroller);
