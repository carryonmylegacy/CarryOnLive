import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { useAuth } from '../../contexts/AuthContext';
import { Camera, Pencil, X } from 'lucide-react';
import { Card, CardContent } from '../../components/ui/card';
import { Skeleton } from '../../components/ui/skeleton';
import OrbitVisualization from '../../components/estate/OrbitVisualization';
import EmergencyAccessPanel from '../../components/beneficiary/EmergencyAccessPanel';
import { resolvePhotoUrl } from '../../utils/photoUrl';
import BenefactorPrompt from '../../components/BenefactorPrompt';
import { API_URL } from '../../config';

/**
 * BeneficiaryHubPage — the multi-benefactor "Estate Plan Network" view.
 *
 * Mounted at /beneficiary. Renders the user in the center of an orbit
 * with their benefactors arrayed in concentric rings keyed to family
 * relation (parents/spouse → ring 0, children/siblings/grandparents →
 * ring 1, etc.). Tapping any benefactor avatar OR estate tile below
 * opens that estate's beneficiary dashboard at /beneficiary/dashboard,
 * which then renders pre-transition or post-transition content inline.
 *
 * Tapping the user's own avatar in the center goes back to the
 * benefactor portal's /beneficiaries page (the "who I'm protecting"
 * list on the benefactor side).
 */
