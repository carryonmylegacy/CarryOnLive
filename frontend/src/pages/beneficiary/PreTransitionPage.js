import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { useAuth } from '../../contexts/AuthContext';
import { Lock, Shield, FileText, Upload, ChevronLeft, AlertTriangle, MessageCircle } from 'lucide-react';
import { Button } from '../../components/ui/button';
import { Card, CardContent } from '../../components/ui/card';
import { Skeleton } from '../../components/ui/skeleton';

const API_URL = `${process.env.REACT_APP_BACKEND_URL}/api`;

const PreTransitionPage = () => {
  const { user, getAuthHeaders } = useAuth();
  const navigate = useNavigate();
  const [estate, setEstate] = useState(null);
  const [loading, setLoading] = useState(true);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    const fetchEstate = async () => {
      try {
        const estateId = localStorage.getItem('beneficiary_estate_id');
        if (estateId) {
          const res = await axios.get(`${API_URL}/estates/${estateId}`, getAuthHeaders());
          setEstate(res.data);
          // If already transitioned, redirect to dashboard
          if (res.data.status === 'transitioned') {
            navigate('/beneficiary/dashboard');
            return;
          }
        }
      } catch (err) { console.error(err); }
      finally { setLoading(false); }
    };
    fetchEstate();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const firstName = user?.name?.split(' ')[0] || 'there';
  const benefactorName = estate?.name?.split(' ')[0] || 'your benefactor';

  if (loading) {
    return (
      <div className="p-4 lg:p-6 pt-4 lg:pt-6 pb-24 lg:pb-6 space-y-6">
        <Skeleton className="h-10 w-64 bg-[var(--s)]" />
        <Skeleton className="h-48 bg-[var(--s)] rounded-2xl" />
      </div>
    );
  }

  return (
    <div className="p-4 lg:p-6 pt-4 lg:pt-6 pb-24 lg:pb-6 animate-fade-in" data-testid="pre-transition">
      {/* Back to estates */}
      <Button
        variant="outline"
        size="sm"
        className="mb-5"
        style={{ background: 'rgba(37,99,235,0.12)', border: '1px solid rgba(37,99,235,0.35)', color: '#60A5FA' }}
        onClick={() => navigate('/beneficiary')}
      >
        <ChevronLeft className="w-4 h-4 mr-1" /> Back to My Estates
      </Button>

      {/* Estate info */}
      <div className="text-center mb-8">
        <h1 className="text-2xl lg:text-3xl font-bold text-[var(--t)] mb-2" style={{ fontFamily: 'Outfit, sans-serif' }}>
          {estate?.name || 'Estate'}
        </h1>
        <p className="text-[var(--t4)]">Pre-Transition · Limited Access</p>
      </div>

      {/* Lock banner */}
      <div className="glass-card p-5 mb-6 flex items-start gap-4">
        <div className="w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: 'var(--seal-bg, rgba(217,119,6,0.12))' }}>
          <Lock className="w-5 h-5 text-[var(--gold)]" />
        </div>
        <div>
          <div className="font-bold text-[var(--gold)] mb-1">Estate Locked — Pre-Transition</div>
          <p className="text-sm text-[var(--t3)] leading-relaxed">
            Full vault access, IAC, MM, and EGA will become available after transition verification.
          </p>
        </div>
      </div>

      {/* Emergency Documents */}
      <Card className="glass-card mb-6">
        <CardContent className="p-5">
          <h3 className="font-bold text-[var(--t)] mb-2 flex items-center gap-2">
            <Shield className="w-5 h-5 text-[var(--gn2)]" />
            Emergency Access Documents
          </h3>
          <p className="text-sm text-[var(--t4)] mb-4 leading-relaxed">
            These documents are available before transition verification for emergency medical and legal decision-making.
          </p>

          {/* Medical Directive */}
          <div
            className="flex items-center gap-3 p-4 rounded-xl mb-2 cursor-pointer transition-transform duration-150 active:scale-[0.98]"
            style={{ background: 'rgba(16,185,129,0.04)', border: '1px solid rgba(16,185,129,0.12)' }}
            onClick={() => navigate('/beneficiary/vault?category=living_will')}
            data-testid="pre-medical-directive"
          >
            <div className="w-10 h-10 rounded-lg flex items-center justify-center" style={{ background: 'rgba(16,185,129,0.12)' }}>
              <FileText className="w-5 h-5 text-[var(--gn2)]" />
            </div>
            <div className="flex-1">
              <div className="font-bold text-[var(--t)]">Medical Directive / Living Will</div>
              <div className="text-xs text-[var(--gn2)]">Available for emergency access</div>
            </div>
          </div>

          {/* Power of Attorney */}
          <div
            className="flex items-center gap-3 p-4 rounded-xl cursor-pointer transition-transform duration-150 active:scale-[0.98]"
            style={{ background: 'rgba(16,185,129,0.04)', border: '1px solid rgba(16,185,129,0.12)' }}
            onClick={() => navigate('/beneficiary/vault?category=poa')}
            data-testid="pre-poa"
          >
            <div className="w-10 h-10 rounded-lg flex items-center justify-center" style={{ background: 'rgba(16,185,129,0.12)' }}>
              <FileText className="w-5 h-5 text-[var(--gn2)]" />
            </div>
            <div className="flex-1">
              <div className="font-bold text-[var(--t)]">Power of Attorney</div>
              <div className="text-xs text-[var(--gn2)]">Available for emergency access</div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Transition Actions */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Card
          className="glass-card cursor-pointer hover:border-[var(--gold)]/30 transition-all"
          onClick={() => navigate('/beneficiary/upload-certificate')}
          data-testid="upload-certificate-btn"
        >
          <CardContent className="p-5 text-center">
            <div className="w-14 h-14 rounded-2xl mx-auto mb-3 flex items-center justify-center" style={{ background: 'rgba(239,68,68,0.1)' }}>
              <Upload className="w-6 h-6 text-[var(--rd)]" />
            </div>
            <h3 className="font-bold text-[var(--t)] mb-1">Upload Death Certificate</h3>
            <p className="text-xs text-[var(--t4)] leading-relaxed">
              Begin the transition verification process
            </p>
          </CardContent>
        </Card>

        <Card className="glass-card cursor-pointer hover:border-[var(--bl2)]/30 transition-all" onClick={() => navigate('/support')} data-testid="chat-team-btn">
          <CardContent className="p-5 text-center">
            <div className="w-14 h-14 rounded-2xl mx-auto mb-3 flex items-center justify-center" style={{ background: 'rgba(37,99,235,0.1)' }}>
              <MessageCircle className="w-6 h-6 text-[var(--bl2)]" />
            </div>
            <h3 className="font-bold text-[var(--t)] mb-1">Contact CarryOn™ Team</h3>
            <p className="text-xs text-[var(--t4)] leading-relaxed">
              Chat with our support team for assistance
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default PreTransitionPage;
