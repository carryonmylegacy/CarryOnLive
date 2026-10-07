import React from 'react';
import { Trash2, AlertTriangle, Building2, Users, GitBranch, Plus } from 'lucide-react';
import { TYPES, BUCKETS, rolesForCategory, isEquityRole } from '../../../config/entityCatalog';

const US_STATE = /^[A-Z]{0,2}$/;
const row = { background: 'var(--card)', border: '1px solid var(--b)' };
const sel = 'input-field select-themed text-base h-9';
const inp = 'input-field text-base h-9';

const Head = ({ icon: Icon, children, testId }) => (
  <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-[var(--t5)] mt-4 mb-2" data-testid={testId}>
    <Icon className="w-3.5 h-3.5" /> {children}
  </div>
);

const Remove = ({ onClick, testId }) => (
  <button type="button" onClick={onClick} className="text-[#ef4444] hover:opacity-70 p-1" aria-label="Remove" data-testid={testId}><Trash2 className="w-3.5 h-3.5" /></button>
);

// Editable "Here's what I heard" lists. `draft` is the validated server draft; every edit
// flows back through `onChange` so Build uses exactly what the subscriber approved.
export const EntityAIReview = ({ draft, onChange, user, beneficiaries = [], externals = [] }) => {
  const set = (patch) => onChange({ ...draft, ...patch });
  const upd = (key, i, patch) => set({ [key]: draft[key].map((x, idx) => (idx === i ? { ...x, ...patch } : x)) });
  const del = (key, i) => set({ [key]: draft[key].filter((_, idx) => idx !== i) });
  const bucketLabel = (cat) => BUCKETS.find((b) => b.id === cat)?.label || cat;
  const entityByRef = Object.fromEntries(draft.entities.map((e) => [e.ref, e]));
  const personLabel = (p) => `${p.first_name || ''} ${p.last_name || ''}`.trim() || 'Person';
  const sourceOptions = [
    ...draft.people.map((p) => ({ value: p.ref, label: `${personLabel(p)}${p.match?.kind === 'user' ? ' (you)' : ''}` })),
    ...draft.entities.map((e) => ({ value: e.ref, label: `${e.name} — entity` })),
  ];
  const matchOptions = [
    { value: `user:${user?.id}`, label: `${user?.first_name || 'You'} (you)` },
    ...beneficiaries.map((b) => ({ value: `beneficiary:${b.id}`, label: `${b.name || b.first_name} — beneficiary` })),
    ...externals.map((p) => ({ value: `external_person:${p.id}`, label: `${p.first_name}${p.last_name ? ' ' + p.last_name : ''} — outside party` })),
  ];

  return (
    <div data-testid="es-ai-review">
      {draft.summary && (
        <div className="rounded-xl p-3 text-[13px] leading-snug" style={{ background: 'rgba(var(--gold-rgb), 0.08)', border: '1px solid rgba(var(--gold-rgb), 0.35)', color: 'var(--t)' }} data-testid="es-ai-summary">
          <span className="font-bold text-[var(--gold)]">Here&apos;s what I heard:</span> {draft.summary}
        </div>
      )}
      {draft.questions?.length > 0 && (
        <ul className="mt-3 space-y-1.5" data-testid="es-ai-questions">
          {draft.questions.map((q, i) => (
            <li key={i} className="flex items-start gap-2 text-[12px] leading-snug rounded-lg px-3 py-2" style={{ background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.35)', color: 'var(--t)' }}>
              <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5 text-[#f59e0b]" /> {q}
            </li>
          ))}
        </ul>
      )}

      <Head icon={Building2} testId="es-ai-entities-head">Entities ({draft.entities.length})</Head>
      <div className="space-y-2">
        {draft.entities.map((e, i) => (
          <div key={e.ref} className="p-3 rounded-xl space-y-2" style={row} data-testid={`es-ai-entity-${i}`}>
            <div className="flex items-center justify-between gap-2">
              <span className="text-[11px] font-bold text-[var(--t4)]">{bucketLabel(e.category)}{e.existing_id ? ' · already on your chart' : ''}</span>
              <Remove onClick={() => del('entities', i)} testId={`es-ai-entity-remove-${i}`} />
            </div>
            {e.existing_id ? (
              <div className="text-sm font-bold text-[var(--t)]">{e.name}</div>
            ) : (
              <>
                <input className={inp} value={e.name} onChange={(ev) => upd('entities', i, { name: ev.target.value })} placeholder="Entity name" aria-label="Entity name" data-testid={`es-ai-entity-name-${i}`} />
                <div className="flex gap-2">
                  <select className={`${sel} flex-1 min-w-0`} value={e.type} onChange={(ev) => upd('entities', i, { type: ev.target.value })} aria-label="Entity type" data-testid={`es-ai-entity-type-${i}`}>
                    {(TYPES[e.category] || []).map((t) => <option key={t.id} value={t.id}>{t.friendly}</option>)}
                  </select>
                  <input className="input-field text-base h-9 w-16 text-center uppercase" value={e.formation_state || ''} maxLength={2} placeholder="ST"
                    onChange={(ev) => { const v = ev.target.value.toUpperCase(); if (US_STATE.test(v)) upd('entities', i, { formation_state: v || null }); }}
                    aria-label="Formation state" data-testid={`es-ai-entity-state-${i}`} />
                </div>
              </>
            )}
          </div>
        ))}
      </div>

      <Head icon={Users} testId="es-ai-people-head">People ({draft.people.length})</Head>
      <div className="space-y-2">
        {draft.people.map((p, i) => (
          <div key={p.ref} className="p-3 rounded-xl space-y-2" style={row} data-testid={`es-ai-person-${i}`}>
            <div className="flex items-center justify-between gap-2">
              <span className="text-[11px] font-bold text-[var(--t4)]">{p.relation_hint ? `Your ${p.relation_hint}` : 'Person'}{p.match ? ' · matched to someone already on the platform' : ' · new outside person'}</span>
              <Remove onClick={() => del('people', i)} testId={`es-ai-person-remove-${i}`} />
            </div>
            {!p.match && (
              <div className="flex gap-2">
                <input className={`${inp} flex-1 min-w-0`} value={p.first_name} onChange={(ev) => upd('people', i, { first_name: ev.target.value })} placeholder="First name" aria-label="First name" data-testid={`es-ai-person-first-${i}`} />
                <input className={`${inp} flex-1 min-w-0`} value={p.last_name || ''} onChange={(ev) => upd('people', i, { last_name: ev.target.value || null })} placeholder="Last name" aria-label="Last name" data-testid={`es-ai-person-last-${i}`} />
              </div>
            )}
            <select className={sel} value={p.match ? `${p.match.kind}:${p.match.id}` : 'new'} aria-label="Who is this"
              onChange={(ev) => {
                const v = ev.target.value;
                if (v === 'new') upd('people', i, { match: null });
                else { const idx = v.indexOf(':'); upd('people', i, { match: { kind: v.slice(0, idx), id: v.slice(idx + 1) } }); }
              }} data-testid={`es-ai-person-match-${i}`}>
              <option value="new">{personLabel(p)} — add as a new outside person</option>
              {matchOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
        ))}
      </div>

      <Head icon={GitBranch} testId="es-ai-connections-head">Connections ({draft.connections.length})</Head>
      <div className="space-y-2">
        {draft.connections.map((c, i) => {
          const target = entityByRef[c.target_ref];
          const roles = rolesForCategory(target?.category, true);
          return (
            <div key={i} className="p-3 rounded-xl space-y-2" style={row} data-testid={`es-ai-conn-${i}`}>
              <div className="flex items-center justify-between gap-2">
                <span className="text-[11px] font-bold text-[var(--t4)]">Connection {i + 1}</span>
                <Remove onClick={() => del('connections', i)} testId={`es-ai-conn-remove-${i}`} />
              </div>
              <select className={sel} value={c.source_ref} onChange={(ev) => upd('connections', i, { source_ref: ev.target.value })} aria-label="Who or what" data-testid={`es-ai-conn-source-${i}`}>
                {sourceOptions.filter((o) => o.value !== c.target_ref).map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
              <div className="flex gap-2">
                <select className={`${sel} flex-1 min-w-0`} value={c.role} onChange={(ev) => upd('connections', i, { role: ev.target.value, ownership_pct: isEquityRole(ev.target.value) ? c.ownership_pct : null })} aria-label="Role" data-testid={`es-ai-conn-role-${i}`}>
                  {roles.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}
                </select>
                {isEquityRole(c.role) && (
                  <input className="input-field text-base h-9 w-20 text-center" type="number" min={0} max={100} value={c.ownership_pct ?? ''} placeholder="%"
                    onChange={(ev) => upd('connections', i, { ownership_pct: ev.target.value === '' ? null : Number(ev.target.value) })} aria-label="Ownership percent" data-testid={`es-ai-conn-pct-${i}`} />
                )}
              </div>
              <select className={sel} value={c.target_ref} onChange={(ev) => upd('connections', i, { target_ref: ev.target.value })} aria-label="Of which entity" data-testid={`es-ai-conn-target-${i}`}>
                {draft.entities.filter((e) => e.ref !== c.source_ref).map((e) => <option key={e.ref} value={e.ref}>of {e.name}</option>)}
              </select>
            </div>
          );
        })}
        {draft.entities.length > 0 && sourceOptions.length > 0 && (
          <button type="button" onClick={() => set({ connections: [...draft.connections, { source_ref: sourceOptions[0].value, target_ref: draft.entities[0].ref, role: 'owner', ownership_pct: null, notes: null }] })}
            className="text-xs font-semibold flex items-center gap-1 text-[var(--gold)] py-1" data-testid="es-ai-conn-add">
            <Plus className="w-3.5 h-3.5" /> Add a connection
          </button>
        )}
      </div>
    </div>
  );
};

export default EntityAIReview;
