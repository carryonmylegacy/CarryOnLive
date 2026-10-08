import React from 'react';
import apiClient from '../../../utils/apiClient';
import { API_URL } from '../../../config';
import { AIBuilderShell } from '../../ai/AIBuilderShell';
import { CFPAIReview } from './CFPAIReview';
import { applyCfpDraft } from './cfpAIApply';

const EXAMPLE = 'e.g. "Our mortgage is with Truist, about $2,400 on the 1st, auto-pay, around $310,000 left at 6.25%. Power is Dominion, about $180 on the 15th. '
  + 'Chase checking has about $12,000, joint with Karen. My Fidelity 401k is around $400,000. We own the house on Oak Street, worth about $450,000, and a 2019 Highlander."';
const KEYTERMS = ['mortgage', 'HELOC', '401k', 'IRA', 'Roth', 'HOA', 'auto-pay', 'annuity', 'brokerage', 'checking', 'savings', 'VIN'];

const toMap = (cats, labels) => Object.fromEntries(cats.map((c) => [c, labels[c] || c]));

// "Describe your finances" — speak or type → review → rows created through the ordinary bill/debt/account/property endpoints.
export const CFPAIBuilder = ({ estateId, hasItems, billCats, billLabels, debtCats, debtLabels, acctCats, acctLabels, getAuthHeaders, onBuilt }) => {
  const catalog = { bill_categories: toMap(billCats, billLabels), debt_categories: toMap(debtCats, debtLabels), account_categories: toMap(acctCats, acctLabels) };
  return (
    <AIBuilderShell
      id="cfp-ai-builder"
      title="Describe your finances"
      intro="Tap the mic (or type) and walk through the bills you pay, what you owe, where your money sits and what you own. I’ll sort it into bills, debts, accounts and property — you review every line before anything is saved, and every tile stays editable."
      example={EXAMPLE}
      keyterms={KEYTERMS}
      draftLabel="Draft my picture"
      buildLabel="Add to my picture"
      collapsible={hasItems}
      collapsedLabel="Describe your finances — speak or type, and I’ll draft the bills, debts, accounts and property"
      draft={async (text) => {
        const r = await apiClient.post(`${API_URL}/financial/cfp/${estateId}/ai-draft`, { description: text, catalog }, getAuthHeaders());
        return r.data.draft;
      }}
      renderReview={(draft, setDraft) => <CFPAIReview draft={draft} onChange={setDraft} catalog={catalog} />}
      validate={(d) => ['bills', 'debts', 'accounts', 'property'].some((k) => d[k].some((x) => !x.existing_id && !x.name.trim())) ? 'Every line needs a name before adding it.' : null}
      canBuild={(d) => ['bills', 'debts', 'accounts', 'property'].some((k) => d[k].some((x) => !x.existing_id))}
      build={async (draft) => {
        const res = await applyCfpDraft({ draft, estateId, authHeaders: getAuthHeaders() });
        onBuilt?.(res);
        return { made: res.made, failures: res.failures, message: `Added ${res.made} to your Financial Picture. Tap any tile to fine-tune it.` };
      }}
    />
  );
};

export default CFPAIBuilder;
