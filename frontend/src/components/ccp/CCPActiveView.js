import React, { useState } from 'react';
import {
  AlertTriangle,
  MapPin,
  Phone,
  Package,
  FileText,
  UserCheck,
  Loader2,
  ArrowLeft,
  ChevronDown,
  FolderLock,
  Heart,
  KeyRound,
  ExternalLink,
  Mail,
} from 'lucide-react';

/**
 * PlanDetails — collapsible section showing rendezvous points, communication plan,
 * resource locations, and instructions from the active plan snapshot.
 */
function PlanDetails({ snap }) {
  const [open, setOpen] = useState(false);
  if (!snap) return null;
  const hasContent = snap.rendezvous_points?.length || snap.communication_plan || snap.resource_locations?.length || snap.instructions;
  if (!hasContent) return null;
  return (
    <div className="rounded-xl overflow-hidden" style={{ border: '1px solid var(--b)' }}>
      <button onClick={() => setOpen(!open)} className="w-full flex items-center justify-between p-4 text-left" data-testid="ccp-plan-details-toggle"
        style={{ background: 'var(--s)' }}>
        <span className="text-sm font-bold" style={{ color: 'var(--t4)' }}>Plan Details</span>
        <ChevronDown className={`w-4 h-4 transition-transform ${open ? 'rotate-180' : ''}`} style={{ color: 'var(--t4)' }} />
      </button>
      {open && (
        <div className="p-4 space-y-4" style={{ borderTop: '1px solid var(--b)' }}>
          {snap.rendezvous_points?.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-2"><MapPin className="w-4 h-4" style={{ color: '#3B7BF7' }} /><span className="text-xs font-bold" style={{ color: '#3B7BF7' }}>RENDEZVOUS POINTS</span></div>
              {snap.rendezvous_points.map((rp, i) => (
                <div key={i} className="ml-6 mb-1.5">
                  <div className="text-sm font-semibold" style={{ color: 'var(--t)' }}>{rp.name}</div>
                  {rp.address && <div className="text-xs" style={{ color: 'var(--t4)' }}>{rp.address}</div>}
                </div>
              ))}
            </div>
          )}
          {snap.communication_plan && (
            <div>
              <div className="flex items-center gap-2 mb-2"><Phone className="w-4 h-4" style={{ color: '#22C993' }} /><span className="text-xs font-bold" style={{ color: '#22C993' }}>COMMUNICATION</span></div>
              <p className="text-sm ml-6" style={{ color: '#D8DEE9' }}>{snap.communication_plan}</p>
            </div>
          )}
          {snap.resource_locations?.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-2"><Package className="w-4 h-4" style={{ color: '#F5A623' }} /><span className="text-xs font-bold" style={{ color: '#F5A623' }}>RESOURCES</span></div>
              {snap.resource_locations.map((rl, i) => (
                <div key={i} className="ml-6 mb-1.5">
                  <div className="text-sm font-semibold" style={{ color: 'var(--t)' }}>{rl.name}</div>
                  {rl.location && <div className="text-xs" style={{ color: 'var(--t4)' }}>{rl.location}</div>}
                </div>
              ))}
            </div>
          )}
          {snap.instructions && (
            <div>
              <div className="flex items-center gap-2 mb-2"><FileText className="w-4 h-4" style={{ color: '#B794F6' }} /><span className="text-xs font-bold" style={{ color: '#B794F6' }}>INSTRUCTIONS</span></div>
              <p className="text-sm ml-6 whitespace-pre-wrap" style={{ color: '#D8DEE9' }}>{snap.instructions}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * CCPActiveView — the active emergency dashboard view for CCP.
 * Extracted from ConnectedProtocolPage.js for maintainability.
 */
export default function CCPActiveView({
  activeEmergency,
  setView,
  statusBoard,
  STATUS_CONFIG,
  isBenefactor,
  deactivate,
  submitting,
  linkedResources,
}) {
  const snap = activeEmergency.plan_snapshot || {};

  return (
    <div data-testid="ccp-active-view" className="max-w-2xl mx-auto px-4 py-6 pb-28 sm:pb-6 space-y-5">
      {/* Emergency Header */}
      <div className="rounded-2xl p-5 text-center" style={{
        background: activeEmergency.is_drill ? 'rgba(59,123,247,0.12)' : 'rgba(240,82,82,0.12)',
        border: `2px solid ${activeEmergency.is_drill ? 'rgba(59,123,247,0.4)' : 'rgba(240,82,82,0.4)'}`,
      }}>
        {activeEmergency.is_drill && (
          <div className="text-xs font-bold mb-2 px-3 py-1 rounded-full inline-block" style={{ background: 'rgba(59,123,247,0.2)', color: '#3B7BF7' }}>DRILL MODE</div>
        )}
        <AlertTriangle className="w-10 h-10 mx-auto mb-2" style={{ color: activeEmergency.is_drill ? '#3B7BF7' : '#F05252' }} />
        <h2 className="text-xl font-bold" style={{ color: 'var(--t)' }}>{activeEmergency.plan_name}</h2>
        <p className="text-sm mt-1" style={{ color: 'var(--t4)' }}>
          Activated {new Date(activeEmergency.activated_at).toLocaleString()}
        </p>
      </div>

      {/* CHECK IN Button */}
      <button
        onClick={() => setView('checkin')}
        className="w-full py-6 rounded-2xl text-xl font-bold transition-all active:scale-[0.97]"
        data-testid="ccp-checkin-btn"
        style={{
          background: 'linear-gradient(135deg, #22C993, #4EDBA8)',
          color: 'var(--bg)',
          boxShadow: '0 4px 20px rgba(34,201,147,0.3)',
          minHeight: 80,
        }}
      >
        <UserCheck className="w-8 h-8 mx-auto mb-1" />
        CHECK IN
      </button>

      {/* Status Board */}
      <div>
        <h3 className="text-sm font-bold mb-3" style={{ color: 'var(--t4)' }}>MEMBER STATUS</h3>
        <div className="space-y-2">
          {statusBoard.map(m => {
            const cfg = STATUS_CONFIG[m.status] || STATUS_CONFIG.not_checked_in;
            const Icon = cfg.icon;
            return (
              <div key={m.user_id} className="flex items-center gap-3 p-3 rounded-xl" data-testid={`ccp-status-${m.user_id}`}
                style={{ background: cfg.bg, border: `1px solid ${cfg.border}` }}>
                <div className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold" style={{ background: cfg.color, color: '#080e1a' }}>
                  {m.name?.charAt(0) || '?'}
                </div>
                <div className="flex-1">
                  <div className="text-sm font-bold" style={{ color: 'var(--t)' }}>{m.name}</div>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <Icon className="w-3.5 h-3.5" style={{ color: cfg.color }} />
                    <span className="text-xs font-bold" style={{ color: cfg.color }}>{cfg.label}</span>
                  </div>
                  {m.status_note && <p className="text-xs mt-1" style={{ color: 'var(--t4)' }}>{m.status_note}</p>}
                  {m.location_description && (
                    <p className="text-xs mt-0.5 flex items-center gap-1" style={{ color: 'var(--t4)' }}>
                      <MapPin className="w-3 h-3" />{m.location_description}
                    </p>
                  )}
                </div>
                {m.checked_in_at && (
                  <span className="text-[11px]" style={{ color: 'var(--t5)' }}>
                    {new Date(m.checked_in_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Plan Details */}
      <PlanDetails snap={snap} />

      {/* Linked Resources */}
      {(linkedResources.documents.length > 0 || linkedResources.ffn_contacts.length > 0 || linkedResources.dav_entries.length > 0) && (
        <div className="space-y-3">
          <h3 className="text-sm font-bold" style={{ color: 'var(--t4)' }}>EMERGENCY RESOURCES</h3>

          {linkedResources.documents.length > 0 && (
            <div className="rounded-xl overflow-hidden" style={{ border: '1px solid rgba(59,123,247,0.2)' }}>
              <div className="flex items-center gap-2 px-4 py-2.5" style={{ background: 'rgba(59,123,247,0.08)' }}>
                <FolderLock className="w-4 h-4" style={{ color: '#3B7BF7' }} />
                <span className="text-xs font-bold" style={{ color: '#3B7BF7' }}>DOCUMENTS (SDV)</span>
              </div>
              <div className="p-2 space-y-1">
                {linkedResources.documents.map(doc => (
                  <a key={doc.id} href={`/vault`} target="_blank" rel="noopener noreferrer"
                    className="flex items-center gap-3 p-3 rounded-xl transition-all active:scale-[0.97]"
                    data-testid={`ccp-doc-${doc.id}`}
                    style={{ background: 'var(--s)', border: '1px solid var(--b)' }}>
                    <FileText className="w-5 h-5 flex-shrink-0" style={{ color: '#3B7BF7' }} />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-semibold truncate" style={{ color: 'var(--t)' }}>{doc.name}</div>
                      <div className="text-xs" style={{ color: 'var(--t4)' }}>{doc.category} · {doc.file_type}</div>
                    </div>
                    <ExternalLink className="w-4 h-4 flex-shrink-0" style={{ color: 'var(--t5)' }} />
                  </a>
                ))}
              </div>
            </div>
          )}

          {linkedResources.ffn_contacts.length > 0 && (
            <div className="rounded-xl overflow-hidden" style={{ border: '1px solid rgba(34,201,147,0.2)' }}>
              <div className="flex items-center gap-2 px-4 py-2.5" style={{ background: 'rgba(34,201,147,0.08)' }}>
                <Heart className="w-4 h-4" style={{ color: '#22C993' }} />
                <span className="text-xs font-bold" style={{ color: '#22C993' }}>TRUSTED CONTACTS (FFN)</span>
              </div>
              <div className="p-2 space-y-1">
                {linkedResources.ffn_contacts.map(fc => (
                  <div key={fc.id} className="flex items-center gap-3 p-3 rounded-xl"
                    data-testid={`ccp-ffn-${fc.id}`}
                    style={{ background: 'var(--s)', border: '1px solid var(--b)' }}>
                    <div className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold" style={{ background: 'rgba(34,201,147,0.15)', color: '#22C993' }}>
                      {fc.name?.charAt(0) || '?'}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-semibold" style={{ color: 'var(--t)' }}>{fc.name}</div>
                      <div className="text-xs" style={{ color: 'var(--t4)' }}>{fc.relationship}</div>
                    </div>
                    <div className="flex gap-1.5 flex-shrink-0">
                      {fc.phone && (
                        <a href={`tel:${fc.phone}`} className="w-9 h-9 rounded-full flex items-center justify-center active:scale-[0.95]"
                          style={{ background: 'rgba(34,201,147,0.15)' }}>
                          <Phone className="w-4 h-4" style={{ color: '#22C993' }} />
                        </a>
                      )}
                      {fc.email && (
                        <a href={`mailto:${fc.email}`} className="w-9 h-9 rounded-full flex items-center justify-center active:scale-[0.95]"
                          style={{ background: 'rgba(59,123,247,0.15)' }}>
                          <Mail className="w-4 h-4" style={{ color: '#3B7BF7' }} />
                        </a>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {linkedResources.dav_entries.length > 0 && (
            <div className="rounded-xl overflow-hidden" style={{ border: '1px solid rgba(183,148,246,0.2)' }}>
              <div className="flex items-center gap-2 px-4 py-2.5" style={{ background: 'rgba(183,148,246,0.08)' }}>
                <KeyRound className="w-4 h-4" style={{ color: '#B794F6' }} />
                <span className="text-xs font-bold" style={{ color: '#B794F6' }}>DIGITAL CREDENTIALS (DAV)</span>
              </div>
              <div className="p-2 space-y-1">
                {linkedResources.dav_entries.map(dav => (
                  <a key={dav.id} href={`/digital-wallet`} target="_blank" rel="noopener noreferrer"
                    className="flex items-center gap-3 p-3 rounded-xl transition-all active:scale-[0.97]"
                    data-testid={`ccp-dav-${dav.id}`}
                    style={{ background: 'var(--s)', border: '1px solid var(--b)' }}>
                    <KeyRound className="w-5 h-5 flex-shrink-0" style={{ color: '#B794F6' }} />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-semibold truncate" style={{ color: 'var(--t)' }}>{dav.account_name}</div>
                      <div className="text-xs" style={{ color: 'var(--t4)' }}>{dav.category} · {dav.login_username}</div>
                    </div>
                    <ExternalLink className="w-4 h-4 flex-shrink-0" style={{ color: 'var(--t5)' }} />
                  </a>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Deactivate */}
      {isBenefactor && (
        <button
          onClick={deactivate}
          disabled={submitting}
          className="w-full py-4 rounded-2xl text-base font-bold transition-all active:scale-[0.97]"
          data-testid="ccp-deactivate-btn"
          style={{ background: 'rgba(240,82,82,0.15)', border: '2px solid rgba(240,82,82,0.4)', color: '#F05252' }}
        >
          {submitting ? <Loader2 className="w-5 h-5 animate-spin mx-auto" /> : 'STAND DOWN — Deactivate'}
        </button>
      )}

      <button onClick={() => setView('home')} className="w-full py-3 rounded-xl text-sm font-semibold" data-testid="ccp-back-home"
        style={{ background: 'var(--s)', border: '1px solid var(--b)', color: 'var(--t4)' }}>
        <ArrowLeft className="w-4 h-4 inline mr-1" />Back
      </button>
    </div>
  );
}
