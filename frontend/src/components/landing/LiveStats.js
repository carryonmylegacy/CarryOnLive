import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { Activity } from 'lucide-react';
import { API_URL } from '../../config';

const METRICS = [
  ['families', 'families set up'],
  ['documents', 'documents secured'],
  ['messages', 'milestone messages recorded'],
  ['checklist_items', 'checklist steps written'],
  ['people_invited', 'people invited'],
];

// Real counts from the production database. Renders nothing until the founder enables it (or >= 25 families exist).
export const LiveStats = ({ testIdSuffix = '' }) => {
  const [stats, setStats] = useState(null);
  useEffect(() => {
    axios.get(`${API_URL}/public/platform-stats`).then(r => setStats(r.data)).catch(() => {});
  }, []);
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
