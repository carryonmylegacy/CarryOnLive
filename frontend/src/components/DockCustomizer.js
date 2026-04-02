import React, { useState, useEffect, useCallback } from 'react';
import { DOCK_REGISTRY } from './layout/MobileNav';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import { toast } from '../utils/toast';
import { GripVertical, Check, RotateCcw, ChevronUp, ChevronDown } from 'lucide-react';

const API_URL = process.env.REACT_APP_BACKEND_URL;

const DockCustomizer = () => {
  const { user } = useAuth();
  const { theme } = useTheme();
  const [selected, setSelected] = useState([]);
  const [saving, setSaving] = useState(false);
  const [loaded, setLoaded] = useState(false);

  // Determine role key for registry lookup
  const roleKey = (() => {
    const path = window.location.pathname;
    if (user?.role === 'admin' && path.startsWith('/ops')) return 'operator';
    if (user?.role === 'admin') return 'admin';
    if (user?.role === 'operator') return 'operator';
    if (user?.role === 'beneficiary' && user?.is_also_benefactor && !path.startsWith('/beneficiary')) return 'benefactor';
    if (user?.role === 'beneficiary') return 'beneficiary';
    if (user?.role === 'benefactor' && path.startsWith('/beneficiary')) return 'beneficiary';
    return 'benefactor';
  })();

  const available = DOCK_REGISTRY[roleKey] || [];

  // Defaults per role (matching the hardcoded bottom navs)
  const DEFAULTS = {
    benefactor: ['/beneficiaries', '/messages', '/dashboard', '/guardian', '/vault'],
    beneficiary: ['/beneficiary/vault', '/beneficiary/guardian', '/beneficiary', '/beneficiary/messages', '/beneficiary/checklist'],
    admin: ['/admin/transition', '/admin/support', '/admin', '/admin/dts', '/admin/verifications'],
    operator: ['/ops/transition', '/ops/support', '/ops', '/ops/dts', '/ops/verifications'],
  };

  // Load saved preferences
  useEffect(() => {
    const tk = localStorage.getItem('carryon_token');
    if (!tk) return;
    fetch(`${API_URL}/api/user-preferences/dock`, { headers: { Authorization: `Bearer ${tk}` } })
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        if (d?.items?.length > 0) {
          setSelected(d.items);
        } else {
          setSelected(DEFAULTS[roleKey] || []);
        }
        setLoaded(true);
      })
      .catch(() => {
        setSelected(DEFAULTS[roleKey] || []);
        setLoaded(true);
      });
  }, [roleKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const isSelected = useCallback((route) => selected.includes(route), [selected]);

  const toggleItem = (route) => {
    if (isSelected(route)) {
      setSelected(prev => prev.filter(r => r !== route));
    } else {
      if (selected.length >= 5) {
        toast.error('Maximum 5 items. Remove one first.');
        return;
      }
      setSelected(prev => [...prev, route]);
    }
  };

  const moveItem = (index, direction) => {
    const newArr = [...selected];
    const targetIndex = index + direction;
    if (targetIndex < 0 || targetIndex >= newArr.length) return;
    [newArr[index], newArr[targetIndex]] = [newArr[targetIndex], newArr[index]];
    setSelected(newArr);
  };

  const resetToDefault = () => {
    setSelected(DEFAULTS[roleKey] || []);
  };

  const save = async () => {
    if (selected.length < 3) {
      toast.error('Select at least 3 items for your dock.');
      return;
    }
    setSaving(true);
    try {
      const tk = localStorage.getItem('carryon_token');
      const res = await fetch(`${API_URL}/api/user-preferences/dock`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${tk}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: selected }),
      });
      if (!res.ok) throw new Error('Save failed');
      toast.success('Dock updated! Changes will appear on next refresh.');
    } catch {
      toast.error('Could not save dock preferences.');
    } finally {
      setSaving(false);
    }
  };

  if (!loaded) return null;

  const isDark = theme === 'dark';
  const cardBg = isDark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.02)';
  const cardBorder = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)';
  const accent = '#d4af37';

  return (
    <div data-testid="dock-customizer">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-bold tracking-wider uppercase" style={{ color: isDark ? '#8895A7' : '#475569' }}>
          Customize Dock
        </h3>
        <button
          onClick={resetToDefault}
          data-testid="dock-reset-btn"
          className="flex items-center gap-1 text-xs px-2 py-1 rounded-lg transition-all"
          style={{ color: isDark ? '#94A3B8' : '#64748B', background: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)' }}
        >
          <RotateCcw className="w-3 h-3" /> Reset
        </button>
      </div>

      <p className="text-xs mb-4" style={{ color: isDark ? '#64748B' : '#94A3B8' }}>
        Choose up to 5 items for your bottom navigation bar. Tap to add/remove, use arrows to reorder.
      </p>

      {/* Currently selected items — reorderable */}
      {selected.length > 0 && (
        <div className="mb-4">
          <div className="text-xs font-semibold mb-2" style={{ color: accent }}>
            Your Dock ({selected.length}/5)
          </div>
          <div className="flex flex-col gap-1">
            {selected.map((route, idx) => {
              const item = available.find(a => a.to === route);
              if (!item) return null;
              const Icon = item.icon;
              return (
                <div
                  key={route}
                  data-testid={`dock-selected-${idx}`}
                  className="flex items-center gap-2 px-3 py-2.5 rounded-xl"
                  style={{ background: `${accent}12`, border: `1px solid ${accent}30` }}
                >
                  <GripVertical className="w-4 h-4 flex-shrink-0" style={{ color: `${accent}60` }} />
                  <Icon className="w-4 h-4 flex-shrink-0" style={{ color: accent }} />
                  <span className="flex-1 text-sm font-medium" style={{ color: isDark ? '#E2E8F0' : '#1E293B' }}>
                    {item.label}
                  </span>
                  <div className="flex items-center gap-0.5">
                    <button
                      onClick={() => moveItem(idx, -1)}
                      disabled={idx === 0}
                      className="p-1 rounded-md transition-colors"
                      style={{ opacity: idx === 0 ? 0.3 : 1, color: isDark ? '#94A3B8' : '#64748B' }}
                      data-testid={`dock-move-up-${idx}`}
                    >
                      <ChevronUp className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => moveItem(idx, 1)}
                      disabled={idx === selected.length - 1}
                      className="p-1 rounded-md transition-colors"
                      style={{ opacity: idx === selected.length - 1 ? 0.3 : 1, color: isDark ? '#94A3B8' : '#64748B' }}
                      data-testid={`dock-move-down-${idx}`}
                    >
                      <ChevronDown className="w-4 h-4" />
                    </button>
                  </div>
                  <button
                    onClick={() => toggleItem(route)}
                    className="p-1 rounded-md"
                    style={{ color: '#ef4444' }}
                    data-testid={`dock-remove-${idx}`}
                  >
                    <span className="text-xs font-bold">X</span>
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Available items */}
      <div className="mb-4">
        <div className="text-xs font-semibold mb-2" style={{ color: isDark ? '#64748B' : '#94A3B8' }}>
          Available Items
        </div>
        <div className="flex flex-col gap-1">
          {available.filter(a => !isSelected(a.to)).map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.to}
                onClick={() => toggleItem(item.to)}
                data-testid={`dock-available-${item.to.replace(/\//g, '-')}`}
                className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-left w-full transition-all"
                style={{ background: cardBg, border: `1px solid ${cardBorder}` }}
              >
                <Icon className="w-4 h-4 flex-shrink-0" style={{ color: isDark ? '#64748B' : '#94A3B8' }} />
                <span className="flex-1 text-sm font-medium" style={{ color: isDark ? '#CBD5E1' : '#334155' }}>
                  {item.label}
                </span>
                {selected.length < 5 && (
                  <span className="text-xs px-2 py-0.5 rounded-full" style={{ color: accent, background: `${accent}15` }}>
                    + Add
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Save button */}
      <button
        onClick={save}
        disabled={saving || selected.length < 3}
        data-testid="dock-save-btn"
        className="w-full py-3 rounded-xl font-semibold text-sm transition-all"
        style={{
          background: selected.length >= 3 ? accent : isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)',
          color: selected.length >= 3 ? '#080e1a' : isDark ? '#525C72' : '#94A3B8',
          opacity: saving ? 0.6 : 1,
        }}
      >
        {saving ? 'Saving...' : 'Save Dock Layout'}
      </button>
    </div>
  );
};

export default DockCustomizer;
