import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { useAuth } from '../../contexts/AuthContext';
import { Home, Plus, ChevronDown, Shield, Users, ArrowLeftRight, Check } from 'lucide-react';

const API_URL = `${process.env.REACT_APP_BACKEND_URL}/api`;

const EstateSelector = ({ currentEstate, onEstateChange, estates, onEstatesUpdate }) => {
  const { user, getAuthHeaders } = useAuth();
  const navigate = useNavigate();
  const [allEstates, setAllEstates] = useState([]);
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef(null);

  const isMultiRole = user?.is_also_benefactor || user?.is_also_beneficiary ||
    (user?.role === 'benefactor' && allEstates.some(e => e.user_role_in_estate === 'beneficiary'));
  const isOnBeneficiary = window.location.pathname.startsWith('/beneficiary');

  useEffect(() => {
    if (!user || user.role === 'admin' || user.role === 'operator') return;
    axios.get(`${API_URL}/estates`, getAuthHeaders())
      .then(res => setAllEstates(res.data || []))
      .catch(() => {});
  }, [user]); // eslint-disable-line react-hooks/exhaustive-deps

  // Close on outside click
  useEffect(() => {
    const handler = (e) => { if (wrapperRef.current && !wrapperRef.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const ownedEstates = allEstates.filter(e => e.user_role_in_estate === 'owner');
  const benEstates = allEstates.filter(e => e.user_role_in_estate === 'beneficiary' || e.is_beneficiary_estate);

  const displayName = isOnBeneficiary
    ? (benEstates.find(e => localStorage.getItem('beneficiary_estate_id') === e.id)?.name || 'Beneficiary')
    : (currentEstate?.name || 'My Estate');

  // Single estate, no multi-role — static pill, no dropdown
  if (estates.length <= 1 && !isMultiRole) {
    return (
      <div className="inline-flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-bold text-[var(--t)]"
        style={{ background: 'var(--s)', border: '1px solid var(--b)' }} data-testid="estate-selector">
        <Home className="w-4 h-4 text-[var(--gold)]" />
        <span className="truncate max-w-[180px]">{currentEstate?.name || 'My Estate'}</span>
      </div>
    );
  }

  return (
    <div ref={wrapperRef} className="relative inline-block" data-testid="estate-selector">
      {/* Trigger */}
      <button
        onClick={() => setOpen(!open)}
        className="inline-flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-bold transition-all"
        style={{ background: 'var(--s)', border: '1px solid var(--b)', color: 'var(--t)' }}
        data-testid="estate-selector-trigger"
      >
        {isMultiRole && <ArrowLeftRight className="w-3.5 h-3.5 text-[var(--gold)] flex-shrink-0" />}
        <Home className="w-4 h-4 text-[var(--gold)] flex-shrink-0" />
        <span className="truncate max-w-[160px]">{displayName}</span>
        <ChevronDown className="w-3.5 h-3.5 opacity-50 flex-shrink-0" style={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }} />
      </button>

      {/* Dropdown — rendered inline, not in a portal */}
      {open && (
        <div
          className="absolute left-0 top-full mt-1 w-60 rounded-xl overflow-hidden z-50 py-1"
          style={{ background: 'var(--s)', border: '1px solid var(--b)' }}
        >
          {ownedEstates.map(estate => {
            const isActive = !isOnBeneficiary && currentEstate?.id === estate.id;
            return (
              <button key={`own-${estate.id}`}
                onClick={() => {
                  localStorage.setItem('selected_estate_id', estate.id);
                  localStorage.removeItem('beneficiary_estate_id');
                  setOpen(false);
                  if (isOnBeneficiary) { navigate('/dashboard'); window.location.reload(); }
                  else if (onEstateChange) onEstateChange(estate);
                }}
                className="w-full flex items-center gap-2 px-3 py-2 text-left text-sm transition-colors hover:bg-[var(--b)]"
                data-testid={`estate-switch-owner-${estate.id}`}
              >
                <Shield className="w-3.5 h-3.5 text-[var(--gold)] flex-shrink-0" />
                <span className="flex-1 truncate font-semibold" style={{ color: isActive ? 'var(--gold)' : 'var(--t)' }}>{estate.name}</span>
                {isActive && <Check className="w-3.5 h-3.5 text-[var(--gold)] flex-shrink-0" />}
              </button>
            );
          })}

          {benEstates.length > 0 && (
            <>
              <div className="h-px mx-2 my-1" style={{ background: 'var(--b)' }} />
              {benEstates.map(estate => {
                const isActive = isOnBeneficiary && localStorage.getItem('beneficiary_estate_id') === estate.id;
                return (
                  <button key={`ben-${estate.id}`}
                    onClick={() => {
                      localStorage.setItem('beneficiary_estate_id', estate.id);
                      localStorage.removeItem('selected_estate_id');
                      setOpen(false);
                      navigate('/beneficiary');
                      if (!isOnBeneficiary) window.location.reload();
                    }}
                    className="w-full flex items-center gap-2 px-3 py-2 text-left text-sm transition-colors hover:bg-[var(--b)]"
                    data-testid={`estate-switch-ben-${estate.id}`}
                  >
                    <Users className="w-3.5 h-3.5 text-[#60A5FA] flex-shrink-0" />
                    <span className="flex-1 truncate font-semibold" style={{ color: isActive ? '#60A5FA' : 'var(--t)' }}>{estate.name}</span>
                    {isActive && <Check className="w-3.5 h-3.5 text-[#60A5FA] flex-shrink-0" />}
                  </button>
                );
              })}
            </>
          )}

          {!isOnBeneficiary && (
            <>
              <div className="h-px mx-2 my-1" style={{ background: 'var(--b)' }} />
              <button
                onClick={() => { setOpen(false); navigate('/create-estate'); }}
                className="w-full flex items-center gap-2 px-3 py-2 text-left text-sm font-semibold transition-colors hover:bg-[var(--b)]"
                style={{ color: 'var(--gold)' }}
                data-testid="estate-create-new"
              >
                <Plus className="w-3.5 h-3.5 flex-shrink-0" />
                <span>Create New Estate</span>
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
};

export default EstateSelector;
