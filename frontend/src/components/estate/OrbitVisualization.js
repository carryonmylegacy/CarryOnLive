import React, { useState, useEffect, useRef, useCallback } from 'react';

// Map relationships to generational orbit levels (0 = innermost)
// Note: The relationship stored is from the BENEFACTOR's perspective
// (i.e., how the benefactor relates to the beneficiary)
// So we need to INVERT some relationships:
// - If benefactor says "Daughter" → beneficiary views them as "Parent"
// - If benefactor says "Grandchild" → beneficiary views them as "Grandparent"
const getOrbitLevel = (relation) => {
  const r = (relation || '').toLowerCase();
  
  // Level 0 (innermost): Spouse and Children
  // Spouse relationships are symmetric
  if (['spouse', 'wife', 'husband', 'partner'].includes(r)) {
    return 0;
  }
  // If benefactor calls you their child, THEY are your parent (Level 1)
  // If benefactor calls you their parent, THEY are your child (Level 0)
  if (['parent', 'mother', 'father', 'mom', 'dad'].includes(r)) {
    return 0; // They are your child
  }
  
  // Level 1: Parents and Siblings
  if (['son', 'daughter', 'child', 'children'].includes(r)) {
    return 1; // They are your parent
  }
  if (['sibling', 'brother', 'sister'].includes(r)) {
    return 1; // Siblings stay on same level
  }
  
  // Level 2: Grandparents and Grandchildren  
  if (['grandchild', 'grandson', 'granddaughter'].includes(r)) {
    return 2; // They are your grandparent
  }
  if (['grandparent', 'grandmother', 'grandfather', 'grandma', 'grandpa'].includes(r)) {
    return 0; // They are your grandchild (innermost)
  }
  
  // Level 3: Great-grandparents
  if (r.includes('great-grandchild') || r.includes('great grandchild')) {
    return 3; // They are your great-grandparent
  }
  if (r.includes('great-grandparent') || r.includes('great grandparent') || 
      r.includes('great-grand') || r.includes('great grand')) {
    return 0; // They are your great-grandchild
  }
  
  // Default: Level 1 for friends, other relatives
  return 1;
};

// Colors for each orbit level
const orbitColors = [
  ['linear-gradient(135deg, #D4AF37, #F5D76E)', 'rgba(212,175,55,0.3)'], // Gold for innermost (spouse/children)
  ['linear-gradient(135deg, #6D28D9, #A855F7)', 'rgba(139,92,246,0.3)'], // Purple for parents
  ['linear-gradient(135deg, #0D9488, #14B8A6)', 'rgba(20,184,166,0.3)'], // Teal for grandparents
  ['linear-gradient(135deg, #1E40AF, #3B82F6)', 'rgba(59,130,246,0.3)'], // Blue for great-grandparents
];

