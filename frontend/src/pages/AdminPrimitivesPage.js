import React, { useState } from 'react';
import { Search, Bell, Recycle, Sun, Moon, LogOut, PanelLeftClose } from 'lucide-react';
import AdminHeaderIconButton from '../components/admin/AdminHeaderIconButton';
import SidebarPillButton from '../components/layout/SidebarPillButton';

/**
 * Staff-only "primitives" showcase page. Every shared UI primitive the
 * team has extracted (`.btn-gold-cta`, `.btn-outline-cta`, `.select-themed`,
 * `<AdminHeaderIconButton>`, `<SidebarPillButton>`) is rendered here in
 * every relevant state so design reviews and regression checks are a
 * 3-second glance rather than a multi-page screenshot hunt.
 *
 * Accessible at `/admin/primitives` (staff only via route gate).
 */
const Section = ({ title, children }) => (
  <section className="space-y-3">
    <h2 className="text-xs font-semibold uppercase tracking-widest text-[var(--t4)]">{title}</h2>
    <div className="p-6 rounded-lg border border-[var(--b)] bg-[var(--card)] flex flex-wrap gap-4 items-center">
      {children}
    </div>
  </section>
);

const Label = ({ text }) => (
  <span className="text-xs uppercase text-[var(--t5)] mr-2">{text}:</span>
);

const AdminPrimitivesPage = () => {
  const [saving, setSaving] = useState(false);
  const [selectVal, setSelectVal] = useState('30');

  return (
    <div className="w-full max-w-3xl mx-auto p-6 lg:p-10 space-y-8" data-testid="admin-primitives-page">
      <header className="space-y-2">
        <h1 className="text-3xl font-bold text-[var(--t)]">UI Primitives</h1>
        <p className="text-sm text-[var(--t4)]">
          Live reference for every shared design primitive. Toggle the global
          theme (sidebar → Light/Dark Mode) to see each state render in both.
        </p>
      </header>

      <Section title="btn-gold-cta (primary Save/Apply)">
        <Label text="Enabled" />
        <button className="px-4 py-2 rounded-md text-sm font-semibold btn-gold-cta" data-testid="prim-gold-enabled">
          Save
        </button>
        <Label text="Disabled" />
        <button disabled className="px-4 py-2 rounded-md text-sm font-semibold btn-gold-cta" data-testid="prim-gold-disabled">
          Save
        </button>
        <Label text="Loading" />
        <button onClick={() => { setSaving(true); setTimeout(() => setSaving(false), 1500); }}
          disabled={saving}
          className="px-4 py-2 rounded-md text-sm font-semibold btn-gold-cta"
          data-testid="prim-gold-loading"
        >
          {saving ? 'Saving…' : 'Click to simulate'}
        </button>
      </Section>

      <Section title="btn-outline-cta (secondary Cancel/Dismiss)">
        <Label text="Enabled" />
        <button className="px-4 py-2 rounded-md text-sm btn-outline-cta" data-testid="prim-outline-enabled">
          Cancel
        </button>
        <Label text="Disabled" />
        <button disabled className="px-4 py-2 rounded-md text-sm btn-outline-cta" data-testid="prim-outline-disabled">
          Cancel
        </button>
      </Section>

      <Section title="select-themed (theme-aware caret)">
        <select
          value={selectVal}
          onChange={(e) => setSelectVal(e.target.value)}
          className="select-themed px-3 py-2 rounded-md bg-[var(--bg2)] border border-[var(--border)] text-[var(--t)] text-sm"
          data-testid="prim-select"
        >
          <option value="15">15 minutes</option>
          <option value="30">30 minutes</option>
          <option value="60">1 hour</option>
          <option value="240">4 hours</option>
        </select>
        <span className="text-xs text-[var(--t5)]">
          Up/down chevrons are SVG, always visible in both themes (iOS Safari safe).
        </span>
      </Section>

      <Section title="<AdminHeaderIconButton> (40×40 header pill)">
        <AdminHeaderIconButton title="Search" data-testid="prim-header-search">
          <Search />
        </AdminHeaderIconButton>
        <AdminHeaderIconButton
          title="Bell with badge"
          data-testid="prim-header-bell"
          badge={
            <span className="absolute -top-1 -right-1 px-1.5 py-0.5 rounded-full text-[11px] font-bold leading-none text-white bg-[#ef4444]">
              3
            </span>
          }
        >
          <Bell />
        </AdminHeaderIconButton>
        <AdminHeaderIconButton
          title="Bell, disconnected"
          data-testid="prim-header-disc"
          indicator={
            <span className="absolute bottom-1 right-1 w-1.5 h-1.5 rounded-full bg-[#ef4444]" />
          }
        >
          <Bell />
        </AdminHeaderIconButton>
        <AdminHeaderIconButton title="Recycle (cleanup)" data-testid="prim-header-recycle">
          <Recycle />
        </AdminHeaderIconButton>
      </Section>

      <Section title="<SidebarPillButton> (sidebar pill)">
        <div className="w-60 space-y-2">
          <SidebarPillButton icon={<Sun />} label="Light Mode" data-testid="prim-side-light" />
          <SidebarPillButton icon={<Moon />} label="Dark Mode" data-testid="prim-side-dark" />
          <SidebarPillButton icon={<PanelLeftClose />} label="Collapse" data-testid="prim-side-collapse" />
          <SidebarPillButton icon={<LogOut />} label="Sign Out" variant="danger" data-testid="prim-side-signout" />
        </div>
        <div className="w-16 space-y-2 border-l border-[var(--b)] pl-4 ml-4">
          <SidebarPillButton collapsed icon={<Sun />} label="Light Mode" data-testid="prim-side-light-c" />
          <SidebarPillButton collapsed icon={<LogOut />} label="Sign Out" variant="danger" data-testid="prim-side-signout-c" />
        </div>
      </Section>

      <footer className="pt-6 text-xs text-[var(--t5)] border-t border-[var(--b)]">
        See <code className="text-[var(--t4)]">/app/memory/AGENT_RULES.md</code> for the
        full spec, regression-guard details, and "when to reach for which
        primitive" guidance.
      </footer>
    </div>
  );
};

export default AdminPrimitivesPage;
