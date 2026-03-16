import React, { useState } from 'react';
import axios from 'axios';
import { Lock, ExternalLink, Eye, EyeOff, Shield, Database, CreditCard, Mail, Bot, Cloud, MessageSquare, MapPin, Bell, Key, Smartphone, Mic, FileText, Puzzle, Server, Globe, RefreshCw } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { toast } from '../../utils/toast';

const API_URL = `${process.env.REACT_APP_BACKEND_URL}/api`;

const mask = (val) => {
  if (!val || val.length < 12) return '****';
  return val.slice(0, 8) + '...' + val.slice(-4);
};

const IntegrationCard = ({ integration, revealed, onToggle }) => {
  const statusColor = {
    active: '#22C55E', configured: '#22C55E', blocked: '#F59E0B',
    'not configured': '#6B7280', 'free/self-hosted': '#3B82F6',
  };
  const color = statusColor[integration.status] || '#6B7280';
  const Icon = integration.icon;

  return (
    <Card className="glass-card" style={{ borderLeft: `3px solid ${color}` }} data-testid={`integration-${integration.id}`}>
      <CardContent className="py-4 px-4 sm:px-5">
        <div className="flex items-start justify-between gap-2 mb-3">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: `${color}15` }}>
              <Icon className="w-4 h-4" style={{ color }} />
            </div>
            <div>
              <h3 className="text-sm font-bold text-[var(--t)]">{integration.name}</h3>
              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full" style={{ background: `${color}15`, color }}>{integration.status}</span>
            </div>
          </div>
          {integration.dashboard_url && (
            <a href={integration.dashboard_url} target="_blank" rel="noopener noreferrer"
              className="flex items-center gap-1 text-[10px] font-bold text-[var(--t4)] hover:text-[var(--gold)] transition-colors" data-testid={`link-${integration.id}`}>
              Dashboard <ExternalLink className="w-3 h-3" />
            </a>
          )}
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
          {integration.details.map((d, i) => (
            <div key={i} className="flex justify-between gap-2 p-2 rounded" style={{ background: 'var(--s)' }}>
              <span className="text-[var(--t5)] whitespace-nowrap">{d.label}</span>
              <span className="text-[var(--t)] font-mono text-right break-all">
                {d.sensitive ? (revealed ? d.value : mask(d.value)) : d.value}
              </span>
            </div>
          ))}
        </div>
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

export const IntegrationsTab = ({ getAuthHeaders }) => {
  const [unlocked, setUnlocked] = useState(false);
  const [password, setPassword] = useState('');
  const [integrations, setIntegrations] = useState(null);
  const [loading, setLoading] = useState(false);
  const [revealed, setRevealed] = useState({});
  const [error, setError] = useState('');

  const handleUnlock = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const res = await axios.post(`${API_URL}/admin/integrations/unlock`, { password }, getAuthHeaders());
      setIntegrations(res.data.integrations);
      setUnlocked(true);
    } catch (err) {
      setError('Incorrect password');
      toast.error('Access denied');
    } finally { setLoading(false); }
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

  // Group integrations by category
  const categories = [
    { label: 'Infrastructure', keys: ['railway', 'vercel', 'mongodb', 's3'] },
    { label: 'Payments & Subscriptions', keys: ['stripe', 'apple_iap'] },
    { label: 'AI & Communication', keys: ['xai', 'resend', 'twilio'] },
    { label: 'Native & Updates', keys: ['capgo', 'capacitor', 'google_places'] },
    { label: 'Security & Auth', keys: ['webauthn', 'vapid', 'jwt'] },
    { label: 'Local Processing', keys: ['voice_biometrics', 'pdf_tools'] },
  ];

  return (
    <div className="space-y-6" data-testid="integrations-tab">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Shield className="w-5 h-5 text-[var(--gold)]" />
          <h2 className="text-lg font-bold text-[var(--t)]">Platform Integrations</h2>
        </div>
        <button onClick={() => { setUnlocked(false); setPassword(''); setIntegrations(null); setRevealed({}); }}
          className="flex items-center gap-1 text-[10px] font-bold text-[var(--t5)] hover:text-red-400 px-3 py-1.5 rounded-lg transition-colors" style={{ background: 'var(--s)' }}
          data-testid="integrations-lock-btn">
          <Lock className="w-3 h-3" /> Lock
        </button>
      </div>

      {categories.map(cat => {
        const items = cat.keys.map(k => integrations.find(i => i.id === k)).filter(Boolean);
        if (!items.length) return null;
        return (
          <div key={cat.label}>
            <h3 className="text-xs font-bold text-[var(--t4)] mb-3 uppercase tracking-wider">{cat.label}</h3>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
              {items.map(integ => (
                <IntegrationCard key={integ.id} integration={{ ...integ, icon: iconMap[integ.id] || Puzzle }} revealed={!!revealed[integ.id]} onToggle={() => toggleReveal(integ.id)} />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
};

const iconMap = {
  railway: Server, vercel: Globe, mongodb: Database, s3: Cloud,
  stripe: CreditCard, apple_iap: Smartphone, xai: Bot, resend: Mail,
  twilio: MessageSquare, capgo: RefreshCw, capacitor: Smartphone,
  google_places: MapPin, webauthn: Key, vapid: Bell, jwt: Shield,
  voice_biometrics: Mic, pdf_tools: FileText,
};
