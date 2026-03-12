import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import axios from 'axios';
import { cachedGet } from '../utils/apiCache';
import {
  Users, Plus, ArrowRight, Loader2, CheckCircle, UserPlus,
  ChevronDown, ChevronUp
} from 'lucide-react';
import { Card, CardContent } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '../components/ui/dialog';
import { Textarea } from '../components/ui/textarea';
import DateMaskInput from '../components/DateMaskInput';
import { toast } from '../utils/toast';
import AddressAutocomplete from '../components/AddressAutocomplete';

const API_URL = `${process.env.REACT_APP_BACKEND_URL}/api`;

const relations = ['Spouse', 'Son', 'Daughter', 'Son-in-law', 'Daughter-in-law', 'Mother', 'Father', 'Mother-in-law', 'Father-in-law', 'Brother', 'Sister', 'Aunt', 'Uncle', 'Grandson', 'Granddaughter', 'Grandmother', 'Grandfather', 'Nephew', 'Niece', 'Great-Grandson', 'Great-Granddaughter', 'Great-Grandmother', 'Great-Grandfather', 'Friend', 'Other'];
const avatarColors = ['#d4af37', '#3b82f6', '#10b981', '#8b5cf6', '#ef4444', '#f59e0b', '#ec4899', '#06b6d4'];
const usStates = [
  'AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DE', 'FL', 'GA',
  'HI', 'ID', 'IL', 'IN', 'IA', 'KS', 'KY', 'LA', 'ME', 'MD',
  'MA', 'MI', 'MN', 'MS', 'MO', 'MT', 'NE', 'NV', 'NH', 'NJ',
  'NM', 'NY', 'NC', 'ND', 'OH', 'OK', 'OR', 'PA', 'RI', 'SC',
  'SD', 'TN', 'TX', 'UT', 'VT', 'VA', 'WA', 'WV', 'WI', 'WY', 'DC'
];

