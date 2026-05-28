/**
 * persistEntityCredentials — given the credential rows produced by
 * EntityCredentialsField, sync them with the digital_wallet (DAV) API:
 *   - rows with `_link_to_id`        → PATCH /api/digital-wallet/:id
 *                                       to set linked_entity_id (no
 *                                       new DAV row is created — the
 *                                       user opted to link this entity
 *                                       to an existing DAV entry whose
 *                                       login matched).
 *   - rows with `_new: true`         → POST  /api/digital-wallet
 *   - rows with `id` and `_dirty`    → PUT   /api/digital-wallet/:id
 *   - rows with `id` and `_delete`   → DELETE/api/digital-wallet/:id
 *
 * Empty/blank rows are skipped silently. Errors are surfaced via the
 * caller's toast — this helper just returns a summary so the caller
 * knows whether to refresh.
 */
import apiClient from '../../../utils/apiClient';
import { API_URL } from '../../../config';

const isBlank = (c) =>
  !((c.account_name || '').trim()) &&
  !((c.login_username || '').trim()) &&
  !((c.password || '').trim()) &&
  !((c.additional_access || '').trim()) &&
  !((c.notes || '').trim());

export async function persistEntityCredentials({
  credentials,
  entityId,
  authHeaders,
}) {
  if (!entityId || !Array.isArray(credentials)) return { created: 0, updated: 0, deleted: 0, linked: 0 };

  let created = 0;
  let updated = 0;
  let deleted = 0;
  let linked = 0;

  for (const c of credentials) {
    try {
      // Delete persisted row that the user removed in the form
      if (c._delete && c.id) {
        await apiClient.delete(`${API_URL}/digital-wallet/${c.id}`, authHeaders);
        deleted += 1;
        continue;
      }
      // Link-to-existing: user accepted the duplicate-hint and chose
      // to attach this entity to an existing DAV entry. PATCH the
      // existing row's linked_entity_id; no new DAV record created.
      if (c._link_to_id) {
        await apiClient.put(`${API_URL}/digital-wallet/${c._link_to_id}`, {
          linked_entity_id: entityId,
        }, authHeaders);
        linked += 1;
        continue;
      }
      // Skip newly-added rows that were left completely blank
      if (c._new && isBlank(c)) continue;

      const payload = {
        account_name: (c.account_name || '').trim() || 'Untitled credential',
        login_username: (c.login_username || '').trim(),
        password: c.password || null,
        additional_access: c.additional_access || null,
        notes: c.notes || null,
        category: 'other',
        linked_entity_id: entityId,
        beneficiary_visibility: c.beneficiary_visibility || 'private',
      };

      if (c._new) {
        await apiClient.post(`${API_URL}/digital-wallet`, payload, authHeaders);
        created += 1;
      } else if (c._dirty && c.id) {
        await apiClient.put(`${API_URL}/digital-wallet/${c.id}`, payload, authHeaders);
        updated += 1;
      }
    } catch {
      // Continue on individual failures; caller will show a single toast.
    }
  }

  return { created, updated, deleted, linked };
}
