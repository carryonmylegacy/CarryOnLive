import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import apiClient from '../../utils/apiClient';
import { useAuth, useBrand } from '../../contexts/AuthContext';
import { useLabelCleaner } from '../../utils/brandLabel';
import {
  DollarSign, Receipt, Landmark, PiggyBank, Search, CheckCircle2,
  ChevronLeft, ChevronRight, Loader2, TrendingUp, TrendingDown,
  XCircle, Phone, ExternalLink, ClipboardList, X, Network,
} from 'lucide-react';
import { Card, CardContent } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../../components/ui/tabs';
import { Skeleton } from '../../components/ui/skeleton';
import { toast } from '../../utils/toast';
import BillCalendar from '../../components/financial/BillCalendar';
import { API_URL } from '../../config';
import {
  cacheBenSection, readBenSection,
  isOffline as isBenOffline,
} from '../../utils/beneficiaryOfflineCache';

const BILL_LABELS = {
  mortgage_rent: 'Mortgage/Rent', utilities: 'Utilities', insurance: 'Insurance',
  subscriptions: 'Subscriptions', credit_card: 'Credit Card', auto_vehicle: 'Auto/Vehicle',
  medical_health: 'Medical/Health', taxes: 'Taxes', hoa_condo: 'HOA/Condo',
  education_student: 'Education', phone_internet: 'Phone/Internet', childcare: 'Childcare', other: 'Other',
};
const DEBT_LABELS = {
  mortgage: 'Mortgage', auto_loan: 'Auto Loan', student_loan: 'Student Loan',
  credit_card: 'Credit Card', personal_loan: 'Personal Loan', medical_debt: 'Medical Debt',
  business_loan: 'Business Loan', heloc: 'HELOC', other: 'Other',
};
const ACCT_LABELS = {
  checking: 'Checking', savings: 'Savings', money_market: 'Money Market', cd: 'CD',
  investment: 'Investment', retirement: 'Retirement', pension: 'Pension',
  hsa_fsa: 'HSA/FSA', trust_account: 'Trust', life_insurance_cv: 'Life Ins.',
  annuity: 'Annuity', real_estate: 'Real Estate', business: 'Business', crypto: 'Crypto', other: 'Other',
};

const CAT_COLORS = {
  mortgage_rent: '#ef4444', utilities: '#f59e0b', insurance: '#8b5cf6',
  subscriptions: '#ec4899', credit_card: '#f97316', auto_vehicle: '#06b6d4',
  medical_health: '#10b981', taxes: '#6366f1', other: '#64748b',
};

const getDueInfo = (bill) => {
  if (!bill.due_day) return { text: 'No due date', color: '#64748b' };
  const today = new Date();
  const daysInMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();
  const effectiveDue = Math.min(bill.due_day, daysInMonth);
  let daysUntil = effectiveDue - today.getDate();
  if (daysUntil < 0) daysUntil += daysInMonth;
  if (daysUntil === 0) return { text: 'Due TODAY', color: '#ef4444' };
  if (daysUntil === 1) return { text: 'Due TOMORROW', color: '#f59e0b' };
  if (daysUntil <= 3) return { text: `Due in ${daysUntil} days`, color: '#f59e0b' };
  if (daysUntil <= 7) return { text: `Due in ${daysUntil} days`, color: '#3b82f6' };
  return { text: `Due in ${daysUntil} days`, color: '#64748b' };
};

