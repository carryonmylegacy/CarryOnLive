import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import axios from 'axios';
import { cachedGet, invalidateCache } from '../utils/apiCache';
import { useAuth } from '../contexts/AuthContext';
import { ReturnPopup } from '../components/GuidedActivation';
import {
  CheckSquare, Plus, Trash2, Edit2, Phone, Mail, MapPin, FileText,
  Briefcase, Users, Heart, Shield, Building, Stethoscope,
  Sparkles, Save, X, Printer,
  Check, XCircle, Loader2, HelpCircle, ChevronDown, ChevronRight, ArrowLeft
} from 'lucide-react';
import { toast } from '../utils/toast';
import { SectionLockBanner, SectionLockedOverlay } from '../components/security/SectionLock';
import { Skeleton } from '../components/ui/skeleton';
import { saveList, readList } from '../utils/localListCache';
// STATIC import — dynamic chunks fail when first edit/delete is offline.
import { enqueue as enqueueOutbox } from '../offline/outbox';
import AddressAutocomplete from '../components/AddressAutocomplete';
import { API_URL } from '../config';
import { openPdfPreview } from '../utils/openPdfPreview';
import CachedPdfIcon from '../components/CachedPdfIcon';
import SlidePanel from '../components/SlidePanel';

const CATEGORIES = [
  { value: 'legal', label: 'Legal', icon: FileText, color: '#3b82f6' },
  { value: 'financial', label: 'Financial', icon: Briefcase, color: '#8b5cf6' },
  { value: 'insurance', label: 'Insurance', icon: Shield, color: '#06b6d4' },
  { value: 'property', label: 'Property', icon: Building, color: '#f59e0b' },
  { value: 'medical', label: 'Medical', icon: Stethoscope, color: '#ef4444' },
  { value: 'personal', label: 'Personal', icon: Heart, color: '#ec4899' },
  { value: 'government', label: 'Government', icon: Users, color: '#14b8a6' },
  { value: 'general', label: 'General', icon: CheckSquare, color: '#6b7280' },
];

const PRIORITIES = [
  { value: 'critical', label: 'Critical - Do Immediately', color: '#ef4444' },
  { value: 'high', label: 'High - First Week', color: '#f97316' },
  { value: 'medium', label: 'Medium - First 2 Weeks', color: '#eab308' },
  { value: 'low', label: 'Low - First Month', color: '#22c55e' },
];

const ACTION_TYPES = [
  { value: 'call', label: 'Make a Phone Call', icon: Phone },
  { value: 'email', label: 'Send an Email', icon: Mail },
  { value: 'visit', label: 'Visit a Location', icon: MapPin },
  { value: 'file_paperwork', label: 'File Paperwork', icon: FileText },
  { value: 'notify', label: 'Notify Someone', icon: Users },
  { value: 'custom', label: 'Custom Action', icon: CheckSquare },
];

const DUE_TIMEFRAMES = [
  { value: 'immediate', label: 'Immediately' },
  { value: 'first_week', label: 'Within First Week' },
  { value: 'two_weeks', label: 'Within Two Weeks' },
  { value: 'first_month', label: 'Within First Month' },
  { value: 'no_rush', label: 'No Rush' },
];

const EMPTY_FORM = {
  title: '', description: '', category: 'general', priority: 'medium',
  action_type: 'custom', contact_name: '', contact_phone: '', contact_email: '',
  contact_address: '', notes: '', due_timeframe: 'first_week',
};

import { formatPhoneUS } from '../utils/phoneFormat';
import { useDraftState } from '../hooks/useDraftState';

