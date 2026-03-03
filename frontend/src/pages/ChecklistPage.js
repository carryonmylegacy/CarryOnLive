import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import { useAuth } from '../contexts/AuthContext';
import {
  CheckSquare, Plus, Trash2, Edit2, Phone, Mail, MapPin, FileText,
  Briefcase, Users, Heart, Shield, Building, Stethoscope, ChevronDown,
  ChevronUp, GripVertical, Sparkles, Save, X, AlertTriangle, Clock,
  CalendarClock, ArrowUpDown, Check, XCircle, Loader2
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Progress } from '../components/ui/progress';
import { toast } from '../utils/toast';
import { SectionLockBanner, SectionLockedOverlay } from '../components/security/SectionLock';
import { Skeleton } from '../components/ui/skeleton';
import QuickStartTemplates from '../components/QuickStartTemplates';
import AddressAutocomplete from '../components/AddressAutocomplete';

const API_URL = `${process.env.REACT_APP_BACKEND_URL}/api`;

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

const QUICK_TEMPLATES = [
  { cat: 'insurance', title: 'File life insurance claim', action: 'call', desc: 'Call the life insurance company to initiate the death benefit claim', priority: 'critical', timeframe: 'immediate' },
  { cat: 'legal', title: 'Contact estate attorney', action: 'call', desc: 'Call the estate planning attorney to begin probate process', priority: 'critical', timeframe: 'immediate' },
  { cat: 'financial', title: 'Notify bank and financial institutions', action: 'call', desc: 'Contact banks to freeze accounts and begin estate transfer process', priority: 'high', timeframe: 'first_week' },
  { cat: 'government', title: 'Obtain death certificates', action: 'file_paperwork', desc: 'Order multiple certified copies of the death certificate (you will need 10-15 copies)', priority: 'critical', timeframe: 'immediate' },
  { cat: 'insurance', title: 'Notify health insurance provider', action: 'call', desc: 'Cancel or transfer health insurance coverage', priority: 'high', timeframe: 'first_week' },
  { cat: 'financial', title: 'Contact Social Security Administration', action: 'call', desc: 'Report the death and inquire about survivor benefits', priority: 'high', timeframe: 'first_week' },
  { cat: 'property', title: 'Secure all properties', action: 'visit', desc: 'Change locks, check on property, collect mail', priority: 'high', timeframe: 'first_week' },
  { cat: 'personal', title: 'Cancel subscriptions and memberships', action: 'custom', desc: 'Cancel recurring payments, streaming services, gym memberships, etc.', priority: 'low', timeframe: 'first_month' },
  { cat: 'legal', title: 'File the will with probate court', action: 'file_paperwork', desc: 'Submit the original will to the local probate court', priority: 'high', timeframe: 'first_week' },
  { cat: 'financial', title: 'Contact employer / pension administrator', action: 'call', desc: 'Notify employer, claim final paycheck, inquire about pension or 401k', priority: 'high', timeframe: 'first_week' },
  { cat: 'government', title: 'Notify the IRS', action: 'file_paperwork', desc: 'File final tax return and estate tax return if applicable', priority: 'medium', timeframe: 'two_weeks' },
  { cat: 'personal', title: 'Notify utility companies', action: 'call', desc: 'Transfer or cancel utilities (electric, gas, water, internet)', priority: 'medium', timeframe: 'two_weeks' },
];

const EMPTY_FORM = {
  title: '', description: '', category: 'general', priority: 'medium',
  action_type: 'custom', contact_name: '', contact_phone: '', contact_email: '',
  contact_address: '', notes: '', due_timeframe: 'first_week',
};

