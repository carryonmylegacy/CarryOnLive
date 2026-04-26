import React, { useState } from 'react';
import axios from 'axios';
import { Shield, Loader2 } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { API_URL } from '../../config';
import { toast } from '../../utils/toast';
import SidebarPillButton from './SidebarPillButton';

/**
 * PublicDeviceModeMenuButton — one-tap panic switch for the borrowed-
 * device disaster-comms scenario. Lives directly above "Sign Out" in
 * both the desktop Sidebar and the mobile drawer.
 *
 * When the user clicks while PDM is OFF:
 *   - PATCHes the user's primary estate to public_device_mode=true
 *     with a tight 60-second idle window (more aggressive than the
 *     90s default — picked deliberately for the panic-button vibe).
 *   - Toasts confirmation that the device will wipe on close + idle.
 *
 * When PDM is already ON:
 *   - Acts as a "turn it off" button for the same estate, restoring
 *     the offline-first cache on the family's own device.
 *
 * Self-gates: returns null when the user owns no estate (beneficiaries
 * inherit PDM from the benefactor's estate setting and don't see this
 * button — they can't toggle their own session.)
 *
 * Two render flavors:
 *   - "sidebar" (desktop): uses the shared <SidebarPillButton/>.
 *   - "mobile" (drawer): inline button matching the Sign Out styling.
 */
const PublicDeviceModeMenuButton = ({ flavor = 'sidebar', collapsed = false, onAfterClick }) => {
  const { user, token, refreshUser } = useAuth();
  const [busy, setBusy] = useState(false);

  const enabled = !!user?.public_device_mode;

  const handleClick = async () => {
    if (busy) return;
    setBusy(true);
    try {
      // Find an owned estate (admin/founder can own demo estates; benefactors own their own).
      const res = await axios.get(`${API_URL}/estates`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const estates = Array.isArray(res.data) ? res.data : (res.data?.estates || []);
      const owned = estates.find(e => e.owner_id === user.id) || estates[0];
      if (!owned) {
        toast.error('No estate found for your account.');
        return;
      }
      const newState = !enabled;
      await axios.patch(
        `${API_URL}/estates/${owned.id}`,
        newState
          ? { public_device_mode: true, public_device_idle_seconds: 60 }
          : { public_device_mode: false },
        { headers: { Authorization: `Bearer ${token}` } },
      );
      await refreshUser();
      if (newState) {
        toast.success('Public Device Mode is ON', {
          description: 'This device will be wiped when you close the tab or go idle for 60 seconds.',
          duration: 5000,
        });
      } else {
        toast.success('Public Device Mode is OFF', {
          description: 'Your offline cache is preserved on this device.',
          duration: 4000,
        });
      }
    } catch {
      toast.error('Could not change Public Device Mode. Please try again.');
    } finally {
      setBusy(false);
      onAfterClick?.();
    }
  };

  // Hide for users who can't change estate-level settings. The
  // `is_also_benefactor` flag on /auth/me is true for anyone who owns
  // at least one estate (admin, founder, or beneficiary-who-also-owns).
  // Beneficiaries who don't own an estate inherit PDM from the
  // benefactor's estate setting and can't unilaterally toggle it on
  // their own session; surfacing the button to them would just produce
  // a confusing 403 toast on click.
  if (!user || !token) return null;
  if (!user.is_also_benefactor) return null;

  if (flavor === 'sidebar') {
    return (
      <SidebarPillButton
        collapsed={collapsed}
        onClick={handleClick}
        data-testid="sidebar-public-device-btn"
        variant={enabled ? 'gold-armed' : 'gold'}
        icon={busy ? <Loader2 className="animate-spin" /> : <Shield />}
        label={enabled ? 'Device Mode: ON' : 'Public Device Mode'}
      />
    );
  }

  // Mobile drawer flavor — match the Sign Out button styling so the two
  // sit visually together at the bottom of the drawer. Gold accent when
  // PDM is ON to signal "armed".
  const goldOn = enabled;
  return (
    <button
      onClick={handleClick}
      disabled={busy}
      className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl transition-all mb-2"
      style={{
        border: `1px solid ${goldOn ? 'rgba(212,175,55,0.45)' : 'rgba(212,175,55,0.25)'}`,
        color: goldOn ? '#080e1a' : '#d4af37',
        background: goldOn ? 'linear-gradient(135deg, #d4af37, #F0C95C)' : 'rgba(212,175,55,0.06)',
        fontWeight: goldOn ? 700 : 500,
      }}
      data-testid="mobile-public-device-btn"
    >
      {busy ? <Loader2 className="w-5 h-5 animate-spin" /> : <Shield className="w-5 h-5" />}
      <span>{enabled ? 'Device Mode: ON' : 'Public Device Mode'}</span>
    </button>
  );
};

export default PublicDeviceModeMenuButton;
