import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Clock, Loader2 } from 'lucide-react';
import { Card, CardContent } from '../ui/card';
import { toast } from '../../utils/toast';

const API_URL = `${process.env.REACT_APP_BACKEND_URL}/api`;

const SEVERITY_STYLES = {
  info: { color: '#3B82F6', bg: 'rgba(59,130,246,0.1)' },
  warning: { color: '#F59E0B', bg: 'rgba(245,158,11,0.1)' },
  critical: { color: '#EF4444', bg: 'rgba(239,68,68,0.1)' },
};

const ACTION_LABELS = {
  operator_create: 'Created Operator',
  operator_delete: 'Deleted Operator',
  announcement_create: 'Published Announcement',
  announcement_delete: 'Deactivated Announcement',
  escalation_create: 'Created Escalation',
  escalation_resolve: 'Resolved Escalation',
  shift_note_create: 'Added Shift Note',
  kb_article_create: 'Created KB Article',
  kb_article_delete: 'Deleted KB Article',
  support_soft_delete: 'Deleted Support Ticket',
  support_restore: 'Restored Support Ticket',
  dts_soft_delete: 'Deleted DTS Task',
  dts_restore: 'Restored DTS Task',
  tvt_soft_delete: 'Deleted TVT Entry',
  tvt_restore: 'Restored TVT Entry',
  verification_soft_delete: 'Deleted Verification',
  verification_restore: 'Restored Verification',
};

export const MyActivityTab = ({ getAuthHeaders }) => {
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetch_ = async () => {
      try {
        const res = await axios.get(`${API_URL}/ops/my-activity?limit=100`, getAuthHeaders());
        setEntries(res.data);
      } catch { toast.error('Failed to load activity'); }
      finally { setLoading(false); }
    };
    fetch_();
  }, []); // eslint-disable-line

  if (loading) return <div className="text-center py-12"><Loader2 className="w-6 h-6 animate-spin mx-auto text-[var(--t4)]" /></div>;

  // Group by date
  const grouped = {};
  entries.forEach(e => {
    const date = new Date(e.timestamp).toLocaleDateString();
    if (!grouped[date]) grouped[date] = [];
    grouped[date].push(e);
  });

  return (
    <div className="space-y-4" data-testid="my-activity-tab">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold text-[var(--t)]">My Activity Log</h2>
        <span className="text-xs text-[var(--t5)]">{entries.length} actions recorded</span>
      </div>

      {entries.length === 0 ? (
        <Card className="glass-card"><CardContent className="p-8 text-center">
          <Clock className="w-10 h-10 mx-auto mb-3 text-[var(--t5)]" />
          <p className="text-sm text-[var(--t4)]">No activity recorded yet</p>
        </CardContent></Card>
      ) : (
        Object.entries(grouped).map(([date, dayEntries]) => (
          <div key={date}>
            <p className="text-xs font-bold text-[var(--t5)] uppercase tracking-wider mb-2">{date}</p>
            <div className="space-y-1.5">
              {dayEntries.map((e, i) => {
                const sev = SEVERITY_STYLES[e.severity] || SEVERITY_STYLES.info;
                const time = new Date(e.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                const label = ACTION_LABELS[e.action] || e.action.replace(/_/g, ' ');
                let detail = '';
                try { const d = JSON.parse(e.details || '{}'); detail = Object.values(d).filter(v => typeof v === 'string').join(' · '); } catch {}
                return (
                  <div key={i} className="flex items-start gap-3 p-3 rounded-lg transition-colors" style={{ background: 'var(--s)' }}>
                    <div className="w-2 h-2 rounded-full mt-1.5 flex-shrink-0" style={{ background: sev.color }} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-[var(--t)]">{label}</span>
                        <span className="text-[10px] px-1.5 py-0.5 rounded-full" style={{ background: sev.bg, color: sev.color }}>{e.severity}</span>
                      </div>
                      {detail && <p className="text-[10px] text-[var(--t4)] truncate mt-0.5">{detail}</p>}
                      <p className="text-[10px] text-[var(--t5)] mt-0.5">{e.resource_type} · {time}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))
      )}
    </div>
  );
};
