import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { clearCache } from '../utils/apiCache';
import {
  ArrowLeft, ArrowRight, Loader2, Check, Shield, Users,
  User, Heart, MapPin, UserPlus, Mail, AlertCircle
} from 'lucide-react';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { toast } from '../utils/toast';
import AddressAutocomplete from '../components/AddressAutocomplete';
import DateMaskInput from '../components/DateMaskInput';
import axios from 'axios';

const API_URL = `${process.env.REACT_APP_BACKEND_URL}/api`;

const suffixOptions = [
  { value: 'none', label: 'None' },
  { value: 'Jr.', label: 'Jr.' },
  { value: 'Sr.', label: 'Sr.' },
  { value: 'II', label: 'II' },
  { value: 'III', label: 'III' },
  { value: 'IV', label: 'IV' },
];

const genderOptions = [
  { value: 'not_selected', label: 'Select...' },
  { value: 'male', label: 'Male' },
  { value: 'female', label: 'Female' },
  { value: 'other', label: 'Other' },
  { value: 'prefer_not_to_say', label: 'Prefer not to say' },
];

const maritalOptions = [
  { value: 'not_selected', label: 'Select...' },
  { value: 'single', label: 'Single' },
  { value: 'married', label: 'Married' },
  { value: 'domestic_partnership', label: 'Domestic Partnership' },
  { value: 'divorced', label: 'Divorced' },
  { value: 'widowed', label: 'Widowed' },
  { value: 'separated', label: 'Separated' },
];

const usStates = [
  'AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','HI','ID','IL','IN','IA',
  'KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ',
  'NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT',
  'VA','WA','WV','WI','WY','DC',
];

const beneficiaryRelations = ['Spouse', 'Son', 'Daughter', 'Son-in-law', 'Daughter-in-law', 'Mother', 'Father', 'Mother-in-law', 'Father-in-law', 'Brother', 'Sister', 'Aunt', 'Uncle', 'Grandson', 'Granddaughter', 'Grandmother', 'Grandfather', 'Nephew', 'Niece', 'Great-Grandson', 'Great-Granddaughter', 'Great-Grandmother', 'Great-Grandfather', 'Friend', 'Other'];

const inputClass = "h-14 px-4 bg-[#0b1322] border border-[#1a2a42] text-white text-base placeholder:text-[#2d3d55] focus:border-[#d4af37] focus:ring-1 focus:ring-inset focus:ring-[#d4af37]/30 focus:outline-none rounded-xl w-full";
const selectClass = "h-14 bg-[#0b1322] border-[#1a2a42] text-white text-base rounded-xl [&>span]:text-white";

