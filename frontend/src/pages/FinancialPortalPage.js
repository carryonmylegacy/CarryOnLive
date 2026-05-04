import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import axios from 'axios';
import { useAuth } from '../contexts/AuthContext';
import { cachedGet } from '../utils/apiCache';
import {
  DollarSign, Plus, Loader2, ArrowLeft, Search, Sparkles,
  ChevronRight, ChevronLeft, Receipt, Landmark, PiggyBank, TrendingUp, Building2, FileDown
} from 'lucide-react';
import { Card, CardContent } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import { toast } from '../utils/toast';
import { iosSafeDownload } from '../utils/iosSafeDownload';
// STATIC import — dynamic await import() chunks fail to fetch when
// the user is offline, breaking delete/designation/category mutations.
import { mutateWithOutbox } from '../utils/offlineMutation';
import { SectionLockBanner, SectionLockedOverlay } from '../components/security/SectionLock';
import { Skeleton } from '../components/ui/skeleton';
import SlidePanel from '../components/SlidePanel';
import { API_URL } from '../config';
import { saveList, readList } from '../utils/localListCache';
import { useDraftState } from '../hooks/useDraftState';
import BillForm from '../components/financial/BillForm';
import DebtForm from '../components/financial/DebtForm';
import AccountForm from '../components/financial/AccountForm';
import PropertyAssetForm from '../components/financial/PropertyAssetForm';
import PropertyAssetTile from '../components/financial/PropertyAssetTile';
import BillTile from '../components/financial/BillTile';
import DebtTile from '../components/financial/DebtTile';
import AccountTile from '../components/financial/AccountTile';
import BillCalendar from '../components/financial/BillCalendar';
import CashflowTimeline from '../components/financial/CashflowTimeline';
import FinancialSummary from '../components/financial/FinancialSummary';
import CfpVisibilityToggle from '../components/CfpVisibilityToggle';
import QuickAdd from '../components/financial/QuickAdd';

const DEFAULT_BILL_CATEGORIES = [
  'mortgage_rent', 'utilities', 'insurance', 'subscriptions', 'credit_card',
  'auto_vehicle', 'medical_health', 'taxes', 'hoa_condo', 'education_student',
  'phone_internet', 'childcare', 'other',
];
const BILL_CATEGORY_LABELS = {
  mortgage_rent: 'Mortgage/Rent', utilities: 'Utilities', insurance: 'Insurance',
  subscriptions: 'Subscriptions', credit_card: 'Credit Card', auto_vehicle: 'Auto/Vehicle',
  medical_health: 'Medical/Health', taxes: 'Taxes', hoa_condo: 'HOA/Condo',
  education_student: 'Education', phone_internet: 'Phone/Internet',
  childcare: 'Childcare', other: 'Other',
};

const DEFAULT_DEBT_CATEGORIES = [
  'mortgage', 'auto_loan', 'student_loan', 'credit_card', 'personal_loan',
  'medical_debt', 'business_loan', 'heloc', 'other',
];
const DEBT_CATEGORY_LABELS = {
  mortgage: 'Mortgage', auto_loan: 'Auto Loan', student_loan: 'Student Loan',
  credit_card: 'Credit Card', personal_loan: 'Personal Loan', medical_debt: 'Medical Debt',
  business_loan: 'Business Loan', heloc: 'HELOC', other: 'Other',
};

const DEFAULT_ACCOUNT_CATEGORIES = [
  'checking', 'savings', 'money_market', 'cd', 'investment', 'retirement',
  'pension', 'hsa_fsa', 'trust_account', 'life_insurance_cv', 'annuity',
  'real_estate', 'business', 'crypto', 'other',
];
const ACCOUNT_CATEGORY_LABELS = {
  checking: 'Checking', savings: 'Savings', money_market: 'Money Market', cd: 'CD',
  investment: 'Investment', retirement: 'Retirement (401k/IRA)', pension: 'Pension',
  hsa_fsa: 'HSA/FSA', trust_account: 'Trust', life_insurance_cv: 'Life Ins. (CV)',
  annuity: 'Annuity', real_estate: 'Real Estate', business: 'Business',
  crypto: 'Crypto', other: 'Other',
};

