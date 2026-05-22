import React, { useEffect, useState, useCallback } from 'react';
import { Network } from 'lucide-react';
import apiClient from '../utils/apiClient';
import { API_URL } from '../config';
import { useAuth } from '../contexts/AuthContext';
import { sectionRgb, BENEFACTOR_SECTIONS } from '../config/benefactorSections';
import EntitiesSection from '../components/financial/entities/EntitiesSection';

/**
 * EntitiesPage — standalone CarryOn Entities & Structures (CES)
 * surface, broken out of the CFP page so the founder can toggle CES
 * independently per tier and per partner. Mounted at top-level
 * `/entities`, listed under the FINANCIAL benefactor section.
 *
 * Header matches the section gradient style used by every other
 * benefactor section page (the same radial-gradient + serif title +
 * tinted icon chip pattern from `AdminSectionLayout`).
 *
 * Reuses the existing `<EntitiesSection>` component verbatim so
 * none of the org-chart behavior (free-drag tiles, edge routing,
 * SDV linkage, financials, quick-info popover, docs modal,
 * Clean Up) is re-implemented or regressed.
 *
 * Created May 22 2026 — Benefactor Portal restructure.
 */
export default function EntitiesPage() {
  const { user } = useAuth();
  const [estate, setEstate] = useState(null);
  const [beneficiaries, setBeneficiaries] = useState([]);

  const financialSection = BENEFACTOR_SECTIONS.find(s => s.key === 'financial');
  const accent = financialSection?.color || '#22C993';
  const rgb = sectionRgb(accent);

  const loadEstate = useCallback(async () => {
    try {
      const token = localStorage.getItem('carryon_token');
      const headers = token ? { Authorization: `Bearer ${token}` } : {};
      const res = await apiClient.get(`${API_URL}/estates`, { headers });
      const list = Array.isArray(res.data) ? res.data : (res.data?.estates || []);
      const selectedId = localStorage.getItem('selected_estate_id');
      const e = (selectedId && list.find(x => x.id === selectedId)) || list[0] || null;
      if (e) {
        setEstate(e);
        try { localStorage.setItem('selected_estate_id', e.id); } catch {}
      }
    } catch (err) {
      // Best effort — empty state will render below if estate is null.
    }
  }, []);

  const loadBeneficiaries = useCallback(async (estateId) => {
    if (!estateId) return;
    try {
      const token = localStorage.getItem('carryon_token');
      const headers = token ? { Authorization: `Bearer ${token}` } : {};
      const res = await apiClient.get(`${API_URL}/beneficiaries/${estateId}`, { headers });
      setBeneficiaries(Array.isArray(res.data) ? res.data : (res.data?.beneficiaries || []));
    } catch {
      setBeneficiaries([]);
    }
  }, []);

  useEffect(() => { loadEstate(); }, [loadEstate]);
  useEffect(() => { loadBeneficiaries(estate?.id); }, [estate?.id, loadBeneficiaries]);

  return (
    <div
      className="p-4 lg:p-6 pt-4 lg:pt-6 pb-24 lg:pb-6 space-y-5 animate-fade-in max-w-full overflow-x-hidden"
      data-testid="entities-page"
      style={{
        background: `radial-gradient(ellipse at top left, rgba(${rgb}, 0.18), transparent 55%), radial-gradient(ellipse at bottom right, rgba(${rgb}, 0.07), transparent 55%)`,
      }}
    >
      {/* Section-style header — matches AdminSectionLayout pattern */}
      <div className="flex items-center gap-3" data-testid="entities-page-header">
        <div
          className="w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0"
          style={{
            background: `linear-gradient(135deg, rgba(${rgb}, 0.22), rgba(${rgb}, 0.10))`,
            border: `1px solid rgba(${rgb}, 0.25)`,
          }}
        >
          <Network className="w-5 h-5" style={{ color: accent }} />
        </div>
        <div>
          <h1
            className="text-2xl sm:text-3xl font-bold text-[var(--t)]"
            style={{ fontFamily: 'var(--sans)' }}
          >
            CarryOn Entities &amp; Structures (CES)
          </h1>
          <p className="text-xs text-[var(--t5)]">
            Visual map of trusts, LLCs, charities, properties, and the people who hold them.
          </p>
        </div>
      </div>

      {/* Org chart body — reuses the existing EntitiesSection
          component verbatim so the free-drag chart, edge routing,
          SDV linkage, financials, quick-info popover, docs modal,
          and Clean Up all work identically to the prior in-CFP
          embed. Suppress the "loading" empty state here since this
          page IS the entities surface (no need to hide). */}
      {estate?.id ? (
        <EntitiesSection
          estateId={estate.id}
          beneficiaries={beneficiaries}
          onEntitiesChanged={() => {}}
          openEntityId={new URLSearchParams(window.location.search).get('openEntity')}
        />
      ) : (
        <div
          className="rounded-xl p-6 text-center"
          style={{
            background: 'var(--s)',
            border: '1px solid var(--b)',
            color: 'var(--t4)',
          }}
          data-testid="entities-page-no-estate"
        >
          No estate selected — open your dashboard first to connect to your estate.
        </div>
      )}
    </div>
  );
}
