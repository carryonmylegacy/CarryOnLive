import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { Shield } from 'lucide-react';
import { Card, CardContent } from '../ui/card';
import { Switch } from '../ui/switch';
import { Label } from '../ui/label';
import { useAuth } from '../../contexts/AuthContext';
import { API_URL } from '../../config';
import { toast } from '../../utils/toast';

const IDLE_OPTIONS = [
  { value: 60,  label: '1 min' },
  { value: 90,  label: '90 sec (default)' },
  { value: 180, label: '3 min' },
  { value: 300, label: '5 min' },
];

/**
 * PublicDeviceModeCard — Benefactor-only estate setting.
 *
 * When the benefactor flips this on, every member of the estate (the
 * benefactor themselves, beneficiaries, and any joined chat accounts)
 * inherits a session that aggressively wipes localStorage, sessionStorage,
 * the offline Dexie cache, and SW caches when the browser is closed,
 * the tab is closed, or the user goes idle for the configured period.
 *
 * Designed for the disaster-comms scenario: a family member borrows a
 * stranger's phone or uses a library kiosk to coordinate during a
 * regional outage. With this on, walking away from that device leaves
 * no trace of the family's data.
 *
 * Backed by the `public_device_mode` and `public_device_idle_seconds`
 * fields on the estate document. The user's effective flag (OR across
 * all estates they're a member of) is computed server-side and surfaced
 * via /auth/me, then read by `usePublicDeviceMode` to wire the
 * `pagehide` + idle handlers.
 */
const PublicDeviceModeCard = () => {
  const { token, refreshUser } = useAuth();
  const [estate, setEstate] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await axios.get(`${API_URL}/estates`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const owned = (res.data || []).find(e => e?.role === 'benefactor' || e?.owner_id) || (res.data || [])[0];
        if (alive) setEstate(owned);
      } catch {
        if (alive) setEstate(null);
      }
    })();
    return () => { alive = false; };
  }, [token]);

  if (!estate) return null;

  const enabled = !!estate.public_device_mode;
  const idleSeconds = estate.public_device_idle_seconds || 90;

  const patchEstate = async (patch, successMsg) => {
    setSaving(true);
    try {
      await axios.patch(`${API_URL}/estates/${estate.id}`, patch, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setEstate(prev => ({ ...prev, ...patch }));
      // Refresh AuthContext so usePublicDeviceMode picks up the change
      // immediately for the benefactor's own session — beneficiaries get
      // it on their next /auth/me poll.
      await refreshUser();
      if (successMsg) toast.success(successMsg);
    } catch {
      toast.error('Could not save that change. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card className="glass-card" data-testid="public-device-mode-card">
      <CardContent className="pt-5 space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: 'rgba(212,175,55,0.1)' }}>
              <Shield className="w-5 h-5 text-[var(--gold)]" />
            </div>
            <div className="min-w-0">
              <h4 className="text-[var(--t)] font-bold">Public Device Mode</h4>
              <p className="text-[var(--t5)] text-sm leading-relaxed mt-1">
                Designed for the borrowed-phone or library-kiosk scenario during a disaster.
                When ON, every member of <span className="font-semibold text-[var(--t3)]">{estate.name}</span> gets
                aggressive auto-wipe — closing the tab, closing the browser, or going idle erases
                the offline cache, the chat history, the auth token, and any pinned vault docs
                from the device.
              </p>
              <p className="text-[var(--t5)] text-xs mt-2">
                Default is OFF so the family's own devices keep the offline-first cache.
                Flip ON only when an estate member is on a shared or untrusted device.
              </p>
            </div>
          </div>
          <Switch
            checked={enabled}
            disabled={saving}
            onCheckedChange={(checked) =>
              patchEstate(
                { public_device_mode: checked },
                checked ? 'Public Device Mode is ON for this estate.' : 'Public Device Mode is OFF.'
              )
            }
            data-testid="public-device-mode-toggle"
          />
        </div>

        {enabled && (
          <div className="pt-3 border-t border-[var(--b)]">
            <Label className="text-[var(--t3)] text-sm font-semibold">Idle wipe after</Label>
            <p className="text-[var(--t5)] text-xs mb-2 mt-0.5">
              How long without input before the device is wiped automatically.
            </p>
            <div className="flex flex-wrap gap-2">
              {IDLE_OPTIONS.map(opt => (
                <button
                  key={opt.value}
                  type="button"
                  disabled={saving}
                  onClick={() =>
                    patchEstate({ public_device_idle_seconds: opt.value }, `Idle wipe set to ${opt.label}.`)
                  }
                  className="px-3 py-1.5 rounded-full text-xs font-bold transition-transform duration-150 active:scale-95"
                  data-testid={`pdm-idle-${opt.value}`}
                  style={{
                    background: idleSeconds === opt.value ? 'rgba(212,175,55,0.15)' : 'rgba(255,255,255,0.04)',
                    border: idleSeconds === opt.value ? '1.5px solid rgba(212,175,55,0.4)' : '1px solid rgba(255,255,255,0.08)',
                    color: idleSeconds === opt.value ? '#d4af37' : 'var(--t4)',
                  }}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default PublicDeviceModeCard;
