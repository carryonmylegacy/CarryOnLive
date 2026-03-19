import React, { useRef, useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Camera, Users } from 'lucide-react';
import { resolvePhotoUrl } from '../utils/photoUrl';

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
            border: isPrimary ? '2.5px solid var(--gold)' : `2.5px solid ${color}`,
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
          <div className="absolute -top-1 -right-1 w-5 h-5 rounded-full flex items-center justify-center text-[8px] font-black" style={{ background: '#d4af37', color: '#080e1a' }}>
            {badge}
          </div>
        )}
      </div>
    {label && isPrimary ? (
      <span className="text-[9px] font-bold whitespace-nowrap px-2 py-0.5 rounded-md text-center leading-tight" style={{ background: 'rgba(34,201,147,0.15)', color: '#22C993', border: '1px solid rgba(34,201,147,0.3)' }}>{label}</span>
    ) : label ? (
      <span className="text-[10px] font-semibold text-[var(--t)] text-center leading-tight">{label}</span>
    ) : null}
    {sublabel && <span className="text-[8px] text-[#64748B] text-center leading-tight">{sublabel}</span>}
  </div>
  );
};

const NODE_W = 76;  // fixed node container width
const NODE_GAP = 12; // horizontal gap between nodes
const NODE_SLOT = NODE_W + NODE_GAP;

/**
 * Renders a single tier of beneficiaries with proper row-chunking
 * and horizontal branch bars that match the actual layout.
 */
const TierGroup = ({ bens, color, tierNum, onSelectBeneficiary, onUploadPhoto }) => {
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
      <div style={{ width: 2, height: 24, background: color, opacity: 0.5 }} />

      {/* Tier label */}
      <div className="mb-1">
        <span className="text-[9px] font-bold uppercase tracking-wider px-2.5 py-0.5 rounded-full"
          style={{ color, background: color + '15', border: `1px solid ${color}30` }}>
          Tier {tierNum}
        </span>
      </div>

      {/* Rows of beneficiaries */}
      {rows.map((row, rowIdx) => {
        const count = row.length;
        const barW = count > 1 ? (count - 1) * NODE_SLOT : 0;

        return (
          <div key={rowIdx} className="flex flex-col items-center w-full">
            {/* Vertical connector between rows (skip for first row) */}
            {rowIdx > 0 && (
              <div style={{ width: 2, height: 16, background: color, opacity: 0.3 }} />
            )}

            {/* Horizontal branch bar — spans center-of-first to center-of-last */}
            {count > 1 && (
              <div className="flex justify-center w-full">
                <div style={{
                  width: barW,
                  height: 2,
                  background: color,
                  opacity: 0.35,
                  borderRadius: 1,
                }} />
              </div>
            )}

            {/* Nodes in this row */}
            <div className="flex justify-center w-full" style={{ gap: `0 ${NODE_GAP}px` }}>
              {row.map(ben => {
                const benColor = ben.avatar_color || color;
                const age = getAge(ben.date_of_birth || ben.dob);
                const relation = ben.relation || '';
                return (
                  <div key={ben.id} className="flex flex-col items-center" style={{ width: NODE_W }}>
                    {/* Drop line */}
                    <div style={{ width: 2, height: 14, background: benColor, opacity: 0.4 }} />
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
      {/* Beneficiary estates with flowing funnel to benefactor */}
      {benEstates.length > 0 && (() => {
        const n = benEstates.length;
        // Adaptive spread: 1 estate = narrow, 6+ = full width
        const spread = n === 1 ? 0.2 : n === 2 ? 0.4 : n <= 4 ? 0.7 : 0.9;
        const cx = 200; // center X in viewBox
        const left = cx - (cx * spread);
        const right = cx + (cx * spread);
        // Control point inset — how far inside the curves bend
        const cpIn = cx * 0.4;
        return (
          <div className="relative pb-4">
            {/* Estate nodes */}
            <div className="relative flex flex-wrap justify-center gap-3 pt-1 pb-2 px-2" style={{ zIndex: 2 }}>
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

            {/* Adaptive funnel SVG */}
            <svg
              className="w-full pointer-events-none"
              viewBox="0 0 400 80"
              preserveAspectRatio="xMidYMid meet"
              style={{ height: n === 1 ? 36 : 48, marginTop: -2, position: 'relative', zIndex: 1 }}
            >
              <defs>
                <linearGradient id="funnelFlow" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#60A5FA" stopOpacity="0.10" />
                  <stop offset="50%" stopColor="#60A5FA" stopOpacity="0.05" />
                  <stop offset="100%" stopColor="#d4af37" stopOpacity="0.03" />
                </linearGradient>
                <linearGradient id="funnelStroke" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#60A5FA" stopOpacity="0.18" />
                  <stop offset="100%" stopColor="#d4af37" stopOpacity="0.12" />
                </linearGradient>
                <filter id="funnelGlow">
                  <feGaussianBlur stdDeviation="2.5" result="blur" />
                  <feMerge>
                    <feMergeNode in="blur" />
                    <feMergeNode in="SourceGraphic" />
                  </feMerge>
                </filter>
              </defs>
              {/* Filled shape */}
              <path
                d={`M ${left},0 C ${left},28 ${cx - cpIn},62 ${cx},78 C ${cx + cpIn},62 ${right},28 ${right},0 Z`}
                fill="url(#funnelFlow)"
              />
              {/* Left edge */}
              <path
                d={`M ${left},0 C ${left},28 ${cx - cpIn},62 ${cx},78`}
                fill="none" stroke="url(#funnelStroke)" strokeWidth="0.8" filter="url(#funnelGlow)"
              />
              {/* Right edge */}
              <path
                d={`M ${right},0 C ${right},28 ${cx + cpIn},62 ${cx},78`}
                fill="none" stroke="url(#funnelStroke)" strokeWidth="0.8" filter="url(#funnelGlow)"
              />
              {/* Convergence glow */}
              <circle cx={cx} cy="78" r="2" fill="#d4af37" opacity="0.25" filter="url(#funnelGlow)" />
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

        {/* Tier rows below the benefactor */}
        {activeRings.length > 0 && (
          <div className="flex flex-col items-center w-full">
            {activeRings.map((ringLevel, ringIdx) => {
              const bens = ringGroups[ringLevel];
              const color = ringColors[ringLevel] || ringColors[0];
              const tierNum = ringIdx + 1;
              return (
                <TierGroup
                  key={ringLevel}
                  bens={bens}
                  color={color}
                  tierNum={tierNum}
                  onSelectBeneficiary={onSelectBeneficiary}
                  onUploadPhoto={onUploadPhoto}
                />
              );
            })}
          </div>
        )}

        {sortedBens.length === 0 && (
          <div className="mt-4 text-center">
            <p className="text-xs text-[var(--t5)]">No beneficiaries added yet</p>
          </div>
        )}
      </div>

      {benEstates.length > 0 && (
        <p className="text-[9px] text-[var(--t5)] text-center mt-3">
          Blue = estates where you're a beneficiary (click to view)
        </p>
      )}
    </div>
  );
};

export default FamilyTree;
