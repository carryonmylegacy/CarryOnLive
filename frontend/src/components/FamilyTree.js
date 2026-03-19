import React, { useRef, useState, useEffect, useCallback } from 'react';
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

// Ring mapping — matches OrbitVisualization logic
const getOrbitLevel = (relation) => {
  const raw = (relation || '').toLowerCase().trim();
  const parts = raw.includes('/') ? raw.split('/').map(p => p.trim()) : [raw];
  if (parts.some(p => p.includes('great-grand') || p.includes('great grand'))) return 3;
  const ring0 = ['spouse', 'wife', 'husband', 'partner', 'parent', 'mother', 'father', 'mom', 'dad'];
  if (parts.some(p => ring0.includes(p))) return 0;
  const ring1 = ['son', 'daughter', 'child', 'children', 'sibling', 'brother', 'sister',
    'grandparent', 'grandmother', 'grandfather', 'grandma', 'grandpa'];
  if (parts.some(p => ring1.includes(p))) return 1;
  const ring2 = ['grandchild', 'grandson', 'granddaughter', 'nephew', 'niece', 'uncle', 'aunt'];
  if (parts.some(p => ring2.includes(p))) return 2;
  if (raw.includes('in-law') || raw.includes('in law')) return 2;
  if (parts.some(p => ['friend', 'other'].includes(p))) return 3;
  return 2;
};

const ringColors = ['#d4af37', '#A855F7', '#14B8A6', '#3B82F6'];

// Linked/unlinked color coding for beneficiary nodes
const LINKED_COLOR = '#10b981';   // green — beneficiary has created their own login
const UNLINKED_COLOR = '#FF6B35'; // orange — beneficiary has NOT created their own login

const getBenLinkedColor = (ben) => {
  return (ben.user_id || ben.invitation_status === 'accepted') ? LINKED_COLOR : UNLINKED_COLOR;
};

const TreeNode = ({ initials, photo, color, label, sublabel, size = 60, badge, isPrimary, onClick, onUpload, testId }) => {
  const hasPhoto = !!photo;
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
    {label && isPrimary ? (
      <span className="text-[11px] font-bold whitespace-nowrap px-2 py-0.5 rounded-md text-center leading-tight" style={{ background: 'rgba(34,201,147,0.15)', color: '#22C993', border: '1px solid rgba(34,201,147,0.3)' }}>{label}</span>
    ) : label ? (
      <span className="text-xs font-semibold text-[var(--t)] text-center leading-tight w-full">{label}</span>
    ) : null}
    {sublabel && <span className="text-[11px] text-[var(--t4)] text-center leading-tight w-full">{sublabel}</span>}
  </div>
  );
};

const NODE_W = 88;  // fixed node container width — wide enough for "Grandmother · 89"
const NODE_GAP = 6;  // horizontal gap between nodes
const NODE_SLOT = NODE_W + NODE_GAP;

/**
 * Renders a single tier of beneficiaries with proper row-chunking
 * and horizontal branch bars that match the actual layout.
 */
