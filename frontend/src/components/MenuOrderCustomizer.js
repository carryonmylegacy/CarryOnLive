/**
 * MenuOrderCustomizer — drag-reorder UI for the feature section of the
 * sidebar / hamburger menu. Mirrors DockCustomizer's look & feel.
 *
 * Scope rules (as agreed with product):
 *   - Only reorders FEATURE items above the "Account" divider.
 *   - Never adds/removes items — that's owned by the tier-gating admin.
 *     This component is a pure ordering overlay on top of the tier-gated
 *     list.
 *   - Benefactor and beneficiary roles only. Staff (admin/operator) menus
 *     are workflow tools and are not user-reorderable.
 */

import React, { useState, useEffect, useMemo } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import { toast } from '../utils/toast';
import { GripVertical, RotateCcw, ChevronUp, ChevronDown } from 'lucide-react';
import {
  BENEFACTOR_FEATURE_REGISTRY,
  BENEFICIARY_FEATURE_REGISTRY,
  applyUserMenuOrder,
} from '../config/menuRegistry';
import { filterNavByFeatures } from '../utils/featureGates';
import { useListReorder } from '../utils/useListReorder';

const API_URL = process.env.REACT_APP_BACKEND_URL;

// Post-transition-only routes — shown but locked for pre-transition beneficiaries
const POST_TRANSITION_ONLY = new Set([
  '/beneficiary/guardian',
  '/beneficiary/checklist',
  '/beneficiary/messages',
  '/beneficiary/milestone',
]);

