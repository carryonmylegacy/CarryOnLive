import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Shield, Users } from 'lucide-react';

/**
 * Static family tree component for the Benefactor portal.
 * Shows: benefactor at center/top → owned-estate beneficiaries branching below.
 * Also shows estates where the benefactor is a beneficiary (above or beside).
 * Clicking a beneficiary node → onSelectBeneficiary(ben)
 * Clicking a beneficiary-estate node → navigates to that estate's beneficiary portal
 */

const FamilyTree = ({ user, beneficiaries, beneficiaryEstates, onSelectBeneficiary, className }) => {
  const navigate = useNavigate();
  const svgRef = useRef(null);
  const containerRef = useRef(null);
  const [dims, setDims] = useState({ w: 400, h: 300 });

  // Sort: primary first, then by age (youngest → oldest)
  const getAge = (dob) => {
    if (!dob) return 999;
    const d = new Date(dob);
    const now = new Date();
    let age = now.getFullYear() - d.getFullYear();
    if (now.getMonth() < d.getMonth() || (now.getMonth() === d.getMonth() && now.getDate() < d.getDate())) age--;
    return age;
  };

  const sortedBens = [...beneficiaries].sort((a, b) => {
    if (a.is_primary && !b.is_primary) return -1;
    if (!a.is_primary && b.is_primary) return 1;
    return getAge(a.date_of_birth || a.dob) - getAge(b.date_of_birth || b.dob);
  });

  const benEstates = beneficiaryEstates || [];

  // Dimensions
  const NODE_R = 28;
  const ROOT_Y = 60;
  const BEN_ESTATE_Y = ROOT_Y;
  const CHILDREN_START_Y = ROOT_Y + 90;
  const ROW_HEIGHT = 70;
  const MIN_COL_WIDTH = 72;

  useEffect(() => {
    if (!containerRef.current) return;
    const obs = new ResizeObserver(entries => {
      const entry = entries[0];
      if (entry) {
        const w = entry.contentRect.width;
        const childRows = Math.ceil(sortedBens.length / Math.max(1, Math.floor(w / MIN_COL_WIDTH)));
        const estateRows = benEstates.length > 0 ? 1 : 0;
        const h = CHILDREN_START_Y + childRows * ROW_HEIGHT + 30 + (estateRows > 0 ? 60 : 0);
        setDims({ w, h: Math.max(250, h) });
      }
    });
    obs.observe(containerRef.current);
    return () => obs.disconnect();
  }, [sortedBens.length, benEstates.length]); // eslint-disable-line react-hooks/exhaustive-deps

  const getInitials = (name, firstName, lastName) => {
    if (firstName && lastName) return (firstName[0] + lastName[0]).toUpperCase();
    if (name) return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
    return '??';
  };

  // Layout: benefactor at center top, beneficiaries fan out below
  const rootX = dims.w / 2;
  const rootY = ROOT_Y;

  // Beneficiary estate nodes: positioned to the left of root
  const estateNodes = benEstates.map((est, idx) => ({
    x: 50 + idx * 80,
    y: BEN_ESTATE_Y,
    estate: est,
  }));

  // Children layout: evenly spread below root
  const cols = Math.max(1, Math.floor(dims.w / MIN_COL_WIDTH));
  const childNodes = sortedBens.map((ben, idx) => {
    const row = Math.floor(idx / cols);
    const colsInRow = Math.min(cols, sortedBens.length - row * cols);
    const colIdx = idx % cols;
    const totalWidth = colsInRow * MIN_COL_WIDTH;
    const startX = (dims.w - totalWidth) / 2 + MIN_COL_WIDTH / 2;
    return {
      x: startX + colIdx * MIN_COL_WIDTH,
      y: CHILDREN_START_Y + row * ROW_HEIGHT,
      ben,
    };
  });

  return (
    <div ref={containerRef} className={className} style={{ width: '100%', minHeight: 200 }} data-testid="family-tree">
      <svg
        ref={svgRef}
        width={dims.w}
        height={dims.h}
        viewBox={`0 0 ${dims.w} ${dims.h}`}
        style={{ display: 'block' }}
      >
        <defs>
          <linearGradient id="gold-grad" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#d4af37" />
            <stop offset="100%" stopColor="#b8962e" />
          </linearGradient>
          <linearGradient id="blue-grad" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#60A5FA" />
            <stop offset="100%" stopColor="#3B82F6" />
          </linearGradient>
          <filter id="glow">
            <feGaussianBlur stdDeviation="3" result="blur" />
            <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
        </defs>

        {/* Lines from root to beneficiary estates */}
        {estateNodes.map((en, idx) => (
          <line
            key={`est-line-${idx}`}
            x1={rootX} y1={rootY}
            x2={en.x} y2={en.y}
            stroke="#60A5FA" strokeWidth={1.5} strokeDasharray="4 3" opacity={0.4}
          />
        ))}

        {/* Lines from root to children */}
        {childNodes.length > 0 && (
          <>
            {/* Vertical trunk from root */}
            <line
              x1={rootX} y1={rootY + NODE_R}
              x2={rootX} y2={rootY + NODE_R + 20}
              stroke="#d4af37" strokeWidth={2} opacity={0.5}
            />
            {/* Horizontal branch if multiple children */}
            {childNodes.length > 1 && (
              <line
                x1={Math.min(...childNodes.map(c => c.x))}
                y1={rootY + NODE_R + 20}
                x2={Math.max(...childNodes.map(c => c.x))}
                y2={rootY + NODE_R + 20}
                stroke="#d4af37" strokeWidth={2} opacity={0.3}
              />
            )}
            {/* Vertical drops to each child */}
            {childNodes.map((cn, idx) => (
              <line
                key={`child-drop-${idx}`}
                x1={cn.x} y1={rootY + NODE_R + 20}
                x2={cn.x} y2={cn.y - NODE_R}
                stroke={cn.ben.is_primary ? '#d4af37' : '#4b5563'}
                strokeWidth={cn.ben.is_primary ? 2 : 1.5}
                opacity={cn.ben.is_primary ? 0.6 : 0.3}
              />
            ))}
          </>
        )}

        {/* Beneficiary estate nodes (where user is a beneficiary) */}
        {estateNodes.map((en, idx) => (
          <g
            key={`est-${idx}`}
            className="cursor-pointer"
            onClick={() => {
              localStorage.setItem('beneficiary_estate_id', en.estate.id);
              localStorage.removeItem('selected_estate_id');
              navigate('/beneficiary');
              window.location.reload();
            }}
            data-testid={`tree-estate-${en.estate.id}`}
          >
            <circle
              cx={en.x} cy={en.y} r={22}
              fill="rgba(96,165,250,0.1)"
              stroke="#60A5FA" strokeWidth={1.5}
              className="transition-all duration-200 hover:fill-[rgba(96,165,250,0.25)]"
            />
            <text x={en.x} y={en.y + 1} textAnchor="middle" dominantBaseline="central"
              fill="#60A5FA" fontSize={9} fontWeight={700} fontFamily="Outfit, sans-serif">
              {en.estate.name?.split(' ')[0]?.slice(0, 3)?.toUpperCase() || 'EST'}
            </text>
            <text x={en.x} y={en.y + 32} textAnchor="middle"
              fill="#64748B" fontSize={8} fontFamily="Outfit, sans-serif">
              {en.estate.name?.split("'")[0] || 'Estate'}
            </text>
            <text x={en.x} y={en.y + 42} textAnchor="middle"
              fill="#60A5FA" fontSize={7} fontFamily="Outfit, sans-serif" opacity={0.7}>
              Beneficiary
            </text>
          </g>
        ))}

        {/* Root node (benefactor) */}
        <g data-testid="tree-root-node">
          <circle
            cx={rootX} cy={rootY} r={NODE_R}
            fill="url(#gold-grad)" filter="url(#glow)"
          />
          {user?.photo_url ? (
            <clipPath id="root-clip">
              <circle cx={rootX} cy={rootY} r={NODE_R - 2} />
            </clipPath>
          ) : null}
          {user?.photo_url ? (
            <image
              href={user.photo_url}
              x={rootX - NODE_R + 2} y={rootY - NODE_R + 2}
              width={(NODE_R - 2) * 2} height={(NODE_R - 2) * 2}
              clipPath="url(#root-clip)"
              preserveAspectRatio="xMidYMid slice"
            />
          ) : (
            <text x={rootX} y={rootY + 1} textAnchor="middle" dominantBaseline="central"
              fill="#080e1a" fontSize={13} fontWeight={800} fontFamily="Outfit, sans-serif">
              {getInitials(user?.name, user?.first_name, user?.last_name)}
            </text>
          )}
          <text x={rootX} y={rootY + NODE_R + 14} textAnchor="middle"
            fill="#d4af37" fontSize={10} fontWeight={700} fontFamily="Outfit, sans-serif">
            {user?.first_name || user?.name?.split(' ')[0] || 'You'}
          </text>
        </g>

        {/* Child nodes (beneficiaries) */}
        {childNodes.map((cn, idx) => {
          const ben = cn.ben;
          const color = ben.is_primary ? '#d4af37' : (ben.avatar_color || '#6b7280');
          const initials = getInitials(ben.name, ben.first_name, ben.last_name);
          const age = getAge(ben.date_of_birth || ben.dob);
          return (
            <g
              key={ben.id}
              className="cursor-pointer"
              onClick={() => onSelectBeneficiary?.(ben)}
              data-testid={`tree-node-${ben.id}`}
            >
              <circle
                cx={cn.x} cy={cn.y} r={NODE_R - 4}
                fill={ben.photo_url ? 'none' : `${color}20`}
                stroke={color} strokeWidth={ben.is_primary ? 2.5 : 1.5}
                className="transition-all duration-200 hover:stroke-[3]"
              />
              {ben.is_primary && (
                <circle
                  cx={cn.x} cy={cn.y} r={NODE_R}
                  fill="none" stroke="#d4af37" strokeWidth={1} opacity={0.3}
                  strokeDasharray="3 2"
                />
              )}
              {ben.photo_url ? (
                <>
                  <clipPath id={`ben-clip-${idx}`}>
                    <circle cx={cn.x} cy={cn.y} r={NODE_R - 6} />
                  </clipPath>
                  <image
                    href={ben.photo_url}
                    x={cn.x - NODE_R + 6} y={cn.y - NODE_R + 6}
                    width={(NODE_R - 6) * 2} height={(NODE_R - 6) * 2}
                    clipPath={`url(#ben-clip-${idx})`}
                    preserveAspectRatio="xMidYMid slice"
                  />
                </>
              ) : (
                <text x={cn.x} y={cn.y + 1} textAnchor="middle" dominantBaseline="central"
                  fill={color} fontSize={11} fontWeight={700} fontFamily="Outfit, sans-serif">
                  {initials}
                </text>
              )}
              {/* Name label */}
              <text x={cn.x} y={cn.y + NODE_R + 6} textAnchor="middle"
                fill="var(--t, #E2E8F0)" fontSize={9} fontWeight={600} fontFamily="Outfit, sans-serif">
                {ben.first_name || ben.name?.split(' ')[0] || ''}
              </text>
              {/* Relation + age */}
              <text x={cn.x} y={cn.y + NODE_R + 16} textAnchor="middle"
                fill="#64748B" fontSize={7} fontFamily="Outfit, sans-serif">
                {ben.relation || ''}{age < 999 ? ` · ${age}` : ''}
              </text>
              {/* Primary badge */}
              {ben.is_primary && (
                <g>
                  <circle cx={cn.x + NODE_R - 6} cy={cn.y - NODE_R + 8} r={7} fill="#d4af37" />
                  <text x={cn.x + NODE_R - 6} y={cn.y - NODE_R + 9} textAnchor="middle" dominantBaseline="central"
                    fill="#080e1a" fontSize={8} fontWeight={800}>
                    P
                  </text>
                </g>
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
};

export default FamilyTree;
