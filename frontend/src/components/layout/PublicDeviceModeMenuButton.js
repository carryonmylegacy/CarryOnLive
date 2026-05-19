import React, { useState, useEffect, useRef, useCallback } from 'react';
import axios from 'axios';
import apiClient from '../../utils/apiClient';
import { Shield, Loader2, Check } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { API_URL } from '../../config';
import { toast } from '../../utils/toast';
import SidebarPillButton from './SidebarPillButton';

/**
 * PublicDeviceModeMenuButton — one-tap panic switch for the borrowed-
 * device disaster-comms scenario. Lives directly above "Sign Out" in
 * both the desktop Sidebar and the mobile drawer.
 *
 * Behavior:
 *   - User has ZERO estates → button is hidden.
 *   - User has ONE estate    → click toggles PDM on that estate
 *     (60s idle when arming, default cleanup when disarming).
 *   - User has MULTIPLE      → click opens a popover listing the
 *     estates, each with its current PDM state. Tap a row to flip
 *     just that estate. Multiple estates can be armed at once.
 *
 * The "armed" visual on the trigger button is true if ANY of the
 * user's estates currently has PDM on (read from `user.public_device_mode`,
 * which the server computes as the OR-across-estates flag).
 *
 * Self-gates: returns null when the user owns no estate. Beneficiaries
 * who don't own an estate inherit PDM from the benefactor's setting
 * and don't see the button.
 */