const fmt = (n) => {
  if (n == null) return '$0';
  const abs = Math.abs(n);
  if (abs >= 1000000) return `$${(n / 1000000).toFixed(1)}M`;
  if (abs >= 1000) return `$${(n / 1000).toFixed(1)}K`;
  return `$${n.toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
};

const BeneficiaryFinancialPage = () => {
  const { user, getAuthHeaders } = useAuth();
  const brand = useBrand();
  const cleanLabel = useLabelCleaner();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('bills');
  const [bills, setBills] = useState([]);
  const [debts, setDebts] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [summary, setSummary] = useState(null);
  const [payments, setPayments] = useState({});
  const [loading, setLoading] = useState(true);
  const [markingPaid, setMarkingPaid] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [calendarMonth, setCalendarMonth] = useState(new Date());
  const [selectedCalendarDay, setSelectedCalendarDay] = useState(null);
  const [isTransitioned, setIsTransitioned] = useState(false);
  const [cancelAdvisor, setCancelAdvisor] = useState(null); // bill being cancelled
  const [esEntityCount, setEsEntityCount] = useState(0);
  const [esEstateId, setEsEstateId] = useState(null);

  useEffect(() => { fetchAll(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Pre-fetch the entity count from the read-only beneficiary view so
  // the "Entities & Structures" CTA card only renders if there's
  // something to actually show. Server returns visible=false (and an
  // empty list) when the beneficiary isn't allowed to see — exactly
  // what we want.
  useEffect(() => {
    const id = localStorage.getItem('beneficiary_estate_id');
    if (!id) return;
    setEsEstateId(id);
    let cancelled = false;
    (async () => {
      try {
        const res = await apiClient.get(
          `${API_URL}/financial/entities/beneficiary-view/${id}`,
          getAuthHeaders ? { headers: getAuthHeaders().headers } : {}
        );
        if (cancelled) return;
        if (res.data?.visible) setEsEntityCount((res.data.entities || []).length);
        else setEsEntityCount(0);
      } catch {
        if (!cancelled) setEsEntityCount(0);
      }
    })();
    return () => { cancelled = true; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const fetchAll = async () => {
    const estateId = localStorage.getItem('beneficiary_estate_id');
    if (!estateId) { navigate('/beneficiary'); return; }
    // Airplane-mode rescue — render the cached financial designations
    // for this estate so the beneficiary keeps seeing bills, debts,
    // accounts and the summary card without any network round-trip.
    if (isBenOffline()) {
      const cachedBills = readBenSection(estateId, 'financial_bills') || [];
      const cachedDebts = readBenSection(estateId, 'financial_debts') || [];
      const cachedAccts = readBenSection(estateId, 'financial_accounts') || [];
      const cachedSummary = readBenSection(estateId, 'financial_summary');
      const cachedPerms = readBenSection(estateId, 'permissions');
      const cachedPayments = readBenSection(estateId, 'financial_payments') || {};
      setIsTransitioned(Boolean(cachedPerms?.is_transitioned));
      setBills(cachedBills);
      setDebts(cachedDebts);
      setAccounts(cachedAccts);
      if (cachedSummary && typeof cachedSummary === 'object' && !Array.isArray(cachedSummary)) setSummary(cachedSummary);
      setPayments(cachedPayments);
      setLoading(false);
      return;
    }
    try {
      const headers = getAuthHeaders()?.headers;
      if (!headers) { setLoading(false); return; }

      // Check transition status
      const permsRes = await apiClient.get(`${API_URL}/beneficiary/my-permissions/${estateId}`, { headers }).catch(() => null);
      const transitioned = permsRes?.data?.is_transitioned || false;
      setIsTransitioned(transitioned);
      if (permsRes?.data) cacheBenSection(estateId, 'permissions', permsRes.data);

      const [billsRes, debtsRes, acctsRes, summaryRes] = await Promise.all([
        apiClient.get(`${API_URL}/financial/bills/${estateId}`, { headers }).catch(() => ({ data: [] })),
        apiClient.get(`${API_URL}/financial/debts/${estateId}`, { headers }).catch(() => ({ data: [] })),
        apiClient.get(`${API_URL}/financial/accounts/${estateId}`, { headers }).catch(() => ({ data: [] })),
        apiClient.get(`${API_URL}/financial/summary/${estateId}`, { headers }).catch(() => ({ data: null })),
      ]);
      const billsData = Array.isArray(billsRes.data) ? billsRes.data : [];
      const debtsData = Array.isArray(debtsRes.data) ? debtsRes.data : [];
      const acctsData = Array.isArray(acctsRes.data) ? acctsRes.data : [];
      setBills(billsData);
      setDebts(debtsData);
      setAccounts(acctsData);
      setSummary(summaryRes.data);
      // Cache for offline rehydration.
      cacheBenSection(estateId, 'financial_bills', billsData);
      cacheBenSection(estateId, 'financial_debts', debtsData);
      cacheBenSection(estateId, 'financial_accounts', acctsData);
      if (summaryRes.data) cacheBenSection(estateId, 'financial_summary', summaryRes.data);

      // Fetch payments for each bill
      const payMap = {};
      for (const bill of billsData) {
        try {
          const pRes = await apiClient.get(`${API_URL}/financial/bills/${bill.id}/payments`, { headers });
          payMap[bill.id] = Array.isArray(pRes.data) ? pRes.data : [];
        } catch { payMap[bill.id] = []; }
      }
      setPayments(payMap);
      cacheBenSection(estateId, 'financial_payments', payMap);
    } catch (err) { console.error('Beneficiary financial fetch error:', err); }
    setLoading(false);
  };

  const handleMarkPaid = async (billId) => {
    if (isBenOffline()) {
      toast.error('Marking a bill paid requires an internet connection.');
      return;
    }
    setMarkingPaid(billId);
    try {
      await apiClient.post(`${API_URL}/financial/bills/${billId}/pay`, { bill_id: billId }, getAuthHeaders());
      toast.success('Bill marked as paid');
      fetchAll();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to mark as paid');
    }
    setMarkingPaid(null);
  };

  // Is this bill paid for the current cycle?
  const isBillPaidThisCycle = (billId) => {
    const billPayments = payments[billId] || [];
    if (billPayments.length === 0) return false;
    const today = new Date();
    const currentMonth = today.getMonth();
    const currentYear = today.getFullYear();
    return billPayments.some(p => {
      const pDate = new Date(p.paid_date);
      return pDate.getMonth() === currentMonth && pDate.getFullYear() === currentYear;
    });
  };

  const filteredBills = useMemo(() => {
    let items = bills.filter(b => b.status !== 'cancelled');
    if (searchQuery) items = items.filter(b => b.name.toLowerCase().includes(searchQuery.toLowerCase()));
    return items;
  }, [bills, searchQuery]);

  const filteredDebts = useMemo(() => {
    if (searchQuery) return debts.filter(d => d.name.toLowerCase().includes(searchQuery.toLowerCase()));
    return debts;
  }, [debts, searchQuery]);

  const filteredAccounts = useMemo(() => {
    if (searchQuery) return accounts.filter(a => a.name.toLowerCase().includes(searchQuery.toLowerCase()));
    return accounts;
  }, [accounts, searchQuery]);

  if (loading) {
    return (
      <div className="p-4 lg:p-6 pt-4 lg:pt-6 pb-24 lg:pb-6 space-y-6">
        <Skeleton className="h-12 w-64 bg-[var(--s)]" />
        <div className="grid grid-cols-2 gap-3">{[1,2,3,4].map(i => <Skeleton key={i} className="h-24 bg-[var(--s)] rounded-2xl" />)}</div>
      </div>
    );
  }

  return (
    <div className="w-full max-w-[1400px] mx-auto p-4 lg:p-6 pt-4 lg:pt-6 pb-24 lg:pb-6 space-y-5 animate-fade-in" data-testid="beneficiary-financial-page"
      style={{ background: 'radial-gradient(ellipse at top left, rgba(16,185,129,0.1), transparent 55%)' }}>

      {/* Header */}
      <div className="flex items-center gap-3">
        <button onClick={() => navigate('/beneficiary')} className="p-2 rounded-xl hover:bg-[var(--s)] transition-colors" data-testid="back-btn" aria-label="Go back">
          <ChevronLeft className="w-5 h-5 text-[var(--t4)]" />
        </button>
        <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: 'linear-gradient(135deg, rgba(16,185,129,0.2), rgba(34,201,147,0.15))' }}>
          <DollarSign className="w-5 h-5 text-[#22C993]" />
        </div>
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-[var(--t)]" style={{ fontFamily: 'var(--sans)' }}>{cleanLabel(`${brand} Financial Picture (CFP)`)}</h1>
          <p className="text-xs text-[var(--t5)]">Bills, debts, and accounts for your reference</p>
        </div>
      </div>

      {/* Entities & Structures viewer link — appears when the
          benefactor has any E&S nodes available to this beneficiary
          (server-gated). Read-only chart with linked docs + permitted
          credentials. */}
      {esEntityCount > 0 && esEstateId && (
        <div
          onClick={() => navigate(`/beneficiary/entities/${esEstateId}`)}
          className="rounded-2xl p-4 cursor-pointer flex items-center gap-3 transition-transform duration-150 active:scale-[0.99]"
          style={{ background: 'rgba(var(--gold-rgb), 0.08)', border: '1px solid rgba(var(--gold-rgb), 0.45)' }}
          data-testid="ben-financial-entities-cta"
        >
          <div className="w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0"
            style={{ background: 'rgba(var(--gold-rgb), 0.18)' }}>
            <Network className="w-5 h-5 text-[var(--gold)]" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="font-bold text-[var(--t)]">Entities & Structures</div>
            <div className="text-xs text-[var(--t4)]">
              {esEntityCount} {esEntityCount === 1 ? 'entity' : 'entities'} — businesses, trusts and connections
            </div>
          </div>
          <ChevronRight className="w-4 h-4 text-[var(--t4)] flex-shrink-0" />
        </div>
      )}

      {/* Summary Cards */}
      {summary && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3" data-testid="ben-financial-summary">
          {[
            { label: 'Monthly Bills', value: fmt(summary.monthly_total), color: '#10b981', bg: 'rgba(16,185,129,0.1)' },
            { label: 'Total Debt', value: fmt(summary.total_debt), color: '#ef4444', bg: 'rgba(239,68,68,0.1)' },
            { label: 'Total Assets', value: fmt(summary.total_assets), color: '#3b82f6', bg: 'rgba(59,130,246,0.1)' },
            { label: 'Net Position', value: fmt(summary.net_position), color: summary.net_position >= 0 ? '#22C993' : '#ef4444', bg: summary.net_position >= 0 ? 'rgba(34,201,147,0.1)' : 'rgba(239,68,68,0.1)' },
          ].map(card => (
            <div key={card.label} className="rounded-2xl p-4" style={{ background: card.bg, border: `1px solid ${card.color}30` }}>
              <div className="text-lg font-bold text-[var(--t)]">{card.value}</div>
              <div className="text-xs text-[var(--t4)]">{card.label}</div>
            </div>
          ))}
        </div>
      )}

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="bg-[var(--s)] p-1 w-full grid grid-cols-3 h-auto">
          <TabsTrigger value="bills" className="data-[state=active]:bg-[#10b981] data-[state=active]:text-white text-sm py-2.5 gap-2">
            <Receipt className="w-4 h-4" /><span className="hidden sm:inline">Bills</span><span className="sm:hidden">Bills</span>
          </TabsTrigger>
          <TabsTrigger value="debts" className="data-[state=active]:bg-[#ef4444] data-[state=active]:text-white text-sm py-2.5 gap-2">
            <Landmark className="w-4 h-4" /><span>Debts</span>
          </TabsTrigger>
          <TabsTrigger value="accounts" className="data-[state=active]:bg-[#3b82f6] data-[state=active]:text-white text-sm py-2.5 gap-2">
            <PiggyBank className="w-4 h-4" /><span>Accounts</span>
          </TabsTrigger>
        </TabsList>

        {/* Search */}
        <div className="flex items-center gap-2 mt-4 pb-2" style={{ borderBottom: '1px solid var(--b)' }}>
          <Search className="w-4 h-4 text-[var(--t5)]" />
          <input value={searchQuery} onChange={e => setSearchQuery(e.target.value)} placeholder={`Search ${activeTab}...`}
            className="flex-1 bg-transparent border-none text-[var(--t)] text-sm outline-none placeholder:text-[var(--t5)]" data-testid="ben-financial-search" />
        </div>

        {/* BILLS */}
        <TabsContent value="bills" className="mt-4">
          <div className="flex flex-col lg:flex-row gap-6">
            <div className="lg:hidden">
              <BillCalendar bills={bills} month={calendarMonth} onMonthChange={setCalendarMonth}
                selectedDay={selectedCalendarDay} onDaySelect={setSelectedCalendarDay} categoryLabels={BILL_LABELS} />
            </div>
            <div className="flex-1 min-w-0">
              {filteredBills.length === 0 ? (
                <Card className="glass-card"><CardContent className="p-12 text-center">
                  <Receipt className="w-16 h-16 mx-auto text-[#10b981] mb-4 opacity-50" />
                  <h3 className="text-xl font-semibold text-[var(--t)] mb-2">No Bills Visible</h3>
                  <p className="text-[var(--t4)] text-sm">No bills have been shared with you yet.</p>
                </CardContent></Card>
              ) : (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  {filteredBills.map(bill => {
                    const due = getDueInfo(bill);
                    const paid = isBillPaidThisCycle(bill.id);
                    return (
                      <Card key={bill.id} className={`glass-card relative overflow-hidden ${paid ? 'opacity-70' : ''}`} data-testid={`ben-bill-${bill.id}`}>
                        {!paid && due.color === '#ef4444' && <div className="absolute top-0 left-0 right-0 h-0.5" style={{ background: due.color }} />}
                        {paid && <div className="absolute top-0 left-0 right-0 h-0.5 bg-[#10b981]" />}
                        <CardContent className="p-4">
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-1">
                                <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: CAT_COLORS[bill.category] || '#64748b' }} />
                                <h3 className="text-sm font-bold text-[var(--t)] truncate">{bill.name}</h3>
                                {paid && <CheckCircle2 className="w-4 h-4 text-[#10b981] flex-shrink-0" />}
                              </div>
                              <p className="text-xs text-[var(--t5)]">{BILL_LABELS[bill.category] || bill.category}</p>
                            </div>
                            {bill.amount && <div className="text-lg font-bold text-[var(--t)]">${bill.amount.toLocaleString()}</div>}
                          </div>
                          <div className="flex items-center gap-3 text-xs mt-2 py-2" style={{ borderTop: '1px solid var(--b)' }}>
                            <span style={{ color: paid ? '#10b981' : due.color }} className="font-bold">{paid ? 'Paid this cycle' : due.text}</span>
                            {bill.is_auto_pay && (
                              <span className="flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full font-bold" style={{ background: 'rgba(16,185,129,0.12)', color: '#10b981' }}>
                                <CheckCircle2 className="w-3 h-3" /> Auto-Pay
                              </span>
                            )}
                          </div>
                          {bill.payment_account && <p className="text-[11px] text-[var(--t5)] mt-1">From: {bill.payment_account}</p>}
                          {bill.notes && <p className="text-xs text-[var(--t4)] mt-2 p-2 rounded-lg" style={{ background: 'rgba(255,255,255,0.03)' }}>{bill.notes}</p>}
                          {bill.biller_website && (
                            <a href={bill.biller_website} target="_blank" rel="noopener noreferrer"
                              className="text-xs text-[#3b82f6] hover:underline mt-1 block truncate">{bill.biller_website}</a>
                          )}
                          {/* Mark as Paid — only post-transition */}
                          {isTransitioned && !paid && (
                            <Button size="sm" className="mt-3 w-full bg-[#10b981] hover:bg-[#059669] text-white"
                              onClick={() => handleMarkPaid(bill.id)} disabled={markingPaid === bill.id}
                              data-testid={`mark-paid-${bill.id}`}>
                              {markingPaid === bill.id ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <CheckCircle2 className="w-4 h-4 mr-1" />}
                              Mark as Paid
                            </Button>
                          )}
                          {/* Cancel This — for optional/subscription bills post-transition */}
                          {isTransitioned && (bill.priority === 'optional' || bill.category === 'subscriptions') && bill.status === 'active' && (
                            <button
                              onClick={() => setCancelAdvisor(bill)}
                              className="mt-2 w-full py-2 rounded-xl text-xs font-bold text-center transition-all"
                              style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', color: '#ef4444' }}
                              data-testid={`cancel-advisor-${bill.id}`}>
                              <XCircle className="w-3.5 h-3.5 inline mr-1" /> Cancel This Bill
                            </button>
                          )}
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              )}
            </div>
            <div className="hidden lg:block lg:w-[340px] lg:flex-shrink-0 lg:sticky lg:top-4 lg:self-start">
              <BillCalendar bills={bills} month={calendarMonth} onMonthChange={setCalendarMonth}
                selectedDay={selectedCalendarDay} onDaySelect={setSelectedCalendarDay} categoryLabels={BILL_LABELS} />
            </div>
          </div>
        </TabsContent>

        {/* DEBTS */}
        <TabsContent value="debts" className="mt-4">
          {filteredDebts.length === 0 ? (
            <Card className="glass-card"><CardContent className="p-12 text-center">
              <Landmark className="w-16 h-16 mx-auto text-[#ef4444] mb-4 opacity-50" />
              <h3 className="text-xl font-semibold text-[var(--t)] mb-2">No Debts Visible</h3>
              <p className="text-[var(--t4)] text-sm">No debts have been shared with you yet.</p>
            </CardContent></Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredDebts.map(debt => {
                const statusColors = { active: '#10b981', paid_off: '#3b82f6', forbearance: '#f59e0b', collections: '#ef4444' };
                return (
                  <Card key={debt.id} className="glass-card" data-testid={`ben-debt-${debt.id}`}>
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <div className="flex-1 min-w-0">
                          <h3 className="text-sm font-bold text-[var(--t)] truncate">{debt.name}</h3>
                          <p className="text-xs text-[var(--t5)]">{DEBT_LABELS[debt.category] || debt.category}</p>
                        </div>
                        <div className="text-right flex-shrink-0">
                          {debt.outstanding_balance != null && <div className="text-lg font-bold text-[var(--t)]">${debt.outstanding_balance.toLocaleString()}</div>}
                          <span className="text-[11px] px-2 py-0.5 rounded-full font-bold" style={{ background: `${statusColors[debt.status] || '#64748b'}20`, color: statusColors[debt.status] || '#64748b' }}>
                            {debt.status?.replace(/_/g, ' ')}
                          </span>
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-2 text-xs py-2" style={{ borderTop: '1px solid var(--b)' }}>
                        {debt.monthly_payment != null && <div><span className="text-[var(--t5)]">Monthly: </span><span className="text-[var(--t)]">${debt.monthly_payment.toLocaleString()}</span></div>}
                        {debt.interest_rate != null && <div><span className="text-[var(--t5)]">Rate: </span><span className="text-[var(--t)]">{debt.interest_rate}%</span></div>}
                        {debt.lender_name && <div className="col-span-2"><span className="text-[var(--t5)]">Lender: </span><span className="text-[var(--t)]">{debt.lender_name}</span></div>}
                        {debt.collateral && <div className="col-span-2"><span className="text-[var(--t5)]">Secured by: </span><span className="text-[var(--t)]">{debt.collateral}</span></div>}
                      </div>
                      {debt.notes && <p className="text-xs text-[var(--t4)] mt-2 p-2 rounded-lg" style={{ background: 'rgba(255,255,255,0.03)' }}>{debt.notes}</p>}
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </TabsContent>

        {/* ACCOUNTS */}
        <TabsContent value="accounts" className="mt-4">
          {filteredAccounts.length === 0 ? (
            <Card className="glass-card"><CardContent className="p-12 text-center">
              <PiggyBank className="w-16 h-16 mx-auto text-[#3b82f6] mb-4 opacity-50" />
              <h3 className="text-xl font-semibold text-[var(--t)] mb-2">No Accounts Visible</h3>
              <p className="text-[var(--t4)] text-sm">No accounts have been shared with you yet.</p>
            </CardContent></Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredAccounts.map(acct => (
                <Card key={acct.id} className="glass-card" data-testid={`ben-acct-${acct.id}`}>
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <div className="flex-1 min-w-0">
                        <h3 className="text-sm font-bold text-[var(--t)] truncate">{acct.name}</h3>
                        <p className="text-xs text-[var(--t5)]">{ACCT_LABELS[acct.category] || acct.category}</p>
                      </div>
                      <div className="text-right flex-shrink-0">
                        {acct.approximate_balance != null && <div className="text-lg font-bold text-[var(--t)]">${acct.approximate_balance.toLocaleString()}</div>}
                      </div>
                    </div>
                    <div className="text-xs space-y-1 py-2" style={{ borderTop: '1px solid var(--b)' }}>
                      {acct.institution_name && <div><span className="text-[var(--t5)]">Institution: </span><span className="text-[var(--t)]">{acct.institution_name}</span></div>}
                      {acct.account_number_masked && <div><span className="text-[var(--t5)]">Account: </span><span className="text-[var(--t)]">···{acct.account_number_masked}</span></div>}
                      {acct.ownership_type && acct.ownership_type !== 'individual' && <div><span className="text-[var(--t5)]">Ownership: </span><span className="text-[var(--t)]">{acct.ownership_type.replace(/_/g, ' ')}</span></div>}
                      {acct.joint_owner && <div><span className="text-[var(--t5)]">Joint w/: </span><span className="text-[var(--t)]">{acct.joint_owner}</span></div>}
                      {acct.named_beneficiary_at_institution && <div><span className="text-[var(--t5)]">Beneficiary at inst.: </span><span className="text-[var(--t)]">{acct.named_beneficiary_at_institution}</span></div>}
                    </div>
                    {acct.notes && <p className="text-xs text-[var(--t4)] mt-2 p-2 rounded-lg" style={{ background: 'rgba(255,255,255,0.03)' }}>{acct.notes}</p>}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* ============ BILL CANCELLATION ADVISOR ============ */}
      {cancelAdvisor && (
        <div className="fixed inset-0 z-[120] flex items-end sm:items-center justify-center" data-testid="cancel-advisor-overlay">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setCancelAdvisor(null)} />
          <div className="relative w-full max-w-lg mx-4 mb-4 sm:mb-0 rounded-2xl overflow-hidden animate-fade-in"
            style={{ background: 'var(--bg2)', border: '1px solid rgba(239,68,68,0.2)' }}>
            {/* Header */}
            <div className="flex items-center justify-between p-4" style={{ borderBottom: '1px solid var(--b)', background: 'rgba(239,68,68,0.06)' }}>
              <div className="flex items-center gap-2">
                <XCircle className="w-5 h-5 text-[#ef4444]" />
                <h3 className="text-base font-bold text-[var(--t)]" style={{ fontFamily: 'var(--sans)' }}>Cancellation Guide</h3>
              </div>
              <button onClick={() => setCancelAdvisor(null)} className="p-1.5 rounded-lg hover:bg-[var(--s)]" data-testid="cancel-advisor-close">
                <X className="w-4 h-4 text-[var(--t4)]" />
              </button>
            </div>

            <div className="p-4 space-y-4 max-h-[60vh] overflow-y-auto">
              {/* Bill info */}
              <div className="rounded-xl p-3" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid var(--b)' }}>
                <div className="text-sm font-bold text-[var(--t)] mb-1">{cancelAdvisor.name}</div>
                <div className="text-xs text-[var(--t5)]">
                  {BILL_LABELS[cancelAdvisor.category] || cancelAdvisor.category}
                  {cancelAdvisor.amount && ` — $${cancelAdvisor.amount.toLocaleString()}/mo`}
                </div>
              </div>

              {/* Cancellation Checklist */}
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <ClipboardList className="w-4 h-4 text-[var(--gold)]" />
                  <span className="text-sm font-bold text-[var(--t)]">Cancellation Checklist</span>
                </div>
                <div className="space-y-2">
                  {[
                    { step: 1, text: 'Verify if this bill has any early termination fee or contract obligation' },
                    { step: 2, text: 'Confirm final payment date and any outstanding balance' },
                    { step: 3, text: cancelAdvisor.biller_phone ? `Call the biller at ${cancelAdvisor.biller_phone} to request cancellation` : 'Contact the biller to request cancellation' },
                    { step: 4, text: 'Request a cancellation confirmation number or email for your records' },
                    { step: 5, text: 'If on auto-pay, verify the auto-pay has been stopped to prevent future charges' },
                  ].map(item => (
                    <div key={item.step} className="flex items-start gap-3 py-2 px-3 rounded-lg" style={{ background: 'rgba(255,255,255,0.02)' }}>
                      <div className="w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 text-[11px] font-bold"
                        style={{ background: 'rgba(var(--gold-rgb), 0.15)', color: '#d4af37', border: '1px solid rgba(var(--gold-rgb), 0.3)' }}>
                        {item.step}
                      </div>
                      <span className="text-xs text-[var(--t3)] leading-relaxed">{item.text}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Benefactor's instructions */}
              {cancelAdvisor.notes && (
                <div className="rounded-xl p-3" style={{ background: 'rgba(var(--gold-rgb), 0.06)', border: '1px solid rgba(var(--gold-rgb), 0.15)' }}>
                  <div className="text-[11px] font-bold text-[var(--gold)] uppercase tracking-wider mb-1.5">Instructions from Benefactor</div>
                  <p className="text-xs text-[var(--t3)] leading-relaxed">{cancelAdvisor.notes}</p>
                </div>
              )}

              {/* Quick actions */}
              <div className="space-y-2">
                {cancelAdvisor.biller_phone && (
                  <a href={`tel:${cancelAdvisor.biller_phone.replace(/\D/g, '')}`}
                    className="flex items-center gap-3 w-full py-3 px-4 rounded-xl text-sm font-medium transition-all"
                    style={{ background: 'rgba(59,130,246,0.08)', border: '1px solid rgba(59,130,246,0.2)', color: '#3b82f6' }}
                    data-testid="cancel-call-biller">
                    <Phone className="w-4 h-4" />
                    Call {cancelAdvisor.biller_phone}
                  </a>
                )}
                {cancelAdvisor.biller_website && (
                  <a href={cancelAdvisor.biller_website} target="_blank" rel="noopener noreferrer"
                    className="flex items-center gap-3 w-full py-3 px-4 rounded-xl text-sm font-medium transition-all"
                    style={{ background: 'rgba(139,92,246,0.08)', border: '1px solid rgba(139,92,246,0.2)', color: '#8b5cf6' }}
                    data-testid="cancel-visit-portal">
                    <ExternalLink className="w-4 h-4" />
                    Visit Biller Portal
                  </a>
                )}
              </div>

              {/* Payment account warning */}
              {cancelAdvisor.is_auto_pay && cancelAdvisor.payment_account && (
                <div className="rounded-xl p-3" style={{ background: 'rgba(245,166,35,0.08)', border: '1px solid rgba(245,166,35,0.2)' }}>
                  <div className="text-xs font-bold text-[#f5a623] mb-1">Auto-Pay Warning</div>
                  <p className="text-xs text-[var(--t4)]">
                    This bill auto-pays from <strong className="text-[var(--t)]">{cancelAdvisor.payment_account}</strong>. 
                    After cancelling, verify the auto-pay has been removed to prevent future charges.
                  </p>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="p-4" style={{ borderTop: '1px solid var(--b)' }}>
              <button onClick={() => setCancelAdvisor(null)}
                className="w-full py-3 rounded-xl text-sm font-bold transition-all"
                style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid var(--b)', color: 'var(--t3)' }}
                data-testid="cancel-advisor-done">
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default BeneficiaryFinancialPage;
