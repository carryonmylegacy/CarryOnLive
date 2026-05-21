import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { ChevronDown } from 'lucide-react';
import { ADMIN_SECTIONS, sectionRgb, visibleAdminSections } from '../../config/adminSections';
import { useTheme } from '../../contexts/ThemeContext';

/**
 * AdminSectionNav — expandable section list for the admin sidebar /
 * hamburger menu. Each section row:
 *   • Tap LABEL → navigates to `/admin/<section>` (the section landing).
 *   • Tap CHEVRON → expands inline to show ALL of that section's tabs.
 *
 * Created May 21 2026 — Admin Portal restructure (Section → Tab IA).
 */
const AdminSectionNav = ({ collapsed = false, variant = 'sidebar', onNavClick, adminScopes }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const { theme } = useTheme();
  const isLight = theme === 'light';
  const isMobile = variant === 'mobile';

  const sections = visibleAdminSections(adminScopes || ['founder']);

  // Persist expansion state across renders / route changes.
  const STORAGE_KEY = 'carryon_admin_section_expanded_v1';
  const [expanded, setExpanded] = useState(() => {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}'); }
    catch { return {}; }
  });

  // Auto-expand the section containing the current path on mount/route change
  useEffect(() => {
    const path = location.pathname;
    for (const s of sections) {
      const inSection = s.tabs.some(t => t.path === path) || path === `/admin/${s.key}`;
      if (inSection && !expanded[s.key]) {
        const next = { ...expanded, [s.key]: true };
        setExpanded(next);
        try { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); } catch {}
        break;
      }
    }
  }, [location.pathname]); // eslint-disable-line

  const toggle = (key) => {
    const next = { ...expanded, [key]: !expanded[key] };
    setExpanded(next);
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); } catch {}
  };

  const handleSectionClick = (sectionKey) => {
    if (onNavClick) onNavClick();
    const scopeParam = new URLSearchParams(window.location.search).get('scope');
    navigate(scopeParam ? `/admin/${sectionKey}?scope=${scopeParam}` : `/admin/${sectionKey}`);
  };

  const handleTabClick = (tabPath) => {
    if (onNavClick) onNavClick();
    const scopeParam = new URLSearchParams(window.location.search).get('scope');
    navigate(scopeParam ? `${tabPath}?scope=${scopeParam}` : tabPath);
  };

  if (collapsed) {
    // Collapsed sidebar — just render single-icon section buttons
    return (
      <div className="nav-section">
        {sections.map(s => {
          const Icon = s.icon;
          const isActive = location.pathname.startsWith(`/admin/${s.key}`) ||
            s.tabs.some(t => t.path === location.pathname);
          return (
            <button
              key={s.key}
              onClick={() => handleSectionClick(s.key)}
              className={`nav-item ${isActive ? 'active' : ''}`}
              data-testid={`admin-section-nav-${s.key}`}
              title={s.label}
              style={{ width: '100%', justifyContent: 'center' }}
            >
              <Icon style={{ color: isActive ? s.color : undefined }} />
            </button>
          );
        })}
      </div>
    );
  }

  return (
    <div className="nav-section" data-testid="admin-section-nav">
      {sections.map(s => {
        const Icon = s.icon;
        const rgb = sectionRgb(s.color);
        const isSectionActive = location.pathname === `/admin/${s.key}`;
        const isTabInSectionActive = s.tabs.some(t => t.path === location.pathname);
        const isOpen = !!expanded[s.key];
        const isActive = isSectionActive || isTabInSectionActive;
        // Per-section pill thematic — mirrors the `.gold-pill` rule but
        // keyed to each section's accent color. Opaque tinted bg in
        // light mode, solid accent gradient in dark mode, dark
        // saturated text against the bg, accent border at 0.55.
        const pill = s.pill;
        const pillBg = isLight
          ? (isActive ? pill.bgLightHover : pill.bgLight)
          : (isActive ? pill.bgDarkHover : pill.bgDark);
        const pillText = isLight ? pill.textLight : pill.textDark;
        const borderAlpha = isActive ? 0.75 : 0.55;
        const shadowAlpha = isActive ? 0.20 : 0.10;

        return (
          <div key={s.key} className="admin-section-block" style={{ marginBottom: 6 }}>
            <div
              className="flex items-center gap-2 rounded-full transition-all"
              style={{
                padding: isMobile ? '10px 14px' : '8px 14px',
                background: pillBg,
                border: `1px solid rgba(${rgb}, ${borderAlpha})`,
                boxShadow: `0 1px 2px rgba(${rgb}, ${shadowAlpha}), 0 1px 6px rgba(${rgb}, ${shadowAlpha * 0.6})`,
              }}
            >
              {/* LABEL — navigates to section page */}
              <button
                onClick={() => handleSectionClick(s.key)}
                data-testid={`admin-section-nav-${s.key}`}
                className="flex items-center gap-2 flex-1 min-w-0 text-left active:scale-[0.98]"
                style={{ background: 'transparent', border: 0, color: 'inherit', cursor: 'pointer' }}
              >
                <Icon
                  className="flex-shrink-0"
                  style={{ width: 18, height: 18, color: pillText }}
                />
                <span
                  className="font-bold uppercase tracking-wider truncate"
                  style={{
                    fontSize: isMobile ? 13 : 12,
                    letterSpacing: '0.08em',
                    color: pillText,
                  }}
                >
                  {s.label}
                </span>
              </button>
              {/* CHEVRON — expands inline */}
              <button
                onClick={() => toggle(s.key)}
                data-testid={`admin-section-toggle-${s.key}`}
                aria-label={`${isOpen ? 'Collapse' : 'Expand'} ${s.label}`}
                aria-expanded={isOpen}
                className="flex-shrink-0 p-1 rounded-md active:scale-90 transition-transform"
                style={{ background: 'transparent', border: 0, color: pillText, cursor: 'pointer' }}
              >
                <ChevronDown
                  style={{
                    width: 16,
                    height: 16,
                    transition: 'transform 180ms',
                    transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)',
                    color: pillText,
                  }}
                />
              </button>
            </div>

            {/* Tabs (expanded) */}
            {isOpen && (
              <div style={{ paddingLeft: 18, marginTop: 2, marginBottom: 6 }}>
                {s.tabs.map(t => {
                  const TabIcon = t.icon;
                  const isTabActive = location.pathname === t.path;
                  return (
                    <button
                      key={t.key}
                      onClick={() => handleTabClick(t.path)}
                      data-testid={`admin-tab-nav-${t.key}`}
                      className="flex items-center gap-2 w-full text-left rounded-md transition-all active:scale-[0.98]"
                      style={{
                        padding: isMobile ? '8px 10px' : '6px 10px',
                        marginBottom: 2,
                        background: isTabActive ? `rgba(${rgb}, 0.14)` : 'transparent',
                        color: isTabActive ? s.color : 'var(--t3)',
                        fontWeight: isTabActive ? 700 : 500,
                        fontSize: isMobile ? 13 : 12,
                        border: 0,
                        cursor: 'pointer',
                      }}
                    >
                      <TabIcon style={{ width: 14, height: 14, flexShrink: 0 }} />
                      <span className="truncate">{t.label}</span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};

export default AdminSectionNav;
