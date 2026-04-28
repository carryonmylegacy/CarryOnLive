import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import axios from 'axios';
import { Lock, ExternalLink, Eye, EyeOff, Shield, Database, CreditCard, Mail, Bot, Cloud,
  MessageSquare, MapPin, Bell, Key, Smartphone, Mic, FileText, Puzzle, Server, Globe,
  RefreshCw, Download, DollarSign, AlertTriangle, CheckCircle2, Users, Gauge, ArrowUpCircle,
  Activity, HardDrive, TrendingUp, Pencil, X, BarChart3, Crosshair } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { toast } from '../../utils/toast';
import { iosSafeDownload } from '../../utils/iosSafeDownload';
import { API_URL } from '../../config';

const iconMap = {
  railway: Server, vercel: Globe, mongodb: Database, s3: Cloud,
  stripe: CreditCard, apple_iap: Smartphone, xai: Bot, resend: Mail,
  twilio: MessageSquare, capgo: RefreshCw, capacitor: Smartphone,
  google_places: MapPin, webauthn: Key, vapid: Bell, jwt: Shield,
  voice_biometrics: Mic, pdf_tools: FileText,
  firebase: BarChart3, meta_pixel: Crosshair,
  social_instagram: Globe, social_facebook: Globe, social_linkedin: Globe,
};

const CATEGORIES = [
  { key: 'all', label: 'All' },
  { key: 'infrastructure', label: 'Infrastructure' },
  { key: 'payments', label: 'Payments' },
  { key: 'ai_communication', label: 'AI & Comms' },
  { key: 'analytics', label: 'Analytics' },
  { key: 'native_updates', label: 'Native & Updates' },
  { key: 'security_auth', label: 'Security' },
  { key: 'local_processing', label: 'Local' },
];

const RANK_STYLES = {
  1: { border: '#EF4444', bg: 'rgba(239,68,68,0.04)', label: 'MOST LIMITING', labelBg: 'rgba(239,68,68,0.15)', labelColor: '#EF4444' },
  2: { border: '#F97316', bg: 'rgba(249,115,22,0.04)', label: '2ND LIMITING', labelBg: 'rgba(249,115,22,0.15)', labelColor: '#F97316' },
  3: { border: '#EAB308', bg: 'rgba(234,179,8,0.04)', label: '3RD LIMITING', labelBg: 'rgba(234,179,8,0.15)', labelColor: '#EAB308' },
};

const mask = (val) => {
  if (!val || val.length < 12) return '****';
  return val.slice(0, 8) + '...' + val.slice(-4);
};

// ─── Capacity Dashboard ─────────────────────────────────────
const CapacityDashboard = ({ capacity }) => {
  if (!capacity) return null;
  const { total_users, platform_ceiling, most_limiting_name, usage_percent } = capacity;
  const ceilingDisplay = platform_ceiling >= 999999 ? 'Unlimited' : platform_ceiling.toLocaleString();

  const gaugeColor = usage_percent >= 80 ? '#EF4444' : usage_percent >= 50 ? '#F97316' : usage_percent >= 25 ? '#EAB308' : '#22C55E';

  return (
    <div className="grid grid-cols-3 gap-0 rounded-xl overflow-hidden" style={{ border: `1px solid var(--b)` }} data-testid="capacity-dashboard">
      {/* Box 1: Total Users */}
      <div className="p-4 sm:p-5 text-center" style={{ background: 'rgba(59,130,246,0.05)', borderRight: '1px solid var(--b)' }}>
        <Users className="w-5 h-5 mx-auto mb-2 text-blue-400" />
        <div className="text-2xl sm:text-3xl font-bold text-[var(--t)]" data-testid="total-users">{total_users.toLocaleString()}</div>
        <div className="text-[11px] sm:text-xs text-[var(--t5)] mt-1">Total Users</div>
        <div className="text-[11px] text-[var(--t5)] mt-0.5 hidden sm:block">
          {capacity.role_breakdown && Object.entries(capacity.role_breakdown).map(([r, c]) => (
            <span key={r} className="inline-block mr-2">{r}: {c}</span>
          ))}
        </div>
      </div>
      {/* Box 2: Platform Ceiling */}
      <div className="p-4 sm:p-5 text-center" style={{ background: 'rgba(34,197,94,0.05)', borderRight: '1px solid var(--b)' }}>
        <Gauge className="w-5 h-5 mx-auto mb-2" style={{ color: gaugeColor }} />
        <div className="text-2xl sm:text-3xl font-bold" style={{ color: gaugeColor }} data-testid="platform-ceiling">{ceilingDisplay}</div>
        <div className="text-[11px] sm:text-xs text-[var(--t5)] mt-1">Max Capacity</div>
        <div className="mt-1.5 w-full h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--s)' }}>
          <div className="h-full rounded-full transition-all" style={{ width: `${Math.min(usage_percent, 100)}%`, background: gaugeColor }} />
        </div>
        <div className="text-[11px] mt-0.5" style={{ color: gaugeColor }}>{usage_percent}% used</div>
      </div>
      {/* Box 3: Most Limiting */}
      <div className="p-4 sm:p-5 text-center" style={{ background: 'rgba(239,68,68,0.05)' }}>
        <AlertTriangle className="w-5 h-5 mx-auto mb-2 text-red-400" />
        <div className="text-sm sm:text-base font-bold text-red-400" data-testid="most-limiting">{most_limiting_name || 'None'}</div>
        <div className="text-[11px] sm:text-xs text-[var(--t5)] mt-1">Bottleneck</div>
        {capacity.top_3_limiting?.[0] && (
          <a href={capacity.top_3_limiting[0].upgrade_url} target="_blank" rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-[11px] font-bold text-red-400 hover:text-red-300 mt-1 transition-colors" data-testid="upgrade-bottleneck-link">
            <ArrowUpCircle className="w-3 h-3" /> Upgrade
          </a>
        )}
      </div>
    </div>
  );
};

