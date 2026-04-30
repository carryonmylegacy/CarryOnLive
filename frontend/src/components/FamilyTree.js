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
            <img
              src={resolvePhotoUrl(photo)}
              alt=""
              className="w-full h-full object-cover"
              // Top-biased crop matches the AvatarCircle + messages
              // recipient avatar so portrait-framed photos display the
              // face inside the circle instead of white space.
              style={{ objectPosition: 'center 30%' }}
              onError={(e) => {
                // Photo load failed (S3 expired presigned URL, CORS
                // blip, 404). Replace with the initials fallback
                // inline so we never render an empty ring — observed
                // Emma's node showing as a blank circle during the
                // B2B pitch screenshot.
                const host = e.currentTarget.parentElement;
                if (host) {
                  host.style.background = color + '25';
                  e.currentTarget.remove();
                  if (typeof initials === 'string' && initials) {
                    const span = document.createElement('span');
                    span.className = 'relative z-10';
                    span.style.fontWeight = '700';
                    span.textContent = initials;
                    host.appendChild(span);
                  }
                }
              }}
            />
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

  // Trigger animation when tree enters viewport via IntersectionObserver
  useEffect(() => {
    const el = treeRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setTimeout(() => el.classList.add('tree-animate'), 400);
          observer.disconnect();
        }
      },
      { threshold: 0.15 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // Use the beneficiaries in the order the benefactor has arranged them (drag-to-reorder tiles)
  const sortedBens = beneficiaries;

  const benEstates = beneficiaryEstates || [];

  return (
    <div ref={treeRef} className={className} data-testid="family-tree">
      {/* CSS keyframe animations — compositor-accelerated, zero JS overhead */}
      <style>{`
        @keyframes ftDashReveal {
          to { stroke-dashoffset: 0; }
        }
        @keyframes ftFlash {
          0%   { opacity: 0; }
          25%  { opacity: 1; }
          100% { opacity: 0; }
        }
        @keyframes ftFadeIn {
          to { opacity: 1; }
        }
        /* Lightweight GPU glow on animated overlay paths — replaces expensive SVG feGaussianBlur */
        .fill-path-blue, .fill-path-gold {
          filter: drop-shadow(0 0 3px currentColor);
        }
        .flash-blue, .flash-gold-origin, .flash-gold-end {
          filter: drop-shadow(0 0 6px currentColor);
        }
        /* Blue upper paths — estate branches converge to benefactor */
        .tree-animate .fill-path-blue {
          animation: ftDashReveal 1.8s cubic-bezier(0.25, 0.1, 0.25, 1) forwards;
        }
        .tree-animate .fill-line-blue {
          animation: ftFadeIn 1.8s cubic-bezier(0.25, 0.1, 0.25, 1) forwards;
        }
        .tree-animate .flash-blue {
          animation: ftFlash 0.7s ease-out 1.75s forwards;
        }
        /* Gold lower paths — benefactor branches to beneficiaries */
        .tree-animate .flash-gold-origin {
          animation: ftFlash 0.7s ease-out 1.75s forwards;
        }
        .tree-animate .fill-path-gold {
          animation: ftDashReveal 1.6s cubic-bezier(0.25, 0.1, 0.25, 1) 1.9s forwards;
        }
        .tree-animate .fill-line-gold {
          animation: ftFadeIn 1.6s cubic-bezier(0.25, 0.1, 0.25, 1) 1.9s forwards;
        }
        .tree-animate .flash-gold-end {
          animation: ftFlash 0.7s ease-out 3.45s forwards;
        }
      `}</style>
      {/* Beneficiary estates with converging lines to benefactor */}
      {benEstates.length > 0 && (() => {
        const n = benEstates.length;
        const numRows = Math.ceil(n / 2);
        const vbW = 100;
        const vbH = 100;
        const cx = vbW / 2;
        const leftCol = 21;
        const rightCol = 79;
        const circleR = 7;
        const estRowH = 80;
        const trailPx = 50;
        const totalEstH = numRows * estRowH + trailPx;
        const nodeZone = (numRows * estRowH / totalEstH) * 100;
        const rowH = nodeZone / numRows;

        return (
          <div className="relative" style={{ paddingBottom: trailPx, maxWidth: 380, margin: '0 auto' }}>
            {/* Full-height SVG overlay behind nodes — strands run through center gap */}
            <svg
              className="absolute pointer-events-none overflow-visible"
              viewBox={`0 0 ${vbW} ${vbH}`}
              preserveAspectRatio="none"
              style={{ top: 0, left: 0, width: '100%', height: '100%', zIndex: 1, willChange: 'transform', transform: 'translateZ(0)' }}
            >
              {(() => {
                const gradColor1 = isLight ? '#3B82F6' : '#60A5FA';
                const gradColor2 = isLight ? '#2563EB' : '#93C5FD';
                const gradOp1 = isLight ? 0.18 : 0.12;
                const gradOp2 = isLight ? 0.06 : 0.03;
                const blurDev = isLight ? 1.5 : 2;
                const sw = isLight ? 0.6 : 0.5;
                const lightColor = isLight ? 'rgba(100,160,255,0.3)' : 'rgba(160,200,255,0.25)';
                const overlayW = isLight ? 0.8 : 0.7;
                // All paths flow from estate circles down to convergence point near Pete
                // Odd estate goes to LEFT column (no centering) — asymmetric layout
                const allPaths = [];
                for (let idx = 0; idx < n; idx++) {
                  const rIdx = Math.floor(idx / 2);
                  const isLeft = idx % 2 === 0;
                  const nodeX = isLeft ? leftCol : rightCol;
                  const dir = isLeft ? 1 : -1;
                  const rowCenterY = (rIdx + 0.3) * rowH;
                  const sx = nodeX + dir * circleR;
                  const cp1x = sx + 0.6 * (cx - sx);
                  const cp2y = rowCenterY + 0.5 * (97 - rowCenterY);
                  allPaths.push(`M ${sx.toFixed(1)},${rowCenterY.toFixed(1)} C ${cp1x.toFixed(1)},${rowCenterY.toFixed(1)} ${cx.toFixed(1)},${cp2y.toFixed(1)} ${cx.toFixed(1)},97`);
                }
                return (
                  <>
                    <defs>
                      <linearGradient id="lineFlow" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={gradColor1} stopOpacity={gradOp1} />
                        <stop offset="100%" stopColor={gradColor2} stopOpacity={gradOp2} />
                      </linearGradient>
                      <filter id="lineGlow" x="-50%" y="-50%" width="200%" height="200%">
                        <feGaussianBlur stdDeviation={blurDev} result="blur" />
                        <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
                      </filter>
                    </defs>
                    {allPaths.map((d, i) => (
                      <path key={`bp-${i}`} d={d} fill="none" stroke="url(#lineFlow)" strokeWidth={sw} filter="url(#lineGlow)" />
                    ))}
                    {allPaths.map((d, i) => (
                      <path key={`bf-${i}`} className="fill-path-blue" d={d} fill="none" stroke={lightColor} strokeWidth={overlayW} pathLength="1" strokeDasharray="1" strokeDashoffset="1" />
                    ))}
                    <circle className="flash-blue" cx={cx} cy={96} r={4} fill={lightColor} opacity={0} />
                  </>
                );
              })()}
            </svg>

            {/* No centered estate connector needed — odd estates go to left column */}

            {/* Estate nodes — two columns with wide center gap */}
            <div className="relative grid px-1" style={{ gridTemplateColumns: '1fr 1fr', columnGap: '20%', rowGap: 10, justifyItems: 'center', zIndex: 2 }}>
              {benEstates.map((est, idx) => {
                const nameWords = (est.name || 'Estate').split(' ');
                const labelTop = nameWords.length > 2 ? nameWords.slice(0, -1).join(' ') : nameWords.join(' ');
                const labelBottom = nameWords.length > 2 ? nameWords.slice(-1)[0] : '';
                return (
                <div key={est.id}>
                  <TreeNode
                    initials={<Users className="w-3.5 h-3.5" />}
                    photo={est.estate_photo_url || est.owner_photo_url}
                    color="#60A5FA"
                    size={50}
                    label={labelTop}
                    sublabel={labelBottom}
                    testId={`tree-estate-${est.id}`}
                    onClick={() => {
                      localStorage.setItem('beneficiary_estate_id', est.id);
                      localStorage.removeItem('selected_estate_id');
                      navigate('/beneficiary');
                      window.location.reload();
                    }}
                  />
                </div>
                );
              })}
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
              onClick={() => navigate('/settings')}
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
              style={{ top: 0, left: 0, width: '100%', height: '100%', zIndex: 0, willChange: 'transform', transform: 'translateZ(0)' }}
            >
              {(() => {
                const blurDev = isLight ? 1.5 : 2;
                const sw = isLight ? 0.6 : 0.5;
                const lightColor = isLight ? 'rgba(200,170,50,0.3)' : 'rgba(255,230,140,0.25)';
                const overlayW = isLight ? 0.8 : 0.7;
                // All paths fan from ONE point (cx,2) downward — original pattern
                const allPaths = [];
                const endpoints = [];
                for (let idx = 0; idx < n; idx++) {
                  const rIdx = Math.floor(idx / 2);
                  const isLeft = idx % 2 === 0;
                  const isCentered = (n % 2 !== 0 && idx === n - 1);
                  const nodeX = isCentered ? cx : (isLeft ? leftCol : rightCol);
                  const dir = isCentered ? 0 : (isLeft ? 1 : -1);
                  const rowCenterY = topTrail + (rIdx + 0.3) * rowH;
                  if (isCentered) {
                    // Compute circle-top in VB coords using actual pixel layout
                    // (accounts for CSS grid rowGap: 12px between rows)
                    const fullRows = Math.floor(idx / 2);
                    const containerH = trailPx + numBenRows * estRowH + Math.max(0, numBenRows - 1) * 12;
                    const circleTopPx = trailPx + fullRows * (estRowH + 12);
                    const circleTopVB = (circleTopPx / containerH) * vbH;
                    allPaths.push(`M ${cx.toFixed(1)},2 L ${cx.toFixed(1)},${circleTopVB.toFixed(1)}`);
                    endpoints.push({ x: cx, y: circleTopVB });
                  } else {
                    const ex = nodeX + dir * circleR;
                    const cp1y = 2 + 0.5 * (rowCenterY - 2);
                    const cp2x = ex + 0.6 * (cx - ex);
                    allPaths.push(`M ${cx.toFixed(1)},2 C ${cx.toFixed(1)},${cp1y.toFixed(1)} ${cp2x.toFixed(1)},${rowCenterY.toFixed(1)} ${ex.toFixed(1)},${rowCenterY.toFixed(1)}`);
                    endpoints.push({ x: ex, y: rowCenterY });
                  }
                }
                return (
                  <>
                    <defs>
                      <linearGradient id="ftGoldGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={goldStart} stopOpacity={isLight ? 0.18 : 0.12} />
                        <stop offset="100%" stopColor={goldEnd} stopOpacity={isLight ? 0.06 : 0.03} />
                      </linearGradient>
                      <filter id="ftGoldGlow" x="-50%" y="-50%" width="200%" height="200%">
                        <feGaussianBlur stdDeviation={blurDev} result="blur" />
                        <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
                      </filter>
                    </defs>
                    {allPaths.map((d, i) => (
                      <path key={`gp-${i}`} d={d} fill="none" stroke="url(#ftGoldGrad)" strokeWidth={sw} filter="url(#ftGoldGlow)" />
                    ))}
                    <circle className="flash-gold-origin" cx={cx} cy={2} r={4} fill={lightColor} opacity={0} />
                    {allPaths.map((d, i) => (
                      <path key={`gf-${i}`} className="fill-path-gold" d={d} fill="none" stroke={lightColor} strokeWidth={overlayW} pathLength="1" strokeDasharray="1" strokeDashoffset="1" />
                    ))}
                    {endpoints.map((p, i) => (
                      <circle key={`ge-${i}`} className="flash-gold-end" cx={Number(p.x.toFixed(1))} cy={Number(p.y.toFixed(1))} r={3} fill={lightColor} opacity={0} />
                    ))}
                  </>
                );
              })()}
            </svg>

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
          <span className="text-xs font-medium text-[var(--t3)]">Unlinked — has not registered yet</span>
        </div>
      </div>
      <p className="text-[11px] text-center mt-2 italic" style={{ color: isLight ? '#1e3a5f' : '#d4af37' }}>Tap a beneficiary's icon to edit their information</p>
    </div>
  );
};

export default FamilyTree;
