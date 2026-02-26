import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { useAuth } from '../../contexts/AuthContext';
import { Lock, Shield, Users, ChevronRight, Upload, AlertTriangle } from 'lucide-react';
import { Button } from '../../components/ui/button';
import { Card, CardContent } from '../../components/ui/card';
import { toast } from 'sonner';
import { Skeleton } from '../../components/ui/skeleton';
import OrbitVisualization from '../../components/estate/OrbitVisualization';

const API_URL = `${process.env.REACT_APP_BACKEND_URL}/api`;

const BeneficiaryHubPage = () => {
  const { user, getAuthHeaders } = useAuth();
  const navigate = useNavigate();
  const [estates, setEstates] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => { fetchEstates(); }, []);

  const fetchEstates = async () => {
    try {
      const res = await axios.get(`${API_URL}/estates`, getAuthHeaders());
      setEstates(res.data);
    } catch (err) { console.error('Fetch estates error:', err); }
    finally { setLoading(false); }
  };

  const firstName = user?.name?.split(' ')[0] || 'there';

  if (loading) {
    return (
      <div className="p-4 lg:p-6 pt-20 lg:pt-6 pb-24 lg:pb-6 space-y-6">
        <Skeleton className="h-10 w-64 bg-[var(--s)]" />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3].map(i => <Skeleton key={i} className="h-40 bg-[var(--s)] rounded-2xl" />)}
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 lg:p-6 pt-20 lg:pt-6 pb-24 lg:pb-6 animate-fade-in" data-testid="beneficiary-hub">
      {/* Header */}
      <div className="text-center mb-8 mt-4">
        <img src="/carryon-app-logo.png" alt="CarryOn™" className="w-36 mx-auto mb-4" onError={(e) => { e.target.style.display = 'none'; }} />
        <h1 className="text-3xl font-bold text-[var(--t)] mb-1" style={{ fontFamily: 'Outfit, sans-serif' }}>
          Welcome back, {firstName}!
        </h1>
        <p className="text-lg font-bold text-[var(--t3)] mb-1">This Is Your Legacy Network</p>
        <p className="text-sm text-[var(--t4)]">
          You are connected to {estates.length} benefactor estate{estates.length !== 1 ? 's' : ''}.
        </p>
      </div>

      {/* Orbit Visualization */}
      {estates.length > 0 && (
        <OrbitVisualization
          estates={estates}
          userInitials={user?.name?.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2) || 'U'}
          onEstateClick={(estate) => {
            localStorage.setItem('beneficiary_estate_id', estate.id);
            if (estate.status === 'transitioned') {
              navigate('/beneficiary/dashboard');
            } else {
              navigate('/beneficiary/pre');
            }
          }}
        />
      )}

      {/* Estate Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 max-w-4xl mx-auto mb-8">
        {estates.map(estate => {
          const isTransitioned = estate.status === 'transitioned';
          const ownerInitials = estate.name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);

          return (
            <Card
              key={estate.id}
              className={`cursor-pointer transition-all hover:-translate-y-1 ${
                isTransitioned
                  ? 'border-2 border-[var(--gold)]/30 bg-[var(--gold)]/5'
                  : 'glass-card border-dashed border-[var(--b2)]'
              }`}
              onClick={() => {
                localStorage.setItem('beneficiary_estate_id', estate.id);
                if (isTransitioned) {
                  navigate('/beneficiary/dashboard');
                } else {
                  navigate('/beneficiary/pre');
                }
              }}
              data-testid={`estate-card-${estate.id}`}
            >
              <CardContent className="p-5 text-center relative">
                <div
                  className="w-14 h-14 rounded-full mx-auto mb-3 flex items-center justify-center text-lg font-bold text-white"
                  style={{
                    background: isTransitioned
                      ? 'linear-gradient(135deg, #6D28D9, #A855F7)'
                      : 'linear-gradient(135deg, #1E40AF, #3B82F6)',
                    opacity: isTransitioned ? 1 : 0.6,
                    border: isTransitioned ? '2px solid rgba(224,173,43,0.3)' : '2px dashed var(--b2)',
                    boxShadow: isTransitioned ? '0 4px 20px rgba(0,0,0,0.3)' : 'none'
                  }}
                >
                  {ownerInitials}
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
      <div className="max-w-4xl mx-auto">
        <div className="rounded-xl p-4" style={{ background: 'rgba(37,99,235,0.05)', border: '1px solid rgba(37,99,235,0.1)' }}>
          <p className="text-sm text-[var(--bl3)] leading-relaxed">
            Your beneficiary cost is determined by each benefactor's subscription tier. You maintain one CarryOn™ account with access to all connected estates. Billing for each estate begins only after a verified transition event.
          </p>
        </div>
      </div>
    </div>
  );
};

export default BeneficiaryHubPage;