const CreateEstatePage = () => {
  const navigate = useNavigate();
  const { user, getAuthHeaders, refreshUser } = useAuth();
  const scrollRef = useRef(null);

  const [step, setStep] = useState(0);
  const [direction, setDirection] = useState('right');
  const [slidePhase, setSlidePhase] = useState('idle');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  // Pre-populated from user profile
  const [firstName, setFirstName] = useState('');
  const [middleName, setMiddleName] = useState('');
  const [lastName, setLastName] = useState('');
  const [suffix, setSuffix] = useState('none');
  const [gender, setGender] = useState('not_selected');
  const [dateOfBirth, setDateOfBirth] = useState('');
  const [maritalStatus, setMaritalStatus] = useState('not_selected');
  const [addressStreet, setAddressStreet] = useState('');
  const [addressCity, setAddressCity] = useState('');
  const [addressState, setAddressState] = useState('');
  const [addressZip, setAddressZip] = useState('');
  const [addressLine2, setAddressLine2] = useState('');

  // New data
  const [role, setRole] = useState('');
  const [benefactorEmail, setBenefactorEmail] = useState('');
  const [benefactorEmailError, setBenefactorEmailError] = useState('');
  const [dependentsOver18, setDependentsOver18] = useState(0);
  const [dependentsUnder18, setDependentsUnder18] = useState(0);
  const [beneficiaries, setBeneficiaries] = useState([]);
  const [emailErrors, setEmailErrors] = useState({});

  // Load user profile data
  useEffect(() => {
    const loadProfile = async () => {
      try {
        const res = await axios.get(`${API_URL}/auth/me`, getAuthHeaders());
        const p = res.data;
        setFirstName(p.first_name || '');
        setMiddleName(p.middle_name || '');
        setLastName(p.last_name || '');
        setSuffix(p.suffix || 'none');
        setGender(p.gender || 'not_selected');
        setDateOfBirth(p.date_of_birth || '');
        setMaritalStatus(p.marital_status || 'not_selected');
        setAddressStreet(p.address_street || '');
        setAddressCity(p.address_city || '');
        setAddressState(p.address_state || '');
        setAddressZip(p.address_zip || '');
        setAddressLine2(p.address_line2 || '');
      } catch {
        toast.error('Failed to load profile data');
      } finally {
        setLoading(false);
      }
    };
    loadProfile();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Generate beneficiary slots based on marital status + dependents
  useEffect(() => {
    if (role !== 'benefactor') return;
    const slots = [];
    if (maritalStatus === 'married' || maritalStatus === 'domestic_partnership') {
      slots.push({ relation: 'Spouse', requireEmail: true });
    }
    for (let i = 0; i < dependentsOver18; i++) {
      slots.push({ relation: `Adult Beneficiary ${i + 1}`, requireEmail: true });
    }
    for (let i = 0; i < dependentsUnder18; i++) {
      slots.push({ relation: `Minor Beneficiary ${i + 1}`, requireEmail: false });
    }
    setBeneficiaries(prev => {
      return slots.map((slot, idx) => ({
        ...slot,
        first_name: prev[idx]?.first_name || '',
        middle_name: prev[idx]?.middle_name || '',
        last_name: prev[idx]?.last_name || '',
        email: prev[idx]?.email || '',
        dob: prev[idx]?.dob || '',
        gender: prev[idx]?.gender || '',
        same_address: prev[idx]?.same_address !== undefined ? prev[idx].same_address : true,
        address_street: prev[idx]?.address_street || '',
        address_city: prev[idx]?.address_city || '',
        address_state: prev[idx]?.address_state || '',
        address_zip: prev[idx]?.address_zip || '',
      }));
    });
  }, [maritalStatus, dependentsOver18, dependentsUnder18, role]);

  // Dynamic steps
  const computeSteps = () => {
    const steps = [
      { id: 'confirm', label: 'Confirm', icon: User },
      { id: 'role', label: 'Role', icon: Users },
    ];
    if (role === 'beneficiary') {
      return steps;
    }
    if (role === 'benefactor') {
      steps.push({ id: 'family', label: 'Family', icon: Heart });
      beneficiaries.forEach((ben, idx) => {
        steps.push({ id: `beneficiary_${idx}`, label: ben.relation, icon: UserPlus, benIndex: idx });
      });
    }
    return steps;
  };

  const STEPS = computeSteps();
  const currentStep = STEPS[step] || STEPS[0];

  const goTo = (nextStep) => {
    if (slidePhase !== 'idle' || nextStep === step) return;
    setDirection(nextStep > step ? 'right' : 'left');
    setSlidePhase('exit');
    setTimeout(() => {
      setStep(nextStep);
      setSlidePhase('enter');
      if (scrollRef.current) scrollRef.current.scrollTop = 0;
      setTimeout(() => setSlidePhase('idle'), 350);
    }, 300);
  };

  const canAdvance = () => {
    const sid = currentStep?.id;
    if (sid === 'confirm') return firstName.trim() && lastName.trim();
    if (sid === 'role') {
      if (!role) return false;
      if (role === 'beneficiary' && !benefactorEmail.trim()) return false;
      if (role === 'beneficiary' && benefactorEmailError) return false;
      return true;
    }
    if (sid === 'family') return true;
    if (sid?.startsWith('beneficiary_')) {
      const idx = currentStep.benIndex;
      const ben = beneficiaries[idx];
      if (!ben) return false;
      if (!ben.first_name.trim() || !ben.last_name.trim()) return false;
      if (ben.requireEmail && !ben.email.trim()) return false;
      if (emailErrors[idx]) return false;
      return true;
    }
    return false;
  };

  const handleNext = () => {
    if (!canAdvance()) {
      const sid = currentStep?.id;
      if (sid === 'confirm') toast.error('Please confirm your name');
      if (sid === 'role') {
        if (!role) toast.error('Please select your role');
        else if (role === 'beneficiary' && !benefactorEmail.trim()) toast.error('Please enter the benefactor\'s email');
      }
      if (sid?.startsWith('beneficiary_')) {
        if (emailErrors[currentStep.benIndex]) toast.error(emailErrors[currentStep.benIndex]);
        else toast.error('Please fill in the required fields');
      }
      return;
    }
    if (step < STEPS.length - 1) {
      goTo(step + 1);
    } else {
      handleSubmit();
    }
  };

  const handleSubmit = async () => {
    setSubmitting(true);
    try {
      if (role === 'benefactor') {
        const enrollments = beneficiaries.filter(b => b.first_name.trim()).map(b => ({
          first_name: b.first_name,
          last_name: b.last_name,
          middle_name: b.middle_name || null,
          email: b.email || null,
          dob: b.dob || null,
          gender: b.gender || null,
          relation: b.relation,
          address_street: b.same_address ? addressStreet : b.address_street,
          address_city: b.same_address ? addressCity : b.address_city,
          address_state: b.same_address ? addressState : b.address_state,
          address_zip: b.same_address ? addressZip : b.address_zip,
        }));

        console.log('[CarryOn] Estate creation — beneficiaries state:', beneficiaries.length, 'filtered enrollments:', enrollments.length, enrollments.map(e => e.first_name));

        const res = await axios.post(`${API_URL}/accounts/create-estate`, {
          beneficiary_enrollments: enrollments,
        }, getAuthHeaders());

        console.log('[CarryOn] Estate creation response:', res.data);

        if (res.data.auto_linked?.length > 0) {
          const names = res.data.auto_linked.map(u => u.name).join(', ');
          toast.success(`Estate created! ${names} already had accounts and were auto-linked.`);
        } else if (res.data.beneficiaries_enrolled > 0) {
          toast.success(`Estate created with ${res.data.beneficiaries_enrolled} beneficiar${res.data.beneficiaries_enrolled === 1 ? 'y' : 'ies'}!`);
        } else {
          toast.success('Your estate has been created successfully!');
        }

        // Refresh user data so is_also_benefactor is updated in auth state
        await refreshUser();

        // Clear API cache so dashboard fetches fresh estate/beneficiary data
        clearCache();

        // Navigate to the benefactor dashboard for this new estate
        localStorage.setItem('selected_estate_id', res.data.estate_id);
        navigate('/dashboard');
      } else {
        // Beneficiary — link to existing estate
        const res = await axios.post(`${API_URL}/accounts/add-beneficiary-link`, {
          benefactor_email: benefactorEmail,
        }, getAuthHeaders());

        toast.success(res.data.message || 'You have been linked to the estate.');
        navigate('/beneficiary');
      }
    } catch (err) {
      const msg = err.response?.data?.detail || 'Failed to create estate';
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  };

  const validateBenefactorEmail = async (emailVal) => {
    if (!emailVal?.trim()) { setBenefactorEmailError(''); return; }
    try {
      const res = await axios.post(`${API_URL}/auth/check-benefactor-email`, { email: emailVal.trim() });
      setBenefactorEmailError(res.data.valid ? '' : (res.data.message || 'Invalid benefactor email'));
    } catch { /* silent */ }
  };

  const validateBenEmail = (emailVal, benIndex) => {
    if (!emailVal?.trim()) {
      setEmailErrors(prev => { const n = { ...prev }; delete n[benIndex]; return n; });
      return;
    }
    const normalizedEmail = emailVal.toLowerCase().trim();
    const isDuplicate = beneficiaries.some((b, i) => i !== benIndex && b.email?.toLowerCase().trim() === normalizedEmail);
    if (isDuplicate) {
      setEmailErrors(prev => ({ ...prev, [benIndex]: 'This email is already assigned to another beneficiary.' }));
    } else {
      setEmailErrors(prev => { const n = { ...prev }; delete n[benIndex]; return n; });
    }
  };

  const getSlideStyle = () => {
    const goingForward = direction === 'right';
    if (slidePhase === 'exit') {
      return { transform: `translateX(${goingForward ? '-100px' : '100px'})`, opacity: 0, transition: 'transform 0.3s cubic-bezier(0.4,0,0.2,1), opacity 0.2s ease' };
    }
    if (slidePhase === 'enter') {
      return { transform: `translateX(${goingForward ? '60px' : '-60px'})`, opacity: 0, transition: 'none' };
    }
    return { transform: 'translateX(0)', opacity: 1, transition: 'transform 0.35s cubic-bezier(0.16,1,0.3,1), opacity 0.3s ease' };
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: '#080e1a' }}>
        <Loader2 className="w-8 h-8 text-[#d4af37] animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen relative overflow-hidden" style={{ background: '#080e1a' }}>
      {/* NAV */}
      <nav className="fixed top-0 w-full z-50" style={{ borderBottom: '1px solid rgba(212,175,55,0.08)', background: 'rgba(8,14,26,0.97)', paddingTop: 'env(safe-area-inset-top, 0px)' }}>
        <div className="max-w-[1400px] mx-auto px-6 lg:px-10 h-16 flex items-center justify-between">
          <img src="/carryon-logo.jpg" alt="CarryOn" className="h-12" />
          <button onClick={() => navigate(-1)} className="text-[#d4af37] text-sm font-semibold hover:text-[#fcd34d] transition-colors flex items-center gap-1" data-testid="create-estate-back">
            <ArrowLeft className="w-3.5 h-3.5" /> Back
          </button>
        </div>
      </nav>

      {/* Background */}
      <div className="absolute inset-0 z-0" style={{ opacity: 0.5 }}>
        <img src="/flag-bg.jpg" alt="" className="w-full h-full object-cover" />
      </div>
      <div className="absolute inset-0 z-[1]" style={{ background: 'linear-gradient(180deg, rgba(11,18,33,0.4) 0%, rgba(11,18,33,0.85) 70%, #0B1221 100%)' }} />
      <div className="absolute inset-0 z-[2]" style={{ background: 'radial-gradient(ellipse 70% 50% at 35% 50%, rgba(212,175,55,0.04) 0%, transparent 70%)' }} />

      {/* MAIN */}
      <div className="relative z-10 min-h-screen flex items-start lg:items-center" style={{ paddingTop: 'calc(4rem + env(safe-area-inset-top, 0px))' }}>
        <div className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-10 w-full py-4 lg:py-0">
          <div className="grid lg:grid-cols-[1fr_520px] gap-6 lg:gap-16 items-center">

            {/* LEFT — Branding */}
            <div className="hidden lg:block">
              <h1 className="text-4xl font-bold text-white leading-tight mb-3" style={{ fontFamily: 'Outfit, sans-serif' }}>
                Expand Your
                <span className="block text-[#d4af37] mt-1">Legacy Network.</span>
              </h1>
              <p className="text-[#7b879e] text-base max-w-sm leading-relaxed mb-6">
                Use your existing account to create a new estate plan or connect to another family member's estate.
              </p>
              <div className="p-4 rounded-xl mb-6 max-w-sm" style={{ background: 'rgba(212,175,55,0.06)', border: '1px solid rgba(212,175,55,0.15)' }}>
                <div className="flex items-start gap-3">
                  <AlertCircle className="w-4 h-4 text-[#d4af37] flex-shrink-0 mt-0.5" />
                  <p className="text-[#d4af37] text-xs leading-relaxed">
                    Your existing beneficiary access will remain intact. This adds a new role to your account.
                  </p>
                </div>
              </div>
            </div>

            {/* MOBILE header */}
            <div className="lg:hidden text-center mb-2">
              <h1 className="text-xl sm:text-2xl font-bold text-white leading-tight mb-0.5" style={{ fontFamily: 'Outfit, sans-serif' }}>
                Expand Your <span className="text-[#d4af37]">Legacy Network</span>
              </h1>
              <p className="text-[#6b7a90] text-xs">Add a new estate or connect to a family member</p>
            </div>

            {/* RIGHT — Wizard Card */}
            <div className="flex justify-center lg:justify-end">
              <div className="w-full max-w-[100vw] rounded-2xl relative overflow-hidden" style={{
                background: 'linear-gradient(160deg, rgba(18,28,48,0.97), rgba(12,20,38,0.99))',
                border: '1px solid rgba(212,175,55,0.12)',
                boxShadow: '0 8px 80px rgba(0,0,0,0.5)',
              }}>
                <div className="absolute top-0 left-8 right-8 h-[2px]" style={{ background: 'linear-gradient(90deg, transparent, #d4af37, transparent)' }} />

                {/* Progress */}
                <div className="px-5 sm:px-7 pt-5 sm:pt-7 pb-2">
                  <div className="flex items-center gap-0 mb-3 overflow-hidden">
                    {STEPS.map((s, i) => (
                      <div key={s.id} className="flex items-center flex-1 min-w-0">
                        <button onClick={() => { if (i < step) goTo(i); }} className="flex-shrink-0" style={{ cursor: i < step ? 'pointer' : 'default' }} data-testid={`create-estate-step-${i}`}>
                          <div className="w-7 h-7 sm:w-9 sm:h-9 rounded-full flex items-center justify-center font-bold text-sm sm:text-base transition-all duration-500" style={{
                            background: i <= step ? 'linear-gradient(135deg, #d4af37, #b8962e)' : 'rgba(255,255,255,0.05)',
                            color: i <= step ? '#080e1a' : '#3a4a63',
                            boxShadow: i === step ? '0 0 16px rgba(212,175,55,0.4)' : 'none',
                          }}>
                            {i + 1}
                          </div>
                        </button>
                        {i < STEPS.length - 1 && (
                          <div className="flex-1 h-[2px] mx-1 sm:mx-1.5 rounded-full transition-all duration-700 min-w-[4px]" style={{
                            background: i < step ? '#d4af37' : 'rgba(255,255,255,0.06)',
                          }} />
                        )}
                      </div>
                    ))}
                  </div>
                  <p className="text-[#525c72] text-xs mb-1">Step {step + 1} of {STEPS.length}</p>
                </div>

                {/* Step Content */}
                <div className="px-4 sm:px-6 pb-5 sm:pb-7 flex flex-col" style={{ minHeight: 400 }}>
                  <div ref={scrollRef} className="flex-1 overflow-auto scrollbar-hide px-3" style={getSlideStyle()}>

                    {/* STEP: Confirm Info */}
                    {currentStep?.id === 'confirm' && (
                      <div className="space-y-4">
                        <div>
                          <h2 className="text-white text-lg sm:text-xl font-semibold mb-1" style={{ fontFamily: 'Outfit, sans-serif' }}>Confirm your information</h2>
                          <p className="text-[#6b7a90] text-sm">We've pre-filled your details. Please review and update if needed.</p>
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                          <div className="space-y-1.5">
                            <Label className="text-[#7b879e] text-sm font-medium">First Name</Label>
                            <Input value={firstName} onChange={(e) => setFirstName(e.target.value)} className={inputClass} data-testid="create-estate-firstname" />
                          </div>
                          <div className="space-y-1.5">
                            <Label className="text-[#7b879e] text-sm font-medium">Last Name</Label>
                            <Input value={lastName} onChange={(e) => setLastName(e.target.value)} className={inputClass} data-testid="create-estate-lastname" />
                          </div>
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                          <div className="space-y-1.5">
                            <Label className="text-[#7b879e] text-sm font-medium">Gender</Label>
                            <Select value={gender} onValueChange={setGender}>
                              <SelectTrigger className={selectClass}><SelectValue placeholder="Select..." /></SelectTrigger>
                              <SelectContent className="bg-[var(--bg2)] border-[var(--b)] text-[var(--t)]">
                                {genderOptions.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="space-y-1.5">
                            <Label className="text-[#7b879e] text-sm font-medium">Date of Birth</Label>
                            <DateMaskInput value={dateOfBirth} onChange={(e) => setDateOfBirth(e.target.value)} className={inputClass} data-testid="create-estate-dob" />
                          </div>
                        </div>
                        <div className="space-y-1.5">
                          <Label className="text-[#7b879e] text-sm font-medium">Street Address</Label>
                          <AddressAutocomplete
                            value={addressStreet}
                            onChange={(e) => setAddressStreet(e.target.value)}
                            onSelect={({ street, city, state, zip }) => { setAddressStreet(street); setAddressCity(city); setAddressState(state); setAddressZip(zip); }}
                            placeholder="Street address" className={inputClass} data-testid="create-estate-address"
                          />
                        </div>
                        <div className="space-y-1.5">
                          <Label className="text-[#7b879e] text-sm font-medium">Apt / Unit / Suite</Label>
                          <Input value={addressLine2} onChange={(e) => setAddressLine2(e.target.value)} placeholder="Apartment, unit, suite, etc." className={inputClass} data-testid="create-estate-address-line2" />
                        </div>
                        <div className="grid grid-cols-3 gap-2">
                          <Input value={addressCity} onChange={(e) => setAddressCity(e.target.value)} placeholder="City" className={inputClass} />
                          <Select value={addressState} onValueChange={setAddressState}>
                            <SelectTrigger className={selectClass}><SelectValue placeholder="State" /></SelectTrigger>
                            <SelectContent className="bg-[var(--bg2)] border-[var(--b)] text-[var(--t)] max-h-48">
                              {usStates.map(st => <SelectItem key={st} value={st}>{st}</SelectItem>)}
                            </SelectContent>
                          </Select>
                          <Input value={addressZip} onChange={(e) => setAddressZip(e.target.value)} placeholder="ZIP" className={inputClass} maxLength={10} />
                        </div>
                      </div>
                    )}

                    {/* STEP: Role Selection */}
                    {currentStep?.id === 'role' && (
                      <div className="space-y-3">
                        <div>
                          <h2 className="text-white text-lg sm:text-xl font-semibold mb-1" style={{ fontFamily: 'Outfit, sans-serif' }}>What would you like to do?</h2>
                          <p className="text-[#6b7a90] text-sm">Choose how you want to connect to a new estate.</p>
                        </div>
                        <div className="rounded-xl p-3" style={{ background: 'rgba(212,175,55,0.06)', border: '1px solid rgba(212,175,55,0.15)' }}>
                          <p className="text-xs text-[#d4af37] leading-relaxed">
                            Your existing beneficiary access is never affected. This adds a new estate connection to your account.
                          </p>
                        </div>
                        <div className="space-y-2">
                          {[
                            { value: 'benefactor', title: 'Create My Own Estate', subtitle: 'Benefactor', desc: 'Start your own estate plan to protect your family.', color: '#d4af37', icon: Shield },
                            { value: 'beneficiary', title: 'Join Another Estate', subtitle: 'Beneficiary', desc: 'A family member has an estate plan and I want to be added.', color: '#60A5FA', icon: Users },
                          ].map(r => {
                            const RIcon = r.icon;
                            return (
                              <button key={r.value} type="button" onClick={() => setRole(r.value)}
                                className="w-full text-left p-4 rounded-xl transition-all duration-300"
                                style={{
                                  background: role === r.value ? `linear-gradient(135deg, ${r.color}12, ${r.color}05)` : 'rgba(255,255,255,0.02)',
                                  border: role === r.value ? `2px solid ${r.color}50` : '1px solid rgba(255,255,255,0.06)',
                                }}
                                data-testid={`create-estate-role-${r.value}`}
                              >
                                <div className="flex items-center gap-3">
                                  <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: `${r.color}15`, border: `1px solid ${r.color}25` }}>
                                    <RIcon className="w-5 h-5" style={{ color: r.color }} />
                                  </div>
                                  <div className="flex-1 min-w-0">
                                    <h3 className="text-white font-bold text-base">{r.title} <span className="text-sm font-semibold" style={{ color: r.color }}>· {r.subtitle}</span></h3>
                                    <p className="text-[#94a3b8] text-xs">{r.desc}</p>
                                  </div>
                                  {role === r.value && (
                                    <div className="w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: r.color }}>
                                      <Check className="w-3.5 h-3.5 text-[#080e1a]" />
                                    </div>
                                  )}
                                </div>
                              </button>
                            );
                          })}
                        </div>
                        {role === 'beneficiary' && (
                          <div className="space-y-1.5 pt-2">
                            <Label className="text-[#7b879e] text-sm font-medium">Benefactor's Email <span className="text-red-400">*</span></Label>
                            <div className="relative">
                              <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-[#3a4a63]" />
                              <Input
                                type="email" value={benefactorEmail}
                                onChange={(e) => { setBenefactorEmail(e.target.value); if (benefactorEmailError) setBenefactorEmailError(''); }}
                                onBlur={() => validateBenefactorEmail(benefactorEmail)}
                                placeholder="Your benefactor's email address"
                                className={`${inputClass} pl-11 ${benefactorEmailError ? 'border-red-500' : ''}`}
                                data-testid="create-estate-benefactor-email"
                              />
                            </div>
                            {benefactorEmailError ? (
                              <p className="text-red-400 text-xs">{benefactorEmailError}</p>
                            ) : (
                              <p className="text-[#525c72] text-[10px]">Enter the email of the person whose estate you're joining.</p>
                            )}
                          </div>
                        )}
                      </div>
                    )}

                    {/* STEP: Family (marital + dependents) */}
                    {currentStep?.id === 'family' && (
                      <div className="space-y-3">
                        <div>
                          <h2 className="text-white text-lg sm:text-xl font-semibold mb-1" style={{ fontFamily: 'Outfit, sans-serif' }}>Your Family</h2>
                          <p className="text-[#6b7a90] text-sm">This helps set up your beneficiaries.</p>
                        </div>
                        <div className="space-y-1.5">
                          <Label className="text-[#7b879e] text-sm font-medium">Marital Status</Label>
                          <Select value={maritalStatus} onValueChange={setMaritalStatus}>
                            <SelectTrigger className={selectClass}><SelectValue placeholder="Select..." /></SelectTrigger>
                            <SelectContent className="bg-[var(--bg2)] border-[var(--b)] text-[var(--t)]">
                              {maritalOptions.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                            </SelectContent>
                          </Select>
                        </div>
                        {(maritalStatus === 'married' || maritalStatus === 'domestic_partnership') && (
                          <p className="text-[#525c72] text-[10px] -mt-1">Your spouse will be added in the next step — do not count them below.</p>
                        )}
                        <div className="grid grid-cols-2 gap-3">
                          <div className="space-y-1.5">
                            <Label className="text-[#7b879e] text-sm font-medium">Beneficiaries Under 18</Label>
                            <Select value={String(dependentsUnder18)} onValueChange={(v) => setDependentsUnder18(parseInt(v))}>
                              <SelectTrigger className={selectClass}><SelectValue placeholder="0" /></SelectTrigger>
                              <SelectContent className="bg-[var(--bg2)] border-[var(--b)] text-[var(--t)]">
                                {[...Array(11)].map((_, i) => <SelectItem key={i} value={String(i)}>{i}</SelectItem>)}
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="space-y-1.5">
                            <Label className="text-[#7b879e] text-sm font-medium">Beneficiaries Over 18</Label>
                            <Select value={String(dependentsOver18)} onValueChange={(v) => setDependentsOver18(parseInt(v))}>
                              <SelectTrigger className={selectClass}><SelectValue placeholder="0" /></SelectTrigger>
                              <SelectContent className="bg-[var(--bg2)] border-[var(--b)] text-[var(--t)]">
                                {[...Array(11)].map((_, i) => <SelectItem key={i} value={String(i)}>{i}</SelectItem>)}
                              </SelectContent>
                            </Select>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* STEP: Beneficiary enrollment tiles */}
                    {currentStep?.id?.startsWith('beneficiary_') && (() => {
                      const idx = currentStep.benIndex;
                      const ben = beneficiaries[idx];
                      if (!ben) return null;
                      const updateBen = (field, value) => {
                        setBeneficiaries(prev => prev.map((b, i) => i === idx ? { ...b, [field]: value } : b));
                      };
                      return (
                        <div className="space-y-3">
                          <div>
                            <h2 className="text-white text-lg sm:text-xl font-semibold mb-1" style={{ fontFamily: 'Outfit, sans-serif' }}>{ben.relation}</h2>
                            <p className="text-[#6b7a90] text-sm">Enter their details. If they already have a CarryOn account, they'll be auto-linked.</p>
                          </div>
                          <div className="grid grid-cols-2 gap-3">
                            <div className="space-y-1.5">
                              <Label className="text-[#7b879e] text-sm font-medium">First Name <span className="text-red-400">*</span></Label>
                              <Input value={ben.first_name} onChange={(e) => updateBen('first_name', e.target.value)} placeholder="First name" className={inputClass} />
                            </div>
                            <div className="space-y-1.5">
                              <Label className="text-[#7b879e] text-sm font-medium">Last Name <span className="text-red-400">*</span></Label>
                              <Input value={ben.last_name} onChange={(e) => updateBen('last_name', e.target.value)} placeholder="Last name" className={inputClass} />
                            </div>
                          </div>
                          <div className="space-y-1.5">
                            <Label className="text-[#7b879e] text-sm font-medium">Middle Name <span className="text-[#525c72] text-xs font-normal">(optional)</span></Label>
                            <Input value={ben.middle_name} onChange={(e) => updateBen('middle_name', e.target.value)} placeholder="Middle name" className={inputClass} />
                          </div>
                          <div className="space-y-1.5">
                            <Label className="text-[#7b879e] text-sm font-medium">Email {ben.requireEmail ? <span className="text-red-400">*</span> : '(optional)'}</Label>
                            <Input type="email" value={ben.email} onChange={(e) => { updateBen('email', e.target.value); if (emailErrors[idx]) setEmailErrors(prev => { const n = { ...prev }; delete n[idx]; return n; }); }}
                              onBlur={() => validateBenEmail(ben.email, idx)}
                              placeholder="Their email address" className={`${inputClass} ${emailErrors[idx] ? 'border-red-500' : ''}`} />
                            {emailErrors[idx] && <p className="text-red-400 text-xs">{emailErrors[idx]}</p>}
                            <p className="text-[#525c72] text-[10px]">If they already have a CarryOn account, they'll be automatically connected to your estate.</p>
                          </div>
                          <div className="grid grid-cols-2 gap-3">
                            <div className="space-y-1.5">
                              <Label className="text-[#7b879e] text-sm font-medium">Date of Birth</Label>
                              <DateMaskInput value={ben.dob} onChange={(e) => updateBen('dob', e.target.value)} className={inputClass} />
                            </div>
                            <div className="space-y-1.5">
                              <Label className="text-[#7b879e] text-sm font-medium">Relationship</Label>
                              <Select value={ben.relation} onValueChange={(v) => updateBen('relation', v)}>
                                <SelectTrigger className={selectClass} tabIndex={0}><SelectValue placeholder="Select..." /></SelectTrigger>
                                <SelectContent className="bg-[var(--bg2)] border-[var(--b)] text-[var(--t)]">
                                  {beneficiaryRelations.map(rel => <SelectItem key={rel} value={rel}>{rel}</SelectItem>)}
                                </SelectContent>
                              </Select>
                            </div>
                          </div>
                          <div className="flex items-center gap-3 p-3 rounded-xl" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}>
                            <input type="checkbox" checked={ben.same_address} onChange={(e) => updateBen('same_address', e.target.checked)} className="w-4 h-4 rounded" />
                            <span className="text-sm text-[#94a3b8]">Same address as mine</span>
                          </div>
                          {!ben.same_address && (
                            <div className="space-y-2">
                              <AddressAutocomplete
                                value={ben.address_street} onChange={(e) => updateBen('address_street', e.target.value)}
                                onSelect={({ street, city, state, zip }) => setBeneficiaries(prev => prev.map((b, i) => i === idx ? { ...b, address_street: street, address_city: city, address_state: state, address_zip: zip } : b))}
                                placeholder="Street address" className={inputClass}
                              />
                              <div className="grid grid-cols-3 gap-2">
                                <Input value={ben.address_city} onChange={(e) => updateBen('address_city', e.target.value)} placeholder="City" className={inputClass} />
                                <Select value={ben.address_state} onValueChange={(v) => updateBen('address_state', v)}>
                                  <SelectTrigger className={selectClass}><SelectValue placeholder="State" /></SelectTrigger>
                                  <SelectContent className="bg-[var(--bg2)] border-[var(--b)] text-[var(--t)] max-h-48">
                                    {usStates.map(st => <SelectItem key={st} value={st}>{st}</SelectItem>)}
                                  </SelectContent>
                                </Select>
                                <Input value={ben.address_zip} onChange={(e) => updateBen('address_zip', e.target.value)} placeholder="ZIP" className={inputClass} maxLength={10} />
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })()}
                  </div>

                  {/* Navigation Buttons */}
                  <div className="flex gap-3 mt-4 px-3">
                    {step > 0 && (
                      <Button variant="outline" onClick={() => goTo(step - 1)} className="flex-1 border-[#1a2a42] text-white hover:bg-[#1a2a42]/50 h-12" data-testid="create-estate-back-step">
                        <ArrowLeft className="w-4 h-4 mr-2" /> Back
                      </Button>
                    )}
                    <Button
                      onClick={handleNext}
                      disabled={submitting || !canAdvance()}
                      className="flex-1 h-12 font-bold text-base transition-all"
                      style={{
                        background: canAdvance() ? 'linear-gradient(135deg, #d4af37, #b8962e)' : 'rgba(255,255,255,0.05)',
                        color: canAdvance() ? '#080e1a' : '#3a4a63',
                      }}
                      data-testid="create-estate-next"
                    >
                      {submitting ? (
                        <Loader2 className="w-5 h-5 animate-spin" />
                      ) : step < STEPS.length - 1 ? (
                        <>Continue <ArrowRight className="w-4 h-4 ml-2" /></>
                      ) : role === 'beneficiary' ? (
                        'Join Estate'
                      ) : (
                        'Create My Estate'
                      )}
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CreateEstatePage;
