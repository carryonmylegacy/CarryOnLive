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

  useEffect(() => {
    const el = treeRef.current;
    if (!el) return;
    // Find the actual scrollable ancestor (may not be window)
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
    const handleScroll = () => {
      const rect = el.getBoundingClientRect();
      const vh = window.innerHeight;
      if (rect.top > vh) return;
      if (initialTopRef.current === null) initialTopRef.current = rect.top;
      const scrollDist = Math.max(0, initialTopRef.current - rect.top);
      const totalDist = 500;
      const raw = scrollDist / totalDist;

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
        const vbW = 300;
        const vbH = 50;
        const cx = vbW / 2;
        const svgH = Math.min(60, 30 + n * 7);
        const strokesPerBundle = 8;
        const brushSpread = 2.5;
        const upperLeftTarget = vbW * 0.25;
        const upperRightTarget = vbW * 0.75;

        return (
          <div className="relative pb-2">
            {/* Estate nodes — two aligned columns */}
            <div className="relative pt-1 pb-1 px-2" style={{ zIndex: 2 }}>
              {(() => {
                const rows = [];
                for (let i = 0; i < benEstates.length; i += 2) {
                  rows.push(benEstates.slice(i, i + 2));
                }
                return rows.map((row, rIdx) => (
                  <div key={rIdx} className="flex justify-center gap-4 mb-2">
                    {row.map(est => (
                      <div key={est.id} style={{ width: 160, display: 'flex', justifyContent: 'center' }}>
                        <TreeNode
                          initials={<Users className="w-3.5 h-3.5" />}
                          photo={est.estate_photo_url || est.owner_photo_url}
                          color="#60A5FA"
                          size={40}
                          label={est.name?.split("'")[0] || 'Estate'}
                          sublabel="Beneficiary"
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
                    {/* Spacer for odd last row */}
                    {row.length === 1 && <div style={{ width: 160 }} />}
                  </div>
                ));
              })()}
            </div>

            {/* Converging lines SVG — blue glow brush-stroke bundles mirroring lower gold arcs */}
            <svg
              className="w-full pointer-events-none"
              viewBox={`0 0 ${vbW} ${vbH}`}
              preserveAspectRatio="xMidYMid meet"
              style={{ height: svgH, position: 'relative', zIndex: 1, marginTop: -8 }}
              dangerouslySetInnerHTML={{ __html: (() => {
                const gradColor1 = isLight ? '#3B82F6' : '#60A5FA';
                const gradColor2 = isLight ? '#2563EB' : '#93C5FD';
                const gradOp1 = isLight ? 0.25 : 0.18;
                const gradOp2 = isLight ? 0.08 : 0.04;
                const blurDev = isLight ? 1.5 : 2;
                const sw = isLight ? 0.7 : 0.5;
                const lightColor = isLight ? 'rgba(100,160,255,0.45)' : 'rgba(160,200,255,0.4)';
                const overlayW = isLight ? 1.0 : 0.8;
                const yBot = vbH - 2;
                const yMid = Math.round(vbH * 0.7);
                const yUp = Math.round(vbH * 0.375);
                let svgContent = `
                  <defs>
                    <linearGradient id="lineFlow" x1="0" y1="1" x2="0" y2="0">
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
                for (let s = 0; s < strokesPerBundle; s++) {
                  const offset = (s - (strokesPerBundle - 1) / 2) * brushSpread;
                  const xoL = upperLeftTarget + offset;
                  const cp1xL = cx + (xoL - cx) * 0.35;
                  svgContent += `<path d="M ${cx},${yBot} C ${cp1xL},${yMid} ${xoL},${yUp} ${xoL},0" fill="none" stroke="url(#lineFlow)" stroke-width="${sw}" filter="url(#lineGlow)" />`;
                  const xoR = upperRightTarget + offset;
                  const cp1xR = cx + (xoR - cx) * 0.35;
                  svgContent += `<path d="M ${cx},${yBot} C ${cp1xR},${yMid} ${xoR},${yUp} ${xoR},0" fill="none" stroke="url(#lineFlow)" stroke-width="${sw}" filter="url(#lineGlow)" />`;
                }
                for (let s = 0; s < strokesPerBundle; s++) {
                  const offset = (s - (strokesPerBundle - 1) / 2) * brushSpread;
                  const xoL = upperLeftTarget + offset;
                  const cp1xL = cx + (xoL - cx) * 0.35;
                  svgContent += `<path class="fill-path-blue" d="M ${xoL},0 C ${xoL},${yUp} ${cp1xL},${yMid} ${cx},${yBot}" fill="none" stroke="${lightColor}" stroke-width="${overlayW}" pathLength="1" stroke-dasharray="1" stroke-dashoffset="1" filter="url(#lightPulseBlue)" />`;
                  const xoR = upperRightTarget + offset;
                  const cp1xR = cx + (xoR - cx) * 0.35;
                  svgContent += `<path class="fill-path-blue" d="M ${xoR},0 C ${xoR},${yUp} ${cp1xR},${yMid} ${cx},${yBot}" fill="none" stroke="${lightColor}" stroke-width="${overlayW}" pathLength="1" stroke-dasharray="1" stroke-dashoffset="1" filter="url(#lightPulseBlue)" />`;
                }
                svgContent += `<circle class="flash-blue" cx="${cx}" cy="${vbH-4}" r="6" fill="${lightColor}" opacity="0" filter="url(#lightPulseBlue)" />`;
                return svgContent;
              })() }}
            />
          </div>
        );
      })()}

      {/* Root node (benefactor) */}
      <div className="flex flex-col items-center">
        <TreeNode
          initials={getInitials(user?.name, user?.first_name, user?.last_name)}
          photo={user?.photo_url}
          color="#d4af37"
          size={60}
          label={user?.first_name || user?.name?.split(' ')[0] || 'You'}
          sublabel="Benefactor"
          testId="tree-root-node"
        />

        {/* Gold glow brush-stroke arcs fanning to beneficiaries — exact mirror of upper blue arcs */}
        {sortedBens.length > 0 && (() => {
          const n = sortedBens.length;
          const vbW = 300;
          const vbH = 50;
          const cx = vbW / 2;
          const arcPaths = [];
          const leftTarget = vbW * 0.25;
          const rightTarget = vbW * 0.75;
          const strokesPerBundle = 8;
          const spread = 2.5;
          const yCtrl = Math.round(vbH * 0.275);
          const yMidL = Math.round(vbH * 0.6);
          const yEndL = vbH - 2;
          // Left bundle — fans from center (cx,0) down to left column
          for (let s = 0; s < strokesPerBundle; s++) {
            const offset = (s - (strokesPerBundle - 1) / 2) * spread;
            const xo = leftTarget + offset;
            const cp1x = cx + (xo - cx) * 0.35;
            arcPaths.push(`M ${cx},0 C ${cp1x},${yCtrl} ${xo},${yMidL} ${xo},${yEndL}`);
          }
          // Right bundle — mirrors left, fans to right column
          for (let s = 0; s < strokesPerBundle; s++) {
            const offset = (s - (strokesPerBundle - 1) / 2) * spread;
            const xo = rightTarget + offset;
            const cp1x = cx + (xo - cx) * 0.35;
            arcPaths.push(`M ${cx},0 C ${cp1x},${yCtrl} ${xo},${yMidL} ${xo},${yEndL}`);
          }
          const goldStart = isLight ? '#b8860b' : '#d4af37';
          const goldEnd = isLight ? '#d4af37' : '#FFD700';
          const lowerSvgH = Math.min(60, 30 + n * 7);

          return (
          <div className="w-full" style={{ maxWidth: 340 }} data-testid="tree-spine">
            {/* SVG — symmetric with upper */}
            <div className="flex justify-center" style={{ marginTop: 10, marginBottom: -8, position: 'relative', zIndex: 0 }}>
              <svg viewBox={`0 0 ${vbW} ${vbH}`} preserveAspectRatio="xMidYMid meet" style={{ width: '100%', height: lowerSvgH }} className="overflow-visible"
                dangerouslySetInnerHTML={{ __html: (() => {
                  const blurDev = isLight ? 1.5 : 2;
                  const sw = isLight ? 0.7 : 0.5;
                  const lightColor = isLight ? 'rgba(200,170,50,0.45)' : 'rgba(255,230,140,0.4)';
                  const overlayW = isLight ? 1.0 : 0.8;
                  let svg = `
                    <defs>
                      <linearGradient id="ftGoldGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stop-color="${goldStart}" stop-opacity="${isLight ? 0.25 : 0.18}" />
                        <stop offset="100%" stop-color="${goldEnd}" stop-opacity="${isLight ? 0.08 : 0.04}" />
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
                  arcPaths.forEach(d => {
                    svg += `<path d="${d}" fill="none" stroke="url(#ftGoldGrad)" stroke-width="${sw}" filter="url(#ftGoldGlow)" />`;
                  });
                  svg += `<circle class="flash-gold-origin" cx="${cx}" cy="2" r="6" fill="${lightColor}" opacity="0" filter="url(#lightPulseGold)" />`;
                  arcPaths.forEach(d => {
                    svg += `<path class="fill-path-gold" d="${d}" fill="none" stroke="${lightColor}" stroke-width="${overlayW}" pathLength="1" stroke-dasharray="1" stroke-dashoffset="1" filter="url(#lightPulseGold)" />`;
                  });
                  svg += `<circle class="flash-gold-end" cx="${leftTarget}" cy="${vbH-4}" r="6" fill="${lightColor}" opacity="0" filter="url(#lightPulseGold)" />`;
                  svg += `<circle class="flash-gold-end" cx="${rightTarget}" cy="${vbH-4}" r="6" fill="${lightColor}" opacity="0" filter="url(#lightPulseGold)" />`;
                  return svg;
                })() }}
              />
            </div>

            {/* Beneficiary grid — 2 columns */}
            <div className="grid gap-y-3 gap-x-2 px-1" style={{ gridTemplateColumns: 'repeat(2, 1fr)', position: 'relative', zIndex: 1 }}>
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