const TierGroup = ({ bens, color, tierNum, onSelectBeneficiary, onUploadPhoto, isLight }) => {
  const containerRef = useRef(null);
  const [perRow, setPerRow] = useState(4);

  const measure = useCallback(() => {
    if (!containerRef.current) return;
    const w = containerRef.current.offsetWidth - 16; // minus px-2 padding
    setPerRow(Math.max(1, Math.floor((w + NODE_GAP) / NODE_SLOT)));
  }, []);

  useEffect(() => {
    measure();
    const ro = new ResizeObserver(measure);
    if (containerRef.current) ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, [measure]);

  // Chunk into visual rows
  const rows = [];
  for (let i = 0; i < bens.length; i += perRow) {
    rows.push(bens.slice(i, i + perRow));
  }

  return (
    <div ref={containerRef} className="flex flex-col items-center w-full" data-testid={`tree-tier-${tierNum}`}>
      {/* Vertical trunk from previous level */}
      <div style={{ width: 2, height: 24, background: color, opacity: isLight ? 0.6 : 0.5 }} />

      {/* Rows of beneficiaries */}
      {rows.map((row, rowIdx) => {
        const count = row.length;
        const barW = count > 1 ? (count - 1) * NODE_SLOT : 0;

        return (
          <div key={rowIdx} className="flex flex-col items-center w-full">
            {/* Vertical connector between rows (skip for first row) */}
            {rowIdx > 0 && (
              <div style={{ width: 2, height: 16, background: color, opacity: isLight ? 0.4 : 0.3 }} />
            )}

            {/* Horizontal branch bar — spans center-of-first to center-of-last */}
            {count > 1 && (
              <div className="flex justify-center w-full">
                <div style={{
                  width: barW,
                  height: 2,
                  background: color,
                  opacity: isLight ? 0.45 : 0.35,
                  borderRadius: 1,
                }} />
              </div>
            )}

            {/* Nodes in this row */}
            <div className="flex justify-center w-full" style={{ gap: `0 ${NODE_GAP}px` }}>
              {row.map(ben => {
                const benColor = getBenLinkedColor(ben);
                const age = getAge(ben.date_of_birth || ben.dob);
                const relation = ben.relation || '';
                return (
                  <div key={ben.id} className="flex flex-col items-center" style={{ width: NODE_W }}>
                    {/* Drop line */}
                    <div style={{ width: 2, height: 14, background: color, opacity: isLight ? 0.5 : 0.4 }} />
                    <TreeNode
                      initials={getInitials(ben.name, ben.first_name, ben.last_name)}
                      photo={ben.photo_url}
                      color={benColor}
                      size={54}
                      label={ben.first_name || ben.name?.split(' ')[0] || ''}
                      sublabel={`${relation}${age < 999 ? ` · ${age}` : ''}`}
                      badge={ben.is_primary ? 'P' : null}
                      isPrimary={ben.is_primary}
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
      })}
    </div>
  );
};

const FamilyTree = ({ user, beneficiaries, beneficiaryEstates, onSelectBeneficiary, onUploadPhoto, className }) => {
  const navigate = useNavigate();
  const { theme } = useTheme();
  const isLight = theme === 'light';

  const sortedBens = [...beneficiaries].sort((a, b) => {
    if (a.is_primary && !b.is_primary) return -1;
    if (!a.is_primary && b.is_primary) return 1;
    return getAge(a.date_of_birth || a.dob) - getAge(b.date_of_birth || b.dob);
  });

  // Group beneficiaries by orbit ring level
  const ringGroups = {};
  sortedBens.forEach(ben => {
    const level = getOrbitLevel(ben.relation);
    if (!ringGroups[level]) ringGroups[level] = [];
    ringGroups[level].push(ben);
  });
  const activeRings = Object.keys(ringGroups).map(Number).sort((a, b) => a - b);

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
            {/* Estate nodes */}
            <div className="relative flex flex-wrap justify-center gap-3 pt-1 pb-1 px-2" style={{ zIndex: 2 }}>
              {benEstates.map(est => (
                <TreeNode
                  key={est.id}
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
              ))}
            </div>

            {/* Converging lines SVG */}
            <svg
              className="w-full pointer-events-none"
              viewBox={`0 0 ${vb} 80`}
              preserveAspectRatio="xMidYMid meet"
              style={{ height: svgH, position: 'relative', zIndex: 1 }}
            >
              <defs>
                <linearGradient id="lineFlow" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={isLight ? '#2563EB' : '#60A5FA'} stopOpacity={isLight ? 0.35 : 0.25} />
                  <stop offset="100%" stopColor={isLight ? '#b8860b' : '#d4af37'} stopOpacity={isLight ? 0.25 : 0.15} />
                </linearGradient>
                <filter id="lineGlow">
                  <feGaussianBlur stdDeviation={isLight ? '1' : '1.5'} result="blur" />
                  <feMerge>
                    <feMergeNode in="blur" />
                    <feMergeNode in="SourceGraphic" />
                  </feMerge>
                </filter>
              </defs>
              {(() => {
                // Generate approximate X positions for each estate
                // Estates wrap in rows of `cols`. For each estate, calculate its
                // horizontal center as a fraction of the container width.
                const rows = Math.ceil(n / cols);
                const lines = [];
                for (let i = 0; i < n; i++) {
                  const row = Math.floor(i / cols);
                  const inRow = n - row * cols; // items in this row
                  const actual = Math.min(inRow, cols);
                  const col = i % cols;
                  // Spread nodes evenly across the viewBox width
                  const x = actual === 1
                    ? cx
                    : 60 + (col / (actual - 1)) * (vb - 120);
                  // Y start depends on which row the estate is in
                  const y0 = row * (30 / rows);
                  lines.push(
                    <path
                      key={i}
                      d={`M ${x},${y0} C ${x},${y0 + 30} ${cx},55 ${cx},78`}
                      fill="none"
                      stroke="url(#lineFlow)"
                      strokeWidth={isLight ? '1' : '0.7'}
                      filter="url(#lineGlow)"
                    />
                  );
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

        {/* All beneficiaries — flat, all connecting directly to benefactor */}
        {sortedBens.length > 0 && (
          <TierGroup
            bens={sortedBens}
            color="#d4af37"
            tierNum={1}
            onSelectBeneficiary={onSelectBeneficiary}
            onUploadPhoto={onUploadPhoto}
            isLight={isLight}
          />
        )}

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
