import React, { useState, useEffect } from 'react';
import axios from 'axios';
import {
  Gift, CheckCircle2, XCircle, Clock, Loader2, ChevronRight,
  MessageSquare, Calendar, User, Eye, ArrowLeft
} from 'lucide-react';
import { Card, CardContent } from '../ui/card';
import { Button } from '../ui/button';
import { toast } from '../../utils/toast';

const API_URL = `${process.env.REACT_APP_BACKEND_URL}/api`;

const statusConfig = {
  pending_review: { label: 'Pending Review', color: '#F59E0B', icon: Clock },
  approved: { label: 'Approved', color: '#22C993', icon: CheckCircle2 },
  rejected: { label: 'Rejected', color: '#EF4444', icon: XCircle },
};

export const MilestoneDeliveriesTab = ({ getAuthHeaders }) => {
  const [deliveries, setDeliveries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('pending_review');
  const [selectedDelivery, setSelectedDelivery] = useState(null);
  const [detailData, setDetailData] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [reviewLoading, setReviewLoading] = useState(false);
  const [stats, setStats] = useState(null);

  const fetchDeliveries = async () => {
    try {
      const res = await axios.get(`${API_URL}/milestones/deliveries?status=${filter}`, getAuthHeaders());
      setDeliveries(res.data || []);
    } catch {}
    finally { setLoading(false); }
  };

  const fetchStats = async () => {
    try {
      const res = await axios.get(`${API_URL}/milestones/deliveries/stats`, getAuthHeaders());
      setStats(res.data);
    } catch {}
  };

  useEffect(() => {
    fetchDeliveries();
    fetchStats();
  }, [filter]); // eslint-disable-line react-hooks/exhaustive-deps

  const openDetail = async (delivery) => {
    setSelectedDelivery(delivery);
    setDetailLoading(true);
    try {
      const res = await axios.get(`${API_URL}/milestones/deliveries/${delivery.id}`, getAuthHeaders());
      setDetailData(res.data);
    } catch { toast.error('Failed to load details'); }
    finally { setDetailLoading(false); }
  };

  const handleReview = async (deliveryId, action, notes = '') => {
    setReviewLoading(true);
    try {
      await axios.post(`${API_URL}/milestones/deliveries/${deliveryId}/review`,
        { action, notes }, getAuthHeaders());
      toast.success(action === 'approve'
        ? 'Message approved and delivered to beneficiary'
        : 'Delivery rejected');
      setSelectedDelivery(null);
      setDetailData(null);
      fetchDeliveries();
      fetchStats();
    } catch (err) { toast.error(err.response?.data?.detail || 'Review failed'); }
    finally { setReviewLoading(false); }
  };

  if (loading) {
    return <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-[var(--gold)]" /></div>;
  }

  // Detail View
  if (selectedDelivery) {
    return (
      <div className="space-y-4" data-testid="milestone-delivery-detail">
        <Button variant="outline" size="sm" className="border-[var(--b)] text-[var(--t3)]"
          onClick={() => { setSelectedDelivery(null); setDetailData(null); }}>
          <ArrowLeft className="w-3.5 h-3.5 mr-1" /> Back to List
        </Button>

        {detailLoading ? (
          <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-[var(--gold)]" /></div>
        ) : detailData ? (
          <>
            {/* Milestone Report */}
            <Card className="glass-card">
              <CardContent className="p-5">
                <h3 className="font-bold text-[var(--t)] mb-3 flex items-center gap-2">
                  <Gift className="w-4 h-4 text-[#F59E0B]" /> Milestone Report
                </h3>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <span className="text-[var(--t5)] text-xs">Beneficiary</span>
                    <p className="text-[var(--t)] font-bold">{selectedDelivery.beneficiary_name}</p>
                  </div>
                  <div>
                    <span className="text-[var(--t5)] text-xs">Event Type</span>
                    <p className="text-[var(--t)] font-bold capitalize">{selectedDelivery.event_type}</p>
                  </div>
                  <div>
                    <span className="text-[var(--t5)] text-xs">Event Date</span>
                    <p className="text-[var(--t)]">{new Date(selectedDelivery.event_date).toLocaleDateString()}</p>
                  </div>
                  <div>
                    <span className="text-[var(--t5)] text-xs">Estate</span>
                    <p className="text-[var(--t)]">{detailData.estate_name}</p>
                  </div>
                  {selectedDelivery.event_description && (
                    <div className="col-span-2">
                      <span className="text-[var(--t5)] text-xs">Description</span>
                      <p className="text-[var(--t)]">{selectedDelivery.event_description}</p>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Matched Message */}
            {detailData.matched_message && (
              <Card className="glass-card" style={{ borderLeft: '3px solid #d4af37' }}>
                <CardContent className="p-5">
                  <h3 className="font-bold text-[var(--t)] mb-3 flex items-center gap-2">
                    <MessageSquare className="w-4 h-4 text-[var(--gold)]" /> Matched Message
                  </h3>
                  <div className="space-y-2 text-sm">
                    <div>
                      <span className="text-[var(--t5)] text-xs">Title</span>
                      <p className="text-[var(--t)] font-bold">{detailData.matched_message.title || selectedDelivery.message_title}</p>
                    </div>
                    <div>
                      <span className="text-[var(--t5)] text-xs">Type</span>
                      <p className="text-[var(--t)] capitalize">{detailData.matched_message.message_type} · Trigger: {detailData.matched_message.trigger_type} ({detailData.matched_message.trigger_value || 'any'})</p>
                    </div>
                    <div>
                      <span className="text-[var(--t5)] text-xs">Recipients</span>
                      <p className="text-[var(--t)]">{(detailData.matched_message.recipients || []).length} recipient(s)</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* All Estate Messages (context) */}
            {detailData.all_estate_messages?.length > 0 && (
              <Card className="glass-card">
                <CardContent className="p-5">
                  <h3 className="font-bold text-[var(--t)] mb-3 flex items-center gap-2">
                    <Eye className="w-4 h-4 text-[var(--t5)]" /> All Estate Messages ({detailData.all_estate_messages.length})
                  </h3>
                  <div className="space-y-1.5 max-h-48 overflow-y-auto">
                    {detailData.all_estate_messages.map(msg => (
                      <div key={msg.id}
                        className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs"
                        style={{
                          background: msg.id === selectedDelivery.message_id ? 'rgba(212,175,55,0.08)' : 'var(--s)',
                          border: msg.id === selectedDelivery.message_id ? '1px solid rgba(212,175,55,0.2)' : '1px solid var(--b)',
                        }}>
                        <div className={`w-2 h-2 rounded-full flex-shrink-0 ${msg.is_delivered ? 'bg-[#22C993]' : 'bg-[var(--t5)]'}`} />
                        <span className="text-[var(--t)] font-bold truncate flex-1">{msg.title || 'Untitled'}</span>
                        <span className="text-[var(--t5)] flex-shrink-0">{msg.trigger_type}</span>
                        {msg.id === selectedDelivery.message_id && (
                          <span className="text-[10px] font-bold text-[var(--gold)] flex-shrink-0">MATCHED</span>
                        )}
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Review Actions */}
            {selectedDelivery.status === 'pending_review' && (
              <Card className="glass-card">
                <CardContent className="p-5">
                  <h3 className="font-bold text-[var(--t)] mb-3">Review Decision</h3>
                  <p className="text-xs text-[var(--t4)] mb-4">
                    Confirm the automated match is correct and approve delivery, or reject if the match is incorrect.
                  </p>
                  <div className="flex gap-3">
                    <Button
                      className="flex-1 font-bold"
                      style={{ background: 'linear-gradient(135deg, #22C993, #16A34A)', color: 'white' }}
                      disabled={reviewLoading}
                      onClick={() => handleReview(selectedDelivery.id, 'approve')}
                      data-testid="milestone-approve-btn"
                    >
                      {reviewLoading ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <CheckCircle2 className="w-4 h-4 mr-1" />}
                      Approve & Deliver
                    </Button>
                    <Button
                      variant="outline"
                      className="flex-1 font-bold border-[var(--rd)]/30 text-[var(--rd)]"
                      disabled={reviewLoading}
                      onClick={() => handleReview(selectedDelivery.id, 'reject')}
                      data-testid="milestone-reject-btn"
                    >
                      <XCircle className="w-4 h-4 mr-1" /> Reject
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Already reviewed */}
            {selectedDelivery.status !== 'pending_review' && (
              <Card className="glass-card">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 text-sm">
                    {selectedDelivery.status === 'approved'
                      ? <CheckCircle2 className="w-4 h-4 text-[#22C993]" />
                      : <XCircle className="w-4 h-4 text-[#EF4444]" />}
                    <span className="text-[var(--t)] font-bold capitalize">{selectedDelivery.status}</span>
                    {selectedDelivery.reviewed_by_name && (
                      <span className="text-[var(--t5)]">by {selectedDelivery.reviewed_by_name}</span>
                    )}
                    {selectedDelivery.reviewed_at && (
                      <span className="text-[var(--t5)]">
                        on {new Date(selectedDelivery.reviewed_at).toLocaleString()}
                      </span>
                    )}
                  </div>
                </CardContent>
              </Card>
            )}
          </>
        ) : null}
      </div>
    );
  }

  // List View
  return (
    <div className="space-y-4" data-testid="milestone-deliveries-tab">
      {/* Header with stats */}
      <div className="rounded-xl p-4" style={{ background: 'rgba(245,158,11,0.06)', border: '1px solid rgba(245,158,11,0.12)' }}>
        <h3 className="font-bold text-[#F59E0B] mb-2 flex items-center gap-2">
          <Gift className="w-4 h-4" /> Milestone Message Deliveries
        </h3>
        <p className="text-sm text-[var(--t3)] leading-relaxed">
          Review automated milestone message matches. The system finds messages that match beneficiary-reported milestones.
          Approve to deliver, or reject if the match is incorrect.
        </p>
      </div>

      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-3 gap-2">
          {[
            { label: 'Pending', count: stats.pending, color: '#F59E0B' },
            { label: 'Approved', count: stats.approved, color: '#22C993' },
            { label: 'Rejected', count: stats.rejected, color: '#EF4444' },
          ].map(s => (
            <div key={s.label} className="rounded-xl p-3 text-center cursor-pointer"
              style={{
                background: filter === s.label.toLowerCase().replace(' ', '_')
                  ? `${s.color}12` : 'var(--s)',
                border: `1px solid ${filter === s.label.toLowerCase().replace(' ', '_')
                  ? `${s.color}30` : 'var(--b)'}`,
              }}
              onClick={() => setFilter(
                s.label === 'Pending' ? 'pending_review' : s.label.toLowerCase()
              )}
              data-testid={`milestone-filter-${s.label.toLowerCase()}`}>
              <div className="text-xl font-bold text-[var(--t)]">{s.count}</div>
              <div className="text-[10px] font-bold" style={{ color: s.color }}>{s.label}</div>
            </div>
          ))}
        </div>
      )}

      {/* Delivery List */}
      {deliveries.length === 0 ? (
        <Card className="glass-card">
          <CardContent className="p-8 text-center">
            <Gift className="w-10 h-10 mx-auto text-[var(--t5)] mb-3" />
            <h3 className="font-bold text-[var(--t)] mb-1">No {filter === 'pending_review' ? 'Pending' : filter} Deliveries</h3>
            <p className="text-xs text-[var(--t4)]">
              {filter === 'pending_review'
                ? 'All milestone message matches have been reviewed.'
                : `No ${filter} deliveries found.`}
            </p>
          </CardContent>
        </Card>
      ) : (
        deliveries.map(d => {
          const sc = statusConfig[d.status] || statusConfig.pending_review;
          const StatusIcon = sc.icon;
          return (
            <Card key={d.id} className="glass-card cursor-pointer hover:border-[var(--b2)]"
              onClick={() => openDetail(d)} data-testid={`milestone-delivery-${d.id}`}>
              <CardContent className="p-4 flex items-center gap-4">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                  style={{ background: `${sc.color}12`, border: `1px solid ${sc.color}25` }}>
                  <StatusIcon className="w-5 h-5" style={{ color: sc.color }} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-bold text-[var(--t)] truncate">{d.message_title || 'Milestone Message'}</span>
                    <span className="text-[10px] px-1.5 py-0.5 rounded-full font-bold"
                      style={{ background: `${sc.color}15`, color: sc.color }}>
                      {sc.label}
                    </span>
                  </div>
                  <div className="flex gap-2 mt-1 text-xs text-[var(--t5)]">
                    <span className="flex items-center gap-1"><User className="w-3 h-3" /> {d.beneficiary_name}</span>
                    <span className="flex items-center gap-1"><Gift className="w-3 h-3" /> {d.event_type}</span>
                    <span className="flex items-center gap-1"><Calendar className="w-3 h-3" /> {new Date(d.event_date).toLocaleDateString()}</span>
                  </div>
                </div>
                <ChevronRight className="w-5 h-5 text-[var(--t5)] flex-shrink-0" />
              </CardContent>
            </Card>
          );
        })
      )}
    </div>
  );
};
