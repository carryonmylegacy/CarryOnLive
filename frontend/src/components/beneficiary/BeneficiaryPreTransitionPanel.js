import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import apiClient from '../../utils/apiClient';
import { Lock, Shield, FileText, AlertTriangle, FolderOpen, Upload, MessageCircle, Heart, ShieldCheck, Network } from 'lucide-react';
import { Card, CardContent } from '../ui/card';
import { useAuth } from '../../contexts/AuthContext';
import { useLabelCleaner } from '../../utils/brandLabel';
import { API_URL } from '../../config';

/**
 * BeneficiaryPreTransitionPanel — inline pre-transition content rendered
 * INSIDE BeneficiaryDashboardPage when the selected estate is not yet
 * transitioned.
 *
 * Replaces the legacy auto-redirect to `/beneficiary/pre`, which
 * collapsed the multi-estate beneficiary portal to a single estate
 * lock-screen and lost the estate switcher + dock + dashboard chrome.
 *
 * The dashboard renders the standard estate switcher + header above
 * this panel, so the user keeps the beneficiary navigation context
 * (Dashboard / SDV / CCP / ECT dock) and can hop between estates
 * without leaving `/beneficiary/dashboard`.
 *
 * Pre-transition surfaces:
 *   • Lock banner explaining the limited access
 *   • Emergency Access Documents shortcuts:
 *       - Emergency Plans (CCP)
 *       - Living Will / Healthcare Directive (gold-slot)
 *       - General + Financial POA (gold-slot)
 *   • Optional "Additional Documents" link if the benefactor shared
 *     non-essential pre-transition docs
 *   • Two action cards — Upload Death Certificate / Contact Support
 */
