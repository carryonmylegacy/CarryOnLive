import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Activity, UserPlus, FolderLock, FileUp, Shield, Loader2, Search } from 'lucide-react';
import { Card, CardContent } from '../ui/card';
import { Button } from '../ui/button';
import { Skeleton } from '../ui/skeleton';

const API_URL = `${process.env.REACT_APP_BACKEND_URL}/api`;

export const ActivityTab = ({ getAuthHeaders }) => {
  const [activityLog, setActivityLog] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');

  const fetchActivityLog = async () => {
    setLoading(true);
    try {
      const res = await axios.get(`${API_URL}/admin/activity`, getAuthHeaders());
      setActivityLog(res.data);
    } catch (err) { console.error('Error fetching activity:', err); }
    finally { setLoading(false); }
  };

  useEffect(() => {
    fetchActivityLog();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const iconMap = {
    'user-plus': UserPlus, 'folder-lock': FolderLock, 'file-up': FileUp, 'shield': Shield
  };
  const colorMap = {
    user_registered: '#60A5FA', estate_created: '#22C993', document_uploaded: '#B794F6',
    role_change: '#F59E0B', admin_action: '#F59E0B',
  };

  const filteredActivity = activityLog.filter(a => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (a.description || '').toLowerCase().includes(q) ||
      (a.type || '').toLowerCase().includes(q) ||
      (a.status || '').toLowerCase().includes(q);
  });

  return (
    <div className="space-y-4" data-testid="admin-activity-log">
      <div className="flex items-center justify-between">
        <p className="text-sm text-[var(--t4)]">Recent platform activity</p>
        <Button variant="outline" size="sm" onClick={fetchActivityLog} disabled={loading}
          className="text-xs border-[var(--b)] text-[var(--t4)]" data-testid="admin-refresh-activity">
          {loading ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <Activity className="w-3 h-3 mr-1" />}
          Refresh
        </Button>
      </div>

      {activityLog.length > 0 && (
        <div className="flex items-center gap-2 px-3 py-2 rounded-lg" style={{ background: 'var(--s)', border: '1px solid var(--b)' }}>
          <Search className="w-4 h-4 text-[var(--t5)]" />
          <input value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder="Search activity..." className="flex-1 bg-transparent border-none text-[var(--t)] text-sm outline-none placeholder:text-[var(--t5)]" data-testid="activity-search" />
        </div>
      )}

      {loading && activityLog.length === 0 ? (
        <div className="space-y-2">{[1,2,3].map(i => <Skeleton key={i} className="h-14 bg-[var(--s)]" />)}</div>
      ) : activityLog.length === 0 ? (
        <Card className="glass-card"><CardContent className="p-12 text-center">
          <Activity className="w-12 h-12 mx-auto text-[var(--t5)] mb-4" />
          <h3 className="font-bold text-[var(--t)] mb-2">No Activity Yet</h3>
          <p className="text-sm text-[var(--t4)]">Platform activity will appear here.</p>
        </CardContent></Card>
      ) : (
        <div className="space-y-1">
          {filteredActivity.map((a, i) => {
            const Icon = iconMap[a.icon] || Activity;
            const color = colorMap[a.type] || '#7B879E';
            const timeStr = a.timestamp ? new Date(a.timestamp).toLocaleString() : '';
            return (
              <div key={i} className="glass-card p-3 flex items-center gap-3" data-testid={`activity-item-${i}`}>
                <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
                  style={{ background: `${color}15` }}>
                  <Icon className="w-4 h-4" style={{ color }} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-[var(--t)] truncate">{a.description}</p>
                  <p className="text-[10px] text-[var(--t5)]">{timeStr}</p>
                </div>
                {a.status && (
                  <span className="text-[10px] px-2 py-0.5 rounded-md font-bold capitalize"
                    style={{ background: 'rgba(34,201,147,0.1)', color: '#22C993' }}>{a.status}</span>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