// ─── Warnings Bar ────────────────────────────────────────────
const WarningsBar = ({ warnings, dbStats }) => {
  if ((!warnings || !warnings.length) && !dbStats) return null;
  return (
    <div className="space-y-2" data-testid="warnings-bar">
      {warnings?.map((w, i) => (
        <div key={i} className={`flex items-center gap-2 p-3 rounded-lg text-xs font-medium ${w.level === 'critical' ? 'bg-red-500/10 text-red-400' : 'bg-amber-500/10 text-amber-400'}`}>
          <AlertTriangle className="w-4 h-4 shrink-0" />
          {w.message}
        </div>
      ))}
      {dbStats && (
        <div className="flex items-center gap-3 p-3 rounded-lg text-xs" style={{ background: 'var(--s)' }}>
          <HardDrive className="w-4 h-4 text-[var(--t4)] shrink-0" />
          <span className="text-[var(--t5)]">Database: {dbStats.data_gb}GB data / {dbStats.storage_gb}GB on disk / {dbStats.collections} collections</span>
        </div>
      )}
    </div>
  );
};

// ─── Integration Card ────────────────────────────────────────
const IntegrationCard = ({ integration, revealed, onToggle, onEdit }) => {
  const rank = integration.limiting_rank;
  const rankStyle = RANK_STYLES[rank];
  const isLimiting = rank > 0;
  const statusColors = { active: '#22C55E', blocked: '#F59E0B', 'free/self-hosted': '#3B82F6' };
  const statusColor = statusColors[integration.status] || '#6B7280';
  const Icon = iconMap[integration.id] || Puzzle;

  const borderColor = rankStyle ? rankStyle.border : 'var(--b)';
  const cardBg = rankStyle ? rankStyle.bg : 'transparent';

  return (
    <Card className="glass-card transition-all" style={{ border: `2px solid ${borderColor}`, background: cardBg }} data-testid={`integration-${integration.id}`}>
      <CardContent className="py-4 px-4 sm:px-5">
        {/* Header */}
        <div className="flex items-start justify-between gap-2 mb-3">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 relative" style={{ background: `${statusColor}15` }}>
              <Icon className="w-4 h-4" style={{ color: statusColor }} />
              <div className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-green-500 border border-[var(--bg)]" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="text-sm font-bold text-[var(--t)]">{integration.name}</h3>
                {rankStyle && (
                  <span className="text-[11px] font-black px-2 py-0.5 rounded-full" style={{ background: rankStyle.labelBg, color: rankStyle.labelColor }}>
                    {rankStyle.label}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                <span className="text-[11px] font-bold px-1.5 py-0.5 rounded-full" style={{ background: `${statusColor}15`, color: statusColor }}>{integration.status}</span>
                {integration.cost_monthly > 0 && (
                  <span className="text-[11px] font-bold px-1.5 py-0.5 rounded-full" style={{ background: 'rgba(212,175,55,0.1)', color: 'var(--gold)' }}>
                    ${integration.cost_monthly.toFixed(2)}/mo
                  </span>
                )}
                {integration.cost_monthly === 0 && integration.status !== 'blocked' && (
                  <span className="text-[11px] font-bold px-1.5 py-0.5 rounded-full" style={{ background: 'rgba(59,130,246,0.1)', color: '#3B82F6' }}>Free</span>
                )}
                {integration.max_users < 999999 && (
                  <span className="text-[11px] px-1.5 py-0.5 rounded-full" style={{ background: 'var(--s)', color: 'var(--t4)' }}>
                    {integration.max_users.toLocaleString()} users max
                  </span>
                )}
              </div>
            </div>
          </div>
          <div className="flex flex-col items-end gap-1 shrink-0">
            {integration.dashboard_url && (
              <a href={integration.dashboard_url} target="_blank" rel="noopener noreferrer"
                className="flex items-center gap-1 text-[11px] font-bold text-[var(--t4)] hover:text-[var(--gold)] transition-colors" data-testid={`link-${integration.id}`}>
                Dashboard <ExternalLink className="w-3 h-3" />
              </a>
            )}
            {isLimiting && integration.upgrade_url && (
              <a href={integration.upgrade_url} target="_blank" rel="noopener noreferrer"
                className="flex items-center gap-1 text-[11px] font-bold transition-colors" style={{ color: rankStyle.labelColor }}
                data-testid={`upgrade-${integration.id}`}>
                <ArrowUpCircle className="w-3 h-3" /> Upgrade
              </a>
            )}
            <button onClick={() => onEdit(integration)} className="flex items-center gap-1 text-[11px] font-bold text-[var(--t4)] hover:text-blue-400 transition-colors mt-0.5"
              data-testid={`edit-${integration.id}`}>
              <Pencil className="w-3 h-3" /> Edit
            </button>
          </div>
        </div>

        {/* Capacity reason for limiting integrations */}
        {isLimiting && integration.capacity_reason && (
          <div className="text-[11px] p-2 rounded mb-2 flex items-center gap-1.5" style={{ background: rankStyle.labelBg, color: rankStyle.labelColor }}>
            <Activity className="w-3 h-3 shrink-0" />
            <span>{integration.capacity_reason}</span>
            {integration.upgrade_to && integration.upgrade_to !== 'N/A' && (
              <span className="font-bold ml-1">Upgrade: {integration.upgrade_to}</span>
            )}
          </div>
        )}

        {/* Cost note */}
        {integration.cost_note && (
          <div className="text-[11px] text-[var(--t5)] mb-2 flex items-center gap-1">
            <DollarSign className="w-3 h-3 shrink-0" />
            {integration.cost_note}
            {!integration.cost_verified && <span className="text-amber-400 font-bold ml-1">(unverified)</span>}
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
                  {isEmpty ? 'Needs input' : d.sensitive ? (revealed ? d.value || 'Needs input' : '••••••••') : d.value}
                </span>
              </div>
            );
          })}
        </div>

        {integration.details.some(d => d.sensitive) && (
          <button onClick={onToggle} className="mt-2 flex items-center gap-1 text-[11px] text-[var(--t4)] hover:text-[var(--t)] transition-colors" data-testid={`reveal-${integration.id}`}>
            {revealed ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
            {revealed ? 'Hide credentials' : 'Show credentials'}
          </button>
        )}
      </CardContent>
    </Card>
  );
};

// ─── COGS Summary ────────────────────────────────────────────
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
            <div className="text-[11px] text-[var(--t5)]">Total Monthly COGS</div>
          </div>
          <div className="text-center p-3 rounded-lg" style={{ background: 'rgba(34,197,94,0.06)' }}>
            <div className="text-xl font-bold text-green-400">${cogs.verified_total.toFixed(2)}</div>
            <div className="text-[11px] text-[var(--t5)]">Verified Costs</div>
          </div>
          <div className="text-center p-3 rounded-lg col-span-2 sm:col-span-1" style={{ background: cogs.unverified_items > 0 ? 'rgba(245,158,11,0.06)' : 'rgba(34,197,94,0.06)' }}>
            <div className={`text-xl font-bold ${cogs.unverified_items > 0 ? 'text-amber-400' : 'text-green-400'}`}>{cogs.unverified_items}</div>
            <div className="text-[11px] text-[var(--t5)]">Unverified Items</div>
          </div>
        </div>
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
        <p className="text-[11px] text-[var(--t5)] mt-2 italic">{cogs.note}</p>
      </CardContent>
    </Card>
  );
};

