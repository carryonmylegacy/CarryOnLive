import React, { useState } from 'react';
import { ShieldCheck, Smartphone, Check, Loader2 } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '../ui/dialog';
import apiClient from '../../utils/apiClient';
import { API_URL } from '../../config';
import { useAuth } from '../../contexts/AuthContext';
import { DICTATION_ENGINES } from '../../hooks/useDictation';
import { notify } from '../AppNotification';

const ICONS = { private: ShieldCheck, device: Smartphone };

// Shared card for the first-tap chooser and the Settings toggle. Saves users.dictation_engine.
export const DictationEngineOptions = ({ value, onChange, saving, compact = false }) => (
  <div className={`grid gap-3 ${compact ? '' : 'sm:grid-cols-2'}`} data-testid="dictation-engine-options">
    {Object.values(DICTATION_ENGINES).map((opt) => {
      const Icon = ICONS[opt.id];
      const active = value === opt.id;
      return (
        <button key={opt.id} type="button" onClick={() => onChange(opt.id)} disabled={saving} aria-pressed={active}
          className="text-left rounded-xl p-4 transition-all active:scale-[0.99] disabled:opacity-60"
          style={{ border: `1px solid ${active ? 'rgba(var(--gold-rgb), 0.7)' : 'var(--b)'}`, background: active ? 'rgba(var(--gold-rgb), 0.08)' : 'var(--s)' }}
          data-testid={`dictation-engine-${opt.id}`}>
          <div className="flex items-center gap-2 flex-wrap mb-1.5">
            <Icon className="w-4 h-4 flex-shrink-0" style={{ color: active ? 'var(--gold)' : 'var(--t4)' }} />
            <span className="text-sm font-bold text-[var(--t)]">{opt.label}</span>
            {opt.id === 'private' && <span className="text-[11px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded whitespace-nowrap" style={{ background: 'rgba(var(--gold-rgb), 0.15)', color: 'var(--gold)' }}>Recommended</span>}
            {active && <Check className="w-4 h-4 ml-auto text-[var(--gold)]" />}
          </div>
          <p className="text-xs leading-relaxed text-[var(--t3)]">{opt.blurb}</p>
          <p className="text-[11px] mt-1.5 text-[var(--t5)]">{opt.tradeoff}</p>
        </button>
      );
    })}
  </div>
);

export function useSaveDictationEngine() {
  const { getAuthHeaders, refreshUser } = useAuth();
  const [saving, setSaving] = useState(false);
  const save = async (engine) => {
    setSaving(true);
    try {
      await apiClient.put(`${API_URL}/auth/profile`, { dictation_engine: engine }, getAuthHeaders());
      await refreshUser();
      return true;
    } catch (err) {
      notify.error(err.response?.data?.detail || 'Could not save your dictation choice.');
      return false;
    } finally {
      setSaving(false);
    }
  };
  return { save, saving };
}

// First-tap chooser: shown once, the choice follows the account (Settings → Dictation to change).
export const DictationEngineChooser = ({ open, onClose }) => {
  const { save, saving } = useSaveDictationEngine();
  const choose = async (engine) => {
    // No auto-start: iOS only opens the mic inside a direct tap, so we ask for one more tap.
    if (await save(engine)) { notify.success(`${DICTATION_ENGINES[engine].label} it is — tap the mic to start.`); onClose(); }
  };
  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="glass-card max-w-lg" data-testid="dictation-engine-chooser">
        <DialogHeader>
          <DialogTitle className="text-[var(--t)] flex items-center gap-2" style={{ fontFamily: 'var(--serif)' }}>How should CarryOn listen?</DialogTitle>
          <DialogDescription className="text-[var(--t3)]">
            Pick once — it applies to every mic in CarryOn and you can change it any time under Settings → Dictation. Either way, nothing you say is saved until you review and approve it.
          </DialogDescription>
        </DialogHeader>
        <DictationEngineOptions value={null} onChange={choose} saving={saving} />
        {saving && <p className="text-xs text-[var(--t5)] flex items-center gap-1.5"><Loader2 className="w-3 h-3 animate-spin" /> Saving your choice…</p>}
      </DialogContent>
    </Dialog>
  );
};

export default DictationEngineChooser;