const ChecklistPage = () => {
  const { getAuthHeaders } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const fromGettingStarted = location.state?.fromGettingStarted === true;
  const [showReturnPopup, setShowReturnPopup] = useState(false);
  const [checklists, setChecklists] = useState([]);
  const [estate, setEstate] = useState(null);
  const [loading, setLoading] = useState(true);
  // Draft persistence — keep the open form + filled fields across
  // navigation. Keyed per estate so multi-estate users don't bleed
  // drafts. Clear on save success and explicit cancel.
  //
  // Critical: read selected_estate_id SYNCHRONOUSLY from localStorage
  // at first render — the `estate` state hook is null until fetchData
  // resolves, so reading `estate?.id` here would leave the draft hook
  // seeded with defaults (no restore on remount). Same fix as
  // iter_114's FFN restore bug.
  const checklistEstateId = (typeof localStorage !== 'undefined' && localStorage.getItem('selected_estate_id')) || estate?.id || null;
  const draftBase = checklistEstateId ? `iac_form:${checklistEstateId}` : null;
  const [showForm, setShowForm, clearShowFormDraft] = useDraftState(draftBase ? `${draftBase}:open` : null, false);
  const [editingItem, setEditingItem, clearEditingDraft] = useDraftState(draftBase ? `${draftBase}:editing` : null, null);
  const [form, setForm, clearFormFieldsDraft] = useDraftState(draftBase ? `${draftBase}:fields` : null, { ...EMPTY_FORM });
  const clearDraft = useCallback(() => {
    clearShowFormDraft();
    clearEditingDraft();
    clearFormFieldsDraft();
  }, [clearShowFormDraft, clearEditingDraft, clearFormFieldsDraft]);
  const [saving, setSaving] = useState(false);
  // Synchronous double-submit guard for handleSave — disabled={saving}
  // alone leaks rapid double-taps because React state is async.
  const saveInFlightRef = useRef(false);
  const [deleting, setDeleting] = useState(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);
  const [suggestingAI, setSuggestingAI] = useState(false);
  const [aiElapsed, setAiElapsed] = useState(0);
  const [feedbackItem, setFeedbackItem] = useState(null);
  const [feedbackText, setFeedbackText] = useState('');
  const [egaRunning, setEgaRunning] = useState(false);
  const [viewMode, setViewMode] = useState(() => localStorage.getItem('iac_view_mode') || 'priority');
  const [expandedGroups, setExpandedGroups] = useState(new Set());
  const aiAbortRef = useRef(null);
  const aiTimerRef = useRef(null);
  const lastCompletedAtRef = useRef(null);
  const getAuthHeadersRef = useRef(getAuthHeaders);
  getAuthHeadersRef.current = getAuthHeaders;

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { fetchData(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-refresh on reconnect so airplane-mode toggling re-hydrates the
  // list without requiring a manual navigate-off-and-back.
  useEffect(() => {
    const refetch = () => { fetchData(); };
    window.addEventListener('online', refetch);
    window.addEventListener('offline', refetch);
    return () => {
      window.removeEventListener('online', refetch);
      window.removeEventListener('offline', refetch);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Poll for EGA IAC task status (real-time updates while Guardian generates)
  useEffect(() => {
    if (!estate?.id) return;
    let active = true;
    const poll = async () => {
      try {
        const res = await axios.get(`${API_URL}/guardian/iac-task-status`, getAuthHeadersRef.current());
        if (!active) return;
        const task = res.data;
        if (task.status === 'running') {
          setEgaRunning(true);
          // Compute elapsed from server-side started_at so the timer
          // resumes correctly when the user navigates away and back
          // mid-generation. Only update if the local axios call isn't
          // already managing the timer (suggestingAI flag is the
          // source of truth when this tab kicked off the request).
          if (!suggestingAI && task.started_at) {
            try {
              const startedMs = Date.parse(task.started_at);
              if (!Number.isNaN(startedMs)) {
                setAiElapsed(Math.max(0, Math.floor((Date.now() - startedMs) / 1000)));
              }
            } catch {}
          }
        } else if (task.status === 'completed' && task.completed_at) {
          setEgaRunning(false);
          if (lastCompletedAtRef.current && lastCompletedAtRef.current !== task.completed_at) {
            fetchData();
          }
          lastCompletedAtRef.current = task.completed_at;
        } else if (task.status === 'error' || task.status === 'canceled') {
          // The user's own AI Suggest call (handleAISuggest) toasts
          // its own error from the catch / inner-poller branches, so
          // we only surface a toast here for runs that started on a
          // DIFFERENT mount (e.g. user navigated to the checklist
          // from elsewhere while EGA was finishing). suggestingAI is
          // true only on the originating mount.
          if (egaRunning && !suggestingAI) {
            const msg = task.error || (task.status === 'canceled' ? 'Generation canceled.' : 'Generation failed — please try again.');
            toast.error(msg);
          }
          setEgaRunning(false);
        } else {
          setEgaRunning(false);
        }
      } catch { /* silent */ }
    };
    poll();
    const interval = setInterval(poll, 4000);
    return () => { active = false; clearInterval(interval); };
  }, [estate?.id, suggestingAI, egaRunning]); // eslint-disable-line react-hooks/exhaustive-deps

  // Drive the local elapsed-seconds timer from a single source so it
  // ticks whether the request started in THIS mount (suggestingAI) OR
  // is being tracked from the server because the user navigated back
  // mid-run (egaRunning). Without this, returning to /checklist while
  // EGA is still working showed the banner but no live timer.
  useEffect(() => {
    if (!egaRunning && !suggestingAI) {
      if (aiTimerRef.current) {
        clearInterval(aiTimerRef.current);
        aiTimerRef.current = null;
      }
      return;
    }
    if (aiTimerRef.current) return;
    aiTimerRef.current = setInterval(() => setAiElapsed(s => s + 1), 1000);
    return () => {
      if (aiTimerRef.current) {
        clearInterval(aiTimerRef.current);
        aiTimerRef.current = null;
      }
    };
  }, [egaRunning, suggestingAI]);

  const fetchData = async () => {
    // Airplane-mode rescue — rehydrate checklist + estate from the
    // last-known-good localStorage cache so the user keeps seeing
    // their items offline. Populated by the online branch below on
    // every successful fetch.
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      const savedEid = localStorage.getItem('selected_estate_id');
      if (savedEid) {
        const cachedEstate = readList(`checklist:estate:${savedEid}`);
        if (cachedEstate && typeof cachedEstate === 'object' && !Array.isArray(cachedEstate)) {
          setEstate(cachedEstate);
        } else {
          setEstate({ id: savedEid });
        }
        const cachedItems = readList(`checklist:items:${savedEid}`);
        if (Array.isArray(cachedItems) && cachedItems.length > 0) setChecklists(cachedItems);
      }
      setLoading(false);
      return;
    }
    try {
      const estatesRes = await cachedGet(axios, `${API_URL}/estates`, getAuthHeaders());
      if (estatesRes.data.length > 0) {
        const savedId = localStorage.getItem('selected_estate_id');
        const selected = (savedId && estatesRes.data.find(e => e.id === savedId)) || estatesRes.data[0];
        setEstate(selected);
        // Persist the selected estate id so the catch-block rescue can
        // locate the cached items if a future fetch fails (e.g. tab
        // returned from background, transient 5xx). Without this, a
        // user who landed on /checklist as their first authenticated
        // page would have an empty `selected_estate_id` in localStorage
        // and the rescue would no-op.
        try { localStorage.setItem('selected_estate_id', selected.id); } catch {}
        saveList(`checklist:estate:${selected.id}`, selected);
        const checklistRes = await axios.get(`${API_URL}/checklists/${selected.id}`, getAuthHeaders());
        const next = Array.isArray(checklistRes.data) ? checklistRes.data : [];
        if (next.length > 0 || checklists.length === 0) setChecklists(next);
        saveList(`checklist:items:${selected.id}`, next);
      }
    } catch (error) {
      console.error('Fetch error:', error);
      // Online-error rescue: rehydrate from localStorage so the user keeps
      // seeing their last-known IAC items. Critical during background-tab
      // returns (e.g. switching to a Zoom call mid-demo) where transient
      // 401/5xx would otherwise blank the page and render the empty-state
      // CTA — a credibility-killer in front of B2B clients. Previously
      // this rescue only fired when navigator.onLine === false.
      let savedEid = localStorage.getItem('selected_estate_id');
      // Fallback: if no selected_estate_id was ever written, scan for
      // any cached checklist:items:* key from a prior session.
      if (!savedEid) {
        const PREFIX = 'carryon_list_cache:checklist:items:';
        for (let i = 0; i < localStorage.length; i++) {
          const k = localStorage.key(i) || '';
          if (k.startsWith(PREFIX)) {
            savedEid = k.slice(PREFIX.length);
            break;
          }
        }
      }
      if (savedEid) {
        const cachedEstate = readList(`checklist:estate:${savedEid}`);
        if (cachedEstate && typeof cachedEstate === 'object' && !Array.isArray(cachedEstate)) {
          setEstate(cachedEstate);
        }
        const cachedItems = readList(`checklist:items:${savedEid}`);
        if (Array.isArray(cachedItems) && cachedItems.length > 0) {
          setChecklists(cachedItems);
        } else {
          // Only surface the failure toast if we have nothing to fall
          // back on — otherwise the user shouldn't even know it failed.
          toast.error('Failed to load checklist');
        }
      } else {
        toast.error('Failed to load checklist');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (saveInFlightRef.current) return;
    saveInFlightRef.current = true;
    if (!form.title.trim()) { toast.error('Title is required'); saveInFlightRef.current = false; return; }
    setSaving(true);
    try {
      const { mutateWithOutbox } = await import('../utils/offlineMutation');
      const r = await mutateWithOutbox({
        entity_type: 'checklist_item',
        entity_id: editingItem?.id || undefined,
        method: editingItem ? 'PUT' : 'POST',
        url: editingItem ? `/checklists/${editingItem.id}` : `/checklists`,
        body: editingItem ? form : { ...form, estate_id: estate.id },
        authHeaders: getAuthHeaders(),
      });
      if (!r.ok) throw r.error || new Error('save failed');
      if (r.queued) {
        if (editingItem) {
          setChecklists(prev => prev.map(c => c.id === editingItem.id ? { ...c, ...form } : c));
        } else {
          const tempId = `local-checklist-${Date.now()}`;
          setChecklists(prev => [...prev, { ...form, id: tempId, estate_id: estate.id, _local_pending: true }]);
        }
        toast.success(editingItem ? 'Change saved offline — will sync when you reconnect.' : 'Item queued — will sync when you reconnect.');
      } else {
        if (editingItem) setChecklists(prev => prev.map(c => c.id === editingItem.id ? r.data : c));
        else setChecklists(prev => [...prev, r.data]);
      }
      closeForm();
    } catch (err) {
      console.error(err);
      toast.error('Failed to save item');
    } finally {
      setSaving(false);
      saveInFlightRef.current = false;
    }
  };

  const handleDelete = async (itemId) => {
    setDeleting(itemId);
    try {
      // Offline delete: optimistic removal + queue DELETE in outbox.
      if (typeof navigator !== 'undefined' && navigator.onLine === false) {
        await enqueueOutbox({
          entity_type: 'checklist_item',
          entity_id: itemId,
          method: 'DELETE',
          url: `/checklists/${itemId}`,
        });
        setChecklists(prev => prev.filter(c => c.id !== itemId));
        toast.success('Deletion queued — will sync when you reconnect.');
        setDeleting(null);
        return;
      }
      await axios.delete(`${API_URL}/checklists/${itemId}`, getAuthHeaders());
      setChecklists(prev => prev.filter(c => c.id !== itemId));
      // toast removed
    } catch (err) {
      toast.error('Failed to delete');
    } finally {
      setDeleting(null);
    }
  };

  // formRef removed — the edit form now lives inside a SlidePanel
  // which manages its own focus / scroll. No need to scroll the
  // underlying page into view.

  const openEdit = (item) => {
    setEditingItem(item);
    setForm({
      title: item.title || '', description: item.description || '', category: item.category || 'general',
      priority: item.priority || 'medium', action_type: item.action_type || 'custom',
      contact_name: item.contact_name || '', contact_phone: item.contact_phone || '',
      contact_email: item.contact_email || '', contact_address: item.contact_address || '',
      notes: item.notes || '', due_timeframe: item.due_timeframe || 'first_week',
    });
    setShowForm(true);
    // SlidePanel handles its own focus/scroll — no need to scroll the
    // underlying page into view.
  };

  const closeForm = () => {
    clearDraft();
    setShowForm(false);
    setEditingItem(null);
    setForm({ ...EMPTY_FORM });
  };

  const handleAISuggest = async () => {
    if (!estate) return;
    setSuggestingAI(true);
    setEgaRunning(true);
    setAiElapsed(0);
    const controller = new AbortController();
    aiAbortRef.current = controller;

    // Single helper so every exit path resets the UI cleanly.
    // Without this we were leaving `egaRunning` set after the POST
    // resolved and the "Analyzing… 138s Stop" pill kept ticking even
    // though the run had already completed.
    const finalizeUI = () => {
      setSuggestingAI(false);
      setEgaRunning(false);
      setAiElapsed(0);
    };

    // ── Live progress poller ──
    // The backend records intermediate task progress in db.ega_tasks
    // (status: running → completed | error | canceled). We poll it
    // every 5s so the user sees "12 items added so far…" growing
    // live, and we also have a safe place to land if the axios call
    // aborts before the backend finishes. Polling is canceled when
    // the main request resolves (or fails) or when the user cancels.
    let pollTimer = null;
    let didFinish = false;
    const startPolling = () => {
      pollTimer = setInterval(async () => {
        try {
          const res = await axios.get(`${API_URL}/guardian/iac-task-status`, getAuthHeaders());
          const task = res?.data;
          if (!task || task.status === 'none') return;
          if (task.status === 'completed') {
            didFinish = true;
            clearInterval(pollTimer);
            invalidateCache('/checklists/');
            invalidateCache('/estates');
            fetchData();
            // Belt-and-suspenders re-fetch 1.5s later in case the
            // first fetchData fired before the inserts fully landed
            // (rare, but a 5-min run is too costly to silently fail).
            setTimeout(() => { fetchData(); }, 1500);
            const added = task.items_added || 0;
            const dupes = task.duplicates_skipped || 0;
            if (added > 0 && dupes > 0) {
              toast.success(`AI added ${added} new item${added > 1 ? 's' : ''} (${dupes} already in your checklist were skipped)`);
            } else if (added > 0) {
              toast.success(`AI added ${added} new checklist item${added > 1 ? 's' : ''}`);
            } else if (dupes > 0) {
              toast.success(`AI found ${dupes} relevant action${dupes > 1 ? 's' : ''} — all already in your checklist. Nothing new to add.`);
            } else if (task.error) {
              toast.error(task.error);
            } else {
              toast.success('AI completed — no new items suggested this round. Try again after adding more documents to your vault.');
            }
            finalizeUI();
          } else if (task.status === 'error' || task.status === 'failed') {
            didFinish = true;
            clearInterval(pollTimer);
            toast.error(task.error || 'AI suggestion failed — please try again');
            finalizeUI();
          } else if (task.status === 'canceled') {
            didFinish = true;
            clearInterval(pollTimer);
            toast.error('Generation canceled.');
            finalizeUI();
          } else if (task.items_added && task.items_added > 0) {
            // Mid-flight refresh so the user watches their checklist grow.
            fetchData();
          }
        } catch (_e) { /* poll errors are non-fatal */ }
      }, 5000);
    };
    startPolling();

    try {
      const res = await axios.post(`${API_URL}/chat/guardian`, {
        estate_id: estate.id,
        action: 'generate_iac',
        message: 'Analyze all documents in my Secure Digital Vault and generate specific, actionable checklist items with appropriate priority levels (critical, high, medium, low). Extract contact info where possible. Return items sorted by priority.',
      }, {
        ...getAuthHeaders(),
        signal: controller.signal,
        // The backend can run much longer than the user-perceivable
        // axios timeout. We give axios a generous ceiling (5 min) but
        // the live poller above will surface progress AND finalize the
        // flow if the connection drops sooner. Net effect: the user
        // never sees a false-failure toast while the backend is still
        // inserting items.
        timeout: 300000,
      });

      const added = res.data?.action_result?.items_added || 0;
      const dupes = res.data?.action_result?.duplicates_skipped || 0;
      if (!didFinish) {
        didFinish = true;
        if (pollTimer) clearInterval(pollTimer);
        if (added > 0) {
          invalidateCache('/checklists/');
          invalidateCache('/estates');
          fetchData();
          setTimeout(() => { fetchData(); }, 1500);
          toast.success(
            dupes > 0
              ? `AI added ${added} new item${added > 1 ? 's' : ''} (${dupes} already in your checklist were skipped)`
              : `AI added ${added} new checklist item${added > 1 ? 's' : ''}`
          );
        } else if (dupes > 0) {
          toast.success(`AI found ${dupes} relevant action${dupes > 1 ? 's' : ''} — all already in your checklist. Nothing new to add.`);
        } else {
          // Both 0 — vault might be empty, or the model returned no
          // checklist block. Tell the user explicitly so they don't
          // stare at the screen wondering whether it worked.
          toast.success('AI run complete — no new items suggested this round. Try adding more documents to your vault and re-run.');
        }
        finalizeUI();
      }
    } catch (err) {
      // Suppress timeout/connection errors if the poller has already
      // reported success or is still tracking progress — the backend
      // is still inserting items.
      if (didFinish) {
        // already handled
      } else if (axios.isCancel(err) || err?.message === 'canceled') {
        // user-cancelled
        finalizeUI();
      } else {
        didFinish = true;
        if (pollTimer) clearInterval(pollTimer);
        const isRateLimit = err?.response?.status === 429;
        const detail = err?.response?.data?.detail
          || (err?.code === 'ECONNABORTED' || err?.message?.includes('timeout')
              ? 'still working in the background — refresh in a moment to see results.'
              : err?.message || 'try again later');
        if (isRateLimit) {
          // The IAC generation is capped at 1/day per user. The
          // founder can toggle "AI Unlimited" on any account from
          // Admin → Users (the gold sparkle icon) to bypass this
          // cap entirely.
          toast.error(`${detail} Tip: ask the founder to enable "AI Unlimited" on your account in Admin → Users.`);
        } else {
          toast[err?.code === 'ECONNABORTED' ? 'success' : 'error'](
            `AI suggestion ${err?.code === 'ECONNABORTED' ? 'is' : 'failed —'} ${detail}`
          );
        }
        finalizeUI();
      }
    } finally {
      if (pollTimer) clearInterval(pollTimer);
      aiAbortRef.current = null;
    }
  };

  const stopAISuggest = async () => {
    // Local abort: stop any in-flight axios call from THIS mount.
    if (aiAbortRef.current) {
      try { aiAbortRef.current.abort(); } catch {}
    }
    // Server cancel: flip the ega_tasks row so the polling banner
    // clears immediately, even on other tabs/devices and even if the
    // user just navigated away/back (no local abort controller).
    try {
      await axios.post(`${API_URL}/guardian/iac-task/cancel`, null, getAuthHeaders());
    } catch {}
    setSuggestingAI(false);
    setEgaRunning(false);
    setAiElapsed(0);
    toast.success('Generation canceled.');
  };

  // ── Beneficiary-view PDF preview ──────────────────────────────────
  // Pops the universal Preview → Print modal. Tapping "Print" inside
  // the preview opens the native iOS / macOS print-or-share sheet so
  // the user can save the PDF or AirPrint it. Re-uses the same
  // `/guardian/export-checklist` endpoint the EGA toolbar already
  // wires up — same PDF, accessible from inside the IAC page itself
  // so the user doesn't have to cross over to EGA to print.
  const [iacPrinting, setIacPrinting] = useState(false);
  const handleIacPrint = async () => {
    if (iacPrinting) return;
    setIacPrinting(true);
    try {
      const dateStr = new Date().toISOString().split('T')[0];
      await openPdfPreview({
        pdfType: 'iac_standalone',
        filename: `CarryOn_IAC_${dateStr}.pdf`,
        title: 'Immediate Action Checklist',
        subtitle: `Beneficiary preview · ${dateStr}`,
        blobFetcher: async () => {
          const headers = getAuthHeaders()?.headers;
          const res = await axios.post(
            `${API_URL}/guardian/export-checklist`,
            {},
            { headers, responseType: 'blob', timeout: 120000 },
          );
          return new Blob([res.data], { type: 'application/pdf' });
        },
      });
    } catch (err) {
      toast.error(err?.response?.status === 404
        ? 'No IAC items yet — add some first'
        : 'Failed to generate IAC PDF');
    } finally {
      setIacPrinting(false);
    }
  };

  const handleActivationAction = async (itemId, action) => {
    try {
      // Offline-safe — queue the right method; optimistic local update.
      if (typeof navigator !== 'undefined' && navigator.onLine === false) {
        if (action === 'remove') {
          await enqueueOutbox({
            entity_type: 'checklist_item',
            entity_id: itemId,
            method: 'DELETE',
            url: `/checklists/${itemId}`,
          });
          setChecklists(prev => prev.filter(c => c.id !== itemId));
        } else {
          await enqueueOutbox({
            entity_type: 'checklist_item',
            entity_id: itemId,
            method: 'PUT',
            url: `/checklists/${itemId}`,
            body: { activation_status: action },
          });
          setChecklists(prev => prev.map(c => c.id === itemId ? { ...c, activation_status: action, _pending: true } : c));
        }
        toast.success('Change queued — will sync when you reconnect.');
        return;
      }
      if (action === 'remove') {
        await axios.delete(`${API_URL}/checklists/${itemId}`, getAuthHeaders());
        setChecklists(prev => prev.filter(c => c.id !== itemId));
      } else {
        await axios.put(`${API_URL}/checklists/${itemId}`, { activation_status: action }, getAuthHeaders());
        setChecklists(prev => prev.map(c => c.id === itemId ? { ...c, activation_status: action } : c));
      }
    } catch { toast.error('Failed to update'); }
  };

  const defaultItems = checklists.filter(c => c.is_default);
  const allDefaultsResolved = defaultItems.length === 0 || defaultItems.every(c => c.activation_status);
  
  const handleCompleteChecklist = async () => {
    try {
      const prog = await axios.get(`${API_URL}/onboarding/progress`, getAuthHeaders());
      if (prog.data?.already_graduated) return;
    } catch { /* proceed */ }
    setShowReturnPopup(true);
  };

  const handleAcceptItem = async (itemId) => {
    try {
      if (typeof navigator !== 'undefined' && navigator.onLine === false) {
        await enqueueOutbox({
          entity_type: 'checklist_item',
          entity_id: itemId,
          method: 'POST',
          url: `/checklists/${itemId}/accept`,
        });
        setChecklists(prev => prev.map(c => c.id === itemId ? { ...c, ai_accepted: true, _pending: true } : c));
        toast.success('Acceptance queued — will sync when you reconnect.');
        return;
      }
      await axios.post(`${API_URL}/checklists/${itemId}/accept`, {}, getAuthHeaders());
      setChecklists(prev => prev.map(c => c.id === itemId ? { ...c, ai_accepted: true } : c));
    } catch { toast.error('Failed to accept'); }
  };

  const handleRejectItem = async (itemId) => {
    setFeedbackItem(itemId);
    setFeedbackText('');
  };

  const submitRejection = async () => {
    if (!feedbackItem) return;
    try {
      if (typeof navigator !== 'undefined' && navigator.onLine === false) {
        await enqueueOutbox({
          entity_type: 'checklist_item',
          entity_id: feedbackItem,
          method: 'POST',
          url: `/checklists/${feedbackItem}/reject-with-feedback`,
          body: { feedback: feedbackText },
        });
        setChecklists(prev => prev.filter(c => c.id !== feedbackItem));
        setFeedbackItem(null);
        setFeedbackText('');
        toast.success('Rejection queued — will sync when you reconnect.');
        return;
      }
      await axios.post(`${API_URL}/checklists/${feedbackItem}/reject-with-feedback`, { feedback: feedbackText }, getAuthHeaders());
      setChecklists(prev => prev.filter(c => c.id !== feedbackItem));
      setFeedbackItem(null);
      setFeedbackText('');
    } catch { toast.error('Failed to reject'); }
  };

  const totalCount = checklists.length;
  const priColors = { critical: '#ef4444', high: '#f97316', medium: '#eab308', low: '#22c55e', immediate: '#ef4444', first_week: '#f97316', two_weeks: '#eab308', first_month: '#22c55e' };
  const getCatInfo = (cat) => CATEGORIES.find(c => c.value === cat) || CATEGORIES[7];

  // Map time-based categories to priority keys (items may use either system)
  const CATEGORY_TO_PRIORITY = { immediate: 'critical', first_week: 'high', two_weeks: 'medium', first_month: 'low' };
  const getEffectivePriority = (item) => item.priority || CATEGORY_TO_PRIORITY[item.category] || 'medium';

  // Build actual groups from the data for category view
  const CATEGORY_LABELS = {
    immediate: { label: 'Do Immediately', icon: Shield, color: '#ef4444' },
    first_week: { label: 'First Week', icon: FileText, color: '#f97316' },
    two_weeks: { label: 'First 2 Weeks', icon: Briefcase, color: '#eab308' },
    first_month: { label: 'First Month', icon: Heart, color: '#22c55e' },
    legal: { label: 'Legal', icon: FileText, color: '#3b82f6' },
    financial: { label: 'Financial', icon: Briefcase, color: '#8b5cf6' },
    insurance: { label: 'Insurance', icon: Shield, color: '#06b6d4' },
    property: { label: 'Property', icon: Building, color: '#f59e0b' },
    medical: { label: 'Medical', icon: Stethoscope, color: '#ef4444' },
    personal: { label: 'Personal', icon: Heart, color: '#ec4899' },
    government: { label: 'Government', icon: Users, color: '#14b8a6' },
    general: { label: 'General', icon: CheckSquare, color: '#6b7280' },
  };

  const toggleGroup = (key) => {
    setExpandedGroups(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const changeViewMode = (mode) => {
    setViewMode(mode);
    localStorage.setItem('iac_view_mode', mode);
    setExpandedGroups(new Set());
  };

  if (loading) {
    return (
      <div className="p-4 lg:p-6 pt-4 lg:pt-6 pb-24 lg:pb-6 space-y-6">
        <Skeleton className="h-12 w-64 bg-[var(--s)]" />
        <Skeleton className="h-24 w-full bg-[var(--s)] rounded-2xl" />
        {[1, 2, 3].map(i => <Skeleton key={i} className="h-20 bg-[var(--s)] rounded-xl" />)}
      </div>
    );
  }

  const renderItemCard = (item) => {
    const effectivePri = getEffectivePriority(item);
    const priColor = priColors[effectivePri] || priColors.medium;
    const catInfo = getCatInfo(item.category);
    const CatIcon = catInfo.icon;

    return (
      <div
        key={item.id}
        className="glass-card p-4 transition-all"
        style={{
          borderLeft: `3px solid ${priColor}`,
          outline: item.ai_suggested && item.ai_accepted !== true ? '1.5px solid rgba(20,184,166,0.4)' : 'none',
          background: item.ai_suggested && item.ai_accepted !== true ? 'rgba(20,184,166,0.03)' : undefined,
        }}
        data-testid={`iac-item-${item.id}`}
      >
        <div className="flex items-start gap-3">
          <div className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5"
            style={{ background: catInfo.color + '15' }}>
            {item.ai_suggested ? (
              <Sparkles className="w-4 h-4 text-[#14b8a6]" />
            ) : (
              <CatIcon className="w-4 h-4" style={{ color: catInfo.color }} />
            )}
          </div>

          <div className="flex-1 min-w-0">
            <h3 className="text-sm font-bold text-[var(--t)]">{item.title}</h3>
            {item.description && <p className="text-xs text-[var(--t5)] mt-0.5 line-clamp-2">{item.description}</p>}
            {(item.contact_name || item.contact_phone || item.contact_email) && (
              <div className="flex flex-wrap gap-2 mt-2">
                {item.contact_name && (
                  <span className="inline-flex items-center gap-1 text-xs text-[var(--t3)] bg-[var(--s)] px-2 py-0.5 rounded">
                    <Users className="w-3 h-3" /> {item.contact_name}
                  </span>
                )}
                {item.contact_phone && (
                  <span className="inline-flex items-center gap-1 text-xs text-[var(--t3)] bg-[var(--s)] px-2 py-0.5 rounded">
                    <Phone className="w-3 h-3" /> {item.contact_phone}
                  </span>
                )}
                {item.contact_email && (
                  <span className="inline-flex items-center gap-1 text-xs text-[var(--t3)] bg-[var(--s)] px-2 py-0.5 rounded">
                    <Mail className="w-3 h-3" /> {item.contact_email}
                  </span>
                )}
              </div>
            )}
          </div>

          <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
            {/* Action buttons row */}
            <div className="flex items-center gap-1.5">
            {item.ai_suggested && item.ai_accepted === null && (
              <>
                <div className="flex items-center gap-0.5">
                  <button onClick={() => handleAcceptItem(item.id)} className="p-1.5 rounded-lg text-[#14b8a6] active:scale-90 transition-transform" title="Accept AI suggestion" data-testid={`ai-accept-${item.id}`} aria-label="Accept suggestion">
                    <Check className="w-4 h-4" />
                  </button>
                  <div className="group relative">
                    <HelpCircle className="w-3.5 h-3.5 text-[var(--t5)] cursor-help" />
                    <div className="absolute bottom-full right-0 mb-1 w-48 p-2 rounded-lg bg-[#1a2744] border border-[var(--b)] text-xs text-[var(--t3)] opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity z-50">
                      This task was suggested based on your estate profile. Accept to keep it in your checklist, or reject to remove it.
                    </div>
                  </div>
                </div>
                <button onClick={() => handleRejectItem(item.id)} className="p-1.5 rounded-lg text-[#ef4444] active:scale-90 transition-transform" title="Reject" data-testid={`ai-reject-${item.id}`} aria-label="Reject suggestion">
                  <XCircle className="w-4 h-4" />
                </button>
              </>
            )}
            {item.ai_suggested && item.ai_accepted === true && (
              <span className="text-[11px] text-[#14b8a6] font-bold">Accepted</span>
            )}
            {item.is_default && !item.activation_status && (
              <>
                <div className="flex items-center gap-0.5">
                  <button onClick={() => handleActivationAction(item.id, 'accepted')} className="px-2 py-1 rounded-lg text-[11px] font-bold text-[#10b981] active:scale-90 transition-transform" style={{ border: '1px solid rgba(16,185,129,0.3)' }} data-testid={`default-accept-${item.id}`}>
                    Accept
                  </button>
                  <div className="group relative">
                    <HelpCircle className="w-3.5 h-3.5 text-[var(--t5)] cursor-help" data-testid={`accept-help-${item.id}`} />
                    <div className="absolute bottom-full right-0 mb-1 w-48 p-2 rounded-lg bg-[#1a2744] border border-[var(--b)] text-xs text-[var(--t3)] opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity z-50">
                      Accepting means you've reviewed this task and confirmed it's relevant to your family's plan.
                    </div>
                  </div>
                </div>
                <button onClick={(e) => { e.stopPropagation(); openEdit(item); handleActivationAction(item.id, 'edited'); }} className="px-2 py-1 rounded-lg text-[11px] font-bold text-[#d4af37] active:scale-90 transition-transform" style={{ border: '1px solid rgba(212,175,55,0.3)' }}>
                  Edit
                </button>
                <button onClick={() => handleActivationAction(item.id, 'remove')} className="px-2 py-1 rounded-lg text-[11px] font-bold text-[#ef4444] active:scale-90 transition-transform" style={{ border: '1px solid rgba(239,68,68,0.3)' }}>
                  Remove
                </button>
              </>
            )}
            {item.is_default && item.activation_status && (
              <span className="text-[11px] text-[#10b981] font-bold capitalize">{item.activation_status}</span>
            )}
            <button onClick={(e) => { e.stopPropagation(); openEdit(item); }} aria-label="Edit item" className="p-1.5 rounded-lg text-[var(--t5)] active:text-[var(--gold)] transition-colors">
              <Edit2 className="w-4 h-4" />
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); setConfirmDeleteId(item.id); }}
              disabled={deleting === item.id}
              className="p-1.5 rounded-lg text-[var(--t5)] active:text-red-400 transition-colors disabled:opacity-50"
              data-testid={`delete-iac-${item.id}`}
            >
              <Trash2 className="w-4 h-4" />
            </button>
            </div>
            {/* Priority pill — moved BELOW the action row so it no
                longer crowds the title text. Right-aligned to sit
                directly under the trash icon. */}
            <span className="text-[11px] px-2 py-0.5 rounded font-bold capitalize" style={{
              background: priColor + '15', color: priColor, border: `1px solid ${priColor}33`
            }} data-testid={`iac-priority-${item.id}`}>
              {effectivePri}
            </span>
          </div>
        </div>
        {/* Source attribution — full-width row beneath the title/actions
            so the badge never wraps inside the cramped middle column.
            Only shown for AI-suggested items. */}
        {item.ai_suggested && item.source && (
          item.source === 'ai_general_recommendation' ? (
            <div
              className="mt-2.5 w-full flex items-center gap-1.5 px-2.5 py-1 rounded text-[11px] font-bold whitespace-nowrap overflow-hidden text-ellipsis"
              style={{ background: 'rgba(20,184,166,0.10)', color: '#14b8a6', border: '1px solid rgba(20,184,166,0.25)' }}
              data-testid={`iac-source-${item.id}`}
            >
              <Sparkles className="w-3 h-3 flex-shrink-0" />
              <span className="overflow-hidden text-ellipsis">AI recommendation (general)</span>
            </div>
          ) : (
            <div
              className="mt-2.5 w-full flex items-center gap-1.5 px-2.5 py-1 rounded text-[11px] font-bold whitespace-nowrap overflow-hidden text-ellipsis"
              style={{ background: 'rgba(212,175,55,0.10)', color: '#d4af37', border: '1px solid rgba(212,175,55,0.25)' }}
              title={`Derived from: ${item.source}`}
              data-testid={`iac-source-${item.id}`}
            >
              <FileText className="w-3 h-3 flex-shrink-0" />
              <span className="overflow-hidden text-ellipsis">From: {item.source}</span>
            </div>
          )
        )}
      </div>
    );
  };

  return (
    <div className="w-full max-w-[1400px] mx-auto p-4 lg:p-6 pt-4 lg:pt-6 pb-24 lg:pb-6 space-y-5 animate-fade-in" data-testid="action-checklist"
      style={{ background: 'radial-gradient(ellipse at top left, rgba(245,158,11,0.15), transparent 55%), radial-gradient(ellipse at bottom right, rgba(217,119,6,0.08), transparent 55%)' }}>

      {/* Getting Started context banner */}
      {fromGettingStarted && (
        <div className="flex items-center gap-3 rounded-2xl p-4" data-testid="getting-started-banner"
          style={{ background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.15)' }}>
          <div className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0"
            style={{ background: 'rgba(245,158,11,0.15)', border: '1px solid rgba(245,158,11,0.25)' }}>
            <CheckSquare className="w-5 h-5 text-[#f59e0b]" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold text-[var(--t)]">Getting Started — Review Your Checklist</p>
            <p className="text-xs text-[var(--t4)]">Look over the step-by-step checklist your loved ones will follow. You can customize it anytime.</p>
          </div>
          <button onClick={() => navigate('/dashboard')}
            className="flex-shrink-0 text-xs font-bold text-[var(--t4)] px-3 py-2 rounded-xl transition-colors hover:bg-[var(--s)]"
            data-testid="back-to-dashboard-btn">
            <ArrowLeft className="w-4 h-4 inline mr-1" />Back
          </button>
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: 'linear-gradient(135deg, rgba(245,158,11,0.2), rgba(217,119,6,0.15))' }}>
            <CheckSquare className="w-5 h-5 text-[#F59E0B]" />
          </div>
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-[var(--t)]" style={{ fontFamily: 'var(--sans)' }}>
              Immediate Action Checklist (IAC)
            </h1>
            <p className="text-xs text-[var(--t5)]">
              {totalCount} items · Your beneficiaries will follow this after transition
            </p>
          </div>
        </div>
      </div>

      <SectionLockBanner sectionId="checklist" />

      {egaRunning && (
        <div className="flex items-start gap-2 px-4 py-3 rounded-xl text-sm font-bold"
          style={{ background: 'rgba(212,175,55,0.08)', border: '1px solid rgba(212,175,55,0.15)', color: '#d4af37' }}
          data-testid="ega-generating-banner">
          <Loader2 className="w-4 h-4 animate-spin flex-shrink-0 mt-0.5" />
          <div className="flex-1 leading-snug">
            <div>Estate Guardian is generating IAC items — new items will appear automatically.</div>
            <div className="font-normal text-[var(--t4)] mt-1">This usually takes 1–3 minutes. Your documents never leave your AES-256 encrypted vault — feel free to navigate to another tab and we'll notify you when it's done.</div>
          </div>
        </div>
      )}

      <SectionLockedOverlay sectionId="checklist">
      {/* Info + Actions */}
      <div className="rounded-xl p-4" style={{ background: 'rgba(37,99,235,0.05)', border: '1px solid rgba(37,99,235,0.1)' }}>
        <p className="text-sm text-[var(--t4)] leading-relaxed">
          Create the checklist your beneficiaries should follow after your transition. Include contacts, instructions, and details.
        </p>
      </div>

      {/* Action Buttons */}
      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => { setEditingItem(null); setForm({ ...EMPTY_FORM }); setShowForm(true); }}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold transition-all"
          style={{ background: 'linear-gradient(135deg, #d4af37, #b8941f)', color: '#0b1120' }}
          data-testid="iac-add-btn"
        >
          <Plus className="w-4 h-4" /> Add Item
        </button>
        <button
          onClick={handleAISuggest}
          disabled={suggestingAI || egaRunning}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold glass-card hover:border-[var(--gold)] text-[var(--t)] disabled:opacity-100"
          data-testid="iac-ai-suggest-btn"
        >
          <Sparkles className={`w-4 h-4 text-[var(--gold)] ${(suggestingAI || egaRunning) ? 'animate-spin' : ''}`} />
          {(suggestingAI || egaRunning) ? (
            <>
              Analyzing... <span className="tabular-nums text-xs text-[var(--t5)]" data-testid="iac-ai-elapsed">{aiElapsed}s</span>
              <button
                onClick={(e) => { e.stopPropagation(); stopAISuggest(); }}
                className="ml-1 px-2 py-0.5 rounded text-[11px] font-bold text-[var(--rd)] border border-[var(--rd)]/30"
                data-testid="iac-ai-stop-btn"
              >Stop</button>
            </>
          ) : 'AI Suggest from Vault'}
        </button>
        <button
          onClick={handleIacPrint}
          disabled={iacPrinting || totalCount === 0}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold glass-card hover:border-[var(--gold)] text-[var(--t)] disabled:opacity-50"
          data-testid="iac-print-pdf-btn"
          title={totalCount === 0 ? 'Add at least one IAC item first' : 'Preview & print the beneficiary view'}
        >
          {iacPrinting ? <Loader2 className="w-4 h-4 animate-spin text-[var(--gold)]" /> : <Printer className="w-4 h-4 text-[var(--gold)]" />}
          Print PDF
        </button>
        <CachedPdfIcon pdfType="iac_standalone" size={18} />
      </div>

      {/* Add/Edit form — slides in from the right matching all other
          slide-ins across the app (CFP / DAV pre-refactor / Beneficiary
          / Message / Vault). Body content stays identical to the
          previous inline glass-card so save/cancel flow and field
          state are unchanged. */}
      <SlidePanel
        open={showForm}
        onClose={closeForm}
        title={editingItem ? 'Edit Checklist Item' : 'New Checklist Item'}
        subtitle={editingItem ? 'Update the action your beneficiaries will see' : 'Add a step your beneficiaries should take after transition'}
      >
        {showForm && (
        <div className="space-y-4" data-testid="iac-form-panel">
          {/* Title */}
          <div>
            <label className="text-xs font-bold text-[var(--t4)] mb-1 block">What should they do? *</label>
            <input
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              placeholder="e.g., Call State Farm to file life insurance claim"
              className="w-full px-3 py-2.5 rounded-lg bg-[var(--b)] border border-[var(--b2)] text-[var(--t)] text-sm focus:outline-none focus:border-[var(--gold)]"
              data-testid="iac-input-title"
            />
          </div>

          {/* Description */}
          <div>
            <label className="text-xs font-bold text-[var(--t4)] mb-1 block">Detailed instructions</label>
            <textarea
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              placeholder="Provide step-by-step details, policy numbers, reference codes, etc."
              rows={3}
              className="w-full px-3 py-2.5 rounded-lg bg-[var(--b)] border border-[var(--b2)] text-[var(--t)] text-base focus:outline-none focus:border-[var(--gold)] resize-none"
              data-testid="iac-input-description"
            />
          </div>

          {/* Row: Category + Priority + Action Type */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="text-xs font-bold text-[var(--t4)] mb-1 block">Category</label>
              <select
                value={form.category}
                onChange={(e) => setForm({ ...form, category: e.target.value })}
                className="w-full px-3 py-2.5 rounded-lg bg-[var(--b)] border border-[var(--b2)] text-[var(--t)] text-sm focus:outline-none focus:border-[var(--gold)]"
              >
                {CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-bold text-[var(--t4)] mb-1 block">Priority</label>
              <select
                value={form.priority}
                onChange={(e) => setForm({ ...form, priority: e.target.value })}
                className="w-full px-3 py-2.5 rounded-lg bg-[var(--b)] border border-[var(--b2)] text-[var(--t)] text-sm focus:outline-none focus:border-[var(--gold)]"
              >
                {PRIORITIES.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-bold text-[var(--t4)] mb-1 block">Action Type</label>
              <select
                value={form.action_type}
                onChange={(e) => setForm({ ...form, action_type: e.target.value })}
                className="w-full px-3 py-2.5 rounded-lg bg-[var(--b)] border border-[var(--b2)] text-[var(--t)] text-sm focus:outline-none focus:border-[var(--gold)]"
              >
                {ACTION_TYPES.map(a => <option key={a.value} value={a.value}>{a.label}</option>)}
              </select>
            </div>
          </div>

          {/* Timeframe */}
          <div>
            <label className="text-xs font-bold text-[var(--t4)] mb-1 block">When should this be done?</label>
            <select
              value={form.due_timeframe}
              onChange={(e) => setForm({ ...form, due_timeframe: e.target.value })}
              className="w-full px-3 py-2.5 rounded-lg bg-[var(--b)] border border-[var(--b2)] text-[var(--t)] text-sm focus:outline-none focus:border-[var(--gold)]"
            >
              {DUE_TIMEFRAMES.map(d => <option key={d.value} value={d.value}>{d.label}</option>)}
            </select>
          </div>

          {/* Contact Info Section */}
          <div className="rounded-lg p-3" style={{ background: 'var(--s)', border: '1px dashed rgba(255,255,255,0.1)' }}>
            <p className="text-xs font-bold text-[var(--t4)] mb-2">Contact Information (optional — shown to beneficiaries)</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="flex items-center gap-2">
                <Users className="w-4 h-4 text-[var(--t5)] flex-shrink-0" />
                <input
                  value={form.contact_name}
                  onChange={(e) => setForm({ ...form, contact_name: e.target.value })}
                  placeholder="Contact name"
                  className="flex-1 px-3 py-2 rounded-lg bg-[var(--b)] border border-[var(--b2)] text-[var(--t)] text-sm focus:outline-none focus:border-[var(--gold)]"
                />
              </div>
              <div className="flex items-center gap-2">
                <Phone className="w-4 h-4 text-[var(--t5)] flex-shrink-0" />
                <input
                  value={form.contact_phone}
                  onChange={(e) => setForm({ ...form, contact_phone: formatPhoneUS(e.target.value) })}
                  placeholder="(123) 456-7890"
                  className="flex-1 px-3 py-2 rounded-lg bg-[var(--b)] border border-[var(--b2)] text-[var(--t)] text-sm focus:outline-none focus:border-[var(--gold)]"
                />
              </div>
              <div className="flex items-center gap-2">
                <Mail className="w-4 h-4 text-[var(--t5)] flex-shrink-0" />
                <input
                  value={form.contact_email}
                  onChange={(e) => setForm({ ...form, contact_email: e.target.value })}
                  placeholder="Email address"
                  className="flex-1 px-3 py-2 rounded-lg bg-[var(--b)] border border-[var(--b2)] text-[var(--t)] text-sm focus:outline-none focus:border-[var(--gold)]"
                />
              </div>
              <div className="flex items-center gap-2">
                <MapPin className="w-4 h-4 text-[var(--t5)] flex-shrink-0" />
                <AddressAutocomplete
                  value={form.contact_address}
                  onChange={(e) => setForm({ ...form, contact_address: e.target.value })}
                  onSelect={({ street, city, state, zip }) => {
                    setForm({ ...form, contact_address: [street, city, state, zip].filter(Boolean).join(', ') });
                  }}
                  placeholder="Address or location"
                  className="flex-1 px-3 py-2 rounded-lg bg-[var(--b)] border border-[var(--b2)] text-[var(--t)] text-sm focus:outline-none focus:border-[var(--gold)]"
                />
              </div>
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className="text-xs font-bold text-[var(--t4)] mb-1 block">Private notes (not shown to beneficiaries)</label>
            <input
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              placeholder="Your personal reminders about this item"
              className="w-full px-3 py-2.5 rounded-lg bg-[var(--b)] border border-[var(--b2)] text-[var(--t)] text-sm focus:outline-none focus:border-[var(--gold)]"
            />
          </div>

          {/* Save */}
          <div className="flex gap-2 pt-1">
            <button
              onClick={handleSave}
              disabled={saving}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold transition-all disabled:opacity-50"
              style={{ background: 'linear-gradient(135deg, #d4af37, #b8941f)', color: '#0b1120' }}
              data-testid="iac-save-btn"
            >
              <Save className="w-4 h-4" /> {saving ? 'Saving...' : editingItem ? 'Update Item' : 'Add to Checklist'}
            </button>
            <button onClick={closeForm} className="px-4 py-2.5 rounded-xl text-sm font-bold glass-card text-[var(--t4)] hover:text-[var(--t)]" data-testid="iac-cancel-btn">
              Cancel
            </button>
          </div>
        </div>
        )}
      </SlidePanel>

      {/* Checklist Items */}
      {checklists.length === 0 && !showForm ? (
        <div className="glass-card p-12 text-center">
          <CheckSquare className="w-12 h-12 text-[var(--t5)] mx-auto mb-3" />
          <h3 className="text-lg font-bold text-[var(--t)] mb-2">No checklist items yet</h3>
          <p className="text-sm text-[var(--t4)] mb-4">Start building the action plan your beneficiaries will follow.</p>
          <button
            onClick={() => setShowForm(true)}
            className="px-5 py-2.5 rounded-xl text-sm font-bold"
            style={{ background: 'linear-gradient(135deg, #d4af37, #b8941f)', color: '#0b1120' }}
            data-testid="iac-empty-add-btn"
          >
            <Plus className="w-4 h-4 inline mr-1" /> Create First Item
          </button>
        </div>
      ) : (
        <>
          {/* View mode toggle */}
          <div className="flex items-center gap-1.5 mb-3" data-testid="iac-view-toggle">
            {[
              { key: 'priority', label: 'By Priority' },
              { key: 'category', label: 'By Category' },
              { key: 'all', label: 'Show All' },
            ].map(v => (
              <button
                key={v.key}
                onClick={() => changeViewMode(v.key)}
                className="px-3 py-1.5 rounded-lg text-[11px] font-bold transition-all"
                style={{
                  background: viewMode === v.key ? 'linear-gradient(135deg, #d4af37, #b8941f)' : 'var(--s)',
                  color: viewMode === v.key ? '#0b1120' : 'var(--t4)',
                  border: `1px solid ${viewMode === v.key ? 'transparent' : 'var(--b)'}`,
                }}
                data-testid={`view-mode-${v.key}`}
              >
                {v.label}
              </button>
            ))}
          </div>

          {/* Grouped or flat list */}
          {viewMode === 'all' ? (
            <div className="space-y-2">
              {checklists.sort((a, b) => a.order - b.order).map((item) => renderItemCard(item))}
            </div>
          ) : viewMode === 'priority' ? (
            <div className="space-y-3">
              {PRIORITIES.map(pri => {
                const items = checklists.filter(i => getEffectivePriority(i) === pri.value).sort((a, b) => a.order - b.order);
                if (items.length === 0) return null;
                const isExpanded = expandedGroups.has(pri.value);
                return (
                  <div key={pri.value} className="glass-card overflow-hidden" data-testid={`priority-group-${pri.value}`}>
                    <button
                      onClick={() => toggleGroup(pri.value)}
                      className="w-full flex items-center gap-3 p-3 text-left hover:bg-[var(--s)] transition-colors"
                    >
                      <div className="w-1 h-6 rounded-full" style={{ background: pri.color }} />
                      {isExpanded ? <ChevronDown className="w-4 h-4 text-[var(--t4)]" /> : <ChevronRight className="w-4 h-4 text-[var(--t4)]" />}
                      <span className="text-sm font-bold text-[var(--t)]">{pri.label}</span>
                      <span className="text-[11px] text-[var(--t5)] ml-auto">{items.length} {items.length === 1 ? 'item' : 'items'}</span>
                    </button>
                    {isExpanded && (
                      <div className="space-y-1.5 px-3 pb-3">
                        {items.map(item => renderItemCard(item))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="space-y-3">
              {(() => {
                const catKeys = [...new Set(checklists.map(i => i.category))].sort();
                return catKeys.map(catKey => {
                  const items = checklists.filter(i => i.category === catKey).sort((a, b) => a.order - b.order);
                  if (items.length === 0) return null;
                  const isExpanded = expandedGroups.has(catKey);
                  const info = CATEGORY_LABELS[catKey] || { label: catKey, icon: CheckSquare, color: '#6b7280' };
                  const CatIcon = info.icon;
                  return (
                    <div key={catKey} className="glass-card overflow-hidden" data-testid={`category-group-${catKey}`}>
                      <button
                        onClick={() => toggleGroup(catKey)}
                        className="w-full flex items-center gap-3 p-3 text-left hover:bg-[var(--s)] transition-colors"
                      >
                        <CatIcon className="w-4 h-4" style={{ color: info.color }} />
                        {isExpanded ? <ChevronDown className="w-4 h-4 text-[var(--t4)]" /> : <ChevronRight className="w-4 h-4 text-[var(--t4)]" />}
                        <span className="text-sm font-bold text-[var(--t)]">{info.label}</span>
                        <span className="text-[11px] text-[var(--t5)] ml-auto">{items.length} {items.length === 1 ? 'item' : 'items'}</span>
                      </button>
                      {isExpanded && (
                        <div className="space-y-1.5 px-3 pb-3">
                          {items.map(item => renderItemCard(item))}
                        </div>
                      )}
                    </div>
                  );
                });
              })()}
            </div>
          )}
        </>
      )}
      </SectionLockedOverlay>

      {/* Complete for Now button — only when arriving from getting-started flow */}
      {fromGettingStarted && defaultItems.length > 0 && (
        <div className="mt-4 text-center">
          <button
            onClick={handleCompleteChecklist}
            disabled={!allDefaultsResolved}
            className="px-6 py-3 rounded-xl text-sm font-bold transition-all disabled:opacity-30"
            style={{
              background: allDefaultsResolved ? 'linear-gradient(135deg, #3B82F6, #2563EB)' : 'var(--s)',
              color: allDefaultsResolved ? '#fff' : 'var(--t5)',
            }}
            data-testid="complete-checklist-btn">
            Complete Checklist Editing for Now
          </button>
          {!allDefaultsResolved && (
            <p className="text-[11px] text-[var(--t5)] mt-2">Accept, edit, or remove each default item to continue</p>
          )}
        </div>
      )}

      {showReturnPopup && (
        <ReturnPopup step="checklist" onReturn={() => { setShowReturnPopup(false); navigate('/dashboard'); }} 
          onAlternate={() => { setShowReturnPopup(false); }} />
      )}

      {/* Rejection Feedback Modal */}
      {feedbackItem && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60" onClick={() => setFeedbackItem(null)} />
          <div className="relative rounded-2xl p-6 max-w-sm w-full max-h-[90vh] overflow-y-auto" style={{ background: 'var(--bg2)', border: '1px solid var(--b)', boxShadow: '0 25px 60px rgba(0,0,0,0.5)' }}>
            <h3 className="text-lg font-bold text-[var(--t)] mb-2" style={{ fontFamily: 'var(--sans)' }}>Why not this item?</h3>
            <p className="text-xs text-[var(--t4)] mb-4">Optional — helps the AI learn your preferences.</p>
            <textarea
              value={feedbackText}
              onChange={(e) => setFeedbackText(e.target.value)}
              placeholder="e.g., Already handled, not relevant, too vague..."
              rows={3}
              className="w-full px-3 py-2.5 rounded-lg bg-[var(--b)] border border-[var(--b2)] text-[var(--t)] text-base focus:outline-none focus:border-[var(--gold)] resize-none mb-4"
            />
            <div className="flex gap-2">
              <button onClick={submitRejection} className="flex-1 px-4 py-2.5 rounded-xl text-sm font-bold" style={{ background: 'linear-gradient(135deg, #ef4444, #dc2626)', color: 'white' }}>
                Remove Item
              </button>
              <button onClick={() => setFeedbackItem(null)} className="px-4 py-2.5 rounded-xl text-sm font-bold glass-card text-[var(--t4)]">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {confirmDeleteId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)' }} onClick={() => setConfirmDeleteId(null)} data-testid="delete-confirm-overlay">
          <div className="w-full max-w-xs rounded-2xl p-5 text-center" style={{ background: 'var(--s)', border: '1px solid var(--b)' }} onClick={e => e.stopPropagation()}>
            <Trash2 className="w-8 h-8 mx-auto mb-3 text-red-400" />
            <h3 className="text-sm font-bold text-[var(--t)] mb-1">Delete IAC Item?</h3>
            <p className="text-xs text-[var(--t4)] mb-4">Are you sure you want to delete this item? This cannot be undone.</p>
            <div className="flex gap-2">
              <button
                onClick={() => { handleDelete(confirmDeleteId); setConfirmDeleteId(null); }}
                disabled={deleting === confirmDeleteId}
                className="flex-1 px-4 py-2.5 rounded-xl text-sm font-bold transition-all active:scale-95 disabled:opacity-50"
                style={{ background: 'linear-gradient(135deg, #ef4444, #dc2626)', color: 'white' }}
                data-testid="delete-confirm-yes"
              >
                {deleting === confirmDeleteId ? 'Deleting...' : 'Yes, Delete'}
              </button>
              <button
                onClick={() => setConfirmDeleteId(null)}
                className="flex-1 px-4 py-2.5 rounded-xl text-sm font-bold glass-card text-[var(--t4)] transition-all active:scale-95"
                data-testid="delete-confirm-no"
              >
                No, Keep It
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ChecklistPage;