// ─── Suggestions Panel ───────────────────────────────────────
const SuggestionsPanel = ({ capacity }) => {
  if (!capacity) return null;
  const suggestions = [
    { icon: TrendingUp, text: 'Set up usage alerts in Resend, MongoDB Atlas, and Railway dashboards to get email notifications before hitting plan limits.' },
    { icon: Activity, text: 'Monitor the System Health tab for xAI credit burn rate — set a calendar reminder to check monthly spend vs. remaining balance.' },
    { icon: HardDrive, text: 'MongoDB M30 has 40GB storage. Your current usage is small, but media-heavy estates will grow fast. Watch the database storage metric above.' },
    { icon: ArrowUpCircle, text: 'Pre-negotiate your upgrade path: Resend Scale ($90/mo) at 8K users, Capgo Team ($83/mo) at 10K MAU, MongoDB M40 ($759/mo) at 15K users.' },
    { icon: Shield, text: 'Railway and Vercel have no status page alerts configured. Add https://status.railway.com and https://vercel-status.com to your monitoring to catch outages.' },
    { icon: Gauge, text: 'Consider adding a daily automated email to yourself with key metrics: total users, new signups, emails sent, Guardian AI sessions, and error count.' },
  ];

  return (
    <Card className="glass-card" style={{ borderLeft: '3px solid #3B82F6' }} data-testid="suggestions-panel">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-bold text-[var(--t)] flex items-center gap-2">
          <TrendingUp className="w-4 h-4 text-blue-400" /> Sole Operator Recommendations
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {suggestions.map((s, i) => (
          <div key={i} className="flex items-start gap-2.5 p-2.5 rounded-lg text-xs text-[var(--t4)]" style={{ background: 'var(--s)' }}>
            <s.icon className="w-4 h-4 text-blue-400 shrink-0 mt-0.5" />
            <span>{s.text}</span>
          </div>
        ))}
      </CardContent>
    </Card>
  );
};

