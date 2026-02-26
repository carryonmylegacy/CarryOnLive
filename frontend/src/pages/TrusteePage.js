import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { useAuth } from '../contexts/AuthContext';
import { loadStripe } from '@stripe/stripe-js';
import { Elements, CardElement, useStripe, useElements } from '@stripe/react-stripe-js';
import {
  Shield,
  Plus,
  ChevronRight,
  ChevronLeft,
  Package,
  Lock,
  DollarSign,
  Mail,
  Flame,
  Clock,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  CreditCard,
  Key,
  Send,
  Loader2,
  Edit2,
  Trash2
} from 'lucide-react';
import { Card, CardContent } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { toast } from 'sonner';
import { SectionLockBanner } from '../components/security/SectionLock';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '../components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '../components/ui/alert-dialog';

// Initialize Stripe with test key
const stripePromise = loadStripe('pk_test_emergent');

const typeConfig = {
  delivery: { icon: Package, label: 'Delivery / Mailing', desc: 'Send packages, letters, cash, or items to a recipient', color: '#8b5cf6' },
  account_closure: { icon: Lock, label: 'Account Closure', desc: 'Close online accounts, delete data, terminate billing', color: '#f97316' },
  financial: { icon: DollarSign, label: 'Financial Transfer', desc: 'Wire transfers, payments, or fund distributions', color: '#22c993' },
  communication: { icon: Mail, label: 'Communication', desc: 'Send messages, emails, or notifications on your behalf', color: '#3b82f6' },
  destruction: { icon: Flame, label: 'Data / Asset Destruction', desc: 'Destroy physical materials, devices, or digital data', color: '#ef4444' },
};

const confConfig = {
  full: { label: 'Fully Confidential', desc: 'No one will ever know. All records permanently destroyed.', color: '#F98080', bg: 'rgba(240,82,82,0.1)' },
  partial: { label: 'Partial Disclosure', desc: 'Specific individuals you name will be notified upon completion.', color: '#FFCB57', bg: 'rgba(245,166,35,0.1)' },
  timed: { label: 'Timed Release', desc: 'Confidential for a set period, then disclosed to designated people.', color: '#7AABFD', bg: 'rgba(59,123,247,0.1)' },
};

const statusConfig = {
  submitted: { label: 'Submitted — Awaiting Quote', color: 'var(--bl3)', bg: 'var(--blbg)' },
  quoted: { label: 'Quote Ready — Review Required', color: 'var(--yw)', bg: 'var(--ywbg)' },
  approved: { label: 'Approved — Payment Set', color: 'var(--gn2)', bg: 'var(--gnbg)' },
  ready: { label: 'Ready for Execution', color: 'var(--gn2)', bg: 'var(--gnbg)' },
};

const INITIAL_TASKS = [
  {
    id: 'dt1', title: 'Deliver Sealed Envelope & Funds to Maria Vasquez', type: 'delivery', status: 'approved', confidential: 'full', created: '2025-10-08',
    desc: 'After verified transition, deliver the sealed envelope in Safe Deposit Box #214 (First National, Fairfax branch) and $15,000 cashier\'s check to Maria Vasquez at 1847 Elm Court, Arlington, VA 22201. No return address. Do not identify sender.',
    lineItems: [
      { id: 'li1', desc: 'Safe deposit box retrieval & notarized access', cost: 350, approved: true },
      { id: 'li2', desc: "Cashier's check preparation ($15,000 face value)", cost: 15000, approved: true },
      { id: 'li3', desc: 'Bonded courier delivery with signature confirmation', cost: 275, approved: true },
      { id: 'li4', desc: 'Record sanitization & destruction', cost: 150, approved: true },
    ],
    paymentMethod: { last4: '6411', exp: '12/27', name: 'Pete Mitchell' },
  },
  {
    id: 'dt2', title: 'Close 7 Personal Online Accounts', type: 'account_closure', status: 'quoted', confidential: 'full', created: '2025-10-15',
    desc: 'Close the following accounts and delete all associated data, terminate billing, request data erasure (CCPA/GDPR). Credentials will be provided upon quote approval.',
    lineItems: [
      { id: 'li5', desc: 'Account closure — subscription services (3 accounts)', cost: 225, approved: null },
      { id: 'li6', desc: 'Account closure — social/dating platforms (2 accounts)', cost: 300, approved: null },
      { id: 'li7', desc: 'Account closure — messaging & email (2 accounts)', cost: 250, approved: null },
      { id: 'li8', desc: 'CCPA/GDPR data erasure requests (all 7)', cost: 175, approved: null },
      { id: 'li9', desc: 'Billing termination verification & documentation', cost: 100, approved: null },
      { id: 'li10', desc: 'Record sanitization & destruction', cost: 150, approved: null },
    ],
    paymentMethod: null,
  },
  {
    id: 'dt3', title: 'Wire Transfer to Offshore Trust Account', type: 'financial', status: 'ready', confidential: 'partial', created: '2025-11-01',
    desc: 'Transfer $50,000 from Schwab Brokerage (Acct #7842-3319) to First Caribbean International Bank, Nassau, Bahamas. Account: Mitchell Family Irrevocable Trust (2019). Notify Robert Mitchell Sr. upon completion.',
    lineItems: [
      { id: 'li11', desc: 'Schwab liquidation coordination', cost: 200, approved: true },
      { id: 'li12', desc: 'International wire transfer processing', cost: 75, approved: true },
      { id: 'li13', desc: 'Transfer verification & receipt confirmation', cost: 125, approved: true },
      { id: 'li14', desc: 'Designated party notification (Robert Mitchell Sr.)', cost: 50, approved: true },
    ],
    paymentMethod: { last4: '6411', exp: '12/27', name: 'Pete Mitchell' },
    discloseTo: ['Robert Mitchell Sr.'],
  },
  {
    id: 'dt4', title: 'Time-Delayed Letter to Children', type: 'delivery', status: 'submitted', confidential: 'timed', created: '2025-11-20',
    desc: 'Five years after verified transition, mail the sealed letter (Trustee Vault #TV-009) to Jake and Sophie Mitchell at their current addresses. Letter contains personal disclosures to be shared only after sufficient time.',
    lineItems: [],
    paymentMethod: null,
    timedRelease: '5 years post-transition',
    discloseTo: ['Jake Mitchell', 'Sophie Mitchell'],
  },
];

