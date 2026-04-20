import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import axios from 'axios';
import { cachedGet } from '../utils/apiCache';
import { useAuth } from '../contexts/AuthContext';
import { ReturnPopup } from '../components/GuidedActivation';
import {
  CheckSquare, Plus, Trash2, Edit2, Phone, Mail, MapPin, FileText,
  Briefcase, Users, Heart, Shield, Building, Stethoscope,
  Sparkles, Save, X,
  Check, XCircle, Loader2, HelpCircle, ChevronDown, ChevronRight, ArrowLeft
} from 'lucide-react';
import { toast } from '../utils/toast';
import { SectionLockBanner, SectionLockedOverlay } from '../components/security/SectionLock';
import { Skeleton } from '../components/ui/skeleton';
import AddressAutocomplete from '../components/AddressAutocomplete';
import { API_URL } from '../config';

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

const ChecklistPage = () => {
  const { getAuthHeaders } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const fromGettingStarted = location.state?.fromGettingStarted === true;
  const [showReturnPopup, setShowReturnPopup] = useState(false);
  const [checklists, setChecklists] = useState([]);
  const [estate, setEstate] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [saving, setSaving] = useState(false);
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
  useEffect(() => { fetchData(); }, []);

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
        } else if (task.status === 'completed' && task.completed_at) {
          setEgaRunning(false);
          if (lastCompletedAtRef.current && lastCompletedAtRef.current !== task.completed_at) {
            fetchData();
          }
          lastCompletedAtRef.current = task.completed_at;
        } else {
          setEgaRunning(false);
        }
      } catch { /* silent */ }
    };
    poll();
    const interval = setInterval(poll, 4000);
    return () => { active = false; clearInterval(interval); };
  }, [estate?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const fetchData = async () => {
    try {
      const estatesRes = await cachedGet(axios, `${API_URL}/estates`, getAuthHeaders());
      if (estatesRes.data.length > 0) {
        const savedId = localStorage.getItem('selected_estate_id');
        const selected = (savedId && estatesRes.data.find(e => e.id === savedId)) || estatesRes.data[0];
        setEstate(selected);
        const checklistRes = await axios.get(`${API_URL}/checklists/${selected.id}`, getAuthHeaders());
        setChecklists(checklistRes.data);
      }
    } catch (error) {
      console.error('Fetch error:', error);
      toast.error('Failed to load checklist');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!form.title.trim()) { toast.error('Title is required'); return; }
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
    }
  };

  const handleDelete = async (itemId) => {
    setDeleting(itemId);
    try {
      await axios.delete(`${API_URL}/checklists/${itemId}`, getAuthHeaders());
      setChecklists(prev => prev.filter(c => c.id !== itemId));
      // toast removed
    } catch (err) {
      toast.error('Failed to delete');
    } finally {
      setDeleting(null);
    }
  };

  const formRef = useRef(null);

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
    setTimeout(() => formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100);
  };

  const closeForm = () => {
    setShowForm(false);
    setEditingItem(null);
    setForm({ ...EMPTY_FORM });
  };

  const handleAISuggest = async () => {
    if (!estate) return;
    setSuggestingAI(true);
    setAiElapsed(0);
    aiTimerRef.current = setInterval(() => setAiElapsed(s => s + 1), 1000);
    const controller = new AbortController();
    aiAbortRef.current = controller;
    try {
      const res = await axios.post(`${API_URL}/chat/guardian`, {
        estate_id: estate.id,
        action: 'generate_checklist',
        message: 'Analyze all documents in my Secure Digital Vault and generate specific, actionable checklist items with appropriate priority levels (critical, high, medium, low). Extract contact info where possible. Return items sorted by priority.',
      }, { ...getAuthHeaders(), signal: controller.signal });

      const added = res.data?.action_result?.items_added || 0;
      if (added > 0) fetchData();
    } catch (err) {
      if (!axios.isCancel(err)) toast.error('AI suggestion failed — try again later');
    } finally {
      setSuggestingAI(false);
      clearInterval(aiTimerRef.current);
      aiAbortRef.current = null;
    }
  };

  const stopAISuggest = () => {
    if (aiAbortRef.current) aiAbortRef.current.abort();
  };

  const handleActivationAction = async (itemId, action) => {
    try {
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

          <div className="flex items-center gap-1.5 flex-shrink-0">
            <span className="text-xs px-2 py-0.5 rounded font-bold capitalize" style={{
              background: priColor + '15', color: priColor, border: `1px solid ${priColor}33`
            }}>
              {effectivePri}
            </span>
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
        </div>
      </div>
    );
  };

  return (
    <div className="p-4 lg:p-6 pt-4 lg:pt-6 pb-24 lg:pb-6 space-y-5 animate-fade-in" data-testid="action-checklist"
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
        <div className="flex items-center gap-2 px-4 py-3 rounded-xl text-sm font-bold"
          style={{ background: 'rgba(212,175,55,0.08)', border: '1px solid rgba(212,175,55,0.15)', color: '#d4af37' }}
          data-testid="ega-generating-banner">
          <Loader2 className="w-4 h-4 animate-spin flex-shrink-0" />
          <span>Estate Guardian is generating IAC items — new items will appear automatically</span>
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
        >
          <Plus className="w-4 h-4" /> Add Item
        </button>
        <button
          onClick={handleAISuggest}
          disabled={suggestingAI}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold glass-card hover:border-[var(--gold)] text-[var(--t)] disabled:opacity-50"
        >
          <Sparkles className={`w-4 h-4 text-[var(--gold)] ${suggestingAI ? 'animate-spin' : ''}`} />
          {suggestingAI ? (
            <>
              Analyzing... <span className="tabular-nums text-xs text-[var(--t5)]">{aiElapsed}s</span>
              <button onClick={(e) => { e.stopPropagation(); stopAISuggest(); }} className="ml-1 px-2 py-0.5 rounded text-[11px] font-bold text-[var(--rd)] border border-[var(--rd)]/30">Stop</button>
            </>
          ) : 'AI Suggest from Vault'}
        </button>
      </div>

      {/* Add/Edit Form */}
      {showForm && (
        <div ref={formRef} className="glass-card p-5 space-y-4" style={{ borderColor: 'var(--gold)', borderWidth: '1px' }}>
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-bold text-[var(--t)]">
              {editingItem ? 'Edit Checklist Item' : 'New Checklist Item'}
            </h3>
            <button onClick={closeForm} aria-label="Close form" className="w-8 h-8 rounded-full bg-white/5 flex items-center justify-center text-[var(--t4)] active:scale-90 transition-transform"><X className="w-4 h-4" /></button>
          </div>

          {/* Title */}
          <div>
            <label className="text-xs font-bold text-[var(--t4)] mb-1 block">What should they do? *</label>
            <input
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              placeholder="e.g., Call State Farm to file life insurance claim"
              className="w-full px-3 py-2.5 rounded-lg bg-[var(--b)] border border-[var(--b2)] text-[var(--t)] text-sm focus:outline-none focus:border-[var(--gold)]"
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
            >
              <Save className="w-4 h-4" /> {saving ? 'Saving...' : editingItem ? 'Update Item' : 'Add to Checklist'}
            </button>
            <button onClick={closeForm} className="px-4 py-2.5 rounded-xl text-sm font-bold glass-card text-[var(--t4)] hover:text-[var(--t)]">
              Cancel
            </button>
          </div>
        </div>
      )}

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
