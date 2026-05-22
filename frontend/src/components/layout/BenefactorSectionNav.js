import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { ChevronDown } from 'lucide-react';
import { BENEFACTOR_SECTIONS, sectionRgb } from '../../config/benefactorSections';
import { useTheme } from '../../contexts/ThemeContext';
import { isFeatureKeyEnabled } from '../../utils/featureGates';

/**
 * BenefactorSectionNav — expandable section list for the benefactor
 * sidebar / hamburger menu. Mirrors `AdminSectionNav.js` exactly so
 * the benefactor menu reads with the same visual cadence as the
 * admin menu.
 *
 * Each section row:
 *   • Tap LABEL → toggles expansion (no page navigation; sections
 *     don't currently have landing pages, only their tab children
 *     do).
 *   • Tap CHEVRON → also toggles expansion.
 *
 * Children are tier-gated against `enabledFeatures`. A section whose
 * children are all gated off renders ZERO items (the section pill
 * itself still shows so the user knows the section exists; tapping
 * it surfaces the empty state). Created May 22 2026 — Benefactor
 * Portal restructure (4-section IA).
 */
const BenefactorSectionNav = ({
  collapsed = false,
  variant = 'sidebar',
  onNavClick,
  enabledFeatures,
  ectUnread,
}) => {
  const navigate = useNavigate();
  const location = useLocation();
  const { theme } = useTheme();
  const isLight = theme === 'light';
  const isMobile = variant === 'mobile';

  // Persist expansion state across renders / route changes.
  const STORAGE_KEY = 'carryon_benefactor_section_expanded_v1';
  const [expanded, setExpanded] = useState(() => {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}'); }
    catch { return {}; }
  });

  // Auto-expand the section containing the current path on mount /
  // route change so the user always sees where they are.
  useEffect(() => {
    const path = location.pathname;
    for (const s of BENEFACTOR_SECTIONS) {
      const inSection = s.tabs.some(t => t.path === path);
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

  const handleTabClick = (tabPath) => {
    if (onNavClick) onNavClick();
    navigate(tabPath);
  };

  // Tier-filter a section's tabs against enabledFeatures.
  const visibleTabs = (section) =>
    section.tabs.filter(t => isFeatureKeyEnabled(t.featureKey, enabledFeatures));

  if (collapsed) {
    return (
      <div className="nav-section">
        {BENEFACTOR_SECTIONS.map(s => {
          const Icon = s.icon;
          const isActive = s.tabs.some(t => t.path === location.pathname);
          return (
            <button
              key={s.key}
              onClick={() => toggle(s.key)}
              className={`nav-item ${isActive ? 'active' : ''}`}
              data-testid={`benefactor-section-nav-${s.key}`}
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
    <div className="nav-section" data-testid="benefactor-section-nav">
      {BENEFACTOR_SECTIONS.map(s => {
        const Icon = s.icon;
        const rgb = sectionRgb(s.color);
        const tabs = visibleTabs(s);
        const isTabInSectionActive = tabs.some(t => t.path === location.pathname);
        const isOpen = !!expanded[s.key];
        const isActive = isTabInSectionActive;
        const pill = s.pill;
        const pillBg = isLight
          ? (isActive ? pill.bgLightHover : pill.bgLight)
          : (isActive ? pill.bgDarkHover : pill.bgDark);
        const pillText = isLight ? pill.textLight : pill.textDark;
        const borderAlpha = isActive ? 0.75 : 0.55;
        const shadowAlpha = isActive ? 0.20 : 0.10;

        return (
          <div key={s.key} className="benefactor-section-block" style={{ marginBottom: 6 }}>
            <div
              className="flex items-center gap-2 rounded-full transition-all"
              style={{
                padding: isMobile ? '10px 14px' : '8px 14px',
                background: pillBg,
                border: `1px solid rgba(${rgb}, ${borderAlpha})`,
                boxShadow: `0 1px 2px rgba(${rgb}, ${shadowAlpha}), 0 1px 6px rgba(${rgb}, ${shadowAlpha * 0.6})`,
              }}
            >
              {/* LABEL — toggles expansion */}
              <button
                onClick={() => toggle(s.key)}
                data-testid={`benefactor-section-nav-${s.key}`}
                aria-expanded={isOpen}
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
              {/* CHEVRON — also expands inline */}
              <button
                onClick={() => toggle(s.key)}
                data-testid={`benefactor-section-toggle-${s.key}`}
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
                {tabs.length === 0 ? (
                  <div
                    style={{
                      padding: isMobile ? '8px 10px' : '6px 10px',
                      fontSize: isMobile ? 12 : 11,
                      color: 'var(--t5)',
                      fontStyle: 'italic',
                    }}
                  >
                    Not on your plan
                  </div>
                ) : (
                  tabs.map(t => {
                    const TabIcon = t.icon;
                    const isTabActive = location.pathname === t.path;
                    const showBadge = t.featureKey === 'ect' && ectUnread > 0;
                    return (
                      <button
                        key={t.key}
                        onClick={() => handleTabClick(t.path)}
                        data-testid={`benefactor-tab-nav-${t.key}`}
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
                        <span className="truncate flex-1">{t.label}</span>
                        {showBadge && (
                          <span
                            className="px-1.5 py-0.5 rounded-full font-bold leading-none"
                            style={{
                              background: '#ef4444',
                              color: '#fff',
                              fontSize: 12,
                            }}
                            data-testid="benefactor-ect-unread-badge"
                          >
                            {ectUnread > 9 ? '9+' : ectUnread}
                          </span>
                        )}
                      </button>
                    );
                  })
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};

export default BenefactorSectionNav;
