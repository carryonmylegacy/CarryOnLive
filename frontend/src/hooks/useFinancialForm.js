/**
 * useFinancialForm — shared hook for the 4 CFP form components
 * (BillForm / DebtForm / AccountForm / PropertyAssetForm).
 *
 * Consolidates:
 *   • form state + `update(key, val)` setter
 *   • debounced AI smart-categorize call with per-entity field mappings
 *   • `handleSubmit` flow (validate → build payload → mutateWithOutbox → toast)
 *   • custom-category creation flow
 *
 * Each form passes a config:
 *   {
 *     entityType:  'financial_bill' | 'financial_debt' | 'financial_account' | 'financial_property',
 *     module:      'bills' | 'debts' | 'accounts' | 'property',  // smart-categorize module
 *     urlBase:     '/financial/bills'  // POST path; PUT path = `${urlBase}/${id}`
 *     entityLabel: 'Bill' | 'Debt' | 'Account' | 'Asset',  // for toast copy
 *     initialValue: existingDoc | null,
 *     buildDefaults: () => ({ ... defaults for new entity }),
 *     buildPayload: (form, parsers) => ({ ... }),  // build the API payload
 *     validate: (form, parsers) => string[]  // returns list of missing/invalid field labels
 *     applyAiSuggestion: (s, form, update) => void  // called once per AI response
 *   }
 *
 * Returns the wired-up hook surface used by each form's JSX.
 */
import { useCallback, useRef, useState } from 'react';
import axios from 'axios';
import { API_URL } from '../config';
import { toast } from '../utils/toast';
import { parseMoney, parseInteger, formatPydanticError } from '../utils/financialFormHelpers';

const PARSERS = { parseMoney, parseInteger };

export const useFinancialForm = ({
  entityType,
  module,
  urlBase,
  entityLabel,
  existing,
  estateId,
  buildDefaults,
  buildPayload,
  validate,
  applyAiSuggestion,
  migrateExisting, // optional: post-merge transform for legacy fields
  getAuthHeaders,
  onSaved,
  onAddCategory,
  smartCategorizeCacheKey = 'cfp:smartcat',
}) => {
  const isEdit = !!existing;
  const [saving, setSaving] = useState(false);
  const [showNewCat, setShowNewCat] = useState(false);
  const [newCatName, setNewCatName] = useState('');
  const [form, setForm] = useState(() => {
    const merged = { ...buildDefaults(), ...(existing || {}) };
    return migrateExisting ? migrateExisting(merged) : merged;
  });
  const update = useCallback((key, val) => setForm((prev) => ({ ...prev, [key]: val })), []);

  const [smartLoading, setSmartLoading] = useState(false);
  const smartTimerRef = useRef(null);

  const smartCategorize = useCallback((name) => {
    if (!name || name.length < 3 || isEdit) return;
    clearTimeout(smartTimerRef.current);
    smartTimerRef.current = setTimeout(async () => {
      // sessionStorage LRU cache: avoid re-firing the LLM for the same
      // entity name during the same session (e.g. user edits & retypes).
      const cacheKey = `${smartCategorizeCacheKey}:${module}:${name.trim().toLowerCase()}`;
      let cached = null;
      try {
        const raw = sessionStorage.getItem(cacheKey);
        if (raw) cached = JSON.parse(raw);
      } catch { /* sessionStorage blocked */ }
      let s = cached;
      if (!s) {
        setSmartLoading(true);
        try {
          const res = await axios.post(
            `${API_URL}/financial/smart-categorize`,
            { bill_name: name, module },
            getAuthHeaders(),
          );
          s = res.data;
          try { sessionStorage.setItem(cacheKey, JSON.stringify(s)); } catch { /* quota */ }
        } catch { /* silent — never block typing */ }
        setSmartLoading(false);
      }
      if (s) {
        applyAiSuggestion(s, form, update);
        if (!cached) toast.success('AI auto-filled details');
      }
    }, 800);
  }, [isEdit, module, getAuthHeaders, applyAiSuggestion, form, update, smartCategorizeCacheKey]);

  const handleSubmit = async () => {
    const errs = validate(form, PARSERS);
    if (errs.length) {
      toast.error(`Please fill in: ${errs.join(', ')}`);
      return;
    }
    setSaving(true);
    try {
      const payload = { ...buildPayload(form, PARSERS), estate_id: estateId };
      const { mutateWithOutbox } = await import('../utils/offlineMutation');
      const r = await mutateWithOutbox({
        entity_type: entityType,
        entity_id: isEdit ? existing.id : `local-${entityType}-${Date.now()}`,
        method: isEdit ? 'PUT' : 'POST',
        url: isEdit ? `${urlBase}/${existing.id}` : urlBase,
        body: payload,
        authHeaders: getAuthHeaders(),
      });
      if (!r.ok) throw r.error || new Error('Save failed');
      if (r.queued) {
        toast.success(`${entityLabel} ${isEdit ? 'change' : 'saved'} offline — will sync when you reconnect.`);
      }
      onSaved();
    } catch (err) {
      toast.error(formatPydanticError(err, `Failed to save ${entityLabel.toLowerCase()}`));
    }
    setSaving(false);
  };

  const handleAddCategory = async () => {
    if (!newCatName.trim()) return;
    const success = await onAddCategory(newCatName.trim());
    if (success) {
      update('category', newCatName.trim());
      setNewCatName('');
      setShowNewCat(false);
    }
  };

  return {
    form,
    update,
    saving,
    smartLoading,
    smartCategorize,
    handleSubmit,
    showNewCat,
    setShowNewCat,
    newCatName,
    setNewCatName,
    handleAddCategory,
    isEdit,
  };
};
