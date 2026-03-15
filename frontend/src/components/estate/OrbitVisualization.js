import React, { useState, useEffect, useRef, useCallback } from 'react';
import { resolvePhotoUrl } from '../../utils/photoUrl';

// ── Ring mapping ───────────────────────────────────────────────
// The `relation` field stores how the BENEFACTOR labelled the beneficiary
// (e.g. "Son" means "this beneficiary is my son").
// We INVERT to get the benefactor's role FROM THE BENEFICIARY's perspective:
//   Benefactor says "Son"       → benefactor is the beneficiary's PARENT       → Ring 1
//   Benefactor says "Grandfather"→ benefactor is the beneficiary's GRANDCHILD  → Ring 1
//
// Ring 0  — Spouse & Parents (your makers + your mate)
// Ring 1  — Children, Siblings, Grandparents (products / makers-of-makers)
// Ring 2  — Grandchildren, Nieces/Nephews, Aunts/Uncles, In-laws
// Ring 3  — Great-grandparents/children, Friend, Other
const getOrbitLevel = (relation) => {
  const raw = (relation || '').toLowerCase().trim();
  // Handle slash-separated values like "Son/Daughter" — check both parts
  const parts = raw.includes('/') ? raw.split('/').map(p => p.trim()) : [raw];
  const r = parts[0]; // primary for substring checks

  // Great-grand checks FIRST (they contain substrings of shorter words)
  if (parts.some(p => p.includes('great-grand') || p.includes('great grand'))) {
    return 3;
  }

  // Ring 0: Spouse & Parents (your makers + your mate)
  const ring0 = ['spouse', 'wife', 'husband', 'partner', 'parent', 'mother', 'father', 'mom', 'dad'];
  if (parts.some(p => ring0.includes(p))) return 0;

  // Ring 1: Children, Siblings, Grandparents
  const ring1 = ['son', 'daughter', 'child', 'children', 'sibling', 'brother', 'sister',
    'grandparent', 'grandmother', 'grandfather', 'grandma', 'grandpa'];
  if (parts.some(p => ring1.includes(p))) return 1;

  // Ring 2: Grandchildren, Nieces, Nephews, In-laws, Aunts, Uncles
  const ring2 = ['grandchild', 'grandson', 'granddaughter', 'nephew', 'niece', 'uncle', 'aunt'];
  if (parts.some(p => ring2.includes(p))) return 2;
  if (r.includes('in-law') || r.includes('in law')) return 2;

  // Ring 3: Non-family & distant
  if (parts.some(p => ['friend', 'other'].includes(p))) return 3;
  return 2;
};

// Visual style for each ring level
const orbitColors = [
  ['linear-gradient(135deg, #D4AF37, #F5D76E)', 'rgba(212,175,55,0.3)'],
  ['linear-gradient(135deg, #6D28D9, #A855F7)', 'rgba(139,92,246,0.3)'],
  ['linear-gradient(135deg, #0D9488, #14B8A6)', 'rgba(20,184,166,0.3)'],
  ['linear-gradient(135deg, #1E40AF, #3B82F6)', 'rgba(59,130,246,0.3)'],
];

