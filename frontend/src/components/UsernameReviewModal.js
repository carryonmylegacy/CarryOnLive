import { useState, useEffect, useRef } from 'react';
import { User, Check, AlertCircle, Loader2, X } from 'lucide-react';
import axios from 'axios';
import { useAuth } from '../contexts/AuthContext';
import { toast } from '../utils/toast';
import { API_URL } from '../config';

const UsernameReviewModal = () => {
  const { user, token, refreshUser } = useAuth();
  const [show, setShow] = useState(false);
  const [username, setUsername] = useState('');
  const [usernameError, setUsernameError] = useState('');
  const [checking, setChecking] = useState(false);
  const [saving, setSaving] = useState(false);
  const acknowledged = useRef(false);

  useEffect(() => {
    if (acknowledged.current) return;
    if (user?.needs_username_review && token) {
      setUsername(user.username || '');
      setShow(true);
    }
  }, [user, token]);

  if (!show) return null;

  const handleSave = async () => {
    if (!username.trim() || username.length < 3) {
      setUsernameError('Username must be at least 3 characters');
      return;
    }
    if (usernameError) return;
    setSaving(true);
    try {
      await axios.put(`${API_URL}/auth/username`, { username }, {
        headers: { Authorization: `Bearer ${token}` },
      });
      acknowledged.current = true;
      setShow(false);
      toast.success(`Your username is now: ${username}`);
      if (refreshUser) await refreshUser();
    } catch (err) {
      const detail = err.response?.data?.detail || 'Failed to update username. Please try again.';
      toast.error(detail);
    } finally {
      setSaving(false);
    }
  };

  const handleDismiss = async () => {
    setSaving(true);
    try {
      await axios.put(`${API_URL}/auth/username`, { username: user.username || username }, {
        headers: { Authorization: `Bearer ${token}` },
      });
      acknowledged.current = true;
      setShow(false);
      if (refreshUser) await refreshUser();
    } catch {
      acknowledged.current = true;
      setShow(false);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.8)' }}>
      <div className="w-full max-w-md max-h-[90vh] overflow-y-auto rounded-2xl p-6 relative" style={{ background: '#152238', border: '1px solid rgba(212,175,55,0.5)', boxShadow: '0 0 60px rgba(212,175,55,0.08), 0 8px 40px rgba(0,0,0,0.6)' }}>
        <button onClick={handleDismiss} className="absolute top-4 right-4 text-[#475569] hover:text-white transition-colors" data-testid="username-review-dismiss">
          <X className="w-5 h-5" />
        </button>

        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: 'rgba(212,175,55,0.1)', border: '1px solid rgba(212,175,55,0.25)' }}>
            <User className="w-5 h-5 text-[#d4af37]" />
          </div>
          <div>
            <h2 className="text-white text-lg font-bold" style={{ fontFamily: 'var(--sans)' }}>Welcome back!</h2>
            <p className="text-[#94a3b8] text-xs">CarryOn now uses usernames for sign-in</p>
          </div>
        </div>

        <div className="rounded-xl p-3 mb-4" style={{ background: 'rgba(96,165,250,0.06)', border: '1px solid rgba(96,165,250,0.15)' }}>
          <p className="text-[#94a3b8] text-sm leading-relaxed">
            We've assigned you the username <strong className="text-white">{user?.username}</strong>. Going forward, use your username to sign in instead of your email. You can keep this one or change it below.
          </p>
        </div>

        <div className="space-y-1.5 mb-5">
          <label className="text-[#7b879e] text-sm font-medium">Your Username</label>
          <div className="relative">
            <User className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-[#3a4a63]" />
            <input type="text" value={username}
              onChange={(e) => {
                const val = e.target.value.replace(/[^a-zA-Z0-9_]/g, '').toLowerCase();
                setUsername(val);
                setUsernameError('');
              }}
              onBlur={async () => {
                if (!username.trim()) return;
                if (username === user?.username) { setUsernameError(''); return; }
                if (username.length < 3) { setUsernameError('Username must be at least 3 characters'); return; }
                if (username.includes('@')) { setUsernameError('Username cannot be an email address'); return; }
                setChecking(true);
                try {
                  const res = await axios.post(`${API_URL}/auth/check-username`, { username });
                  if (!res.data.available) setUsernameError(res.data.message || 'Username is already taken');
                  else setUsernameError('');
                } catch { setUsernameError(''); }
                setChecking(false);
              }}
              className={`w-full px-4 py-3 rounded-xl text-base bg-[#0a1128] text-white pl-11 ${usernameError ? 'border-red-500 border' : 'border border-[#1e293b]'}`}
              data-testid="username-review-input" />
            {checking && <Loader2 className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-[#3a4a63] animate-spin" />}
            {!checking && username.trim() && !usernameError && (
              <Check className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-green-500" />
            )}
          </div>
          {usernameError ? (
            <p className="text-red-400 text-xs flex items-center gap-1"><AlertCircle className="w-3 h-3" /> {usernameError}</p>
          ) : (
            <p className="text-[#525c72] text-[11px]">Letters, numbers, and underscores only. This is how you will sign in.</p>
          )}
        </div>

        <button onClick={handleSave} disabled={saving || !!usernameError || !username.trim()}
          className="w-full py-3 rounded-xl text-sm font-bold transition-all"
          data-testid="username-review-save"
          style={{
            background: 'linear-gradient(135deg, #d4af37, #b8962e)',
            color: '#080e1a',
            opacity: saving || !!usernameError || !username.trim() ? 0.5 : 1,
          }}>
          {saving ? 'Saving...' : 'Confirm Username'}
        </button>
      </div>
    </div>
  );
};

export default UsernameReviewModal;
