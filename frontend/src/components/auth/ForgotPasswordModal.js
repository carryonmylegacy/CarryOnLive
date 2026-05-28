import React from 'react';
import apiClient from '../../utils/apiClient';
import { toast } from '../../utils/toast';

const API_URL = process.env.REACT_APP_BACKEND_URL + '/api';

/**
 * ForgotPasswordModal — shared forgot password / reset flow.
 * Extracted from LoginPage to eliminate 3x duplication.
 * Pure prop-passthrough — zero logic changes from original.
 */
const ForgotPasswordModal = ({
  forgotMode, setForgotMode,
  forgotStep, setForgotStep,
  forgotEmail, setForgotEmail,
  forgotOtp, setForgotOtp,
  forgotNewPw, setForgotNewPw,
  forgotConfirmPw, setForgotConfirmPw,
  forgotLoading, setForgotLoading,
  forgotMsg, setForgotMsg,
  forgotError, setForgotError,
}) => {
  if (!forgotMode) return null;

  const resetAndClose = () => {
    setForgotMode(false);
    setForgotStep(1);
    setForgotOtp('');
    setForgotNewPw('');
    setForgotConfirmPw('');
    setForgotMsg('');
    setForgotError(false);
  };

  return (
    <div className="fixed inset-0 z-[9999] flex items-start sm:items-center justify-center p-4 pt-24 sm:pt-4" style={{ background: 'rgba(0,0,0,0.7)' }}>
      <div className="w-full max-w-sm rounded-2xl p-6 max-h-[90vh] overflow-y-auto" style={{ background: 'var(--bg2)', border: '1px solid rgba(var(--gold-rgb), 0.5)', boxShadow: '0 0 60px rgba(var(--gold-rgb), 0.08), 0 8px 40px rgba(0,0,0,0.6)' }}>
        <h2 className="text-lg font-bold text-white mb-1" style={{ fontFamily: 'var(--sans)' }}>Reset Password</h2>
        {forgotStep === 1 ? (
          <>
            <p className="text-xs text-[#94A3B8] mb-4">Enter your username or email and we'll send a reset code to the email on file.</p>
            <input type="text" value={forgotEmail} onChange={e => setForgotEmail(e.target.value)}
              placeholder="Username or email" className="w-full px-4 py-3 rounded-xl text-base mb-3 bg-[#0a1128] border border-[#1e293b] text-white"
              style={{ fontSize: '16px' }}
              data-testid="forgot-username-input" aria-label="Username or email" />
            {forgotMsg && <p className={`text-xs mb-3 ${forgotError ? 'text-red-400' : 'text-[#22C993]'}`}>{forgotMsg}</p>}
            <button disabled={!forgotEmail || forgotLoading} onClick={async () => {
              setForgotLoading(true);
              try {
                const res = await apiClient.post(`${API_URL}/auth/forgot-password`, { username: forgotEmail });
                setForgotMsg(res.data.message);
                setForgotError(false);
                setForgotStep(2);
              } catch (err) { setForgotMsg(err.response?.data?.detail || 'Failed to send code. Please try again.'); setForgotError(true); }
              finally { setForgotLoading(false); }
            }} className="w-full py-3 rounded-xl text-sm font-bold mb-3" style={{ background: 'linear-gradient(135deg, #d4af37, #b8962e)', color: 'var(--bg)', opacity: !forgotEmail || forgotLoading ? 0.5 : 1 }}
              data-testid="forgot-send-code-btn">
              {forgotLoading ? 'Sending...' : 'Send Reset Code'}
            </button>
            <button onClick={() => {
              resetAndClose();
              const usernameEmail = prompt('Enter the email associated with your account:');
              if (usernameEmail) {
                apiClient.post(`${API_URL}/auth/forgot-username`, { email: usernameEmail })
                  .then(() => toast.success('If that email exists, your username(s) have been sent.'))
                  .catch(() => toast.error('Something went wrong.'));
              }
            }} className="w-full text-center text-xs text-[#d4af37] hover:text-[#fcd34d] mb-2">Forgot Username?</button>
          </>
        ) : (
          <>
            <p className="text-xs text-[#94A3B8] mb-4">Enter the code sent to your email and your new password.</p>
            <input type="text" value={forgotOtp} onChange={e => setForgotOtp(e.target.value)}
              placeholder="6-digit code" maxLength={6} className="w-full px-4 py-3 rounded-xl text-base mb-3 bg-[#0a1128] border border-[#1e293b] text-white text-center tracking-[0.3em]"
              style={{ fontSize: '16px' }}
              data-testid="forgot-otp-input" aria-label="6-digit verification code" />
            <input type="password" value={forgotNewPw} onChange={e => setForgotNewPw(e.target.value)}
              placeholder="New password (8+ characters)" className="w-full px-4 py-3 rounded-xl text-base mb-3 bg-[#0a1128] border border-[#1e293b] text-white"
              style={{ fontSize: '16px' }}
              data-testid="forgot-new-pw-input" aria-label="New password" />
            <input type="password" value={forgotConfirmPw} onChange={e => setForgotConfirmPw(e.target.value)}
              placeholder="Confirm new password" className={`w-full px-4 py-3 rounded-xl text-base mb-1 bg-[#0a1128] border text-white ${forgotConfirmPw && forgotNewPw !== forgotConfirmPw ? 'border-red-500' : 'border-[#1e293b]'}`}
              style={{ fontSize: '16px' }}
              data-testid="forgot-confirm-pw-input" aria-label="Confirm new password" />
            {forgotConfirmPw && forgotNewPw !== forgotConfirmPw && (
              <p className="text-red-400 text-xs mb-2">* Passwords do not match</p>
            )}
            {forgotMsg && <p className={`text-xs mb-3 ${forgotError ? 'text-red-400' : 'text-[#22C993]'}`}>{forgotMsg}</p>}
            <button disabled={!forgotOtp || !forgotNewPw || forgotNewPw !== forgotConfirmPw || forgotLoading} onClick={async () => {
              setForgotLoading(true);
              try {
                const res = await apiClient.post(`${API_URL}/auth/reset-password`, { username: forgotEmail, otp: forgotOtp, new_password: forgotNewPw });
                setForgotMsg(res.data.message);
                setForgotError(false);
                setTimeout(resetAndClose, 2000);
              } catch (err) { setForgotMsg(err.response?.data?.detail || 'Reset failed. Please try again.'); setForgotError(true); }
              finally { setForgotLoading(false); }
            }} className="w-full py-3 rounded-xl text-sm font-bold mb-3 mt-2" style={{ background: 'linear-gradient(135deg, #d4af37, #b8962e)', color: 'var(--bg)', opacity: !forgotOtp || !forgotNewPw || forgotNewPw !== forgotConfirmPw || forgotLoading ? 0.5 : 1 }}
              data-testid="forgot-reset-btn">
              {forgotLoading ? 'Resetting...' : 'Reset Password'}
            </button>
          </>
        )}
        <button onClick={resetAndClose}
          className="w-full text-center text-xs text-[#475569] hover:text-[#94a3b8]" data-testid="forgot-cancel-btn">Cancel</button>
      </div>
    </div>
  );
};

export default ForgotPasswordModal;