// ─── Main Tab ────────────────────────────────────────────────
export const IntegrationsTab = ({ getAuthHeaders }) => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [revealed, setRevealed] = useState({});
  const [activeFilter, setActiveFilter] = useState('all');
  const [pdfLoading, setPdfLoading] = useState(false);
  const [sessionPin, setSessionPin] = useState('');
  const [pinDigits, setPinDigits] = useState(['', '', '', '']);
  const [pinError, setPinError] = useState('');
  const [pinPurpose, setPinPurpose] = useState(null); // 'reveal' | 'edit' | 'soc2'
  const [pendingAction, setPendingAction] = useState(null);
  const [editInteg, setEditInteg] = useState(null);
  const [editFields, setEditFields] = useState({});
  const [editCost, setEditCost] = useState('');
  const [editCostNote, setEditCostNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [changePinMode, setChangePinMode] = useState(false);
  const [newPinDigits, setNewPinDigits] = useState(['', '', '', '']);
  const [changePinStep, setChangePinStep] = useState('current'); // 'current' | 'new'
  const [currentPinForChange, setCurrentPinForChange] = useState('');

  // Auto-load integrations on mount (no password needed)
  React.useEffect(() => {
    const load = async () => {
      try {
        const res = await axios.get(`${API_URL}/admin/integrations`, getAuthHeaders());
        setData(res.data);
      } catch { toast.error('Failed to load integrations'); }
      finally { setLoading(false); }
    };
    load();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Prompt for PIN with a purpose
  const requirePin = (purpose, action) => {
    if (sessionPin) { action(sessionPin); return; }
    setPinPurpose(purpose);
    setPendingAction(() => action);
    setPinDigits(['', '', '', '']);
    setPinError('');
  };

  const submitPin = async (fullPin) => {
    try {
      const res = await axios.post(`${API_URL}/admin/integrations/unlock`, { pin: fullPin }, getAuthHeaders());
      setSessionPin(fullPin);
      setData(res.data);
      setPinPurpose(null);
      if (pendingAction) pendingAction(fullPin);
      setPendingAction(null);
    } catch {
      setPinError('Wrong PIN');
      setPinDigits(['', '', '', '']);
    }
  };

  const handlePinDigit = (digit) => {
    setPinError('');
    const newDigits = [...pinDigits];
    const nextEmpty = newDigits.findIndex(d => d === '');
    if (nextEmpty === -1) return;
    newDigits[nextEmpty] = digit;
    setPinDigits(newDigits);
    if (nextEmpty === 3) {
      setTimeout(() => submitPin(newDigits.join('')), 150);
    }
  };

  const handlePinBackspace = () => {
    setPinError('');
    const newDigits = [...pinDigits];
    const lastFilled = newDigits.map((d, i) => d !== '' ? i : -1).filter(i => i >= 0).pop();
    if (lastFilled !== undefined && lastFilled >= 0) {
      newDigits[lastFilled] = '';
      setPinDigits(newDigits);
    }
  };

  const handleToggleReveal = (id) => {
    if (revealed[id]) { setRevealed(p => ({ ...p, [id]: false })); return; }
    requirePin('reveal', () => setRevealed(p => ({ ...p, [id]: true })));
  };

  const handleEdit = (integ) => {
    requirePin('edit', () => {
      setEditInteg(integ);
      const fields = {};
      integ.details.forEach(d => { fields[d.label] = d.value || ''; });
      setEditFields(fields);
      setEditCost(integ.cost_monthly?.toString() || '0');
      setEditCostNote(integ.cost_note || '');
    });
  };

  const handleSave = async () => {
    if (!editInteg || !sessionPin) return;
    setSaving(true);
    try {
      await axios.put(`${API_URL}/admin/integrations/${editInteg.id}`, {
        pin: sessionPin,
        details: editFields,
        cost_monthly: parseFloat(editCost) || 0,
        cost_note: editCostNote || null,
      }, getAuthHeaders());
      const res = await axios.post(`${API_URL}/admin/integrations/unlock`, { pin: sessionPin }, getAuthHeaders());
      setData(res.data);
      setEditInteg(null);
      toast.success(`${editInteg.name} updated`);
    } catch { toast.error('Failed to save'); }
    finally { setSaving(false); }
  };

  const handleSOC2Download = async (pin) => {
    setPdfLoading(true);
    try {
      const res = await axios.post(`${API_URL}/admin/integrations/soc2-report`, { pin: pin || sessionPin }, {
        ...getAuthHeaders(), responseType: 'blob',
      });
      const filename = `CarryOn_SOC2_Report_${new Date().toISOString().slice(0, 10)}.pdf`;
      await iosSafeDownload(new Blob([res.data], { type: 'application/pdf' }), filename, 'SOC 2 report');
    } catch { toast.error('Failed to generate report'); }
    finally { setPdfLoading(false); }
  };

  const openChangePin = () => {
    setChangePinMode(true);
    setChangePinStep('current');
    setPinDigits(['', '', '', '']);
    setNewPinDigits(['', '', '', '']);
    setPinError('');
    setCurrentPinForChange('');
  };

  const handleChangePinDigit = (digit) => {
    setPinError('');
    if (changePinStep === 'current') {
      const d = [...pinDigits];
      const i = d.findIndex(x => x === '');
      if (i === -1) return;
      d[i] = digit;
      setPinDigits(d);
      if (i === 3) {
        setCurrentPinForChange(d.join(''));
        setTimeout(() => {
          setChangePinStep('new');
          setNewPinDigits(['', '', '', '']);
          setPinError('');
        }, 200);
      }
    } else {
      const d = [...newPinDigits];
      const i = d.findIndex(x => x === '');
      if (i === -1) return;
      d[i] = digit;
      setNewPinDigits(d);
      if (i === 3) {
        setTimeout(async () => {
          try {
            await axios.put(`${API_URL}/admin/integrations-pin`, {
              current_pin: currentPinForChange,
              new_pin: d.join(''),
            }, getAuthHeaders());
            toast.success('PIN changed successfully');
            setSessionPin(d.join(''));
            setChangePinMode(false);
          } catch {
            setPinError('Current PIN incorrect');
            setChangePinStep('current');
            setPinDigits(['', '', '', '']);
          }
        }, 200);
      }
    }
  };

  const handleChangePinBackspace = () => {
    setPinError('');
    if (changePinStep === 'current') {
      const d = [...pinDigits];
      const last = d.map((x, i) => x !== '' ? i : -1).filter(i => i >= 0).pop();
      if (last !== undefined) { d[last] = ''; setPinDigits(d); }
    } else {
      const d = [...newPinDigits];
      const last = d.map((x, i) => x !== '' ? i : -1).filter(i => i >= 0).pop();
      if (last !== undefined) { d[last] = ''; setNewPinDigits(d); }
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="text-sm text-[var(--t5)]">Loading integrations...</div>
      </div>
    );
  }

  if (!data) return null;

  const { integrations, capacity, warnings, cogs, db_stats: dbStats } = data;
  const filtered = activeFilter === 'all' ? integrations : integrations.filter(i => i.category === activeFilter);
  const unverifiedFieldCount = integrations.reduce((sum, i) => sum + i.details.filter(d => !d.verified).length, 0);

  return (
    <div className="space-y-4" data-testid="integrations-tab">
      {/* PIN Keypad Modal — portaled to body */}
      {pinPurpose && createPortal(
        <div className="fixed inset-0 z-[9999] flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.7)' }} onClick={() => { setPinPurpose(null); setPendingAction(null); }}>
          <div className="w-[calc(100%-2rem)] max-w-xs rounded-2xl overflow-hidden" style={{ background: 'var(--bg)', border: '1px solid var(--b)' }} onClick={e => e.stopPropagation()}>
            <div className="py-5 px-5 relative">
              <button onClick={() => { setPinPurpose(null); setPendingAction(null); }} className="absolute top-3 right-3 text-[var(--t5)] hover:text-[var(--t)] p-2" data-testid="pin-modal-close">
                <X className="w-5 h-5" />
              </button>
              <div className="text-center mb-5">
                <Lock className="w-7 h-7 text-[var(--gold)] mx-auto mb-2" />
                <h3 className="text-sm font-bold text-[var(--t)]">
                  {pinPurpose === 'reveal' ? 'View Credentials' : pinPurpose === 'edit' ? 'Edit Integration' : 'Download Report'}
                </h3>
                <p className="text-xs text-[var(--t5)] mt-1">Enter your 4-digit PIN</p>
              </div>

              {/* PIN Dots */}
              <div className="flex justify-center gap-3 mb-4" data-testid="pin-dots">
                {pinDigits.map((d, i) => (
                  <div key={i} className="w-12 h-12 rounded-xl flex items-center justify-center text-xl font-bold transition-all"
                    style={{
                      background: d ? 'rgba(212,175,55,0.15)' : 'var(--s)',
                      border: `2px solid ${d ? 'var(--gold)' : pinError ? '#EF4444' : 'var(--b)'}`,
                      color: 'var(--t)',
                    }}>
                    {d ? '•' : ''}
                  </div>
                ))}
              </div>

              {pinError && <p className="text-xs text-red-400 text-center mb-3" data-testid="pin-error">{pinError}</p>}

              {/* Numeric Keypad */}
              <div className="grid grid-cols-3 gap-2" data-testid="pin-keypad">
                {[1, 2, 3, 4, 5, 6, 7, 8, 9].map(n => (
                  <button key={n} onClick={() => handlePinDigit(String(n))}
                    className="py-3 rounded-xl text-lg font-bold text-[var(--t)] transition-all active:scale-95"
                    style={{ background: 'var(--s)', border: '1px solid var(--b)' }}
                    data-testid={`pin-key-${n}`}>
                    {n}
                  </button>
                ))}
                <div />
                <button onClick={() => handlePinDigit('0')}
                  className="py-3 rounded-xl text-lg font-bold text-[var(--t)] transition-all active:scale-95"
                  style={{ background: 'var(--s)', border: '1px solid var(--b)' }}
                  data-testid="pin-key-0">
                  0
                </button>
                <button onClick={handlePinBackspace}
                  className="py-3 rounded-xl text-sm font-bold text-[var(--t5)] transition-all active:scale-95"
                  style={{ background: 'var(--s)', border: '1px solid var(--b)' }}
                  data-testid="pin-key-back">
                  ←
                </button>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Edit Modal — portaled to body to escape main-content stacking context */}
      {editInteg && createPortal(
        <div className="fixed inset-0 z-[9999] flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.7)' }} onClick={() => setEditInteg(null)}>
          <div
            className="w-[calc(100%-2rem)] max-w-md flex flex-col rounded-2xl overflow-hidden"
            style={{ background: 'var(--bg)', border: '1px solid var(--b)', maxHeight: 'calc(100dvh - 8rem)' }}
            onClick={e => e.stopPropagation()}
          >
            {/* Sticky Header */}
            <div className="flex items-center justify-between px-4 py-3 shrink-0" style={{ borderBottom: '1px solid var(--b)' }}>
              <div className="flex items-center gap-2 text-base font-bold text-[var(--t)]">
                <Pencil className="w-4 h-4 text-[var(--gold)]" /> Edit {editInteg.name}
              </div>
              <button onClick={() => setEditInteg(null)} className="text-[var(--t5)] hover:text-[var(--t)] p-2 -mr-2" data-testid="edit-modal-close">
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Scrollable Body */}
            <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3" style={{ WebkitOverflowScrolling: 'touch' }}>
              {editInteg.details.map((d) => (
                <div key={d.label}>
                  <label className="text-[11px] font-bold text-[var(--t5)] uppercase tracking-wider">{d.label}</label>
                  <input
                    type={d.sensitive ? 'password' : 'text'}
                    value={editFields[d.label] || ''}
                    onChange={e => setEditFields(p => ({ ...p, [d.label]: e.target.value }))}
                    placeholder={d.sensitive ? '••••••••' : `Enter ${d.label.toLowerCase()}`}
                    className="input-field w-full px-3 py-2.5 rounded-lg text-[var(--t)] placeholder-[var(--t5)] outline-none mt-1"
                    style={{ background: 'var(--s)', border: '1px solid var(--b)', fontSize: '16px' }}
                    data-testid={`edit-field-${d.label.toLowerCase().replace(/\s+/g, '-')}`}
                  />
                </div>
              ))}

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[11px] font-bold text-[var(--t5)] uppercase tracking-wider">Monthly Cost ($)</label>
                  <input type="number" step="0.01" value={editCost}
                    onChange={e => setEditCost(e.target.value)}
                    className="input-field w-full px-3 py-2.5 rounded-lg text-[var(--t)] outline-none mt-1"
                    style={{ background: 'var(--s)', border: '1px solid var(--b)', fontSize: '16px' }}
                    data-testid="edit-cost" />
                </div>
                <div>
                  <label className="text-[11px] font-bold text-[var(--t5)] uppercase tracking-wider">Cost Note</label>
                  <input type="text" value={editCostNote}
                    onChange={e => setEditCostNote(e.target.value)}
                    placeholder="e.g. Upgraded to Pro"
                    className="input-field w-full px-3 py-2.5 rounded-lg text-[var(--t)] placeholder-[var(--t5)] outline-none mt-1"
                    style={{ background: 'var(--s)', border: '1px solid var(--b)', fontSize: '16px' }}
                    data-testid="edit-cost-note" />
                </div>
              </div>
            </div>

            {/* Sticky Footer */}
            <div className="flex gap-2 px-4 py-3 shrink-0" style={{ borderTop: '1px solid var(--b)' }}>
              <button onClick={() => setEditInteg(null)}
                className="flex-1 py-2.5 rounded-lg text-sm font-bold transition-all"
                style={{ background: 'var(--s)', color: 'var(--t4)', border: '1px solid var(--b)' }}
                data-testid="edit-cancel">
                Cancel
              </button>
              <button onClick={handleSave} disabled={saving}
                className="flex-1 py-2.5 rounded-lg text-sm font-bold transition-all disabled:opacity-50"
                style={{ background: 'var(--gold)', color: '#0F1629' }}
                data-testid="edit-save">
                {saving ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Change PIN Modal — portaled to body */}
      {changePinMode && createPortal(
        <div className="fixed inset-0 z-[9999] flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.7)' }} onClick={() => setChangePinMode(false)}>
          <div className="w-[calc(100%-2rem)] max-w-xs rounded-2xl overflow-hidden" style={{ background: 'var(--bg)', border: '1px solid var(--b)' }} onClick={e => e.stopPropagation()}>
            <div className="py-5 px-5 relative">
              <button onClick={() => setChangePinMode(false)} className="absolute top-3 right-3 text-[var(--t5)] hover:text-[var(--t)] p-2" data-testid="change-pin-close">
                <X className="w-5 h-5" />
              </button>
              <div className="text-center mb-5">
                <Key className="w-7 h-7 text-[var(--gold)] mx-auto mb-2" />
                <h3 className="text-sm font-bold text-[var(--t)]">
                  {changePinStep === 'current' ? 'Enter Current PIN' : 'Enter New PIN'}
                </h3>
                <p className="text-xs text-[var(--t5)] mt-1">
                  {changePinStep === 'current' ? 'Verify your identity first' : 'Choose a new 4-digit PIN'}
                </p>
              </div>

              <div className="flex justify-center gap-3 mb-4">
                {(changePinStep === 'current' ? pinDigits : newPinDigits).map((d, i) => (
                  <div key={i} className="w-12 h-12 rounded-xl flex items-center justify-center text-xl font-bold transition-all"
                    style={{
                      background: d ? 'rgba(212,175,55,0.15)' : 'var(--s)',
                      border: `2px solid ${d ? 'var(--gold)' : pinError ? '#EF4444' : 'var(--b)'}`,
                      color: 'var(--t)',
                    }}>
                    {d ? '•' : ''}
                  </div>
                ))}
              </div>

              {pinError && <p className="text-xs text-red-400 text-center mb-3">{pinError}</p>}

              <div className="grid grid-cols-3 gap-2">
                {[1, 2, 3, 4, 5, 6, 7, 8, 9].map(n => (
                  <button key={n} onClick={() => handleChangePinDigit(String(n))}
                    className="py-3 rounded-xl text-lg font-bold text-[var(--t)] transition-all active:scale-95"
                    style={{ background: 'var(--s)', border: '1px solid var(--b)' }}>
                    {n}
                  </button>
                ))}
                <div />
                <button onClick={() => handleChangePinDigit('0')}
                  className="py-3 rounded-xl text-lg font-bold text-[var(--t)] transition-all active:scale-95"
                  style={{ background: 'var(--s)', border: '1px solid var(--b)' }}>
                  0
                </button>
                <button onClick={handleChangePinBackspace}
                  className="py-3 rounded-xl text-sm font-bold text-[var(--t5)] transition-all active:scale-95"
                  style={{ background: 'var(--s)', border: '1px solid var(--b)' }}>
                  ←
                </button>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2 flex-wrap">
          <Shield className="w-5 h-5 text-[var(--gold)]" />
          <h2 className="text-base font-bold text-[var(--t)]">Platform Integrations</h2>
          <span className="text-[11px] text-[var(--t5)]">({integrations.length})</span>
          {unverifiedFieldCount > 0 && (
            <span className="flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-400">
              <AlertTriangle className="w-3 h-3" /> {unverifiedFieldCount} unverified
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button onClick={openChangePin}
            className="flex items-center gap-1.5 text-[11px] font-bold px-3 py-1.5 rounded-lg transition-colors"
            style={{ background: 'rgba(255,255,255,0.05)', color: 'var(--t4)', border: '1px solid var(--b)' }}
            data-testid="change-pin-btn">
            <Key className="w-3 h-3" /> Change PIN
          </button>
          <button onClick={() => requirePin('soc2', handleSOC2Download)} disabled={pdfLoading}
            className="flex items-center gap-1.5 text-[11px] font-bold px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50"
            style={{ background: 'rgba(212,175,55,0.1)', color: 'var(--gold)' }}
            data-testid="soc2-download-btn">
            <Download className="w-3 h-3" /> {pdfLoading ? 'Generating...' : 'SOC 2 Report'}
          </button>
        </div>
      </div>

      {/* Capacity Dashboard Tiles */}
      <CapacityDashboard capacity={capacity} />

      {/* Warnings */}
      <WarningsBar warnings={warnings} dbStats={dbStats} />

      {/* Sub-tabs */}
      <div className="flex flex-wrap gap-1.5" data-testid="integration-filters">
        {CATEGORIES.map(cat => {
          const count = cat.key === 'all' ? integrations.length : integrations.filter(i => i.category === cat.key).length;
          const isActive = activeFilter === cat.key;
          return (
            <button key={cat.key} onClick={() => setActiveFilter(cat.key)}
              className={`text-[11px] font-bold px-3 py-1.5 rounded-full transition-all ${isActive ? '' : 'hover:opacity-80'}`}
              style={{ background: isActive ? 'var(--gold)' : 'var(--s)', color: isActive ? '#0F1629' : 'var(--t4)' }}
              data-testid={`filter-${cat.key}`}>
              {cat.label} ({count})
            </button>
          );
        })}
      </div>

      {/* COGS Summary (All tab only) */}
      {activeFilter === 'all' && <COGSSummary cogs={cogs} integrations={integrations} />}

      {/* Integration cards — single column, sorted by limiting rank first */}
      <div className="space-y-3">
        {[...filtered].sort((a, b) => {
          if (a.limiting_rank && b.limiting_rank) return a.limiting_rank - b.limiting_rank;
          if (a.limiting_rank) return -1;
          if (b.limiting_rank) return 1;
          return 0;
        }).map(integ => (
          <IntegrationCard key={integ.id} integration={integ} revealed={!!revealed[integ.id]}
            onToggle={() => handleToggleReveal(integ.id)} onEdit={handleEdit} />
        ))}
      </div>

      {/* Sole Operator Recommendations (All tab only) */}
      {activeFilter === 'all' && <SuggestionsPanel capacity={capacity} />}
    </div>
  );
};
