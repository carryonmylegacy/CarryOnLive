import React from 'react';
import apiClient from '../../../utils/apiClient';
import { API_URL } from '../../../config';
import { AIBuilderShell } from '../../ai/AIBuilderShell';
import { EntityAIReview } from './EntityAIReview';
import { applyEntityDraft, catalogPayload } from './entityAIApply';

const EXAMPLE = 'e.g. "I own Harris Holdings LLC in Virginia — my wife Karen and I each hold 50%. The LLC owns our rental house on Oak Street. '
  + 'Our revocable living trust is the Harris Family Trust; I’m trustee, Karen is successor trustee, and our kids Sarah and Mark are the beneficiaries."';
const KEYTERMS = ['LLC', 'revocable living trust', 'irrevocable trust', 'successor trustee', 'grantor', 'S corporation', 'limited partnership', 'Series LLC', 'land trust'];

// "Describe your structure" — speak or type, review what the AI heard, then build through the existing forms.
export const EntityAIBuilder = ({ estateId, user, beneficiaries = [], externals = [], hasChart = false, getAuthHeaders, onBuilt, onToggle }) => (
  <AIBuilderShell
    id="es-ai-builder"
    title="Describe your structure"
    intro="Tap the mic (or type) and talk through your entities, who owns what, and who the beneficiaries are. I’ll fill in the forms — you review before anything is added, and every tile stays editable."
    example={EXAMPLE}
    keyterms={KEYTERMS}
    draftLabel="Draft my chart"
    buildLabel="Build my chart"
    collapsible={hasChart}
    collapsedLabel="Describe your structure — speak or type, and I’ll draft the chart"
    onToggle={onToggle}
    draft={async (text) => {
      const r = await apiClient.post(`${API_URL}/financial/entities/${estateId}/ai-draft`, { description: text, catalog: catalogPayload() }, getAuthHeaders());
      return r.data.draft;
    }}
    renderReview={(draft, setDraft) => <EntityAIReview draft={draft} onChange={setDraft} user={user} beneficiaries={beneficiaries} externals={externals} />}
    validate={(draft) => (draft.entities.find((e) => !e.existing_id && !e.name.trim()) || draft.people.find((p) => !p.match && !p.first_name.trim())) ? 'Every entity and person needs a name before building.' : null}
    canBuild={(draft) => draft.entities.length > 0 || draft.connections.length > 0}
    build={async (draft) => {
      const res = await applyEntityDraft({ draft, estateId, authHeaders: getAuthHeaders() });
      const made = [res.entities && `${res.entities} entit${res.entities === 1 ? 'y' : 'ies'}`, res.updated && `${res.updated} updated entit${res.updated === 1 ? 'y' : 'ies'}`, res.people && `${res.people} ${res.people === 1 ? 'person' : 'people'}`, res.connections && `${res.connections} connection${res.connections === 1 ? '' : 's'}`].filter(Boolean).join(', ');
      onBuilt?.(res);
      return { made, failures: res.failures, message: `Applied ${made || 'your changes'} to your chart. Tap any tile to fine-tune it.` };
    }}
  />
);

export default EntityAIBuilder;
