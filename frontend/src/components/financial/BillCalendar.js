import React, { useMemo } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

const CATEGORY_COLORS = {
  mortgage_rent: '#ef4444', utilities: '#f59e0b', insurance: '#8b5cf6',
  subscriptions: '#ec4899', credit_card: '#f97316', auto_vehicle: '#06b6d4',
  medical_health: '#10b981', taxes: '#6366f1', hoa_condo: '#14b8a6',
  education_student: '#a855f7', phone_internet: '#3b82f6', childcare: '#f43f5e',
  other: '#64748b',
};

const getCatColor = (cat) => CATEGORY_COLORS[cat] || '#d4af37';

const BillCalendar = ({ bills, month, onMonthChange, selectedDay, onDaySelect, categoryLabels: _categoryLabels }) => {
  const year = month.getFullYear();
  const mo = month.getMonth();
  const today = new Date();
  const todayDay = today.getFullYear() === year && today.getMonth() === mo ? today.getDate() : null;

  const daysInMonth = new Date(year, mo + 1, 0).getDate();
  const firstDow = new Date(year, mo, 1).getDay();

  // Build bill-per-day map
  const billMap = useMemo(() => {
    const map = {};
    (bills || []).forEach(bill => {
      if (bill.status === 'cancelled') return;
      const dueDay = bill.due_day;
      if (dueDay) {
        const effectiveDay = Math.min(dueDay, daysInMonth);
        if (!map[effectiveDay]) map[effectiveDay] = [];
        map[effectiveDay].push(bill);
      }
    });
    return map;
  }, [bills, daysInMonth]);

  const prevMonth = () => onMonthChange(new Date(year, mo - 1, 1));
  const nextMonth = () => onMonthChange(new Date(year, mo + 1, 1));
  const goToday = () => onMonthChange(new Date());

  const monthName = month.toLocaleString('en-US', { month: 'long', year: 'numeric' });
  const dayNames = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

  // Monthly total
  const monthTotal = useMemo(() => {
    return (bills || []).filter(b => b.status !== 'cancelled').reduce((sum, b) => {
      const amt = b.amount || 0;
      const freq = b.frequency || 'monthly';
      if (freq === 'monthly') return sum + amt;
      if (freq === 'quarterly') return sum + amt / 3;
      if (freq === 'semi_annual') return sum + amt / 6;
      if (freq === 'annual') return sum + amt / 12;
      return sum + amt;
    }, 0);
  }, [bills]);

  const selectedBills = selectedDay ? (billMap[selectedDay] || []) : [];

  return (
    <div className="glass-card rounded-2xl overflow-hidden" data-testid="bill-calendar">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3" style={{ borderBottom: '1px solid var(--b)' }}>
        <button onClick={prevMonth} className="p-2 rounded-lg hover:bg-[var(--s)] transition-colors" data-testid="cal-prev" aria-label="Previous month">
          <ChevronLeft className="w-4 h-4 text-[var(--t4)]" />
        </button>
        <div className="text-center">
          <div className="text-sm font-bold text-[var(--t)]" style={{ fontFamily: 'var(--sans)' }}>{monthName}</div>
          <button onClick={goToday} className="text-xs text-[#10b981] hover:underline" data-testid="cal-today">Today</button>
        </div>
        <button onClick={nextMonth} className="p-2 rounded-lg hover:bg-[var(--s)] transition-colors" data-testid="cal-next" aria-label="Next month">
          <ChevronRight className="w-4 h-4 text-[var(--t4)]" />
        </button>
      </div>

      {/* Day grid */}
      <div className="px-3 py-2">
        <div className="grid grid-cols-7 gap-0.5 mb-1">
          {dayNames.map(d => (
            <div key={d} className="text-center text-[11px] font-bold text-[var(--t5)] py-1">{d}</div>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-0.5">
          {Array.from({ length: firstDow }, (_, i) => (
            <div key={`empty-${i}`} className="h-9" />
          ))}
          {Array.from({ length: daysInMonth }, (_, i) => {
            const day = i + 1;
            const dayBills = billMap[day] || [];
            const isToday = day === todayDay;
            const isSelected = day === selectedDay;
            return (
              <button
                key={day}
                onClick={() => onDaySelect(isSelected ? null : day)}
                className="h-9 flex flex-col items-center justify-center rounded-lg transition-all relative"
                style={{
                  background: isSelected ? 'rgba(16,185,129,0.2)' : isToday ? 'rgba(var(--gold-rgb), 0.1)' : 'transparent',
                  border: isSelected ? '1px solid rgba(16,185,129,0.4)' : isToday ? '1px solid rgba(var(--gold-rgb), 0.3)' : '1px solid transparent',
                }}
                data-testid={`cal-day-${day}`}
              >
                <span className={`text-xs font-medium ${isToday ? 'text-[var(--gold)]' : 'text-[var(--t3)]'}`}>{day}</span>
                {dayBills.length > 0 && (
                  <div className="flex gap-0.5 mt-0.5">
                    {dayBills.slice(0, 3).map((b, idx) => (
                      <div key={idx} className="w-1.5 h-1.5 rounded-full" style={{ background: getCatColor(b.category) }} />
                    ))}
                    {dayBills.length > 3 && <div className="w-1.5 h-1.5 rounded-full bg-[var(--t5)]" />}
                  </div>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Monthly total */}
      <div className="px-4 py-2 flex items-center justify-between" style={{ borderTop: '1px solid var(--b)' }}>
        <span className="text-xs text-[var(--t5)]">{monthName} Total</span>
        <span className="text-sm font-bold text-[var(--t)]">${monthTotal.toLocaleString('en-US', { minimumFractionDigits: 2 })}</span>
      </div>

      {/* Selected day bills */}
      {selectedDay && (
        <div className="px-4 pb-3" data-testid="cal-selected-bills">
          <div className="text-xs font-bold text-[var(--t4)] mb-2">
            {selectedBills.length > 0 ? `Bills Due — ${monthName.split(' ')[0]} ${selectedDay}` : `No bills on ${monthName.split(' ')[0]} ${selectedDay}`}
          </div>
          {selectedBills.map(b => (
            <div key={b.id} className="flex items-center gap-2 py-1.5 px-2 rounded-lg mb-1" style={{ background: 'rgba(255,255,255,0.03)' }}>
              <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: getCatColor(b.category) }} />
              <span className="text-xs text-[var(--t)] font-medium truncate flex-1">{b.name}</span>
              {b.amount && <span className="text-xs font-bold text-[var(--t)]">${b.amount.toLocaleString()}</span>}
              {b.is_auto_pay && <span className="text-[11px] px-1.5 py-0.5 rounded-full bg-[rgba(16,185,129,0.15)] text-[#10b981] font-bold">AP</span>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default BillCalendar;
