import React from 'react';
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

  // Use the beneficiaries in the order the benefactor has arranged them (drag-to-reorder tiles)
  const sortedBens = beneficiaries;

  const benEstates = beneficiaryEstates || [];

  return (
    <div className={className} data-testid="family-tree">
      {/* Beneficiary estates with converging lines to benefactor */}
      {benEstates.length > 0 && (() => {
        const n = benEstates.length;
        // Each estate node is ~110px wide with gap. Calculate positions for SVG lines.
        // We lay out estates in rows of 3 on mobile. Each line flows from its
        // approximate horizontal position down to the center bottom.
        const cols = Math.min(n, 3);
        const vb = 400; // viewBox width
        const cx = vb / 2;
        const svgH = n <= 3 ? 50 : 60;

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

            {/* Converging lines SVG — blue glow brush-stroke bundles */}
            <svg
              className="w-full pointer-events-none"
              viewBox={`0 0 ${vb} 80`}
              preserveAspectRatio="xMidYMid meet"
              style={{ height: svgH, position: 'relative', zIndex: 1 }}
            >
              <defs>
                <linearGradient id="lineFlow" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={isLight ? '#3B82F6' : '#60A5FA'} stopOpacity={isLight ? 0.5 : 0.4} />
                  <stop offset="100%" stopColor={isLight ? '#2563EB' : '#93C5FD'} stopOpacity={isLight ? 0.15 : 0.08} />
                </linearGradient>
                <filter id="lineGlow">
                  <feGaussianBlur stdDeviation={isLight ? '2' : '2.5'} result="blur" />
                  <feMerge>
                    <feMergeNode in="blur" />
                    <feMergeNode in="SourceGraphic" />
                  </feMerge>
                </filter>
              </defs>
              {(() => {
                const rows = Math.ceil(n / cols);
                const lines = [];
                for (let i = 0; i < n; i++) {
                  const row = Math.floor(i / cols);
                  const inRow = n - row * cols;
                  const actual = Math.min(inRow, cols);
                  const col = i % cols;
                  const x = actual === 1
                    ? cx
                    : 60 + (col / (actual - 1)) * (vb - 120);
                  const y0 = row * (30 / rows);
                  // Brush-stroke bundle: 3 curves that fan at the estate end, converge at benefactor center
                  const strokes = [-1, 0, 1];
                  strokes.forEach((s, si) => {
                    const spread = 8;
                    const xo = x + s * spread; // fan out at estate end
                    lines.push(
                      <path
                        key={`${i}-${si}`}
                        d={`M ${xo},${y0} C ${xo},${y0 + 30} ${cx},55 ${cx},78`}
                        fill="none"
                        stroke="url(#lineFlow)"
                        strokeWidth={isLight ? '1' : '0.7'}
                        filter="url(#lineGlow)"
                      />
                    );
                  });
                }
                return lines;
              })()}
            </svg>
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

        {/* Gold glow brush-stroke arcs fanning to beneficiaries — matched to upper blue arcs */}
        {sortedBens.length > 0 && (() => {
          const n = sortedBens.length;
          const cols = 2;
          const vbW = 300;
          const vbH = 80;
          const cx = vbW / 2;
          const arcPaths = [];
          for (let i = 0; i < n; i++) {
            const isOddLast = n % 2 !== 0 && i === n - 1;
            const col = i % cols;
            const endX = isOddLast ? cx : (col === 0 ? vbW * 0.2 : vbW * 0.8);
            // Brush-stroke bundle: 3 curves that fan at beneficiary end, converge at benefactor
            const strokes = [-1, 0, 1];
            strokes.forEach(s => {
              const spread = 8;
              const endXo = endX + s * spread;
              arcPaths.push(`M ${cx},0 C ${cx},${vbH * 0.35} ${endXo},${vbH * 0.6} ${endXo},${vbH}`);
            });
          }
          const goldStart = isLight ? '#b8860b' : '#d4af37';
          const goldEnd = isLight ? '#d4af37' : '#FFD700';

          return (
          <div className="w-full" style={{ maxWidth: 340 }} data-testid="tree-spine">
            {/* SVG curved arc bundles fanning from benefactor — gold glow */}
            <div className="flex justify-center" style={{ marginTop: 6, marginBottom: -6, position: 'relative', zIndex: 0 }}>
              <svg viewBox={`0 0 ${vbW} ${vbH}`} preserveAspectRatio="xMidYMid meet" style={{ width: '100%', height: 60 }} className="overflow-visible">
                <defs>
                  <linearGradient id="ftGoldGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={goldStart} stopOpacity={isLight ? 0.5 : 0.4} />
                    <stop offset="100%" stopColor={goldEnd} stopOpacity={isLight ? 0.15 : 0.08} />
                  </linearGradient>
                  <filter id="ftGoldGlow">
                    <feGaussianBlur stdDeviation={isLight ? '2' : '2.5'} result="blur" />
                    <feMerge>
                      <feMergeNode in="blur" />
                      <feMergeNode in="SourceGraphic" />
                    </feMerge>
                  </filter>
                </defs>
                {arcPaths.map((d, i) => (
                  <path key={i} d={d} fill="none" stroke="url(#ftGoldGrad)" strokeWidth={isLight ? '1' : '0.7'} filter="url(#ftGoldGlow)" />
                ))}
              </svg>
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
