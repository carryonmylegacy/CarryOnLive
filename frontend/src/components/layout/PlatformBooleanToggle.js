import React, { useEffect, useState } from 'react';
import apiClient from '../../utils/apiClient';
import { API_URL } from '../../config';
import { Switch } from '../ui/switch';
import { toast } from '../../utils/toast';

const PlatformBooleanToggle = ({
  settingKey,
  label,
  Icon,
  activeColor = '#22c55e',
  activeLabel = 'On',
  inactiveLabel = 'Off',
  collapsed = false,
  mobile = false,
  testId,
  activeBadge,
  onChange,
}) => {
  const [on, setOn] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const token = (() => { try { return localStorage.getItem('carryon_token'); } catch { return null; } })();
    if (!token) return;
    let cancelled = false;
    apiClient.get(`${API_URL}/admin/platform-settings`, {
      headers: { Authorization: `Bearer ${token}` },
    }).then((res) => {
      if (!cancelled) setOn(!!res.data?.[settingKey]);
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [settingKey]);

  const toggle = async () => {
    if (busy) return;
    const next = !on;
    setOn(next);
    setBusy(true);
    const token = (() => { try { return localStorage.getItem('carryon_token'); } catch { return null; } })();
    try {
      const res = await apiClient.put(
        `${API_URL}/admin/platform-settings`,
        { [settingKey]: next },
        { headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } },
      );
      const authoritative = !!res.data?.[settingKey];
      setOn(authoritative);
      // Let the caller mirror the change into any local flag immediately so
      // the current session reflects it without waiting for a full reload
      // (e.g. hiding the Subscription menu item the instant it's toggled).
      try { onChange?.(authoritative); } catch { /* non-fatal */ }
      toast.success(`${label} ${authoritative ? activeLabel : inactiveLabel}`);
    } catch (err) {
      setOn(!next);
      toast.error(err?.response?.data?.detail || `Could not update ${label}`);
    } finally {
      setBusy(false);
    }
  };

  if (mobile) {
    return (
      <button
        onClick={toggle}
        disabled={busy}
        className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl transition-all"
        style={{
          background: on ? `${activeColor}1A` : 'var(--b)',
          border: `1px solid ${on ? `${activeColor}66` : 'rgba(255,255,255,0.1)'}`,
        }}
        data-testid={testId}
      >
        <Icon className="w-5 h-5" style={{ color: on ? activeColor : '#A0AABF' }} />
        <span className="font-medium" style={{ color: on ? activeColor : '#A0AABF' }}>
          {label} {on ? activeLabel : inactiveLabel}
        </span>
        {on && activeBadge && (
          <span
            className="text-[9px] font-extrabold uppercase tracking-wider px-1.5 py-0.5 rounded-full"
            style={{ color: '#0b1120', background: activeColor }}
            data-testid={`${testId}-badge`}
          >
            {activeBadge}
          </span>
        )}
      </button>
    );
  }

  if (collapsed) {
    return (
      <div
        className="mx-1 my-2 flex items-center justify-center px-2 py-2 rounded-lg cursor-pointer"
        onClick={toggle}
        title={`${label} ${on ? activeLabel : inactiveLabel}`}
        style={{
          background: on ? `${activeColor}12` : 'var(--s)',
          border: `1px solid ${on ? `${activeColor}44` : 'var(--b)'}`,
        }}
        data-testid={`${testId}-collapsed`}
      >
        <Icon className="w-5 h-5" style={{ color: on ? activeColor : 'var(--t3)' }} />
      </div>
    );
  }

  return (
    <div
      className="mx-3 my-2 flex items-center justify-between px-3 py-2 rounded-lg"
      style={{
        background: on ? `${activeColor}12` : 'var(--s)',
        border: `1px solid ${on ? `${activeColor}44` : 'var(--b)'}`,
      }}
      data-testid={testId}
    >
      <div className="flex items-center gap-2">
        <Icon className="w-4 h-4" style={{ color: on ? activeColor : 'var(--t3)' }} />
        <span className="text-xs font-bold text-[var(--t)]">{label}</span>
        {on && activeBadge && (
          <span
            className="text-[9px] font-extrabold uppercase tracking-wider px-1.5 py-0.5 rounded-full"
            style={{ color: '#0b1120', background: activeColor }}
            data-testid={`${testId}-badge`}
          >
            {activeBadge}
          </span>
        )}
      </div>
      <Switch checked={on} onCheckedChange={toggle} disabled={busy} data-testid={`${testId}-switch`} />
    </div>
  );
};

export default PlatformBooleanToggle;
