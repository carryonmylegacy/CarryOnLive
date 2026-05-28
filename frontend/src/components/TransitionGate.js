import React, { useState, useEffect } from 'react';
import { Navigate } from 'react-router-dom';
import apiClient from '../utils/apiClient';
import { useAuth } from '../contexts/AuthContext';
import { Loader2 } from 'lucide-react';
import { API_URL } from '../config';

/**
 * Gates beneficiary section routes (vault / messages / checklist /
 * guardian / milestone) behind estate transition status and feature
 * access.
 *
 * IMPORTANT: This gate is NOT used on /beneficiary/dashboard anymore —
 * the dashboard self-handles pre vs post transition inline. All
 * "redirect home" paths therefore land on /beneficiary/dashboard,
 * which has the canonical handlers for: missing estate id, no
 * connected estates yet, pre-transition lock screen, and the
 * post-transition tile grid. Routing anything to the deleted
 * /beneficiary hub or the legacy /beneficiary/pre page caused
 * infinite redirect loops (white screen) before this fix.
 */

// Map route section names to benefactor feature access flags
const SECTION_TO_FEATURE = {
  vault: 'sdv_access',
  messages: 'mm_access',
  checklist: 'iac_access',
  guardian: 'ega_access',
  digital_wallet: 'dav_access',
  timeline: 'dts_access',
};

const TransitionGate = ({ section, allowPreTransition, children }) => {
  const { token } = useAuth();
  const [status, setStatus] = useState(null); // null = loading
  const estateId = localStorage.getItem('beneficiary_estate_id');

  useEffect(() => {
    if (!token) { setStatus({ allowed: false }); return; }

    // If no estate ID selected, try to auto-resolve for the beneficiary
    if (!estateId) {
      if (allowPreTransition) {
        // Auto-resolve: fetch estates and pick the single estate (or
        // bounce to the dashboard, which will auto-resolve + render
        // the empty state if there are 0 connections).
        apiClient.get(`${API_URL}/estates`, { headers: { Authorization: `Bearer ${token}` } })
          .then(res => {
            const beneficiaryEstates = (res.data || []).filter(e => e.user_role_in_estate !== 'owner');
            if (beneficiaryEstates.length === 1) {
              localStorage.setItem('beneficiary_estate_id', beneficiaryEstates[0].id);
              setStatus({ allowed: true });
            } else {
              setStatus({ allowed: false, redirect: '/beneficiary/dashboard' });
            }
          })
          .catch(() => setStatus({ allowed: false, redirect: '/beneficiary/dashboard' }));
      } else {
        setStatus({ allowed: false, redirect: '/beneficiary/dashboard' });
      }
      return;
    }

    // If this route is allowed pre-transition (e.g. POA/Living Will vault view), skip the gate
    if (allowPreTransition) {
      setStatus({ allowed: true });
      return;
    }

    apiClient.get(`${API_URL}/beneficiary/my-permissions/${estateId}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(res => {
        const { is_transitioned, sections, feature_access } = res.data;

        // Store feature access for navigation components
        if (feature_access) {
          localStorage.setItem('beneficiary_feature_access', JSON.stringify(feature_access));
        }

        if (!is_transitioned) {
          // Pre-transition section access — bounce to the dashboard,
          // which renders the inline pre-transition panel. The
          // legacy /beneficiary/pre route now redirects here too,
          // so we never have two sources of truth.
          setStatus({ allowed: false, redirect: '/beneficiary/dashboard' });
        } else if (section && sections && !sections[section]) {
          // Section permission denied by primary beneficiary
          setStatus({ allowed: false, redirect: '/beneficiary/dashboard' });
        } else if (section && feature_access) {
          // Feature access denied by benefactor
          const featureFlag = SECTION_TO_FEATURE[section];
          if (featureFlag && feature_access[featureFlag] === false) {
            setStatus({ allowed: false, redirect: '/beneficiary/dashboard' });
          } else {
            setStatus({ allowed: true });
          }
        } else {
          setStatus({ allowed: true });
        }
      })
      .catch((err) => {
        if (err.response?.status === 404 || err.response?.status === 403) {
          localStorage.removeItem('beneficiary_estate_id');
          localStorage.removeItem('beneficiary_feature_access');
        }
        setStatus({ allowed: false, redirect: '/beneficiary/dashboard' });
      });
  }, [estateId, token, section, allowPreTransition]);

  if (status === null) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--bg)' }}>
        <Loader2 className="w-8 h-8 text-[var(--gold)] animate-spin" />
      </div>
    );
  }

  if (!status.allowed) {
    return <Navigate to={status.redirect || '/beneficiary/dashboard'} replace />;
  }

  return children;
};

export default TransitionGate;