const ChecklistPage = () => {
  const { getAuthHeaders } = useAuth();
  const [checklists, setChecklists] = useState([]);
  const [estate, setEstate] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(null);
  const [showTemplates, setShowTemplates] = useState(false);
  const [suggestingAI, setSuggestingAI] = useState(false);
  const [aiElapsed, setAiElapsed] = useState(0);
  const [feedbackItem, setFeedbackItem] = useState(null);
  const [feedbackText, setFeedbackText] = useState('');
  const aiAbortRef = useRef(null);
  const aiTimerRef = useRef(null);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { fetchData(); }, []);

  const fetchData = async () => {
    try {
      const estatesRes = await axios.get(`${API_URL}/estates`, getAuthHeaders());
      if (estatesRes.data.length > 0) {
        setEstate(estatesRes.data[0]);
        const checklistRes = await axios.get(`${API_URL}/checklists/${estatesRes.data[0].id}`, getAuthHeaders());
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
      if (editingItem) {
        const res = await axios.put(`${API_URL}/checklists/${editingItem.id}`, form, getAuthHeaders());
        setChecklists(prev => prev.map(c => c.id === editingItem.id ? res.data : c));
        // toast removed
      } else {
        const res = await axios.post(`${API_URL}/checklists`, { ...form, estate_id: estate.id }, getAuthHeaders());
        setChecklists(prev => [...prev, res.data]);
        // toast removed
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
  };

  const closeForm = () => {
    setShowForm(false);
    setEditingItem(null);
    setForm({ ...EMPTY_FORM });
  };

  const applyTemplate = (tmpl) => {
    setForm({
      ...EMPTY_FORM,
      title: tmpl.title,
      description: tmpl.desc,
      category: tmpl.cat,
      priority: tmpl.priority,
      action_type: tmpl.action,
      due_timeframe: tmpl.timeframe,
    });
    setShowTemplates(false);
    setShowForm(true);
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
  const priColors = { critical: '#ef4444', high: '#f97316', medium: '#eab308', low: '#22c55e' };
  const getCatInfo = (cat) => CATEGORIES.find(c => c.value === cat) || CATEGORIES[7];

  if (loading) {
    return (
      <div className="p-4 lg:p-6 pt-20 lg:pt-6 pb-24 lg:pb-6 space-y-6">
        <Skeleton className="h-12 w-64 bg-[var(--s)]" />
        <Skeleton className="h-24 w-full bg-[var(--s)] rounded-2xl" />
        {[1, 2, 3].map(i => <Skeleton key={i} className="h-20 bg-[var(--s)] rounded-xl" />)}
      </div>
    );
  }

  return (
    <div className="p-4 lg:p-6 pt-20 lg:pt-6 pb-24 lg:pb-6 space-y-5 animate-fade-in" data-testid="action-checklist"
      style={{ background: 'radial-gradient(ellipse at top left, rgba(245,158,11,0.15), transparent 55%), radial-gradient(ellipse at bottom right, rgba(217,119,6,0.08), transparent 55%)' }}>

      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: 'linear-gradient(135deg, rgba(245,158,11,0.2), rgba(217,119,6,0.15))' }}>
            <CheckSquare className="w-5 h-5 text-[#F59E0B]" />
          </div>
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-[var(--t)]" style={{ fontFamily: 'Outfit, sans-serif' }}>
              Immediate Action Checklist (IAC)
            </h1>
            <p className="text-xs text-[var(--t5)]">
              {totalCount} items · Your beneficiaries will follow this after transition
            </p>
          </div>
        </div>
      </div>

      <SectionLockBanner sectionId="checklist" />

      <SectionLockedOverlay sectionId="checklist">
      {/* Info + Actions */}
      <div className="rounded-xl p-4" style={{ background: 'rgba(37,99,235,0.05)', border: '1px solid rgba(37,99,235,0.1)' }}>
        <p className="text-sm text-[var(--t4)] leading-relaxed">
          Create the step-by-step checklist your beneficiaries should follow after your transition. Include contact names, phone numbers, and specific instructions. The more detail you provide, the easier it will be for your loved ones.
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
          onClick={() => setShowTemplates(!showTemplates)}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold glass-card hover:border-[var(--gold)] text-[var(--t)]"
        >
          <FileText className="w-4 h-4 text-[var(--gold)]" /> Quick Templates
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
              <button onClick={(e) => { e.stopPropagation(); stopAISuggest(); }} className="ml-1 px-2 py-0.5 rounded text-[10px] font-bold text-[var(--rd)] border border-[var(--rd)]/30">Stop</button>
            </>
          ) : 'AI Suggest from Vault'}
        </button>
      </div>

      {/* Quick Templates Dropdown */}
      {showTemplates && (
        <div className="space-y-4">
          {/* Scenario-Based Templates (from backend) */}
          <QuickStartTemplates estateId={estate?.id} onApplied={fetchData} />

          {/* Individual Quick Templates */}
          <div className="glass-card p-3 space-y-1 max-h-72 overflow-y-auto">
            <p className="text-xs font-bold text-[var(--t4)] mb-2">Or click an individual template to start with it pre-filled:</p>
          {QUICK_TEMPLATES.map((tmpl, i) => {
            const catInfo = getCatInfo(tmpl.cat);
            const CatIcon = catInfo.icon;
            return (
              <div
                key={i}
                className="flex items-center gap-3 p-2.5 rounded-lg cursor-pointer hover:bg-[var(--s)] transition-colors"
                onClick={() => applyTemplate(tmpl)}
              >
                <CatIcon className="w-4 h-4 flex-shrink-0" style={{ color: catInfo.color }} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-[var(--t)] truncate">{tmpl.title}</p>
                  <p className="text-xs text-[var(--t5)] truncate">{tmpl.desc}</p>
                </div>
                <span className="text-xs px-2 py-0.5 rounded font-bold" style={{ background: priColors[tmpl.priority] + '15', color: priColors[tmpl.priority] }}>
                  {tmpl.priority}
                </span>
              </div>
            );
          })}
          </div>
        </div>
      )}

      {/* Add/Edit Form */}
      {showForm && (
        <div className="glass-card p-5 space-y-4" style={{ borderColor: 'var(--gold)', borderWidth: '1px' }}>
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-bold text-[var(--t)]">
              {editingItem ? 'Edit Checklist Item' : 'New Checklist Item'}
            </h3>
            <button onClick={closeForm} className="w-8 h-8 rounded-full bg-white/5 flex items-center justify-center text-[var(--t4)] active:scale-90 transition-transform"><X className="w-4 h-4" /></button>
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
              className="w-full px-3 py-2.5 rounded-lg bg-[var(--b)] border border-[var(--b2)] text-[var(--t)] text-sm focus:outline-none focus:border-[var(--gold)] resize-none"
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
                  onChange={(e) => {
                    const digits = e.target.value.replace(/\D/g, '').slice(0, 10);
                    let f = digits;
                    if (digits.length > 6) f = `(${digits.slice(0,3)}) ${digits.slice(3,6)}-${digits.slice(6)}`;
                    else if (digits.length > 3) f = `(${digits.slice(0,3)}) ${digits.slice(3)}`;
                    else if (digits.length > 0) f = `(${digits}`;
                    setForm({ ...form, contact_phone: f });
                  }}
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
        <div className="space-y-2">
          {checklists.sort((a, b) => a.order - b.order).map((item) => {
            const priColor = priColors[item.priority] || priColors.medium;
            const catInfo = getCatInfo(item.category);
            const CatIcon = catInfo.icon;
            const actionInfo = ACTION_TYPES.find(a => a.value === item.action_type) || ACTION_TYPES[5];
            const ActionIcon = actionInfo.icon;

            return (
              <div
                key={item.id}
                className="glass-card p-4 transition-all"
                style={{
                  borderLeft: `3px solid ${priColor}`,
                  outline: item.ai_suggested && item.ai_accepted !== true ? '1.5px solid rgba(20,184,166,0.4)' : 'none',
                  background: item.ai_suggested && item.ai_accepted !== true ? 'rgba(20,184,166,0.03)' : undefined,
                }}
              >
                <div className="flex items-start gap-3">
                  {/* Category icon */}
                  <div className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5"
                    style={{ background: catInfo.color + '15' }}>
                    {item.ai_suggested ? (
                      <Sparkles className="w-4 h-4 text-[#14b8a6]" />
                    ) : (
                      <CatIcon className="w-4 h-4" style={{ color: catInfo.color }} />
                    )}
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <h3 className="text-sm font-bold text-[var(--t)]">{item.title}</h3>
                    {item.description && <p className="text-xs text-[var(--t5)] mt-0.5 line-clamp-2">{item.description}</p>}

                    {/* Contact info chips */}
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

                  {/* Tags + Actions */}
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    <span className="text-xs px-2 py-0.5 rounded font-bold capitalize" style={{
                      background: priColor + '15', color: priColor, border: `1px solid ${priColor}33`
                    }}>
                      {item.priority}
                    </span>
                    {item.ai_suggested && item.ai_accepted === null && (
                      <>
                        <button onClick={() => handleAcceptItem(item.id)} className="p-1.5 rounded-lg text-[#14b8a6] active:scale-90 transition-transform" title="Accept">
                          <Check className="w-4 h-4" />
                        </button>
                        <button onClick={() => handleRejectItem(item.id)} className="p-1.5 rounded-lg text-[#ef4444] active:scale-90 transition-transform" title="Reject">
                          <XCircle className="w-4 h-4" />
                        </button>
                      </>
                    )}
                    {item.ai_suggested && item.ai_accepted === true && (
                      <span className="text-[10px] text-[#14b8a6] font-bold">Accepted</span>
                    )}
                    <button onClick={() => openEdit(item)} className="p-1.5 rounded-lg text-[var(--t5)] active:text-[var(--gold)] transition-colors">
                      <Edit2 className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => handleDelete(item.id)}
                      disabled={deleting === item.id}
                      className="p-1.5 rounded-lg text-[var(--t5)] active:text-red-400 transition-colors disabled:opacity-50"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
      </SectionLockedOverlay>

      {/* Rejection Feedback Modal */}
      {feedbackItem && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60" onClick={() => setFeedbackItem(null)} />
          <div className="relative rounded-2xl p-6 max-w-sm w-full" style={{ background: 'var(--bg2)', border: '1px solid var(--b)', boxShadow: '0 25px 60px rgba(0,0,0,0.5)' }}>
            <h3 className="text-lg font-bold text-[var(--t)] mb-2" style={{ fontFamily: 'Outfit, sans-serif' }}>Why not this item?</h3>
            <p className="text-xs text-[var(--t4)] mb-4">Optional — helps the AI learn your preferences.</p>
            <textarea
              value={feedbackText}
              onChange={(e) => setFeedbackText(e.target.value)}
              placeholder="e.g., Already handled, not relevant, too vague..."
              rows={3}
              className="w-full px-3 py-2.5 rounded-lg bg-[var(--b)] border border-[var(--b2)] text-[var(--t)] text-sm focus:outline-none focus:border-[var(--gold)] resize-none mb-4"
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
    </div>
  );
};

export default ChecklistPage;
