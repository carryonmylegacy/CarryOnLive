import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { Calendar, Plus, ChevronLeft, ChevronRight, Loader2, X, Check, Clock } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { toast } from '../../utils/toast';
import { useAuth } from '../../contexts/AuthContext';
import { API_URL } from '../../config';

const SHIFT_COLORS = {
  day: { bg: '#22C99320', border: '#22C993', text: '#22C993', label: 'Day' },
  evening: { bg: '#F59E0B20', border: '#F59E0B', text: '#F59E0B', label: 'Evening' },
  night: { bg: '#3B82F620', border: '#3B82F6', text: '#3B82F6', label: 'Night' },
  on_call: { bg: '#B794F620', border: '#B794F6', text: '#B794F6', label: 'On-Call' },
};

const STATUS_STYLES = {
  scheduled: { color: '#F59E0B', label: 'Scheduled' },
  confirmed: { color: '#22C993', label: 'Confirmed' },
  completed: { color: '#3B82F6', label: 'Completed' },
  cancelled: { color: '#ef4444', label: 'Cancelled' },
};

export const ShiftScheduleTab = ({ getAuthHeaders }) => {
  const { user } = useAuth();
  const [shifts, setShifts] = useState([]);
  const [summary, setSummary] = useState(null);
  const [staff, setStaff] = useState([]);
  const [loading, setLoading] = useState(true);
  const [weekStart, setWeekStart] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ operator_id: '', shift_type: 'day', date: '', notes: '' });
  const [saving, setSaving] = useState(false);

  const isManagerOrAdmin = user?.role === 'admin' || user?.operator_role === 'manager';

  const getMonday = (d) => {
    const date = new Date(d);
    const day = date.getDay();
    const diff = date.getDate() - day + (day === 0 ? -6 : 1);
    const monday = new Date(date.setDate(diff));
    return monday.toISOString().split('T')[0];
  };

  useEffect(() => {
    setWeekStart(getMonday(new Date()));
  }, []);

  const fetchData = useCallback(async () => {
    if (!weekStart) return;
    setLoading(true);
    try {
      const endDate = new Date(weekStart);
      endDate.setDate(endDate.getDate() + 6);
      const endStr = endDate.toISOString().split('T')[0];

      const [shiftsRes, summaryRes, staffRes] = await Promise.all([
        axios.get(`${API_URL}/ops/shifts?start_date=${weekStart}&end_date=${endStr}`, getAuthHeaders()),
        axios.get(`${API_URL}/ops/shifts/summary?week_start=${weekStart}`, getAuthHeaders()),
        isManagerOrAdmin ? axios.get(`${API_URL}/team/staff`, getAuthHeaders()) : Promise.resolve({ data: [] }),
      ]);

      setShifts(shiftsRes.data);
      setSummary(summaryRes.data);
      setStaff(staffRes.data);
    } catch {
      toast.error('Failed to load schedule');
    } finally {
      setLoading(false);
    }
  }, [weekStart, getAuthHeaders, isManagerOrAdmin]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const navigateWeek = (dir) => {
    const d = new Date(weekStart);
    d.setDate(d.getDate() + dir * 7);
    setWeekStart(d.toISOString().split('T')[0]);
  };

  const handleCreate = async () => {
    if (!form.operator_id || !form.date) return toast.error('Select an operator and date');
    setSaving(true);
    try {
      await axios.post(`${API_URL}/ops/shifts`, form, getAuthHeaders());
      toast.success('Shift created');
      setShowForm(false);
      setForm({ operator_id: '', shift_type: 'day', date: '', notes: '' });
      fetchData();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to create shift');
    } finally {
      setSaving(false);
    }
  };

  const handleStatusUpdate = async (shiftId, status) => {
    try {
      await axios.put(`${API_URL}/ops/shifts/${shiftId}`, { status }, getAuthHeaders());
      toast.success(`Shift ${status}`);
      fetchData();
    } catch {
      toast.error('Failed to update shift');
    }
  };

  const handleCancel = async (shiftId) => {
    try {
      await axios.delete(`${API_URL}/ops/shifts/${shiftId}`, getAuthHeaders());
      toast.success('Shift cancelled');
      fetchData();
    } catch {
      toast.error('Failed to cancel shift');
    }
  };

  const formatDate = (dateStr) => {
    const d = new Date(dateStr + 'T00:00:00');
    return d.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });
  };

  return (
    <div className="space-y-4" data-testid="shift-schedule-tab">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-3">
          <button onClick={() => navigateWeek(-1)} className="p-2 rounded-lg hover:bg-[var(--s)]" data-testid="prev-week-btn">
            <ChevronLeft className="w-4 h-4 text-[var(--t4)]" />
          </button>
          <span className="text-sm font-bold text-[var(--t)]">
            Week of {formatDate(weekStart || new Date().toISOString().split('T')[0])}
          </span>
          <button onClick={() => navigateWeek(1)} className="p-2 rounded-lg hover:bg-[var(--s)]" data-testid="next-week-btn">
            <ChevronRight className="w-4 h-4 text-[var(--t4)]" />
          </button>
        </div>
        {isManagerOrAdmin && (
          <button
            onClick={() => setShowForm(!showForm)}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-bold transition-all"
            style={{ background: 'var(--gold)', color: '#0F1629' }}
            data-testid="add-shift-btn"
          >
            <Plus className="w-4 h-4" /> Add Shift
          </button>
        )}
      </div>

      {/* Create Form */}
      {showForm && (
        <Card className="glass-card">
          <CardContent className="p-4 space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              <select
                value={form.operator_id}
                onChange={e => setForm(p => ({ ...p, operator_id: e.target.value }))}
                className="px-3 py-2 rounded-lg text-sm bg-[var(--s)] text-[var(--t)]"
                style={{ border: '1px solid var(--b)', fontSize: '16px' }}
                data-testid="shift-operator-select"
              >
                <option value="">Select Operator</option>
                {staff.map(s => (
                  <option key={s.id} value={s.id}>{s.name} ({s.operator_role || s.role})</option>
                ))}
              </select>
              <select
                value={form.shift_type}
                onChange={e => setForm(p => ({ ...p, shift_type: e.target.value }))}
                className="px-3 py-2 rounded-lg text-sm bg-[var(--s)] text-[var(--t)]"
                style={{ border: '1px solid var(--b)', fontSize: '16px' }}
                data-testid="shift-type-select"
              >
                {Object.entries(SHIFT_COLORS).map(([k, v]) => (
                  <option key={k} value={k}>{v.label}</option>
                ))}
              </select>
              <input
                type="date"
                value={form.date}
                onChange={e => setForm(p => ({ ...p, date: e.target.value }))}
                className="px-3 py-2 rounded-lg text-sm bg-[var(--s)] text-[var(--t)]"
                style={{ border: '1px solid var(--b)', fontSize: '16px' }}
                data-testid="shift-date-input"
              />
              <input
                type="text"
                value={form.notes}
                onChange={e => setForm(p => ({ ...p, notes: e.target.value }))}
                placeholder="Notes (optional)"
                className="px-3 py-2 rounded-lg text-sm bg-[var(--s)] text-[var(--t)] placeholder-[var(--t5)]"
                style={{ border: '1px solid var(--b)', fontSize: '16px' }}
                data-testid="shift-notes-input"
              />
            </div>
            <div className="flex gap-2">
              <button
                onClick={handleCreate}
                disabled={saving}
                className="px-4 py-2 rounded-lg text-sm font-bold"
                style={{ background: 'var(--gold)', color: '#0F1629' }}
                data-testid="save-shift-btn"
              >
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Save'}
              </button>
              <button
                onClick={() => setShowForm(false)}
                className="px-4 py-2 rounded-lg text-sm text-[var(--t5)] hover:bg-[var(--s)]"
              >
                Cancel
              </button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Weekly Coverage Summary */}
      {summary && (
        <div className="grid grid-cols-7 gap-1.5">
          {summary.summary.map(day => (
            <Card key={day.date} className="glass-card">
              <CardContent className="p-2 text-center">
                <p className="text-[11px] font-bold text-[var(--t5)]">{day.day_name}</p>
                <p className="text-lg font-bold text-[var(--t)]">{day.total}</p>
                <div className="flex justify-center gap-1 mt-1">
                  {Object.entries(day.by_type).map(([type, count]) => (
                    count > 0 && (
                      <span key={type} className="w-2 h-2 rounded-full" style={{ background: SHIFT_COLORS[type]?.border }} title={`${SHIFT_COLORS[type]?.label}: ${count}`} />
                    )
                  ))}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Shifts List */}
      {loading ? (
        <div className="flex justify-center py-8">
          <Loader2 className="w-6 h-6 animate-spin text-[var(--t5)]" />
        </div>
      ) : shifts.length === 0 ? (
        <Card className="glass-card">
          <CardContent className="p-8 text-center">
            <Calendar className="w-10 h-10 mx-auto text-[var(--t5)] opacity-40 mb-2" />
            <p className="text-sm text-[var(--t5)]">No shifts scheduled for this week</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {shifts.filter(s => s.status !== 'cancelled').map(shift => {
            const shiftStyle = SHIFT_COLORS[shift.shift_type] || SHIFT_COLORS.day;
            const statusStyle = STATUS_STYLES[shift.status] || STATUS_STYLES.scheduled;
            const isOwnShift = shift.operator_id === user?.id;
            return (
              <Card key={shift.id} className="glass-card" data-testid={`shift-${shift.id}`}>
                <CardContent className="p-3 flex items-center gap-3 flex-wrap">
                  <div className="w-1.5 h-10 rounded-full flex-shrink-0" style={{ background: shiftStyle.border }} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-bold text-[var(--t)]">{shift.operator_name}</span>
                      <span className="text-[10px] px-1.5 py-0.5 rounded font-bold" style={{ color: shiftStyle.text, background: shiftStyle.bg }}>
                        {shiftStyle.label}
                      </span>
                      <span className="text-[10px] px-1.5 py-0.5 rounded" style={{ color: statusStyle.color, background: `${statusStyle.color}15` }}>
                        {statusStyle.label}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 mt-0.5">
                      <span className="text-xs text-[var(--t5)]">{formatDate(shift.date)}</span>
                      {shift.notes && <span className="text-xs text-[var(--t5)] truncate">{shift.notes}</span>}
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5">
                    {isOwnShift && shift.status === 'scheduled' && (
                      <button
                        onClick={() => handleStatusUpdate(shift.id, 'confirmed')}
                        className="p-1.5 rounded hover:bg-[var(--s)]"
                        title="Confirm shift"
                        data-testid={`confirm-shift-${shift.id}`}
                      >
                        <Check className="w-4 h-4 text-[#22C993]" />
                      </button>
                    )}
                    {isManagerOrAdmin && shift.status !== 'completed' && (
                      <>
                        <button
                          onClick={() => handleStatusUpdate(shift.id, 'completed')}
                          className="p-1.5 rounded hover:bg-[var(--s)]"
                          title="Mark completed"
                        >
                          <Clock className="w-4 h-4 text-[#3B82F6]" />
                        </button>
                        <button
                          onClick={() => handleCancel(shift.id)}
                          className="p-1.5 rounded hover:bg-[var(--s)]"
                          title="Cancel shift"
                        >
                          <X className="w-4 h-4 text-[#ef4444]" />
                        </button>
                      </>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
};
