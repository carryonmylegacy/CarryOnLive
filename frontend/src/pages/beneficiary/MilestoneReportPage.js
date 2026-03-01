import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { useAuth } from '../../contexts/AuthContext';
import { Heart, CheckCircle2, ChevronLeft } from 'lucide-react';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { toast } from 'sonner';

const API_URL = `${process.env.REACT_APP_BACKEND_URL}/api`;

const milestoneTypes = [
  'Marriage', 'Graduation', 'First Child', 'Retirement', 'Birthday',
  'First Home', 'New Job', 'Divorce', 'Turned 18', 'Turned 25',
  'Adoption', 'Deployment', 'Custom'
];

const MilestoneReportPage = () => {
  const { user, getAuthHeaders } = useAuth();
  const navigate = useNavigate();
  const [type, setType] = useState('');
  const [date, setDate] = useState('');
  const [description, setDescription] = useState('');
  const [sent, setSent] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [deliveredCount, setDeliveredCount] = useState(0);
  const [estate, setEstate] = useState(null);

  /* eslint-disable react-hooks/exhaustive-deps */
  useEffect(() => {
    const fetchEstate = async () => {
      const eid = localStorage.getItem('beneficiary_estate_id');
      if (eid) {
        try {
          const res = await axios.get(`${API_URL}/estates/${eid}`, getAuthHeaders());
          setEstate(res.data);
        } catch (e) { console.error(e); }
      }
    };
    fetchEstate();
  }, []);
  /* eslint-enable react-hooks/exhaustive-deps */

  const benefactorFirst = estate?.name?.split(' ')[0] || 'your benefactor';

  const handleSubmit = async () => {
    if (!type) return;
    setSubmitting(true);
    try {
      const estateId = localStorage.getItem('beneficiary_estate_id');
      const res = await axios.post(`${API_URL}/milestones/report`, {
        estate_id: estateId,
        event_type: type.toLowerCase(),
        event_description: description || type,
        event_date: date || new Date().toISOString().split('T')[0],
      }, getAuthHeaders());
      setDeliveredCount(res.data.messages_delivered || 0);
      setSent(true);
      // toast removed
    } catch (err) {
      console.error(err);
      toast.error('Failed to submit milestone');
    } finally { setSubmitting(false); }
  };

  return (
    <div className="p-4 lg:p-6 pt-20 lg:pt-6 pb-24 lg:pb-6 animate-fade-in" data-testid="milestone-report"
      style={{ background: 'radial-gradient(ellipse at top left, rgba(139,92,246,0.12), transparent 55%)' }}>
      {/* Back */}
      <button onClick={() => navigate('/beneficiary/dashboard')} className="inline-flex items-center gap-1 text-sm font-bold text-[#60A5FA] mb-5">
        <ChevronLeft className="w-4 h-4" /> Back to Dashboard
      </button>

      <div className="max-w-xl mx-auto">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-[var(--t)]" style={{ fontFamily: 'Outfit, sans-serif' }}>Report a Milestone</h1>
          <p className="text-sm text-[var(--t4)]">Report a life milestone to check for a message from {benefactorFirst}.</p>
        </div>

        {!sent ? (
          <div className="glass-card p-6 lg:p-8">
            {/* Info box */}
            <div className="rounded-xl p-4 mb-6" style={{ background: 'rgba(139,92,246,0.06)', border: '1px solid rgba(139,92,246,0.12)' }}>
              <p className="text-sm text-[var(--pr2)] leading-relaxed">
                {benefactorFirst} may have recorded messages for specific milestones. When you submit this form, the system will automatically check and deliver any matching messages.
              </p>
            </div>

            {/* Milestone Type */}
            <div className="mb-5">
              <Label className="text-[var(--t4)] text-xs uppercase tracking-wider mb-2 block">Milestone Type</Label>
              <div className="grid grid-cols-3 gap-2">
                {milestoneTypes.map(m => (
                  <div
                    key={m}
                    onClick={() => setType(m)}
                    className={`p-2.5 rounded-lg text-center text-sm cursor-pointer transition-all ${
                      type === m
                        ? 'font-bold text-[var(--bl3)]'
                        : 'text-[var(--t2)]'
                    }`}
                    style={{
                      background: type === m ? 'var(--blbg)' : 'var(--s)',
                      border: `1px solid ${type === m ? 'rgba(96,165,250,0.3)' : 'var(--b)'}`,
                    }}
                  >
                    {m}
                  </div>
                ))}
              </div>
            </div>

            {/* Date */}
            <div className="mb-5">
              <Label className="text-[var(--t4)] text-xs uppercase tracking-wider mb-2 block">Date</Label>
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="input-field" data-testid="milestone-date" />
            </div>

            {/* Description */}
            <div className="mb-6">
              <Label className="text-[var(--t4)] text-xs uppercase tracking-wider mb-2 block">Description (Optional)</Label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Tell us about this milestone..."
                className="input-field w-full rounded-lg p-3 min-h-[80px] bg-[var(--s)] border border-[var(--b)] text-[var(--t)] text-sm"
                data-testid="milestone-desc"
              />
            </div>

            {/* Submit */}
            <Button
              className="w-full justify-center py-3 text-sm font-bold"
              style={{ background: 'linear-gradient(135deg, #8B5CF6, #7C3AED)', color: 'white' }}
              onClick={handleSubmit}
              disabled={!type || submitting}
              data-testid="milestone-submit"
            >
              {submitting ? 'Submitting...' : 'Submit Milestone Notification'}
            </Button>
          </div>
        ) : (
          <div className="text-center pt-10">
            <div className="w-16 h-16 rounded-2xl mx-auto mb-5 flex items-center justify-center" style={{ background: 'rgba(16,185,129,0.1)' }}>
              <CheckCircle2 className="w-8 h-8 text-[var(--gn2)]" />
            </div>
            <h2 className="text-2xl font-bold text-[var(--t)] mb-3">Milestone Reported</h2>
            <p className="text-sm text-[var(--t3)] leading-relaxed max-w-md mx-auto mb-3">
              Your milestone has been processed. {deliveredCount > 0
                ? `${deliveredCount} message${deliveredCount > 1 ? 's have' : ' has'} been delivered to your account.`
                : `If ${benefactorFirst} recorded a message for this event, it will be delivered to your account shortly.`
              }
            </p>

            {/* Disclaimer */}
            <div className="rounded-xl p-4 mt-6 max-w-md mx-auto text-left" style={{ background: 'rgba(139,92,246,0.05)', border: '1px solid rgba(139,92,246,0.12)' }}>
              <p className="text-xs text-[var(--t4)] leading-relaxed">
                CarryOn™ does not disclose whether additional milestone messages exist for future life events. This protects you from the influence that knowing — or not knowing — about a waiting message could have on your decisions. Messages are automatically delivered when you report a milestone through the platform, and will remain in your account for as long as you are an active subscriber.
              </p>
            </div>

            <div className="flex gap-3 justify-center mt-6">
              <Button variant="outline" className="border-[var(--b)] text-[var(--t3)]" onClick={() => { setSent(false); setType(''); setDate(''); setDescription(''); }}>
                Report Another
              </Button>
              <Button className="gold-button" onClick={() => navigate('/beneficiary/messages')}>
                View Messages
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default MilestoneReportPage;
