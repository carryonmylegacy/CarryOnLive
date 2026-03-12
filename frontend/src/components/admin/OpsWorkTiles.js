import React from 'react';
import { useNavigate } from 'react-router-dom';
import {
  FileKey, Shield, MessageSquare, Gift, Siren, Zap
} from 'lucide-react';

const TILE_CONFIG = [
  { key: 'tvt', label: 'TVT', sub: 'Death certificates to review', icon: FileKey, color: '#F59E0B', path: '/ops/transition' },
  { key: 'milestones', label: 'Milestones', sub: 'Milestone notifications to review', icon: Gift, color: '#8B5CF6', path: '/ops/milestones' },
  { key: 'dts', label: 'DTS', sub: 'Trustee requests to process', icon: Shield, color: '#3B82F6', path: '/ops/dts' },
  { key: 'emergency', label: 'Emergency', sub: 'Beneficiary emergency access', icon: Siren, color: '#EF4444', path: '/ops/escalations' },
  { key: 'p1', label: 'P1 Alert', sub: 'Benefactor still alive alerts', icon: Zap, color: '#DC2626', path: '/ops/support' },
  { key: 'support', label: 'Support', sub: 'Customer service replies', icon: MessageSquare, color: '#F43F5E', path: '/ops/support' },
];

export const OpsWorkTiles = ({ stats, dashEvents }) => {
  const navigate = useNavigate();
  if (!stats) return null;

  const tiles = TILE_CONFIG.map(t => ({
    ...t,
    count: dashEvents?.events?.[t.key]?.count ?? (stats[`pending_${t.key === 'tvt' ? 'certificates' : t.key}`] || stats[`reviewing_${t.key === 'tvt' ? 'certificates' : ''}`] || stats[`unanswered_${t.key}`] || stats[`p1_emergencies`] || stats[`pending_milestones`] || 0),
  }));

  // Recalculate counts properly
  const getCounts = (key) => {
    const ev = dashEvents?.events?.[key]?.count;
    if (ev !== undefined) return ev;
    switch (key) {
      case 'tvt': return (stats.pending_certificates || 0) + (stats.reviewing_certificates || 0);
      case 'milestones': return stats.pending_milestones || 0;
      case 'dts': return stats.pending_dts || 0;
      case 'emergency': return stats.pending_emergency || 0;
      case 'p1': return stats.p1_emergencies || 0;
      case 'support': return stats.unanswered_support || 0;
      default: return 0;
    }
  };

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3" data-testid="ops-work-tiles">
      {TILE_CONFIG.map(tile => {
        const count = getCounts(tile.key);
        const hasWork = count > 0;
        const isUrgent = tile.key === 'p1' || tile.key === 'emergency';
        return (
          <div
            key={tile.key}
            onClick={() => navigate(tile.path)}
            className={`rounded-xl p-4 cursor-pointer active:scale-[0.97] transition-all relative overflow-hidden ${hasWork && isUrgent ? 'animate-pulse-subtle' : ''}`}
            style={{
              background: hasWork ? `${tile.color}12` : 'var(--s)',
              border: `2px solid ${hasWork ? `${tile.color}40` : 'var(--b)'}`,
              boxShadow: hasWork
                ? isUrgent
                  ? `0 0 30px ${tile.color}30, 0 0 60px ${tile.color}10`
                  : `0 0 20px ${tile.color}15`
                : 'none',
            }}
            data-testid={`ops-tile-${tile.key}`}
          >
            {hasWork && (
              <div className="absolute inset-0 rounded-xl pointer-events-none"
                style={{ background: `radial-gradient(ellipse at center, ${tile.color}08 0%, transparent 70%)` }} />
            )}
            <div className="flex items-center gap-3 relative z-10">
              <div
                className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 transition-all ${hasWork && isUrgent ? 'animate-pulse' : ''}`}
                style={{
                  background: hasWork ? `${tile.color}20` : 'var(--bg2)',
                  border: `1px solid ${hasWork ? `${tile.color}30` : 'var(--b)'}`,
                }}
              >
                <tile.icon className="w-5 h-5" style={{ color: hasWork ? tile.color : 'var(--t5)' }} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-bold text-[var(--t)] truncate">{tile.label}</span>
                  {hasWork && (
                    <span
                      className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full flex-shrink-0 ${isUrgent ? 'animate-pulse' : 'animate-pulse'}`}
                      style={{ background: `${tile.color}25`, color: tile.color }}
                    >
                      {count}
                    </span>
                  )}
                </div>
                <p className="text-[10px] text-[var(--t5)] truncate mt-0.5">
                  {hasWork ? `${count} ${tile.sub}` : 'All clear'}
                </p>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
};