const HOW_IT_WORKS = [
  '1. Submit a request describing your task',
  '2. DTS team reviews & sends itemized quote',
  '3. You approve/reject each line item',
  '4. Provide payment (charged only upon transition)',
  '5. Add any required credentials',
  '6. Task executes after verified transition',
  '7. All records permanently destroyed',
];

const API_URL = `${process.env.REACT_APP_BACKEND_URL}/api`;

// Stripe Card Element styles
const cardElementOptions = {
  style: {
    base: {
      fontSize: '16px',
      color: '#ffffff',
      fontFamily: 'system-ui, -apple-system, sans-serif',
      '::placeholder': {
        color: '#64748b',
      },
      backgroundColor: 'transparent',
    },
    invalid: {
      color: '#ef4444',
    },
  },
};

// Payment Form Component
const PaymentForm = ({ task, onPaymentSaved, getAuthHeaders }) => {
  const stripe = useStripe();
  const elements = useElements();
  const [cardholderName, setCardholderName] = useState('');
  const [processing, setProcessing] = useState(false);
  const [cardComplete, setCardComplete] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!stripe || !elements || !cardholderName) return;

    setProcessing(true);
    try {
      // Create setup intent
      const setupRes = await axios.post(`${API_URL}/stripe/create-setup-intent`, {}, getAuthHeaders());
      const { client_secret } = setupRes.data;

      // Confirm card setup
      const { setupIntent, error } = await stripe.confirmCardSetup(client_secret, {
        payment_method: {
          card: elements.getElement(CardElement),
          billing_details: { name: cardholderName },
        },
      });

      if (error) {
        toast.error(error.message);
        setProcessing(false);
        return;
      }

      // Get card details from the payment method
      const paymentMethod = await stripe.retrievePaymentMethod(setupIntent.payment_method);
      const card = paymentMethod.paymentMethod?.card;

      // Save payment method to task
      await axios.post(`${API_URL}/dts/tasks/${task.id}/payment-method`, {
        task_id: task.id,
        payment_method_id: setupIntent.payment_method,
        card_last4: card?.last4 || '****',
        card_exp_month: card?.exp_month || 12,
        card_exp_year: card?.exp_year || 2030,
        card_holder_name: cardholderName,
      }, getAuthHeaders());

      toast.success('Payment method saved successfully');
      onPaymentSaved({
        last4: card?.last4 || '****',
        exp: `${card?.exp_month}/${String(card?.exp_year).slice(-2)}`,
        name: cardholderName,
      });
    } catch (err) {
      console.error('Payment error:', err);
      toast.error(err.response?.data?.detail || 'Failed to save payment method');
    } finally {
      setProcessing(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label className="text-[var(--t4)]">Cardholder Name</Label>
        <Input
          className="input-field"
          placeholder="Name on card"
          value={cardholderName}
          onChange={(e) => setCardholderName(e.target.value)}
          required
          data-testid="cardholder-name-input"
        />
      </div>
      
      <div className="space-y-2">
        <Label className="text-[var(--t4)]">Card Details</Label>
        <div className="p-4 rounded-xl bg-[var(--s)] border border-[var(--b)]">
          <CardElement 
            options={cardElementOptions} 
            onChange={(e) => setCardComplete(e.complete)}
          />
        </div>
      </div>

      <div className="rounded-xl p-3 bg-[var(--blbg)] border border-[var(--bl3)]/20">
        <p className="text-sm text-[var(--bl3)]">
          <strong>Important:</strong> Your card will NOT be charged now. It will only be charged upon verified transition.
        </p>
      </div>

      <Button
        type="submit"
        className="gold-button w-full"
        disabled={!stripe || processing || !cardholderName || !cardComplete}
        data-testid="save-payment-method-button"
      >
        {processing ? (
          <>
            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            Saving Payment Method...
          </>
        ) : (
          <>
            <CreditCard className="w-4 h-4 mr-2" />
            Save Payment Method
          </>
        )}
      </Button>
    </form>
  );
};

