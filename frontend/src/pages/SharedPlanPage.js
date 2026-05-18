import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { API_URL } from '../config';
import {
  Shield,
  MapPin,
  Phone,
  Package,
  FileText,
  Loader2,
  AlertTriangle,
  Clock,
} from 'lucide-react';

const PLAN_TYPE_LABELS = {
  natural_disaster: 'Natural Disaster',
  national_emergency: 'National Emergency',
  medical_emergency: 'Medical Emergency',
  infrastructure_failure: 'Infrastructure Failure',
  custom: 'Custom Plan',
};

export default function SharedPlanPage() {
  const { token } = useParams();
  const [plan, setPlan] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`${API_URL}/public/ccp/${token}`);
        if (!res.ok) {
          setError(res.status === 404 ? 'This plan link is invalid or has expired.' : 'Failed to load plan.');
          return;
        }
        setPlan(await res.json());
      } catch {
        setError('Unable to connect. Please try again.');
      } finally {
        setLoading(false);
      }
    })();
  }, [token]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: '#0b1120' }}>
        <Loader2 className="w-8 h-8 animate-spin" style={{ color: '#d4af37' }} />
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6" style={{ background: '#0b1120' }}>
        <div className="text-center max-w-sm">
          <AlertTriangle className="w-12 h-12 mx-auto mb-4" style={{ color: '#F05252' }} />
          <p className="text-base font-semibold mb-2" style={{ color: '#F1F3F8' }}>{error}</p>
          <p className="text-sm" style={{ color: '#A0AABF' }}>
            Ask the person who shared this link to send a new one.
          </p>
        </div>
      </div>
    );
  }

  if (!plan) return null;

  const typeLabel = PLAN_TYPE_LABELS[plan.plan_type] || plan.plan_type;
  const rps = plan.rendezvous_points || [];
  const rls = plan.resource_locations || [];
  const comm = (plan.communication_plan || '').trim();
  const instr = (plan.instructions || '').trim();
  const ds = plan.drill_schedule;

  return (
    <div className="min-h-screen" style={{ background: '#0b1120' }}>
      {/* Header */}
      <div className="text-center pt-10 pb-6 px-4" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
        <Shield className="w-10 h-10 mx-auto mb-3" style={{ color: '#d4af37' }} />
        <p className="text-xs font-bold uppercase tracking-widest mb-2" style={{ color: '#d4af37' }}>
          CarryOn Emergency Plan
        </p>
        <h1
          className="text-2xl sm:text-3xl font-bold mb-2"
          data-testid="shared-plan-name"
          style={{ color: '#F1F3F8', fontFamily: "'Helvetica Neue', Arial, sans-serif" }}
        >
          {plan.name}
        </h1>
        <span
          className="inline-block text-xs font-bold px-3 py-1 rounded-full"
          style={{ background: 'rgba(59,123,247,0.12)', color: '#3B7BF7' }}
        >
          {typeLabel}
        </span>
        {plan.estate_name && (
          <p className="text-xs mt-3" style={{ color: '#525C72' }}>
            Shared by the {plan.estate_name} family
          </p>
        )}
      </div>

      {/* Plan Content */}
      <div className="max-w-lg mx-auto px-4 py-6 space-y-6">
        {/* Rendezvous Points */}
        {rps.length > 0 && (
          <Section icon={MapPin} color="#3B7BF7" title="Meeting Points">
            {rps.map((rp, i) => (
              <div key={i} className="mb-3 last:mb-0">
                <p className="text-sm font-bold" style={{ color: '#F1F3F8' }}>{rp.name}</p>
                {rp.address && <p className="text-xs mt-0.5" style={{ color: '#A0AABF' }}>{rp.address}</p>}
                {rp.notes && <p className="text-xs mt-0.5 italic" style={{ color: '#525C72' }}>{rp.notes}</p>}
              </div>
            ))}
          </Section>
        )}

        {/* Communication Plan */}
        {comm && (
          <Section icon={Phone} color="#22C993" title="Communication Plan">
            <p className="text-sm whitespace-pre-line" style={{ color: '#D8DEE9' }}>{comm}</p>
          </Section>
        )}

        {/* Resource Locations */}
        {rls.length > 0 && (
          <Section icon={Package} color="#F5A623" title="Supplies & Resources">
            {rls.map((rl, i) => (
              <div key={i} className="mb-3 last:mb-0">
                <p className="text-sm font-bold" style={{ color: '#F1F3F8' }}>{rl.name}</p>
                {rl.location && <p className="text-xs mt-0.5" style={{ color: '#A0AABF' }}>{rl.location}</p>}
                {rl.notes && <p className="text-xs mt-0.5 italic" style={{ color: '#525C72' }}>{rl.notes}</p>}
              </div>
            ))}
          </Section>
        )}

        {/* Instructions */}
        {instr && (
          <Section icon={FileText} color="#B794F6" title="Step-by-Step Instructions">
            <p className="text-sm whitespace-pre-line" style={{ color: '#D8DEE9' }}>{instr}</p>
          </Section>
        )}

        {/* Drill Schedule */}
        {ds && ds.enabled && (
          <Section icon={Clock} color="#3B7BF7" title="Practice Schedule">
            <p className="text-sm" style={{ color: '#D8DEE9' }}>
              This plan should be practiced <strong>{ds.label?.toLowerCase()}</strong>.
            </p>
            {ds.next_drill_date && (
              <p className="text-xs mt-1" style={{ color: '#A0AABF' }}>
                Next suggested drill: {new Date(ds.next_drill_date).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
              </p>
            )}
          </Section>
        )}

        {/* Footer */}
        <div className="text-center pt-6 pb-10" style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
          <p className="text-xs mb-1" style={{ color: '#525C72' }}>
            Keep this page bookmarked or print it for offline access.
          </p>
          <p className="text-xs font-bold" style={{ color: '#d4af37' }}>
            CarryOn &middot; Every American Family. Ready.
          </p>
          <a
            href="/"
            className="inline-block mt-4 px-6 py-2.5 rounded-xl text-sm font-bold"
            style={{ background: 'rgba(var(--gold-rgb), 0.12)', color: '#d4af37', border: '1px solid rgba(var(--gold-rgb), 0.3)' }}
          >
            Learn more about CarryOn
          </a>
        </div>
      </div>
    </div>
  );
}

function Section({ icon: Icon, color, title, children }) {
  return (
    <div className="rounded-xl overflow-hidden" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}>
      <div className="flex items-center gap-2 px-4 py-3" style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
        <Icon className="w-4 h-4" style={{ color }} />
        <span className="text-xs font-bold uppercase tracking-wider" style={{ color }}>{title}</span>
      </div>
      <div className="px-4 py-3">
        {children}
      </div>
    </div>
  );
}