const BeneficiaryHubPage = () => {
  const { user, getAuthHeaders } = useAuth();
  const navigate = useNavigate();
  const [estates, setEstates] = useState([]);
  const [familyConnections, setFamilyConnections] = useState([]);
  const [loading, setLoading] = useState(true);
  const [myPhoto, setMyPhoto] = useState(null);
  const [showPhotoEditor, setShowPhotoEditor] = useState(false);
  const [editingConnectionId, setEditingConnectionId] = useState(null);
  const [showBenefactorPrompt, setShowBenefactorPrompt] = useState(false);
  const photoEditorFileRef = React.useRef(null);

  useEffect(() => { fetchData();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Show "Create Your Own Estate" prompt for beneficiary-only users
  useEffect(() => {
    if (!user || loading) return;
    const isAlsoBenefactor = user.is_also_benefactor;
    const reminderHidden = user.hide_benefactor_reminder;
    const sessionDismissed = sessionStorage.getItem('benefactor_prompt_dismissed') === 'true';
    if (!isAlsoBenefactor && !reminderHidden && !sessionDismissed) {
      setShowBenefactorPrompt(true);
    }
  }, [user, loading]);

  const fetchData = async () => {
    try {
      const [estatesRes, connectionsRes, meRes] = await Promise.all([
        axios.get(`${API_URL}/estates`, getAuthHeaders()),
        axios.get(`${API_URL}/beneficiary/family-connections`, getAuthHeaders()).catch(() => ({ data: [] })),
        axios.get(`${API_URL}/auth/me`, getAuthHeaders()).catch(() => ({ data: {} })),
      ]);
      setEstates((estatesRes.data || []).filter(e => e.user_role_in_estate !== 'owner'));
      setFamilyConnections(connectionsRes.data || []);
      // Photo priority: user's own profile photo > benefactor-uploaded photo for me
      if (meRes.data.photo_url) {
        setMyPhoto(meRes.data.photo_url);
      } else {
        const benefactorSetPhoto = (connectionsRes.data || []).find(c => c.my_photo_in_estate)?.my_photo_in_estate;
        if (benefactorSetPhoto) setMyPhoto(benefactorSetPhoto);
      }
    } catch { /* offline / 401 — render empty hub */ }
    finally { setLoading(false); }
  };

  const firstName = user?.name?.split(' ')[0] || 'there';

  const handleDismissBenefactorPrompt = () => {
    sessionStorage.setItem('benefactor_prompt_dismissed', 'true');
    setShowBenefactorPrompt(false);
  };

  const handleBenefactorPhotoChange = async (file, estateId) => {
    try {
      const reader = new FileReader();
      reader.onload = async () => {
        const base64 = reader.result.split(',')[1];
        await axios.put(`${API_URL}/beneficiary/display-override`, {
          estate_id: estateId,
          owner_photo_url: `data:image/jpeg;base64,${base64}`,
        }, getAuthHeaders());
        fetchData();
        setShowPhotoEditor(false);
      };
      reader.readAsDataURL(file);
    } catch { /* silent */ }
  };

  // Single source of truth for "open this estate's beneficiary dashboard".
  // Sets beneficiary_estate_id, clears the prior feature-access cache so
  // the dashboard re-derives perms for THIS estate, and SPA-navigates
  // (no full reload — would break offline / iOS PWA chunk loads).
  const openEstate = (estateId) => {
    if (!estateId) return;
    localStorage.setItem('beneficiary_estate_id', estateId);
    localStorage.removeItem('beneficiary_feature_access');
    navigate('/beneficiary/dashboard');
    // If the dashboard is already mounted, fire the SPA refetch event
    // so it reloads data for the newly-selected estate.
    window.dispatchEvent(new Event('beneficiary-estate-changed'));
  };

  if (loading) {
    return (
      <div className="p-4 lg:p-6 pt-4 lg:pt-6 pb-24 lg:pb-6 space-y-6">
        <Skeleton className="h-10 w-64 bg-[var(--s)]" />
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3].map(i => <Skeleton key={i} className="h-40 bg-[var(--s)] rounded-2xl" />)}
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 lg:p-6 pt-4 lg:pt-6 pb-24 lg:pb-6 animate-fade-in" data-testid="beneficiary-hub">
      {showBenefactorPrompt && <BenefactorPrompt onDismiss={handleDismissBenefactorPrompt} />}

      {/* Header */}
      <div className="text-center mb-8 mt-4">
        <img src="/carryon-app-logo.png" alt="CarryOn™" className="w-36 mx-auto mb-4" onError={(e) => { e.target.style.display = 'none'; }} />
        <h1 className="text-3xl font-bold text-[var(--t)] mb-1" style={{ fontFamily: 'var(--sans)' }}>
          Welcome back, {firstName}!
        </h1>
        <p className="text-lg font-bold text-[var(--t3)] mb-1">This Is Your Estate Plan Network</p>
        <p className="text-sm text-[var(--t4)]">
          You are connected to {estates.length} benefactor estate{estates.length !== 1 ? 's' : ''}.
        </p>
        <p className="text-xs text-[var(--gold)] italic mt-1">
          Tap a benefactor to view their estate.<br />Tap yourself to return to your{estates.length > 1 ? ' primary' : ''} Benefactor Portal.
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
          onEstateClick={(member) => openEstate(member.estate_id || member.id)}
          onCenterClick={() => {
            // Self-tap → go back to the user's own benefactor portal
            // ("My Beneficiaries" listing). Beneficiary-only users
            // (no estate of their own) land on /dashboard instead so
            // they don't 404.
            localStorage.removeItem('beneficiary_estate_id');
            if (user?.is_also_benefactor) {
              navigate('/beneficiaries');
            } else {
              navigate('/dashboard');
            }
          }}
        />
      )}

      {/* Change Benefactor Photos button */}
      {(familyConnections.length > 0 || estates.length > 0) && (
        <div className="text-center mb-6">
          <button
            onClick={() => setShowPhotoEditor(true)}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold transition-colors"
            style={{ background: 'var(--s)', border: '1px solid var(--b2)', color: 'var(--t3)' }}
            data-testid="change-benefactor-photos-btn"
          >
            <Camera className="w-3.5 h-3.5" />
            Change Benefactor Photos
          </button>
        </div>
      )}

      {/* Benefactor Photo Editor Panel */}
      {showPhotoEditor && (
        <div className="max-w-md mx-auto mb-6 rounded-xl p-4" style={{ background: 'var(--bg2)', border: '1px solid var(--b2)' }} data-testid="benefactor-photo-editor">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-bold text-[var(--t)]">Change Benefactor Photos</h3>
            <button onClick={() => setShowPhotoEditor(false)} className="p-1 rounded-lg hover:bg-[var(--s)]">
              <X className="w-4 h-4 text-[var(--t4)]" />
            </button>
          </div>
          <p className="text-xs text-[var(--t4)] mb-4">These changes only affect how benefactors appear on your dashboard.</p>
          <div className="space-y-3">
            {(familyConnections.length > 0 ? familyConnections : estates).map((conn) => {
              const name = conn.benefactor_name || conn.name || 'Unknown';
              const photo = conn.photo_url || conn.owner_photo_url || conn.estate_photo_url || '';
              const initials = name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
              const estateId = conn.estate_id || conn.id;
              return (
                <div key={estateId} className="flex items-center gap-3 p-2 rounded-lg" style={{ background: 'var(--s)' }}>
                  <div className="w-10 h-10 rounded-full flex items-center justify-center overflow-hidden flex-shrink-0"
                    style={{ background: photo ? 'transparent' : 'var(--b2)', border: '2px solid var(--b2)' }}>
                    {photo ? (
                      <img src={resolvePhotoUrl(photo)} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <span className="text-xs font-bold text-[var(--t3)]">{initials}</span>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-[var(--t)] truncate">{name}</p>
                    <p className="text-[11px] text-[var(--t4)]">{conn.relation || 'Benefactor'}</p>
                  </div>
                  <button
                    onClick={() => {
                      setEditingConnectionId(estateId);
                      setTimeout(() => photoEditorFileRef.current?.click(), 50);
                    }}
                    className="p-2 rounded-lg hover:bg-[var(--b)]"
                    data-testid={`edit-benefactor-photo-${estateId}`}
                  >
                    <Pencil className="w-4 h-4 text-[var(--t4)]" />
                  </button>
                </div>
              );
            })}
          </div>
          <input
            ref={photoEditorFileRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file && editingConnectionId) {
                handleBenefactorPhotoChange(file, editingConnectionId);
                setEditingConnectionId(null);
              }
              e.target.value = '';
            }}
          />
        </div>
      )}

      {/* Estate tiles below the orbit (mirror taps to the same dashboard) */}
      <div className={`grid ${estates.length === 1 ? 'grid-cols-1' : 'grid-cols-2 lg:grid-cols-3'} gap-4 max-w-4xl mx-auto mb-6`}>
        {estates.map(estate => {
          const isTransitioned = estate.status === 'transitioned';
          const ownerInitials = (estate.name || '').split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
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
              onClick={() => openEstate(estate.id)}
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
                    <img src={resolvePhotoUrl(estatePhoto)} alt={estate.name} className="w-full h-full object-cover" />
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

      {/* Info Box */}
      <div className="max-w-4xl mx-auto space-y-4">
        <EmergencyAccessPanel estates={estates} />

        <div className="rounded-xl p-4" style={{ background: 'var(--s)', border: '1px solid var(--b)' }}>
          <p className="text-sm text-[var(--t3)] leading-relaxed">
            Your beneficiary cost is determined by each benefactor's subscription tier. You maintain one CarryOn™ account with access to all connected estates. Billing for each estate begins only after a verified transition event.
          </p>
        </div>

        {/* CTA: Create estate or join another */}
        <div className="glass-card p-5 text-center" style={{ borderColor: 'rgba(212,175,55,0.15)' }}>
          <h3 className="text-base font-bold text-[var(--t)] mb-1" style={{ fontFamily: 'var(--sans)' }}>Protect Your Own Family</h3>
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