const OnboardingPage = () => {
  const navigate = useNavigate();
  const { user, getAuthHeaders } = useAuth();
  const [estate, setEstate] = useState(null);
  const [beneficiaries, setBeneficiaries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [adding, setAdding] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  
  // Form state
  const [firstName, setFirstName] = useState('');
  const [middleName, setMiddleName] = useState('');
  const [lastName, setLastName] = useState('');
  const [suffix, setSuffix] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [relation, setRelation] = useState('');
  const [dateOfBirth, setDateOfBirth] = useState('');
  const [gender, setGender] = useState('');
  const [addressStreet, setAddressStreet] = useState('');
  const [addressCity, setAddressCity] = useState('');
  const [addressState, setAddressState] = useState('');
  const [addressZip, setAddressZip] = useState('');
  const [ssnLastFour, setSsnLastFour] = useState('');
  const [notes, setNotes] = useState('');
  const [avatarColor, setAvatarColor] = useState(avatarColors[0]);

  useEffect(() => {
    fetchData();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const fetchData = async () => {
    try {
      const estatesRes = await cachedGet(axios, `${API_URL}/estates`, getAuthHeaders());
      if (estatesRes.data.length > 0) {
        setEstate(estatesRes.data[0]);
        const bensRes = await axios.get(`${API_URL}/beneficiaries/${estatesRes.data[0].id}`, getAuthHeaders());
        setBeneficiaries(bensRes.data);
      }
    } catch (error) {
      console.error('Fetch error:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleAdd = async () => {
    if (!firstName || !lastName || !email || !relation) {
      toast.error('Please fill First Name, Last Name, Email, and Relationship');
      return;
    }
    
    setAdding(true);
    try {
      const newBen = await axios.post(`${API_URL}/beneficiaries`, {
        estate_id: estate.id,
        first_name: firstName,
        middle_name: middleName || null,
        last_name: lastName,
        suffix: suffix || null,
        email,
        phone: phone ? `+1${phone.replace(/\D/g, '')}` : null,
        relation,
        date_of_birth: dateOfBirth || null,
        gender: gender || null,
        address_street: addressStreet || null,
        address_city: addressCity || null,
        address_state: addressState || null,
        address_zip: addressZip || null,
        ssn_last_four: ssnLastFour || null,
        notes: notes || null,
        avatar_color: avatarColor
      }, getAuthHeaders());
      
      setBeneficiaries([...beneficiaries, newBen.data]);
      // toast removed
      setShowAddModal(false);
      resetForm();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to add beneficiary');
    } finally {
      setAdding(false);
    }
  };

  const resetForm = () => {
    setFirstName('');
    setMiddleName('');
    setLastName('');
    setSuffix('');
    setEmail('');
    setPhone('');
    setRelation('');
    setDateOfBirth('');
    setGender('');
    setAddressStreet('');
    setAddressCity('');
    setAddressState('');
    setAddressZip('');
    setSsnLastFour('');
    setNotes('');
    setAvatarColor(avatarColors[Math.floor(Math.random() * avatarColors.length)]);
    setShowAdvanced(false);
  };

  const handleContinue = () => {
    if (beneficiaries.length === 0) {
      // Show confirmation if skipping
      if (window.confirm('Are you sure you want to skip adding beneficiaries? You can always add them later from the Beneficiaries page.')) {
        navigate('/dashboard');
      }
    } else {
      navigate('/dashboard');
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" 
        style={{ background: 'linear-gradient(145deg, #0F1629, #141C33 40%, #0F1629)' }}>
        <Loader2 className="w-8 h-8 text-[#d4af37] animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen p-4 py-8"
      style={{ background: 'linear-gradient(145deg, #0F1629, #141C33 40%, #0F1629)' }}>
      <div className="max-w-2xl mx-auto">
        {/* Header */}
        <div className="text-center mb-8">
          <img src="/carryon-logo.jpg" alt="CarryOn™" className="w-32 h-auto mx-auto mb-4" />
          <h1 className="text-2xl font-bold text-white mb-2" style={{ fontFamily: 'Outfit, sans-serif' }}>
            Welcome, {user?.first_name || user?.name?.split(' ')[0]}! 🎉
          </h1>
          <p className="text-[#94a3b8]">
            Let's add the people who matter most to your estate plan
          </p>
        </div>

        {/* Progress indicator */}
        <div className="flex items-center justify-center gap-2 mb-8">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-[#10b981] flex items-center justify-center">
              <CheckCircle className="w-5 h-5 text-white" />
            </div>
            <span className="text-sm text-[#10b981] font-medium">Account Created</span>
          </div>
          <div className="w-8 h-px bg-[#d4af37]" />
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-[#d4af37] flex items-center justify-center">
              <Users className="w-5 h-5 text-[#0f1629]" />
            </div>
            <span className="text-sm text-[#d4af37] font-medium">Add Beneficiaries</span>
          </div>
          <div className="w-8 h-px bg-[#334155]" />
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-[#334155] flex items-center justify-center text-[#64748b]">
              3
            </div>
            <span className="text-sm text-[#64748b]">Dashboard</span>
          </div>
        </div>

        {/* Main Card */}
        <Card className="glass-card mb-6">
          <CardContent className="p-6">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-12 h-12 rounded-xl flex items-center justify-center" 
                style={{ background: 'linear-gradient(135deg, rgba(212,175,55,0.2), rgba(212,175,55,0.1))' }}>
                <Users className="w-6 h-6 text-[#d4af37]" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-white">Your Beneficiaries</h2>
                <p className="text-sm text-[#94a3b8]">
                  {beneficiaries.length === 0 
                    ? 'Add the people who will inherit your estate plan'
                    : `${beneficiaries.length} beneficiar${beneficiaries.length === 1 ? 'y' : 'ies'} added`
                  }
                </p>
              </div>
            </div>

            {/* Beneficiaries List */}
            {beneficiaries.length > 0 && (
              <div className="space-y-3 mb-6">
                {beneficiaries.map((ben) => (
                  <div key={ben.id} className="flex items-center gap-3 p-3 rounded-lg bg-[var(--s)]">
                    <div
                      className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold overflow-hidden"
                      style={{ backgroundColor: ben.photo_url ? 'transparent' : ben.avatar_color + '30', color: ben.avatar_color }}
                    >
                      {ben.photo_url ? (
                        <img src={ben.photo_url} alt={ben.name} className="w-full h-full object-cover" />
                      ) : ben.initials || (ben.first_name?.[0] + ben.last_name?.[0]).toUpperCase()}
                    </div>
                    <div className="flex-1">
                      <p className="text-white font-medium">{ben.name}</p>
                      <p className="text-xs text-[#d4af37]">{ben.relation}</p>
                    </div>
                    <CheckCircle className="w-5 h-5 text-[#10b981]" />
                  </div>
                ))}
              </div>
            )}

            {/* Add Beneficiary Button */}
            <Button
              className="w-full py-6 border-2 border-dashed border-[#d4af37]/30 bg-transparent hover:bg-[#d4af37]/10 text-[#d4af37]"
              onClick={() => { resetForm(); setShowAddModal(true); }}
            >
              <UserPlus className="w-5 h-5 mr-2" />
              {beneficiaries.length === 0 ? 'Add Your First Beneficiary' : 'Add Another Beneficiary'}
            </Button>
          </CardContent>
        </Card>

        {/* Continue / Skip */}
        <div className="flex gap-3">
          <Button
            variant="outline"
            className="flex-1 border-[var(--b)] text-[#94a3b8] hover:text-white"
            onClick={() => navigate('/dashboard')}
          >
            Skip for Now
          </Button>
          <Button
            className="flex-1 gold-button"
            onClick={handleContinue}
          >
            Continue to Dashboard
            <ArrowRight className="w-5 h-5 ml-2" />
          </Button>
        </div>

        <p className="text-center text-xs text-[#64748b] mt-4">
          You can always add or manage beneficiaries from your dashboard
        </p>
      </div>

      {/* Add Beneficiary Modal */}
      <Dialog open={showAddModal} onOpenChange={setShowAddModal}>
        <DialogContent className="glass-card border-[var(--b)] sm:max-w-lg max-h-[85vh] overflow-y-scroll !top-[5vh] !translate-y-0">
          <DialogHeader>
            <DialogTitle className="text-white text-xl flex items-center gap-2">
              <UserPlus className="w-5 h-5 text-[#d4af37]" />
              Add Beneficiary
            </DialogTitle>
            <DialogDescription className="text-[#94a3b8]">
              Add someone to your estate plan
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            {/* Avatar Preview & Color */}
            <div className="flex items-center gap-4">
              <div
                className="w-16 h-16 rounded-full flex items-center justify-center text-xl font-bold"
                style={{ backgroundColor: avatarColor + '30', color: avatarColor }}
              >
                {firstName && lastName ? (firstName[0] + lastName[0]).toUpperCase() : '?'}
              </div>
              <div className="flex gap-1.5">
                {avatarColors.map((color) => (
                  <button
                    key={color}
                    className={`w-6 h-6 rounded-full transition-transform ${avatarColor === color ? 'ring-2 ring-white scale-110' : ''}`}
                    style={{ backgroundColor: color }}
                    onClick={() => setAvatarColor(color)}
                  />
                ))}
              </div>
            </div>

            {/* Essential Fields */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-[#94a3b8] text-sm">First Name <span className="text-red-400">*</span></Label>
                <Input value={firstName} onChange={(e) => setFirstName(e.target.value)} placeholder="John" className="input-field" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-[#94a3b8] text-sm">Last Name <span className="text-red-400">*</span></Label>
                <Input value={lastName} onChange={(e) => setLastName(e.target.value)} placeholder="Smith" className="input-field" />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-[#94a3b8] text-sm">Email Address <span className="text-red-400">*</span></Label>
              <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="john@email.com" className="input-field" />
            </div>

            <div className="space-y-1.5">
              <Label className="text-[#94a3b8] text-sm">Relationship <span className="text-red-400">*</span></Label>
              <Select value={relation} onValueChange={setRelation}>
                <SelectTrigger className="input-field">
                  <SelectValue placeholder="Select relationship" />
                </SelectTrigger>
                <SelectContent className="bg-[var(--bg2)] border-[var(--b)] text-[var(--t)]">
                  {relations.map((rel) => (
                    <SelectItem key={rel} value={rel}>{rel}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Advanced Fields Toggle */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-[#94a3b8] text-sm">Date of Birth</Label>
                <DateMaskInput value={dateOfBirth} onChange={(e) => setDateOfBirth(e.target.value)} className="input-field" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-[#94a3b8] text-sm">Gender</Label>
                <Select value={gender} onValueChange={setGender}>
                  <SelectTrigger className="input-field">
                    <SelectValue placeholder="Select" />
                  </SelectTrigger>
                  <SelectContent className="bg-[var(--bg2)] border-[var(--b)] text-[var(--t)]">
                    <SelectItem value="male">Male</SelectItem>
                    <SelectItem value="female">Female</SelectItem>
                    <SelectItem value="other">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setShowAdvanced(!showAdvanced)}
              className="flex items-center gap-2 text-sm text-[#d4af37] hover:underline"
            >
              {showAdvanced ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
              {showAdvanced ? 'Hide additional details' : 'Add more details (optional)'}
            </button>

            {/* Advanced Fields */}
            {showAdvanced && (
              <div className="space-y-4 pt-2 border-t border-[var(--b)]">
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-[#94a3b8] text-sm">Middle Name</Label>
                    <Input value={middleName} onChange={(e) => setMiddleName(e.target.value)} className="input-field" />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-[#94a3b8] text-sm">Phone</Label>
                    <Input type="tel" value={phone} onChange={(e) => {
                      const digits = e.target.value.replace(/\D/g, '').slice(0, 10);
                      let f = digits;
                      if (digits.length > 6) f = `(${digits.slice(0,3)}) ${digits.slice(3,6)}-${digits.slice(6)}`;
                      else if (digits.length > 3) f = `(${digits.slice(0,3)}) ${digits.slice(3)}`;
                      else if (digits.length > 0) f = `(${digits}`;
                      setPhone(f);
                    }} placeholder="(123) 456-7890" className="input-field" />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label className="text-[#94a3b8] text-sm">Street Address</Label>
                  <AddressAutocomplete
                    value={addressStreet}
                    onChange={(e) => setAddressStreet(e.target.value)}
                    onSelect={({ street, city, state, zip }) => {
                      setAddressStreet(street);
                      setAddressCity(city);
                      setAddressState(state);
                      setAddressZip(zip);
                    }}
                    placeholder="Start typing an address..."
                    className="input-field"
                  />
                </div>

                <div className="grid grid-cols-3 gap-2">
                  <Input value={addressCity} onChange={(e) => setAddressCity(e.target.value)} placeholder="City" className="input-field" />
                  <Select value={addressState} onValueChange={setAddressState}>
                    <SelectTrigger className="input-field">
                      <SelectValue placeholder="State" />
                    </SelectTrigger>
                    <SelectContent className="bg-[var(--bg2)] border-[var(--b)] text-[var(--t)] max-h-48">
                      {usStates.map((st) => (
                        <SelectItem key={st} value={st}>{st}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Input value={addressZip} onChange={(e) => setAddressZip(e.target.value)} placeholder="ZIP" className="input-field" maxLength={10} />
                </div>

                <div className="space-y-1.5">
                  <Label className="text-[#94a3b8] text-sm">Notes</Label>
                  <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Any special notes..." className="input-field min-h-[60px]" />
                </div>
              </div>
            )}
          </div>
          
          <div className="flex gap-3 pt-2">
            <Button variant="outline" onClick={() => setShowAddModal(false)} className="flex-1 border-[var(--b)] text-white">
              Cancel
            </Button>
            <Button onClick={handleAdd} disabled={adding || !firstName || !lastName || !email || !relation} className="flex-1 gold-button">
              {adding ? <Loader2 className="w-5 h-5 animate-spin" /> : <Plus className="w-5 h-5 mr-1" />}
              Add
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default OnboardingPage;
