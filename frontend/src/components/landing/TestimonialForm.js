import React, { useState } from 'react';
import axios from 'axios';
import { Loader2, CheckCircle2, Send } from 'lucide-react';
import { API_URL } from '../../config';
import { ROLE_LABELS } from './TestimonialsBlock';

const input = { background: 'rgba(11,19,34,0.8)', border: '1px solid rgba(255,255,255,0.12)' };
const cls = 'w-full h-11 px-4 rounded-lg text-base text-white placeholder:text-[#4a5568] focus:outline-none focus:border-[#d4af37]';

export const TestimonialForm = () => {
  const [form, setForm] = useState({ name: '', location: '', role: 'benefactor', member_since: '', quote: '', email: '', consent: false });
  const [status, setStatus] = useState('idle');
  const [error, setError] = useState('');
  const set = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }));

  const submit = async (e) => {
    e.preventDefault();
    setStatus('sending'); setError('');
    try {
      await axios.post(`${API_URL}/testimonials`, form);
      setStatus('sent');
    } catch (err) {
      setStatus('idle');
      const d = err.response?.data?.detail;
      setError(typeof d === 'string' ? d : 'Please check the form — your story needs at least 40 characters.');
    }
  };

  if (status === 'sent') {
    return (
      <div className="text-center py-8" data-testid="testimonial-form-sent">
        <CheckCircle2 className="w-10 h-10 text-[#10b981] mx-auto mb-3" />
        <p className="text-white text-lg font-semibold" style={{ fontFamily: 'Outfit, sans-serif' }}>Thank you.</p>
        <p className="text-[#8b97ab] text-sm mt-1 max-w-sm mx-auto">Barnet reads every story himself. If we publish yours, we&apos;ll email you first.</p>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-4" data-testid="testimonial-form">
      <div className="grid sm:grid-cols-2 gap-4">
        <div>
          <label className="text-[#8b97ab] text-xs font-semibold block mb-1.5" htmlFor="t-name">Your name (as you&apos;d like it shown)</label>
          <input id="t-name" required minLength={2} maxLength={60} value={form.name} onChange={set('name')} placeholder="e.g. Maria R." className={`${cls} text-base`} style={input} data-testid="testimonial-name" />
        </div>
        <div>
          <label className="text-[#8b97ab] text-xs font-semibold block mb-1.5" htmlFor="t-location">City, State</label>
          <input id="t-location" maxLength={60} value={form.location} onChange={set('location')} placeholder="e.g. Arlington, VA" className={`${cls} text-base`} style={input} data-testid="testimonial-location" />
        </div>
        <div>
          <label className="text-[#8b97ab] text-xs font-semibold block mb-1.5" htmlFor="t-role">Which best describes you?</label>
          <select id="t-role" value={form.role} onChange={set('role')} className={`${cls} text-base`} style={input} data-testid="testimonial-role">
            {Object.entries(ROLE_LABELS).map(([k, v]) => <option key={k} value={k} className="text-black">{v}</option>)}
          </select>
        </div>
        <div>
          <label className="text-[#8b97ab] text-xs font-semibold block mb-1.5" htmlFor="t-since">Member since (year, optional)</label>
          <input id="t-since" maxLength={20} value={form.member_since} onChange={set('member_since')} placeholder="e.g. 2025" className={`${cls} text-base`} style={input} data-testid="testimonial-since" />
        </div>
      </div>
      <div>
        <label className="text-[#8b97ab] text-xs font-semibold block mb-1.5" htmlFor="t-quote">Your story <span className="text-[#4a5568] font-normal">({form.quote.length}/600 &middot; at least 40 characters)</span></label>
        <textarea id="t-quote" required minLength={40} maxLength={600} rows={5} value={form.quote} onChange={set('quote')} placeholder="What made you set this up? What changed for your family?" className="w-full px-4 py-3 rounded-lg text-base text-white placeholder:text-[#4a5568] focus:outline-none focus:border-[#d4af37]" style={{ ...input, fontSize: "16px" }} data-testid="testimonial-quote" />
      </div>
      <div>
        <label className="text-[#8b97ab] text-xs font-semibold block mb-1.5" htmlFor="t-email">Email <span className="text-[#4a5568] font-normal">(never published; used to mark you as a verified member)</span></label>
        <input id="t-email" type="email" required value={form.email} onChange={set('email')} placeholder="you@example.com" className={`${cls} text-base`} style={input} data-testid="testimonial-email" />
      </div>
      <label className="flex items-start gap-3 text-[#a0aec0] text-sm cursor-pointer">
        <input type="checkbox" required checked={form.consent} onChange={set('consent')} className="mt-1 w-4 h-4 accent-[#d4af37]" data-testid="testimonial-consent" />
        I&apos;m a CarryOn member and I&apos;m happy for CarryOn to publish these words with the name and location above.
      </label>
      {error && <p className="text-[#f87171] text-sm" data-testid="testimonial-error">{error}</p>}
      <button type="submit" disabled={status === 'sending'} className="inline-flex items-center gap-2 px-8 py-3.5 rounded-lg font-bold text-base transition-transform active:scale-95 disabled:opacity-60" style={{ background: '#d4af37', color: '#0B1221' }} data-testid="testimonial-submit">
        {status === 'sending' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />} Share my story
      </button>
    </form>
  );
};

export default TestimonialForm;
