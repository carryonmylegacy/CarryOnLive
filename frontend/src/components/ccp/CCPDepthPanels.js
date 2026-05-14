/**
 * CCP Depth Panels — Household Roster + Go-Bag + Rendezvous +
 * Out-of-Area Contact + Drill + Activation, exported as discrete
 * components so ConnectedProtocolPage can mount each behind its own
 * SlidePanel without bundling the whole module up front.
 *
 * All panels share the same primitives (gold-button, input/textarea
 * surface styles) so they feel like one coherent product.
 */
import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { toast } from 'sonner';
import { Plus, Trash2, Save, Mail, AlertTriangle, Calendar, Check, Pencil } from 'lucide-react';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Textarea } from '../ui/textarea';
import { API_URL } from '../../config';
import SortControl from '../ui/SortControl';

const auth = () => ({ headers: { Authorization: `Bearer ${localStorage.getItem('carryon_token')}` } });

// ─── HOUSEHOLD ROSTER — pretty beneficiary picker ───────────────
// All medical / emergency info lives on each Beneficiary record now,
// so this panel is purely a selection grid: tap a beneficiary's
// avatar tile to include or exclude them from the household.
export function HouseholdRosterPanel({ estateId, onDirty }) {
  const [benefs, setBenefs] = useState([]);
  const [selectedIds, setSelectedIds] = useState([]);
  const [saving, setSaving] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!estateId) return;
    let cancelled = false;
    (async () => {
      try {
        const [benefRes, hhRes] = await Promise.all([
          axios.get(`${API_URL}/beneficiaries/${estateId}`, auth()),
          axios.get(`${API_URL}/ccp/household/${estateId}`, auth()),
        ]);
        if (cancelled) return;
        setBenefs(benefRes.data || []);
        setSelectedIds(hhRes.data?.beneficiary_ids || []);
      } catch (e) {
        // silent — empty state below
      } finally {
        if (!cancelled) setLoaded(true);
      }
    })();
    return () => { cancelled = true; };
  }, [estateId]);

  const toggle = (id) => setSelectedIds(s =>
    s.includes(id) ? s.filter(x => x !== id) : [...s, id]
  );

  const save = async () => {
    setSaving(true);
    try {
      await axios.put(
        `${API_URL}/ccp/household/${estateId}`,
        { beneficiary_ids: selectedIds },
        auth(),
      );
      toast.success(`Household set — ${selectedIds.length} member${selectedIds.length === 1 ? '' : 's'}`);
      onDirty?.();
    } catch (e) {
      toast.error('Failed to save household');
    } finally { setSaving(false); }
  };

  return (
    <div className="space-y-4" data-testid="household-roster-panel">
      <p className="text-sm text-[var(--t4)] leading-relaxed">
        Tap each person who lives in your household. Names, relationships, allergies, and medical info come from their <strong className="text-[var(--t)]">Beneficiary</strong> profile — edit those once on the Beneficiaries page and every plan you create will pick them up.
      </p>

      {loaded && benefs.length === 0 && (
        <div className="rounded-2xl p-8 text-center" style={{ background: 'var(--s)', border: '1px dashed var(--b)' }}>
          <p className="text-sm text-[var(--t4)] mb-1">No beneficiaries yet.</p>
          <p className="text-xs text-[var(--t5)]">Add people on the Beneficiaries page first, then come back here to pick your household.</p>
        </div>
      )}

      {benefs.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3" data-testid="household-benef-grid">
          {benefs.map(b => {
            const sel = selectedIds.includes(b.id);
            const color = b.avatar_color || '#d4af37';
            const hasMedical = !!(b.medical_conditions || b.allergies || b.prescriptions || b.blood_type);
            return (
              <button
                key={b.id}
                onClick={() => toggle(b.id)}
                data-testid={`household-toggle-${b.id}`}
                aria-pressed={sel}
                className="flex items-center gap-3 rounded-2xl p-3 text-left transition-all active:scale-[0.98]"
                style={{
                  background: sel ? `${color}1A` : 'var(--bg2)',
                  border: `1px solid ${sel ? color : 'var(--b)'}`,
                  boxShadow: sel ? `0 0 0 1px ${color}33` : 'none',
                }}
              >
                {/* Avatar */}
                <div
                  className="relative w-12 h-12 rounded-full flex items-center justify-center flex-shrink-0 overflow-hidden"
                  style={{ background: color, color: '#0b1120', fontFamily: 'var(--sans)' }}
                >
                  {b.photo_url ? (
                    <img src={b.photo_url} alt={b.name} className="w-full h-full object-cover" />
                  ) : (
                    <span className="text-base font-bold">{b.initials || (b.name || '?').slice(0, 2).toUpperCase()}</span>
                  )}
                  {sel && (
                    <span
                      className="absolute -bottom-0.5 -right-0.5 w-5 h-5 rounded-full flex items-center justify-center"
                      style={{ background: color, border: '2px solid var(--bg2)' }}
                    >
                      <Check className="w-3 h-3" style={{ color: '#0b1120' }} strokeWidth={3} />
                    </span>
                  )}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="text-sm font-bold truncate" style={{ color: 'var(--t)', fontFamily: 'var(--sans)' }}>
                    {b.name}
                  </div>
                  <div className="text-xs truncate" style={{ color: 'var(--t4)' }}>
                    {b.relation || '—'}{b.date_of_birth ? ` · ${ageFromDob(b.date_of_birth)}y` : ''}
                  </div>
                  {hasMedical && (
                    <div className="text-[10px] mt-0.5" style={{ color: '#22C993' }}>
                      ✓ Medical info on file
                    </div>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      )}

      {benefs.length > 0 && (
        <Button className="gold-button w-full" onClick={save} disabled={saving || !loaded} data-testid="hh-save">
          <Save className="w-4 h-4 mr-1" /> {saving ? 'Saving…' : `Save household (${selectedIds.length})`}
        </Button>
      )}
    </div>
  );
}

function ageFromDob(dob) {
  try {
    const d = new Date(dob);
    const t = new Date();
    let a = t.getFullYear() - d.getFullYear();
    const m = t.getMonth() - d.getMonth();
    if (m < 0 || (m === 0 && t.getDate() < d.getDate())) a--;
    return a;
  } catch { return ''; }
}

// ─── GO-BAG INVENTORY ──────────────────────────────────────────
const GO_BAG_CATS = [
  'water', 'food', 'medication', 'first_aid', 'tools', 'documents',
  'cash', 'clothing', 'communication', 'pet_supplies', 'comfort', 'other',
];

const STARTER_ITEMS = [
  { category: 'water', name: '1 gal water per person per day', qty: '3-day supply' },
  { category: 'food', name: 'Non-perishable food', qty: '3-day supply' },
  { category: 'first_aid', name: 'First-aid kit', qty: '1' },
  { category: 'tools', name: 'Flashlight + batteries', qty: '1' },
  { category: 'communication', name: 'Battery / crank radio', qty: '1' },
  { category: 'documents', name: 'Copies of ID, insurance, deeds', qty: '1 set' },
  { category: 'cash', name: 'Small bills + coins', qty: '$200' },
];

export function GoBagPanel({ estateId, onDirty }) {
  const [items, setItems] = useState([]);
  const [saving, setSaving] = useState(false);
  // editingId === null → all rows collapsed (list view)
  // editingId === item.id → that row expanded for editing
  // editingId === 'NEW' → adding a new item
  const [editingId, setEditingId] = useState(null);
  const [sortKey, setSortKey] = useState(() => localStorage.getItem('gobag:sort') || 'category_asc');
  useEffect(() => { try { localStorage.setItem('gobag:sort', sortKey); } catch { /* private mode */ } }, [sortKey]);

  useEffect(() => {
    if (!estateId) return;
    axios.get(`${API_URL}/ccp/go-bag/${estateId}`, auth())
      .then(r => setItems(r.data.items || []))
      .catch(() => {});
  }, [estateId]);

  const today = new Date().toISOString().slice(0, 10);
  const flagExpiring = (exp) => {
    if (!exp) return null;
    const d = new Date(exp);
    const diffDays = Math.ceil((d - new Date()) / (1000 * 60 * 60 * 24));
    if (diffDays < 0) return { color: '#EF4444', label: 'EXPIRED' };
    if (diffDays <= 30) return { color: '#F59E0B', label: `${diffDays}d` };
    return { color: '#22C993', label: '' };
  };

  const persist = async (next) => {
    setSaving(true);
    try {
      const clean = next.filter(i => i.name?.trim());
      await axios.put(`${API_URL}/ccp/go-bag/${estateId}`, clean, auth());
      setItems(clean);
      onDirty?.();
      return true;
    } catch (e) {
      toast.error('Failed to save go-bag');
      return false;
    } finally { setSaving(false); }
  };

  const startNew = (preset = {}) => {
    const blank = {
      id: 'NEW', category: preset.category || 'other', name: preset.name || '',
      qty: preset.qty || '', expires_at: '', last_checked: today, notes: '',
    };
    setItems(it => [...it, blank]);
    setEditingId('NEW');
  };
  const updateField = (id, patch) => setItems(it => it.map(x => x.id === id ? { ...x, ...patch } : x));
  const removeItem = async (id) => {
    const next = items.filter(x => x.id !== id);
    setItems(next);
    if (id === 'NEW') return;   // never persisted yet
    const ok = await persist(next);
    if (ok) toast.success('Item removed');
  };
  const seedStarter = async () => {
    const existing = new Set(items.map(i => i.name.toLowerCase()));
    const adds = STARTER_ITEMS
      .filter(s => !existing.has(s.name.toLowerCase()))
      .map(s => ({ ...s, id: crypto.randomUUID(), last_checked: today, expires_at: '', notes: '' }));
    const next = [...items, ...adds];
    const ok = await persist(next);
    if (ok) toast.success(`Added ${adds.length} starter items`);
  };
  const commitRow = async (id) => {
    const row = items.find(x => x.id === id);
    if (!row || !row.name?.trim()) {
      toast.error('Name is required');
      return;
    }
    // Replace 'NEW' sentinel with a real id on first commit.
    const finalId = id === 'NEW' ? crypto.randomUUID() : id;
    const next = items.map(x => x.id === id ? { ...x, id: finalId } : x);
    const ok = await persist(next);
    if (ok) {
      setEditingId(null);
      toast.success('Saved');
    }
  };
  const cancelRow = (id) => {
    if (id === 'NEW') {
      setItems(it => it.filter(x => x.id !== 'NEW'));
    }
    setEditingId(null);
  };

  const saveAll = async () => {
    const ok = await persist(items);
    if (ok) {
      setEditingId(null);
      toast.success(`Saved ${items.length} item${items.length === 1 ? '' : 's'}`);
    }
  };

  // Apply current sort. While a row is being edited we lock the order
  // so the newly-added 'NEW' row doesn't visually jump around.
  const sortedItems = React.useMemo(() => {
    if (editingId !== null) return items;
    const arr = [...items];
    const cmpStr = (a, b) => String(a || '').localeCompare(String(b || ''), undefined, { sensitivity: 'base' });
    const cmpDate = (a, b) => {
      if (!a && !b) return 0;
      if (!a) return 1;
      if (!b) return -1;
      return new Date(a).getTime() - new Date(b).getTime();
    };
    arr.sort((a, b) => {
      switch (sortKey) {
        case 'name_asc':     return cmpStr(a.name, b.name);
        case 'name_desc':    return -cmpStr(a.name, b.name);
        case 'expires_asc':  return cmpDate(a.expires_at, b.expires_at);
        case 'expires_desc': return -cmpDate(a.expires_at, b.expires_at);
        case 'category_asc':
        default:             return cmpStr(a.category, b.category) || cmpStr(a.name, b.name);
      }
    });
    return arr;
  }, [items, sortKey, editingId]);

  return (
    <div className="space-y-4" data-testid="go-bag-panel">
      <p className="text-sm text-[var(--t4)] leading-relaxed">
        Track what's actually IN your emergency kit. Tap the pencil to edit an item. Items expiring within 30 days will lower your readiness score.
      </p>

      {items.length === 0 && (
        <Button variant="outline" className="outline-pill-button w-full" onClick={seedStarter} data-testid="gobag-seed">
          <Plus className="w-4 h-4 mr-1" /> Start with FEMA-recommended 7-item kit
        </Button>
      )}

      {items.length > 0 && editingId === null && (
        <div className="flex items-center justify-end">
          <SortControl
            value={sortKey}
            onChange={setSortKey}
            testId="gobag-sort"
            options={[
              { value: 'category_asc',  label: 'Category' },
              { value: 'name_asc',      label: 'Name (A→Z)' },
              { value: 'name_desc',     label: 'Name (Z→A)' },
              { value: 'expires_asc',   label: 'Expiring soonest' },
              { value: 'expires_desc',  label: 'Expiring latest' },
            ]}
          />
        </div>
      )}

      {sortedItems.map((it) => {
        const flag = flagExpiring(it.expires_at);
        const isOpen = editingId === it.id;
        if (!isOpen) {
          // ── COLLAPSED ROW — name · qty · expiry · ✎  🗑
          return (
            <div
              key={it.id}
              className="rounded-2xl flex items-center gap-3 px-3 py-2.5 transition-all"
              style={{ background: 'var(--bg2)', border: '1px solid var(--b)' }}
              data-testid={`gb-row-${it.id}`}
            >
              <div className="flex-1 min-w-0">
                <div className="text-sm font-bold truncate" style={{ color: 'var(--t)', fontFamily: 'var(--sans)' }}>
                  {it.name || '(unnamed)'}
                </div>
                <div className="text-xs flex items-center gap-2 truncate" style={{ color: 'var(--t4)' }}>
                  <span className="truncate">{it.category?.replace(/_/g, ' ')}{it.qty ? ` · ${it.qty}` : ''}</span>
                  {it.expires_at && (
                    <span className="font-bold flex items-center gap-1" style={{ color: flag?.color || 'var(--t4)' }}>
                      <Calendar className="w-3 h-3" /> {it.expires_at}{flag?.label ? ` (${flag.label})` : ''}
                    </span>
                  )}
                </div>
              </div>
              <button
                onClick={() => setEditingId(it.id)}
                className="p-2 rounded-lg flex-shrink-0 transition-colors"
                style={{ color: 'var(--t3)' }}
                aria-label="Edit item"
                data-testid={`gb-edit-${it.id}`}
              >
                <Pencil className="w-4 h-4" />
              </button>
              <button
                onClick={() => removeItem(it.id)}
                className="p-2 rounded-lg flex-shrink-0 transition-colors"
                style={{ color: 'var(--rd)' }}
                aria-label="Delete item"
                data-testid={`gb-delete-${it.id}`}
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          );
        }
        // ── EXPANDED EDITOR ROW
        return (
          <div
            key={it.id}
            className="rounded-2xl p-4 space-y-3"
            style={{ background: 'var(--bg2)', border: '1px solid var(--gold)' }}
            data-testid={`gb-edit-row-${it.id}`}
          >
            <div className="grid grid-cols-2 gap-2">
              <Input data-testid={`gb-name-${it.id}`} placeholder="Item name *" autoFocus value={it.name || ''} onChange={e => updateField(it.id, { name: e.target.value })} />
              <select
                value={it.category}
                onChange={e => updateField(it.id, { category: e.target.value })}
                className="rounded-md px-3 py-2 text-sm"
                style={{ background: 'var(--bg)', border: '1px solid var(--b)', color: 'var(--t)' }}
              >
                {GO_BAG_CATS.map(c => <option key={c} value={c}>{c.replace(/_/g, ' ')}</option>)}
              </select>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <Input placeholder="Qty (e.g. 3 gal)" value={it.qty || ''} onChange={e => updateField(it.id, { qty: e.target.value })} />
              <Input type="date" placeholder="Expires" value={it.expires_at || ''} onChange={e => updateField(it.id, { expires_at: e.target.value })} />
              <Input type="date" placeholder="Last checked" value={it.last_checked || ''} onChange={e => updateField(it.id, { last_checked: e.target.value })} />
            </div>
            {flag && flag.label && (
              <div className="flex items-center gap-2 text-xs font-bold" style={{ color: flag.color }}>
                {flag.color === '#EF4444' && <AlertTriangle className="w-3.5 h-3.5" />}
                {flag.color === '#F59E0B' && <Calendar className="w-3.5 h-3.5" />}
                {flag.label}
              </div>
            )}
            <div className="flex items-center gap-2 pt-1">
              <Button variant="outline" className="outline-pill-button flex-1" onClick={() => cancelRow(it.id)} data-testid={`gb-cancel-${it.id}`}>
                Cancel
              </Button>
              <Button className="gold-button flex-1" onClick={() => commitRow(it.id)} disabled={saving} data-testid={`gb-commit-${it.id}`}>
                <Check className="w-4 h-4 mr-1" /> {saving ? 'Saving…' : 'Save item'}
              </Button>
            </div>
          </div>
        );
      })}

      {/* Bottom actions — Add Item + Save kit (the latter still bulk-saves
          everything, useful if the user changed multiple rows without
          opening them. Hidden while a row is open to keep focus clear. */}
      {editingId === null && (
        <div className="flex items-center gap-2 pt-1">
          <Button variant="outline" className="outline-pill-button flex-1" onClick={() => startNew()} data-testid="gb-add">
            <Plus className="w-4 h-4 mr-1" /> Add item
          </Button>
          {items.length > 0 && (
            <Button className="gold-button flex-1" onClick={saveAll} disabled={saving} data-testid="gb-save-all">
              <Save className="w-4 h-4 mr-1" /> {saving ? 'Saving…' : `Save kit (${items.length})`}
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

// ─── RENDEZVOUS POINTS ─────────────────────────────────────────
export function RendezvousPanel({ estateId, onDirty }) {
  const [data, setData] = useState({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!estateId) return;
    axios.get(`${API_URL}/ccp/rendezvous/${estateId}`, auth())
      .then(r => setData(r.data || {}))
      .catch(() => {});
  }, [estateId]);

  const update = (patch) => setData(d => ({ ...d, ...patch }));

  const save = async () => {
    setSaving(true);
    try {
      await axios.put(`${API_URL}/ccp/rendezvous/${estateId}`, data, auth());
      toast.success('Meetup points saved');
      onDirty?.();
    } catch (e) {
      toast.error('Failed to save');
    } finally { setSaving(false); }
  };

  const tier = (prefix, title, color) => (
    <div className="rounded-2xl p-4 space-y-2" style={{ background: 'var(--bg2)', border: `1px solid ${color}55` }}>
      <div className="flex items-center gap-2">
        <span className="text-xs font-bold tracking-wide uppercase" style={{ color }}>{title}</span>
      </div>
      <Input placeholder={`Label (e.g. "Grandma's house")`} value={data[`${prefix}_label`] || ''} onChange={e => update({ [`${prefix}_label`]: e.target.value })} />
      <Input placeholder="Address" value={data[`${prefix}_address`] || ''} onChange={e => update({ [`${prefix}_address`]: e.target.value })} />
      <Textarea placeholder="Notes (gate code, contact, route hint…)" rows={2} value={data[`${prefix}_notes`] || ''} onChange={e => update({ [`${prefix}_notes`]: e.target.value })} />
    </div>
  );

  return (
    <div className="space-y-4" data-testid="rendezvous-panel">
      <p className="text-sm text-[var(--t4)] leading-relaxed">
        Three meetup points in concentric rings — across the street, across town, and out of state. Everyone in your household memorizes all three so any reachable one works.
      </p>
      {tier('primary', 'Primary — near home', '#22C993')}
      {tier('secondary', 'Secondary — across town', '#3B7BF7')}
      {tier('tertiary', 'Tertiary — out of state', '#d4af37')}

      <div className="rounded-2xl p-4 space-y-2" style={{ background: 'var(--bg2)', border: '1px solid var(--b)' }}>
        <Label className="text-xs font-bold tracking-wide uppercase text-[var(--t4)]">Evacuation route notes</Label>
        <Textarea placeholder="Preferred routes, alternate routes, what to do if I-95 is closed…" rows={3} value={data.evacuation_routes || ''} onChange={e => update({ evacuation_routes: e.target.value })} />
      </div>

      <Button className="gold-button w-full" onClick={save} disabled={saving} data-testid="rdv-save">
        <Save className="w-4 h-4 mr-1" /> {saving ? 'Saving…' : 'Save meetup points'}
      </Button>
    </div>
  );
}

// ─── OUT-OF-AREA RELAY CONTACT ─────────────────────────────────
export function OutOfAreaPanel({ estateId, onDirty }) {
  const [data, setData] = useState({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!estateId) return;
    axios.get(`${API_URL}/ccp/out-of-area/${estateId}`, auth())
      .then(r => setData(r.data || {}))
      .catch(() => {});
  }, [estateId]);

  const update = (patch) => setData(d => ({ ...d, ...patch }));

  const save = async () => {
    setSaving(true);
    try {
      await axios.put(`${API_URL}/ccp/out-of-area/${estateId}`, data, auth());
      toast.success('Out-of-area contact saved');
      onDirty?.();
    } catch (e) {
      toast.error('Failed to save');
    } finally { setSaving(false); }
  };

  return (
    <div className="space-y-4" data-testid="out-of-area-panel">
      <div className="rounded-2xl p-4" style={{ background: 'rgba(59,123,247,0.06)', border: '1px solid rgba(59,123,247,0.2)' }}>
        <p className="text-sm leading-relaxed text-[var(--t3)]">
          <strong className="text-[var(--t)]">Why this matters:</strong> in a regional disaster, local phone lines and cell towers fail before long-distance ones. One out-of-state relay contact who everyone can call gives your family a single rendezvous point of information — FEMA's #1 communication recommendation.
        </p>
      </div>

      <div className="space-y-3 rounded-2xl p-4" style={{ background: 'var(--bg2)', border: '1px solid var(--b)' }}>
        <Input placeholder="Full name *" value={data.name || ''} onChange={e => update({ name: e.target.value })} data-testid="ooa-name" />
        <div className="grid grid-cols-2 gap-2">
          <Input placeholder="Relationship" value={data.relationship || ''} onChange={e => update({ relationship: e.target.value })} />
          <Input placeholder="Phone" value={data.phone || ''} onChange={e => update({ phone: e.target.value })} />
        </div>
        <Input placeholder="Email" type="email" value={data.email || ''} onChange={e => update({ email: e.target.value })} />
        <div className="grid grid-cols-2 gap-2">
          <Input placeholder="City" value={data.city || ''} onChange={e => update({ city: e.target.value })} />
          <Input placeholder="State" value={data.state || ''} onChange={e => update({ state: e.target.value })} />
        </div>
        <Textarea placeholder="Notes (work hours, alternate numbers, who else to try…)" rows={2} value={data.notes || ''} onChange={e => update({ notes: e.target.value })} />
      </div>

      <Button className="gold-button w-full" onClick={save} disabled={saving} data-testid="ooa-save">
        <Save className="w-4 h-4 mr-1" /> {saving ? 'Saving…' : 'Save relay contact'}
      </Button>
    </div>
  );
}

// ─── FAMILY DRILL — practice broadcast via email ──────────────
export function DrillPanel({ estateId, plans, onDone }) {
  const [planId, setPlanId] = useState(plans?.[0]?.id || '');
  const [emails, setEmails] = useState('');
  const [note, setNote] = useState('');
  const [sending, setSending] = useState(false);
  const [history, setHistory] = useState([]);

  useEffect(() => {
    if (!estateId) return;
    axios.get(`${API_URL}/ccp/drill/history/${estateId}`, auth())
      .then(r => setHistory(r.data || []))
      .catch(() => {});
  }, [estateId]);

  const send = async () => {
    const list = emails.split(/[\s,;]+/).map(s => s.trim()).filter(Boolean);
    if (list.length === 0) { toast.error('Add at least one email'); return; }
    setSending(true);
    try {
      const plan = plans?.find(p => p.id === planId);
      const res = await axios.post(`${API_URL}/ccp/drill/run`, {
        estate_id: estateId,
        plan_id: planId || null,
        plan_name: plan?.name || 'Your CarryOn plan',
        recipient_emails: list,
        custom_note: note || null,
      }, auth());
      const sent = res.data.results.filter(r => r.sent).length;
      toast.success(`Drill sent to ${sent}/${list.length} recipients`);
      setEmails(''); setNote('');
      // refresh history
      const h = await axios.get(`${API_URL}/ccp/drill/history/${estateId}`, auth());
      setHistory(h.data || []);
      onDone?.();
    } catch (e) {
      toast.error('Failed to run drill');
    } finally { setSending(false); }
  };

  return (
    <div className="space-y-4" data-testid="drill-panel">
      <p className="text-sm text-[var(--t4)] leading-relaxed">
        Send a no-stakes practice email to every household member. They reply confirming they remember the meetup point and out-of-area contact. Running a drill within 12 months earns 10 readiness points.
      </p>

      <div className="space-y-3 rounded-2xl p-4" style={{ background: 'var(--bg2)', border: '1px solid var(--b)' }}>
        {plans?.length > 0 && (
          <div>
            <Label className="text-xs font-bold text-[var(--t4)]">Which plan are we drilling?</Label>
            <select
              value={planId} onChange={e => setPlanId(e.target.value)}
              className="w-full mt-1 rounded-md px-3 py-2 text-sm"
              style={{ background: 'var(--bg)', border: '1px solid var(--b)', color: 'var(--t)' }}
              data-testid="drill-plan-select"
            >
              {plans.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
        )}
        <div>
          <Label className="text-xs font-bold text-[var(--t4)]">Recipient emails (comma or newline separated)</Label>
          <Textarea
            placeholder="spouse@example.com, dad@example.com, sister@example.com"
            rows={3} value={emails} onChange={e => setEmails(e.target.value)}
            data-testid="drill-emails"
          />
        </div>
        <div>
          <Label className="text-xs font-bold text-[var(--t4)]">Optional personal note</Label>
          <Textarea placeholder="Hey everyone — quick test, please reply!" rows={2} value={note} onChange={e => setNote(e.target.value)} />
        </div>
        <Button className="gold-button w-full" onClick={send} disabled={sending} data-testid="drill-send">
          <Mail className="w-4 h-4 mr-1" /> {sending ? 'Sending drill…' : 'Send drill email'}
        </Button>
      </div>

      {history.length > 0 && (
        <div className="space-y-2">
          <div className="text-xs font-bold tracking-wide uppercase text-[var(--t4)]">Recent drills</div>
          {history.slice(0, 5).map(h => (
            <div key={h.id} className="rounded-xl p-3 text-xs flex items-center justify-between" style={{ background: 'var(--s)', border: '1px solid var(--b)' }}>
              <div>
                <div className="font-bold text-[var(--t)]">{h.plan_name}</div>
                <div className="text-[var(--t4)]">{new Date(h.started_at).toLocaleString()}</div>
              </div>
              <div className="text-[var(--t3)]">
                {h.recipients.filter(r => r.sent).length}/{h.recipients.length} sent
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── PLAN ACTIVATION — real broadcast ──────────────────────────
export function ActivationPanel({ estateId, plans, rendezvous, onDone }) {
  const [planId, setPlanId] = useState(plans?.[0]?.id || '');
  const [emails, setEmails] = useState('');
  const [rdvLabel, setRdvLabel] = useState(rendezvous?.primary_label || '');
  const [rdvAddr, setRdvAddr] = useState(rendezvous?.primary_address || '');
  const [instructions, setInstructions] = useState('');
  const [activating, setActivating] = useState(false);
  const [recent, setRecent] = useState(null);

  useEffect(() => {
    if (!estateId) return;
    axios.get(`${API_URL}/ccp/activations/${estateId}`, auth())
      .then(r => setRecent((r.data || []).find(a => !a.ended_at) || null))
      .catch(() => {});
  }, [estateId]);

  const start = async () => {
    const list = emails.split(/[\s,;]+/).map(s => s.trim()).filter(Boolean);
    if (list.length === 0) { toast.error('Add at least one recipient'); return; }
    const plan = plans?.find(p => p.id === planId);
    if (!plan) { toast.error('Pick a plan'); return; }
    if (!window.confirm('This sends a REAL activation email — not a drill. Proceed?')) return;
    setActivating(true);
    try {
      const res = await axios.post(`${API_URL}/ccp/activation/start`, {
        estate_id: estateId,
        plan_id: planId,
        plan_name: plan.name,
        rendezvous_label: rdvLabel,
        rendezvous_address: rdvAddr,
        custom_instructions: instructions,
        recipient_emails: list,
      }, auth());
      const sent = res.data.results.filter(r => r.sent).length;
      toast.success(`Activation sent to ${sent}/${list.length} — track status below`);
      const r = await axios.get(`${API_URL}/ccp/activations/${estateId}`, auth());
      setRecent((r.data || []).find(a => !a.ended_at) || null);
      onDone?.();
    } catch (e) {
      toast.error('Failed to activate');
    } finally { setActivating(false); }
  };

  const endActivation = async () => {
    if (!recent) return;
    if (!window.confirm('End this activation? Recipients will be marked accounted for.')) return;
    try {
      await axios.post(`${API_URL}/ccp/activation/end/${recent.id}`, {}, auth());
      toast.success('Activation closed');
      setRecent(null);
      onDone?.();
    } catch (e) { toast.error('Failed to close'); }
  };

  return (
    <div className="space-y-4" data-testid="activation-panel">
      <div className="rounded-2xl p-4" style={{ background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.25)' }}>
        <div className="flex items-center gap-2 mb-2">
          <AlertTriangle className="w-4 h-4" style={{ color: '#EF4444' }} />
          <span className="text-sm font-bold" style={{ color: '#EF4444' }}>Real activation — NOT a drill</span>
        </div>
        <p className="text-xs text-[var(--t3)] leading-relaxed">
          Use this when a real emergency is underway. Every recipient gets an email titled "ACTIVATION" with a status-reply link. For practice, use the Drill panel instead.
        </p>
      </div>

      {recent ? (
        <div className="space-y-3 rounded-2xl p-4" style={{ background: 'var(--bg2)', border: '1px solid #EF444455' }}>
          <div className="text-xs font-bold tracking-wide uppercase" style={{ color: '#EF4444' }}>Active right now</div>
          <div className="text-base font-bold text-[var(--t)]">{recent.plan_name}</div>
          <div className="text-xs text-[var(--t4)]">Started {new Date(recent.started_at).toLocaleString()}</div>
          <div className="text-sm text-[var(--t3)]">
            {(recent.status_responses || []).length} of {(recent.recipients || []).length} family members confirmed status
          </div>
          <Button variant="outline" className="outline-pill-button w-full" onClick={endActivation} data-testid="activation-end">
            Mark everyone accounted for — end activation
          </Button>
        </div>
      ) : (
        <div className="space-y-3 rounded-2xl p-4" style={{ background: 'var(--bg2)', border: '1px solid var(--b)' }}>
          {plans?.length > 0 && (
            <div>
              <Label className="text-xs font-bold text-[var(--t4)]">Which plan?</Label>
              <select value={planId} onChange={e => setPlanId(e.target.value)}
                className="w-full mt-1 rounded-md px-3 py-2 text-sm"
                style={{ background: 'var(--bg)', border: '1px solid var(--b)', color: 'var(--t)' }}
                data-testid="activation-plan-select">
                {plans.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
          )}
          <div>
            <Label className="text-xs font-bold text-[var(--t4)]">Recipient emails</Label>
            <Textarea placeholder="spouse@example.com, dad@example.com" rows={2} value={emails} onChange={e => setEmails(e.target.value)} data-testid="activation-emails" />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Input placeholder="Meetup label" value={rdvLabel} onChange={e => setRdvLabel(e.target.value)} />
            <Input placeholder="Meetup address" value={rdvAddr} onChange={e => setRdvAddr(e.target.value)} />
          </div>
          <Textarea placeholder="Specific instructions for this event (optional)" rows={2} value={instructions} onChange={e => setInstructions(e.target.value)} />
          <Button className="gold-button w-full" onClick={start} disabled={activating} data-testid="activation-send">
            <Mail className="w-4 h-4 mr-1" /> {activating ? 'Activating…' : 'Activate plan now'}
          </Button>
        </div>
      )}
    </div>
  );
}
