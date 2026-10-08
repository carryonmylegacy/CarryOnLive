import React from 'react';
import { Mic } from 'lucide-react';
import { Card, CardContent } from '../ui/card';
import { useAuth } from '../../contexts/AuthContext';
import { DictationEngineOptions, useSaveDictationEngine } from '../ai/DictationEngineChooser';
import { toast } from '../../utils/toast';
import { DICTATION_ENGINES } from '../../hooks/useDictation';

// Settings → Dictation: the one place the subscriber picks which engine every CarryOn mic uses.
export const DictationSettingsCard = () => {
  const { user } = useAuth();
  const { save, saving } = useSaveDictationEngine();
  const current = user?.dictation_engine || null;
  const choose = async (engine) => {
    if (engine === current) return;
    if (await save(engine)) toast.success(`Dictation set to ${DICTATION_ENGINES[engine].label}`);
  };
  return (
    <Card className="glass-card" id="dictation" data-testid="dictation-settings-card">
      <CardContent className="pt-5 space-y-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: 'rgba(var(--gold-rgb), 0.1)' }}>
            <Mic className="w-5 h-5 text-[var(--gold)]" />
          </div>
          <div className="min-w-0">
            <h4 className="text-[var(--t)] font-bold">Dictation</h4>
            <p className="text-[var(--t5)] text-sm">
              {current ? `Every mic in CarryOn uses ${DICTATION_ENGINES[current].label}.` : 'Choose how CarryOn listens when you tap a mic. You’ll be asked the first time you dictate if you skip this.'}
            </p>
          </div>
        </div>
        <DictationEngineOptions value={current} onChange={choose} saving={saving} />
        <p className="text-[11px] text-[var(--t5)]">Either way, nothing you dictate is saved until you review it and tap save or build. Details on our <a href="/security" className="underline" target="_blank" rel="noopener noreferrer">Security page</a>.</p>
      </CardContent>
    </Card>
  );
};

export default DictationSettingsCard;
