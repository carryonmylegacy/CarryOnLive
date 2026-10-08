import apiClient from '../../../utils/apiClient';
import { API_URL } from '../../../config';
import { isNew, isUpdate } from '../../ai/reviewPrimitives';

const ENDPOINTS = { bills: 'bills', debts: 'debts', accounts: 'accounts', property: 'property' };
const LABEL = { bills: ['bill', 'bills'], debts: ['debt', 'debts'], accounts: ['account', 'accounts'], property: ['property item', 'property items'] };

const strip = (row) => {
  const { existing_id: _e, changes: _c, ...rest } = row;
  return Object.fromEntries(Object.entries(rest).filter(([, v]) => v !== null && v !== '' && v !== undefined));
};

// Creates new rows and updates matched ones through the SAME endpoints the forms use — no bulk shortcut, so each tile is editable.
export async function applyCfpDraft({ draft, estateId, authHeaders }) {
  const made = { bills: 0, debts: 0, accounts: 0, property: 0 };
  const updated = { bills: 0, debts: 0, accounts: 0, property: 0 };
  const failures = [];
  for (const bucket of Object.keys(ENDPOINTS)) {
    for (const row of draft[bucket] || []) {
      try {
        if (isNew(row)) {
          await apiClient.post(`${API_URL}/financial/${ENDPOINTS[bucket]}`, { estate_id: estateId, ...strip(row) }, authHeaders);
          made[bucket] += 1;
        } else if (isUpdate(row)) {
          await apiClient.put(`${API_URL}/financial/${ENDPOINTS[bucket]}/${row.existing_id}`, strip(row), authHeaders);
          updated[bucket] += 1;
        }
      } catch (err) {
        failures.push(`${row.name} (${LABEL[bucket][0]}: ${err.response?.data?.detail || 'save failed'})`);
      }
    }
  }
  const words = (counts) => Object.keys(ENDPOINTS).filter((b) => counts[b]).map((b) => `${counts[b]} ${counts[b] === 1 ? LABEL[b][0] : LABEL[b][1]}`).join(', ');
  const addedText = words(made); const updatedText = words(updated);
  const madeLabel = [addedText && `added ${addedText}`, updatedText && `updated ${updatedText}`].filter(Boolean).join(' and ') || 'nothing';
  return { ...made, updated, made: madeLabel, failures };
}