const FinancialPortalPage = () => {
  const { user, getAuthHeaders } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [activeTab, setActiveTab] = useState('bills');
  const [bills, setBills] = useState([]);
  const [debts, setDebts] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [propertyAssets, setPropertyAssets] = useState([]);
  const [beneficiaries, setBeneficiaries] = useState([]);
  const [davEntries, setDavEntries] = useState([]);
  const [customCategories, setCustomCategories] = useState({ bills: [], debts: [], accounts: [] });
  const [summary, setSummary] = useState(null);
  const [estate, setEstate] = useState(null);
  const [loading, setLoading] = useState(true);
  const [billFilter, setBillFilter] = useState('all');
  const [debtFilter, setDebtFilter] = useState('all');
  const [accountFilter, setAccountFilter] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  // Draft persistence — the 4 slide-out create panels (Bill / Debt /
  // Account / Property) and the editItem context auto-resume when the
  // user navigates away and returns. The form fields inside each panel
  // are persisted via useFinancialForm (sensitive fields sanitized).
  const cfpEstateId = (typeof localStorage !== 'undefined' && localStorage.getItem('selected_estate_id')) || null;
  const cfpDraftBase = cfpEstateId ? `cfp_form:${cfpEstateId}` : null;
  const [showBillForm, setShowBillForm] = useDraftState(cfpDraftBase ? `${cfpDraftBase}:billOpen` : null, false);
  const [showDebtForm, setShowDebtForm] = useDraftState(cfpDraftBase ? `${cfpDraftBase}:debtOpen` : null, false);
  const [showAccountForm, setShowAccountForm] = useDraftState(cfpDraftBase ? `${cfpDraftBase}:acctOpen` : null, false);
  const [showPropertyForm, setShowPropertyForm] = useDraftState(cfpDraftBase ? `${cfpDraftBase}:propOpen` : null, false);
  const [editItem, setEditItem] = useDraftState(cfpDraftBase ? `${cfpDraftBase}:editItem` : null, null);
  const [showQuickAdd, setShowQuickAdd] = useState(false);
  const [exportingHandoff, setExportingHandoff] = useState(false);
  const [selectedCalendarDay, setSelectedCalendarDay] = useState(null);
  const [calendarMonth, setCalendarMonth] = useState(new Date());
  const searchTimerRef = useRef(null);
  const [debouncedSearch, setDebouncedSearch] = useState('');

  useEffect(() => { fetchAll(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const fetchAll = async () => {
    // Airplane-mode rescue — rehydrate every list from its
    // last-known-good localStorage cache so the user keeps seeing
    // bills, debts, accounts, properties, etc. instead of a blank
    // "first-time" state. Populated by the online branch below.
    const isOffline = typeof navigator !== 'undefined' && navigator.onLine === false;
    if (isOffline) {
      const savedEid = localStorage.getItem('selected_estate_id');
      if (savedEid) {
        const cachedEstate = readList(`financial:estate:${savedEid}`);
        if (cachedEstate && typeof cachedEstate === 'object' && !Array.isArray(cachedEstate)) {
          setEstate(cachedEstate);
        } else {
          setEstate({ id: savedEid });
        }
        // Hydrate from the consolidated `financial:portal:<eid>` blob
        // written by fetchAll. Falls back to the legacy per-list keys
        // so existing user caches still load on first deploy.
        const portal = readList(`financial:portal:${savedEid}`);
        const hydrate = (name, setter) => {
          if (portal && typeof portal === 'object' && Array.isArray(portal[name]) && portal[name].length > 0) {
            setter(portal[name]);
            return;
          }
          const v = readList(`financial:${name}:${savedEid}`);
          if (Array.isArray(v) && v.length > 0) setter(v);
        };
        hydrate('bills', setBills);
        hydrate('debts', setDebts);
        hydrate('accounts', setAccounts);
        hydrate('property', setPropertyAssets);
        hydrate('beneficiaries', setBeneficiaries);
        hydrate('dav', setDavEntries);
        const cachedSummary = (portal && portal.summary) || readList(`financial:summary:${savedEid}`);
        if (cachedSummary && !Array.isArray(cachedSummary)) setSummary(cachedSummary);
        const cachedCats = (portal && portal.categories) || readList(`financial:categories:${savedEid}`);
        if (cachedCats && typeof cachedCats === 'object' && !Array.isArray(cachedCats)) {
          setCustomCategories(cachedCats);
        }
      }
      setLoading(false);
      return;
    }
    try {
      const headers = getAuthHeaders()?.headers;
      if (!headers) { setLoading(false); return; }
      const estatesRes = await cachedGet(axios, `${API_URL}/estates`, { headers });
      const estates = Array.isArray(estatesRes.data) ? estatesRes.data : [];
      if (estates.length === 0) { setLoading(false); return; }
      const savedId = localStorage.getItem('selected_estate_id');
      const est = (savedId && estates.find(e => e.id === savedId)) || estates[0];
      setEstate(est);
      const eid = est.id;
      saveList(`financial:estate:${eid}`, est);
      const [billsRes, debtsRes, acctsRes, propsRes, summaryRes, bensRes, catBills, catDebts, catAccts, davRes] = await Promise.all([
        axios.get(`${API_URL}/financial/bills/${eid}`, { headers }).catch(() => ({ data: [] })),
        axios.get(`${API_URL}/financial/debts/${eid}`, { headers }).catch(() => ({ data: [] })),
        axios.get(`${API_URL}/financial/accounts/${eid}`, { headers }).catch(() => ({ data: [] })),
        axios.get(`${API_URL}/financial/property/${eid}`, { headers }).catch(() => ({ data: [] })),
        axios.get(`${API_URL}/financial/summary/${eid}`, { headers }).catch(() => ({ data: null })),
        axios.get(`${API_URL}/beneficiaries/${eid}`, { headers }).catch(() => ({ data: [] })),
        axios.get(`${API_URL}/financial/categories/${eid}?module=bills`, { headers }).catch(() => ({ data: [] })),
        axios.get(`${API_URL}/financial/categories/${eid}?module=debts`, { headers }).catch(() => ({ data: [] })),
        axios.get(`${API_URL}/financial/categories/${eid}?module=accounts`, { headers }).catch(() => ({ data: [] })),
        axios.get(`${API_URL}/digital-wallet/${eid}`, { headers }).catch(() => ({ data: [] })),
      ]);
      // Empty-response clobber guard on every list — only overwrite if
      // the response has data OR the state was already empty. This way
      // a transient empty response from an airplane-mode transition
      // can't wipe the populated UI.
      const nextBills = Array.isArray(billsRes.data) ? billsRes.data : [];
      const nextDebts = Array.isArray(debtsRes.data) ? debtsRes.data : [];
      const nextAccts = Array.isArray(acctsRes.data) ? acctsRes.data : [];
      const nextProps = Array.isArray(propsRes.data) ? propsRes.data : [];
      const nextBens = Array.isArray(bensRes.data) ? bensRes.data : [];
      const nextDav = Array.isArray(davRes.data) ? davRes.data : [];
      if (nextBills.length > 0 || bills.length === 0) setBills(nextBills);
      if (nextDebts.length > 0 || debts.length === 0) setDebts(nextDebts);
      if (nextAccts.length > 0 || accounts.length === 0) setAccounts(nextAccts);
      if (nextProps.length > 0 || propertyAssets.length === 0) setPropertyAssets(nextProps);
      if (summaryRes.data) setSummary(summaryRes.data); // summary is a number/object, keep old on null
      if (nextBens.length > 0 || beneficiaries.length === 0) setBeneficiaries(nextBens);
      if (nextDav.length > 0 || davEntries.length === 0) setDavEntries(nextDav);
      const nextCats = {
        bills: Array.isArray(catBills.data) ? catBills.data : [],
        debts: Array.isArray(catDebts.data) ? catDebts.data : [],
        accounts: Array.isArray(catAccts.data) ? catAccts.data : [],
      };
      setCustomCategories(nextCats);
      // Single batched localStorage write — one JSON encode + one
      // synchronous write rather than 8 separate ones, which previously
      // showed up as a perceptible jank on every refresh.
      saveList(`financial:portal:${eid}`, {
        bills: nextBills,
        debts: nextDebts,
        accounts: nextAccts,
        property: nextProps,
        beneficiaries: nextBens,
        dav: nextDav,
        summary: summaryRes.data || null,
        categories: nextCats,
      });
    } catch (err) { console.error('Financial portal fetch error:', err); }
    setLoading(false);
  };

  // Auto-refresh on reconnect so the user doesn't have to navigate off-and-back.
  useEffect(() => {
    const refetch = () => { fetchAll(); };
    window.addEventListener('online', refetch);
    window.addEventListener('offline', refetch);
    return () => {
      window.removeEventListener('online', refetch);
      window.removeEventListener('offline', refetch);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Maps useFinancialForm config → which list this entity belongs to.
  // Drives optimistic insert/replace/delete on the in-memory list so the
  // user sees their offline (or online) action reflected instantly,
  // without waiting for a refetch round-trip.
  const LIST_BY_MODULE = {
    bills: { state: bills, set: setBills, cacheKey: 'bills' },
    debts: { state: debts, set: setDebts, cacheKey: 'debts' },
    accounts: { state: accounts, set: setAccounts, cacheKey: 'accounts' },
    property: { state: propertyAssets, set: setPropertyAssets, cacheKey: 'property' },
  };

  const persistPortalCache = (overrides = {}) => {
    if (!estate?.id) return;
    saveList(`financial:portal:${estate.id}`, {
      bills, debts, accounts, property: propertyAssets,
      beneficiaries, dav: davEntries, summary, categories: customCategories,
      ...overrides,
    });
  };

  const handleSaved = (saved, opts = {}) => {
    setShowBillForm(false);
    setShowDebtForm(false);
    setShowAccountForm(false);
    setShowPropertyForm(false);
    setEditItem(null);
    // Optimistic UI: when the form returns its saved/queued payload,
    // patch it into the right list immediately so users see it on the
    // page even when offline. Online creates already get a refetch on
    // top, so we still call fetchAll() for server reconciliation.
    if (saved && opts.module && LIST_BY_MODULE[opts.module]) {
      const { state, set, cacheKey } = LIST_BY_MODULE[opts.module];
      let next;
      if (opts.isEdit) {
        next = state.map(it => (it.id === saved.id ? { ...it, ...saved } : it));
      } else {
        // Avoid duplicate inserts if the row was somehow already present.
        next = state.some(it => it.id === saved.id) ? state : [saved, ...state];
      }
      set(next);
      if (estate?.id) {
        saveList(`financial:${cacheKey}:${estate.id}`, next);
        persistPortalCache({ [cacheKey]: next });
      }
    }
    if (opts.queued) return; // skip refetch when offline — it would clobber the optimistic row
    fetchAll();
  };

  const handleHandoffExport = async () => {
    if (!estate?.id) return;
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      toast.error('Hand-off PDF requires an internet connection.');
      return;
    }
    setExportingHandoff(true);
    try {
      const headers = getAuthHeaders()?.headers;
      const res = await axios.get(`${API_URL}/financial/handoff-package/${estate.id}`, {
        headers,
        responseType: 'blob',
      });
      const blob = new Blob([res.data], { type: 'application/pdf' });
      const filename = `carryon-handoff-${estate.id.slice(0, 8)}.pdf`;
      await iosSafeDownload(blob, filename, 'Hand-off PDF', 'cfp_handoff');
    } catch {
      toast.error('Failed to generate hand-off PDF.');
    }
    setExportingHandoff(false);
  };

  // Module key used by the list state mapping. Matches LIST_BY_MODULE keys.
  const moduleForType = (type) => (type === 'bills' || type === 'debts' || type === 'accounts' || type === 'property' ? type : null);

  const handleDelete = async (type, id) => {
    if (!window.confirm('Delete this entry? This cannot be undone.')) return;
    const mod = moduleForType(type);
    // Optimistic remove: drop the row immediately so the UI never shows
    // "I deleted this but it's still there waiting for the network".
    if (mod && LIST_BY_MODULE[mod]) {
      const { state, set, cacheKey } = LIST_BY_MODULE[mod];
      const next = state.filter(it => it.id !== id);
      set(next);
      if (estate?.id) {
        saveList(`financial:${cacheKey}:${estate.id}`, next);
        persistPortalCache({ [cacheKey]: next });
      }
    }
    try {

      const r = await mutateWithOutbox({
        entity_type: `financial_${type === 'property' ? 'property' : type.replace(/s$/, '')}`,
        entity_id: id,
        method: 'DELETE',
        url: `/financial/${type}/${id}`,
        authHeaders: getAuthHeaders(),
      });
      if (!r.ok) throw r.error || new Error('Delete failed');
      if (r.queued) {
        toast.success('Deletion queued — will sync when you reconnect.');
        return;
      }
      fetchAll();
    } catch {
      toast.error('Failed to delete');
      // Roll back optimistic remove on hard failure.
      fetchAll();
    }
  };

  const handleDesignationUpdate = async (type, itemId, designatedBeneficiaries, visibilityTiming) => {
    const mod = moduleForType(type);
    const designationBody = {
      designated_beneficiaries: designatedBeneficiaries,
      visibility_timing: visibilityTiming,
    };
    // Optimistic patch into the matching list so the UI reflects the
    // designation immediately whether online or offline.
    if (mod && LIST_BY_MODULE[mod]) {
      const { state, set, cacheKey } = LIST_BY_MODULE[mod];
      const next = state.map(it => (it.id === itemId ? { ...it, ...designationBody } : it));
      set(next);
      if (estate?.id) {
        saveList(`financial:${cacheKey}:${estate.id}`, next);
        persistPortalCache({ [cacheKey]: next });
      }
    }
    try {

      const r = await mutateWithOutbox({
        entity_type: `financial_${type === 'property' ? 'property' : type.replace(/s$/, '')}`,
        entity_id: itemId,
        method: 'PUT',
        url: `/financial/${type}/${itemId}/designation`,
        body: designationBody,
        authHeaders: getAuthHeaders(),
      });
      if (!r.ok) throw r.error || new Error('Update failed');
      if (r.queued) {
        toast.success('Designation queued — will sync when you reconnect.');
        return;
      }
      fetchAll();
    } catch {
      toast.error('Failed to update designation');
      fetchAll();
    }
  };

  const handleAddCategory = async (module, name) => {
    if (!estate) return;
    const trimmed = String(name || '').trim();
    if (!trimmed) return false;
    const tempId = `local-fincat-${(crypto?.randomUUID?.() || Date.now())}`;
    const optimisticCat = { id: tempId, estate_id: estate.id, module, name: trimmed, _local_pending: true };
    // Optimistic insert into customCategories so the new category shows
    // up in the dropdown right away (offline or online).
    const nextCats = {
      ...customCategories,
      [module]: [...(customCategories[module] || []), optimisticCat],
    };
    setCustomCategories(nextCats);
    if (estate?.id) {
      persistPortalCache({ categories: nextCats });
    }
    try {

      const r = await mutateWithOutbox({
        entity_type: 'financial_category',
        entity_id: tempId,
        method: 'POST',
        url: '/financial/categories',
        body: { estate_id: estate.id, module, name: trimmed },
        authHeaders: getAuthHeaders(),
      });
      if (!r.ok) throw r.error || new Error('Save failed');
      if (r.queued) {
        toast.success('Category queued — will sync when you reconnect.');
        return true;
      }
      fetchAll();
      return true;
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to create category');
      // Roll back optimistic add on hard failure.
      setCustomCategories(customCategories);
      return false;
    }
  };

  // Build category list with custom categories
  const getBillCategories = () => {
    const cats = [...DEFAULT_BILL_CATEGORIES];
    const labels = { ...BILL_CATEGORY_LABELS };
    (customCategories.bills || []).forEach(c => {
      const key = c.name.toLowerCase().replace(/\s+/g, '_');
      if (!cats.includes(key) && !cats.includes(c.name)) {
        cats.push(c.name);
        labels[c.name] = c.name;
      }
    });
    return { cats, labels };
  };
  const getDebtCategories = () => {
    const cats = [...DEFAULT_DEBT_CATEGORIES];
    const labels = { ...DEBT_CATEGORY_LABELS };
    (customCategories.debts || []).forEach(c => {
      if (!cats.includes(c.name)) { cats.push(c.name); labels[c.name] = c.name; }
    });
    return { cats, labels };
  };
  const getAccountCategories = () => {
    const cats = [...DEFAULT_ACCOUNT_CATEGORIES];
    const labels = { ...ACCOUNT_CATEGORY_LABELS };
    (customCategories.accounts || []).forEach(c => {
      if (!cats.includes(c.name)) { cats.push(c.name); labels[c.name] = c.name; }
    });
    return { cats, labels };
  };

  const { cats: billCats, labels: billLabels } = getBillCategories();
  const { cats: debtCats, labels: debtLabels } = getDebtCategories();
  const { cats: acctCats, labels: acctLabels } = getAccountCategories();

  // Filter items
  const filteredBills = useMemo(() => {
    let items = bills.filter(b => b.status !== 'cancelled');
    if (billFilter !== 'all') items = items.filter(b => b.category === billFilter);
    if (debouncedSearch) items = items.filter(b => b.name.toLowerCase().includes(debouncedSearch.toLowerCase()));
    return items;
  }, [bills, billFilter, debouncedSearch]);

  const filteredDebts = useMemo(() => {
    let items = debts;
    if (debtFilter !== 'all') items = items.filter(d => d.category === debtFilter);
    if (debouncedSearch) items = items.filter(d => d.name.toLowerCase().includes(debouncedSearch.toLowerCase()));
    return items;
  }, [debts, debtFilter, debouncedSearch]);

  const filteredAccounts = useMemo(() => {
    let items = accounts;
    if (accountFilter !== 'all') items = items.filter(a => a.category === accountFilter);
    if (debouncedSearch) items = items.filter(a => a.name.toLowerCase().includes(debouncedSearch.toLowerCase()));
    return items;
  }, [accounts, accountFilter, debouncedSearch]);

  // Get active categories (ones that have items)
  const activeBillCats = useMemo(() => {
    const used = new Set(bills.map(b => b.category));
    return ['all', ...billCats.filter(c => used.has(c))];
  }, [bills, billCats]);

  const activeDebtCats = useMemo(() => {
    const used = new Set(debts.map(d => d.category));
    return ['all', ...debtCats.filter(c => used.has(c))];
  }, [debts, debtCats]);

  const activeAcctCats = useMemo(() => {
    const used = new Set(accounts.map(a => a.category));
    return ['all', ...acctCats.filter(c => used.has(c))];
  }, [accounts, acctCats]);

  // Determine current add button action
  const handleAddClick = () => {
    setEditItem(null);
    if (activeTab === 'bills') setShowBillForm(true);
    else if (activeTab === 'debts') setShowDebtForm(true);
    else if (activeTab === 'accounts') setShowAccountForm(true);
    else setShowPropertyForm(true);
  };

  const addButtonLabel = activeTab === 'bills' ? 'Add Bill' : activeTab === 'debts' ? 'Add Debt' : activeTab === 'accounts' ? 'Add Account' : 'Add Asset';

  // Category filter bubble renderer
  const renderCategoryBubbles = (categories, activeFilter, setFilter, labels) => (
    <div className="flex gap-2 overflow-x-auto pb-2 -mx-4 px-4 lg:mx-0 lg:px-0 scrollbar-hide" data-testid="category-bubbles">
      {categories.map(cat => (
        <button
          key={cat}
          onClick={() => setFilter(cat)}
          className="flex-shrink-0 px-4 py-2 rounded-full text-xs font-bold transition-all whitespace-nowrap"
          style={{
            background: activeFilter === cat ? 'linear-gradient(135deg, #d4af37, #b8962e)' : 'rgba(255,255,255,0.05)',
            color: activeFilter === cat ? '#080e1a' : 'var(--t3)',
            border: `1px solid ${activeFilter === cat ? 'transparent' : 'rgba(255,255,255,0.08)'}`,
          }}
          data-testid={`filter-${cat}`}
        >
          {cat === 'all' ? 'All' : (labels[cat] || cat)}
        </button>
      ))}
    </div>
  );

  if (loading) {
    return (
      <div className="p-4 lg:p-6 pt-4 lg:pt-6 pb-24 lg:pb-6 space-y-6">
        <Skeleton className="h-12 w-64 bg-[var(--s)]" />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {[1,2,3,4].map(i => <Skeleton key={i} className="h-24 bg-[var(--s)] rounded-2xl" />)}
        </div>
        <Skeleton className="h-10 w-full bg-[var(--s)]" />
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {[1,2,3,4].map(i => <Skeleton key={i} className="h-36 bg-[var(--s)] rounded-2xl" />)}
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 lg:p-6 pt-4 lg:pt-6 pb-24 lg:pb-6 space-y-5 animate-fade-in" data-testid="financial-portal-page"
      style={{ background: 'radial-gradient(ellipse at top left, rgba(16,185,129,0.1), transparent 55%), radial-gradient(ellipse at bottom right, rgba(34,201,147,0.06), transparent 55%)' }}>

      <SectionLockBanner sectionId="financial_portal" />

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: 'linear-gradient(135deg, rgba(16,185,129,0.2), rgba(34,201,147,0.15))' }}>
            <DollarSign className="w-5 h-5 text-[#22C993]" />
          </div>
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-[var(--t)]" style={{ fontFamily: 'var(--sans)' }}>
              CarryOn Financial Picture (CFP)
            </h1>
            <p className="text-xs text-[var(--t5)]">
              Bills, debts, accounts, and property — your complete financial picture
            </p>
          </div>
        </div>
        <div className="flex gap-2 w-full sm:w-auto flex-wrap">
          <CfpVisibilityToggle estate={estate} onUpdate={setEstate} />
          <Button className="gold-button flex-1 sm:flex-initial" onClick={handleAddClick} data-testid="add-item-button">
            <Plus className="w-5 h-5 mr-2" />
            {addButtonLabel}
          </Button>
          <Button variant="outline" className="flex-shrink-0 border-[var(--b)] text-[var(--t3)] hover:bg-[var(--s)]"
            onClick={() => setShowQuickAdd(true)} data-testid="quick-add-button">
            <Sparkles className="w-4 h-4 mr-1.5 text-[var(--gold)]" /> Quick Add
          </Button>
          {estate?.id && (
            <Button
              variant="outline"
              className="flex-shrink-0 border-[var(--b)] text-[var(--t3)] hover:bg-[var(--s)]"
              onClick={() => handleHandoffExport()}
              disabled={exportingHandoff}
              data-testid="handoff-pdf-btn"
              title="Hand-off PDF for your beneficiaries"
            >
              {exportingHandoff ? (
                <Loader2 className="w-4 h-4 mr-1.5 animate-spin text-[var(--gold)]" />
              ) : (
                <FileDown className="w-4 h-4 mr-1.5 text-[var(--gold)]" />
              )}
              {exportingHandoff ? 'Generating…' : 'Hand-off PDF'}
            </Button>
          )}
        </div>
      </div>

      {/* Financial Summary Cards */}
      <FinancialSummary summary={summary} onNavigate={(tab) => setActiveTab(tab)} />

      {/* 30-day rolling cashflow timeline — beneficiaries see what's due before next paycheck */}
      {estate?.id && <CashflowTimeline estateId={estate.id} />}

      {/* Sub-Tab Navigation */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="bg-[var(--s)] p-1 w-full grid grid-cols-4 h-auto" data-testid="portal-tabs">
          <TabsTrigger value="bills" className="data-[state=active]:bg-[#10b981] data-[state=active]:text-white text-sm py-2.5 gap-2" data-testid="tab-bills">
            <Receipt className="w-4 h-4" />
            <span className="hidden sm:inline">Bills</span>
            <span className="sm:hidden">Bills</span>
          </TabsTrigger>
          <TabsTrigger value="debts" className="data-[state=active]:bg-[#ef4444] data-[state=active]:text-white text-sm py-2.5 gap-2" data-testid="tab-debts">
            <Landmark className="w-4 h-4" />
            <span className="hidden sm:inline">Debts</span>
            <span className="sm:hidden">Debts</span>
          </TabsTrigger>
          <TabsTrigger value="accounts" className="data-[state=active]:bg-[#3b82f6] data-[state=active]:text-white text-sm py-2.5 gap-2" data-testid="tab-accounts">
            <PiggyBank className="w-4 h-4" />
            <span className="hidden sm:inline">Accounts</span>
            <span className="sm:hidden">Accounts</span>
          </TabsTrigger>
          <TabsTrigger value="property" className="data-[state=active]:bg-[#8b5cf6] data-[state=active]:text-white text-sm py-2.5 gap-2" data-testid="tab-property">
            <Building2 className="w-4 h-4" />
            <span className="hidden sm:inline">Property</span>
            <span className="sm:hidden">Property</span>
          </TabsTrigger>
        </TabsList>

        {/* Search Bar */}
        <div className="flex items-center gap-2 mt-4 pb-2" style={{ borderBottom: '1px solid var(--b)' }}>
          <Search className="w-4 h-4 text-[var(--t5)]" />
          <input
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              clearTimeout(searchTimerRef.current);
              searchTimerRef.current = setTimeout(() => setDebouncedSearch(e.target.value), 250);
            }}
            placeholder={`Search ${activeTab}...`}
            className="flex-1 bg-transparent border-none text-[var(--t)] text-sm outline-none placeholder:text-[var(--t5)]"
            data-testid="financial-search"
          />
        </div>

        {/* ============ BILLS TAB ============ */}
        <TabsContent value="bills" className="mt-4">
          {renderCategoryBubbles(activeBillCats, billFilter, setBillFilter, billLabels)}
          <div className="mt-4 flex flex-col lg:flex-row gap-6">
            {/* Mobile: Calendar on top */}
            <div className="lg:hidden">
              <BillCalendar
                bills={bills}
                month={calendarMonth}
                onMonthChange={setCalendarMonth}
                selectedDay={selectedCalendarDay}
                onDaySelect={setSelectedCalendarDay}
                categoryLabels={billLabels}
              />
            </div>
            {/* Bill tiles */}
            <div className="flex-1 min-w-0">
              {filteredBills.length === 0 ? (
                <Card className="glass-card">
                  <CardContent className="p-12 text-center">
                    <Receipt className="w-16 h-16 mx-auto text-[#10b981] mb-4 opacity-50" />
                    <h3 className="text-xl font-semibold text-[var(--t)] mb-2">No Bills Yet</h3>
                    <p className="text-[var(--t4)] mb-6 text-sm">Add your first bill to start tracking payments and due dates.</p>
                    <Button className="gold-button" onClick={() => { setEditItem(null); setShowBillForm(true); }} data-testid="add-first-bill">
                      <Plus className="w-5 h-5 mr-2" /> Add Your First Bill
                    </Button>
                  </CardContent>
                </Card>
              ) : (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  {filteredBills.map(bill => (
                    <BillTile
                      key={bill.id}
                      bill={bill}
                      categoryLabels={billLabels}
                      beneficiaries={beneficiaries}
                      onEdit={(b) => { setEditItem(b); setShowBillForm(true); }}
                      onDelete={(id) => handleDelete('bills', id)}
                      onDesignationUpdate={(id, bens, timing) => handleDesignationUpdate('bills', id, bens, timing)}
                    />
                  ))}
                </div>
              )}
            </div>
            {/* Desktop: Calendar on right */}
            <div className="hidden lg:block lg:w-[340px] lg:flex-shrink-0 lg:sticky lg:top-4 lg:self-start">
              <BillCalendar
                bills={bills}
                month={calendarMonth}
                onMonthChange={setCalendarMonth}
                selectedDay={selectedCalendarDay}
                onDaySelect={setSelectedCalendarDay}
                categoryLabels={billLabels}
              />
            </div>
          </div>
        </TabsContent>

        {/* ============ DEBTS TAB ============ */}
        <TabsContent value="debts" className="mt-4">
          {renderCategoryBubbles(activeDebtCats, debtFilter, setDebtFilter, debtLabels)}
          <div className="mt-4">
            {filteredDebts.length === 0 ? (
              <Card className="glass-card">
                <CardContent className="p-12 text-center">
                  <Landmark className="w-16 h-16 mx-auto text-[#ef4444] mb-4 opacity-50" />
                  <h3 className="text-xl font-semibold text-[var(--t)] mb-2">No Debts Tracked</h3>
                  <p className="text-[var(--t4)] mb-6 text-sm">Add mortgages, loans, and credit cards so your family knows the full picture.</p>
                  <Button className="gold-button" onClick={() => { setEditItem(null); setShowDebtForm(true); }} data-testid="add-first-debt">
                    <Plus className="w-5 h-5 mr-2" /> Add Your First Debt
                  </Button>
                </CardContent>
              </Card>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {filteredDebts.map(debt => (
                  <DebtTile
                    key={debt.id}
                    debt={debt}
                    categoryLabels={debtLabels}
                    beneficiaries={beneficiaries}
                    onEdit={(d) => { setEditItem(d); setShowDebtForm(true); }}
                    onDelete={(id) => handleDelete('debts', id)}
                    onDesignationUpdate={(id, bens, timing) => handleDesignationUpdate('debts', id, bens, timing)}
                  />
                ))}
              </div>
            )}
          </div>
        </TabsContent>

        {/* ============ ACCOUNTS TAB ============ */}
        <TabsContent value="accounts" className="mt-4">
          {renderCategoryBubbles(activeAcctCats, accountFilter, setAccountFilter, acctLabels)}
          <div className="mt-4">
            {filteredAccounts.length === 0 ? (
              <Card className="glass-card">
                <CardContent className="p-12 text-center">
                  <PiggyBank className="w-16 h-16 mx-auto text-[#3b82f6] mb-4 opacity-50" />
                  <h3 className="text-xl font-semibold text-[var(--t)] mb-2">No Accounts Registered</h3>
                  <p className="text-[var(--t4)] mb-6 text-sm">List checking, savings, investments, and other accounts for a complete financial picture.</p>
                  <Button className="gold-button" onClick={() => { setEditItem(null); setShowAccountForm(true); }} data-testid="add-first-account">
                    <Plus className="w-5 h-5 mr-2" /> Add Your First Account
                  </Button>
                </CardContent>
              </Card>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {filteredAccounts.map(acct => (
                  <AccountTile
                    key={acct.id}
                    account={acct}
                    categoryLabels={acctLabels}
                    beneficiaries={beneficiaries}
                    onEdit={(a) => { setEditItem(a); setShowAccountForm(true); }}
                    onDelete={(id) => handleDelete('accounts', id)}
                    onDesignationUpdate={(id, bens, timing) => handleDesignationUpdate('accounts', id, bens, timing)}
                  />
                ))}
              </div>
            )}
          </div>
        </TabsContent>

        {/* ============ PROPERTY TAB ============ */}
        <TabsContent value="property" className="mt-4">
          <div>
            {propertyAssets.length === 0 ? (
              <Card className="glass-card">
                <CardContent className="p-12 text-center">
                  <Building2 className="w-16 h-16 mx-auto text-[#8b5cf6] mb-4 opacity-50" />
                  <h3 className="text-xl font-semibold text-[var(--t)] mb-2">No Property or Assets Yet</h3>
                  <p className="text-[var(--t4)] mb-6 text-sm">Add real estate, vehicles, businesses, jewelry, artwork, or other valuables.</p>
                  <Button className="gold-button" onClick={() => { setEditItem(null); setShowPropertyForm(true); }} data-testid="add-first-property">
                    <Plus className="w-5 h-5 mr-2" /> Add Your First Asset
                  </Button>
                </CardContent>
              </Card>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {propertyAssets.map(asset => (
                  <PropertyAssetTile
                    key={asset.id}
                    asset={asset}
                    beneficiaries={beneficiaries}
                    onEdit={(a) => { setEditItem(a); setShowPropertyForm(true); }}
                    onDelete={(id) => handleDelete('property', id)}
                    onDesignationUpdate={(id, bens, timing) => handleDesignationUpdate('property', id, bens, timing)}
                  />
                ))}
              </div>
            )}
          </div>
        </TabsContent>
      </Tabs>

      {/* ============ SLIDE PANELS ============ */}
      <SlidePanel open={showBillForm} onClose={() => { setShowBillForm(false); setEditItem(null); }}
        title={editItem ? 'Edit Bill' : 'Add Bill'} subtitle="Track a recurring or one-time bill">
        <BillForm
          estateId={estate?.id}
          bill={editItem}
          categories={billCats}
          categoryLabels={billLabels}
          davEntries={davEntries}
          beneficiaries={beneficiaries}
          onSaved={handleSaved}
          onAddCategory={(name) => handleAddCategory('bills', name)}
          getAuthHeaders={getAuthHeaders}
        />
      </SlidePanel>

      <SlidePanel open={showDebtForm} onClose={() => { setShowDebtForm(false); setEditItem(null); }}
        title={editItem ? 'Edit Debt' : 'Add Debt'} subtitle="Track a liability or loan">
        <DebtForm
          estateId={estate?.id}
          debt={editItem}
          categories={debtCats}
          categoryLabels={debtLabels}
          davEntries={davEntries}
          beneficiaries={beneficiaries}
          onSaved={handleSaved}
          onAddCategory={(name) => handleAddCategory('debts', name)}
          getAuthHeaders={getAuthHeaders}
        />
      </SlidePanel>

      <SlidePanel open={showAccountForm} onClose={() => { setShowAccountForm(false); setEditItem(null); }}
        title={editItem ? 'Edit Account' : 'Add Account'} subtitle="Register a financial account">
        <AccountForm
          estateId={estate?.id}
          account={editItem}
          categories={acctCats}
          categoryLabels={acctLabels}
          davEntries={davEntries}
          beneficiaries={beneficiaries}
          bills={bills}
          onSaved={handleSaved}
          onAddCategory={(name) => handleAddCategory('accounts', name)}
          getAuthHeaders={getAuthHeaders}
        />
      </SlidePanel>

      <SlidePanel open={showPropertyForm} onClose={() => { setShowPropertyForm(false); setEditItem(null); }}
        title={editItem ? 'Edit Asset' : 'Add Property / Asset'} subtitle="Real estate, businesses, vehicles, jewelry, artwork, and more">
        <PropertyAssetForm
          estateId={estate?.id}
          asset={editItem}
          davEntries={davEntries}
          onSaved={handleSaved}
          getAuthHeaders={getAuthHeaders}
        />
      </SlidePanel>

      <SlidePanel open={showQuickAdd} onClose={() => setShowQuickAdd(false)}
        title={`Quick Add ${activeTab === 'debts' ? 'Debts' : activeTab === 'accounts' ? 'Accounts' : 'Bills'}`}
        subtitle="Type multiple names, AI categorizes them all">
        <QuickAdd
          estateId={estate?.id}
          module={activeTab}
          onDone={() => { setShowQuickAdd(false); fetchAll(); }}
          getAuthHeaders={getAuthHeaders}
        />
      </SlidePanel>
    </div>
  );
};

export default FinancialPortalPage;
