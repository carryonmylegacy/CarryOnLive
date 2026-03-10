import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { useAuth } from '../../contexts/AuthContext';
import {
  Home,
  Plus,
  ChevronDown,
  Check,
  Shield,
  Users,
  Settings,
  Loader2,
  Trash2,
  ArrowLeftRight
} from 'lucide-react';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '../ui/dialog';
import { toast } from '../../utils/toast';

const API_URL = `${process.env.REACT_APP_BACKEND_URL}/api`;

const EstateSelector = ({ currentEstate, onEstateChange, estates, onEstatesUpdate }) => {
  const { user, getAuthHeaders } = useAuth();
  const navigate = useNavigate();
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newEstateName, setNewEstateName] = useState('');
  const [open, setOpen] = useState(false);
  const [allEstates, setAllEstates] = useState([]);
  const ref = useRef(null);

  const isMultiRole = user?.is_also_benefactor || user?.is_also_beneficiary ||
    (user?.role === 'benefactor' && allEstates.some(e => e.user_role_in_estate === 'beneficiary'));
  const isOnBeneficiary = window.location.pathname.startsWith('/beneficiary');

  // Fetch all estates (owned + beneficiary) for multi-role switching
  useEffect(() => {
    if (!user) return;
    if (user.role === 'admin' || user.role === 'operator') return;
    axios.get(`${API_URL}/estates`, getAuthHeaders())
      .then(res => setAllEstates(res.data || []))
      .catch(() => {});
  }, [user]); // eslint-disable-line react-hooks/exhaustive-deps

  // Close dropdown on outside click
  useEffect(() => {
    const handleClick = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const ownedEstates = allEstates.filter(e => e.user_role_in_estate === 'owner');
  const benEstates = allEstates.filter(e => e.user_role_in_estate === 'beneficiary' || e.is_beneficiary_estate);

  const handleCreateEstate = async () => {
    if (!newEstateName.trim()) {
      toast.error('Please enter an estate name');
      return;
    }
    setCreating(true);
    try {
      const response = await axios.post(
        `${API_URL}/estates`,
        { name: newEstateName },
        getAuthHeaders()
      );
      setShowCreateModal(false);
      setNewEstateName('');
      if (onEstatesUpdate) onEstatesUpdate();
      if (onEstateChange) onEstateChange(response.data);
    } catch (error) {
      console.error('Create estate error:', error);
      toast.error('Failed to create estate');
    } finally {
      setCreating(false);
    }
  };

  const handleDeleteEstate = async (estateId) => {
    if (!window.confirm('Are you sure you want to delete this estate? This will delete all documents, messages, and beneficiaries.')) return;
    try {
      await axios.delete(`${API_URL}/estates/${estateId}`, getAuthHeaders());
      if (onEstatesUpdate) onEstatesUpdate();
    } catch (error) {
      console.error('Delete estate error:', error);
      toast.error('Failed to delete estate');
    }
  };

  // Display name for the trigger button
  const displayName = isOnBeneficiary
    ? (benEstates.find(e => localStorage.getItem('beneficiary_estate_id') === e.id)?.name || 'Beneficiary')
    : (currentEstate?.name || 'My Estate');

  // Single estate, no multi-role — static pill
  if (estates.length <= 1 && !isMultiRole) {
    return (
      <div className="flex items-center gap-2 px-3 py-2 rounded-xl" style={{ background: 'var(--s)', border: '1px solid var(--b)' }} data-testid="estate-selector">
        <Home className="w-4 h-4 text-[var(--gold)]" />
        <span className="max-w-[180px] truncate text-[var(--t)] text-sm font-bold">{currentEstate?.name || 'My Estate'}</span>
      </div>
    );
  }

  return (
    <>
      <div ref={ref} className="relative" data-testid="estate-selector">
        <button
          onClick={() => setOpen(!open)}
          className="flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-semibold transition-all hover:brightness-110"
          style={{ background: 'var(--s)', border: '1px solid var(--b)', color: 'var(--t)' }}
          data-testid="estate-selector-trigger"
        >
          {isMultiRole && <ArrowLeftRight className="w-3.5 h-3.5 text-[var(--gold)] flex-shrink-0" />}
          <Home className="w-4 h-4 text-[var(--gold)] flex-shrink-0" />
          <span className="max-w-[160px] truncate">{displayName}</span>
          <ChevronDown className="w-3.5 h-3.5 opacity-50 flex-shrink-0" style={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }} />
        </button>

        {open && (
          <div className="absolute right-0 top-full mt-1 min-w-[220px] rounded-xl overflow-hidden z-50"
            style={{ background: 'var(--bg3)', border: '1px solid var(--b)', boxShadow: '0 8px 30px rgba(0,0,0,0.4)' }}>

            {/* Owned estates section */}
            {ownedEstates.length > 0 && (
              <>
                <div style={{ padding: '6px 12px 4px', fontSize: 10, fontWeight: 700, color: '#525C72', textTransform: 'uppercase', letterSpacing: '.1em' }}>
                  My Estates
                </div>
                {ownedEstates.map(estate => {
                  const isActive = !isOnBeneficiary && currentEstate?.id === estate.id;
                  return (
                    <div key={`own-${estate.id}`}
                      onClick={() => {
                        localStorage.setItem('selected_estate_id', estate.id);
                        localStorage.removeItem('beneficiary_estate_id');
                        setOpen(false);
                        if (isOnBeneficiary) {
                          navigate('/dashboard');
                          window.location.reload();
                        } else {
                          if (onEstateChange) onEstateChange(estate);
                        }
                      }}
                      className="flex items-center gap-2.5 px-3 py-2.5 cursor-pointer transition-all hover:bg-[var(--s)]"
                      style={{ background: isActive ? 'rgba(212,175,55,0.08)' : 'transparent' }}
                      data-testid={`estate-switch-owner-${estate.id}`}
                    >
                      <div className="w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: '#d4af37' }}>
                        <Shield className="w-3 h-3" style={{ color: '#080e1a' }} />
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div className="text-xs font-semibold truncate" style={{ color: isActive ? 'var(--gold2)' : 'var(--t)' }}>{estate.name}</div>
                        <div style={{ fontSize: 10, color: '#64748B' }}>Benefactor</div>
                      </div>
                      {isActive && <span style={{ fontSize: 10, color: 'var(--gold2)', flexShrink: 0 }}>Active</span>}
                    </div>
                  );
                })}
              </>
            )}

            {/* Beneficiary estates section (multi-role users) */}
            {benEstates.length > 0 && (
              <>
                <div style={{ padding: '6px 12px 4px', fontSize: 10, fontWeight: 700, color: '#525C72', textTransform: 'uppercase', letterSpacing: '.1em', borderTop: ownedEstates.length > 0 ? '1px solid var(--b)' : 'none' }}>
                  Beneficiary Access
                </div>
                {benEstates.map(estate => {
                  const isActive = isOnBeneficiary && localStorage.getItem('beneficiary_estate_id') === estate.id;
                  return (
                    <div key={`ben-${estate.id}`}
                      onClick={() => {
                        localStorage.setItem('beneficiary_estate_id', estate.id);
                        localStorage.removeItem('selected_estate_id');
                        setOpen(false);
                        navigate('/beneficiary');
                        if (!isOnBeneficiary) window.location.reload();
                      }}
                      className="flex items-center gap-2.5 px-3 py-2.5 cursor-pointer transition-all hover:bg-[var(--s)]"
                      style={{ background: isActive ? 'rgba(96,165,250,0.08)' : 'transparent' }}
                      data-testid={`estate-switch-ben-${estate.id}`}
                    >
                      <div className="w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: '#60A5FA' }}>
                        <Users className="w-3 h-3" style={{ color: '#080e1a' }} />
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div className="text-xs font-semibold truncate" style={{ color: isActive ? '#60A5FA' : 'var(--t)' }}>{estate.name || 'Estate'}</div>
                        <div style={{ fontSize: 10, color: '#64748B' }}>Beneficiary</div>
                      </div>
                      {isActive && <span style={{ fontSize: 10, color: '#60A5FA', flexShrink: 0 }}>Active</span>}
                    </div>
                  );
                })}
              </>
            )}

            {/* Create new estate option */}
            {!isOnBeneficiary && (
              <>
                <div style={{ borderTop: '1px solid var(--b)' }} />
                <div
                  onClick={() => { setOpen(false); setShowCreateModal(true); }}
                  className="flex items-center gap-2 px-3 py-2.5 cursor-pointer transition-all hover:bg-[var(--s)]"
                  style={{ color: 'var(--gold)' }}
                  data-testid="estate-create-new"
                >
                  <Plus className="w-4 h-4" />
                  <span className="text-xs font-semibold">Create New Estate</span>
                </div>
              </>
            )}
          </div>
        )}
      </div>

      {/* Create Estate Modal */}
      <Dialog open={showCreateModal} onOpenChange={setShowCreateModal}>
        <DialogContent className="glass-card border-[var(--b)] sm:max-w-md !top-[5vh] !translate-y-0">
          <DialogHeader>
            <DialogTitle className="text-[var(--t)] text-xl" style={{ fontFamily: 'Outfit, sans-serif' }}>
              Create New Estate
            </DialogTitle>
            <DialogDescription className="text-[var(--t4)]">
              Create a new estate to organize your legacy planning
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label className="text-[var(--t4)]">Estate Name <span className="text-red-400">*</span></Label>
              <Input
                value={newEstateName}
                onChange={(e) => setNewEstateName(e.target.value)}
                placeholder="e.g., Mitchell Family Trust"
                className="input-field"
                data-testid="new-estate-name-input"
              />
            </div>
          </div>
          <div className="flex justify-end gap-3">
            <Button
              variant="outline"
              onClick={() => { setShowCreateModal(false); setNewEstateName(''); }}
              className="border-[var(--b)] text-[var(--t)]"
            >
              Cancel
            </Button>
            <Button
              onClick={handleCreateEstate}
              disabled={creating || !newEstateName.trim()}
              className="gold-button"
              data-testid="create-estate-submit"
            >
              {creating ? (
                <><Loader2 className="w-5 h-5 mr-2 animate-spin" />Creating...</>
              ) : (
                <><Plus className="w-5 h-5 mr-2" />Create Estate</>
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default EstateSelector;