const OrbitVisualization = ({ estates, userInitials, userPhoto, onEstateClick, benefactors }) => {
  const members = benefactors || estates || [];

  // ── Responsive sizing ──────────────────────────────────────
  const wrapRef = useRef(null);
  const containerRef = useRef(null);
  const [availWidth, setAvailWidth] = useState(0);

  useEffect(() => {
    if (!wrapRef.current) return;
    const ro = new ResizeObserver((entries) => {
      for (const e of entries) setAvailWidth(e.contentRect.width);
    });
    ro.observe(wrapRef.current);
    return () => ro.disconnect();
  }, []);

  // Group members by orbit level
  const orbitGroups = members.reduce((acc, member) => {
    const level = getOrbitLevel(member.relation);
    if (!acc[level]) acc[level] = [];
    acc[level].push(member);
    return acc;
  }, {});

  const maxOrbitLevel = Math.max(...Object.keys(orbitGroups).map(Number), 0);
  const numRings = maxOrbitLevel + 1;

  // Derive all dimensions from the measured container width
  const w = Math.min(availWidth || 400, 560);
  const isCompact = w < 380;
  const ballSize = isCompact ? 36 : w < 500 ? 46 : 50;
  const centerSize = isCompact ? 50 : w < 500 ? 70 : 80;
  const edgePad = ballSize / 2 + 4;
  const maxOuterR = w / 2 - edgePad;
  const baseOrbitR = centerSize / 2 + ballSize * 0.6;
  // Tighter inner rings: first gap is 60% of even spacing, expanding outward
  const evenSpacing =
    numRings > 1
      ? (maxOuterR - baseOrbitR) / numRings
      : maxOuterR - baseOrbitR;
  const orbitRadii = Array.from({ length: numRings }, (_, i) => {
    // Progressive spacing: inner rings sit closer together
    const t = numRings > 1 ? i / (numRings - 1) : 0;
    const factor = 0.6 + t * 0.4; // 60% of even spacing for Ring 1, scaling to 100% for outermost
    return baseOrbitR + (i + 1) * evenSpacing * factor;
  });

  // Adaptive height: only as tall as the outermost active ring requires
  const outerR = orbitRadii[maxOrbitLevel] || baseOrbitR;
  const containerHeight = (outerR + ballSize / 2 + (isCompact ? 4 : 12)) * 2;
  const containerWidth = w;
  const cx = containerWidth / 2;
  const cy = containerHeight / 2;

  // ── Drag / spin state ──────────────────────────────────────
  const angleRef = useRef(0);
  const velRef = useRef(0.2);
  const dragRef = useRef(false);
  const lastARef = useRef(0);
  const lastTRef = useRef(0);
  const clickGuard = useRef(false);
  const [rot, setRot] = useState(0);

  const getAngle = useCallback(
    (px, py) => {
      if (!containerRef.current) return 0;
      const r = containerRef.current.getBoundingClientRect();
      return (Math.atan2(py - (r.top + cy), px - (r.left + cx)) * 180) / Math.PI;
    },
    [cx, cy],
  );

  useEffect(() => {
    const baseSpeed = 0.2;
    let raf;
    const tick = () => {
      if (!dragRef.current) {
        if (Math.abs(velRef.current) > baseSpeed) {
          velRef.current *= 0.995;
        } else {
          velRef.current = velRef.current >= 0 ? baseSpeed : -baseSpeed;
        }
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

  const onMove = useCallback(
    (ev) => {
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
      if (dt > 0) velRef.current = (d / dt) * 16.67;
      lastARef.current = a;
      lastTRef.current = now;
    },
    [getAngle],
  );

  const onUp = () => {
    dragRef.current = false;
  };

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

  // ── Adaptive node sizing ─────────────────────────────────
  // Shrinks nodes when a ring is crowded; floors at 28px so photos stay legible
  const MIN_NODE = 28;
  const MIN_GAP = 4;
  const getNodeSizeForRing = (memberCount, orbitRadius) => {
    if (memberCount <= 1) return ballSize;
    const circumference = 2 * Math.PI * orbitRadius;
    const maxFit = Math.floor(circumference / (ballSize + MIN_GAP));
    if (memberCount <= maxFit) return ballSize;
    return Math.max(Math.floor(circumference / memberCount - MIN_GAP), MIN_NODE);
  };

  // ── Position helpers ───────────────────────────────────────
  const getPositionsForOrbit = (memberCount, orbitRadius, level = 0, nodeSize) => {
    const sz = nodeSize || ballSize;
    const positions = [];
    const angleStep = 360 / Math.max(memberCount, 1);
    const startAngle = 90 + level * 37; // stagger each ring
    for (let i = 0; i < memberCount; i++) {
      const angle = startAngle + i * angleStep;
      positions.push({
        left: cx + orbitRadius * Math.cos((angle * Math.PI) / 180) - sz / 2,
        top: cy - orbitRadius * Math.sin((angle * Math.PI) / 180) - sz / 2,
        angle,
      });
    }
    return positions;
  };

  // ── Render ─────────────────────────────────────────────────
  if (!availWidth) {
    // First render — just measure
    return <div ref={wrapRef} style={{ width: '100%', height: 80 }} data-testid="orbit-visualization" />;
  }

  return (
    <div ref={wrapRef} style={{ width: '100%' }} data-testid="orbit-visualization">
      <div
        ref={containerRef}
        style={{
          position: 'relative',
          width: containerWidth,
          height: containerHeight,
          margin: '0 auto 12px',
          cursor: 'grab',
          userSelect: 'none',
          touchAction: 'none',
        }}
        onMouseDown={onDown}
        onTouchStart={onDown}
      >
        {/* Orbit track rings — only render levels that exist */}
        {Array.from({ length: numRings }, (_, level) => {
          const orbitR = orbitRadii[level] || baseOrbitR;
          const hasMembers = orbitGroups[level]?.length > 0;
          const [, ringColor] = orbitColors[level] || orbitColors[0];

          return (
            <div
              key={`orbit-ring-${level}`}
              data-testid={`orbit-ring-${level}`}
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
                transform: `rotate(${rot * (1 - level * 0.1)}deg)`,
                transition: 'border-color 0.3s',
                pointerEvents: 'none',
              }}
            />
          );
        })}

        {/* Center node (beneficiary) */}
        <div
          style={{
            position: 'absolute',
            left: cx - centerSize / 2,
            top: cy - centerSize / 2,
            width: centerSize,
            height: centerSize,
            zIndex: 10,
            pointerEvents: 'none',
          }}
        >
          <div
            data-testid="orbit-center-node"
            style={{
              width: centerSize,
              height: centerSize,
              borderRadius: '50%',
              background: 'linear-gradient(135deg, #7C3AED, #A855F7)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: Math.round(centerSize * 0.32),
              fontWeight: 700,
              color: 'white',
              border: '3px solid rgba(212,175,55,0.5)',
              boxShadow:
                '0 0 40px rgba(124,58,237,0.5), 0 0 80px rgba(212,175,55,0.2), 0 8px 32px rgba(0,0,0,0.4), inset 0 2px 4px rgba(255,255,255,0.2)',
              position: 'relative',
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                position: 'absolute',
                inset: -8,
                borderRadius: '50%',
                border: '2px solid rgba(212,175,55,0.2)',
                animation: 'pulse 3s ease-in-out infinite',
              }}
            />
            {userPhoto ? (
              <img
                src={userPhoto}
                alt="You"
                style={{ width: '100%', height: '100%', borderRadius: '50%', objectFit: 'cover' }}
              />
            ) : (
              userInitials
            )}
          </div>
        </div>

        {/* Orbiting members grouped by ring level */}
        {Object.entries(orbitGroups).map(([levelStr, levelMembers]) => {
          const level = parseInt(levelStr);
          const orbitR = orbitRadii[level] || baseOrbitR;
          const nodeSize = getNodeSizeForRing(levelMembers.length, orbitR);
          const positions = getPositionsForOrbit(levelMembers.length, orbitR, level, nodeSize);
          const [gradient] = orbitColors[level] || orbitColors[0];
          const rotationSpeed = 1 - level * 0.15;

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
                const initials =
                  member.name
                    ?.split(' ')
                    .map((n) => n[0])
                    .join('')
                    .toUpperCase()
                    .slice(0, 2) ||
                  (member.first_name?.[0]?.toUpperCase() || '') +
                    (member.last_name?.[0]?.toUpperCase() || '') ||
                  '??';

                return (
                  <div
                    key={member.id || `member-${i}`}
                    style={{
                      position: 'absolute',
                      left: pos.left,
                      top: pos.top,
                      width: nodeSize,
                      height: nodeSize,
                      zIndex: 5 - level,
                    }}
                  >
                    <div
                      style={{
                        transform: `rotate(${-rot * rotationSpeed}deg)`,
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        position: 'relative',
                      }}
                    >
                      <div
                        onClick={(ev) => {
                          if (clickGuard.current) {
                            ev.stopPropagation();
                            return;
                          }
                          onEstateClick?.(member);
                        }}
                        title={`${member.name || (member.first_name + ' ' + member.last_name)} (${member.relation})`}
                        data-testid={`orbit-node-${member.id || i}`}
                        style={{
                          width: nodeSize,
                          height: nodeSize,
                          borderRadius: '50%',
                          background: gradient,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontSize: Math.round(nodeSize * 0.3),
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
                          overflow: 'hidden',
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
                        {member.photo_url || member.owner_photo_url ? (
                          <img
                            src={resolvePhotoUrl(member.photo_url || member.owner_photo_url)}
                            alt={member.name}
                            style={{
                              width: '100%',
                              height: '100%',
                              borderRadius: '50%',
                              objectFit: 'cover',
                            }}
                          />
                        ) : (
                          initials
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default OrbitVisualization;
export { getOrbitLevel, orbitColors };
