import React from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Users, CreditCard, FolderLock, Clock, TrendingUp,
  MessageSquare, FileKey, ShieldCheck, CheckSquare, AlertTriangle
} from 'lucide-react';

export const ActionRequired = ({ stats, navigate }) => {
  if (!stats) return null;
  const hasItems = stats.unanswered_support > 0 || stats.pending_certificates > 0 || stats.reviewing_certificates > 0 || stats.pending_verifications > 0 || stats.pending_dts > 0 || stats.pending_family_requests > 0 || stats.pending_deletions > 0;
  if (!hasItems) return null;

  const items = [
    stats.unanswered_support > 0 && { v: stats.unanswered_support, l: 'Unanswered Messages', icon: MessageSquare, color: '#F43F5E', path: '/admin/support' },
    stats.pending_certificates > 0 && { v: stats.pending_certificates, l: 'Pending Transitions', icon: FileKey, color: '#F59E0B', path: '/admin/transition' },
    stats.reviewing_certificates > 0 && { v: stats.reviewing_certificates, l: 'Reviewing Certs', icon: FileKey, color: '#FBBF24', path: '/admin/transition' },
    stats.pending_verifications > 0 && { v: stats.pending_verifications, l: 'Pending Verifications', icon: ShieldCheck, color: '#F97316', path: '/admin/verifications' },
    stats.pending_dts > 0 && { v: stats.pending_dts, l: 'Pending DTS Tasks', icon: CheckSquare, color: '#8B5CF6', path: '/admin/dts' },
    stats.pending_family_requests > 0 && { v: stats.pending_family_requests, l: 'Family Plan Requests', icon: Users, color: '#0EA5E9', path: '/admin/subscriptions' },
    stats.pending_deletions > 0 && { v: stats.pending_deletions, l: 'Deletion Requests', icon: AlertTriangle, color: '#EF4444', path: '/admin/activity' },
  ].filter(Boolean);

  return (
    <div className="glass-card p-4" style={{ borderLeft: '3px solid #F43F5E' }} data-testid="action-required">
      <h3 className="text-sm font-bold text-[#F43F5E] mb-3 uppercase tracking-wider">Needs Your Attention</h3>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
        {items.map(s => (
          <div key={s.l} className="rounded-xl p-3 text-center cursor-pointer active:scale-[0.96] transition-transform"
            style={{ background: `${s.color}10`, border: `1px solid ${s.color}20` }}
            onClick={() => navigate(s.path)}>
            <s.icon className="w-4 h-4 mx-auto mb-1" style={{ color: s.color }} />
            <div className="text-2xl font-bold text-[var(--t)]">{s.v}</div>
            <div className="text-xs text-[var(--t4)]">{s.l}</div>
          </div>
        ))}
      </div>
    </div>
  );
};

export const PlatformOverview = ({ stats }) => {
  const navigate = useNavigate();
  if (!stats) return null;

  return (
    <>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3" data-testid="platform-overview">
        {[
          { v: stats.users.total, l: 'Total Users', sub: `${stats.users.benefactors} benefactors · ${stats.users.beneficiaries} beneficiaries`, icon: Users, color: '#60A5FA', path: '/admin' },
          { v: stats.active_subscriptions, l: 'Active Subscriptions', icon: CreditCard, color: '#22C993', path: '/admin/subscriptions' },
          { v: stats.estates.active, l: 'Active Estates', sub: `${stats.estates.transitioned} transitioned`, icon: FolderLock, color: '#0EA5E9', path: '/admin/transition' },
          { v: stats.grace_periods, l: 'Trial Periods', icon: Clock, color: '#F59E0B', path: '/admin/trials' },
        ].map(s => (
          <div key={s.l} className="glass-card p-3 text-center cursor-pointer active:scale-[0.96] transition-transform"
            onClick={() => navigate(s.path)}>
            <s.icon className="w-4 h-4 mx-auto mb-1" style={{ color: s.color }} />
            <div className="text-2xl font-bold text-[var(--t)]">{s.v}</div>
            <div className="text-xs text-[var(--t4)]">{s.l}</div>
            {s.sub && <div className="text-[10px] text-[var(--t5)] mt-0.5">{s.sub}</div>}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-3 mt-3">
        <div className="glass-card p-3 text-center">
          <Users className="w-4 h-4 mx-auto mb-1 text-[#d4af37]" />
          <div className="text-2xl font-bold text-[var(--t)]">{stats.avg_beneficiaries_per_benefactor || 0}</div>
          <div className="text-xs text-[var(--t4)]">Avg Beneficiaries / Benefactor</div>
        </div>
        <div className="glass-card p-3 text-center cursor-pointer active:scale-[0.96] transition-transform" onClick={() => navigate('/admin')}>
          <TrendingUp className="w-4 h-4 mx-auto mb-1 text-[#22C993]" />
          <div className="text-2xl font-bold text-[var(--t)]">{stats.beneficiaries_converted || 0}</div>
          <div className="text-xs text-[var(--t4)]">Beneficiaries &rarr; Benefactors</div>
        </div>
      </div>
    </>
  );
};
