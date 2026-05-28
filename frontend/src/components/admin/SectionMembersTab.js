import React, { useState, useEffect } from 'react';
import apiClient from '../../utils/apiClient';
import { Users, Loader2, Shield, UserCog } from 'lucide-react';
import { Card, CardContent } from '../ui/card';
import { toast } from '../../utils/toast';
import { API_URL } from '../../config';

const SCOPE_META = {
  founder: { label: 'Founder Admin', color: '#d4af37' },
  finance: { label: 'Finance Admin', color: '#22C993' },
  compliance: { label: 'Compliance Admin', color: '#3B82F6' },
  marketing: { label: 'Marketing Admin', color: '#B794F6' },
  platform_health: { label: 'Platform Health Admin', color: '#F59E0B' },
  ops_manager: { label: 'Operations Manager', color: '#E87040' },
  ops_team: { label: 'Operations Team Member', color: '#64B5F6' },
};

export const SectionMembersTab = ({ getAuthHeaders, sectionScopes, sectionLabel }) => {
  const [admins, setAdmins] = useState([]);
  const [loading, setLoading] = useState(true);
  const headers = getAuthHeaders()?.headers || {};

  useEffect(() => {
    const fetch_ = async () => {
      try {
        const res = await apiClient.get(`${API_URL}/admin/scoped-admins`, { headers });
        const filtered = res.data.filter(a => {
          const scopes = Array.isArray(a.admin_scope) ? a.admin_scope : [a.admin_scope || ''];
          return scopes.includes('founder') || sectionScopes.some(s => scopes.includes(s));
        });
        setAdmins(filtered);
      } catch { toast.error('Failed to load members'); }
      finally { setLoading(false); }
    };
    fetch_();
  }, []); // eslint-disable-line

  if (loading) return <div className="text-center py-12"><Loader2 className="w-6 h-6 animate-spin mx-auto text-[var(--t4)]" /></div>;

  const sectionColor = SCOPE_META[sectionScopes[0]]?.color || '#888';

  return (
    <div className="space-y-4" data-testid={`section-members-${sectionScopes[0]}`}>
      <div>
        <h2 className="text-lg font-bold text-[var(--t)]">{sectionLabel} Members</h2>
        <p className="text-xs text-[var(--t5)]">Users with access to this section</p>
      </div>

      {admins.length === 0 ? (
        <Card className="glass-card">
          <CardContent className="p-8 text-center">
            <Users className="w-8 h-8 mx-auto text-[var(--t5)] mb-2" />
            <p className="text-sm text-[var(--t4)]">No members assigned to this section yet</p>
            <p className="text-xs text-[var(--t5)] mt-1">Assign scopes via the Admin Accounts tab</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {admins.map(admin => {
            const scopes = Array.isArray(admin.admin_scope) ? admin.admin_scope : [admin.admin_scope || 'founder'];
            const isFounder = scopes.includes('founder');
            return (
              <Card key={admin.id} className="glass-card" data-testid={`member-card-${admin.id}`}>
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: `${sectionColor}15`, border: `1px solid ${sectionColor}30` }}>
                        {isFounder ? <Shield className="w-4 h-4" style={{ color: sectionColor }} /> : <UserCog className="w-4 h-4" style={{ color: sectionColor }} />}
                      </div>
                      <div>
                        <p className="text-sm font-bold text-[var(--t)]">{admin.name}</p>
                        <p className="text-[11px] text-[var(--t5)]">{admin.email}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 flex-wrap justify-end">
                      {scopes.map(s => {
                        const meta = SCOPE_META[s] || { label: s, color: '#888' };
                        const isActive = sectionScopes.includes(s);
                        return (
                          <span key={s} className="text-[11px] px-2 py-1 rounded-full font-bold" style={{
                            background: `${meta.color}${isActive ? '20' : '08'}`,
                            color: isActive ? meta.color : 'var(--t5)',
                          }}>
                            {meta.label}
                          </span>
                        );
                      })}
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
};
