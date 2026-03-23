import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Camera, Users } from 'lucide-react';
import { resolvePhotoUrl } from '../utils/photoUrl';
import { useTheme } from '../contexts/ThemeContext';

/**
 * Static family tree — HTML/CSS based for reliable rendering.
 * Benefactor at top → beneficiaries grouped by relational ring level below.
 * Also shows estates where benefactor is a beneficiary.
 */

const getAge = (dob) => {
  if (!dob) return 999;
  const d = new Date(dob);
  const now = new Date();
  let age = now.getFullYear() - d.getFullYear();
  if (now.getMonth() < d.getMonth() || (now.getMonth() === d.getMonth() && now.getDate() < d.getDate())) age--;
  return age;
};

const getInitials = (name, firstName, lastName) => {
  if (firstName && lastName) return (firstName[0] + lastName[0]).toUpperCase();
  if (name) return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
  return '??';
};

// Linked/unlinked color coding for beneficiary nodes
const LINKED_COLOR = '#10b981';   // green — beneficiary has created their own login
const UNLINKED_COLOR = '#FF6B35'; // orange — beneficiary has NOT created their own login

const getBenLinkedColor = (ben) => {
  return (ben.user_id || ben.invitation_status === 'accepted') ? LINKED_COLOR : UNLINKED_COLOR;
};

// Succession hierarchy colors — matches BeneficiariesPage
const SUCC_COLORS = {
  0: { bg: 'rgba(34,201,147,0.15)', color: '#22C993', border: '1px solid rgba(34,201,147,0.3)' },
  1: { bg: 'rgba(59,130,246,0.15)', color: '#3b82f6', border: '1px solid rgba(59,130,246,0.3)' },
  2: { bg: 'rgba(139,92,246,0.15)', color: '#8b5cf6', border: '1px solid rgba(139,92,246,0.3)' },
};

const TreeNode = ({ initials, photo, color, label, sublabel, size = 60, badge, isPrimary, succRank, onClick, onUpload, testId }) => {
  const hasPhoto = !!photo;
  const succStyle = (succRank !== null && succRank !== undefined) ? SUCC_COLORS[succRank] : null;
  const handleClick = () => {
    if (hasPhoto && onClick) onClick();
    else if (!hasPhoto && onUpload) onUpload();
    else if (onClick) onClick();
  };
  const isClickable = onClick || onUpload;
  return (
    <div className="flex flex-col items-center gap-1" data-testid={testId}>
      <div className="relative">
        <div
          onClick={isClickable ? handleClick : undefined}
          role={isClickable ? 'button' : undefined}
          className="rounded-full flex items-center justify-center font-bold transition-transform hover:scale-110 overflow-hidden cursor-pointer"
          style={{
            width: size, height: size,
            background: hasPhoto ? 'transparent' : (color + '25'),
            fontSize: size * 0.32,
            color: color,
            border: `2.5px solid ${color}`,
            boxShadow: `0 0 12px ${color}40`,
            position: 'relative',
          }}
        >
          {hasPhoto ? (
            <img src={resolvePhotoUrl(photo)} alt="" className="w-full h-full object-cover" />
          ) : (
            <>
              {onUpload && (
                <Camera className="absolute" style={{ width: size * 0.45, height: size * 0.45, color: color, opacity: 0.15 }} />
              )}
              <span className="relative z-10" style={{ fontWeight: 700 }}>{initials}</span>
            </>
          )}
        </div>
        {badge && !isPrimary && (
          <div className="absolute -top-1 -right-1 w-5 h-5 rounded-full flex items-center justify-center text-[11px] font-black" style={{ background: '#d4af37', color: '#080e1a' }}>
            {badge}
          </div>
        )}
      </div>
    {label && succStyle ? (
      <span className="text-[11px] font-bold whitespace-nowrap px-2 py-0.5 rounded-md text-center leading-tight" style={{ background: succStyle.bg, color: succStyle.color, border: succStyle.border }}>{label}</span>
    ) : label ? (
      <span className="text-xs font-semibold text-[var(--t)] text-center leading-tight w-full">{label}</span>
    ) : null}
    {sublabel && <span className="text-[11px] text-[var(--t4)] text-center leading-tight w-full">{sublabel}</span>}
  </div>
  );
};


