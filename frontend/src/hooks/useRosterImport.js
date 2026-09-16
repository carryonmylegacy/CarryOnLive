/**
 * useRosterImport — state machine for the spreadsheet → plan → commit flow.
 * Commit starts a background job; we poll it for live progress.
 * `api` = { analyze, remap, commit, imports } absolute URLs; `headers` = fn → auth headers.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import apiClient from '../utils/apiClient';
import { toast } from '../utils/toast';

const POLL_MS = 1200;
const STALL_MS = 90_000;

export const useRosterImport = ({ api, headers, onImported }) => {
  const [plan, setPlan] = useState(null);
  const [job, setJob] = useState(null);
  const [history, setHistory] = useState([]);
  const [busy, setBusy] = useState(null);
  const [sendInvites, setSendInvites] = useState(false);
  const pollRef = useRef(null);
  const importedRef = useRef(false);

  const loadHistory = useCallback(async () => {
    try {
      const { data } = await apiClient.get(api.imports, { headers: headers() });
      setHistory(data.imports || []);
    } catch { /* history is optional */ }
  }, [api.imports]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { loadHistory(); }, [loadHistory]);
  useEffect(() => () => clearTimeout(pollRef.current), []);

  const analyze = async (file) => {
    if (!file) return;
    setBusy('analyze');
    setJob(null);
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

  const poll = useCallback(async (importId) => {
    try {
      const { data } = await apiClient.get(`${api.imports}/${importId}`, { headers: headers() });
      const stalled = data.status === 'running' && Date.now() - new Date(data.updated_at).getTime() > STALL_MS;
      setJob({ ...data, stalled });
      if (data.status === 'done' && !importedRef.current) {
        importedRef.current = true;
        toast.success(`${data.summary.added} client${data.summary.added === 1 ? '' : 's'} added${data.summary.renamed ? `, ${data.summary.renamed} renamed` : ''}`);
        loadHistory();
        onImported?.(data);
      }
      const invitesPending = data.status === 'done' && data.invites_status === 'sending';
      if (data.status === 'running' || invitesPending) {
        pollRef.current = setTimeout(() => poll(importId), POLL_MS);
      } else if (data.status === 'failed') {
        toast.error(data.error || 'Import failed');
      }
    } catch {
      pollRef.current = setTimeout(() => poll(importId), POLL_MS * 2);
    }
  }, [api.imports, loadHistory, onImported]); // eslint-disable-line react-hooks/exhaustive-deps

  const commit = async () => {
    if (!plan) return;
    setBusy('commit');
    importedRef.current = false;
    try {
      const { data } = await apiClient.post(api.commit, { upload_id: plan.upload_id, send_invites: sendInvites }, { headers: { ...headers(), 'Content-Type': 'application/json' } });
      setPlan(null);
      setJob({ id: data.import_id, status: 'running', progress: { total: data.total, done: 0, added: 0, renamed: 0, failed: 0 }, updated_at: new Date().toISOString() });
      poll(data.import_id);
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Import failed');
    } finally {
      setBusy(null);
    }
  };

  const reset = () => { clearTimeout(pollRef.current); setPlan(null); setJob(null); };

  return { plan, job, history, busy, sendInvites, setSendInvites, analyze, remap, commit, reset };
};
