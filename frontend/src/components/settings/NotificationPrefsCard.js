import React, { useState, useEffect } from 'react';
import { toast } from '../../utils/toast';
import { Bell, BellOff, Loader2 } from 'lucide-react';
import { Switch } from '../ui/switch';
import { API_URL } from '../../config';

export const NotificationPrefsCard = () => {
  const token = localStorage.getItem('carryon_token');
  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };

  const [loading, setLoading] = useState(true);
  const [prefs, setPrefs] = useState(null);
  const [categories, setCategories] = useState([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`${API_URL}/notification-prefs`, { headers });
        if (res.ok) {
          const data = await res.json();
          setPrefs(data.preferences);
          setCategories(data.categories);
        }
      } catch {} finally { setLoading(false); }
    })();
  }, []);

  const updatePref = async (updates, toastLabel) => {
    setSaving(true);
    try {
      const res = await fetch(`${API_URL}/notification-prefs`, {
        method: 'PUT', headers, body: JSON.stringify(updates),
      });
      if (res.ok) {
        setPrefs(prev => ({
          ...prev,
          ...(updates.master_enabled !== undefined ? { master_enabled: updates.master_enabled } : {}),
          ...(updates.toggles ? { toggles: { ...prev.toggles, ...updates.toggles } } : {}),
        }));
        if (toastLabel) toast.success(toastLabel);
      } else if (toastLabel) {
        toast.error('Could not save that change. Please try again.');
      }
    } catch {
      if (toastLabel) toast.error('Could not save that change. Please try again.');
    } finally { setSaving(false); }
  };

  if (loading) {
    return (
      <div className="rounded-2xl p-6" style={{ background: 'var(--bg2)', border: '1px solid var(--b)' }}>
        <div className="flex items-center justify-center py-8">
          <Loader2 className="w-6 h-6 animate-spin" style={{ color: '#d4af37' }} />
        </div>
      </div>
    );
  }

  if (!prefs) return null;

  return (
    <div className="rounded-2xl p-6" data-testid="notification-prefs-card" style={{ background: 'var(--bg2)', border: '1px solid var(--b)' }}>
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: prefs.master_enabled ? 'rgba(212,175,55,0.12)' : 'rgba(240,82,82,0.1)' }}>
            {prefs.master_enabled ? <Bell className="w-5 h-5" style={{ color: '#d4af37' }} /> : <BellOff className="w-5 h-5" style={{ color: '#F05252' }} />}
          </div>
          <div>
            <h3 className="text-base font-bold" style={{ color: 'var(--t)' }}>Push Notifications</h3>
            <p className="text-xs" style={{ color: 'var(--t4)' }}>Control what notifications you receive</p>
          </div>
        </div>
        <Switch
          checked={prefs.master_enabled}
          onCheckedChange={(val) => updatePref(
            { master_enabled: val },
            val ? 'Push notifications turned on — saved.' : 'Push notifications turned off — saved.'
          )}
          data-testid="notification-master-toggle"
        />
      </div>

      {prefs.master_enabled && (
        <div className="space-y-3 mt-4">
          {categories.map(cat => {
            const enabled = prefs.toggles?.[cat.id] !== false;
            return (
              <div
                key={cat.id}
                className="flex items-center justify-between p-3 rounded-xl"
                data-testid={`notification-toggle-${cat.id}`}
                style={{ background: 'var(--s)', border: '1px solid var(--b)' }}
              >
                <div className="flex-1 mr-3">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold" style={{ color: 'var(--t)' }}>{cat.label}</span>
                    {cat.is_critical && (
                      <span className="text-[11px] font-bold px-1.5 py-0.5 rounded" style={{ background: 'rgba(240,82,82,0.1)', color: '#F05252' }}>CRITICAL</span>
                    )}
                  </div>
                  <p className="text-xs mt-0.5" style={{ color: 'var(--t5)' }}>{cat.description}</p>
                </div>
                <Switch
                  checked={enabled}
                  onCheckedChange={(val) => updatePref(
                    { toggles: { [cat.id]: val } },
                    `${cat.label} ${val ? 'enabled' : 'disabled'} — saved.`
                  )}
                />
              </div>
            );
          })}
        </div>
      )}

      {!prefs.master_enabled && (
        <div className="text-center py-4 rounded-xl mt-2" style={{ background: 'rgba(240,82,82,0.06)', border: '1px solid rgba(240,82,82,0.15)' }}>
          <BellOff className="w-8 h-8 mx-auto mb-2" style={{ color: '#F05252' }} />
          <p className="text-sm font-semibold" style={{ color: '#F05252' }}>All notifications are off</p>
          <p className="text-xs mt-0.5" style={{ color: 'var(--t5)' }}>You won't receive any push notifications</p>
        </div>
      )}
    </div>
  );
};
