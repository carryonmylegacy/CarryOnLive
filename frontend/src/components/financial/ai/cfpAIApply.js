import apiClient from '../../../utils/apiClient';
import { API_URL } from '../../../config';

const ENDPOINTS = { bills: 'bills', debts: 'debts', accounts: 'accounts', property: 'property' };
const LABEL = { bills: 'bill', debts: 'debt', accounts: 'account', property: 'property item' };

const strip = (row) => {
  const { existing_id: _e, ...rest } = row;
  return Object.fromEntries(Object.entries(rest).filter(([, v]) => v !== null && v !== '' && v !== undefined));
};

// Creates every approved row through the SAME endpoints the forms use — no bulk shortcut, so each tile is editable.
export async function applyCfpDraft({ draft, estateId, authHeaders }) {
  const counts = { bills: 0, debts: 0, accounts: 0, property: 0 };
  const failures = [];
  for (const bucket of Object.keys(ENDPOINTS)) {
    for (const row of draft[bucket] || []) {
      if (row.existing_id) continue;
      try {
        await apiClient.post(`${API_URL}/financial/${ENDPOINTS[bucket]}`, { estate_id: estateId, ...strip(row) }, authHeaders);
        counts[bucket] += 1;
      } catch (err) {
        failures.push(`${row.name} (${LABEL[bucket]}: ${err.response?.data?.detail || 'save failed'})`);
      }
    }
  }
  const made = [counts.bills && `${counts.bills} bill${counts.bills === 1 ? '' : 's'}`, counts.debts && `${counts.debts} debt${counts.debts === 1 ? '' : 's'}`,
    counts.accounts && `${counts.accounts} account${counts.accounts === 1 ? '' : 's'}`, counts.property && `${counts.property} property item${counts.property === 1 ? '' : 's'}`].filter(Boolean).join(', ');
  return { ...counts, made, failures };
}
