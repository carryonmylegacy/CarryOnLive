import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { useAuth } from '../contexts/AuthContext';
import { 
  Gift, 
  Lock, 
  Eye, 
  EyeOff, 
  Loader2, 
  CheckCircle,
  AlertCircle,
  Heart
} from 'lucide-react';
import { Card, CardContent } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { toast } from 'sonner';

const API_URL = `${process.env.REACT_APP_BACKEND_URL}/api`;

const AcceptInvitationPage = () => {
  const { token } = useParams();
  const navigate = useNavigate();
  const { login } = useAuth();
  
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [invitationData, setInvitationData] = useState(null);
  
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [phone, setPhone] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [accepted, setAccepted] = useState(false);

  /* eslint-disable react-hooks/exhaustive-deps */
  useEffect(() => {
    fetchInvitationDetails();
  }, [token]);
  /* eslint-enable react-hooks/exhaustive-deps */

  const fetchInvitationDetails = async () => {
    try {
      const response = await axios.get(`${API_URL}/invitations/${token}`);
      setInvitationData(response.data);
    } catch (err) {
      console.error('Failed to fetch invitation:', err);
      setError(err.response?.data?.detail || 'Invalid or expired invitation link');
    } finally {
      setLoading(false);
    }
  };

  const handleAccept = async () => {
    if (password.length < 6) {
      toast.error('Password must be at least 6 characters');
      return;
    }
    
    if (password !== confirmPassword) {
      toast.error('Passwords do not match');
      return;
    }
    
    setSubmitting(true);
    try {
      const response = await axios.post(`${API_URL}/invitations/accept`, {
        token,
        password,
        phone: phone || null
      });
      
      setAccepted(true);
      toast.success('Account created successfully!');
      
      // Auto-login with the returned token
      setTimeout(() => {
        login(response.data.access_token, response.data.user);
        navigate('/beneficiary/dashboard');
      }, 2000);
    } catch (err) {
      console.error('Failed to accept invitation:', err);
      toast.error(err.response?.data?.detail || 'Failed to create account');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4" 
        style={{ background: 'linear-gradient(135deg, #0B1628 0%, #1A2A4A 50%, #0D1B2E 100%)' }}>
        <div className="text-center">
          <Loader2 className="w-12 h-12 text-[#d4af37] animate-spin mx-auto mb-4" />
          <p className="text-white">Loading invitation...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4"
        style={{ background: 'linear-gradient(135deg, #0B1628 0%, #1A2A4A 50%, #0D1B2E 100%)' }}>
        <Card className="glass-card max-w-md w-full">
          <CardContent className="p-8 text-center">
            <AlertCircle className="w-16 h-16 text-[#ef4444] mx-auto mb-4" />
            <h2 className="text-xl font-semibold text-white mb-2">Invalid Invitation</h2>
            <p className="text-[#94a3b8] mb-6">{error}</p>
            <Button 
              onClick={() => navigate('/login')}
              className="gold-button"
            >
              Go to Login
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (accepted) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4"
        style={{ background: 'linear-gradient(135deg, #0B1628 0%, #1A2A4A 50%, #0D1B2E 100%)' }}>
        <Card className="glass-card max-w-md w-full">
          <CardContent className="p-8 text-center">
            <div className="w-20 h-20 rounded-full bg-[#10b981]/20 flex items-center justify-center mx-auto mb-6">
              <CheckCircle className="w-10 h-10 text-[#10b981]" />
            </div>
            <h2 className="text-2xl font-semibold text-white mb-2">Welcome to CarryOn™!</h2>
            <p className="text-[#94a3b8] mb-4">
              Your account has been created successfully. Redirecting you to your dashboard...
            </p>
            <Loader2 className="w-6 h-6 text-[#d4af37] animate-spin mx-auto" />
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4"
      style={{ background: 'linear-gradient(135deg, #0B1628 0%, #1A2A4A 50%, #0D1B2E 100%)' }}>
      <Card className="glass-card max-w-lg w-full">
        <CardContent className="p-8">
          {/* Header */}
          <div className="text-center mb-8">
            <div className="w-16 h-16 rounded-full bg-[#d4af37]/20 flex items-center justify-center mx-auto mb-4">
              <Gift className="w-8 h-8 text-[#d4af37]" />
            </div>
            <h1 className="text-2xl font-bold text-white mb-2" style={{ fontFamily: 'Outfit, sans-serif' }}>
              You've Been Invited
            </h1>
            <p className="text-[#94a3b8]">
              <span className="text-[#d4af37] font-semibold">{invitationData?.benefactor_name}</span> has added you to their CarryOn™ estate plan
            </p>
          </div>

          {/* Info Box */}
          <div className="rounded-xl p-4 mb-6" style={{ background: 'rgba(212, 175, 55, 0.1)', border: '1px solid rgba(212, 175, 55, 0.2)' }}>
            <div className="flex items-start gap-3">
              <Heart className="w-5 h-5 text-[#d4af37] flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm text-white font-medium mb-1">What this means</p>
                <p className="text-xs text-[#94a3b8]">
                  You've been designated as a beneficiary. Create your account to stay connected. 
                  At this time, you won't have access to estate details—this simply establishes your connection.
                </p>
              </div>
            </div>
          </div>

          {/* Form */}
          <div className="space-y-4">
            <div className="p-4 rounded-xl bg-white/5 space-y-1">
              <p className="text-xs text-[#64748b] uppercase">Your Information</p>
              <p className="text-white font-medium">
                {invitationData?.beneficiary.first_name} {invitationData?.beneficiary.last_name}
              </p>
              <p className="text-sm text-[#94a3b8]">{invitationData?.beneficiary.email}</p>
              <p className="text-xs text-[#d4af37]">{invitationData?.beneficiary.relation}</p>
            </div>

            <div className="space-y-2">
              <Label className="text-[#94a3b8]">Create Password *</Label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#64748b]" />
                <Input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="At least 6 characters"
                  className="input-field pl-10 pr-10"
                  data-testid="invitation-password-input"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-[#64748b] hover:text-white"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <div className="space-y-2">
              <Label className="text-[#94a3b8]">Confirm Password *</Label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#64748b]" />
                <Input
                  type={showPassword ? 'text' : 'password'}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Confirm your password"
                  className="input-field pl-10"
                  data-testid="invitation-confirm-password-input"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label className="text-[#94a3b8]">Phone Number (Optional)</Label>
              <Input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+1-555-0123"
                className="input-field"
              />
            </div>
          </div>

          {/* Submit */}
          <Button
            onClick={handleAccept}
            disabled={submitting || !password || !confirmPassword}
            className="gold-button w-full mt-6"
            data-testid="accept-invitation-submit"
          >
            {submitting ? (
              <>
                <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                Creating Account...
              </>
            ) : (
              <>
                <CheckCircle className="w-5 h-5 mr-2" />
                Accept & Create Account
              </>
            )}
          </Button>

          <p className="text-xs text-center text-[#64748b] mt-4">
            By creating an account, you agree to CarryOn™'s Terms of Service and Privacy Policy
          </p>
        </CardContent>
      </Card>
    </div>
  );
};

export default AcceptInvitationPage;
