import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Clock, Loader2, User } from 'lucide-react';
import { Card, CardContent } from '../ui/card';

const API_URL = `${process.env.REACT_APP_BACKEND_URL}/api`;

const roleColors = {
  benefactor: { bg: 'rgba(37,99,235,0.1)', color: '#60A5FA' },
  beneficiary: { bg: 'rgba(139,92,246,0.1)', color: '#B794F6' },
};

const urgencyColor = (days) => {
  if (days <= 3) return '#EF4444';
  if (days <= 7) return '#F59E0B';
  return '#22C993';
};

export const TrialUsersTab = ({ getAuthHeaders }) => {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetch = async () => {
      try {
        const res = await axios.get(`${API_URL}/admin/trial-users`, getAuthHeaders());
        setUsers(res.data || []);
      } catch {}
      finally { setLoading(false); }
    };
    fetch();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  if (loading) return <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-[var(--gold)]" /></div>;

  return (
    <div className="space-y-3" data-testid="trial-users-tab">
      <p className="text-sm text-[var(--t4)]">{users.length} user{users.length !== 1 ? 's' : ''} currently in trial</p>
      {users.length === 0 ? (
        <Card className="glass-card"><CardContent className="p-8 text-center">
          <Clock className="w-10 h-10 mx-auto text-[var(--t5)] mb-3 opacity-40" />
          <p className="text-sm text-[var(--t4)]">No users currently in their trial period.</p>
        </CardContent></Card>
      ) : (
        users.map(u => {
          const rc = roleColors[u.role] || roleColors.benefactor;
          const dc = urgencyColor(u.days_remaining);
          return (
            <Card key={u.id} className="glass-card" data-testid={`trial-user-${u.id}`}>
              <CardContent className="p-3 flex items-center gap-3">
                <div className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0"
                  style={{ background: rc.bg }}>
                  <User className="w-4 h-4" style={{ color: rc.color }} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-bold text-[var(--t)] truncate">{u.name || u.email}</div>
                  <div className="text-xs text-[var(--t5)] truncate">{u.email}</div>
                </div>
                <div className="flex flex-col items-end gap-0.5 flex-shrink-0">
                  <span className="text-xs px-2 py-0.5 rounded-md font-bold capitalize"
                    style={{ background: rc.bg, color: rc.color }}>{u.role}</span>
                  <span className="text-xs font-bold" style={{ color: dc }}>
                    {u.days_remaining} day{u.days_remaining !== 1 ? 's' : ''} left
                  </span>
                </div>
              </CardContent>
            </Card>
          );
        })
      )}
    </div>
  );
};
