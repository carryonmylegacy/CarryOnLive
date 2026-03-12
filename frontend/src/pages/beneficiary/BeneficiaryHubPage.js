import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { useAuth } from '../../contexts/AuthContext';
import { ChevronRight } from 'lucide-react';
import { Card, CardContent } from '../../components/ui/card';
import { Skeleton } from '../../components/ui/skeleton';
import OrbitVisualization from '../../components/estate/OrbitVisualization';
import EmergencyAccessPanel from '../../components/beneficiary/EmergencyAccessPanel';

const API_URL = `${process.env.REACT_APP_BACKEND_URL}/api`;

const getOrbitLevel = (relation) => {
  const r = (relation || '').toLowerCase();
  // Ring 1 (closest): Spouse, Children, In-law children, Great-grandparents (looking down)
  if (['spouse', 'wife', 'husband', 'partner'].includes(r)) return 0;
  if (['mother', 'father', 'parent', 'mom', 'dad'].includes(r)) return 0;
  if (r.includes('son-in-law') || r.includes('son in law') || r.includes('daughter-in-law') || r.includes('daughter in law')) return 0;
  if (r.includes('great-grandmother') || r.includes('great-grandfather') || r.includes('great-grandparent') || r.includes('great grandparent')) return 0;
  // Ring 2: Parents, Siblings, Grandchildren, In-law parents, Aunt, Uncle
  if (['son', 'daughter', 'child', 'children'].includes(r)) return 1;
  if (['brother', 'sister', 'sibling'].includes(r)) return 1;
  if (['grandmother', 'grandfather', 'grandparent', 'grandma', 'grandpa'].includes(r)) return 1;
  if (['aunt', 'uncle'].includes(r)) return 1;
  if (['nephew', 'niece'].includes(r)) return 1;
  if (r.includes('mother-in-law') || r.includes('mother in law') || r.includes('father-in-law') || r.includes('father in law')) return 1;
  // Ring 3: Grandparents
  if (['grandson', 'granddaughter', 'grandchild'].includes(r)) return 2;
  // Ring 4: Great-grandparents
  if (r.includes('great-grandson') || r.includes('great-granddaughter') || r.includes('great-grandchild') || r.includes('great grandchild')) return 3;
  return 1;
};

const orbitColors = [
  ['linear-gradient(135deg, #D4AF37, #F5D76E)', 'rgba(212,175,55,0.3)'],
  ['linear-gradient(135deg, #6D28D9, #A855F7)', 'rgba(139,92,246,0.3)'],
  ['linear-gradient(135deg, #0D9488, #14B8A6)', 'rgba(20,184,166,0.3)'],
  ['linear-gradient(135deg, #1E40AF, #3B82F6)', 'rgba(59,130,246,0.3)'],
];

