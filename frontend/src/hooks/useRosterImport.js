/**
 * useRosterImport — state machine for the spreadsheet → plan → commit flow.
 * `api` = { analyze, remap, commit, imports } absolute URLs; `headers` = fn → auth headers.
 */

import { useCallback, useEffect, useState } from 'react';
import apiClient from '../utils/apiClient';
import { toast } from '../utils/toast';

export const useRosterImport = ({ api, headers, onImported }) => {
  const [plan, setPlan] = useState(null);
  const [result, setResult] = useState(null);
  const [history, setHistory] = useState([]);
  const [busy, setBusy] = useState(null);
  const [sendInvites, setSendInvites] = useState(false);

  const loadHistory = useCallback(async () => {
    try {
      const { data } = await apiClient.get(api.imports, { headers: headers() });
      setHistory(data.imports || []);
    } catch { /* history is optional */ }
  }, [api.imports]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { loadHistory(); }, [loadHistory]);

  const analyze = async (file) => {
    if (!file) return;
    setBusy('analyze');
    setResult(null);
    try {
      const form = new FormData();
      form.append('file', file);
      const { data } = await apiClient.post(api.analyze, form, { headers: { ...headers(), 'Content-Type': 'multipart/form-data' } });
      setPlan(data);
      if (!data.mapping_complete) toast.info('We need a little help matching the columns — pick them below.');
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Could not read that file');
    } finally {
      setBusy(null);
    }
  };

  const remap = async (mapping) => {
    if (!plan) return;
    setBusy('remap');
    try {
      const { data } = await apiClient.post(api.remap, { upload_id: plan.upload_id, mapping }, { headers: { ...headers(), 'Content-Type': 'application/json' } });
      setPlan(data);
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Could not apply that mapping');
    } finally {
      setBusy(null);
    }
  };

  const commit = async () => {
    if (!plan) return;
    setBusy('commit');
    try {
      const { data } = await apiClient.post(api.commit, { upload_id: plan.upload_id, send_invites: sendInvites }, { headers: { ...headers(), 'Content-Type': 'application/json' } });
      setResult(data);
      setPlan(null);
      toast.success(`${data.summary.added} client${data.summary.added === 1 ? '' : 's'} added${data.summary.renamed ? `, ${data.summary.renamed} renamed` : ''}`);
      loadHistory();
      onImported?.(data);
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Import failed');
    } finally {
      setBusy(null);
    }
  };

  const reset = () => { setPlan(null); setResult(null); };

  return { plan, result, history, busy, sendInvites, setSendInvites, analyze, remap, commit, reset };
};
