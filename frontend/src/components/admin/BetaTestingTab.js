import React, { useState, useEffect } from 'react';
import axios from 'axios';
import apiClient from '../../utils/apiClient';
import { Bug, Loader2, Check, X, Clock, ChevronDown, ChevronUp, Image } from 'lucide-react';
import { Card, CardContent } from '../ui/card';
import { Button } from '../ui/button';
import { toast } from '../../utils/toast';
import { API_URL } from '../../config';

const STATUS_CONFIG = {
  open: { label: 'Open', color: '#F59E0B', bg: 'rgba(245,158,11,0.12)' },
  accepted: { label: 'Accepted', color: '#60A5FA', bg: 'rgba(96,165,250,0.12)' },
  complete: { label: 'Complete', color: '#22C993', bg: 'rgba(34,201,147,0.12)' },
  rejected: { label: 'Rejected', color: '#EF4444', bg: 'rgba(239,68,68,0.12)' },
};

export const BetaTestingTab = ({ getAuthHeaders }) => {
  const [tickets, setTickets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expandedTicket, setExpandedTicket] = useState(null);
  const [filterStatus, setFilterStatus] = useState('all');
  const [updatingId, setUpdatingId] = useState(null);

  const headers = getAuthHeaders()?.headers || {};

  useEffect(() => { fetchTickets(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const fetchTickets = async () => {
    try {
      const res = await apiClient.get(`${API_URL}/admin/beta-tickets`, { headers });
      setTickets(res.data);
    } catch (err) {
      toast.error('Failed to load beta tickets');
    }
    setLoading(false);
  };

  const updateStatus = async (ticketId, status) => {
    setUpdatingId(ticketId);
    try {
      await apiClient.put(`${API_URL}/admin/beta-tickets/${ticketId}/status`, { status }, {
        headers: { ...headers, 'Content-Type': 'application/json' },
      });
      setTickets(prev => prev.map(t => t.id === ticketId ? { ...t, status } : t));
    } catch (err) {
      toast.error('Failed to update ticket');
    }
    setUpdatingId(null);
  };

  const filtered = tickets.filter(t => filterStatus === 'all' || t.status === filterStatus);
  const counts = {
    all: tickets.length,
    open: tickets.filter(t => t.status === 'open').length,
    accepted: tickets.filter(t => t.status === 'accepted').length,
    complete: tickets.filter(t => t.status === 'complete').length,
    rejected: tickets.filter(t => t.status === 'rejected').length,
  };

  if (loading) return <div className="flex justify-center p-8"><Loader2 className="w-6 h-6 animate-spin text-[var(--gold)]" /></div>;

  return (
    <div className="space-y-5" data-testid="beta-testing-tab">
      {/* Header stats */}
      <div className="flex gap-3 flex-wrap">
        {['all', 'open', 'accepted', 'complete', 'rejected'].map(status => {
          const cfg = STATUS_CONFIG[status] || { label: 'All', color: '#d4af37', bg: 'rgba(var(--gold-rgb), 0.1)' };
          const isActive = filterStatus === status;
          return (
            <button
              key={status}
              onClick={() => setFilterStatus(status)}
              className="px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5"
              style={{
                background: isActive ? (status === 'all' ? 'var(--gold)' : cfg.bg) : 'var(--s)',
                color: isActive ? (status === 'all' ? '#0F1629' : cfg.color) : 'var(--t4)',
                border: isActive ? `1px solid ${status === 'all' ? 'var(--gold)' : cfg.color}` : '1px solid transparent',
              }}
              data-testid={`beta-filter-${status}`}
            >
              {status === 'all' ? 'All' : cfg.label}
              <span className="opacity-70">({counts[status]})</span>
            </button>
          );
        })}
      </div>

      {/* Tickets list */}
      {filtered.length === 0 ? (
        <Card className="glass-card">
          <CardContent className="p-8 text-center">
            <Bug className="w-10 h-10 mx-auto mb-3" style={{ color: 'var(--t5)' }} />
            <p className="text-sm font-medium" style={{ color: 'var(--t4)' }}>
              {filterStatus === 'all' ? 'No beta feedback tickets yet' : `No ${filterStatus} tickets`}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {filtered.map(ticket => {
            const isExpanded = expandedTicket === ticket.id;
            const sc = STATUS_CONFIG[ticket.status] || STATUS_CONFIG.open;
            const date = new Date(ticket.created_at);
            const dateStr = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
            const timeStr = date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });

            return (
              <Card key={ticket.id} className="glass-card overflow-hidden" data-testid={`beta-ticket-${ticket.ticket_number}`}>
                <CardContent className="p-0">
                  {/* Ticket header — always visible */}
                  <div
                    className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-[var(--s)]/50 transition-colors"
                    onClick={() => setExpandedTicket(isExpanded ? null : ticket.id)}
                  >
                    {/* Ticket number */}
                    <span
                      className="text-sm font-bold flex-shrink-0 w-12 text-center"
                      style={{ color: '#d4af37' }}
                    >
                      #{String(ticket.ticket_number).padStart(3, '0')}
                    </span>

                    {/* User & page info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-bold truncate" style={{ color: 'var(--t)' }}>{ticket.user_name}</span>
                        {ticket.attachment_name && <Image className="w-3.5 h-3.5 flex-shrink-0" style={{ color: '#d4af37' }} />}
                      </div>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        <span className="text-[11px]" style={{ color: 'var(--t5)' }}>{ticket.page}</span>
                        <span className="text-[11px]" style={{ color: 'var(--t5)' }}>·</span>
                        <span className="text-[11px]" style={{ color: 'var(--t5)' }}>{dateStr} {timeStr}</span>
                      </div>
                    </div>

                    {/* Status badge */}
                    <span
                      className="text-[11px] px-2 py-0.5 rounded-full font-bold uppercase flex-shrink-0"
                      style={{ background: sc.bg, color: sc.color }}
                    >
                      {sc.label}
                    </span>

                    {/* Expand toggle */}
                    {isExpanded
                      ? <ChevronUp className="w-4 h-4 flex-shrink-0" style={{ color: 'var(--t5)' }} />
                      : <ChevronDown className="w-4 h-4 flex-shrink-0" style={{ color: 'var(--t5)' }} />
                    }
                  </div>

                  {/* Expanded content */}
                  {isExpanded && (
                    <div className="px-4 pb-4 pt-1 space-y-3" style={{ borderTop: '1px solid var(--b)' }}>
                      {/* Description */}
                      <div>
                        <label className="text-[11px] font-bold uppercase tracking-wider" style={{ color: 'var(--t5)' }}>Description</label>
                        <p className="text-sm mt-1 whitespace-pre-wrap" style={{ color: 'var(--t3)' }}>{ticket.description}</p>
                      </div>

                      {/* User email */}
                      <div>
                        <label className="text-[11px] font-bold uppercase tracking-wider" style={{ color: 'var(--t5)' }}>Submitted by</label>
                        <p className="text-xs mt-0.5" style={{ color: 'var(--t4)' }}>{ticket.user_email}</p>
                      </div>

                      {/* Attachment */}
                      {ticket.attachment_name && ticket.attachment_data && (
                        <div>
                          <label className="text-[11px] font-bold uppercase tracking-wider" style={{ color: 'var(--t5)' }}>Attachment</label>
                          <div className="mt-1">
                            <img
                              src={`data:${ticket.attachment_content_type || 'image/png'};base64,${ticket.attachment_data}`}
                              alt={ticket.attachment_name}
                              className="rounded-lg max-h-64 border"
                              style={{ borderColor: 'var(--b)' }}
                            />
                            <p className="text-[11px] mt-1" style={{ color: 'var(--t5)' }}>{ticket.attachment_name}</p>
                          </div>
                        </div>
                      )}

                      {/* Status actions */}
                      <div className="flex gap-2 pt-2 flex-wrap">
                        {ticket.status !== 'accepted' && (
                          <Button
                            size="sm"
                            onClick={() => updateStatus(ticket.id, 'accepted')}
                            disabled={updatingId === ticket.id}
                            className="text-xs h-8 px-3 font-bold"
                            style={{ background: 'rgba(96,165,250,0.15)', color: '#60A5FA', border: '1px solid rgba(96,165,250,0.3)' }}
                            data-testid={`beta-ticket-accept-${ticket.ticket_number}`}
                          >
                            <Clock className="w-3 h-3 mr-1" /> Accept
                          </Button>
                        )}
                        {ticket.status !== 'complete' && (
                          <Button
                            size="sm"
                            onClick={() => updateStatus(ticket.id, 'complete')}
                            disabled={updatingId === ticket.id}
                            className="text-xs h-8 px-3 font-bold"
                            style={{ background: 'rgba(34,201,147,0.15)', color: '#22C993', border: '1px solid rgba(34,201,147,0.3)' }}
                            data-testid={`beta-ticket-complete-${ticket.ticket_number}`}
                          >
                            <Check className="w-3 h-3 mr-1" /> Complete
                          </Button>
                        )}
                        {ticket.status !== 'rejected' && (
                          <Button
                            size="sm"
                            onClick={() => updateStatus(ticket.id, 'rejected')}
                            disabled={updatingId === ticket.id}
                            className="text-xs h-8 px-3 font-bold"
                            style={{ background: 'rgba(239,68,68,0.15)', color: '#EF4444', border: '1px solid rgba(239,68,68,0.3)' }}
                            data-testid={`beta-ticket-reject-${ticket.ticket_number}`}
                          >
                            <X className="w-3 h-3 mr-1" /> Reject
                          </Button>
                        )}
                        {ticket.status !== 'open' && (
                          <Button
                            size="sm"
                            onClick={() => updateStatus(ticket.id, 'open')}
                            disabled={updatingId === ticket.id}
                            className="text-xs h-8 px-3 font-bold"
                            style={{ background: 'rgba(245,158,11,0.15)', color: '#F59E0B', border: '1px solid rgba(245,158,11,0.3)' }}
                            data-testid={`beta-ticket-reopen-${ticket.ticket_number}`}
                          >
                            Reopen
                          </Button>
                        )}
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
};
