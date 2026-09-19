import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { Activity } from 'lucide-react';
import { API_URL } from '../../config';
import { useCopy } from '../../copy/CopyContext';

const METRICS = [
  ['families', 'families set up'],
  ['documents', 'documents secured'],
  ['messages', 'milestone messages recorded'],
  ['checklist_items', 'checklist steps written'],
  ['people_invited', 'people invited'],
];

export const usePlatformStats = () => {
  const [stats, setStats] = useState(null);
  useEffect(() => {
    axios.get(`${API_URL}/public/platform-stats`).then(r => setStats(r.data)).catch(() => {});
  }, []);
  return stats;
};

// Compact "N families set up — live count" pill for the hero (D3.1). Same visibility rule as the panel.
export const LiveCountBadge = ({ testIdSuffix = '' }) => {
  const stats = usePlatformStats();
  const { t } = useCopy();
  if (!stats?.visible) return null;
  return (
    <a href="#trust" className="inline-flex items-center gap-2 rounded-full pl-2.5 pr-3.5 py-1.5 text-sm font-semibold text-white transition-colors hover:border-[#10b981]/70"
      style={{ background: 'rgba(11,18,33,0.55)', border: '1px solid rgba(16,185,129,0.45)', backdropFilter: 'blur(8px)', textShadow: '0 1px 4px rgba(0,0,0,0.5)' }}
      title="Real number from the CarryOn database, updated every 10 minutes" data-testid={`live-count-badge${testIdSuffix}`}>
      <span className="relative flex w-2 h-2"><span className="absolute inline-flex w-full h-full rounded-full bg-[#10b981] opacity-75 animate-ping" /><span className="relative inline-flex w-2 h-2 rounded-full bg-[#10b981]" /></span>
      <span data-testid={`live-count-badge-number${testIdSuffix}`}>{Number(stats.families || 0).toLocaleString()}</span>
      <span className="font-medium text-white/85">{t('home.hero.livecount')}</span>
    </a>
  );
};

// Real counts from the production database. Renders nothing until the founder enables it (or >= 25 families exist).
export const LiveStats = ({ testIdSuffix = '' }) => {
  const stats = usePlatformStats();
  if (!stats?.visible) return null;
  return (
    <div className="rounded-xl p-5 sm:p-6" style={{ background: 'rgba(15,26,46,0.6)', border: '1px solid rgba(16,185,129,0.25)' }} data-testid={`live-stats${testIdSuffix}`}>
      <p className="flex items-center gap-2 text-[#10b981] text-xs font-bold uppercase tracking-wider mb-4"><Activity className="w-3.5 h-3.5" /> Live from CarryOn &mdash; real numbers, updated every 10 minutes</p>
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
        {METRICS.map(([key, label]) => (
          <div key={key} data-testid={`live-stat-${key}${testIdSuffix}`}>
            <p className="text-white text-2xl font-bold" style={{ fontFamily: 'Outfit, sans-serif' }}>{Number(stats[key] || 0).toLocaleString()}</p>
            <p className="text-[#8b97ab] text-xs leading-snug">{label}</p>
          </div>
        ))}
      </div>
    </div>
  );
};

export default LiveStats;
