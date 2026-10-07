import apiClient from '../../../utils/apiClient';
import { API_URL } from '../../../config';
import { TYPES, ROLE_OPTIONS, isEquityRole } from '../../../config/entityCatalog';

// The catalog the forms allow — sent with every draft request so the AI can only pick from it.
export const catalogPayload = () => ({
  types: Object.fromEntries(Object.entries(TYPES).map(([cat, arr]) => [cat, arr.map((t) => ({ id: t.id, label: t.legal }))])),
  roles: ROLE_OPTIONS.map((r) => ({ id: r.id, label: r.label, categories: r.categories || [] })),
});

const settle = (promises) => Promise.all(promises.map((p) => p.then((v) => ({ ok: true, v })).catch((e) => ({ ok: false, e }))));

// Creates the reviewed draft through the SAME endpoints the wizard uses:
// outside people → entities → connections. Returns counts + failures.
export async function applyEntityDraft({ draft, estateId, authHeaders }) {
  const personIds = {}; // ref → { type, id }
  const entityIds = {}; // ref → id
  const failures = [];

  draft.people.forEach((p) => { if (p.match) personIds[p.ref] = { type: p.match.kind, id: p.match.id }; });
  const newPeople = draft.people.filter((p) => !p.match);
  const peopleRes = await settle(newPeople.map((p) => apiClient.post(`${API_URL}/financial/external-people`, {
    estate_id: estateId, first_name: p.first_name.trim(), last_name: p.last_name?.trim() || null,
    notes: p.relation_hint ? `Added from your description (${p.relation_hint}).` : 'Added from your description.',
  }, authHeaders)));
  peopleRes.forEach((r, i) => {
    if (r.ok) personIds[newPeople[i].ref] = { type: 'external_person', id: r.v.data.id };
    else failures.push(`Person "${newPeople[i].first_name}"`);
  });

  draft.entities.forEach((e) => { if (e.existing_id) entityIds[e.ref] = e.existing_id; });
  const newEntities = draft.entities.filter((e) => !e.existing_id);
  const entityRes = await settle(newEntities.map((e) => apiClient.post(`${API_URL}/financial/entities`, {
    estate_id: estateId, category: e.category, type: e.type, name: e.name.trim(),
    formation_state: e.formation_state || null, notes: e.notes || null, document_ids: [],
  }, authHeaders)));
  entityRes.forEach((r, i) => {
    if (r.ok) entityIds[newEntities[i].ref] = r.v.data.id;
    else failures.push(`Entity "${newEntities[i].name}"`);
  });

  const conns = draft.connections.filter((c) => entityIds[c.target_ref] && (personIds[c.source_ref] || entityIds[c.source_ref]));
  const connRes = await settle(conns.map((c) => {
    const src = personIds[c.source_ref] || { type: 'entity', id: entityIds[c.source_ref] };
    return apiClient.post(`${API_URL}/financial/entity-relationships`, {
      estate_id: estateId, source_id: src.id, source_type: src.type, target_id: entityIds[c.target_ref], target_type: 'entity',
      role: c.role, ownership_pct: isEquityRole(c.role) && c.ownership_pct != null && c.ownership_pct !== '' ? Number(c.ownership_pct) : null,
      notes: c.notes || null,
    }, authHeaders);
  }));
  connRes.forEach((r) => { if (!r.ok) failures.push('A connection'); });

  return {
    people: peopleRes.filter((r) => r.ok).length,
    entities: entityRes.filter((r) => r.ok).length,
    connections: connRes.filter((r) => r.ok).length,
    failures,
  };
}