const BeneficiaryHubPage = () => {
  const { user, getAuthHeaders } = useAuth();
  const navigate = useNavigate();
  const [estates, setEstates] = useState([]);
  const [familyConnections, setFamilyConnections] = useState([]);
  const [loading, setLoading] = useState(true);
  const [myPhoto, setMyPhoto] = useState(null);

  useEffect(() => { fetchData();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const fetchData = async () => {
    try {
      const [estatesRes, connectionsRes, meRes] = await Promise.all([
        axios.get(`${API_URL}/estates`, getAuthHeaders()),
        axios.get(`${API_URL}/beneficiary/family-connections`, getAuthHeaders()).catch(() => ({ data: [] })),
        axios.get(`${API_URL}/auth/me`, getAuthHeaders()).catch(() => ({ data: {} })),
      ]);
      setEstates(estatesRes.data.filter(e => e.user_role_in_estate !== 'owner'));
      setFamilyConnections(connectionsRes.data);
      // Photo priority: user's own profile photo > benefactor-uploaded photo for me
      if (meRes.data.photo_url) {
        setMyPhoto(meRes.data.photo_url);
      } else {
        const benefactorSetPhoto = (connectionsRes.data || []).find(c => c.my_photo_in_estate)?.my_photo_in_estate;
        if (benefactorSetPhoto) setMyPhoto(benefactorSetPhoto);
      }
    } catch (err) { console.error('Fetch data error:', err); }
    finally { setLoading(false); }
  };

  const firstName = user?.name?.split(' ')[0] || 'there';

  if (loading) {
    return (
      <div className="p-4 lg:p-6 pt-4 lg:pt-6 pb-24 lg:pb-6 space-y-6">
        <Skeleton className="h-10 w-64 bg-[var(--s)]" />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3].map(i => <Skeleton key={i} className="h-40 bg-[var(--s)] rounded-2xl" />)}
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 lg:p-6 pt-4 lg:pt-6 pb-24 lg:pb-6 animate-fade-in" data-testid="beneficiary-hub">
      {/* Header */}
      <div className="text-center mb-8 mt-4">
        <img src="/carryon-app-logo.png" alt="CarryOn™" className="w-36 mx-auto mb-4" onError={(e) => { e.target.style.display = 'none'; }} />
        <h1 className="text-3xl font-bold text-[var(--t)] mb-1" style={{ fontFamily: 'Outfit, sans-serif' }}>
          Welcome back, {firstName}!
        </h1>
        <p className="text-lg font-bold text-[var(--t3)] mb-1">This Is Your Estate Plan Network</p>
        <p className="text-sm text-[var(--t4)]">
          You are connected to {estates.length} benefactor estate{estates.length !== 1 ? 's' : ''}.
        </p>
      </div>

      {/* Orbit Visualization */}
      {(familyConnections.length > 0 || estates.length > 0) && (
        <OrbitVisualization
          estates={estates}
          benefactors={familyConnections.length > 0 ? familyConnections : estates.map(e => ({
            ...e,
            name: e.benefactor_name || e.name,
            photo_url: e.owner_photo_url || e.estate_photo_url || '',
            relation: 'Benefactor',
          }))}
          userInitials={user?.name?.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2) || 'U'}
          userPhoto={myPhoto}
          onEstateClick={async (member) => {
            const estateId = member.estate_id || member.id;
            localStorage.setItem('beneficiary_estate_id', estateId);
            // Always navigate to pre — TransitionGate on dashboard will allow through if cert exists
            navigate('/beneficiary/pre');
          }}
        />
      )}

      {/* Estate Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 max-w-4xl mx-auto mb-6">
        {estates.map(estate => {
          const isTransitioned = estate.status === 'transitioned';
          const ownerInitials = estate.name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
          const estatePhoto = estate.estate_photo_url || estate.owner_photo_url;

          return (
            <Card
              key={estate.id}
              className={`cursor-pointer transition-all duration-300 hover:-translate-y-2 ${
                isTransitioned
                  ? 'border-2 border-[var(--gold)]/30 bg-[var(--gold)]/5'
                  : 'glass-card border-dashed border-[var(--b2)]'
              }`}
              style={{
                boxShadow: isTransitioned 
                  ? '0 12px 48px -8px rgba(109,40,217,0.4), 0 4px 16px rgba(0,0,0,0.25), 0 1px 0 var(--b) inset'
                  : '0 8px 32px -6px rgba(0,0,0,0.4), 0 2px 8px rgba(0,0,0,0.2)'
              }}
              onClick={() => {
                localStorage.setItem('beneficiary_estate_id', estate.id);
                navigate('/beneficiary/pre');
              }}
              data-testid={`estate-card-${estate.id}`}
            >
              <CardContent className="p-5 text-center relative">
                <div
                  className="w-14 h-14 rounded-full mx-auto mb-3 flex items-center justify-center text-lg font-bold text-white overflow-hidden"
                  style={{
                    background: estatePhoto ? 'transparent' : (isTransitioned
                      ? 'linear-gradient(135deg, #6D28D9, #A855F7)'
                      : 'linear-gradient(135deg, #1E40AF, #3B82F6)'),
                    opacity: isTransitioned ? 1 : 0.6,
                    border: isTransitioned ? '2px solid rgba(224,173,43,0.3)' : '2px dashed var(--b2)',
                    boxShadow: isTransitioned ? '0 6px 24px rgba(109,40,217,0.4), 0 1px 0 rgba(255,255,255,0.2) inset' : '0 4px 16px rgba(0,0,0,0.3)'
                  }}
                >
                  {estatePhoto ? (
                    <img src={estatePhoto} alt={estate.name} className="w-full h-full object-cover" />
                  ) : ownerInitials}
                </div>
                <h3 className="font-bold text-[var(--t)] text-lg">{estate.name}</h3>
                <p className="text-sm text-[var(--t4)] mb-1">Estate</p>
                <div className={`text-xs font-bold mt-2 ${isTransitioned ? 'text-[#B794F6]' : 'text-[var(--gn2)]'}`}>
                  {isTransitioned ? 'Transitioned' : 'Pre-transition'}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Family Members List */}
      {(familyConnections.length > 0 || estates.length > 0) && (
        <div className="max-w-4xl mx-auto mb-8" data-testid="family-members-list">
          <div className="space-y-2">
            {/* Beneficiary (You) at top */}
            <div className="flex items-center gap-3 rounded-xl px-4 py-3" style={{ background: 'rgba(124,58,237,0.08)', border: '1px solid rgba(124,58,237,0.15)' }}>
              <div className="w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold text-white flex-shrink-0 overflow-hidden"
                style={{ background: myPhoto ? 'transparent' : 'linear-gradient(135deg, #7C3AED, #A855F7)', border: '2px solid rgba(212,175,55,0.4)' }}>
                {myPhoto ? (
                  <img src={myPhoto} alt="You" className="w-full h-full object-cover" />
                ) : (user?.name?.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2) || 'U')}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-[var(--t)] truncate">{user?.name || 'You'}</p>
              </div>
            </div>

            {/* Family members */}
            {(familyConnections.length > 0 ? familyConnections : estates).map((member, i) => {
              const name = member.benefactor_name || member.name || `${member.first_name || ''} ${member.last_name || ''}`.trim();
              const initials = name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2) || '??';
              const relation = member.relation || 'Benefactor';
              const level = typeof member.relation === 'string' ? getOrbitLevel(member.relation) : 1;
              const [gradient] = orbitColors[level] || orbitColors[0];
              const isTransitioned = member.status === 'transitioned';
              const memberPhoto = member.photo_url || member.owner_photo_url || member.estate_photo_url || '';

              return (
                <div
                  key={member.id || `member-${i}`}
                  className="flex items-center gap-3 rounded-xl px-4 py-3 cursor-pointer transition-all hover:brightness-110"
                  style={{ background: 'var(--s)', border: '1px solid var(--b)' }}
                  onClick={() => {
                    const estateId = member.estate_id || member.id;
                    localStorage.setItem('beneficiary_estate_id', estateId);
                    navigate(isTransitioned ? '/beneficiary/dashboard' : '/beneficiary/pre');
                  }}
                  data-testid={`family-member-${i}`}
                >
                  <div className="w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 overflow-hidden"
                    style={{
                      background: memberPhoto ? 'transparent' : gradient,
                      color: level === 0 ? '#1a1a2e' : 'white',
                      border: isTransitioned ? '2px solid rgba(212,175,55,0.5)' : '2px solid rgba(255,255,255,0.15)',
                    }}>
                    {memberPhoto ? (
                      <img src={memberPhoto} alt={name} className="w-full h-full object-cover" />
                    ) : initials}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-[var(--t)] truncate">{name}</p>
                    <p className="text-xs text-[var(--t4)] capitalize">{relation}</p>
                  </div>
                  <ChevronRight className="w-4 h-4 text-[var(--t5)] flex-shrink-0" />
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Info Box */}
      <div className="max-w-4xl mx-auto space-y-4">
        {/* Emergency Access Protocol */}
        <EmergencyAccessPanel estates={estates} />

        <div className="rounded-xl p-4" style={{ background: 'var(--s)', border: '1px solid var(--b)' }}>
          <p className="text-sm text-[var(--t3)] leading-relaxed">
            Your beneficiary cost is determined by each benefactor's subscription tier. You maintain one CarryOn™ account with access to all connected estates. Billing for each estate begins only after a verified transition event.
          </p>
        </div>

        {/* CTA: Create estate or join another */}
        <div className="glass-card p-5 text-center" style={{ borderColor: 'rgba(212,175,55,0.15)' }}>
          <h3 className="text-base font-bold text-[var(--t)] mb-1" style={{ fontFamily: 'Outfit, sans-serif' }}>Protect Your Own Family</h3>
          <p className="text-xs text-[var(--t4)] mb-4">You can start your own estate plan or join another estate — using this same account.</p>
          <button onClick={() => navigate('/create-estate')} className="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-bold transition-transform active:scale-95" style={{ background: 'linear-gradient(135deg, #d4af37, #b8962e)', color: '#080e1a' }} data-testid="create-estate-cta">
            Start Your Own Estate Plan
          </button>
        </div>
      </div>
    </div>
  );
};

export default BeneficiaryHubPage;
