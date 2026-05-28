import React, { useState } from 'react';
import { Loader2, Sparkles, Plus, CheckCircle2, AlertCircle } from 'lucide-react';
import { Button } from '../ui/button';
import { Textarea } from '../ui/textarea';
import { toast } from '../../utils/toast';
import apiClient from '../../utils/apiClient';
import { API_URL } from '../../config';

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

const QuickAdd = ({ estateId, module, onDone, getAuthHeaders }) => {
  const [input, setInput] = useState('');
  const [processing, setProcessing] = useState(false);
  const [results, setResults] = useState([]);
  const [saving, setSaving] = useState(false);

  const labels = module === 'debts' ? DEBT_LABELS : module === 'accounts' ? ACCT_LABELS : BILL_LABELS;

  const handleProcess = async () => {
    const names = input.split('\n').map(s => s.trim()).filter(Boolean);
    if (names.length === 0) { toast.error('Enter at least one name'); return; }
    setProcessing(true);
    setResults([]);

    const processed = [];
    for (const name of names) {
      try {
        const res = await apiClient.post(`${API_URL}/financial/smart-categorize`, { bill_name: name, module }, getAuthHeaders());
        processed.push({ name, ai: res.data, selected: true, status: 'ready' });
      } catch {
        processed.push({ name, ai: { category: 'other' }, selected: true, status: 'ready' });
      }
      setResults([...processed]);
    }
    setProcessing(false);
  };

  const toggleItem = (idx) => {
    setResults(prev => prev.map((r, i) => i === idx ? { ...r, selected: !r.selected } : r));
  };

  const handleSaveAll = async () => {
    const toSave = results.filter(r => r.selected && r.status === 'ready');
    if (toSave.length === 0) { toast.error('No items selected'); return; }
    setSaving(true);

    const endpoint = `${API_URL}/financial/${module}`;
    let saved = 0;
    let failed = 0;
    let lastError = '';
    const updated = [...results];

    for (let i = 0; i < updated.length; i++) {
      if (!updated[i].selected || updated[i].status !== 'ready') continue;
      try {
        const ai = updated[i].ai;
        const payload = { estate_id: estateId, name: updated[i].name, category: ai.category || 'other' };
        if (module === 'bills') {
          Object.assign(payload, {
            biller_phone: ai.biller_phone || null,
            biller_website: ai.biller_website || null,
            payment_method: ai.payment_method || 'manual_online',
            is_auto_pay: ai.is_auto_pay || false,
            frequency: ai.frequency || 'monthly',
          });
        } else if (module === 'debts') {
          Object.assign(payload, { lender_phone: ai.biller_phone || null, lender_website: ai.biller_website || null });
        } else {
          Object.assign(payload, { institution_phone: ai.biller_phone || null, institution_website: ai.biller_website || null });
        }
        await apiClient.post(endpoint, payload, getAuthHeaders());
        updated[i] = { ...updated[i], status: 'saved' };
        saved++;
      } catch (err) {
        // Capture detail per-row so the user can see WHY a specific
        // entry failed (Pydantic 422 / 403 estate-access / network).
        const d = err?.response?.data?.detail;
        let errMsg = 'Save failed';
        if (Array.isArray(d) && d.length) {
          const f = Array.isArray(d[0].loc) ? d[0].loc.slice(-1)[0] : '';
          errMsg = f ? `${f}: ${d[0].msg}` : d[0].msg || errMsg;
        } else if (typeof d === 'string') {
          errMsg = d;
        } else if (err?.response?.status === 403) {
          errMsg = 'No permission on this estate';
        } else if (err?.response?.status) {
          errMsg = `HTTP ${err.response.status}`;
        } else if (err?.message) {
          errMsg = err.message;
        }
        updated[i] = { ...updated[i], status: 'error', errorMsg: errMsg };
        lastError = errMsg;
        failed++;
      }
      setResults([...updated]);
    }

    setSaving(false);
    // Truthful, non-contradictory toast: success only if 100% saved;
    // mixed if some failed; pure error if 0 saved.
    if (saved > 0 && failed === 0) {
      toast.success(`${saved} ${module} added successfully`);
      setTimeout(() => onDone(), 500);
    } else if (saved > 0 && failed > 0) {
      toast.error(`${saved} added, ${failed} failed${lastError ? ` — ${lastError}` : ''}`);
    } else {
      toast.error(`Could not add any ${module}${lastError ? ` — ${lastError}` : ''}`);
    }
  };

  const selectedCount = results.filter(r => r.selected && r.status === 'ready').length;
  const savedCount = results.filter(r => r.status === 'saved').length;

  return (
    <div className="space-y-4 py-4" data-testid="quick-add-panel">
      {/* Step 1: Enter names */}
      {results.length === 0 && (
        <>
          <div className="rounded-xl p-3" style={{ background: 'rgba(var(--gold-rgb), 0.06)', border: '1px solid rgba(var(--gold-rgb), 0.15)' }}>
            <div className="flex items-center gap-2 mb-1">
              <Sparkles className="w-4 h-4 text-[var(--gold)]" />
              <span className="text-sm font-bold text-[var(--t)]">AI-Powered Quick Add</span>
            </div>
            <p className="text-xs text-[var(--t4)]">
              Type one {module === 'debts' ? 'debt' : module === 'accounts' ? 'account' : 'bill'} name per line. AI will auto-categorize each one and fill in biller details where known.
            </p>
          </div>

          <Textarea
            value={input}
            onChange={e => setInput(e.target.value)}
            placeholder={module === 'bills'
              ? "Duke Energy Electric\nNetflix\nState Farm Auto Insurance\nMortgage - Wells Fargo\nSpectrum Internet\nT-Mobile\nGEICO Car Insurance"
              : module === 'debts'
              ? "Home Mortgage - Wells Fargo\nCar Loan - Capital One\nStudent Loan - FedLoan\nChase Visa\nBest Buy Credit Card"
              : "Chase Checking\nWells Fargo Savings\nFidelity 401k\nVanguard IRA\nCoinbase Crypto"}
            className="input-field min-h-[200px] text-sm font-mono"
            data-testid="quick-add-input"
          />

          <Button className="gold-button w-full" onClick={handleProcess} disabled={processing || !input.trim()} data-testid="quick-add-process-btn">
            {processing ? <Loader2 className="w-5 h-5 mr-2 animate-spin" /> : <Sparkles className="w-5 h-5 mr-2" />}
            {processing ? 'AI is categorizing...' : 'Categorize with AI'}
          </Button>
        </>
      )}

      {/* Step 2: Review AI results */}
      {results.length > 0 && (
        <>
          <div className="flex items-center justify-between">
            <span className="text-sm font-bold text-[var(--t)]">{results.length} items categorized</span>
            {savedCount === 0 && (
              <button onClick={() => setResults([])} className="text-xs text-[var(--t4)] hover:underline" data-testid="quick-add-back">
                Back to edit
              </button>
            )}
          </div>

          <div className="space-y-2 max-h-[50vh] overflow-y-auto" data-testid="quick-add-results">
            {results.map((item, idx) => (
              <div key={idx} className="flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all"
                style={{
                  background: item.status === 'saved' ? 'rgba(16,185,129,0.06)' : item.status === 'error' ? 'rgba(239,68,68,0.06)' : item.selected ? 'rgba(var(--gold-rgb), 0.04)' : 'rgba(255,255,255,0.02)',
                  border: `1px solid ${item.status === 'saved' ? 'rgba(16,185,129,0.2)' : item.status === 'error' ? 'rgba(239,68,68,0.2)' : item.selected ? 'rgba(var(--gold-rgb), 0.15)' : 'var(--b)'}`,
                  opacity: item.selected || item.status !== 'ready' ? 1 : 0.5,
                }}
                data-testid={`quick-add-item-${idx}`}
              >
                {item.status === 'saved' ? (
                  <CheckCircle2 className="w-5 h-5 text-[#10b981] flex-shrink-0" />
                ) : item.status === 'error' ? (
                  <AlertCircle className="w-5 h-5 text-[#ef4444] flex-shrink-0" />
                ) : (
                  <button onClick={() => toggleItem(idx)} className="w-5 h-5 rounded-md flex-shrink-0 flex items-center justify-center transition-all"
                    style={{ background: item.selected ? '#d4af37' : 'rgba(255,255,255,0.08)', border: `1px solid ${item.selected ? '#d4af37' : 'var(--b)'}` }}>
                    {item.selected && <CheckCircle2 className="w-3 h-3 text-[#080e1a]" />}
                  </button>
                )}
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold text-[var(--t)] truncate">{item.name}</div>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-[11px] px-2 py-0.5 rounded-full font-bold"
                      style={{ background: 'rgba(16,185,129,0.1)', color: '#10b981' }}>
                      {labels[item.ai?.category] || item.ai?.category || 'Other'}
                    </span>
                    {item.ai?.biller_phone && (
                      <span className="text-[11px] text-[var(--t5)] truncate">{item.ai.biller_phone}</span>
                    )}
                    {item.ai?.is_auto_pay && (
                      <span className="text-[11px] text-[#10b981] font-bold">AP</span>
                    )}
                  </div>
                </div>
                {item.status === 'saved' && <span className="text-[11px] font-bold text-[#10b981]">Added</span>}
                {item.status === 'error' && (
                  <span className="text-[11px] font-bold text-[#ef4444]" title={item.errorMsg || 'Failed'}>
                    {item.errorMsg ? `Failed — ${item.errorMsg}` : 'Failed'}
                  </span>
                )}
              </div>
            ))}
          </div>

          {savedCount < results.length && (
            <Button className="gold-button w-full" onClick={handleSaveAll} disabled={saving || selectedCount === 0} data-testid="quick-add-save-btn">
              {saving ? <Loader2 className="w-5 h-5 mr-2 animate-spin" /> : <Plus className="w-5 h-5 mr-2" />}
              {saving ? 'Adding...' : `Add ${selectedCount} ${module}`}
            </Button>
          )}
        </>
      )}

      {/* Processing indicator */}
      {processing && results.length > 0 && results.length < input.split('\n').filter(s => s.trim()).length && (
        <div className="flex items-center gap-2 text-xs text-[var(--t4)]">
          <Loader2 className="w-3 h-3 animate-spin" />
          Categorizing {results.length + 1} of {input.split('\n').filter(s => s.trim()).length}...
        </div>
      )}
    </div>
  );
};

export default QuickAdd;
