import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { useAuth } from '../contexts/AuthContext';
import {
  Users,
  Plus,
  Trash2,
  Mail,
  Phone,
  UserCircle,
  Loader2,
  X
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '../components/ui/dialog';
import { toast } from 'sonner';
import { Skeleton } from '../components/ui/skeleton';

const API_URL = `${process.env.REACT_APP_BACKEND_URL}/api`;

const relations = [
  'Spouse', 'Son', 'Daughter', 'Parent', 'Sibling', 'Grandchild', 'Friend', 'Other'
];

const avatarColors = [
  '#d4af37', '#3b82f6', '#10b981', '#8b5cf6', '#ef4444', '#f59e0b', '#ec4899', '#06b6d4'
];

const BeneficiariesPage = () => {
  const { getAuthHeaders } = useAuth();
  const [beneficiaries, setBeneficiaries] = useState([]);
  const [estate, setEstate] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [adding, setAdding] = useState(false);
  
  // Form state
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [relation, setRelation] = useState('');
  const [dateOfBirth, setDateOfBirth] = useState('');
  const [gender, setGender] = useState('');
  const [avatarColor, setAvatarColor] = useState(avatarColors[0]);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const estatesRes = await axios.get(`${API_URL}/estates`, getAuthHeaders());
      if (estatesRes.data.length > 0) {
        setEstate(estatesRes.data[0]);
        const bensRes = await axios.get(`${API_URL}/beneficiaries/${estatesRes.data[0].id}`, getAuthHeaders());
        setBeneficiaries(bensRes.data);
      }
    } catch (error) {
      console.error('Fetch error:', error);
      toast.error('Failed to load beneficiaries');
    } finally {
      setLoading(false);
    }
  };

  const handleAdd = async () => {
    if (!name || !email || !relation) {
      toast.error('Please fill all required fields');
      return;
    }
    
    setAdding(true);
    try {
      await axios.post(`${API_URL}/beneficiaries`, {
        estate_id: estate.id,
        name,
        email,
        phone: phone || null,
        relation,
        date_of_birth: dateOfBirth || null,
        gender: gender || null,
        avatar_color: avatarColor
      }, getAuthHeaders());
      
      toast.success('Beneficiary added successfully');
      setShowAddModal(false);
      resetForm();
      fetchData();
    } catch (error) {
      console.error('Add error:', error);
      toast.error('Failed to add beneficiary');
    } finally {
      setAdding(false);
    }
  };

  const handleDelete = async (beneficiaryId) => {
    if (!confirm('Are you sure you want to remove this beneficiary?')) return;
    
    try {
      await axios.delete(`${API_URL}/beneficiaries/${beneficiaryId}`, getAuthHeaders());
      toast.success('Beneficiary removed');
      setBeneficiaries(beneficiaries.filter(b => b.id !== beneficiaryId));
    } catch (error) {
      console.error('Delete error:', error);
      toast.error('Failed to remove beneficiary');
    }
  };

  const resetForm = () => {
    setName('');
    setEmail('');
    setPhone('');
    setRelation('');
    setDateOfBirth('');
    setGender('');
    setAvatarColor(avatarColors[0]);
  };

  if (loading) {
    return (
      <div className="p-4 lg:p-6 pt-20 lg:pt-6 pb-24 lg:pb-6 space-y-6">
        <Skeleton className="h-12 w-64 bg-white/5" />
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3].map(i => (
            <Skeleton key={i} className="h-48 bg-white/5 rounded-2xl" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 lg:p-6 pt-20 lg:pt-6 pb-24 lg:pb-6 space-y-5 animate-fade-in" data-testid="beneficiaries-page"
      style={{ background: 'radial-gradient(ellipse at top left, rgba(34,197,94,0.12), transparent 55%), radial-gradient(ellipse at bottom right, rgba(22,163,74,0.06), transparent 55%)' }}>
      {/* Header - matching prototype */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: 'linear-gradient(135deg, rgba(34,197,94,0.2), rgba(22,163,74,0.15))' }}>
            <Users className="w-5 h-5 text-[#4EDBA8]" />
          </div>
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-[var(--t)]" style={{ fontFamily: 'Outfit, sans-serif' }}>
              Beneficiaries
            </h1>
            <p className="text-xs text-[var(--t5)]">
              {beneficiaries.length} configured · Manage your family members
            </p>
          </div>
        </div>
        <Button
          className="gold-button w-full sm:w-auto"
          onClick={() => setShowAddModal(true)}
          data-testid="add-beneficiary-button"
        >
          <Plus className="w-5 h-5 mr-2" />
          Add Beneficiary
        </Button>
      </div>

      {/* Invitation info */}
      <div className="rounded-xl p-3" style={{ background: 'rgba(37,99,235,0.04)', border: '1px solid rgba(37,99,235,0.1)' }}>
        <p className="text-xs text-[var(--bl3)] leading-relaxed">
          The invitation email will include: a link to create their CarryOn™ account, instructions to download the app, and a brief explanation of what CarryOn™ is. They will NOT be told any details about your estate, documents, or messages.
        </p>
      </div>

      {/* Beneficiaries Grid */}
      {beneficiaries.length === 0 ? (
        <Card className="glass-card">
          <CardContent className="p-12 text-center">
            <Users className="w-16 h-16 mx-auto text-[#64748b] mb-4" />
            <h3 className="text-xl font-semibold text-white mb-2">No beneficiaries yet</h3>
            <p className="text-[#94a3b8] mb-6">
              Add family members who will receive access to your estate
            </p>
            <Button className="gold-button" onClick={() => setShowAddModal(true)}>
              <Plus className="w-5 h-5 mr-2" />
              Add Your First Beneficiary
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {beneficiaries.map((ben) => (
            <Card key={ben.id} className="glass-card group" data-testid={`beneficiary-${ben.id}`}>
              <CardContent className="p-5">
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-center gap-4">
                    <div
                      className="w-14 h-14 rounded-full flex items-center justify-center text-xl font-bold"
                      style={{
                        backgroundColor: ben.avatar_color + '30',
                        color: ben.avatar_color
                      }}
                    >
                      {ben.initials || ben.name.split(' ').map(n => n[0]).join('').toUpperCase()}
                    </div>
                    <div>
                      <h3 className="text-white font-semibold text-lg">{ben.name}</h3>
                      <p className="text-[#d4af37] text-sm">{ben.relation}</p>
                    </div>
                  </div>
                  
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-[#ef4444] opacity-0 group-hover:opacity-100 transition-opacity"
                    onClick={() => handleDelete(ben.id)}
                    data-testid={`delete-beneficiary-${ben.id}`}
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
                
                <div className="space-y-2 text-sm">
                  <div className="flex items-center gap-2 text-[#94a3b8]">
                    <Mail className="w-4 h-4" />
                    <span className="truncate">{ben.email}</span>
                  </div>
                  {ben.phone && (
                    <div className="flex items-center gap-2 text-[#94a3b8]">
                      <Phone className="w-4 h-4" />
                      <span>{ben.phone}</span>
                    </div>
                  )}
                </div>
                
                <div className="mt-4 pt-4 border-t border-white/5">
                  <span className={`text-xs px-2 py-1 rounded-full ${
                    ben.user_id 
                      ? 'bg-[#10b981]/20 text-[#10b981]' 
                      : 'bg-[#f59e0b]/20 text-[#f59e0b]'
                  }`}>
                    {ben.user_id ? 'Account Linked' : 'Invite Pending'}
                  </span>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Add Beneficiary Modal */}
      <Dialog open={showAddModal} onOpenChange={setShowAddModal}>
        <DialogContent className="glass-card border-white/10 sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-white text-xl" style={{ fontFamily: 'Outfit, sans-serif' }}>
              Add Beneficiary
            </DialogTitle>
            <DialogDescription className="text-[#94a3b8]">
              Add a family member or loved one to your estate
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            {/* Avatar Preview */}
            <div className="flex justify-center">
              <div
                className="w-20 h-20 rounded-full flex items-center justify-center text-2xl font-bold transition-colors"
                style={{
                  backgroundColor: avatarColor + '30',
                  color: avatarColor
                }}
              >
                {name ? name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2) : <UserCircle className="w-10 h-10" />}
              </div>
            </div>
            
            {/* Color Picker */}
            <div className="flex justify-center gap-2">
              {avatarColors.map((color) => (
                <button
                  key={color}
                  className={`w-8 h-8 rounded-full transition-transform ${
                    avatarColor === color ? 'ring-2 ring-white ring-offset-2 ring-offset-[#0f1d35] scale-110' : ''
                  }`}
                  style={{ backgroundColor: color }}
                  onClick={() => setAvatarColor(color)}
                />
              ))}
            </div>
            
            {/* Name */}
            <div className="space-y-2">
              <Label className="text-[#94a3b8]">Full Name *</Label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="John Mitchell"
                className="input-field"
                data-testid="beneficiary-name-input"
              />
            </div>
            
            {/* Relation */}
            <div className="space-y-2">
              <Label className="text-[#94a3b8]">Relationship *</Label>
              <Select value={relation} onValueChange={setRelation}>
                <SelectTrigger className="input-field" data-testid="beneficiary-relation-select">
                  <SelectValue placeholder="Select relationship" />
                </SelectTrigger>
                <SelectContent className="bg-[#1A2440] border-white/10">
                  {relations.map((rel) => (
                    <SelectItem key={rel} value={rel}>{rel}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            
            {/* Email */}
            <div className="space-y-2">
              <Label className="text-[#94a3b8]">Email Address *</Label>
              <Input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="john@email.com"
                className="input-field"
                data-testid="beneficiary-email-input"
              />
            </div>
            
            {/* Phone */}
            <div className="space-y-2">
              <Label className="text-[#94a3b8]">Phone Number (Optional)</Label>
              <Input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+1-555-0123"
                className="input-field"
              />
            </div>

            {/* Date of Birth */}
            <div className="space-y-2">
              <Label className="text-[#94a3b8]">Date of Birth (Optional)</Label>
              <Input
                type="date"
                value={dateOfBirth}
                onChange={(e) => setDateOfBirth(e.target.value)}
                className="input-field"
                data-testid="beneficiary-dob-input"
              />
            </div>

            {/* Gender */}
            <div className="space-y-2">
              <Label className="text-[#94a3b8]">Gender (Optional)</Label>
              <Select value={gender} onValueChange={setGender}>
                <SelectTrigger className="input-field" data-testid="beneficiary-gender-select">
                  <SelectValue placeholder="Select gender" />
                </SelectTrigger>
                <SelectContent className="bg-[#1A2440] border-white/10">
                  <SelectItem value="male">Male</SelectItem>
                  <SelectItem value="female">Female</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          
          <div className="flex justify-end gap-3">
            <Button
              variant="outline"
              onClick={() => {
                setShowAddModal(false);
                resetForm();
              }}
              className="border-white/10 text-white"
            >
              Cancel
            </Button>
            <Button
              onClick={handleAdd}
              disabled={adding || !name || !email || !relation}
              className="gold-button"
              data-testid="add-beneficiary-submit"
            >
              {adding ? (
                <>
                  <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                  Adding...
                </>
              ) : (
                <>
                  <Plus className="w-5 h-5 mr-2" />
                  Add Beneficiary
                </>
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default BeneficiariesPage;