const TrusteePage = () => {
  const { getAuthHeaders } = useAuth();
  const [tasks, setTasks] = useState([]);
  const [view, setView] = useState('list');
  const [selectedId, setSelectedId] = useState(null);
  const [createStep, setCreateStep] = useState(0);
  const [newTask, setNewTask] = useState({ type: '', title: '', desc: '', confidential: 'full', discloseTo: '', timedRelease: '', beneficiary: '' });
  const [beneficiaries, setBeneficiaries] = useState([]);
  const [estateId, setEstateId] = useState(null);
  
  // Edit/Delete state
  const [showEditModal, setShowEditModal] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [editTask, setEditTask] = useState(null);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const estatesRes = await axios.get(`${API_URL}/estates`, getAuthHeaders());
        if (estatesRes.data.length > 0) {
          const eid = localStorage.getItem('selected_estate_id') || estatesRes.data[0].id;
          setEstateId(eid);
          const [bensRes, dtsRes] = await Promise.all([
            axios.get(`${API_URL}/beneficiaries/${eid}`, getAuthHeaders()),
            axios.get(`${API_URL}/dts/tasks/${eid}`, getAuthHeaders()).catch(() => ({ data: [] })),
          ]);
          setBeneficiaries(bensRes.data);
          // Map backend fields to frontend expected format
          setTasks((dtsRes.data || []).map(t => ({
            ...t,
            type: t.task_type || t.type,
            desc: t.description || t.desc,
            lineItems: (t.line_items || t.lineItems || []),
            paymentMethod: t.payment_method || t.paymentMethod,
            discloseTo: t.disclose_to || t.discloseTo || [],
            timedRelease: t.timed_release || t.timedRelease,
            created: t.created_at?.split('T')[0] || t.created,
          })));
        }
      } catch (e) { console.error('Fetch error:', e); }
    };
    fetchData();
  }, []);

  const totalCost = (items) => items.reduce((s, i) => s + (i.approved !== false ? i.cost : 0), 0);
  const selectedTask = tasks.find(t => t.id === selectedId);

  const approveItem = (taskId, liId, val) => {
    setTasks(prev => prev.map(t => t.id === taskId ? { ...t, lineItems: t.lineItems.map(li => li.id === liId ? { ...li, approved: val } : li) } : t));
  };

  const submitNewTask = async () => {
    if (!estateId) return;
    try {
      await axios.post(`${API_URL}/dts/tasks`, {
        estate_id: estateId,
        title: newTask.title,
        description: newTask.desc,
        task_type: newTask.type,
        confidential: newTask.confidential,
        disclose_to: newTask.discloseTo ? newTask.discloseTo.split(',').map(s => s.trim()).filter(Boolean) : [],
        timed_release: newTask.timedRelease || null,
        beneficiary: newTask.beneficiary || null,
      }, getAuthHeaders());
      setView('submitted');
      toast.success('Request submitted to DTS team');
    } catch (err) {
      console.error(err);
      toast.error('Failed to submit request');
    }
  };

  // Open edit modal with task data
  const openEditModal = (task) => {
    setEditTask({
      id: task.id,
      title: task.title,
      desc: task.desc || task.description,
      type: task.type || task.task_type,
      confidential: task.confidential,
      discloseTo: Array.isArray(task.discloseTo) ? task.discloseTo.join(', ') : (task.discloseTo || ''),
      timedRelease: task.timedRelease || task.timed_release || '',
      beneficiary: task.beneficiary || '',
    });
    setShowEditModal(true);
  };

  // Handle edit submission
  const handleEditTask = async () => {
    if (!editTask) return;
    setSaving(true);
    try {
      await axios.put(`${API_URL}/dts/tasks/${editTask.id}`, {
        title: editTask.title,
        description: editTask.desc,
        task_type: editTask.type,
        confidential: editTask.confidential,
        disclose_to: editTask.discloseTo ? editTask.discloseTo.split(',').map(s => s.trim()).filter(Boolean) : [],
        timed_release: editTask.timedRelease || null,
        beneficiary: editTask.beneficiary || null,
      }, getAuthHeaders());
      
      toast.success('Task updated and sent back for re-quoting');
      setShowEditModal(false);
      setEditTask(null);
      
      // Update local state
      setTasks(prev => prev.map(t => t.id === editTask.id ? {
        ...t,
        title: editTask.title,
        desc: editTask.desc,
        type: editTask.type,
        confidential: editTask.confidential,
        discloseTo: editTask.discloseTo ? editTask.discloseTo.split(',').map(s => s.trim()).filter(Boolean) : [],
        timedRelease: editTask.timedRelease,
        beneficiary: editTask.beneficiary,
        status: 'submitted',
        lineItems: [],
        paymentMethod: null,
      } : t));
      
    } catch (err) {
      console.error('Edit error:', err);
      toast.error(err.response?.data?.detail || 'Failed to update task');
    } finally {
      setSaving(false);
    }
  };

  // Handle delete
  const handleDeleteTask = async (taskId) => {
    setDeleting(true);
    try {
      await axios.delete(`${API_URL}/dts/tasks/${taskId}`, getAuthHeaders());
      toast.success('Task deleted successfully');
      setShowDeleteDialog(false);
      setTasks(prev => prev.filter(t => t.id !== taskId));
      setView('list');
      setSelectedId(null);
    } catch (err) {
      console.error('Delete error:', err);
      toast.error(err.response?.data?.detail || 'Failed to delete task');
    } finally {
      setDeleting(false);
    }
  };

  // === SUBMITTED SUCCESS ===
  if (view === 'submitted') {
    return (
      <div className="p-4 lg:p-6 pt-20 lg:pt-6 pb-24 lg:pb-6 animate-fade-in text-center" data-testid="dts-submitted">
        <div className="max-w-md mx-auto mt-16">
          <div className="w-20 h-20 rounded-2xl bg-[var(--gnbg)] flex items-center justify-center mx-auto mb-6">
            <CheckCircle2 className="w-10 h-10 text-[var(--gn2)]" />
          </div>
          <h2 className="text-2xl font-bold text-[var(--t)] mb-3" style={{ fontFamily: 'Cormorant Garamond, serif' }}>Request Submitted</h2>
          <p className="text-[var(--t3)] mb-3 leading-relaxed">Your Designated Trustee Service request has been encrypted and submitted to the CarryOn DTS team.</p>
          <p className="text-[var(--t4)] mb-8 text-sm leading-relaxed">You will receive a detailed itemized quote within 2-3 business days. You can then approve or reject each line item individually.</p>
          <Button className="gold-button" onClick={() => { setView('list'); setCreateStep(0); setNewTask({ type: '', title: '', desc: '', confidential: 'full', discloseTo: '', timedRelease: '', beneficiary: '' }); }}>
            Back to Trustee Services
          </Button>
        </div>
      </div>
    );
  }

  // === TASK DETAIL ===
  if (view === 'detail' && selectedTask) {
    const t = selectedTask;
    const st = statusConfig[t.status] || statusConfig.submitted;
    const cf = confConfig[t.confidential];
    const TypeIcon = typeConfig[t.type]?.icon || Shield;

    return (
      <div className="p-4 lg:p-6 pt-20 lg:pt-6 pb-24 lg:pb-6 space-y-5 animate-fade-in" data-testid="dts-detail">
        <div className="flex items-center justify-between">
          <Button variant="outline" size="sm" className="border-[var(--b)] text-[var(--t3)]" onClick={() => { setView('list'); setSelectedId(null); }}>
            <ChevronLeft className="w-4 h-4 mr-1" /> All Tasks
          </Button>
          
          {/* Edit & Delete buttons */}
          <div className="flex items-center gap-2">
            <Button 
              variant="outline" 
              size="sm" 
              className="border-[var(--bl3)]/30 text-[var(--bl3)] hover:bg-[var(--blbg)]"
              onClick={() => openEditModal(t)}
              data-testid="edit-dts-task-button"
            >
              <Edit2 className="w-4 h-4 mr-1" /> Edit
            </Button>
            <Button 
              variant="outline" 
              size="sm" 
              className="border-[var(--rd)]/30 text-[var(--rd)] hover:bg-[var(--rdbg)]"
              onClick={() => setShowDeleteDialog(true)}
              data-testid="delete-dts-task-button"
            >
              <Trash2 className="w-4 h-4 mr-1" /> Delete
            </Button>
          </div>
        </div>

        {/* Header */}
        <div className="flex items-start gap-4">
          <div className="w-13 h-13 rounded-2xl flex items-center justify-center flex-shrink-0" style={{ background: 'rgba(139,92,246,0.1)' }}>
            <TypeIcon className="w-6 h-6" style={{ color: typeConfig[t.type]?.color }} />
          </div>
          <div>
            <h1 className="text-xl lg:text-2xl font-bold text-[var(--t)]">{t.title}</h1>
            <p className="text-sm text-[var(--t4)] mt-1">Created: {t.created}</p>
          </div>
        </div>

        {/* Status badges */}
        <div className="flex flex-wrap gap-2">
          <span className="px-3 py-1.5 rounded-lg text-sm font-bold" style={{ background: st.bg, color: st.color }}>{st.label}</span>
          <span className="px-3 py-1.5 rounded-lg text-sm font-bold" style={{ background: cf.bg, color: cf.color }}>{cf.label}</span>
          {t.timedRelease && <span className="px-3 py-1.5 rounded-lg text-sm font-bold" style={{ background: 'var(--blbg)', color: 'var(--bl3)' }}>{t.timedRelease}</span>}
          {t.discloseTo?.length > 0 && <span className="px-3 py-1.5 rounded-lg text-sm" style={{ background: 'var(--s)', color: 'var(--t3)' }}>Disclosed to: {t.discloseTo.join(', ')}</span>}
        </div>

        {/* Description */}
        <Card className="glass-card"><CardContent className="p-5">
          <h3 className="font-bold text-[var(--t)] mb-2">Task Description</h3>
          <p className="text-[var(--t2)] text-sm leading-relaxed whitespace-pre-wrap">{t.desc}</p>
        </CardContent></Card>

        {/* Line Items */}
        {t.lineItems.length > 0 && (
          <Card className="glass-card"><CardContent className="p-5">
            <h3 className="font-bold text-[var(--t)] mb-4">{t.status === 'quoted' ? 'Quote from CarryOn DTS Team — Review Each Item' : 'Approved Line Items'}</h3>
            {t.lineItems.map((li, i) => (
              <div key={li.id} className="flex items-center gap-3 py-3" style={{ borderBottom: i < t.lineItems.length - 1 ? '1px solid var(--b)' : 'none' }}>
                {t.status === 'quoted' ? (
                  <div className="flex flex-col gap-1 flex-shrink-0">
                    <button onClick={() => approveItem(t.id, li.id, true)} className={`w-8 h-8 rounded-lg flex items-center justify-center text-sm transition-all ${li.approved === true ? 'bg-[var(--gnbg)] border border-[var(--gn)]' : 'bg-[var(--s)] border border-[var(--b)]'}`}>
                      <CheckCircle2 className="w-4 h-4" />
                    </button>
                    <button onClick={() => approveItem(t.id, li.id, false)} className={`w-8 h-8 rounded-lg flex items-center justify-center text-sm transition-all ${li.approved === false ? 'bg-[var(--rdbg)] border border-[var(--rd)]' : 'bg-[var(--s)] border border-[var(--b)]'}`}>
                      <XCircle className="w-4 h-4" />
                    </button>
                  </div>
                ) : (
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${li.approved ? 'bg-[var(--gnbg)]' : 'bg-[var(--rdbg)]'}`}>
                    {li.approved ? <CheckCircle2 className="w-4 h-4 text-[var(--gn2)]" /> : <XCircle className="w-4 h-4 text-[var(--rd)]" />}
                  </div>
                )}
                <div className="flex-1"><span className={`text-sm ${li.approved === false ? 'text-[var(--t5)] line-through' : 'text-[var(--t)]'}`}>{li.desc}</span></div>
                <span className={`text-base font-bold flex-shrink-0 ${li.approved === false ? 'text-[var(--t5)]' : 'text-[var(--gold2)]'}`}>${li.cost.toLocaleString()}</span>
              </div>
            ))}
            <div className="flex justify-between items-center pt-4 mt-2" style={{ borderTop: '2px solid var(--b)' }}>
              <div>
                <div className="font-bold text-[var(--t)]">Total</div>
                <div className="text-xs text-[var(--t4)]">Charged upon verified transition</div>
              </div>
              <div className="text-2xl font-bold text-[var(--gold2)]" style={{ fontFamily: 'Cormorant Garamond, serif' }}>
                ${totalCost(t.lineItems).toLocaleString()}
              </div>
            </div>
            {t.status === 'quoted' && (
              <div className="flex gap-3 mt-4">
                <Button className="gold-button flex-1" onClick={() => setTasks(prev => prev.map(x => x.id === t.id ? { ...x, status: 'approved', lineItems: x.lineItems.map(li => ({ ...li, approved: li.approved === null ? true : li.approved })) } : x))}>
                  Approve & Proceed to Payment
                </Button>
              </div>
            )}
          </CardContent></Card>
        )}

        {/* Payment Method Section - Shows after approval */}
        {t.status === 'approved' && !t.paymentMethod && (
          <Card className="glass-card" data-testid="payment-method-card">
            <CardContent className="p-5">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: 'linear-gradient(135deg, rgba(34,197,94,0.2), rgba(22,163,74,0.15))' }}>
                  <CreditCard className="w-5 h-5 text-[var(--gn2)]" />
                </div>
                <div>
                  <h3 className="font-bold text-[var(--t)]">Add Payment Method</h3>
                  <p className="text-xs text-[var(--t4)]">Your card will only be charged upon verified transition</p>
                </div>
              </div>
              
              <Elements stripe={stripePromise}>
                <PaymentForm 
                  task={t} 
                  getAuthHeaders={getAuthHeaders}
                  onPaymentSaved={(paymentInfo) => {
                    setTasks(prev => prev.map(x => x.id === t.id ? { ...x, status: 'ready', paymentMethod: paymentInfo } : x));
                  }} 
                />
              </Elements>
            </CardContent>
          </Card>
        )}

        {/* Saved Payment Method Display */}
        {t.paymentMethod && (
          <Card className="glass-card" data-testid="saved-payment-card">
            <CardContent className="p-5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: 'var(--gnbg)' }}>
                    <CheckCircle2 className="w-5 h-5 text-[var(--gn2)]" />
                  </div>
                  <div>
                    <h3 className="font-bold text-[var(--t)]">Payment Method Saved</h3>
                    <p className="text-sm text-[var(--t3)]">
                      <CreditCard className="w-4 h-4 inline mr-1" />
                      •••• {t.paymentMethod.last4} — Expires {t.paymentMethod.exp}
                    </p>
                    {t.paymentMethod.name && (
                      <p className="text-xs text-[var(--t4)]">{t.paymentMethod.name}</p>
                    )}
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-sm font-bold text-[var(--gn2)]">Ready</div>
                  <div className="text-xs text-[var(--t4)]">Charged on transition</div>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Security notice for credentials */}
        {(t.status === 'approved' || t.status === 'ready') && (
          <div className="rounded-xl p-4" style={{ background: 'rgba(240,82,82,0.05)', border: '1px solid rgba(240,82,82,0.12)' }}>
            <div className="text-sm font-bold text-[var(--rd2)] mb-2">Maximum Security</div>
            <p className="text-sm text-[var(--t3)] leading-relaxed">
              Credentials are stored in a separate encrypted Trustee Vault, completely isolated from your primary Secure Document Vault. Only the assigned DTS agent will access these credentials during task execution. All credentials are permanently destroyed after task completion.
            </p>
          </div>
        )}

        {/* Post-execution destruction notice */}
        <div className="rounded-xl p-4" style={{ background: 'rgba(240,82,82,0.04)', border: '1px solid rgba(240,82,82,0.1)' }}>
          <div className="text-sm font-bold text-[#F98080] mb-2 flex items-center gap-2"><Flame className="w-4 h-4" /> Post-Execution Record Destruction</div>
          <p className="text-sm text-[var(--t3)] leading-relaxed">
            After confirmed task execution, ALL records — instructions, credentials, payment logs, and execution notes — are permanently and irrecoverably destroyed from every CarryOn™ system. No evidence of this task will exist.
          </p>
        </div>
        
        {/* Edit Task Modal */}
        <Dialog open={showEditModal} onOpenChange={(open) => {
          setShowEditModal(open);
          if (!open) setEditTask(null);
        }}>
          <DialogContent className="glass-card border-white/10 sm:max-w-lg max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="text-[var(--t)] text-xl flex items-center gap-2">
                <Edit2 className="w-5 h-5 text-[var(--bl3)]" />
                Edit DTS Request
              </DialogTitle>
              <DialogDescription className="text-[var(--t4)]">
                Editing will reset the task to "Submitted" status and clear any existing quote. The DTS team will provide a new quote.
              </DialogDescription>
            </DialogHeader>
            
            {editTask && (
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label className="text-[var(--t4)]">Task Title</Label>
                  <Input
                    className="input-field"
                    value={editTask.title}
                    onChange={(e) => setEditTask(p => ({ ...p, title: e.target.value }))}
                    placeholder="Task title"
                  />
                </div>
                
                <div className="space-y-2">
                  <Label className="text-[var(--t4)]">Task Type</Label>
                  <select
                    className="input-field w-full rounded-lg p-3 bg-[var(--s)] border border-[var(--b)] text-[var(--t)] text-sm"
                    value={editTask.type}
                    onChange={(e) => setEditTask(p => ({ ...p, type: e.target.value }))}
                  >
                    {Object.entries(typeConfig).map(([key, cfg]) => (
                      <option key={key} value={key}>{cfg.label}</option>
                    ))}
                  </select>
                </div>
                
                <div className="space-y-2">
                  <Label className="text-[var(--t4)]">Instructions</Label>
                  <textarea
                    className="input-field w-full rounded-lg p-3 min-h-[120px] bg-[var(--s)] border border-[var(--b)] text-[var(--t)] text-sm"
                    value={editTask.desc}
                    onChange={(e) => setEditTask(p => ({ ...p, desc: e.target.value }))}
                    placeholder="Detailed instructions for the DTS team"
                  />
                </div>
                
                <div className="space-y-2">
                  <Label className="text-[var(--t4)]">Confidentiality Level</Label>
                  <select
                    className="input-field w-full rounded-lg p-3 bg-[var(--s)] border border-[var(--b)] text-[var(--t)] text-sm"
                    value={editTask.confidential}
                    onChange={(e) => setEditTask(p => ({ ...p, confidential: e.target.value }))}
                  >
                    {Object.entries(confConfig).map(([key, cfg]) => (
                      <option key={key} value={key}>{cfg.label}</option>
                    ))}
                  </select>
                </div>
                
                {(editTask.confidential === 'partial' || editTask.confidential === 'timed') && (
                  <div className="space-y-2">
                    <Label className="text-[var(--t4)]">Disclose To</Label>
                    <Input
                      className="input-field"
                      value={editTask.discloseTo}
                      onChange={(e) => setEditTask(p => ({ ...p, discloseTo: e.target.value }))}
                      placeholder="Names, separated by commas"
                    />
                  </div>
                )}
                
                {editTask.confidential === 'timed' && (
                  <div className="space-y-2">
                    <Label className="text-[var(--t4)]">Release Timing</Label>
                    <select
                      className="input-field w-full rounded-lg p-3 bg-[var(--s)] border border-[var(--b)] text-[var(--t)] text-sm"
                      value={editTask.timedRelease}
                      onChange={(e) => setEditTask(p => ({ ...p, timedRelease: e.target.value }))}
                    >
                      <option value="">Select timing...</option>
                      {['6 months post-transition', '1 year post-transition', '2 years post-transition', '5 years post-transition', '10 years post-transition'].map(o => (
                        <option key={o} value={o}>{o}</option>
                      ))}
                    </select>
                  </div>
                )}
                
                <div className="rounded-xl p-3 bg-[var(--ywbg)] border border-[var(--yw)]/20">
                  <p className="text-sm text-[var(--yw)]">
                    <AlertTriangle className="w-4 h-4 inline mr-1" />
                    <strong>Note:</strong> Saving will clear any existing quote and payment method. The DTS team will need to provide a new quote.
                  </p>
                </div>
              </div>
            )}
            
            <div className="flex justify-end gap-3">
              <Button
                variant="outline"
                onClick={() => setShowEditModal(false)}
                className="border-[var(--b)] text-[var(--t3)]"
              >
                Cancel
              </Button>
              <Button
                onClick={handleEditTask}
                disabled={saving || !editTask?.title || !editTask?.desc}
                className="bg-[var(--bl3)] text-white hover:bg-[var(--bl3)]/90"
                data-testid="save-edit-dts-button"
              >
                {saving ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Saving...
                  </>
                ) : (
                  <>
                    <Edit2 className="w-4 h-4 mr-2" />
                    Save & Request New Quote
                  </>
                )}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
        
        {/* Delete Confirmation Dialog */}
        <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
          <AlertDialogContent className="glass-card border-white/10">
            <AlertDialogHeader>
              <AlertDialogTitle className="text-[var(--t)] flex items-center gap-2">
                <Trash2 className="w-5 h-5 text-[var(--rd)]" />
                Delete DTS Request
              </AlertDialogTitle>
              <AlertDialogDescription className="text-[var(--t3)]">
                Are you sure you want to permanently delete this Designated Trustee Service request? This action cannot be undone. Any saved payment method will also be removed.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel className="border-[var(--b)] text-[var(--t3)]">
                Cancel
              </AlertDialogCancel>
              <AlertDialogAction
                onClick={() => handleDeleteTask(selectedId)}
                disabled={deleting}
                className="bg-[var(--rd)] text-white hover:bg-[var(--rd)]/90"
                data-testid="confirm-delete-dts-button"
              >
                {deleting ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Deleting...
                  </>
                ) : (
                  <>
                    <Trash2 className="w-4 h-4 mr-2" />
                    Delete Permanently
                  </>
                )}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    );
  }

  // === CREATE NEW REQUEST ===
  if (view === 'create') {
    const steps = ['Beneficiary', 'Task Type', 'Instructions', 'Confidentiality', 'Submit'];
    return (
      <div className="p-4 lg:p-6 pt-20 lg:pt-6 pb-24 lg:pb-6 space-y-5 animate-fade-in" data-testid="dts-create">
        <Button variant="outline" size="sm" className="border-[var(--b)] text-[var(--t3)]" onClick={() => { setView('list'); setCreateStep(0); }}>
          <ChevronLeft className="w-4 h-4 mr-1" /> Cancel
        </Button>
        <div>
          <h1 className="text-xl lg:text-2xl font-bold text-[var(--t)]">New Trustee Service Request</h1>
          <p className="text-[var(--t4)] text-sm">Describe what you need — the DTS team will review and provide a detailed quote</p>
        </div>

        {/* Progress */}
        <div className="flex gap-1">
          {steps.map((s, i) => (
            <div key={i} className="flex-1">
              <div className="h-1 rounded-full mb-1" style={{ background: i <= createStep ? 'linear-gradient(90deg, var(--gold), var(--gold2))' : 'var(--b)' }} />
              <div className="text-xs text-center" style={{ color: i <= createStep ? 'var(--gold2)' : 'var(--t5)' }}>{s}</div>
            </div>
          ))}
        </div>

        <Card className="glass-card"><CardContent className="p-5 lg:p-8">
          {/* Step 0: Beneficiary Selection (optional) */}
          {createStep === 0 && (<>
            <h3 className="text-lg font-bold text-[var(--t)] mb-2">Who is this task related to?</h3>
            <p className="text-sm text-[var(--t4)] mb-4">Select a beneficiary this task involves, or skip if it's not related to a specific person.</p>
            <div className="space-y-2 mb-4">
              <div
                onClick={() => setNewTask(p => ({ ...p, beneficiary: '' }))}
                className={`flex items-center gap-3 p-4 rounded-xl cursor-pointer transition-all ${
                  newTask.beneficiary === '' ? 'border-2 border-[var(--gold)]' : 'border border-[var(--b)]'
                }`}
                style={{ background: newTask.beneficiary === '' ? 'rgba(224,173,43,0.06)' : 'var(--s)' }}
              >
                <div className="w-10 h-10 rounded-full bg-[var(--s)] flex items-center justify-center text-[var(--t4)]">
                  <Shield className="w-5 h-5" />
                </div>
                <div>
                  <div className="font-bold text-[var(--t)]">No specific beneficiary</div>
                  <div className="text-xs text-[var(--t4)]">General task not tied to a person</div>
                </div>
              </div>
              {beneficiaries.map(ben => (
                <div
                  key={ben.id}
                  onClick={() => setNewTask(p => ({ ...p, beneficiary: ben.name }))}
                  className={`flex items-center gap-3 p-4 rounded-xl cursor-pointer transition-all ${
                    newTask.beneficiary === ben.name ? 'border-2 border-[var(--gold)]' : 'border border-[var(--b)]'
                  }`}
                  style={{ background: newTask.beneficiary === ben.name ? 'rgba(224,173,43,0.06)' : 'var(--s)' }}
                >
                  <div
                    className="w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm"
                    style={{ backgroundColor: ben.avatar_color + '30', color: ben.avatar_color }}
                  >
                    {ben.initials || ben.name.split(' ').map(n => n[0]).join('').toUpperCase()}
                  </div>
                  <div>
                    <div className="font-bold text-[var(--t)]">{ben.name}</div>
                    <div className="text-xs text-[var(--t4)]">{ben.relation}</div>
                  </div>
                </div>
              ))}
            </div>
            <Button className="gold-button w-full" onClick={() => setCreateStep(1)}>Continue <ChevronRight className="w-4 h-4 ml-1" /></Button>
          </>)}

          {/* Step 1: Task Type */}
          {createStep === 1 && (<>
            <h3 className="text-lg font-bold text-[var(--t)] mb-4">What type of task?</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {Object.entries(typeConfig).map(([key, cfg]) => (
                <div key={key} onClick={() => setNewTask(p => ({ ...p, type: key }))}
                  className={`p-5 rounded-2xl cursor-pointer transition-all ${newTask.type === key ? 'border-2' : 'border border-[var(--b)]'}`}
                  style={{ background: newTask.type === key ? cfg.color + '15' : 'var(--s)', borderColor: newTask.type === key ? cfg.color + '50' : undefined }}>
                  <cfg.icon className="w-7 h-7 mb-2" style={{ color: cfg.color }} />
                  <div className="font-bold text-[var(--t)] mb-1">{cfg.label}</div>
                  <div className="text-sm text-[var(--t4)] leading-relaxed">{cfg.desc}</div>
                </div>
              ))}
            </div>
            <Button className="gold-button w-full mt-5" disabled={!newTask.type} onClick={() => setCreateStep(2)}>Continue <ChevronRight className="w-4 h-4 ml-1" /></Button>
          </>)}

          {/* Step 2: Instructions */}
          {createStep === 2 && (<>
            <h3 className="text-lg font-bold text-[var(--t)] mb-4">Describe the Task</h3>
            <div className="rounded-xl p-3 mb-4" style={{ background: 'rgba(59,123,247,0.05)', border: '1px solid rgba(59,123,247,0.1)' }}>
              <p className="text-sm text-[var(--bl3)] leading-relaxed">Be as detailed as possible. Include names, addresses, account numbers, amounts, and any specific sequencing. The DTS team will use this to build your itemized quote.</p>
            </div>
            <div className="space-y-4">
              <div><Label className="text-[var(--t4)]">Task Title</Label><Input className="input-field mt-1" value={newTask.title} onChange={e => setNewTask(p => ({ ...p, title: e.target.value }))} placeholder="e.g., Close 5 personal subscription accounts" /></div>
              <div><Label className="text-[var(--t4)]">Detailed Instructions for the DTS Team</Label>
                <textarea className="input-field mt-1 w-full rounded-lg p-3 min-h-[160px] bg-[var(--s)] border border-[var(--b)] text-[var(--t)] text-sm" value={newTask.desc} onChange={e => setNewTask(p => ({ ...p, desc: e.target.value }))}
                  placeholder={"Describe exactly what you need done. Include:\n\n• Who/what is involved\n• Specific addresses, account names, amounts\n• Required sequence of operations\n• Any special handling requirements\n• What success looks like"} />
              </div>
            </div>
            <div className="flex gap-3 mt-5">
              <Button variant="outline" className="border-[var(--b)] text-[var(--t3)]" onClick={() => setCreateStep(1)}><ChevronLeft className="w-4 h-4 mr-1" /> Back</Button>
              <Button className="gold-button flex-1" disabled={!newTask.title || !newTask.desc} onClick={() => setCreateStep(3)}>Continue <ChevronRight className="w-4 h-4 ml-1" /></Button>
            </div>
          </>)}

          {/* Step 3: Confidentiality */}
          {createStep === 3 && (<>
            <h3 className="text-lg font-bold text-[var(--t)] mb-1">Confidentiality Level</h3>
            <p className="text-sm text-[var(--t4)] mb-4">Who, if anyone, should know this task exists or was completed?</p>
            <div className="space-y-3 mb-4">
              {Object.entries(confConfig).map(([key, cfg]) => (
                <div key={key} onClick={() => setNewTask(p => ({ ...p, confidential: key }))}
                  className="flex items-center gap-4 p-4 rounded-2xl cursor-pointer transition-all"
                  style={{ background: newTask.confidential === key ? cfg.bg : 'var(--s)', border: `1px solid ${newTask.confidential === key ? cfg.color + '44' : 'var(--b)'}` }}>
                  <div className="flex-1">
                    <div className="font-bold" style={{ color: newTask.confidential === key ? cfg.color : 'var(--t)' }}>{cfg.label}</div>
                    <div className="text-sm text-[var(--t4)] leading-relaxed">{cfg.desc}</div>
                  </div>
                </div>
              ))}
            </div>
            {(newTask.confidential === 'partial' || newTask.confidential === 'timed') && (
              <div className="mb-4"><Label className="text-[var(--t4)]">Disclose To</Label><Input className="input-field mt-1" value={newTask.discloseTo} onChange={e => setNewTask(p => ({ ...p, discloseTo: e.target.value }))} placeholder="Enter names, separated by commas" /></div>
            )}
            {newTask.confidential === 'timed' && (
              <div className="mb-4"><Label className="text-[var(--t4)]">Release Timing</Label>
                <select className="input-field mt-1 w-full rounded-lg p-3 bg-[var(--s)] border border-[var(--b)] text-[var(--t)] text-sm" value={newTask.timedRelease} onChange={e => setNewTask(p => ({ ...p, timedRelease: e.target.value }))}>
                  <option value="">Select timing...</option>
                  {['6 months post-transition', '1 year post-transition', '2 years post-transition', '5 years post-transition', '10 years post-transition'].map(o => <option key={o} value={o}>{o}</option>)}
                </select>
              </div>
            )}
            <div className="flex gap-3 mt-5">
              <Button variant="outline" className="border-[var(--b)] text-[var(--t3)]" onClick={() => setCreateStep(2)}><ChevronLeft className="w-4 h-4 mr-1" /> Back</Button>
              <Button className="gold-button flex-1" onClick={() => setCreateStep(4)}>Continue <ChevronRight className="w-4 h-4 ml-1" /></Button>
            </div>
          </>)}

          {/* Step 4: Review & Submit */}
          {createStep === 4 && (<>
            <h3 className="text-lg font-bold text-[var(--t)] mb-4">Review & Submit Request</h3>
            <div className="rounded-xl p-4 mb-4" style={{ background: 'var(--s)', border: '1px solid var(--b)' }}>
              {[newTask.beneficiary ? ['Beneficiary', newTask.beneficiary] : null, ['Task Type', typeConfig[newTask.type]?.label], ['Title', newTask.title], ['Confidentiality', confConfig[newTask.confidential]?.label], newTask.discloseTo ? ['Disclosed To', newTask.discloseTo] : null, newTask.timedRelease ? ['Timed Release', newTask.timedRelease] : null].filter(Boolean).map(([k, v], i, a) => (
                <div key={k} className="flex justify-between py-2 text-sm" style={{ borderBottom: i < a.length - 1 ? '1px solid var(--b)' : 'none' }}>
                  <span className="text-[var(--t4)]">{k}</span>
                  <span className="text-[var(--t)] font-bold">{v}</span>
                </div>
              ))}
            </div>
            <div className="rounded-xl p-4 mb-4" style={{ background: 'var(--s)', border: '1px solid var(--b)' }}>
              <div className="text-xs font-bold text-[var(--t4)] uppercase tracking-wider mb-2">Instructions</div>
              <p className="text-sm text-[var(--t2)] leading-relaxed whitespace-pre-wrap">{newTask.desc}</p>
            </div>
            <div className="rounded-xl p-4 mb-4" style={{ background: 'rgba(59,123,247,0.05)', border: '1px solid rgba(59,123,247,0.1)' }}>
              <p className="text-sm text-[var(--bl3)] leading-relaxed">
                What happens next: The CarryOn DTS team will review your request and prepare an itemized quote with specific costs for each aspect of the task. You will then review, approve or reject individual line items, and provide payment authorization. No charges occur until your verified transition.
              </p>
            </div>
            <div className="flex gap-3">
              <Button variant="outline" className="border-[var(--b)] text-[var(--t3)]" onClick={() => setCreateStep(3)}><ChevronLeft className="w-4 h-4 mr-1" /> Back</Button>
              <Button className="gold-button flex-1" onClick={submitNewTask}>
                <Send className="w-4 h-4 mr-2" /> Submit Request to DTS Team
              </Button>
            </div>
          </>)}
        </CardContent></Card>
      </div>
    );
  }

  // === TASK LIST (DEFAULT) ===
  return (
    <div className="p-4 lg:p-6 pt-20 lg:pt-6 pb-24 lg:pb-6 space-y-5 animate-fade-in" data-testid="dts-page">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: 'linear-gradient(135deg, rgba(139,92,246,0.2), rgba(124,58,237,0.15))' }}>
            <Shield className="w-5 h-5 text-[#B794F6]" />
          </div>
          <div>
            <h1 className="text-xl lg:text-2xl font-bold text-[var(--t)]" style={{ fontFamily: 'Outfit, sans-serif' }}>Designated Trustee Services</h1>
            <p className="text-xs text-[var(--t5)]">Confidential tasks executed by CarryOn™ after transition</p>
          </div>
        </div>
        <Button className="gold-button" onClick={() => setView('create')} data-testid="dts-new-request">
          <Plus className="w-4 h-4 mr-2" /> New Request
        </Button>
      </div>

      {/* Section Lock */}
      <SectionLockBanner sectionId="dts" />

      {/* How It Works */}
      <div className="rounded-2xl p-5" style={{ background: 'rgba(139,92,246,0.06)', border: '1px solid rgba(139,92,246,0.12)' }}>
        <div className="flex items-start gap-3">
          <div className="w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: 'rgba(139,92,246,0.12)' }}>
            <Shield className="w-6 h-6 text-[#B794F6]" />
          </div>
          <div>
            <h3 className="font-bold text-[#B794F6] mb-2">How It Works</h3>
            <div className="text-sm text-[var(--t3)] leading-loose">
              {HOW_IT_WORKS.map((s, i) => <div key={i}>{s}</div>)}
            </div>
          </div>
        </div>
      </div>

      {/* Legal Disclaimers */}
      <div className="rounded-xl p-4" style={{ background: 'rgba(239,68,68,0.04)', border: '1px solid rgba(239,68,68,0.12)' }}>
        <div className="flex items-center gap-2 mb-2">
          <AlertTriangle className="w-4 h-4 text-[var(--rd2)]" />
          <span className="text-sm font-bold text-[var(--rd2)]">Trustee Services Legal Disclaimers</span>
        </div>
        <p className="text-sm text-[var(--t3)] leading-relaxed mb-3">By submitting a Designated Trustee Services request, you acknowledge and agree to the following:</p>
        <div className="space-y-2">
          {[
            'Approved DTS task fees are charged in full upon transition, regardless of whether the task can be successfully executed. Fees are non-refundable.',
            'If a task cannot be completed due to insufficient benefactor planning — including but not limited to: invalid credentials, active 2FA lockouts, closed accounts, inaccessible funds, or missing documentation — CarryOn™ is released from all liability for non-execution.',
            'Users are solely responsible for providing working access credentials and ensuring account accessibility prior to transition.',
            'CarryOn™ will make a commercially reasonable effort to execute all approved tasks, but does not guarantee successful completion.',
          ].map((t, i) => (
            <div key={i} className="text-sm text-[var(--t4)] leading-relaxed pl-3" style={{ borderLeft: '2px solid rgba(239,68,68,0.2)' }}>{t}</div>
          ))}
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { v: tasks.length, l: 'Total Tasks', color: '#B794F6' },
          { v: tasks.filter(t => t.status === 'quoted').length, l: 'Awaiting Review', color: 'var(--yw)' },
          { v: tasks.filter(t => t.status === 'ready').length, l: 'Ready', color: 'var(--gn2)' },
          { v: '$' + tasks.reduce((s, t) => s + totalCost(t.lineItems), 0).toLocaleString(), l: 'Total Authorized', color: 'var(--gold2)' },
        ].map(s => (
          <div key={s.l} className="glass-card p-4 text-center">
            <div className="text-2xl font-bold" style={{ color: s.color }}>{s.v}</div>
            <div className="text-xs text-[var(--t4)] mt-1">{s.l}</div>
          </div>
        ))}
      </div>

      {/* Task Cards */}
      <div className="space-y-3">
        {tasks.map(t => {
          const st = statusConfig[t.status] || statusConfig.submitted;
          const cf = confConfig[t.confidential];
          const TypeIcon = typeConfig[t.type]?.icon || Shield;
          return (
            <Card key={t.id} className="glass-card cursor-pointer hover:border-[var(--b2)] transition-all" onClick={() => { setSelectedId(t.id); setView('detail'); }} data-testid={`dts-task-${t.id}`}>
              <CardContent className="p-4 flex items-center gap-4">
                <div className="w-12 h-12 rounded-2xl flex items-center justify-center flex-shrink-0" style={{ background: 'rgba(139,92,246,0.08)' }}>
                  <TypeIcon className="w-5 h-5" style={{ color: typeConfig[t.type]?.color }} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-bold text-[var(--t)] mb-1.5 truncate">{t.title}</div>
                  <div className="flex flex-wrap gap-1.5">
                    <span className="text-xs px-2 py-0.5 rounded-md font-bold" style={{ background: st.bg, color: st.color }}>{st.label}</span>
                    <span className="text-xs px-2 py-0.5 rounded-md font-bold" style={{ background: cf.bg, color: cf.color }}>{cf.label}</span>
                    {t.lineItems.length > 0 && <span className="text-xs font-bold text-[var(--gold2)]">${totalCost(t.lineItems).toLocaleString()}</span>}
                  </div>
                </div>
                <ChevronRight className="w-5 h-5 text-[var(--t5)] flex-shrink-0" />
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
};

export default TrusteePage;