export default function BeneficiaryPreTransitionPanel({ estate, hasExtraDocs }) {
  const navigate = useNavigate();
  const { getAuthHeaders } = useAuth();
  const cleanLabel = useLabelCleaner();
  const [esShareNow, setEsShareNow] = useState(false);

  // Check whether THIS beneficiary has been granted pre-transition
  // access to the benefactor's Entities & Structures. Backend returns
  // a slimmed-down `you_can_see_now` boolean — we never see the list
  // of OTHER beneficiaries who do or don't have access.
  useEffect(() => {
    const id = estate?.id;
    if (!id) { setEsShareNow(false); return; }
    let cancelled = false;
    (async () => {
      try {
        const res = await apiClient.get(
          `${API_URL}/financial/entities-share/${id}`,
          getAuthHeaders ? getAuthHeaders() : {}
        );
        if (!cancelled) setEsShareNow(!!res.data?.you_can_see_now);
      } catch {
        if (!cancelled) setEsShareNow(false);
      }
    })();
    return () => { cancelled = true; };
  }, [estate?.id, getAuthHeaders]);

  return (
    <div data-testid="beneficiary-pre-transition-panel">
      {/* Lock banner */}
      <div className="glass-card p-5 mb-6 flex items-start gap-4">
        <div
          className="w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0"
          style={{ background: 'var(--seal-bg, rgba(217,119,6,0.12))' }}
        >
          <Lock className="w-5 h-5 text-[var(--gold)]" />
        </div>
        <div>
          <div className="font-bold text-[var(--gold)] mb-1">Estate Locked — Pre-Transition</div>
          <p className="text-sm text-[var(--t3)] leading-relaxed">
            Full vault access, IAC, MM, and EGA will become available after transition verification
            for {estate?.name || 'this estate'}.
          </p>
        </div>
      </div>

      {/* Emergency Access Documents */}
      <Card className="glass-card mb-6">
        <CardContent className="p-5">
          <h3 className="font-bold text-[var(--t)] mb-2 flex items-center gap-2">
            <Shield className="w-5 h-5 text-[var(--gn2)]" />
            Emergency Access Documents
          </h3>
          <p className="text-sm text-[var(--t4)] mb-4 leading-relaxed">
            These documents are available before transition verification for emergency medical and
            legal decision-making.
          </p>

          {/* CCP */}
          <div
            className="flex items-center gap-3 p-4 rounded-xl mb-2 cursor-pointer transition-transform duration-150 active:scale-[0.98]"
            style={{ background: 'rgba(16,185,129,0.04)', border: '1px solid rgba(16,185,129,0.12)' }}
            onClick={() => navigate('/beneficiary/connected-protocol')}
            data-testid="pre-ccp"
          >
            <div className="w-10 h-10 rounded-lg flex items-center justify-center" style={{ background: 'rgba(16,185,129,0.12)' }}>
              <AlertTriangle className="w-5 h-5 text-[var(--gn2)]" />
            </div>
            <div className="flex-1">
              <div className="font-bold text-[var(--t)]">{cleanLabel('Emergency Plans (CCP)')}</div>
              <div className="text-xs text-[var(--gn2)]">View contingency plans assigned to you</div>
            </div>
          </div>

          {/* Entities & Structures (E&S) — pre-transition tile, only
              rendered when the benefactor has explicitly opted this
              beneficiary in via their CFP "Share E&S" toggle. */}
          {esShareNow && (
            <div
              className="flex items-center gap-3 p-4 rounded-xl mb-2 cursor-pointer transition-transform duration-150 active:scale-[0.98]"
              style={{ background: 'rgba(var(--gold-rgb), 0.04)', border: '1px solid rgba(var(--gold-rgb), 0.18)' }}
              onClick={() => navigate(`/beneficiary/entities/${estate?.id}`)}
              data-testid="pre-entities-structures"
            >
              <div className="w-10 h-10 rounded-lg flex items-center justify-center" style={{ background: 'rgba(var(--gold-rgb), 0.15)' }}>
                <Network className="w-5 h-5 text-[var(--gold)]" />
              </div>
              <div className="flex-1">
                <div className="font-bold text-[var(--t)]">Entities & Structures</div>
                <div className="text-xs text-[var(--gn2)]">View your benefactor's businesses, trusts, and connections</div>
              </div>
            </div>
          )}

          {/* Living Will / Healthcare Directive (gold slot) */}
          <div
            className="flex items-center gap-3 p-4 rounded-xl mb-2 cursor-pointer transition-transform duration-150 active:scale-[0.98]"
            style={{ background: 'rgba(var(--gold-rgb), 0.04)', border: '1px solid rgba(var(--gold-rgb), 0.18)' }}
            onClick={() => navigate('/beneficiary/vault?category=living_will')}
            data-testid="pre-medical-directive"
          >
            <div className="w-10 h-10 rounded-lg flex items-center justify-center" style={{ background: 'rgba(var(--gold-rgb), 0.15)' }}>
              <Heart className="w-5 h-5 text-[var(--gold)]" />
            </div>
            <div className="flex-1">
              <div className="font-bold text-[var(--t)]">Living Will / Healthcare Directive</div>
              <div className="text-xs text-[var(--gn2)]">Available for emergency access</div>
            </div>
          </div>

          {/* General POA (gold slot) */}
          <div
            className="flex items-center gap-3 p-4 rounded-xl mb-2 cursor-pointer transition-transform duration-150 active:scale-[0.98]"
            style={{ background: 'rgba(var(--gold-rgb), 0.04)', border: '1px solid rgba(var(--gold-rgb), 0.18)' }}
            onClick={() => navigate('/beneficiary/vault?category=general_poa')}
            data-testid="pre-general-poa"
          >
            <div className="w-10 h-10 rounded-lg flex items-center justify-center" style={{ background: 'rgba(var(--gold-rgb), 0.15)' }}>
              <FileText className="w-5 h-5 text-[var(--gold)]" />
            </div>
            <div className="flex-1">
              <div className="font-bold text-[var(--t)]">General Power of Attorney</div>
              <div className="text-xs text-[var(--gn2)]">Available for emergency access</div>
            </div>
          </div>

          {/* Financial POA (gold slot) */}
          <div
            className="flex items-center gap-3 p-4 rounded-xl cursor-pointer transition-transform duration-150 active:scale-[0.98]"
            style={{ background: 'rgba(var(--gold-rgb), 0.04)', border: '1px solid rgba(var(--gold-rgb), 0.18)' }}
            onClick={() => navigate('/beneficiary/vault?category=financial_poa')}
            data-testid="pre-financial-poa"
          >
            <div className="w-10 h-10 rounded-lg flex items-center justify-center" style={{ background: 'rgba(var(--gold-rgb), 0.15)' }}>
              <ShieldCheck className="w-5 h-5 text-[var(--gold)]" />
            </div>
            <div className="flex-1">
              <div className="font-bold text-[var(--t)]">Financial Power of Attorney</div>
              <div className="text-xs text-[var(--gn2)]">Available for emergency access</div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Optional: extra pre-transition docs */}
      {hasExtraDocs ? (
        <Card
          className="glass-card mb-6 cursor-pointer hover:border-[var(--gold)]/30 transition-all"
          onClick={() => navigate('/beneficiary/vault')}
          data-testid="pre-transition-vault-btn"
        >
          <CardContent className="p-5 flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: 'rgba(var(--gold-rgb), 0.1)' }}>
              <FolderOpen className="w-6 h-6 text-[var(--gold)]" />
            </div>
            <div className="flex-1">
              <h3 className="font-bold text-[var(--t)] mb-0.5">View Additional Documents</h3>
              <p className="text-sm text-[var(--t4)] leading-relaxed">
                Your benefactor has shared additional files for you to view before transition.
              </p>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {/* Action cards */}
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

        <Card
          className="glass-card cursor-pointer hover:border-[var(--bl2)]/30 transition-all"
          onClick={() => navigate('/support')}
          data-testid="chat-team-btn"
        >
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
}
