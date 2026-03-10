import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { useAuth } from '../contexts/AuthContext';
import { Shield, Users, ChevronDown, ArrowLeftRight } from 'lucide-react';

const API_URL = `${process.env.REACT_APP_BACKEND_URL}/api`;

const ViewSwitcher = ({ variant = 'dropdown' }) => {
  const { user, getAuthHeaders } = useAuth();
  const navigate = useNavigate();
  const [estates, setEstates] = useState([]);
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  const isMultiRole = user?.is_also_benefactor || user?.is_also_beneficiary ||
    (user?.role === 'benefactor' && estates.some(e => e.user_role_in_estate === 'beneficiary'));

  useEffect(() => {
    if (!user) return;
    if (user.role === 'admin' || user.role === 'operator') return;
    axios.get(`${API_URL}/estates`, getAuthHeaders())
      .then(res => setEstates(res.data || []))
      .catch(() => {});
  }, [user]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const handleClick = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  if (!isMultiRole || !user) return null;

  const ownedEstates = estates.filter(e => e.user_role_in_estate === 'owner');
  const benEstates = estates.filter(e => e.user_role_in_estate === 'beneficiary' || e.is_beneficiary_estate);
  const isOnBeneficiary = window.location.pathname.startsWith('/beneficiary');
  const currentLabel = isOnBeneficiary ? 'Beneficiary' : 'My Estate';

  if (variant === 'inline') {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
        {ownedEstates.map(estate => (
          <button key={`own-${estate.id}`} onClick={() => {
            localStorage.setItem('selected_estate_id', estate.id);
            localStorage.removeItem('beneficiary_estate_id');
            navigate('/dashboard');
            window.location.reload();
          }}
          data-testid={`view-switch-owner-${estate.id}`}
          style={{
            display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px',
            background: (!isOnBeneficiary && localStorage.getItem('selected_estate_id') === estate.id)
              ? 'rgba(212,175,55,0.1)' : 'rgba(255,255,255,0.02)',
            border: (!isOnBeneficiary && localStorage.getItem('selected_estate_id') === estate.id)
              ? '1px solid rgba(212,175,55,0.3)' : '1px solid rgba(255,255,255,0.06)',
            borderRadius: 8, cursor: 'pointer', width: '100%', textAlign: 'left', transition: 'all .15s',
          }}>
            <div style={{ width: 24, height: 24, borderRadius: '50%', background: '#d4af37', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <Shield className="w-3 h-3" style={{ color: '#080e1a' }} />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: '#E2E8F0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>My Estate</div>
              <div style={{ fontSize: 9, color: '#64748B' }}>Benefactor</div>
            </div>
          </button>
        ))}
        {benEstates.map(estate => (
          <button key={`ben-${estate.id}`} onClick={() => {
            localStorage.setItem('beneficiary_estate_id', estate.id);
            localStorage.removeItem('selected_estate_id');
            navigate('/beneficiary');
            window.location.reload();
          }}
          data-testid={`view-switch-ben-${estate.id}`}
          style={{
            display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px',
            background: (isOnBeneficiary && localStorage.getItem('beneficiary_estate_id') === estate.id)
              ? 'rgba(96,165,250,0.1)' : 'rgba(255,255,255,0.02)',
            border: (isOnBeneficiary && localStorage.getItem('beneficiary_estate_id') === estate.id)
              ? '1px solid rgba(96,165,250,0.3)' : '1px solid rgba(255,255,255,0.06)',
            borderRadius: 8, cursor: 'pointer', width: '100%', textAlign: 'left', transition: 'all .15s',
          }}>
            <div style={{ width: 24, height: 24, borderRadius: '50%', background: '#60A5FA', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <Users className="w-3 h-3" style={{ color: '#080e1a' }} />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: '#E2E8F0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{estate.name || 'Estate'}</div>
              <div style={{ fontSize: 9, color: '#64748B' }}>Beneficiary</div>
            </div>
          </button>
        ))}
      </div>
    );
  }

  // Dropdown variant (for dashboard header)
  return (
    <div ref={ref} className="relative" data-testid="view-switcher">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-semibold transition-all"
        style={{ background: 'var(--s)', border: '1px solid var(--b)', color: 'var(--t)' }}
        data-testid="view-switcher-trigger"
      >
        <ArrowLeftRight className="w-4 h-4 text-[var(--gold)]" />
        <span className="hidden sm:inline">{currentLabel}</span>
        <ChevronDown className="w-3.5 h-3.5 opacity-50" style={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }} />
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1 min-w-[200px] rounded-xl overflow-hidden z-50"
          style={{ background: 'var(--bg3)', border: '1px solid var(--b)', boxShadow: '0 8px 30px rgba(0,0,0,0.4)' }}>
          <div style={{ padding: '6px 10px 4px', fontSize: 10, fontWeight: 700, color: '#525C72', textTransform: 'uppercase', letterSpacing: '.1em' }}>
            Switch View
          </div>
          {ownedEstates.map(estate => (
            <div key={`own-${estate.id}`}
              onClick={() => {
                localStorage.setItem('selected_estate_id', estate.id);
                localStorage.removeItem('beneficiary_estate_id');
                setOpen(false);
                navigate('/dashboard');
                if (isOnBeneficiary) window.location.reload();
              }}
              className="flex items-center gap-2.5 px-3 py-2.5 cursor-pointer transition-all hover:bg-[var(--s)]"
              style={{ background: !isOnBeneficiary ? 'rgba(212,175,55,0.08)' : 'transparent' }}
              data-testid={`view-switch-dropdown-owner-${estate.id}`}
            >
              <div className="w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: '#d4af37' }}>
                <Shield className="w-3 h-3" style={{ color: '#080e1a' }} />
              </div>
              <div style={{ flex: 1 }}>
                <div className="text-xs font-semibold" style={{ color: !isOnBeneficiary ? 'var(--gold2)' : 'var(--t)' }}>My Estate</div>
                <div style={{ fontSize: 10, color: '#64748B' }}>Benefactor</div>
              </div>
              {!isOnBeneficiary && <span style={{ fontSize: 10, color: 'var(--gold2)' }}>Active</span>}
            </div>
          ))}
          {benEstates.map(estate => (
            <div key={`ben-${estate.id}`}
              onClick={() => {
                localStorage.setItem('beneficiary_estate_id', estate.id);
                localStorage.removeItem('selected_estate_id');
                setOpen(false);
                navigate('/beneficiary');
                if (!isOnBeneficiary) window.location.reload();
              }}
              className="flex items-center gap-2.5 px-3 py-2.5 cursor-pointer transition-all hover:bg-[var(--s)]"
              style={{ background: isOnBeneficiary ? 'rgba(96,165,250,0.08)' : 'transparent' }}
              data-testid={`view-switch-dropdown-ben-${estate.id}`}
            >
              <div className="w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: '#60A5FA' }}>
                <Users className="w-3 h-3" style={{ color: '#080e1a' }} />
              </div>
              <div style={{ flex: 1 }}>
                <div className="text-xs font-semibold" style={{ color: isOnBeneficiary ? '#60A5FA' : 'var(--t)' }}>{estate.name || 'Estate'}</div>
                <div style={{ fontSize: 10, color: '#64748B' }}>Beneficiary</div>
              </div>
              {isOnBeneficiary && <span style={{ fontSize: 10, color: '#60A5FA' }}>Active</span>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default ViewSwitcher;
