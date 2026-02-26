import React, { useState, useEffect, useRef, useCallback } from 'react';

const OrbitVisualization = ({ estates, userInitials, onEstateClick }) => {
  const orbitR = 95, cx = 150, cy = 135, bs = 38, hbs = 19;
  const angles = [90, 30, 330, 270, 210, 150];
  const positions = angles.map(a => ({
    left: cx + orbitR * Math.cos(a * Math.PI / 180) - hbs,
    top: cy - orbitR * Math.sin(a * Math.PI / 180) - hbs,
  }));

  const containerRef = useRef(null);
  const angleRef = useRef(0);
  const velRef = useRef(0.35);
  const dragRef = useRef(false);
  const lastARef = useRef(0);
  const lastTRef = useRef(0);
  const clickGuard = useRef(false);
  const [rot, setRot] = useState(0);

  const getAngle = useCallback((px, py) => {
    if (!containerRef.current) return 0;
    const r = containerRef.current.getBoundingClientRect();
    return Math.atan2(py - (r.top + cy), px - (r.left + cx)) * 180 / Math.PI;
  }, []);

  // Animation loop
  useEffect(() => {
    let raf;
    const tick = () => {
      if (!dragRef.current) {
        velRef.current *= 0.997;
        if (Math.abs(velRef.current) < 0.005) velRef.current = 0;
      }
      angleRef.current += velRef.current;
      setRot(angleRef.current);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  const onDown = (ev) => {
    const pt = ev.touches ? ev.touches[0] : ev;
    dragRef.current = true;
    clickGuard.current = false;
    lastARef.current = getAngle(pt.clientX, pt.clientY);
    lastTRef.current = performance.now();
    velRef.current = 0;
  };

  const onMove = useCallback((ev) => {
    if (!dragRef.current) return;
    if (ev.cancelable) ev.preventDefault();
    const pt = ev.touches ? ev.touches[0] : ev;
    const a = getAngle(pt.clientX, pt.clientY);
    let d = a - lastARef.current;
    if (d > 180) d -= 360;
    if (d < -180) d += 360;
    if (Math.abs(d) > 1) clickGuard.current = true;
    angleRef.current += d;
    const now = performance.now();
    const dt = now - lastTRef.current;
    if (dt > 0) velRef.current = d / dt * 16.67;
    lastARef.current = a;
    lastTRef.current = now;
  }, [getAngle]);

  const onUp = () => { dragRef.current = false; };

  useEffect(() => {
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    window.addEventListener('touchmove', onMove, { passive: false });
    window.addEventListener('touchend', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      window.removeEventListener('touchmove', onMove);
      window.removeEventListener('touchend', onUp);
    };
  }, [onMove]);

  const estateColors = [
    'linear-gradient(135deg, #6D28D9, #A855F7)',
    'linear-gradient(135deg, #B45309, #D97706)',
    'linear-gradient(135deg, #1E40AF, #3B82F6)',
    'linear-gradient(135deg, #0F766E, #14B8A6)',
    'linear-gradient(135deg, #BE185D, #EC4899)',
    'linear-gradient(135deg, #7C2D12, #DC2626)',
  ];

  return (
    <div
      ref={containerRef}
      style={{ position: 'relative', width: 300, height: 300, margin: '0 auto 20px', cursor: 'grab', userSelect: 'none', touchAction: 'none', overflow: 'hidden' }}
      onMouseDown={onDown}
      onTouchStart={onDown}
      data-testid="orbit-visualization"
    >
      {/* Orbit track ring */}
      <div style={{
        position: 'absolute', left: cx - orbitR, top: cy - orbitR,
        width: orbitR * 2, height: orbitR * 2, borderRadius: '50%',
        border: '1px dashed rgba(224,173,43,0.15)',
        transform: `rotate(${rot}deg)`,
      }} />
      {/* Outer ring */}
      <div style={{
        position: 'absolute', left: cx - orbitR - 15, top: cy - orbitR - 15,
        width: (orbitR + 15) * 2, height: (orbitR + 15) * 2, borderRadius: '50%',
        border: '1px solid rgba(224,173,43,0.05)',
      }} />

      {/* Center node (user) */}
      <div style={{ position: 'absolute', left: cx - 44, top: cy - 44, width: 88, height: 88, zIndex: 5, pointerEvents: 'none' }}>
        <div style={{
          width: 88, height: 88, borderRadius: '50%',
          background: 'linear-gradient(135deg, #6D28D9, #7C3AED)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 26, fontWeight: 700, color: 'white',
          border: '3px solid var(--gold2)',
          boxShadow: '0 0 40px rgba(124,58,237,0.3), 0 0 80px rgba(224,173,43,0.12)',
          position: 'relative',
        }}>
          <div style={{
            position: 'absolute', inset: -6, borderRadius: '50%',
            border: '2px solid rgba(224,173,43,0.15)',
            animation: 'pulse 3s ease-in-out infinite',
          }} />
          {userInitials}
        </div>
      </div>

      {/* Orbiting estates */}
      <div style={{
        position: 'absolute', inset: 0,
        transform: `rotate(${rot}deg)`,
        transformOrigin: `${cx}px ${cy}px`,
      }}>
        {estates.slice(0, 6).map((estate, i) => {
          const isTransitioned = estate.status === 'transitioned';
          const pos = positions[i];
          const initials = estate.name?.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2) || '??';
          const color = estateColors[i % estateColors.length];

          return (
            <div key={estate.id} style={{ position: 'absolute', left: pos.left, top: pos.top, width: bs, height: bs, zIndex: 3 }}>
              {/* Counter-rotate to keep text upright */}
              <div style={{ transform: `rotate(${-rot}deg)`, display: 'flex', flexDirection: 'column', alignItems: 'center', position: 'relative' }}>
                <div
                  onClick={(ev) => {
                    if (clickGuard.current) { ev.stopPropagation(); return; }
                    onEstateClick?.(estate);
                  }}
                  style={{
                    width: bs, height: bs, borderRadius: '50%',
                    background: color,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 13, fontWeight: 700, color: 'white',
                    boxShadow: isTransitioned ? '0 0 20px rgba(224,173,43,0.35), 0 0 40px rgba(224,173,43,0.12)' : 'none',
                    border: isTransitioned ? '2.5px solid rgba(224,173,43,0.5)' : '2px dashed var(--b2)',
                    opacity: isTransitioned ? 1 : 0.5,
                    cursor: 'pointer', flexShrink: 0,
                    filter: isTransitioned ? 'brightness(1.2) saturate(1.2)' : 'brightness(0.7) saturate(0.6)',
                    pointerEvents: 'auto',
                  }}
                >
                  {initials}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default OrbitVisualization;
