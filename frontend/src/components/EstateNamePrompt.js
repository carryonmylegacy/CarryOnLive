import React, { useState } from 'react';
import axios from 'axios';
import { Loader2 } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { toast } from '../utils/toast';
import { API_URL } from '../config';

export default function EstateNamePrompt({ estateId, currentName, onComplete }) {
  const { getAuthHeaders } = useAuth();
  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!name.trim()) return;
    setSaving(true);
    try {
      await axios.post(`${API_URL}/estates/customize-name`, { name: name.trim() }, getAuthHeaders());
      toast.success('Estate name saved');
      onComplete();
    } catch {
      toast.error('Failed to save estate name');
    } finally {
      setSaving(false);
    }
  };

  const handleKeep = async () => {
    setSaving(true);
    try {
      await axios.post(`${API_URL}/estates/customize-name`, {}, getAuthHeaders());
      onComplete();
    } catch {
      onComplete();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center overflow-y-auto" data-testid="estate-name-prompt">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
      <div className="relative z-10 w-full max-w-md mx-4 rounded-2xl border border-[var(--b)] bg-[var(--card)] p-6 shadow-2xl">
        <h2 className="text-xl font-bold text-[var(--t)] mb-2" style={{ fontFamily: 'Outfit, sans-serif' }}>
          Personalize Your Estate
        </h2>
        <p className="text-[var(--t4)] text-sm mb-1">
          Your estate is currently named:
        </p>
        <p className="text-[var(--t)] font-semibold text-base mb-4">
          "{currentName}"
        </p>
        <p className="text-[var(--t4)] text-sm mb-4">
          Give it a name that feels right — this is how it will appear to your beneficiaries.
        </p>

        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Tom's Family Estate"
          className="mb-4 h-10"
          autoFocus
          onKeyDown={(e) => { if (e.key === 'Enter' && name.trim()) handleSave(); }}
          data-testid="estate-name-prompt-input"
        />

        <div className="flex flex-col gap-2">
          <Button
            onClick={handleSave}
            disabled={saving || !name.trim()}
            className="w-full bg-[var(--gold)] text-[#0b1120] hover:bg-[var(--gold)]/90 font-bold h-10"
            data-testid="estate-name-prompt-save"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Save'}
          </Button>
          <Button
            variant="ghost"
            onClick={handleKeep}
            disabled={saving}
            className="w-full text-[var(--t4)] hover:text-[var(--t)] text-sm"
            data-testid="estate-name-prompt-dismiss"
          >
            Keep current name
          </Button>
        </div>
      </div>
    </div>
  );
}