const MenuOrderCustomizer = () => {
  const { user, enabledFeatures } = useAuth();
  const { theme } = useTheme();
  const [orderedRoutes, setOrderedRoutes] = useState([]);
  const [saving, setSaving] = useState(false);
  const [loaded, setLoaded] = useState(false);

  // Resolve the role key used for per-role preference storage. Mirrors
  // DockCustomizer's logic so the two customizers segregate the same way.
  const roleKey = useMemo(() => {
    const path = typeof window !== 'undefined' ? window.location.pathname : '';
    if (user?.role === 'beneficiary' && user?.is_also_benefactor && !path.startsWith('/beneficiary')) return 'benefactor';
    if (user?.role === 'beneficiary') return 'beneficiary';
    if (user?.role === 'benefactor' && path.startsWith('/beneficiary')) return 'beneficiary';
    return 'benefactor';
  }, [user?.role, user?.is_also_benefactor]);

  // Tier-gated default list. This is what the sidebar / hamburger currently
  // show (before any user reorder). If the admin grants or revokes a feature
  // tier-wide, this list updates automatically and we re-apply the overlay.
  const tierGatedItems = useMemo(() => {
    const base = roleKey === 'beneficiary'
      ? BENEFICIARY_FEATURE_REGISTRY
      : BENEFACTOR_FEATURE_REGISTRY;
    return filterNavByFeatures(base, enabledFeatures);
  }, [roleKey, enabledFeatures]);

  // Load saved order
  useEffect(() => {
    const tk = localStorage.getItem('carryon_token');
    if (!tk) { setLoaded(true); return; }
    fetch(`${API_URL}/api/user-preferences/menu-order?role=${roleKey}`, {
      headers: { Authorization: `Bearer ${tk}` },
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        const saved = Array.isArray(d?.items) ? d.items : [];
        const applied = applyUserMenuOrder(tierGatedItems, saved);
        setOrderedRoutes(applied.map((i) => i.to));
        setLoaded(true);
      })
      .catch(() => {
        setOrderedRoutes(tierGatedItems.map((i) => i.to));
        setLoaded(true);
      });
  }, [roleKey, tierGatedItems]);

  const moveItem = (index, direction) => {
    const target = index + direction;
    if (target < 0 || target >= orderedRoutes.length) return;
    const next = [...orderedRoutes];
    [next[index], next[target]] = [next[target], next[index]];
    setOrderedRoutes(next);
  };

  const resetToDefault = () => {
    // "Default" = the registry's order, tier-filtered. Save a cleared pref.
    setOrderedRoutes(tierGatedItems.map((i) => i.to));
  };

  const save = async () => {
    setSaving(true);
    try {
      const tk = localStorage.getItem('carryon_token');
      const res = await fetch(`${API_URL}/api/user-preferences/menu-order`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${tk}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: orderedRoutes, role: roleKey }),
      });
      if (!res.ok) throw new Error('save failed');
      toast.success('Menu order saved — changes will appear on next refresh.');
    } catch {
      toast.error('Could not save menu order.');
    } finally {
      setSaving(false);
    }
  };

  // Drag-to-reorder hook. Only the grip handle captures pointer events —
  // scrolling elsewhere on the row behaves normally. MUST be declared
  // before any conditional `return` so hook ordering is stable.
  const { bindGrip, draggingIdx } = useListReorder({
    items: orderedRoutes,
    onReorder: setOrderedRoutes,
    rowSelector: '[data-menu-order-row]',
  });

  if (!loaded) return null;

  const isDark = theme === 'dark';
  const accent = '#d4af37';

  // Render the ordered list, resolving each route back to its item record
  const byRoute = new Map(tierGatedItems.map((i) => [i.to, i]));
  const renderItems = orderedRoutes
    .map((r) => byRoute.get(r))
    .filter(Boolean);

  const isPreTransition = roleKey === 'beneficiary' && (() => {
    // Use the same localStorage flag the DockCustomizer uses for locked state
    try {
      const raw = localStorage.getItem('beneficiary_feature_access');
      const flags = raw ? JSON.parse(raw) : {};
      // If any post-transition feature is explicitly false, treat as pre-transition
      return ['sdv_access', 'mm_access', 'ega_access', 'iac_access']
        .some((k) => flags[k] === false);
    } catch { return false; }
  })();

  return (
    <div data-testid="menu-order-customizer">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-bold tracking-wider uppercase" style={{ color: isDark ? '#8895A7' : '#475569' }}>
          Menu Order
        </h3>
        <button
          onClick={resetToDefault}
          data-testid="menu-order-reset-btn"
          className="flex items-center gap-1 text-xs px-2 py-1 rounded-lg transition-all"
          style={{ color: isDark ? '#94A3B8' : '#64748B', background: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)' }}
        >
          <RotateCcw className="w-3 h-3" /> Reset
        </button>
      </div>

      <p className="text-xs mb-4" style={{ color: isDark ? '#64748B' : '#94A3B8' }}>
        Reorder the features in your sidebar and hamburger menu. Drag the grip
        handle on the left to move items, or use the arrows. Account links
        (Settings, Subscription, Security Settings, Customer Support) stay
        anchored at the bottom and aren&apos;t reorderable.
      </p>

      <div className="flex flex-col gap-1 mb-4">
        {renderItems.map((item, idx) => {
          const Icon = item.icon;
          const locked = roleKey === 'beneficiary' && isPreTransition && POST_TRANSITION_ONLY.has(item.to);
          const isDragging = draggingIdx === idx;
          return (
            <div
              key={item.to}
              data-menu-order-row
              data-testid={`menu-order-item-${idx}`}
              className="flex items-center gap-2 px-3 py-2.5 rounded-xl transition-all"
              style={{
                background: `${accent}12`,
                border: `1px solid ${isDragging ? accent : `${accent}30`}`,
                opacity: locked ? 0.5 : (isDragging ? 0.7 : 1),
                boxShadow: isDragging ? `0 8px 24px ${accent}40` : 'none',
                transform: isDragging ? 'scale(1.02)' : 'scale(1)',
              }}
            >
              <button
                type="button"
                {...bindGrip(idx)}
                className="p-1 -m-1 rounded-md flex-shrink-0"
                aria-label={`Drag ${item.label}`}
                data-testid={`menu-order-grip-${idx}`}
              >
                <GripVertical className="w-4 h-4" style={{ color: `${accent}80` }} />
              </button>
              <Icon className="w-4 h-4 flex-shrink-0" style={{ color: accent }} />
              <span className="flex-1 text-sm font-medium truncate" style={{ color: isDark ? '#E2E8F0' : '#1E293B' }}>
                {item.label}
              </span>
              <div className="flex items-center gap-0.5">
                <button
                  onClick={() => moveItem(idx, -1)}
                  disabled={idx === 0}
                  className="p-1 rounded-md transition-colors"
                  style={{ opacity: idx === 0 ? 0.3 : 1, color: isDark ? '#94A3B8' : '#64748B' }}
                  data-testid={`menu-order-up-${idx}`}
                  aria-label={`Move ${item.label} up`}
                >
                  <ChevronUp className="w-4 h-4" />
                </button>
                <button
                  onClick={() => moveItem(idx, 1)}
                  disabled={idx === renderItems.length - 1}
                  className="p-1 rounded-md transition-colors"
                  style={{ opacity: idx === renderItems.length - 1 ? 0.3 : 1, color: isDark ? '#94A3B8' : '#64748B' }}
                  data-testid={`menu-order-down-${idx}`}
                  aria-label={`Move ${item.label} down`}
                >
                  <ChevronDown className="w-4 h-4" />
                </button>
              </div>
            </div>
          );
        })}
      </div>

      <button
        onClick={save}
        disabled={saving}
        data-testid="menu-order-save-btn"
        className="w-full py-3 rounded-xl font-semibold text-sm transition-all"
        style={{
          background: accent,
          color: '#080e1a',
          opacity: saving ? 0.6 : 1,
        }}
      >
        {saving ? 'Saving...' : 'Save Menu Order'}
      </button>
    </div>
  );
};

export default MenuOrderCustomizer;