const PublicDeviceModeMenuButton = ({ flavor = 'sidebar', collapsed = false, onAfterClick }) => {
  const { user, token, refreshUser } = useAuth();
  const [estates, setEstates] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [busyId, setBusyId] = useState(null);
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef(null);

  const enabled = !!user?.public_device_mode;
  // Regular users only see estates they own.
  const editableEstates = estates.filter(e => e.owner_id === user?.id);

  // Fetch estates once when the component mounts. We need this to know
  // whether to render the dropdown or the direct-toggle path. The list
  // is small (typically 1–3 entries) so refetching is cheap.
  //
  // ALSO re-fetch whenever the AuthContext's effective PDM flag
  // changes — that's how this button stays in sync when the user
  // toggles PDM from the Settings → Public Device Mode slider while
  // this button is still mounted (May 19, 2026 desync bug).
  const refreshEstates = useCallback(async () => {
    if (!token) return;
    try {
      const res = await apiClient.get(`${API_URL}/estates`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const list = Array.isArray(res.data) ? res.data : (res.data?.estates || []);
      setEstates(list);
    } catch {
      setEstates([]);
    } finally {
      setLoaded(true);
    }
  }, [token]);

  useEffect(() => { refreshEstates(); }, [refreshEstates, user?.public_device_mode, user?.public_device_idle_seconds]);

  // Close the popover on outside-click.
  useEffect(() => {
    if (!open) return undefined;
    const onDocClick = (e) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [open]);

  const patchEstate = async (estate, newState) => {
    setBusyId(estate.id);
    try {
      await apiClient.patch(
        `${API_URL}/estates/${estate.id}`,
        newState
          ? { public_device_mode: true, public_device_idle_seconds: 60 }
          : { public_device_mode: false },
        { headers: { Authorization: `Bearer ${token}` } },
      );
      // Optimistic local update so the popover reflects the change
      // immediately without a refetch flicker.
      setEstates(prev => prev.map(e =>
        e.id === estate.id
          ? { ...e, public_device_mode: newState, public_device_idle_seconds: newState ? 60 : (e.public_device_idle_seconds || 90) }
          : e,
      ));
      await refreshUser();
      if (newState) {
        toast.success(`Public Device Mode is ON for ${estate.name}`, {
          description: 'This device will be wiped when you close the tab or go idle for 60 seconds.',
          duration: 5000,
        });
      } else {
        toast.success(`Public Device Mode is OFF for ${estate.name}`, {
          description: 'Your offline cache is preserved on this device.',
          duration: 4000,
        });
      }
    } catch {
      toast.error('Could not change Public Device Mode. Please try again.');
    } finally {
      setBusyId(null);
    }
  };

  // Single-estate path: the button itself is the toggle.
  const handleSingleToggle = async () => {
    if (busy) return;
    const target = editableEstates[0];
    if (!target) {
      toast.error('No estate found for your account.');
      return;
    }
    setBusy(true);
    try {
      await patchEstate(target, !target.public_device_mode);
    } finally {
      setBusy(false);
      onAfterClick?.();
    }
  };

  // Multi-estate path: the button opens the popover.
  const handleOpenPopover = () => {
    setOpen(o => !o);
  };

  // Self-gating. Hide for users who have no editable estate (admins
  // who don't own anything, beneficiaries-only roles, etc.).
  if (!user || !token) return null;
  // Hide entirely for staff/admin/operator portals — this is a
  // benefactor-facing feature, not a Founder ADMIN tool.
  if (user.role === 'admin' || user.role === 'operator') return null;
  if (loaded && editableEstates.length === 0) return null;

  const multi = editableEstates.length > 1;
  const onClick = multi ? handleOpenPopover : handleSingleToggle;

  // ── Sidebar (desktop) ──────────────────────────────────────────────
  if (flavor === 'sidebar') {
    return (
      <div ref={wrapperRef} style={{ position: 'relative', width: '100%' }}>
        <SidebarPillButton
          collapsed={collapsed}
          onClick={onClick}
          data-testid="sidebar-public-device-btn"
          variant={enabled ? 'gold-armed' : 'gold'}
          icon={busy ? <Loader2 className="animate-spin" /> : <Shield />}
          label={enabled ? 'Device Mode: ON' : 'Public Device Mode'}
        />
        {multi && open && (
          <EstatePicker
            estates={editableEstates}
            busyId={busyId}
            onPick={async (est) => { await patchEstate(est, !est.public_device_mode); }}
            onClose={() => setOpen(false)}
            position="sidebar"
          />
        )}
      </div>
    );
  }

  // ── Mobile drawer ──────────────────────────────────────────────────
  // Same gold-on / gold-armed visual as the sidebar, matching Sign Out
  // pill rhythm.
  const goldOn = enabled;
  return (
    <div ref={wrapperRef} style={{ position: 'relative', width: '100%' }}>
      <button
        onClick={onClick}
        disabled={busy}
        className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl transition-all mb-2"
        style={{
          border: `1px solid ${goldOn ? 'rgba(var(--gold-rgb), 0.45)' : 'rgba(var(--gold-rgb), 0.25)'}`,
          color: goldOn ? '#080e1a' : '#d4af37',
          background: goldOn ? 'linear-gradient(135deg, #d4af37, #F0C95C)' : 'rgba(var(--gold-rgb), 0.06)',
          fontWeight: goldOn ? 700 : 500,
        }}
        data-testid="mobile-public-device-btn"
      >
        {busy ? <Loader2 className="w-5 h-5 animate-spin" /> : <Shield className="w-5 h-5" />}
        <span>{enabled ? 'Device Mode: ON' : 'Public Device Mode'}</span>
      </button>
      {multi && open && (
        <EstatePicker
          estates={editableEstates}
          busyId={busyId}
          onPick={async (est) => { await patchEstate(est, !est.public_device_mode); }}
          onClose={() => setOpen(false)}
          position="mobile"
        />
      )}
    </div>
  );
};

/**
 * EstatePicker — popover that lists the user's editable estates with
 * their current Public Device Mode state. Renders ABOVE the trigger
 * button (panel sits at the bottom of the sidebar / drawer). One row
 * per estate; tap to flip just that estate.
 */
const EstatePicker = ({ estates, busyId, onPick, onClose, position }) => (
  <div
    role="menu"
    data-testid="pdm-estate-picker"
    style={{
      position: 'absolute',
      bottom: position === 'sidebar' ? 'calc(100% + 6px)' : 'calc(100% + 4px)',
      left: 0,
      right: 0,
      zIndex: 60,
      background: 'var(--bg2, #131A2B)',
      border: '1px solid rgba(var(--gold-rgb), 0.3)',
      borderRadius: 12,
      overflow: 'hidden',
      boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
    }}
  >
    <div
      style={{
        padding: '8px 12px',
        borderBottom: '1px solid rgba(255,255,255,0.06)',
        fontSize: 11,
        fontWeight: 700,
        textTransform: 'uppercase',
        letterSpacing: 0.5,
        color: '#d4af37',
      }}
    >
      Choose estate
    </div>
    <ul style={{ maxHeight: 240, overflowY: 'auto' }}>
      {estates.map((e) => {
        const armed = !!e.public_device_mode;
        const loading = busyId === e.id;
        return (
          <li key={e.id}>
            <button
              type="button"
              onClick={() => onPick(e)}
              disabled={loading}
              data-testid={`pdm-estate-row-${e.id}`}
              className="w-full flex items-center gap-2 px-3 py-2.5 transition-colors hover:bg-white/5"
              style={{
                background: armed ? 'rgba(var(--gold-rgb), 0.08)' : 'transparent',
                color: 'var(--t)',
                textAlign: 'left',
                borderBottom: '1px solid rgba(255,255,255,0.04)',
              }}
            >
              <Shield
                className="w-4 h-4 flex-shrink-0"
                style={{ color: armed ? '#d4af37' : 'var(--t5)' }}
              />
              <div className="flex-1 min-w-0">
                <div
                  className="text-sm font-semibold truncate"
                  style={{ color: 'var(--t)' }}
                >
                  {e.name}
                </div>
                <div className="text-[11px]" style={{ color: armed ? '#d4af37' : 'var(--t5)' }}>
                  {armed ? `ON · ${e.public_device_idle_seconds || 60}s idle` : 'OFF'}
                </div>
              </div>
              {loading ? (
                <Loader2 className="w-4 h-4 animate-spin" style={{ color: '#d4af37' }} />
              ) : armed ? (
                <Check className="w-4 h-4" style={{ color: '#d4af37' }} />
              ) : null}
            </button>
          </li>
        );
      })}
    </ul>
    <button
      type="button"
      onClick={onClose}
      data-testid="pdm-estate-picker-close"
      className="w-full px-3 py-2 text-xs font-semibold transition-colors hover:bg-white/5"
      style={{ color: 'var(--t4)', borderTop: '1px solid rgba(255,255,255,0.06)' }}
    >
      Close
    </button>
  </div>
);

export default PublicDeviceModeMenuButton;
