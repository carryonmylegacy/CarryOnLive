import React, { useState } from 'react';
import axios from 'axios';
import { Lock, ExternalLink, Eye, EyeOff, Shield, Database, CreditCard, Mail, Bot, Cloud,
  MessageSquare, MapPin, Bell, Key, Smartphone, Mic, FileText, Puzzle, Server, Globe,
  RefreshCw, Download, DollarSign, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { toast } from '../../utils/toast';

const API_URL = `${process.env.REACT_APP_BACKEND_URL}/api`;

const iconMap = {
  railway: Server, vercel: Globe, mongodb: Database, s3: Cloud,
  stripe: CreditCard, apple_iap: Smartphone, xai: Bot, resend: Mail,
  twilio: MessageSquare, capgo: RefreshCw, capacitor: Smartphone,
  google_places: MapPin, webauthn: Key, vapid: Bell, jwt: Shield,
  voice_biometrics: Mic, pdf_tools: FileText,
};

const CATEGORIES = [
  { key: 'all', label: 'All' },
  { key: 'infrastructure', label: 'Infrastructure' },
  { key: 'payments', label: 'Payments' },
  { key: 'ai_communication', label: 'AI & Comms' },
  { key: 'native_updates', label: 'Native & Updates' },
  { key: 'security_auth', label: 'Security' },
  { key: 'local_processing', label: 'Local' },
];

const statusColors = {
  active: '#22C55E', configured: '#22C55E', blocked: '#F59E0B',
  'not configured': '#6B7280', 'free/self-hosted': '#3B82F6',
};

const mask = (val) => {
  if (!val || val.length < 12) return '****';
  return val.slice(0, 8) + '...' + val.slice(-4);
};

const IntegrationCard = ({ integration, revealed, onToggle }) => {
  const color = statusColors[integration.status] || '#6B7280';
  const Icon = iconMap[integration.id] || Puzzle;

  return (
    <Card className="glass-card" style={{ borderLeft: `3px solid ${color}` }} data-testid={`integration-${integration.id}`}>
      <CardContent className="py-4 px-4 sm:px-5">
        {/* Header */}
        <div className="flex items-start justify-between gap-2 mb-3">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0" style={{ background: `${color}15` }}>
              <Icon className="w-4 h-4" style={{ color }} />
            </div>
            <div>
              <h3 className="text-sm font-bold text-[var(--t)]">{integration.name}</h3>
              <div className="flex items-center gap-2 mt-0.5">
                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full" style={{ background: `${color}15`, color }}>{integration.status}</span>
                {integration.cost_monthly > 0 && (
                  <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full" style={{ background: 'rgba(212,175,55,0.1)', color: 'var(--gold)' }}>
                    ${integration.cost_monthly.toFixed(2)}/mo
                  </span>
                )}
                {integration.cost_monthly === 0 && integration.status !== 'blocked' && (
                  <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full" style={{ background: 'rgba(59,130,246,0.1)', color: '#3B82F6' }}>
                    Free
                  </span>
                )}
              </div>
            </div>
          </div>
          {integration.dashboard_url && (
            <a href={integration.dashboard_url} target="_blank" rel="noopener noreferrer"
              className="flex items-center gap-1 text-[10px] font-bold text-[var(--t4)] hover:text-[var(--gold)] transition-colors shrink-0" data-testid={`link-${integration.id}`}>
              Dashboard <ExternalLink className="w-3 h-3" />
            </a>
          )}
        </div>

        {/* Cost note */}
        {integration.cost_note && (
          <div className="text-[10px] text-[var(--t5)] mb-2 flex items-center gap-1">
            <DollarSign className="w-3 h-3" />
            {integration.cost_note}
            {!integration.cost_verified && (
              <span className="text-amber-400 font-bold ml-1">(unverified)</span>
            )}
          </div>
        )}

        {/* Details */}
        <div className="space-y-1.5 text-xs">
          {integration.details.map((d, i) => {
            const isEmpty = !d.value && !d.sensitive;
            const isUnverified = !d.verified;
            const highlight = isEmpty || (isUnverified && !d.value);

            return (
              <div key={i}
                className={`flex justify-between items-center gap-2 p-2 rounded ${highlight ? 'ring-1 ring-amber-400/50' : ''}`}
                style={{ background: highlight ? 'rgba(245,158,11,0.08)' : 'var(--s)' }}>
                <span className="text-[var(--t5)] whitespace-nowrap flex items-center gap-1">
                  {d.label}
                  {isUnverified && <AlertTriangle className="w-2.5 h-2.5 text-amber-400" />}
                  {d.verified && <CheckCircle2 className="w-2.5 h-2.5 text-green-500/50" />}
                </span>
                <span className={`font-mono text-right break-all ${highlight ? 'text-amber-400 italic' : 'text-[var(--t)]'}`}>
                  {isEmpty ? 'Needs input' : d.sensitive ? (revealed ? d.value || 'Needs input' : mask(d.value)) : d.value}
                </span>
              </div>
            );
          })}
        </div>

        {/* Show/hide credentials */}
        {integration.details.some(d => d.sensitive) && (
          <button onClick={onToggle} className="mt-2 flex items-center gap-1 text-[10px] text-[var(--t4)] hover:text-[var(--t)] transition-colors" data-testid={`reveal-${integration.id}`}>
            {revealed ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
            {revealed ? 'Hide credentials' : 'Show credentials'}
          </button>
        )}
      </CardContent>
    </Card>
  );
};

const COGSSummary = ({ cogs, integrations }) => {
  if (!cogs) return null;
  const paidItems = integrations.filter(i => i.cost_monthly > 0).sort((a, b) => b.cost_monthly - a.cost_monthly);

  return (
    <Card className="glass-card" style={{ borderLeft: '3px solid var(--gold)' }} data-testid="cogs-summary">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-bold text-[var(--t)] flex items-center gap-2">
          <DollarSign className="w-4 h-4 text-[var(--gold)]" /> Monthly COGS Summary
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-4">
          <div className="text-center p-3 rounded-lg" style={{ background: 'rgba(212,175,55,0.06)' }}>
            <div className="text-2xl font-bold text-[var(--gold)]">${cogs.total_monthly.toFixed(2)}</div>
            <div className="text-[10px] text-[var(--t5)]">Total Monthly COGS</div>
          </div>
          <div className="text-center p-3 rounded-lg" style={{ background: 'rgba(34,197,94,0.06)' }}>
            <div className="text-xl font-bold text-green-400">${cogs.verified_total.toFixed(2)}</div>
            <div className="text-[10px] text-[var(--t5)]">Verified Costs</div>
          </div>
          <div className="text-center p-3 rounded-lg col-span-2 sm:col-span-1" style={{ background: cogs.unverified_items > 0 ? 'rgba(245,158,11,0.06)' : 'rgba(34,197,94,0.06)' }}>
            <div className={`text-xl font-bold ${cogs.unverified_items > 0 ? 'text-amber-400' : 'text-green-400'}`}>{cogs.unverified_items}</div>
            <div className="text-[10px] text-[var(--t5)]">Unverified Items</div>
          </div>
        </div>
        {/* Breakdown */}
        <div className="space-y-1.5">
          {paidItems.map(item => (
            <div key={item.id} className="flex justify-between items-center p-2 rounded text-xs" style={{ background: 'var(--s)' }}>
              <span className="text-[var(--t)] font-medium">{item.name}</span>
              <div className="flex items-center gap-2">
                <span className="font-mono font-bold text-[var(--t)]">${item.cost_monthly.toFixed(2)}</span>
                {!item.cost_verified && <AlertTriangle className="w-3 h-3 text-amber-400" />}
              </div>
            </div>
          ))}
          <div className="flex justify-between items-center p-2 rounded text-xs font-bold" style={{ background: 'rgba(212,175,55,0.08)' }}>
            <span className="text-[var(--gold)]">TOTAL</span>
            <span className="font-mono text-[var(--gold)]">${cogs.total_monthly.toFixed(2)}/mo</span>
          </div>
        </div>
        <p className="text-[9px] text-[var(--t5)] mt-2 italic">{cogs.note}</p>
      </CardContent>
    </Card>
  );
};

export const IntegrationsTab = ({ getAuthHeaders }) => {
  const [unlocked, setUnlocked] = useState(false);
  const [password, setPassword] = useState('');
  const [integrations, setIntegrations] = useState(null);
  const [cogs, setCogs] = useState(null);
  const [loading, setLoading] = useState(false);
  const [revealed, setRevealed] = useState({});
  const [error, setError] = useState('');
  const [activeFilter, setActiveFilter] = useState('all');
  const [pdfLoading, setPdfLoading] = useState(false);
  const [storedPassword, setStoredPassword] = useState('');

  const handleUnlock = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const res = await axios.post(`${API_URL}/admin/integrations/unlock`, { password }, getAuthHeaders());
      setIntegrations(res.data.integrations);
      setCogs(res.data.cogs);
      setStoredPassword(password);
      setUnlocked(true);
    } catch {
      setError('Incorrect password');
      toast.error('Access denied');
    } finally { setLoading(false); }
  };

  const handleSOC2Download = async () => {
    setPdfLoading(true);
    try {
      const res = await axios.post(`${API_URL}/admin/integrations/soc2-report`, { password: storedPassword }, {
        ...getAuthHeaders(),
        responseType: 'blob',
      });
      const url = URL.createObjectURL(new Blob([res.data], { type: 'application/pdf' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = `CarryOn_SOC2_Report_${new Date().toISOString().slice(0, 10)}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success('SOC 2 report downloaded');
    } catch {
      toast.error('Failed to generate report');
    } finally { setPdfLoading(false); }
  };

  const toggleReveal = (id) => setRevealed(p => ({ ...p, [id]: !p[id] }));

  if (!unlocked) {
    return (
      <div className="flex items-center justify-center py-20">
        <Card className="glass-card w-full max-w-sm">
          <CardHeader className="text-center pb-2">
            <div className="w-14 h-14 rounded-2xl mx-auto mb-3 flex items-center justify-center" style={{ background: 'rgba(212,175,55,0.1)' }}>
              <Lock className="w-7 h-7 text-[var(--gold)]" />
            </div>
            <CardTitle className="text-lg font-bold text-[var(--t)]">Integrations Vault</CardTitle>
            <p className="text-xs text-[var(--t5)]">Enter your security password to access integration credentials</p>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleUnlock} className="space-y-3">
              <input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="Enter password"
                className="w-full px-4 py-3 rounded-lg text-sm text-[var(--t)] placeholder-[var(--t5)] outline-none" style={{ background: 'var(--s)', border: '1px solid var(--b)' }}
                autoFocus data-testid="integrations-password-input" />
              {error && <p className="text-xs text-red-400 text-center">{error}</p>}
              <button type="submit" disabled={loading || !password}
                className="w-full py-3 rounded-lg text-sm font-bold transition-all disabled:opacity-50"
                style={{ background: 'var(--gold)', color: '#0F1629' }} data-testid="integrations-unlock-btn">
                {loading ? 'Verifying...' : 'Unlock'}
              </button>
            </form>
          </CardContent>
        </Card>
      </div>
    );
  }

  const filtered = activeFilter === 'all' ? integrations : integrations.filter(i => i.category === activeFilter);
  const unverifiedFieldCount = integrations.reduce((sum, i) => sum + i.details.filter(d => !d.verified).length, 0);

  return (
    <div className="space-y-4" data-testid="integrations-tab">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Shield className="w-5 h-5 text-[var(--gold)]" />
          <h2 className="text-base font-bold text-[var(--t)]">Platform Integrations</h2>
          <span className="text-[10px] text-[var(--t5)]">({integrations.length})</span>
          {unverifiedFieldCount > 0 && (
            <span className="flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-400">
              <AlertTriangle className="w-3 h-3" /> {unverifiedFieldCount} unverified
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button onClick={handleSOC2Download} disabled={pdfLoading}
            className="flex items-center gap-1.5 text-[10px] font-bold px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50"
            style={{ background: 'rgba(212,175,55,0.1)', color: 'var(--gold)' }}
            data-testid="soc2-download-btn">
            <Download className="w-3 h-3" /> {pdfLoading ? 'Generating...' : 'SOC 2 Report'}
          </button>
          <button onClick={() => { setUnlocked(false); setPassword(''); setIntegrations(null); setRevealed({}); setCogs(null); }}
            className="flex items-center gap-1 text-[10px] font-bold text-[var(--t5)] hover:text-red-400 px-3 py-1.5 rounded-lg transition-colors"
            style={{ background: 'var(--s)' }} data-testid="integrations-lock-btn">
            <Lock className="w-3 h-3" /> Lock
          </button>
        </div>
      </div>

      {/* Sub-tabs */}
      <div className="flex flex-wrap gap-1.5" data-testid="integration-filters">
        {CATEGORIES.map(cat => {
          const count = cat.key === 'all' ? integrations.length : integrations.filter(i => i.category === cat.key).length;
          const isActive = activeFilter === cat.key;
          return (
            <button key={cat.key} onClick={() => setActiveFilter(cat.key)}
              className={`text-[10px] font-bold px-3 py-1.5 rounded-full transition-all ${isActive ? '' : 'hover:opacity-80'}`}
              style={{
                background: isActive ? 'var(--gold)' : 'var(--s)',
                color: isActive ? '#0F1629' : 'var(--t4)',
              }}
              data-testid={`filter-${cat.key}`}>
              {cat.label} ({count})
            </button>
          );
        })}
      </div>

      {/* COGS Summary (show on All tab) */}
      {activeFilter === 'all' && <COGSSummary cogs={cogs} integrations={integrations} />}

      {/* Integration cards — single column */}
      <div className="space-y-3">
        {filtered.map(integ => (
          <IntegrationCard key={integ.id} integration={integ} revealed={!!revealed[integ.id]} onToggle={() => toggleReveal(integ.id)} />
        ))}
      </div>
    </div>
  );
};