const FamilyTree = ({ user, beneficiaries, beneficiaryEstates, onSelectBeneficiary, onUploadPhoto, className }) => {
  const navigate = useNavigate();
  const { theme } = useTheme();
  const isLight = theme === 'light';
  const treeRef = useRef(null);
  const upperMaxRef = useRef(0);
  const lowerMaxRef = useRef(0);
  const upperFlashedRef = useRef(false);
  const lowerStartedRef = useRef(false);
  const lowerFlashedRef = useRef(false);
  const initialTopRef = useRef(null);
  const autoFrameRef = useRef(null);

  useEffect(() => {
    const el = treeRef.current;
    if (!el) return;
    let scrollEl = el.parentElement;
    while (scrollEl && scrollEl !== document.body) {
      const st = window.getComputedStyle(scrollEl);
      if (scrollEl.scrollHeight > scrollEl.clientHeight && (st.overflowY === 'auto' || st.overflowY === 'scroll')) break;
      scrollEl = scrollEl.parentElement;
    }
    const scrollTarget = (scrollEl && scrollEl !== document.body) ? scrollEl : window;

    const triggerFlash = (node) => {
      if (!node) return;
      node.style.transition = 'opacity .15s ease-in';
      node.style.opacity = '1';
      setTimeout(() => { node.style.transition = 'opacity .3s ease-out'; node.style.opacity = '0'; }, 150);
    };

    let transitionApplied = false;
    const applyTransitions = () => {
      if (transitionApplied) return;
      transitionApplied = true;
      el.querySelectorAll('.fill-path-blue, .fill-path-gold').forEach(p => {
        p.style.transition = 'stroke-dashoffset 0.2s ease-out';
      });
    };

    const updateAnimation = (raw) => {
      applyTransitions();
      const upper = Math.min(1, raw * 2);
      if (upper > upperMaxRef.current) {
        upperMaxRef.current = upper;
        el.querySelectorAll('.fill-path-blue').forEach(p => { p.style.strokeDashoffset = (1 - upper).toString(); });
      }
      if (upper >= 1 && !upperFlashedRef.current) {
        upperFlashedRef.current = true;
        triggerFlash(el.querySelector('.flash-blue'));
      }
      const lower = Math.min(1, Math.max(0, (raw - 0.35) * 2.5));
      if (lower > 0 && !lowerStartedRef.current) {
        lowerStartedRef.current = true;
        triggerFlash(el.querySelector('.flash-gold-origin'));
      }
      if (lower > lowerMaxRef.current) {
        lowerMaxRef.current = lower;
        el.querySelectorAll('.fill-path-gold').forEach(p => { p.style.strokeDashoffset = (1 - lower).toString(); });
      }
      if (lower >= 1 && !lowerFlashedRef.current) {
        lowerFlashedRef.current = true;
        el.querySelectorAll('.flash-gold-end').forEach(f => triggerFlash(f));
      }
    };

    const handleScroll = () => {
      const rect = el.getBoundingClientRect();
      const vh = window.innerHeight;
      if (rect.top > vh) return;
      if (initialTopRef.current === null) initialTopRef.current = rect.top;
      const scrollDist = Math.max(0, initialTopRef.current - rect.top);
      updateAnimation(scrollDist / 500);
    };

    scrollTarget.addEventListener('scroll', handleScroll, { passive: true });
    handleScroll();

    return () => {
      scrollTarget.removeEventListener('scroll', handleScroll);
      upperMaxRef.current = 0; lowerMaxRef.current = 0;
      upperFlashedRef.current = false; lowerStartedRef.current = false; lowerFlashedRef.current = false;
      initialTopRef.current = null;
    };
  }, []);

  // Use the beneficiaries in the order the benefactor has arranged them (drag-to-reorder tiles)
  const sortedBens = beneficiaries;

  const benEstates = beneficiaryEstates || [];

  return (
    <div ref={treeRef} className={className} data-testid="family-tree">
      {/* Beneficiary estates with converging lines to benefactor */}
      {benEstates.length > 0 && (() => {
        const n = benEstates.length;
        const numRows = Math.ceil(n / 2);
        const vbW = 100;
        const vbH = 100;
        const cx = vbW / 2;
        const leftCol = 26;
        const rightCol = 74;
        const circleR = 6;
        const estRowH = 80;
        const trailPx = 50;
        const totalEstH = numRows * estRowH + trailPx;
        const nodeZone = (numRows * estRowH / totalEstH) * 100;
        const rowH = nodeZone / numRows;

        return (
          <div className="relative" style={{ paddingBottom: trailPx }}>
            {/* Full-height SVG overlay behind nodes — strands run through center gap */}
            <svg
              className="absolute pointer-events-none overflow-visible"
              viewBox={`0 0 ${vbW} ${vbH}`}
              preserveAspectRatio="none"
              style={{ top: 0, left: 0, width: '100%', height: '100%', zIndex: 1 }}
              dangerouslySetInnerHTML={{ __html: (() => {
                const gradColor1 = isLight ? '#3B82F6' : '#60A5FA';
                const gradColor2 = isLight ? '#2563EB' : '#93C5FD';
                const gradOp1 = isLight ? 0.18 : 0.12;
                const gradOp2 = isLight ? 0.06 : 0.03;
                const blurDev = isLight ? 1.5 : 2;
                const sw = isLight ? 0.6 : 0.5;
                const lightColor = isLight ? 'rgba(100,160,255,0.3)' : 'rgba(160,200,255,0.25)';
                const overlayW = isLight ? 0.8 : 0.7;
                let svgContent = `
                  <defs>
                    <linearGradient id="lineFlow" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stop-color="${gradColor1}" stop-opacity="${gradOp1}" />
                      <stop offset="100%" stop-color="${gradColor2}" stop-opacity="${gradOp2}" />
                    </linearGradient>
                    <filter id="lineGlow" x="-50%" y="-50%" width="200%" height="200%">
                      <feGaussianBlur stdDeviation="${blurDev}" result="blur" />
                      <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
                    </filter>
                    <filter id="lightPulseBlue" x="-100%" y="-100%" width="300%" height="300%">
                      <feGaussianBlur stdDeviation="2" result="blur" />
                      <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
                    </filter>
                  </defs>`;
                // All paths flow from estate circles down to convergence point near Pete
                const allPaths = [];
                for (let idx = 0; idx < n; idx++) {
                  const rIdx = Math.floor(idx / 2);
                  const isLeft = idx % 2 === 0;
                  const isCentered = (n % 2 !== 0 && idx === n - 1);
                  const nodeX = isCentered ? cx : (isLeft ? leftCol : rightCol);
                  const dir = isCentered ? 0 : (isLeft ? 1 : -1);
                  const rowCenterY = (rIdx + 0.3) * rowH;
                  if (isCentered) {
                    allPaths.push(`M ${cx.toFixed(1)},${rowCenterY.toFixed(1)} L ${cx.toFixed(1)},97`);
                  } else {
                    const sx = nodeX + dir * circleR;
                    const cp1x = sx + 0.6 * (cx - sx);
                    const cp2y = rowCenterY + 0.5 * (97 - rowCenterY);
                    allPaths.push(`M ${sx.toFixed(1)},${rowCenterY.toFixed(1)} C ${cp1x.toFixed(1)},${rowCenterY.toFixed(1)} ${cx.toFixed(1)},${cp2y.toFixed(1)} ${cx.toFixed(1)},97`);
                  }
                }
                allPaths.forEach(d => {
                  svgContent += `<path d="${d}" fill="none" stroke="url(#lineFlow)" stroke-width="${sw}" filter="url(#lineGlow)" />`;
                });
                allPaths.forEach(d => {
                  svgContent += `<path class="fill-path-blue" d="${d}" fill="none" stroke="${lightColor}" stroke-width="${overlayW}" pathLength="1" stroke-dasharray="1" stroke-dashoffset="1" filter="url(#lightPulseBlue)" />`;
                });
                svgContent += `<circle class="flash-blue" cx="${cx}" cy="96" r="4" fill="${lightColor}" opacity="0" filter="url(#lightPulseBlue)" />`;
                return svgContent;
              })() }}
            />

            {/* Estate nodes — two columns with wide center gap */}
            <div className="relative grid" style={{ gridTemplateColumns: '1fr 1fr', columnGap: 0, rowGap: 10, justifyItems: 'center', zIndex: 2, paddingLeft: '2%', paddingRight: '2%' }}>
              {benEstates.map((est, idx) => (
                <div key={est.id} style={benEstates.length % 2 !== 0 && idx === benEstates.length - 1 ? { gridColumn: '1 / -1' } : undefined}>
                  <TreeNode
                    initials={<Users className="w-3.5 h-3.5" />}
                    photo={est.estate_photo_url || est.owner_photo_url}
                    color="#60A5FA"
                    size={50}
                    label={est.name?.split("'")[0] || 'Estate'}
                    testId={`tree-estate-${est.id}`}
                    onClick={() => {
                      localStorage.setItem('beneficiary_estate_id', est.id);
                      localStorage.removeItem('selected_estate_id');
                      navigate('/beneficiary');
                      window.location.reload();
                    }}
                  />
                </div>
              ))}
            </div>
          </div>
        );
      })()}


      {/* Root node (benefactor) with halo orb + trunk flares */}
      <div className="flex flex-col items-center mt-3">
        <div className="relative" style={{ overflow: 'visible' }}>
          <div style={{ position: 'relative', zIndex: 1 }}>
            <TreeNode
              initials={getInitials(user?.name, user?.first_name, user?.last_name)}
              photo={user?.photo_url}
              color="#d4af37"
              size={60}
              label={user?.first_name || user?.name?.split(' ')[0] || 'You'}
              sublabel="Benefactor"
              testId="tree-root-node"
            />
          </div>
        </div>

        {/* Gold neural strands from benefactor down to beneficiaries */}
        {sortedBens.length > 0 && (() => {
          const n = sortedBens.length;
          const numBenRows = Math.ceil(n / 2);
          const vbW = 100;
          const vbH = 100;
          const cx = vbW / 2;
          const leftCol = 21;
          const rightCol = 79;
          const circleR = 7;
          const goldStart = isLight ? '#b8860b' : '#d4af37';
          const goldEnd = isLight ? '#d4af37' : '#FFD700';
          const estRowH = 85;
          const trailPx = 25;
          const totalEstH = numBenRows * estRowH + trailPx;
          const topTrail = (trailPx / totalEstH) * 100;
          const nodeZone = 100 - topTrail;
          const rowH = nodeZone / numBenRows;

          return (
          <div className="w-full relative" style={{ maxWidth: 380, marginTop: 8 }} data-testid="tree-spine">
            {/* Full-height SVG overlay — strands run through center gap between columns */}
            <svg
              className="absolute pointer-events-none overflow-visible"
              viewBox={`0 0 ${vbW} ${vbH}`}
              preserveAspectRatio="none"
              style={{ top: 0, left: 0, width: '100%', height: '100%', zIndex: 0 }}
              dangerouslySetInnerHTML={{ __html: (() => {
                const blurDev = isLight ? 1.5 : 2;
                const sw = isLight ? 0.6 : 0.5;
                const lightColor = isLight ? 'rgba(200,170,50,0.3)' : 'rgba(255,230,140,0.25)';
                const overlayW = isLight ? 0.8 : 0.7;
                // All paths fan from ONE point (cx,2) downward — original pattern
                const allPaths = [];
                for (let idx = 0; idx < n; idx++) {
                  const rIdx = Math.floor(idx / 2);
                  const isLeft = idx % 2 === 0;
                  const isCentered = (n % 2 !== 0 && idx === n - 1);
                  const nodeX = isCentered ? cx : (isLeft ? leftCol : rightCol);
                  const dir = isCentered ? 0 : (isLeft ? 1 : -1);
                  const rowCenterY = topTrail + (rIdx + 0.3) * rowH;
                  if (isCentered) {
                    allPaths.push(`M ${cx.toFixed(1)},2 L ${cx.toFixed(1)},${rowCenterY.toFixed(1)}`);
                  } else {
                    const ex = nodeX + dir * circleR;
                    const cp1y = 2 + 0.5 * (rowCenterY - 2);
                    const cp2x = ex + 0.6 * (cx - ex);
                    allPaths.push(`M ${cx.toFixed(1)},2 C ${cx.toFixed(1)},${cp1y.toFixed(1)} ${cp2x.toFixed(1)},${rowCenterY.toFixed(1)} ${ex.toFixed(1)},${rowCenterY.toFixed(1)}`);
                  }
                }
                let svg = `
                  <defs>
                    <linearGradient id="ftGoldGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stop-color="${goldStart}" stop-opacity="${isLight ? 0.18 : 0.12}" />
                      <stop offset="100%" stop-color="${goldEnd}" stop-opacity="${isLight ? 0.06 : 0.03}" />
                    </linearGradient>
                    <filter id="ftGoldGlow" x="-50%" y="-50%" width="200%" height="200%">
                      <feGaussianBlur stdDeviation="${blurDev}" result="blur" />
                      <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
                    </filter>
                    <filter id="lightPulseGold" x="-100%" y="-100%" width="300%" height="300%">
                      <feGaussianBlur stdDeviation="2" result="blur" />
                      <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
                    </filter>
                  </defs>`;
                allPaths.forEach(d => {
                  svg += `<path d="${d}" fill="none" stroke="url(#ftGoldGrad)" stroke-width="${sw}" filter="url(#ftGoldGlow)" />`;
                });
                svg += `<circle class="flash-gold-origin" cx="${cx}" cy="2" r="4" fill="${lightColor}" opacity="0" filter="url(#lightPulseGold)" />`;
                allPaths.forEach(d => {
                  svg += `<path class="fill-path-gold" d="${d}" fill="none" stroke="${lightColor}" stroke-width="${overlayW}" pathLength="1" stroke-dasharray="1" stroke-dashoffset="1" filter="url(#lightPulseGold)" />`;
                });
                for (let fi = 0; fi < n; fi++) {
                  const fiR = Math.floor(fi / 2);
                  const fiLeft = fi % 2 === 0;
                  const fiCen = (n % 2 !== 0 && fi === n - 1);
                  const fiY = topTrail + (fiR + 0.3) * rowH;
                  const fiNx = fiCen ? cx : (fiLeft ? leftCol : rightCol);
                  const fiDir = fiCen ? 0 : (fiLeft ? 1 : -1);
                  const fiX = fiNx + fiDir * circleR;
                  svg += `<circle class="flash-gold-end" cx="${fiX.toFixed(1)}" cy="${fiY.toFixed(1)}" r="3" fill="${lightColor}" opacity="0" filter="url(#lightPulseGold)" />`;
                }
                return svg;
              })() }}
            />

            {/* Beneficiary grid — two columns with wide center gap */}
            <div className="grid px-1" style={{ gridTemplateColumns: 'repeat(2, 1fr)', columnGap: '20%', rowGap: 12, justifyItems: 'center', paddingTop: trailPx, position: 'relative', zIndex: 1 }}>
              {sortedBens.map((ben, idx) => {
                const benColor = getBenLinkedColor(ben);
                const age = getAge(ben.date_of_birth || ben.dob);
                const relation = ben.relation || '';
                const isInSuccession = ben.succession_order !== null && ben.succession_order !== undefined;
                const succRank = isInSuccession ? sortedBens.filter((b, i) => i < idx && b.succession_order !== null && b.succession_order !== undefined).length : null;

                return (
                  <div key={ben.id} className="flex justify-center" style={sortedBens.length % 2 !== 0 && idx === sortedBens.length - 1 ? { gridColumn: '1 / -1' } : undefined}>
                    <TreeNode
                      initials={getInitials(ben.name, ben.first_name, ben.last_name)}
                      photo={ben.photo_url}
                      color={benColor}
                      size={50}
                      label={ben.first_name || ben.name?.split(' ')[0] || ''}
                      sublabel={`${relation}${age < 999 ? ` · ${age}` : ''}`}
                      badge={ben.is_primary ? 'P' : null}
                      isPrimary={ben.is_primary}
                      succRank={succRank}
                      testId={`tree-node-${ben.id}`}
                      onClick={() => onSelectBeneficiary?.(ben)}
                      onUpload={onUploadPhoto ? () => onUploadPhoto(ben.id) : undefined}
                    />
                  </div>
                );
              })}
            </div>
          </div>
          );
        })()}


        {sortedBens.length === 0 && (
          <div className="mt-4 text-center">
            <p className="text-xs text-[var(--t5)]">No beneficiaries added yet</p>
          </div>
        )}
      </div>

      {/* Legend — color key for benefactor + linked/unlinked */}
      <div className="flex flex-wrap items-center justify-center gap-x-5 gap-y-1.5 mt-4 px-2" data-testid="family-tree-legend">
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded-full" style={{ background: '#d4af37', boxShadow: '0 0 6px rgba(212,175,55,0.5)' }} />
          <span className="text-xs font-medium text-[var(--t3)]">You (Benefactor)</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded-full" style={{ background: LINKED_COLOR, boxShadow: `0 0 6px ${LINKED_COLOR}50` }} />
          <span className="text-xs font-medium text-[var(--t3)]">Linked — has their own login</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded-full" style={{ background: UNLINKED_COLOR, boxShadow: `0 0 6px ${UNLINKED_COLOR}50` }} />
          <span className="text-xs font-medium text-[var(--t3)]">Unlinked — no account yet</span>
        </div>
      </div>
    </div>
  );
};

export default FamilyTree;
