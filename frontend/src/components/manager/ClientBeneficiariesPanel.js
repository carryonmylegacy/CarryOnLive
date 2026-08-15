/**
 * ClientBeneficiariesPanel — inline roster expansion listing a client's
 * beneficiaries with invite status; lets the partner send/resend invites
 * without entering the client portal.
 */

import React, { useCallback, useEffect, useState } from 'react';
import { Loader2, Send, CheckCircle2, Clock, CircleDashed } from 'lucide-react';
import apiClient from '../../utils/apiClient';
import { toast } from '../../utils/toast';
import { API_URL } from '../../config';

const mgrHeaders = () => {
  const t = window.localStorage.getItem('carryon_manager_token');
  return t ? { Authorization: `Bearer ${t}` } : {};
};

const CHIP_STYLES = {
  linked: { background: 'rgba(16,185,129,0.14)', color: '#10b981', border: '1px solid rgba(16,185,129,0.35)' },
  sent: { background: 'rgba(59,130,246,0.14)', color: '#3b82f6', border: '1px solid rgba(59,130,246,0.35)' },
  not_invited: { background: 'rgba(120,130,150,0.12)', color: 'var(--t5)', border: '1px solid rgba(120,130,150,0.35)' },
};

const BenStatusChip = ({ status }) => {
  const Icon = status === 'linked' ? CheckCircle2 : status === 'sent' ? Clock : CircleDashed;
  const label = status === 'linked' ? 'Account Linked' : status === 'sent' ? 'Invite Pending' : 'Not Invited';
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold"
      style={CHIP_STYLES[status] || CHIP_STYLES.not_invited} data-testid="mgr-ben-status-chip">
      <Icon className="w-3 h-3" /> {label}
    </span>
  );
};

export const ClientBeneficiariesPanel = ({ clientId, onInvited }) => {
  const [loading, setLoading] = useState(true);
  const [bens, setBens] = useState([]);
  const [busy, setBusy] = useState(null);

  const load = useCallback(async () => {
    try {
      const { data } = await apiClient.get(`${API_URL}/manager/clients/${clientId}/beneficiaries`, { headers: mgrHeaders() });
      setBens(data.beneficiaries || []);
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to load beneficiaries');
    } finally {
      setLoading(false);
    }
  }, [clientId]);

  useEffect(() => { load(); }, [load]);

  const invite = async (b) => {
    setBusy(b.id);
    try {
      await apiClient.post(`${API_URL}/manager/clients/${clientId}/beneficiaries/${b.id}/invite`, {},
        { headers: { ...mgrHeaders(), 'Content-Type': 'application/json' } });
      toast.success(`Invitation sent to ${b.email}`);
      await load();
      onInvited?.();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to send invitation');
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="mt-3 pt-3 space-y-2" style={{ borderTop: '1px solid var(--b)' }} data-testid={`mgr-bens-panel-${clientId}`}>
      {loading ? (
        <div className="flex items-center gap-2 text-[12px] text-[var(--t4)]"><Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading beneficiaries…</div>
      ) : bens.length === 0 ? (
        <p className="text-[12px] text-[var(--t4)]" data-testid="mgr-bens-empty">
          No beneficiaries yet — tap <span className="font-bold text-[var(--gold)]">Enter Portal</span> and add them in the Beneficiaries section.
        </p>
      ) : (
        bens.map(b => (
          <div key={b.id} className="flex items-center gap-3 flex-wrap" data-testid={`mgr-ben-row-${b.id}`}>
            <div className="flex-1 min-w-0">
              <span className="text-[13px] font-bold text-[var(--t)]">{b.name}</span>
              <span className="text-[12px] text-[var(--t4)] ml-2">{b.email}</span>
            </div>
            <BenStatusChip status={b.status} />
            {b.status !== 'linked' && (
              <button onClick={() => invite(b)} disabled={!!busy}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-bold transition-colors"
                style={{ color: 'var(--gold)', border: '1px solid rgba(var(--gold-rgb),0.4)', background: 'rgba(var(--gold-rgb),0.08)' }}
                data-testid={`mgr-ben-invite-${b.id}`}>
                {busy === b.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Send className="w-3 h-3" />}
                {b.status === 'sent' ? 'Resend Invite' : 'Send Invite'}
              </button>
            )}
          </div>
        ))
      )}
    </div>
  );
};

export default ClientBeneficiariesPanel;
