import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { useAuth } from '../../contexts/AuthContext';
import { Home, Plus, ChevronDown, Shield, Users, ArrowLeftRight, Check } from 'lucide-react';

const API_URL = `${process.env.REACT_APP_BACKEND_URL}/api`;

const EstateSelector = ({ currentEstate, onEstateChange }) => {
  const { user, getAuthHeaders } = useAuth();
  const navigate = useNavigate();
  const [allEstates, setAllEstates] = useState([]);
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef(null);
  const isOnBeneficiary = window.location.pathname.startsWith('/beneficiary');

  // Fetch all estates (owned + beneficiary)
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

  // Build portal list: each entry is { id, name, type: 'benefactor'|'beneficiary', estateId }
  const ownedEstates = allEstates.filter(e => e.user_role_in_estate === 'owner');
  const benEstates = allEstates.filter(e => e.user_role_in_estate === 'beneficiary' || e.is_beneficiary_estate);

  const portals = [];
  ownedEstates.forEach(e => portals.push({ key: `own-${e.id}`, name: e.name, type: 'benefactor', estate: e }));
  benEstates.forEach(e => portals.push({ key: `ben-${e.id}`, name: e.name, type: 'beneficiary', estate: e }));

  // Determine which portal is currently active
  const activeKey = isOnBeneficiary
    ? `ben-${localStorage.getItem('beneficiary_estate_id') || benEstates[0]?.id}`
    : `own-${currentEstate?.id || ownedEstates[0]?.id}`;

  const activePortal = portals.find(p => p.key === activeKey);
  const otherPortals = portals.filter(p => p.key !== activeKey).sort((a, b) => a.name.localeCompare(b.name));

  const displayName = activePortal?.name || currentEstate?.name || 'My Estate';
  const hasMultiplePortals = portals.length > 1;

  // Single portal — static pill
  if (!hasMultiplePortals) {
    return (
      <div className="inline-flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-bold text-[var(--t)]"
        style={{ background: '#111827', border: '1px solid #1e293b' }} data-testid="estate-selector">
        <Home className="w-4 h-4 text-[var(--gold)]" />
        <span className="truncate max-w-[180px]">{displayName}</span>
      </div>
    );
  }

  const handlePortalClick = (portal) => {
    setOpen(false);
    if (portal.type === 'benefactor') {
      localStorage.setItem('selected_estate_id', portal.estate.id);
      localStorage.removeItem('beneficiary_estate_id');
      if (isOnBeneficiary) {
        navigate('/dashboard');
        window.location.reload();
      } else if (onEstateChange) {
        onEstateChange(portal.estate);
      }
    } else {
      localStorage.setItem('beneficiary_estate_id', portal.estate.id);
      localStorage.removeItem('selected_estate_id');
      if (!isOnBeneficiary) {
        navigate('/beneficiary');
        window.location.reload();
      } else {
        window.location.reload();
      }
    }
  };

  return (
    <div ref={wrapperRef} className="relative inline-block" data-testid="estate-selector">
      {/* Trigger */}
      <button
        onClick={() => setOpen(!open)}
        className="inline-flex items-center gap-2 px-3 py-2 text-sm font-bold transition-all"
        style={{
          background: '#111827',
          border: '1px solid #1e293b',
          borderRadius: open ? '12px 12px 0 0' : '12px',
          borderBottom: open ? 'none' : '1px solid #1e293b',
          color: 'var(--t)',
        }}
        data-testid="estate-selector-trigger"
      >
        <ArrowLeftRight className="w-3.5 h-3.5 text-[var(--gold)] flex-shrink-0" />
        <Home className="w-4 h-4 text-[var(--gold)] flex-shrink-0" />
        <span className="truncate max-w-[160px]">{displayName}</span>
        <ChevronDown className="w-3.5 h-3.5 opacity-50 flex-shrink-0" style={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }} />
      </button>

      {/* Dropdown */}
      {open && (
        <div
          className="absolute left-0 top-full w-64 rounded-b-xl overflow-hidden z-50 py-1"
          style={{ background: '#111827', border: '1px solid #1e293b', borderTop: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.5)' }}
        >
          {/* Current portal — gold with checkmark */}
          {activePortal && (
            <div className="flex items-center gap-2 px-3 py-2.5 text-sm" data-testid="estate-current-portal">
              {activePortal.type === 'benefactor'
                ? <Shield className="w-4 h-4 text-[var(--gold)] flex-shrink-0" />
                : <Users className="w-4 h-4 text-[var(--gold)] flex-shrink-0" />
              }
              <span className="flex-1 truncate font-bold text-[var(--gold)]">{activePortal.name}</span>
              <span className="text-[10px] text-[var(--gold)] opacity-70 mr-1">{activePortal.type === 'benefactor' ? 'Benefactor' : 'Beneficiary'}</span>
              <Check className="w-3.5 h-3.5 text-[var(--gold)] flex-shrink-0" />
            </div>
          )}

          {otherPortals.length > 0 && <div className="h-px mx-2 my-1 bg-[#1e293b]" />}

          {/* Other portals — white text, blue icons, alphabetical */}
          {otherPortals.map(portal => (
            <button key={portal.key}
              onClick={() => handlePortalClick(portal)}
              className="w-full flex items-center gap-2 px-3 py-2.5 text-left text-sm transition-colors hover:bg-[#1e293b]"
              data-testid={`estate-switch-${portal.key}`}
            >
              {portal.type === 'benefactor'
                ? <Shield className="w-4 h-4 text-[#60A5FA] flex-shrink-0" />
                : <Users className="w-4 h-4 text-[#60A5FA] flex-shrink-0" />
              }
              <span className="flex-1 truncate font-semibold text-white">{portal.name}</span>
              <span className="text-[10px] text-[#64748B]">{portal.type === 'benefactor' ? 'Benefactor' : 'Beneficiary'}</span>
            </button>
          ))}

          {/* Create New Estate — only on benefactor portal */}
          {!isOnBeneficiary && (
            <>
              <div className="h-px mx-2 my-1 bg-[#1e293b]" />
              <button
                onClick={() => { setOpen(false); navigate('/create-estate'); }}
                className="w-full flex items-center gap-2 px-3 py-2 text-left text-sm font-semibold transition-colors hover:bg-[#1e293b]"
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