const OrbitVisualization = ({ estates, userInitials, onEstateClick, benefactors }) => {
  // Use benefactors if provided (organized by relationship), otherwise fall back to estates
  const members = benefactors || estates || [];
  
  // Center and base sizing
  const cx = 150, cy = 150;
  const baseOrbitR = 65; // Innermost orbit radius
  const orbitSpacing = 48; // Space between orbits
  const centerSize = 70;
  const ballSize = 32;
  
  const containerRef = useRef(null);
  const angleRef = useRef(0);
  const velRef = useRef(0.25);
  const dragRef = useRef(false);
  const lastARef = useRef(0);
  const lastTRef = useRef(0);
  const clickGuard = useRef(false);
  const [rot, setRot] = useState(0);

  // Group members by orbit level
  const orbitGroups = members.reduce((acc, member) => {
    const level = getOrbitLevel(member.relation);
    if (!acc[level]) acc[level] = [];
    acc[level].push(member);
    return acc;
  }, {});

  // Get max orbit level that has members
  const maxOrbitLevel = Math.max(...Object.keys(orbitGroups).map(Number), 0);

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
        if (Math.abs(velRef.current) < 0.003) velRef.current = 0;
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

  // Calculate positions for members on an orbit
  const getPositionsForOrbit = (memberCount, orbitRadius, startAngle = 90) => {
    const positions = [];
    const angleStep = 360 / Math.max(memberCount, 1);
    for (let i = 0; i < memberCount; i++) {
      const angle = startAngle + (i * angleStep);
      positions.push({
        left: cx + orbitRadius * Math.cos(angle * Math.PI / 180) - ballSize / 2,
        top: cy - orbitRadius * Math.sin(angle * Math.PI / 180) - ballSize / 2,
        angle,
      });
    }
    return positions;
  };

  // Orbit labels
  const orbitLabels = ['Spouse & Children', 'Parents & Siblings', 'Grandparents', 'Great-Grandparents'];

  // Calculate container size based on orbits needed
  const containerSize = (maxOrbitLevel + 1) * orbitSpacing * 2 + baseOrbitR * 2 + 60;

  return (
    <div
      ref={containerRef}
      style={{ 
        position: 'relative', 
        width: Math.max(300, containerSize), 
        height: Math.max(300, containerSize), 
        margin: '0 auto 20px', 
        cursor: 'grab', 
        userSelect: 'none', 
        touchAction: 'none', 
        overflow: 'hidden' 
      }}
      onMouseDown={onDown}
      onTouchStart={onDown}
      data-testid="orbit-visualization"
    >
      {/* Orbit track rings */}
      {[0, 1, 2, 3].map(level => {
        const orbitR = baseOrbitR + (level * orbitSpacing);
        const hasMembers = orbitGroups[level]?.length > 0;
        const [, ringColor] = orbitColors[level] || orbitColors[0];
        
        return (
          <div
            key={`orbit-ring-${level}`}
            style={{
              position: 'absolute',
              left: cx - orbitR,
              top: cy - orbitR,
              width: orbitR * 2,
              height: orbitR * 2,
              borderRadius: '50%',
              border: hasMembers 
                ? `2px solid ${ringColor}` 
                : '1px dashed rgba(148,163,184,0.15)',
              transform: `rotate(${rot * (1 - level * 0.1)}deg)`, // Slower rotation for outer rings
              transition: 'border-color 0.3s',
              pointerEvents: 'none',
            }}
          />
        );
      })}

      {/* Center node (user/beneficiary) */}
      <div style={{ 
        position: 'absolute', 
        left: cx - centerSize / 2, 
        top: cy - centerSize / 2, 
        width: centerSize, 
        height: centerSize, 
        zIndex: 10, 
        pointerEvents: 'none' 
      }}>
        <div style={{
          width: centerSize,
          height: centerSize,
          borderRadius: '50%',
          background: 'linear-gradient(135deg, #7C3AED, #A855F7)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 22,
          fontWeight: 700,
          color: 'white',
          border: '3px solid rgba(212,175,55,0.5)',
          boxShadow: '0 0 40px rgba(124,58,237,0.5), 0 0 80px rgba(212,175,55,0.2), 0 8px 32px rgba(0,0,0,0.4), inset 0 2px 4px rgba(255,255,255,0.2)',
          position: 'relative',
        }}>
          {/* Pulse animation */}
          <div style={{
            position: 'absolute',
            inset: -8,
            borderRadius: '50%',
            border: '2px solid rgba(212,175,55,0.2)',
            animation: 'pulse 3s ease-in-out infinite',
          }} />
          {userInitials}
        </div>
      </div>

      {/* Orbiting members grouped by generation */}
      {Object.entries(orbitGroups).map(([levelStr, levelMembers]) => {
        const level = parseInt(levelStr);
        const orbitR = baseOrbitR + (level * orbitSpacing);
        const positions = getPositionsForOrbit(levelMembers.length, orbitR, 90 + level * 30);
        const [gradient] = orbitColors[level] || orbitColors[0];
        const rotationSpeed = 1 - level * 0.15; // Outer orbits rotate slower

        return (
          <div
            key={`orbit-group-${level}`}
            style={{
              position: 'absolute',
              inset: 0,
              transform: `rotate(${rot * rotationSpeed}deg)`,
              transformOrigin: `${cx}px ${cy}px`,
            }}
          >
            {levelMembers.map((member, i) => {
              const pos = positions[i];
              const isTransitioned = member.status === 'transitioned';
              const initials = member.name?.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2) 
                || member.first_name?.[0]?.toUpperCase() + member.last_name?.[0]?.toUpperCase()
                || '??';

              return (
                <div 
                  key={member.id || `member-${i}`} 
                  style={{ 
                    position: 'absolute', 
                    left: pos.left, 
                    top: pos.top, 
                    width: ballSize, 
                    height: ballSize, 
                    zIndex: 5 - level 
                  }}
                >
                  {/* Counter-rotate to keep content upright */}
                  <div style={{ 
                    transform: `rotate(${-rot * rotationSpeed}deg)`, 
                    display: 'flex', 
                    flexDirection: 'column', 
                    alignItems: 'center',
                    position: 'relative',
                  }}>
                    <div
                      onClick={(ev) => {
                        if (clickGuard.current) { ev.stopPropagation(); return; }
                        onEstateClick?.(member);
                      }}
                      title={`${member.name || member.first_name + ' ' + member.last_name} (${member.relation})`}
                      style={{
                        width: ballSize,
                        height: ballSize,
                        borderRadius: '50%',
                        background: gradient,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: 11,
                        fontWeight: 700,
                        color: level === 0 ? '#1a1a2e' : 'white',
                        boxShadow: isTransitioned 
                          ? '0 0 20px rgba(212,175,55,0.5), 0 4px 16px rgba(0,0,0,0.35), inset 0 1px 2px rgba(255,255,255,0.2)' 
                          : '0 4px 16px rgba(0,0,0,0.4), inset 0 1px 2px rgba(255,255,255,0.15)',
                        border: isTransitioned 
                          ? '2px solid rgba(212,175,55,0.6)' 
                          : '2px solid rgba(255,255,255,0.2)',
                        cursor: 'pointer',
                        transition: 'transform 0.2s, box-shadow 0.2s',
                        opacity: isTransitioned ? 1 : 0.85,
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.transform = 'scale(1.15)';
                        e.currentTarget.style.boxShadow = '0 0 20px rgba(212,175,55,0.5)';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.transform = 'scale(1)';
                        e.currentTarget.style.boxShadow = isTransitioned 
                          ? '0 0 15px rgba(212,175,55,0.4)' 
                          : '0 2px 8px rgba(0,0,0,0.3)';
                      }}
                    >
                      {initials}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        );
      })}

    </div>
  );
};

export default OrbitVisualization;
