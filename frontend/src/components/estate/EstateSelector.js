import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { useAuth } from '../../contexts/AuthContext';
import {
  Home,
  Plus,
  ChevronDown,
  Shield,
  Users,
  ArrowLeftRight
} from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from '../ui/dropdown-menu';

const API_URL = `${process.env.REACT_APP_BACKEND_URL}/api`;

const EstateSelector = ({ currentEstate, onEstateChange, estates, onEstatesUpdate }) => {
  const { user, getAuthHeaders } = useAuth();
  const navigate = useNavigate();
  const [allEstates, setAllEstates] = useState([]);

  const isMultiRole = user?.is_also_benefactor || user?.is_also_beneficiary ||
    (user?.role === 'benefactor' && allEstates.some(e => e.user_role_in_estate === 'beneficiary'));
  const isOnBeneficiary = window.location.pathname.startsWith('/beneficiary');

  useEffect(() => {
    if (!user || user.role === 'admin' || user.role === 'operator') return;
    axios.get(`${API_URL}/estates`, getAuthHeaders())
      .then(res => setAllEstates(res.data || []))
      .catch(() => {});
  }, [user]); // eslint-disable-line react-hooks/exhaustive-deps

  const ownedEstates = allEstates.filter(e => e.user_role_in_estate === 'owner');
  const benEstates = allEstates.filter(e => e.user_role_in_estate === 'beneficiary' || e.is_beneficiary_estate);

  const displayName = isOnBeneficiary
    ? (benEstates.find(e => localStorage.getItem('beneficiary_estate_id') === e.id)?.name || 'Beneficiary')
    : (currentEstate?.name || 'My Estate');

  // Single estate, no multi-role — static pill
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
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          className="inline-flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-bold transition-all hover:brightness-110"
          style={{ background: 'var(--s)', border: '1px solid var(--b)', color: 'var(--t)' }}
          data-testid="estate-selector-trigger"
        >
          {isMultiRole && <ArrowLeftRight className="w-3.5 h-3.5 text-[var(--gold)] flex-shrink-0" />}
          <Home className="w-4 h-4 text-[var(--gold)] flex-shrink-0" />
          <span className="truncate max-w-[160px]">{displayName}</span>
          <ChevronDown className="w-3.5 h-3.5 opacity-50 flex-shrink-0" />
        </button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="start" className="w-56 bg-[var(--bg2)] border-[var(--b)]">
        {ownedEstates.length > 0 && (
          <>
            <DropdownMenuLabel className="text-[10px] font-bold text-[#525C72] uppercase tracking-wider">
              My Estates
            </DropdownMenuLabel>
            {ownedEstates.map(estate => {
              const isActive = !isOnBeneficiary && currentEstate?.id === estate.id;
              return (
                <DropdownMenuItem
                  key={`own-${estate.id}`}
                  onClick={() => {
                    localStorage.setItem('selected_estate_id', estate.id);
                    localStorage.removeItem('beneficiary_estate_id');
                    if (isOnBeneficiary) {
                      navigate('/dashboard');
                      window.location.reload();
                    } else if (onEstateChange) {
                      onEstateChange(estate);
                    }
                  }}
                  className="cursor-pointer flex items-center gap-2.5 text-[var(--t)] hover:bg-[var(--s)]"
                  style={{ background: isActive ? 'rgba(212,175,55,0.08)' : 'transparent' }}
                  data-testid={`estate-switch-owner-${estate.id}`}
                >
                  <div className="w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: '#d4af37' }}>
                    <Shield className="w-2.5 h-2.5" style={{ color: '#080e1a' }} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-semibold truncate" style={{ color: isActive ? 'var(--gold2)' : 'var(--t)' }}>{estate.name}</div>
                    <div className="text-[10px] text-[#64748B]">Benefactor</div>
                  </div>
                  {isActive && <span className="text-[10px] text-[var(--gold2)] flex-shrink-0">Active</span>}
                </DropdownMenuItem>
              );
            })}
          </>
        )}

        {benEstates.length > 0 && (
          <>
            <DropdownMenuSeparator className="bg-[var(--b)]" />
            <DropdownMenuLabel className="text-[10px] font-bold text-[#525C72] uppercase tracking-wider">
              Beneficiary Access
            </DropdownMenuLabel>
            {benEstates.map(estate => {
              const isActive = isOnBeneficiary && localStorage.getItem('beneficiary_estate_id') === estate.id;
              return (
                <DropdownMenuItem
                  key={`ben-${estate.id}`}
                  onClick={() => {
                    localStorage.setItem('beneficiary_estate_id', estate.id);
                    localStorage.removeItem('selected_estate_id');
                    navigate('/beneficiary');
                    if (!isOnBeneficiary) window.location.reload();
                  }}
                  className="cursor-pointer flex items-center gap-2.5 text-[var(--t)] hover:bg-[var(--s)]"
                  style={{ background: isActive ? 'rgba(96,165,250,0.08)' : 'transparent' }}
                  data-testid={`estate-switch-ben-${estate.id}`}
                >
                  <div className="w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: '#60A5FA' }}>
                    <Users className="w-2.5 h-2.5" style={{ color: '#080e1a' }} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-semibold truncate" style={{ color: isActive ? '#60A5FA' : 'var(--t)' }}>{estate.name || 'Estate'}</div>
                    <div className="text-[10px] text-[#64748B]">Beneficiary</div>
                  </div>
                  {isActive && <span className="text-[10px] text-[#60A5FA] flex-shrink-0">Active</span>}
                </DropdownMenuItem>
              );
            })}
          </>
        )}

        {!isOnBeneficiary && (
          <>
            <DropdownMenuSeparator className="bg-[var(--b)]" />
            <DropdownMenuItem
              onClick={() => navigate('/create-estate')}
              className="cursor-pointer text-[var(--gold)] hover:bg-[var(--s)]"
              data-testid="estate-create-new"
            >
              <Plus className="w-4 h-4 mr-2" />
              <span className="text-xs font-semibold">Create New Estate</span>
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

export default EstateSelector;
